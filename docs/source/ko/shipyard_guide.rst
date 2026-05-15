조선소 대시보드 가이드
======================

.. raw:: html

   <div class="lang-switch">
     <a href="../en/shipyard_guide.html">EN</a>
     <span class="active">KO</span>
   </div>

개요
----

조선소 용접 현장에서 사용하는 shipyard 대시보드(포트 ``8010``)의 화면별 기능 가이드입니다.
레거시 통합 대시보드(``8008``, :doc:`dashboard_guide`)와는 **별도 프로세스/별도 포트**로 띄우며,
동일 호스트에서 동시 운영할 수 있습니다.

shipyard 대시보드는 5개의 화면으로 구성되어 있고, 각각 한 가지 목적에 집중합니다.

.. list-table::
   :header-rows: 1
   :widths: 8 22 25 45

   * - 키
     - 화면
     - 데이터 출처
     - 핵심 목적
   * - ◉
     - 실시간 모니터링
     - Modbus TCP (502) · WS ``/ws/modbus``
     - 펜던트·로봇·용접기 라이브 상태 + 로봇 IP 변경 (단일 진입점)
   * - ◈
     - RTDE 실시간
     - RTDE (30004) · WS ``/ws/live``
     - GP 레지스터 + 로봇 자세 라이브 — gp_mapping.json 정의 채널만 표시
   * - ▭
     - 레코딩
     - DashboardService + SQLite ``shipyard.db``
     - 라이브 캡처/임포트 → CSV + 사이드카 + DB 이중 저장
   * - ⟁
     - 분석 워크스페이스
     - ``GET /api/recordings/{name}/data``
     - 사후 차트 + 스크리닝 + 사용자 템플릿 (파일 영속화)
   * - ⌥
     - GP 매핑
     - ``gp_mapping.json`` / ``modbus_registers.json``
     - 매핑·레지스터 정의 JSON 직접 편집

실행 방법
---------

.. code-block:: powershell

   python ./run_shipyard.py

브라우저에서 아래 주소를 엽니다.

.. code-block:: text

   http://127.0.0.1:8010

기동 시 백엔드가 자동으로 수행하는 것:

1. SQLite (``backend/data/shipyard.db``) 초기화 + 디스크 CSV 동기화
2. Modbus 폴링 스레드 시작 (``MODBUS_POLL_HZ``, 기본 4Hz)
3. RTDE 스트림 자동 연결 시도 — 미연결이면 백오프 재연결

호스트/포트는 :file:`app_config.py` 의 ``SHIPYARD_HOST`` / ``SHIPYARD_PORT`` 에서 변경합니다.
로봇 IP (``ROBOT_HOST``) 는 같은 파일의 단일 source of truth 이며,
런타임 변경은 화면 ① 실시간 모니터링의 ConnectionBar 에서 수행합니다.

화면별 가이드
-------------

.. toctree::
   :maxdepth: 1
   :hidden:

1. 실시간 모니터링 (Modbus TCP)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. note::

   상세 본문은 Phase 2 에서 채워집니다.

데이터 출처
   - HTTP: ``GET /api/modbus/snapshot``
   - WebSocket: ``/ws/modbus`` (백엔드 ``ModbusService`` 가 폴링한 스냅샷 push)
   - 런타임 IP 변경: ``POST /api/modbus/config`` — Modbus + RTDE 양쪽에 동시 적용

의존 파일
   - :file:`modbus_registers.json` (레지스터 정의 — 저장 안 됐으면 프론트 하드코딩 기본값)

2. RTDE 실시간 (GP + 자세)
^^^^^^^^^^^^^^^^^^^^^^^^^^

.. note::

   상세 본문은 Phase 3 에서 채워집니다.

데이터 출처
   - HTTP: ``GET /api/state``, ``POST /api/rtde/start``, ``POST /api/rtde/stop``
   - WebSocket: ``/ws/live`` (10Hz, KPI + 라이브 row) · ``/ws/stream`` (2Hz, 차트 + 히스토리)

의존 파일
   - :file:`gp_mapping.json` (GP register → 친숙명 alias, ``frequency``)
   - :file:`app_config.py` 의 ``ROBOT_FIELDS``

3. 레코딩 (RTDE)
^^^^^^^^^^^^^^^^

.. note::

   상세 본문은 Phase 4 에서 채워집니다.

데이터 출처
   - HTTP: ``GET/POST/DELETE /api/recordings``, ``/import``, ``/load-path``,
     ``/{name}/data``, ``/{name}/meta``, ``/{name}/download``
   - 저장 위치: :file:`backend/recordings/` (CSV + ``.meta.json``) + SQLite ``shipyard.db``

4. 분석 워크스페이스 (사후 차트)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. note::

   상세 본문은 Phase 5 에서 채워집니다.

데이터 출처
   - HTTP: ``GET /api/recordings/{name}/data`` (DB 1차 → CSV fallback)
   - 템플릿: ``GET/POST/DELETE /api/analysis/templates``

의존 파일
   - :file:`analysis_templates.json` (사용자 템플릿 + 숨긴 빌트인 — 파일 영속화)

5. GP 매핑 (JSON)
^^^^^^^^^^^^^^^^^

.. note::

   상세 본문은 Phase 6 에서 채워집니다.

데이터 출처
   - GP 매핑: ``GET/POST/DELETE /api/mapping``
   - Modbus 레지스터: ``GET/POST/DELETE /api/modbus/registers``

의존 파일
   - :file:`gp_mapping.json` — 변경 후 **서버 재시작** 시 적용
   - :file:`modbus_registers.json` — 변경 후 **페이지 새로고침** 시 적용

설정 파일 요약
--------------

세 JSON 모두 프로젝트 루트(:file:`ur-rtde/`)에 위치하며, git 으로 함께 관리하면
다른 PC/브라우저에서도 동일한 상태로 시작합니다.

.. list-table::
   :header-rows: 1
   :widths: 28 18 18 36

   * - 파일
     - 영향 화면
     - 반영 시점
     - 비고
   * - :file:`gp_mapping.json`
     - ②, ⑤
     - 서버 재시작
     - RTDE GP register → 친숙명 alias, ``frequency``
   * - :file:`modbus_registers.json`
     - ①, ⑤
     - 페이지 새로고침
     - 저장 전엔 프론트 하드코딩 기본값 사용
   * - :file:`analysis_templates.json`
     - ④
     - 즉시 (다음 마운트)
     - 사용자 템플릿 + 숨긴 빌트인
