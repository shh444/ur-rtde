# UR RTDE core

이 버전은 일부러 단순하게 만들었습니다.

핵심은 세 개뿐입니다.

- `frequency_hz`: 수신 주파수
- `fields`: 읽을 필드
- `writes`: 쓸 필드

## 1. 기본 사용

```python
from ur_robot import URRobot

robot = URRobot(
    "192.168.1.101",
    frequency_hz=500.0,
    fields=["time", "q", "tcp"],
    writes=["gp.int.24", "gp.double.24"],
)

robot.start()

print(robot["q"][0])
print(robot["tcp"])

robot["gp.int.24"] = 123
print(robot["gp.int.24"])

robot.stop()
robot.close()
```

## 2. 필드 이름

친화 이름을 지원합니다.

- `time`
- `q`
- `qd`
- `current`
- `tcp`
- `tcp_speed`
- `tcp_force`
- `di`
- `do`
- `ai0`
- `ai1`
- `speed`
- `runtime`
- `mode`
- `safety`

원하면 raw RTDE 이름도 그대로 넣을 수 있습니다.

## 3. GP 쓰기/읽기

입력 GP 영역은 이렇게 씁니다.

- `gp.bit.64`
- `gp.int.24`
- `gp.double.24`

로봇 output GP 영역을 읽고 싶으면 이렇게 `fields`에 넣으면 됩니다.

- `gp_out.bit.64`
- `gp_out.int.24`
- `gp_out.double.24`

`writes=[...]`에 넣은 항목은 기본적으로 readback도 같이 켭니다. 그래서 아래처럼 바로 읽을 수 있습니다.

```python
robot["gp.int.24"] = 123
print(robot["gp.int.24"])
```

## 4. async

```python
import asyncio
from ur_robot import URRobot

async def main():
    robot = URRobot("192.168.1.101", fields=["q", "tcp"], frequency_hz=25.0)
    await robot.start_async()
    print(robot["q"][0])
    await robot.stop_async()
    await robot.close_async()

asyncio.run(main())
```

## 5. VS Code / Windows

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
python sample_basic.py
```

## 6. 검증

```powershell
python verify_receive.py --fields time q tcp runtime --writes gp.int.24 gp.double.24
```

결과 파일:

- `verify_out/rtde_verify_report.json`
- `verify_out/rtde_verify_samples.csv`
# ur-rtde
