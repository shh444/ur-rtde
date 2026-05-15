// Right sub-panel for VariantTracksFinal:
//   - @ cursor readout (current time + pinned RTDE values, optional)
//   - Modbus mini-tracks (selected channels as compact sparkline rows)
//   - Messages list (filterable log feed)

function RightSubPanel({
  hover, view,
  mbChannels, pinnedMb, togglePinMb, colorForMb,
  logs, logFilter, setLogFilter,
  selectedLog, setSelectedLog,
  onCollapse,
}) {
  const T = window.TRACKS;
  const H = window.TRACK_HELPERS;
  const [tA, tB] = view;

  const filteredLogs = logs.filter(l => logFilter[l.level]);
  const visibleLogs = filteredLogs.filter(l => l.t >= tA && l.t <= tB);

  // Find log nearest to current hover for "now" indicator in the list
  const nearestLogIdx = React.useMemo(() => {
    if (hover == null) return -1;
    let bestIdx = -1, bestDt = Infinity;
    filteredLogs.forEach((l, i) => {
      const dt = Math.abs(l.t - hover);
      if (dt < bestDt) { bestDt = dt; bestIdx = i; }
    });
    return bestIdx;
  }, [hover, filteredLogs]);

  return (
    <aside style={{
      background: TOKENS.panel,
      // grid → flex 로 변경. grid 의 auto-row 에 maxHeight:50% 가 안 먹혀서
      // Modbus 가 자기 컨텐트 크기만큼 부풀어 Messages 영역을 압박하던 문제 수정.
      // 이제 ModbusSubSection 자체에서 flex/maxHeight 로 명시 제한, Messages 는 1fr.
      display: 'flex', flexDirection: 'column',
      minHeight: 0, minWidth: 0,
    }}>
      {/* @ cursor + collapse button */}
      <div style={{
        flex: '0 0 auto',
        padding: '12px 14px',
        borderBottom: `1px solid ${TOKENS.border}`,
        display: 'flex', alignItems: 'baseline', gap: 8,
      }}>
        {onCollapse && (
          <button onClick={onCollapse}
            title="접기"
            style={{
              alignSelf: 'center',
              padding: '3px 6px',
              background: 'transparent',
              color: TOKENS.dim,
              border: `1px solid ${TOKENS.border}`,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10,
              cursor: 'pointer',
              borderRadius: 2,
            }}>›</button>
        )}
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10, color: TOKENS.dim, letterSpacing: 1.2,
        }}>@ CURSOR</span>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 22, color: hover == null ? TOKENS.muted : TOKENS.accent,
          fontWeight: 500, letterSpacing: -0.5,
        }}>{hover == null ? '—' : fmtT(hover)}</span>
      </div>

      {/* Modbus mini-tracks */}
      <ModbusSubSection
        hover={hover} view={view}
        mbChannels={mbChannels} pinnedMb={pinnedMb}
        togglePinMb={togglePinMb} colorForMb={colorForMb}
      />

      {/* Messages */}
      <MessagesSection
        logs={filteredLogs}
        visibleCount={visibleLogs.length}
        logFilter={logFilter} setLogFilter={setLogFilter}
        selectedLog={selectedLog} setSelectedLog={setSelectedLog}
        nearestLogIdx={nearestLogIdx}
      />
    </aside>
  );
}

function ModbusSubSection({ hover, view, mbChannels, pinnedMb, togglePinMb, colorForMb }) {
  const T = window.TRACKS;
  const H = window.TRACK_HELPERS;
  const [showPicker, setShowPicker] = React.useState(false);
  const [pickerSearch, setPickerSearch] = React.useState('');
  const allMbCols = Array.isArray(T?.modbus?.cols) ? T.modbus.cols : [];
  const filteredMbCols = pickerSearch
    ? allMbCols.filter(c =>
        c.toLowerCase().includes(pickerSearch.toLowerCase())
        || (T?.modbus?.koLabels?.[c] || '').includes(pickerSearch))
    : allMbCols;

  return (
    <div style={{
      borderBottom: `1px solid ${TOKENS.border}`,
      display: 'flex', flexDirection: 'column',
      // flex 부모(RightSubPanel) 안에서 자기 자신은 컨텐트 크기만큼만 차지하되
      // 절대 패널 절반을 넘지 않도록 px maxHeight. 내부 리스트는 자체 overflow:auto.
      flex: '0 1 auto',
      minHeight: 0,
      maxHeight: 320,
    }}>
      <div style={{
        padding: '10px 14px 8px',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{
          width: 6, height: 6, background: H.SRC_COLORS.modbus[0], borderRadius: 1,
        }} />
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10, letterSpacing: 1.2,
          color: H.SRC_COLORS.modbus[0], fontWeight: 600,
        }}>MODBUS</span>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 9, color: TOKENS.muted,
        }}>{T.modbus?.hz ? `${T.modbus.hz}Hz` : '—'} · {pinnedMb.length}/6</span>
        <span style={{ flex: 1 }} />
        <button onClick={() => setShowPicker(s => !s)}
          style={{
            padding: '2px 8px',
            background: showPicker ? H.SRC_COLORS.modbus[0] : 'transparent',
            color: showPicker ? '#0a0f1c' : H.SRC_COLORS.modbus[0],
            border: `1px solid ${H.SRC_COLORS.modbus[0]}55`,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 9, letterSpacing: 0.5, fontWeight: 600,
            cursor: 'pointer', borderRadius: 2,
          }}>+ 추가</button>
      </div>

      {showPicker && (
        <div style={{
          borderBottom: `1px solid ${TOKENS.border}`,
          background: TOKENS.panel2,
          display: 'flex', flexDirection: 'column',
          minHeight: 0,
        }}>
          <div style={{ padding: '6px 10px 4px' }}>
            <input
              autoFocus
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              placeholder={`이름 검색 (전체 ${allMbCols.length})`}
              style={{
                width: '100%',
                background: TOKENS.bg,
                border: `1px solid ${TOKENS.border}`,
                color: TOKENS.text,
                padding: '4px 8px',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10, outline: 'none', borderRadius: 2,
                boxSizing: 'border-box',
              }} />
          </div>
          <div style={{
            maxHeight: 200, overflowY: 'auto',
            padding: '0 4px 8px',
          }}>
            {filteredMbCols.length === 0 && (
              <div style={{
                padding: 12, textAlign: 'center',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10, color: TOKENS.muted,
              }}>일치 없음</div>
            )}
            {filteredMbCols.map(c => {
              const on = pinnedMb.includes(c);
              const color = on ? colorForMb(c) : H.SRC_COLORS.modbus[0];
              const label = T?.modbus?.koLabels?.[c];
              const unit = T?.modbus?.units?.[c];
              return (
                <div key={c}
                  onClick={() => togglePinMb(c)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '4px 8px',
                    cursor: 'pointer',
                    background: on ? color + '22' : 'transparent',
                    borderLeft: `2px solid ${on ? color : 'transparent'}`,
                    fontFamily: 'JetBrains Mono, monospace',
                  }}>
                  <span style={{
                    width: 10, height: 10, borderRadius: 2,
                    border: `1px solid ${on ? color : TOKENS.border}`,
                    background: on ? color : 'transparent',
                    flex: '0 0 auto',
                  }} />
                  <span style={{
                    fontSize: 10, color: on ? TOKENS.text : TOKENS.dim,
                    flex: 1, minWidth: 0,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{c}</span>
                  {(label || unit) && (
                    <span style={{
                      fontSize: 9, color: TOKENS.muted,
                      whiteSpace: 'nowrap',
                    }}>{label || ''}{unit ? ` · ${unit}` : ''}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px 8px' }}>
        {mbChannels.length === 0 && (
          <div style={{
            padding: 16, textAlign: 'center',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10, color: TOKENS.muted,
          }}>
            모드버스 채널이 선택되지 않음<br />
            ⤴ 위 + 추가 버튼으로 선택
          </div>
        )}
        {mbChannels.map(ch => (
          <MiniMbTrack key={ch.col} ch={ch} hover={hover} view={view}
            onRemove={() => togglePinMb(ch.col)} />
        ))}
      </div>
    </div>
  );
}

function MiniMbTrack({ ch, hover, view, onRemove }) {
  const T = window.TRACKS;
  const H = window.TRACK_HELPERS;
  const src = T?.modbus;
  const [tA, tB] = view;

  const [ref, size] = H.useSize();
  // 트랙 더 크게 + 좌측에 min/max 텍스트 공간 확보
  const w = size.w, h = 76;
  const padL = 36, padR = 8, padT = 18, padB = 6;
  const plotW = Math.max(0, w - padL - padR);
  const plotH = Math.max(0, h - padT - padB);

  // 가드: 실데이터에 이 컬럼이 없거나 시간축이 없으면 빈 라인만 그림
  const hasData = src && Array.isArray(src.t) && Array.isArray(src.samples?.[ch.col]);
  const iA = hasData ? H.nearestIdx(tA, src.t) : 0;
  const iB = hasData ? H.nearestIdx(tB, src.t) : 0;
  // 실제 값 범위 — 컬럼이 평탄해도 (vmin==vmax) Y 축 0.5 씩 늘려 라인이 가운데로 가게.
  let [vmin, vmax] = (hasData && src.ranges?.[ch.col]) ? src.ranges[ch.col] : [0, 1];
  const flat = vmin === vmax;
  if (flat) { vmin -= 0.5; vmax += 0.5; }
  const pad = (vmax - vmin) * 0.1 || 0.5;
  const yLow = vmin - pad, yHigh = vmax + pad;

  const d = !hasData ? ''
    : (ch.mode === 'step')
      ? H.trackStepPath(src.samples[ch.col], src.t, iA, iB, tA, tB, padL, padT, plotW, plotH, yLow, yHigh)
      : H.trackPath(    src.samples[ch.col], src.t, iA, iB, tA, tB, padL, padT, plotW, plotH, yLow, yHigh);

  // area fill — line 아래를 옅게 칠해서 평탄한 값도 한눈에 띄게
  const areaD = d ? d + ` L ${(padL + plotW).toFixed(2)} ${(padT + plotH).toFixed(2)} L ${padL.toFixed(2)} ${(padT + plotH).toFixed(2)} Z` : '';

  const hoverIdx = (hover == null || !hasData) ? null : H.nearestIdx(hover, src.t);
  const hoverV = hoverIdx == null ? null : src.samples[ch.col][hoverIdx];
  const unit = src?.units?.[ch.col];

  // Latest visible value (most recent sample in view)
  const latestV = hasData ? src.samples[ch.col][iB] : null;

  // 좌측에 표시할 min/max 텍스트 (원래 범위)
  const rawRange = (hasData && src.ranges?.[ch.col]) ? src.ranges[ch.col] : [0, 1];
  const fmtMini = (v) => {
    if (typeof v !== 'number' || !isFinite(v)) return '—';
    if (Math.abs(v) >= 100) return v.toFixed(0);
    if (Math.abs(v) >= 10) return v.toFixed(1);
    return v.toFixed(2);
  };

  return (
    <div ref={ref} style={{
      background: TOKENS.bg,
      borderTop: `1px solid ${TOKENS.border}`,
      borderRight: `1px solid ${TOKENS.border}`,
      borderBottom: `1px solid ${TOKENS.border}`,
      borderLeft: `2px solid ${ch.color}`,
      marginBottom: 4,
      position: 'relative',
      // 사이드바 토글 직후 stale SVG width 가 컨테이너 초과해 이웃 영역 침범 방지
      overflow: 'hidden', boxSizing: 'border-box',
    }}>
      <svg width="100%" height={h} style={{ display: 'block' }}>
        {/* plot bg + frame — 평탄한 라인도 영역이 인식되게 */}
        <rect x={padL} y={padT} width={plotW} height={plotH}
          fill={TOKENS.panel2} opacity={0.5} />
        {/* midline guide */}
        <line x1={padL} y1={padT + plotH / 2} x2={padL + plotW} y2={padT + plotH / 2}
          stroke={TOKENS.border} strokeWidth={0.5} strokeDasharray="2 3" opacity={0.5} />
        {/* min/max 라벨 (raw range) — 좌측 작게 */}
        {hasData && (
          <g style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            <text x={padL - 4} y={padT + 8} fill={TOKENS.muted}
              fontSize={8} textAnchor="end">{fmtMini(rawRange[1])}</text>
            <text x={padL - 4} y={padT + plotH} fill={TOKENS.muted}
              fontSize={8} textAnchor="end">{fmtMini(rawRange[0])}</text>
          </g>
        )}
        {/* area under line */}
        {areaD && <path d={areaD} fill={ch.color} opacity={0.18} />}
        {/* main line */}
        <path d={d} fill="none" stroke={ch.color} strokeWidth={1.6} opacity={1} />
        {/* 평탄한 컬럼 — 가운데에 점선 + 'CONST' 라벨로 무엇이 일어나는지 표시 */}
        {flat && hasData && (
          <text x={padL + plotW / 2} y={padT + plotH / 2 - 4} fill={TOKENS.muted}
            fontSize={9} textAnchor="middle"
            style={{ fontFamily: 'JetBrains Mono, monospace', letterSpacing: 0.6 }}>
            CONST · {fmtMini(rawRange[0])}
          </text>
        )}
        {hover != null && hover >= tA && hover <= tB && (() => {
          const xH = H.tToX(hover, tA, tB, padL, plotW);
          const showDot = hoverV != null && typeof hoverV === 'number' && isFinite(hoverV);
          const yH = showDot ? padT + plotH - ((hoverV - yLow) / (yHigh - yLow)) * plotH : 0;
          const labelOnLeft = xH > padL + plotW * 0.7;
          const labelX = labelOnLeft ? xH - 6 : xH + 6;
          const labelAnchor = labelOnLeft ? 'end' : 'start';
          return (
            <>
              <line x1={xH} x2={xH} y1={padT} y2={padT + plotH}
                stroke={TOKENS.text} strokeWidth={0.6} opacity={0.5} />
              {showDot && (
                <>
                  <circle cx={xH} cy={yH} r={3}
                    fill={ch.color} stroke="#0a0f1c" strokeWidth={1.2} />
                  <text x={labelX} y={yH - 5}
                    fill={ch.color} fontSize={10} fontWeight={600}
                    textAnchor={labelAnchor}
                    style={{
                      fontFamily: 'JetBrains Mono, monospace',
                      paintOrder: 'stroke',
                      stroke: '#0a0f1c', strokeWidth: 3, strokeLinejoin: 'round',
                    }}>
                    {Math.abs(hoverV) >= 100 ? hoverV.toFixed(1) : hoverV.toFixed(2)}
                  </text>
                </>
              )}
            </>
          );
        })()}
      </svg>

      {/* Overlay */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        padding: '4px 8px',
        display: 'flex', alignItems: 'center', gap: 6,
        pointerEvents: 'none',
      }}>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10, color: TOKENS.text,
        }}>{ch.col}</span>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 9, color: TOKENS.muted,
        }}>{T?.modbus?.koLabels?.[ch.col] || ''}</span>
        <span style={{ flex: 1 }} />
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 12, color: ch.color, fontWeight: 500,
        }}>
          {(() => {
            const v = hoverV ?? latestV;
            if (typeof v === 'number' && isFinite(v)) return v.toFixed(2);
            if (v == null) return '—';
            return String(v);
          })()}
        </span>
        {unit && (
          <span style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 9, color: TOKENS.muted,
          }}>{unit}</span>
        )}
        <button onClick={onRemove}
          style={{
            background: 'transparent', border: 'none',
            color: TOKENS.muted, cursor: 'pointer',
            fontSize: 11, pointerEvents: 'auto',
            padding: '0 2px',
          }}>×</button>
      </div>
    </div>
  );
}

function MessagesSection({
  logs, visibleCount, logFilter, setLogFilter,
  selectedLog, setSelectedLog, nearestLogIdx,
}) {
  const H = window.TRACK_HELPERS;
  const LEVELS = ['error', 'warn', 'info', 'debug', 'sys'];
  const listRef = React.useRef(null);

  // Scroll to selected/nearest
  React.useEffect(() => {
    if (nearestLogIdx < 0 || !listRef.current) return;
    const el = listRef.current.children[nearestLogIdx];
    if (el && el.scrollIntoView) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [nearestLogIdx]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      // flex parent (RightSubPanel) 에서 남은 공간을 차지하고 최소 140 보장.
      flex: '1 1 0',
      minHeight: 140,
      overflow: 'hidden',
    }}>
      <div style={{
        flex: '0 0 auto',
        padding: '10px 14px 8px',
        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
      }}>
        <span style={{
          width: 6, height: 6, background: TOKENS.violet, borderRadius: 1,
        }} />
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10, letterSpacing: 1.2,
          color: TOKENS.violet, fontWeight: 600,
        }}>MESSAGES</span>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 9, color: TOKENS.muted,
        }}>{visibleCount} 표시 / {logs.length} 전체</span>
      </div>

      <div style={{
        padding: '0 12px 8px',
        display: 'flex', flexWrap: 'wrap', gap: 4,
      }}>
        {LEVELS.map(lv => {
          const c = H.LOG_COLORS[lv];
          const count = logs.filter(l => l.level === lv).length
            + (logFilter[lv] ? 0 : window.TRACKS.logs.filter(l => l.level === lv).length - logs.filter(l => l.level === lv).length);
          const totalForLevel = window.TRACKS.logs.filter(l => l.level === lv).length;
          return (
            <Chip key={lv} color={c} active={logFilter[lv]}
              onClick={() => setLogFilter({ ...logFilter, [lv]: !logFilter[lv] })}>
              {lv} {totalForLevel}
            </Chip>
          );
        })}
      </div>

      <div ref={listRef} style={{
        flex: 1, overflowY: 'auto', minHeight: 0,
      }}>
        {logs.map((log, i) => {
          const c = H.LOG_COLORS[log.level];
          const isSelected = selectedLog?.id === log.id;
          const isNearest = i === nearestLogIdx;
          return (
            <div key={log.id}
              onClick={() => setSelectedLog(log)}
              style={{
                padding: '7px 14px',
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: 2,
                background: isSelected ? c + '15' : isNearest ? TOKENS.bg : 'transparent',
                borderLeft: isSelected ? `2px solid ${c}`
                          : isNearest ? `2px solid ${TOKENS.dim}`
                          : `2px solid transparent`,
                borderBottom: `1px solid ${TOKENS.border}33`,
              }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontFamily: 'JetBrains Mono, monospace', fontSize: 9,
              }}>
                <span style={{
                  padding: '0 4px', background: c, color: '#0a0f1c',
                  fontWeight: 700, letterSpacing: 0.5, borderRadius: 1,
                }}>{log.level.toUpperCase()}</span>
                <span style={{ color: TOKENS.dim }}>{fmtT(log.t)}</span>
                <span style={{ color: TOKENS.muted }}>· {log.source}</span>
              </div>
              <div style={{
                fontSize: 10, color: TOKENS.text, lineHeight: 1.4,
                paddingLeft: 4,
                fontFamily: 'Pretendard, sans-serif',
              }}>{log.msg}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Collapsed right panel ────────────────────────────────────────────
// 좌측 CollapsedChannelSidebar 의 대응체 — 36px strip 에 핀된 modbus 색 스트라이프
// + 로그 레벨별 카운트(error/warn 강조). 클릭하면 펼침.
function CollapsedRightPanel({ pinnedMb, colorForMb, logs, logFilter, onExpand }) {
  const T = window.TRACKS;
  const errCount = (logs || []).filter(l => l.level === 'error').length;
  const warnCount = (logs || []).filter(l => l.level === 'warn').length;
  return (
    <aside
      onClick={onExpand}
      title="펼치기"
      style={{
        background: TOKENS.panel,
        borderLeft: `1px solid ${TOKENS.border}`,
        cursor: 'pointer',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', padding: '12px 0', gap: 8,
        minHeight: 0,
      }}>
      <span style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10, color: TOKENS.dim, letterSpacing: 0.5,
        writingMode: 'vertical-rl', transform: 'rotate(180deg)',
      }}>◂ MBUS · LOG</span>

      {/* 핀된 modbus 채널 색 스트라이프 */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 4,
        alignItems: 'center', marginTop: 8,
      }}>
        {(pinnedMb || []).map(c => (
          <span key={c} title={c}
            style={{
              width: 16, height: 3,
              background: colorForMb ? colorForMb(c) : TOKENS.cyan,
              borderRadius: 1,
            }} />
        ))}
      </div>
      <div style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 9, color: TOKENS.muted,
      }}>{(pinnedMb || []).length}</div>

      <div style={{ width: 20, height: 1, background: TOKENS.border, margin: '4px 0' }} />

      {/* 로그 레벨 카운트 — error 가 0 보다 크면 빨간 강조 */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 4,
        alignItems: 'center',
        fontFamily: 'JetBrains Mono, monospace', fontSize: 9,
      }}>
        <span style={{
          color: errCount > 0 ? TOKENS.red : TOKENS.muted,
          fontWeight: errCount > 0 ? 700 : 400,
        }} title={`error ${errCount}`}>E{errCount}</span>
        <span style={{
          color: warnCount > 0 ? TOKENS.amber : TOKENS.muted,
          fontWeight: warnCount > 0 ? 600 : 400,
        }} title={`warn ${warnCount}`}>W{warnCount}</span>
      </div>
    </aside>
  );
}

window.RightSubPanel = RightSubPanel;
window.MiniMbTrack = MiniMbTrack;
window.CollapsedRightPanel = CollapsedRightPanel;
