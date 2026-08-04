#!/usr/bin/env bash

set -u

echo "INCH PARK SCOREBOARD STATUS"
echo
hostnamectl --static
echo
echo "Memory:"
free -h
echo
echo "Power:"
vcgencmd get_throttled 2>/dev/null || echo "Power status unavailable"
echo
echo "Local service:"
systemctl --user --no-pager --full status inch-park-scoreboard.service 2>/dev/null |
  sed -n '1,8p' || echo "Local service is not installed"
echo
echo "Local API:"
curl -fsS http://127.0.0.1:8080/api/state 2>/dev/null ||
  echo "Local API is unavailable"
echo
echo "AWS IoT sync:"
systemctl --user --no-pager --full status inch-park-scoreboard-sync.service 2>/dev/null |
  sed -n '1,8p' || echo "AWS IoT sync is not configured"
echo
echo "Display connectors:"
for connector_status in /sys/class/drm/card*-*/status; do
  connector_name="${connector_status%/status}"
  printf '%s: ' "${connector_name##*/}"
  cat "$connector_status"
done
echo
echo "Chromium processes:"
pgrep -a chromium || echo "Chromium is not running"
echo
echo "Recent kiosk log:"
tail -n 30 "$HOME/.config/inch-park-scoreboard/kiosk.log" 2>/dev/null ||
  echo "No kiosk log has been created yet"
