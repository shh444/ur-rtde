from __future__ import annotations

import csv
import json
import math
import re
import threading
import time
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import Any, Deque, Dict, List, Optional, Sequence, Tuple

from fastapi import HTTPException

try:
    from .settings import (
        COMMON_FIELDS,
        DEFAULT_FIELDS,
        DEFAULT_FREQUENCY_HZ,
        DEFAULT_HISTORY_SAMPLE_HZ,
        DEFAULT_HISTORY_SECONDS,
        DEFAULT_HOST,
        DEFAULT_ROBOT_MODEL,
        FIELD_HELP,
        FIELD_PRESETS,
        FIELD_SECTIONS,
        ROBOT_MODELS,
        ROBOT_MODEL_LABELS,
    )
    from .ur_robot import RTDEError, UR_RTDE, normalize_token, probe_rtde_compatibility, rad_to_deg, rotvec_to_rpy
except ImportError:
    from settings import (
        COMMON_FIELDS,
        DEFAULT_FIELDS,
        DEFAULT_FREQUENCY_HZ,
        DEFAULT_HISTORY_SAMPLE_HZ,
        DEFAULT_HISTORY_SECONDS,
        DEFAULT_HOST,
        DEFAULT_ROBOT_MODEL,
        FIELD_HELP,
        FIELD_PRESETS,
        FIELD_SECTIONS,
        ROBOT_MODELS,
        ROBOT_MODEL_LABELS,
    )
    from ur_robot import RTDEError, UR_RTDE, normalize_token, probe_rtde_compatibility, rad_to_deg, rotvec_to_rpy

_JSONLike = Any


def _format_probe_summary(probe: Dict[str, Any]) -> str:
    requested = probe.get("requested") or {}
    reduced = probe.get("requested_125hz") or {}
    failing = probe.get("failing_single_fields") or []
    parts: List[str] = []
    if requested:
        parts.append(
            f"requested @{requested.get('frequency_hz')}Hz -> setup_ok={requested.get('setup_ok')} start_ok={requested.get('start_ok')} error={requested.get('error')}"
        )
    if reduced:
        parts.append(
            f"requested @125Hz -> setup_ok={reduced.get('setup_ok')} start_ok={reduced.get('start_ok')} error={reduced.get('error')}"
        )
    if failing:
        names = ", ".join(str(item.get("field")) for item in failing)
        parts.append(f"failing single-field probes: {names}")
    supported = probe.get("supported_single_fields") or []
    if supported:
        parts.append("supported single-field probes: " + ", ".join(str(item) for item in supported))
    return " | ".join(parts)


def _compact_probe_for_state(probe: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not probe:
        return None
    requested = probe.get("requested") or {}
    reduced = probe.get("requested_125hz") or {}
    return {
        "requested": {
            "frequency_hz": requested.get("frequency_hz"),
            "setup_ok": requested.get("setup_ok"),
            "start_ok": requested.get("start_ok"),
            "error": requested.get("error"),
        },
        "requested_125hz": {
            "frequency_hz": reduced.get("frequency_hz"),
            "setup_ok": reduced.get("setup_ok"),
            "start_ok": reduced.get("start_ok"),
            "error": reduced.get("error"),
        } if reduced else None,
        "supported_single_fields": list(probe.get("supported_single_fields") or []),
        "failing_single_fields": [
            {"field": item.get("field"), "error": item.get("error")}
            for item in (probe.get("failing_single_fields") or [])
        ],
    }


def _json_safe(value: Any) -> Any:
    if isinstance(value, tuple):
        return [_json_safe(item) for item in value]
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    return value


def _format_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if math.isnan(value):
            return "NaN"
        if math.isinf(value):
            return "Inf" if value > 0 else "-Inf"
        return f"{value:.6f}".rstrip("0").rstrip(".")
    if isinstance(value, (list, tuple)):
        return "[" + ", ".join(_format_value(item) for item in value) + "]"
    return str(value)


def _bits(value: Any, count: int = 16) -> List[bool]:
    raw = int(value or 0)
    return [bool(raw & (1 << index)) for index in range(count)]


def _sanitize_label(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", value.strip())
    return cleaned.strip("._-") or "snapshot"


OPTIONAL_OUTPUT_FIELDS = {
    "actual_current_as_torque",
    "joint_control_output",
    "joint_temperatures",
    "actual_joint_voltage",
}

FREQUENCY_FALLBACKS = (500.0, 250.0, 125.0, 100.0, 50.0, 25.0)


class DashboardService:
    def __init__(
        self,
        *,
        base_dir: Path,
        host: str = DEFAULT_HOST,
        frequency_hz: float = DEFAULT_FREQUENCY_HZ,
        fields: Sequence[str] = DEFAULT_FIELDS,
        history_seconds: float = DEFAULT_HISTORY_SECONDS,
        history_sample_hz: float = DEFAULT_HISTORY_SAMPLE_HZ,
        robot_model: str = DEFAULT_ROBOT_MODEL,
    ):
        self.base_dir = Path(base_dir)
        self.recordings_dir = self.base_dir / "recordings"
        self.exports_dir = self.base_dir / "exports"
        self.recordings_dir.mkdir(parents=True, exist_ok=True)
        self.exports_dir.mkdir(parents=True, exist_ok=True)

        self.host = str(host)
        self.frequency_hz = float(frequency_hz)
        self._active_frequency_hz = float(frequency_hz)
        self.fields = list(fields)
        self.history_seconds = float(history_seconds)
        self.history_sample_hz = float(history_sample_hz)
        self.robot_model = str(robot_model).strip().lower() or DEFAULT_ROBOT_MODEL
        if self.robot_model not in ROBOT_MODELS:
            self.robot_model = DEFAULT_ROBOT_MODEL

        self._lock = threading.RLock()
        self._worker_stop = threading.Event()
        self._worker: Optional[threading.Thread] = None
        self._robot: Optional[UR_RTDE] = None
        self._last_probe: Optional[Dict[str, Any]] = None
        self._running = False
        self._last_error: Optional[str] = None
        self._started_at_monotonic: Optional[float] = None
        self._history_origin_robot_s: Optional[float] = None
        self._last_chart_sample_robot_s: Optional[float] = None
        self._recent_frame_monotonic: Deque[float] = deque(maxlen=max(240, int(self.frequency_hz * 2.5)))
        self._events: Deque[Dict[str, str]] = deque(maxlen=200)
        self._consumer_skipped_frames = 0
        self._last_start_attempts: List[Dict[str, Any]] = []

        self._recording_active = False
        self._recording_file: Optional[Any] = None
        self._recording_writer: Optional[csv.writer] = None
        self._recording_path: Optional[Path] = None
        self._recording_rows = 0
        self._latest_export_path: Optional[Path] = None

        self._history_maxlen = max(200, int(self.history_seconds * self.history_sample_hz) + 5)
        self._history_joint_deg: List[Deque[List[float]]] = [deque(maxlen=self._history_maxlen) for _ in range(6)]
        self._history_joint_vel_deg: List[Deque[List[float]]] = [deque(maxlen=self._history_maxlen) for _ in range(6)]
        self._history_joint_current: List[Deque[List[float]]] = [deque(maxlen=self._history_maxlen) for _ in range(6)]
        self._history_target_current: List[Deque[List[float]]] = [deque(maxlen=self._history_maxlen) for _ in range(6)]
        self._history_current_window: List[Deque[List[float]]] = [deque(maxlen=self._history_maxlen) for _ in range(6)]
        self._history_tcp_xyz_mm: List[Deque[List[float]]] = [deque(maxlen=self._history_maxlen) for _ in range(3)]
        self._history_tcp_rpy_deg: List[Deque[List[float]]] = [deque(maxlen=self._history_maxlen) for _ in range(3)]
        self._history_speed: Deque[List[float]] = deque(maxlen=self._history_maxlen)
        self._history_gp_numeric: Dict[str, Deque[List[float]]] = {}
        self._last_frame: Optional[Any] = None
        self._rebuild_history_structures()
        self._log("info", "Dashboard initialized")

    # ---------- Public API ----------
    def catalog(self) -> Dict[str, Any]:
        return {
            "presets": FIELD_PRESETS,
            "field_help": FIELD_HELP,
            "common_fields": COMMON_FIELDS,
            "field_sections": FIELD_SECTIONS,
            "writable_examples": ["input_int_register_24", "input_double_register_24", "input_bit_register_64"],
            "robot_models": [{"key": key, "label": ROBOT_MODEL_LABELS.get(key, key.upper())} for key in ROBOT_MODELS],
            "default_robot_model": DEFAULT_ROBOT_MODEL,
            "current_window_fields": ["actual_current", "target_current", "actual_current_window", "actual_current_as_torque"],
        }

    def state(self) -> Dict[str, Any]:
        snapshot = self._snapshot_state(include_history=True, include_events=True)
        return self._build_payload_from_snapshot(snapshot, include_history=True, include_events=True, include_catalog=True, include_latest=True)

    def chart_state(self) -> Dict[str, Any]:
        snapshot = self._snapshot_state(include_history=True, include_events=True)
        return self._build_payload_from_snapshot(snapshot, include_history=True, include_events=True, include_catalog=False, include_latest=False)

    def live_state(self) -> Dict[str, Any]:
        snapshot = self._snapshot_state(include_history=False, include_events=False)
        return self._build_payload_from_snapshot(snapshot, include_history=False, include_events=False, include_catalog=False, include_latest=True)

    def update_config(
        self,
        *,
        frequency_hz: Optional[float] = None,
        fields: Optional[Sequence[str]] = None,
        history_seconds: Optional[float] = None,
        history_sample_hz: Optional[float] = None,
        robot_model: Optional[str] = None,
        restart_if_running: bool = True,
    ) -> Dict[str, Any]:
        with self._lock:
            if frequency_hz is not None:
                self.frequency_hz = float(frequency_hz)
            if fields is not None:
                cleaned = [str(token).strip() for token in fields if str(token).strip()]
                if not cleaned:
                    raise HTTPException(status_code=400, detail="fields must contain at least one item")
                self.fields = cleaned
            if history_seconds is not None:
                self.history_seconds = float(history_seconds)
            if history_sample_hz is not None:
                self.history_sample_hz = float(history_sample_hz)
            if robot_model is not None:
                candidate = str(robot_model).strip().lower()
                if candidate and candidate in ROBOT_MODELS:
                    self.robot_model = candidate
            self._history_maxlen = max(200, int(self.history_seconds * self.history_sample_hz) + 5)
            self._recent_frame_monotonic = deque(maxlen=max(240, int(self.frequency_hz * 2.5)))
            self._rebuild_history_structures()
            self._consumer_skipped_frames = 0
            self._active_frequency_hz = float(self.frequency_hz)
            self._last_start_attempts = []
            running = self._running
            self._last_error = None
            self._log("info", f"Config updated: host={self.host}, hz={self.frequency_hz}, fields={len(self.fields)}")

        if running and restart_if_running:
            self.restart()
        return self.state()

    def start(self) -> Dict[str, Any]:
        with self._lock:
            if self._running:
                return self.state()
            self._last_error = None
            self._worker_stop.clear()
            self._clear_history()
            self._history_origin_robot_s = None
            self._last_chart_sample_robot_s = None
            self._recent_frame_monotonic = deque(maxlen=max(240, int(self.frequency_hz * 2.5)))
            self._consumer_skipped_frames = 0
            self._last_frame = None
            self._last_start_attempts = []
            self._active_frequency_hz = float(self.frequency_hz)
            old_robot = self._robot
            requested_fields = list(self.fields)

        if old_robot is not None:
            try:
                old_robot.close()
            except Exception:
                pass

        try:
            robot, active_frequency_hz = self._start_robot_with_fallback(requested_fields)
        except Exception as exc:
            with self._lock:
                self._robot = None
                self._running = False
                self._last_error = f"{type(exc).__name__}: {exc}"
                self._last_frame = None
                self._log("error", f"Start failed: {self._last_error}")
            raise HTTPException(status_code=500, detail=self._last_error)

        with self._lock:
            self._robot = robot
            self._active_frequency_hz = float(active_frequency_hz)
            self._started_at_monotonic = time.monotonic()
            self._running = True
            self._last_frame = self._current_frame()
            self._worker = threading.Thread(target=self._worker_loop, name="URRTDEDashboardWorker", daemon=True)
            self._worker.start()
            if self.frequency_hz >= 250.0 and len(self.fields) > 6:
                self._log("warning", "High requested RTDE load: 250+ Hz with many fields. Prefer a slim FIELD list for digital twin.")
            if self._active_frequency_hz != self.frequency_hz:
                self._log("warning", f"Requested {self.frequency_hz:.1f} Hz but started at {self._active_frequency_hz:.1f} Hz for this recipe.")
            self._log("info", "RTDE stream started")
            return self.state()

    def _start_robot_with_fallback(self, requested_fields: Sequence[str]) -> Tuple[UR_RTDE, float]:
        requested_frequency = float(self.frequency_hz)
        attempted: List[Dict[str, Any]] = []
        last_exc: Optional[BaseException] = None
        frequencies = self._candidate_frequencies(requested_frequency)

        for candidate_hz in frequencies:
            robot = UR_RTDE(HOST=self.host, FREQUENCY_HZ=candidate_hz, FIELD=requested_fields)
            try:
                robot.start()
                with self._lock:
                    self._last_start_attempts = attempted + [{"frequency_hz": float(candidate_hz), "result": "ok"}]
                return robot, float(candidate_hz)
            except BaseException as exc:
                detail = f"{type(exc).__name__}: {exc}"
                attempted.append({"frequency_hz": float(candidate_hz), "result": "error", "detail": detail})
                last_exc = exc
                try:
                    robot.close()
                except Exception:
                    pass

                message = str(exc)
                if "Unsupported RTDE output fields" in message or "Unsupported RTDE input fields" in message:
                    with self._lock:
                        self._last_start_attempts = attempted
                    raise exc
                if "RTDE start rejected" not in message or candidate_hz <= 25.0:
                    with self._lock:
                        self._last_start_attempts = attempted
                    raise exc

        with self._lock:
            self._last_start_attempts = attempted
        if last_exc is not None:
            tried = ", ".join(f"{item['frequency_hz']:.1f}" for item in attempted)
            raise RTDEError(
                f"RTDE start rejected for this recipe. Tried frequencies: {tried} Hz. "
                "Reduce the field list or use a lower frequency such as 125 Hz for current-window monitoring."
            ) from last_exc
        raise RTDEError("RTDE start failed before any attempt was made")

    @staticmethod
    def _candidate_frequencies(requested_frequency: float) -> List[float]:
        values: List[float] = []
        seen = set()
        for candidate in [float(requested_frequency), *FREQUENCY_FALLBACKS]:
            candidate = max(1.0, min(500.0, float(candidate)))
            rounded = round(candidate, 6)
            if rounded in seen:
                continue
            if rounded > requested_frequency + 1e-9:
                continue
            seen.add(rounded)
            values.append(candidate)
        if not values:
            values.append(max(1.0, min(500.0, float(requested_frequency))))
        return values

    def stop(self) -> Dict[str, Any]:
        with self._lock:
            worker = self._worker
            robot = self._robot
            self._worker_stop.set()

        if worker is not None:
            worker.join(timeout=3.0)

        if robot is not None:
            try:
                robot.close()
            except Exception as exc:
                with self._lock:
                    self._last_error = self._last_error or f"{type(exc).__name__}: {exc}"
                    self._log("warning", f"Close warning: {self._last_error}")

        with self._lock:
            self._worker = None
            self._robot = None
            self._running = False
            self._active_frequency_hz = float(self.frequency_hz)
            self._started_at_monotonic = None
            if self._recording_active:
                self._stop_recording_locked()
            self._log("info", "RTDE stream stopped")
            return self.state()

    def restart(self) -> Dict[str, Any]:
        self.stop()
        return self.start()

    def shutdown(self) -> None:
        try:
            self.stop()
        except Exception:
            pass

    def write(self, field: str, value: Any) -> Dict[str, Any]:
        token = str(field).strip()
        with self._lock:
            robot = self._robot
            writable = self._writable_fields()
        if token not in writable:
            raise HTTPException(status_code=400, detail=f"field {token!r} is not writable in the current config")
        if robot is None:
            raise HTTPException(status_code=409, detail="robot is not started")

        coerced = self._coerce_write_value(token, value)
        try:
            robot[token] = coerced
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"write failed: {type(exc).__name__}: {exc}") from exc

        with self._lock:
            self._log("info", f"Write {token}={coerced}")
            return self.state()

    def start_recording(self, label: Optional[str] = None) -> Dict[str, Any]:
        with self._lock:
            if self._recording_active:
                return self.state()
            self._start_recording_locked(label=label)
            return self.state()

    def stop_recording(self) -> Dict[str, Any]:
        with self._lock:
            self._stop_recording_locked()
            return self.state()

    def export_snapshot(self, label: Optional[str] = None) -> Dict[str, str]:
        snapshot = self.state()
        name = datetime.now().strftime("snapshot_%Y%m%d_%H%M%S")
        if label:
            name += f"_{_sanitize_label(label)}"
        path = self.exports_dir / f"{name}.json"
        path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")
        with self._lock:
            self._latest_export_path = path
            self._log("info", f"Snapshot exported: {path.name}")
        return {
            "filename": path.name,
            "url": f"/api/exports/{path.name}",
        }

    # ---------- Worker ----------
    def _worker_loop(self) -> None:
        last_index: Optional[int] = None
        while not self._worker_stop.is_set():
            with self._lock:
                robot = self._robot
                frequency_hz = self._active_frequency_hz
            if robot is None:
                break
            try:
                frame = robot.wait_next_frame(
                    last_frame_index=last_index,
                    timeout=max(0.5, 2.0 / max(frequency_hz, 1.0)),
                )
                skipped = 0 if last_index is None else max(0, int(frame.frame_index) - int(last_index) - 1)
                last_index = frame.frame_index
                with self._lock:
                    self._last_frame = frame
                    self._recent_frame_monotonic.append(frame.received_monotonic_s)
                    self._consumer_skipped_frames += skipped
                    self._append_history_locked(frame)
                    self._record_frame_locked(frame)
            except TimeoutError:
                continue
            except Exception as exc:
                with self._lock:
                    self._last_error = f"{type(exc).__name__}: {exc}"
                    self._running = False
                    self._worker_stop.set()
                    self._last_frame = self._current_frame() or self._last_frame
                    self._log("error", f"Worker stopped: {self._last_error}")
                break

    # ---------- History and payload ----------
    def _rebuild_history_structures(self) -> None:
        self._history_joint_deg = [deque(maxlen=self._history_maxlen) for _ in range(6)]
        self._history_joint_vel_deg = [deque(maxlen=self._history_maxlen) for _ in range(6)]
        self._history_joint_current = [deque(maxlen=self._history_maxlen) for _ in range(6)]
        self._history_target_current = [deque(maxlen=self._history_maxlen) for _ in range(6)]
        self._history_current_window = [deque(maxlen=self._history_maxlen) for _ in range(6)]
        self._history_tcp_xyz_mm = [deque(maxlen=self._history_maxlen) for _ in range(3)]
        self._history_tcp_rpy_deg = [deque(maxlen=self._history_maxlen) for _ in range(3)]
        self._history_speed = deque(maxlen=self._history_maxlen)
        gp_numeric = {}
        for token in self.fields:
            if self._is_gp_numeric_token(token):
                gp_numeric[token] = deque(maxlen=self._history_maxlen)
        self._history_gp_numeric = gp_numeric

    def _clear_history(self) -> None:
        for group in [
            self._history_joint_deg,
            self._history_joint_vel_deg,
            self._history_joint_current,
            self._history_target_current,
            self._history_current_window,
            self._history_tcp_xyz_mm,
            self._history_tcp_rpy_deg,
        ]:
            for series in group:
                series.clear()
        self._history_speed.clear()
        for series in self._history_gp_numeric.values():
            series.clear()

    def _append_history_locked(self, frame: Any) -> None:
        frame_dict = frame.as_dict()
        robot_time_s = float(frame.robot_timestamp_s if frame.robot_timestamp_s is not None else frame.received_monotonic_s)
        if self._history_origin_robot_s is None:
            self._history_origin_robot_s = robot_time_s
        relative_t = robot_time_s - self._history_origin_robot_s

        sample_period = 1.0 / max(self.history_sample_hz, 1.0)
        if self._last_chart_sample_robot_s is not None and (robot_time_s - self._last_chart_sample_robot_s) < sample_period:
            return
        self._last_chart_sample_robot_s = robot_time_s

        if "actual_q" in frame_dict:
            for idx, value in enumerate(rad_to_deg(frame_dict["actual_q"])):
                self._history_joint_deg[idx].append([relative_t, float(value)])
        if "actual_qd" in frame_dict:
            for idx, value in enumerate(rad_to_deg(frame_dict["actual_qd"])):
                self._history_joint_vel_deg[idx].append([relative_t, float(value)])
        if "actual_current" in frame_dict:
            for idx, value in enumerate(frame_dict["actual_current"]):
                self._history_joint_current[idx].append([relative_t, float(value)])
        if "target_current" in frame_dict:
            for idx, value in enumerate(frame_dict["target_current"]):
                self._history_target_current[idx].append([relative_t, float(value)])
        if "actual_current_window" in frame_dict:
            for idx, value in enumerate(frame_dict["actual_current_window"]):
                self._history_current_window[idx].append([relative_t, float(value)])
        if "actual_TCP_pose" in frame_dict:
            x, y, z, rx, ry, rz = (float(item) for item in frame_dict["actual_TCP_pose"])
            xyz_mm = [x * 1000.0, y * 1000.0, z * 1000.0]
            rpy_deg = rad_to_deg(rotvec_to_rpy((rx, ry, rz)))
            for idx, value in enumerate(xyz_mm):
                self._history_tcp_xyz_mm[idx].append([relative_t, float(value)])
            for idx, value in enumerate(rpy_deg):
                self._history_tcp_rpy_deg[idx].append([relative_t, float(value)])
        if "speed_scaling" in frame_dict:
            self._history_speed.append([relative_t, float(frame_dict["speed_scaling"])])
        for token, series in self._history_gp_numeric.items():
            norm = normalize_token(token)
            if norm in frame_dict:
                try:
                    series.append([relative_t, float(frame_dict[norm])])
                except Exception:
                    pass

    def _snapshot_state(self, *, include_history: bool, include_events: bool) -> Dict[str, Any]:
        with self._lock:
            robot = self._robot
            reader_rates = robot.reader_rates() if robot is not None else {"arrival_hz": 0.0, "robot_hz": 0.0, "frame_index": 0.0}
            snapshot = {
                "frame": self._last_frame,
                "robot": robot,
                "host": self.host,
                "frequency_hz": self.frequency_hz,
                "active_frequency_hz": self._active_frequency_hz,
                "fields": list(self.fields),
                "history_seconds": self.history_seconds,
                "history_sample_hz": self.history_sample_hz,
                "robot_model": self.robot_model,
                "write_fields": self._writable_fields(),
                "controller_version": list(robot.controller_version) if robot is not None and robot.controller_version else None,
                "running": bool(self._running and robot is not None),
                "error": self._last_error,
                "started_at_monotonic": self._started_at_monotonic,
                "consumer_rate_hz": round(self._approx_rate_hz(), 2),
                "reader_rate_hz": round(float(reader_rates.get("arrival_hz", 0.0)), 2),
                "reader_robot_rate_hz": round(float(reader_rates.get("robot_hz", 0.0)), 2),
                "consumer_skipped_frames": int(self._consumer_skipped_frames),
                "start_attempts": list(self._last_start_attempts),
                "recording": {
                    "active": self._recording_active,
                    "rows": self._recording_rows,
                    "filename": self._recording_path.name if self._recording_path else None,
                    "download_url": f"/api/recordings/{self._recording_path.name}" if self._recording_path else None,
                },
                "export": {
                    "filename": self._latest_export_path.name if self._latest_export_path else None,
                    "download_url": f"/api/exports/{self._latest_export_path.name}" if self._latest_export_path else None,
                },
                "events": list(self._events) if include_events else [],
                "history": None,
            }
            if include_history:
                snapshot["history"] = {
                    "joint_deg": [list(series) for series in self._history_joint_deg],
                    "joint_vel_deg": [list(series) for series in self._history_joint_vel_deg],
                    "joint_current": [list(series) for series in self._history_joint_current],
                    "target_current": [list(series) for series in self._history_target_current],
                    "current_window": [list(series) for series in self._history_current_window],
                    "tcp_xyz_mm": [list(series) for series in self._history_tcp_xyz_mm],
                    "tcp_rpy_deg": [list(series) for series in self._history_tcp_rpy_deg],
                    "speed": list(self._history_speed),
                    "gp_numeric": {name: list(series) for name, series in self._history_gp_numeric.items()},
                }
            return snapshot

    def _build_payload_from_snapshot(
        self,
        snapshot: Dict[str, Any],
        *,
        include_history: bool,
        include_events: bool,
        include_catalog: bool,
        include_latest: bool,
    ) -> Dict[str, Any]:
        frame = snapshot.get("frame")
        robot = snapshot.get("robot")
        frame_dict = frame.as_dict() if frame is not None else {}
        fields = list(snapshot.get("fields") or [])
        writable = set(snapshot.get("write_fields") or [])
        q_deg = rad_to_deg(frame_dict["actual_q"]) if "actual_q" in frame_dict else None
        tcp_mm = None
        tcp_rotvec_deg = None
        tcp_rpy_deg = None
        if "actual_TCP_pose" in frame_dict:
            x, y, z, rx, ry, rz = (float(item) for item in frame_dict["actual_TCP_pose"])
            tcp_mm = [x * 1000.0, y * 1000.0, z * 1000.0, rx, ry, rz]
            tcp_rotvec_deg = [x * 1000.0, y * 1000.0, z * 1000.0, *rad_to_deg((rx, ry, rz))]
            tcp_rpy_deg = [x * 1000.0, y * 1000.0, z * 1000.0, *rad_to_deg(rotvec_to_rpy((rx, ry, rz)))]

        rows: List[Dict[str, Any]] = []
        for token in fields:
            norm = normalize_token(token)
            access = "read/write" if token in writable else "read"
            direction = "input" if norm.startswith("input_") else "output"
            value = frame_dict.get(norm)
            if norm.startswith("input_") and token in writable and robot is not None:
                try:
                    value = robot.read(token, value)
                except Exception:
                    pass
            rows.append(
                {
                    "token": token,
                    "normalized": norm,
                    "value": _json_safe(value),
                    "formatted": _format_value(value),
                    "unit": self._unit_for(token, robot),
                    "writable": token in writable,
                    "access": access,
                    "direction": direction,
                    "help": FIELD_HELP.get(token, FIELD_HELP.get(norm, "")),
                }
            )

        status = {
            "running": bool(snapshot.get("running")),
            "host": snapshot.get("host"),
            "frequency_hz": snapshot.get("frequency_hz"),
            "active_frequency_hz": snapshot.get("active_frequency_hz"),
            "fields": fields,
            "robot_model": snapshot.get("robot_model"),
            "write_fields": list(snapshot.get("write_fields") or []),
            "controller_version": snapshot.get("controller_version"),
            "error": snapshot.get("error"),
            "frame_index": int(frame.frame_index) if frame is not None else None,
            "age_ms": round(frame.age_ms(), 2) if frame is not None else None,
            "uptime_s": round(max(0.0, time.monotonic() - snapshot.get("started_at_monotonic")), 1) if snapshot.get("started_at_monotonic") else 0.0,
            "approx_rate_hz": snapshot.get("reader_rate_hz", 0.0),
            "reader_rate_hz": snapshot.get("reader_rate_hz", 0.0),
            "robot_rate_hz": snapshot.get("reader_robot_rate_hz", 0.0),
            "consumer_rate_hz": snapshot.get("consumer_rate_hz", 0.0),
            "consumer_skipped_frames": snapshot.get("consumer_skipped_frames", 0),
            "start_attempts": snapshot.get("start_attempts", []),
            "field_count": len(fields),
            "write_count": len(snapshot.get("write_fields") or []),
        }

        latest = None
        if include_latest and frame is not None:
            latest = {
                "frame_index": frame.frame_index,
                "robot_timestamp_s": frame.robot_timestamp_s,
                "received_wall_time_s": frame.received_wall_time_s,
                "received_monotonic_s": frame.received_monotonic_s,
                "age_ms": round(frame.age_ms(), 2),
                "values": _json_safe(frame_dict),
                "rows": rows,
                "derived": {
                    "q_deg": _json_safe(q_deg),
                    "tcp_mm": _json_safe(tcp_mm),
                    "tcp_rotvec_deg": _json_safe(tcp_rotvec_deg),
                    "tcp_rpy_deg": _json_safe(tcp_rpy_deg),
                    "di_bits": _bits(frame_dict.get("actual_digital_input_bits", 0), 16),
                    "do_bits": _bits(frame_dict.get("actual_digital_output_bits", 0), 16),
                    "current_monitor": _json_safe(self._build_current_monitor(frame_dict)),
                },
            }

        history_payload = None
        history = snapshot.get("history") if include_history else None
        if history is not None:
            history_payload = {
                "joint_deg": [{"name": f"J{i+1}", "data": data} for i, data in enumerate(history.get("joint_deg", []))],
                "joint_vel_deg": [{"name": f"J{i+1}", "data": data} for i, data in enumerate(history.get("joint_vel_deg", []))],
                "joint_current": [{"name": f"J{i+1}", "data": data} for i, data in enumerate(history.get("joint_current", []))],
                "target_current": [{"name": f"J{i+1}", "data": data} for i, data in enumerate(history.get("target_current", []))],
                "current_window": [{"name": f"J{i+1}", "data": data} for i, data in enumerate(history.get("current_window", []))],
                "tcp_xyz_mm": [{"name": name, "data": data} for name, data in zip(["X", "Y", "Z"], history.get("tcp_xyz_mm", []))],
                "tcp_rpy_deg": [{"name": name, "data": data} for name, data in zip(["Roll", "Pitch", "Yaw"], history.get("tcp_rpy_deg", []))],
                "speed": [{"name": "Speed scaling", "data": history.get("speed", [])}],
                "gp_numeric": [{"name": name, "data": data} for name, data in (history.get("gp_numeric", {}) or {}).items()],
            }

        digital_twin = {
            "robot_model": snapshot.get("robot_model"),
            "has_q": "actual_q" in frame_dict,
            "has_tcp": "actual_TCP_pose" in frame_dict,
            "warning": None,
        }
        if "actual_q" not in frame_dict:
            digital_twin["warning"] = "Digital twin needs actual_q in ROBOT_FIELDS."
        elif "actual_TCP_pose" not in frame_dict:
            digital_twin["warning"] = "TCP overlay and TCP trail need actual_TCP_pose in ROBOT_FIELDS."

        return {
            "config": {
                "host": snapshot.get("host"),
                "frequency_hz": snapshot.get("frequency_hz"),
                "active_frequency_hz": snapshot.get("active_frequency_hz"),
                "fields": fields,
                "history_seconds": snapshot.get("history_seconds"),
                "history_sample_hz": snapshot.get("history_sample_hz"),
                "robot_model": snapshot.get("robot_model"),
            },
            "status": status,
            "latest": latest,
            "history": history_payload,
            "recording": snapshot.get("recording"),
            "export": snapshot.get("export"),
            "events": snapshot.get("events") if include_events else [],
            "catalog": self.catalog() if include_catalog else None,
            "digital_twin": digital_twin,
            "current_monitor": _json_safe(self._build_current_monitor(frame_dict)),
        }

    def _build_payload(
        self,
        frame: Any,
        *,
        include_history: bool = True,
        include_events: bool = True,
        include_catalog: bool = True,
    ) -> Dict[str, Any]:
        robot = self._robot
        frame_dict = frame.as_dict() if frame is not None else {}
        controller_version = robot.controller_version if robot is not None else None
        running = bool(self._running and robot is not None)
        latest_rows = self._build_rows(frame_dict)

        q_deg = rad_to_deg(frame_dict["actual_q"]) if "actual_q" in frame_dict else None
        tcp_mm = None
        tcp_rotvec_deg = None
        tcp_rpy_deg = None
        if "actual_TCP_pose" in frame_dict:
            x, y, z, rx, ry, rz = (float(item) for item in frame_dict["actual_TCP_pose"])
            tcp_mm = [x * 1000.0, y * 1000.0, z * 1000.0, rx, ry, rz]
            tcp_rotvec_deg = [x * 1000.0, y * 1000.0, z * 1000.0, *rad_to_deg((rx, ry, rz))]
            tcp_rpy_deg = [x * 1000.0, y * 1000.0, z * 1000.0, *rad_to_deg(rotvec_to_rpy((rx, ry, rz)))]

        status = {
            "running": running,
            "host": self.host,
            "frequency_hz": self.frequency_hz,
            "active_frequency_hz": self._active_frequency_hz,
            "fields": list(self.fields),
            "robot_model": self.robot_model,
            "write_fields": self._writable_fields(),
            "controller_version": list(controller_version) if controller_version else None,
            "error": self._last_error,
            "frame_index": int(frame.frame_index) if frame is not None else None,
            "age_ms": round(frame.age_ms(), 2) if frame is not None else None,
            "uptime_s": round(max(0.0, time.monotonic() - self._started_at_monotonic), 1) if self._started_at_monotonic else 0.0,
            "approx_rate_hz": round(self._approx_rate_hz(), 2),
            "start_attempts": list(self._last_start_attempts),
            "field_count": len(self.fields),
            "write_count": len(self._writable_fields()),
        }

        latest = None
        if frame is not None:
            latest = {
                "frame_index": frame.frame_index,
                "robot_timestamp_s": frame.robot_timestamp_s,
                "received_wall_time_s": frame.received_wall_time_s,
                "received_monotonic_s": frame.received_monotonic_s,
                "age_ms": round(frame.age_ms(), 2),
                "values": _json_safe(frame_dict),
                "rows": latest_rows,
                "derived": {
                    "q_deg": _json_safe(q_deg),
                    "tcp_mm": _json_safe(tcp_mm),
                    "tcp_rotvec_deg": _json_safe(tcp_rotvec_deg),
                    "tcp_rpy_deg": _json_safe(tcp_rpy_deg),
                    "di_bits": _bits(frame_dict.get("actual_digital_input_bits", 0), 16),
                    "do_bits": _bits(frame_dict.get("actual_digital_output_bits", 0), 16),
                    "current_monitor": _json_safe(self._build_current_monitor(frame_dict)),
                },
            }

        recording = {
            "active": self._recording_active,
            "rows": self._recording_rows,
            "filename": self._recording_path.name if self._recording_path else None,
            "download_url": f"/api/recordings/{self._recording_path.name}" if self._recording_path else None,
        }

        export_info = {
            "filename": self._latest_export_path.name if self._latest_export_path else None,
            "download_url": f"/api/exports/{self._latest_export_path.name}" if self._latest_export_path else None,
        }

        history = {
            "joint_deg": self._series_payload(self._history_joint_deg, [f"J{i+1}" for i in range(6)]),
            "joint_vel_deg": self._series_payload(self._history_joint_vel_deg, [f"J{i+1}" for i in range(6)]),
            "joint_current": self._series_payload(self._history_joint_current, [f"J{i+1}" for i in range(6)]),
            "target_current": self._series_payload(self._history_target_current, [f"J{i+1}" for i in range(6)]),
            "current_window": self._series_payload(self._history_current_window, [f"J{i+1}" for i in range(6)]),
            "tcp_xyz_mm": self._series_payload(self._history_tcp_xyz_mm, ["X", "Y", "Z"]),
            "tcp_rpy_deg": self._series_payload(self._history_tcp_rpy_deg, ["Roll", "Pitch", "Yaw"]),
            "speed": self._single_series_payload(self._history_speed, "Speed scaling"),
            "gp_numeric": [
                {"name": name, "data": list(series)} for name, series in self._history_gp_numeric.items()
            ],
        } if include_history else None

        digital_twin = {
            "robot_model": self.robot_model,
            "has_q": "actual_q" in frame_dict,
            "has_tcp": "actual_TCP_pose" in frame_dict,
            "warning": None,
        }
        if "actual_q" not in frame_dict:
            digital_twin["warning"] = "Digital twin needs actual_q in ROBOT_FIELDS."
        elif "actual_TCP_pose" not in frame_dict:
            digital_twin["warning"] = "TCP overlay and TCP trail need actual_TCP_pose in ROBOT_FIELDS."

        return {
            "config": {
                "host": self.host,
                "frequency_hz": self.frequency_hz,
                "active_frequency_hz": self._active_frequency_hz,
                "fields": list(self.fields),
                "history_seconds": self.history_seconds,
                "history_sample_hz": self.history_sample_hz,
                "robot_model": self.robot_model,
            },
            "status": status,
            "latest": latest,
            "history": history,
            "recording": recording,
            "export": export_info,
            "events": list(self._events) if include_events else [],
            "catalog": self.catalog() if include_catalog else None,
            "digital_twin": digital_twin,
            "current_monitor": _json_safe(self._build_current_monitor(frame_dict)),
        }

    @staticmethod
    def _vector6(frame_dict: Dict[str, Any], key: str) -> Optional[List[float]]:
        value = frame_dict.get(key)
        if not isinstance(value, (list, tuple)):
            return None
        try:
            values = [float(item) for item in value]
        except Exception:
            return None
        return values if len(values) >= 6 else None

    def _build_current_monitor(self, frame_dict: Dict[str, Any]) -> Dict[str, Any]:
        actual = self._vector6(frame_dict, "actual_current")
        target = self._vector6(frame_dict, "target_current")
        window = self._vector6(frame_dict, "actual_current_window")
        control = self._vector6(frame_dict, "joint_control_output")
        torque = self._vector6(frame_dict, "actual_current_as_torque")
        temp = self._vector6(frame_dict, "joint_temperatures")
        voltage = self._vector6(frame_dict, "actual_joint_voltage")
        joints: List[Dict[str, Any]] = []
        warn_count = 0
        exceed_count = 0
        ok_count = 0
        max_ratio = 0.0
        max_delta = 0.0
        for index in range(6):
            a = actual[index] if actual is not None else None
            t = target[index] if target is not None else None
            w = window[index] if window is not None else None
            lower = (t - w) if (t is not None and w is not None) else None
            upper = (t + w) if (t is not None and w is not None) else None
            delta = abs(a - t) if (a is not None and t is not None) else None
            ratio = (delta / w) if (delta is not None and w not in (None, 0.0)) else None
            if ratio is not None:
                max_ratio = max(max_ratio, float(ratio))
            if delta is not None:
                max_delta = max(max_delta, float(delta))
            if ratio is None:
                status = "unknown"
            elif ratio >= 1.0:
                status = "exceed"
                exceed_count += 1
            elif ratio >= 0.8:
                status = "warn"
                warn_count += 1
            else:
                status = "ok"
                ok_count += 1
            joints.append({
                "joint": f"J{index + 1}",
                "actual_current": a,
                "target_current": t,
                "actual_current_window": w,
                "joint_control_output": control[index] if control is not None else None,
                "actual_current_as_torque": torque[index] if torque is not None else None,
                "joint_temperature": temp[index] if temp is not None else None,
                "actual_joint_voltage": voltage[index] if voltage is not None else None,
                "lower_limit": lower,
                "upper_limit": upper,
                "delta": delta,
                "window_ratio": ratio,
                "status": status,
            })
        missing = []
        for key in ["actual_current", "target_current", "actual_current_window"]:
            if key not in frame_dict:
                missing.append(key)
        return {
            "available": {
                "actual_current": actual is not None,
                "target_current": target is not None,
                "actual_current_window": window is not None,
                "joint_control_output": control is not None,
                "actual_current_as_torque": torque is not None,
                "joint_temperatures": temp is not None,
                "actual_joint_voltage": voltage is not None,
                "safety_status": "safety_status" in frame_dict,
            },
            "message": None if not missing else ("Add these RTDE fields for current-window monitoring: " + ", ".join(missing)),
            "monitoring_note": "Monitoring aid only. Do not treat this panel as a certified safety function.",
            "safety_status": frame_dict.get("safety_status"),
            "runtime_state": frame_dict.get("runtime_state"),
            "summary": {
                "ok_count": ok_count,
                "warn_count": warn_count,
                "exceed_count": exceed_count,
                "max_window_ratio": max_ratio,
                "max_delta_a": max_delta,
            },
            "joints": joints,
        }

    def _build_live_payload(self, frame: Any) -> Dict[str, Any]:
        payload = self._build_payload(frame=frame, include_history=False, include_events=False, include_catalog=False)
        return {
            "status": payload["status"],
            "latest": payload["latest"],
            "recording": payload["recording"],
            "export": payload["export"],
            "digital_twin": payload["digital_twin"],
        }

    def _build_rows(self, frame_dict: Dict[str, Any]) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        robot = self._robot
        writable = set(self._writable_fields())
        for token in self.fields:
            norm = normalize_token(token)
            value = frame_dict.get(norm)
            unit = self._unit_for(token, robot)
            rows.append(
                {
                    "token": token,
                    "normalized": norm,
                    "value": _json_safe(value),
                    "formatted": _format_value(value),
                    "unit": unit,
                    "writable": token in writable,
                    "help": FIELD_HELP.get(token, FIELD_HELP.get(norm, "")),
                }
            )
        return rows

    @staticmethod
    def _series_payload(series_list: Sequence[Deque[List[float]]], names: Sequence[str]) -> List[Dict[str, Any]]:
        payload: List[Dict[str, Any]] = []
        for name, series in zip(names, series_list):
            payload.append({"name": name, "data": list(series)})
        return payload

    @staticmethod
    def _single_series_payload(series: Deque[List[float]], name: str) -> List[Dict[str, Any]]:
        return [{"name": name, "data": list(series)}]

    # ---------- Recording ----------
    def _start_recording_locked(self, label: Optional[str]) -> None:
        self._stop_recording_locked()
        stamp = datetime.now().strftime("rtde_%Y%m%d_%H%M%S")
        if label:
            stamp += f"_{_sanitize_label(label)}"
        path = self.recordings_dir / f"{stamp}.csv"
        handle = path.open("w", newline="", encoding="utf-8")
        writer = csv.writer(handle)
        writer.writerow(["frame_index", "robot_timestamp_s", "received_wall_time_s", *self.fields])
        self._recording_active = True
        self._recording_file = handle
        self._recording_writer = writer
        self._recording_path = path
        self._recording_rows = 0
        self._log("info", f"Recording started: {path.name}")

    def _stop_recording_locked(self) -> None:
        if self._recording_file is not None:
            try:
                self._recording_file.close()
            except Exception:
                pass
        if self._recording_active and self._recording_path is not None:
            self._log("info", f"Recording stopped: {self._recording_path.name} ({self._recording_rows} rows)")
        self._recording_active = False
        self._recording_file = None
        self._recording_writer = None

    def _record_frame_locked(self, frame: Any) -> None:
        if not self._recording_active or self._recording_writer is None:
            return
        frame_dict = frame.as_dict()
        row = [frame.frame_index, frame.robot_timestamp_s, frame.received_wall_time_s]
        for token in self.fields:
            norm = normalize_token(token)
            value = frame_dict.get(norm)
            if isinstance(value, (list, tuple, dict)):
                row.append(json.dumps(_json_safe(value), ensure_ascii=False))
            else:
                row.append(value)
        self._recording_writer.writerow(row)
        if self._recording_file is not None:
            self._recording_file.flush()
        self._recording_rows += 1

    # ---------- Helpers ----------
    def _current_frame(self) -> Any:
        robot = self._robot
        if robot is None:
            return None
        try:
            return robot.frame
        except Exception:
            return None

    def _writable_fields(self) -> List[str]:
        writable = []
        for token in self.fields:
            token = str(token).strip()
            norm = normalize_token(token)
            if norm.startswith("input_bit_register_") or norm.startswith("input_int_register_") or norm.startswith("input_double_register_"):
                writable.append(token)
        return writable

    @staticmethod
    def _is_gp_numeric_token(token: str) -> bool:
        norm = normalize_token(str(token).strip())
        return norm.startswith("input_int_register_") or norm.startswith("input_double_register_") or norm.startswith("output_int_register_") or norm.startswith("output_double_register_")

    @staticmethod
    def _coerce_write_value(token: str, value: Any) -> Any:
        norm = normalize_token(token.strip())
        if norm.startswith("input_bit_register_"):
            if isinstance(value, str):
                lowered = value.strip().lower()
                if lowered in {"1", "true", "on", "yes"}:
                    return True
                if lowered in {"0", "false", "off", "no"}:
                    return False
            return bool(value)
        if norm.startswith("input_int_register_"):
            return int(value)
        if norm.startswith("input_double_register_"):
            return float(value)
        return value

    @staticmethod
    def _unit_for(token: str, robot: Optional[UR_RTDE]) -> str:
        if robot is not None:
            try:
                return str(robot.unit_of(token))
            except Exception:
                pass
        norm = normalize_token(token)
        if norm.startswith("input_bit_register_") or norm.startswith("output_bit_register_"):
            return "bool"
        if norm.startswith("input_int_register_") or norm.startswith("output_int_register_"):
            return "int32"
        if norm.startswith("input_double_register_") or norm.startswith("output_double_register_"):
            return "double"
        return "n/a"

    def _approx_rate_hz(self) -> float:
        if len(self._recent_frame_monotonic) < 2:
            return 0.0
        span = self._recent_frame_monotonic[-1] - self._recent_frame_monotonic[0]
        if span <= 1e-9:
            return 0.0
        return (len(self._recent_frame_monotonic) - 1) / span

    def _log(self, level: str, message: str) -> None:
        self._events.append(
            {
                "time": datetime.now().strftime("%H:%M:%S"),
                "level": level,
                "message": message,
            }
        )
