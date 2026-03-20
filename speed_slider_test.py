from __future__ import annotations

import argparse
import time
from typing import Sequence

from backend.ur_robot import DEFAULT_HOST, RTDEError, UR_RTDE

HOST = DEFAULT_HOST
FREQUENCY_HZ = 125.0
FIELD = [
    "timestamp",
    "speed_scaling",
    "target_speed_fraction",
    "speed_slider_mask",
    "speed_slider_fraction",
]
FRACTIONS = [0.25, 0.50, 0.75, 1.00]
DWELL_S = 1.0
SETTLE_S = 0.10


def _fmt(value):
    if value is None:
        return "n/a"
    if isinstance(value, float):
        return f"{value:.3f}"
    return str(value)


def _print_state(robot: UR_RTDE, *, label: str) -> None:
    state = robot.speed_slider_state()
    print(
        f"[{label}] "
        f"mask={_fmt(state['speed_slider_mask'])} "
        f"command={_fmt(state['speed_slider_fraction'])} "
        f"speed_scaling={_fmt(state['speed_scaling'])} "
        f"target_speed_fraction={_fmt(state['target_speed_fraction'])}"
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Test RTDE speed slider input fields.")
    parser.add_argument("--host", default=HOST, help=f"Robot IP address (default: {HOST})")
    parser.add_argument("--frequency", type=float, default=FREQUENCY_HZ, help=f"RTDE output frequency in Hz (default: {FREQUENCY_HZ})")
    parser.add_argument(
        "--fractions",
        type=float,
        nargs="+",
        default=FRACTIONS,
        help="One or more target speed slider fractions in [0.0 .. 1.0]",
    )
    parser.add_argument("--dwell", type=float, default=DWELL_S, help=f"Seconds to wait after each update (default: {DWELL_S})")
    parser.add_argument("--settle", type=float, default=SETTLE_S, help=f"Seconds to hold the mask=1 packet before clearing it (default: {SETTLE_S})")
    parser.add_argument(
        "--keep-mask",
        action="store_true",
        help="Keep speed_slider_mask=1 after sending the fraction (normally the script clears it back to 0).",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    fractions: Sequence[float] = [max(0.0, min(1.0, float(value))) for value in args.fractions]

    robot = UR_RTDE(
        HOST=args.host,
        FREQUENCY_HZ=args.frequency,
        FIELD=list(FIELD),
        READBACK_WRITES=True,
    )

    print(f"host: {args.host}")
    print(f"frequency [Hz]: {args.frequency}")
    print(f"fields: {FIELD}")
    print(f"fractions: {list(fractions)}")
    print()

    robot.start()
    try:
        print("controller version:", robot.controller_version)
        _print_state(robot, label="before")
        print()

        for fraction in fractions:
            print(f"setting speed slider -> {fraction:.3f}")
            robot.set_speed_slider(
                fraction,
                settle_s=args.settle,
                release_mask=not args.keep_mask,
            )
            time.sleep(max(0.0, float(args.dwell)))
            _print_state(robot, label=f"after {fraction:.3f}")
            print()

        return 0
    except RTDEError as exc:
        print(f"RTDEError: {exc}")
        return 1
    finally:
        try:
            robot.stop()
        finally:
            robot.close()


if __name__ == "__main__":
    raise SystemExit(main())
