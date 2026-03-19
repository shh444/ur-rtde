#!/usr/bin/env python3
from __future__ import annotations

from ur_robot import UR_RTDE

# ------------------------------------------------------------
# Edit only this block.
# - frequency: RTDE receive frequency [Hz]
# - field: read fields + writable GP fields together
#   * read examples: "time", "q", "tcp", "runtime"
#   * GP write examples: "gp.int.0", "gp.double.0", "gp.bit.0"
# ------------------------------------------------------------
HOST = "192.168.1.101"
FREQUENCY_HZ = 25
FIELD = ["time", "q", "tcp", "gp.int.0"]
# ------------------------------------------------------------


def main() -> int:
    robot = UR_RTDE(HOST=HOST, FREQUENCY_HZ=FREQUENCY_HZ, FIELD=FIELD)

    robot.start()
    try:
        print("q   =", robot["q"])
        print("tcp =", robot["tcp"])

        # GP write example
        robot["gp.int.0"] = 55
        print("gp.int.0 (before) =", robot["gp.int.0"])
        robot["gp.int.0"] = 33
        print("gp.int.0 (after)  =", robot["gp.int.0"])

        return 0
    finally:
        robot.stop()
        robot.close()


if __name__ == "__main__":
    raise SystemExit(main())
