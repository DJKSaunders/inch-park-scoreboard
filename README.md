# Inch Park Cricket Scoreboard

A two-screen, long-distance cricket scoreboard designed for a Raspberry Pi 4
and paired 1920×1080 landscape LCD displays.

## Scoreboard screens

- Branded startup screen: `/loading/`
- Runs and wickets: `/score/`
- Overs: `/overs/`
- Scoreboard control: `/scoring/`

The Raspberry Pi serves the static display and scoring pages from
`github-pages/` and persists scoreboard state locally. This keeps the
scoreboard operational if the ground's internet connection fails.

Anyone on the local network can view the display pages. Score-changing API
requests require the shared `SCORER_PASSWORD`, which is stored only on the Pi
and is never committed to this repository. Scoreboard control keeps the
supplied password only in the browser tab's session storage.

## Development

Requires Node.js `>=22.13.0` and pnpm.

```bash
pnpm install
pnpm run dev
pnpm run test
```

Scoreboard state is stored in Cloudflare D1. The display pages poll the local
state endpoint, so a temporary PlayHQ outage does not blank the screens.

Scoreboard control advances the ball for normal runs, wickets, byes and
leg-byes. Wides, no-balls and penalty runs do not advance the over.

Keyboard shortcuts mirror the scoring buttons: `0`, `1`, `2`, `3`, `4`, `6`
for legal deliveries; `W`, `N`, `B`, `L`, `P` for extras; `X` for a wicket;
and `U` for undo. The actions menu provides a protected reset, second-innings
transition, and a complete manual override.

## Raspberry Pi kiosk

The `pi/` directory contains the Raspberry Pi 4 kiosk installer, local scoring
service, dual-HDMI launcher, status diagnostics, and installation
instructions. At startup, the main display shows the club-branded loading
screen until the local scoring service is ready, then opens the live score.
The GitHub repository remains the source and update host.
