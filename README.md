# Inch Park Cricket Scoreboard

A two-screen, long-distance cricket scoreboard designed for a Raspberry Pi 4
and paired 1920×1080 landscape LCD displays.

## Screens

- `/` — admin match selection and local simulation controls
- `/score` — label-free runs/wickets display
- `/overs` — label-free overs display
- `/scoring` — portrait mobile fallback scorer with extras and undo
- `/api/state` — persistent scoreboard state API

The prototype uses mock PlayHQ fixtures until production API credentials,
subscription configuration, and webhook delivery details are supplied.

## Development

Requires Node.js `>=22.13.0` and pnpm.

```bash
pnpm install
pnpm run dev
pnpm run test
```

Scoreboard state is stored in Cloudflare D1. The display pages poll the local
state endpoint, so a temporary PlayHQ outage does not blank the screens.

The fallback scorer advances the ball for normal runs, wickets, byes and
leg-byes. Wides, no-balls and penalty runs do not advance the over.

Keyboard shortcuts mirror the scoring buttons: `0`, `1`, `2`, `3`, `4`, `6`
for legal deliveries; `W`, `N`, `B`, `L`, `P` for extras; `X` for a wicket;
and `U` for undo. The actions menu provides a protected reset, second-innings
transition, and a complete manual override.

## Raspberry Pi kiosk

The `pi/` directory contains the Raspberry Pi 4 kiosk installer, dual-HDMI
launcher, status diagnostics, and installation instructions. The Pi remains a
display client; the application and scoreboard state continue to run on the
hosted service.
