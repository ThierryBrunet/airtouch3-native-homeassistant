#!/usr/bin/env bash
# Deploy native AirTouch 3 integration to Home Assistant via SSH + rsync.
# Usage:
#   ./deploy-airtouch3.sh 192.168.31.50
#   HA_USER=root HA_PORT=22 ./deploy-airtouch3.sh homeassistant.local
set -euo pipefail

HA_HOST="${1:-}"
HA_USER="${HA_USER:-root}"
HA_PORT="${HA_PORT:-22}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="${SOURCE_DIR:-$SCRIPT_DIR/../airtouch3_custom_component}"
REMOTE_CONFIG="${REMOTE_CONFIG:-/config}"

if [[ -z "$HA_HOST" ]]; then
  echo "Usage: $0 <ha-host-or-ip>" >&2
  echo "Optional env: HA_USER (default root), HA_PORT (default 22), SOURCE_DIR, REMOTE_CONFIG" >&2
  exit 1
fi

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "Source not found: $SOURCE_DIR" >&2
  exit 1
fi

SSH_OPTS=(-p "$HA_PORT" -o BatchMode=yes)
RSYNC_SSH="ssh -p $HA_PORT"

echo "Deploying $SOURCE_DIR -> ${HA_USER}@${HA_HOST}:${REMOTE_CONFIG}/custom_components/airtouch3"
ssh "${SSH_OPTS[@]}" "${HA_USER}@${HA_HOST}" "mkdir -p '${REMOTE_CONFIG}/custom_components/airtouch3' '${REMOTE_CONFIG}/www'"

rsync -avz --delete \
  --exclude '.git' \
  --exclude '__pycache__' \
  --exclude '*.pyc' \
  --exclude 'at3.PNG' \
  --exclude 'readme.md' \
  -e "$RSYNC_SSH" \
  "$SOURCE_DIR/" "${HA_USER}@${HA_HOST}:${REMOTE_CONFIG}/custom_components/airtouch3/"

PANEL_VERSION_FILE="${PANEL_VERSION_FILE:-daikin-ac-panel-v30.js}"

for card in \
  "$SOURCE_DIR/www/$PANEL_VERSION_FILE" \
  "$SOURCE_DIR"/www/daikin-ac-panel-v*.js \
  "$SOURCE_DIR"/www/daikin-ac-panel.js; do
  [[ -f "$card" ]] || continue
  echo "Deploying dashboard card $(basename "$card")"
  rsync -avz -e "$RSYNC_SSH" "$card" "${HA_USER}@${HA_HOST}:${REMOTE_CONFIG}/www/"
done

if [[ -f "$SOURCE_DIR/www/$PANEL_VERSION_FILE" ]]; then
  echo "Publishing latest panel alias -> $PANEL_VERSION_FILE"
  rsync -avz -e "$RSYNC_SSH" \
    "$SOURCE_DIR/www/$PANEL_VERSION_FILE" \
    "${HA_USER}@${HA_HOST}:${REMOTE_CONFIG}/www/daikin-ac-panel.js"
fi

VERSION_TAG="$(echo "$PANEL_VERSION_FILE" | sed -n 's/.*v\([0-9][0-9]*\).*/\1/p')"
VERSION_TAG="${VERSION_TAG:-0}"
TARGET_URL="/local/daikin-ac-panel.js?v=${VERSION_TAG}"

UPDATER_PS1="${SCRIPT_DIR}/Update-DaikinLovelaceResource.ps1"
UPDATER_PY="${SCRIPT_DIR}/update-daikin-lovelace-resource.py"
if [[ -f "$UPDATER_PS1" ]] && command -v pwsh >/dev/null 2>&1; then
  echo "Updating Lovelace resource via WebSocket (pwsh)"
  pwsh -NoProfile -File "$UPDATER_PS1" -ResourceUrl "$TARGET_URL" -SambaHost "$HA_HOST"
elif [[ -f "$UPDATER_PY" ]] && command -v python3 >/dev/null 2>&1; then
  echo "Updating Lovelace resource via WebSocket (python)"
  python3 "$UPDATER_PY" --url "$TARGET_URL" --samba-host "$HA_HOST"
else
  echo "Warning: WebSocket updater unavailable; syncing storage file only (reload may require HA UI edit)" >&2
fi

RESOURCE_STORE="${HA_USER}@${HA_HOST}:${REMOTE_CONFIG}/.storage/lovelace_resources"
if ssh "${SSH_OPTS[@]}" "${HA_USER}@${HA_HOST}" "test -f '${REMOTE_CONFIG}/.storage/lovelace_resources'"; then
  ssh "${SSH_OPTS[@]}" "${HA_USER}@${HA_HOST}" python3 - "$REMOTE_CONFIG" "$TARGET_URL" <<'PY'
import json, pathlib, sys
config_root, target_url = sys.argv[1], sys.argv[2].strip()
path = pathlib.Path(config_root) / ".storage" / "lovelace_resources"
data = json.loads(path.read_text(encoding="utf-8"))
items = data.get("data", {}).get("items", [])
matched = False
for item in items:
    if "daikin-ac-panel" in item.get("url", ""):
        matched = True
        item["url"] = target_url
if not matched:
    import uuid
    items.append({"id": uuid.uuid4().hex, "url": target_url, "type": "module"})
data["data"]["items"] = items
path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
print(f"Synced Lovelace storage resource -> {target_url}")
PY
fi

echo "Done. Restart Home Assistant (Settings -> System -> Restart), then add the integration via UI."