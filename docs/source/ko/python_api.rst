Python API
==========

.. raw:: html

   <div class="lang-switch">
     <a href="../en/python_api.html">EN</a>
     <span class="active">KO</span>
   </div>


.. raw:: html

   

Python에서 이 저장소를 사용하는 대표적인 방법은 두 가지입니다.

간단 래퍼: ``UR_RTDE``
----------------------

작은 래퍼 클래스이며, 읽기 쉽고 실제 애플리케이션 코드에 복사해 넣기 쉬운 형태를 목표로 합니다.

.. literalinclude:: ../../../examples/class_api_example.py
   :language: python
   :caption: 동기 ``UR_RTDE`` 예제

코어 클래스: ``URRobot``
-------------------------

``URRobot`` 은 웹 인터페이스 내부에서도 사용하는 조금 더 명시적인 저수준 인터페이스입니다.

생성 예시는 아래와 같습니다.

.. code-block:: python

   from backend.ur_robot import URRobot

   robot = URRobot(
       host="192.168.163.128",
       frequency_hz=125.0,
       fields=["timestamp", "actual_q", "actual_TCP_pose"],
   )

비동기 예제
-----------

.. literalinclude:: ../../../examples/class_api_async_example.py
   :language: python
   :caption: 비동기 ``URRobot`` 예제

값 읽기
-------

두 API 모두 최신 캐시값을 필드명으로 바로 읽을 수 있습니다.

.. code-block:: python

   print(robot["actual_q"])
   print(robot["actual_TCP_pose"])

GP input 쓰기
-------------

쓰기 대상은 ``input_*_register_*`` 필드만 사용하세요.

.. code-block:: python

   robot["input_int_register_24"] = 33
   robot["input_double_register_24"] = 12.5
   robot["input_bit_register_64"] = True

변환 helper
-----------

표시와 디버깅에 유용한 helper 예시입니다.

.. code-block:: python

   print(robot.q_deg())
   print(robot.tcp_mm())
   print(robot.tcp_mm_deg())
   print(robot.tcp_rpy())
   print(robot.tcp_rpy_deg())

권장 연동 패턴
--------------

조금 더 큰 애플리케이션에서는 다음 패턴을 권장합니다.

- 로봇 연결당 robot 객체 하나 유지
- 필요한 최소 필드 조합만 선택
- 웹 인터페이스는 점검용으로 사용
- Python API는 자동화와 로깅에 사용
