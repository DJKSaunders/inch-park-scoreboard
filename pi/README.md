# Raspberry Pi kiosk

This directory configures a Raspberry Pi 4 running Raspberry Pi OS 64-bit
Desktop as the two-screen Inch Park Scoreboard client.

## Display assignment

- `HDMI-A-1` / HDMI 0: `/score`
- `HDMI-A-2` / HDMI 1: `/overs`

Both outputs are configured as 1920×1080 landscape screens arranged from left
to right. If only one HDMI screen is connected, it displays `/score`. Reboot
after connecting the second screen to start the overs display.

## Install

Connect to the Pi over SSH, clone this repository, and run:

```bash
cd ~/inch-park-scoreboard
./pi/install.sh --password 'choose-a-shared-password'
```

To use a different production hostname:

```bash
./pi/install.sh --base-url https://scoreboard.example.org
```

The installer:

- enables desktop automatic login;
- disables Raspberry Pi OS screen blanking;
- installs the Inch Park graphic as the desktop wallpaper;
- suppresses the Raspberry Pi desktop panel during kiosk startup;
- installs a persistent local web and scoring service on port `8080`;
- shows a club-branded loading screen until that service is ready;
- installs a Labwc autostart entry;
- uses Labwc rules to bind each Chromium window to a specific HDMI output;
- restarts Chromium if it exits; and
- backs up existing user Labwc configuration.

It does not reboot automatically. Connect the required HDMI screens before
running `sudo reboot`.

## Check status

After rebooting:

```bash
~/.local/share/inch-park-scoreboard/status.sh
```

The command reports memory, power warnings, connected display outputs,
Chromium processes, and recent kiosk launcher messages.

## Local addresses

The Pi serves the application and persists its score locally:

- Main display: `http://127.0.0.1:8080/score/`
- Branded startup: `http://127.0.0.1:8080/loading/`
- Overs display: `http://127.0.0.1:8080/overs/`
- Scoreboard control: `http://inch-park-scoreboard.local:8080/scoring/`

Scoreboard control is intended for devices on the same trusted club network.
The shared password is stored only on the Pi with owner-only file permissions.

## AWS IoT synchronisation

`sync.py` is the optional production receiver for remotely submitted score
updates. It makes an outbound certificate-authenticated MQTT connection and
subscribes only to the scoreboard state topic. Incoming messages must contain a
newer valid revision and are passed to a loopback-only local API protected by a
separate generated token.

The receiver is not enabled by the base installer. It should be configured only
after the AWS stack and the Pi's IoT certificate have been created. Until then,
the existing LAN controller and local scoreboard continue working normally.
