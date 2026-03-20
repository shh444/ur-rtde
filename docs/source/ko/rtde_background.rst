RTDE 배경 설명
==============

.. raw:: html

   <div class="lang-switch">
     <a href="../en/rtde_background.html">EN</a>
     <span class="active">KO</span>
   </div>


.. raw:: html

   

RTDE란 무엇인가
---------------

RTDE는 Universal Robots의 Real-Time Data Exchange 인터페이스입니다. 외부 애플리케이션이 TCP를 통해 선택한 로봇 데이터를 동기화해서 읽고 쓸 수 있게 해줍니다.

이 프로젝트는 공식 RTDE 모델을 최대한 그대로 따릅니다.

- 이름이 있는 output field 선택
- 필요한 경우 input field 선택
- 동기화 루프 시작
- robot output 읽기
- controller input 쓰기

왜 필드 이름을 그대로 쓰는가
-----------------------------

웹 인터페이스와 Python API는 실제 RTDE 필드명을 그대로 사용합니다. 그래서 여기서 설정한 이름이 Universal Robots 공식 RTDE 문서의 이름과 자연스럽게 대응됩니다.

예시:

- ``timestamp``
- ``actual_q``
- ``actual_qd``
- ``actual_current``
- ``actual_TCP_pose``
- ``input_int_register_24``
- ``output_int_register_24``

Output recipe 와 input recipe
------------------------------

RTDE는 다음 구조를 가집니다.

- **하나의 output recipe**: 로봇에서 클라이언트로 스트리밍
- **하나 이상의 input recipe**: 클라이언트에서 컨트롤러로 쓰기

이 프로젝트에서는 보통 필드가 읽기용인지 쓰기용인지 정도만 생각하면 충분합니다.

GP input 과 GP output 구분
--------------------------

실무에서 가장 중요한 구분은 다음입니다.

- ``input_*_register_*`` 는 클라이언트에서 **쓰기 가능**
- ``output_*_register_*`` 는 클라이언트에서 **읽기 전용**

외부 RTDE client에서 자주 쓰는 범위는 아래와 같습니다.

- ``input_bit_register_64`` .. ``input_bit_register_127``
- ``input_int_register_24`` .. ``input_int_register_47``
- ``input_double_register_24`` .. ``input_double_register_47``
- ``output_bit_register_64`` .. ``output_bit_register_127``
- ``output_int_register_24`` .. ``output_int_register_47``
- ``output_double_register_24`` .. ``output_double_register_47``

주파수와 부하
-------------

웹 인터페이스가 높은 RTDE 주파수를 요청할 수 있다고 해서, 모든 시각화 계층이 모든 프레임을 그대로 소비해야 하는 것은 아닙니다.

실무 권장 기준:

- **500 Hz** 는 얇은 필드 조합에서만 사용
- **125 Hz** 는 좀 더 풍부한 모니터링에 사용
- current, GP, diagnostics 필드는 필요한 경우에만 추가

Current-window 보기
-------------------

측정 전류와 허용 편차 window를 비교하려면 다음 필드를 같이 요청합니다.

.. code-block:: python

   ROBOT_FIELDS = [
       "timestamp",
       "target_current",
       "actual_current",
       "actual_current_window",
   ]

웹 인터페이스는 다음과 같은 실용적인 비율을 계산합니다.

.. code-block:: text

   usage = abs(actual_current - target_current) / actual_current_window

이 값은 모니터링 보조 지표이지, 인증된 안전 기능 자체는 아닙니다.
