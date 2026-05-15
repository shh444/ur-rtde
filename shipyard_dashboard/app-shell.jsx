// App shell: top chrome + left sidebar nav + main screen area.
// Manages global recording state (recording / stopped) and currently
// open recording (for the Analysis screen).

const NAV = [
  { id: 'monitoring', label: '실시간 모니터링', sub: 'Modbus TCP',   icon: '◉' },
  { id: 'rtde',       label: 'RTDE 실시간',     sub: 'GP + 자세',    icon: '◈' },
  { id: 'recordings', label: '레코딩',           sub: 'RTDE',         icon: '▭' },
  { id: 'analysis',   label: '분석 워크스페이스', sub: '사후 차트',     icon: '⟁' },
  { id: 'logs',       label: '로봇 로그',         sub: 'TCP Socket',   icon: '≡' },
  { id: 'mapping',    label: 'GP 매핑',          sub: 'JSON',         icon: '⌥' },
];

// Offline fallback library — only used when /api/recordings is unreachable.
// Production data comes from backend (DashboardService.recordings_dir + sidecar .meta.json).
const RECORDING_LIBRARY_FALLBACK = [
  {
    id: 'rec_001',
    name: 'REC_2026-05-13_0937.csv',
    block: 'BH-12',
    cell: 'VL2',
    path: '2/3',
    operator: '김재성',
    startedAt: '2026-05-13 09:37:21',
    duration: 598,
    samples: 74750,
    size: '4.2 MB',
    alarms: 6,
    source: 'file',
    note: '필렛 용접 · 2F 멀티패스 중간 정지 발생',
    starred: true,
  },
  {
    id: 'rec_002',
    name: 'REC_2026-05-13_0813.csv',
    block: 'BH-12',
    cell: 'VL1',
    path: '1/2',
    operator: '김재성',
    startedAt: '2026-05-13 08:13:44',
    duration: 412,
    samples: 51500,
    size: '2.9 MB',
    alarms: 0,
    source: 'file',
    note: '정상 완료',
  },
  {
    id: 'rec_003',
    name: 'REC_2026-05-12_1641.csv',
    block: 'BH-11',
    cell: 'HOR',
    path: '1/1',
    operator: '박지훈',
    startedAt: '2026-05-12 16:41:09',
    duration: 287,
    samples: 35875,
    size: '2.1 MB',
    alarms: 1,
    source: 'file',
    note: 'Z 오프셋 드리프트',
  },
  {
    id: 'rec_004',
    name: 'rec_db_2026-05-12_1402',
    block: 'BH-11',
    cell: 'VR1',
    path: '1/3',
    operator: '박지훈',
    startedAt: '2026-05-12 14:02:55',
    duration: 645,
    samples: 80625,
    size: '4.6 MB',
    alarms: 3,
    source: 'db',
    note: '아크 안정도 경고 2회',
  },
  {
    id: 'rec_005',
    name: 'rec_db_2026-05-12_0950',
    block: 'BH-10',
    cell: 'VR2',
    path: '2/4',
    operator: '이수민',
    startedAt: '2026-05-12 09:50:18',
    duration: 920,
    samples: 115000,
    size: '6.3 MB',
    alarms: 0,
    source: 'db',
    note: '정상 완료 · 장시간',
  },
  {
    id: 'rec_006',
    name: 'rec_db_2026-05-11_1715',
    block: 'BH-10',
    cell: 'VL2',
    path: '3/3',
    operator: '이수민',
    startedAt: '2026-05-11 17:15:02',
    duration: 503,
    samples: 62875,
    size: '3.5 MB',
    alarms: 12,
    source: 'db',
    note: 'X/Z 오프셋 다수 보정 · 검토 필요',
  },
];

function AppShell() {
  const [screen, setScreen] = React.useState('monitoring');
  // Library is fetched from /api/recordings on mount + after start/stop.
  const [library, setLibrary] = React.useState(RECORDING_LIBRARY_FALLBACK);
  const [libraryStatus, setLibraryStatus] = React.useState('loading'); // loading | ok | offline
  const [activeRecId, setActiveRecId] = React.useState(null);
  // Recording session state — null when not recording
  const [session, setSession] = React.useState(null);

  // Start the modbus live ticker on mount
  React.useEffect(() => { window.MODBUS.start(); }, []);

  // Fetch recording library from backend
  const refreshLibrary = React.useCallback(async () => {
    try {
      const res = await fetch('/api/recordings');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const items = Array.isArray(json.items) ? json.items : [];
      setLibrary(items);
      setLibraryStatus('ok');
      if (!activeRecId && items.length) setActiveRecId(items[0].id);
    } catch (err) {
      console.warn('[recordings] fetch failed, using fallback', err);
      setLibrary(RECORDING_LIBRARY_FALLBACK);
      setLibraryStatus('offline');
      if (!activeRecId && RECORDING_LIBRARY_FALLBACK.length) {
        setActiveRecId(RECORDING_LIBRARY_FALLBACK[0].id);
      }
    }
  }, [activeRecId]);
  React.useEffect(() => { refreshLibrary(); }, []); // eslint-disable-line

  const openInAnalysis = (recId) => {
    setActiveRecId(recId);
    setScreen('analysis');
  };

  const startRecording = async (meta) => {
    // Optimistic UI session
    setSession({
      startedAt: Date.now(),
      meta,
      pausedTotal: 0,
      pausedAt: null,
    });
    try {
      const res = await fetch('/api/recordings/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: meta?.name || null,
          cell: meta?.cell || null,
          weld_on: meta?.weld_on || null,
          note: meta?.note || null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.warn('[recording] start failed', err);
    }
  };

  const stopRecording = async () => {
    setSession(null);
    try {
      await fetch('/api/recordings/stop', { method: 'POST' });
    } catch (err) {
      console.warn('[recording] stop failed', err);
    }
    refreshLibrary();
  };

  // CSV 임포트 — backend POST /api/recordings/import (multipart)
  const importRecording = async ({ file, name, cell, weld_on, note }) => {
    const form = new FormData();
    form.append('file', file);
    if (name) form.append('name', name);
    if (cell) form.append('cell', cell);
    if (weld_on) form.append('weld_on', weld_on);
    if (note) form.append('note', note);
    const res = await fetch('/api/recordings/import', { method: 'POST', body: form });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }
    await refreshLibrary();
    return await res.json();
  };

  // 레코딩 삭제 — DELETE /api/recordings/{filename}. CSV + 사이드카 + DB 모두 정리.
  const deleteRecording = async (filename) => {
    if (!filename) return;
    const res = await fetch(`/api/recordings/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }
    // 활성 레코딩이 삭제되면 선택 초기화 — 다음 refresh 가 첫 항목으로 다시 잡음
    setLibrary(prev => {
      const next = prev.filter(r => r.filename !== filename);
      if (activeRecId && !next.some(r => r.id === activeRecId)) {
        setActiveRecId(next[0]?.id ?? null);
      }
      return next;
    });
    // 백엔드 신뢰값으로 동기화 (낙관적 업데이트 위에 덮어씀)
    refreshLibrary();
  };

  // 서버 측 경로에서 CSV 로드 — 브라우저 업로드가 막힌 보안 환경용.
  const loadRecordingFromPath = async ({ path, name, cell, weld_on, note, copy }) => {
    const res = await fetch('/api/recordings/load-path', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, name, cell, weld_on, note, copy }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }
    await refreshLibrary();
    return await res.json();
  };

  // Tick session timer
  const [, force] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => {
    if (!session) return;
    const id = setInterval(force, 500);
    return () => clearInterval(id);
  }, [session]);

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: TOKENS.bg,
      color: TOKENS.text,
      display: 'flex', flexDirection: 'column',
      fontFamily: 'Pretendard, -apple-system, sans-serif',
      overflow: 'hidden',
    }}>
      <TopChrome session={session} />
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <Sidebar
          screen={screen} setScreen={setScreen}
          session={session}
        />
        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {screen === 'monitoring' && <ScreenMonitoring />}
          {screen === 'rtde' && <ScreenRtde />}
          {screen === 'recordings' && (
            <ScreenRecordings
              library={library}
              libraryStatus={libraryStatus}
              refreshLibrary={refreshLibrary}
              session={session}
              startRecording={startRecording}
              stopRecording={stopRecording}
              importRecording={importRecording}
              loadRecordingFromPath={loadRecordingFromPath}
              deleteRecording={deleteRecording}
              openInAnalysis={openInAnalysis}
              activeRecId={activeRecId}
            />
          )}
          {screen === 'analysis' && (
            <ScreenAnalysis
              recording={library.find(r => r.id === activeRecId)}
              changeRecording={openInAnalysis}
              library={library}
            />
          )}
          {screen === 'logs' && <ScreenLogs />}
          {screen === 'mapping' && <ScreenMapping />}
        </main>
      </div>
    </div>
  );
}

const MODBUS_PILL_LABELS = {
  live: 'LIVE',
  sim: 'SIM',
  connecting: 'CONN…',
  disconnected: 'DOWN',
};
const MODBUS_PILL_STATE = {
  live: 'ok',
  sim: 'warn',
  connecting: 'warn',
  disconnected: 'err',
};

function TopChrome({ session }) {
  const elapsed = session ? Math.floor((Date.now() - session.startedAt) / 1000) : 0;
  const [conn, setConn] = React.useState(() => ({
    state: window.MODBUS?.connection || 'sim',
    meta: window.MODBUS?.meta || {},
  }));
  React.useEffect(() => {
    if (!window.MODBUS?.subscribeConnection) return;
    return window.MODBUS.subscribeConnection((state, meta) => {
      setConn({ state, meta });
    });
  }, []);
  const modbusHost = conn.meta?.host || '—';
  const modbusLabel = `MODBUS · ${modbusHost} · ${MODBUS_PILL_LABELS[conn.state] || conn.state.toUpperCase()}`;
  const modbusTitle = conn.meta?.error
    ? `error: ${conn.meta.error}`
    : conn.state === 'sim'
      ? '백엔드 WebSocket 없음 — 시뮬레이터 모드'
      : conn.state === 'live'
        ? `폴링 ${conn.meta?.pollHz || '?'}Hz`
        : '';

  // RTDE 상태 — /api/state 를 3초마다 폴링. running + age_ms(최근 프레임 도착 후 경과)
  // 로 판정. running=true 라도 로봇 미연결이면 age_ms 가 빠르게 증가하다 stale.
  const [rtde, setRtde] = React.useState({
    running: false, host: '—', ageMs: null, rateHz: null, frameIdx: 0, error: null,
  });
  React.useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch('/api/state');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const s = json.status || {};
        if (cancelled) return;
        setRtde({
          running: !!s.running,
          host: s.host || '—',
          ageMs: typeof s.age_ms === 'number' ? s.age_ms : null,
          rateHz: typeof s.consumer_rate_hz === 'number' ? s.consumer_rate_hz : null,
          frameIdx: typeof s.frame_index === 'number' ? s.frame_index : 0,
          error: s.error || null,
        });
      } catch (err) {
        if (cancelled) return;
        setRtde(r => ({ ...r, error: err.message || String(err) }));
      }
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // 핍 상태:
  //   DOWN  — service 미시작 또는 한 번도 프레임 못 받음
  //   STALE — service 는 running 이지만 age_ms > 2000 (로봇 끊김/응답 없음)
  //   LIVE  — running + 최근 2초 이내 프레임
  const rtdeIsLive  = rtde.running && rtde.ageMs != null && rtde.ageMs < 2000;
  const rtdeIsStale = rtde.running && !rtdeIsLive;
  const rtdePillState = rtdeIsLive ? 'ok' : rtdeIsStale ? 'warn' : 'err';
  const rtdePillLabel =
    `RTDE · ${rtde.host} · ` +
    (rtdeIsLive ? `LIVE · ${(rtde.rateHz ?? 0).toFixed(0)}Hz`
     : rtdeIsStale ? `STALE · ${((rtde.ageMs ?? 0) / 1000).toFixed(1)}s`
     : 'DOWN');
  const rtdeTitle = rtde.error
    ? `error: ${rtde.error}`
    : rtdeIsLive ? `실시간 프레임 수신 중 (frame #${rtde.frameIdx.toLocaleString()})`
    : rtdeIsStale ? 'service 는 running 이지만 최근 프레임 없음 — 로봇 연결 확인'
    : 'RTDE service 미시작 또는 로봇 미연결';
  return (
    <div style={{
      height: 44, flex: '0 0 auto',
      borderBottom: `1px solid ${TOKENS.border}`,
      background: TOKENS.panel2,
      display: 'flex', alignItems: 'center',
      padding: '0 16px', gap: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 22, height: 22,
          background: TOKENS.accent,
          clipPath: 'polygon(0 30%, 50% 0, 100% 30%, 100% 100%, 0 100%)',
        }} />
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontWeight: 600, fontSize: 13,
          letterSpacing: 1.5,
          color: TOKENS.text,
        }}>SHIPYARD · WELD</span>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10, color: TOKENS.muted,
          letterSpacing: 0.8,
        }}>v0.4.2</span>
      </div>

      <span style={{ flex: 1 }} />

      {session && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '4px 12px',
          background: TOKENS.red + '15',
          border: `1px solid ${TOKENS.red}55`,
          borderRadius: 2,
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', background: TOKENS.red,
            boxShadow: `0 0 10px ${TOKENS.red}`,
            animation: 'pulse 1.2s ease-in-out infinite',
          }} />
          <span style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 11, color: TOKENS.red, fontWeight: 600, letterSpacing: 0.8,
          }}>REC {fmtT(elapsed)}</span>
          <span style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10, color: TOKENS.text,
          }}>{session.meta?.filename || session.meta?.name || ''}</span>
        </div>
      )}

      <ConnPill label={rtdePillLabel} state={rtdePillState} title={rtdeTitle} />
      <ConnPill label={modbusLabel} state={MODBUS_PILL_STATE[conn.state]} title={modbusTitle} />
      <LiveClock />

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.3 } }`}</style>
    </div>
  );
}

function Sidebar({ screen, setScreen, session }) {
  return (
    <aside style={{
      width: 220, flex: '0 0 auto',
      background: TOKENS.panel2,
      borderRight: `1px solid ${TOKENS.border}`,
      display: 'flex', flexDirection: 'column',
      padding: '14px 10px',
    }}>
      <div style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 9, letterSpacing: 1.6,
        color: TOKENS.muted, padding: '0 8px 8px',
      }}>NAVIGATION</div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV.map(item => {
          const on = screen === item.id;
          return (
            <button key={item.id}
              onClick={() => setScreen(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center', gap: 12,
                padding: '10px 10px',
                background: on ? TOKENS.bg : 'transparent',
                border: 'none',
                borderLeft: `2px solid ${on ? TOKENS.accent : 'transparent'}`,
                color: on ? TOKENS.text : TOKENS.dim,
                cursor: 'pointer',
                textAlign: 'left',
                borderRadius: 0,
              }}>
              <span style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 14,
                color: on ? TOKENS.accent : TOKENS.dim,
                width: 16, textAlign: 'center',
              }}>{item.icon}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                <span style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{item.label}</span>
                <span style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 9, color: TOKENS.muted, letterSpacing: 0.6,
                  whiteSpace: 'nowrap',
                }}>{item.sub}</span>
              </div>
              {item.id === 'recordings' && session && (
                <span style={{
                  marginLeft: 'auto',
                  width: 6, height: 6, borderRadius: '50%',
                  background: TOKENS.red,
                  boxShadow: `0 0 6px ${TOKENS.red}`,
                }} />
              )}
            </button>
          );
        })}
      </nav>

      <div style={{ flex: 1 }} />

      <div style={{
        padding: 10,
        border: `1px solid ${TOKENS.border}`,
        background: TOKENS.bg,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10, color: TOKENS.dim,
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        <div style={{ color: TOKENS.text, fontSize: 10, letterSpacing: 0.8 }}>
          SYSTEM
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>샘플레이트</span><span style={{ color: TOKENS.text }}>125 Hz</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Modbus 폴링</span><span style={{ color: TOKENS.text }}>4 Hz</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>레코딩 저장소</span><span style={{ color: TOKENS.text }}>62.3GB</span>
        </div>
        <div style={{
          height: 3, background: TOKENS.border, marginTop: 2, borderRadius: 1,
        }}>
          <div style={{
            width: '34%', height: '100%',
            background: TOKENS.green,
          }} />
        </div>
      </div>
    </aside>
  );
}

window.AppShell = AppShell;
window.RECORDING_LIBRARY = RECORDING_LIBRARY_FALLBACK;  // 호환용. 실제 데이터는 AppShell state.
