문제 해결
=========

.. raw:: html

   <div class="lang-switch">
     <a href="../en/troubleshooting.html">EN</a>
     <span class="active">KO</span>
   </div>


.. raw:: html

   

지원되지 않는 RTDE 필드
------------------------

오류 예시:

.. code-block:: text

   RTDE output setup contains unsupported fields: actual_current_as_torque:NOT_FOUND

의미:

컨트롤러가 요청한 output field 중 하나 이상을 지원하지 않는다는 뜻입니다.

권장 해결 순서:

1. 지원되지 않는 필드를 제거합니다.
2. 검증된 얇은 recipe로 다시 테스트합니다.
3. 필드를 하나씩 다시 추가합니다.

검증된 얇은 recipe:

.. code-block:: python

   ROBOT_FIELDS = ["timestamp", "actual_q", "actual_TCP_pose"]

Start rejected
--------------

오류 예시:

.. code-block:: text

   RTDEError: RTDE start rejected

주요 원인:

- 잘못되었거나 지원되지 않는 recipe
- 선택한 필드 조합에 비해 과한 주파수
- 보안 또는 서비스 접근 문제
- 컨트롤러 자원 압박

실무 해결 순서:

1. 주파수를 ``125.0`` Hz로 낮춥니다.
2. ``timestamp``, ``actual_q``, ``actual_TCP_pose`` 만 사용합니다.
3. 추가 필드를 하나씩 다시 넣습니다.

시간이 지날수록 actual rate가 떨어짐
-----------------------------------

흔한 원인:

- 한 번에 너무 많은 필드 요청
- 전체 모니터링 UI를 500 Hz로 구동
- 차트와 렌더링 부하
- 컨트롤러 부하로 인한 패킷 skip

실무 대응:

- 500 Hz는 가장 얇은 recipe에서만 사용
- 풍부한 모니터링은 125 Hz에서 운용
- 고속 twin profile 과 diagnostics profile 을 분리

GP write가 동작하지 않음
-------------------------

다음을 확인하세요.

- ``output_*`` 가 아니라 ``input_*`` 레지스터에 쓰고 있는지
- 다른 RTDE client가 같은 input variable을 이미 점유하고 있지 않은지
- 해당 필드가 현재 active setup에 포함되어 있는지

디지털 트윈은 보이지만 링크 연결이 틀어짐
-------------------------------------------

로봇은 보이는데 링크가 엉뚱한 순서로 연결된 것처럼 보인다면, imported mesh origin과 joint origin chain 사이 변환이 맞지 않을 가능성이 큽니다. 이 경우 프론트엔드 mesh loader만 업데이트하고 브라우저를 강력 새로고침하세요.

디지털 트윈이 보이지 않음
-------------------------

먼저 브라우저의 3D debug log를 확인하세요. 특히 아래 항목이 중요합니다.

- 어떤 mesh 파일이 로드되었는지
- 적용된 scale
- bounding box 크기
- fallback 사용 여부

프론트엔드 변경 후 강력 새로고침:

.. code-block:: text

   Ctrl + F5
