// Screen: 로봇 로그 (TCP 소켓 → 라이브 텍스트 스트림)
// 백엔드에서 띄운 TCP 서버(LOG_SOCKET_PORT) 에 로봇이 클라이언트로 접속해서
// 라인 단위로 로그를 흘려보냄. 우리는 그걸 /ws/logs WebSocket 으로 받아 렌더.
//
// UX:
//   - 자동 스크롤 (사용자가 위로 올리면 일시정지, 맨 아래 가까이로 돌아오면 재개)
//   - level 색상 / 시스템 이벤트 강조
//   - 검색 (q 가 비면 전체, 있으면 부분일치)
//   - level 필터 (debug/info/warn/error)
//   - clear / download (.log 텍스트로 저장)
//   - 연결된 클라이언트 목록 + listen 상태 표시 + host/port 변경

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'];
const LEVEL_COLORS = {
  debug: '#6b7280',
  info:  '#22d3ee',
  warn:  '#fbbf24',
  error: '#f87171',
};

function ScreenLogs() {
  const [status, setStatus] = React.useState(null);
  const [entries, setEntries] = React.useState([]);
  const [paused, setPaused] = React.useState(false);
  const [q, setQ] = React.useState('');
  const [levelFilter, setLevelFilter] = React.useState(() => ({
    debug: false, info: true, warn: true, error: true,
  }));
  const [autoScroll, setAutoScroll] = React.useState(true);
  const [wsState, setWsState] = React.useState('connecting'); // connecting | open | closed
  const bufferRef = React.useRef([]);  // pause 동안 쌓아두는 곳
  const listRef = React.useRef(null);
  const lastIdRef = React.useRef(0);

  // 초기 backlog
  const fetchRecent = React.useCallback(async () => {
    try {
      const res = await fetch('/api/logs/recent?limit=1000');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const items = Array.isArray(json.items) ? json.items : [];
      setEntries(items);
      if (items.length) lastIdRef.current = items[items.length - 1].id || 0;
    } catch (err) {
      console.warn('[logs] recent fetch failed', err);
    }
  }, []);

  // 상태 폴링
  const fetchStatus = React.useCallback(async () => {
    try {
      const res = await fetch('/api/logs/status');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus(await res.json());
    } catch (err) {
      setStatus(s => s ? { ...s, listening: false, bind_error: err.message } : null);
    }
  }, []);

  React.useEffect(() => {
    fetchRecent();
    fetchStatus();
    const id = setInterval(fetchStatus, 3000);
    return () => clearInterval(id);
  }, [fetchRecent, fetchStatus]);

  // WebSocket — auto-reconnect on close
  React.useEffect(() => {
    let cancelled = false;
    let ws = null;
    let reconnectT = null;

    const connect = () => {
      if (cancelled) return;
      try {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${proto}//${window.location.host}/ws/logs`);
      } catch (err) {
        setWsState('closed');
        reconnectT = setTimeout(connect, 2000);
        return;
      }
      ws.onopen = () => setWsState('open');
      ws.onclose = () => {
        setWsState('closed');
        if (!cancelled) reconnectT = setTimeout(connect, 2000);
      };
      ws.onerror = () => {/* onclose 가 이어서 발생 */};
      ws.onmessage = (ev) => {
        let entry = null;
        try { entry = JSON.parse(ev.data); } catch { return; }
        if (!entry || typeof entry !== 'object') return;
        // 백엔드가 subscribe 시작할 때 backlog 를 흘려보내므로 중복 컷
        if (entry.id && entry.id <= lastIdRef.current) return;
        lastIdRef.current = entry.id || lastIdRef.current;

        if (paused) {
          bufferRef.current.push(entry);
          if (bufferRef.current.length > 5000) bufferRef.current.shift();
        } else {
          setEntries(prev => {
            const next = prev.concat(entry);
            // 메모리 cap — ring buffer
            return next.length > 5000 ? next.slice(next.length - 5000) : next;
          });
        }
      };
    };
    connect();
    return () => {
      cancelled = true;
      if (reconnectT) clearTimeout(reconnectT);
      if (ws) { try { ws.close(); } catch {} }
    };
  }, [paused]);

  // pause 해제 시 buffer flush
  React.useEffect(() => {
    if (paused) return;
    if (!bufferRef.current.length) return;
    const drain = bufferRef.current;
    bufferRef.current = [];
    setEntries(prev => {
      const next = prev.concat(drain);
      return next.length > 5000 ? next.slice(next.length - 5000) : next;
    });
  }, [paused]);

  // autoscroll
  React.useEffect(() => {
    if (!autoScroll || paused) return;
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [entries, autoScroll, paused]);

  // 사용자가 위로 스크롤하면 autoScroll off, 다시 바닥 가까이로 가면 on
  const onListScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    if (nearBottom !== autoScroll) setAutoScroll(nearBottom);
  };

  // 필터링
  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries.filter(e => {
      const lvl = e.level || 'info';
      if (!e.system && !levelFilter[lvl]) return false;
      if (needle) {
        const hay = `${e.message || ''} ${e.raw || ''} ${e.source || ''} ${e.tag || ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [entries, q, levelFilter]);

  // counts
  const counts = React.useMemo(() => {
    const c = { debug: 0, info: 0, warn: 0, error: 0 };
    entries.forEach(e => { if (e.level && c[e.level] != null) c[e.level]++; });
    return c;
  }, [entries]);

  const clearAll = async () => {
    if (!window.confirm('서버 측 로그 버퍼와 화면을 비웁니다. 계속할까요?')) return;
    try {
      await fetch('/api/logs/clear', { method: 'POST' });
    } catch (err) { console.warn('[logs] clear failed', err); }
    setEntries([]);
    bufferRef.current = [];
    lastIdRef.current = 0;
  };

  const download = () => {
    const text = entries.map(e => {
      const head = `[${e.date || ''} ${e.time}] ${(e.level || 'info').toUpperCase().padEnd(5)} ${e.source || ''}`;
      return `${head}  ${e.message ?? e.raw ?? ''}`;
    }).join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = `robot-log-${stamp}.log`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      minHeight: 0, background: TOKENS.bg,
    }}>
      <LogStatusBar
        status={status}
        wsState={wsState}
        onReconfigure={async (host, port) => {
          const res = await fetch('/api/logs/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ host, port }),
          });
          if (!res.ok) throw new Error(await res.text());
          await fetchStatus();
        }}
      />

      <LogToolbar
        q={q} setQ={setQ}
        levelFilter={levelFilter} setLevelFilter={setLevelFilter}
        counts={counts}
        paused={paused} setPaused={setPaused}
        autoScroll={autoScroll} setAutoScroll={setAutoScroll}
        bufferedCount={bufferRef.current.length}
        onClear={clearAll}
        onDownload={download}
        total={entries.length}
        shown={filtered.length}
      />

      <div ref={listRef} onScroll={onListScroll} style={{
        flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
        padding: '6px 14px 14px',
        background: TOKENS.bg,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 12,
        lineHeight: 1.55,
      }}>
        {filtered.length === 0 && (
          <div style={{
            padding: 40, textAlign: 'center', color: TOKENS.muted,
            fontFamily: 'Pretendard, sans-serif', fontSize: 13,
          }}>
            {entries.length === 0
              ? `대기 중 — 로봇이 ${status?.host || '0.0.0.0'}:${status?.port || '?'} 로 TCP 접속하면 여기에 표시됩니다.`
              : '필터 조건과 일치하는 로그가 없습니다.'}
          </div>
        )}
        {filtered.map((e) => <LogLine key={e.id} entry={e} q={q} />)}
      </div>
    </div>
  );
}

function LogStatusBar({ status, wsState, onReconfigure }) {
  const [editing, setEditing] = React.useState(false);
  const [host, setHost] = React.useState(status?.host || '0.0.0.0');
  const [port, setPort] = React.useState(String(status?.port || 9999));
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState(null);
  React.useEffect(() => {
    if (!editing) {
      setHost(status?.host || '0.0.0.0');
      setPort(String(status?.port || 9999));
    }
  }, [status?.host, status?.port, editing]);

  const listening = !!status?.listening;
  const wsOK = wsState === 'open';
  const clients = status?.clients || [];

  const save = async () => {
    setErr(null); setSaving(true);
    try {
      await onReconfigure(host.trim(), parseInt(port, 10));
      setEditing(false);
    } catch (e) {
      setErr(String(e.message || e));
    } finally { setSaving(false); }
  };

  return (
    <div style={{
      padding: '10px 16px',
      borderBottom: `1px solid ${TOKENS.border}`,
      background: TOKENS.panel2,
      display: 'flex', alignItems: 'center', gap: 12,
      flexWrap: 'wrap', flex: '0 0 auto',
    }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '4px 10px',
        border: `1px solid ${listening ? TOKENS.green : TOKENS.red}55`,
        background: (listening ? TOKENS.green : TOKENS.red) + '15',
        borderRadius: 2,
        fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: listening ? TOKENS.green : TOKENS.red,
          boxShadow: `0 0 8px ${listening ? TOKENS.green : TOKENS.red}`,
        }} />
        <span style={{ color: listening ? TOKENS.green : TOKENS.red, fontWeight: 600 }}>
          TCP {listening ? 'LISTEN' : 'DOWN'}
        </span>
        {!editing && (
          <span style={{ color: TOKENS.text }}>
            {status?.host || '?'}:{status?.port || '?'}
          </span>
        )}
        {editing && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <input value={host} onChange={(e) => setHost(e.target.value)}
              placeholder="0.0.0.0"
              style={{
                width: 110,
                background: TOKENS.bg, border: `1px solid ${TOKENS.border}`,
                color: TOKENS.text, padding: '2px 6px',
                fontFamily: 'inherit', fontSize: 11, borderRadius: 2, outline: 'none',
              }} />
            <span style={{ color: TOKENS.dim }}>:</span>
            <input value={port} onChange={(e) => setPort(e.target.value)}
              placeholder="9999"
              style={{
                width: 60,
                background: TOKENS.bg, border: `1px solid ${TOKENS.border}`,
                color: TOKENS.text, padding: '2px 6px',
                fontFamily: 'inherit', fontSize: 11, borderRadius: 2, outline: 'none',
              }} />
          </span>
        )}
        {!editing ? (
          <button onClick={() => setEditing(true)} style={pillBtnStyle()}>변경</button>
        ) : (
          <>
            <button onClick={save} disabled={saving} style={pillBtnStyle(TOKENS.accent)}>
              {saving ? '...' : '적용'}
            </button>
            <button onClick={() => { setEditing(false); setErr(null); }} style={pillBtnStyle()}>취소</button>
          </>
        )}
      </div>

      {status?.bind_error && (
        <span style={{
          fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
          color: TOKENS.red,
        }}>{status.bind_error}</span>
      )}
      {err && (
        <span style={{
          fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
          color: TOKENS.red,
        }}>{err}</span>
      )}

      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 10px',
        border: `1px solid ${wsOK ? TOKENS.cyan : TOKENS.red}55`,
        background: (wsOK ? TOKENS.cyan : TOKENS.red) + '15',
        borderRadius: 2,
        fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
        color: wsOK ? TOKENS.cyan : TOKENS.red, fontWeight: 600,
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: wsOK ? TOKENS.cyan : TOKENS.red,
        }} />
        WS {wsOK ? 'OPEN' : wsState.toUpperCase()}
      </div>

      <div style={{
        fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
        color: TOKENS.dim,
      }}>
        클라이언트 <span style={{ color: TOKENS.text, fontWeight: 600 }}>
          {clients.length}
        </span>
        {' · '}버퍼 <span style={{ color: TOKENS.text }}>
          {status?.buffered ?? 0}/{status?.buffer_size ?? 0}
        </span>
      </div>

      <span style={{ flex: 1 }} />

      {clients.length > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 6,
          fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
        }}>
          {clients.slice(0, 4).map(c => (
            <span key={c.id} style={{
              padding: '3px 8px',
              border: `1px solid ${TOKENS.border}`,
              background: TOKENS.bg,
              borderRadius: 2,
              color: TOKENS.text,
            }}>
              #{c.id} {c.addr}
              <span style={{ color: TOKENS.muted, marginLeft: 6 }}>
                {c.lines} lines
              </span>
            </span>
          ))}
          {clients.length > 4 && (
            <span style={{ color: TOKENS.muted, alignSelf: 'center' }}>+{clients.length - 4}</span>
          )}
        </div>
      )}
    </div>
  );
}

function LogToolbar({
  q, setQ, levelFilter, setLevelFilter, counts,
  paused, setPaused, autoScroll, setAutoScroll,
  bufferedCount, onClear, onDownload, total, shown,
}) {
  return (
    <div style={{
      padding: '8px 16px',
      borderBottom: `1px solid ${TOKENS.border}`,
      background: TOKENS.panel2,
      display: 'flex', alignItems: 'center', gap: 8,
      flexWrap: 'wrap', flex: '0 0 auto',
    }}>
      {LOG_LEVELS.map(lvl => {
        const on = levelFilter[lvl];
        return (
          <button key={lvl}
            onClick={() => setLevelFilter(f => ({ ...f, [lvl]: !f[lvl] }))}
            style={{
              padding: '4px 10px',
              border: `1px solid ${on ? LEVEL_COLORS[lvl] : TOKENS.border}`,
              background: on ? LEVEL_COLORS[lvl] + '22' : 'transparent',
              color: on ? LEVEL_COLORS[lvl] : TOKENS.dim,
              fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
              fontWeight: 600, letterSpacing: 0.6,
              cursor: 'pointer', borderRadius: 2,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
            {lvl.toUpperCase()}
            <span style={{
              color: on ? LEVEL_COLORS[lvl] : TOKENS.muted, fontWeight: 400,
            }}>{counts[lvl] || 0}</span>
          </button>
        );
      })}

      <input value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="검색 (메시지·태그·소스)"
        style={{
          background: TOKENS.bg, border: `1px solid ${TOKENS.border}`,
          color: TOKENS.text, fontFamily: 'JetBrains Mono, monospace',
          fontSize: 11, padding: '5px 10px', borderRadius: 2, outline: 'none',
          width: 240,
        }} />

      <span style={{
        fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: TOKENS.dim,
      }}>{shown}/{total}</span>

      <span style={{ flex: 1 }} />

      <label style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: TOKENS.dim,
        cursor: 'pointer',
      }}>
        <input type="checkbox" checked={autoScroll}
          onChange={(e) => setAutoScroll(e.target.checked)} />
        AUTOSCROLL
      </label>

      <button onClick={() => setPaused(p => !p)}
        style={{
          padding: '5px 12px',
          border: `1px solid ${paused ? TOKENS.amber : TOKENS.border}`,
          background: paused ? TOKENS.amber + '22' : 'transparent',
          color: paused ? TOKENS.amber : TOKENS.text,
          fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 600,
          cursor: 'pointer', borderRadius: 2,
        }}>
        {paused ? `PAUSED${bufferedCount ? ` (+${bufferedCount})` : ''}` : 'PAUSE'}
      </button>

      <button onClick={onDownload}
        style={{
          padding: '5px 12px',
          border: `1px solid ${TOKENS.border}`,
          background: 'transparent', color: TOKENS.text,
          fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
          cursor: 'pointer', borderRadius: 2,
        }}>
        SAVE .log
      </button>

      <button onClick={onClear}
        style={{
          padding: '5px 12px',
          border: `1px solid ${TOKENS.red}55`,
          background: TOKENS.red + '15',
          color: TOKENS.red,
          fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 600,
          cursor: 'pointer', borderRadius: 2,
        }}>
        CLEAR
      </button>
    </div>
  );
}

function LogLine({ entry, q }) {
  const lvl = entry.level || 'info';
  const color = LEVEL_COLORS[lvl] || TOKENS.text;
  const isSystem = !!entry.system;
  return (
    <div style={{
      display: 'flex', gap: 10,
      padding: '2px 0',
      borderLeft: `2px solid ${isSystem ? TOKENS.violet : color}`,
      paddingLeft: 10,
      background: isSystem ? TOKENS.violet + '10' : 'transparent',
      marginBottom: 1,
      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    }}>
      <span style={{
        color: TOKENS.muted, flex: '0 0 auto', minWidth: 92,
      }}>{entry.time}</span>
      <span style={{
        color: isSystem ? TOKENS.violet : color, flex: '0 0 auto',
        minWidth: 50, fontWeight: 600, letterSpacing: 0.5,
      }}>{(isSystem ? 'SYS' : lvl.toUpperCase()).padEnd(5)}</span>
      <span style={{
        color: TOKENS.dim, flex: '0 0 auto', minWidth: 80,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{entry.source || ''}</span>
      <span style={{ color: TOKENS.text, flex: 1, minWidth: 0 }}>
        {highlight(entry.message ?? entry.raw ?? '', q)}
        {entry.tag && (
          <span style={{
            marginLeft: 8, padding: '0 6px',
            background: TOKENS.border, color: TOKENS.dim,
            borderRadius: 2, fontSize: 10,
          }}>{entry.tag}</span>
        )}
      </span>
    </div>
  );
}

function highlight(text, q) {
  if (!q || !q.trim()) return text;
  const needle = q.trim();
  const idx = text.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{
        background: TOKENS.amber + '55', color: TOKENS.text, padding: '0 1px',
      }}>{text.slice(idx, idx + needle.length)}</mark>
      {text.slice(idx + needle.length)}
    </>
  );
}

function pillBtnStyle(accent) {
  return {
    padding: '2px 8px',
    border: `1px solid ${accent || TOKENS.border}`,
    background: accent ? accent + '22' : 'transparent',
    color: accent || TOKENS.text,
    fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
    cursor: 'pointer', borderRadius: 2,
  };
}

window.ScreenLogs = ScreenLogs;
