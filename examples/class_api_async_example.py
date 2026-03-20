from __future__ import annotations

import asyncio

from backend.ur_robot import URRobot

HOST = "192.168.163.128"
FREQUENCY_HZ = 125.0
ROBOT_FIELDS = [
    "timestamp",
    "actual_q",
    "actual_TCP_pose",
]


async def main() -> None:
    robot = URRobot(
        host=HOST,
        frequency_hz=FREQUENCY_HZ,
        fields=ROBOT_FIELDS,
    )

    await robot.start_async()
    try:
        frame = await robot.wait_next_frame_async(timeout=1.0)
        print("frame index           =", frame.frame_index)
        print("actual_q [rad]        =", frame["actual_q"])
        print("actual_q [deg]        =", robot.q_deg())
        print("TCP xyz mm + RPY deg  =", robot.tcp_rpy_deg())
    finally:
        await robot.stop_async()
        await robot.close_async()


if __name__ == "__main__":
    asyncio.run(main())
