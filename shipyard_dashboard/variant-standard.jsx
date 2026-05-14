// Variant 2: 표준 (Standard)
// Timeline-first analysis workspace. Brushable timeline at top → focused
// detail chart and a scatter/correlation pane below. Cleaner, modern, but
// follows industrial conventions.

function VariantStandard() {
  const D = window.RTDE;
  const N = D.N;

  const [pinned, setPinned] = React.useState(['weldCurrent','Arc_percent','xOffset','zOffset']);
  const [brush, setBrush] = React.useState([Math.round(N * 0.55), Math.round(N * 0.82)]);
  const [hoverIdx, setHoverIdx] = React.useState(null);
  const [scatterX, setScatterX] = React.useState('weldCurrent');
  const [scatterY, setScatterY] = React.useState('Arc_percent');
  const [detailMode, setDetailMode] = React.useState('overlay'); // overlay | stacked
  const [showWindow, setShowWindow] = React.useState(true);

  const colorFor = (name) => {
    const i = pinned.indexOf(name);
    return TOKENS.serieses[Math.max(0, i) % TOKENS.serieses.length];
  };

  const togglePin = (n) =>
    setPinned(p => p.includes(n) ? p.filter(x => x !== n) : [...p, n].slice(0, 6));

  // Stats over the brushed window
  const windowStats = React.useMemo(() => {
    const [a, b] = brush.slice().sort((x,y) => x-y);
    return pinned.map(c => {
      const arr = D.samples[c];
      let mn=Infinity, mx=-Infinity, s=0, n=0;
      for (let i=a; i<=b; i++) { const v=arr[i]; if(v<mn)mn=v; if(v>mx)mx=v; s+=v; n++; }
      const mean = n ? s/n : 0;
      // stddev
      let v2 = 0;
      for (let i=a; i<=b; i++) v2 += (arr[i]-mean)*(arr[i]-mean);
      const sd = Math.sqrt(v2 / Math.max(1, n));
      return { col: c, min: mn, max: mx, mean, std: sd };
    });
  }, [brush, pinned, D]);

  return (
    <div style={{
      background: TOKENS.bg,
      color: TOKENS.text,
      fontFamily: 'Pretendard, -apple-system, sans-serif',
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <AppChrome
        title="레코딩 분석 워크스페이스"
        breadcrumbs="REC_2026-05-13_0937 · BH-12 블록 · 필렛 용접"
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <ConnPill label="RTDE" ok />
            <ConnPill label="MODBUS" ok />
            <span style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10, color: TOKENS.dim,
              padding: '3px 8px',
              border: `1px solid ${TOKENS.border}`,
            }}>OPER · KIM J.S.</span>
          </div>
        }
      />

      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '260px 1fr',
        gap: 1,
        background: TOKENS.border,
        minHeight: 0,
      }}>
        {/* Left: variable browser */}
        <VarBrowser D={D} pinned={pinned} onToggle={togglePin} colorFor={colorFor} />

        {/* Main */}
        <div style={{
          background: TOKENS.bg,
          display: 'grid',
          gridTemplateRows: 'auto 1fr auto auto',
          minHeight: 0, minWidth: 0,
        }}>
          {/* Pinned chips bar */}
          <div style={{
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            borderBottom: `1px solid ${TOKENS.border}`,
            flexWrap: 'wrap',
          }}>
            <span style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10, letterSpacing: 1.4,
              color: TOKENS.dim, textTransform: 'uppercase',
            }}>PINNED</span>
            {pinned.map(c => (
              <Chip key={c} color={colorFor(c)} active removable
                onRemove={() => togglePin(c)}>
                {c}
              </Chip>
            ))}
            <span style={{ flex: 1 }} />
            <Segmented2 value={detailMode} onChange={setDetailMode}
              options={[['overlay','오버레이'],['stacked','상하분할']]} />
          </div>

          {/* Detail / multi-axis chart */}
          <div style={{
            padding: 12,
            minHeight: 0,
            background: TOKENS.panel,
            borderBottom: `1px solid ${TOKENS.border}`,
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 8,
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
              <button onClick={() => setBrush([0, N - 1])} style={btnStyle}>전체 보기</button>
              <button onClick={() => setBrush([Math.round(N*0.55), Math.round(N*0.82)])}
                style={btnStyle}>이벤트 윈도우</button>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              {detailMode === 'overlay' ? (
                <DetailOverlay D={D} pinned={pinned} colorFor={colorFor}
                  brush={brush} hoverIdx={hoverIdx} setHoverIdx={setHoverIdx} />
              ) : (
                <DetailStacked D={D} pinned={pinned} colorFor={colorFor}
                  brush={brush} hoverIdx={hoverIdx} setHoverIdx={setHoverIdx} />
              )}
            </div>
          </div>

          {/* Bottom split: scatter + stats */}
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
                }}>X · Y 상관관계</span>
                <span style={{ flex: 1 }} />
                <VarPick D={D} value={scatterX} onChange={setScatterX} label="X" />
                <VarPick D={D} value={scatterY} onChange={setScatterY} label="Y" />
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <ScatterPlot D={D} xCol={scatterX} yCol={scatterY}
                  brush={brush} hoverIdx={hoverIdx} setHoverIdx={setHoverIdx} />
              </div>
            </div>

            <div style={{ background: TOKENS.panel, padding: 12, display: 'flex', flexDirection: 'column' }}>
              <div style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10, letterSpacing: 1.4,
                color: TOKENS.dim, textTransform: 'uppercase',
                marginBottom: 8,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span>윈도우 통계</span>
                <span style={{ flex: 1 }} />
                <span style={{ color: TOKENS.text }}>
                  {Math.abs(brush[1]-brush[0])+1} 샘플
                </span>
              </div>
              <WindowStatsTable stats={windowStats} colorFor={colorFor} D={D} />
            </div>
          </div>

          {/* Timeline brush at bottom */}
          <BrushTimeline D={D} brush={brush} setBrush={setBrush}
            hoverIdx={hoverIdx} setHoverIdx={setHoverIdx} pinned={pinned} colorFor={colorFor} />
        </div>
      </div>
    </div>
  );
}

const btnStyle = {
  background: TOKENS.panel2,
  border: `1px solid ${TOKENS.border}`,
  color: TOKENS.dim,
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 10,
  padding: '4px 10px',
  borderRadius: 2,
  cursor: 'pointer',
  letterSpacing: 0.5,
};

function Segmented2({ value, onChange, options }) {
  return (
    <div style={{
      display: 'inline-flex',
      background: TOKENS.panel2,
      border: `1px solid ${TOKENS.border}`,
      borderRadius: 2,
      padding: 1,
    }}>
      {options.map(([k, l]) => (
        <button key={k} onClick={() => onChange(k)}
          style={{
            padding: '4px 10px',
            background: value === k ? TOKENS.accent : 'transparent',
            color: value === k ? '#0a0f1c' : TOKENS.dim,
            border: 'none',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10,
            cursor: 'pointer',
            fontWeight: value === k ? 600 : 400,
            letterSpacing: 0.5,
          }}>
          {l}
        </button>
      ))}
    </div>
  );
}

function VarPick({ D, value, onChange, label }) {
  // __timer__ 는 가상 컬럼(경과초). D.cols 에는 없지만 옵션 맨 앞에 강제 추가해서
  // 사용자가 산점도 X/Y 에 "timer" 를 직접 고를 수 있게 한다.
  const hasTimer = Array.isArray(D?.samples?.__timer__);
  return (
    <label style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
      color: TOKENS.dim,
    }}>
      <span style={{ color: TOKENS.accent }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{
          background: TOKENS.panel2,
          border: `1px solid ${TOKENS.border}`,
          color: TOKENS.text,
          padding: '3px 6px',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10,
          borderRadius: 2,
        }}>
        {hasTimer && <option value="__timer__">⏱ timer (경과초)</option>}
        {D.cols.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    </label>
  );
}

function VarBrowser({ D, pinned, onToggle, colorFor }) {
  const [q, setQ] = React.useState('');
  const [filter, setFilter] = React.useState('all');
  const groups = {
    arc: '아크/용접', seam: '시임 추적', pose: '로봇 자세',
    status: '상태/플래그', meta: '메타',
  };

  const cols = D.cols.filter(c => {
    if (filter !== 'all' && D.categories[c] !== filter) return false;
    if (q && !(c.toLowerCase().includes(q.toLowerCase()) ||
      (D.koLabels[c] || '').includes(q))) return false;
    return true;
  });

  return (
    <div style={{
      background: TOKENS.panel2,
      display: 'flex', flexDirection: 'column',
      minHeight: 0,
    }}>
      <div style={{ padding: '12px 12px 0' }}>
        <SectionLabel>레코딩 변수 · {D.cols.length}</SectionLabel>
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="이름으로 검색"
          style={{
            width: '100%',
            background: TOKENS.bg,
            border: `1px solid ${TOKENS.border}`,
            color: TOKENS.text,
            padding: '6px 8px',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 11,
            borderRadius: 2,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
          {['all', ...Object.keys(groups)].map(c => (
            <Chip key={c} active={filter === c} color={TOKENS.accent}
              onClick={() => setFilter(c)}>
              {c === 'all' ? '전체' : groups[c]}
            </Chip>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '8px 6px 12px' }}>
        {cols.map(c => {
          const on = pinned.includes(c);
          return (
            <div key={c}
              onClick={() => onToggle(c)}
              style={{
                display: 'grid',
                gridTemplateColumns: '4px 1fr 56px',
                gap: 8,
                alignItems: 'center',
                padding: '5px 8px',
                cursor: 'pointer',
                borderRadius: 3,
                background: on ? `${colorFor(c)}13` : 'transparent',
              }}>
              <span style={{
                width: 4, height: 16,
                background: on ? colorFor(c) : TOKENS.border,
                borderRadius: 1,
              }} />
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: 11,
                  color: on ? TOKENS.text : TOKENS.dim,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  fontFamily: 'JetBrains Mono, monospace',
                }}>{c}</div>
                {D.koLabels[c] && (
                  <div style={{
                    fontSize: 9, color: TOKENS.muted,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{D.koLabels[c]}</div>
                )}
              </div>
              <Sparkline values={D.samples[c]} w={56} h={18}
                color={on ? colorFor(c) : TOKENS.muted} fill={false} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DetailOverlay({ D, pinned, colorFor, brush, hoverIdx, setHoverIdx }) {
  const ref = React.useRef(null);
  const [size, setSize] = React.useState({ w: 800, h: 320 });
  React.useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(ref.current); return () => ro.disconnect();
  }, []);

  const [a, b] = brush.slice().sort((x,y) => x-y);
  const padL = 60, padR = 60, padT = 14, padB = 24;
  const plotW = Math.max(0, size.w - padL - padR);
  const plotH = Math.max(0, size.h - padT - padB);
  const slice = (arr) => arr.slice(a, b + 1);
  const sliceT = D.t.slice(a, b + 1);

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - padL;
    if (x < 0 || x > plotW) { setHoverIdx(null); return; }
    const i = Math.round((x / plotW) * (sliceT.length - 1));
    setHoverIdx(a + i);
  };

  const hoverInSlice = hoverIdx != null && hoverIdx >= a && hoverIdx <= b ? hoverIdx - a : null;

  return (
    <div ref={ref} style={{ width: '100%', height: '100%' }}>
      <svg width={size.w} height={size.h}
        onMouseMove={onMove} onMouseLeave={() => setHoverIdx(null)}
        style={{ display: 'block' }}>
        <PlotGrid x={padL} y={padT} w={plotW} h={plotH} />
        {/* Welding ON shade */}
        <WeldOnShadeSlice D={D} a={a} b={b} x={padL} y={padT} w={plotW} h={plotH} />
        {/* Alarm marks within window */}
        {D.alarms.map((al, i) => {
          const idx = Math.round((al.t / D.t[D.t.length-1]) * (D.t.length-1));
          if (idx < a || idx > b) return null;
          const ax = padL + (plotW * (idx - a)) / Math.max(1, b - a);
          return (
            <g key={i}>
              <line x1={ax} y1={padT} x2={ax} y2={padT + plotH}
                stroke={severityColor(al.severity)} strokeWidth={0.8} strokeDasharray="2 2" opacity={0.7} />
              <text x={ax + 3} y={padT + 10} fill={severityColor(al.severity)} fontSize={9}
                style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {al.code}
              </text>
            </g>
          );
        })}
        {pinned.map(c => {
          const arr = slice(D.samples[c]);
          const [vmin, vmax] = D.ranges[c];
          const pad = (vmax - vmin) * 0.08;
          return (
            <path key={c}
              d={buildPath(arr, padL, padT, plotW, plotH, vmin - pad, vmax + pad)}
              fill="none" stroke={colorFor(c)} strokeWidth={1.3} />
          );
        })}
        <TimeAxis x={padL} y={padT + plotH} w={plotW} t={sliceT} ticks={6} />
        {/* per-series axis tags on left */}
        {pinned.map((c, i) => (
          <g key={c}>
            <text x={padL - 6} y={padT + 14 + i * 16} fill={colorFor(c)} fontSize={10}
              textAnchor="end"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              ─ {c}
            </text>
          </g>
        ))}
        <Crosshair
          x={padL} y={padT} h={plotH} plotW={plotW}
          idx={hoverInSlice} t={sliceT}
          names={pinned} colors={pinned.map(colorFor)}
          values={pinned.map(c => hoverIdx != null ? D.samples[c][hoverIdx] : null)}
        />
      </svg>
    </div>
  );
}

function DetailStacked({ D, pinned, colorFor, brush, hoverIdx, setHoverIdx }) {
  const ref = React.useRef(null);
  const [size, setSize] = React.useState({ w: 800, h: 320 });
  React.useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(ref.current); return () => ro.disconnect();
  }, []);
  const [a, b] = brush.slice().sort((x,y) => x-y);
  const padL = 80, padR = 16, padT = 6, padB = 18;
  const plotW = Math.max(0, size.w - padL - padR);
  const rowH = Math.max(34, (size.h - padT - padB) / Math.max(1, pinned.length));
  const sliceT = D.t.slice(a, b + 1);

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - padL;
    if (x < 0 || x > plotW) { setHoverIdx(null); return; }
    setHoverIdx(a + Math.round((x / plotW) * (sliceT.length - 1)));
  };

  return (
    <div ref={ref} style={{ width: '100%', height: '100%' }}>
      <svg width={size.w} height={size.h}
        onMouseMove={onMove} onMouseLeave={() => setHoverIdx(null)}
        style={{ display: 'block' }}>
        {pinned.map((c, i) => {
          const y = padT + i * rowH;
          const arr = D.samples[c].slice(a, b + 1);
          const [vmin, vmax] = D.ranges[c];
          const pad = (vmax - vmin) * 0.1;
          const path = buildPath(arr, padL, y + 4, plotW, rowH - 8, vmin - pad, vmax + pad);
          const last = `L ${(padL + plotW).toFixed(2)} ${(y + rowH - 4).toFixed(2)} L ${padL.toFixed(2)} ${(y + rowH - 4).toFixed(2)} Z`;
          const hovIn = hoverIdx != null && hoverIdx >= a && hoverIdx <= b;
          return (
            <g key={c}>
              <rect x={padL} y={y} width={plotW} height={rowH - 1}
                fill={TOKENS.panel2} stroke={TOKENS.border} strokeWidth={0.5} />
              <path d={path + last} fill={colorFor(c)} opacity={0.12} />
              <path d={path} fill="none" stroke={colorFor(c)} strokeWidth={1.3} />
              <text x={padL - 8} y={y + 14} fill={TOKENS.text} fontSize={11}
                textAnchor="end"
                style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {c}
              </text>
              <text x={padL - 8} y={y + rowH - 6} fill={colorFor(c)} fontSize={9}
                textAnchor="end"
                style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {fmt(D.samples[c][hoverIdx ?? a], 2)} {D.units[c] || ''}
              </text>
              {hovIn && (
                <line
                  x1={padL + plotW * (hoverIdx - a) / Math.max(1, b - a)}
                  x2={padL + plotW * (hoverIdx - a) / Math.max(1, b - a)}
                  y1={y} y2={y + rowH - 1}
                  stroke={TOKENS.borderHi} strokeWidth={0.8} />
              )}
            </g>
          );
        })}
        <TimeAxis x={padL} y={padT + pinned.length * rowH} w={plotW} t={sliceT} ticks={6} />
      </svg>
    </div>
  );
}

function WeldOnShade({ D, x, y, w, h }) {
  const arr = D.samples.weldingOnOff;
  const out = [];
  let runStart = null;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] && runStart == null) runStart = i;
    if ((!arr[i] || i === arr.length - 1) && runStart != null) {
      const end = arr[i] ? i : i - 1;
      const x0 = x + (w * runStart) / (arr.length - 1);
      const x1 = x + (w * end) / (arr.length - 1);
      out.push(<rect key={runStart} x={x0} y={y} width={x1 - x0} height={h}
        fill={TOKENS.accent} opacity={0.04} />);
      runStart = null;
    }
  }
  return <g>{out}</g>;
}

function WeldOnShadeSlice({ D, a, b, x, y, w, h }) {
  const arr = D.samples.weldingOnOff;
  const out = [];
  let runStart = null;
  for (let i = a; i <= b; i++) {
    if (arr[i] && runStart == null) runStart = i;
    if ((!arr[i] || i === b) && runStart != null) {
      const end = arr[i] ? i : i - 1;
      const span = Math.max(1, b - a);
      const x0 = x + (w * (runStart - a)) / span;
      const x1 = x + (w * (end - a)) / span;
      out.push(<rect key={runStart} x={x0} y={y} width={Math.max(0, x1-x0)} height={h}
        fill={TOKENS.accent} opacity={0.05} />);
      runStart = null;
    }
  }
  return <g>{out}</g>;
}

function ScatterPlot({ D, xCol, yCol, brush, hoverIdx, setHoverIdx }) {
  const ref = React.useRef(null);
  const [size, setSize] = React.useState({ w: 400, h: 220 });
  React.useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(ref.current); return () => ro.disconnect();
  }, []);
  const [a, b] = brush.slice().sort((x,y) => x-y);
  const padL = 36, padR = 10, padT = 10, padB = 28;
  const plotW = Math.max(0, size.w - padL - padR);
  const plotH = Math.max(0, size.h - padT - padB);

  // 컬럼이 비어있거나 ranges 미정인 경우(데이터 첫 로드 직후 등) 안전한 폴백.
  const xRange = D?.ranges?.[xCol] || [0, 1];
  const yRange = D?.ranges?.[yCol] || [0, 1];
  const [xmn, xmx] = xRange;
  const [ymn, ymx] = yRange;
  const xp = (xmx - xmn) * 0.05 || 1, yp = (ymx - ymn) * 0.05 || 1;
  const xR = [xmn - xp, xmx + xp], yR = [ymn - yp, ymx + yp];
  const sx = (v) => padL + ((v - xR[0]) / (xR[1] - xR[0])) * plotW;
  const sy = (v) => padT + plotH - ((v - yR[0]) / (yR[1] - yR[0])) * plotH;

  // Correlation over brushed range
  const corr = React.useMemo(() => {
    const X = D?.samples?.[xCol];
    const Y = D?.samples?.[yCol];
    if (!Array.isArray(X) || !Array.isArray(Y)) return 0;
    let n=0, sxV=0, syV=0;
    for (let i=a;i<=b && i<X.length && i<Y.length;i++){
      const xv = X[i], yv = Y[i];
      if (typeof xv !== 'number' || typeof yv !== 'number') continue;
      sxV+=xv;syV+=yv;n++;
    }
    if (n === 0) return 0;
    const mx=sxV/n, my=syV/n;
    let num=0, dx=0, dy=0;
    for (let i=a;i<=b && i<X.length && i<Y.length;i++){
      const xv = X[i], yv = Y[i];
      if (typeof xv !== 'number' || typeof yv !== 'number') continue;
      const u=xv-mx,v=yv-my;num+=u*v;dx+=u*u;dy+=v*v;
    }
    const den = Math.sqrt(dx*dy) || 1;
    return num/den;
  }, [xCol, yCol, brush, D]);

  // 데이터가 아직 준비 안됐으면 안내 메시지로 대체.
  const xHas = Array.isArray(D?.samples?.[xCol]);
  const yHas = Array.isArray(D?.samples?.[yCol]);
  if (!xHas || !yHas) {
    return (
      <div ref={ref} style={{
        width: '100%', height: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
        color: TOKENS.muted,
      }}>
        산점도 컬럼을 선택해주세요
      </div>
    );
  }

  // 산점도 자체에서 마우스 추적 — 가장 가까운 점을 찾아 hoverIdx 로 전파.
  // 같은 hoverIdx 가 detail/timeline/다른 산점도에도 반영돼서 화면 전체가 sync.
  const onMove = (e) => {
    if (!setHoverIdx) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (mx < padL || mx > padL + plotW || my < padT || my > padT + plotH) return;
    const X = D.samples[xCol], Y = D.samples[yCol];
    let bestI = -1, bestD = Infinity;
    for (let i = a; i <= b && i < X.length && i < Y.length; i++) {
      const xv = X[i], yv = Y[i];
      if (typeof xv !== 'number' || typeof yv !== 'number') continue;
      const dx = sx(xv) - mx, dy = sy(yv) - my;
      const d2 = dx*dx + dy*dy;
      if (d2 < bestD) { bestD = d2; bestI = i; }
    }
    // 너무 멀면 hover 해제 — 빈 영역에서도 마지막 점이 강조되는 걸 막음
    if (bestI >= 0 && bestD < 30*30) setHoverIdx(bestI);
    else setHoverIdx(null);
  };
  const onLeave = () => { if (setHoverIdx) setHoverIdx(null); };

  // hover 점의 X/Y 값 (badge 표시용)
  const hvX = hoverIdx != null ? D.samples[xCol]?.[hoverIdx] : null;
  const hvY = hoverIdx != null ? D.samples[yCol]?.[hoverIdx] : null;
  const hvOk = typeof hvX === 'number' && typeof hvY === 'number';

  return (
    <div ref={ref} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg width={size.w} height={size.h} style={{ display: 'block' }}
        onMouseMove={onMove} onMouseLeave={onLeave}>
        <PlotGrid x={padL} y={padT} w={plotW} h={plotH} rows={4} cols={5} />
        {/* axes */}
        <line x1={padL} y1={padT+plotH} x2={padL+plotW} y2={padT+plotH} stroke={TOKENS.border} />
        <line x1={padL} y1={padT} x2={padL} y2={padT+plotH} stroke={TOKENS.border} />
        {/* points: all in dim, brushed range in accent */}
        {D.samples[xCol].map((vx, i) => {
          const vy = D.samples[yCol][i];
          if (vx == null || vy == null) return null;
          const inWindow = i >= a && i <= b;
          const r = inWindow ? 1.6 : 1;
          return (
            <circle key={i} cx={sx(vx)} cy={sy(vy)} r={r}
              fill={inWindow ? TOKENS.accent : TOKENS.muted}
              opacity={inWindow ? 0.55 : 0.18} />
          );
        })}
        {/* hover marker + 값 라벨 — Y 값(축 컬럼값) 만 단독 표시. X 는 컬럼명만으로
            맥락이 명확해서 라벨 안에 또 표시하면 오히려 혼란. "Y" prefix 도 제거. */}
        {hvOk && (() => {
          const cx = sx(hvX), cy = sy(hvY);
          const labelW = 80, labelH = 22;
          const right = cx + labelW + 12 < padL + plotW;
          const lx = right ? cx + 8 : cx - labelW - 8;
          const below = cy - labelH - 8 < padT;
          const ly = below ? cy + 8 : cy - labelH - 8;
          return (
            <g style={{ pointerEvents: 'none' }}>
              <circle cx={cx} cy={cy} r={5} fill="none" stroke={TOKENS.cyan} strokeWidth={1.5} />
              <rect x={lx} y={ly} width={labelW} height={labelH}
                fill="#000" opacity={0.88} stroke={TOKENS.cyan} strokeWidth={0.8} rx={2} />
              <text x={lx + labelW / 2} y={ly + 15} fill={TOKENS.cyan} fontSize={11}
                textAnchor="middle"
                style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {fmt(hvY, 3)}
              </text>
            </g>
          );
        })()}
        {/* corr badge */}
        <g>
          <rect x={padL + plotW - 80} y={padT + 4} width={76} height={20}
            fill={TOKENS.bg} stroke={TOKENS.border} strokeWidth={0.5} rx={2} />
          <text x={padL + plotW - 42} y={padT + 18} fill={TOKENS.text} fontSize={11}
            textAnchor="middle"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            r = {fmt(corr, 3)}
          </text>
        </g>
        {/* axis labels — __timer__ 는 ⏱timer(s) 로 예쁘게 표시 */}
        <text x={padL + plotW/2} y={padT + plotH + 22} fill={TOKENS.dim} fontSize={10}
          textAnchor="middle"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          {xCol === '__timer__' ? '⏱ timer (s)' : xCol}
        </text>
        <text x={padL - 6} y={padT + plotH/2} fill={TOKENS.dim} fontSize={10}
          textAnchor="middle" transform={`rotate(-90 ${padL-6} ${padT+plotH/2})`}
          style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          {yCol === '__timer__' ? '⏱ timer (s)' : yCol}
        </text>
        {/* axis min/max */}
        <text x={padL} y={padT + plotH + 12} fill={TOKENS.muted} fontSize={9}
          style={{ fontFamily: 'JetBrains Mono, monospace' }}>{fmt(xR[0],1)}</text>
        <text x={padL+plotW} y={padT + plotH + 12} fill={TOKENS.muted} fontSize={9}
          textAnchor="end"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}>{fmt(xR[1],1)}</text>
        <text x={padL - 4} y={padT + 8} fill={TOKENS.muted} fontSize={9}
          textAnchor="end"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}>{fmt(yR[1],1)}</text>
        <text x={padL - 4} y={padT + plotH} fill={TOKENS.muted} fontSize={9}
          textAnchor="end"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}>{fmt(yR[0],1)}</text>
      </svg>
    </div>
  );
}

function WindowStatsTable({ stats, colorFor, D }) {
  return (
    <div style={{
      flex: 1, overflowY: 'auto', minHeight: 0,
      fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '14px 1fr 60px 60px 60px 60px',
        gap: 4,
        padding: '4px 0',
        fontSize: 9,
        color: TOKENS.muted,
        borderBottom: `1px solid ${TOKENS.border}`,
        letterSpacing: 0.8,
      }}>
        <span></span>
        <span>VARIABLE</span>
        <span style={{ textAlign: 'right' }}>MIN</span>
        <span style={{ textAlign: 'right' }}>MEAN</span>
        <span style={{ textAlign: 'right' }}>MAX</span>
        <span style={{ textAlign: 'right' }}>σ</span>
      </div>
      {stats.map(s => (
        <div key={s.col} style={{
          display: 'grid',
          gridTemplateColumns: '14px 1fr 60px 60px 60px 60px',
          gap: 4,
          padding: '5px 0',
          alignItems: 'center',
          borderBottom: `1px solid ${TOKENS.border}33`,
        }}>
          <span style={{ width: 8, height: 8, background: colorFor(s.col), borderRadius: 1 }} />
          <span style={{ color: TOKENS.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.col}</span>
          <span style={{ textAlign: 'right', color: TOKENS.dim }}>{fmt(s.min, 2)}</span>
          <span style={{ textAlign: 'right', color: TOKENS.text }}>{fmt(s.mean, 2)}</span>
          <span style={{ textAlign: 'right', color: TOKENS.dim }}>{fmt(s.max, 2)}</span>
          <span style={{ textAlign: 'right', color: TOKENS.amber }}>{fmt(s.std, 2)}</span>
        </div>
      ))}
    </div>
  );
}

function BrushTimeline({ D, brush, setBrush, hoverIdx, setHoverIdx, pinned, colorFor }) {
  const ref = React.useRef(null);
  const [size, setSize] = React.useState({ w: 800, h: 90 });
  React.useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(ref.current); return () => ro.disconnect();
  }, []);
  const padL = 60, padR = 16, padT = 6, padB = 22;
  const plotW = Math.max(0, size.w - padL - padR);
  const plotH = Math.max(20, size.h - padT - padB);

  const N = D.t.length;
  const idxAt = (x) => Math.max(0, Math.min(N-1, Math.round(((x - padL) / plotW) * (N-1))));
  const xAt = (i) => padL + (plotW * i) / (N - 1);

  const [drag, setDrag] = React.useState(null); // {type: 'lo'|'hi'|'move'|'new', startX, origBrush}
  const [a, b] = brush.slice().sort((x,y) => x-y);

  const onMouseDown = (e) => {
    const rect = ref.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const i = idxAt(x);
    const xLo = xAt(a), xHi = xAt(b);
    if (Math.abs(x - xLo) < 6) setDrag({ type: 'lo' });
    else if (Math.abs(x - xHi) < 6) setDrag({ type: 'hi' });
    else if (x > xLo && x < xHi) setDrag({ type: 'move', startI: i, orig: [a, b] });
    else setDrag({ type: 'new', anchor: i });
    e.preventDefault();
  };
  const onMouseMove = (e) => {
    const rect = ref.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const i = idxAt(x);
    setHoverIdx(i);
    if (!drag) return;
    if (drag.type === 'lo') setBrush([i, b]);
    else if (drag.type === 'hi') setBrush([a, i]);
    else if (drag.type === 'move') {
      const di = i - drag.startI;
      let na = drag.orig[0] + di, nb = drag.orig[1] + di;
      if (na < 0) { nb -= na; na = 0; }
      if (nb >= N) { na -= (nb - N + 1); nb = N - 1; }
      setBrush([na, nb]);
    } else if (drag.type === 'new') {
      setBrush([drag.anchor, i]);
    }
  };
  const onMouseUp = () => setDrag(null);

  return (
    <div ref={ref}
      onMouseDown={onMouseDown} onMouseMove={onMouseMove}
      onMouseUp={onMouseUp} onMouseLeave={() => { setDrag(null); setHoverIdx(null); }}
      style={{
        background: TOKENS.panel2,
        borderTop: `1px solid ${TOKENS.border}`,
        height: 100, position: 'relative',
        cursor: drag?.type === 'move' ? 'grabbing' : 'crosshair',
      }}>
      <svg width={size.w} height={size.h} style={{ display: 'block' }}>
        <WeldOnShade D={D} x={padL} y={padT} w={plotW} h={plotH} />
        {/* Background mini lines for all pinned */}
        {pinned.map(c => {
          const [vmn, vmx] = D.ranges[c];
          return (
            <path key={c} d={buildPath(D.samples[c], padL, padT, plotW, plotH, vmn, vmx)}
              fill="none" stroke={colorFor(c)} strokeWidth={0.7} opacity={0.5} />
          );
        })}
        {/* Alarm marks */}
        {D.alarms.map((al, i) => {
          const idx = Math.round((al.t / D.t[D.t.length-1]) * (D.t.length-1));
          const ax = xAt(idx);
          return (
            <line key={i} x1={ax} y1={padT} x2={ax} y2={padT + plotH}
              stroke={severityColor(al.severity)} strokeWidth={0.8} opacity={0.7} />
          );
        })}
        {/* Brush window */}
        <rect x={xAt(a)} y={padT} width={xAt(b) - xAt(a)} height={plotH}
          fill={TOKENS.accent} opacity={0.12} />
        <line x1={xAt(a)} y1={padT} x2={xAt(a)} y2={padT + plotH}
          stroke={TOKENS.accent} strokeWidth={1.5} />
        <line x1={xAt(b)} y1={padT} x2={xAt(b)} y2={padT + plotH}
          stroke={TOKENS.accent} strokeWidth={1.5} />
        {/* Handle pull tabs */}
        {[a, b].map((i, k) => (
          <g key={k}>
            <rect x={xAt(i) - 4} y={padT + plotH/2 - 8} width={8} height={16}
              fill={TOKENS.accent} rx={1} />
          </g>
        ))}
        <TimeAxis x={padL} y={padT + plotH} w={plotW} t={D.t} ticks={12} />
        <text x={padL - 8} y={padT + 12} fill={TOKENS.dim} fontSize={9}
          textAnchor="end"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          TIMELINE
        </text>
        {hoverIdx != null && (
          <line x1={xAt(hoverIdx)} y1={padT} x2={xAt(hoverIdx)} y2={padT + plotH}
            stroke={TOKENS.text} strokeWidth={0.5} opacity={0.5} />
        )}
      </svg>
    </div>
  );
}

window.VariantStandard = VariantStandard;
window.AnalysisVarBrowser = VarBrowser;
window.AnalysisDetailOverlay = DetailOverlay;
window.AnalysisDetailStacked = DetailStacked;
window.AnalysisScatterPlot = ScatterPlot;
window.AnalysisWindowStatsTable = WindowStatsTable;
window.AnalysisBrushTimeline = BrushTimeline;
window.AnalysisBtnStyle = btnStyle;
window.AnalysisSegmented2 = Segmented2;
window.AnalysisVarPick = VarPick;
