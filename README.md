# Inch Park Cricket Scoreboard

A two-screen, long-distance cricket scoreboard designed for a Raspberry Pi 4
and paired 1920×1080 landscape LCD displays.

## Live screens

- [Runs and wickets](https://djksaunders.github.io/inch-park-scoreboard/score/)
- [Overs](https://djksaunders.github.io/inch-park-scoreboard/overs/)
- [Mobile scorer](https://djksaunders.github.io/inch-park-scoreboard/scoring/)

The static display and scoring pages are deployed from `github-pages/` by
GitHub Actions. Persistent scoreboard state is supplied by the hosted
`/api/state` service backed by Cloudflare D1.

Anyone can view the display pages. Score-changing API requests require the
shared `SCORER_PASSWORD`, which is stored as a secret runtime environment
variable and is never committed to this repository. The mobile scorer keeps
the supplied password only in the browser tab's session storage.

## Development

Requires Node.js `>=22.13.0` and pnpm.

```bash
pnpm install
pnpm run dev
pnpm run test
```

Scoreboard state is stored in Cloudflare D1. The display pages poll the local
state endpoint, so a temporary PlayHQ outage does not blank the screens.

The mobile scorer advances the ball for normal runs, wickets, byes and
leg-byes. Wides, no-balls and penalty runs do not advance the over.

Keyboard shortcuts mirror the scoring buttons: `0`, `1`, `2`, `3`, `4`, `6`
for legal deliveries; `W`, `N`, `B`, `L`, `P` for extras; `X` for a wicket;
and `U` for undo. The actions menu provides a protected reset, second-innings
transition, and a complete manual override.

## Raspberry Pi kiosk

The `pi/` directory contains the Raspberry Pi 4 kiosk installer, dual-HDMI
launcher, status diagnostics, and installation instructions. The Pi remains a
display client and opens the GitHub Pages display URLs in Chromium kiosk mode.
The application state continues to run on the hosted service.
