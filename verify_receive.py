#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import os
import time
from typing import Any, Dict, List

from ur_robot import DEFAULT_HOST, URRobot


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify selected RTDE fields and optional write/readback fields")
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--frequency", type=float, default=25.0)
    parser.add_argument("--samples", type=int, default=200)
    parser.add_argument("--outdir", default="verify_out")
    parser.add_argument(
        "--fields",
        nargs="+",
        default=["time", "q", "tcp", "runtime"],
        help="Read fields. Example: --fields time q tcp runtime di",
    )
    parser.add_argument(
        "--writes",
        nargs="*",
        default=[],
        help="Writable fields. Example: --writes gp.int.24 gp.double.24 gp.bit.64",
    )
    args = parser.parse_args()

    os.makedirs(args.outdir, exist_ok=True)
    csv_path = os.path.join(args.outdir, "rtde_verify_samples.csv")
    json_path = os.path.join(args.outdir, "rtde_verify_report.json")

    report: Dict[str, Any] = {
        "host": args.host,
        "frequency_hz": args.frequency,
        "fields": list(args.fields),
        "writes": list(args.writes),
        "samples": args.samples,
        "controller_version": None,
        "received_samples": 0,
        "mean_frequency_hz": None,
        "monotonic_timestamp": True,
        "missing_fields": [],
        "write_readback": {},
    }

    rows: List[Dict[str, Any]] = []
    timestamps: List[float] = []

    with URRobot(args.host, frequency_hz=args.frequency, fields=args.fields, writes=args.writes) as robot:
        robot.start()
        report["controller_version"] = robot.controller_version

        for name in args.writes:
            if name.startswith("gp.int."):
                robot[name] = 123456
                time.sleep(min(0.1, max(0.01, 2.0 / robot.frequency_hz)))
                report["write_readback"][name] = {
                    "written": 123456,
                    "read": robot[name],
                    "ok": robot[name] == 123456,
                }
            elif name.startswith("gp.double."):
                robot[name] = 12.5
                time.sleep(min(0.1, max(0.01, 2.0 / robot.frequency_hz)))
                report["write_readback"][name] = {
                    "written": 12.5,
                    "read": robot[name],
                    "ok": abs(float(robot[name]) - 12.5) < 1e-9,
                }
            elif name.startswith("gp.bit."):
                robot[name] = True
                time.sleep(min(0.1, max(0.01, 2.0 / robot.frequency_hz)))
                report["write_readback"][name] = {
                    "written": True,
                    "read": bool(robot[name]),
                    "ok": bool(robot[name]) is True,
                }

        last_index = robot.frame_index
        previous_robot_time = None
        for _ in range(args.samples):
            frame = robot.wait_next_frame(last_frame_index=last_index, timeout=max(1.0, 5.0 / max(args.frequency, 1.0)))
            last_index = frame.frame_index
            row = {
                "frame_index": frame.frame_index,
                "wall_time": frame.received_wall_time_s,
                "robot_time": frame.robot_timestamp_s,
                "age_ms": round(frame.age_ms(), 6),
            }
            for name in args.fields:
                row[name] = frame.get(name)
            rows.append(row)
            if frame.robot_timestamp_s is not None:
                timestamps.append(float(frame.robot_timestamp_s))
                if previous_robot_time is not None and frame.robot_timestamp_s < previous_robot_time:
                    report["monotonic_timestamp"] = False
                previous_robot_time = frame.robot_timestamp_s

    report["received_samples"] = len(rows)
    if len(timestamps) >= 2:
        deltas = [b - a for a, b in zip(timestamps[:-1], timestamps[1:]) if b >= a]
        if deltas:
            mean_dt = sum(deltas) / len(deltas)
            if mean_dt > 0:
                report["mean_frequency_hz"] = 1.0 / mean_dt

    missing = []
    for name in args.fields:
        if not any(row.get(name) is not None for row in rows):
            missing.append(name)
    report["missing_fields"] = missing

    with open(csv_path, "w", newline="", encoding="utf-8") as fp:
        fieldnames = ["frame_index", "wall_time", "robot_time", "age_ms", *args.fields]
        writer = csv.DictWriter(fp, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)

    with open(json_path, "w", encoding="utf-8") as fp:
        json.dump(report, fp, indent=2, ensure_ascii=False)

    print("saved:", json_path)
    print("saved:", csv_path)
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
