// Screen: 레코딩 관리 (RTDE)
// New/active recording controls + library of past recordings (file/DB).

function ScreenRecordings({ library, session, startRecording, stopRecording, importRecording, loadRecordingFromPath, openInAnalysis, activeRecId }) {
  const [source, setSource] = React.useState('all'); // all | file | db
  const [q, setQ] = React.useState('');
  const [showNewDialog, setShowNewDialog] = React.useState(false);
  const [showImportDialog, setShowImportDialog] = React.useState(false);
  const [showPathDialog, setShowPathDialog] = React.useState(false);

  const filtered = library.filter(r => {
    if (source !== 'all' && r.source !== source) return false;
    if (q) {
      const s = q.toLowerCase();
      const fn = (r.filename || r.name || '').toLowerCase();
      const nm = (r.name || '').toLowerCase();
      const block = (r.block || '').toLowerCase();
      if (!fn.includes(s) && !nm.includes(s) && !block.includes(s)) return false;
    }
    return true;
  });

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      minHeight: 0, background: TOKENS.bg,
      overflowY: 'auto',
    }}>
      {/* If recording: massive recording panel */}
      {session ? (
        <ActiveRecordingPanel session={session} stopRecording={stopRecording} />
      ) : (
        <NewRecordingPanel
          onStart={() => setShowNewDialog(true)}
          onImport={() => setShowImportDialog(true)}
          onLoadPath={() => setShowPathDialog(true)} />
      )}

      {/* Library */}
      <div style={{
        padding: '20px 24px 8px',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <h2 style={{
          margin: 0, fontSize: 13, color: TOKENS.text,
          fontFamily: 'JetBrains Mono, monospace', letterSpacing: 1, fontWeight: 500,
        }}>
          레코딩 라이브러리
        </h2>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10, color: TOKENS.dim,
        }}>· {library.length} 항목 · 62.3GB / 180GB 사용중</span>
        <span style={{ flex: 1 }} />
        <div style={{ display: 'inline-flex', gap: 1, background: TOKENS.border, padding: 1, borderRadius: 2 }}>
          {[
            ['all', '전체', library.length],
            ['file', '파일 시스템', library.filter(r => r.source==='file').length],
            ['db', '데이터베이스', library.filter(r => r.source==='db').length],
          ].map(([k, label, count]) => (
            <button key={k} onClick={() => setSource(k)}
              style={{
                padding: '5px 12px',
                background: source === k ? TOKENS.bg : TOKENS.panel2,
                color: source === k ? TOKENS.accent : TOKENS.dim,
                border: 'none',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10, letterSpacing: 0.5,
                cursor: 'pointer',
                borderRadius: 1,
              }}>
              {label} <span style={{ color: TOKENS.muted, marginLeft: 4 }}>{count}</span>
            </button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="블록 / 작업자 / 파일명"
          style={{
            background: TOKENS.panel, border: `1px solid ${TOKENS.border}`,
            color: TOKENS.text, fontFamily: 'JetBrains Mono, monospace',
            fontSize: 11, padding: '5px 10px', borderRadius: 2, outline: 'none',
            width: 220,
          }} />
      </div>

      <div style={{ padding: '0 24px 24px' }}>
        <RecordingTable
          rows={filtered}
          activeRecId={activeRecId}
          onOpen={openInAnalysis} />
      </div>

      {showNewDialog && (
        <NewRecordingDialog
          onClose={() => setShowNewDialog(false)}
          onConfirm={(meta) => {
            startRecording(meta);
            setShowNewDialog(false);
          }} />
      )}

      {showImportDialog && (
        <ImportRecordingDialog
          onClose={() => setShowImportDialog(false)}
          onImport={async (payload) => {
            const result = await importRecording(payload);
            setShowImportDialog(false);
            return result;
          }} />
      )}

      {showPathDialog && (
        <BrowseCsvDialog
          onClose={() => setShowPathDialog(false)}
          onLoad={async (payload) => {
            const result = await loadRecordingFromPath(payload);
            setShowPathDialog(false);
            return result;
          }} />
      )}
    </div>
  );
}

// csvs/ 폴더의 CSV 목록을 가져와 사용자가 선택. 보안 환경에서 외부 도구로 미리
// 폴더에 떨궈둔 파일을 import. 백엔드는 기존 /load-path 로 처리 (csvs/<filename>).
function BrowseCsvDialog({ onClose, onLoad }) {
  const [list, setList] = React.useState([]);
  const [dir, setDir] = React.useState('');
  const [listError, setListError] = React.useState(null);
  const [loadingList, setLoadingList] = React.useState(true);

  const [selected, setSelected] = React.useState(null); // filename
  const [name, setName] = React.useState('');
  const [cell, setCell] = React.useState('');
  const [weldOn, setWeldOn] = React.useState('불명');
  const [note, setNote] = React.useState('');
  const [copy, setCopy] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);

  const refreshList = React.useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const res = await fetch('/api/recordings/csvs/list');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setList(json.items || []);
      setDir(json.dir || '');
    } catch (err) {
      setListError(err.message || String(err));
    } finally {
      setLoadingList(false);
    }
  }, []);

  React.useEffect(() => { refreshList(); }, [refreshList]);

  const pick = (filename) => {
    setSelected(filename);
    setError(null);
    if (!name) {
      setName(filename.replace(/\.csv$/i, ''));
    }
  };

  const submit = async () => {
    if (!selected) { setError('CSV 파일을 선택해주세요'); return; }
    setBusy(true);
    setError(null);
    try {
      // csvs/<filename> 상대 경로로 백엔드 load-path 호출 (프로젝트 루트 기준 해석됨)
      await onLoad({
        path: `csvs/${selected}`,
        name, cell, weld_on: weldOn, note, copy,
      });
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100,
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          width: 680, maxHeight: '90vh',
          background: TOKENS.panel,
          border: `1px solid ${TOKENS.border}`,
          borderTop: `2px solid ${TOKENS.amber}`,
          padding: 24,
          display: 'flex', flexDirection: 'column', gap: 14,
          overflow: 'hidden',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10, color: TOKENS.amber, letterSpacing: 1.4, fontWeight: 600,
          }}>BROWSE csvs/</span>
          <span style={{ flex: 1 }} />
          <button onClick={refreshList} title="목록 새로고침"
            style={{
              background: 'transparent', border: `1px solid ${TOKENS.border}`,
              color: TOKENS.dim, cursor: 'pointer',
              fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
              padding: '4px 10px', borderRadius: 2,
            }}>↻ 새로고침</button>
          <button onClick={onClose}
            style={{
              background: 'transparent', border: 'none',
              color: TOKENS.dim, cursor: 'pointer', fontSize: 18,
            }}>×</button>
        </div>
        <div style={{ fontSize: 16, color: TOKENS.text, fontWeight: 500 }}>
          csvs/ 폴더에서 CSV 선택
        </div>

        <div style={{
          padding: 10,
          background: TOKENS.bg,
          border: `1px solid ${TOKENS.border}`,
          borderLeft: `2px solid ${TOKENS.amber}`,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10, color: TOKENS.dim, lineHeight: 1.6,
        }}>
          <div style={{ color: TOKENS.text, marginBottom: 2 }}>{dir || 'csvs/'}</div>
          외부 도구로 이 폴더에 CSV 떨궈둔 후 여기서 선택. 브라우저 업로드가 막힌 환경용.
        </div>

        {/* 파일 목록 */}
        <div style={{
          flex: '1 1 auto',
          minHeight: 100, maxHeight: 240,
          overflowY: 'auto',
          border: `1px solid ${TOKENS.border}`,
          background: TOKENS.bg,
        }}>
          {loadingList ? (
            <div style={{
              padding: 24, textAlign: 'center',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 11, color: TOKENS.muted,
            }}>로딩 중…</div>
          ) : listError ? (
            <div style={{
              padding: 24,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 11, color: TOKENS.red,
            }}>목록 로드 실패: {listError}</div>
          ) : list.length === 0 ? (
            <div style={{
              padding: 24, textAlign: 'center',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 11, color: TOKENS.muted,
            }}>
              csvs/ 폴더가 비어있어요.
              <br/><br/>
              <span style={{ color: TOKENS.dim, fontSize: 10 }}>
                외부 도구로 .csv 파일을 이 폴더에 넣은 뒤 ↻ 새로고침을 눌러보세요.
              </span>
            </div>
          ) : (
            list.map(f => {
              const on = selected === f.filename;
              return (
                <button key={f.filename}
                  onClick={() => pick(f.filename)}
                  style={{
                    width: '100%', textAlign: 'left',
                    padding: '10px 14px',
                    background: on ? TOKENS.amber + '15' : 'transparent',
                    border: 'none',
                    borderLeft: on ? `2px solid ${TOKENS.amber}` : `2px solid transparent`,
                    borderBottom: `1px solid ${TOKENS.border}33`,
                    color: TOKENS.text,
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 11,
                    cursor: 'pointer',
                    display: 'grid',
                    gridTemplateColumns: '20px 1fr 80px 130px',
                    gap: 10, alignItems: 'center',
                  }}>
                  <span style={{ color: on ? TOKENS.amber : TOKENS.muted }}>{on ? '●' : '○'}</span>
                  <span style={{
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{f.filename}</span>
                  <span style={{ color: TOKENS.dim, textAlign: 'right' }}>{f.size}</span>
                  <span style={{ color: TOKENS.muted, fontSize: 10, textAlign: 'right' }}>{f.mtime}</span>
                </button>
              );
            })
          )}
        </div>

        {selected && (
          <>
            <DialogField label="NAME (파일명에 반영)" value={name} onChange={setName} mono
              placeholder="비우면 원본 파일명에서 자동 추출" />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <DialogField label="셀" value={cell} onChange={setCell} mono />
              <DialogSelect label="실제 용접 여부" value={weldOn} onChange={setWeldOn}
                options={['예', '아니오', '불명']} />
            </div>

            <DialogTextArea label="메모" value={note} onChange={setNote}
              placeholder="이 레코딩의 출처·조건·관찰사항을 적어두세요." />

            <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
              <label style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 11, color: TOKENS.dim, cursor: 'pointer',
              }}>
                <input type="radio" name="copyMode" checked={copy}
                  onChange={() => setCopy(true)}
                  style={{ accentColor: TOKENS.amber }} />
                <span>복사 (원본 유지)</span>
              </label>
              <label style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 11, color: TOKENS.dim, cursor: 'pointer',
              }}>
                <input type="radio" name="copyMode" checked={!copy}
                  onChange={() => setCopy(false)}
                  style={{ accentColor: TOKENS.red }} />
                <span>이동 (원본 삭제)</span>
              </label>
            </div>
          </>
        )}

        {error && (
          <div style={{
            padding: '8px 10px',
            background: TOKENS.red + '15',
            border: `1px solid ${TOKENS.red}55`,
            color: TOKENS.red,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10,
            whiteSpace: 'pre-wrap',
          }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={busy} style={btnSecondary}>취소</button>
          <button onClick={submit} disabled={busy || !selected}
            style={{
              ...btnPrimary,
              background: (busy || !selected) ? TOKENS.border : TOKENS.amber,
              cursor: (busy || !selected) ? 'not-allowed' : 'pointer',
            }}>
            {busy ? '읽는 중…' : '📁 불러오기'}
          </button>
        </div>
      </div>
    </div>
  );
}

// CSV 파일 선택 + 메타데이터 입력 후 백엔드 업로드.
// 업로드 성공 시 라이브러리 자동 새로고침.
function ImportRecordingDialog({ onClose, onImport }) {
  const [file, setFile] = React.useState(null);
  const [name, setName] = React.useState('');
  const [cell, setCell] = React.useState('');
  const [weldOn, setWeldOn] = React.useState('불명');
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const inputRef = React.useRef(null);

  const onPickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setError(null);
    // 파일명이 비어있으면 파일명에서 자동 추출 (확장자 제외)
    if (!name) {
      const stem = f.name.replace(/\.csv$/i, '');
      setName(stem);
    }
  };

  const submit = async () => {
    if (!file) { setError('CSV 파일을 선택해주세요'); return; }
    setBusy(true);
    setError(null);
    try {
      await onImport({ file, name, cell, weld_on: weldOn, note });
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const fileSize = file ? `${(file.size / 1024).toFixed(1)} KB` : null;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100,
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          width: 560,
          background: TOKENS.panel,
          border: `1px solid ${TOKENS.border}`,
          borderTop: `2px solid ${TOKENS.cyan}`,
          padding: 24,
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10, color: TOKENS.cyan, letterSpacing: 1.4, fontWeight: 600,
          }}>IMPORT CSV</span>
          <span style={{ flex: 1 }} />
          <button onClick={onClose}
            style={{
              background: 'transparent', border: 'none',
              color: TOKENS.dim, cursor: 'pointer', fontSize: 18,
            }}>×</button>
        </div>
        <div style={{ fontSize: 16, color: TOKENS.text, fontWeight: 500 }}>
          기존 CSV 레코딩 가져오기
        </div>

        {/* 파일 드롭/선택 */}
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); }}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f && f.name.toLowerCase().endsWith('.csv')) {
              setFile(f);
              setError(null);
              if (!name) setName(f.name.replace(/\.csv$/i, ''));
            } else {
              setError('CSV 파일만 가능합니다');
            }
          }}
          style={{
            padding: 24,
            border: `2px dashed ${file ? TOKENS.cyan : TOKENS.border}`,
            background: file ? TOKENS.cyan + '08' : TOKENS.bg,
            borderRadius: 2,
            cursor: 'pointer',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 8,
            fontFamily: 'JetBrains Mono, monospace',
          }}>
          <input ref={inputRef} type="file" accept=".csv"
            onChange={onPickFile} style={{ display: 'none' }} />
          {file ? (
            <>
              <div style={{ fontSize: 24, color: TOKENS.cyan }}>📄</div>
              <div style={{ fontSize: 12, color: TOKENS.text }}>{file.name}</div>
              <div style={{ fontSize: 10, color: TOKENS.dim }}>{fileSize}</div>
              <div style={{ fontSize: 9, color: TOKENS.muted }}>클릭해서 다른 파일 선택</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 28, color: TOKENS.muted }}>⬆</div>
              <div style={{ fontSize: 12, color: TOKENS.text }}>CSV 파일을 끌어다 놓거나 클릭해서 선택</div>
              <div style={{ fontSize: 10, color: TOKENS.dim }}>.csv 파일만 허용</div>
            </>
          )}
        </div>

        <DialogField label="NAME (파일명에 반영)" value={name} onChange={setName} mono
          placeholder="예: BlockA-VL2-test (비우면 자동)" />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <DialogField label="셀" value={cell} onChange={setCell} mono />
          <DialogSelect label="실제 용접 여부" value={weldOn} onChange={setWeldOn}
            options={['예', '아니오', '불명']} />
        </div>

        <DialogTextArea label="메모" value={note} onChange={setNote}
          placeholder="이 레코딩의 출처·조건·관찰사항을 적어두세요." />

        {error && (
          <div style={{
            padding: '8px 10px',
            background: TOKENS.red + '15',
            border: `1px solid ${TOKENS.red}55`,
            color: TOKENS.red,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10,
          }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={busy} style={btnSecondary}>취소</button>
          <button onClick={submit} disabled={busy || !file}
            style={{
              ...btnPrimary,
              background: (busy || !file) ? TOKENS.border : TOKENS.cyan,
              cursor: (busy || !file) ? 'not-allowed' : 'pointer',
            }}>
            {busy ? '업로드 중…' : '📥 가져오기'}
          </button>
        </div>
      </div>
    </div>
  );
}

function NewRecordingPanel({ onStart, onImport, onLoadPath }) {
  return (
    <div style={{
      margin: 24,
      padding: 24,
      background: TOKENS.panel,
      border: `1px solid ${TOKENS.border}`,
      display: 'grid',
      gridTemplateColumns: 'auto 1fr auto',
      gap: 24,
      alignItems: 'center',
    }}>
      <div style={{
        width: 80, height: 80,
        border: `2px solid ${TOKENS.accent}`,
        borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: TOKENS.accent,
      }}>
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="6" fill="currentColor" />
        </svg>
      </div>
      <div>
        <div style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10, color: TOKENS.dim, letterSpacing: 1.2,
        }}>NEW RECORDING</div>
        <div style={{ fontSize: 20, color: TOKENS.text, fontWeight: 500, marginTop: 4 }}>
          RTDE 레코딩 시작
        </div>
        <div style={{
          fontSize: 12, color: TOKENS.dim, marginTop: 6, lineHeight: 1.5,
        }}>
          UR RTDE의 General Purpose 영역과 Modbus 값을 동일 timestamp 축으로
          병합 저장합니다. 사후 분석 워크스페이스에서 즉시 로드 가능.
        </div>
        <div style={{
          display: 'flex', gap: 14, marginTop: 12,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10, color: TOKENS.dim, letterSpacing: 0.5,
        }}>
          <span>샘플레이트 <span style={{ color: TOKENS.text }}>125Hz</span></span>
          <span>·</span>
          <span>예상 크기 <span style={{ color: TOKENS.text }}>~6KB/s</span></span>
          <span>·</span>
          <span>최대 길이 <span style={{ color: TOKENS.text }}>제한 없음</span></span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button onClick={onStart}
          style={{
            padding: '12px 28px',
            background: TOKENS.accent,
            color: '#0a0f1c',
            border: 'none',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 12, letterSpacing: 1, fontWeight: 600,
            cursor: 'pointer',
            borderRadius: 2,
          }}>
          ● 새 레코딩 시작
        </button>
        <button onClick={onImport}
          style={{
            padding: '8px 28px',
            background: 'transparent',
            color: TOKENS.dim,
            border: `1px solid ${TOKENS.border}`,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10, letterSpacing: 0.8,
            cursor: 'pointer',
            borderRadius: 2,
          }}>
          파일 업로드 (.csv)
        </button>
        <button onClick={onLoadPath}
          style={{
            padding: '8px 28px',
            background: 'transparent',
            color: TOKENS.dim,
            border: `1px solid ${TOKENS.border}`,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10, letterSpacing: 0.8,
            cursor: 'pointer',
            borderRadius: 2,
          }}
          title="csvs/ 폴더의 CSV 목록에서 선택. 브라우저 업로드가 막힌 환경용.">
          📁 csvs/ 선택
        </button>
      </div>
    </div>
  );
}

function ActiveRecordingPanel({ session, stopRecording }) {
  const elapsed = Math.floor((Date.now() - session.startedAt) / 1000);
  const samples = elapsed * 125;
  const sizeMB = (samples * 56 / 1024 / 1024).toFixed(2);

  // Simulated live values streaming
  const M = window.MODBUS;
  const [state, setState] = React.useState(M.state);
  React.useEffect(() => M.subscribe((s) => setState({ ...s })), []);

  return (
    <div style={{
      margin: 24,
      padding: 0,
      background: TOKENS.red + '08',
      border: `1px solid ${TOKENS.red}66`,
      borderLeft: `4px solid ${TOKENS.red}`,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header row */}
      <div style={{
        padding: '20px 28px',
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto auto auto',
        gap: 32,
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{
            width: 16, height: 16, borderRadius: '50%',
            background: TOKENS.red,
            boxShadow: `0 0 16px ${TOKENS.red}`,
            animation: 'pulse 1s ease-in-out infinite',
          }} />
          <div>
            <div style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10, color: TOKENS.red, letterSpacing: 1.4, fontWeight: 600,
            }}>RECORDING</div>
            <div style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 11, color: TOKENS.text, marginTop: 2,
            }}>{session.meta?.filename || session.meta?.name || 'rtde_<timestamp>.csv'}</div>
            {session.meta?.name && session.meta?.filename && (
              <div style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 9, color: TOKENS.muted, marginTop: 1,
              }}>{session.meta.name}
                {session.meta.cell && <> · {session.meta.cell}</>}
                {session.meta.weld_on && <> · 용접 {session.meta.weld_on}</>}
              </div>
            )}
          </div>
        </div>
        <div>
          <div style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10, color: TOKENS.dim, letterSpacing: 1.2,
          }}>ELAPSED</div>
          <div style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 36, fontWeight: 500, color: TOKENS.text,
            letterSpacing: -1, lineHeight: 1.1, marginTop: 2,
          }}>{fmtT(elapsed)}</div>
        </div>
        <RecStat label="샘플" value={samples.toLocaleString()} />
        <RecStat label="크기" value={`${sizeMB} MB`} />
        <button onClick={stopRecording}
          style={{
            padding: '14px 28px',
            background: TOKENS.red,
            color: '#fff',
            border: 'none',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 13, letterSpacing: 1, fontWeight: 600,
            cursor: 'pointer',
            borderRadius: 2,
          }}>
          ■ 정지 및 저장
        </button>
      </div>

      {/* Live values being captured */}
      <div style={{
        padding: '0 28px 20px',
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)',
        gap: 1,
        background: TOKENS.border,
      }}>
        {[131, 132, 212, 213, 214, 158].map(addr => {
          const r = M.byAddr[addr];
          const hist = M.getHist(addr);
          return (
            <div key={addr} style={{
              background: TOKENS.panel,
              padding: '10px 12px',
              display: 'flex', flexDirection: 'column', gap: 4,
            }}>
              <div style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 9, color: TOKENS.muted, letterSpacing: 0.6,
              }}>{r.a} · {r.name}</div>
              <div style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 18, color: TOKENS.text, fontWeight: 500,
              }}>
                {fmt(state[addr], 1)}
                <span style={{ fontSize: 9, color: TOKENS.dim, marginLeft: 4 }}>{r.unit}</span>
              </div>
              <Sparkline values={hist} w={140} h={20} color={TOKENS.red} fill />
            </div>
          );
        })}
      </div>

      {/* Capture path */}
      <div style={{
        padding: '12px 28px',
        background: TOKENS.bg + '88',
        borderTop: `1px solid ${TOKENS.border}`,
        display: 'flex', alignItems: 'center', gap: 18,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10, color: TOKENS.dim,
      }}>
        <span style={{ color: TOKENS.text }}>저장 위치</span>
        <span>/var/shipyard/recordings/{session.meta?.name}</span>
        <span style={{ color: TOKENS.border }}>·</span>
        <span>RTDE 40컬럼 + Modbus 활성 레지스터 자동 병합</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: TOKENS.green }}>● Modbus OK</span>
        <span style={{ color: TOKENS.green }}>● RTDE OK</span>
      </div>
    </div>
  );
}

function RecStat({ label, value }) {
  return (
    <div>
      <div style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10, color: TOKENS.dim, letterSpacing: 1.2,
      }}>{label}</div>
      <div style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 20, color: TOKENS.text, fontWeight: 500, marginTop: 2,
      }}>{value}</div>
    </div>
  );
}

function NewRecordingDialog({ onClose, onConfirm }) {
  const [name, setName] = React.useState('');
  const [cell, setCell] = React.useState('');
  const [weldOn, setWeldOn] = React.useState('예');  // '예' | '아니오'
  const [note, setNote] = React.useState('');

  // 파일명 미리보기 — 백엔드도 동일한 sanitize 규칙 사용 (영문/숫자/한글/-만 통과)
  const now = new Date();
  const f = (n) => String(n).padStart(2,'0');
  const stamp = `${now.getFullYear()}${f(now.getMonth()+1)}${f(now.getDate())}_${f(now.getHours())}${f(now.getMinutes())}${f(now.getSeconds())}`;
  const safeName = (name || '').replace(/[^\w가-힣\-]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  const filename = safeName ? `rtde_${stamp}_${safeName}.csv` : `rtde_${stamp}.csv`;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100,
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          width: 560,
          background: TOKENS.panel,
          border: `1px solid ${TOKENS.border}`,
          borderTop: `2px solid ${TOKENS.accent}`,
          padding: 24,
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10, color: TOKENS.accent, letterSpacing: 1.4, fontWeight: 600,
          }}>NEW RECORDING</span>
          <span style={{ flex: 1 }} />
          <button onClick={onClose}
            style={{
              background: 'transparent', border: 'none',
              color: TOKENS.dim, cursor: 'pointer', fontSize: 18,
            }}>×</button>
        </div>
        <div style={{ fontSize: 16, color: TOKENS.text, fontWeight: 500 }}>
          레코딩 메타데이터 입력
        </div>

        <DialogField label="NAME (파일명에 반영)" value={name} onChange={setName} mono
          placeholder="예: 12-3F-VL2-test" />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <DialogField label="셀" value={cell} onChange={setCell} mono
            placeholder="VL2 / HOR ..." />
          <DialogSelect label="실제 용접 여부" value={weldOn} onChange={setWeldOn}
            options={['예', '아니오', '불명']} />
        </div>

        <DialogTextArea label="메모" value={note} onChange={setNote}
          placeholder="이 레코딩에 대한 자유 메모. 작업 조건·관찰사항·이상 징후 등을 자세히 적어두면 사후 분석 시 유용." />

        <div style={{
          padding: 10,
          background: TOKENS.bg,
          border: `1px solid ${TOKENS.border}`,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10, color: TOKENS.dim, lineHeight: 1.6,
        }}>
          <div style={{ color: TOKENS.text, marginBottom: 4 }}>
            ▸ {filename}
          </div>
          backend/recordings/ 에 저장 · RTDE 125Hz
          {!safeName && name && (
            <div style={{ color: TOKENS.amber, marginTop: 4 }}>
              ⚠ NAME 에서 사용 불가능한 문자는 _로 변환됩니다
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnSecondary}>취소</button>
          <button onClick={() => onConfirm({
              filename, name, cell, weld_on: weldOn, note,
            })}
            style={btnPrimary}>
            ● 시작
          </button>
        </div>
      </div>
    </div>
  );
}

function DialogSelect({ label, value, onChange, options }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 9, color: TOKENS.muted, letterSpacing: 1,
      }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{
          background: TOKENS.bg,
          border: `1px solid ${TOKENS.border}`,
          color: TOKENS.text,
          padding: '8px 10px',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 12,
          borderRadius: 2,
          outline: 'none',
        }}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function DialogTextArea({ label, value, onChange, placeholder }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 9, color: TOKENS.muted, letterSpacing: 1,
      }}>{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={5}
        style={{
          background: TOKENS.bg,
          border: `1px solid ${TOKENS.border}`,
          color: TOKENS.text,
          padding: '10px 12px',
          fontFamily: 'inherit',
          fontSize: 12,
          lineHeight: 1.6,
          borderRadius: 2,
          outline: 'none',
          resize: 'vertical',
          minHeight: 100,
        }} />
    </label>
  );
}

function DialogField({ label, value, onChange, mono, placeholder }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 9, color: TOKENS.muted, letterSpacing: 1,
      }}>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          background: TOKENS.bg,
          border: `1px solid ${TOKENS.border}`,
          color: TOKENS.text,
          padding: '8px 10px',
          fontFamily: mono ? 'JetBrains Mono, monospace' : 'inherit',
          fontSize: 12,
          borderRadius: 2,
          outline: 'none',
        }} />
    </label>
  );
}

const btnPrimary = {
  padding: '8px 18px',
  background: TOKENS.accent,
  color: '#0a0f1c',
  border: 'none',
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 11, letterSpacing: 0.8, fontWeight: 600,
  cursor: 'pointer',
  borderRadius: 2,
};
const btnSecondary = {
  padding: '8px 18px',
  background: 'transparent',
  color: TOKENS.dim,
  border: `1px solid ${TOKENS.border}`,
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 11, letterSpacing: 0.8,
  cursor: 'pointer',
  borderRadius: 2,
};

function RecordingTable({ rows, activeRecId, onOpen }) {
  return (
    <div style={{
      background: TOKENS.panel,
      border: `1px solid ${TOKENS.border}`,
      borderRadius: 2,
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '32px 1fr 140px 70px 70px 80px 100px 80px 70px 140px',
        gap: 12,
        padding: '10px 16px',
        background: TOKENS.panel2,
        borderBottom: `1px solid ${TOKENS.border}`,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 9, color: TOKENS.muted, letterSpacing: 0.8,
      }}>
        <span>SRC</span>
        <span>FILE / ID</span>
        <span>NAME</span>
        <span>CELL</span>
        <span>WELD</span>
        <span>DURATION</span>
        <span>SAMPLES</span>
        <span>SIZE</span>
        <span style={{ textAlign:'center' }}>ALARM</span>
        <span style={{ textAlign:'right' }}>ACTIONS</span>
      </div>
      {rows.map(r => {
        const isActive = r.id === activeRecId;
        const displayName = r.name || r.block || '';
        const weld = r.weld_on || '';
        return (
          <div key={r.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '32px 1fr 140px 70px 70px 80px 100px 80px 70px 140px',
              gap: 12,
              padding: '12px 16px',
              alignItems: 'center',
              borderBottom: `1px solid ${TOKENS.border}33`,
              background: isActive ? TOKENS.accent + '08' : 'transparent',
              borderLeft: isActive ? `2px solid ${TOKENS.accent}` : `2px solid transparent`,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 11,
            }}>
            <span style={{
              padding: '2px 5px',
              borderRadius: 1, fontSize: 9, fontWeight: 600,
              background: r.imported ? TOKENS.amber + '22'
                         : r.source === 'db' ? TOKENS.violet + '22' : TOKENS.cyan + '22',
              color: r.imported ? TOKENS.amber
                    : r.source === 'db' ? TOKENS.violet : TOKENS.cyan,
              textAlign: 'center',
              letterSpacing: 0.6,
            }}>{r.imported ? 'IMP' : (r.source || 'FILE').toUpperCase()}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{
                color: TOKENS.text,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                {r.starred && <span style={{ color: TOKENS.amber }}>★</span>}
                <span>{r.filename || r.name}</span>
              </div>
              <div style={{
                fontSize: 9, color: TOKENS.muted, marginTop: 2,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{r.startedAt}{r.note ? ` · ${r.note}` : ''}</div>
            </div>
            <span style={{ color: TOKENS.text,
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
            }}>{displayName}</span>
            <span style={{ color: TOKENS.cyan }}>{r.cell || ''}</span>
            <span style={{
              color: weld === '예' ? TOKENS.green : weld === '아니오' ? TOKENS.muted : TOKENS.dim,
              fontSize: 10,
            }}>{weld || '—'}</span>
            <span style={{ color: TOKENS.text }}>{r.duration ? fmtT(r.duration) : '—'}</span>
            <span style={{ color: TOKENS.dim }}>{(r.samples || 0).toLocaleString()}</span>
            <span style={{ color: TOKENS.dim }}>{r.size}</span>
            <span style={{
              textAlign:'center',
              color: r.alarms === 0 ? TOKENS.green : r.alarms > 5 ? TOKENS.red : TOKENS.amber,
              fontWeight: 600,
            }}>{r.alarms || 0}</span>
            <div style={{
              display: 'flex', gap: 4, justifyContent: 'flex-end',
            }}>
              <button onClick={() => onOpen(r.id)}
                style={{
                  padding: '4px 10px',
                  background: isActive ? TOKENS.accent : 'transparent',
                  color: isActive ? '#0a0f1c' : TOKENS.accent,
                  border: `1px solid ${TOKENS.accent}`,
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 10, letterSpacing: 0.6, fontWeight: 600,
                  cursor: 'pointer',
                  borderRadius: 1,
                }}>
                {isActive ? '열림' : '분석 열기'}
              </button>
              <button style={iconBtn} title="다운로드">⤓</button>
              <button style={iconBtn} title="삭제">×</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const iconBtn = {
  padding: '4px 8px',
  background: 'transparent',
  color: TOKENS.dim,
  border: `1px solid ${TOKENS.border}`,
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 11,
  cursor: 'pointer',
  borderRadius: 1,
};

window.ScreenRecordings = ScreenRecordings;
