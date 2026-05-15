// Helper components used by tracks-variants.jsx

// Top metadata bar — recording info + actions.
// recording prop (when supplied from screen-analysis) takes precedence over the
// mock window.TRACKS.meta so this same bar can show real backend recordings.
// library + changeRecording optionally enable the "다른 레코딩 ▾" switcher
// (preserves the dropdown from the previous LoadedRecordingBar).
function MetaBar({ onJump, dense, recording, library, changeRecording }) {
  const T = window.TRACKS;
  const mockMeta = T?.meta || {};
  // recording 객체는 백엔드 shape (filename, duration, samples, alarms, …),
  // mock TRACKS.meta 는 데모 shape (name, durationSec, samples, alarms, …).
  // 둘 다 통합 view-model 로 normalize.
  const m = recording ? {
    name:       (recording.filename || recording.name || '').replace(/\.csv$/i, '') || '—',
    block:      recording.block || '—',
    cell:       recording.cell || '—',
    path:       recording.path || '—',
    operator:   recording.operator || '—',
    durationSec: recording.duration || 0,
    samples:    recording.samples || 0,
    alarms:     recording.alarms || 0,
  } : {
    name:        mockMeta.name || '—',
    block:       mockMeta.block || '—',
    cell:        mockMeta.cell || '—',
    path:        mockMeta.path || '—',
    operator:    mockMeta.operator || '—',
    durationSec: mockMeta.durationSec || 0,
    samples:     mockMeta.samples || 0,
    alarms:      mockMeta.alarms || 0,
  };

  const [showSwitcher, setShowSwitcher] = React.useState(false);
  const canSwitch = Array.isArray(library) && library.length > 0 && typeof changeRecording === 'function';

  return (
    <div style={{
      flex: '0 0 auto',
      // 더 컴팩트하게 — 차트에 세로 공간 양보
      padding: '6px 12px',
      background: TOKENS.panel,
      borderBottom: `1px solid ${TOKENS.border}`,
      display: 'flex', alignItems: 'center', gap: 12,
      position: 'relative',
      minHeight: 0,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '3px 8px',
        background: TOKENS.bg,
        borderLeft: `2px solid ${TOKENS.accent}`,
      }}>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 9, color: TOKENS.muted, letterSpacing: 1,
        }}>LOADED</span>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 11, color: TOKENS.text,
          maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }} title={m.name}>{m.name}{recording ? '' : '.csv'}</span>
      </div>

      <div style={{
        display: 'flex', gap: 12,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10, color: TOKENS.dim,
        flexWrap: 'wrap',
      }}>
        {m.cell && m.cell !== '—' && <Meta2 label="셀" value={m.cell} color={TOKENS.cyan} />}
        <Meta2 label="기간" value={fmtT(m.durationSec)} />
        <Meta2 label="샘플" value={(m.samples || 0).toLocaleString()} />
        <Meta2 label="알람"
          value={String(m.alarms)}
          color={m.alarms === 0 ? TOKENS.green : m.alarms > 5 ? TOKENS.red : TOKENS.amber} />
      </div>

      <span style={{ flex: 1 }} />

      {canSwitch && (
        <button onClick={() => setShowSwitcher(s => !s)}
          style={{
            ...metaBtn,
            padding: '3px 10px',
            background: showSwitcher ? TOKENS.accent : 'transparent',
            color: showSwitcher ? '#0a0f1c' : TOKENS.dim,
            border: `1px solid ${showSwitcher ? TOKENS.accent : TOKENS.border}`,
            fontWeight: showSwitcher ? 600 : 400,
          }}>
          다른 레코딩 ▾
        </button>
      )}

      {showSwitcher && canSwitch && (
        <div style={{
          position: 'absolute',
          top: '100%', right: 16,
          marginTop: 4,
          width: 420, maxHeight: 360, overflowY: 'auto',
          background: TOKENS.panel,
          border: `1px solid ${TOKENS.borderHi}`,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          zIndex: 20,
        }}>
          {library.map(r => {
            const active = recording && r.id === recording.id;
            return (
              <button key={r.id}
                onClick={() => { changeRecording(r.id); setShowSwitcher(false); }}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: active ? TOKENS.bg : 'transparent',
                  border: 'none',
                  borderBottom: `1px solid ${TOKENS.border}`,
                  borderLeft: `2px solid ${active ? TOKENS.accent : 'transparent'}`,
                  color: TOKENS.text,
                  textAlign: 'left', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', gap: 3,
                  fontFamily: 'JetBrains Mono, monospace',
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: TOKENS.text }}>
                    {r.filename || r.name}
                  </span>
                  {r.source && (
                    <span style={{
                      fontSize: 8, padding: '1px 4px',
                      background: r.source === 'db' ? TOKENS.violet + '33' : TOKENS.cyan + '33',
                      color: r.source === 'db' ? TOKENS.violet : TOKENS.cyan,
                      borderRadius: 1, letterSpacing: 0.5, fontWeight: 600,
                    }}>{String(r.source).toUpperCase()}</span>
                  )}
                </div>
                <div style={{ fontSize: 9, color: TOKENS.dim }}>
                  {[r.block, r.cell, r.path, r.operator, r.duration && fmtT(r.duration), r.alarms != null && `${r.alarms}A`]
                    .filter(Boolean).join(' · ')}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Meta2({ label, value, color }) {
  return (
    <span>
      <span style={{ color: TOKENS.muted }}>{label} </span>
      <span style={{ color: color || TOKENS.text }}>{value}</span>
    </span>
  );
}

function QuickJumpButton({ label, t, onJump, color }) {
  return (
    <button onClick={() => onJump(t)}
      style={{
        padding: '4px 10px',
        background: 'transparent',
        color: color || TOKENS.dim,
        border: `1px solid ${color ? color + '55' : TOKENS.border}`,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10, letterSpacing: 0.5,
        cursor: 'pointer', borderRadius: 2,
      }}>
      → {label} <span style={{ color: TOKENS.muted, marginLeft: 4 }}>{fmtT(t)}</span>
    </button>
  );
}

const metaBtn = {
  padding: '6px 12px',
  background: 'transparent',
  color: TOKENS.dim,
  border: `1px solid ${TOKENS.border}`,
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 10, letterSpacing: 0.5,
  cursor: 'pointer', borderRadius: 2,
};

// ─── Cursor strip (Variant A) ─────────────────────────────────────────
// Single-line readout that lives above the tracks. Pinned channels with
// their value at the current hover position. Compact.
function CursorStrip({ hover, view, rtdeChannels, mbChannels }) {
  const T = window.TRACKS;
  const H = window.TRACK_HELPERS;

  if (hover == null) {
    return (
      <div style={{
        padding: '8px 12px',
        background: TOKENS.panel,
        border: `1px solid ${TOKENS.border}`,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10, color: TOKENS.muted, letterSpacing: 0.5,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <span>커서 위치를 트랙 위에 올리면 모든 채널 값을 표시합니다.</span>
        <span style={{ flex: 1 }} />
        <span>FOCUS {fmtT(view[0])}—{fmtT(view[1])}</span>
      </div>
    );
  }

  return (
    <div style={{
      padding: '8px 12px',
      background: TOKENS.panel,
      borderTop: `1px solid ${TOKENS.border}`,
      borderRight: `1px solid ${TOKENS.border}`,
      borderBottom: `1px solid ${TOKENS.border}`,
      borderLeft: `2px solid ${TOKENS.accent}`,
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 11, color: TOKENS.text,
      display: 'flex', alignItems: 'center', gap: 14,
      flexWrap: 'wrap',
    }}>
      <span style={{
        color: TOKENS.accent, fontSize: 12, fontWeight: 600,
      }}>@ {fmtT(hover)}</span>

      <span style={{ color: TOKENS.muted, fontSize: 9, letterSpacing: 1 }}>RTDE</span>
      {rtdeChannels.map(ch => {
        const src = T.rtde;
        const idx = H.nearestIdx(hover, src.t);
        const v = src.samples[ch.col][idx];
        return (
          <span key={ch.col}>
            <span style={{ width: 8, height: 2, background: ch.color, display: 'inline-block', marginRight: 4 }} />
            <span style={{ color: TOKENS.dim, fontSize: 10 }}>{ch.col} </span>
            <span style={{ color: ch.color }}>{typeof v === 'number' ? v.toFixed(2) : v}</span>
            {src.units[ch.col] && (
              <span style={{ color: TOKENS.muted, fontSize: 9, marginLeft: 2 }}>{src.units[ch.col]}</span>
            )}
          </span>
        );
      })}

      <span style={{ color: TOKENS.muted, fontSize: 9, letterSpacing: 1, marginLeft: 8 }}>MODBUS</span>
      {mbChannels.map(ch => {
        const src = T.modbus;
        const idx = H.nearestIdx(hover, src.t);
        const v = src.samples[ch.col][idx];
        return (
          <span key={ch.col}>
            <span style={{ width: 8, height: 2, background: ch.color, display: 'inline-block', marginRight: 4 }} />
            <span style={{ color: TOKENS.dim, fontSize: 10 }}>{ch.col} </span>
            <span style={{ color: ch.color }}>{typeof v === 'number' ? v.toFixed(2) : v}</span>
            {src.units[ch.col] && (
              <span style={{ color: TOKENS.muted, fontSize: 9, marginLeft: 2 }}>{src.units[ch.col]}</span>
            )}
          </span>
        );
      })}
    </div>
  );
}

// ─── Selected log detail (Variant A) ──────────────────────────────────
function SelectedLogDetail({ log, onClose }) {
  const color = window.TRACK_HELPERS.LOG_COLORS[log.level];
  return (
    <div style={{
      padding: '10px 14px',
      background: TOKENS.panel,
      borderTop: `1px solid ${TOKENS.border}`,
      borderRight: `1px solid ${TOKENS.border}`,
      borderBottom: `1px solid ${TOKENS.border}`,
      borderLeft: `2px solid ${color}`,
      display: 'flex', alignItems: 'center', gap: 12,
      fontFamily: 'JetBrains Mono, monospace',
    }}>
      <span style={{
        padding: '2px 6px', background: color, color: '#0a0f1c',
        fontSize: 9, fontWeight: 700, letterSpacing: 0.8, borderRadius: 1,
      }}>{log.level.toUpperCase()}</span>
      <span style={{ color: TOKENS.dim, fontSize: 11 }}>{fmtT(log.t)}</span>
      <span style={{ color: TOKENS.muted, fontSize: 10 }}>{log.source}</span>
      <span style={{ flex: 1, color: TOKENS.text, fontSize: 11 }}>{log.msg}</span>
      <button onClick={onClose} style={{
        background: 'transparent', border: 'none', color: TOKENS.dim,
        fontSize: 14, cursor: 'pointer',
      }}>×</button>
    </div>
  );
}

// ─── Cursor inspector (Variant B) ─────────────────────────────────────
// Right-side panel showing all pinned channels' values at the hover
// position, plus the nearest logs (before/after).
function CursorInspector({ hover, rtdeChannels, mbChannels, selectedLog, onClose }) {
  const T = window.TRACKS;
  const H = window.TRACK_HELPERS;

  const nearestBefore = hover == null ? null
    : [...T.logs].filter(l => l.t <= hover).pop();
  const nearestAfter  = hover == null ? null
    : T.logs.find(l => l.t > hover);

  return (
    <aside style={{
      background: TOKENS.panel,
      borderLeft: `1px solid ${TOKENS.border}`,
      display: 'flex', flexDirection: 'column',
      minHeight: 0, padding: 12, gap: 10,
      overflowY: 'auto',
    }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 8,
        borderBottom: `1px solid ${TOKENS.border}`,
        paddingBottom: 8,
      }}>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10, color: TOKENS.dim, letterSpacing: 1.2,
        }}>@ CURSOR</span>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 22, color: TOKENS.accent, fontWeight: 500,
          letterSpacing: -0.5,
        }}>
          {hover == null ? '—' : fmtT(hover)}
        </span>
      </div>

      <SectionLabel>RTDE · 125Hz</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {rtdeChannels.map(ch => (
          <ValueRow2 key={ch.col} ch={ch} source="rtde" hover={hover} />
        ))}
      </div>

      <SectionLabel>MODBUS · 4Hz</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {mbChannels.map(ch => (
          <ValueRow2 key={ch.col} ch={ch} source="modbus" hover={hover} />
        ))}
      </div>

      <SectionLabel>가까운 로그</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {nearestBefore && (
          <LogPreview log={nearestBefore} hover={hover}
            direction="before" highlight={selectedLog?.id === nearestBefore.id} />
        )}
        {nearestAfter && (
          <LogPreview log={nearestAfter} hover={hover}
            direction="after" highlight={selectedLog?.id === nearestAfter.id} />
        )}
      </div>

      {selectedLog && (
        <>
          <SectionLabel
            action={<button onClick={onClose} style={{
              background: 'transparent', border: 'none', color: TOKENS.dim,
              fontSize: 12, cursor: 'pointer',
            }}>×</button>}>
            선택된 로그
          </SectionLabel>
          <div style={{
            padding: 10,
            background: TOKENS.bg,
            border: `1px solid ${TOKENS.border}`,
            borderLeft: `2px solid ${window.TRACK_HELPERS.LOG_COLORS[selectedLog.level]}`,
            fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
            color: TOKENS.text, lineHeight: 1.5,
          }}>
            <div style={{ color: TOKENS.dim, marginBottom: 4 }}>
              {fmtT(selectedLog.t)} · {selectedLog.source}
            </div>
            {selectedLog.msg}
          </div>
        </>
      )}
    </aside>
  );
}

function ValueRow2({ ch, source, hover }) {
  const T = window.TRACKS;
  const H = window.TRACK_HELPERS;
  const src = T[source];
  const idx = hover == null ? null : H.nearestIdx(hover, src.t);
  const v = idx == null ? null : src.samples[ch.col][idx];
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '8px 1fr auto auto',
      gap: 8, alignItems: 'center',
      padding: '5px 4px',
      borderBottom: `1px solid ${TOKENS.border}33`,
      fontFamily: 'JetBrains Mono, monospace',
    }}>
      <span style={{ width: 8, height: 8, background: ch.color, borderRadius: 1 }} />
      <span style={{
        fontSize: 10, color: TOKENS.dim,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{ch.col}</span>
      <span style={{
        fontSize: 12, color: TOKENS.text, fontWeight: 500,
      }}>{v == null ? '—' : typeof v === 'number' ? v.toFixed(2) : v}</span>
      <span style={{ fontSize: 9, color: TOKENS.muted, minWidth: 24, textAlign: 'right' }}>
        {src.units[ch.col] || ''}
      </span>
    </div>
  );
}

function LogPreview({ log, hover, direction, highlight }) {
  const color = window.TRACK_HELPERS.LOG_COLORS[log.level];
  const dt = log.t - hover;
  return (
    <div style={{
      padding: '6px 8px',
      background: highlight ? color + '15' : TOKENS.bg,
      border: `1px solid ${TOKENS.border}`,
      borderLeft: `2px solid ${color}`,
      display: 'flex', flexDirection: 'column', gap: 2,
      fontFamily: 'JetBrains Mono, monospace',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9 }}>
        <span style={{
          padding: '0 4px', background: color, color: '#0a0f1c',
          fontWeight: 700, letterSpacing: 0.6, borderRadius: 1,
        }}>{log.level.toUpperCase()}</span>
        <span style={{ color: TOKENS.muted }}>
          {direction === 'before' ? `${Math.abs(dt).toFixed(1)}s ago` : `in ${dt.toFixed(1)}s`}
        </span>
        <span style={{ color: TOKENS.muted }}>· {log.source}</span>
      </div>
      <div style={{ fontSize: 10, color: TOKENS.text, lineHeight: 1.4 }}>{log.msg}</div>
    </div>
  );
}

// ─── Event sidebar (Variant C) ────────────────────────────────────────
// Vertical list of logs with level filter chips. Clicking a log jumps the
// scrubber there.
function EventSidebar({ logs, filter, setFilter, selectedLog, onSelect, onShowChannels, showingChannels }) {
  const LEVELS = ['error', 'warn', 'info', 'debug', 'sys'];
  const counts = LEVELS.reduce((acc, lv) => {
    acc[lv] = logs.filter(l => l.level === lv).length;
    return acc;
  }, {});
  const filtered = logs.filter(l => filter[l.level]);

  return (
    <aside style={{
      background: TOKENS.panel2,
      borderRight: `1px solid ${TOKENS.border}`,
      display: 'flex', flexDirection: 'column',
      minHeight: 0,
    }}>
      <div style={{ padding: '12px 12px 8px' }}>
        <SectionLabel
          action={
            <button onClick={onShowChannels} style={{
              padding: '3px 8px',
              background: showingChannels ? TOKENS.accent : 'transparent',
              color: showingChannels ? '#0a0f1c' : TOKENS.dim,
              border: `1px solid ${showingChannels ? TOKENS.accent : TOKENS.border}`,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 9, letterSpacing: 0.5, fontWeight: 600,
              cursor: 'pointer', borderRadius: 2,
            }}>
              + 채널
            </button>
          }>
          이벤트 / {filtered.length}
        </SectionLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {LEVELS.map(lv => {
            const c = window.TRACK_HELPERS.LOG_COLORS[lv];
            return (
              <Chip key={lv} color={c} active={filter[lv]}
                onClick={() => setFilter({ ...filter, [lv]: !filter[lv] })}>
                {lv} {counts[lv]}
              </Chip>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '4px 0' }}>
        {filtered.map(log => {
          const c = window.TRACK_HELPERS.LOG_COLORS[log.level];
          const selected = selectedLog?.id === log.id;
          return (
            <div key={log.id}
              onClick={() => onSelect(log)}
              style={{
                padding: '7px 12px',
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: 2,
                background: selected ? c + '13' : 'transparent',
                borderLeft: `2px solid ${selected ? c : 'transparent'}`,
                borderBottom: `1px solid ${TOKENS.border}33`,
              }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontFamily: 'JetBrains Mono, monospace', fontSize: 9,
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', background: c,
                  flex: '0 0 auto',
                }} />
                <span style={{ color: c, fontWeight: 600 }}>{log.level.toUpperCase()}</span>
                <span style={{ color: TOKENS.dim }}>{fmtT(log.t)}</span>
                <span style={{ color: TOKENS.muted }}>· {log.source}</span>
              </div>
              <div style={{
                fontSize: 10, color: TOKENS.text, lineHeight: 1.4,
                paddingLeft: 12,
                fontFamily: 'Pretendard, sans-serif',
              }}>{log.msg}</div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

window.MetaBar = MetaBar;
window.CursorStrip = CursorStrip;
window.SelectedLogDetail = SelectedLogDetail;
window.CursorInspector = CursorInspector;
window.EventSidebar = EventSidebar;
