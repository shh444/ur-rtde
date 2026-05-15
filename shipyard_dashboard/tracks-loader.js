// Real-data loader for the analysis screen.
//
// 백엔드 /api/recordings/{name}/bundle 응답을 받아서 window.RTDE / window.TRACKS
// 두 전역을 덮어씀. 그 뒤 ScreenAnalysis 가 key 를 바꿔 VariantTracksFinal 을
// 재마운트 → 새 데이터로 다시 그림.
//
// bundle 형식 (shipyard_app.api_recordings_bundle 참조):
//   rtde:  { columns: [...], data: {col: [v,...]} }      // column-oriented
//   modbus: { present, items: [{tick, ts, welding{}, status{}, connected,...}, ...] }
//   logs:   { present, items: [{id, ts, time, level, source, message, system?, ...}, ...] }

(function () {
  const TIME_COLS = ['frame_index', 'robot_timestamp_s', 'received_wall_time_s'];

  function rangeOf(arr) {
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (typeof v !== 'number' || !isFinite(v)) continue;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    if (mn === Infinity) { mn = 0; mx = 1; }
    if (mn === mx) { mn -= 0.5; mx += 0.5; }
    return [mn, mx];
  }

  // 숫자/불리언/숫자형 문자열은 number 로 강제. 나머지는 null.
  function toNum(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'string' && v.trim() !== '' && !isNaN(parseFloat(v))) return parseFloat(v);
    return null;
  }

  // 단조 증가 (또는 시간처럼 누적되는) 컬럼인지 검사.
  function isMonotonicTime(arr) {
    if (!Array.isArray(arr) || arr.length < 2) return false;
    const first = Number(arr[0]);
    const last = Number(arr[arr.length - 1]);
    if (!isFinite(first) || !isFinite(last)) return false;
    return last > first;
  }

  // RTDE 시간축 구성. 사용 가능한 컬럼 순서대로 시도:
  //   received_wall_time_s → robot_timestamp_s → timer → timestamp → urTimestamp → index
  // 임포트한 외부 CSV 처럼 wall_time 이 없는 경우 timer / timestamp 같은 누적 컬럼을 X 로 사용.
  // 모두 없으면 row index 를 시간축으로 (단위 = 샘플).
  function buildRtdeTime(rtdeData) {
    const TIME_CANDIDATES = [
      'received_wall_time_s',
      'robot_timestamp_s',
      'timer',
      'timestamp',
      'urTimestamp',
      'time',
    ];
    for (const col of TIME_CANDIDATES) {
      const arr = rtdeData[col];
      if (!Array.isArray(arr) || arr.length === 0) continue;
      const nums = arr.map(v => Number(v));
      if (!isMonotonicTime(nums)) continue;
      const t0 = nums[0];
      return { t: nums.map(v => v - t0), origin: t0, source: col };
    }
    // fallback: row index (단위 = 샘플 인덱스, dt=1)
    const N = Object.values(rtdeData)[0]?.length || 0;
    return { t: Array.from({ length: N }, (_, i) => i), origin: 0, source: 'index' };
  }

  // Modbus items 를 columnar 로 평탄화. welding.* / status.* 키를 mb_* 로 통합.
  function buildModbus(items, origin) {
    if (!Array.isArray(items) || items.length === 0) {
      return { t: [], cols: [], samples: {}, ranges: {}, koLabels: {}, units: {}, categories: {}, hz: 0 };
    }
    // 1) 컬럼 셋 결정 — 모든 item 스캔
    const colSet = new Set();
    items.forEach(it => {
      if (it && typeof it === 'object') {
        const w = it.welding, s = it.status;
        if (w && typeof w === 'object') Object.keys(w).forEach(k => colSet.add('mb_' + k));
        if (s && typeof s === 'object') Object.keys(s).forEach(k => colSet.add('mb_' + k));
      }
    });
    const cols = Array.from(colSet);
    // 2) 시간축
    const t = items.map(it => (Number(it?.ts) || origin) - origin);
    // 3) 샘플
    const samples = {};
    cols.forEach(c => samples[c] = new Array(items.length).fill(null));
    items.forEach((it, i) => {
      const w = it?.welding || {};
      const s = it?.status || {};
      cols.forEach(c => {
        const key = c.slice(3); // strip 'mb_'
        let v = (key in w) ? w[key] : (key in s) ? s[key] : null;
        samples[c][i] = toNum(v);
      });
    });
    // 4) 범위
    const ranges = {};
    cols.forEach(c => ranges[c] = rangeOf(samples[c].filter(v => v != null)));
    // 5) hz 추정
    let hz = 0;
    if (t.length >= 2) {
      const dt = (t[t.length - 1] - t[0]) / (t.length - 1);
      hz = dt > 0 ? Math.max(0.1, Math.round(1 / dt)) : 0;
    }
    return { t, cols, samples, ranges, koLabels: {}, units: {}, categories: {}, hz };
  }

  // Log items 정규화 — level=sys 매핑, source 추출, msg/ts 통일.
  function buildLogs(items, origin) {
    if (!Array.isArray(items)) return [];
    const out = items.map((l, i) => {
      const isSys = !!l?.system;
      const lvl = String(l?.level || 'info').toLowerCase();
      const level = isSys ? 'sys' : (['debug', 'info', 'warn', 'error'].includes(lvl) ? lvl : 'info');
      const t = (Number(l?.ts) || origin) - origin;
      const source = l?.source || (l?.client_id != null ? `client#${l.client_id}` : 'unknown');
      const msg = l?.message != null ? String(l.message) : (l?.raw != null ? String(l.raw) : '');
      return { id: l?.id ?? i, t, level, source, msg };
    });
    out.sort((a, b) => a.t - b.t);
    return out;
  }

  // warn/error 가 14초 이내 연속이면 한 segment 로 묶음 (mock 과 동일 규칙)
  function buildSegments(logs) {
    const segments = [];
    for (const e of logs) {
      if (e.level !== 'warn' && e.level !== 'error') continue;
      const last = segments[segments.length - 1];
      if (last && (e.t - last.end) < 14 && (last.level === e.level || e.level === 'error')) {
        last.end = e.t;
        if (e.level === 'error') last.level = 'error';
        last.count = (last.count || 1) + 1;
      } else {
        segments.push({ start: e.t, end: e.t + 1.5, level: e.level, count: 1 });
      }
    }
    return segments;
  }

  function buildFromBundle(bundle, recordingMeta) {
    const rtdeBlock = bundle?.rtde || {};
    const rtdeData = rtdeBlock.data || {};
    const rtdeCols = (rtdeBlock.columns || Object.keys(rtdeData)).filter(c => !TIME_COLS.includes(c));

    // RTDE time
    const { t: rtdeT, origin: rtdeOrigin } = buildRtdeTime(rtdeData);
    const N = rtdeT.length;

    // RTDE samples + ranges (숫자 컬럼만)
    const samples = {};
    const ranges = {};
    const dataCols = [];
    for (const c of rtdeCols) {
      const arr = rtdeData[c];
      if (!Array.isArray(arr) || arr.length === 0) continue;
      // 첫 비-null 샘플이 숫자/숫자형이면 채택
      const probed = arr.map(toNum);
      if (probed.some(v => v != null)) {
        samples[c] = probed;
        ranges[c] = rangeOf(probed.filter(v => v != null));
        dataCols.push(c);
      }
    }

    // Modbus / Logs — 공통 시간원점은 RTDE origin
    const modbus = buildModbus(bundle?.modbus?.items || [], rtdeOrigin);
    const logs = buildLogs(bundle?.logs?.items || [], rtdeOrigin);

    // 추가로 modbus 가 RTDE 보다 일찍/늦게 시작한 경우 음수 t 가 나올 수 있음 — view 가
    // 0 부터 시작하므로 시각적으로 영향 미미. 다만 duration 은 최댓값을 써야 함.
    const lastRtde = rtdeT.length ? rtdeT[rtdeT.length - 1] : 0;
    const lastMb = modbus.t.length ? modbus.t[modbus.t.length - 1] : 0;
    const lastLog = logs.length ? logs[logs.length - 1].t : 0;
    const duration = Math.max(lastRtde, lastMb, lastLog, 1);

    // RTDE hz
    let rtdeHz = 0;
    if (rtdeT.length >= 2) {
      const dt = (rtdeT[rtdeT.length - 1] - rtdeT[0]) / (rtdeT.length - 1);
      rtdeHz = dt > 0 ? Math.max(0.1, Math.round(1 / dt)) : 0;
    }

    // Overwrite globals — VariantTracksFinal 재마운트 후 이걸 참조
    window.RTDE = {
      N,
      t: rtdeT,
      cols: dataCols,
      samples,
      ranges,
      koLabels: {},
      units: {},
      categories: {},
    };
    window.TRACKS = {
      rtde: {
        t: rtdeT, cols: dataCols, samples, ranges,
        koLabels: {}, units: {}, categories: {},
        hz: rtdeHz,
      },
      modbus,
      logs,
      segments: buildSegments(logs),
      duration,
      meta: {
        name: (recordingMeta?.filename || bundle?.name || '').replace(/\.csv$/i, '') || '—',
        block: recordingMeta?.block || '—',
        cell: recordingMeta?.cell || '—',
        path: recordingMeta?.path || '—',
        operator: recordingMeta?.operator || '—',
        durationSec: duration,
        samples: N,
        size: recordingMeta?.size || '',
        alarms: logs.filter(l => l.level === 'error' || l.level === 'warn').length,
      },
    };
  }

  async function loadRecording(filename, recordingMeta) {
    if (!filename) throw new Error('filename required');
    const url = `/api/recordings/${encodeURIComponent(filename)}/bundle`;
    const res = await fetch(url);
    if (!res.ok) {
      let detail = '';
      try { detail = await res.text(); } catch {}
      throw new Error(`bundle fetch failed: HTTP ${res.status}${detail ? ` · ${detail.slice(0, 200)}` : ''}`);
    }
    const bundle = await res.json();
    buildFromBundle(bundle, recordingMeta);
    return bundle;
  }

  window.TRACKS_LOADER = { loadRecording, buildFromBundle };
})();
