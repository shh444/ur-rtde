조선소 대시보드 셋업
====================

.. raw:: html

   <div class="lang-switch">
     <a href="../en/shipyard_setup.html">EN</a>
     <span class="active">KO</span>
   </div>

이 페이지는 새로운 PC에서 **shipyard 대시보드(포트 8010)** 를 처음 띄우는
순서를 다룹니다. 화면별 사용법은 :doc:`shipyard_guide` 를 참고하세요.

.. note::

   레거시 통합 대시보드(포트 8008)의 일반 설치 가이드는 :doc:`getting_started` 입니다.
   shipyard 와는 별도 프로세스/별도 포트라 동시 운영 가능합니다.

사전 준비
---------

.. list-table::
   :header-rows: 1
   :widths: 22 18 60

   * - 항목
     - 권장 버전
     - 비고
   * - 운영체제
     - Windows 10/11
     - PowerShell 기준. 리눅스/macOS 도 동작하지만 명령어는 직접 환산하세요.
   * - Python
     - 3.10 이상
     - ``py -3 --version`` 으로 확인. 3.9 이하는 권장하지 않습니다.
   * - Git
     - 최신
     - 저장소 clone 및 설정 JSON 동기화용.
   * - 로봇과 동일 네트워크
     - —
     - 로봇 IP 로 ping 이 통해야 합니다. RTDE(30004) · Modbus(502) 포트가 열려 있어야 합니다.

저장소 받기
-----------

GitLab 저장소를 clone 합니다 (URL 은 팀 위키 참고).

.. code-block:: powershell

   git clone <저장소 URL>
   cd ur-rtde

clone 직후 프로젝트 루트에 다음 세 JSON 이 들어 있어야 합니다 — 동료가 만들어
커밋한 설정들입니다.

.. list-table::
   :header-rows: 1
   :widths: 32 16 52

   * - 파일
     - 필수
     - 없을 때 동작
   * - :file:`gp_mapping.json`
     - 권장
     - 매핑 0개로 시작 → 화면에 raw register 만 보임. 빨리 가져오세요.
   * - :file:`modbus_registers.json`
     - 선택
     - 프론트엔드 하드코딩 기본값(약 128개 레지스터)을 사용. 동작은 정상.
   * - :file:`analysis_templates.json`
     - 선택
     - 사용자 템플릿 빈 상태 + 내장 프리셋만 보임.

가상환경 + 패키지 설치
----------------------

.. code-block:: powershell

   py -3 -m venv .venv
   ./.venv/Scripts/Activate.ps1
   python -m pip install --upgrade pip
   pip install -r ./backend/requirements.txt

설치되는 핵심 패키지:

- ``fastapi`` + ``uvicorn`` — 웹 서버
- ``pydantic`` — 요청/응답 검증
- ``pymodbus`` — Modbus TCP 클라이언트
- ``python-multipart`` — CSV 업로드 (``/api/recordings/import``)

RTDE 클라이언트는 :file:`backend/ur_rtde_wire.py` 로 직접 구현되어 있어서
별도 설치 없이 동작합니다.

로봇 연결 설정 — :file:`app_config.py`
--------------------------------------

로봇 IP 와 기본 RTDE 설정은 :file:`app_config.py` 하나만 수정합니다.
이 파일이 단일 source of truth 입니다.

.. code-block:: python

   # 로봇 IP — RTDE(30004) 와 Modbus(502) 양쪽에 같은 IP가 사용됩니다.
   ROBOT_HOST = "192.168.1.7"

   # RTDE 요청 주파수 (Hz). 4.7V 평블록은 125Hz로 시작 권장.
   ROBOT_FREQUENCY_HZ = 125.0

   # 디지털 트윈 메쉬 선택 — 데이터 처리엔 영향 없음.
   ROBOT_MODEL = "ur5e"

   # 라이브 차트 롤링 윈도우 (초). 레코딩 길이와 무관.
   ROBOT_HISTORY_SECONDS = 600.0

   # shipyard 대시보드 호스트/포트 — uvicorn 이 들음.
   SHIPYARD_HOST = "127.0.0.1"
   SHIPYARD_PORT = 8010

.. tip::

   ``ROBOT_HOST`` 는 부팅 시 기본값일 뿐, 런타임에 화면 ① **실시간 모니터링** 의
   ConnectionBar 에서 변경하면 Modbus + RTDE 양쪽에 즉시 반영됩니다.

``ROBOT_FIELDS`` 에는 RTDE 가 구독할 필드들을 나열합니다. 조선소 셋업 기본값은
**0~32번 GP output_double_register 전체** + 자세 + 전류 모니터링 필드입니다.

.. code-block:: python

   ROBOT_FIELDS = [
       "timestamp",
       "actual_q",
       "actual_TCP_pose",
       "target_current",
       "actual_current",
       "actual_current_window",
       *[f"output_double_register_{i}" for i in range(0, 33)],
   ]

URScript 측에서 GP register 0~32 에 용접 텔레메트리 (전류·전압·아크율·오프셋 등)
를 채워주면 :file:`gp_mapping.json` 의 alias 가 이 값들을 친숙명으로 변환해
화면에 띄웁니다.

shipyard 첫 실행
----------------

.. code-block:: powershell

   python ./run_shipyard.py

콘솔에 다음과 비슷한 로그가 찍히면 정상입니다.

.. code-block:: text

   RTDE host       : 192.168.1.7
   Modbus host     : 192.168.1.7
   Shipyard URL    : http://127.0.0.1:8010/
   [gp_mapping] aliases=28 fields applied · freq=125Hz · host=192.168.1.7 (런타임 변경 가능)
   [db] sync: +N added, M skipped
   INFO:     Uvicorn running on http://127.0.0.1:8010

기동 직후 백엔드가 자동으로 수행하는 것:

1. SQLite (:file:`backend/data/shipyard.db`) 초기화 + 디스크 CSV 동기화
2. Modbus 폴링 스레드 시작 (``MODBUS_POLL_HZ``, 기본 4Hz)
3. RTDE 자동 연결 시도 — 미연결이면 백오프 재연결

브라우저 첫 접속
----------------

브라우저로 다음을 엽니다:

.. code-block:: text

   http://127.0.0.1:8010

처음 보이는 화면은 **◉ 실시간 모니터링** 입니다. 좌측 사이드바에서 5개 화면을
오갈 수 있습니다.

처음 할 일 — 체크리스트
^^^^^^^^^^^^^^^^^^^^^^^

1. ✅ 상단 ConnectionBar 의 IP/포트가 맞는지 확인 (틀리면 입력 → Connect)
2. ✅ Modbus 인디케이터가 녹색 LIVE 인지 확인
3. ✅ 화면 ◈ **RTDE 실시간** 으로 이동 → "LIVE · 125Hz" 상태 + 매핑 채널들이 보이는지 확인
4. ✅ GP 채널이 raw 이름(``output_double_register_*``)으로만 보이면 :file:`gp_mapping.json` 이 누락된 것 — git pull 다시 확인
5. ✅ 화면 ⌥ **GP 매핑** 에서 Modbus 레지스터 정의 탭을 열고 **"저장"** 한 번 클릭 → :file:`modbus_registers.json` 생성 (없었던 경우)

설정 JSON 파일 — 어디 있고 무엇을 하는가
----------------------------------------

세 파일 모두 프로젝트 루트(:file:`ur-rtde/`)에 위치합니다. **git 으로 관리하면
PC/브라우저 사이에서 동일한 상태로 시작합니다.**

:file:`gp_mapping.json`
^^^^^^^^^^^^^^^^^^^^^^^

RTDE 의 GP register 를 친숙한 컬럼명으로 매핑합니다. 한 매핑 항목 예시:

.. code-block:: json

   { "register": "output_double_register_3", "col": "weldCurrent",
     "scale": 1.0, "label": "용접 전류", "unit": "A" }

- **읽기**: 서버 부팅 시 자동 (``_load_gp_mapping``)
- **쓰기**: 화면 ⌥ **GP 매핑** → 저장. 응답에 "변경사항은 서버 재시작 후 적용됩니다" 명시
- **반영 시점**: 서버 재시작 필요

:file:`modbus_registers.json`
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

화면 ① 실시간 모니터링이 사용하는 Modbus 레지스터 정의입니다. 약 128개의
주소(128~255 + 258) + groups + layout 까지 포함합니다.

- **읽기**: 화면 ⌥ **GP 매핑** 마운트 시 fetch. 저장된 게 없으면 프론트 하드코딩 기본값 사용
- **쓰기**: 같은 화면의 저장 버튼
- **반영 시점**: 페이지 새로고침

:file:`analysis_templates.json`
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

화면 ④ 분석 워크스페이스에서 사용자가 저장한 차트 프리셋과 숨긴 내장 프리셋
목록입니다.

.. code-block:: text

   {
     "templates": [
       { "id": "user-...", "name": "X 아크센싱",
         "pinned": ["BotRight_Plus", "TopLeft_Minus"],
         "scatterX": "__timer__", "scatterY": "xOffset", ... }
     ],
     "deletedBuiltins": ["builtin-arc-sensing-x"]
   }

- **읽기/쓰기**: 화면 ④ 마운트 시 fetch / 템플릿 저장 시 즉시 POST
- **반영 시점**: 즉시 (다음 화면 마운트)

동료 PC 에 동일 환경 만들기
---------------------------

1. 동료가 ``git pull`` — 세 JSON 도 같이 동기화됨
2. 위와 동일하게 :file:`app_config.py` 의 ``ROBOT_HOST`` 만 환경에 맞게 조정 (필요시)
3. ``python run_shipyard.py`` 실행

→ **같은 GP 매핑·같은 Modbus 정의·같은 분석 템플릿** 으로 시작합니다.

권장 RTDE 시작 설정
-------------------

조선소 4.7V 평블록 (기본):

.. code-block:: python

   ROBOT_FREQUENCY_HZ = 125.0
   ROBOT_FIELDS = [
       "timestamp", "actual_q", "actual_TCP_pose",
       "target_current", "actual_current", "actual_current_window",
       *[f"output_double_register_{i}" for i in range(0, 33)],
   ]

GP register 만 빠르게 보고 싶을 때 (라이트):

.. code-block:: python

   ROBOT_FREQUENCY_HZ = 125.0
   ROBOT_FIELDS = [
       "timestamp", "actual_TCP_pose",
       *[f"output_double_register_{i}" for i in range(0, 33)],
   ]

.. note::

   필요한 최소 필드부터 시작하세요. ``ROBOT_FREQUENCY_HZ`` 는 가장 나중에 올립니다.
   필드 수와 주파수 곱이 RTDE recipe 부하의 1차 결정 요인입니다.

트러블슈팅 (첫 셋업 빈도 높은 순)
---------------------------------------

- **콘솔에 ``No module named sphinx`` / ``fastapi``** — venv 활성화를 안 했거나
  ``pip install`` 단계 누락. ``./.venv/Scripts/Activate.ps1`` 다시 실행 후 확인.

- **콘솔에 ``Connection refused`` (RTDE)** — :file:`app_config.py` 의 ``ROBOT_HOST`` 가
  실제 로봇 IP 와 다른 경우. ``ping`` 으로 먼저 확인하고, 로봇 컨트롤러의 RTDE 가
  켜져 있는지 확인.

- **브라우저에서 코드 변경이 안 보임** — JSX 가 캐시됨. ``Ctrl + Shift + R`` 강제
  새로고침. 그래도 안 되면 F12 → Network → "Disable cache" 체크 후 재시도.

- **백엔드 코드 변경이 안 반영됨** — uvicorn 은 자동 리로드를 켜지 않습니다.
  ``Ctrl+C`` 후 ``python run_shipyard.py`` 다시 실행.

- **GP 채널이 raw 이름으로만 표시** — :file:`gp_mapping.json` 누락 또는 깨짐.
  ``GET /api/mapping`` 으로 응답 본문 확인 가능.

- **포트 8010 이 이미 사용 중** — 같은 shipyard 가 이미 떠 있거나 다른 프로세스가
  점유. ``netstat -ano | findstr :8010`` 으로 PID 확인 후 종료.

다음 단계
---------

- :doc:`shipyard_guide` — 5개 화면별 기능 가이드
- :doc:`rtde_background` — RTDE recipe, GP register 의 입출력 방향 이해
- :doc:`python_api` — Python 에서 RTDE 직접 접근 (대시보드 외)
- :doc:`troubleshooting` — 운영 중 자주 만나는 에러
