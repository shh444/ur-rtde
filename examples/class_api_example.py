from __future__ import annotations

from ur_rtde_api import UR_RTDE

HOST = "192.168.163.128"
FREQUENCY_HZ = 125
ROBOT_FIELDS = [
    "timestamp",
    "actual_q",
    "actual_TCP_pose",
    "input_int_register_24",
    "output_int_register_24",
]


def main() -> int:
    robot = UR_RTDE(
        HOST=HOST,
        FREQUENCY_HZ=FREQUENCY_HZ,
        FIELD=ROBOT_FIELDS,
    )

    robot.start()
    try:
        print("actual_q [rad]        =", robot["actual_q"])
        print("actual_q [deg]        =", robot.q_deg())
        print("actual_TCP_pose       =", robot["actual_TCP_pose"])
        print("TCP xyz mm + RPY deg  =", robot.tcp_rpy_deg())

        print("input_int_register_24 (before) =", robot["input_int_register_24"])
        robot["input_int_register_24"] = 33
        print("input_int_register_24 (after)  =", robot["input_int_register_24"])

        if "output_int_register_24" in ROBOT_FIELDS:
            print("output_int_register_24         =", robot["output_int_register_24"])
        return 0
    finally:
        robot.stop()
        robot.close()


if __name__ == "__main__":
    raise SystemExit(main())
