// Screen: 분석 워크스페이스
// VariantTracksFinal (B+) 레이아웃을 그대로 채용 — 좌측 채널 사이드바(토글),
// 중앙 RTDE 메인 트랙 + X·Y 산점도 + 마스터 타임라인, 우측 Modbus mini 트랙 + 메시지.
//
// 데이터 소스:
//   - recording 이 있으면 /api/recordings/{filename}/bundle 호출 → window.RTDE/TRACKS 덮어쓰기
//   - 없거나 로드 실패면 mock (tracks-data.js + data.js) 유지
// 로드 성공/실패에 따라 VariantTracksFinal 의 key 를 바꿔 재마운트 시킴.

function ScreenAnalysis({ recording, changeRecording, library }) {
  const filename = recording?.filename || null;
  const [loadState, setLoadState] = React.useState({
    status: 'idle',         // idle | loading | ok | error
    error: null,
    keySuffix: 'mock',      // VariantTracksFinal 재마운트 트리거
    loadedFilename: null,
  });

  React.useEffect(() => {
    if (!filename) {
      // 레코딩 미선택 — mock 유지
      setLoadState({ status: 'idle', error: null, keySuffix: 'mock', loadedFilename: null });
      return;
    }
    let cancelled = false;
    setLoadState(s => ({ ...s, status: 'loading', error: null }));
    window.TRACKS_LOADER.loadRecording(filename, recording)
      .then(() => {
        if (cancelled) return;
        setLoadState({
          status: 'ok',
          error: null,
          keySuffix: `rec:${filename}:${Date.now()}`,
          loadedFilename: filename,
        });
      })
      .catch(err => {
        if (cancelled) return;
        console.warn('[analysis] bundle load failed', err);
        setLoadState({
          status: 'error',
          error: String(err.message || err),
          keySuffix: `err:${filename}`,
          loadedFilename: null,
        });
      });
    return () => { cancelled = true; };
  }, [filename]);

  // window 글로벌 alias — babel 의 JSX dot-notation 안정성 보강 + 미로드 시 fallback
  const VariantTracksFinal = window.VariantTracksFinal;

  if (!VariantTracksFinal) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: TOKENS.muted, fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
      }}>
        분석 컴포넌트 로딩 중…
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
      <VariantTracksFinal
        key={loadState.keySuffix}
        recording={recording}
        library={library}
        changeRecording={changeRecording}
      />
      <AnalysisLoadOverlay state={loadState} filename={filename} />
    </div>
  );
}

// 상단에 살짝 띄우는 status overlay — 로딩 중/에러 만 표시. 성공은 자동 fade-out.
function AnalysisLoadOverlay({ state, filename }) {
  const [visible, setVisible] = React.useState(state.status !== 'idle');
  React.useEffect(() => {
    if (state.status === 'ok') {
      const t = setTimeout(() => setVisible(false), 1200);
      setVisible(true);
      return () => clearTimeout(t);
    }
    setVisible(state.status !== 'idle');
  }, [state.status, state.keySuffix]);

  if (!visible || state.status === 'idle') return null;

  const color =
    state.status === 'error' ? TOKENS.red :
    state.status === 'ok'    ? TOKENS.green :
                               TOKENS.amber;
  const label =
    state.status === 'error' ? 'LOAD FAILED' :
    state.status === 'ok'    ? 'LOADED' :
                               'LOADING…';
  return (
    <div style={{
      position: 'absolute', top: 8, right: 16, zIndex: 30,
      padding: '6px 12px',
      background: TOKENS.panel,
      border: `1px solid ${color}55`,
      borderLeft: `2px solid ${color}`,
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 10, color: TOKENS.text, letterSpacing: 0.5,
      display: 'flex', alignItems: 'center', gap: 8,
      boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
      pointerEvents: state.status === 'error' ? 'auto' : 'none',
      maxWidth: 520,
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%', background: color,
        boxShadow: `0 0 8px ${color}`,
        animation: state.status === 'loading' ? 'pulse 1.2s ease-in-out infinite' : 'none',
      }} />
      <span style={{ color, fontWeight: 600 }}>{label}</span>
      <span style={{ color: TOKENS.dim, fontSize: 9 }}>{filename || ''}</span>
      {state.status === 'error' && state.error && (
        <span style={{ color: TOKENS.dim, fontSize: 9, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          · {state.error}
        </span>
      )}
    </div>
  );
}

window.ScreenAnalysis = ScreenAnalysis;
