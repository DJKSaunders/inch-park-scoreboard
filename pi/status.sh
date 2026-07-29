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
