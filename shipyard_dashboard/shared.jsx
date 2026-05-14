// Shared chart primitives and small atoms used across all three variants.
// Pure SVG to keep things tight and predictable.

const TOKENS = {
  bg:        '#0a0f1c',
  panel:     '#111722',
  panel2:    '#0d121e',
  border:    '#1f2a3a',
  borderHi:  '#2a3a52',
  text:      '#e5e7eb',
  dim:       '#7a8699',
  muted:     '#4b5668',
  accent:    '#ff6b35',
  cyan:      '#22d3ee',
  amber:     '#fbbf24',
  green:     '#34d399',
  red:       '#f87171',
  violet:    '#a78bfa',
  pink:      '#f472b6',
  serieses:  ['#ff6b35','#22d3ee','#fbbf24','#34d399','#a78bfa','#f472b6','#60a5fa','#fb7185'],
};

// Format a number for tight numeric display
const fmt = (v, d = 2) => {
  if (v == null || Number.isNaN(v)) return '—';
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  if (Math.abs(v) >= 100)  return v.toFixed(1);
  return v.toFixed(d);
};

// time mm:ss
const fmtT = (s) => {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
};

// Build SVG polyline points from an array, mapping into [x0..x1]×[y0..y1]
function buildPath(values, x0, y0, w, h, vmin, vmax, opts = {}) {
  const N = values.length;
  if (!N) return '';
  const xs = w / (N - 1);
  const yr = (vmax - vmin) || 1;
  let pts = '';
  for (let i = 0; i < N; i++) {
    const x = x0 + i * xs;
    const y = y0 + h - ((values[i] - vmin) / yr) * h;
    pts += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ' ' + y.toFixed(2) + ' ';
  }
  return pts;
}

// Subsample an array down to ~N points by simple stride (LTTB would be nicer
// but stride is fine at these sizes and keeps the file lean).
function downsample(arr, target = 300) {
  if (arr.length <= target) return arr;
  const stride = Math.floor(arr.length / target);
  const out = [];
  for (let i = 0; i < arr.length; i += stride) out.push(arr[i]);
  return out;
}

// Sparkline ------------------------------------------------------------
function Sparkline({ values, color = TOKENS.accent, w = 140, h = 36, vmin, vmax, fill = true }) {
  const arr = React.useMemo(() => downsample(values, 200), [values]);
  const lo = vmin ?? Math.min(...arr);
  const hi = vmax ?? Math.max(...arr);
  const d  = buildPath(arr, 1, 1, w - 2, h - 2, lo, hi);
  // close the area path to the baseline so we can fill underneath
  const last = `L ${(w-1).toFixed(2)} ${(h-1).toFixed(2)} L 1 ${(h-1).toFixed(2)} Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      {fill && <path d={d + last} fill={color} opacity={0.12} />}
      <path d={d} fill="none" stroke={color} strokeWidth={1.4} />
    </svg>
  );
}

// Stat card ------------------------------------------------------------
function StatCard({ label, value, unit, spark, sparkColor, accent, status }) {
  return (
    <div style={{
      background: TOKENS.panel,
      border: `1px solid ${TOKENS.border}`,
      borderLeft: accent ? `2px solid ${accent}` : `1px solid ${TOKENS.border}`,
      padding: '12px 14px',
      borderRadius: 4,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      minWidth: 0,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
      }}>
        <div style={{
          fontSize: 10,
          letterSpacing: 0.6,
          color: TOKENS.dim,
          textTransform: 'uppercase',
          fontFamily: 'JetBrains Mono, monospace',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>{label}</div>
        {status && <StatusDot status={status} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 26,
          fontWeight: 500,
          color: accent || TOKENS.text,
          letterSpacing: -0.5,
        }}>{value}</span>
        {unit && <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 11,
          color: TOKENS.dim,
        }}>{unit}</span>}
      </div>
      {spark && (
        <Sparkline values={spark} color={sparkColor || accent || TOKENS.accent} w={180} h={28} />
      )}
    </div>
  );
}

// Status dot ------------------------------------------------------------
function StatusDot({ status }) {
  const c = status === 'ok' ? TOKENS.green
          : status === 'warn' ? TOKENS.amber
          : status === 'error' ? TOKENS.red
          : TOKENS.dim;
  return (
    <span style={{
      width: 7, height: 7, borderRadius: '50%',
      background: c,
      boxShadow: `0 0 8px ${c}`,
      flex: '0 0 auto',
    }} />
  );
}

// Section header (small caps with a left rule)
function SectionLabel({ children, action }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '0 0 8px 0',
      borderBottom: `1px solid ${TOKENS.border}`,
      marginBottom: 12,
    }}>
      <span style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10,
        letterSpacing: 1.4,
        color: TOKENS.dim,
        textTransform: 'uppercase',
      }}>{children}</span>
      <span style={{ flex: 1 }} />
      {action}
    </div>
  );
}

// Chip
function Chip({ children, color, onClick, active, removable, onRemove }) {
  return (
    <span
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '3px 8px',
        background: active ? `${color}22` : TOKENS.panel2,
        border: `1px solid ${active ? color : TOKENS.border}`,
        color: active ? color : TOKENS.text,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
        borderRadius: 3,
        cursor: onClick ? 'pointer' : 'default',
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
    >
      {color && <span style={{
        width: 7, height: 7, background: color, borderRadius: 1,
      }} />}
      {children}
      {removable && (
        <span onClick={(e) => { e.stopPropagation(); onRemove?.(); }}
          style={{ color: TOKENS.dim, cursor: 'pointer', marginLeft: 2 }}>×</span>
      )}
    </span>
  );
}

// Time axis labels along the bottom
function TimeAxis({ x, y, w, t, ticks = 6 }) {
  const out = [];
  for (let i = 0; i <= ticks; i++) {
    const tx = x + (w * i) / ticks;
    const sec = t[Math.floor((t.length - 1) * i / ticks)];
    out.push(
      <g key={i}>
        <line x1={tx} y1={y} x2={tx} y2={y + 4} stroke={TOKENS.muted} strokeWidth={0.5} />
        <text x={tx} y={y + 14} fill={TOKENS.dim} fontSize={9}
          textAnchor="middle"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          {fmtT(sec)}
        </text>
      </g>
    );
  }
  return <g>{out}</g>;
}

// Grid lines inside a plot area
function PlotGrid({ x, y, w, h, rows = 4, cols = 6, color = TOKENS.border }) {
  const lines = [];
  for (let i = 1; i < rows; i++) {
    const yy = y + (h * i) / rows;
    lines.push(<line key={'r' + i} x1={x} y1={yy} x2={x + w} y2={yy} stroke={color} strokeWidth={0.5} strokeDasharray="2 3" opacity={0.5} />);
  }
  for (let i = 1; i < cols; i++) {
    const xx = x + (w * i) / cols;
    lines.push(<line key={'c' + i} x1={xx} y1={y} x2={xx} y2={y + h} stroke={color} strokeWidth={0.5} strokeDasharray="2 3" opacity={0.5} />);
  }
  return <g>{lines}</g>;
}

// Crosshair (vertical only)
function Crosshair({ x, y, h, idx, t, values, names, colors, vmins, vmaxes, plotW }) {
  if (idx == null) return null;
  const cx = x + (plotW * idx) / (t.length - 1);
  const labelW = 120, labelH = 18 + names.length * 14;
  // Position label to the side that has room
  const right = (cx - x) < (plotW * 0.6);
  const lx = right ? cx + 6 : cx - labelW - 6;
  return (
    <g>
      <line x1={cx} y1={y} x2={cx} y2={y + h} stroke={TOKENS.borderHi} strokeWidth={0.8} />
      <rect x={lx} y={y + 4} width={labelW} height={labelH} fill="#000" opacity={0.85}
        stroke={TOKENS.border} rx={2} />
      <text x={lx + 6} y={y + 16} fill={TOKENS.dim} fontSize={10}
        style={{ fontFamily: 'JetBrains Mono, monospace' }}>
        t {fmtT(t[idx])}
      </text>
      {names.map((n, i) => (
        <g key={n}>
          <rect x={lx + 6} y={y + 22 + i * 14} width={6} height={6} fill={colors[i]} />
          <text x={lx + 16} y={y + 28 + i * 14} fill={TOKENS.text} fontSize={10}
            style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            {n}
          </text>
          <text x={lx + labelW - 6} y={y + 28 + i * 14} fill={TOKENS.text} fontSize={10}
            textAnchor="end"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            {fmt(values[i])}
          </text>
        </g>
      ))}
    </g>
  );
}

// Severity color for alarms
function severityColor(s) {
  return s === 'error' ? TOKENS.red
       : s === 'warn'  ? TOKENS.amber
       : TOKENS.cyan;
}

// Header / app chrome
function AppChrome({ title, breadcrumbs, right, accent }) {
  return (
    <div style={{
      height: 44,
      borderBottom: `1px solid ${TOKENS.border}`,
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      gap: 16,
      background: TOKENS.panel2,
      flex: '0 0 auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 18, height: 18,
          background: accent || TOKENS.accent,
          clipPath: 'polygon(0 30%, 50% 0, 100% 30%, 100% 100%, 0 100%)',
        }} />
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontWeight: 600,
          fontSize: 12,
          letterSpacing: 1.5,
          color: TOKENS.text,
        }}>SHIPYARD · WELD</span>
      </div>
      <span style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11, color: TOKENS.dim,
      }}>/</span>
      <span style={{ color: TOKENS.text, fontSize: 13, fontWeight: 500 }}>{title}</span>
      {breadcrumbs && (
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 11, color: TOKENS.dim,
          marginLeft: 4,
        }}>{breadcrumbs}</span>
      )}
      <span style={{ flex: 1 }} />
      {right}
    </div>
  );
}

// Live clock readout
function LiveClock() {
  const [t, setT] = React.useState(new Date());
  React.useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const f = (n) => String(n).padStart(2, '0');
  return (
    <span style={{
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 11, color: TOKENS.dim,
    }}>
      {t.getFullYear()}-{f(t.getMonth()+1)}-{f(t.getDate())} {f(t.getHours())}:{f(t.getMinutes())}:{f(t.getSeconds())}
    </span>
  );
}

// Connection status pill
function ConnPill({ label, ok = true, state, title }) {
  // state takes precedence over the legacy `ok` boolean.
  // 'ok'   → green (live & healthy)
  // 'warn' → amber (simulator / degraded / connecting)
  // 'err'  → red (disconnected / error)
  const resolved = state || (ok ? 'ok' : 'err');
  const color =
    resolved === 'ok'   ? TOKENS.green :
    resolved === 'warn' ? TOKENS.amber :
                          TOKENS.red;
  return (
    <span title={title || ''} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 10,
      letterSpacing: 1,
      color,
      padding: '3px 8px',
      border: `1px solid ${color}55`,
      borderRadius: 2,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: color,
        boxShadow: `0 0 6px ${color}`,
      }} />
      {label}
    </span>
  );
}

Object.assign(window, {
  TOKENS, fmt, fmtT, buildPath, downsample,
  Sparkline, StatCard, StatusDot,
  SectionLabel, Chip, TimeAxis, PlotGrid,
  Crosshair, severityColor, AppChrome, LiveClock, ConnPill,
});
