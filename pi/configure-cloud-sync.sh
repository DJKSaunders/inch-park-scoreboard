#!/usr/bin/env bash

set -euo pipefail

ENDPOINT=""
TOPIC=""
CERTIFICATE=""
PRIVATE_KEY=""
ROOT_CA=""

usage() {
  cat <<'EOF'
Usage: ./configure-cloud-sync.sh \
  --endpoint IOT_ENDPOINT \
  --topic MQTT_TOPIC \
  --certificate DEVICE_CERTIFICATE \
  --private-key DEVICE_PRIVATE_KEY \
  --root-ca AMAZON_ROOT_CA
EOF
}

while (($#)); do
  case "$1" in
    --endpoint) ENDPOINT="${2:-}"; shift 2 ;;
    --topic) TOPIC="${2:-}"; shift 2 ;;
    --certificate) CERTIFICATE="${2:-}"; shift 2 ;;
    --private-key) PRIVATE_KEY="${2:-}"; shift 2 ;;
    --root-ca) ROOT_CA="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ -z $ENDPOINT || -z $TOPIC || -z $CERTIFICATE || -z $PRIVATE_KEY || -z $ROOT_CA ]]; then
  usage >&2
  exit 2
fi

for credential_file in "$CERTIFICATE" "$PRIVATE_KEY" "$ROOT_CA"; do
  if [[ ! -f $credential_file ]]; then
    echo "Credential file not found: $credential_file" >&2
    exit 1
  fi
done

INSTALL_DIR="$HOME/.local/share/inch-park-scoreboard"
CONFIG_DIR="$HOME/.config/inch-park-scoreboard"
CERT_DIR="$CONFIG_DIR/certs"
SYSTEMD_DIR="$HOME/.config/systemd/user"
SERVER_ENV="$CONFIG_DIR/server.env"

if [[ ! -x $INSTALL_DIR/sync.py || ! -r $SERVER_ENV ]]; then
  echo "Install the base scoreboard before configuring cloud sync." >&2
  exit 1
fi

SYNC_TOKEN="$(sed -n 's/^SCOREBOARD_SYNC_TOKEN=//p' "$SERVER_ENV")"
if [[ -z $SYNC_TOKEN ]]; then
  echo "The base scoreboard does not have a local synchronisation token. Re-run its installer." >&2
  exit 1
fi

sudo apt-get update
sudo apt-get install -y python3-paho-mqtt

mkdir -p "$CERT_DIR" "$SYSTEMD_DIR"
install -m 0600 "$CERTIFICATE" "$CERT_DIR/device-certificate.pem.crt"
install -m 0600 "$PRIVATE_KEY" "$CERT_DIR/device-private.pem.key"
install -m 0644 "$ROOT_CA" "$CERT_DIR/AmazonRootCA1.pem"

cat >"$CONFIG_DIR/sync.env" <<EOF
SCOREBOARD_IOT_ENDPOINT=$ENDPOINT
SCOREBOARD_IOT_TOPIC=$TOPIC
SCOREBOARD_IOT_CLIENT_ID=inch-park-scoreboard-pi
SCOREBOARD_IOT_PORT=443
SCOREBOARD_IOT_CERTIFICATE=$CERT_DIR/device-certificate.pem.crt
SCOREBOARD_IOT_PRIVATE_KEY=$CERT_DIR/device-private.pem.key
SCOREBOARD_IOT_ROOT_CA=$CERT_DIR/AmazonRootCA1.pem
SCOREBOARD_LOCAL_SYNC_API=http://127.0.0.1:8080/api/remote-state
SCOREBOARD_SYNC_TOKEN=$SYNC_TOKEN
EOF
chmod 0600 "$CONFIG_DIR/sync.env"

cat >"$SYSTEMD_DIR/inch-park-scoreboard-sync.service" <<EOF
[Unit]
Description=Inch Park AWS IoT score synchronisation
After=network-online.target inch-park-scoreboard.service
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=$CONFIG_DIR/sync.env
ExecStart=/usr/bin/python3 $INSTALL_DIR/sync.py
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now inch-park-scoreboard-sync.service

echo "AWS IoT scoreboard synchronisation is enabled."
echo "Check it with: systemctl --user status inch-park-scoreboard-sync.service"
