"""Standalone FastAPI app for the shipyard welding dashboard.

기존 backend/main.py 는 레거시 frontend/ 까지 같이 띄우는 통합 앱.
이 모듈은 shipyard_dashboard 전용 슬림 앱이고 별도 포트(`SHIPYARD_PORT`)로 뜸.

붙어있는 백엔드:
  - ModbusService : 펜던트/로봇/용접기 Modbus 라이브 (128~255 + 258+)
  - DashboardService : RTDE 라이브 + 레코딩 CSV 저장
  - gp_mapping.yaml : 단순 파일 read/write (PyYAML 의존 안함)
"""
from __future__ import annotations

import asyncio
import csv
import json
import re
import time
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

try:
    from .modbus_service import ModbusService
    from .service import DashboardService
    from .db import get_db
    from .settings import (
        DEFAULT_FIELDS,
        DEFAULT_FREQUENCY_HZ,
        DEFAULT_HISTORY_SAMPLE_HZ,
        DEFAULT_HISTORY_SECONDS,
        DEFAULT_HOST,
        DEFAULT_LIVE_PUSH_HZ,
        DEFAULT_MODBUS_HOST,
        DEFAULT_MODBUS_POLL_HZ,
        DEFAULT_ROBOT_MODEL,
        DEFAULT_WS_PUSH_HZ,
    )
except ImportError:
    from modbus_service import ModbusService
    from service import DashboardService
    from db import get_db
    from settings import (
        DEFAULT_FIELDS,
        DEFAULT_FREQUENCY_HZ,
        DEFAULT_HISTORY_SAMPLE_HZ,
        DEFAULT_HISTORY_SECONDS,
        DEFAULT_HOST,
        DEFAULT_LIVE_PUSH_HZ,
        DEFAULT_MODBUS_HOST,
        DEFAULT_MODBUS_POLL_HZ,
        DEFAULT_ROBOT_MODEL,
        DEFAULT_WS_PUSH_HZ,
    )

ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parent
SHIPYARD_DIR = PROJECT_ROOT / "shipyard_dashboard"
MAPPING_PATH = PROJECT_ROOT / "gp_mapping.json"
MODBUS_REGISTERS_PATH = PROJECT_ROOT / "modbus_registers.json"
# 보안 환경용 — 외부에서 CSV 를 이 폴더에 떨궈두면 UI 에서 골라서 import 가능.
CSVS_DIR = PROJECT_ROOT / "csvs"
CSVS_DIR.mkdir(exist_ok=True)

# ── gp_mapping.json 로딩 ─────────────────────────────────────────────
# 파일 책임 분리:
#   - app_config.py : 호스트 / 모드버스 호스트 (런타임엔 모니터링 ConnectionBar 가 덮어씀)
#   - gp_mapping.json : RTDE GP 레지스터 → 컬럼명 매핑 + 옵션으로 frequency
# IP/host 는 이 파일에서 다루지 않음 — 모니터링에서 입력한 IP 가 RTDE/Modbus 양쪽에 동시 적용.
def _load_gp_mapping(path: Path) -> dict:
    """returns {"frequency": float|None,
                "aliases": {raw_register: friendly_col, ...}}"""
    result = {"frequency": None, "aliases": {}}
    if not path.exists():
        return result
    try:
        with path.open("r", encoding="utf-8") as fh:
            doc = json.load(fh) or {}
    except Exception as exc:
        print(f"[gp_mapping] parse failed, falling back to defaults: {exc}")
        return result

    freq = doc.get("frequency")
    if isinstance(freq, (int, float)) and freq > 0:
        result["frequency"] = float(freq)

    mapping_list = doc.get("mapping") or []
    if isinstance(mapping_list, list):
        for entry in mapping_list:
            if not isinstance(entry, dict):
                continue
            reg = entry.get("register")
            col = entry.get("col")
            if isinstance(reg, str) and isinstance(col, str) and reg.strip() and col.strip():
                result["aliases"][reg.strip()] = col.strip()
    return result


_gp_cfg = _load_gp_mapping(MAPPING_PATH)

# frequency 우선순위: gp_mapping.json > app_config.py
_rtde_freq = _gp_cfg["frequency"] or DEFAULT_FREQUENCY_HZ

print(
    f"[gp_mapping] aliases={len(_gp_cfg['aliases'])} fields applied · "
    f"freq={_rtde_freq}Hz · host={DEFAULT_HOST} (런타임 변경 가능)"
)

# ── Services ─────────────────────────────────────────────────────────
service = DashboardService(
    base_dir=ROOT,
    host=DEFAULT_HOST,
    frequency_hz=_rtde_freq,
    fields=DEFAULT_FIELDS,
    history_seconds=DEFAULT_HISTORY_SECONDS,
    history_sample_hz=DEFAULT_HISTORY_SAMPLE_HZ,
    robot_model=DEFAULT_ROBOT_MODEL,
    field_aliases=_gp_cfg["aliases"],
)
modbus = ModbusService(host=DEFAULT_MODBUS_HOST, poll_hz=DEFAULT_MODBUS_POLL_HZ)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # DB 초기화 + 디스크의 기존 CSV (사이드카 포함) 를 DB 로 sync.
    # 이미 DB 에 있는 filename 은 건너뛰므로 재실행 안전. 실패해도 앱은 계속 띄움.
    try:
        db = get_db(ROOT)
        result = db.sync_disk(service.recordings_dir, sidecar_loader=_read_sidecar)
        print(f"[db] sync: +{result['added']} added, {result['skipped']} skipped")
    except Exception as exc:
        print(f"[db] init/sync failed (CSV 만 사용): {exc}")
    modbus.start()
    # RTDE 도 자동 시작. 로봇 미연결이면 백오프 재연결을 service 가 알아서 처리.
    # 이게 빠져 있으면 라이브 레코딩 시 프레임 0개 캡처되어 빈 CSV/DB row 가 생김.
    try:
        service.start()
    except Exception as exc:
        print(f"[rtde] start failed (수동 /api/rtde/start 필요): {exc}")
    try:
        yield
    finally:
        modbus.shutdown()
        service.shutdown()


app = FastAPI(title="Shipyard Welding Dashboard", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Static mount (shipyard_dashboard at /) ───────────────────────────
if not SHIPYARD_DIR.exists():
    raise RuntimeError(f"shipyard_dashboard 디렉터리를 찾을 수 없습니다: {SHIPYARD_DIR}")

app.mount("/ui", StaticFiles(directory=SHIPYARD_DIR, html=True), name="shipyard")


@app.get("/")
def index() -> FileResponse:
    return FileResponse(SHIPYARD_DIR / "index.html")


@app.get("/favicon.ico")
def favicon() -> Response:
    # 정적 파비콘이 없으므로 204 로 조용히 끝냄 (로그 404 노이즈 방지)
    return Response(status_code=204)


# 정적 파일은 /ui 에 마운트되지만, index.html이 같은 디렉터리의 형제 파일을
# `<script src="data.js">` 처럼 상대경로로 부른다. 그래서 루트 직속 파일도 노출.
@app.get("/{filename}")
def root_static(filename: str):
    # 파일명 sanity: 슬래시·.. 차단
    if "/" in filename or "\\" in filename or filename.startswith(".."):
        raise HTTPException(404)
    p = SHIPYARD_DIR / filename
    if not p.exists() or not p.is_file():
        raise HTTPException(404)
    return FileResponse(p)


# ── Modbus ───────────────────────────────────────────────────────────
@app.get("/api/modbus/snapshot")
def api_modbus_snapshot():
    return modbus.snapshot()


class ModbusConfigRequest(BaseModel):
    host: str
    port: Optional[int] = 502
    poll_hz: Optional[float] = None


@app.post("/api/modbus/config")
def api_modbus_config(req: ModbusConfigRequest):
    """런타임에 로봇 IP / Modbus 포트 변경. 같은 IP 를 RTDE 에도 동시 적용.
    즉 이 한 엔드포인트가 "로봇 connection control 의 단일 진입점" 역할."""
    try:
        result = modbus.reconfigure(req.host, req.port or 502, req.poll_hz)
    except Exception as exc:
        raise HTTPException(400, f"modbus reconfigure failed: {exc}")
    # RTDE 도 같은 호스트로 재구성 (실패는 warning 만 — modbus 는 이미 적용됨)
    rtde_result = None
    try:
        rtde_result = service.reconfigure_host(req.host)
    except Exception as exc:
        print(f"[modbus_config] RTDE host sync failed: {exc}")
    return {"ok": True, "modbus": result, "rtde": rtde_result is not None}


@app.websocket("/ws/modbus")
async def ws_modbus(websocket: WebSocket):
    await websocket.accept()
    try:
        async for snap in modbus.subscribe():
            await websocket.send_json(snap)
    except WebSocketDisconnect:
        return


# ── RTDE state + chart streams ───────────────────────────────────────
@app.get("/api/state")
def api_state():
    return service.state()


@app.post("/api/rtde/start")
def api_rtde_start():
    return service.start()


@app.post("/api/rtde/stop")
def api_rtde_stop():
    return service.stop()


@app.websocket("/ws/stream")
async def ws_stream(websocket: WebSocket):
    await websocket.accept()
    interval = 1.0 / max(DEFAULT_WS_PUSH_HZ, 1.0)
    try:
        while True:
            await websocket.send_json(service.chart_state())
            await asyncio.sleep(interval)
    except WebSocketDisconnect:
        return


@app.websocket("/ws/live")
async def ws_live(websocket: WebSocket):
    await websocket.accept()
    interval = 1.0 / max(DEFAULT_LIVE_PUSH_HZ, 1.0)
    try:
        while True:
            await websocket.send_json(service.live_state())
            await asyncio.sleep(interval)
    except WebSocketDisconnect:
        return


# ── Recordings ───────────────────────────────────────────────────────
class RecordingStartRequest(BaseModel):
    label: Optional[str] = None
    # 신규 (조선소 워크플로):
    name: Optional[str] = None       # 파일명에 반영되는 식별자
    cell: Optional[str] = None
    weld_on: Optional[str] = None    # "예"/"아니오"/"" 등 자유 텍스트
    note: Optional[str] = None
    # 레거시 호환 (기존 클라이언트):
    block: Optional[str] = None
    path: Optional[str] = None
    operator: Optional[str] = None


_FILENAME_TS_RE = re.compile(r"(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})")


def _parse_filename_ts(stem: str) -> Optional[str]:
    m = _FILENAME_TS_RE.search(stem)
    if not m:
        return None
    return f"{m.group(1)}-{m.group(2)}-{m.group(3)} {m.group(4)}:{m.group(5)}:{m.group(6)}"


def _format_bytes(n: int) -> str:
    units = ["B", "KB", "MB", "GB"]
    f = float(n)
    for u in units:
        if f < 1024 or u == "GB":
            return f"{f:.1f} {u}" if u != "B" else f"{int(f)} {u}"
        f /= 1024
    return f"{f:.1f} GB"


def _count_csv_rows(path: Path) -> int:
    """Cheap row count: count newlines minus header. Avoids loading whole file."""
    try:
        with path.open("rb") as fh:
            total = sum(1 for _ in fh)
        return max(0, total - 1)
    except Exception:
        return 0


def _sidecar_path(csv_path: Path) -> Path:
    return csv_path.with_suffix(".meta.json")


def _read_sidecar(csv_path: Path) -> dict:
    sp = _sidecar_path(csv_path)
    if not sp.exists():
        return {}
    try:
        return json.loads(sp.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _write_sidecar(csv_path: Path, data: dict) -> None:
    _sidecar_path(csv_path).write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )


@app.get("/api/recordings")
def api_recordings_list():
    """레코딩 목록. 1차 소스는 DB. DB 에 없는 디스크 CSV (sync 이후 새로 떨어진
    파일 등)는 fallback 으로 같이 보여줌. 응답 포맷은 기존과 호환."""
    items = []
    seen_filenames: set = set()

    # 1차: DB
    try:
        db = get_db(ROOT)
        for row in db.list_recordings():
            filename = row.get('filename') or ''
            seen_filenames.add(filename)
            csv_path = service.recordings_dir / filename
            size_bytes = int(row.get('size_bytes') or 0)
            if (not size_bytes) and csv_path.exists():
                try:
                    size_bytes = csv_path.stat().st_size
                except OSError:
                    size_bytes = 0
            items.append({
                "id": csv_path.stem if csv_path.suffix else filename,
                "filename": filename,
                "source": "db",
                "size": _format_bytes(size_bytes),
                "size_bytes": size_bytes,
                "samples": int(row.get('samples_count') or 0),
                "startedAt": row.get('started_at') or _parse_filename_ts(csv_path.stem) or "",
                "duration": int(row.get('duration_s') or 0),
                "name":     row.get('name') or row.get('block') or "",
                "cell":     row.get('cell') or "",
                "weld_on":  row.get('weld_on') or "",
                "block":    row.get('block') or "",
                "path":     row.get('path') or "",
                "operator": row.get('operator') or "",
                "alarms":   int(row.get('alarms') or 0),
                "note":     row.get('note') or "",
                "starred":  False,
                "imported": bool(row.get('imported')) or (row.get('origin') == 'imported'),
                "origin":   row.get('origin') or 'live',
            })
    except Exception as exc:
        print(f"[api_recordings_list] DB read failed, falling back to disk: {exc}")

    # 2차: 디스크에 있는데 DB 엔 없는 파일 (sync 이후 새로 들어온 거 등)
    for csv_path in sorted(service.recordings_dir.glob("*.csv")):
        if csv_path.name in seen_filenames:
            continue
        try:
            stat = csv_path.stat()
        except OSError:
            continue
        meta = _read_sidecar(csv_path)
        items.append({
            "id": csv_path.stem,
            "filename": csv_path.name,
            "source": "file",
            "size": _format_bytes(stat.st_size),
            "size_bytes": stat.st_size,
            "samples":  meta.get("samples") or _count_csv_rows(csv_path),
            "startedAt": meta.get("startedAt") or _parse_filename_ts(csv_path.stem) or "",
            "duration": meta.get("duration") or 0,
            "name":     meta.get("name") or meta.get("block") or "",
            "cell":     meta.get("cell") or "",
            "weld_on":  meta.get("weld_on") or "",
            "block":    meta.get("block") or "",
            "path":     meta.get("path") or "",
            "operator": meta.get("operator") or "",
            "alarms":   meta.get("alarms") or 0,
            "note":     meta.get("note") or "",
            "starred":  bool(meta.get("starred")),
            "imported": bool(meta.get("imported")),
            "origin":   "file",
        })

    items.sort(key=lambda x: x["startedAt"], reverse=True)
    return {"items": items}


@app.post("/api/recordings/start")
def api_recordings_start(req: RecordingStartRequest):
    # 새 워크플로: name 만 파일명에 사용. 빈 값이면 timestamp 만.
    # 레거시 클라이언트(block 전송)도 받아주되 name 우선.
    label_source = req.name or req.block or ""
    label = req.label or (_safe_filename_token(label_source) or None)
    state = service.start_recording(label=label)
    rec = state.get("recording", {}) if isinstance(state, dict) else {}
    rec_path_name = rec.get("path") or rec.get("filename")
    if rec_path_name:
        csv_path = service.recordings_dir / Path(rec_path_name).name
        # 사이드카 (CSV 안전망)
        _write_sidecar(csv_path, {
            "name": req.name or req.block or "",
            "cell": req.cell or "",
            "weld_on": req.weld_on or "",
            "note": req.note or "",
            "block": req.block or "",
            "path": req.path or "",
            "operator": req.operator or "",
            "alarms": 0,
            "startedAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "started_monotonic": time.monotonic(),
        })
        # DB 메타 — service.start_recording 이 이미 DB row 를 만들었으므로 그걸 update
        try:
            db = get_db(ROOT)
            db.update_meta_by_filename(
                csv_path.name,
                name=req.name or req.block or "",
                cell=req.cell or "",
                weld_on=req.weld_on or "",
                note=req.note or "",
                block=req.block or "",
                path=req.path or "",
                operator=req.operator or "",
            )
        except Exception as exc:
            print(f"[start] DB meta update failed: {exc}")
    return state


@app.post("/api/recordings/stop")
def api_recordings_stop():
    state = service.stop_recording()
    # 사이드카에 duration / samples 마무리 기록
    rec = state.get("recording", {}) if isinstance(state, dict) else {}
    rec_path_name = rec.get("path") or rec.get("filename") or rec.get("last_path")
    if rec_path_name:
        csv_path = service.recordings_dir / Path(rec_path_name).name
        if csv_path.exists():
            meta = _read_sidecar(csv_path)
            started = meta.get("started_monotonic")
            duration_s = 0
            if isinstance(started, (int, float)):
                duration_s = int(time.monotonic() - started)
                meta["duration"] = duration_s
            samples = _count_csv_rows(csv_path)
            meta["samples"] = samples
            ended_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            meta["endedAt"] = ended_at
            _write_sidecar(csv_path, meta)
            # DB 도 동기화 — service._stop_recording_locked 이 finalize 는 했지만
            # duration_s 는 그때 모르므로 여기서 보정.
            try:
                db = get_db(ROOT)
                size_bytes = csv_path.stat().st_size
                db.update_meta_by_filename(
                    csv_path.name,
                    duration_s=duration_s,
                    samples_count=samples,
                    ended_at=ended_at,
                    size_bytes=size_bytes,
                )
            except Exception as exc:
                print(f"[stop] DB meta update failed: {exc}")
    return state


@app.get("/api/recordings/{name}/meta")
def api_recordings_meta(name: str):
    # 1차: DB. 2차: 사이드카. 둘 다 없으면 404.
    try:
        db = get_db(ROOT)
        rec = db.get_recording_by_filename(name)
        if rec:
            # DB 컬럼 → 사이드카 키 매핑 (기존 클라이언트 호환)
            return {
                "name":     rec.get('name') or "",
                "cell":     rec.get('cell') or "",
                "weld_on":  rec.get('weld_on') or "",
                "note":     rec.get('note') or "",
                "block":    rec.get('block') or "",
                "path":     rec.get('path') or "",
                "operator": rec.get('operator') or "",
                "alarms":   int(rec.get('alarms') or 0),
                "samples":  int(rec.get('samples_count') or 0),
                "duration": int(rec.get('duration_s') or 0),
                "startedAt": rec.get('started_at') or "",
                "endedAt":   rec.get('ended_at') or "",
                "imported":  bool(rec.get('imported')) or (rec.get('origin') == 'imported'),
                "loadedFrom": rec.get('loaded_from') or "",
                "originalFilename": rec.get('original_filename') or "",
                "origin":    rec.get('origin') or 'live',
            }
    except Exception as exc:
        print(f"[meta] DB read failed: {exc}")

    csv_path = service.recordings_dir / name
    if not csv_path.exists():
        raise HTTPException(404, "recording not found")
    return _read_sidecar(csv_path)


@app.get("/api/recordings/{name}/data")
def api_recordings_data(name: str, max_rows: int = 0):
    """샘플 데이터. 1차: DB. 2차: CSV 파일 직접 파싱. max_rows=0 은 전체."""
    # 1차: DB
    try:
        db = get_db(ROOT)
        rec = db.get_recording_by_filename(name)
        if rec:
            cols_data = db.read_samples_as_columns(int(rec['id']), max_rows=max_rows)
            if cols_data['data'].get('frame_index'):
                return {"name": name, **cols_data}
            # DB 에 row 는 있는데 samples 가 비어있으면 → CSV fallback
    except Exception as exc:
        print(f"[data] DB read failed: {exc}")

    # 2차: CSV 파싱
    csv_path = service.recordings_dir / name
    if not csv_path.exists():
        raise HTTPException(404, "recording not found")
    columns: list[str] = []
    data: dict[str, list] = {}
    with csv_path.open("r", encoding="utf-8", newline="") as fh:
        reader = csv.reader(fh)
        for i, row in enumerate(reader):
            if i == 0:
                columns = row
                for c in columns:
                    data[c] = []
                continue
            if max_rows and i > max_rows:
                break
            for c, v in zip(columns, row):
                try:
                    data[c].append(float(v))
                except (TypeError, ValueError):
                    data[c].append(v)
    return {"name": name, "columns": columns, "data": data}


@app.get("/api/recordings/{name}/download")
def api_recordings_download(name: str) -> FileResponse:
    p = service.recordings_dir / name
    if not p.exists():
        raise HTTPException(404, "recording not found")
    return FileResponse(p, filename=name)


def _safe_filename_token(token: str) -> str:
    """파일명에 안전한 토큰만 통과. 한글/영문/숫자/일부 기호."""
    if not token:
        return ""
    cleaned = re.sub(r"[^\w가-힣\-]+", "_", token, flags=re.UNICODE)
    return cleaned.strip("_")[:60]


@app.get("/api/recordings/csvs/list")
def api_recordings_csvs_list():
    """csvs/ 폴더 내의 CSV 파일 목록. 파일명/크기/수정시각 반환.
    브라우저 업로드가 막힌 환경에서 외부 도구로 이 폴더에 CSV 떨궈둔 후 UI 에서 선택."""
    items = []
    for p in sorted(CSVS_DIR.glob("*.csv")):
        try:
            stat = p.stat()
        except OSError:
            continue
        items.append({
            "filename": p.name,
            "size": _format_bytes(stat.st_size),
            "size_bytes": stat.st_size,
            "mtime": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
        })
    items.sort(key=lambda x: x["mtime"], reverse=True)
    return {
        "items": items,
        "dir": str(CSVS_DIR),
    }


class RecordingLoadPathRequest(BaseModel):
    path: str
    name: Optional[str] = None
    cell: Optional[str] = None
    weld_on: Optional[str] = None
    note: Optional[str] = None
    copy: bool = True  # True=원본 유지하고 복사, False=원본 이동


@app.post("/api/recordings/load-path")
def api_recordings_load_path(req: RecordingLoadPathRequest):
    """서버 측 파일 시스템 경로에서 CSV 로드. 브라우저 업로드가 막힌 환경용.
    사용자가 입력한 절대/상대 경로의 CSV 를 recordings_dir 로 복사 후 사이드카 생성."""
    raw = (req.path or "").strip().strip('"').strip("'")
    if not raw:
        raise HTTPException(400, "경로가 비어있습니다")
    src = Path(raw).expanduser()
    if not src.is_absolute():
        # 상대경로면 프로젝트 루트 기준으로 해석
        src = (PROJECT_ROOT / src).resolve()
    if not src.exists():
        raise HTTPException(404, f"파일을 찾을 수 없음: {src}")
    if not src.is_file():
        raise HTTPException(400, f"파일이 아님 (디렉터리?): {src}")
    if src.suffix.lower() != ".csv":
        raise HTTPException(400, f"CSV 파일만 지원: {src.suffix}")

    # 새 파일명 생성. 충돌 방지를 위해 timestamp 사용.
    stamp = datetime.now().strftime("rtde_%Y%m%d_%H%M%S")
    name_token = _safe_filename_token(req.name or src.stem)
    suffix = f"_{name_token}" if name_token else "_loaded"
    target_name = f"{stamp}{suffix}.csv"
    target = service.recordings_dir / target_name

    # 같은 위치(recordings_dir) 안의 파일을 가리키면 복사 대신 사이드카만 추가
    try:
        same_dir = src.resolve().parent == service.recordings_dir.resolve()
    except Exception:
        same_dir = False

    if same_dir:
        target = src  # 원본 그대로 인식 + 사이드카만 작성
        target_name = src.name
    else:
        # 복사 또는 이동
        import shutil
        if req.copy:
            shutil.copy2(src, target)
        else:
            shutil.move(str(src), str(target))

    rows = _count_csv_rows(target)
    started_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    meta = {
        "name": req.name or src.stem,
        "cell": req.cell or "",
        "weld_on": req.weld_on or "",
        "note": req.note or "",
        "alarms": 0,
        "startedAt": started_at,
        "samples": rows,
        "imported": True,
        "loadedFrom": str(src),
        "originalFilename": src.name,
    }
    _write_sidecar(target, meta)

    # DB 에도 import — CSV 헤더의 컬럼명 그대로 (gp_mapping 미적용)
    try:
        db = get_db(ROOT)
        db.import_csv_file(
            target,
            origin='loaded',
            meta={
                'name': meta['name'],
                'cell': meta['cell'],
                'weld_on': meta['weld_on'],
                'note': meta['note'],
                'started_at': started_at,
                'imported': 1,
                'loaded_from': str(src),
                'original_filename': src.name,
            },
        )
    except Exception as exc:
        print(f"[load-path] DB import failed (CSV 만 사용): {exc}")

    return {
        "ok": True,
        "filename": target_name,
        "samples": rows,
        "size_bytes": target.stat().st_size,
        "loadedFrom": str(src),
    }


@app.post("/api/recordings/import")
async def api_recordings_import(
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
    cell: Optional[str] = Form(None),
    weld_on: Optional[str] = Form(None),
    note: Optional[str] = Form(None),
):
    """CSV 파일 업로드. recordings_dir 에 timestamp 기반 새 이름으로 저장하고
    사이드카 .meta.json 도 생성. 충돌 방지를 위해 원본 파일명은 안 씀."""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, "CSV 파일만 가능합니다 (.csv)")

    # 새 파일명: rtde_YYYYMMDD_HHMMSS_<name?>.csv
    stamp = datetime.now().strftime("rtde_%Y%m%d_%H%M%S")
    name_token = _safe_filename_token(name or "")
    suffix = f"_{name_token}" if name_token else "_imported"
    target_name = f"{stamp}{suffix}.csv"
    target = service.recordings_dir / target_name

    # 파일 저장
    content = await file.read()
    target.write_bytes(content)

    # 사이드카
    rows = _count_csv_rows(target)
    started_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    meta = {
        "name": name or "",
        "cell": cell or "",
        "weld_on": weld_on or "",
        "note": note or "",
        "alarms": 0,
        "startedAt": started_at,
        "samples": rows,
        "imported": True,
        "originalFilename": file.filename,
    }
    _write_sidecar(target, meta)

    # DB import — CSV 컬럼명 원본 그대로 (gp_mapping 미적용. 외부 CSV 는 자기 시스템의
    # 명명을 따르므로 우리가 매핑하면 오히려 망가뜨림)
    try:
        db = get_db(ROOT)
        db.import_csv_file(
            target,
            origin='imported',
            meta={
                'name': name or '',
                'cell': cell or '',
                'weld_on': weld_on or '',
                'note': note or '',
                'started_at': started_at,
                'imported': 1,
                'original_filename': file.filename or '',
            },
        )
    except Exception as exc:
        print(f"[import] DB import failed (CSV 만 사용): {exc}")

    return {
        "ok": True,
        "filename": target_name,
        "samples": rows,
        "size_bytes": target.stat().st_size,
    }


# ── GP mapping (YAML 라이트한 read/write) ─────────────────────────────
@app.get("/api/mapping", response_class=PlainTextResponse)
def api_mapping_get() -> str:
    if not MAPPING_PATH.exists():
        return ""
    return MAPPING_PATH.read_text(encoding="utf-8")


class MappingPostRequest(BaseModel):
    # 필드명은 backward-compat 으로 'yaml' 유지하되 내용은 JSON 텍스트 ('content' 도 허용).
    yaml: Optional[str] = None
    content: Optional[str] = None


@app.post("/api/mapping")
def api_mapping_post(req: MappingPostRequest):
    text = req.content if req.content is not None else (req.yaml or "")
    # JSON 유효성 + 구조 검사 — 깨진 텍스트가 들어가서 다음 부팅 때 조용히 매핑 0 으로
    # 떨어지는 사고 방지. mapping 필드는 있어야 하고 list 여야 함.
    try:
        parsed = json.loads(text)
    except Exception as exc:
        raise HTTPException(400, f"invalid JSON: {exc}")
    if not isinstance(parsed, dict):
        raise HTTPException(400, "expected JSON object (with 'mapping' array)")
    mapping_block = parsed.get("mapping")
    if not isinstance(mapping_block, list):
        raise HTTPException(400, "expected 'mapping' to be an array")
    MAPPING_PATH.write_text(text, encoding="utf-8")
    return {
        "saved": True,
        "bytes": len(text),
        "path": str(MAPPING_PATH),
        "mapping_count": len(mapping_block),
        "note": "변경사항은 서버 재시작 후 적용됩니다",
    }


@app.delete("/api/mapping")
def api_mapping_delete():
    """저장본 삭제. 파일이 없어도 OK 반환 (idempotent)."""
    if MAPPING_PATH.exists():
        MAPPING_PATH.unlink()
    return {"reset": True}


# ── Modbus register definitions (수정 가능한 스키마) ─────────────────
@app.get("/api/modbus/registers")
def api_modbus_registers_get():
    """저장된 modbus_registers.json 의 raw 텍스트와 saved 플래그.
    저장 안 됨이면 saved=False, text='' — 프론트엔드는 하드코딩 기본값 사용."""
    if not MODBUS_REGISTERS_PATH.exists():
        return {"saved": False, "text": "", "path": str(MODBUS_REGISTERS_PATH)}
    return {
        "saved": True,
        "text": MODBUS_REGISTERS_PATH.read_text(encoding="utf-8"),
        "path": str(MODBUS_REGISTERS_PATH),
    }


class ModbusRegistersPostRequest(BaseModel):
    text: str


@app.post("/api/modbus/registers")
def api_modbus_registers_post(req: ModbusRegistersPostRequest):
    """JSON 유효성 검사 후 저장. 페이지 새로고침 시 프론트엔드에 반영."""
    try:
        parsed = json.loads(req.text)
    except Exception as exc:
        raise HTTPException(400, f"invalid JSON: {exc}")
    if not isinstance(parsed, dict) or not isinstance(parsed.get("registers"), list):
        raise HTTPException(400, "expected object with 'registers' array")
    MODBUS_REGISTERS_PATH.write_text(req.text, encoding="utf-8")
    return {
        "saved": True,
        "bytes": len(req.text),
        "register_count": len(parsed["registers"]),
        "path": str(MODBUS_REGISTERS_PATH),
    }


@app.delete("/api/modbus/registers")
def api_modbus_registers_reset():
    """저장본 삭제. 다음 새로고침 때 하드코딩 기본값으로 돌아감."""
    if MODBUS_REGISTERS_PATH.exists():
        MODBUS_REGISTERS_PATH.unlink()
    return {"reset": True}
