import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("defines the admin, scoring and paired display routes", async () => {
  const [admin, scoring, score, overs, loading] = await Promise.all([
    source("app/ui/AdminConsole.tsx"),
    source("app/ui/ScoringConsole.tsx"),
    source("app/score/page.tsx"),
    source("app/overs/page.tsx"),
    source("app/loading/page.tsx"),
  ]);

  assert.match(admin, /Choose the featured match/);
  assert.match(admin, /Display this match/);
  assert.match(admin, /Open scoreboard control/);
  assert.match(admin, /href="\/scoring"[\s\S]*?target="_blank"/);
  assert.match(scoring, /runActions/);
  assert.match(scoring, /Wide \+1/);
  assert.match(scoring, /No ball \+1/);
  assert.match(scoring, /Undo last action/);
  assert.match(scoring, /window\.addEventListener\("keydown"/);
  assert.match(scoring, /Type RESET/);
  assert.match(scoring, /Manual override/);
  assert.match(scoring, /Start second innings/);
  assert.match(scoring, /role="dialog"/);
  assert.match(score, /ScoreDisplay/);
  assert.match(overs, /OversDisplay/);
  assert.match(loading, /Welcome to Inch Park/);
  assert.match(loading, /fetch\("\/api\/state"/);
  assert.match(loading, /location\.replace\("\/score\/"/);
});

test("starts the Pi kiosk with a service-aware branded screen", async () => {
  const [installer, launcher, loading] = await Promise.all([
    source("pi/install.sh"),
    source("pi/start-scoreboard.sh"),
    source("github-pages/loading/index.html"),
  ]);

  assert.match(installer, /START_PATH=.*loading/);
  assert.match(launcher, /curl --fail --silent --max-time 2/);
  assert.match(launcher, /--app="\$START_URL"/);
  assert.match(loading, /Welcome to Inch Park/);
  assert.match(loading, /fetch\("\/api\/state"/);
  assert.match(loading, /location\.replace\("\/score\/"/);
});

test("keeps the long-distance displays label-free and protected", async () => {
  const [score, overs, css] = await Promise.all([
    source("app/ui/ScoreDisplay.tsx"),
    source("app/ui/OversDisplay.tsx"),
    source("app/globals.css"),
  ]);

  assert.doesNotMatch(score, />RUNS</i);
  assert.doesNotMatch(score, />WICKETS</i);
  assert.doesNotMatch(score, /className="slash"/);
  assert.match(score, /score-diagonal pixel-shift/);
  assert.match(score, /score-runs/);
  assert.match(score, /score-wickets/);
  assert.match(score, /<small>FOR<\/small>/);
  assert.match(score, /state\.runs >= 200/);
  assert.doesNotMatch(overs, />OVERS</i);
  assert.match(css, /\.pixel-shift/);
  assert.match(css, /height:\s*100vh/);
  assert.match(css, /font-variant-numeric:\s*tabular-nums/);
  assert.match(css, /"Chakra Petch"/);
  assert.match(css, /font-kerning:\s*normal/);
  assert.match(css, /\.display-page \*[\s\S]*cursor:\s*none/);
  assert.match(css, /\.score-runs[\s\S]*font-size:\s*min\(94vh,\s*49vw\)/);
  assert.match(css, /\.score-runs[\s\S]*left:\s*0\.7vw/);
  assert.match(css, /\.score-diagonal\.crowded \.score-runs/);
  assert.match(css, /\.score-diagonal\.crowded \.score-wickets/);
  assert.match(css, /\.score-wickets[\s\S]*font-size:\s*min\(72vh,\s*34vw\)/);
  assert.match(css, /\.score-wickets[\s\S]*color:\s*var\(--green-bright\)/);
  assert.match(css, /\.score-wickets[\s\S]*right:\s*0\.7vw/);
});

test("declares durable scoreboard state, innings and undo storage", async () => {
  const [hosting, firstMigration, secondMigration, inningsMigration, database] =
    await Promise.all([
      source(".openai/hosting.json"),
      source("drizzle/0000_lying_steel_serpent.sql"),
      source("drizzle/0001_sparkling_ultragirl.sql"),
      source("drizzle/0002_tiresome_calypso.sql"),
      source("app/lib/scoreboard-db.ts"),
    ]);

  assert.match(hosting, /"d1": "DB"/);
  assert.match(firstMigration, /CREATE TABLE `scoreboard_state`/);
  assert.match(secondMigration, /CREATE TABLE `scoreboard_undo`/);
  assert.match(inningsMigration, /ADD `innings` integer DEFAULT 1 NOT NULL/);
  assert.match(database, /scoreDelivery/);
  assert.match(database, /legalBall/);
  assert.match(database, /undoLastScore/);
  assert.match(database, /startSecondInnings/);
  assert.match(database, /resetScore/);
});
