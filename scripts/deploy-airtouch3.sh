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

for card in "$SOURCE_DIR"/www/daikin-ac-panel-v*.js "$SOURCE_DIR"/www/daikin-ac-panel.js; do
  [[ -f "$card" ]] || continue
  echo "Deploying dashboard card $(basename "$card")"
  rsync -avz -e "$RSYNC_SSH" "$card" "${HA_USER}@${HA_HOST}:${REMOTE_CONFIG}/www/"
done

echo "Done. Restart Home Assistant (Settings -> System -> Restart), then add the integration via UI."