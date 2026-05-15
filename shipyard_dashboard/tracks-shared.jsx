// Shared 3-track chart primitives.
// All three variants compose these. Each Track is a single horizontal lane
// that draws one or more channel paths into a fixed viewBox; the parent
// passes a [a, b] view range (indices into the track's own t array) plus a
// hover position (in seconds, the universal clock).

// Color palette for series, separated by source so RTDE and Modbus look
// distinct at a glance.
const SRC_COLORS = {
  rtde:   ['#ff6b35', '#fbbf24', '#f472b6', '#fb7185', '#facc15', '#fb923c'],
  modbus: ['#22d3ee', '#34d399', '#60a5fa', '#a78bfa', '#5eead4', '#7dd3fc'],
};

const LOG_COLORS = {
  debug: '#4b5668',
  info:  '#7a8699',
  warn:  '#fbbf24',
  error: '#f87171',
  sys:   '#a78bfa',
};

// Time → x mapping over a given [tA, tB] window (in seconds).
function tToX(t, tA, tB, x0, w) {
  return x0 + ((t - tA) / Math.max(0.001, tB - tA)) * w;
}
function xToT(x, tA, tB, x0, w) {
  return tA + ((x - x0) / Math.max(1, w)) * (tB - tA);
}

// Find sample index closest to time `t`. **Non-uniform 시간축 안전.**
// 기존 구현은 dt = tArr[1] - tArr[0] 하나만 가정해서 실데이터 (jitter/drop) 에선
// 잘못된 인덱스를 반환 → hover dot 이 라인과 어긋남. 이제 binary search.
function nearestIdx(t, tArr) {
  if (!Array.isArray(tArr) || tArr.length === 0) return 0;
  const n = tArr.length;
  if (t <= tArr[0]) return 0;
  if (t >= tArr[n - 1]) return n - 1;
  let lo = 0, hi = n - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (tArr[mid] <= t) lo = mid;
    else hi = mid;
  }
  // tArr[lo] <= t < tArr[hi] — 더 가까운 쪽 선택
  return (t - tArr[lo]) <= (tArr[hi] - t) ? lo : hi;
}

// Build an SVG path for `values` over indices [iA..iB], where each sample's
// time comes from tArr, mapped into [x0..x0+w]×[y0..y0+h] using the time
// window [tA..tB] and value range [vmin..vmax].
function trackPath(values, tArr, iA, iB, tA, tB, x0, y0, w, h, vmin, vmax, opts = {}) {
  const yr = (vmax - vmin) || 1;
  let d = '';
  for (let i = iA; i <= iB; i++) {
    const x = tToX(tArr[i], tA, tB, x0, w);
    const y = y0 + h - ((values[i] - vmin) / yr) * h;
    d += (i === iA ? 'M' : 'L') + x.toFixed(2) + ' ' + y.toFixed(2) + ' ';
  }
  return d;
}

// Step path — for setpoints / discrete channels at 4Hz Modbus rate
function trackStepPath(values, tArr, iA, iB, tA, tB, x0, y0, w, h, vmin, vmax) {
  const yr = (vmax - vmin) || 1;
  let d = '';
  for (let i = iA; i <= iB; i++) {
    const x = tToX(tArr[i], tA, tB, x0, w);
    const y = y0 + h - ((values[i] - vmin) / yr) * h;
    if (i === iA) d += 'M' + x.toFixed(2) + ' ' + y.toFixed(2) + ' ';
    else {
      // step: horizontal then vertical
      const xp = tToX(tArr[i], tA, tB, x0, w);
      d += 'L' + xp.toFixed(2) + ' ' + (y0 + h - ((values[i-1] - vmin)/yr)*h).toFixed(2) + ' ';
      d += 'L' + xp.toFixed(2) + ' ' + y.toFixed(2) + ' ';
    }
  }
  return d;
}

// Resize-observer hook
function useSize() {
  const ref = React.useRef(null);
  const [size, setSize] = React.useState({ w: 800, h: 200 });
  React.useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => {
      setSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

window.TRACK_HELPERS = {
  SRC_COLORS, LOG_COLORS,
  tToX, xToT, nearestIdx,
  trackPath, trackStepPath,
  useSize,
};
