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
./pi/install.sh
```

To use a different production hostname:

```bash
./pi/install.sh --base-url https://scoreboard.example.org
```

The installer:

- enables desktop automatic login;
- disables Raspberry Pi OS screen blanking;
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

## Current hosting

The Pi is a display client only. It does not run the web application or
database locally. The default display URLs are:

- `https://inch-park-scoreboard.djksaunders.chatgpt.site/score`
- `https://inch-park-scoreboard.djksaunders.chatgpt.site/overs`

The production host currently requires authentication. Authenticate the
persistent Chromium profiles before enabling Raspberry Pi OS's read-only
overlay filesystem.
