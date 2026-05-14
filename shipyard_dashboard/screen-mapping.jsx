// Screen: GP 매핑 / Modbus 명세 에디터
// 두 개 탭으로 구성:
//   - RTDE GP : gp_mapping.yaml (RTDE output_double_register → CSV 컬럼)
//   - Modbus 명세 : modbus_registers.json (레지스터 정의 — name/kind/scale/valueMap 등)

function ScreenMapping() {
  const [tab, setTab] = React.useState('rtde');
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      minHeight: 0, background: TOKENS.bg,
    }}>
      <MappingTabBar tab={tab} setTab={setTab} />
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {tab === 'rtde' && <RtdeMappingTab />}
        {tab === 'modbus' && <ModbusRegistersTab />}
      </div>
    </div>
  );
}

function MappingTabBar({ tab, setTab }) {
  const tabs = [
    { id: 'rtde',   label: 'RTDE GP',      sub: 'gp_mapping.json',          color: TOKENS.accent },
    { id: 'modbus', label: 'Modbus 명세',  sub: 'modbus_registers.json',    color: TOKENS.violet },
  ];
  return (
    <div style={{
      display: 'flex', alignItems: 'stretch',
      background: TOKENS.panel2,
      borderBottom: `1px solid ${TOKENS.border}`,
      flex: '0 0 auto',
    }}>
      {tabs.map(t => {
        const on = tab === t.id;
        return (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: '12px 22px',
              background: on ? TOKENS.bg : 'transparent',
              border: 'none',
              borderBottom: `2px solid ${on ? t.color : 'transparent'}`,
              color: on ? TOKENS.text : TOKENS.dim,
              fontFamily: 'JetBrains Mono, monospace',
              cursor: 'pointer',
              display: 'flex', flexDirection: 'column', gap: 2,
              textAlign: 'left',
            }}>
            <span style={{ fontSize: 12, letterSpacing: 0.6 }}>{t.label}</span>
            <span style={{ fontSize: 9, color: TOKENS.muted, letterSpacing: 0.6 }}>{t.sub}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── RTDE GP 매핑 탭 ───────────────────────────────────────────────
// Modbus 명세 탭과 동일 구조:
//   1. 표 보기: 현재 매핑을 행 단위로 한눈에. 검색 가능.
//   2. JSON 편집: 원본 텍스트 에디터. 검증 후 백엔드에 저장.
// 저장은 /api/mapping (POST), 저장본 삭제는 DELETE.
function RtdeMappingTab() {
  const D = window.RTDE;
  const [mode, setMode] = React.useState('table'); // 'table' | 'json'
  const [search, setSearch] = React.useState('');

  // JSON 에디터 상태
  const [json, setJson] = React.useState('');
  const [jsonDirty, setJsonDirty] = React.useState(false);
  const [source, setSource] = React.useState('local'); // local | backend
  const [saveState, setSaveState] = React.useState('idle');
  const [lastError, setLastError] = React.useState(null);

  // 파싱된 매핑 (표 보기용)
  const parsed = React.useMemo(() => {
    try {
      const obj = JSON.parse(json || '{}');
      const freq = typeof obj.frequency === 'number' ? obj.frequency : null;
      const list = Array.isArray(obj.mapping) ? obj.mapping : [];
      return { ok: true, frequency: freq, mapping: list, error: null };
    } catch (err) {
      return { ok: false, frequency: null, mapping: [], error: String(err) };
    }
  }, [json]);

  // 기본 템플릿 — 파일 없을 때 보임. window.RTDE 의 gpMapping 으로 빌드.
  const buildDefault = React.useCallback(() => {
    const obj = {
      frequency: 125,
      mapping: Object.entries(D.gpMapping || {}).map(([reg, def]) => ({
        register: reg,
        col: def.col,
        scale: def.scale,
        label: D.koLabels?.[def.col] || def.col,
        unit: D.units?.[def.col] || '',
      })),
    };
    return JSON.stringify(obj, null, 2);
  }, [D]);

  // 마운트: 백엔드 저장본 로드 → 없거나 비어있으면 default 생성
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/mapping');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (cancelled) return;
        if (text && text.trim().length > 0) {
          setJson(text);
          setSource('backend');
        } else {
          setJson(buildDefault());
          setSource('local');
        }
        setJsonDirty(false);
      } catch (err) {
        if (cancelled) return;
        setJson(buildDefault());
        setSource('local');
      }
    })();
    return () => { cancelled = true; };
  }, [buildDefault]);

  const filtered = parsed.mapping.filter(e => {
    if (!search) return true;
    const s = search.toLowerCase();
    return String(e.register || '').toLowerCase().includes(s) ||
           String(e.col || '').toLowerCase().includes(s) ||
           String(e.label || '').toLowerCase().includes(s);
  });

  const handleSave = async () => {
    setSaveState('saving');
    setLastError(null);
    try {
      const res = await fetch('/api/mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: json }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
      setJsonDirty(false);
      setSource('backend');
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1500);
    } catch (err) {
      setSaveState('error');
      setLastError(String(err));
    }
  };

  const handleReset = async () => {
    if (!confirm('백엔드 저장본을 삭제하시겠어요? 새로고침 시 하드코딩 기본값으로 돌아갑니다.')) return;
    try {
      await fetch('/api/mapping', { method: 'DELETE' });
      setJson(buildDefault());
      setSource('local');
      setJsonDirty(false);
    } catch (err) {
      setLastError(String(err));
    }
  };

  const reloadFromCurrent = () => {
    setJson(buildDefault());
    setJsonDirty(true);
  };

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      minHeight: 0, background: TOKENS.bg,
    }}>
      {/* 헤더: 모드 토글 + 액션 */}
      <div style={{
        padding: '10px 14px',
        borderBottom: `1px solid ${TOKENS.border}`,
        display: 'flex', alignItems: 'center', gap: 10,
        background: TOKENS.panel2,
        flexWrap: 'wrap',
        flex: '0 0 auto',
      }}>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 11, color: TOKENS.text,
        }}>gp_mapping.json</span>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10, color: TOKENS.dim,
        }}>· {parsed.mapping.length} 매핑
          {parsed.frequency != null && <> · {parsed.frequency}Hz</>}
          {' · '}
          <span style={{ color: source === 'backend' ? TOKENS.green : TOKENS.amber }}>
            {source === 'backend' ? 'backend 저장본' : 'local (하드코딩)'}
          </span>
        </span>
        {jsonDirty && <span style={{ width: 6, height: 6, background: TOKENS.amber, borderRadius: '50%' }} />}
        {!parsed.ok && (
          <span title={parsed.error || ''} style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10, color: TOKENS.red,
          }}>JSON 파싱 오류</span>
        )}
        {saveState === 'error' && (
          <span title={lastError || ''} style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10, color: TOKENS.red,
          }}>저장 실패</span>
        )}
        <span style={{ flex: 1 }} />

        {/* 모드 토글 */}
        <div style={{ display: 'inline-flex', gap: 1, background: TOKENS.border, padding: 1, borderRadius: 2 }}>
          {[['table', '표 보기'], ['json', 'JSON 편집']].map(([k, label]) => (
            <button key={k} onClick={() => setMode(k)}
              style={{
                padding: '5px 12px',
                background: mode === k ? TOKENS.bg : TOKENS.panel2,
                color: mode === k ? TOKENS.accent : TOKENS.dim,
                border: 'none',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10, letterSpacing: 0.5,
                cursor: 'pointer',
                borderRadius: 1,
              }}>
              {label}
            </button>
          ))}
        </div>

        <button style={mapBtn} onClick={reloadFromCurrent}
          title="에디터 내용을 현재 프론트엔드 정의로 초기화">
          현재 정의 불러오기
        </button>
        <button style={mapBtn} onClick={handleReset}
          title="저장본 삭제 (기본값으로 복원)">
          저장본 삭제
        </button>
        <button
          disabled={saveState === 'saving' || !jsonDirty}
          style={{
            ...mapBtn,
            background: jsonDirty ? TOKENS.accent : TOKENS.border,
            color: jsonDirty ? '#0a0f1c' : TOKENS.dim,
            border: 'none', fontWeight: 600,
            cursor: saveState === 'saving' ? 'wait' : (jsonDirty ? 'pointer' : 'not-allowed'),
          }}
          onClick={handleSave}>
          {saveState === 'saving' ? '저장 중…' : '저장'}
        </button>
      </div>

      {/* 표 보기 모드 */}
      {mode === 'table' && (
        <>
          <div style={{
            padding: '8px 14px',
            borderBottom: `1px solid ${TOKENS.border}`,
            display: 'flex', alignItems: 'center', gap: 8,
            flex: '0 0 auto', flexWrap: 'wrap',
          }}>
            <span style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10, color: TOKENS.dim, letterSpacing: 0.8,
            }}>RTDE GP register → CSV/DB 컬럼명</span>
            <span style={{ flex: 1 }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="레지스터·컬럼·라벨 검색"
              style={{
                background: TOKENS.bg, border: `1px solid ${TOKENS.border}`,
                color: TOKENS.text, fontFamily: 'JetBrains Mono, monospace',
                fontSize: 11, padding: '5px 10px', borderRadius: 2, outline: 'none', width: 220,
              }} />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            <table style={{
              width: '100%', borderCollapse: 'collapse',
              fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
            }}>
              <thead style={{
                position: 'sticky', top: 0,
                background: TOKENS.panel2,
                color: TOKENS.muted, fontSize: 9, letterSpacing: 0.8,
                textTransform: 'uppercase',
              }}>
                <tr>
                  <th style={{ ...thStyle, textAlign: 'left' }}>레지스터</th>
                  <th style={{ ...thStyle, textAlign: 'left' }}>col (컬럼명)</th>
                  <th style={{ ...thStyle, textAlign: 'left' }}>label (한글)</th>
                  <th style={thStyle}>단위</th>
                  <th style={thStyle}>scale</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e, i) => (
                  <tr key={`${e.register}-${i}`}
                    style={{
                      borderBottom: `1px solid ${TOKENS.border}`,
                    }}>
                    <td style={{ ...tdStyle, color: TOKENS.cyan }}>{e.register || '—'}</td>
                    <td style={{ ...tdStyle, color: TOKENS.accent, fontWeight: 500 }}>{e.col || '—'}</td>
                    <td style={{ ...tdStyle, color: TOKENS.text }}>{e.label || ''}</td>
                    <td style={{ ...tdStyle, textAlign: 'center', color: TOKENS.dim }}>
                      {e.unit || ''}
                    </td>
                    <td style={{
                      ...tdStyle, textAlign: 'center',
                      color: (e.scale != null && e.scale !== 1) ? TOKENS.amber : TOKENS.dim,
                    }}>
                      {e.scale != null ? `×${e.scale}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div style={{
                padding: 24, textAlign: 'center', color: TOKENS.muted,
                fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
              }}>
                {parsed.mapping.length === 0
                  ? 'gp_mapping.json 의 mapping[] 가 비어있습니다'
                  : '일치하는 항목 없음'}
              </div>
            )}
          </div>
        </>
      )}

      {/* JSON 편집 모드 */}
      {mode === 'json' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{
            padding: '8px 14px',
            borderBottom: `1px solid ${TOKENS.border}`,
            background: TOKENS.panel2,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10, color: TOKENS.dim, lineHeight: 1.6,
            flex: '0 0 auto',
          }}>
            <span style={{ color: TOKENS.text }}>// 구조</span>{' '}
            <code style={{ color: TOKENS.cyan }}>{'{ frequency: 125, mapping: [...] }'}</code>
            <span style={{ color: TOKENS.muted }}>  ·  </span>
            매핑 항목: <code style={{ color: TOKENS.amber }}>{'{ register, col, scale, label, unit }'}</code>
          </div>
          <textarea
            value={json}
            onChange={(e) => { setJson(e.target.value); setJsonDirty(true); }}
            spellCheck={false}
            style={{
              flex: 1, minHeight: 0,
              background: TOKENS.bg, color: TOKENS.text,
              border: 'none', outline: 'none', resize: 'none',
              padding: 14,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 12, lineHeight: 1.6,
              tabSize: 2,
            }} />
        </div>
      )}
    </div>
  );
}

const mapBtn = {
  background: TOKENS.panel2,
  border: `1px solid ${TOKENS.border}`,
  color: TOKENS.dim,
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 10, padding: '4px 10px',
  borderRadius: 2, cursor: 'pointer', letterSpacing: 0.5,
};

function colorizeYaml2(line) {
  if (/^\s*#/.test(line)) {
    return <span style={{ color: TOKENS.muted, fontStyle: 'italic' }}>{line || '\u00a0'}</span>;
  }
  const m = line.match(/^(\s*)([\w\d_]+)(\s*:)(\s*)(.*)$/);
  if (m) {
    const [, indent, key, colon, sp, val] = m;
    let valStyle = { color: TOKENS.text };
    if (/^["']/.test(val)) valStyle = { color: TOKENS.green };
    else if (/^-?\d/.test(val)) valStyle = { color: TOKENS.amber };
    else if (/^\[/.test(val)) valStyle = { color: TOKENS.cyan };
    return (
      <>
        <span>{indent}</span>
        <span style={{ color: TOKENS.accent }}>{key}</span>
        <span style={{ color: TOKENS.muted }}>{colon}</span>
        <span>{sp}</span>
        <span style={valStyle}>{val || '\u00a0'}</span>
      </>
    );
  }
  return <span>{line || '\u00a0'}</span>;
}

// ─── Modbus 레지스터 명세 탭 ────────────────────────────────────────
// 두 가지 모드:
//   1. 표 보기: 그룹별로 모든 레지스터를 한눈에. 행 클릭 시 valueMap/bits/packed 펼침.
//   2. JSON 편집: 원본 JSON 텍스트 에디터. 검증 후 백엔드에 저장.
// 저장된 정의는 새로고침 시 [data-modbus.js] 가 fetch 해서 hot-swap.
function ModbusRegistersTab() {
  const M = window.MODBUS;
  const [mode, setMode] = React.useState('table'); // 'table' | 'json'
  const [groupFilter, setGroupFilter] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const [expanded, setExpanded] = React.useState(new Set());
  const [showReserved, setShowReserved] = React.useState(false);
  const [showGuide, setShowGuide] = React.useState(false);

  // JSON 에디터 상태
  const [json, setJson] = React.useState('');
  const [jsonDirty, setJsonDirty] = React.useState(false);
  const [source, setSource] = React.useState('local'); // local | backend
  const [saveState, setSaveState] = React.useState('idle');
  const [lastError, setLastError] = React.useState(null);

  // 마운트 시 백엔드 저장본 fetch. 없으면 현재 프론트엔드 정의로 시드.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/modbus/registers');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.saved && data.text) {
          setJson(data.text);
          setSource('backend');
        } else {
          setJson(M.exportJSON ? M.exportJSON() : JSON.stringify({ registers: M.registers, groups: M.groups }, null, 2));
          setSource('local');
        }
        setJsonDirty(false);
      } catch (err) {
        if (cancelled) return;
        setJson(M.exportJSON ? M.exportJSON() : JSON.stringify({ registers: M.registers, groups: M.groups }, null, 2));
        setSource('local');
      }
    })();
    return () => { cancelled = true; };
  }, []);  // eslint-disable-line

  const toggleExpand = (a) => {
    const next = new Set(expanded);
    if (next.has(a)) next.delete(a); else next.add(a);
    setExpanded(next);
  };

  const filtered = M.registers.filter(r => {
    if (!showReserved && r.status !== 'active') return false;
    if (groupFilter !== 'all' && r.grp !== groupFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!String(r.a).includes(s) &&
          !r.name.toLowerCase().includes(s) &&
          !(r.en || '').toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const handleSave = async () => {
    setSaveState('saving');
    setLastError(null);
    try {
      const res = await fetch('/api/modbus/registers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: json }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
      setJsonDirty(false);
      setSource('backend');
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1500);
    } catch (err) {
      setSaveState('error');
      setLastError(String(err));
    }
  };

  const handleReset = async () => {
    if (!confirm('백엔드 저장본을 삭제하시겠어요? 새로고침 시 하드코딩 기본값으로 돌아갑니다.')) return;
    try {
      await fetch('/api/modbus/registers', { method: 'DELETE' });
      setJson(M.exportJSON ? M.exportJSON() : '');
      setSource('local');
      setJsonDirty(false);
    } catch (err) {
      setLastError(String(err));
    }
  };

  const reloadFromCurrent = () => {
    setJson(M.exportJSON ? M.exportJSON() : JSON.stringify({ registers: M.registers, groups: M.groups }, null, 2));
    setJsonDirty(true);
  };

  return (
    <div style={{
      flex: 1, display: 'flex',
      minHeight: 0, background: TOKENS.bg,
    }}>
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        minHeight: 0, minWidth: 0,
      }}>
      {/* 헤더: 모드 토글 + 필터 + 저장 버튼 */}
      <div style={{
        padding: '10px 14px',
        borderBottom: `1px solid ${TOKENS.border}`,
        display: 'flex', alignItems: 'center', gap: 10,
        background: TOKENS.panel2,
        flexWrap: 'wrap',
        flex: '0 0 auto',
      }}>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 11, color: TOKENS.text,
        }}>modbus_registers.json</span>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10, color: TOKENS.dim,
        }}>· {M.registers.length} 레지스터 · {' '}
          <span style={{ color: source === 'backend' ? TOKENS.green : TOKENS.amber }}>
            {source === 'backend' ? 'backend 저장본' : 'local (하드코딩)'}
          </span>
        </span>
        {jsonDirty && <span style={{ width: 6, height: 6, background: TOKENS.amber, borderRadius: '50%' }} />}
        {saveState === 'error' && (
          <span title={lastError || ''} style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10, color: TOKENS.red,
          }}>저장 실패</span>
        )}
        <span style={{ flex: 1 }} />

        {/* 모드 토글 */}
        <div style={{ display: 'inline-flex', gap: 1, background: TOKENS.border, padding: 1, borderRadius: 2 }}>
          {[['table', '표 보기'], ['json', 'JSON 편집']].map(([k, label]) => (
            <button key={k} onClick={() => setMode(k)}
              style={{
                padding: '5px 12px',
                background: mode === k ? TOKENS.bg : TOKENS.panel2,
                color: mode === k ? TOKENS.accent : TOKENS.dim,
                border: 'none',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10, letterSpacing: 0.5,
                cursor: 'pointer',
                borderRadius: 1,
              }}>
              {label}
            </button>
          ))}
        </div>

        <button style={mapBtn} onClick={reloadFromCurrent} title="에디터 내용을 현재 프론트엔드 정의로 초기화">
          현재 정의 불러오기
        </button>
        <button style={mapBtn} onClick={handleReset} title="저장본 삭제 (기본값으로 복원)">
          저장본 삭제
        </button>
        <button
          style={{
            ...mapBtn,
            background: showGuide ? TOKENS.violet + '33' : TOKENS.panel2,
            color: showGuide ? TOKENS.violet : TOKENS.dim,
            borderColor: showGuide ? TOKENS.violet : TOKENS.border,
          }}
          onClick={() => setShowGuide(s => !s)}
          title="JSON 스키마 가이드">
          📖 가이드
        </button>
        <button
          disabled={saveState === 'saving' || !jsonDirty}
          style={{
            ...mapBtn,
            background: jsonDirty ? TOKENS.accent : TOKENS.border,
            color: jsonDirty ? '#0a0f1c' : TOKENS.dim,
            border: 'none', fontWeight: 600,
            cursor: saveState === 'saving' ? 'wait' : (jsonDirty ? 'pointer' : 'not-allowed'),
          }}
          onClick={handleSave}>
          {saveState === 'saving' ? '저장 중…' : '저장'}
        </button>
      </div>

      {/* 표 보기 모드 */}
      {mode === 'table' && (
        <>
          <div style={{
            padding: '8px 14px',
            borderBottom: `1px solid ${TOKENS.border}`,
            display: 'flex', alignItems: 'center', gap: 8,
            flex: '0 0 auto', flexWrap: 'wrap',
          }}>
            <TabBtnLite active={groupFilter === 'all'} onClick={() => setGroupFilter('all')}
              label="전체" color={TOKENS.dim} />
            {Object.values(M.groups).map(g => (
              <TabBtnLite key={g.id} active={groupFilter === g.id}
                onClick={() => setGroupFilter(g.id)}
                label={g.label} sub={g.range} color={g.color} />
            ))}
            <span style={{ flex: 1 }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="주소·이름 검색"
              style={{
                background: TOKENS.bg, border: `1px solid ${TOKENS.border}`,
                color: TOKENS.text, fontFamily: 'JetBrains Mono, monospace',
                fontSize: 11, padding: '5px 10px', borderRadius: 2, outline: 'none', width: 200,
              }} />
            <label style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10, color: TOKENS.dim, cursor: 'pointer',
            }}>
              <input type="checkbox" checked={showReserved}
                onChange={(e) => setShowReserved(e.target.checked)}
                style={{ accentColor: TOKENS.accent }} />
              예약/미사용 표시
            </label>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            <table style={{
              width: '100%', borderCollapse: 'collapse',
              fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
            }}>
              <thead style={{
                position: 'sticky', top: 0,
                background: TOKENS.panel2,
                color: TOKENS.muted, fontSize: 9, letterSpacing: 0.8,
                textTransform: 'uppercase',
              }}>
                <tr>
                  <th style={thStyle}>주소</th>
                  <th style={{ ...thStyle, textAlign: 'left' }}>이름</th>
                  <th style={{ ...thStyle, textAlign: 'left' }}>en</th>
                  <th style={thStyle}>유형</th>
                  <th style={thStyle}>단위</th>
                  <th style={thStyle}>범위</th>
                  <th style={thStyle}>scale</th>
                  <th style={thStyle}>상태</th>
                  <th style={{ ...thStyle, textAlign: 'left' }}>설명</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const grpColor = M.groups[r.grp]?.color || TOKENS.dim;
                  const hasExtras = r.valueMap || r.bits || r.packed || r.errorMap || r.contextMap;
                  const isOpen = expanded.has(r.a);
                  return (
                    <React.Fragment key={r.a}>
                      <tr onClick={() => hasExtras && toggleExpand(r.a)}
                        style={{
                          borderBottom: `1px solid ${TOKENS.border}`,
                          cursor: hasExtras ? 'pointer' : 'default',
                          background: isOpen ? TOKENS.panel : 'transparent',
                        }}>
                        <td style={{ ...tdStyle, color: grpColor, fontWeight: 600, textAlign: 'center' }}>
                          {hasExtras && (<span style={{ marginRight: 4, color: TOKENS.dim }}>{isOpen ? '▼' : '▸'}</span>)}
                          {r.a}
                        </td>
                        <td style={tdStyle}>{r.name}</td>
                        <td style={{ ...tdStyle, color: TOKENS.muted, fontSize: 10 }}>{r.en || ''}</td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <span style={{
                            padding: '1px 6px', borderRadius: 1,
                            background: kindColorBg(r.kind),
                            color: kindColorFg(r.kind),
                            fontSize: 9, letterSpacing: 0.4,
                          }}>{r.kind}</span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>{r.unit || ''}</td>
                        <td style={{ ...tdStyle, textAlign: 'center', color: TOKENS.dim, fontSize: 10 }}>
                          {r.range ? `${r.range[0]}~${r.range[1]}` : ''}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center', color: r.scale ? TOKENS.amber : TOKENS.dim }}>
                          {r.scale ? `×${r.scale}` : ''}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <span style={{
                            color: r.status === 'active' ? TOKENS.green : r.status === 'reserved' ? TOKENS.muted : TOKENS.amber,
                            fontSize: 9,
                          }}>{r.status}</span>
                        </td>
                        <td style={{ ...tdStyle, color: TOKENS.dim, fontSize: 10 }}>{r.desc || ''}</td>
                      </tr>
                      {isOpen && hasExtras && (
                        <tr style={{ background: TOKENS.bg }}>
                          <td colSpan={9} style={{ padding: '10px 16px 12px 40px' }}>
                            <RegisterExtras r={r} grpColor={grpColor} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div style={{
                padding: 24, textAlign: 'center', color: TOKENS.muted,
                fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
              }}>일치하는 레지스터 없음</div>
            )}
          </div>
        </>
      )}

      {/* JSON 편집 모드 */}
      {mode === 'json' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{
            padding: '8px 14px',
            borderBottom: `1px solid ${TOKENS.border}`,
            background: TOKENS.panel2,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10, color: TOKENS.dim, lineHeight: 1.6,
            flex: '0 0 auto',
          }}>
            <span style={{ color: TOKENS.text }}>// 구조</span> <code style={{ color: TOKENS.cyan }}>{'{ registers: [...], groups: {...} }'}</code>
            <span style={{ color: TOKENS.muted }}>  ·  </span>
            레지스터 항목: <code style={{ color: TOKENS.amber }}>a/name/en/grp/unit/kind/range/scale/status/desc/valueMap/bits/packed/errorMap/contextMap</code>
          </div>
          <textarea
            value={json}
            onChange={(e) => { setJson(e.target.value); setJsonDirty(true); }}
            spellCheck={false}
            style={{
              flex: 1, minHeight: 0,
              background: TOKENS.bg, color: TOKENS.text,
              border: 'none', outline: 'none', resize: 'none',
              padding: 14,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 12, lineHeight: 1.6,
              tabSize: 2,
            }} />
        </div>
      )}
      </div>

      {showGuide && <SchemaGuidePanel onClose={() => setShowGuide(false)} />}
    </div>
  );
}

// ─── 스키마 가이드 패널 ────────────────────────────────────────────
// 우측 슬라이드 패널. modbus_registers.json 의 구조 / 필드 / 예시 설명.
function SchemaGuidePanel({ onClose }) {
  return (
    <aside style={{
      width: 440, flex: '0 0 auto',
      borderLeft: `1px solid ${TOKENS.border}`,
      background: TOKENS.panel,
      display: 'flex', flexDirection: 'column',
      minHeight: 0, overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 14px',
        borderBottom: `1px solid ${TOKENS.border}`,
        display: 'flex', alignItems: 'center', gap: 8,
        background: TOKENS.panel2,
        flex: '0 0 auto',
      }}>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 11, color: TOKENS.violet, letterSpacing: 1.2, fontWeight: 600,
        }}>📖 JSON 스키마 가이드</span>
        <span style={{ flex: 1 }} />
        <button onClick={onClose}
          style={{
            background: 'transparent', border: 'none',
            color: TOKENS.dim, cursor: 'pointer', fontSize: 18,
          }}>×</button>
      </div>
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: '14px 18px',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11, color: TOKENS.dim, lineHeight: 1.7,
      }}>
        <GuideSection title="최상위 구조">
          <CodeBlock>{`{
  "registers": [ ... ],   // 레지스터 정의 배열
  "groups":    { ... },   // 그룹 메타 (필터 탭, 색)
  "layout":    { ... }    // 화면 슬롯 ↔ 주소 매핑
}`}</CodeBlock>
          세 필드 모두 선택적입니다. 빠진 필드는 하드코딩 기본값을 사용합니다.
        </GuideSection>

        <GuideSection title="registers[] 항목">
          <CodeBlock>{`{
  "a":      128,            // 모드버스 주소 (필수)
  "name":   "하트비트",      // 한글 이름
  "en":     "heartbeat",    // 영문 키 (CSV 컬럼 등)
  "grp":    "rp",           // 그룹 id (groups 의 키와 일치)
  "unit":   "A",            // 단위 (없으면 "")
  "kind":   "value",        // 타입 → 아래 참조
  "range":  [0, 600],       // 표시값의 범위
  "scale":  10,             // raw ÷ scale = display (선택)
  "status": "active",       // active | reserved | unused
  "desc":   "실제 용접 전류"
}`}</CodeBlock>
        </GuideSection>

        <GuideSection title="kind 종류">
          <KindList />
        </GuideSection>

        <GuideSection title="valueMap (enum / bool 라벨)">
          <CodeBlock>{`"valueMap": {
  "0": "정지",
  "1": "동작"
}`}</CodeBlock>
          raw 값 → 한국어 라벨 매핑. <b>0-indexed / 1-indexed 어느 쪽도 가능</b>.
          enum 과 bool 모두에 적용. bool 은 키 0/1 만 의미 있음.
        </GuideSection>

        <GuideSection title="bits[] (비트필드 분해)">
          <CodeBlock>{`"bits": [
  { "bit": 4, "name": "STICK 인식",
    "enum": { "0": "미검출", "1": "검출" } },
  { "bit": 5, "name": "WCR 검출" },
  { "bit": 8, "name": "Heartbeat" }
]`}</CodeBlock>
          각 비트의 의미. <code style={codeInline}>enum</code> 으로 ON/OFF 대신 라벨 지정 가능.
        </GuideSection>

        <GuideSection title="packed[] (다중 비트 sub-field)">
          <CodeBlock>{`"packed": [
  { "name": "Longi 좌", "bits": [0, 1],
    "valueMap": {"0":"X","1":"L","2":"C","3":"R"} },
  { "name": "시작→구간1", "bits": [0, 7],
    "domain": [0, 100] },
  { "name": "고정값", "bits": [15, 15],
    "expect": 1 }
]`}</CodeBlock>
          <code style={codeInline}>bits</code> = [lo, hi]. width = hi-lo+1.
          <br/><code style={codeInline}>valueMap</code> / <code style={codeInline}>domain</code> / <code style={codeInline}>expect</code> 셋 중 사용.
        </GuideSection>

        <GuideSection title="errorMap (에러 코드 사전)">
          <CodeBlock>{`"errorMap": {
  "131": {
    "name":   "E131 WCR 신호 부재",
    "cause":  "용접 신호 송출 후 WCR 신호 미수신",
    "action": "1) 용접기 확인  2) 접지 확인"
  }
}`}</CodeBlock>
          <code style={codeInline}>kind:"code"</code> 와 함께 사용. value=0 → "정상", 정의된 값 → 에러명+원인+조치.
        </GuideSection>

        <GuideSection title="contextMap (2F/3F 컨텍스트 의존)">
          <CodeBlock>{`"contextMap": {
  "2F": {"1":"왼쪽","2":"오른쪽"},
  "3F": {"1":"아래","2":"위","3":"칼라","4":"칼라 바깥"}
}`}</CodeBlock>
          작업 컨텍스트(2F/3F)에 따라 의미가 달라지는 레지스터.
          <br/>또는 <code style={codeInline}>{`"2F": {"label":"왼쪽 스칼럽"}`}</code> 형식.
        </GuideSection>

        <GuideSection title="groups{} 그룹 정의">
          <CodeBlock>{`"groups": {
  "rp": { "id":"rp", "label":"로봇 → 팬던트",
          "short":"R→P", "range":"128–160",
          "color":"#ff6b35", "desc":"로봇 상태 보고" }
}`}</CodeBlock>
          새 그룹 추가 시 레지스터의 <code style={codeInline}>grp</code> 값과 키를 일치시켜야 함.
        </GuideSection>

        <GuideSection title="layout.hero (화면 상단 박스)">
          <CodeBlock>{`"hero": {
  "primary": {
    "addr": 130, "onLabel": "용접 중", "offLabel": "무부하",
    "color": "accent",
    "metas": [
      { "label": "셀",   "addr": 135 },
      { "label": "패스", "addr": 136, "of": 139 },
      { "label": "모드", "addr": 162 }
    ]
  },
  "big": [
    { "addr": 131, "color": "accent", "target": 133 },
    { "addr": 132, "color": "cyan",   "target": 134 }
  ],
  "small": [
    { "addr": 128, "label": "ROBOT HB" },
    { "addr": 142, "label": "ROBOT ERR", "code": true }
  ]
}`}</CodeBlock>
          <b>primary</b>: 좌측 큰 박스. bool addr + 인라인 metas.
          <br/><b>big</b>: 큰 숫자 박스 배열. <code style={codeInline}>target</code> 은 "목표 ___" sub.
          <br/><b>small</b>: 작은 박스 배열. <code style={codeInline}>code:true</code> 면 0=OK / 그 외=E___.
          <br/>색상: <code style={codeInline}>accent/cyan/green/red/violet/amber/text</code> 또는 hex.
        </GuideSection>

        <GuideSection title="layout.statusBar (화면 하단 띠)">
          <CodeBlock>{`"statusBar": {
  "items": [
    { "type": "live-tick" },
    { "type": "literal", "text": "POLL 250ms" },
    { "type": "addrs",   "label": "HEARTBEAT",
      "addrs": [128, 161], "format": "a / b" },
    { "type": "bits",    "label": "WCR/STICK",
      "addr": 211, "width": 8 },
    { "type": "code",    "label": "ERR", "addr": 142 }
  ]
}`}</CodeBlock>
          <b>type</b>: live-tick / literal / addrs / bits / code / addr.
          <br/>bits/code 항목은 자동으로 우측 정렬됨.
        </GuideSection>

        <GuideSection title="저장 / 적용 흐름">
          <ol style={{ paddingLeft: 18, margin: '4px 0', color: TOKENS.text }}>
            <li>JSON 편집 모드에서 수정</li>
            <li><b>저장</b> 버튼 → 백엔드에 <code style={codeInline}>modbus_registers.json</code> 작성</li>
            <li><b>페이지 새로고침</b> → data-modbus.js 가 저장본 fetch → R[]/groups/layout hot-swap</li>
            <li>실시간 모니터링 / HERO / StatusBar 가 새 정의로 동작</li>
          </ol>
        </GuideSection>

        <GuideSection title="문제 발생 시">
          <ul style={{ paddingLeft: 18, margin: '4px 0' }}>
            <li>UI가 깨졌으면 <b>저장본 삭제</b> 버튼으로 즉시 기본값 복원</li>
            <li>또는 프로젝트 루트의 <code style={codeInline}>modbus_registers.json</code> 직접 삭제</li>
            <li>저장 실패 시 헤더의 "저장 실패" 라벨에 마우스 올리면 에러 메시지 표시</li>
          </ul>
        </GuideSection>
      </div>
    </aside>
  );
}

function GuideSection({ title, children }) {
  return (
    <section style={{ marginBottom: 18 }}>
      <h3 style={{
        margin: '0 0 8px',
        fontSize: 11, fontWeight: 600,
        color: TOKENS.violet,
        letterSpacing: 0.6,
      }}>{title}</h3>
      <div>{children}</div>
    </section>
  );
}

function CodeBlock({ children }) {
  return (
    <pre style={{
      margin: '4px 0 6px',
      padding: '8px 10px',
      background: TOKENS.bg,
      border: `1px solid ${TOKENS.border}`,
      borderLeft: `2px solid ${TOKENS.violet}`,
      color: TOKENS.text,
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 10, lineHeight: 1.55,
      whiteSpace: 'pre',
      overflowX: 'auto',
    }}>{children}</pre>
  );
}

const codeInline = {
  background: TOKENS.bg,
  padding: '0 4px',
  border: `1px solid ${TOKENS.border}`,
  borderRadius: 2,
  color: TOKENS.amber,
  fontSize: 10,
};

function KindList() {
  const kinds = [
    ['bool',     '0/1 두 상태. valueMap으로 라벨 지정 가능.'],
    ['enum',     '정수 코드 → 라벨. valueMap 필수 권장.'],
    ['value',    '수치값. unit/scale/range 적용.'],
    ['code',     '에러/상태 코드. 0=OK, 그 외 E___ 표시. errorMap 사용.'],
    ['bitfield', '비트 플래그. bits[] / packed[] 로 분해.'],
    ['counter',  '단조 증가 카운터 (하트비트 등).'],
    ['string',   '문자열 (드물게 사용).'],
  ];
  return (
    <table style={{
      borderCollapse: 'collapse', width: '100%',
      fontSize: 10,
    }}>
      <tbody>
        {kinds.map(([k, d]) => (
          <tr key={k} style={{ borderBottom: `1px solid ${TOKENS.border}33` }}>
            <td style={{ padding: '4px 0', width: 72, verticalAlign: 'top' }}>
              <code style={codeInline}>{k}</code>
            </td>
            <td style={{ padding: '4px 0', color: TOKENS.dim }}>{d}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// 상세 펼침: valueMap/bits/packed/errorMap/contextMap 시각화
function RegisterExtras({ r, grpColor }) {
  const blocks = [];

  if (r.valueMap) {
    blocks.push({
      title: 'valueMap',
      content: (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {Object.entries(r.valueMap).map(([k, v]) => (
            <span key={k} style={{
              padding: '2px 8px', background: TOKENS.panel, border: `1px solid ${TOKENS.border}`,
              borderRadius: 2, fontSize: 10,
            }}>
              <span style={{ color: TOKENS.muted }}>{k}</span>
              <span style={{ color: TOKENS.dim }}> → </span>
              <span style={{ color: TOKENS.text }}>{v}</span>
            </span>
          ))}
        </div>
      ),
    });
  }

  if (r.bits) {
    blocks.push({
      title: 'bits',
      content: (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))', gap: 4 }}>
          {r.bits.map(b => (
            <div key={b.bit} style={{
              padding: '4px 8px', background: TOKENS.panel, border: `1px solid ${TOKENS.border}`,
              fontSize: 10, display: 'flex', gap: 6, alignItems: 'baseline',
            }}>
              <span style={{ color: grpColor, fontWeight: 600 }}>bit{b.bit}</span>
              <span style={{ color: TOKENS.text }}>{b.name}</span>
              {b.enum && (
                <span style={{ color: TOKENS.muted, marginLeft: 'auto', fontSize: 9 }}>
                  0={b.enum[0]} · 1={b.enum[1]}
                </span>
              )}
            </div>
          ))}
        </div>
      ),
    });
  }

  if (r.packed) {
    blocks.push({
      title: 'packed',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {r.packed.map((p, i) => (
            <div key={i} style={{
              padding: '4px 8px', background: TOKENS.panel, border: `1px solid ${TOKENS.border}`,
              fontSize: 10, display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap',
            }}>
              <span style={{ color: grpColor, fontWeight: 600 }}>
                bit{p.bits[0]}{p.bits[0] !== p.bits[1] ? `–${p.bits[1]}` : ''}
              </span>
              <span style={{ color: TOKENS.text }}>{p.name}</span>
              {p.valueMap && (
                <span style={{ color: TOKENS.muted, fontSize: 9 }}>
                  {Object.entries(p.valueMap).map(([k, v]) => `${k}=${v}`).join(' · ')}
                </span>
              )}
              {p.domain && (
                <span style={{ color: TOKENS.muted, fontSize: 9 }}>
                  domain {p.domain[0]}~{p.domain[1]}
                </span>
              )}
              {p.expect !== undefined && (
                <span style={{ color: TOKENS.amber, fontSize: 9 }}>expect={p.expect}</span>
              )}
            </div>
          ))}
        </div>
      ),
    });
  }

  if (r.errorMap) {
    blocks.push({
      title: 'errorMap',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {Object.entries(r.errorMap).map(([k, e]) => (
            <div key={k} style={{
              padding: '4px 8px', background: TOKENS.panel, border: `1px solid ${TOKENS.border}`,
              fontSize: 10, display: 'flex', flexDirection: 'column', gap: 2,
            }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span style={{ color: TOKENS.red, fontWeight: 600 }}>{k}</span>
                <span style={{ color: TOKENS.text }}>{e.name}</span>
              </div>
              {e.cause && <div style={{ color: TOKENS.dim, fontSize: 9 }}>원인: {e.cause}</div>}
              {e.action && <div style={{ color: TOKENS.muted, fontSize: 9 }}>조치: {e.action}</div>}
            </div>
          ))}
        </div>
      ),
    });
  }

  if (r.contextMap) {
    blocks.push({
      title: 'contextMap (2F / 3F)',
      content: (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Object.entries(r.contextMap).map(([ctx, m]) => (
            <div key={ctx} style={{
              padding: '4px 8px', background: TOKENS.panel, border: `1px solid ${TOKENS.border}`,
              fontSize: 10, flex: '1 1 220px',
            }}>
              <div style={{ color: grpColor, fontWeight: 600, marginBottom: 2 }}>{ctx}</div>
              {m.label
                ? <div style={{ color: TOKENS.text }}>{m.label}</div>
                : Object.entries(m).map(([k, v]) => (
                    <div key={k} style={{ color: TOKENS.text }}>
                      <span style={{ color: TOKENS.muted }}>{k}</span> → {v}
                    </div>
                  ))}
            </div>
          ))}
        </div>
      ),
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {blocks.map((b, i) => (
        <div key={i}>
          <div style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 9, color: TOKENS.muted, letterSpacing: 1,
            marginBottom: 4, textTransform: 'uppercase',
          }}>{b.title}</div>
          {b.content}
        </div>
      ))}
    </div>
  );
}

function TabBtnLite({ active, onClick, label, sub, color }) {
  return (
    <button onClick={onClick}
      style={{
        padding: '4px 10px',
        background: active ? color + '22' : 'transparent',
        border: `1px solid ${active ? color : TOKENS.border}`,
        color: active ? color : TOKENS.dim,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10, letterSpacing: 0.4,
        cursor: 'pointer', borderRadius: 2,
        display: 'inline-flex', alignItems: 'baseline', gap: 6,
      }}>
      {label}
      {sub && <span style={{ fontSize: 8, color: TOKENS.muted }}>{sub}</span>}
    </button>
  );
}

const thStyle = {
  padding: '8px 10px',
  textAlign: 'center',
  fontWeight: 500,
  borderBottom: `1px solid ${TOKENS.border}`,
};
const tdStyle = {
  padding: '6px 10px',
  color: TOKENS.text,
  verticalAlign: 'middle',
};

function kindColorBg(kind) {
  switch (kind) {
    case 'bool':     return TOKENS.green + '22';
    case 'enum':     return TOKENS.violet + '22';
    case 'value':    return TOKENS.cyan + '22';
    case 'bitfield': return TOKENS.amber + '22';
    case 'code':     return TOKENS.red + '22';
    case 'counter':  return TOKENS.muted + '22';
    case 'string':   return TOKENS.dim + '22';
    default:         return TOKENS.border;
  }
}
function kindColorFg(kind) {
  switch (kind) {
    case 'bool':     return TOKENS.green;
    case 'enum':     return TOKENS.violet;
    case 'value':    return TOKENS.cyan;
    case 'bitfield': return TOKENS.amber;
    case 'code':     return TOKENS.red;
    case 'counter':  return TOKENS.muted;
    case 'string':   return TOKENS.dim;
    default:         return TOKENS.text;
  }
}

window.ScreenMapping = ScreenMapping;
