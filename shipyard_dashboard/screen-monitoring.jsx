// Screen: 실시간 모니터링 (Modbus TCP)
// Hero KPIs at top → group tabs + filters → dense register grid.
// Subscribes to the modbus simulator so values animate live.

function ScreenMonitoring() {
  const M = window.MODBUS;
  const [state, setState] = React.useState(() => ({ ...M.state }));
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => M.subscribe((s, t) => { setState({ ...s }); setTick(t); }), []);

  const [groupTab, setGroupTab] = React.useState('all');
  const [showReserved, setShowReserved] = React.useState(false);
  const [q, setQ] = React.useState('');
  const [selected, setSelected] = React.useState(null);

  const filtered = M.registers.filter(r => {
    if (!showReserved && r.status !== 'active') return false;
    if (groupTab !== 'all' && r.grp !== groupTab) return false;
    if (q) {
      const s = q.toLowerCase();
      if (!String(r.a).includes(s) &&
          !r.name.toLowerCase().includes(s) &&
          !r.en.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const grouped = {};
  filtered.forEach(r => {
    (grouped[r.grp] = grouped[r.grp] || []).push(r);
  });

  // Active count per group
  const countActive = (g) => M.registers.filter(r =>
    (g === 'all' || r.grp === g) && r.status === 'active').length;

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      minHeight: 0, background: TOKENS.bg,
    }}>
      {/* Connection bar — Modbus host/port + Connect */}
      <ConnectionBar />

      {/* HERO strip — most important live values */}
      <HeroStrip state={state} M={M} />

      {/* Filter bar */}
      <div style={{
        padding: '10px 16px',
        borderBottom: `1px solid ${TOKENS.border}`,
        display: 'flex', alignItems: 'center', gap: 8,
        background: TOKENS.panel2,
        flexWrap: 'wrap',
        flex: '0 0 auto',
      }}>
        <TabBtn active={groupTab === 'all'} onClick={() => setGroupTab('all')}
          label="전체" count={countActive('all')} color={TOKENS.dim} />
        {Object.values(M.groups).map(g => (
          <TabBtn key={g.id} active={groupTab === g.id} onClick={() => setGroupTab(g.id)}
            label={g.label} count={countActive(g.id)} color={g.color} sub={g.range} />
        ))}
        <span style={{ flex: 1 }} />
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="주소·이름 검색 (예: 131, 전류)"
          style={{
            background: TOKENS.bg,
            border: `1px solid ${TOKENS.border}`,
            color: TOKENS.text,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 11,
            padding: '5px 10px',
            borderRadius: 2,
            outline: 'none',
            width: 200,
          }} />
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10, color: TOKENS.dim,
          cursor: 'pointer',
        }}>
          <input type="checkbox" checked={showReserved}
            onChange={(e) => setShowReserved(e.target.checked)}
            style={{ accentColor: TOKENS.accent }} />
          예약/미사용 표시
        </label>
      </div>

      {/* Main grid */}
      <div style={{
        flex: 1, minHeight: 0, overflowY: 'auto',
        padding: 16,
        display: 'grid',
        gridTemplateColumns: selected ? '1fr 340px' : '1fr',
        gap: 16,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {Object.values(M.groups).map(g => {
            const items = grouped[g.id];
            if (!items || !items.length) return null;
            return (
              <section key={g.id}>
                <GroupHeader g={g} count={items.length} />
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: 8,
                }}>
                  {items.map(r => (
                    <RegisterCard key={r.a} r={r}
                      value={state[r.a]}
                      tick={tick}
                      selected={selected === r.a}
                      onClick={() => setSelected(selected === r.a ? null : r.a)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {selected != null && (
          <RegisterDetail
            r={M.byAddr[selected]} state={state}
            onClose={() => setSelected(null)} />
        )}
      </div>

      <FooterBar state={state} tick={tick} />
    </div>
  );
}

function TabBtn({ active, onClick, label, count, color, sub }) {
  return (
    <button onClick={onClick}
      style={{
        padding: '5px 10px',
        background: active ? color + '22' : 'transparent',
        border: `1px solid ${active ? color : TOKENS.border}`,
        color: active ? color : TOKENS.dim,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10,
        letterSpacing: 0.5,
        cursor: 'pointer',
        borderRadius: 2,
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}>
      <span>{label}</span>
      {sub && <span style={{ color: TOKENS.muted, fontSize: 9 }}>{sub}</span>}
      <span style={{
        padding: '0 5px',
        background: active ? color : TOKENS.border,
        color: active ? '#0a0f1c' : TOKENS.dim,
        fontSize: 9, borderRadius: 1, fontWeight: 600,
      }}>{count}</span>
    </button>
  );
}

function GroupHeader({ g, count }) {
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
      <span style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 9, color: TOKENS.muted, letterSpacing: 0.6,
      }}>{g.range}</span>
      <span style={{
        fontSize: 11, color: TOKENS.muted,
      }}>· {g.desc}</span>
      <span style={{ flex: 1 }} />
      <span style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10, color: TOKENS.dim,
      }}>{count}개</span>
    </div>
  );
}

// 색상 토큰 이름 → 실제 값 (layout 의 "color" 문자열 해석)
function resolveColor(name) {
  return TOKENS[name] || name || TOKENS.text;
}

// 특정 주소의 enum 값에 대해 의미별 색상 반환 (없으면 undefined → 기본색).
// UR robot_mode 같이 "정상/위험" 의미가 있는 enum 에 적용.
function enumStateColor(addr, value) {
  if (addr === 258) {
    // UR robot_mode: 0=Disconnected, 1=Confirm_safety, 2=Booting, 3=Power_off,
    //               4=Power_on, 5=Idle, 6=Backdrive, 7=Running
    if (value === 7) return TOKENS.green;        // Running
    if (value === 5) return TOKENS.cyan;         // Idle
    if (value === 4 || value === 6) return TOKENS.amber;  // PowerOn / Backdrive
    if (value === 2) return TOKENS.amber;        // Booting
    if (value === 1) return TOKENS.amber;        // Confirm_safety
    return TOKENS.red;                            // 0 Disconnected, 3 Power_off
  }
  return undefined;
}

// 주소의 현재 값을 사람 읽기 좋은 텍스트로. valueMap/code 등 자동 해석.
function displayValue(state, addr, M, decimals) {
  if (addr == null) return '—';
  const r = M.byAddr?.[addr];
  if (!r) return '—';
  const v = state[addr];
  if (v == null) return '—';
  if (typeof v === 'string') return v;
  if (r.kind === 'bool') {
    // 직접 매핑 우선 → 다중값 valueMap도 지원
    return r.valueMap?.[v] ?? r.valueMap?.[v ? 1 : 0] ?? (v ? 'ON' : 'OFF');
  }
  if (r.kind === 'enum') {
    return r.valueMap?.[v] ?? String(v);
  }
  if (r.kind === 'code') return v === 0 ? 'OK' : `E${v}`;
  if (typeof v === 'number') {
    if (decimals != null) return fmt(v, decimals);
    // 단위가 V/A 면 소수점 1자리, 그 외 정수
    return fmt(v, r.unit === 'V' || r.unit === 'A' ? 1 : 0);
  }
  return String(v);
}

function HeroStrip({ state, M }) {
  const layout = M.layout?.hero || {};
  const primary = layout.primary;
  const bigs = Array.isArray(layout.big) ? layout.big : [];
  const smalls = Array.isArray(layout.small) ? layout.small : [];

  // 동적 컬럼 구성: 큰 박스 + BigReadout 들 + small grid
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
      {primary && <HeroPrimary primary={primary} state={state} M={M} />}
      {bigs.map((b, i) => (
        <BigReadout key={i} addr={b.addr} state={state} M={M}
          color={resolveColor(b.color)}
          sub={b.target != null
            ? `목표 ${displayValue(state, b.target, M)}${M.byAddr?.[b.target]?.unit ? ' ' + M.byAddr[b.target].unit : ''}`
            : (b.sub || '')} />
      ))}
      {smalls.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${smalls.length}, 1fr)`,
          gap: 1,
          background: TOKENS.border,
        }}>
          {smalls.map((s, i) => {
            const r = M.byAddr?.[s.addr];
            const v = state[s.addr];
            let big;
            let color;
            if (s.code) {
              big = v == null ? '—' : (v === 0 ? 'OK' : `E${v}`);
              color = v === 0 ? TOKENS.green : (v == null ? TOKENS.muted : TOKENS.red);
            } else if (v == null) {
              big = '—';
            } else if (r?.kind === 'enum' || (r?.kind === 'bool' && r?.valueMap)) {
              // enum / valueMap bool → 라벨로 표시
              big = r.valueMap?.[v] ?? String(v);
              // UR robot mode 같은 경우 의미별 색상 한 번에 적용
              color = enumStateColor(s.addr, v);
            } else if (r?.kind === 'bool') {
              big = v ? 'ON' : 'OFF';
              color = v ? TOKENS.green : TOKENS.muted;
            } else {
              big = fmt(v, r?.unit === 'V' || r?.unit === 'A' ? 1 : 0);
            }
            return (
              <SmallReadout key={i}
                addr={s.addr} state={state} M={M}
                label={s.label || r?.name || `ADDR ${s.addr}`}
                big={big}
                unit={s.unit || r?.unit}
                color={color} />
            );
          })}
        </div>
      )}
    </div>
  );
}

// Primary 슬롯: bool 한 개를 큰 글씨로 + onLabel/offLabel + 인라인 metas
function HeroPrimary({ primary, state, M }) {
  const addr = primary.addr;
  const r = M.byAddr?.[addr];
  const v = state[addr];
  const isOn = Boolean(v);
  const color = resolveColor(primary.color || 'accent');
  const onLabel  = primary.onLabel  || r?.valueMap?.[1] || '활성';
  const offLabel = primary.offLabel || r?.valueMap?.[0] || '비활성';
  const metas = Array.isArray(primary.metas) ? primary.metas : [];

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
        {r?.name || '—'} · ADDR {addr}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 28, fontWeight: 600,
          color: isOn ? color : TOKENS.muted,
          letterSpacing: -0.5,
        }}>
          {isOn ? onLabel : offLabel}
        </span>
        {isOn && <span style={{
          width: 10, height: 10, borderRadius: '50%',
          background: color,
          boxShadow: `0 0 10px ${color}`,
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />}
      </div>
      {metas.length > 0 && (
        <div style={{
          display: 'flex', gap: 12,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 11, color: TOKENS.dim, marginTop: 2,
          flexWrap: 'wrap',
        }}>
          {metas.map((m, i) => (
            <span key={i}>
              {m.label}{' '}
              <span style={{ color: TOKENS.text }}>
                {displayValue(state, m.addr, M)}
                {m.of != null && <>/{displayValue(state, m.of, M)}</>}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function BigReadout({ addr, state, M, color, sub }) {
  const r = M.byAddr[addr];
  const hist = M.getHist(addr);
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
        {r.name} · ADDR {addr}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 32, fontWeight: 500, color,
          letterSpacing: -0.5,
        }}>{fmt(state[addr], r.unit === 'V' ? 1 : 0)}</span>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 12, color: TOKENS.dim,
        }}>{r.unit}</span>
      </div>
      <Sparkline values={hist} w={180} h={26} color={color} fill />
      <div style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10, color: TOKENS.muted,
      }}>{sub}</div>
    </div>
  );
}

function SmallReadout({ addr, state, M, label, big, unit, color }) {
  const r = M.byAddr[addr];
  return (
    <div style={{
      padding: '8px 10px',
      background: TOKENS.panel,
      display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      <div style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 9, color: TOKENS.muted, letterSpacing: 0.8,
      }}>{label} · {addr}</div>
      <div style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 16, fontWeight: 500,
        color: color || TOKENS.text,
      }}>
        {big != null ? big : fmt(state[addr], 0)}
        {unit && <span style={{ fontSize: 9, color: TOKENS.dim, marginLeft: 4 }}>{unit}</span>}
      </div>
    </div>
  );
}

function RegisterCard({ r, value, tick, selected, onClick }) {
  // Detect value-changed within last few ticks to flash
  const prev = React.useRef(value);
  const [flash, setFlash] = React.useState(false);
  React.useEffect(() => {
    if (prev.current !== value) {
      setFlash(true);
      const id = setTimeout(() => setFlash(false), 250);
      prev.current = value;
      return () => clearTimeout(id);
    }
  }, [value]);

  const M = window.MODBUS;
  const grpColor = M.groups[r.grp].color;
  const isActive = r.status === 'active';
  const isNumeric = typeof value === 'number' && r.kind !== 'bool';

  return (
    <div onClick={onClick}
      style={{
        background: TOKENS.panel,
        borderTop: `1px solid ${selected ? grpColor : flash ? TOKENS.accent : TOKENS.border}`,
        borderRight: `1px solid ${selected ? grpColor : flash ? TOKENS.accent : TOKENS.border}`,
        borderBottom: `1px solid ${selected ? grpColor : flash ? TOKENS.accent : TOKENS.border}`,
        borderLeft: `2px solid ${isActive ? grpColor : TOKENS.border}`,
        padding: '8px 10px',
        cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: 4,
        opacity: isActive ? 1 : 0.45,
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
          padding: '1px 5px', color: grpColor, fontWeight: 600,
          borderRadius: 1,
        }}>{r.a}</span>
        <span style={{
          color: TOKENS.dim,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          flex: 1,
        }}>{r.en}</span>
        {r.kind === 'bitfield' && <span style={{ color: TOKENS.violet }}>·BF</span>}
        {(r.kind === 'enum' || (r.kind === 'bool' && r.valueMap)) && <span style={{ color: TOKENS.violet }}>·EN</span>}
      </div>
      <div style={{
        fontSize: 11, color: TOKENS.text,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{r.name}</div>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 4,
      }}>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 17, fontWeight: 500,
          color: !isActive ? TOKENS.muted
                : flash ? TOKENS.accent
                : r.kind === 'code' ? (value === 0 ? TOKENS.green : TOKENS.red)
                : isNumeric ? TOKENS.text
                : r.kind === 'bool' ? (value ? TOKENS.green : TOKENS.muted)
                : TOKENS.text,
          transition: 'color 0.25s',
        }}>
          {!isActive ? '—'
           : value == null ? '—'
           : r.kind === 'bool' ? (
               // valueMap 우선: 정의된 모든 값(0/1/2…) 직접 매핑. 없으면 ON/OFF.
               r.valueMap && r.valueMap[value] !== undefined ? r.valueMap[value]
               : r.valueMap && r.valueMap[value ? 1 : 0] !== undefined ? r.valueMap[value ? 1 : 0]
               : (value ? 'ON' : 'OFF')
             )
           : r.kind === 'code' ? (value === 0 ? 'OK' : `E${value}`)
           : r.kind === 'enum' ? (
               // valueMap 우선 (0/1-indexed 양쪽), 없으면 enums[value-1] (1-indexed legacy)
               typeof value === 'string' ? value
               : (r.valueMap && r.valueMap[value] !== undefined) ? r.valueMap[value]
               : (r.enums && Number.isInteger(value) && value >= 1 && value <= r.enums.length)
                   ? r.enums[value - 1]
                   : String(value)
             )
           : r.kind === 'bitfield' ? '0b' + (value || 0).toString(2).padStart(16, '0')
           : r.kind === 'string' ? value
           : fmt(value, r.unit === 'V' || r.unit === 'A' ? 1 : 0)}
        </span>
        {r.unit && <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 9, color: TOKENS.muted,
        }}>{r.unit}</span>}
      </div>
    </div>
  );
}

function RegisterDetail({ r, state, onClose }) {
  const M = window.MODBUS;
  const hist = M.getHist(r.a);
  const value = state[r.a];
  const grpColor = M.groups[r.grp].color;

  return (
    <aside style={{
      background: TOKENS.panel,
      borderTop: `1px solid ${TOKENS.border}`,
      borderRight: `1px solid ${TOKENS.border}`,
      borderBottom: `1px solid ${TOKENS.border}`,
      borderLeft: `2px solid ${grpColor}`,
      padding: 16,
      display: 'flex', flexDirection: 'column', gap: 14,
      position: 'sticky', top: 0,
      alignSelf: 'flex-start',
      maxHeight: 'calc(100vh - 240px)',
      overflowY: 'auto',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: `1px solid ${TOKENS.border}`,
        paddingBottom: 12,
      }}>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 11, color: grpColor, fontWeight: 600,
          padding: '2px 6px', background: TOKENS.bg, borderRadius: 1,
        }}>ADDR {r.a}</span>
        <span style={{ flex: 1 }} />
        <button onClick={onClose}
          style={{
            background: 'transparent', border: 'none',
            color: TOKENS.dim, cursor: 'pointer', fontSize: 16,
          }}>×</button>
      </div>
      <div>
        <div style={{ fontSize: 15, color: TOKENS.text, marginBottom: 2 }}>
          {r.name}
        </div>
        <div style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10, color: TOKENS.muted, letterSpacing: 0.4,
        }}>
          {r.en} · {M.groups[r.grp].label}
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
            fontSize: 26, fontWeight: 500, color: grpColor,
          }}>
            {r.status !== 'active' ? '—'
             : value == null ? '—'
             : r.kind === 'bool' ? (
                 // valueMap 우선: 모든 값 직접 매핑 (0/1/2…). 없으면 ON/OFF.
                 r.valueMap && r.valueMap[value] !== undefined ? r.valueMap[value]
                 : r.valueMap && r.valueMap[value ? 1 : 0] !== undefined ? r.valueMap[value ? 1 : 0]
                 : (value ? 'ON' : 'OFF')
               )
             : r.kind === 'code' ? (value === 0 ? 'OK' : `E${value}`)
             : r.kind === 'enum' ? (
                 // valueMap 우선 (0/1-indexed 양쪽 지원), 없으면 enums[value-1] (1-indexed legacy)
                 typeof value === 'string'
                   ? value
                   : (r.valueMap && r.valueMap[value] !== undefined)
                     ? r.valueMap[value]
                     : (r.enums && Number.isInteger(value) && value >= 1 && value <= r.enums.length
                         ? r.enums[value - 1]
                         : String(value))
               )
             : r.kind === 'bitfield' ? '0b' + (value||0).toString(2).padStart(16,'0')
             : r.kind === 'string' ? value
             : fmt(value, 2)}
          </span>
          {r.unit && <span style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 11, color: TOKENS.dim,
          }}>{r.unit}</span>}
        </div>
        <div style={{ marginTop: 4 }}>
          <Sparkline values={hist} w={290} h={56} color={grpColor} fill />
        </div>
        <div style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 9, color: TOKENS.muted,
          display: 'flex', justifyContent: 'space-between',
        }}>
          <span>{histAgg(hist, 'min', 2)}</span>
          <span>{histAgg(hist, 'mean', 2)}</span>
          <span>{histAgg(hist, 'max', 2)}</span>
        </div>
      </div>

      <DetailRow label="범위" value={r.range ? `${r.range[0]} … ${r.range[1]}` : '—'} />
      <DetailRow label="단위" value={r.unit || '—'} />
      <DetailRow label="유형" value={r.kind} />
      <DetailRow label="상태"
        value={r.status === 'active' ? '활성' : r.status === 'reserved' ? '예약' : '미사용'} />
      {r.enums && <DetailRow label="값" value={r.enums.join(' / ')} />}

      <DecoderSection r={r} value={value} grpColor={grpColor} />

      {r.desc && (
        <div style={{
          padding: 10, background: TOKENS.bg,
          border: `1px solid ${TOKENS.border}`,
          fontSize: 11, color: TOKENS.dim, lineHeight: 1.5,
        }}>
          {r.desc}
        </div>
      )}
    </aside>
  );
}

function DetailRow({ label, value }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 11, padding: '4px 0',
      borderBottom: `1px solid ${TOKENS.border}33`,
    }}>
      <span style={{ color: TOKENS.muted }}>{label}</span>
      <span style={{ color: TOKENS.text }}>{value}</span>
    </div>
  );
}

// 비트필드/열거형/packed 의 디코드 결과 패널.
// data-modbus.js 의 MODBUS.decode(r, value) 가 사람이 읽는 분해 결과를 줌.
function DecoderSection({ r, value, grpColor }) {
  if (!window.MODBUS?.decode) return null;
  const parts = window.MODBUS.decode(r, value);
  if (!parts || parts.length === 0) return null;
  return (
    <div style={{
      padding: 10,
      background: TOKENS.bg,
      border: `1px solid ${TOKENS.border}`,
      borderLeft: `2px solid ${grpColor}`,
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 9, color: TOKENS.muted, letterSpacing: 1,
      }}>디코드 · raw = {typeof value === 'number'
          ? `${value} (0x${value.toString(16).toUpperCase()})`
          : String(value)}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {parts.map((p, i) => {
          const isWarn = typeof p.val === 'string' && p.val.includes('⚠');
          const isOn = p.val === 'ON';
          return (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', gap: 8,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10,
              padding: '2px 0',
            }}>
              <span style={{ color: TOKENS.dim, flex: 1 }}>{p.label}</span>
              <span style={{
                color: isWarn ? TOKENS.red : isOn ? grpColor : TOKENS.text,
                fontWeight: isOn || isWarn ? 600 : 400,
                textAlign: 'right',
              }}>{p.val}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function histAgg(arr, kind, d = 1) {
  if (!arr || !arr.length) return '—';
  if (kind === 'min') return 'min ' + fmt(Math.min(...arr), d);
  if (kind === 'max') return 'max ' + fmt(Math.max(...arr), d);
  const s = arr.reduce((a, b) => a + b, 0);
  return 'avg ' + fmt(s / arr.length, d);
}

function FooterBar({ state, tick }) {
  const M = window.MODBUS;
  const items = M.layout?.statusBar?.items || [];
  // 우측 정렬용 split: 첫 번째 'spacer' 가 나오기 전/후로 분리.
  // 명시적 spacer 없으면 절반 지점에서 flex 1 삽입.
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
      {items.map((it, i) => {
        // 'bits' / 'code' 항목은 우측으로 밀어줌 (시각적 그룹핑)
        const pushRight = (it.type === 'bits' || it.type === 'code') &&
                          items.slice(0, i).every(p => p.type !== 'bits' && p.type !== 'code');
        return (
          <React.Fragment key={i}>
            {pushRight && <span style={{ flex: 1 }} />}
            {i > 0 && !pushRight && <span>·</span>}
            <FooterItem item={it} state={state} tick={tick} M={M} />
          </React.Fragment>
        );
      })}
    </div>
  );
}

function FooterItem({ item, state, tick, M }) {
  if (item.type === 'live-tick') {
    return <span>● MODBUS LIVE · {tick} ticks</span>;
  }
  if (item.type === 'literal') {
    return <span>{item.text || ''}</span>;
  }
  if (item.type === 'addrs') {
    const vals = (item.addrs || []).map(a => state[a] ?? '—');
    let display;
    if (item.format === 'a / b' && vals.length === 2) {
      display = `${vals[0]} / ${vals[1]}`;
    } else {
      display = vals.join(' · ');
    }
    return <span>{item.label || ''} {display}</span>;
  }
  if (item.type === 'bits') {
    const v = state[item.addr];
    const width = item.width || 8;
    return <span>{item.label || ''}: 0b{(v || 0).toString(2).padStart(width, '0')}</span>;
  }
  if (item.type === 'code') {
    const v = state[item.addr];
    return <span>{item.label || ''}: {v === 0 ? 'OK' : (v ?? '—')}</span>;
  }
  if (item.type === 'addr') {
    return <span>{item.label || ''}: {displayValue(state, item.addr, M)}</span>;
  }
  return null;
}

// ─── Modbus connection control ─────────────────────────────────────
// 로봇 IP 입력 + 포트 + Connect 버튼. 백엔드 POST /api/modbus/config 로 즉시 재연결.
// 현재 라이브 상태는 MODBUS.subscribeConnection 으로 색/라벨 반영.
function ConnectionBar() {
  const [conn, setConn] = React.useState(() => ({
    state: window.MODBUS?.connection || 'sim',
    meta: window.MODBUS?.meta || {},
  }));
  React.useEffect(() => {
    if (!window.MODBUS?.subscribeConnection) return;
    return window.MODBUS.subscribeConnection((state, meta) => setConn({ state, meta }));
  }, []);

  const [host, setHost] = React.useState(conn.meta?.host || '');
  const [port, setPort] = React.useState(502);
  const [pollHz, setPollHz] = React.useState(4);
  const [submitting, setSubmitting] = React.useState(false);
  const [msg, setMsg] = React.useState(null);

  // 백엔드에서 호스트가 바뀌면 입력값도 따라가게 (사용자가 편집 중이 아닐 때만)
  React.useEffect(() => {
    if (!submitting && conn.meta?.host && conn.meta.host !== host) {
      setHost(conn.meta.host);
    }
  }, [conn.meta?.host]); // eslint-disable-line

  const submit = async () => {
    if (!host.trim()) { setMsg({ kind: 'err', text: 'IP를 입력하세요' }); return; }
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch('/api/modbus/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: host.trim(), port: Number(port) || 502, poll_hz: Number(pollHz) || 4 }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
      setMsg({ kind: 'ok', text: '재연결 요청 보냄 — 상태 표시 확인' });
    } catch (err) {
      setMsg({ kind: 'err', text: `실패: ${err.message || err}` });
    } finally {
      setSubmitting(false);
      setTimeout(() => setMsg(null), 4000);
    }
  };

  const indicatorColor =
    conn.state === 'live' ? TOKENS.green
    : conn.state === 'sim' ? TOKENS.amber
    : conn.state === 'connecting' ? TOKENS.amber
    : TOKENS.red;
  const indicatorLabel =
    conn.state === 'live' ? `LIVE · ${conn.meta?.pollHz || '?'}Hz`
    : conn.state === 'sim' ? 'SIM (백엔드 미연결)'
    : conn.state === 'connecting' ? `CONNECTING…${conn.meta?.error ? ' · ' + conn.meta.error : ''}`
    : `DOWN${conn.meta?.error ? ' · ' + conn.meta.error : ''}`;

  const inputStyle = {
    background: TOKENS.bg,
    border: `1px solid ${TOKENS.border}`,
    color: TOKENS.text,
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 12,
    padding: '6px 10px',
    borderRadius: 2,
    outline: 'none',
  };
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
        }}>MODBUS · {indicatorLabel}</span>
      </div>

      <span style={{ width: 1, height: 20, background: TOKENS.border }} />

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={labelStyle}>로봇 IP</span>
        <input value={host} onChange={(e) => setHost(e.target.value)}
          placeholder="192.168.163.128"
          style={{ ...inputStyle, width: 160 }}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={labelStyle}>포트</span>
        <input value={port} onChange={(e) => setPort(e.target.value)}
          type="number"
          style={{ ...inputStyle, width: 80 }} />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={labelStyle}>폴링 Hz</span>
        <input value={pollHz} onChange={(e) => setPollHz(e.target.value)}
          type="number" step="0.5"
          style={{ ...inputStyle, width: 80 }} />
      </label>

      <button onClick={submit} disabled={submitting}
        style={{
          padding: '8px 18px',
          background: submitting ? TOKENS.border : TOKENS.accent,
          color: '#0a0f1c',
          border: 'none',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 11, fontWeight: 600, letterSpacing: 0.8,
          cursor: submitting ? 'wait' : 'pointer',
          borderRadius: 2,
          marginTop: 14,
        }}>
        {submitting ? 'CONNECTING…' : 'CONNECT'}
      </button>

      {msg && (
        <span style={{
          marginTop: 14,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10,
          color: msg.kind === 'ok' ? TOKENS.green : TOKENS.red,
        }}>{msg.text}</span>
      )}

      <span style={{ flex: 1 }} />
      <span style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 9, color: TOKENS.muted,
        maxWidth: 240, textAlign: 'right',
      }}>
        이 IP 는 Modbus + RTDE 양쪽에 동시 적용. 재기동 후엔 app_config.py 기본값으로 돌아감.
      </span>
    </div>
  );
}

window.ScreenMonitoring = ScreenMonitoring;
