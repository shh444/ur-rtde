// Track: a single horizontal chart lane that draws N channels over a shared
// time window. Used 1x per variant for RTDE, 1x for Modbus.
//
//   props:
//     channels: [{ col, color, source: 'rtde'|'modbus', mode?: 'line'|'step' }]
//     view:     [tA, tB]  (seconds, shared between all tracks)
//     hover:    seconds or null
//     onHover:  (seconds | null) => void
//     onBrush:  ([tA, tB]) => void   — optional, enables drag-to-brush
//     title:    string
//     badge:    string (e.g. "125Hz", "4Hz")
//     height:   number
//     yMode:    'shared' | 'normalized'
//     showLegend: boolean

function Track({
  channels, view, hover, onHover, onBrush,
  title, badge, badgeColor, height = 180,
  yMode = 'normalized', showLegend = true,
  segments,        // optional warn/error segments to shade
  showAxis = true,
  fillHeight = false,  // true 면 컨테이너 높이에 맞춰 늘어남. height 는 최소값으로 사용.
}) {
  const T = window.TRACKS;
  const H = window.TRACK_HELPERS;
  const [ref, size] = H.useSize();
  const padL = 70, padR = 12, padT = 22, padB = showAxis ? 22 : 6;
  // fillHeight 면 측정된 컨테이너 높이를 사용 (최소 height). 아니면 prop 그대로.
  const renderHeight = fillHeight ? Math.max(height, size.h || height) : height;
  const plotW = Math.max(0, size.w - padL - padR);
  const plotH = Math.max(0, renderHeight - padT - padB);
  const [tA, tB] = view;

  // Per-channel value range — for `normalized` we use the channel's full
  // recording range so the line stays in its band when the user pans.
  // 가드: 실데이터로 갈아끼웠을 때 핀된 컬럼이 존재 안할 수 있음 → fallback [0,1]
  const ranges = channels.map(c => {
    const src = T?.[c.source];
    return c.range || src?.ranges?.[c.col] || [0, 1];
  });

  // 데이터/샘플이 비어있는 채널은 그리지 않도록 미리 필터링한 안전 채널 목록
  const safeChannels = channels.filter(c => {
    const src = T?.[c.source];
    return Array.isArray(src?.samples?.[c.col]) && Array.isArray(src?.t);
  });

  // For shared mode, compute the union — if channels are heterogeneous this
  // looks bad, but it's correct for set/feedback pairs (current vs voltage).
  let sharedRange = [0, 1];
  if (yMode === 'shared' && ranges.length) {
    sharedRange = [
      Math.min(...ranges.map(r => r[0])),
      Math.max(...ranges.map(r => r[1])),
    ];
  }

  const onMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - padL;
    if (x < 0 || x > plotW) { onHover?.(null); return; }
    onHover?.(H.xToT(x + padL, tA, tB, padL, plotW));
  };

  return (
    <div ref={ref} style={{
      width: '100%',
      // fillHeight 일 땐 컨테이너 가득 (parent 가 flex:1 등) — 아니면 height 고정
      height: fillHeight ? '100%' : height,
      minHeight: fillHeight ? height : undefined,
      background: TOKENS.panel,
      borderTop: `1px solid ${TOKENS.border}`,
      borderRight: `1px solid ${TOKENS.border}`,
      borderBottom: `1px solid ${TOKENS.border}`,
      borderLeft: `2px solid ${badgeColor || TOKENS.accent}`,
      position: 'relative',
      // 사이드바 토글로 컨테이너가 줄어든 직후 ResizeObserver fire 까지 1 frame 정도
      // SVG width 가 stale. overflow hidden 으로 잘라 이웃 컬럼 침범 방지.
      overflow: 'hidden',
      boxSizing: 'border-box',
    }}>
      <svg width="100%" height={renderHeight}
        onMouseMove={onMouseMove}
        onMouseLeave={() => onHover?.(null)}
        style={{ display: 'block', cursor: 'crosshair' }}>

        {/* plot bg */}
        <rect x={padL} y={padT} width={plotW} height={plotH}
          fill={TOKENS.bg} />

        {/* grid */}
        <TrackGrid x={padL} y={padT} w={plotW} h={plotH} tA={tA} tB={tB} />

        {/* warn/error segment shading */}
        {segments && segments.map((s, i) => {
          if (s.end < tA || s.start > tB) return null;
          const x1 = H.tToX(Math.max(s.start, tA), tA, tB, padL, plotW);
          const x2 = H.tToX(Math.min(s.end,   tB), tA, tB, padL, plotW);
          const c = s.level === 'error' ? TOKENS.red : TOKENS.amber;
          return (
            <rect key={i} x={x1} y={padT} width={Math.max(2, x2 - x1)} height={plotH}
              fill={c} opacity={0.06} />
          );
        })}

        {/* Channels — safeChannels 만 사용 (데이터/시간축 없으면 skip) */}
        {safeChannels.map((ch) => {
          const i = channels.indexOf(ch);
          const src = T[ch.source];
          const iA = H.nearestIdx(tA, src.t);
          const iB = H.nearestIdx(tB, src.t);
          const r = yMode === 'shared' ? sharedRange : ranges[i];
          const pad = (r[1] - r[0]) * 0.08 || 1;
          const d = (ch.mode === 'step')
            ? H.trackStepPath(src.samples[ch.col], src.t, iA, iB, tA, tB, padL, padT, plotW, plotH, r[0] - pad, r[1] + pad)
            : H.trackPath(    src.samples[ch.col], src.t, iA, iB, tA, tB, padL, padT, plotW, plotH, r[0] - pad, r[1] + pad);
          return (
            <path key={ch.col} d={d} fill="none"
              stroke={ch.color} strokeWidth={1.3} opacity={0.95} />
          );
        })}

        {/* Hover line + per-channel dot + 값 라벨 (dot 바로 옆에) */}
        {hover != null && hover >= tA && hover <= tB && (() => {
          const xH = H.tToX(hover, tA, tB, padL, plotW);
          // 마우스가 plot 의 오른쪽 30% 안에 들어가면 라벨을 좌측으로 뒤집어 잘림 방지
          const labelOnLeft = xH > padL + plotW * 0.7;
          const labelX = labelOnLeft ? xH - 7 : xH + 7;
          const labelAnchor = labelOnLeft ? 'end' : 'start';
          return (
            <>
              <line
                x1={xH} x2={xH}
                y1={padT} y2={padT + plotH}
                stroke={TOKENS.text} strokeWidth={0.8} opacity={0.6} />
              {safeChannels.map((ch) => {
                const i = channels.indexOf(ch);
                const src = T[ch.source];
                const idx = H.nearestIdx(hover, src.t);
                const v = src.samples[ch.col][idx];
                if (typeof v !== 'number' || !isFinite(v)) return null;
                const r = yMode === 'shared' ? sharedRange : ranges[i];
                const pad = (r[1] - r[0]) * 0.08 || 1;
                const y = padT + plotH - ((v - (r[0]-pad)) / ((r[1]+pad) - (r[0]-pad))) * plotH;
                // dot + 값 라벨. text 의 stroke 외곽선으로 라인 위에서도 가독성 확보.
                return (
                  <g key={ch.col}>
                    <circle cx={xH} cy={y} r={3}
                      fill={ch.color} stroke="#0a0f1c" strokeWidth={1.2} />
                    <text x={labelX} y={y - 5}
                      fill={ch.color} fontSize={10} fontWeight={600}
                      textAnchor={labelAnchor}
                      style={{
                        fontFamily: 'JetBrains Mono, monospace',
                        paintOrder: 'stroke',
                        stroke: '#0a0f1c', strokeWidth: 3, strokeLinejoin: 'round',
                      }}>
                      {Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(2)}
                    </text>
                  </g>
                );
              })}
            </>
          );
        })()}

        {/* Y axis labels (per-channel — small floating tags on left) */}
        {channels.map((ch, i) => {
          const r = yMode === 'shared' ? sharedRange : ranges[i];
          return (
            <g key={ch.col}>
              <text x={padL - 6} y={padT + 10 + i * 12} fill={ch.color}
                fontSize={9} textAnchor="end"
                style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {ch.col.length > 14 ? ch.col.slice(0,12)+'…' : ch.col}
              </text>
            </g>
          );
        })}

        {/* time axis */}
        {showAxis && <TimeAxisRange x={padL} y={padT + plotH} w={plotW} tA={tA} tB={tB} />}

        {/* Header (title + badge) */}
        <g>
          <text x={padL} y={14} fill={TOKENS.dim} fontSize={10}
            style={{ fontFamily: 'JetBrains Mono, monospace', letterSpacing: 1 }}>
            {String(title || '').toUpperCase()}
          </text>
          {badge && (
            <g>
              <rect x={padL + String(title || '').length * 6 + 8} y={4} width={36} height={13}
                fill={badgeColor || TOKENS.accent} rx={1} />
              <text x={padL + String(title || '').length * 6 + 26} y={14} fill="#0a0f1c" fontSize={9}
                textAnchor="middle"
                style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
                {badge}
              </text>
            </g>
          )}
        </g>

        {/* 우상단 corner readout 은 제거 — 이제 hover dot 옆에 직접 값이 라벨로 따라옴 */}
      </svg>

      {/* Legend chips */}
      {showLegend && (
        <div style={{
          position: 'absolute', top: 4, right: 12,
          display: 'flex', gap: 6,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 9,
        }}>
          {channels.map(ch => (
            <span key={ch.col} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              color: TOKENS.dim,
            }}>
              <span style={{ width: 8, height: 2, background: ch.color }} />
              {ch.col}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function TrackGrid({ x, y, w, h }) {
  const rows = 3, cols = 6;
  const lines = [];
  for (let i = 1; i < rows; i++) {
    const yy = y + (h * i) / rows;
    lines.push(<line key={'r'+i} x1={x} y1={yy} x2={x+w} y2={yy}
      stroke={TOKENS.border} strokeWidth={0.5} strokeDasharray="2 3" opacity={0.4} />);
  }
  for (let i = 1; i < cols; i++) {
    const xx = x + (w * i) / cols;
    lines.push(<line key={'c'+i} x1={xx} y1={y} x2={xx} y2={y+h}
      stroke={TOKENS.border} strokeWidth={0.5} strokeDasharray="2 3" opacity={0.4} />);
  }
  return <g>{lines}</g>;
}

function TimeAxisRange({ x, y, w, tA, tB, ticks = 6 }) {
  const out = [];
  for (let i = 0; i <= ticks; i++) {
    const tx = x + (w * i) / ticks;
    const sec = tA + ((tB - tA) * i) / ticks;
    out.push(
      <g key={i}>
        <line x1={tx} y1={y} x2={tx} y2={y + 4}
          stroke={TOKENS.muted} strokeWidth={0.5} />
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

// ─── Log Lane ────────────────────────────────────────────────────────
// Draws dots at log timestamps, segments for warn/error spans, and emits
// vertical guides UP into the parent area (the parent layers the guides
// on top of its tracks).
function LogLane({ view, hover, onHover, onLogClick, height = 78, filter, segments }) {
  const T = window.TRACKS;
  const H = window.TRACK_HELPERS;
  const [ref, size] = H.useSize();
  const padL = 70, padR = 12, padT = 22, padB = 6;
  const plotW = Math.max(0, size.w - padL - padR);
  const plotH = Math.max(0, height - padT - padB);
  const [tA, tB] = view;

  const logs = filter ? T.logs.filter(l => filter[l.level]) : T.logs;

  // Group by level on lanes
  const lanes = ['error', 'warn', 'info', 'debug', 'sys'];
  const rowH = plotH / lanes.length;

  const onMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - padL;
    if (x < 0 || x > plotW) { onHover?.(null); return; }
    onHover?.(H.xToT(x + padL, tA, tB, padL, plotW));
  };

  const onClick = (e) => {
    if (!onLogClick) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - padL;
    const y = e.clientY - rect.top - padT;
    const tHere = H.xToT(x + padL, tA, tB, padL, plotW);
    // find closest log within ±5px
    let best = null, bestDx = 6;
    logs.forEach(l => {
      if (l.t < tA || l.t > tB) return;
      const lx = H.tToX(l.t, tA, tB, padL, plotW);
      const dx = Math.abs(lx - (x + padL));
      if (dx < bestDx) { bestDx = dx; best = l; }
    });
    if (best) onLogClick(best);
  };

  return (
    <div ref={ref} style={{
      width: '100%', height,
      background: TOKENS.panel,
      borderTop: `1px solid ${TOKENS.border}`,
      borderRight: `1px solid ${TOKENS.border}`,
      borderBottom: `1px solid ${TOKENS.border}`,
      borderLeft: `2px solid ${TOKENS.violet}`,
      position: 'relative',
    }}>
      <svg width="100%" height={height}
        onMouseMove={onMouseMove}
        onMouseLeave={() => onHover?.(null)}
        onClick={onClick}
        style={{ display: 'block', cursor: 'crosshair' }}>

        <rect x={padL} y={padT} width={plotW} height={plotH} fill={TOKENS.bg} />

        {/* Lane dividers + labels */}
        {lanes.map((lv, i) => (
          <g key={lv}>
            <line x1={padL} y1={padT + i * rowH} x2={padL + plotW} y2={padT + i * rowH}
              stroke={TOKENS.border} strokeWidth={0.5} strokeDasharray="1 3" opacity={0.4} />
            <text x={padL - 6} y={padT + i * rowH + rowH/2 + 3}
              fill={window.TRACK_HELPERS.LOG_COLORS[lv]} fontSize={9}
              textAnchor="end"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {lv}
            </text>
          </g>
        ))}

        {/* Segments (warn/error spans) */}
        {segments && segments.map((s, i) => {
          if (s.end < tA || s.start > tB) return null;
          const x1 = H.tToX(Math.max(s.start, tA), tA, tB, padL, plotW);
          const x2 = H.tToX(Math.min(s.end,   tB), tA, tB, padL, plotW);
          const laneIdx = s.level === 'error' ? 0 : 1;
          const c = s.level === 'error' ? TOKENS.red : TOKENS.amber;
          return (
            <rect key={i}
              x={x1} y={padT + laneIdx * rowH + 4}
              width={Math.max(3, x2 - x1)} height={rowH - 8}
              fill={c} opacity={0.5} rx={1} />
          );
        })}

        {/* Dots */}
        {logs.map(l => {
          if (l.t < tA || l.t > tB) return null;
          const laneIdx = lanes.indexOf(l.level);
          const cx = H.tToX(l.t, tA, tB, padL, plotW);
          const cy = padT + laneIdx * rowH + rowH/2;
          const c = window.TRACK_HELPERS.LOG_COLORS[l.level];
          const r = l.level === 'error' || l.level === 'warn' ? 3 : 2;
          return <circle key={l.id} cx={cx} cy={cy} r={r} fill={c} />;
        })}

        {/* Hover line */}
        {hover != null && hover >= tA && hover <= tB && (
          <line
            x1={H.tToX(hover, tA, tB, padL, plotW)}
            x2={H.tToX(hover, tA, tB, padL, plotW)}
            y1={padT} y2={padT + plotH}
            stroke={TOKENS.text} strokeWidth={0.8} opacity={0.6} />
        )}

        {/* Header */}
        <text x={padL} y={14} fill={TOKENS.violet} fontSize={10}
          style={{ fontFamily: 'JetBrains Mono, monospace', letterSpacing: 1 }}>
          ROBOT LOGS
        </text>
        <text x={padL + 100} y={14} fill={TOKENS.dim} fontSize={9}
          style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          {logs.length} events · click a dot for detail
        </text>
      </svg>
    </div>
  );
}

window.Track = Track;
window.LogLane = LogLane;
window.TimeAxisRange = TimeAxisRange;
