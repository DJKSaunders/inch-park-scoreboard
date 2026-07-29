import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("defines the admin and paired display routes", async () => {
  const [admin, score, overs] = await Promise.all([
    source("app/ui/AdminConsole.tsx"),
    source("app/score/page.tsx"),
    source("app/overs/page.tsx"),
  ]);

  assert.match(admin, /Choose the featured match/);
  assert.match(admin, /Display this match/);
  assert.match(score, /ScoreDisplay/);
  assert.match(overs, /OversDisplay/);
});

test("keeps the long-distance displays label-free and protected", async () => {
  const [score, overs, css] = await Promise.all([
    source("app/ui/ScoreDisplay.tsx"),
    source("app/ui/OversDisplay.tsx"),
    source("app/globals.css"),
  ]);

  assert.doesNotMatch(score, />RUNS</i);
  assert.doesNotMatch(score, />WICKETS</i);
  assert.doesNotMatch(overs, />OVERS</i);
  assert.match(css, /\.pixel-shift/);
  assert.match(css, /height:\s*100vh/);
  assert.match(css, /font-variant-numeric:\s*tabular-nums/);
});

test("declares durable scoreboard state", async () => {
  const [hosting, migration] = await Promise.all([
    source(".openai/hosting.json"),
    source("drizzle/0000_lying_steel_serpent.sql"),
  ]);

  assert.match(hosting, /"d1": "DB"/);
  assert.match(migration, /CREATE TABLE `scoreboard_state`/);
});
