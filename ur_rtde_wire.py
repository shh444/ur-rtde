from __future__ import annotations

import socket
import struct
import threading
import time
from typing import Any, List, Optional, Sequence, Tuple

PKT_REQUEST_PROTOCOL_VERSION = 86   # 'V'
PKT_GET_URCONTROL_VERSION = 118     # 'v'
PKT_TEXT_MESSAGE = 77               # 'M'
PKT_DATA_PACKAGE = 85               # 'U'
PKT_CONTROL_SETUP_OUTPUTS = 79      # 'O'
PKT_CONTROL_SETUP_INPUTS = 73       # 'I'
PKT_CONTROL_START = 83              # 'S'
PKT_CONTROL_PAUSE = 80              # 'P'

RTDE_PORT = 30004


class RTDEError(Exception):
    pass


def _be_u16(value: int) -> bytes:
    return struct.pack(">H", value)


def _be_u8(value: int) -> bytes:
    return struct.pack(">B", value)


def _be_f64(value: float) -> bytes:
    return struct.pack(">d", value)


def _recv_exact(sock: socket.socket, size: int) -> bytes:
    data = b""
    while len(data) < size:
        chunk = sock.recv(size - len(data))
        if not chunk:
            raise RTDEError("socket closed")
        data += chunk
    return data


def decode_text_message_v2(payload: bytes) -> Tuple[str, str, int]:
    try:
        message_len = payload[0]
        message = payload[1:1 + message_len].decode("ascii", "ignore")
        offset = 1 + message_len
        source_len = payload[offset]
        offset += 1
        source = payload[offset:offset + source_len].decode("ascii", "ignore")
        offset += source_len
        level = payload[offset] if offset < len(payload) else 0
        return message, source, level
    except Exception:
        return "", "", 0


def unpack_values(types: Sequence[str], payload: bytes) -> List[Any]:
    values: List[Any] = []
    offset = 0
    for type_name in types:
        if type_name == "DOUBLE":
            (value,) = struct.unpack_from(">d", payload, offset)
            offset += 8
            values.append(value)
        elif type_name == "UINT64":
            (value,) = struct.unpack_from(">Q", payload, offset)
            offset += 8
            values.append(value)
        elif type_name == "UINT32":
            (value,) = struct.unpack_from(">I", payload, offset)
            offset += 4
            values.append(value)
        elif type_name == "INT32":
            (value,) = struct.unpack_from(">i", payload, offset)
            offset += 4
            values.append(value)
        elif type_name == "UINT8":
            (value,) = struct.unpack_from(">B", payload, offset)
            offset += 1
            values.append(value)
        elif type_name == "BOOL":
            (value,) = struct.unpack_from(">B", payload, offset)
            offset += 1
            values.append(bool(value))
        elif type_name == "VECTOR3D":
            values.append(list(struct.unpack_from(">3d", payload, offset)))
            offset += 24
        elif type_name == "VECTOR6D":
            values.append(list(struct.unpack_from(">6d", payload, offset)))
            offset += 48
        elif type_name == "VECTOR6INT32":
            values.append(list(struct.unpack_from(">6i", payload, offset)))
            offset += 24
        elif type_name == "VECTOR6UINT32":
            values.append(list(struct.unpack_from(">6I", payload, offset)))
            offset += 24
        else:
            raise RTDEError(f"unknown type token: {type_name}")
    return values


def pack_values(types: Sequence[str], values: Sequence[Any]) -> bytes:
    if len(types) != len(values):
        raise RTDEError(f"type/value count mismatch: {len(types)} != {len(values)}")

    chunks: List[bytes] = []
    for type_name, value in zip(types, values):
        if type_name == "DOUBLE":
            chunks.append(struct.pack(">d", float(value)))
        elif type_name == "UINT64":
            chunks.append(struct.pack(">Q", int(value)))
        elif type_name == "UINT32":
            chunks.append(struct.pack(">I", int(value)))
        elif type_name == "INT32":
            chunks.append(struct.pack(">i", int(value)))
        elif type_name == "UINT8":
            chunks.append(struct.pack(">B", int(value)))
        elif type_name == "BOOL":
            chunks.append(struct.pack(">B", 1 if bool(value) else 0))
        elif type_name == "VECTOR3D":
            items = list(value)
            if len(items) != 3:
                raise RTDEError(f"{type_name} expects 3 items")
            chunks.append(struct.pack(">3d", *[float(item) for item in items]))
        elif type_name == "VECTOR6D":
            items = list(value)
            if len(items) != 6:
                raise RTDEError(f"{type_name} expects 6 items")
            chunks.append(struct.pack(">6d", *[float(item) for item in items]))
        elif type_name == "VECTOR6INT32":
            items = list(value)
            if len(items) != 6:
                raise RTDEError(f"{type_name} expects 6 items")
            chunks.append(struct.pack(">6i", *[int(item) for item in items]))
        elif type_name == "VECTOR6UINT32":
            items = list(value)
            if len(items) != 6:
                raise RTDEError(f"{type_name} expects 6 items")
            chunks.append(struct.pack(">6I", *[int(item) for item in items]))
        else:
            raise RTDEError(f"unknown type token: {type_name}")
    return b"".join(chunks)


class RTDEConnection:
    """Minimal RTDE v2 connection helper.

    One instance owns one TCP socket. The caller decides how many output and input
    recipes to configure, but this helper intentionally stays thin.
    """

    def __init__(self, host: str, port: int = RTDE_PORT, timeout: float = 2.0):
        self.host = host
        self.port = port
        self.timeout = float(timeout)
        self.sock: Optional[socket.socket] = None
        self.protocol_version = 2
        self._send_lock = threading.Lock()

    def connect(self) -> None:
        if self.sock is not None:
            return
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(self.timeout)
        sock.connect((self.host, self.port))
        self.sock = sock

    def close(self) -> None:
        if self.sock is None:
            return
        try:
            self.send_packet(PKT_CONTROL_PAUSE, b"")
            self.recv_packet()
        except Exception:
            pass
        try:
            self.sock.close()
        finally:
            self.sock = None

    def send_packet(self, packet_type: int, payload: bytes) -> None:
        if self.sock is None:
            raise RTDEError("not connected")
        packet = _be_u16(3 + len(payload)) + _be_u8(packet_type) + payload
        with self._send_lock:
            self.sock.sendall(packet)

    def recv_packet(self) -> Tuple[int, bytes]:
        if self.sock is None:
            raise RTDEError("not connected")
        header = _recv_exact(self.sock, 3)
        size = struct.unpack_from(">H", header, 0)[0]
        packet_type = header[2]
        payload = _recv_exact(self.sock, size - 3) if size > 3 else b""
        return packet_type, payload

    def request_protocol_version(self, version: int = 2) -> bool:
        self.send_packet(PKT_REQUEST_PROTOCOL_VERSION, _be_u16(version))
        packet_type, payload = self.recv_packet()
        if packet_type != PKT_REQUEST_PROTOCOL_VERSION:
            raise RTDEError("unexpected reply to REQUEST_PROTOCOL_VERSION")
        accepted = payload[:1] == b"\x01"
        if accepted:
            self.protocol_version = version
        return accepted

    def get_controller_version(self) -> Tuple[int, int, int, int]:
        self.send_packet(PKT_GET_URCONTROL_VERSION, b"")
        packet_type, payload = self.recv_packet()
        if packet_type != PKT_GET_URCONTROL_VERSION:
            raise RTDEError("unexpected reply to GET_URCONTROL_VERSION")
        return struct.unpack(">4I", payload)

    def setup_outputs_v2(self, frequency_hz: float, names: Sequence[str]) -> Tuple[int, List[str]]:
        names_csv = ",".join(names).encode("ascii")
        payload = _be_f64(float(frequency_hz)) + names_csv
        self.send_packet(PKT_CONTROL_SETUP_OUTPUTS, payload)
        packet_type, response = self.recv_packet()
        if packet_type != PKT_CONTROL_SETUP_OUTPUTS:
            raise RTDEError("unexpected reply to SETUP_OUTPUTS")
        recipe_id = response[0]
        types_csv = response[1:].decode("ascii", errors="ignore")
        types = [item.strip() for item in types_csv.split(",") if item.strip()]
        if recipe_id == 0:
            raise RTDEError(f"SETUP_OUTPUTS failed: {types_csv}")
        return recipe_id, types

    def setup_inputs(self, names: Sequence[str]) -> Tuple[int, List[str]]:
        names_csv = ",".join(names).encode("ascii")
        self.send_packet(PKT_CONTROL_SETUP_INPUTS, names_csv)
        packet_type, response = self.recv_packet()
        if packet_type != PKT_CONTROL_SETUP_INPUTS:
            raise RTDEError("unexpected reply to SETUP_INPUTS")
        recipe_id = response[0]
        types_csv = response[1:].decode("ascii", errors="ignore")
        types = [item.strip() for item in types_csv.split(",") if item.strip()]
        if recipe_id == 0:
            raise RTDEError(f"SETUP_INPUTS failed: {types_csv}")
        return recipe_id, types

    def start(self, print_text_messages: bool = True, timeout_s: float = 1.0) -> bool:
        self.send_packet(PKT_CONTROL_START, b"")
        started_at = time.time()
        while True:
            packet_type, payload = self.recv_packet()
            if packet_type == PKT_TEXT_MESSAGE:
                if print_text_messages:
                    message, source, level = decode_text_message_v2(payload)
                    print(f"[RTDE TEXT_MESSAGE] lvl={level} src={source} msg={message}")
                if time.time() - started_at > timeout_s:
                    raise RTDEError("START timed out after only TEXT_MESSAGE packets")
                continue
            if packet_type != PKT_CONTROL_START:
                raise RTDEError(f"unexpected reply to START: {packet_type}")
            return bool(payload and payload[0] == 1)

    def pause(self) -> bool:
        self.send_packet(PKT_CONTROL_PAUSE, b"")
        packet_type, payload = self.recv_packet()
        if packet_type != PKT_CONTROL_PAUSE:
            raise RTDEError("unexpected reply to PAUSE")
        return bool(payload and payload[0] == 1)

    def recv_data_package(self) -> Tuple[int, bytes]:
        while True:
            packet_type, payload = self.recv_packet()
            if packet_type == PKT_DATA_PACKAGE:
                return payload[0], payload[1:]
            if packet_type == PKT_TEXT_MESSAGE:
                message, source, level = decode_text_message_v2(payload)
                print(f"[RTDE TEXT_MESSAGE] lvl={level} src={source} msg={message}")
                continue
            raise RTDEError(f"unexpected packet while waiting for DATA_PACKAGE: {packet_type}")

    def send_data_package(self, recipe_id: int, raw_values: bytes) -> None:
        self.send_packet(PKT_DATA_PACKAGE, _be_u8(recipe_id) + raw_values)
