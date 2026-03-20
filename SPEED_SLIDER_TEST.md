# Speed Slider RTDE Test

This patch adds direct RTDE input support for:

- `speed_slider_mask`
- `speed_slider_fraction`

It also adds:

- `UR_RTDE.set_speed_slider(fraction, settle_s=0.10, release_mask=True)`
- `UR_RTDE.speed_slider_state()`
- `speed_slider_test.py`

## Quick test

```powershell
python .\speed_slider_test.py --host 192.168.163.128 --fractions 0.25 0.50 0.75 1.00
```

## Direct API use

```python
from backend.ur_robot import UR_RTDE

robot = UR_RTDE(
    HOST="192.168.163.128",
    FREQUENCY_HZ=125.0,
    FIELD=[
        "timestamp",
        "speed_scaling",
        "target_speed_fraction",
        "speed_slider_mask",
        "speed_slider_fraction",
    ],
)

robot.start()
try:
    robot.set_speed_slider(0.30)
    print(robot.speed_slider_state())
finally:
    robot.stop()
    robot.close()
```
