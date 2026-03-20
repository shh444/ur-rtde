시작하기
========

.. raw:: html

   <div class="lang-switch">
     <a href="../en/getting_started.html">EN</a>
     <span class="active">KO</span>
   </div>


.. raw:: html

   

Windows 설치
------------

가상 환경을 만들고 활성화합니다.

.. code-block:: powershell

   py -3 -m venv .venv
   ./.venv/Scripts/Activate.ps1
   python -m pip install --upgrade pip
   pip install -r ./backend/requirements.txt

웹 인터페이스를 시작합니다.

.. code-block:: powershell

   python ./run_dashboard.py

브라우저 UI를 엽니다.

.. code-block:: text

   http://127.0.0.1:8008

단일 설정 지점
--------------

로봇 IP와 기본 RTDE 설정은 ``app_config.py`` 하나만 수정하면 됩니다.

.. code-block:: python

   ROBOT_HOST = "192.168.163.128"
   ROBOT_FREQUENCY_HZ = 125.0
   ROBOT_MODEL = "ur5e"
   ROBOT_FIELDS = [
       "timestamp",
       "actual_q",
       "actual_TCP_pose",
   ]

권장 시작 설정
--------------

고속 디지털 트윈:

.. code-block:: python

   ROBOT_FREQUENCY_HZ = 500.0
   ROBOT_FIELDS = ["timestamp", "actual_q", "actual_TCP_pose"]

웹 인터페이스 모니터링:

.. code-block:: python

   ROBOT_FREQUENCY_HZ = 125.0
   ROBOT_FIELDS = [
       "timestamp",
       "actual_q",
       "actual_qd",
       "actual_TCP_pose",
       "actual_TCP_speed",
       "runtime_state",
       "speed_scaling",
   ]

Current-window 모니터링:

.. code-block:: python

   ROBOT_FREQUENCY_HZ = 125.0
   ROBOT_FIELDS = [
       "timestamp",
       "actual_q",
       "target_current",
       "actual_current",
       "actual_current_window",
   ]

.. note::

   필요한 최소 필드부터 시작하는 것이 좋습니다. 주파수는 가장 나중에 올리세요.
