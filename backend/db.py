"""SQLite persistence — 레코딩 메타데이터 + 샘플 데이터.

설계 결정:
- 단일 파일 `backend/data/shipyard.db` (WAL 모드 → 라이브 쓰기 중에도 동시 읽기 OK)
- 2 테이블만:
    * `recordings`: 1 레코딩 = 1 행. 메타 + fields_json + origin('live'|'imported'|'loaded')
    * `samples`: 1 프레임 = 1 행. payload(JSON TEXT) 에 가변 채널 통째로
- 샘플 컬럼을 JSON 으로 잡은 이유: RTDE GP 레지스터 개수/이름 변경, Modbus 추가,
  외부 CSV 임포트(컬럼명 다름) 등을 ALTER TABLE 없이 흡수.
- 동시성: 단일 연결 + `check_same_thread=False` + RLock. 서비스 백그라운드 스레드가
  쓰고 FastAPI 핸들러가 읽는 구조면 충분. WAL 덕에 락 경합도 미미.
- 임포트 시 매핑 금지: gp_mapping.yaml 은 라이브 RTDE 한정. CSV import 는 원본
  컬럼명을 그대로 payload key 로 저장.
"""
from __future__ import annotations

import csv
import json
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

DB_FILENAME = "shipyard.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS recordings (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  filename          TEXT UNIQUE NOT NULL,
  name              TEXT,
  cell              TEXT,
  weld_on           TEXT,
  note              TEXT,
  block             TEXT,
  path              TEXT,
  operator          TEXT,
  started_at        TEXT,
  ended_at          TEXT,
  duration_s        INTEGER DEFAULT 0,
  samples_count     INTEGER DEFAULT 0,
  alarms            INTEGER DEFAULT 0,
  imported          INTEGER DEFAULT 0,
  loaded_from       TEXT,
  original_filename TEXT,
  fields_json       TEXT,
  origin            TEXT DEFAULT 'live',
  size_bytes        INTEGER DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS samples (
  recording_id INTEGER NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  frame_index  INTEGER NOT NULL,
  robot_ts_s   REAL,
  wall_ts_s    REAL,
  payload      TEXT NOT NULL,
  PRIMARY KEY (recording_id, frame_index)
);

CREATE INDEX IF NOT EXISTS idx_samples_rec ON samples(recording_id);
CREATE INDEX IF NOT EXISTS idx_recordings_started ON recordings(started_at);
"""


class ShipyardDB:
    """SQLite 단일 연결 + RLock. close() 는 보통 안 부르고 프로세스 종료에 맡김."""

    def __init__(self, db_path: Path):
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(
            str(db_path),
            check_same_thread=False,
            timeout=30.0,
        )
        self._conn.row_factory = sqlite3.Row
        self._lock = threading.RLock()
        with self._conn:
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA synchronous=NORMAL")
            self._conn.execute("PRAGMA foreign_keys=ON")
            self._conn.executescript(SCHEMA)

    @contextmanager
    def _tx(self):
        with self._lock:
            with self._conn:
                yield self._conn

    # ── recordings ────────────────────────────────────────────────────
    def start_recording(
        self,
        filename: str,
        started_at: str,
        fields: Optional[List[str]] = None,
        origin: str = 'live',
        **meta,
    ) -> int:
        """라이브/임포트 공통 진입점. filename 이 이미 있으면 그 행을 재사용한다 (idempotent
        하게 — sync_disk 등 재실행 케이스 안전)."""
        existing = self.get_recording_by_filename(filename)
        if existing:
            return int(existing['id'])
        fields_json = json.dumps(fields or [], ensure_ascii=False)
        with self._tx() as conn:
            cur = conn.execute(
                "INSERT INTO recordings (filename, started_at, fields_json, origin) "
                "VALUES (?, ?, ?, ?)",
                (filename, started_at, fields_json, origin),
            )
            rec_id = int(cur.lastrowid)
        if meta:
            self.update_meta(rec_id, **meta)
        return rec_id

    def finalize_recording(
        self,
        rec_id: int,
        ended_at: Optional[str],
        duration_s: int,
        samples_count: int,
        size_bytes: int = 0,
    ) -> None:
        with self._tx() as conn:
            conn.execute(
                "UPDATE recordings SET ended_at=?, duration_s=?, samples_count=?, size_bytes=? "
                "WHERE id=?",
                (ended_at, duration_s, samples_count, size_bytes, rec_id),
            )

    _META_FIELDS = {
        'name', 'cell', 'weld_on', 'note', 'block', 'path', 'operator',
        'imported', 'loaded_from', 'original_filename', 'alarms',
        'samples_count', 'duration_s', 'started_at', 'ended_at', 'origin',
        'size_bytes', 'fields_json',
    }

    def update_meta(self, rec_id: int, **meta) -> None:
        """부분 갱신. None 은 무시 (의도적 NULL 셋팅이 필요하면 직접 ""/0 사용)."""
        sets = [(k, v) for k, v in meta.items() if k in self._META_FIELDS and v is not None]
        if not sets:
            return
        clause = ", ".join(f"{k}=?" for k, _ in sets)
        values = [v for _, v in sets] + [rec_id]
        with self._tx() as conn:
            conn.execute(f"UPDATE recordings SET {clause} WHERE id=?", values)

    def update_meta_by_filename(self, filename: str, **meta) -> Optional[int]:
        rec = self.get_recording_by_filename(filename)
        if not rec:
            return None
        self.update_meta(int(rec['id']), **meta)
        return int(rec['id'])

    def get_recording_by_filename(self, filename: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM recordings WHERE filename=?", (filename,)
            ).fetchone()
        return dict(row) if row else None

    def get_recording_by_id(self, rec_id: int) -> Optional[Dict[str, Any]]:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM recordings WHERE id=?", (rec_id,)
            ).fetchone()
        return dict(row) if row else None

    def list_recordings(self) -> List[Dict[str, Any]]:
        # SQLite 에서 NULL 은 DESC 시 자동으로 마지막에 위치 — NULLS LAST 문법 불필요
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM recordings ORDER BY started_at DESC, id DESC"
            ).fetchall()
        return [dict(r) for r in rows]

    def delete_recording(self, rec_id: int) -> None:
        # samples 는 FK CASCADE 로 같이 삭제
        with self._tx() as conn:
            conn.execute("DELETE FROM recordings WHERE id=?", (rec_id,))

    def delete_recording_by_filename(self, filename: str) -> bool:
        rec = self.get_recording_by_filename(filename)
        if not rec:
            return False
        self.delete_recording(int(rec['id']))
        return True

    # ── samples ───────────────────────────────────────────────────────
    def append_samples(
        self,
        rec_id: int,
        samples: Iterable[Dict[str, Any]],
    ) -> int:
        """samples: [{'frame_index', 'robot_ts_s', 'wall_ts_s', 'payload': dict}].
        같은 (rec, frame_index) 가 들어오면 덮어씀 (REPLACE)."""
        rows = []
        for s in samples:
            payload_obj = s.get('payload', {}) or {}
            payload_str = json.dumps(payload_obj, ensure_ascii=False, default=_json_safe_default)
            rows.append((
                rec_id,
                int(s['frame_index']),
                s.get('robot_ts_s'),
                s.get('wall_ts_s'),
                payload_str,
            ))
        if not rows:
            return 0
        with self._tx() as conn:
            conn.executemany(
                "INSERT OR REPLACE INTO samples "
                "(recording_id, frame_index, robot_ts_s, wall_ts_s, payload) "
                "VALUES (?, ?, ?, ?, ?)",
                rows,
            )
        return len(rows)

    def count_samples(self, rec_id: int) -> int:
        with self._lock:
            row = self._conn.execute(
                "SELECT COUNT(*) AS n FROM samples WHERE recording_id=?", (rec_id,)
            ).fetchone()
        return int(row['n']) if row else 0

    def read_samples_as_columns(
        self,
        rec_id: int,
        max_rows: int = 0,
    ) -> Dict[str, Any]:
        """샘플 → column-oriented JSON. payload 의 모든 키를 누적해서 컬럼 리스트 구성.
        없는 row 에는 None 패딩. shipyard_app 의 기존 응답 포맷과 호환."""
        q = (
            "SELECT frame_index, robot_ts_s, wall_ts_s, payload "
            "FROM samples WHERE recording_id=? ORDER BY frame_index ASC"
        )
        params: tuple = (rec_id,)
        if max_rows and max_rows > 0:
            q += " LIMIT ?"
            params = (rec_id, int(max_rows))
        with self._lock:
            rows = self._conn.execute(q, params).fetchall()

        # 메타 컬럼 3개를 먼저, 그 뒤 payload 키들이 등장 순서로 누적
        columns: List[str] = ['frame_index', 'robot_timestamp_s', 'received_wall_time_s']
        data: Dict[str, list] = {c: [] for c in columns}
        seen = set(columns)

        for r in rows:
            payload = json.loads(r['payload']) if r['payload'] else {}
            current_count = len(data['frame_index'])
            for k in payload.keys():
                if k not in seen:
                    seen.add(k)
                    columns.append(k)
                    # 이전 row 들 만큼 None 패딩
                    data[k] = [None] * current_count
            data['frame_index'].append(r['frame_index'])
            data['robot_timestamp_s'].append(r['robot_ts_s'])
            data['received_wall_time_s'].append(r['wall_ts_s'])
            for c in columns[3:]:
                data[c].append(payload.get(c))
        return {"columns": columns, "data": data}

    # ── CSV 임포트 / 디스크 sync ──────────────────────────────────────
    def import_csv_file(
        self,
        csv_path: Path,
        filename: Optional[str] = None,
        origin: str = 'imported',
        meta: Optional[Dict[str, Any]] = None,
    ) -> int:
        """CSV 파일을 읽어 DB 에 등록. 헤더의 컬럼명은 변경 없이 payload key 로 들어감
        (gp_mapping 미적용). 이미 같은 filename 으로 등록된 게 있으면 그걸 재사용하고
        samples 는 덮어씀."""
        filename = filename or csv_path.name
        meta = dict(meta or {})

        # frame_index / robot_timestamp_s / received_wall_time_s 는 메타 컬럼으로 분리,
        # 그 외 모든 헤더는 payload 에 담는다.
        rows_buffer: List[Dict[str, Any]] = []
        header: List[str] = []
        samples_count = 0
        with csv_path.open('r', encoding='utf-8', newline='') as fh:
            reader = csv.reader(fh)
            for i, row in enumerate(reader):
                if i == 0:
                    header = list(row)
                    continue
                payload: Dict[str, Any] = {}
                frame_idx = None
                robot_ts = None
                wall_ts = None
                for col, raw in zip(header, row):
                    val: Any = raw
                    try:
                        val = float(raw)
                    except (TypeError, ValueError):
                        pass
                    if col == 'frame_index':
                        try: frame_idx = int(raw)
                        except (TypeError, ValueError): pass
                    elif col == 'robot_timestamp_s':
                        robot_ts = val if isinstance(val, (int, float)) else None
                    elif col == 'received_wall_time_s':
                        wall_ts = val if isinstance(val, (int, float)) else None
                    else:
                        payload[col] = val
                if frame_idx is None:
                    frame_idx = i - 1  # 헤더 빼고 0부터
                rows_buffer.append({
                    'frame_index': frame_idx,
                    'robot_ts_s': robot_ts,
                    'wall_ts_s': wall_ts,
                    'payload': payload,
                })
                samples_count += 1

        # 헤더에서 메타 3컬럼 제외한 게 진짜 채널 리스트
        channel_fields = [c for c in header
                          if c not in ('frame_index', 'robot_timestamp_s', 'received_wall_time_s')]

        started_at = meta.get('started_at') or _filename_to_started_at(filename) or ''
        rec_id = self.start_recording(
            filename=filename,
            started_at=started_at,
            fields=channel_fields,
            origin=origin,
        )
        # 메타 (CSV 임포트 직후 기본 메타가 있으면)
        if meta:
            self.update_meta(rec_id, **meta)

        # 기존 샘플 있으면 비우고 다시 채움 (재임포트 안전)
        with self._tx() as conn:
            conn.execute("DELETE FROM samples WHERE recording_id=?", (rec_id,))
        # 큰 파일 대비 청크로 insert
        CHUNK = 1000
        for i in range(0, len(rows_buffer), CHUNK):
            self.append_samples(rec_id, rows_buffer[i:i+CHUNK])

        size_bytes = csv_path.stat().st_size if csv_path.exists() else 0
        self.finalize_recording(
            rec_id=rec_id,
            ended_at=None,
            duration_s=meta.get('duration_s') or 0,
            samples_count=samples_count,
            size_bytes=size_bytes,
        )
        return rec_id

    def sync_disk(
        self,
        recordings_dir: Path,
        sidecar_loader=None,  # callable(csv_path) -> dict | None
    ) -> Dict[str, int]:
        """디렉터리의 *.csv 중 DB 에 아직 없는 걸 자동 임포트. 사이드카(.meta.json) 가
        있으면 그 메타도 같이 채움. 앱 시작 시 한 번 호출."""
        added = 0
        skipped = 0
        for csv_path in sorted(recordings_dir.glob("*.csv")):
            if self.get_recording_by_filename(csv_path.name):
                skipped += 1
                continue
            meta = {}
            if sidecar_loader:
                try:
                    side = sidecar_loader(csv_path) or {}
                    if isinstance(side, dict):
                        meta = _sidecar_to_meta(side)
                except Exception:
                    meta = {}
            try:
                self.import_csv_file(csv_path, origin=meta.pop('origin', 'imported'), meta=meta)
                added += 1
            except Exception:
                # 깨진 CSV 하나가 startup 전체를 막지 않도록 swallow
                skipped += 1
        return {"added": added, "skipped": skipped}

    def close(self) -> None:
        with self._lock:
            self._conn.close()


# ── helpers ───────────────────────────────────────────────────────────
def _json_safe_default(o: Any):
    """payload 안에 list/dict/ndarray-ish 가 들어오면 그대로 dump 못 하는 케이스 처리."""
    if hasattr(o, 'tolist'):
        return o.tolist()
    return str(o)


def _filename_to_started_at(filename: str) -> Optional[str]:
    """rtde_YYYYMMDD_HHMMSS_*.csv → 'YYYY-MM-DD HH:MM:SS' 추출 (실패 시 None)."""
    import re
    m = re.search(r"(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})", filename)
    if not m:
        return None
    return f"{m.group(1)}-{m.group(2)}-{m.group(3)} {m.group(4)}:{m.group(5)}:{m.group(6)}"


def _sidecar_to_meta(side: Dict[str, Any]) -> Dict[str, Any]:
    """기존 .meta.json 의 키를 DB 컬럼명에 매핑."""
    out: Dict[str, Any] = {}
    for k in ('name', 'cell', 'weld_on', 'note', 'block', 'path', 'operator',
              'alarms', 'loadedFrom', 'originalFilename', 'imported',
              'startedAt', 'endedAt', 'duration', 'samples'):
        if k in side and side[k] is not None:
            # 사이드카 키 → DB 컬럼명 매핑
            db_key = {
                'loadedFrom': 'loaded_from',
                'originalFilename': 'original_filename',
                'startedAt': 'started_at',
                'endedAt': 'ended_at',
                'duration': 'duration_s',
                'samples': 'samples_count',
            }.get(k, k)
            out[db_key] = side[k]
    if side.get('imported'):
        out['origin'] = 'imported'
    return out


# ── Module-level singleton (lazy) ─────────────────────────────────────
_db_instance: Optional[ShipyardDB] = None
_db_lock = threading.Lock()


def get_db(base_dir: Optional[Path] = None) -> ShipyardDB:
    """최초 호출 시 base_dir 필수. 이후 인자 무시. 단일 프로세스/단일 DB 가정."""
    global _db_instance
    if _db_instance is not None:
        return _db_instance
    with _db_lock:
        if _db_instance is None:
            if base_dir is None:
                raise RuntimeError("get_db: 최초 호출엔 base_dir 가 필요합니다")
            data_dir = base_dir / "data"
            _db_instance = ShipyardDB(data_dir / DB_FILENAME)
    return _db_instance
