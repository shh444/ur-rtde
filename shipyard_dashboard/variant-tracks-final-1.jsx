// Sub-components for VariantTracksFinal

// ─── Collapsed channel sidebar ─────────────────────────────────────────
// 36px wide strip showing color stripes for pinned channels. Click to expand.
function CollapsedChannelSidebar({ pinnedRtde, pinnedMb, colorForRtde, colorForMb, onExpand }) {
  return (
    <aside
      onClick={onExpand}
      style={{
        background: TOKENS.panel2,
        borderRight: `1px solid ${TOKENS.border}`,
        cursor: 'pointer',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', padding: '12px 0', gap: 10,
        minHeight: 0,
      }}>
      <span style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10, color: TOKENS.dim, letterSpacing: 0.5,
        writingMode: 'vertical-rl', transform: 'rotate(180deg)',
      }}>▸ 채널</span>

      <div style={{
        display: 'flex', flexDirection: 'column', gap: 4,
        alignItems: 'center', marginTop: 8,
      }}>
        {pinnedRtde.map((c, i) => (
          <span key={c} title={c}
            style={{
              width: 16, height: 3,
              background: colorForRtde(c),
              borderRadius: 1,
            }} />
        ))}
      </div>
      <div style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 9, color: TOKENS.muted,
      }}>{pinnedRtde.length}</div>

      <div style={{
        width: 20, height: 1, background: TOKENS.border, margin: '4px 0',
      }} />

      <div style={{
        display: 'flex', flexDirection: 'column', gap: 4,
        alignItems: 'center',
      }}>
        {pinnedMb.map(c => (
          <span key={c} title={c}
            style={{
              width: 16, height: 3,
              background: colorForMb(c),
              borderRadius: 1,
            }} />
        ))}
      </div>
      <div style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 9, color: TOKENS.muted,
      }}>{pinnedMb.length}</div>
    </aside>
  );
}

// ─── Expanded sidebar ─────────────────────────────────────────────────
// Channel browser with search + collapsible RTDE/Modbus sections.
// Same structure as ChannelSidebar but adds the "‹ 접기" affordance.
function ExpandedChannelSidebar({
  pinnedRtde, pinnedMb, togglePinRtde, togglePinMb,
  colorForRtde, colorForMb, onCollapse,
  templates, activeTemplateId,
  onSaveTemplate, onApplyTemplate, onDeleteTemplate,
}) {
  const T = window.TRACKS;
  const H = window.TRACK_HELPERS;
  const [search, setSearch] = React.useState('');
  // 기본 접힘 — 채널 목록이 길어서 첫 진입 시 핀 + 템플릿만 보이게.
  // 사용자가 헤더 클릭하면 펼침.
  const [openSec, setOpenSec] = React.useState({ rtde: false, modbus: false });

  const rtdeFiltered = T.rtde.cols.filter(c =>
    !search || c.toLowerCase().includes(search.toLowerCase()) ||
    (T.rtde.koLabels[c] || '').includes(search));
  const mbFiltered = T.modbus.cols.filter(c =>
    !search || c.toLowerCase().includes(search.toLowerCase()) ||
    (T.modbus.koLabels[c] || '').includes(search));

  return (
    <aside style={{
      background: TOKENS.panel2,
      borderRight: `1px solid ${TOKENS.border}`,
      display: 'flex', flexDirection: 'column',
      minHeight: 0,
    }}>
      <div style={{ padding: '12px 12px 8px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          paddingBottom: 8,
          borderBottom: `1px solid ${TOKENS.border}`,
          marginBottom: 8,
        }}>
          <span style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10, letterSpacing: 1.4,
            color: TOKENS.dim, textTransform: 'uppercase',
          }}>채널 · {T.rtde.cols.length + T.modbus.cols.length}</span>
          <span style={{ flex: 1 }} />
          <span style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 9, color: TOKENS.muted,
          }}>{pinnedRtde.length + pinnedMb.length}/12</span>
          <button onClick={onCollapse}
            title="접기"
            style={{
              padding: '3px 6px',
              background: 'transparent',
              color: TOKENS.dim,
              border: `1px solid ${TOKENS.border}`,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10,
              cursor: 'pointer',
              borderRadius: 2,
            }}>‹</button>
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="이름으로 검색"
          style={{
            width: '100%',
            background: TOKENS.bg,
            border: `1px solid ${TOKENS.border}`,
            color: TOKENS.text,
            padding: '6px 8px',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 11,
            borderRadius: 2, outline: 'none', boxSizing: 'border-box',
          }} />
      </div>

      <SidebarTemplateBox
        templates={templates || []}
        activeTemplateId={activeTemplateId || ''}
        onSave={onSaveTemplate}
        onApply={onApplyTemplate}
        onDelete={onDeleteTemplate}
      />

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        <SidebarSection
          title="RTDE · 메인"
          subtitle={`${T.rtde?.hz ? T.rtde.hz + 'Hz' : '—'} · ${rtdeFiltered.length}`}
          accent={H.SRC_COLORS.rtde[0]}
          open={openSec.rtde}
          onToggle={() => setOpenSec(s => ({ ...s, rtde: !s.rtde }))}
        />
        {openSec.rtde && rtdeFiltered.map(c => {
          const on = pinnedRtde.includes(c);
          const color = on ? colorForRtde(c) : TOKENS.dim;
          return (
            <SidebarRow key={c} col={c} on={on} color={color}
              label={T.rtde.koLabels[c]} unit={T.rtde.units[c]}
              spark={T.rtde.samples[c]} pad="5px 8px"
              onClick={() => togglePinRtde(c)}
            />
          );
        })}

        <SidebarSection
          title="MODBUS · 서브"
          subtitle={`${T.modbus?.hz ? T.modbus.hz + 'Hz' : '—'} · ${mbFiltered.length}`}
          accent={H.SRC_COLORS.modbus[0]}
          open={openSec.modbus}
          onToggle={() => setOpenSec(s => ({ ...s, modbus: !s.modbus }))}
        />
        {openSec.modbus && mbFiltered.map(c => {
          const on = pinnedMb.includes(c);
          const color = on ? colorForMb(c) : TOKENS.dim;
          return (
            <SidebarRow key={c} col={c} on={on} color={color}
              label={T.modbus.koLabels[c]} unit={T.modbus.units[c]}
              spark={T.modbus.samples[c]} pad="5px 8px"
              onClick={() => togglePinMb(c)}
            />
          );
        })}
      </div>
    </aside>
  );
}

// ─── Main toolbar ─────────────────────────────────────────────────────
// Template + pinned chips + overlay/split mode + focus range
function MainToolbar({
  pinnedRtde, colorForRtde, togglePinRtde,
  detailMode, setDetailMode, view, setView, dur,
}) {
  const [template, setTemplate] = React.useState('');

  return (
    <div style={{
      padding: '6px 12px',
      background: TOKENS.panel2,
      borderBottom: `1px solid ${TOKENS.border}`,
      display: 'flex', alignItems: 'center', gap: 8,
      flexWrap: 'wrap',
    }}>
      {/* 한 줄로 통합 — TEMPLATE/저장 placeholder 제거해서 차트 영역 양보 */}
      <span style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10, letterSpacing: 1.4,
        color: TOKENS.dim, textTransform: 'uppercase',
      }}>PINNED</span>
      {pinnedRtde.map(c => (
        <Chip key={c} color={colorForRtde(c)} active removable
          onRemove={() => togglePinRtde(c)}>
          {c}
        </Chip>
      ))}
      <span style={{ flex: 1 }} />
      <span style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10, color: TOKENS.dim,
      }}>
        FOCUS <span style={{ color: TOKENS.text }}>{fmtT(view[0])} → {fmtT(view[1])}</span>
        <span style={{ marginLeft: 8, color: TOKENS.accent }}>
          Δ {fmtT(view[1] - view[0])}
        </span>
      </span>
      <button onClick={() => setView([0, dur])} style={toolBtn}>전체 보기</button>
      <Segmented3 value={detailMode} onChange={setDetailMode}
        options={[['overlay','오버레이'],['stacked','상하분할']]} />
    </div>
  );
}

const toolBtn = {
  padding: '4px 10px',
  background: 'transparent',
  color: TOKENS.dim,
  border: `1px solid ${TOKENS.border}`,
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 10, letterSpacing: 0.5,
  cursor: 'pointer', borderRadius: 2,
};

function Segmented3({ value, onChange, options }) {
  return (
    <div style={{
      display: 'inline-flex',
      background: TOKENS.bg,
      border: `1px solid ${TOKENS.border}`,
      borderRadius: 2,
      padding: 1,
    }}>
      {options.map(([k, l]) => (
        <button key={k} onClick={() => onChange(k)}
          style={{
            padding: '4px 12px',
            background: value === k ? TOKENS.accent : 'transparent',
            color: value === k ? '#0a0f1c' : TOKENS.dim,
            border: 'none',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10, letterSpacing: 0.5,
            cursor: 'pointer',
            fontWeight: value === k ? 600 : 400,
          }}>{l}</button>
      ))}
    </div>
  );
}

// ─── Sub time-series panels (formerly X·Y scatter) ────────────────────
// 산점도 → 시계열 라인 차트로 단순화. 모든 차트의 X축이 "시간" 으로 통일.
// 사용자는 Y 컬럼만 고름. 마스터 트랙 / Modbus mini / 마스터 타임라인과 동일한
// [tA, tB] view 와 hover 를 공유 → 어디서 mouseover 하든 vertical line 동기.
function ScatterPanel({
  idx, D, yCol, setYCol,
  view, hover, setHover, colorForRtde,
}) {
  const accent = TOKENS.serieses[(idx - 1) % TOKENS.serieses.length];
  // 핀된 컬럼이면 그 색상, 아니면 패널 자체 accent.
  const color = (colorForRtde && colorForRtde(yCol)) || accent;
  const channels = React.useMemo(
    () => [{ col: yCol, source: 'rtde', color }],
    [yCol, color]
  );

  // 데이터셋 교체 시 yCol 이 새 컬럼 목록에 없을 수 있음 — 자동 fallback.
  React.useEffect(() => {
    if (!D?.cols?.length) return;
    if (!D.cols.includes(yCol)) {
      setYCol(D.cols[0]);
    }
  }, [D?.cols, yCol, setYCol]);

  return (
    <div style={{
      background: TOKENS.panel,
      borderTop: `1px solid ${TOKENS.border}`,
      borderRight: `1px solid ${TOKENS.border}`,
      borderBottom: `1px solid ${TOKENS.border}`,
      borderLeft: `2px solid ${accent}`,
      padding: 10,
      display: 'flex', flexDirection: 'column',
      minHeight: 0, minWidth: 0,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
        flexWrap: 'wrap',
      }}>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 9, color: TOKENS.muted, letterSpacing: 1,
        }}>시계열 #{idx} · X = 시간</span>
        <span style={{ flex: 1 }} />
        <AxisPick D={D} value={yCol} onChange={setYCol} label="Y" />
      </div>
      <div style={{ flex: 1, minHeight: 140, position: 'relative' }}>
        {window.Track && (
          <window.Track
            channels={channels}
            view={view} hover={hover} onHover={setHover}
            title={yCol || '—'}
            badge=""
            badgeColor={accent}
            height={140}      // 최소 높이
            fillHeight={true} // 1fr 부모를 가득 채움
            showLegend={false}
            showAxis={true}
          />
        )}
      </div>
    </div>
  );
}

function AxisPick({ D, value, onChange, label }) {
  return (
    <label style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
      color: TOKENS.dim,
    }}>
      <span style={{ color: TOKENS.accent, fontWeight: 600 }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{
          background: TOKENS.bg,
          border: `1px solid ${TOKENS.border}`,
          color: TOKENS.text,
          padding: '2px 6px',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10,
          borderRadius: 2,
        }}>
        {D.cols.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    </label>
  );
}

// ─── Template box (사이드바 상단) ────────────────────────────────────
// 현재 핀/뷰 설정을 한 묶음으로 저장 + 저장된 항목 불러오기 + 삭제.
// 백엔드 /api/analysis/templates 와 동기화는 부모(VariantTracksFinal) 가 처리,
// 여기는 UI 만.
function SidebarTemplateBox({ templates, activeTemplateId, onSave, onApply, onDelete }) {
  const [naming, setNaming] = React.useState(false);
  const [draft, setDraft] = React.useState('');

  const active = templates.find(t => t.id === activeTemplateId);

  const submit = () => {
    const nm = draft.trim();
    if (!nm) { setNaming(false); return; }
    onSave?.(nm);
    setDraft(''); setNaming(false);
  };

  return (
    <div style={{
      flex: '0 0 auto',
      padding: '8px 12px 10px',
      borderBottom: `1px solid ${TOKENS.border}`,
      background: TOKENS.bg,
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10, letterSpacing: 1.4,
          color: TOKENS.dim, textTransform: 'uppercase',
        }}>TEMPLATE</span>
        <span style={{ flex: 1 }} />
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 9, color: TOKENS.muted,
        }}>{templates.length}</span>
      </div>

      {!naming ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <select
            value={activeTemplateId}
            onChange={(e) => onApply?.(e.target.value)}
            style={{
              flex: 1, minWidth: 0,
              background: TOKENS.panel,
              border: `1px solid ${TOKENS.border}`,
              color: TOKENS.text,
              padding: '4px 6px',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10,
              borderRadius: 2, outline: 'none',
            }}>
            <option value="">템플릿 선택…</option>
            {templates.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button onClick={() => setNaming(true)}
            title="현재 핀/뷰 설정을 새 템플릿으로 저장"
            style={{
              padding: '3px 8px',
              background: 'transparent',
              color: TOKENS.accent,
              border: `1px solid ${TOKENS.accent}55`,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10, fontWeight: 600, letterSpacing: 0.5,
              cursor: 'pointer', borderRadius: 2,
            }}>+ 저장</button>
          {active && (
            <button onClick={() => {
              if (window.confirm(`템플릿 "${active.name}" 삭제할까요?`)) onDelete?.(active.id);
            }}
              title="활성 템플릿 삭제"
              style={{
                padding: '3px 6px',
                background: 'transparent',
                color: TOKENS.red,
                border: `1px solid ${TOKENS.red}55`,
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10, fontWeight: 600,
                cursor: 'pointer', borderRadius: 2,
              }}>×</button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              else if (e.key === 'Escape') { setDraft(''); setNaming(false); }
            }}
            placeholder="템플릿 이름"
            style={{
              flex: 1, minWidth: 0,
              background: TOKENS.panel,
              border: `1px solid ${TOKENS.accent}55`,
              color: TOKENS.text,
              padding: '4px 6px',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10,
              borderRadius: 2, outline: 'none',
              boxSizing: 'border-box',
            }} />
          <button onClick={submit}
            style={{
              padding: '3px 8px',
              background: TOKENS.accent, color: '#0a0f1c',
              border: 'none',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10, fontWeight: 700,
              cursor: 'pointer', borderRadius: 2,
            }}>확인</button>
          <button onClick={() => { setDraft(''); setNaming(false); }}
            style={{
              padding: '3px 6px',
              background: 'transparent', color: TOKENS.dim,
              border: `1px solid ${TOKENS.border}`,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10, cursor: 'pointer', borderRadius: 2,
            }}>×</button>
        </div>
      )}
    </div>
  );
}

window.CollapsedChannelSidebar = CollapsedChannelSidebar;
window.ExpandedChannelSidebar = ExpandedChannelSidebar;
window.MainToolbar = MainToolbar;
window.ScatterPanel = ScatterPanel;
window.SidebarTemplateBox = SidebarTemplateBox;
