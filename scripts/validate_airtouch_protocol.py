#!/usr/bin/env python3
"""Validate native AirTouch 3 TCP protocol against a live controller."""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROTOCOL = ROOT / "airtouch3_custom_component" / "protocol"
sys.path.insert(0, str(PROTOCOL.parent))

from protocol import AirTouchMessages, AirTouchTcpClient  # noqa: E402


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="192.168.31.144", help="AirTouch controller IP")
    parser.add_argument("--port", type=int, default=8899, help="AirTouch TCP port")
    parser.add_argument("--timeout", type=float, default=15.0, help="Connection timeout (s)")
    args = parser.parse_args()

    client = AirTouchTcpClient(args.host, args.port, args.timeout)
    messages = AirTouchMessages()
    try:
        aircon = await client.fetch_aircon(messages.get_init_msg())
        if aircon is None:
            print("FAIL: No data received from controller", file=sys.stderr)
            return 1

        snapshot = {
            "name": aircon.name,
            "airtouch_id": aircon.airtouch_id,
            "power": aircon.power_status,
            "mode": aircon.mode,
            "fan_mode": aircon.fan_mode,
            "desired_temperature": aircon.desired_temperature,
            "room_temperature": aircon.room_temperature,
            "zones": [
                {
                    "id": zone.id,
                    "name": zone.name,
                    "status": zone.status,
                    "fan_value": zone.fan_value,
                    "desired_temperature": zone.desired_temperature,
                }
                for zone in aircon.zones
            ],
            "sensors": [
                {
                    "id": sensor.id,
                    "temperature": sensor.temperature,
                    "is_available": sensor.is_available,
                    "is_low_battery": sensor.is_low_battery,
                }
                for sensor in aircon.sensors
                if sensor.is_available
            ],
        }
        print(json.dumps(snapshot, indent=2))
        active_sensors = sum(1 for sensor in aircon.sensors if sensor.is_available)
        print(
            f"\nOK: {aircon.name} — {len(aircon.zones)} zones, "
            f"{active_sensors} active sensors"
        )
        return 0
    finally:
        await client.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))