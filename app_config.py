from __future__ import annotations

# Single source of truth for the robot connection.
# Change the robot IP here and restart run_dashboard.py.
ROBOT_HOST = "192.168.163.128"

# 500 Hz is possible on e-Series / ur-Series, but keep the field list slim.
# For digital twin, start with: timestamp, actual_q, actual_TCP_pose
# For current-window monitoring add: target_current, actual_current, actual_current_window
ROBOT_FREQUENCY_HZ = 125.0
ROBOT_FIELDS = [
    "timestamp",
    "actual_q",
    "actual_TCP_pose",
    "target_current",
    "actual_current",
    "actual_current_window",
]

ROBOT_HISTORY_SECONDS = 45.0
ROBOT_HISTORY_SAMPLE_HZ = 12.0

# Browser push rates stay lower than RTDE read rate on purpose.
WS_PUSH_HZ = 2.0
LIVE_PUSH_HZ = 10.0
ROBOT_MODEL = "ur5e"

UI_HOST = "127.0.0.1"
UI_PORT = 8008
