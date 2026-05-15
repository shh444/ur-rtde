// Variant B+ (refined): final analysis workspace layout
//
//   [meta bar]
//   ┌─────────┬─────────────────────────────────┬─────────────┐
//   │ channel │  toolbar (pinned chips, modes)  │  @ cursor   │
//   │ sidebar │  RTDE main track                │  modbus mini│
//   │ collapsible │  X·Y scatter #1 │ #2          │  tracks    │
//   │         │  master timeline                │  messages   │
//   └─────────┴─────────────────────────────────┴─────────────┘

function VariantTracksFinal({ recording, library, changeRecording } = {}) {
  const T = window.TRACKS || {};
  const D = window.RTDE || { cols: [], samples: {}, ranges: {}, t: [] };
  // duration 도 mock/real 양쪽에 안전한 fallback
  const dur = (T && typeof T.duration === 'number' && T.duration > 0) ? T.duration : 60;
  const H = window.TRACK_HELPERS;

  // 핀 초기값을 "선호 컬럼 중 실제 존재하는 것만, 없으면 처음 N개" 로 데이터 기반 산정.
  // 이렇게 안 하면 실데이터에 weldCurrent 같은 mock 컬럼이 없을 때 Track 이 undefined
  // ranges 접근하다 crash → 화면 까매짐.
  const pickInitialPinned = (cols, preferred, count = 4) => {
    if (!Array.isArray(cols) || cols.length === 0) return [];
    const found = preferred.filter(c => cols.includes(c));
    if (found.length > 0) return found.slice(0, count);
    return cols.slice(0, count);
  };
  const [pinnedRtde, setPinnedRtde] = React.useState(() =>
    pickInitialPinned(D.cols, ['weldCurrent', 'weldVoltage', 'xOffset', 'zOffset']));
  const [pinnedMb,   setPinnedMb]   = React.useState(() =>
    pickInitialPinned(T.modbus?.cols, ['mb_fb_current', 'mb_fb_voltage', 'mb_wire_feed', 'mb_gas_flow']));
  const [view, setView] = React.useState(() => {
    const margin = Math.min(60, dur * 0.1);
    return [margin, Math.max(margin + 1, dur - margin)];
  });
  const [hover, setHover] = React.useState(null);
  const [selectedLog, setSelectedLog] = React.useState(null);

  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [rightOpen, setRightOpen] = React.useState(true);
  const [detailMode, setDetailMode] = React.useState('overlay');

  // 하단 보조 시계열 패널 — Y 컬럼만 사용자가 선택. X 는 항상 시간 (view 공유).
  // 초기값은 D.cols 에 있을 때만 채택 — 실데이터로 갈아끼웠을 때 컬럼이 다르면
  // ScatterPanel 내부 effect 가 자동으로 fallback.
  const initY = (preferred, fallback) => {
    if (!D || !Array.isArray(D.cols) || D.cols.length === 0) return '';
    if (D.cols.includes(preferred)) return preferred;
    if (D.cols.includes(fallback)) return fallback;
    return D.cols[0];
  };
  const [scatterY1, setScatterY1] = React.useState(() => initY('Arc_percent', 'weldCurrent'));
  const [scatterY2, setScatterY2] = React.useState(() => initY('zOffset', 'xOffset'));

  // Log filter (in right panel)
  const [logFilter, setLogFilter] = React.useState({
    error: true, warn: true, info: true, debug: false, sys: false,
  });

  // ── Analysis templates ────────────────────────────────────────────
  // 현재 핀/뷰 설정을 한 묶음으로 저장/적용. 백엔드 /api/analysis/templates 와 동기화.
  // 실패해도 UI 는 동작 — 메모리에만 남고 새로고침 시 사라짐.
  const [templates, setTemplates] = React.useState([]);
  const [activeTemplateId, setActiveTemplateId] = React.useState('');
  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/analysis/templates')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d && Array.isArray(d.templates)) setTemplates(d.templates); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const persistTemplates = async (next) => {
    try {
      await fetch('/api/analysis/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templates: next }),
      });
    } catch (e) { console.warn('[templates] persist failed', e); }
  };

  const saveTemplate = (name) => {
    const nm = (name || '').trim();
    if (!nm) return;
    const tmpl = {
      id: 't_' + Date.now(),
      name: nm,
      pinnedRtde: [...pinnedRtde],
      pinnedMb: [...pinnedMb],
      detailMode,
      scatterY1, scatterY2,
    };
    const next = [...templates, tmpl];
    setTemplates(next);
    setActiveTemplateId(tmpl.id);
    persistTemplates(next);
  };

  const applyTemplate = (id) => {
    if (!id) { setActiveTemplateId(''); return; }
    const t = templates.find(x => x.id === id);
    if (!t) return;
    setActiveTemplateId(id);
    if (Array.isArray(t.pinnedRtde)) setPinnedRtde(t.pinnedRtde.filter(c => D?.cols?.includes(c)));
    if (Array.isArray(t.pinnedMb)) setPinnedMb(t.pinnedMb.filter(c => T?.modbus?.cols?.includes(c)));
    if (t.detailMode) setDetailMode(t.detailMode);
    if (t.scatterY1 && D?.cols?.includes(t.scatterY1)) setScatterY1(t.scatterY1);
    if (t.scatterY2 && D?.cols?.includes(t.scatterY2)) setScatterY2(t.scatterY2);
  };

  const deleteTemplate = (id) => {
    const next = templates.filter(x => x.id !== id);
    setTemplates(next);
    if (activeTemplateId === id) setActiveTemplateId('');
    persistTemplates(next);
  };

  const colorForRtde = (col) => {
    const i = pinnedRtde.indexOf(col);
    return H.SRC_COLORS.rtde[i % H.SRC_COLORS.rtde.length];
  };
  const colorForMb = (col) => {
    const i = pinnedMb.indexOf(col);
    return H.SRC_COLORS.modbus[i % H.SRC_COLORS.modbus.length];
  };

  const togglePinRtde = (c) => setPinnedRtde(p =>
    p.includes(c) ? p.filter(x => x !== c) : [...p, c].slice(0, 6));
  const togglePinMb = (c) => setPinnedMb(p =>
    p.includes(c) ? p.filter(x => x !== c) : [...p, c].slice(0, 6));

  const rtdeChannels = pinnedRtde.map(c => ({ col: c, source: 'rtde', color: colorForRtde(c) }));
  const mbChannels = pinnedMb.map(c => ({
    col: c, source: 'modbus', color: colorForMb(c),
    mode: c.startsWith('mb_set_') ? 'step' : 'line',
  }));

  // (산점도 인덱스 변환 불필요 — 시계열 차트는 view/hover 를 그대로 받음)

  const jumpTo = (t) => {
    const w = 80;
    setView([Math.max(0, t - w/2), Math.min(dur, t + w/2)]);
    setHover(t);
  };

  return (
    <div style={{
      width: '100%', height: '100%',
      background: TOKENS.bg, color: TOKENS.text,
      fontFamily: 'Pretendard, sans-serif',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <MetaBar onJump={(t) => jumpTo(t)}
        recording={recording} library={library} changeRecording={changeRecording} />

      <div style={{
        flex: 1, minHeight: 0, minWidth: 0,
        display: 'grid',
        // 좌/우 모두 토글 가능. 펼치면 minmax 로 유연, 접으면 36px strip.
        gridTemplateColumns: [
          sidebarOpen ? '250px' : '36px',
          'minmax(0, 1fr)',
          rightOpen ? 'minmax(300px, 360px)' : '36px',
        ].join(' '),
        gap: 1, background: TOKENS.border,
      }}>
        {/* Left — channel sidebar */}
        {sidebarOpen ? (
          <ExpandedChannelSidebar
            pinnedRtde={pinnedRtde} pinnedMb={pinnedMb}
            togglePinRtde={togglePinRtde} togglePinMb={togglePinMb}
            colorForRtde={colorForRtde} colorForMb={colorForMb}
            onCollapse={() => setSidebarOpen(false)}
            templates={templates}
            activeTemplateId={activeTemplateId}
            onSaveTemplate={saveTemplate}
            onApplyTemplate={applyTemplate}
            onDeleteTemplate={deleteTemplate}
          />
        ) : (
          <CollapsedChannelSidebar
            pinnedRtde={pinnedRtde} pinnedMb={pinnedMb}
            colorForRtde={colorForRtde} colorForMb={colorForMb}
            onExpand={() => setSidebarOpen(true)}
          />
        )}

        {/* Center — main RTDE area */}
        <div style={{
          background: TOKENS.bg,
          display: 'grid',
          gridTemplateRows: 'auto auto 1fr auto',
          minHeight: 0, minWidth: 0,
        }}>
          <MainToolbar
            pinnedRtde={pinnedRtde}
            colorForRtde={colorForRtde}
            togglePinRtde={togglePinRtde}
            detailMode={detailMode}
            setDetailMode={setDetailMode}
            view={view} setView={setView} dur={dur}
          />

          {/* RTDE main track — 줄여서 하단 시계열에 공간 양보 */}
          <div style={{ padding: 10, paddingTop: 6, minHeight: 0 }}>
            <Track
              channels={rtdeChannels} view={view}
              hover={hover} onHover={setHover}
              title="RTDE"
              badge={T.rtde?.hz ? `${T.rtde.hz}Hz` : '—'}
              badgeColor={H.SRC_COLORS.rtde[0]}
              height={240}
              segments={T.segments}
              showLegend={false}
            />
          </div>

          {/* 보조 시계열 — X = 시간 고정, 마스터와 view/hover 공유 */}
          <div style={{
            padding: '0 10px 6px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            minHeight: 0,
          }}>
            <ScatterPanel
              idx={1} D={D} yCol={scatterY1} setYCol={setScatterY1}
              view={view} hover={hover} setHover={setHover}
              colorForRtde={colorForRtde}
            />
            <ScatterPanel
              idx={2} D={D} yCol={scatterY2} setYCol={setScatterY2}
              view={view} hover={hover} setHover={setHover}
              colorForRtde={colorForRtde}
            />
          </div>

          {/* Master timeline */}
          <div style={{ padding: '0 10px 10px' }}>
            <MasterTimeline
              view={view} setView={setView}
              hover={hover} onHover={setHover}
              segments={T.segments}
              height={80}
            />
          </div>
        </div>

        {/* Right — Modbus + Messages (좌측처럼 토글 가능) */}
        {rightOpen ? (
          <RightSubPanel
            hover={hover}
            mbChannels={mbChannels} pinnedMb={pinnedMb}
            togglePinMb={togglePinMb} colorForMb={colorForMb}
            view={view}
            logs={T.logs} logFilter={logFilter} setLogFilter={setLogFilter}
            selectedLog={selectedLog} setSelectedLog={(l) => { setSelectedLog(l); if(l) jumpTo(l.t); }}
            onCollapse={() => setRightOpen(false)}
          />
        ) : (
          <window.CollapsedRightPanel
            pinnedMb={pinnedMb} colorForMb={colorForMb}
            logs={T.logs} logFilter={logFilter}
            onExpand={() => setRightOpen(true)}
          />
        )}
      </div>
    </div>
  );
}

window.VariantTracksFinal = VariantTracksFinal;
