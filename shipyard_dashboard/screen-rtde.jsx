// Screen: RTDE 실시간 (라이브 프레임 + 채널별 카드 + 디테일 패널)
// Modbus 모니터링 화면 구조를 그대로 따라가되 데이터 소스만 RTDE.
//   - WebSocket /ws/live : DashboardService.live_state() 가 ~10Hz 로 푸시
//   - HTTP GET /api/state : 초기 + WS 끊겼을 때 폴링 폴백
// row.display = gp_mapping.json 의 친숙명 (백엔드가 미리 주입). 매핑 없는 raw 필드는 token 그대로.

// ── RTDE 그룹·하이라이트 레이아웃 정의 ───────────────────────────────
// 노출 범위: GP 매핑(gp_mapping.json) 에 정의된 채널만. 로봇 자세/전류/timestamp/
// 매핑 없는 raw GP 레지스터는 전부 숨김. Modbus 모니터링이 registers 정의에 있는
// 것만 보이는 것과 동일한 패턴.
const RTDE_WELD_CHANNELS = new Set([
  'weldCurrent', 'weldVoltage', 'StandardCurrent', 'Arc_percent', 'ARC_T_Plus',
  'peak_value', 'allIntegral', 'ratioT_19', 'weldingOnOff',
  // 새 매핑에서 추가된 용접 관련 채널
  'wcrIn', 'urTimestamp', 'timer',
]);
const RTDE_SEAM_CHANNELS = new Set([
  'xOffset', 'zOffset', 'xUp', 'xUi', 'zUp', 'zUi',
  'BotRight_Plus', 'TopLeft_Minus', 'BotRight_Plus_VA', 'TopLeft_Minus_VA',
  'touchOnOff',
  // 시임/위치 관련 — 트라이앵귤레이션 카운터 + URScript 가 내보내는 위치 출력
  'tri_count', 'tri_2', 'x', 'y', 'z',
]);

// 매핑된 GP 채널만 분류. 그 외 (token === display = raw register, actual_*, timestamp 등)
// 는 null 을 반환해서 화면에서 제외됨.
function classifyRtdeRow(r) {
  const aliased = r.display && r.display !== r.token;
  if (!aliased) return null;
  const name = r.display;
  if (RTDE_WELD_CHANNELS.has(name)) return 'weld';
  if (RTDE_SEAM_CHANNELS.has(name)) return 'seam';
  // gp_mapping 에 새로 추가된 채널인데 위 두 세트 어디에도 없는 경우 — 일단 weld 로
  // 떨궈서 보이긴 함. 정밀 분류가 필요하면 위 세트에 추가.
  return 'weld';
}

const RTDE_GROUPS = {
  weld: { id: 'weld', label: '용접 텔레메트리', color: '#fbbf24', desc: '용접 전류·전압·아크율·적분 등' },
  seam: { id: 'seam', label: '시임 추적',       color: '#22d3ee', desc: '아크 센싱·터치 센싱 오프셋' },
};

// 하이라이트 영역에 띄울 채널 (display 이름 기준)
const RTDE_HERO = {
  primary: { display: 'weldingOnOff', onLabel: '용접 중', offLabel: '대기', color: '#fbbf24' },
  big: [
    { display: 'weldCurrent', color: '#fbbf24' },
    { display: 'weldVoltage', color: '#22d3ee' },
    { display: 'Arc_percent', color: '#34d399' },
  ],
  small: [
    { display: 'StandardCurrent' },
    { display: 'xOffset' },
    { display: 'zOffset' },
    { display: 'peak_value' },
    { display: 'allIntegral' },
  ],
};

const HIST_LEN = 240;  // 채널별 ring buffer 길이 (~24초 @10Hz push)


function ScreenRtde() {
  const [status, setStatus] = React.useState({
    running: false, host: '—', frequency: 0, frame_index: 0,
    age_ms: null, error: null,
  });
  const [rows, setRows] = React.useState([]);  // [{token, display, value, formatted, unit, ...}]
  const [tick, setTick] = React.useState(0);   // re-render trigger for sparklines
  const [wsState, setWsState] = React.useState('connecting');

  const [tab, setTab] = React.useState('all');
  const [q, setQ] = React.useState('');
  const [selected, setSelected] = React.useState(null);  // token of selected card

  const histRef = React.useRef({});  // {token: number[]}

  // ── ingest live payload ──────────────────────────────────────────
  const ingest = React.useCallback((payload) => {
    if (!payload) return;
    const s = payload.status || {};
    const latest = payload.latest || {};
    setStatus({
      running: !!s.running,
      host: s.host || '—',
      frequency: typeof s.consumer_rate_hz === 'number' ? s.consumer_rate_hz
               : typeof s.active_frequency_hz === 'number' ? s.active_frequency_hz : 0,
      frame_index: typeof latest.frame_index === 'number' ? latest.frame_index : 0,
      age_ms: typeof latest.age_ms === 'number' ? latest.age_ms
            : typeof s.age_ms === 'number' ? s.age_ms : null,
      error: s.error || null,
    });
    const incoming = Array.isArray(latest.rows) ? latest.rows : [];
    if (incoming.length > 0) {
      setRows(incoming);
      const hist = histRef.current;
      for (const r of incoming) {
        if (typeof r.value !== 'number' || Number.isNaN(r.value)) continue;
        const k = r.token;
        if (!hist[k]) hist[k] = [];
        hist[k].push(r.value);
        if (hist[k].length > HIST_LEN) hist[k].splice(0, hist[k].length - HIST_LEN);
      }
      setTick(t => (t + 1) | 0);
    }
  }, []);

  // ── WS + initial fetch + polling fallback ────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    let ws = null;
    let pollId = null;
    (async () => {
      try {
        const res = await fetch('/api/state');
        if (res.ok && !cancelled) ingest(await res.json());
      } catch {}
    })();
    const wsUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/live';
    try {
      ws = new WebSocket(wsUrl);
      ws.onopen  = () => { if (!cancelled) setWsState('open'); };
      ws.onclose = () => {
        if (cancelled) return;
        setWsState('closed');
        pollId = setInterval(async () => {
          try {
            const res = await fetch('/api/state');
            if (res.ok && !cancelled) ingest(await res.json());
          } catch {}
        }, 1000);
      };
      ws.onerror = () => {};
      ws.onmessage = (ev) => {
        if (cancelled) return;
        try { ingest(JSON.parse(ev.data)); } catch {}
      };
    } catch { setWsState('closed'); }
    return () => {
      cancelled = true;
      if (ws) try { ws.close(); } catch {}
      if (pollId) clearInterval(pollId);
    };
  }, [ingest]);

  // ── derived: byToken lookup + grouping ───────────────────────────
  const byToken = React.useMemo(() => {
    const m = {};
    for (const r of rows) m[r.token] = r;
    return m;
  }, [rows]);

  const byDisplay = React.useCallback((name) => {
    return rows.find(r => r.display === name) || rows.find(r => r.token === name) || null;
  }, [rows]);

  // 매핑된 GP 채널만 사용 — 자세/전류/timestamp/미매핑 raw 는 전부 무시.
  const mappedRows = React.useMemo(
    () => rows.filter(r => classifyRtdeRow(r) !== null),
    [rows],
  );

  const grouped = React.useMemo(() => {
    const g = { weld: [], seam: [] };
    for (const r of mappedRows) {
      const cls = classifyRtdeRow(r);
      if (g[cls]) g[cls].push(r);
    }
    return g;
  }, [mappedRows]);

  const countActive = (groupId) => {
    if (groupId === 'all') return mappedRows.length;
    return (grouped[groupId] || []).length;
  };

  // ── filtered for current tab + search ───────────────────────────
  const visibleRows = mappedRows.filter(r => {
    const cls = classifyRtdeRow(r);
    if (tab !== 'all' && cls !== tab) return false;
    if (q) {
      const s = q.toLowerCase();
      if (!String(r.token).toLowerCase().includes(s) &&
          !String(r.display || '').toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const visibleByGroup = React.useMemo(() => {
    const m = {};
    for (const r of visibleRows) {
      const cls = classifyRtdeRow(r);
      (m[cls] = m[cls] || []).push(r);
    }
    return m;
  }, [visibleRows]);  // eslint-disable-line

  const selectedRow = selected ? byToken[selected] : null;

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      minHeight: 0, background: TOKENS.bg,
    }}>
      <RtdeConnectionBar status={status} wsState={wsState} />
      <RtdeHeroStrip byDisplay={byDisplay} hist={histRef.current} tick={tick} />

      <div style={{
        padding: '10px 16px',
        borderBottom: `1px solid ${TOKENS.border}`,
        display: 'flex', alignItems: 'center', gap: 8,
        background: TOKENS.panel2,
        flexWrap: 'wrap',
        flex: '0 0 auto',
      }}>
        <RtdeTabBtn active={tab === 'all'} onClick={() => setTab('all')}
          label="전체" count={countActive('all')} color={TOKENS.dim} />
        {Object.values(RTDE_GROUPS).map(g => (
          <RtdeTabBtn key={g.id} active={tab === g.id} onClick={() => setTab(g.id)}
            label={g.label} count={countActive(g.id)} color={g.color} />
        ))}
        <span style={{ flex: 1 }} />
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="채널 검색 (예: weld, xOffset, output_double_register_8)"
          style={{
            background: TOKENS.bg, border: `1px solid ${TOKENS.border}`,
            color: TOKENS.text, fontFamily: 'JetBrains Mono, monospace',
            fontSize: 11, padding: '5px 10px', borderRadius: 2, outline: 'none',
            width: 320,
          }} />
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 9, color: TOKENS.muted,
        }}>gp_mapping.json 정의된 채널만 표시</span>
      </div>

      {/* Empty/error 안내 */}
      {!status.running && (
        <div style={{
          padding: '10px 16px',
          background: TOKENS.amber + '10',
          borderBottom: `1px solid ${TOKENS.amber}55`,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 11, color: TOKENS.amber, lineHeight: 1.6,
          flex: '0 0 auto',
        }}>
          RTDE service 가 정지 상태입니다. 실시간 모니터링 탭에서 로봇 IP 가 맞는지 확인하거나
          서버를 재시작 (lifespan 자동 시작) 해보세요.
        </div>
      )}
      {status.error && (
        <div style={{
          padding: '8px 16px',
          background: TOKENS.red + '15',
          borderBottom: `1px solid ${TOKENS.red}55`,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 11, color: TOKENS.red,
          flex: '0 0 auto',
        }}>⚠ {status.error}</div>
      )}

      {/* Main grid */}
      <div style={{
        flex: 1, minHeight: 0, overflowY: 'auto',
        padding: 16,
        display: 'grid',
        gridTemplateColumns: selectedRow ? '1fr 340px' : '1fr',
        gap: 16,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {Object.values(RTDE_GROUPS).map(g => {
            const items = visibleByGroup[g.id];
            if (!items || items.length === 0) return null;
            return (
              <section key={g.id}>
                <RtdeGroupHeader g={g} count={items.length} />
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: 8,
                }}>
                  {items.map(r => (
                    <RtdeChannelCard key={r.token}
                      row={r}
                      hist={histRef.current[r.token] || []}
                      group={g}
                      selected={selected === r.token}
                      onClick={() => setSelected(selected === r.token ? null : r.token)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
          {visibleRows.length === 0 && (
            <div style={{
              padding: 40, textAlign: 'center',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 12, color: TOKENS.muted, lineHeight: 1.7,
            }}>
              {rows.length === 0 ? '프레임 수신 대기 중…'
              : mappedRows.length === 0
                ? <>gp_mapping.json 에 정의된 채널이 없거나 백엔드가 옛 코드로 떠 있습니다.<br/>
                    서버 재시작 후 다시 확인해주세요.</>
              : '검색 조건에 해당하는 채널 없음'}
            </div>
          )}
        </div>

        {selectedRow && (
          <RtdeDetailPanel row={selectedRow}
            hist={histRef.current[selectedRow.token] || []}
            group={RTDE_GROUPS[classifyRtdeRow(selectedRow)] || RTDE_GROUPS.raw}
            onClose={() => setSelected(null)} />
        )}
      </div>

      <RtdeFooterBar status={status} wsState={wsState} rowCount={rows.length} />
    </div>
  );
}


// ─── ConnectionBar ────────────────────────────────────────────────────
// RTDE 전용 — IP 입력은 없음 (실시간 모니터링 탭의 ConnectionBar 가 Modbus + RTDE
// 양쪽에 동시 적용되는 single source). 여기는 상태 표시 + 수동 재시작 버튼만.
function RtdeConnectionBar({ status, wsState }) {
  const [restarting, setRestarting] = React.useState(false);
  const [msg, setMsg] = React.useState(null);

  const restart = async () => {
    setRestarting(true);
    setMsg(null);
    try {
      // stop → start. 한 번에 처리하는 엔드포인트는 없으므로 순서대로.
      await fetch('/api/rtde/stop', { method: 'POST' });
      const res = await fetch('/api/rtde/start', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMsg({ kind: 'ok', text: '재시작 요청 완료' });
    } catch (err) {
      setMsg({ kind: 'err', text: `실패: ${err.message || err}` });
    } finally {
      setRestarting(false);
      setTimeout(() => setMsg(null), 3500);
    }
  };

  const isLive = status.running && status.age_ms != null && status.age_ms < 2000;
  const isStale = status.running && !isLive;
  const indicatorColor = isLive ? TOKENS.green : isStale ? TOKENS.amber : TOKENS.red;
  const indicatorLabel = isLive ? `LIVE · ${(status.frequency || 0).toFixed(0)}Hz`
                       : isStale ? `STALE · ${((status.age_ms ?? 0) / 1000).toFixed(1)}s`
                       : 'DOWN';

  const labelStyle = {
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 10, color: TOKENS.muted, letterSpacing: 0.8,
    textTransform: 'uppercase',
  };

  return (
    <div style={{
      flex: '0 0 auto',
      padding: '12px 16px',
      borderBottom: `1px solid ${TOKENS.border}`,
      background: TOKENS.panel2,
      display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          width: 10, height: 10, borderRadius: '50%',
          background: indicatorColor,
          boxShadow: `0 0 10px ${indicatorColor}`,
        }} />
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 11, color: indicatorColor, fontWeight: 600, letterSpacing: 0.8,
        }}>RTDE · {indicatorLabel}</span>
      </div>

      <span style={{ width: 1, height: 20, background: TOKENS.border }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={labelStyle}>로봇 IP</span>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: TOKENS.text,
        }}>{status.host}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={labelStyle}>frame</span>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: TOKENS.text,
        }}>{status.frame_index.toLocaleString()}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={labelStyle}>age</span>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
          color: status.age_ms != null && status.age_ms < 2000 ? TOKENS.green
               : status.age_ms != null ? TOKENS.amber : TOKENS.muted,
        }}>{status.age_ms != null ? `${status.age_ms.toFixed(0)} ms` : '—'}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={labelStyle}>WS</span>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
          color: wsState === 'open' ? TOKENS.green
               : wsState === 'connecting' ? TOKENS.amber : TOKENS.red,
        }}>{wsState}</span>
      </div>

      <span style={{ flex: 1 }} />

      <button onClick={restart} disabled={restarting}
        title="RTDE service 정지 → 재시작"
        style={{
          padding: '8px 18px',
          background: restarting ? TOKENS.border : TOKENS.accent,
          color: '#0a0f1c',
          border: 'none',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 11, fontWeight: 600, letterSpacing: 0.8,
          cursor: restarting ? 'wait' : 'pointer',
          borderRadius: 2,
        }}>
        {restarting ? '재시작 중…' : '↻ RTDE 재시작'}
      </button>

      {msg && (
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10,
          color: msg.kind === 'ok' ? TOKENS.green : TOKENS.red,
        }}>{msg.text}</span>
      )}

      <span style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 9, color: TOKENS.muted,
        maxWidth: 280, textAlign: 'right',
      }}>
        로봇 IP 변경은 [실시간 모니터링] 탭의 ConnectionBar 에서 (Modbus + RTDE 동시 적용)
      </span>
    </div>
  );
}


// ─── HeroStrip ────────────────────────────────────────────────────────
// 가장 중요한 채널 몇 개를 큰 글씨로 (Modbus 의 HeroStrip 과 동일 패턴).
function RtdeHeroStrip({ byDisplay, hist, tick }) {  // eslint-disable-line no-unused-vars
  const primary = RTDE_HERO.primary;
  const bigs = RTDE_HERO.big || [];
  const smalls = RTDE_HERO.small || [];

  const cols = [];
  if (primary) cols.push('auto');
  bigs.forEach(() => cols.push('auto'));
  if (smalls.length) cols.push('1fr');

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: cols.join(' ') || '1fr',
      gap: 1,
      background: TOKENS.border,
      padding: 1,
      flex: '0 0 auto',
    }}>
      {primary && <RtdeHeroPrimary primary={primary} row={byDisplay(primary.display)} />}
      {bigs.map((b, i) => {
        const row = byDisplay(b.display);
        return (
          <RtdeBigReadout key={i} row={row}
            color={b.color || TOKENS.text}
            hist={row ? hist[row.token] : null} />
        );
      })}
      {smalls.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${smalls.length}, 1fr)`,
          gap: 1,
          background: TOKENS.border,
        }}>
          {smalls.map((s, i) => {
            const row = byDisplay(s.display);
            return <RtdeSmallReadout key={i} row={row} fallback={s.display} />;
          })}
        </div>
      )}
    </div>
  );
}

function RtdeHeroPrimary({ primary, row }) {
  const value = row?.value;
  const isOn = typeof value === 'number' ? value !== 0 : Boolean(value);
  const color = primary.color || TOKENS.accent;
  return (
    <div style={{
      padding: '14px 18px',
      background: isOn ? color + '15' : TOKENS.panel,
      borderLeft: `3px solid ${isOn ? color : TOKENS.border}`,
      display: 'flex', flexDirection: 'column', gap: 4,
      minWidth: 200,
    }}>
      <div style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10, color: TOKENS.dim, letterSpacing: 1.2,
      }}>
        {primary.display}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 28, fontWeight: 600,
          color: isOn ? color : TOKENS.muted,
          letterSpacing: -0.5,
        }}>
          {row == null ? '—' : (isOn ? primary.onLabel : primary.offLabel)}
        </span>
        {isOn && <span style={{
          width: 10, height: 10, borderRadius: '50%',
          background: color, boxShadow: `0 0 10px ${color}`,
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />}
      </div>
    </div>
  );
}

function RtdeBigReadout({ row, color, hist }) {
  return (
    <div style={{
      padding: '14px 18px',
      background: TOKENS.panel,
      display: 'flex', flexDirection: 'column', gap: 4,
      minWidth: 200,
    }}>
      <div style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10, color: TOKENS.dim, letterSpacing: 1.2,
      }}>
        {row ? (row.display || row.token) : '—'}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 32, fontWeight: 500, color,
          letterSpacing: -0.5,
        }}>
          {typeof row?.value === 'number' ? fmt(row.value, 2) : '—'}
        </span>
        {row?.unit && (
          <span style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 12, color: TOKENS.dim,
          }}>{Array.isArray(row.unit) ? row.unit[0] : row.unit}</span>
        )}
      </div>
      {hist && hist.length > 1 && (
        <Sparkline values={hist} w={180} h={26} color={color} fill />
      )}
    </div>
  );
}

function RtdeSmallReadout({ row, fallback }) {
  const label = row ? (row.display || row.token) : fallback;
  let display = '—';
  if (row?.value != null) {
    if (typeof row.value === 'number') {
      display = fmt(row.value, row.unit === 'V' || row.unit === 'A' ? 1 : 2);
    } else if (Array.isArray(row.value)) {
      display = '[…]';
    } else {
      display = String(row.value);
    }
  }
  return (
    <div style={{
      padding: '8px 10px',
      background: TOKENS.panel,
      display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      <div style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 9, color: TOKENS.muted, letterSpacing: 0.8,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{label}</div>
      <div style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 16, fontWeight: 500, color: TOKENS.text,
      }}>
        {display}
        {row?.unit && (
          <span style={{ fontSize: 9, color: TOKENS.dim, marginLeft: 4 }}>
            {Array.isArray(row.unit) ? row.unit[0] : row.unit}
          </span>
        )}
      </div>
    </div>
  );
}


// ─── 그룹 탭 + 헤더 ───────────────────────────────────────────────────
function RtdeTabBtn({ active, onClick, label, count, color }) {
  return (
    <button onClick={onClick}
      style={{
        padding: '5px 10px',
        background: active ? color + '22' : 'transparent',
        border: `1px solid ${active ? color : TOKENS.border}`,
        color: active ? color : TOKENS.dim,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10, letterSpacing: 0.5, cursor: 'pointer',
        borderRadius: 2,
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}>
      <span>{label}</span>
      <span style={{
        padding: '0 5px',
        background: active ? color : TOKENS.border,
        color: active ? '#0a0f1c' : TOKENS.dim,
        fontSize: 9, borderRadius: 1, fontWeight: 600,
      }}>{count}</span>
    </button>
  );
}

function RtdeGroupHeader({ g, count }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '0 0 8px',
      borderBottom: `1px solid ${TOKENS.border}`,
      marginBottom: 10,
    }}>
      <span style={{ width: 8, height: 8, background: g.color, borderRadius: 1 }} />
      <span style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11, color: TOKENS.text, fontWeight: 500, letterSpacing: 0.5,
      }}>{g.label}</span>
      <span style={{ fontSize: 11, color: TOKENS.muted }}>· {g.desc}</span>
      <span style={{ flex: 1 }} />
      <span style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10, color: TOKENS.dim,
      }}>{count}개</span>
    </div>
  );
}


// ─── 채널 카드 ────────────────────────────────────────────────────────
function RtdeChannelCard({ row, hist, group, selected, onClick }) {
  const prev = React.useRef(row.value);
  const [flash, setFlash] = React.useState(false);
  React.useEffect(() => {
    if (typeof row.value === 'number' && prev.current !== row.value) {
      setFlash(true);
      const id = setTimeout(() => setFlash(false), 200);
      prev.current = row.value;
      return () => clearTimeout(id);
    }
  }, [row.value]);

  const aliased = row.display && row.display !== row.token;
  const isNumeric = typeof row.value === 'number' && !Number.isNaN(row.value);
  const isArray = Array.isArray(row.value);

  // 값 표시
  let valueDisplay;
  if (row.value == null) {
    valueDisplay = '—';
  } else if (isArray) {
    valueDisplay = '[' + row.value.slice(0, 3).map(v =>
      typeof v === 'number' ? fmt(v, 2) : String(v)
    ).join(', ') + (row.value.length > 3 ? ', …' : '') + ']';
  } else if (typeof row.value === 'object') {
    valueDisplay = JSON.stringify(row.value).slice(0, 30);
  } else if (isNumeric) {
    const u = Array.isArray(row.unit) ? row.unit[0] : row.unit;
    valueDisplay = fmt(row.value, u === 'V' || u === 'A' || u === 'mm' ? 2 : 3);
  } else {
    valueDisplay = String(row.value);
  }

  // 유닛 표시
  const unitDisplay = row.unit
    ? (Array.isArray(row.unit) ? row.unit[0] : row.unit)
    : '';

  return (
    <div onClick={onClick}
      style={{
        background: TOKENS.panel,
        borderTop: `1px solid ${selected ? group.color : flash ? TOKENS.accent : TOKENS.border}`,
        borderRight: `1px solid ${selected ? group.color : flash ? TOKENS.accent : TOKENS.border}`,
        borderBottom: `1px solid ${selected ? group.color : flash ? TOKENS.accent : TOKENS.border}`,
        borderLeft: `2px solid ${aliased ? group.color : TOKENS.border}`,
        padding: '8px 10px',
        cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: 4,
        opacity: aliased ? 1 : 0.55,
        transition: 'border-color 0.2s',
        minWidth: 0,
      }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 9, color: TOKENS.muted, letterSpacing: 0.6,
      }}>
        <span style={{
          background: TOKENS.bg,
          padding: '1px 5px', color: group.color, fontWeight: 600,
          borderRadius: 1,
        }}>{row.access || 'read'}</span>
        <span style={{
          color: TOKENS.dim,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          flex: 1,
        }} title={row.token}>{row.token}</span>
        {isArray && <span style={{ color: TOKENS.violet }}>·VEC</span>}
      </div>
      <div style={{
        fontSize: 11, color: aliased ? TOKENS.text : TOKENS.muted,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{aliased ? row.display : '(매핑 없음)'}</div>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 4,
      }}>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 17, fontWeight: 500,
          color: row.value == null ? TOKENS.muted
               : flash ? TOKENS.accent
               : TOKENS.text,
          transition: 'color 0.25s',
        }}>{valueDisplay}</span>
        {unitDisplay && <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 9, color: TOKENS.muted,
        }}>{unitDisplay}</span>}
      </div>
      {isNumeric && hist.length > 1 && (
        <Sparkline values={hist}
          w={196} h={20}
          color={aliased ? group.color : TOKENS.muted}
          fill />
      )}
    </div>
  );
}


// ─── 디테일 패널 ──────────────────────────────────────────────────────
function RtdeDetailPanel({ row, hist, group, onClose }) {
  const value = row.value;
  const isArray = Array.isArray(value);
  const isNumeric = typeof value === 'number' && !Number.isNaN(value);
  const aliased = row.display && row.display !== row.token;
  const unit = row.unit
    ? (Array.isArray(row.unit) ? row.unit[0] : row.unit)
    : '';

  return (
    <aside style={{
      background: TOKENS.panel,
      borderTop: `1px solid ${TOKENS.border}`,
      borderRight: `1px solid ${TOKENS.border}`,
      borderBottom: `1px solid ${TOKENS.border}`,
      borderLeft: `2px solid ${group.color}`,
      padding: 16,
      display: 'flex', flexDirection: 'column', gap: 14,
      position: 'sticky', top: 0,
      alignSelf: 'flex-start',
      maxHeight: 'calc(100vh - 320px)',
      overflowY: 'auto',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: `1px solid ${TOKENS.border}`,
        paddingBottom: 12,
      }}>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10, color: group.color, fontWeight: 600,
          padding: '2px 6px', background: TOKENS.bg, borderRadius: 1,
        }}>{group.label}</span>
        <span style={{ flex: 1 }} />
        <button onClick={onClose}
          style={{
            background: 'transparent', border: 'none',
            color: TOKENS.dim, cursor: 'pointer', fontSize: 16,
          }}>×</button>
      </div>
      <div>
        <div style={{ fontSize: 15, color: TOKENS.text, marginBottom: 2 }}>
          {aliased ? row.display : row.token}
        </div>
        <div style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10, color: TOKENS.muted, letterSpacing: 0.4,
        }}>
          {row.token}
          {aliased && <span> · gp_mapping</span>}
        </div>
      </div>

      <div style={{
        background: TOKENS.bg,
        padding: '12px 14px',
        border: `1px solid ${TOKENS.border}`,
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <div style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 9, color: TOKENS.muted, letterSpacing: 1,
        }}>현재 값</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 26, fontWeight: 500, color: group.color,
            wordBreak: 'break-all',
          }}>
            {value == null ? '—'
             : isNumeric ? fmt(value, 4)
             : isArray ? '[' + value.map(v => typeof v === 'number' ? fmt(v, 3) : String(v)).join(', ') + ']'
             : String(value)}
          </span>
          {unit && <span style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 11, color: TOKENS.dim,
          }}>{unit}</span>}
        </div>
        {isNumeric && hist.length > 1 && (
          <div style={{ marginTop: 4 }}>
            <Sparkline values={hist} w={290} h={56} color={group.color} fill />
          </div>
        )}
        {isNumeric && hist.length > 1 && (
          <div style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 9, color: TOKENS.muted,
            display: 'flex', justifyContent: 'space-between',
          }}>
            <span>min {fmt(Math.min(...hist), 3)}</span>
            <span>avg {fmt(hist.reduce((a,b)=>a+b,0) / hist.length, 3)}</span>
            <span>max {fmt(Math.max(...hist), 3)}</span>
          </div>
        )}
      </div>

      {/* 벡터 채널 — 각 성분을 개별 행으로 분해 */}
      {isArray && (
        <div style={{
          background: TOKENS.bg,
          padding: 10,
          border: `1px solid ${TOKENS.border}`,
          borderLeft: `2px solid ${group.color}`,
        }}>
          <div style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 9, color: TOKENS.muted, letterSpacing: 1, marginBottom: 6,
          }}>VECTOR · {value.length} 성분</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {value.map((v, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', gap: 8,
                fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
              }}>
                <span style={{ color: TOKENS.dim }}>[{i}]</span>
                <span style={{ color: TOKENS.text, flex: 1, textAlign: 'right' }}>
                  {typeof v === 'number' ? fmt(v, 4) : String(v)}
                </span>
                {Array.isArray(row.unit) && row.unit[i] && (
                  <span style={{ color: TOKENS.muted }}>{row.unit[i]}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <DetailRow label="token" value={row.token} mono />
      <DetailRow label="display" value={row.display || '—'} mono />
      <DetailRow label="단위" value={
        Array.isArray(row.unit) ? row.unit.join(' / ') : (row.unit || '—')
      } />
      <DetailRow label="access" value={row.access || 'read'} />
      <DetailRow label="direction" value={row.direction || '—'} />
      <DetailRow label="writable" value={row.writable ? '예' : '아니오'} />
      <DetailRow label="history" value={`${hist.length} / ${HIST_LEN}`} mono />

      {row.help && (
        <div style={{
          padding: 10, background: TOKENS.bg,
          border: `1px solid ${TOKENS.border}`,
          fontSize: 11, color: TOKENS.dim, lineHeight: 1.5,
        }}>
          {row.help}
        </div>
      )}
    </aside>
  );
}

function DetailRow({ label, value, mono }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: 8,
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 11, padding: '4px 0',
      borderBottom: `1px solid ${TOKENS.border}33`,
    }}>
      <span style={{ color: TOKENS.muted }}>{label}</span>
      <span style={{
        color: TOKENS.text,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        textAlign: 'right',
        fontFamily: mono ? 'JetBrains Mono, monospace' : 'inherit',
      }}>{value}</span>
    </div>
  );
}


// ─── 푸터 ─────────────────────────────────────────────────────────────
function RtdeFooterBar({ status, wsState, rowCount }) {
  return (
    <div style={{
      height: 26, flex: '0 0 auto',
      borderTop: `1px solid ${TOKENS.border}`,
      background: TOKENS.panel2,
      display: 'flex', alignItems: 'center',
      padding: '0 12px', gap: 12,
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 10, color: TOKENS.dim, letterSpacing: 0.6,
    }}>
      <span>● RTDE {status.running ? 'RUNNING' : 'STOPPED'}</span>
      <span>·</span>
      <span>{(status.frequency || 0).toFixed(1)}Hz</span>
      <span>·</span>
      <span>frame {status.frame_index.toLocaleString()}</span>
      <span>·</span>
      <span>{rowCount} 채널</span>
      <span style={{ flex: 1 }} />
      <span>WS · <span style={{
        color: wsState === 'open' ? TOKENS.green
             : wsState === 'connecting' ? TOKENS.amber : TOKENS.red,
      }}>{wsState}</span></span>
      <span>·</span>
      <span>age {status.age_ms != null ? `${status.age_ms.toFixed(0)} ms` : '—'}</span>
    </div>
  );
}


window.ScreenRtde = ScreenRtde;
