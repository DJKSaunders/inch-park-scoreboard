#!/usr/bin/env bash

set -euo pipefail

DEFAULT_BASE_URL="http://127.0.0.1:8080"
BASE_URL="$DEFAULT_BASE_URL"
SCORER_PASSWORD=""
SYNC_TOKEN=""

usage() {
  cat <<'EOF'
Usage: ./pi/install.sh [--base-url URL] [--password PASSWORD]

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
    --password)
      [[ $# -ge 2 ]] || {
        echo "Missing value for --password." >&2
        exit 2
      }
      SCORER_PASSWORD="$2"
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

for required_command in chromium curl labwc openssl wlr-randr raspi-config; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "Required command not found: $required_command" >&2
    exit 1
  fi
done

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
INSTALL_DIR="$HOME/.local/share/inch-park-scoreboard"
CONFIG_DIR="$HOME/.config/inch-park-scoreboard"
LABWC_DIR="$HOME/.config/labwc"
PCMANFM_DIR="$HOME/.config/pcmanfm/default"
SYSTEMD_DIR="$HOME/.config/systemd/user"
BACKUP_DIR="$CONFIG_DIR/backups/$(date +%Y%m%d-%H%M%S)"
SYSTEM_LABWC_AUTOSTART="/etc/xdg/labwc/autostart"

if [[ -r "$CONFIG_DIR/server.env" ]]; then
  SYNC_TOKEN="$(sed -n 's/^SCOREBOARD_SYNC_TOKEN=//p' "$CONFIG_DIR/server.env")"
fi
if [[ -z $SCORER_PASSWORD && -r "$CONFIG_DIR/server.env" ]]; then
  SCORER_PASSWORD="$(sed -n 's/^SCORER_PASSWORD=//p' "$CONFIG_DIR/server.env")"
fi
if [[ -z $SYNC_TOKEN ]]; then
  SYNC_TOKEN="$(openssl rand -hex 32)"
fi
if [[ -z $SCORER_PASSWORD ]]; then
  read -r -s -p "Scoring password: " SCORER_PASSWORD
  echo
fi
if [[ -z $SCORER_PASSWORD || $SCORER_PASSWORD == *$'\n'* ]]; then
  echo "A single-line scoring password is required." >&2
  exit 1
fi

mkdir -p \
  "$INSTALL_DIR/assets" \
  "$CONFIG_DIR" \
  "$LABWC_DIR" \
  "$PCMANFM_DIR" \
  "$SYSTEMD_DIR" \
  "$BACKUP_DIR"

for existing_file in "$LABWC_DIR/autostart" "$LABWC_DIR/rc.xml"; do
  if [[ -f $existing_file ]]; then
    cp -p "$existing_file" "$BACKUP_DIR/"
  fi
done

install -m 0755 "$SCRIPT_DIR/start-scoreboard.sh" "$INSTALL_DIR/start-scoreboard.sh"
install -m 0755 "$SCRIPT_DIR/status.sh" "$INSTALL_DIR/status.sh"
install -m 0755 "$SCRIPT_DIR/server.py" "$INSTALL_DIR/server.py"
install -m 0755 "$SCRIPT_DIR/sync.py" "$INSTALL_DIR/sync.py"
install -m 0755 "$SCRIPT_DIR/configure-cloud-sync.sh" "$INSTALL_DIR/configure-cloud-sync.sh"
rm -rf "$INSTALL_DIR/scoreboard_core"
cp -R "$SCRIPT_DIR/scoreboard_core" "$INSTALL_DIR/scoreboard_core"
find "$INSTALL_DIR/scoreboard_core" -type f -exec chmod 0644 {} +
install -m 0644 \
  "$SCRIPT_DIR/assets/scoreboard-wallpaper.png" \
  "$INSTALL_DIR/assets/scoreboard-wallpaper.png"
mkdir -p "$INSTALL_DIR/web"
cp -R "$PROJECT_DIR/github-pages/." "$INSTALL_DIR/web/"

for output in 0 1; do
  cat >"$PCMANFM_DIR/desktop-items-$output.conf" <<EOF
[*]
wallpaper_mode=crop
wallpaper_common=1
wallpaper=$INSTALL_DIR/assets/scoreboard-wallpaper.png
desktop_bg=#171d63
desktop_fg=#ffffff
desktop_shadow=#171d63
desktop_font=Nunito Sans Light 12
show_wm_menu=0
sort=mtime;ascending;
show_documents=0
show_trash=0
show_mounts=0
EOF
done

# The Raspberry Pi panel would otherwise flash above the wallpaper before the
# kiosk opens. Preserve the desktop process for the branded background, but
# prevent the panel from being started by the system Labwc session.
if grep -Fxq '/usr/bin/lwrespawn /usr/bin/wf-panel-pi &' "$SYSTEM_LABWC_AUTOSTART"; then
  cp -p "$SYSTEM_LABWC_AUTOSTART" "$BACKUP_DIR/system-labwc-autostart"
  sudo sed -i \
    's|^/usr/bin/lwrespawn /usr/bin/wf-panel-pi &$|# Disabled by Inch Park Scoreboard kiosk|' \
    "$SYSTEM_LABWC_AUTOSTART"
fi

{
  printf 'BASE_URL=%q\n' "$BASE_URL"
  printf 'START_PATH=%q\n' "/loading/"
  printf 'SCORE_PATH=%q\n' "/score"
  printf 'OVERS_PATH=%q\n' "/overs"
} >"$CONFIG_DIR/scoreboard.env"
chmod 0600 "$CONFIG_DIR/scoreboard.env"

{
  printf 'SCORER_PASSWORD=%s\n' "$SCORER_PASSWORD"
  printf 'SCOREBOARD_PORT=8080\n'
  printf 'SCOREBOARD_WEB_ROOT=%s\n' "$INSTALL_DIR/web"
  printf 'SCOREBOARD_STATE=%s\n' "$CONFIG_DIR/state.json"
  printf 'SCOREBOARD_SYNC_TOKEN=%s\n' "$SYNC_TOKEN"
} >"$CONFIG_DIR/server.env"
chmod 0600 "$CONFIG_DIR/server.env"

cat >"$SYSTEMD_DIR/inch-park-scoreboard.service" <<EOF
[Unit]
Description=Inch Park local cricket scoreboard
After=network.target

[Service]
Type=simple
EnvironmentFile=$CONFIG_DIR/server.env
ExecStart=/usr/bin/python3 $INSTALL_DIR/server.py
Restart=always
RestartSec=2

[Install]
WantedBy=default.target
EOF

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
systemctl --user daemon-reload
systemctl --user enable inch-park-scoreboard.service
systemctl --user restart inch-park-scoreboard.service

echo
echo "Inch Park Scoreboard kiosk configuration installed."
echo "Base URL: $BASE_URL"
echo "Scoreboard control: http://$(hostname).local:8080/scoring/"
echo "Existing Labwc files, when present, were backed up to:"
echo "  $BACKUP_DIR"
echo
echo "Connect at least one HDMI screen, then reboot with:"
echo "  sudo reboot"
echo
echo "After reboot, inspect the kiosk with:"
echo "  $INSTALL_DIR/status.sh"
