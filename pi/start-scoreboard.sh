#!/usr/bin/env bash

set -u

CONFIG_DIR="$HOME/.config/inch-park-scoreboard"
ENV_FILE="$CONFIG_DIR/scoreboard.env"
RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
LOCK_FILE="$RUNTIME_DIR/inch-park-scoreboard.lock"

if [[ ! -r $ENV_FILE ]]; then
  echo "Missing configuration: $ENV_FILE" >&2
  exit 1
fi

# shellcheck source=/dev/null
source "$ENV_FILE"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "The scoreboard launcher is already running."
  exit 0
fi

START_PATH="${START_PATH:-/loading/}"
START_URL="${BASE_URL%/}${START_PATH}"
OVERS_URL="${BASE_URL%/}${OVERS_PATH}"
STATE_URL="${BASE_URL%/}/api/state"

mkdir -p \
  "$HOME/.config/chromium-inch-park-score" \
  "$HOME/.config/chromium-inch-park-overs"

# Allow networking and display discovery to settle after automatic login.
for _ in {1..30}; do
  if wlr-randr >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

OUTPUTS="$(wlr-randr 2>/dev/null || true)"
HAS_HDMI_1=false
HAS_HDMI_2=false

if grep -q '^HDMI-A-1 ' <<<"$OUTPUTS"; then
  HAS_HDMI_1=true
  wlr-randr --output HDMI-A-1 --on --mode 1920x1080 --pos 0,0 2>/dev/null || true
fi

if grep -q '^HDMI-A-2 ' <<<"$OUTPUTS"; then
  HAS_HDMI_2=true
  wlr-randr --output HDMI-A-2 --on --mode 1920x1080 --pos 1920,0 2>/dev/null || true
fi

# Do not expose Chromium's connection-error page while the local service starts.
attempt=0
until /usr/bin/curl --fail --silent --max-time 2 "$STATE_URL" >/dev/null 2>&1; do
  ((attempt += 1))
  if ((attempt % 10 == 0)); then
    echo "Waiting for the local scoreboard service ($attempt seconds)…"
  fi
  sleep 1
done

COMMON_FLAGS=(
  --app-auto-launched
  --disable-component-update
  --disable-features=Translate,MediaRouter,OptimizationHints
  --disable-infobars
  --disable-session-crashed-bubble
  --kiosk
  --no-default-browser-check
  --no-first-run
  --noerrdialogs
  --ozone-platform=x11
  --password-store=basic
  --start-fullscreen
)

if $HAS_HDMI_1; then
  /usr/bin/lwrespawn /usr/bin/chromium \
    "${COMMON_FLAGS[@]}" \
    --class=inch-park-score \
    --user-data-dir="$HOME/.config/chromium-inch-park-score" \
    --app="$START_URL" &
elif $HAS_HDMI_2; then
  # A single screen connected to the second socket still displays the main score.
  /usr/bin/lwrespawn /usr/bin/chromium \
    "${COMMON_FLAGS[@]}" \
    --class=inch-park-score \
    --user-data-dir="$HOME/.config/chromium-inch-park-score" \
    --app="$START_URL" &
else
  echo "No HDMI display is connected; Chromium was not started."
  exit 0
fi

if $HAS_HDMI_1 && $HAS_HDMI_2; then
  sleep 2
  /usr/bin/lwrespawn /usr/bin/chromium \
    "${COMMON_FLAGS[@]}" \
    --class=inch-park-overs \
    --user-data-dir="$HOME/.config/chromium-inch-park-overs" \
    --app="$OVERS_URL" &
fi

wait
