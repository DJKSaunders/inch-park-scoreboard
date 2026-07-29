#!/usr/bin/env bash

set -euo pipefail

DEFAULT_BASE_URL="https://inch-park-scoreboard.djksaunders.chatgpt.site"
BASE_URL="$DEFAULT_BASE_URL"

usage() {
  cat <<'EOF'
Usage: ./pi/install.sh [--base-url URL]

Installs the Inch Park Scoreboard kiosk configuration for the current user.
The installer does not reboot the Raspberry Pi.
EOF
}

while (($#)); do
  case "$1" in
    --base-url)
      [[ $# -ge 2 ]] || {
        echo "Missing value for --base-url." >&2
        exit 2
      }
      BASE_URL="${2%/}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ $EUID -eq 0 ]]; then
  echo "Run this installer as the scoreboard user, not with sudo." >&2
  exit 1
fi

if [[ ! $BASE_URL =~ ^https?://[^[:space:]]+$ ]]; then
  echo "The base URL must begin with http:// or https://." >&2
  exit 1
fi

for required_command in chromium labwc wlr-randr raspi-config; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "Required command not found: $required_command" >&2
    exit 1
  fi
done

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$HOME/.local/share/inch-park-scoreboard"
CONFIG_DIR="$HOME/.config/inch-park-scoreboard"
LABWC_DIR="$HOME/.config/labwc"
BACKUP_DIR="$CONFIG_DIR/backups/$(date +%Y%m%d-%H%M%S)"

mkdir -p "$INSTALL_DIR" "$CONFIG_DIR" "$LABWC_DIR" "$BACKUP_DIR"

for existing_file in "$LABWC_DIR/autostart" "$LABWC_DIR/rc.xml"; do
  if [[ -f $existing_file ]]; then
    cp -p "$existing_file" "$BACKUP_DIR/"
  fi
done

install -m 0755 "$SCRIPT_DIR/start-scoreboard.sh" "$INSTALL_DIR/start-scoreboard.sh"
install -m 0755 "$SCRIPT_DIR/status.sh" "$INSTALL_DIR/status.sh"

{
  printf 'BASE_URL=%q\n' "$BASE_URL"
  printf 'SCORE_PATH=%q\n' "/score"
  printf 'OVERS_PATH=%q\n' "/overs"
} >"$CONFIG_DIR/scoreboard.env"
chmod 0600 "$CONFIG_DIR/scoreboard.env"

cat >"$LABWC_DIR/autostart" <<EOF
#!/bin/sh
"$INSTALL_DIR/start-scoreboard.sh" >>"$CONFIG_DIR/kiosk.log" 2>&1 &
EOF
chmod 0755 "$LABWC_DIR/autostart"

cat >"$LABWC_DIR/rc.xml" <<'EOF'
<?xml version="1.0"?>
<labwc_config>
  <windowRules>
    <windowRule identifier="inch-park-score">
      <skipTaskbar>yes</skipTaskbar>
      <skipWindowSwitcher>yes</skipWindowSwitcher>
      <fixedPosition>yes</fixedPosition>
      <action name="MoveToOutput" output="HDMI-A-1" />
      <action name="ToggleFullscreen" />
    </windowRule>
    <windowRule identifier="inch-park-overs">
      <skipTaskbar>yes</skipTaskbar>
      <skipWindowSwitcher>yes</skipWindowSwitcher>
      <fixedPosition>yes</fixedPosition>
      <action name="MoveToOutput" output="HDMI-A-2" />
      <action name="ToggleFullscreen" />
    </windowRule>
  </windowRules>
</labwc_config>
EOF

sudo raspi-config nonint do_boot_behaviour B4
sudo raspi-config nonint do_blanking 1

echo
echo "Inch Park Scoreboard kiosk configuration installed."
echo "Base URL: $BASE_URL"
echo "Existing Labwc files, when present, were backed up to:"
echo "  $BACKUP_DIR"
echo
echo "Connect at least one HDMI screen, then reboot with:"
echo "  sudo reboot"
echo
echo "After reboot, inspect the kiosk with:"
echo "  $INSTALL_DIR/status.sh"
