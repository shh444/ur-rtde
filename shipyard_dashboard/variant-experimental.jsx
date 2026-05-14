// Variant 3: 실험적 (Experimental)
// Two-cursor A/B comparison workspace + heatmap overview.
// Drag two cursors on a timeline to two distinct moments → instantly see
// which variables changed most between them, sorted by delta.
// Top is a "spectrogram" view: every variable rendered as a horizontal
// heatmap row so you can spot anomalies across all 40 columns at once.

function VariantExperimental() {
  const D = window.RTDE;
  const N = D.N;
  const [cursorA, setCursorA] = React.useState(Math.round(N * 0.45));
  const [cursorB, setCursorB] = React.useState(Math.round(N * 0.72));
  const [drag, setDrag] = React.useState(null); // 'A' | 'B' | null
  const [focus, setFocus] = React.useState(null); // hovered row col name
  const [sortBy, setSortBy] = React.useState('delta'); // delta | name | cat
  const [selectedCol, setSelectedCol] = React.useState('weldCurrent');
  const [showZero, setShowZero] = React.useState(false);
  const [view, setView] = React.useState('compare'); // compare | spectrum | gp

  // Normalize values for the heatmap (per column 0..1)
  const norm = React.useMemo(() => {
    const out = {};
    D.cols.forEach(c => {
      const arr = D.samples[c];
      const [mn, mx] = D.ranges[c];
      const range = (mx - mn) || 1;
      const n = new Float32Array(arr.length);
      for (let i = 0; i < arr.length; i++) n[i] = (arr[i] - mn) / range;
      out[c] = n;
    });
    return out;
  }, [D]);

  // Compute deltas between A and B
  const deltas = React.useMemo(() => {
    return D.cols.map(c => {
      const a = D.samples[c][cursorA];
      const b = D.samples[c][cursorB];
      const [mn, mx] = D.ranges[c];
      const range = Math.max(1e-6, mx - mn);
      return {
        col: c,
        a, b,
        absDelta: Math.abs(b - a),
        normDelta: Math.abs((b - a) / range),  // 0..1 of variable range
        signed: b - a,
        cat: D.categories[c],
      };
    });
  }, [cursorA, cursorB, D]);

  const sortedDeltas = React.useMemo(() => {
    const arr = [...deltas];
    if (!showZero) arr.sort((x, y) => y.normDelta - x.normDelta);
    if (sortBy === 'name') arr.sort((x, y) => x.col.localeCompare(y.col));
    else if (sortBy === 'cat') arr.sort((x, y) => (x.cat || '').localeCompare(y.cat || ''));
    return arr;
  }, [deltas, sortBy, showZero]);

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
        title="A/B 비교 분석"
        breadcrumbs="실험적 워크스페이스 · 두 시점을 끌어 모든 변수의 변화 비교"
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <ConnPill label="RTDE" ok />
            <ConnPill label="MODBUS" ok />
            <span style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10, color: TOKENS.accent,
            }}>EXPERIMENTAL</span>
          </div>
        }
      />

      {/* View switcher tabs */}
      <div style={{
        display: 'flex', padding: '8px 16px',
        gap: 8, borderBottom: `1px solid ${TOKENS.border}`,
        background: TOKENS.panel2,
        alignItems: 'center',
        flex: '0 0 auto',
      }}>
        {[
          ['compare', 'A/B 비교'],
          ['spectrum', '스펙트럼 뷰'],
          ['gp', 'GP 매핑'],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setView(k)}
            style={{
              padding: '5px 12px',
              background: view === k ? `${TOKENS.accent}` : 'transparent',
              color: view === k ? '#0a0f1c' : TOKENS.dim,
              border: `1px solid ${view === k ? TOKENS.accent : TOKENS.border}`,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10,
              letterSpacing: 0.6,
              borderRadius: 2,
              cursor: 'pointer',
              fontWeight: view === k ? 600 : 400,
            }}>{l}</button>
        ))}
        <span style={{ flex: 1 }} />
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10, color: TOKENS.dim,
        }}>
          <span style={{ color: TOKENS.cyan }}>A</span>
          {' '}{fmtT(D.t[cursorA])}
          {' '}<span style={{ color: TOKENS.muted }}>→</span>{' '}
          <span style={{ color: TOKENS.amber }}>B</span>
          {' '}{fmtT(D.t[cursorB])}
          {' '}<span style={{ color: TOKENS.accent }}>
            (Δ {fmtT(Math.abs(D.t[cursorB] - D.t[cursorA]))})
          </span>
        </span>
      </div>

      {view === 'compare' && (
        <CompareView
          D={D} norm={norm}
          cursorA={cursorA} cursorB={cursorB}
          setCursorA={setCursorA} setCursorB={setCursorB}
          drag={drag} setDrag={setDrag}
          deltas={sortedDeltas} totalDeltas={deltas}
          focus={focus} setFocus={setFocus}
          sortBy={sortBy} setSortBy={setSortBy}
          selectedCol={selectedCol} setSelectedCol={setSelectedCol}
        />
      )}
      {view === 'spectrum' && (
        <SpectrumView D={D} norm={norm} cursorA={cursorA} cursorB={cursorB}
          setCursorA={setCursorA} setCursorB={setCursorB}
          drag={drag} setDrag={setDrag}
          focus={focus} setFocus={setFocus} />
      )}
      {view === 'gp' && (
        <GPMappingView D={D} />
      )}
    </div>
  );
}

// ---------------- Compare View ----------------
function CompareView({
  D, norm, cursorA, cursorB, setCursorA, setCursorB,
  drag, setDrag, deltas, totalDeltas,
  focus, setFocus,
  sortBy, setSortBy,
  selectedCol, setSelectedCol,
}) {
  // Sum normalized delta across all variables - the "anomaly score"
  const anomalyScore = totalDeltas.reduce((s, d) => s + d.normDelta, 0) / totalDeltas.length;

  return (
    <div style={{
      flex: 1,
      display: 'grid',
      gridTemplateRows: 'auto 1fr',
      gap: 1,
      background: TOKENS.border,
      minHeight: 0,
    }}>
      {/* Top: spectrum band + dual cursor timeline */}
      <DualCursorTimeline
        D={D} norm={norm}
        cursorA={cursorA} cursorB={cursorB}
        setCursorA={setCursorA} setCursorB={setCursorB}
        drag={drag} setDrag={setDrag}
        focus={focus}
      />

      {/* Body: split */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 380px',
        gap: 1,
        background: TOKENS.border,
        minHeight: 0,
      }}>
        {/* A snapshot card */}
        <SnapshotCard D={D} idx={cursorA} label="A" accent={TOKENS.cyan}
          focusCol={focus || selectedCol} onPickCol={setSelectedCol}
          peerIdx={cursorB} />
        {/* B snapshot card */}
        <SnapshotCard D={D} idx={cursorB} label="B" accent={TOKENS.amber}
          focusCol={focus || selectedCol} onPickCol={setSelectedCol}
          peerIdx={cursorA} />
        {/* Delta panel */}
        <DeltaPanel D={D} deltas={deltas} totalDeltas={totalDeltas}
          cursorA={cursorA} cursorB={cursorB}
          focus={focus} setFocus={setFocus}
          selectedCol={selectedCol} setSelectedCol={setSelectedCol}
          sortBy={sortBy} setSortBy={setSortBy}
          anomalyScore={anomalyScore} />
      </div>
    </div>
  );
}

function DualCursorTimeline({
  D, norm, cursorA, cursorB, setCursorA, setCursorB,
  drag, setDrag, focus,
}) {
  const ref = React.useRef(null);
  const [size, setSize] = React.useState({ w: 800, h: 200 });
  React.useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(ref.current); return () => ro.disconnect();
  }, []);
  const padL = 140, padR = 16, padT = 8, padB = 22;
  const plotW = Math.max(0, size.w - padL - padR);
  const plotH = Math.max(60, size.h - padT - padB);
  const N = D.t.length;
  const idxAt = (x) => Math.max(0, Math.min(N-1, Math.round(((x - padL) / plotW) * (N-1))));
  const xAt = (i) => padL + (plotW * i) / (N - 1);

  // Pick a small set of "key" variables to show as colored bands
  const keyVars = [
    ['weldCurrent', TOKENS.accent],
    ['Arc_percent', TOKENS.amber],
    ['xOffset', TOKENS.cyan],
    ['zOffset', TOKENS.green],
    ['weldingOnOff', TOKENS.violet],
  ];
  const rowH = plotH / keyVars.length;

  // Render cells per pixel column for speed (heatmap rectangles)
  const cellsPerVar = React.useMemo(() => {
    // bucket time into ~ plotW pixel columns
    const pxCols = Math.max(40, Math.min(plotW, 800));
    return keyVars.map(([col]) => {
      const arr = norm[col];
      const out = [];
      for (let p = 0; p < pxCols; p++) {
        const i0 = Math.floor((p / pxCols) * N);
        const i1 = Math.floor(((p + 1) / pxCols) * N);
        let s = 0, n = 0;
        for (let k = i0; k < Math.max(i0 + 1, i1); k++) { s += arr[k]; n++; }
        out.push(n ? s / n : 0);
      }
      return out;
    });
    // eslint-disable-next-line
  }, [plotW, N, norm]);

  const onMouseDown = (e) => {
    const rect = ref.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const xA = xAt(cursorA), xB = xAt(cursorB);
    if (Math.abs(x - xA) < Math.abs(x - xB)) setDrag('A');
    else setDrag('B');
    e.preventDefault();
  };
  const onMouseMove = (e) => {
    if (!drag) return;
    const rect = ref.current.getBoundingClientRect();
    const i = idxAt(e.clientX - rect.left);
    if (drag === 'A') setCursorA(i);
    else if (drag === 'B') setCursorB(i);
  };

  return (
    <div ref={ref}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={() => setDrag(null)}
      onMouseLeave={() => setDrag(null)}
      style={{
        background: TOKENS.panel,
        height: 200, position: 'relative',
        cursor: drag ? 'grabbing' : 'crosshair',
        userSelect: 'none',
      }}>
      <svg width={size.w} height={size.h} style={{ display: 'block' }}>
        {/* Heatmap rows */}
        {keyVars.map(([col, color], rowI) => {
          const y = padT + rowI * rowH;
          const cells = cellsPerVar[rowI];
          const cellW = plotW / cells.length;
          return (
            <g key={col}>
              <rect x={padL} y={y} width={plotW} height={rowH - 1}
                fill={TOKENS.bg} />
              {cells.map((v, i) => {
                const alpha = 0.15 + v * 0.85;
                return (
                  <rect key={i}
                    x={padL + i * cellW} y={y}
                    width={cellW + 0.5} height={rowH - 1}
                    fill={color} opacity={alpha} />
                );
              })}
              {/* label */}
              <text x={padL - 8} y={y + rowH/2 + 3} fill={TOKENS.text} fontSize={11}
                textAnchor="end"
                style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {col}
              </text>
              <text x={padL - 8} y={y + rowH/2 + 14} fill={TOKENS.muted} fontSize={8}
                textAnchor="end"
                style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {D.koLabels[col] || ''}
              </text>
            </g>
          );
        })}
        {/* Cursors */}
        <CursorMark x={xAt(cursorA)} y={padT} h={plotH} color={TOKENS.cyan} label="A" />
        <CursorMark x={xAt(cursorB)} y={padT} h={plotH} color={TOKENS.amber} label="B" />
        <TimeAxis x={padL} y={padT + plotH} w={plotW} t={D.t} ticks={12} />
        {/* Header label */}
        <text x={padL - 8} y={padT - 2} fill={TOKENS.dim} fontSize={9}
          textAnchor="end"
          style={{ fontFamily: 'JetBrains Mono, monospace', letterSpacing: 1 }}>
          HEATMAP · DRAG A/B
        </text>
      </svg>
    </div>
  );
}

function CursorMark({ x, y, h, color, label }) {
  return (
    <g style={{ pointerEvents: 'none' }}>
      <line x1={x} y1={y - 2} x2={x} y2={y + h + 2}
        stroke={color} strokeWidth={1.5} />
      <polygon points={`${x-6},${y-2} ${x+6},${y-2} ${x},${y+4}`} fill={color} />
      <rect x={x - 8} y={y - 18} width={16} height={14} fill={color} rx={2} />
      <text x={x} y={y - 7} fill="#0a0f1c" fontSize={10} textAnchor="middle"
        style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
        {label}
      </text>
    </g>
  );
}

function SnapshotCard({ D, idx, label, accent, focusCol, onPickCol, peerIdx }) {
  // Compact list of values at this timestamp, highlight the focused row
  const items = D.cols.slice(0, 16); // keep first 16 visible
  return (
    <div style={{
      background: TOKENS.panel,
      padding: 12,
      display: 'flex', flexDirection: 'column',
      minHeight: 0,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: 10,
      }}>
        <div style={{
          width: 22, height: 22,
          background: accent,
          borderRadius: 2,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#0a0f1c',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 13, fontWeight: 700,
        }}>{label}</div>
        <div>
          <div style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 16, color: TOKENS.text, fontWeight: 500,
          }}>
            {fmtT(D.t[idx])}
          </div>
          <div style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10, color: TOKENS.dim,
            letterSpacing: 0.6,
          }}>
            SAMPLE #{idx} · {D.samples.weldingOnOff[idx] ? 'WELDING' : 'IDLE'}
          </div>
        </div>
      </div>

      <FocusedTimeChart D={D} col={focusCol} idx={idx} peerIdx={peerIdx} accent={accent} />

      <div style={{
        marginTop: 12,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 1,
        background: TOKENS.border,
        flex: 1, minHeight: 0,
        overflow: 'hidden',
      }}>
        <div style={{
          background: TOKENS.panel2,
          overflowY: 'auto',
          padding: '4px 0',
          fontFamily: 'JetBrains Mono, monospace',
        }}>
          {items.slice(0, 8).map(c => (
            <ValueRow key={c} D={D} c={c} idx={idx} accent={accent}
              isFocus={c === focusCol} onClick={() => onPickCol(c)} />
          ))}
        </div>
        <div style={{
          background: TOKENS.panel2,
          overflowY: 'auto',
          padding: '4px 0',
          fontFamily: 'JetBrains Mono, monospace',
        }}>
          {items.slice(8, 16).map(c => (
            <ValueRow key={c} D={D} c={c} idx={idx} accent={accent}
              isFocus={c === focusCol} onClick={() => onPickCol(c)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ValueRow({ D, c, idx, accent, isFocus, onClick }) {
  const v = D.samples[c][idx];
  return (
    <div onClick={onClick} style={{
      padding: '4px 10px',
      display: 'grid',
      gridTemplateColumns: '1fr auto auto',
      gap: 6,
      alignItems: 'center',
      cursor: 'pointer',
      background: isFocus ? `${accent}15` : 'transparent',
      borderLeft: isFocus ? `2px solid ${accent}` : `2px solid transparent`,
    }}>
      <span style={{
        fontSize: 10,
        color: isFocus ? TOKENS.text : TOKENS.dim,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{c}</span>
      <span style={{
        fontSize: 11,
        color: isFocus ? accent : TOKENS.text,
        fontWeight: 500,
      }}>{fmt(v, 2)}</span>
      <span style={{
        fontSize: 9, color: TOKENS.muted,
        minWidth: 16, textAlign: 'right',
      }}>{D.units[c] || ''}</span>
    </div>
  );
}

function FocusedTimeChart({ D, col, idx, peerIdx, accent }) {
  // Show a mini chart of the focused column, mark THIS card's cursor strongly
  // and the peer card's cursor faintly
  const ref = React.useRef(null);
  const [size, setSize] = React.useState({ w: 400, h: 100 });
  React.useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(ref.current); return () => ro.disconnect();
  }, []);
  const padL = 8, padR = 8, padT = 4, padB = 18;
  const plotW = Math.max(0, size.w - padL - padR);
  const plotH = Math.max(0, size.h - padT - padB);
  const arr = D.samples[col];
  const [vmn, vmx] = D.ranges[col];
  const pad = (vmx - vmn) * 0.08 || 1;
  const xAt = (i) => padL + (plotW * i) / (arr.length - 1);

  return (
    <div ref={ref} style={{
      height: 100,
      background: TOKENS.bg,
      border: `1px solid ${TOKENS.border}`,
      borderRadius: 2,
    }}>
      <svg width={size.w} height={size.h} style={{ display: 'block' }}>
        <path d={buildPath(arr, padL, padT, plotW, plotH, vmn - pad, vmx + pad)}
          fill="none" stroke={accent} strokeWidth={1.2} opacity={0.9} />
        {/* peer cursor faint */}
        {peerIdx != null && (
          <line x1={xAt(peerIdx)} y1={padT} x2={xAt(peerIdx)} y2={padT + plotH}
            stroke={TOKENS.muted} strokeWidth={1} strokeDasharray="2 2" opacity={0.6} />
        )}
        {/* my cursor strong */}
        <line x1={xAt(idx)} y1={padT} x2={xAt(idx)} y2={padT + plotH}
          stroke={accent} strokeWidth={1.5} />
        <circle cx={xAt(idx)} cy={padT + plotH - ((arr[idx] - (vmn - pad)) / (vmx - vmn + pad * 2)) * plotH}
          r={3} fill={accent} stroke="#0a0f1c" strokeWidth={1.5} />
        <text x={padL + 4} y={padT + 10} fill={TOKENS.text} fontSize={10}
          style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          {col} · {fmt(arr[idx], 2)} {D.units[col] || ''}
        </text>
      </svg>
    </div>
  );
}

function DeltaPanel({
  D, deltas, totalDeltas, cursorA, cursorB,
  focus, setFocus, selectedCol, setSelectedCol,
  sortBy, setSortBy, anomalyScore,
}) {
  return (
    <div style={{
      background: TOKENS.panel,
      display: 'flex', flexDirection: 'column',
      minHeight: 0,
    }}>
      {/* Anomaly score header */}
      <div style={{
        padding: '12px 14px',
        borderBottom: `1px solid ${TOKENS.border}`,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <div style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10, letterSpacing: 1.4,
          color: TOKENS.dim, textTransform: 'uppercase',
        }}>변화 점수 · 모든 변수 평균</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 32, fontWeight: 500,
            color: anomalyScore > 0.2 ? TOKENS.red : anomalyScore > 0.1 ? TOKENS.amber : TOKENS.green,
            letterSpacing: -0.5,
          }}>{(anomalyScore * 100).toFixed(1)}</span>
          <span style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 11, color: TOKENS.dim,
          }}>% range</span>
        </div>
        <div style={{
          height: 4,
          background: TOKENS.bg,
          borderRadius: 2,
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${Math.min(100, anomalyScore * 100 * 4)}%`,
            background: anomalyScore > 0.2 ? TOKENS.red : anomalyScore > 0.1 ? TOKENS.amber : TOKENS.green,
          }} />
        </div>
      </div>

      {/* Sort controls */}
      <div style={{
        padding: '8px 14px',
        borderBottom: `1px solid ${TOKENS.border}`,
        display: 'flex', gap: 4, alignItems: 'center',
      }}>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 9, color: TOKENS.muted, letterSpacing: 0.8,
        }}>SORT</span>
        {[['delta','변화량'],['name','이름'],['cat','범주']].map(([k,l]) => (
          <button key={k} onClick={() => setSortBy(k)}
            style={{
              padding: '3px 8px',
              background: sortBy === k ? TOKENS.accent : 'transparent',
              color: sortBy === k ? '#0a0f1c' : TOKENS.dim,
              border: `1px solid ${sortBy === k ? TOKENS.accent : TOKENS.border}`,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10,
              borderRadius: 2,
              cursor: 'pointer',
            }}>{l}</button>
        ))}
      </div>

      {/* Delta list */}
      <div style={{
        flex: 1, overflowY: 'auto', minHeight: 0,
        padding: '4px 4px',
      }}>
        {deltas.map(d => {
          const isFocus = d.col === (focus || selectedCol);
          const dir = d.signed > 0 ? '↑' : d.signed < 0 ? '↓' : '·';
          const dirColor = d.signed > 0 ? TOKENS.amber : d.signed < 0 ? TOKENS.cyan : TOKENS.muted;
          // bar widths normalized 0..1
          const barW = d.normDelta;
          return (
            <div key={d.col}
              onMouseEnter={() => setFocus(d.col)}
              onMouseLeave={() => setFocus(null)}
              onClick={() => setSelectedCol(d.col)}
              style={{
                padding: '5px 10px',
                cursor: 'pointer',
                display: 'grid',
                gridTemplateColumns: '1fr 60px 14px 60px',
                gap: 6,
                alignItems: 'center',
                background: isFocus ? `${TOKENS.accent}10` : 'transparent',
                borderLeft: isFocus ? `2px solid ${TOKENS.accent}` : `2px solid transparent`,
              }}>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 10, color: TOKENS.text,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{d.col}</div>
                <div style={{
                  height: 2,
                  background: TOKENS.bg,
                  marginTop: 3,
                }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min(100, barW * 100)}%`,
                    background: barW > 0.3 ? TOKENS.red : barW > 0.1 ? TOKENS.amber : TOKENS.green,
                  }} />
                </div>
              </div>
              <span style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10, color: TOKENS.cyan,
                textAlign: 'right',
              }}>{fmt(d.a, 2)}</span>
              <span style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 11, color: dirColor,
                textAlign: 'center',
              }}>{dir}</span>
              <span style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10, color: TOKENS.amber,
                textAlign: 'right',
              }}>{fmt(d.b, 2)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------- Spectrum View ----------------
function SpectrumView({ D, norm, cursorA, cursorB, setCursorA, setCursorB, drag, setDrag, focus, setFocus }) {
  // Heatmap of all ~40 variables across the full recording.
  const ref = React.useRef(null);
  const [size, setSize] = React.useState({ w: 800, h: 600 });
  React.useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(ref.current); return () => ro.disconnect();
  }, []);
  const padL = 160, padR = 16, padT = 16, padB = 28;
  const plotW = Math.max(0, size.w - padL - padR);
  const rows = D.cols.length;
  const rowH = Math.max(10, (size.h - padT - padB) / rows);
  const N = D.t.length;

  const idxAt = (x) => Math.max(0, Math.min(N-1, Math.round(((x - padL) / plotW) * (N-1))));
  const xAt = (i) => padL + (plotW * i) / (N - 1);

  const onMouseDown = (e) => {
    const rect = ref.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const xA = xAt(cursorA), xB = xAt(cursorB);
    if (Math.abs(x - xA) < Math.abs(x - xB)) setDrag('A');
    else setDrag('B');
    e.preventDefault();
  };
  const onMouseMove = (e) => {
    if (!drag) return;
    const rect = ref.current.getBoundingClientRect();
    const i = idxAt(e.clientX - rect.left);
    if (drag === 'A') setCursorA(i);
    else if (drag === 'B') setCursorB(i);
  };

  // Color per category
  const catColor = {
    arc: TOKENS.accent, seam: TOKENS.cyan, pose: TOKENS.green,
    status: TOKENS.violet, meta: TOKENS.muted,
  };

  const pxCols = Math.max(60, Math.min(plotW, 600));

  // Precompute downsampled cells
  const cells = React.useMemo(() => {
    return D.cols.map(col => {
      const arr = norm[col];
      const out = new Float32Array(pxCols);
      for (let p = 0; p < pxCols; p++) {
        const i0 = Math.floor((p / pxCols) * N);
        const i1 = Math.floor(((p + 1) / pxCols) * N);
        let s = 0, n = 0;
        for (let k = i0; k < Math.max(i0 + 1, i1); k++) { s += arr[k]; n++; }
        out[p] = n ? s / n : 0;
      }
      return out;
    });
  }, [D.cols, norm, pxCols, N]);
  const cellW = plotW / pxCols;

  return (
    <div ref={ref}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={() => setDrag(null)}
      onMouseLeave={() => setDrag(null)}
      style={{
        flex: 1,
        background: TOKENS.panel,
        position: 'relative',
        userSelect: 'none',
        cursor: drag ? 'grabbing' : 'crosshair',
        overflow: 'hidden',
      }}>
      <svg width={size.w} height={size.h} style={{ display: 'block' }}>
        {D.cols.map((c, ri) => {
          const y = padT + ri * rowH;
          const color = catColor[D.categories[c]] || TOKENS.muted;
          return (
            <g key={c} onMouseEnter={() => setFocus(c)} onMouseLeave={() => setFocus(null)}>
              <rect x={padL} y={y} width={plotW} height={rowH - 0.5}
                fill={TOKENS.bg} />
              {Array.from(cells[ri]).map((v, ci) => (
                <rect key={ci}
                  x={padL + ci * cellW} y={y}
                  width={cellW + 0.5} height={rowH - 0.5}
                  fill={color} opacity={0.1 + v * 0.85} />
              ))}
              <text x={padL - 8} y={y + rowH/2 + 3} fill={focus === c ? TOKENS.accent : TOKENS.text}
                fontSize={Math.min(10, rowH - 1)}
                textAnchor="end"
                style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {c}
              </text>
            </g>
          );
        })}
        <CursorMark x={xAt(cursorA)} y={padT} h={rows * rowH} color={TOKENS.cyan} label="A" />
        <CursorMark x={xAt(cursorB)} y={padT} h={rows * rowH} color={TOKENS.amber} label="B" />
        <TimeAxis x={padL} y={padT + rows * rowH} w={plotW} t={D.t} ticks={12} />
      </svg>
    </div>
  );
}

// ---------------- GP Mapping View ----------------
function GPMappingView({ D }) {
  const initialYaml = React.useMemo(() => {
    let s = '# gp_mapping.yaml\n# UR RTDE General Purpose register → 컬럼 매핑\n# backend/frontend 양쪽이 이 파일만 읽음\n\n';
    s += 'mapping:\n';
    Object.entries(D.gpMapping).forEach(([reg, def]) => {
      s += `  ${reg}:\n    col: ${def.col}\n    scale: ${def.scale}\n    label: "${D.koLabels[def.col] || def.col}"\n    unit: "${D.units[def.col] || ''}"\n`;
    });
    s += '\nmodbus:\n';
    Object.entries(D.modbusLive).forEach(([k, v]) => {
      s += `  ${k}:\n    unit: "${v.unit}"\n    range: [${v.range[0]}, ${v.range[1]}]\n`;
    });
    return s;
  }, [D]);

  const [yaml, setYaml] = React.useState(initialYaml);

  const lines = yaml.split('\n');

  return (
    <div style={{
      flex: 1,
      display: 'grid',
      gridTemplateColumns: '1fr 380px',
      gap: 1,
      background: TOKENS.border,
      minHeight: 0,
    }}>
      <div style={{
        background: TOKENS.panel,
        display: 'flex', flexDirection: 'column',
        minHeight: 0,
      }}>
        <div style={{
          padding: '10px 14px',
          borderBottom: `1px solid ${TOKENS.border}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 11, color: TOKENS.text,
          }}>gp_mapping.yaml</span>
          <span style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10, color: TOKENS.dim,
          }}>· {lines.length} 줄 · 변경 안됨</span>
          <span style={{ flex: 1 }} />
          <button style={btnStyleSm}>유효성 검사</button>
          <button style={{ ...btnStyleSm, background: TOKENS.accent, color: '#0a0f1c', border: 'none' }}>
            저장 (⌘S)
          </button>
        </div>
        <div style={{
          flex: 1, display: 'flex',
          background: TOKENS.bg,
          minHeight: 0, overflow: 'auto',
          fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
        }}>
          <div style={{
            background: TOKENS.panel2,
            color: TOKENS.muted,
            padding: '12px 8px',
            textAlign: 'right',
            userSelect: 'none',
            lineHeight: '1.6em',
            fontSize: 11,
            minWidth: 38,
          }}>
            {lines.map((_, i) => <div key={i}>{i + 1}</div>)}
          </div>
          <pre style={{
            margin: 0,
            padding: '12px 12px',
            color: TOKENS.text,
            lineHeight: '1.6em',
            flex: 1,
            whiteSpace: 'pre',
          }}>
            {lines.map((line, i) => (
              <div key={i} style={{ display: 'block' }}>
                {colorizeYaml(line)}
              </div>
            ))}
          </pre>
        </div>
      </div>

      <div style={{ background: TOKENS.panel, padding: 14, overflowY: 'auto' }}>
        <SectionLabel>매핑 미리보기 / {Object.keys(D.gpMapping).length}</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {Object.entries(D.gpMapping).map(([reg, def]) => (
            <div key={reg} style={{
              background: TOKENS.bg,
              border: `1px solid ${TOKENS.border}`,
              padding: '8px 10px',
              borderRadius: 2,
              display: 'grid',
              gridTemplateColumns: '1fr auto 1fr',
              gap: 8,
              alignItems: 'center',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 11,
            }}>
              <span style={{
                color: TOKENS.cyan,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{reg}</span>
              <span style={{ color: TOKENS.muted }}>→</span>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ color: TOKENS.accent }}>{def.col}</span>
                <span style={{ color: TOKENS.dim, fontSize: 9 }}>
                  {D.koLabels[def.col] || ''}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div style={{
          marginTop: 16,
          padding: 12,
          background: TOKENS.bg,
          border: `1px solid ${TOKENS.border}`,
          borderLeft: `2px solid ${TOKENS.cyan}`,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10,
          color: TOKENS.dim,
          lineHeight: 1.6,
        }}>
          <div style={{ color: TOKENS.text, marginBottom: 4 }}>// NOTE</div>
          backend/modbus_client.py 와 frontend 분석 UI 양쪽이 이 한 파일만 읽음.
          기존 ROBOT_FIELDS 에 register_24…47 을 추가하면 자동으로 차트에 노출됨.
        </div>
      </div>
    </div>
  );
}

const btnStyleSm = {
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

function colorizeYaml(line) {
  // Very crude YAML syntax highlight
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

window.VariantExperimental = VariantExperimental;
