// Variant 1: 보수적 (Conservative)
// Traditional SCADA grid. Top KPI strip → live modbus tiles → main charts area
// with multi-axis + split panes + alarm log. Familiar to anyone who has seen
// industrial monitoring software.

function VariantConservative() {
  const D = window.RTDE;
  const [pinned, setPinned] = React.useState(['weldCurrent','weldVoltage','xOffset','zOffset']);
  const [hoverIdx, setHoverIdx] = React.useState(null);
  const [chartMode, setChartMode] = React.useState('overlay'); // overlay | stacked
  const [tab, setTab] = React.useState('analysis');

  const colorFor = (name) => {
    const i = pinned.indexOf(name);
    return TOKENS.serieses[Math.max(0, i) % TOKENS.serieses.length];
  };

  const togglePin = (name) => {
    setPinned(p => p.includes(name) ? p.filter(x => x !== name) : [...p, name].slice(0, 6));
  };

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
        title="용접 데이터 분석"
        breadcrumbs="· REC_2026-05-13_0937.csv · 10:23"
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <ConnPill label="MODBUS · 192.168.1.40" ok />
            <ConnPill label="RTDE · UR10 PORT 30004" ok />
            <LiveClock />
          </div>
        }
      />

      {/* Tab strip */}
      <div style={{
        display: 'flex', gap: 0, padding: '0 16px',
        borderBottom: `1px solid ${TOKENS.border}`,
        background: TOKENS.panel2,
        flex: '0 0 auto',
      }}>
        {[
          ['live', '실시간 모니터링', 'MODBUS'],
          ['analysis', '레코딩 분석', 'RTDE'],
          ['mapping', 'GP 매핑', 'YAML'],
          ['recordings', '레코딩 목록', '12'],
        ].map(([k, label, badge]) => (
          <div key={k}
            onClick={() => setTab(k)}
            style={{
              padding: '10px 14px',
              cursor: 'pointer',
              borderBottom: tab === k ? `2px solid ${TOKENS.accent}` : '2px solid transparent',
              color: tab === k ? TOKENS.text : TOKENS.dim,
              fontSize: 12,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
            <span>{label}</span>
            <span style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 9, padding: '1px 5px',
              background: TOKENS.border, color: TOKENS.dim,
              borderRadius: 2, letterSpacing: 0.5,
            }}>{badge}</span>
          </div>
        ))}
      </div>

      {/* KPI strip */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 1,
        background: TOKENS.border,
        padding: 1,
        flex: '0 0 auto',
      }}>
        <StatCard label="용접전류 (avg)" value={fmt(avgOf(D, 'weldCurrent', true), 1)} unit="A"
          accent={TOKENS.accent} spark={D.samples.weldCurrent} sparkColor={TOKENS.accent} />
        <StatCard label="용접전압 (avg)" value={fmt(avgOf(D, 'weldVoltage', true), 1)} unit="V"
          accent={TOKENS.cyan} spark={D.samples.weldVoltage} sparkColor={TOKENS.cyan} />
        <StatCard label="아크율 (avg)" value={fmt(avgOf(D, 'Arc_percent', true), 1)} unit="%"
          status="warn" spark={D.samples.Arc_percent} sparkColor={TOKENS.amber} />
        <StatCard label="X 오프셋 (rms)" value={fmt(rmsOf(D, 'xOffset', true), 2)} unit="mm"
          spark={D.samples.xOffset} sparkColor={TOKENS.violet} />
        <StatCard label="Z 오프셋 (rms)" value={fmt(rmsOf(D, 'zOffset', true), 2)} unit="mm"
          spark={D.samples.zOffset} sparkColor={TOKENS.green} />
        <StatCard label="용접 시간" value="07:58" unit="m:ss" />
        <StatCard label="이벤트" value="6" unit=" · 2E 2W 2I" status="error" />
      </div>

      {/* Main body */}
      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '220px 1fr 280px',
        gap: 1,
        background: TOKENS.border,
        minHeight: 0,
      }}>
        {/* Left: variable pin sidebar */}
        <SidebarVariables
          D={D} pinned={pinned}
          onToggle={togglePin}
          colorFor={colorFor}
        />

        {/* Center: chart area */}
        <div style={{
          background: TOKENS.bg,
          display: 'flex', flexDirection: 'column',
          minHeight: 0, minWidth: 0,
        }}>
          {/* Modbus live tiles */}
          <div style={{
            padding: 12,
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 8,
            borderBottom: `1px solid ${TOKENS.border}`,
          }}>
            {Object.entries(D.modbusLive).map(([k, v]) => (
              <ModbusTile key={k} k={k} v={v} />
            ))}
          </div>

          {/* Chart toolbar */}
          <div style={{
            padding: '10px 14px',
            borderBottom: `1px solid ${TOKENS.border}`,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10, letterSpacing: 1.4,
              color: TOKENS.dim, textTransform: 'uppercase',
            }}>핀 변수 비교 · {pinned.length}개</span>
            <span style={{ flex: 1 }} />
            <Segmented
              value={chartMode}
              onChange={setChartMode}
              options={[
                ['overlay', '다중축 오버레이'],
                ['stacked', '상하 분할'],
              ]}
            />
          </div>

          {/* Chart */}
          <div style={{ flex: 1, padding: 12, minHeight: 0 }}>
            {chartMode === 'overlay' ? (
              <OverlayChart D={D} pinned={pinned} colorFor={colorFor}
                hoverIdx={hoverIdx} setHoverIdx={setHoverIdx} />
            ) : (
              <StackedChart D={D} pinned={pinned} colorFor={colorFor}
                hoverIdx={hoverIdx} setHoverIdx={setHoverIdx} />
            )}
          </div>

          {/* Timeline scrubber */}
          <TimelineScrubber D={D} hoverIdx={hoverIdx} setHoverIdx={setHoverIdx} />
        </div>

        {/* Right: alarms */}
        <AlarmPanel D={D} hoverIdx={hoverIdx} setHoverIdx={setHoverIdx} />
      </div>

      {/* Footer status bar */}
      <div style={{
        height: 26,
        borderTop: `1px solid ${TOKENS.border}`,
        background: TOKENS.panel2,
        display: 'flex', alignItems: 'center', padding: '0 12px', gap: 16,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10, color: TOKENS.dim, letterSpacing: 0.6,
        flex: '0 0 auto',
      }}>
        <span>SAMPLE_RATE 125 Hz</span>
        <span>·</span>
        <span>SAMPLES {D.N.toLocaleString()}</span>
        <span>·</span>
        <span>DURATION {fmtT(D.t[D.t.length-1])}</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: TOKENS.green }}>● REC</span>
        <span>UR10 / CB3.15.7</span>
        <span>·</span>
        <span>shipyard-be v0.4.2</span>
      </div>
    </div>
  );
}

// ---------- helpers ----------
function avgOf(D, col, weldOn = false) {
  const a = D.samples[col]; let s = 0, n = 0;
  for (let i = 0; i < a.length; i++) {
    if (weldOn && !D.samples.weldingOnOff[i]) continue;
    s += a[i]; n++;
  }
  return n ? s / n : 0;
}
function rmsOf(D, col, weldOn = false) {
  const a = D.samples[col]; let s = 0, n = 0;
  for (let i = 0; i < a.length; i++) {
    if (weldOn && !D.samples.weldingOnOff[i]) continue;
    s += a[i] * a[i]; n++;
  }
  return n ? Math.sqrt(s / n) : 0;
}

// ---------- sub-components ----------
function Segmented({ value, onChange, options }) {
  return (
    <div style={{
      display: 'inline-flex',
      background: TOKENS.panel2,
      border: `1px solid ${TOKENS.border}`,
      borderRadius: 3,
      padding: 2,
      gap: 2,
    }}>
      {options.map(([k, label]) => (
        <button key={k} onClick={() => onChange(k)}
          style={{
            padding: '4px 10px',
            background: value === k ? TOKENS.accent : 'transparent',
            color: value === k ? '#0a0f1c' : TOKENS.dim,
            border: 'none',
            borderRadius: 2,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10,
            letterSpacing: 0.6,
            cursor: 'pointer',
            fontWeight: value === k ? 600 : 400,
          }}>
          {label}
        </button>
      ))}
    </div>
  );
}

function ModbusTile({ k, v }) {
  const name = ({
    gas_flow_lpm: '실드 가스',
    wire_feed_mpm: '와이어 송급',
    cooling_water_temp: '냉각수 온도',
    cooling_flow_lpm: '냉각수 유량',
    shielding_pressure: '실드 압력',
    torch_temp: '토치 온도',
    seam_camera_lux: '시임 카메라',
  })[k] || k;
  return (
    <div style={{
      background: TOKENS.panel,
      border: `1px solid ${TOKENS.border}`,
      padding: '8px 10px',
      borderRadius: 3,
      display: 'flex', flexDirection: 'column', gap: 2,
      minWidth: 0,
    }}>
      <div style={{
        fontSize: 10, color: TOKENS.dim,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{name}</div>
      <div style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 16, fontWeight: 500,
        color: TOKENS.text,
      }}>
        {fmt(v.value, 1)}
        <span style={{
          fontSize: 9, marginLeft: 4, color: TOKENS.dim,
        }}>{v.unit}</span>
      </div>
    </div>
  );
}

function SidebarVariables({ D, pinned, onToggle, colorFor }) {
  const [filter, setFilter] = React.useState('all');
  const groups = {
    arc: '아크/용접', seam: '시임 추적', pose: '로봇 자세',
    status: '상태/플래그', meta: '메타',
  };
  const allCats = ['all', ...Object.keys(groups)];
  const cols = D.cols.filter(c =>
    filter === 'all' || D.categories[c] === filter
  );

  return (
    <div style={{
      background: TOKENS.panel2,
      display: 'flex', flexDirection: 'column',
      minHeight: 0,
    }}>
      <div style={{ padding: '12px 12px 8px' }}>
        <SectionLabel>변수 / 40</SectionLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {allCats.map(c => (
            <Chip key={c} active={filter === c} color={TOKENS.accent}
              onClick={() => setFilter(c)}>
              {c === 'all' ? '전체' : groups[c]}
            </Chip>
          ))}
        </div>
      </div>
      <div style={{
        flex: 1, overflowY: 'auto', minHeight: 0,
        padding: '0 6px 12px',
      }}>
        {cols.map(c => {
          const on = pinned.includes(c);
          return (
            <div key={c}
              onClick={() => onToggle(c)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 8px',
                cursor: 'pointer',
                borderRadius: 3,
                background: on ? `${colorFor(c)}15` : 'transparent',
              }}>
              <span style={{
                width: 4, height: 14,
                background: on ? colorFor(c) : TOKENS.border,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
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
              {D.units[c] && (
                <span style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 9, color: TOKENS.muted,
                }}>{D.units[c]}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OverlayChart({ D, pinned, colorFor, hoverIdx, setHoverIdx }) {
  // Multi-axis: each series gets its own Y range and a small axis tick label
  // floating on the left.
  const ref = React.useRef(null);
  const [size, setSize] = React.useState({ w: 800, h: 360 });
  React.useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => {
      setSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const padL = 60, padR = 60, padT = 16, padB = 28;
  const plotW = Math.max(0, size.w - padL - padR);
  const plotH = Math.max(0, size.h - padT - padB);

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - padL;
    if (x < 0 || x > plotW) { setHoverIdx(null); return; }
    const i = Math.round((x / plotW) * (D.t.length - 1));
    setHoverIdx(i);
  };

  return (
    <div ref={ref} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg width={size.w} height={size.h}
        onMouseMove={onMove} onMouseLeave={() => setHoverIdx(null)}
        style={{ display: 'block' }}>
        <PlotGrid x={padL} y={padT} w={plotW} h={plotH} />
        {/* welding on/off shading */}
        <WeldOnShade D={D} x={padL} y={padT} w={plotW} h={plotH} />
        {pinned.map((c, i) => {
          const [vmin, vmax] = D.ranges[c];
          const pad = (vmax - vmin) * 0.08;
          const path = buildPath(D.samples[c], padL, padT, plotW, plotH, vmin - pad, vmax + pad);
          return (
            <path key={c} d={path} fill="none"
              stroke={colorFor(c)} strokeWidth={1.2} opacity={0.95} />
          );
        })}
        <TimeAxis x={padL} y={padT + plotH} w={plotW} t={D.t} />
        {/* Per-series mini axis label on left */}
        {pinned.map((c, i) => (
          <g key={c}>
            <rect x={4} y={padT + i * 22} width={48} height={18}
              fill={colorFor(c) + '22'} stroke={colorFor(c)} strokeWidth={0.5} rx={2} />
            <text x={28} y={padT + i * 22 + 13} fill={colorFor(c)} fontSize={10}
              textAnchor="middle"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {c.slice(0, 8)}
            </text>
          </g>
        ))}
        <Crosshair
          x={padL} y={padT} h={plotH} plotW={plotW}
          idx={hoverIdx} t={D.t}
          names={pinned} colors={pinned.map(colorFor)}
          values={pinned.map(c => hoverIdx != null ? D.samples[c][hoverIdx] : null)}
        />
      </svg>
    </div>
  );
}

function StackedChart({ D, pinned, colorFor, hoverIdx, setHoverIdx }) {
  const ref = React.useRef(null);
  const [size, setSize] = React.useState({ w: 800, h: 360 });
  React.useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => {
      setSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const padL = 60, padR = 16, padT = 6, padB = 24;
  const plotW = Math.max(0, size.w - padL - padR);
  const rowH = Math.max(28, (size.h - padT - padB) / Math.max(1, pinned.length));

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - padL;
    if (x < 0 || x > plotW) { setHoverIdx(null); return; }
    const i = Math.round((x / plotW) * (D.t.length - 1));
    setHoverIdx(i);
  };

  return (
    <div ref={ref} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg width={size.w} height={size.h}
        onMouseMove={onMove} onMouseLeave={() => setHoverIdx(null)}
        style={{ display: 'block' }}>
        {pinned.map((c, i) => {
          const y = padT + i * rowH;
          const [vmin, vmax] = D.ranges[c];
          const pad = (vmax - vmin) * 0.1;
          const path = buildPath(D.samples[c], padL, y + 4, plotW, rowH - 8, vmin - pad, vmax + pad);
          const last = `L ${(padL + plotW).toFixed(2)} ${(y + rowH - 4).toFixed(2)} L ${padL.toFixed(2)} ${(y + rowH - 4).toFixed(2)} Z`;
          return (
            <g key={c}>
              <rect x={padL} y={y} width={plotW} height={rowH - 1}
                fill={TOKENS.panel} stroke={TOKENS.border} strokeWidth={0.5} />
              <path d={path + last} fill={colorFor(c)} opacity={0.1} />
              <path d={path} fill="none" stroke={colorFor(c)} strokeWidth={1.2} />
              {/* Label */}
              <text x={padL - 8} y={y + 14} fill={TOKENS.text} fontSize={11}
                textAnchor="end"
                style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {c}
              </text>
              <text x={padL - 8} y={y + rowH - 6} fill={TOKENS.dim} fontSize={9}
                textAnchor="end"
                style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {fmt(vmin, 1)}…{fmt(vmax, 1)} {D.units[c] || ''}
              </text>
              {hoverIdx != null && (
                <g>
                  <line
                    x1={padL + (plotW * hoverIdx) / (D.t.length-1)}
                    x2={padL + (plotW * hoverIdx) / (D.t.length-1)}
                    y1={y} y2={y + rowH - 1}
                    stroke={TOKENS.borderHi} strokeWidth={0.8} />
                  <text
                    x={padL + plotW - 4} y={y + 12}
                    fill={colorFor(c)} fontSize={10} textAnchor="end"
                    style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {fmt(D.samples[c][hoverIdx])}
                  </text>
                </g>
              )}
            </g>
          );
        })}
        <TimeAxis x={padL} y={padT + pinned.length * rowH} w={plotW} t={D.t} />
      </svg>
    </div>
  );
}

function WeldOnShade({ D, x, y, w, h }) {
  // Highlight regions where welding is on
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

function TimelineScrubber({ D, hoverIdx, setHoverIdx }) {
  const ref = React.useRef(null);
  const [size, setSize] = React.useState({ w: 800, h: 60 });
  React.useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => {
      setSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const padL = 60, padR = 16, padT = 6, padB = 18;
  const plotW = Math.max(0, size.w - padL - padR);
  const plotH = Math.max(10, size.h - padT - padB);

  const path = buildPath(D.samples.weldCurrent, padL, padT, plotW, plotH,
    D.ranges.weldCurrent[0], D.ranges.weldCurrent[1]);

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - padL;
    if (x < 0 || x > plotW) return;
    const i = Math.round((x / plotW) * (D.t.length - 1));
    setHoverIdx(i);
  };

  const cursorX = hoverIdx != null ? padL + (plotW * hoverIdx) / (D.t.length - 1) : null;

  return (
    <div ref={ref} style={{
      borderTop: `1px solid ${TOKENS.border}`,
      background: TOKENS.panel2,
      height: 80,
      position: 'relative',
      cursor: 'crosshair',
    }} onMouseMove={onMove}>
      <svg width={size.w} height={size.h} style={{ display: 'block' }}>
        <WeldOnShade D={D} x={padL} y={padT} w={plotW} h={plotH} />
        <path d={path} fill="none" stroke={TOKENS.accent} strokeWidth={0.8} opacity={0.7} />
        {/* alarm tick marks */}
        {D.alarms.map((a, i) => {
          const ax = padL + (plotW * (a.t / D.t[D.t.length-1]));
          return (
            <g key={i}>
              <line x1={ax} y1={padT} x2={ax} y2={padT + plotH}
                stroke={severityColor(a.severity)} strokeWidth={1} opacity={0.7} />
              <circle cx={ax} cy={padT + 3} r={2.5} fill={severityColor(a.severity)} />
            </g>
          );
        })}
        <TimeAxis x={padL} y={padT + plotH} w={plotW} t={D.t} ticks={10} />
        {cursorX != null && (
          <g>
            <line x1={cursorX} y1={padT} x2={cursorX} y2={padT + plotH}
              stroke={TOKENS.text} strokeWidth={1} />
            <rect x={cursorX - 28} y={0} width={56} height={14}
              fill={TOKENS.text} />
            <text x={cursorX} y={10} fill={TOKENS.bg} fontSize={10}
              textAnchor="middle"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {fmtT(D.t[hoverIdx])}
            </text>
          </g>
        )}
        <text x={padL - 8} y={padT + 12} fill={TOKENS.dim} fontSize={9}
          textAnchor="end"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          TIMELINE
        </text>
      </svg>
    </div>
  );
}

function AlarmPanel({ D, hoverIdx, setHoverIdx }) {
  return (
    <div style={{
      background: TOKENS.panel2,
      display: 'flex', flexDirection: 'column',
      minHeight: 0,
      padding: '12px 12px',
    }}>
      <SectionLabel
        action={
          <span style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10, color: TOKENS.red,
          }}>
            ● 2 ACTIVE
          </span>
        }>
        이벤트 로그 / 6
      </SectionLabel>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {D.alarms.map((a, i) => {
          const idx = Math.round((a.t / D.t[D.t.length-1]) * (D.t.length-1));
          const active = hoverIdx != null && Math.abs(hoverIdx - idx) < 8;
          const c = severityColor(a.severity);
          return (
            <div key={i}
              onMouseEnter={() => setHoverIdx(idx)}
              onMouseLeave={() => setHoverIdx(null)}
              style={{
                padding: '10px 10px',
                background: active ? `${c}11` : TOKENS.panel,
                border: `1px solid ${active ? c : TOKENS.border}`,
                borderLeft: `2px solid ${c}`,
                borderRadius: 3,
                display: 'flex', flexDirection: 'column', gap: 4,
                cursor: 'pointer',
              }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10, color: TOKENS.dim,
                letterSpacing: 0.6,
              }}>
                <span style={{ color: c, fontWeight: 600 }}>
                  {a.severity.toUpperCase()}
                </span>
                <span>·</span>
                <span>{fmtT(a.t)}</span>
                <span>·</span>
                <span>{a.code}</span>
              </div>
              <div style={{ fontSize: 12, color: TOKENS.text, lineHeight: 1.4 }}>
                {a.msg}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

window.VariantConservative = VariantConservative;
