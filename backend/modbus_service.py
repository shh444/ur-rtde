"""Modbus polling service.

Owns a single UniversalRobotsModbus client and polls it on a background
thread at MODBUS_POLL_HZ. The latest snapshot is kept in memory and pushed
to async subscribers (WebSocket handlers).

Threading model:
    - One background thread per service instance, sync pymodbus client.
    - asyncio subscribers register via subscribe() and consume via async
      generator. Cross-thread delivery uses loop.call_soon_threadsafe.
"""
from __future__ import annotations

import asyncio
import json
import threading
import time
import traceback
from pathlib import Path
from typing import Any, AsyncIterator, Optional

try:
    from .ur_modbus import UniversalRobotsModbus
except ImportError:  # when run as a flat module
    from ur_modbus import UniversalRobotsModbus


class ModbusService:
    def __init__(self, host: str, poll_hz: float = 4.0, port: int = 502):
        self.host = host
        self.port = port
        self.poll_hz = max(float(poll_hz), 0.5)

        self._client: Optional[UniversalRobotsModbus] = None
        self._client_lock = threading.RLock()

        self._snapshot: dict[str, Any] = {
            "connected": False,
            "host": host,
            "poll_hz": self.poll_hz,
            "tick": 0,
            "ts": 0.0,
            "welding": {},
            "status": {},
            "error": None,
        }
        self._snapshot_lock = threading.RLock()

        # asyncio.Queue per subscriber; protected by lock since accessed
        # from both the polling thread and the asyncio event loops.
        self._subs: list[tuple[asyncio.AbstractEventLoop, asyncio.Queue]] = []
        self._subs_lock = threading.RLock()

        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._tick = 0

        # 캡처 (레코딩 사이드카) — RTDE 레코딩 시작 시 같이 열고 닫음.
        # JSONL: 한 줄 = 한 폴링 tick 의 snapshot 사본. 파싱 단순/append 안전.
        self._capture_file: Optional[Any] = None
        self._capture_path: Optional[Path] = None
        self._capture_rows = 0
        self._capture_lock = threading.RLock()

    # ── lifecycle ────────────────────────────────────────────────────
    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run, name="modbus-poller", daemon=True
        )
        self._thread.start()

    def shutdown(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2.0)
        with self._client_lock:
            if self._client:
                try:
                    self._client.close()
                except Exception:
                    pass
                self._client = None
        with self._capture_lock:
            self._capture_stop_locked()

    def reconfigure(self, host: str, port: int = 502, poll_hz: Optional[float] = None) -> dict:
        """런타임에 호스트/포트를 바꾸고 폴링 스레드를 재기동. 즉시 적용.
        호출 직후 connect 성공/실패는 다음 폴링 사이클에 _snapshot 에 반영됨."""
        host = (host or "").strip()
        if not host:
            raise ValueError("host is required")
        port = int(port) if port else 502
        # 기존 스레드 정리
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2.0)
        self._thread = None
        with self._client_lock:
            if self._client:
                try:
                    self._client.close()
                except Exception:
                    pass
                self._client = None
        self.host = host
        self.port = port
        if poll_hz is not None:
            self.poll_hz = max(float(poll_hz), 0.5)
        with self._snapshot_lock:
            self._snapshot.update({
                "host": self.host,
                "poll_hz": self.poll_hz,
                "connected": False,
                "error": None,
                "welding": {},
                "status": {},
            })
        self._tick = 0
        self.start()
        return {
            "host": self.host,
            "port": self.port,
            "poll_hz": self.poll_hz,
        }

    # ── snapshot / subscribe ─────────────────────────────────────────
    def snapshot(self) -> dict[str, Any]:
        with self._snapshot_lock:
            return dict(self._snapshot)

    async def subscribe(self) -> AsyncIterator[dict[str, Any]]:
        """Async generator yielding each new snapshot as it's polled."""
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue = asyncio.Queue(maxsize=8)
        entry = (loop, queue)
        with self._subs_lock:
            self._subs.append(entry)
        # Seed with the current snapshot so the WS doesn't sit empty.
        await queue.put(self.snapshot())
        try:
            while True:
                yield await queue.get()
        finally:
            with self._subs_lock:
                try:
                    self._subs.remove(entry)
                except ValueError:
                    pass

    # ── internals ────────────────────────────────────────────────────
    def _ensure_client(self) -> Optional[UniversalRobotsModbus]:
        with self._client_lock:
            if self._client is None:
                try:
                    self._client = UniversalRobotsModbus(
                        self.host, port=self.port, verbose=False
                    )
                except Exception as exc:
                    self._snapshot_set_error(f"connect-init: {exc}")
                    return None
            return self._client

    def _drop_client(self) -> None:
        with self._client_lock:
            if self._client:
                try:
                    self._client.close()
                except Exception:
                    pass
                self._client = None

    def _snapshot_set_error(self, msg: str) -> None:
        with self._snapshot_lock:
            self._snapshot["connected"] = False
            self._snapshot["error"] = msg
            self._snapshot["ts"] = time.time()

    def _broadcast(self, snap: dict[str, Any]) -> None:
        with self._subs_lock:
            entries = list(self._subs)
        for loop, queue in entries:
            try:
                loop.call_soon_threadsafe(self._safe_put, queue, snap)
            except RuntimeError:
                # loop closed
                pass

    @staticmethod
    def _safe_put(queue: asyncio.Queue, snap: dict[str, Any]) -> None:
        if queue.full():
            try:
                queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
        queue.put_nowait(snap)

    def _run(self) -> None:
        interval = 1.0 / self.poll_hz
        backoff = 1.0
        while not self._stop.is_set():
            t0 = time.monotonic()
            try:
                client = self._ensure_client()
                if client is None:
                    time.sleep(min(backoff, 5.0))
                    backoff = min(backoff * 2, 5.0)
                    continue

                snap_data = client.snapshot()
                if not snap_data.get("connected"):
                    self._snapshot_set_error("modbus not connected")
                    self._drop_client()
                    time.sleep(min(backoff, 5.0))
                    backoff = min(backoff * 2, 5.0)
                    continue

                backoff = 1.0
                self._tick += 1
                with self._snapshot_lock:
                    self._snapshot.update({
                        "connected": True,
                        "error": None,
                        "tick": self._tick,
                        "ts": time.time(),
                        "welding": snap_data.get("welding", {}),
                        "status": snap_data.get("status", {}),
                    })
                    snap_copy = dict(self._snapshot)
                self._broadcast(snap_copy)
                self._capture_write(snap_copy)

            except Exception as exc:
                self._snapshot_set_error(f"poll: {exc}")
                traceback.print_exc()
                self._drop_client()
                time.sleep(min(backoff, 5.0))
                backoff = min(backoff * 2, 5.0)
                continue

            elapsed = time.monotonic() - t0
            sleep_for = interval - elapsed
            if sleep_for > 0:
                self._stop.wait(sleep_for)

    # ── capture (레코딩 사이드카) ──────────────────────────────────────
    def start_capture(self, path: Path) -> dict:
        """RTDE 레코딩과 함께 모드버스 폴링 결과를 JSONL 로 저장 시작.
        실패해도 폴링 스레드는 정상 동작 — 캡처는 best-effort."""
        with self._capture_lock:
            self._capture_stop_locked()
            try:
                handle = Path(path).open("w", encoding="utf-8", newline="")
            except OSError as exc:
                return {"ok": False, "error": str(exc)}
            self._capture_file = handle
            self._capture_path = Path(path)
            self._capture_rows = 0
            return {"ok": True, "path": str(path)}

    def stop_capture(self) -> dict:
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

    def _capture_write(self, snap: dict[str, Any]) -> None:
        """폴링 스레드에서 호출. 캡처 미활성이면 noop. I/O 실패 silent (다음 tick 재시도)."""
        with self._capture_lock:
            fh = self._capture_file
            if fh is None:
                return
            try:
                fh.write(json.dumps(snap, ensure_ascii=False, default=str) + "\n")
                fh.flush()
                self._capture_rows += 1
            except Exception:
                # 캡처가 메인 폴링을 절대 막지 않도록 silent 처리
                pass
