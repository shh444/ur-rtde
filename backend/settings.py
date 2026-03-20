from __future__ import annotations

try:
    from app_config import (
        LIVE_PUSH_HZ,
        ROBOT_FIELDS,
        ROBOT_FREQUENCY_HZ,
        ROBOT_HISTORY_SAMPLE_HZ,
        ROBOT_HISTORY_SECONDS,
        ROBOT_HOST,
        ROBOT_MODEL,
        UI_HOST,
        UI_PORT,
        WS_PUSH_HZ,
    )
except ImportError:
    ROBOT_HOST = "192.168.1.101"
    ROBOT_FREQUENCY_HZ = 25.0
    ROBOT_FIELDS = [
        "timestamp",
        "actual_q",
        "actual_TCP_pose",
        "runtime_state",
        "robot_mode",
        "safety_status",
        "speed_scaling",
    ]
    ROBOT_HISTORY_SECONDS = 60.0
    ROBOT_HISTORY_SAMPLE_HZ = 15.0
    WS_PUSH_HZ = 2.0
    LIVE_PUSH_HZ = 10.0
    ROBOT_MODEL = "ur5e"
    UI_HOST = "127.0.0.1"
    UI_PORT = 8008

DEFAULT_HOST = ROBOT_HOST
DEFAULT_FREQUENCY_HZ = float(ROBOT_FREQUENCY_HZ)
DEFAULT_FIELDS = list(ROBOT_FIELDS)
DEFAULT_HISTORY_SECONDS = float(ROBOT_HISTORY_SECONDS)
DEFAULT_HISTORY_SAMPLE_HZ = float(ROBOT_HISTORY_SAMPLE_HZ)
DEFAULT_WS_PUSH_HZ = float(WS_PUSH_HZ)
DEFAULT_LIVE_PUSH_HZ = float(LIVE_PUSH_HZ)
DEFAULT_UI_HOST = UI_HOST
DEFAULT_UI_PORT = int(UI_PORT)
DEFAULT_ROBOT_MODEL = str(ROBOT_MODEL).strip().lower() or "ur5e"

ROBOT_MODELS = [
    "ur3e",
    "ur5e",
    "ur10e",
    "ur16e",
    "ur20",
    "ur30",
    "ur3",
    "ur5",
    "ur10",
]
ROBOT_MODEL_LABELS = {
    "ur3e": "UR3e",
    "ur5e": "UR5e / UR7e",
    "ur10e": "UR10e / UR12e",
    "ur16e": "UR16e",
    "ur20": "UR20",
    "ur30": "UR30",
    "ur3": "UR3",
    "ur5": "UR5",
    "ur10": "UR10",
}

FIELD_PRESETS = {
    "core": [
        "timestamp",
        "actual_q",
        "actual_TCP_pose",
        "runtime_state",
        "robot_mode",
        "safety_status",
        "speed_scaling",
    ],
    "twin": [
        "timestamp",
        "actual_q",
        "actual_qd",
        "actual_TCP_pose",
        "actual_TCP_speed",
        "runtime_state",
        "speed_scaling",
    ],
    "twin_io": [
        "timestamp",
        "actual_q",
        "actual_TCP_pose",
        "runtime_state",
        "speed_scaling",
        "actual_digital_input_bits",
        "actual_digital_output_bits",
        "input_int_register_24",
        "output_int_register_24",
    ],
    "io": [
        "timestamp",
        "actual_digital_input_bits",
        "actual_digital_output_bits",
        "standard_analog_input0",
        "standard_analog_input1",
        "input_int_register_24",
        "input_double_register_24",
        "input_bit_register_64",
        "output_int_register_24",
        "output_double_register_24",
        "output_bit_register_64",
    ],
    "diagnostics": [
        "timestamp",
        "actual_q",
        "actual_qd",
        "target_current",
        "actual_current",
        "actual_current_window",
        "actual_current_as_torque",
        "actual_TCP_pose",
        "actual_TCP_speed",
        "actual_TCP_force",
        "runtime_state",
        "robot_mode",
        "safety_status",
        "speed_scaling",
        "actual_digital_input_bits",
        "actual_digital_output_bits",
        "standard_analog_input0",
        "standard_analog_input1",
        "input_int_register_24",
        "input_double_register_24",
        "input_bit_register_64",
        "output_int_register_24",
        "output_double_register_24",
        "output_bit_register_64",
    ],
    "safety_current": [
        "timestamp",
        "target_current",
        "actual_current",
        "actual_current_window",
        "actual_current_as_torque",
        "joint_control_output",
        "actual_q",
        "actual_qd",
        "joint_temperatures",
        "safety_status",
        "safety_status_bits",
    ],
}

FIELD_HELP = {
    "timestamp": "Robot controller uptime [s]",
    "actual_q": "Actual joint positions [rad]",
    "actual_qd": "Actual joint velocities [rad/s]",
    "target_current": "Target joint currents [A]",
    "actual_current": "Actual joint currents [A]",
    "actual_current_window": "Allowed deviation from target currents [A]",
    "actual_current_as_torque": "Actual joint currents converted to torque [Nm]",
    "joint_control_output": "Joint control currents [A]",
    "joint_temperatures": "Joint temperatures [degC]",
    "safety_status_bits": "Safety status bitfield",
    "actual_TCP_pose": "Actual TCP pose [m, rotation-vector rad]",
    "actual_TCP_speed": "Actual TCP speed [m/s, rad/s]",
    "actual_TCP_force": "Actual TCP wrench [N, Nm]",
    "runtime_state": "Program runtime state",
    "robot_mode": "Robot mode enum",
    "safety_mode": "Safety mode enum (deprecated field)",
    "safety_status": "Safety status enum",
    "speed_scaling": "Trajectory limiter speed scaling ratio",
    "actual_digital_input_bits": "Current digital inputs bitfield",
    "actual_digital_output_bits": "Current digital outputs bitfield",
    "standard_analog_input0": "Standard analog input 0",
    "standard_analog_input1": "Standard analog input 1",
    "input_bit_register_64": "External RTDE GP input bit register 64 (R/W)",
    "input_int_register_24": "External RTDE GP input int register 24 (R/W)",
    "input_double_register_24": "External RTDE GP input double register 24 (R/W)",
    "output_bit_register_64": "External RTDE GP output bit register 64 (R)",
    "output_int_register_24": "External RTDE GP output int register 24 (R)",
    "output_double_register_24": "External RTDE GP output double register 24 (R)",
}

COMMON_FIELDS = [
    "timestamp",
    "actual_q",
    "actual_qd",
    "target_current",
    "actual_current",
    "actual_current_window",
    "actual_current_as_torque",
    "joint_control_output",
    "joint_temperatures",
    "safety_status_bits",
    "actual_TCP_pose",
    "actual_TCP_speed",
    "actual_TCP_force",
    "runtime_state",
    "robot_mode",
    "safety_status",
    "speed_scaling",
    "actual_digital_input_bits",
    "actual_digital_output_bits",
    "standard_analog_input0",
    "standard_analog_input1",
    "input_bit_register_64",
    "input_int_register_24",
    "input_double_register_24",
    "output_bit_register_64",
    "output_int_register_24",
    "output_double_register_24",
]

FIELD_SECTIONS = {
    "robot_outputs": [
        "timestamp",
        "actual_q",
        "actual_qd",
        "target_current",
        "actual_current",
        "actual_current_window",
        "actual_current_as_torque",
        "joint_control_output",
        "joint_temperatures",
        "safety_status_bits",
        "actual_TCP_pose",
        "actual_TCP_speed",
        "actual_TCP_force",
        "runtime_state",
        "robot_mode",
        "safety_status",
        "speed_scaling",
        "actual_digital_input_bits",
        "actual_digital_output_bits",
        "standard_analog_input0",
        "standard_analog_input1",
    ],
    "gp_inputs": [
        "input_bit_register_64",
        "input_int_register_24",
        "input_double_register_24",
    ],
    "gp_outputs": [
        "output_bit_register_64",
        "output_int_register_24",
        "output_double_register_24",
    ],
}
