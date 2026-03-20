RTDE current-monitor start fix

Files included:
- backend/service.py
- backend/ur_robot.py
- frontend/assets/app.js

What changed:
1. Detects RTDE setup fields that return NOT_FOUND and raises a specific error naming the unsupported field(s).
2. If CONTROL_START is rejected, the backend automatically retries lower frequencies:
   requested -> 500 -> 250 -> 125 -> 100 -> 50 -> 25 (only values <= requested are tried).
3. Dashboard status now shows requested frequency and active frequency if they differ.

Recommended field set for current-window monitoring:
- timestamp
- actual_q
- actual_TCP_pose
- actual_current
- target_current
- actual_current_window
- actual_current_as_torque

Recommended frequency:
- Start at 125 Hz for current-window monitoring.
- Use 500 Hz only for slim digital-twin recipes such as timestamp + actual_q + actual_TCP_pose.
