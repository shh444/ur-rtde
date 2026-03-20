from __future__ import annotations

import asyncio
import json
import math
import re
import socket
import threading
import time
from collections import deque
from dataclasses import dataclass
from typing import Any, Deque, Dict, Iterable, List, Optional, Sequence, Tuple

try:
    from app_config import ROBOT_HOST as DEFAULT_HOST
except ImportError:
    DEFAULT_HOST = "192.168.1.101"

try:
    from .ur_rtde_wire import RTDEConnection, RTDEError, pack_values, unpack_values
except ImportError:
    from ur_rtde_wire import RTDEConnection, RTDEError, pack_values, unpack_values

__all__ = [
    "DEFAULT_HOST",
    "DEFAULT_FIELDS",
    "FIELD_ALIASES",
    "RobotFrame",
    "URRobot",
    "UR_RTDE",
    "expand_fields",
    "expand_output_fields",
    "normalize_token",
    "rad_to_deg",
    "rotvec_to_rpy",
    "probe_rtde_compatibility",
]


DEFAULT_FIELDS: Tuple[str, ...] = ("timestamp", "actual_q", "actual_TCP_pose", "runtime_state")
GP_BIT_RANGE = range(64, 128)
GP_REGISTER_RANGE = range(24, 48)
_MISSING = object()

FIELD_ALIASES: Dict[str, str] = {
    "time": "timestamp",
    "q": "actual_q",
    "qd": "actual_qd",
    "current": "actual_current",
    "target_current": "target_current",
    "current_window": "actual_current_window",
    "current_torque": "actual_current_as_torque",
    "joint_control": "joint_control_output",
    "joint_temp": "joint_temperatures",
    "joint_voltage": "actual_joint_voltage",
    "tcp": "actual_TCP_pose",
    "tcp_speed": "actual_TCP_speed",
    "tcp_force": "actual_TCP_force",
    "di": "actual_digital_input_bits",
    "do": "actual_digital_output_bits",
    "ai0": "standard_analog_input0",
    "ai1": "standard_analog_input1",
    "speed": "speed_scaling",
    "target_speed": "target_speed_fraction",
    "runtime": "runtime_state",
    "mode": "robot_mode",
    "safety": "safety_mode",
}

_FIELD_UNITS: Dict[str, Any] = {
    "timestamp": "s",
    "actual_q": ["rad"] * 6,
    "actual_qd": ["rad/s"] * 6,
    "actual_current": ["A"] * 6,
    "target_current": ["A"] * 6,
    "actual_current_window": ["A"] * 6,
    "actual_current_as_torque": ["Nm"] * 6,
    "joint_control_output": ["A"] * 6,
    "joint_temperatures": ["degC"] * 6,
    "actual_joint_voltage": ["V"] * 6,
    "actual_TCP_pose": ["m", "m", "m", "rad", "rad", "rad"],
    "actual_TCP_speed": ["m/s", "m/s", "m/s", "rad/s", "rad/s", "rad/s"],
    "actual_TCP_force": ["N", "N", "N", "Nm", "Nm", "Nm"],
    "actual_digital_input_bits": "uint64 bits",
    "actual_digital_output_bits": "uint64 bits",
    "standard_analog_input0": "mA or V",
    "standard_analog_input1": "mA or V",
    "speed_scaling": "ratio",
    "target_speed_fraction": "ratio",
    "speed_slider_mask": "uint32 mask",
    "speed_slider_fraction": "ratio",
    "runtime_state": "enum",
    "robot_mode": "enum",
    "safety_mode": "enum",
}

_GP_IN_RE = re.compile(r"^gp(?:\.in)?\.(bit|int|double)\.(\d+)$")
_GP_OUT_RE = re.compile(r"^(?:gp_out|gpo|gp\.out)\.(bit|int|double)\.(\d+)$")

# Controller input fields that are writable through RTDE but should not be
# mirrored into the output recipe automatically. GP input registers can be
# mirrored because UR exposes matching output fields for them.
_KNOWN_RTDE_INPUT_FIELDS = {
    "speed_slider_mask",
    "speed_slider_fraction",
}


def _is_gp_input_field_name(field_name: str) -> bool:
    return field_name.startswith("input_bit_register_") or field_name.startswith("input_int_register_") or field_name.startswith("input_double_register_")


def _is_rtde_input_field_name(field_name: str) -> bool:
    return field_name in _KNOWN_RTDE_INPUT_FIELDS or _is_gp_input_field_name(field_name)


def _supports_output_readback(field_name: str) -> bool:
    return _is_gp_input_field_name(field_name)


@dataclass(frozen=True)
class RobotFrame:
    values: Dict[str, Any]
    frame_index: int
    robot_timestamp_s: Optional[float]
    received_monotonic_s: float
    received_wall_time_s: float
    source_frequency_hz: float

    def get(self, name: str, default: Any = None) -> Any:
        key = normalize_token(name)
        return self.values.get(key, default)

    def __getitem__(self, name: str) -> Any:
        key = normalize_token(name)
        return self.values[key]

    def __getattr__(self, name: str) -> Any:
        key = normalize_token(name)
        if key in self.values:
            return self.values[key]
        raise AttributeError(name)

    def age_s(self, now_monotonic: Optional[float] = None) -> float:
        now = time.monotonic() if now_monotonic is None else float(now_monotonic)
        return max(0.0, now - self.received_monotonic_s)

    def age_ms(self, now_monotonic: Optional[float] = None) -> float:
        return self.age_s(now_monotonic) * 1000.0

    def as_dict(self) -> Dict[str, Any]:
        return {key: _thaw_value(value) for key, value in self.values.items()}

    def to_json(self, *, indent: int = 2) -> str:
        return json.dumps(
            {
                "frame_index": self.frame_index,
                "robot_timestamp_s": self.robot_timestamp_s,
                "received_monotonic_s": self.received_monotonic_s,
                "received_wall_time_s": self.received_wall_time_s,
                "source_frequency_hz": self.source_frequency_hz,
                "values": self.as_dict(),
            },
            ensure_ascii=False,
            indent=indent,
        )


def _freeze_value(value: Any) -> Any:
    if isinstance(value, list):
        return tuple(_freeze_value(item) for item in value)
    return value


def _thaw_value(value: Any) -> Any:
    if isinstance(value, tuple):
        return [_thaw_value(item) for item in value]
    return value


def _dedupe(items: Iterable[str]) -> List[str]:
    seen = set()
    ordered: List[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        ordered.append(item)
    return ordered


def _format_version(version: Optional[Tuple[int, int, int, int]]) -> str:
    if not version:
        return "unknown"
    return ".".join(str(int(part)) for part in version)


def _resolve_gp_index(kind: str, index: int) -> int:
    value = int(index)
    if kind == "bit":
        if 0 <= value < 64:
            return 64 + value
        if value in GP_BIT_RANGE:
            return value
        raise ValueError("gp bit index must be 0..63 or 64..127")

    if 0 <= value < 24:
        return 24 + value
    if value in GP_REGISTER_RANGE:
        return value
    raise ValueError("gp int/double index must be 0..23 or 24..47")


def _gp_field(direction: str, kind: str, index: int) -> str:
    value = _resolve_gp_index(kind, index)
    if direction == "input":
        return f"input_{kind}_register_{value}"
    return f"output_{kind}_register_{value}"


def _is_rtde_input_token(token: str) -> bool:
    value = str(token).strip()
    if _GP_IN_RE.fullmatch(value) is not None:
        return True
    try:
        normalized = normalize_token(value)
    except Exception:
        return False
    return _is_rtde_input_field_name(normalized)


def normalize_token(token: str) -> str:
    key = str(token).strip()
    if not key:
        raise ValueError("empty field token")

    alias = FIELD_ALIASES.get(key, key)
    if alias != key:
        return alias

    match = _GP_IN_RE.fullmatch(key)
    if match:
        kind, index_text = match.groups()
        return _gp_field("input", kind, int(index_text))

    match = _GP_OUT_RE.fullmatch(key)
    if match:
        kind, index_text = match.groups()
        return _gp_field("output", kind, int(index_text))

    return key


def expand_fields(tokens: Sequence[str]) -> List[str]:
    return _dedupe(normalize_token(token) for token in tokens)


def expand_output_fields(tokens: Sequence[str]) -> List[str]:
    normalized = []
    for token in tokens:
        key = normalize_token(token)
        if _is_rtde_input_field_name(key):
            continue
        normalized.append(key)
    return _dedupe(normalized)


def _as_float_tuple(values: Sequence[Any]) -> Tuple[float, ...]:
    return tuple(float(item) for item in values)


def rad_to_deg(values: Any) -> Any:
    if isinstance(values, (list, tuple)):
        return tuple(math.degrees(float(item)) for item in values)
    return math.degrees(float(values))


def _rotvec_to_matrix(rotvec: Sequence[float]) -> Tuple[Tuple[float, float, float], Tuple[float, float, float], Tuple[float, float, float]]:
    rx, ry, rz = (float(item) for item in rotvec)
    theta = math.sqrt(rx * rx + ry * ry + rz * rz)
    if theta < 1e-12:
        return (
            (1.0, 0.0, 0.0),
            (0.0, 1.0, 0.0),
            (0.0, 0.0, 1.0),
        )

    kx = rx / theta
    ky = ry / theta
    kz = rz / theta
    c = math.cos(theta)
    s = math.sin(theta)
    v = 1.0 - c

    return (
        (kx * kx * v + c, kx * ky * v - kz * s, kx * kz * v + ky * s),
        (ky * kx * v + kz * s, ky * ky * v + c, ky * kz * v - kx * s),
        (kz * kx * v - ky * s, kz * ky * v + kx * s, kz * kz * v + c),
    )


def rotvec_to_rpy(rotvec: Sequence[float]) -> Tuple[float, float, float]:
    """Convert UR rotation vector [rx, ry, rz] to RPY [roll, pitch, yaw] in radians.

    Uses the same convention documented by Universal Robots for rotvec2rpy():
    R = Rz(yaw) * Ry(pitch) * Rx(roll).
    """
    matrix = _rotvec_to_matrix(rotvec)
    r00, r01, r02 = matrix[0]
    r10, r11, r12 = matrix[1]
    r20, r21, r22 = matrix[2]

    sy = math.sqrt(r00 * r00 + r10 * r10)
    singular = sy < 1e-12

    if not singular:
        roll = math.atan2(r21, r22)
        pitch = math.atan2(-r20, sy)
        yaw = math.atan2(r10, r00)
    else:
        roll = math.atan2(-r12, r11)
        pitch = math.atan2(-r20, sy)
        yaw = 0.0
    return (roll, pitch, yaw)


class URRobot:
    """Small RTDE core focused on frequency, fields, and writable areas."""

    def __init__(
        self,
        host: str = DEFAULT_HOST,
        *,
        frequency_hz: float = 25.0,
        fields: Optional[Sequence[str]] = None,
        writes: Optional[Sequence[str]] = None,
        timeout: float = 2.0,
        protocol_version: int = 2,
        readback_writes: bool = True,
    ):
        self.host = host
        self.frequency_hz = float(frequency_hz)
        self.timeout = float(timeout)
        self.protocol_version = int(protocol_version)
        self.readback_writes = bool(readback_writes)

        self._field_tokens = list(fields or DEFAULT_FIELDS)
        self._write_tokens = list(writes or [])
        self._requested_outputs = expand_output_fields(self._field_tokens)
        self._requested_inputs = expand_fields(self._write_tokens)
        if self.readback_writes and self._requested_inputs:
            readable_inputs = [name for name in self._requested_inputs if _supports_output_readback(name)]
            self._requested_outputs = _dedupe([*self._requested_outputs, *readable_inputs])
        if not self._requested_outputs:
            raise ValueError("fields must contain at least one item")

        self._conn = RTDEConnection(self.host, timeout=self.timeout)
        self._controller_version: Optional[Tuple[int, int, int, int]] = None

        self._recipe_id: Optional[int] = None
        self._fields: List[str] = []
        self._types: List[str] = []
        self._input_recipe_id: Optional[int] = None
        self._input_fields: List[str] = []
        self._input_types: List[str] = []
        self._input_cache: Dict[str, Any] = {}

        self._connected = False
        self._streaming = False
        self._frame: Optional[RobotFrame] = None
        self._frame_index = 0
        self._error: Optional[BaseException] = None

        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._cond = threading.Condition()
        self._config_lock = threading.RLock()
        self._write_lock = threading.Lock()
        self._pending_write_fields: set[str] = set()
        self._reader_monotonic: Deque[float] = deque(maxlen=max(240, int(self.frequency_hz * 3.0)))
        self._reader_robot_timestamp: Deque[float] = deque(maxlen=max(240, int(self.frequency_hz * 3.0)))

    @property
    def controller_version(self) -> Optional[Tuple[int, int, int, int]]:
        return self._controller_version

    @property
    def fields(self) -> Tuple[str, ...]:
        return tuple(self._field_tokens)

    @property
    def writes(self) -> Tuple[str, ...]:
        return tuple(self._write_tokens)

    @property
    def output_fields(self) -> Tuple[str, ...]:
        return tuple(self._fields)

    @property
    def input_fields(self) -> Tuple[str, ...]:
        return tuple(self._input_fields)

    @property
    def is_connected(self) -> bool:
        return self._connected

    @property
    def is_streaming(self) -> bool:
        return self._streaming

    @property
    def frame(self) -> RobotFrame:
        return self.latest_frame()

    @property
    def frame_index(self) -> int:
        return self.latest_frame().frame_index

    def __enter__(self) -> "URRobot":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    async def __aenter__(self) -> "URRobot":
        await self.start_async()
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        await self.close_async()

    def configure(
        self,
        *,
        frequency_hz: Optional[float] = None,
        fields: Optional[Sequence[str]] = None,
        writes: Optional[Sequence[str]] = None,
    ) -> None:
        with self._config_lock:
            frequency_changed = frequency_hz is not None and float(frequency_hz) != self.frequency_hz
            if frequency_hz is not None:
                self.frequency_hz = float(frequency_hz)
            if fields is not None:
                self._field_tokens = list(fields)
            if writes is not None:
                self._write_tokens = list(writes)

            requested_outputs = expand_output_fields(self._field_tokens)
            requested_inputs = expand_fields(self._write_tokens)
            if self.readback_writes and requested_inputs:
                readable_inputs = [name for name in requested_inputs if _supports_output_readback(name)]
                requested_outputs = _dedupe([*requested_outputs, *readable_inputs])
            if not requested_outputs:
                raise ValueError("fields must contain at least one item")

            self._validate_recipe_csv(requested_outputs, label="output")
            self._validate_recipe_csv(requested_inputs, label="input")

            changed = (
                requested_outputs != self._requested_outputs
                or requested_inputs != self._requested_inputs
                or frequency_changed
            )
            self._requested_outputs = requested_outputs
            self._requested_inputs = requested_inputs
            if changed and self._connected:
                self._reconfigure()

    def connect(self) -> Tuple[int, int, int, int]:
        with self._config_lock:
            if self._connected:
                return self._controller_version or (0, 0, 0, 0)

            self._validate_recipe_csv(self._requested_outputs, label="output")
            self._validate_recipe_csv(self._requested_inputs, label="input")

            self._conn.connect()
            if not self._conn.request_protocol_version(self.protocol_version):
                raise RTDEError(f"protocol v{self.protocol_version} rejected")

            self._controller_version = self._conn.get_controller_version()

            recipe_id, output_types = self._conn.setup_outputs_v2(self.frequency_hz, self._requested_outputs)
            if len(output_types) != len(self._requested_outputs):
                raise RTDEError("RTDE output type count mismatch")
            bad_output_types = [f"{name}:{type_name}" for name, type_name in zip(self._requested_outputs, output_types) if type_name in {"NOT_FOUND", "IN_USE"}]
            if bad_output_types:
                raise RTDEError("RTDE output setup contains unsupported fields: " + ", ".join(bad_output_types))

            input_recipe_id: Optional[int] = None
            input_types: List[str] = []
            if self._requested_inputs:
                input_recipe_id, input_types = self._conn.setup_inputs(self._requested_inputs)
                if len(input_types) != len(self._requested_inputs):
                    raise RTDEError("RTDE input type count mismatch")
                bad_input_types = [f"{name}:{type_name}" for name, type_name in zip(self._requested_inputs, input_types) if type_name in {"NOT_FOUND", "IN_USE"}]
                if bad_input_types:
                    raise RTDEError("RTDE input setup contains unsupported or claimed fields: " + ", ".join(bad_input_types))

            self._recipe_id = recipe_id
            self._fields = list(self._requested_outputs)
            self._types = list(output_types)
            self._input_recipe_id = input_recipe_id
            self._input_fields = list(self._requested_inputs)
            self._input_types = list(input_types)
            self._input_cache = self._build_input_cache(existing=self._input_cache)

            self._connected = True
            self._streaming = False
            return self._controller_version

    async def connect_async(self) -> Tuple[int, int, int, int]:
        return await asyncio.to_thread(self.connect)

    def start(self, *, wait_ready: bool = True, ready_timeout: Optional[float] = None) -> None:
        with self._config_lock:
            if not self._connected:
                self.connect()
            if self._streaming:
                return
            if not self._conn.start(print_text_messages=True):
                raise RTDEError("RTDE start rejected")

            self._error = None
            self._stop.clear()
            with self._cond:
                self._frame = None

            self._streaming = True
            self._thread = threading.Thread(target=self._reader_loop, name="URRobotReader", daemon=True)
            self._thread.start()

            try:
                if wait_ready:
                    self.wait_ready(timeout=ready_timeout or self.timeout)
                if self._input_fields:
                    self._flush_input_cache()
            except BaseException:
                self._stop.set()
                self._streaming = False
                if self._thread is not None:
                    self._thread.join(timeout=max(self.timeout, 1.0))
                    self._thread = None
                try:
                    self._conn.pause()
                except Exception:
                    pass
                raise

    async def start_async(self, *, wait_ready: bool = True, ready_timeout: Optional[float] = None) -> None:
        await asyncio.to_thread(self.start, wait_ready=wait_ready, ready_timeout=ready_timeout)

    def stop(self) -> None:
        with self._config_lock:
            self._stop.set()
            thread = self._thread

        if thread is not None:
            thread.join(timeout=max(self.timeout, 1.0))

        with self._config_lock:
            pause_error: Optional[BaseException] = None
            if self._connected and self._streaming:
                try:
                    self._conn.pause()
                except BaseException as exc:
                    pause_error = exc
                finally:
                    self._streaming = False

            if thread is not None and not thread.is_alive():
                self._thread = None

            if pause_error is not None:
                try:
                    self._conn.close()
                except Exception:
                    pass
                self._conn = RTDEConnection(self.host, timeout=self.timeout)
                self._connected = False
                self._recipe_id = None
                self._input_recipe_id = None
                self._fields = []
                self._types = []
                self._input_fields = []
                self._input_types = []
                self._frame = None
                self._frame_index = 0
                self._pending_write_fields.clear()

    pause = stop

    async def stop_async(self) -> None:
        await asyncio.to_thread(self.stop)

    def close(self) -> None:
        with self._config_lock:
            try:
                self.stop()
            finally:
                self._conn.close()
                self._connected = False
                self._streaming = False

    async def close_async(self) -> None:
        await asyncio.to_thread(self.close)

    def wait_ready(self, timeout: Optional[float] = None) -> RobotFrame:
        deadline = None if timeout is None else time.monotonic() + float(timeout)
        with self._cond:
            while self._frame is None and self._error is None:
                remaining = None if deadline is None else max(0.0, deadline - time.monotonic())
                if remaining == 0.0:
                    break
                self._cond.wait(remaining)
            if self._error is not None:
                raise RuntimeError("reader thread failed") from self._error
            if self._frame is None:
                raise TimeoutError("timed out waiting for first RTDE frame")
            return self._frame

    async def wait_ready_async(self, timeout: Optional[float] = None) -> RobotFrame:
        return await asyncio.to_thread(self.wait_ready, timeout)

    def wait_next_frame(self, *, last_frame_index: Optional[int] = None, timeout: Optional[float] = None) -> RobotFrame:
        deadline = None if timeout is None else time.monotonic() + float(timeout)
        with self._cond:
            while self._error is None:
                if self._frame is not None:
                    if last_frame_index is None or self._frame.frame_index > int(last_frame_index):
                        return self._frame
                remaining = None if deadline is None else max(0.0, deadline - time.monotonic())
                if remaining == 0.0:
                    break
                self._cond.wait(remaining)
            if self._error is not None:
                raise RuntimeError("reader thread failed") from self._error
            raise TimeoutError("timed out waiting for next RTDE frame")

    async def wait_next_frame_async(self, *, last_frame_index: Optional[int] = None, timeout: Optional[float] = None) -> RobotFrame:
        return await asyncio.to_thread(self.wait_next_frame, last_frame_index=last_frame_index, timeout=timeout)

    def latest_frame(self) -> RobotFrame:
        with self._cond:
            if self._error is not None:
                raise RuntimeError("reader thread failed") from self._error
            if self._frame is None:
                raise RTDEError("no RTDE frame available yet; call start() first")
            return self._frame

    def snapshot(self) -> Dict[str, Any]:
        return self.latest_frame().as_dict()

    def has(self, name: str) -> bool:
        key = normalize_token(name)
        return key in self._fields or key in self._requested_outputs

    def can_write(self, name: str) -> bool:
        key = normalize_token(name)
        return key in self._input_fields or key in self._requested_inputs

    def read(self, name: str, default: Any = _MISSING) -> Any:
        key = normalize_token(name)
        if key in self._input_fields and key in self._pending_write_fields:
            return _thaw_value(self._input_cache[key])
        if key in self._fields:
            return self.latest_frame().values[key]
        if key in self._input_fields:
            return _thaw_value(self._input_cache[key])
        if key in self._requested_outputs:
            raise RTDEError("no RTDE frame available yet; call start() first")
        if default is not _MISSING:
            return default
        raise AttributeError(f"field {name!r} is not selected")

    def write_many(self, values: Dict[str, Any], *, flush: Optional[bool] = None) -> None:
        if not values:
            return
        if not self._connected:
            self.connect()
        if self._input_recipe_id is None:
            raise RTDEError("input recipe is not configured")

        for raw_name, raw_value in values.items():
            key = normalize_token(raw_name)
            if key not in self._input_fields:
                raise RTDEError(f"field {raw_name!r} is not writable; add it to FIELD=[...] or writes=[...]")
            index = self._input_fields.index(key)
            type_name = self._input_types[index]
            self._input_cache[key] = self._coerce_value(type_name, raw_value)
            self._pending_write_fields.add(key)

        should_flush = self._streaming if flush is None else bool(flush)
        if should_flush:
            self._flush_input_cache()

    def write(self, name: str, value: Any) -> None:
        self.write_many({name: value})

    def set_speed_slider(
        self,
        fraction: float,
        *,
        settle_s: float = 0.10,
        release_mask: bool = True,
    ) -> float:
        value = max(0.0, min(1.0, float(fraction)))
        if "speed_slider_mask" not in self._requested_inputs or "speed_slider_fraction" not in self._requested_inputs:
            raise RTDEError(
                'speed slider inputs are not configured; add "speed_slider_mask" and "speed_slider_fraction" to FIELD=[...]'
            )

        self.write_many({
            "speed_slider_fraction": value,
            "speed_slider_mask": 1,
        }, flush=True)

        if settle_s > 0.0:
            time.sleep(float(settle_s))

        if release_mask:
            self.write_many({"speed_slider_mask": 0}, flush=True)

        return value

    def speed_slider_state(self) -> Dict[str, Any]:
        return {
            "speed_slider_mask": self.read("speed_slider_mask", 0),
            "speed_slider_fraction": self.read("speed_slider_fraction", 0.0),
            "speed_scaling": self.read("speed_scaling", None),
            "target_speed_fraction": self.read("target_speed_fraction", None),
        }

    def q_deg(self) -> Tuple[float, ...]:
        return _as_float_tuple(rad_to_deg(self.read("q")))

    joint_deg = q_deg

    def tcp_pose(self, mode: str = "rotvec_rad") -> Tuple[float, float, float, float, float, float]:
        """Return TCP pose converted for display.

        mode:
            - "rotvec_rad": [x_mm, y_mm, z_mm, rx, ry, rz]
            - "rotvec_deg": [x_mm, y_mm, z_mm, rx_deg, ry_deg, rz_deg]
            - "rpy_rad":    [x_mm, y_mm, z_mm, roll, pitch, yaw]
            - "rpy_deg":    [x_mm, y_mm, z_mm, roll_deg, pitch_deg, yaw_deg]
        """
        x, y, z, rx, ry, rz = (float(item) for item in self.read("tcp"))
        xyz_mm = (x * 1000.0, y * 1000.0, z * 1000.0)
        mode_key = str(mode).strip().lower()

        if mode_key == "rotvec_rad":
            orient = (rx, ry, rz)
        elif mode_key == "rotvec_deg":
            orient = _as_float_tuple(rad_to_deg((rx, ry, rz)))
        elif mode_key == "rpy_rad":
            orient = rotvec_to_rpy((rx, ry, rz))
        elif mode_key == "rpy_deg":
            orient = _as_float_tuple(rad_to_deg(rotvec_to_rpy((rx, ry, rz))))
        else:
            raise ValueError('tcp_pose(mode=...) must be one of: "rotvec_rad", "rotvec_deg", "rpy_rad", "rpy_deg"')

        return _as_float_tuple((*xyz_mm, *orient))

    def tcp_mm(self) -> Tuple[float, float, float, float, float, float]:
        return self.tcp_pose("rotvec_rad")

    def tcp_mm_deg(self) -> Tuple[float, float, float, float, float, float]:
        return self.tcp_pose("rotvec_deg")

    def tcp_rpy(self) -> Tuple[float, float, float, float, float, float]:
        return self.tcp_pose("rpy_rad")

    def tcp_rpy_deg(self) -> Tuple[float, float, float, float, float, float]:
        return self.tcp_pose("rpy_deg")

    def unit_of(self, name: str) -> Any:
        key = normalize_token(name)
        if key.startswith("input_bit_register_") or key.startswith("output_bit_register_"):
            return "bool"
        if key.startswith("input_int_register_") or key.startswith("output_int_register_"):
            return "int32"
        if key.startswith("input_double_register_") or key.startswith("output_double_register_"):
            return "double"
        return _FIELD_UNITS.get(key, "n/a")

    def digital_input(self, bit: int) -> bool:
        if bit < 0:
            raise ValueError("bit must be >= 0")
        bits = int(self.read("di", 0))
        return bool(bits & (1 << int(bit)))

    def digital_output(self, bit: int) -> bool:
        if bit < 0:
            raise ValueError("bit must be >= 0")
        bits = int(self.read("do", 0))
        return bool(bits & (1 << int(bit)))

    def __getitem__(self, name: str) -> Any:
        return self.read(name)

    def __setitem__(self, name: str, value: Any) -> None:
        self.write(name, value)

    def __getattr__(self, name: str) -> Any:
        if name.startswith("_"):
            raise AttributeError(name)
        try:
            return self.read(name)
        except Exception as exc:
            raise AttributeError(name) from exc

    def reader_rates(self) -> Dict[str, float]:
        with self._cond:
            frame_index = self._frame_index
            arrival_samples = tuple(self._reader_monotonic)
            robot_samples = tuple(self._reader_robot_timestamp)
        return {
            "arrival_hz": self._rate_from_samples(arrival_samples),
            "robot_hz": self._rate_from_samples(robot_samples),
            "frame_index": float(frame_index),
        }

    @staticmethod
    def _rate_from_samples(samples: Sequence[float]) -> float:
        if len(samples) < 2:
            return 0.0
        span = float(samples[-1]) - float(samples[0])
        if span <= 1e-9:
            return 0.0
        return (len(samples) - 1) / span

    def __dir__(self) -> List[str]:
        dynamic = set(FIELD_ALIASES.keys()) | set(self._fields) | set(self._input_fields)
        return sorted(set(super().__dir__()) | dynamic)

    def _reconfigure(self) -> None:
        was_streaming = self._streaming
        self.stop()
        self._conn.close()
        self._connected = False
        self._streaming = False
        self._recipe_id = None
        self._input_recipe_id = None
        self._fields = []
        self._types = []
        self._input_fields = []
        self._input_types = []
        self._pending_write_fields.clear()
        self._conn = RTDEConnection(self.host, timeout=self.timeout)
        self.connect()
        if was_streaming:
            self.start(wait_ready=True, ready_timeout=self.timeout)

    def _reader_loop(self) -> None:
        consecutive_timeouts = 0
        try:
            while not self._stop.is_set():
                try:
                    values = self._receive_frame()
                    consecutive_timeouts = 0
                except (socket.timeout, TimeoutError):
                    consecutive_timeouts += 1
                    if self._stop.is_set():
                        break
                    if consecutive_timeouts <= 5:
                        continue
                    raise
                for field_name in tuple(self._pending_write_fields):
                    if field_name in values and values[field_name] == self._input_cache.get(field_name):
                        self._pending_write_fields.discard(field_name)
                frozen_values = {key: _freeze_value(value) for key, value in values.items()}
                now_monotonic = time.monotonic()
                frame_index = self._frame_index + 1
                robot_timestamp_s = float(frozen_values["timestamp"]) if "timestamp" in frozen_values else None
                frame = RobotFrame(
                    values=frozen_values,
                    frame_index=frame_index,
                    robot_timestamp_s=robot_timestamp_s,
                    received_monotonic_s=now_monotonic,
                    received_wall_time_s=time.time(),
                    source_frequency_hz=self.frequency_hz,
                )
                with self._cond:
                    self._frame_index = frame_index
                    self._frame = frame
                    self._reader_monotonic.append(now_monotonic)
                    if robot_timestamp_s is not None:
                        self._reader_robot_timestamp.append(robot_timestamp_s)
                    self._cond.notify_all()
        except BaseException as exc:
            self._streaming = False
            if not self._stop.is_set():
                self._error = exc
                with self._cond:
                    self._cond.notify_all()

    def _receive_frame(self) -> Dict[str, Any]:
        if not self._connected:
            raise RTDEError("not connected")
        if not self._streaming:
            raise RTDEError("not streaming")
        if self._recipe_id is None:
            raise RTDEError("output recipe not configured")

        while True:
            recipe_id, payload = self._conn.recv_data_package()
            if recipe_id != self._recipe_id:
                continue
            values = unpack_values(self._types, payload)
            return {name: value for name, value in zip(self._fields, values)}

    def _flush_input_cache(self) -> None:
        if self._input_recipe_id is None:
            return
        if not self._streaming:
            return
        ordered_values = [self._input_cache[field] for field in self._input_fields]
        payload = pack_values(self._input_types, ordered_values)
        with self._write_lock:
            self._conn.send_data_package(self._input_recipe_id, payload)

    def _build_input_cache(self, *, existing: Dict[str, Any]) -> Dict[str, Any]:
        cache: Dict[str, Any] = {}
        for field_name, type_name in zip(self._input_fields, self._input_types):
            if field_name in existing:
                cache[field_name] = self._coerce_value(type_name, existing[field_name])
            else:
                cache[field_name] = self._default_value(type_name)
        return cache

    @staticmethod
    def _default_value(type_name: str) -> Any:
        if type_name == "BOOL":
            return False
        if type_name == "DOUBLE":
            return 0.0
        if type_name in {"UINT64", "UINT32", "INT32", "UINT8"}:
            return 0
        if type_name == "VECTOR3D":
            return [0.0, 0.0, 0.0]
        if type_name == "VECTOR6D":
            return [0.0] * 6
        if type_name in {"VECTOR6INT32", "VECTOR6UINT32"}:
            return [0] * 6
        raise RTDEError(f"unsupported RTDE input type: {type_name}")

    @staticmethod
    def _coerce_value(type_name: str, value: Any) -> Any:
        if type_name == "BOOL":
            return bool(value)
        if type_name == "DOUBLE":
            return float(value)
        if type_name in {"UINT64", "UINT32", "INT32", "UINT8"}:
            return int(value)
        if type_name == "VECTOR3D":
            items = list(value)
            if len(items) != 3:
                raise ValueError("VECTOR3D value must contain 3 items")
            return [float(item) for item in items]
        if type_name == "VECTOR6D":
            items = list(value)
            if len(items) != 6:
                raise ValueError("VECTOR6D value must contain 6 items")
            return [float(item) for item in items]
        if type_name in {"VECTOR6INT32", "VECTOR6UINT32"}:
            items = list(value)
            if len(items) != 6:
                raise ValueError(f"{type_name} value must contain 6 items")
            return [int(item) for item in items]
        raise RTDEError(f"unsupported RTDE input type: {type_name}")

    @staticmethod
    def _validate_recipe_csv(fields: Sequence[str], *, label: str) -> None:
        if label == "output" and not fields:
            raise ValueError("output recipe must contain at least one field")
        csv_len = len(",".join(fields).encode("ascii"))
        if csv_len > 1900:
            raise RTDEError(f"too many {label} fields (recipe CSV exceeds safe size)")


def _summarize_setup(names: Sequence[str], types: Sequence[str]) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    for name, type_name in zip(names, types):
        entry = {"field": str(name), "type": str(type_name), "ok": str(type_name) not in {"NOT_FOUND", "IN_USE"}}
        items.append(entry)
    return items


def _attempt_rtde_recipe(
    host: str,
    *,
    frequency_hz: float,
    fields: Sequence[str],
    protocol_version: int = 2,
    timeout: float = 2.0,
) -> Dict[str, Any]:
    normalized = expand_fields(fields)
    result: Dict[str, Any] = {
        "host": str(host),
        "frequency_hz": float(frequency_hz),
        "fields": list(normalized),
        "controller_version": None,
        "setup_ok": False,
        "start_ok": False,
        "error": None,
        "setup": [],
    }
    conn = RTDEConnection(str(host), timeout=float(timeout))
    try:
        conn.connect()
        if not conn.request_protocol_version(int(protocol_version)):
            raise RTDEError(f"protocol v{protocol_version} rejected")
        result["controller_version"] = conn.get_controller_version()
        recipe_id, output_types = conn.setup_outputs_v2(float(frequency_hz), normalized)
        result["recipe_id"] = int(recipe_id)
        result["setup"] = _summarize_setup(normalized, output_types)
        result["setup_ok"] = bool(recipe_id) and all(item["ok"] for item in result["setup"])
        if not result["setup_ok"]:
            bad = [item for item in result["setup"] if not item["ok"]]
            if bad:
                result["error"] = "setup contains unsupported fields"
                result["bad_fields"] = bad
            return result
        result["start_ok"] = bool(conn.start(print_text_messages=False))
        if not result["start_ok"]:
            result["error"] = "RTDE start rejected"
            return result
        try:
            conn.pause(print_text_messages=False)
        except Exception:
            pass
        return result
    except Exception as exc:
        result["error"] = f"{type(exc).__name__}: {exc}"
        return result
    finally:
        try:
            conn.close()
        except Exception:
            pass


def probe_rtde_compatibility(
    host: str,
    *,
    frequency_hz: float,
    fields: Sequence[str],
    protocol_version: int = 2,
    timeout: float = 2.0,
    base_fields: Optional[Sequence[str]] = None,
) -> Dict[str, Any]:
    normalized = expand_fields(fields)
    base = expand_fields(base_fields or ["timestamp"])
    if not base:
        base = ["timestamp"]

    requested = _attempt_rtde_recipe(
        host,
        frequency_hz=float(frequency_hz),
        fields=normalized,
        protocol_version=protocol_version,
        timeout=timeout,
    )

    probe_hz = 125.0 if float(frequency_hz) > 125.0 else float(frequency_hz)
    reduced = None
    if probe_hz != float(frequency_hz):
        reduced = _attempt_rtde_recipe(
            host,
            frequency_hz=probe_hz,
            fields=normalized,
            protocol_version=protocol_version,
            timeout=timeout,
        )

    singles: List[Dict[str, Any]] = []
    for field in normalized:
        combo = _dedupe([*base, field])
        outcome = _attempt_rtde_recipe(
            host,
            frequency_hz=probe_hz,
            fields=combo,
            protocol_version=protocol_version,
            timeout=timeout,
        )
        singles.append({
            "field": field,
            "probe_fields": combo,
            "setup_ok": bool(outcome.get("setup_ok")),
            "start_ok": bool(outcome.get("start_ok")),
            "error": outcome.get("error"),
            "setup": outcome.get("setup", []),
        })

    supported_single = [item["field"] for item in singles if item.get("setup_ok") and item.get("start_ok")]
    failing_single = [item for item in singles if not (item.get("setup_ok") and item.get("start_ok"))]

    return {
        "requested": requested,
        "requested_125hz": reduced,
        "base_fields": base,
        "single_field_probes": singles,
        "supported_single_fields": supported_single,
        "failing_single_fields": failing_single,
    }


class UR_RTDE(URRobot):
    """Very small user-facing RTDE API.

    Example:
        robot = UR_RTDE(HOST=DEFAULT_HOST, FREQUENCY_HZ=25, FIELD=["time", "q", "tcp", "gp.int.0"])
        robot.start()
        print(robot["q"])
        robot["gp.int.0"] = 33
        robot.stop()
        robot.close()

    Notes:
        - FIELD contains both readable fields and writable GP input fields.
        - gp.int.0 -> input_int_register_24
        - gp.double.0 -> input_double_register_24
        - gp.bit.0 -> input_bit_register_64
        - Direct UR numbering also works, for example gp.int.24 and gp.bit.64.
    """

    def __init__(
        self,
        HOST: str = DEFAULT_HOST,
        FREQUENCY_HZ: float = 25.0,
        FIELD: Optional[Sequence[str]] = None,
        *,
        TIMEOUT: float = 2.0,
        PROTOCOL_VERSION: int = 2,
        READBACK_WRITES: bool = True,
    ):
        selected = list(FIELD or DEFAULT_FIELDS)
        auto_writes = [token for token in selected if _is_rtde_input_token(token)]
        super().__init__(
            host=HOST,
            frequency_hz=FREQUENCY_HZ,
            fields=selected,
            writes=auto_writes,
            timeout=TIMEOUT,
            protocol_version=PROTOCOL_VERSION,
            readback_writes=READBACK_WRITES,
        )

    @property
    def HOST(self) -> str:
        return self.host

    @property
    def FREQUENCY_HZ(self) -> float:
        return self.frequency_hz

    @property
    def FIELD(self) -> Tuple[str, ...]:
        return tuple(self.fields)
