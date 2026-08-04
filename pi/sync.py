#!/usr/bin/env python3
"""Receive retained AWS IoT score updates and apply them to the local Pi server."""

from __future__ import annotations

import json
import os
import ssl
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required configuration: {name}")
    return value


ENDPOINT = required("SCOREBOARD_IOT_ENDPOINT")
TOPIC = required("SCOREBOARD_IOT_TOPIC")
CLIENT_ID = os.environ.get("SCOREBOARD_IOT_CLIENT_ID", "inch-park-scoreboard-pi")
CERTIFICATE = Path(required("SCOREBOARD_IOT_CERTIFICATE"))
PRIVATE_KEY = Path(required("SCOREBOARD_IOT_PRIVATE_KEY"))
ROOT_CA = Path(required("SCOREBOARD_IOT_ROOT_CA"))
LOCAL_API = os.environ.get("SCOREBOARD_LOCAL_SYNC_API", "http://127.0.0.1:8080/api/remote-state")
LOCAL_TOKEN = required("SCOREBOARD_SYNC_TOKEN")
PORT = int(os.environ.get("SCOREBOARD_IOT_PORT", "443"))


def apply_local(payload: bytes) -> None:
    state = json.loads(payload)
    request = Request(
        LOCAL_API,
        data=json.dumps(state, separators=(",", ":")).encode(),
        method="POST",
        headers={
            "content-type": "application/json",
            "x-scoreboard-sync-token": LOCAL_TOKEN,
        },
    )
    try:
        with urlopen(request, timeout=5) as response:
            result = json.loads(response.read())
            print(f"Applied remote score revision {result['revision']}", flush=True)
    except HTTPError as error:
        if error.code == 409:
            print("Ignored an older or duplicate remote score revision.", flush=True)
            return
        raise


def main() -> None:
    try:
        import paho.mqtt.client as mqtt
    except ModuleNotFoundError as error:
        raise SystemExit("Install python3-paho-mqtt before starting scoreboard sync.") from error

    try:
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=CLIENT_ID)
    except (AttributeError, TypeError):
        client = mqtt.Client(client_id=CLIENT_ID)

    context = ssl.create_default_context(cafile=str(ROOT_CA))
    context.load_cert_chain(str(CERTIFICATE), str(PRIVATE_KEY))
    if PORT == 443:
        context.set_alpn_protocols(["x-amzn-mqtt-ca"])
    client.tls_set_context(context)

    def on_connect(connected_client, _userdata, _flags, reason_code, _properties=None):
        # Paho 2.x supplies a ReasonCode object; older releases supply an int.
        numeric_reason = getattr(reason_code, "value", reason_code)
        if numeric_reason != 0:
            print(f"AWS IoT connection rejected: {reason_code}", file=sys.stderr, flush=True)
            return
        print("Connected to AWS IoT; waiting for scoreboard updates.", flush=True)
        connected_client.subscribe(TOPIC, qos=1)

    def on_message(_client, _userdata, message):
        try:
            apply_local(message.payload)
        except (ValueError, KeyError, HTTPError, URLError) as error:
            print(f"Could not apply scoreboard update: {error}", file=sys.stderr, flush=True)

    client.on_connect = on_connect
    client.on_message = on_message
    client.reconnect_delay_set(min_delay=2, max_delay=60)

    while True:
        try:
            client.connect(ENDPOINT, PORT, keepalive=60)
            client.loop_forever(retry_first_connection=True)
        except (OSError, ValueError) as error:
            print(f"AWS IoT connection failed: {error}; retrying in 15 seconds.", file=sys.stderr, flush=True)
            time.sleep(15)


if __name__ == "__main__":
    main()
