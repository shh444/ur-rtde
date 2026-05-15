// MasterTimeline: brushable mini-overview at the bottom. Shows full
// recording duration with the current view window highlighted, plus event
// ticks for warn/error logs. Drag the window edges to resize, the body to
// pan, or click outside to start a new selection.

function MasterTimeline({ view, setView, hover, onHover, height = 80, segments }) {
  const T = window.TRACKS;
  const H = window.TRACK_HELPERS;
  const [ref, size] = H.useSize();
  const padL = 70, padR = 12, padT = 18, padB = 20;
  const plotW = Math.max(0, size.w - padL - padR);
  const plotH = Math.max(20, height - padT - padB);
  const dur = T.duration;
  const [tA, tB] = view;

  const [drag, setDrag] = React.useState(null);

  const xAt = (t) => padL + (plotW * t) / dur;
  const tAtX = (x) => Math.max(0, Math.min(dur, ((x - padL) / plotW) * dur));

  const onMouseDown = (e) => {
    const rect = ref.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const xLo = xAt(tA), xHi = xAt(tB);
    if (Math.abs(x - xLo) < 6) setDrag({ type: 'lo' });
    else if (Math.abs(x - xHi) < 6) setDrag({ type: 'hi' });
    else if (x > xLo && x < xHi) setDrag({ type: 'move', startT: tAtX(x), orig: [tA, tB] });
    else setDrag({ type: 'new', anchor: tAtX(x) });
    e.preventDefault();
  };
  const onMouseMove = (e) => {
    const rect = ref.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    onHover?.(x > padL && x < padL + plotW ? tAtX(x) : null);
    if (!drag) return;
    const t = tAtX(x);
    if (drag.type === 'lo') setView([Math.min(t, tB - 1), tB]);
    else if (drag.type === 'hi') setView([tA, Math.max(t, tA + 1)]);
    else if (drag.type === 'move') {
      const dt = t - drag.startT;
      let nA = drag.orig[0] + dt, nB = drag.orig[1] + dt;
      if (nA < 0) { nB -= nA; nA = 0; }
      if (nB > dur) { nA -= (nB - dur); nB = dur; }
      setView([nA, nB]);
    } else if (drag.type === 'new') {
      setView([Math.min(drag.anchor, t), Math.max(drag.anchor, t)]);
    }
  };
  const onMouseUp = () => setDrag(null);

  // Mini sparkline — 첫 RTDE 컬럼으로 자동 선택 (실데이터엔 weldCurrent 없을 수 있음).
  // 데이터가 비어있으면 sparkline 없이 진행.
  let sparkD = '';
  const rtdeSrc = T?.rtde;
  if (rtdeSrc && Array.isArray(rtdeSrc.cols) && rtdeSrc.cols.length > 0
      && Array.isArray(rtdeSrc.t) && rtdeSrc.t.length > 0) {
    const sparkCol = rtdeSrc.cols.find(c => Array.isArray(rtdeSrc.samples?.[c]))
                   || rtdeSrc.cols[0];
    const wc = rtdeSrc.samples?.[sparkCol];
    const r = rtdeSrc.ranges?.[sparkCol] || [0, 1];
    if (Array.isArray(wc) && wc.length) {
      const [wmin, wmax] = r;
      const yr = (wmax - wmin) || 1;
      for (let i = 0; i < wc.length; i++) {
        const v = wc[i];
        if (typeof v !== 'number' || !isFinite(v)) continue;
        const x = padL + (plotW * rtdeSrc.t[i]) / dur;
        const y = padT + plotH - ((v - wmin) / yr) * plotH;
        sparkD += (sparkD ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
      }
    }
  }

  return (
    <div ref={ref}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={() => { setDrag(null); onHover?.(null); }}
      style={{
        height,
        background: TOKENS.panel2,
        borderTop: `1px solid ${TOKENS.border}`,
        borderRight: `1px solid ${TOKENS.border}`,
        borderBottom: `1px solid ${TOKENS.border}`,
        borderLeft: `2px solid ${TOKENS.dim}`,
        position: 'relative',
        cursor: drag?.type === 'move' ? 'grabbing' : 'crosshair',
        userSelect: 'none',
      }}>
      <svg width="100%" height={height} style={{ display: 'block' }}>
        <rect x={padL} y={padT} width={plotW} height={plotH} fill={TOKENS.bg} />

        {/* Spark */}
        <path d={sparkD} fill="none" stroke={TOKENS.accent} strokeWidth={0.7} opacity={0.6} />

        {/* Segments */}
        {segments && segments.map((s, i) => {
          const c = s.level === 'error' ? TOKENS.red : TOKENS.amber;
          return (
            <rect key={i} x={xAt(s.start)} y={padT}
              width={Math.max(2, xAt(s.end) - xAt(s.start))} height={plotH}
              fill={c} opacity={0.18} />
          );
        })}

        {/* Event ticks */}
        {T.logs.filter(l => l.level === 'error' || l.level === 'warn').map(l => (
          <line key={l.id} x1={xAt(l.t)} x2={xAt(l.t)} y1={padT} y2={padT + plotH}
            stroke={l.level === 'error' ? TOKENS.red : TOKENS.amber}
            strokeWidth={0.8} opacity={0.7} />
        ))}

        {/* Brush window */}
        <rect x={xAt(tA)} y={padT} width={xAt(tB) - xAt(tA)} height={plotH}
          fill={TOKENS.accent} opacity={0.15} />
        <line x1={xAt(tA)} y1={padT} x2={xAt(tA)} y2={padT + plotH}
          stroke={TOKENS.accent} strokeWidth={1.5} />
        <line x1={xAt(tB)} y1={padT} x2={xAt(tB)} y2={padT + plotH}
          stroke={TOKENS.accent} strokeWidth={1.5} />
        {/* handles */}
        {[tA, tB].map((t, k) => (
          <rect key={k} x={xAt(t) - 3} y={padT + plotH/2 - 8}
            width={6} height={16} fill={TOKENS.accent} rx={1} />
        ))}

        {/* Hover */}
        {hover != null && (
          <line x1={xAt(hover)} y1={padT} x2={xAt(hover)} y2={padT + plotH}
            stroke={TOKENS.text} strokeWidth={0.6} opacity={0.5} />
        )}

        {/* Axis */}
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => {
          const t = (dur * i) / 10;
          return (
            <g key={i}>
              <line x1={xAt(t)} y1={padT + plotH} x2={xAt(t)} y2={padT + plotH + 3}
                stroke={TOKENS.muted} strokeWidth={0.5} />
              <text x={xAt(t)} y={padT + plotH + 14} fill={TOKENS.dim} fontSize={9}
                textAnchor="middle"
                style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {fmtT(t)}
              </text>
            </g>
          );
        })}

        {/* Label */}
        <text x={padL} y={12} fill={TOKENS.dim} fontSize={10}
          style={{ fontFamily: 'JetBrains Mono, monospace', letterSpacing: 1 }}>
          TIMELINE · 00:00 → {fmtT(dur)}
        </text>
        <text x={padL + plotW} y={12} fill={TOKENS.accent} fontSize={10}
          textAnchor="end"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          FOCUS {fmtT(tA)}–{fmtT(tB)}  Δ {fmtT(tB - tA)}
        </text>
      </svg>
    </div>
  );
}

// ─── Channel Sidebar ──────────────────────────────────────────────────
// Two collapsible sections — RTDE channels (40) and Modbus channels (15) —
// with per-source pinning. Mini sparkline next to each item so the user
// knows what they're picking.
function ChannelSidebar({ pinnedRtde, pinnedMb, setPinnedRtde, setPinnedMb,
  view, density = 'comfortable' }) {
  const T = window.TRACKS;
  const H = window.TRACK_HELPERS;
  const [tA, tB] = view;

  const [search, setSearch] = React.useState('');
  const [openSections, setOpenSections] = React.useState({ rtde: true, modbus: true });

  const colorForRtde = (col) => {
    const idx = pinnedRtde.indexOf(col);
    return H.SRC_COLORS.rtde[idx % H.SRC_COLORS.rtde.length] || TOKENS.muted;
  };
  const colorForMb = (col) => {
    const idx = pinnedMb.indexOf(col);
    return H.SRC_COLORS.modbus[idx % H.SRC_COLORS.modbus.length] || TOKENS.muted;
  };

  const togglePinRtde = (c) => setPinnedRtde(p =>
    p.includes(c) ? p.filter(x => x !== c) : [...p, c].slice(0, 6));
  const togglePinMb = (c) => setPinnedMb(p =>
    p.includes(c) ? p.filter(x => x !== c) : [...p, c].slice(0, 6));

  const rtdeFiltered = T.rtde.cols.filter(c =>
    !search || c.toLowerCase().includes(search.toLowerCase()) ||
    (T.rtde.koLabels[c] || '').includes(search));
  const mbFiltered = T.modbus.cols.filter(c =>
    !search || c.toLowerCase().includes(search.toLowerCase()) ||
    (T.modbus.koLabels[c] || '').includes(search));

  const rowPad = density === 'compact' ? '3px 6px' : '5px 8px';

  return (
    <aside style={{
      background: TOKENS.panel2,
      borderRight: `1px solid ${TOKENS.border}`,
      display: 'flex', flexDirection: 'column',
      minHeight: 0,
    }}>
      <div style={{ padding: '12px 12px 8px' }}>
        <SectionLabel
          action={<span style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 9, color: TOKENS.muted,
          }}>{pinnedRtde.length + pinnedMb.length}/12</span>}>
          채널 / {T.rtde.cols.length + T.modbus.cols.length}
        </SectionLabel>
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

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {/* RTDE section */}
        <SidebarSection
          title="RTDE" subtitle={`125Hz · ${rtdeFiltered.length}`}
          accent={H.SRC_COLORS.rtde[0]}
          open={openSections.rtde}
          onToggle={() => setOpenSections(s => ({ ...s, rtde: !s.rtde }))}
        />
        {openSections.rtde && rtdeFiltered.map(c => {
          const on = pinnedRtde.includes(c);
          const color = on ? colorForRtde(c) : TOKENS.dim;
          return (
            <SidebarRow key={c} col={c} on={on} color={color}
              label={T.rtde.koLabels[c]} unit={T.rtde.units[c]}
              spark={T.rtde.samples[c]} pad={rowPad}
              onClick={() => togglePinRtde(c)}
            />
          );
        })}

        {/* Modbus section */}
        <SidebarSection
          title="MODBUS" subtitle={`4Hz · ${mbFiltered.length}`}
          accent={H.SRC_COLORS.modbus[0]}
          open={openSections.modbus}
          onToggle={() => setOpenSections(s => ({ ...s, modbus: !s.modbus }))}
        />
        {openSections.modbus && mbFiltered.map(c => {
          const on = pinnedMb.includes(c);
          const color = on ? colorForMb(c) : TOKENS.dim;
          return (
            <SidebarRow key={c} col={c} on={on} color={color}
              label={T.modbus.koLabels[c]} unit={T.modbus.units[c]}
              spark={T.modbus.samples[c]} pad={rowPad}
              onClick={() => togglePinMb(c)}
            />
          );
        })}
      </div>
    </aside>
  );
}

function SidebarSection({ title, subtitle, accent, open, onToggle }) {
  return (
    <div onClick={onToggle}
      style={{
        padding: '8px 12px',
        background: TOKENS.bg,
        borderTop: `1px solid ${TOKENS.border}`,
        borderBottom: `1px solid ${TOKENS.border}`,
        display: 'flex', alignItems: 'center', gap: 8,
        cursor: 'pointer',
      }}>
      <span style={{
        color: accent, fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10, fontWeight: 600, letterSpacing: 1.2,
      }}>
        {open ? '▾' : '▸'} {title}
      </span>
      <span style={{ flex: 1 }} />
      <span style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 9, color: TOKENS.muted,
      }}>{subtitle}</span>
    </div>
  );
}

function SidebarRow({ col, on, color, label, unit, spark, onClick, pad }) {
  // 가드: spark 가 array 아니면 빈 배열 — Sparkline 내부의 .length 접근 보호
  const safeSpark = Array.isArray(spark) ? spark : [];
  return (
    <div onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: '4px 1fr 60px',
        gap: 8, alignItems: 'center',
        padding: pad,
        cursor: 'pointer',
        background: on ? `${color}13` : 'transparent',
        borderLeft: `2px solid ${on ? color : 'transparent'}`,
      }}>
      <span style={{
        width: 4, height: 14, background: on ? color : TOKENS.border, borderRadius: 1,
      }} />
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 11, color: on ? TOKENS.text : TOKENS.dim,
          fontFamily: 'JetBrains Mono, monospace',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{col}</div>
        {(label || unit) && (
          <div style={{
            fontSize: 9, color: TOKENS.muted,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{label || ''}{unit ? ` · ${unit}` : ''}</div>
        )}
      </div>
      {safeSpark.length > 0 ? (
        <Sparkline values={safeSpark} w={58} h={18}
          color={on ? color : TOKENS.muted} fill={false} />
      ) : (
        <span style={{ color: TOKENS.muted, fontSize: 9, textAlign: 'right' }}>—</span>
      )}
    </div>
  );
}

window.MasterTimeline = MasterTimeline;
window.ChannelSidebar = ChannelSidebar;
