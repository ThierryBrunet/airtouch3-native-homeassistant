#!/usr/bin/env python3
"""Update Daikin A/C Lovelace JS resource via Home Assistant WebSocket API."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys


async def ha_ws_call(ws, msg: dict) -> dict:
    await ws.send(json.dumps(msg))
    while True:
        raw = await ws.recv()
        resp = json.loads(raw)
        if resp.get("id") == msg["id"]:
            return resp


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True, help="Resource URL, e.g. /local/daikin-ac-panel.js?v=24")
    parser.add_argument("--ha-url", default=os.environ.get("HOMEASSISTANT_URL", ""))
    parser.add_argument("--ha-token", default=os.environ.get("HOMEASSISTANT_TOKEN", ""))
    parser.add_argument("--samba-host", default="192.168.31.233")
    args = parser.parse_args()

    ha_url = (args.ha_url or f"http://{args.samba_host}:8123").rstrip("/")
    token = args.ha_token
    if not token:
        print("HOMEASSISTANT_TOKEN is required", file=sys.stderr)
        return 1

    try:
        import websockets
    except ImportError:
        print("Install websockets: python -m pip install websockets", file=sys.stderr)
        return 1

    ws_url = ha_url.replace("https://", "wss://").replace("http://", "ws://") + "/api/websocket"
    target_url = args.url.strip()

    async with websockets.connect(ws_url) as ws:
        await ws.recv()
        await ws.send(json.dumps({"type": "auth", "access_token": token}))
        auth = json.loads(await ws.recv())
        if auth.get("type") != "auth_ok":
            print(f"WebSocket auth failed: {auth}", file=sys.stderr)
            return 1

        listed = await ha_ws_call(ws, {"id": 1, "type": "lovelace/resources"})
        if not listed.get("success"):
            print(f"List failed: {listed}", file=sys.stderr)
            return 1

        resources = listed.get("result") or []
        match = next((r for r in resources if "daikin-ac-panel" in r.get("url", "")), None)
        if match:
            updated = await ha_ws_call(
                ws,
                {
                    "id": 2,
                    "type": "lovelace/resources/update",
                    "resource_id": match["id"],
                    "url": target_url,
                    "res_type": "module",
                },
            )
            if not updated.get("success"):
                print(f"Update failed: {updated}", file=sys.stderr)
                return 1
            print(f"Updated Lovelace resource {match['id']} -> {target_url}")
            return 0

        created = await ha_ws_call(
            ws,
            {
                "id": 2,
                "type": "lovelace/resources/create",
                "url": target_url,
                "res_type": "module",
            },
        )
        if not created.get("success"):
            print(f"Create failed: {created}", file=sys.stderr)
            return 1
        print(f"Created Lovelace resource -> {target_url}")
        return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))