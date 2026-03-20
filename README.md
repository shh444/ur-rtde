# UR RTDE Dashboard Studio

A Windows-friendly Universal Robots RTDE dashboard and Python API workspace with a split `backend/` and `frontend/` layout.

This repository has two equally important use cases:

1. **Web dashboard mode** for live monitoring, digital twin visualization, GP register writes, recording, and quick inspection.
2. **Python API mode** for scripts, test benches, logging tools, and application integration.

The project intentionally keeps the RTDE field names close to the real Universal Robots names so that the dashboard, the Python API, and the official RTDE documentation line up naturally.

---

## What this project is

- A **receive-focused RTDE client** with optional General Purpose register writes.
- A **browser dashboard** built with FastAPI, WebSocket streaming, ECharts, and a three.js digital twin.
- A **small Python class API** that can be used directly from scripts without touching the dashboard.
- A **single-source configuration** workflow: the robot IP and default fields live in one place.

---

## Main features

- Split `backend/` and `frontend/` folder structure
- English-only dashboard UI
- Single-source robot IP configuration in `app_config.py`
- Real RTDE field names such as `timestamp`, `actual_q`, `actual_TCP_pose`, and `input_int_register_24`
- Mesh-based digital twin with fallback procedural rendering
- Live tables, live charts, CSV recording, JSON export, and event logging
- Current-window monitoring using `target_current`, `actual_current`, and `actual_current_window`
- Simple Python API wrapper: `UR_RTDE`
- Async-friendly core class: `URRobot`
- Sphinx documentation under `docs/`
- GitHub Pages workflow under `.github/workflows/docs.yml`

---

## Project layout

```text
backend/                         FastAPI app, RTDE service, RTDE class
  __init__.py
  main.py                        API routes and static mounts
  service.py                     RTDE worker, history, recording, events
  settings.py                    Runtime defaults from app_config.py
  models.py                      Request and response models
  ur_robot.py                    Main RTDE class API
  ur_rtde_wire.py                Low-level RTDE wire protocol
  requirements.txt               Dashboard/server Python dependencies

frontend/                        Browser UI
  index.html                     Dashboard page
  assets/app.js                  Dashboard logic
  assets/digital_twin.js         3D digital twin logic
  assets/style.css               Styling
  assets/ur_mesh_presets.json    Robot model presets

examples/                        Python usage examples
  class_api_example.py           Synchronous API example
  class_api_async_example.py     Async API example

docs/                            Sphinx documentation
  Makefile
  make.bat
  requirements.txt
  source/
    conf.py
    index.rst
    getting_started.rst
    rtde_background.rst
    dashboard_guide.rst
    python_api.rst
    troubleshooting.rst
    github_pages.rst
    api_reference.rst

.github/workflows/
  docs.yml                       GitHub Pages workflow for Sphinx HTML

app_config.py                    Single source of truth for robot defaults
run_dashboard.py                 Starts the dashboard server
start_dashboard.ps1              PowerShell helper
ur_rtde_api.py                   Simple import wrapper for the class API
README.md                        This guide
```

---

## One place to change the robot IP

Edit only `app_config.py`:

```python
ROBOT_HOST = "192.168.163.128"
```

Then restart the dashboard:

```powershell
python ./run_dashboard.py
```

The dashboard shows the host, but it is intentionally read-only in the UI so there is only one place to change it.

---

## Quick start on Windows

Create and activate a virtual environment:

```powershell
py -3 -m venv .venv
./.venv/Scripts/Activate.ps1
python -m pip install --upgrade pip
pip install -r ./backend/requirements.txt
```

Start the dashboard:

```powershell
python ./run_dashboard.py
```

Open the dashboard in your browser:

```text
http://127.0.0.1:8008
```

---

## Default runtime configuration

The main runtime defaults live in `app_config.py`.

Example:

```python
ROBOT_HOST = "192.168.163.128"
ROBOT_FREQUENCY_HZ = 125.0
ROBOT_MODEL = "ur5e"
ROBOT_FIELDS = [
    "timestamp",
    "actual_q",
    "actual_TCP_pose",
    "runtime_state",
]
ROBOT_HISTORY_SECONDS = 45.0
ROBOT_HISTORY_SAMPLE_HZ = 12.0
WS_PUSH_HZ = 2.0
LIVE_PUSH_HZ = 10.0
UI_HOST = "127.0.0.1"
UI_PORT = 8008
```

---

## Choosing RTDE fields

This project uses **real Universal Robots RTDE field names** on purpose.

Examples:

- `timestamp`
- `actual_q`
- `actual_qd`
- `actual_current`
- `actual_current_window`
- `actual_TCP_pose`
- `actual_digital_input_bits`
- `input_int_register_24`
- `output_int_register_24`

### Recommended field sets

#### Digital twin at high frequency

```python
ROBOT_FREQUENCY_HZ = 500.0
ROBOT_FIELDS = [
    "timestamp",
    "actual_q",
    "actual_TCP_pose",
]
```

#### Dashboard with motion state

```python
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
```

#### GP register monitoring and write-back

```python
ROBOT_FREQUENCY_HZ = 125.0
ROBOT_FIELDS = [
    "timestamp",
    "actual_q",
    "actual_TCP_pose",
    "input_int_register_24",
    "output_int_register_24",
    "input_double_register_24",
    "output_double_register_24",
]
```

#### Current-window safety monitor

```python
ROBOT_FREQUENCY_HZ = 125.0
ROBOT_FIELDS = [
    "timestamp",
    "actual_q",
    "actual_TCP_pose",
    "target_current",
    "actual_current",
    "actual_current_window",
]
```

---

## GP input vs GP output

Keep these two groups clearly separated.

### GP inputs: writable from the RTDE client

- `input_bit_register_64` to `input_bit_register_127`
- `input_int_register_24` to `input_int_register_47`
- `input_double_register_24` to `input_double_register_47`

### GP outputs: readable from the RTDE client

- `output_bit_register_64` to `output_bit_register_127`
- `output_int_register_24` to `output_int_register_47`
- `output_double_register_24` to `output_double_register_47`

### Practical rule

- If you want the client or dashboard to **write** a GP value, use an `input_*` register.
- If you want to **observe** a controller-side GP value, use an `output_*` register.

---

## Current-window monitoring

To display current behavior together with the allowed deviation window, request these fields together:

```python
ROBOT_FIELDS = [
    "timestamp",
    "target_current",
    "actual_current",
    "actual_current_window",
]
```

The dashboard computes a practical monitoring ratio from those fields:

```text
usage = abs(actual_current - target_current) / actual_current_window
```

That ratio is intended as a dashboard aid. It is not a replacement for the robot's certified safety functions.

---

## Why `actual_hz` can drop at 500 Hz

A high RTDE request frequency does not guarantee that every consumer layer can process every frame.

Common reasons for a lower effective rate:

- too many RTDE output fields at once
- a heavy dashboard payload or history retention cost
- mesh twin rendering plus charts plus live tables at the same time
- controller-side packet skipping under load

Practical guidance:

- Use **500 Hz only for a slim recipe**.
- Use **125 Hz** for more complete dashboard monitoring.
- Split workflows: use a light high-rate twin profile and a richer lower-rate diagnostics profile.

---

## Dashboard quick use

1. Set `ROBOT_HOST` and `ROBOT_FIELDS` in `app_config.py`.
2. Start the server with `python ./run_dashboard.py`.
3. Open `http://127.0.0.1:8008`.
4. Click **Start**.
5. Watch the live values, charts, digital twin, and current-window panel.
6. If you configured GP input fields, write values from the dashboard GP panel.

---

## Python API quick use

### Small wrapper API

```python
from ur_rtde_api import UR_RTDE

robot = UR_RTDE(
    HOST="192.168.163.128",
    FREQUENCY_HZ=125,
    FIELD=[
        "timestamp",
        "actual_q",
        "actual_TCP_pose",
        "input_int_register_24",
    ],
)

robot.start()
try:
    print(robot["actual_q"])
    print(robot.q_deg())
    print(robot.tcp_rpy_deg())

    robot["input_int_register_24"] = 33
    print(robot["input_int_register_24"])
finally:
    robot.stop()
    robot.close()
```

### Direct core API

```python
from backend.ur_robot import URRobot

robot = URRobot(
    host="192.168.163.128",
    frequency_hz=125.0,
    fields=["timestamp", "actual_q", "actual_TCP_pose"],
)

robot.start()
try:
    frame = robot.wait_next_frame(timeout=1.0)
    print(frame["actual_q"])
finally:
    robot.stop()
    robot.close()
```

### Async API

```python
import asyncio
from backend.ur_robot import URRobot

async def main() -> None:
    robot = URRobot(
        host="192.168.163.128",
        frequency_hz=125.0,
        fields=["timestamp", "actual_q", "actual_TCP_pose"],
    )

    await robot.start_async()
    try:
        frame = await robot.wait_next_frame_async(timeout=1.0)
        print(frame["actual_q"])
    finally:
        await robot.stop_async()
        await robot.close_async()

asyncio.run(main())
```

---

## Conversion helpers

The API includes a few convenience conversion helpers for display and debugging.

- `robot.q_deg()` -> joint angles in degrees
- `robot.tcp_mm()` -> TCP xyz in mm, rotation-vector in rad
- `robot.tcp_mm_deg()` -> TCP xyz in mm, rotation-vector in deg
- `robot.tcp_rpy()` -> TCP xyz in mm, RPY in rad
- `robot.tcp_rpy_deg()` -> TCP xyz in mm, RPY in deg

---

## Common start-up failures

### `RTDE output setup contains unsupported fields: ... NOT_FOUND`

The controller does not support one or more requested output fields.

Typical fix:

- remove the unsupported field
- reduce to a known-good set such as `timestamp`, `actual_q`, `actual_TCP_pose`
- start again

Example:

```python
ROBOT_FIELDS = [
    "timestamp",
    "actual_q",
    "actual_TCP_pose",
]
```

### `RTDE start rejected`

Typical causes:

- the requested frequency and field set are too heavy together
- the output recipe is invalid
- a security or service setting blocks the connection

Practical fix order:

1. test with `timestamp`, `actual_q`, `actual_TCP_pose`
2. reduce to `125.0` Hz
3. re-add fields one by one

### GP write does not work

Typical causes:

- the field is an `output_*` register instead of an `input_*` register
- another RTDE client already owns that input variable
- the field was not included in the active setup

---

## Building local Sphinx documentation

Install the docs dependencies in the same virtual environment:

```powershell
pip install -r ./docs/requirements.txt
```

Build the HTML docs:

```powershell
python -m sphinx -M html docs/source docs/build
```

Open the built documentation:

```text
docs/build/html/index.html
```

---

## Publishing docs to GitHub Pages

This repository includes a workflow at:

```text
.github/workflows/docs.yml
```

Recommended process:

1. Push the repository to GitHub.
2. In repository settings, enable **GitHub Pages** and set the source to **GitHub Actions**.
3. Push to `main`.
4. GitHub Actions will build `docs/build/html` and deploy it to Pages.

---

## Documentation overview

The Sphinx site is split into these pages:

- `getting_started.rst` — installation and first run
- `rtde_background.rst` — RTDE concepts and official naming model
- `dashboard_guide.rst` — web UI usage
- `python_api.rst` — class-style Python API usage
- `troubleshooting.rst` — failure modes and field debugging
- `github_pages.rst` — local build and GitHub Pages deploy flow
- `api_reference.rst` — generated API reference

---

## Notes about robot appearance and URDF/meshes

If `robot_assets/` is present, the digital twin can use mesh assets so the visual result is closer to the real robot. If mesh loading fails, the dashboard falls back to a procedural twin.

For documentation-only updates or code-only patches, you do not need to ship `robot_assets/` every time.

---

## Suggested workflow for daily use

- Keep `app_config.py` small and explicit.
- Use the real RTDE field names in `ROBOT_FIELDS`.
- Start with a known-good slim recipe.
- Only add current-window or GP fields when you actually need them.
- Use the dashboard for visualization and quick checks.
- Use `UR_RTDE` or `URRobot` directly from scripts for automation.
- Keep the Sphinx docs in the same repository so the dashboard and API stay documented together.
