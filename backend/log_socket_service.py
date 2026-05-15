"""Robot → backend log socket.

로봇/외부 장비가 TCP 클라이언트로 접속해서 라인 단위 로그를 흘려 보내는 서버.
줄(`\n` 종료)마다 1엔트리. JSON 줄이면 level/message 분리, 아니면 raw 텍스트.

ModbusService 와 동일한 스레딩 모델:
    - 백그라운드 스레드 한 개에서 socket.accept() 루프
    - 클라이언트마다 데몬 스레드 하나 (라인 reader)
    - asyncio 구독자는 subscribe() async generator 로 받음
    - cross-thread 전달은 loop.call_soon_threadsafe
"""
from __future__ import annotations

import asyncio
import json
import socket
import threading
import time
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import Any, AsyncIterator, Optional


_LEVEL_ALIASES = {
    "DEBUG": "debug", "DBG": "debug",
    "INFO": "info",
    "WARN": "warn", "WARNING": "warn",
    "ERR": "error", "ERROR": "error", "FATAL": "error", "CRIT": "error",
}


def _parse_line(raw: str) -> dict[str, Any]:
    """줄 하나를 logical entry 로 변환. JSON 이면 키 추출, 아니면 raw."""
    text = raw.rstrip("\r\n")
    entry: dict[str, Any] = {"raw": text, "level": "info", "message": text}
    s = text.strip()
    # JSON 후보면 시도. 실패하면 그냥 raw 로.
    if s.startswith("{") and s.endswith("}"):
        try:
            doc = json.loads(s)
        except Exception:
            return entry
        if isinstance(doc, dict):
            lvl = str(doc.get("level") or doc.get("severity") or "").upper()
            entry["level"] = _LEVEL_ALIASES.get(lvl, "info")
            msg = doc.get("message") or doc.get("msg") or doc.get("text")
            entry["message"] = str(msg) if msg is not None else text
            # 부가 키들은 그대로 노출 (tag, source 등)
            for k, v in doc.items():
                if k not in ("level", "severity", "message", "msg", "text"):
                    entry[k] = v
            return entry
    # 평문 → 'WARN xxx' / '[ERROR] xxx' 같은 흔한 패턴만 가볍게 잡아냄
    up = s.upper()
    for token, norm in _LEVEL_ALIASES.items():
        if up.startswith(token + " ") or up.startswith(f"[{token}]"):
            entry["level"] = norm
            break
    return entry


class LogSocketService:
    """TCP listener + ring buffer + asyncio fan-out."""

    def __init__(self, host: str, port: int, buffer_size: int = 5000):
        self.host = host
        self.port = int(port)
        self.buffer_size = int(buffer_size)

        self._buffer: deque[dict] = deque(maxlen=self.buffer_size)
        self._buffer_lock = threading.RLock()
        self._seq = 0  # 모노톤 증가 ID — 클라이언트가 since 로 폴링하지는 않지만 디버깅용

        # listening 상태
        self._server_sock: Optional[socket.socket] = None
        self._accept_thread: Optional[threading.Thread] = None
        self._stop = threading.Event()
        self._bind_error: Optional[str] = None

        # 연결된 로봇 클라이언트 메타
        self._clients: dict[int, dict] = {}  # cid -> {addr, connectedAt, lines}
        self._clients_lock = threading.RLock()
        self._next_cid = 1

        # asyncio.Queue 구독자 — 각자 본인 loop 가짐
        self._subs: list[tuple[asyncio.AbstractEventLoop, asyncio.Queue]] = []
        self._subs_lock = threading.RLock()

        # 캡처 (레코딩 사이드카) — RTDE 레코딩 시작 시 함께 열림.
        # JSONL: 한 줄 = 한 로그 엔트리 (이미 dict 형식이라 자연스러움).
        self._capture_file: Optional[Any] = None
        self._capture_path: Optional[Path] = None
        self._capture_rows = 0
        self._capture_lock = threading.RLock()

    # ── lifecycle ─────────────────────────────────────────────────────
    def start(self) -> None:
        if self._accept_thread and self._accept_thread.is_alive():
            return
        self._stop.clear()
        self._bind_error = None
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind((self.host, self.port))
            sock.listen(8)
            sock.settimeout(0.5)  # accept timeout → stop 체크
            self._server_sock = sock
        except OSError as exc:
            self._bind_error = f"bind {self.host}:{self.port} failed: {exc}"
            print(f"[log_socket] {self._bind_error}")
            self._server_sock = None
            return
        self._accept_thread = threading.Thread(
            target=self._accept_loop, name="log-socket-accept", daemon=True
        )
        self._accept_thread.start()
        print(f"[log_socket] listening on {self.host}:{self.port}")

    def shutdown(self) -> None:
        self._stop.set()
        if self._server_sock:
            try:
                self._server_sock.close()
            except Exception:
                pass
            self._server_sock = None
        if self._accept_thread:
            self._accept_thread.join(timeout=2.0)
            self._accept_thread = None
        with self._capture_lock:
            self._capture_stop_locked()

    def reconfigure(self, host: str, port: int, buffer_size: Optional[int] = None) -> dict:
        host = (host or "").strip()
        if not host:
            raise ValueError("host required")
        port = int(port)
        if not (0 < port < 65536):
            raise ValueError(f"invalid port {port}")
        self.shutdown()
        self.host = host
        self.port = port
        if buffer_size is not None and buffer_size > 0:
            with self._buffer_lock:
                self.buffer_size = int(buffer_size)
                new_buf: deque[dict] = deque(self._buffer, maxlen=self.buffer_size)
                self._buffer = new_buf
        self.start()
        return {
            "host": self.host,
            "port": self.port,
            "buffer_size": self.buffer_size,
            "listening": self._server_sock is not None,
            "bind_error": self._bind_error,
        }

    # ── accept loop ───────────────────────────────────────────────────
    def _accept_loop(self) -> None:
        sock = self._server_sock
        while not self._stop.is_set() and sock is not None:
            try:
                conn, addr = sock.accept()
            except socket.timeout:
                continue
            except OSError:
                # 소켓 닫힘 (shutdown)
                break
            except Exception as exc:
                print(f"[log_socket] accept error: {exc}")
                time.sleep(0.2)
                continue
            cid = self._register_client(conn, addr)
            t = threading.Thread(
                target=self._client_loop,
                args=(cid, conn, addr),
                name=f"log-socket-client-{cid}",
                daemon=True,
            )
            t.start()

    def _register_client(self, conn: socket.socket, addr) -> int:
        with self._clients_lock:
            cid = self._next_cid
            self._next_cid += 1
            self._clients[cid] = {
                "id": cid,
                "addr": f"{addr[0]}:{addr[1]}",
                "host": addr[0],
                "connectedAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "lines": 0,
            }
        self._emit_system(f"client connected · {addr[0]}:{addr[1]}", cid=cid, level="info")
        return cid

    def _unregister_client(self, cid: int, reason: str = "") -> None:
        with self._clients_lock:
            meta = self._clients.pop(cid, None)
        if meta:
            addr = meta.get("addr") or "?"
            tail = f" ({reason})" if reason else ""
            self._emit_system(f"client disconnected · {addr}{tail}", cid=cid, level="info")

    def _client_loop(self, cid: int, conn: socket.socket, addr) -> None:
        """한 클라이언트의 줄 단위 reader. UTF-8, errors=replace 로 관대하게."""
        buf = b""
        conn.settimeout(1.0)
        try:
            while not self._stop.is_set():
                try:
                    chunk = conn.recv(4096)
                except socket.timeout:
                    continue
                except (ConnectionResetError, OSError):
                    break
                if not chunk:
                    break
                buf += chunk
                while b"\n" in buf:
                    line, _, buf = buf.partition(b"\n")
                    text = line.decode("utf-8", errors="replace")
                    if not text.strip():
                        continue
                    self._ingest_line(cid, text)
        finally:
            try:
                conn.close()
            except Exception:
                pass
            self._unregister_client(cid, reason="closed")

    # ── ingestion + fan-out ───────────────────────────────────────────
    def _ingest_line(self, cid: int, raw: str) -> None:
        parsed = _parse_line(raw)
        entry = self._make_entry(
            source=f"client#{cid}",
            client_id=cid,
            **parsed,
        )
        with self._clients_lock:
            meta = self._clients.get(cid)
            if meta:
                meta["lines"] = meta.get("lines", 0) + 1
        self._publish(entry)

    def _emit_system(self, message: str, cid: Optional[int] = None, level: str = "info") -> None:
        """서버 측 시스템 이벤트 (접속/끊김/리셋 등) 를 같은 스트림에 섞어줌."""
        entry = self._make_entry(
            source="system",
            client_id=cid,
            level=level,
            message=message,
            raw=message,
            system=True,
        )
        self._publish(entry)

    def _make_entry(self, **kwargs) -> dict:
        with self._buffer_lock:
            self._seq += 1
            seq = self._seq
        entry = {
            "id": seq,
            "ts": time.time(),
            "time": datetime.now().strftime("%H:%M:%S.%f")[:-3],
            "date": datetime.now().strftime("%Y-%m-%d"),
        }
        entry.update(kwargs)
        return entry

    def _publish(self, entry: dict) -> None:
        with self._buffer_lock:
            self._buffer.append(entry)
        self._capture_write(entry)
        # asyncio 구독자들에게 fan-out (각자 자기 loop 에서 queue.put_nowait)
        with self._subs_lock:
            subs = list(self._subs)
        for loop, queue in subs:
            try:
                loop.call_soon_threadsafe(queue.put_nowait, entry)
            except RuntimeError:
                # loop 닫힘 — 다음 cleanup 에서 정리
                pass

    # ── public API ────────────────────────────────────────────────────
    def status(self) -> dict:
        with self._clients_lock:
            clients = list(self._clients.values())
        with self._buffer_lock:
            buffered = len(self._buffer)
        return {
            "host": self.host,
            "port": self.port,
            "listening": self._server_sock is not None and self._accept_thread is not None and self._accept_thread.is_alive(),
            "bind_error": self._bind_error,
            "buffer_size": self.buffer_size,
            "buffered": buffered,
            "clients": clients,
            "client_count": len(clients),
            "total_seq": self._seq,
        }

    def recent(self, limit: int = 200, since_id: int = 0) -> list[dict]:
        with self._buffer_lock:
            snap = list(self._buffer)
        if since_id > 0:
            snap = [e for e in snap if e.get("id", 0) > since_id]
        if limit and len(snap) > limit:
            snap = snap[-limit:]
        return snap

    def clear(self) -> None:
        with self._buffer_lock:
            self._buffer.clear()
        self._emit_system("log buffer cleared", level="warn")

    # ── capture (레코딩 사이드카) ──────────────────────────────────────
    def start_capture(self, path: Path) -> dict:
        """RTDE 레코딩과 함께 로그 엔트리를 JSONL 로 저장 시작.
        실패해도 라이브 fan-out 은 계속 동작 — 캡처는 best-effort."""
        with self._capture_lock:
            self._capture_stop_locked()
            try:
                handle = Path(path).open("w", encoding="utf-8", newline="")
            except OSError as exc:
                return {"ok": False, "error": str(exc)}
            self._capture_file = handle
            self._capture_path = Path(path)
            self._capture_rows = 0
        # 캡처 시작/종료를 같은 스트림에 시스템 이벤트로 마크 (분석 시 시간 기준점)
        self._emit_system(f"capture started · {Path(path).name}", level="info")
        return {"ok": True, "path": str(path)}

    def stop_capture(self) -> dict:
        self._emit_system("capture stopped", level="info")
        with self._capture_lock:
            path = self._capture_path
            rows = self._capture_rows
            self._capture_stop_locked()
            return {
                "ok": True,
                "path": str(path) if path else None,
                "rows": rows,
            }

    def _capture_stop_locked(self) -> None:
        if self._capture_file is not None:
            try:
                self._capture_file.close()
            except Exception:
                pass
        self._capture_file = None
        self._capture_path = None
        self._capture_rows = 0

    def _capture_write(self, entry: dict) -> None:
        with self._capture_lock:
            fh = self._capture_file
            if fh is None:
                return
            try:
                fh.write(json.dumps(entry, ensure_ascii=False, default=str) + "\n")
                fh.flush()
                self._capture_rows += 1
            except Exception:
                pass

    async def subscribe(self) -> AsyncIterator[dict]:
        """async generator. 호출 시점의 ring buffer 를 먼저 흘려 보낸 뒤 라이브 스트림."""
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue = asyncio.Queue(maxsize=1024)
        with self._subs_lock:
            self._subs.append((loop, queue))
        try:
            # 초기 backlog
            for entry in self.recent(limit=self.buffer_size):
                yield entry
            while True:
                entry = await queue.get()
                yield entry
        finally:
            with self._subs_lock:
                self._subs = [(l, q) for (l, q) in self._subs if q is not queue]
