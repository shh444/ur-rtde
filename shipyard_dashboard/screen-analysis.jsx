// Screen: 분석 워크스페이스 (RTDE post-recording)
// Wraps the Standard-variant analysis components into a screen-shaped layout
// (no AppChrome). Adds a top "loaded recording" bar with a quick-switch popover.

// ── Analysis templates ────────────────────────────────────────────────
// 한 화면에 핀된 채널 + 산점도 X/Y + 상세 모드를 묶어 "프리셋"으로 저장.
// 내장 프리셋은 코드에 박혀있고, 사용자 정의 프리셋은 backend 파일
// (analysis_templates.json) 에 저장 — PC/브라우저 간 공유되도록.
// 템플릿이 참조하는 채널이 현재 레코딩에 없으면 그냥 무시 (조용히 스킵).
const TEMPLATES_API = '/api/analysis/templates';
// 이전 버전(localStorage 저장) 데이터 마이그레이션용. 한 번 서버로 옮기고 정리.
const LEGACY_TEMPLATE_KEY = 'shipyard.analysisTemplates.v1';
const LEGACY_DELETED_KEY = 'shipyard.analysisTemplates.deletedBuiltins.v1';

const BUILTIN_TEMPLATES = [
  {
    id: 'builtin-arc-sensing-x',
    name: 'X 아크센싱',
    description: 'BotRight+ · TopLeft− → X 오프셋',
    pinned: ['BotRight_Plus', 'TopLeft_Minus'],
    scatterX: '__timer__',
    scatterY: 'xOffset',
    // 두 번째 산점도 — 두 raw 신호의 상관관계
    scatterX2: 'BotRight_Plus',
    scatterY2: 'TopLeft_Minus',
    detailMode: 'overlay',
    builtin: true,
  },
  {
    id: 'builtin-arc-sensing-y',
    name: 'Y 아크센싱',
    description: 'TopRight+ · BotLeft− → Y 오프셋',
    pinned: ['TopRight_Plus', 'BotLeft_Minus'],
    scatterX: '__timer__',
    scatterY: 'yOffset',
    scatterX2: 'TopRight_Plus',
    scatterY2: 'BotLeft_Minus',
    detailMode: 'overlay',
    builtin: true,
  },
];

async function loadAnalysisTemplates() {
  try {
    const res = await fetch(TEMPLATES_API);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const doc = await res.json();
    return {
      templates: Array.isArray(doc.templates)
        ? doc.templates.filter(t => t && typeof t === 'object' && t.id && t.name)
        : [],
      deletedBuiltins: Array.isArray(doc.deletedBuiltins)
        ? doc.deletedBuiltins.filter(id => typeof id === 'string')
        : [],
    };
  } catch (err) {
    console.warn('[analysis_templates] load failed:', err);
    return { templates: [], deletedBuiltins: [] };
  }
}

// save 호출은 한쪽만 갱신해도 백엔드가 partial update 를 지원하므로 다른 쪽
// 현재값을 알 필요 없음. fire-and-forget — UI 는 setState 로 즉시 반영하고
// POST 는 백그라운드로.
async function saveUserTemplates(arr) {
  try {
    const res = await fetch(TEMPLATES_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templates: arr }),
    });
    return res.ok;
  } catch (err) {
    console.warn('[analysis_templates] save templates failed:', err);
    return false;
  }
}

async function saveDeletedBuiltins(ids) {
  try {
    const res = await fetch(TEMPLATES_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deletedBuiltins: ids }),
    });
    return res.ok;
  } catch (err) {
    console.warn('[analysis_templates] save deletedBuiltins failed:', err);
    return false;
  }
}

// 기존 localStorage 사용자 데이터를 한 번만 서버로 옮김. 서버에 이미 데이터가
// 있으면 스킵 (덮어쓰지 않음). 성공시 localStorage 키 정리.
async function migrateFromLocalStorage(serverData) {
  const hasServerData =
    serverData.templates.length > 0 || serverData.deletedBuiltins.length > 0;
  if (hasServerData) return null;
  let legacyTpls = [];
  let legacyDeleted = [];
  try {
    const raw = window.localStorage.getItem(LEGACY_TEMPLATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        legacyTpls = parsed.filter(t => t && typeof t === 'object' && t.id && t.name);
      }
    }
  } catch {}
  try {
    const raw = window.localStorage.getItem(LEGACY_DELETED_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        legacyDeleted = parsed.filter(x => typeof x === 'string');
      }
    }
  } catch {}
  if (legacyTpls.length === 0 && legacyDeleted.length === 0) return null;
  try {
    const res = await fetch(TEMPLATES_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templates: legacyTpls, deletedBuiltins: legacyDeleted }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    try { window.localStorage.removeItem(LEGACY_TEMPLATE_KEY); } catch {}
    try { window.localStorage.removeItem(LEGACY_DELETED_KEY); } catch {}
    console.info('[analysis_templates] migrated from localStorage to server');
    return { templates: legacyTpls, deletedBuiltins: legacyDeleted };
  } catch (err) {
    console.warn('[analysis_templates] migration failed (localStorage 유지):', err);
    return null;
  }
}

function ScreenAnalysis({ recording, changeRecording, library }) {
  // 빈 상태: 레코딩 라이브러리가 비었거나 (백엔드에 아직 CSV 없음) 선택된 레코딩이 없을 때
  if (!recording) {
    return <AnalysisEmptyState library={library} changeRecording={changeRecording} />;
  }
  // 실제 CSV 데이터 fetch 는 별도 컴포넌트로 분리 (hooks 규칙 준수)
  return (
    <AnalysisWorkspace
      recording={recording}
      changeRecording={changeRecording}
      library={library} />
  );
}

// CSV 데이터를 백엔드에서 fetch 한 후 차트 등 분석 컴포넌트에 전달.
// 파일이 바뀌면 자동 재로드. 로딩/에러 상태 표시.
function AnalysisWorkspace({ recording, changeRecording, library }) {
  const filename = recording.filename || recording.name;
  const [D, setD] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!filename) {
      setError('파일명 없음 (레거시 항목?)');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/recordings/${encodeURIComponent(filename)}/data`);
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `HTTP ${res.status}`);
        }
        const json = await res.json();
        if (cancelled) return;
        const built = buildAnalysisD(json);
        if (built.cols.length === 0) {
          throw new Error('레코딩 파일이 비어있습니다 (헤더도 없음).');
        }
        if (built.N === 0) {
          // 헤더는 있는데 샘플이 0 — 거의 항상 라이브 레코딩 중 RTDE 가 안 흘렀던 케이스
          throw new Error(
            '캡처된 프레임이 0개입니다 (헤더만 존재).\n\n' +
            '레코딩 시작 후 RTDE 가 연결되지 않으면 이런 상태가 됩니다.\n' +
            '확인:\n' +
            '  • 모니터링 탭에서 RTDE 가 LIVE 상태인지\n' +
            '  • app_config.py 의 ROBOT_HOST 가 올바른 IP 인지\n' +
            '  • 로봇 측 URScript 가 실제로 GP 레지스터에 값을 쓰고 있는지'
          );
        }
        setD(built);
      } catch (err) {
        if (cancelled) return;
        setError(err.message || String(err));
        setD(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [filename]);

  // 데이터 도착 후 정해지는 기본 pinned/scatter — 첫 4개 수치 컬럼.
  const numericCols = React.useMemo(() => {
    if (!D) return [];
    return D.cols.filter(c => {
      const a = D.samples[c];
      return Array.isArray(a) && a.length > 0 && typeof a[0] === 'number' && !Number.isNaN(a[0]);
    });
  }, [D]);

  const [pinned, setPinned] = React.useState([]);
  const [scatterX, setScatterX] = React.useState('');
  const [scatterY, setScatterY] = React.useState('');
  // 두 번째 산점도 (윈도우 통계 자리). 다른 X/Y 페어를 동시에 보기 위함.
  const [scatterX2, setScatterX2] = React.useState('');
  const [scatterY2, setScatterY2] = React.useState('');
  const [brush, setBrush] = React.useState([0, 0]);
  const [hoverIdx, setHoverIdx] = React.useState(null);
  const [detailMode, setDetailMode] = React.useState('overlay');
  const [showSwitcher, setShowSwitcher] = React.useState(false);

  // ── 템플릿 ────────────────────────────────────────────────────────
  // 서버(backend/analysis_templates.json)에서 비동기 로드. 마운트 시 한 번만.
  // 로드 전엔 빈 배열이라 내장 프리셋만 보임 → fetch 끝나면 사용자 템플릿 합류.
  const [userTemplates, setUserTemplates] = React.useState([]);
  // 삭제된 내장 프리셋 ID. 내장은 코드에 박혀 있어서 다음 페이지 로드 때 다시
  // 등장하지 않게 이 set 으로 필터링. 사용자 관점에선 그냥 "삭제됨".
  const [deletedBuiltins, setDeletedBuiltins] = React.useState(() => new Set());
  const [activeTemplateId, setActiveTemplateId] = React.useState(null);
  const [showSaveTemplate, setShowSaveTemplate] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const serverData = await loadAnalysisTemplates();
      const migrated = await migrateFromLocalStorage(serverData);
      const final = migrated || serverData;
      if (cancelled) return;
      setUserTemplates(final.templates);
      setDeletedBuiltins(new Set(final.deletedBuiltins));
    })();
    return () => { cancelled = true; };
  }, []);

  const allTemplates = React.useMemo(
    () => [
      ...BUILTIN_TEMPLATES.filter(t => !deletedBuiltins.has(t.id)),
      ...userTemplates,
    ],
    [userTemplates, deletedBuiltins],
  );

  const deleteBuiltin = (id) => {
    setDeletedBuiltins(prev => {
      const next = new Set(prev);
      next.add(id);
      saveDeletedBuiltins([...next]);
      return next;
    });
    if (activeTemplateId === id) setActiveTemplateId(null);
  };

  // 템플릿 적용: 채널이 데이터에 실제로 있는지 검사하고 없는 건 스킵.
  // __timer__ 는 항상 유효한 가상 컬럼.
  const applyTemplate = React.useCallback((tpl) => {
    if (!tpl || !D) return;
    const colSet = new Set(D.cols);
    const ok = (c) => c === '__timer__' || colSet.has(c);
    const validPinned = (tpl.pinned || []).filter(c => colSet.has(c)).slice(0, 6);
    setPinned(validPinned);
    if (tpl.scatterX && ok(tpl.scatterX)) setScatterX(tpl.scatterX);
    if (tpl.scatterY && ok(tpl.scatterY)) setScatterY(tpl.scatterY);
    // 두 번째 산점도 — 옵셔널. 구버전 템플릿엔 없을 수 있어서 명시적으로 fallback.
    if (tpl.scatterX2 && ok(tpl.scatterX2)) setScatterX2(tpl.scatterX2);
    if (tpl.scatterY2 && ok(tpl.scatterY2)) setScatterY2(tpl.scatterY2);
    if (tpl.detailMode === 'overlay' || tpl.detailMode === 'stacked') {
      setDetailMode(tpl.detailMode);
    }
    setActiveTemplateId(tpl.id);
  }, [D]);

  const saveCurrentAsTemplate = (name, description) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return { ok: false, error: '이름이 비어있습니다' };
    // 같은 이름의 사용자 템플릿이 있으면 덮어쓰기
    const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const tpl = {
      id,
      name: trimmed,
      description: (description || '').trim() || `${pinned.length}개 채널 · #1 X=${scatterX || '?'},Y=${scatterY || '?'} #2 X=${scatterX2 || '?'},Y=${scatterY2 || '?'}`,
      pinned: [...pinned],
      scatterX,
      scatterY,
      scatterX2,
      scatterY2,
      detailMode,
      builtin: false,
      createdAt: new Date().toISOString(),
    };
    const next = userTemplates.filter(t => t.name !== trimmed).concat(tpl);
    setUserTemplates(next);
    saveUserTemplates(next);
    setActiveTemplateId(id);
    return { ok: true };
  };

  const deleteUserTemplate = (id) => {
    const next = userTemplates.filter(t => t.id !== id);
    setUserTemplates(next);
    saveUserTemplates(next);
    if (activeTemplateId === id) setActiveTemplateId(null);
  };

  // 사용자가 수동으로 pinned/scatter/mode 를 바꾸면 활성 템플릿 표시 해제.
  // 비교 시 템플릿의 pinned 도 applyTemplate 와 동일하게 "현재 데이터에 존재하는
  // 채널만" 필터링해야 한다. 안 그러면 부분호환 템플릿은 적용 직후 바로 active 가
  // 꺼져버린다.
  const activeTemplate = activeTemplateId
    ? allTemplates.find(t => t.id === activeTemplateId)
    : null;
  React.useEffect(() => {
    if (!activeTemplate || !D) return;
    const colSet = new Set(D.cols);
    const expectedPinned = (activeTemplate.pinned || [])
      .filter(c => colSet.has(c))
      .slice(0, 6);
    const samePinned =
      expectedPinned.length === pinned.length &&
      expectedPinned.every((c, i) => c === pinned[i]);
    // scatter2 가 템플릿에 없으면(구버전) 비교 대상에서 제외 — undefined 비교는 항상
    // false 가 되어버려서 부당하게 active 가 꺼지는 걸 막는다.
    const scatter2Diff =
      (activeTemplate.scatterX2 !== undefined && activeTemplate.scatterX2 !== scatterX2) ||
      (activeTemplate.scatterY2 !== undefined && activeTemplate.scatterY2 !== scatterY2);
    if (
      !samePinned ||
      activeTemplate.scatterX !== scatterX ||
      activeTemplate.scatterY !== scatterY ||
      scatter2Diff ||
      activeTemplate.detailMode !== detailMode
    ) {
      setActiveTemplateId(null);
    }
  }, [pinned, scatterX, scatterY, scatterX2, scatterY2, detailMode, activeTemplate, D]);

  // 데이터 처음 로드되거나 변경 시 초기 pinned/brush 설정.
  React.useEffect(() => {
    if (!D) return;
    if (numericCols.length === 0) return;
    const initialPinned = numericCols.slice(0, Math.min(4, numericCols.length));
    setPinned(initialPinned);
    setScatterX(numericCols[0] || '');
    setScatterY(numericCols[1] || numericCols[0] || '');
    // 두 번째 산점도는 기본값: X=timer, Y=세 번째 수치 컬럼(없으면 두 번째).
    // 이렇게 하면 첫 산점도(축 쌍)와 다른 시각을 동시에 보여줌.
    setScatterX2('__timer__');
    setScatterY2(numericCols[2] || numericCols[1] || numericCols[0] || '');
    setBrush([Math.round(D.N * 0.55), Math.round(D.N * 0.82)]);
  }, [D, numericCols]);

  if (loading) return <AnalysisStatusPanel kind="loading" filename={filename} />;
  if (error)   return <AnalysisStatusPanel kind="error" filename={filename} error={error} library={library} changeRecording={changeRecording} />;
  if (!D)      return <AnalysisStatusPanel kind="error" filename={filename} error="데이터 없음" />;

  const N = D.N;

  const colorFor = (name) => {
    const i = pinned.indexOf(name);
    return TOKENS.serieses[Math.max(0, i) % TOKENS.serieses.length];
  };
  const togglePin = (n) =>
    setPinned(p => p.includes(n) ? p.filter(x => x !== n) : [...p, n].slice(0, 6));

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      minHeight: 0, background: TOKENS.bg,
    }}>
      {/* Loaded recording bar */}
      <LoadedRecordingBar
        recording={recording}
        showSwitcher={showSwitcher}
        setShowSwitcher={setShowSwitcher}
        library={library}
        changeRecording={changeRecording}
      />

      <div style={{
        flex: 1, display: 'grid',
        gridTemplateColumns: '260px 1fr',
        gap: 1, background: TOKENS.border,
        minHeight: 0,
      }}>
        <AnalysisVarBrowser D={D} pinned={pinned} onToggle={togglePin} colorFor={colorFor} />

        <div style={{
          background: TOKENS.bg,
          display: 'grid',
          gridTemplateRows: 'auto auto 1fr auto auto',
          minHeight: 0, minWidth: 0,
        }}>
          {/* 템플릿 바 — pinned + scatter X/Y + detailMode 를 한꺼번에 저장/적용 */}
          <TemplateBar
            templates={allTemplates}
            activeId={activeTemplateId}
            onApply={applyTemplate}
            onSaveOpen={() => setShowSaveTemplate(true)}
            onDeleteUser={deleteUserTemplate}
            onDeleteBuiltin={deleteBuiltin}
            D={D}
          />

          <div style={{
            padding: '10px 14px',
            display: 'flex', alignItems: 'center', gap: 8,
            borderBottom: `1px solid ${TOKENS.border}`,
            flexWrap: 'wrap',
          }}>
            <span style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10, letterSpacing: 1.4,
              color: TOKENS.dim, textTransform: 'uppercase',
            }}>PINNED</span>
            {pinned.map(c => (
              <Chip key={c} color={colorFor(c)} active removable onRemove={() => togglePin(c)}>
                {c}
              </Chip>
            ))}
            <span style={{ flex: 1 }} />
            <AnalysisSegmented2 value={detailMode} onChange={setDetailMode}
              options={[['overlay','오버레이'],['stacked','상하분할']]} />
          </div>

          <div style={{
            padding: 12, minHeight: 0,
            background: TOKENS.panel,
            borderBottom: `1px solid ${TOKENS.border}`,
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
            }}>
              <span style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10, color: TOKENS.dim, letterSpacing: 0.8,
              }}>
                FOCUS · {fmtT(D.t[Math.min(...brush)])} → {fmtT(D.t[Math.max(...brush)])}
                <span style={{ marginLeft: 8, color: TOKENS.accent }}>
                  Δ {fmtT(D.t[Math.max(...brush)] - D.t[Math.min(...brush)])}
                </span>
              </span>
              <span style={{ flex: 1 }} />
              <button onClick={() => setBrush([0, N - 1])} style={AnalysisBtnStyle}>전체 보기</button>
              <button onClick={() => setBrush([Math.round(N*0.55), Math.round(N*0.82)])}
                style={AnalysisBtnStyle}>이벤트 윈도우</button>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              {detailMode === 'overlay' ? (
                <AnalysisDetailOverlay D={D} pinned={pinned} colorFor={colorFor}
                  brush={brush} hoverIdx={hoverIdx} setHoverIdx={setHoverIdx} />
              ) : (
                <AnalysisDetailStacked D={D} pinned={pinned} colorFor={colorFor}
                  brush={brush} hoverIdx={hoverIdx} setHoverIdx={setHoverIdx} />
              )}
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 1,
            background: TOKENS.border,
            height: 260,
            minHeight: 0,
          }}>
            <div style={{ background: TOKENS.panel, padding: 12, display: 'flex', flexDirection: 'column' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
              }}>
                <span style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 10, letterSpacing: 1.4,
                  color: TOKENS.dim, textTransform: 'uppercase',
                }}>X · Y 상관관계 #1</span>
                <span style={{ flex: 1 }} />
                <AnalysisVarPick D={D} value={scatterX} onChange={setScatterX} label="X" />
                <AnalysisVarPick D={D} value={scatterY} onChange={setScatterY} label="Y" />
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <AnalysisScatterPlot D={D} xCol={scatterX} yCol={scatterY}
                  brush={brush} hoverIdx={hoverIdx} setHoverIdx={setHoverIdx} />
              </div>
            </div>

            <div style={{ background: TOKENS.panel, padding: 12, display: 'flex', flexDirection: 'column' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
              }}>
                <span style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 10, letterSpacing: 1.4,
                  color: TOKENS.dim, textTransform: 'uppercase',
                }}>X · Y 상관관계 #2</span>
                <span style={{ flex: 1 }} />
                <AnalysisVarPick D={D} value={scatterX2} onChange={setScatterX2} label="X" />
                <AnalysisVarPick D={D} value={scatterY2} onChange={setScatterY2} label="Y" />
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <AnalysisScatterPlot D={D} xCol={scatterX2} yCol={scatterY2}
                  brush={brush} hoverIdx={hoverIdx} setHoverIdx={setHoverIdx} />
              </div>
            </div>
          </div>

          <AnalysisBrushTimeline D={D} brush={brush} setBrush={setBrush}
            hoverIdx={hoverIdx} setHoverIdx={setHoverIdx}
            pinned={pinned} colorFor={colorFor} />
        </div>
      </div>

      {showSaveTemplate && (
        <SaveTemplateDialog
          currentSnapshot={{ pinned, scatterX, scatterY, scatterX2, scatterY2, detailMode }}
          existingNames={userTemplates.map(t => t.name)}
          onClose={() => setShowSaveTemplate(false)}
          onSave={(name, description) => {
            const r = saveCurrentAsTemplate(name, description);
            if (r.ok) setShowSaveTemplate(false);
            return r;
          }} />
      )}
    </div>
  );
}

// ── 템플릿 바 ─────────────────────────────────────────────────────────
// 드롭다운으로 프리셋 선택, [💾 현재 저장] 으로 SaveTemplateDialog 열기.
// 내장/사용자 프리셋 모두 × 로 삭제 가능 (사용자 관점에선 동일하게 "삭제").
// 내장은 코드에 박혀 있어 실제로는 localStorage 에 ID 만 기록해 다음 로드부터
// 안 보이게 한다 — 사용자가 새 템플릿으로 쉽게 재생성할 수 있으므로 복원 UI 없음.
function TemplateBar({
  templates, activeId, onApply, onSaveOpen, onDeleteUser, onDeleteBuiltin,
  D,
}) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const active = templates.find(t => t.id === activeId);
  const builtins = templates.filter(t => t.builtin);
  const userTpls = templates.filter(t => !t.builtin);
  const colSet = new Set(D?.cols || []);

  // 템플릿이 현재 레코딩에 적용 가능한지 검사 — pinned 채널이 하나라도 없으면
  // "부분 호환" 표시. __timer__ 는 항상 있음.
  const isCompat = (tpl) => {
    const need = tpl.pinned || [];
    if (need.length === 0) return true;
    const ok = need.filter(c => colSet.has(c)).length;
    if (ok === 0) return 'none';
    if (ok < need.length) return 'partial';
    return 'full';
  };

  return (
    <div ref={containerRef} style={{
      padding: '8px 14px',
      display: 'flex', alignItems: 'center', gap: 8,
      borderBottom: `1px solid ${TOKENS.border}`,
      background: TOKENS.panel2,
      position: 'relative',
      flexWrap: 'wrap',
    }}>
      <span style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10, letterSpacing: 1.4,
        color: TOKENS.dim, textTransform: 'uppercase',
      }}>TEMPLATE</span>

      <button onClick={() => setOpen(o => !o)}
        style={{
          padding: '5px 12px',
          background: active ? TOKENS.accent + '20' : TOKENS.bg,
          color: active ? TOKENS.accent : TOKENS.text,
          border: `1px solid ${active ? TOKENS.accent : TOKENS.border}`,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 11, letterSpacing: 0.5,
          cursor: 'pointer', borderRadius: 2,
          minWidth: 180, textAlign: 'left',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
        <span style={{ flex: 1 }}>{active ? active.name : '템플릿 선택…'}</span>
        <span style={{ color: TOKENS.dim, fontSize: 10 }}>▾</span>
      </button>

      <button onClick={onSaveOpen}
        title="현재 PINNED + 산점도 X/Y + 모드를 새 템플릿으로 저장"
        style={{
          padding: '5px 12px',
          background: 'transparent',
          color: TOKENS.dim,
          border: `1px solid ${TOKENS.border}`,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10, letterSpacing: 0.5,
          cursor: 'pointer', borderRadius: 2,
        }}>
        💾 현재 저장
      </button>

      <span style={{ flex: 1 }} />

      <span style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 9, color: TOKENS.muted,
      }}>
        내장 {builtins.length} · 사용자 {userTpls.length}
      </span>

      {open && (
        <div style={{
          position: 'absolute',
          top: '100%', left: 14,
          marginTop: 4,
          width: 420, maxHeight: 420, overflowY: 'auto',
          background: TOKENS.panel,
          border: `1px solid ${TOKENS.borderHi}`,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          zIndex: 30,
        }}>
          {builtins.length > 0 && (
            <div style={{
              padding: '6px 12px',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 9, color: TOKENS.muted, letterSpacing: 1.2,
              background: TOKENS.panel2,
              borderBottom: `1px solid ${TOKENS.border}`,
            }}>BUILT-IN · {builtins.length}</div>
          )}
          {builtins.map(t => (
            <TemplateRow key={t.id} tpl={t} activeId={activeId}
              compat={isCompat(t)}
              onApply={() => { onApply(t); setOpen(false); }}
              onDelete={() => {
                if (window.confirm(`'${t.name}' 프리셋을 삭제할까요?`)) {
                  onDeleteBuiltin && onDeleteBuiltin(t.id);
                }
              }}
              deleteLabel="삭제" />
          ))}

          <div style={{
            padding: '6px 12px',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 9, color: TOKENS.muted, letterSpacing: 1.2,
            background: TOKENS.panel2,
            borderTop: `1px solid ${TOKENS.border}`,
            borderBottom: `1px solid ${TOKENS.border}`,
          }}>USER · {userTpls.length}</div>
          {userTpls.length === 0 ? (
            <div style={{
              padding: '14px 12px', textAlign: 'center',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10, color: TOKENS.muted, lineHeight: 1.6,
            }}>
              저장된 사용자 템플릿이 없습니다.
              <br/>
              <span style={{ color: TOKENS.dim, fontSize: 9 }}>
                원하는 PINNED/축 설정 후 [💾 현재 저장]
              </span>
            </div>
          ) : userTpls.map(t => (
            <TemplateRow key={t.id} tpl={t} activeId={activeId}
              compat={isCompat(t)}
              onApply={() => { onApply(t); setOpen(false); }}
              onDelete={() => {
                if (window.confirm(`'${t.name}' 템플릿을 삭제할까요?`)) {
                  onDeleteUser && onDeleteUser(t.id);
                }
              }}
              deleteLabel="삭제" />
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateRow({ tpl, activeId, compat, onApply, onDelete, deleteLabel }) {
  const active = tpl.id === activeId;
  const [delHover, setDelHover] = React.useState(false);
  const compatColor = compat === 'full' ? TOKENS.green
                    : compat === 'partial' ? TOKENS.amber
                    : compat === 'none' ? TOKENS.red
                    : TOKENS.dim;
  const compatLabel = compat === 'full' ? '✓'
                    : compat === 'partial' ? '◐'
                    : compat === 'none' ? '✕'
                    : '·';
  return (
    <div style={{
      display: 'flex', alignItems: 'stretch',
      borderBottom: `1px solid ${TOKENS.border}33`,
      background: active ? TOKENS.bg : 'transparent',
      borderLeft: active ? `2px solid ${TOKENS.accent}` : `2px solid transparent`,
    }}>
      <button onClick={onApply}
        title={compat === 'none' ? '현재 레코딩에 해당 채널이 없습니다 (그래도 적용 시도)'
             : compat === 'partial' ? '일부 채널만 적용됨' : ''}
        style={{
          flex: 1,
          padding: '10px 12px',
          background: 'transparent',
          border: 'none',
          color: TOKENS.text, textAlign: 'left',
          cursor: 'pointer',
          fontFamily: 'JetBrains Mono, monospace',
          display: 'flex', flexDirection: 'column', gap: 3,
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: compatColor, fontSize: 10 }}>{compatLabel}</span>
          <span style={{ fontSize: 11, color: TOKENS.text }}>{tpl.name}</span>
          {!tpl.builtin && (
            <span style={{
              fontSize: 8, padding: '1px 4px',
              background: TOKENS.violet + '22',
              color: TOKENS.violet,
              borderRadius: 1, letterSpacing: 0.5,
            }}>USER</span>
          )}
        </div>
        {tpl.description && (
          <div style={{ fontSize: 9, color: TOKENS.dim, paddingLeft: 16 }}>
            {tpl.description}
          </div>
        )}
        <div style={{ fontSize: 9, color: TOKENS.muted, paddingLeft: 16, marginTop: 2 }}>
          PIN {(tpl.pinned || []).join(', ') || '—'}
        </div>
        <div style={{ fontSize: 9, color: TOKENS.muted, paddingLeft: 16 }}>
          #1 X={tpl.scatterX === '__timer__' ? '⏱timer' : (tpl.scatterX || '?')}
          {' '}Y={tpl.scatterY === '__timer__' ? '⏱timer' : (tpl.scatterY || '?')}
          {(tpl.scatterX2 || tpl.scatterY2) && (
            <>
              {' · '}#2 X={tpl.scatterX2 === '__timer__' ? '⏱timer' : (tpl.scatterX2 || '?')}
              {' '}Y={tpl.scatterY2 === '__timer__' ? '⏱timer' : (tpl.scatterY2 || '?')}
            </>
          )}
        </div>
      </button>
      {onDelete && (
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
          onMouseEnter={() => setDelHover(true)}
          onMouseLeave={() => setDelHover(false)}
          title="이 템플릿 삭제"
          style={{
            padding: '0 14px',
            background: delHover ? TOKENS.red + '22' : 'transparent',
            border: 'none', borderLeft: `1px solid ${TOKENS.border}`,
            color: delHover ? TOKENS.red : TOKENS.dim,
            cursor: 'pointer',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 11, fontWeight: 500, letterSpacing: 0.5,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            minWidth: 56,
            transition: 'background-color 80ms, color 80ms',
          }}>
          <span style={{ fontSize: 18, lineHeight: 1, fontWeight: 400 }}>×</span>
          <span style={{ fontSize: 8, marginTop: 2, letterSpacing: 0.8 }}>
            {deleteLabel || '삭제'}
          </span>
        </button>
      )}
    </div>
  );
}

// 현재 차트 설정을 새 템플릿으로 저장. 이름 중복 시 덮어쓰기 확인.
function SaveTemplateDialog({ currentSnapshot, existingNames, onClose, onSave }) {
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [error, setError] = React.useState(null);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) { setError('이름을 입력해주세요'); return; }
    if (existingNames.includes(trimmed)) {
      if (!window.confirm(`'${trimmed}' 이미 존재합니다. 덮어쓸까요?`)) return;
    }
    const r = onSave(trimmed, description);
    if (!r.ok) setError(r.error || '저장 실패');
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 200,
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          width: 520,
          background: TOKENS.panel,
          border: `1px solid ${TOKENS.border}`,
          borderTop: `2px solid ${TOKENS.accent}`,
          padding: 24,
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10, color: TOKENS.accent, letterSpacing: 1.4, fontWeight: 600,
          }}>SAVE TEMPLATE</span>
          <span style={{ flex: 1 }} />
          <button onClick={onClose}
            style={{
              background: 'transparent', border: 'none',
              color: TOKENS.dim, cursor: 'pointer', fontSize: 18,
            }}>×</button>
        </div>
        <div style={{ fontSize: 16, color: TOKENS.text, fontWeight: 500 }}>
          현재 설정을 템플릿으로 저장
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 9, color: TOKENS.muted, letterSpacing: 1,
          }}>이름</span>
          <input value={name} onChange={(e) => { setName(e.target.value); setError(null); }}
            placeholder="예: X 아크센싱 (커스텀)"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            style={{
              background: TOKENS.bg,
              border: `1px solid ${TOKENS.border}`,
              color: TOKENS.text,
              padding: '8px 10px',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 12, borderRadius: 2, outline: 'none',
            }} />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 9, color: TOKENS.muted, letterSpacing: 1,
          }}>설명 (선택)</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="비우면 자동 생성"
            style={{
              background: TOKENS.bg,
              border: `1px solid ${TOKENS.border}`,
              color: TOKENS.text,
              padding: '8px 10px',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 12, borderRadius: 2, outline: 'none',
            }} />
        </label>

        <div style={{
          padding: 10,
          background: TOKENS.bg,
          border: `1px solid ${TOKENS.border}`,
          borderLeft: `2px solid ${TOKENS.accent}`,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10, color: TOKENS.dim, lineHeight: 1.7,
        }}>
          <div style={{ color: TOKENS.text, marginBottom: 4 }}>현재 설정 미리보기</div>
          <div>PINNED · {(currentSnapshot.pinned || []).join(', ') || '— (비어있음)'}</div>
          <div>산점도 #1 · X={currentSnapshot.scatterX === '__timer__' ? '⏱ timer' : (currentSnapshot.scatterX || '—')}
            {' · '}Y={currentSnapshot.scatterY === '__timer__' ? '⏱ timer' : (currentSnapshot.scatterY || '—')}</div>
          <div>산점도 #2 · X={currentSnapshot.scatterX2 === '__timer__' ? '⏱ timer' : (currentSnapshot.scatterX2 || '—')}
            {' · '}Y={currentSnapshot.scatterY2 === '__timer__' ? '⏱ timer' : (currentSnapshot.scatterY2 || '—')}</div>
          <div>상세 모드 · {currentSnapshot.detailMode}</div>
        </div>

        {error && (
          <div style={{
            padding: '8px 10px',
            background: TOKENS.red + '15',
            border: `1px solid ${TOKENS.red}55`,
            color: TOKENS.red,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10,
          }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose}
            style={{
              padding: '8px 18px',
              background: 'transparent', color: TOKENS.dim,
              border: `1px solid ${TOKENS.border}`,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 11, letterSpacing: 0.8,
              cursor: 'pointer', borderRadius: 2,
            }}>취소</button>
          <button onClick={submit}
            style={{
              padding: '8px 18px',
              background: TOKENS.accent, color: '#0a0f1c',
              border: 'none',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 11, letterSpacing: 0.8, fontWeight: 600,
              cursor: 'pointer', borderRadius: 2,
            }}>💾 저장</button>
        </div>
      </div>
    </div>
  );
}

function LoadedRecordingBar({ recording, showSwitcher, setShowSwitcher, library, changeRecording }) {
  return (
    <div style={{
      padding: '10px 16px',
      background: TOKENS.panel,
      borderBottom: `1px solid ${TOKENS.border}`,
      display: 'flex', alignItems: 'center', gap: 16,
      position: 'relative',
      flex: '0 0 auto',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '4px 10px',
        background: TOKENS.bg, border: `1px solid ${TOKENS.border}`,
        borderLeft: `2px solid ${TOKENS.accent}`,
      }}>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 9, color: TOKENS.muted, letterSpacing: 1,
        }}>LOADED</span>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 12, color: TOKENS.text,
        }}>{recording.filename || recording.name || '—'}</span>
      </div>
      <div style={{
        display: 'flex', gap: 18,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10, color: TOKENS.dim,
      }}>
        {(recording.name || recording.block) && <Meta label="NAME" value={recording.name || recording.block} />}
        {recording.cell && <Meta label="셀" value={recording.cell} color={TOKENS.cyan} />}
        {recording.weld_on && <Meta label="용접" value={recording.weld_on}
          color={recording.weld_on === '예' ? TOKENS.green : TOKENS.muted} />}
        <Meta label="기간" value={recording.duration ? fmtT(recording.duration) : '—'} />
        <Meta label="샘플" value={(recording.samples || 0).toLocaleString()} />
        <Meta label="알람" value={String(recording.alarms || 0)} color={
          (recording.alarms || 0) === 0 ? TOKENS.green
          : (recording.alarms || 0) > 5 ? TOKENS.red : TOKENS.amber
        } />
      </div>
      <span style={{ flex: 1 }} />
      <button onClick={() => setShowSwitcher(s => !s)}
        style={{
          padding: '5px 12px',
          background: showSwitcher ? TOKENS.accent : 'transparent',
          color: showSwitcher ? '#0a0f1c' : TOKENS.dim,
          border: `1px solid ${showSwitcher ? TOKENS.accent : TOKENS.border}`,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10, letterSpacing: 0.6,
          cursor: 'pointer', borderRadius: 2,
        }}>
        다른 레코딩 ▾
      </button>
      <button style={{
        padding: '5px 12px',
        background: 'transparent', color: TOKENS.dim,
        border: `1px solid ${TOKENS.border}`,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10, letterSpacing: 0.6,
        cursor: 'pointer', borderRadius: 2,
      }}>내보내기</button>

      {showSwitcher && (
        <div style={{
          position: 'absolute',
          top: '100%', right: 16,
          marginTop: 4,
          width: 380, maxHeight: 360, overflowY: 'auto',
          background: TOKENS.panel,
          border: `1px solid ${TOKENS.borderHi}`,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          zIndex: 20,
        }}>
          {library.map(r => (
            <button key={r.id}
              onClick={() => { changeRecording(r.id); setShowSwitcher(false); }}
              style={{
                width: '100%',
                padding: '10px 14px',
                background: r.id === recording.id ? TOKENS.bg : 'transparent',
                border: 'none',
                borderBottom: `1px solid ${TOKENS.border}`,
                borderLeft: r.id === recording.id ? `2px solid ${TOKENS.accent}` : `2px solid transparent`,
                color: TOKENS.text,
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: 3,
                fontFamily: 'JetBrains Mono, monospace',
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: TOKENS.text }}>{r.name}</span>
                <span style={{
                  fontSize: 8, padding: '1px 4px',
                  background: r.source === 'db' ? TOKENS.violet + '33' : TOKENS.cyan + '33',
                  color: r.source === 'db' ? TOKENS.violet : TOKENS.cyan,
                  borderRadius: 1, letterSpacing: 0.5, fontWeight: 600,
                }}>{r.source.toUpperCase()}</span>
              </div>
              <div style={{ fontSize: 9, color: TOKENS.dim }}>
                {r.block} · {r.cell} · {r.path} · {r.operator} · {fmtT(r.duration)} · {r.alarms}A
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Meta({ label, value, color }) {
  return (
    <span>
      <span style={{ color: TOKENS.muted }}>{label} </span>
      <span style={{ color: color || TOKENS.text }}>{value}</span>
    </span>
  );
}

// 백엔드 응답({ name, columns, data }) → 분석 화면이 쓰는 D 형태 빌드.
// 비수치 컬럼은 그대로 두되 차트에선 자동 제외됨. ranges/N/cols 등 derived 필드 계산.
function buildAnalysisD(json) {
  const cols = json.columns || [];
  const data = json.data || {};
  let N = 0;
  for (const c of cols) {
    if (Array.isArray(data[c])) N = Math.max(N, data[c].length);
  }
  const ranges = {};
  for (const c of cols) {
    const arr = data[c];
    if (!Array.isArray(arr)) {
      ranges[c] = [0, 1];   // 비수치/누락 컬럼도 destructure 안전하게
      continue;
    }
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (typeof v === 'number' && !Number.isNaN(v)) {
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
    }
    if (mn === Infinity) { mn = 0; mx = 1; }
    if (mn === mx) { mn -= 0.5; mx += 0.5; }
    ranges[c] = [mn, mx];
  }
  // x축 = "타이머" (레코딩 시작부터의 경과초). robot_timestamp_s 가 있으면 그
  // 값에서 첫 샘플을 빼서 0부터 시작하게 만든다. 절대 타임스탬프는 fmtT(mm:ss)
  // 와 맞지 않아서 그대로 쓰면 안 됨.
  let rawT;
  if (Array.isArray(data['robot_timestamp_s'])) {
    rawT = data['robot_timestamp_s'];
  } else if (Array.isArray(data['received_wall_time_s'])) {
    rawT = data['received_wall_time_s'];
  } else if (Array.isArray(data['timestamp'])) {
    rawT = data['timestamp'];
  } else {
    rawT = null;
  }
  let t;
  if (rawT && rawT.length > 0 && typeof rawT[0] === 'number') {
    const t0 = rawT[0];
    t = rawT.map(v => (typeof v === 'number' ? v - t0 : 0));
  } else {
    // 타임스탬프 컬럼 없으면 인덱스 = 초 (125Hz 가정으로 보정해도 좋지만 모르면 그냥 i)
    t = Array.from({ length: N }, (_, i) => i);
  }
  // __timer__ 가상 컬럼: 산점도 X/Y에서 "경과초"를 선택할 수 있도록 samples/ranges
  // 에는 노출하되 cols(변수 브라우저용)에는 넣지 않음. VarPick 이 자체적으로 옵션
  // 맨 앞에 __timer__ 를 prepend 한다.
  const tEnd = t.length > 0 ? t[t.length - 1] : 1;
  const samplesWithTimer = { ...data, __timer__: t };
  const rangesWithTimer = { ...ranges, __timer__: [0, tEnd > 0 ? tEnd : 1] };
  return {
    N, DT: 1, t, cols,
    samples: samplesWithTimer,
    ranges: rangesWithTimer,
    // 레거시 호환 (모킹 데이터 metadata)
    categories: {},
    koLabels: { __timer__: 'timer (경과초)' },
    units: { __timer__: 's' },
    alarms: [],
    gpMapping: window.RTDE?.gpMapping || {},
  };
}

function AnalysisStatusPanel({ kind, filename, error, library, changeRecording }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 14, padding: 32,
      background: TOKENS.bg,
      fontFamily: 'JetBrains Mono, monospace',
      color: TOKENS.dim,
    }}>
      <div style={{
        width: 56, height: 56,
        border: `1px solid ${kind === 'error' ? TOKENS.red : TOKENS.border}`,
        borderRadius: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: kind === 'error' ? TOKENS.red : TOKENS.muted, fontSize: 24,
      }}>{kind === 'error' ? '⚠' : '↻'}</div>
      <div style={{ color: TOKENS.text, fontSize: 14, fontWeight: 500 }}>
        {kind === 'loading' ? 'CSV 로딩 중…' : '데이터를 불러오지 못했습니다'}
      </div>
      <div style={{ fontSize: 11, color: TOKENS.muted }}>
        {filename || '—'}
      </div>
      {kind === 'error' && error && (
        <div style={{
          maxWidth: 520, padding: '10px 14px',
          background: TOKENS.red + '15',
          border: `1px solid ${TOKENS.red}55`,
          color: TOKENS.red, fontSize: 11,
          whiteSpace: 'pre-wrap',
        }}>{error}</div>
      )}
      {kind === 'error' && library && library.length > 0 && (
        <div style={{ fontSize: 10, color: TOKENS.muted, marginTop: 8 }}>
          다른 레코딩 선택:
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
            {library.slice(0, 8).map(r => (
              <button key={r.id} onClick={() => changeRecording(r.id)}
                style={{
                  padding: '6px 12px',
                  background: 'transparent',
                  border: `1px solid ${TOKENS.border}`,
                  color: TOKENS.text,
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 10, cursor: 'pointer',
                  textAlign: 'left',
                }}>
                {r.filename || r.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AnalysisEmptyState({ library, changeRecording }) {
  const hasLibrary = Array.isArray(library) && library.length > 0;
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 16, padding: 32,
      background: TOKENS.bg,
      fontFamily: 'JetBrains Mono, monospace',
      color: TOKENS.dim,
    }}>
      <div style={{
        width: 56, height: 56,
        border: `1px solid ${TOKENS.border}`,
        borderRadius: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: TOKENS.muted, fontSize: 24,
      }}>⟁</div>
      <div style={{ color: TOKENS.text, fontSize: 14, fontWeight: 500 }}>
        분석할 레코딩이 없습니다
      </div>
      {!hasLibrary ? (
        <div style={{ fontSize: 11, textAlign: 'center', maxWidth: 420, lineHeight: 1.7 }}>
          백엔드에 저장된 레코딩이 아직 없거나, <code>/api/recordings</code> 응답이 비어있습니다.<br/>
          좌측 <span style={{ color: TOKENS.accent }}>레코딩</span> 탭에서 새 레코딩을 시작하거나,<br/>
          기존 CSV를 <code>backend/recordings/</code> 디렉터리에 두면 자동 인식됩니다.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 11, textAlign: 'center' }}>
            라이브러리에 {library.length}건이 있으나 아무것도 선택되지 않았습니다.
          </div>
          <div style={{
            width: 'min(560px, 90%)',
            maxHeight: 280, overflowY: 'auto',
            border: `1px solid ${TOKENS.border}`,
            background: TOKENS.panel,
          }}>
            {library.map(r => (
              <button key={r.id}
                onClick={() => changeRecording(r.id)}
                style={{
                  display: 'block', width: '100%',
                  padding: '10px 14px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `1px solid ${TOKENS.border}`,
                  color: TOKENS.text, textAlign: 'left',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 11, cursor: 'pointer',
                }}>
                <div style={{ color: TOKENS.text }}>{r.name}</div>
                <div style={{ fontSize: 9, color: TOKENS.dim, marginTop: 2 }}>
                  {(r.block || '—')} · {(r.cell || '—')} · {(r.operator || '—')} · {r.samples || 0} 샘플
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

window.ScreenAnalysis = ScreenAnalysis;
