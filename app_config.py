from __future__ import annotations

# Single source of truth for the robot connection.
# Change the robot IP here and restart run_dashboard.py.
ROBOT_HOST = "192.168.1.7"

# 500 Hz is possible on e-Series / ur-Series, but keep the field list slim.
# For digital twin, start with: timestamp, actual_q, actual_TCP_pose
# For current-window monitoring add: target_current, actual_current, actual_current_window
ROBOT_FREQUENCY_HZ = 125.0
ROBOT_FIELDS = [
    "timestamp",
    "actual_q",
    "actual_TCP_pose",
    "target_current",
    "actual_current",
    "actual_current_window",
    # URScript에서 0~32번에 용접 텔레메트리를 채워서 RTDE로 내보내는 구조.
    # 실제 사용 슬롯은 gp_mapping.yaml(또는 [data.js](shipyard_dashboard/data.js)의 gpMapping)에서 컬럼명으로 연결.
    *[f"output_double_register_{i}" for i in range(0, 33)],
]

# ─── 라이브 차트 롤링 윈도우 ──────────────────────────────────────────
# 백엔드가 메모리에 들고 있는 "지난 N초" 시계열 길이. 이건 **라이브 차트 표시용**
# 슬라이딩 윈도우일 뿐, 레코딩 CSV 길이와는 무관합니다.
# (레코딩은 start ~ stop 까지 전부 디스크에 기록되며 이 값에 영향받지 않음.)
#
# 권장 조정 기준:
#   - 용접 패스 1회 사이클 전체를 한 차트에서 보고 싶다 → 그 사이클 길이(초)로
#   - 최근 동향만 빠르게 보고 싶다 → 30~60초
#   - 메모리/브라우저 부담이 크다 → 줄이거나 ROBOT_HISTORY_SAMPLE_HZ를 낮춤
# 메모리는 (HISTORY_SECONDS × HISTORY_SAMPLE_HZ × 시리즈수)에 비례합니다.
ROBOT_HISTORY_SECONDS = 600.0  # 10분. 레코딩 시간에 맞춰 자유롭게 조정.

# 라이브 차트용 다운샘플링 주기 (Hz).
# RTDE 원본은 ROBOT_FREQUENCY_HZ로 들어오지만, 차트엔 그렇게 촘촘하게 안 보냄.
# 12Hz면 사람 눈엔 충분히 부드럽고, 메모리/네트워크 부담은 1/10 수준.
# 빠른 진동(아크 센싱 등)을 차트에서 직접 보고 싶다 → 25~30Hz 까지 올리기.
ROBOT_HISTORY_SAMPLE_HZ = 12.0

# ─── 브라우저 푸시 주기 ──────────────────────────────────────────────
# 두 종류의 WebSocket을 분리해서 운영합니다. 둘 다 RTDE 폴링보다 의도적으로 낮음
# (브라우저는 60fps이고, WS 트래픽도 줄여야 하므로).

# /ws/stream — 차트 전체 묶음 (히스토리 + 이벤트 포함, 페이로드 큼) 푸시 주기.
# 무거운 데이터라 천천히 보냄. 2Hz면 차트 갱신 500ms 간격으로 체감 충분.
WS_PUSH_HZ = 2.0

# /ws/live — 라이브 KPI 값 + 디지털 트윈 관절각 (페이로드 작음) 푸시 주기.
# 가벼운 데이터라 빠르게 보내도 OK. 디지털 트윈이 끊겨 보이면 15~20Hz로 올리기.
LIVE_PUSH_HZ = 10.0

# 디지털 트윈 3D 메쉬/링크 치수 선택. RTDE 데이터 처리에는 영향 없음.
# 허용 값: "ur3e", "ur5e", "ur10e", "ur16e", "ur20", "ur30", "ur3", "ur5", "ur10"
ROBOT_MODEL = "ur5e"

# Modbus TCP slave on the UR controller (port 502).
# Reads the welding/pendant protocol (128~255) + UR status (258+).
MODBUS_HOST = ROBOT_HOST
MODBUS_POLL_HZ = 4.0

# 레거시 통합 대시보드(backend/main.py) 포트
UI_HOST = "127.0.0.1"
UI_PORT = 8008

# Shipyard 전용 대시보드(backend/shipyard_app.py) 포트.
# run_shipyard.py 가 이 포트로 띄움. UI_PORT와 분리되어 동시 운영 가능.
SHIPYARD_HOST = "127.0.0.1"
SHIPYARD_PORT = 8010

# ─── 로봇 → 백엔드 로그 소켓 ──────────────────────────────────────────
# 로봇/외부 디바이스가 TCP 클라이언트로 접속해서 라인 단위 로그를 보내는 서버.
# 줄 단위(`\n` 종료)로 받고, JSON 줄이면 파싱해서 level/message 분리, 아니면 raw.
# 0.0.0.0 으로 두면 로봇 네트워크에서 접근 가능. 보안망에선 robot subnet 으로 제한.
LOG_SOCKET_HOST = "0.0.0.0"
LOG_SOCKET_PORT = 9999
# 메모리 ring buffer 길이 (라인 수). 초과분은 가장 오래된 것부터 폐기.
LOG_SOCKET_BUFFER = 5000
