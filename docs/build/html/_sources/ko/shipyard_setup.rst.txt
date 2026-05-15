Shipyard Dashboard — 시작하기
=============================

.. raw:: html

   <div class="lang-switch">
     <a href="../en/shipyard_setup.html">EN</a>
     <span class="active">KO</span>
   </div>

이 페이지는 처음 받은 PC 에서 **shipyard 대시보드** 를 띄우는 순서를 단계별로
안내합니다. 화면 사용법은 :doc:`shipyard_guide` 를 참고하세요.

준비물
------

.. list-table::
   :header-rows: 1
   :widths: 22 78

   * - 항목
     - 비고
   * - Windows PC
     - Windows 10 / 11. 권장 메모리 8GB 이상.
   * - Python 3.10 이상
     - 설치 안 되어 있으면 `python.org <https://www.python.org/downloads/>`_ 또는 사내 배포본에서 받기.
   * - Git
     - 저장소 받기 및 동료와 설정 공유용.
   * - 로봇과 같은 사내망
     - 자기 PC 에서 ``ping <로봇 IP>`` 가 통해야 합니다.

저장소 받기
-----------

GitHub 저장소를 ``git clone`` 합니다.

.. code-block:: powershell

   git clone https://github.com/shh444/ur-rtde.git
   cd ur-rtde

저장소 안에 미리 만들어둔 설정 3개가 같이 따라옵니다. **이 셋이 동료와 동일한
화면으로 시작하게 해주는 핵심** 입니다.

.. list-table::
   :header-rows: 1
   :widths: 32 68

   * - 파일
     - 역할
   * - ``gp_mapping.json``
     - 로봇이 보내주는 신호 번호를 "용접 전류", "X 오프셋" 같은 친숙한 이름으로 바꿔 보여줍니다.
   * - ``modbus_registers.json``
     - 펜던트·용접기 통신 레지스터의 의미·단위·디코딩 규칙.
   * - ``analysis_templates.json``
     - 분석 워크스페이스에서 다른 사람이 만들어둔 차트 프리셋.

가상환경과 패키지 설치
----------------------

PowerShell 을 열고 프로젝트 폴더 안에서:

.. code-block:: powershell

   py -3 -m venv .venv
   ./.venv/Scripts/Activate.ps1
   python -m pip install --upgrade pip
   pip install -r ./backend/requirements.txt

PowerShell 창의 프롬프트 맨 앞에 ``(.venv)`` 가 붙으면 가상환경이 활성화된 것입니다.
다음 번에 PowerShell 을 새로 열 때마다 ``./.venv/Scripts/Activate.ps1`` 한 번씩
다시 실행하면 됩니다.

로봇 IP 확인 — 한 곳만 보면 됩니다
----------------------------------

대시보드 전체에 단 하나의 설정 파일 :file:`app_config.py` 가 있습니다.
처음엔 다음 한 줄만 본인 환경에 맞게 바꾸면 됩니다.

.. code-block:: python

   ROBOT_HOST = "192.168.1.7"   # ← 본인 로봇 IP

다른 항목들 (주파수, 모델, 포트 등) 은 기본값 그대로 두어도 조선소 셋업에서는
정상 동작합니다.

.. tip::

   여기서 정한 IP 는 기본값일 뿐이고, 나중에 화면 ① **실시간 모니터링** 의
   상단 ConnectionBar 에서 언제든 즉시 변경할 수 있습니다. 다른 로봇으로 옮길
   때 코드 수정 없이 화면에서만 바꾸면 됩니다.

대시보드 실행
-------------

PowerShell 에서:

.. code-block:: powershell

   python ./run_shipyard.py

이런 줄이 차례로 보이면 정상 기동입니다.

.. code-block:: text

   RTDE host       : 192.168.1.7
   Modbus host     : 192.168.1.7
   Shipyard URL    : http://127.0.0.1:8010/
   INFO:     Uvicorn running on http://127.0.0.1:8010

브라우저(Chrome 권장)에서 다음 주소를 엽니다:

.. code-block:: text

   http://127.0.0.1:8010

대시보드 종료는 PowerShell 창에서 ``Ctrl + C`` 입니다.

처음 들어가서 확인할 5가지
--------------------------

브라우저에서 처음 화면(◉ 실시간 모니터링)이 뜨면 아래 순서로 점검합니다.

1. **상단 인디케이터가 녹색 LIVE 인지** — 로봇과 통신이 살아있다는 뜻.
   빨간색 DOWN 이면 IP 가 틀렸거나 로봇/네트워크 문제.
2. **왼쪽 사이드바의 ◈ RTDE 실시간 으로 이동** — 용접 전류·전압·아크율 같은
   친숙한 이름이 보이면 OK. 만약 ``output_double_register_3`` 같은 raw 이름만
   보인다면 ``gp_mapping.json`` 이 누락된 것이니 ``git pull`` 다시 받기.
3. **▭ 레코딩 으로 이동** — 이전에 동료가 남긴 레코딩 목록이 보입니다.
   처음엔 비어 있을 수 있습니다.
4. **⟁ 분석 워크스페이스 으로 이동** — 좌측에 "X 아크센싱" 같은 분석 템플릿이
   미리 들어와 있어야 동료와 같은 환경입니다.
5. **⌥ GP 매핑 으로 이동** → Modbus 레지스터 탭 → 한 번 **저장** 버튼 클릭.
   첫 PC 에서 ``modbus_registers.json`` 이 없으면 이 단계에서 생성됩니다.

동료 PC 에 똑같이 깔기
----------------------

동료가 자기 PC 에서:

1. 위와 같이 ``git clone`` → ``venv`` → ``pip install``
2. ``app_config.py`` 의 ``ROBOT_HOST`` 만 본인 로봇 IP 로
3. ``python run_shipyard.py``

이렇게만 하면 **GP 매핑·Modbus 레지스터 정의·분석 템플릿 모두 동일하게** 시작합니다.
누군가 새 분석 템플릿을 만들거나 매핑을 바꾸면, ``git pull`` 받는 동료에게도
바로 반영됩니다.

문제가 생기면
-------------

자주 만나는 5가지 증상 중심으로 정리합니다.

**기동 직후 콘솔에 빨간 글씨로 ``Connection refused`` (RTDE)**
   로봇 IP 가 ``app_config.py`` 와 다르거나 로봇 컨트롤러가 꺼져 있습니다.
   먼저 ``ping <로봇 IP>`` 가 통하는지 확인하세요. 통한다면 로봇 컨트롤러에서
   RTDE 가 켜져 있는지 점검.

**브라우저에서 화면 변경이 안 보임**
   대시보드 화면이 캐시된 경우입니다. ``Ctrl + Shift + R`` 로 강제 새로고침.
   그래도 안 되면 F12 → Network → "Disable cache" 체크 후 다시 시도.

**대시보드 실행 후 화면이 안 떠 / "이미 사용 중인 포트" 오류**
   이미 다른 PowerShell 창에서 shipyard 가 떠 있을 수 있습니다. 작업표시줄을
   확인하거나, PowerShell 에서 ``netstat -ano | findstr :8010`` 로 점유 중인
   프로세스 PID 를 확인 후 종료.

**GP 채널이 ``output_double_register_*`` 같은 이름으로만 보임**
   ``gp_mapping.json`` 이 누락됐거나 깨져 있습니다. ``git pull`` 로 다시 받거나
   동료에게 파일을 요청하세요.

**Modbus LIVE 가 안 떠 / "DOWN"**
   로봇과 같은 네트워크가 아닐 가능성이 큽니다. PC 의 IP 와 로봇 IP 가 같은
   대역(예: 192.168.1.x) 인지, 사내 방화벽이 502 포트를 차단하지 않는지 확인.

다음 단계
---------

- :doc:`shipyard_guide` — 6개 화면별 사용법
- :doc:`rtde_background` — RTDE 신호 체계의 배경 이해 (선택)
