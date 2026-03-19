#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import time

from ur_robot import DEFAULT_HOST, URRobot

# ============================================================
# Edit only this block in VS Code.
# ============================================================
HOST = DEFAULT_HOST
FREQUENCY_HZ = 25.0
FIELDS = [
    "time",
    "q",
    "tcp",
    "runtime",
]
WRITES = [
    # "gp.int.24",
    # "gp.double.24",
    # "gp.bit.64",
]
RUN_ASYNC_DEMO = False
# ============================================================


def sync_demo() -> int:
    robot = URRobot(HOST, frequency_hz=FREQUENCY_HZ, fields=FIELDS, writes=WRITES)
    robot.start()
    try:
        print("host:", robot.host)
        print("frequency [Hz]:", robot.frequency_hz)
        print("controller version:", robot.controller_version)
        print("fields:", robot.fields)
        print("writes:", robot.writes)
        print()

        for name in FIELDS:
            try:
                print(f"{name} =", robot[name])
            except Exception as exc:
                print(f"{name} = <error: {exc}>")

        if "di" in FIELDS:
            print("digital input 0 =", robot.digital_input(0))
        if "do" in FIELDS:
            print("digital output 0 =", robot.digital_output(0))

        if WRITES:
            print()
            print("write/read demo:")
            for name in WRITES:
                if name.startswith("gp.int."):
                    robot[name] = 123456
                    time.sleep(min(0.1, max(0.01, 2.0 / robot.frequency_hz)))
                    print(f"{name} ->", robot[name])
                elif name.startswith("gp.double."):
                    robot[name] = 12.5
                    time.sleep(min(0.1, max(0.01, 2.0 / robot.frequency_hz)))
                    print(f"{name} ->", robot[name])
                elif name.startswith("gp.bit."):
                    robot[name] = True
                    time.sleep(min(0.1, max(0.01, 2.0 / robot.frequency_hz)))
                    print(f"{name} ->", robot[name])
                else:
                    print(f"skip unsupported sample write field: {name}")

        print()
        print("next 3 frames:")
        last_index = robot.frame_index
        for _ in range(3):
            frame = robot.wait_next_frame(last_frame_index=last_index, timeout=1.0)
            last_index = frame.frame_index
            values = [f"t={frame.get('time', 'n/a')}"]
            if robot.has("q"):
                values.append(f"q0={frame['q'][0]}")
            if robot.has("tcp"):
                values.append(f"tcp_x={frame['tcp'][0]}")
            values.append(f"age_ms={round(frame.age_ms(), 3)}")
            print("  ", "  ".join(values))
            if robot.frequency_hz < 100.0:
                time.sleep(0.05)
        return 0
    finally:
        robot.stop()
        robot.close()


async def async_demo() -> int:
    robot = URRobot(HOST, frequency_hz=FREQUENCY_HZ, fields=FIELDS, writes=WRITES)
    await robot.start_async()
    try:
        print("async demo")
        print("q0 =", robot["q"][0] if robot.has("q") else "n/a")
        if WRITES and WRITES[0].startswith("gp.int."):
            robot[WRITES[0]] = 7
            await asyncio.sleep(0.05)
            print(f"{WRITES[0]} =", robot[WRITES[0]])
        frame = await robot.wait_next_frame_async(last_frame_index=robot.frame_index, timeout=1.0)
        print("next frame age_ms =", round(frame.age_ms(), 3))
        return 0
    finally:
        await robot.close_async()


if __name__ == "__main__":
    if RUN_ASYNC_DEMO:
        raise SystemExit(asyncio.run(async_demo()))
    raise SystemExit(sync_demo())
