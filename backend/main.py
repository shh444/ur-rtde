from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

try:
    from .models import ConfigRequest, RecordingRequest, SnapshotExportRequest, WriteRequest
    from .service import DashboardService
    from .settings import (
        DEFAULT_FIELDS,
        DEFAULT_FREQUENCY_HZ,
        DEFAULT_HISTORY_SAMPLE_HZ,
        DEFAULT_HISTORY_SECONDS,
        DEFAULT_HOST,
        DEFAULT_LIVE_PUSH_HZ,
        DEFAULT_ROBOT_MODEL,
        DEFAULT_UI_HOST,
        DEFAULT_UI_PORT,
        DEFAULT_WS_PUSH_HZ,
    )
except ImportError:
    from models import ConfigRequest, RecordingRequest, SnapshotExportRequest, WriteRequest
    from service import DashboardService
    from settings import (
        DEFAULT_FIELDS,
        DEFAULT_FREQUENCY_HZ,
        DEFAULT_HISTORY_SAMPLE_HZ,
        DEFAULT_HISTORY_SECONDS,
        DEFAULT_HOST,
        DEFAULT_LIVE_PUSH_HZ,
        DEFAULT_ROBOT_MODEL,
        DEFAULT_UI_HOST,
        DEFAULT_UI_PORT,
        DEFAULT_WS_PUSH_HZ,
    )

ROOT = Path(__file__).resolve().parent
FRONTEND_DIR = ROOT.parent / "frontend"
APP_PUSH_HZ = DEFAULT_WS_PUSH_HZ
APP_LIVE_PUSH_HZ = DEFAULT_LIVE_PUSH_HZ

service = DashboardService(
    base_dir=ROOT,
    host=DEFAULT_HOST,
    frequency_hz=DEFAULT_FREQUENCY_HZ,
    fields=DEFAULT_FIELDS,
    history_seconds=DEFAULT_HISTORY_SECONDS,
    history_sample_hz=DEFAULT_HISTORY_SAMPLE_HZ,
    robot_model=DEFAULT_ROBOT_MODEL,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        yield
    finally:
        service.shutdown()


app = FastAPI(title="UR RTDE Dashboard Studio", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")
app.mount("/robot_assets", StaticFiles(directory=ROOT.parent / "robot_assets"), name="robot_assets")


@app.get("/")
def index() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/api/catalog")
def api_catalog():
    return service.catalog()


@app.get("/api/state")
def api_state():
    return service.state()


@app.post("/api/start")
def api_start():
    return service.start()


@app.post("/api/stop")
def api_stop():
    return service.stop()


@app.post("/api/restart")
def api_restart():
    return service.restart()


@app.post("/api/config")
def api_config(request: ConfigRequest):
    return service.update_config(
        frequency_hz=request.frequency_hz,
        fields=request.fields,
        history_seconds=request.history_seconds,
        history_sample_hz=request.history_sample_hz,
        robot_model=request.robot_model,
        restart_if_running=request.restart_if_running,
    )


@app.post("/api/write")
def api_write(request: WriteRequest):
    return service.write(request.field, request.value)


@app.post("/api/recording/start")
def api_recording_start(request: RecordingRequest):
    return service.start_recording(label=request.label)


@app.post("/api/recording/stop")
def api_recording_stop():
    return service.stop_recording()


@app.post("/api/export/snapshot")
def api_export_snapshot(request: SnapshotExportRequest):
    return service.export_snapshot(label=request.label)


@app.get("/api/recordings/{filename}")
def api_recording_download(filename: str) -> FileResponse:
    path = service.recordings_dir / filename
    return FileResponse(path, filename=filename)


@app.get("/api/exports/{filename}")
def api_export_download(filename: str) -> FileResponse:
    path = service.exports_dir / filename
    return FileResponse(path, filename=filename)


@app.websocket("/ws/stream")
async def ws_stream(websocket: WebSocket):
    await websocket.accept()
    interval = 1.0 / max(APP_PUSH_HZ, 1.0)
    try:
        while True:
            await websocket.send_json(service.chart_state())
            await asyncio.sleep(interval)
    except WebSocketDisconnect:
        return


@app.websocket("/ws/live")
async def ws_live(websocket: WebSocket):
    await websocket.accept()
    interval = 1.0 / max(APP_LIVE_PUSH_HZ, 1.0)
    try:
        while True:
            await websocket.send_json(service.live_state())
            await asyncio.sleep(interval)
    except WebSocketDisconnect:
        return


if __name__ == "__main__":
    uvicorn.run(app, host=DEFAULT_UI_HOST, port=DEFAULT_UI_PORT, log_level="info")
