import { env } from "cloudflare:workers";
import { idleState, matches, type ScoreboardState } from "./matches";

const createStateTable = `
  CREATE TABLE IF NOT EXISTS scoreboard_state (
    id INTEGER PRIMARY KEY,
    match_id TEXT,
    home_team TEXT,
    away_team TEXT,
    venue TEXT,
    start_time TEXT,
    match_status TEXT NOT NULL DEFAULT 'IDLE',
    runs INTEGER NOT NULL DEFAULT 0,
    wickets INTEGER NOT NULL DEFAULT 0,
    completed_overs INTEGER NOT NULL DEFAULT 0,
    balls INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  )
`;

const createUndoTable = `
  CREATE TABLE IF NOT EXISTS scoreboard_undo (
    id INTEGER PRIMARY KEY,
    runs INTEGER NOT NULL DEFAULT 0,
    wickets INTEGER NOT NULL DEFAULT 0,
    completed_overs INTEGER NOT NULL DEFAULT 0,
    balls INTEGER NOT NULL DEFAULT 0,
    available INTEGER NOT NULL DEFAULT 0
  )
`;

type StateRow = {
  match_id: string | null;
  home_team: string | null;
  away_team: string | null;
  venue: string | null;
  start_time: string | null;
  match_status: ScoreboardState["matchStatus"];
  runs: number;
  wickets: number;
  completed_overs: number;
  balls: number;
  updated_at: string;
};

type UndoRow = {
  runs: number;
  wickets: number;
  completed_overs: number;
  balls: number;
  available: number;
};

function getD1() {
  const db = env.DB;
  if (!db) {
    throw new Error("Scoreboard database is unavailable.");
  }
  return db;
}

async function initialise() {
  const db = getD1();
  await db.prepare(createStateTable).run();
  await db.prepare(createUndoTable).run();
  await db
    .prepare(
      `INSERT INTO scoreboard_state (
        id, match_status, runs, wickets, completed_overs, balls, updated_at
      ) VALUES (1, 'IDLE', 0, 0, 0, 0, ?)
      ON CONFLICT(id) DO NOTHING`,
    )
    .bind(new Date().toISOString())
    .run();
  await db
    .prepare(
      `INSERT INTO scoreboard_undo (
        id, runs, wickets, completed_overs, balls, available
      ) VALUES (1, 0, 0, 0, 0, 0)
      ON CONFLICT(id) DO NOTHING`,
    )
    .run();
}

function fromRow(row: StateRow | null): ScoreboardState {
  if (!row) return idleState;
  return {
    matchId: row.match_id,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    venue: row.venue,
    startTime: row.start_time,
    matchStatus: row.match_status,
    runs: row.runs,
    wickets: row.wickets,
    completedOvers: row.completed_overs,
    balls: row.balls,
    updatedAt: row.updated_at,
  };
}

export async function getScoreboardState() {
  await initialise();
  const row = await getD1()
    .prepare("SELECT * FROM scoreboard_state WHERE id = 1")
    .first<StateRow>();
  return fromRow(row);
}

export async function selectMatch(matchId: string) {
  const match = matches.find((candidate) => candidate.id === matchId);
  if (!match) throw new Error("Unknown match.");
  await initialise();
  const updatedAt = new Date().toISOString();
  await getD1()
    .prepare(
      `UPDATE scoreboard_state SET
        match_id = ?, home_team = ?, away_team = ?, venue = ?, start_time = ?,
        match_status = ?, runs = ?, wickets = ?, completed_overs = ?, balls = ?,
        updated_at = ?
      WHERE id = 1`,
    )
    .bind(
      match.id,
      match.homeTeam,
      match.awayTeam,
      match.venue,
      match.startTime,
      match.status,
      match.runs,
      match.wickets,
      match.completedOvers,
      match.balls,
      updatedAt,
    )
    .run();
  return getScoreboardState();
}

export async function updateScore(
  changes: Partial<
    Pick<ScoreboardState, "runs" | "wickets" | "completedOvers" | "balls">
  >,
) {
  const current = await getScoreboardState();
  if (!current.matchId) throw new Error("Select a match first.");

  const next = {
    runs: Math.max(0, Math.min(9999, changes.runs ?? current.runs)),
    wickets: Math.max(0, Math.min(10, changes.wickets ?? current.wickets)),
    completedOvers: Math.max(
      0,
      Math.min(999, changes.completedOvers ?? current.completedOvers),
    ),
    balls: Math.max(0, Math.min(5, changes.balls ?? current.balls)),
  };

  await getD1()
    .prepare(
      `UPDATE scoreboard_state SET
        runs = ?, wickets = ?, completed_overs = ?, balls = ?, updated_at = ?
      WHERE id = 1`,
    )
    .bind(
      next.runs,
      next.wickets,
      next.completedOvers,
      next.balls,
      new Date().toISOString(),
    )
    .run();
  return getScoreboardState();
}

export async function scoreDelivery(input: {
  runsAdded: number;
  wicketAdded: boolean;
  legalBall: boolean;
}) {
  const current = await getScoreboardState();
  if (!current.matchId) throw new Error("Select a match first.");
  if (!Number.isInteger(input.runsAdded) || input.runsAdded < 0 || input.runsAdded > 6) {
    throw new Error("Invalid run value.");
  }

  const nextBall = input.legalBall ? current.balls + 1 : current.balls;
  const completedOvers =
    nextBall === 6 ? current.completedOvers + 1 : current.completedOvers;
  const balls = nextBall === 6 ? 0 : nextBall;
  const runs = Math.min(9999, current.runs + input.runsAdded);
  const wickets = Math.min(
    10,
    current.wickets + (input.wicketAdded ? 1 : 0),
  );

  await getD1().batch([
    getD1()
      .prepare(
        `UPDATE scoreboard_undo SET
          runs = ?, wickets = ?, completed_overs = ?, balls = ?, available = 1
        WHERE id = 1`,
      )
      .bind(
        current.runs,
        current.wickets,
        current.completedOvers,
        current.balls,
      ),
    getD1()
      .prepare(
        `UPDATE scoreboard_state SET
          runs = ?, wickets = ?, completed_overs = ?, balls = ?, updated_at = ?
        WHERE id = 1`,
      )
      .bind(runs, wickets, completedOvers, balls, new Date().toISOString()),
  ]);

  return getScoreboardState();
}

export async function undoLastScore() {
  const current = await getScoreboardState();
  if (!current.matchId) throw new Error("Select a match first.");
  const undo = await getD1()
    .prepare("SELECT * FROM scoreboard_undo WHERE id = 1")
    .first<UndoRow>();
  if (!undo?.available) throw new Error("There is no scoring action to undo.");

  await getD1().batch([
    getD1()
      .prepare(
        `UPDATE scoreboard_state SET
          runs = ?, wickets = ?, completed_overs = ?, balls = ?, updated_at = ?
        WHERE id = 1`,
      )
      .bind(
        undo.runs,
        undo.wickets,
        undo.completed_overs,
        undo.balls,
        new Date().toISOString(),
      ),
    getD1()
      .prepare("UPDATE scoreboard_undo SET available = 0 WHERE id = 1"),
  ]);

  return getScoreboardState();
}

export async function clearScoreboard() {
  await initialise();
  await getD1()
    .prepare(
      `UPDATE scoreboard_state SET
        match_id = NULL, home_team = NULL, away_team = NULL, venue = NULL,
        start_time = NULL, match_status = 'IDLE', runs = 0, wickets = 0,
        completed_overs = 0, balls = 0, updated_at = ?
      WHERE id = 1`,
    )
    .bind(new Date().toISOString())
    .run();
  await getD1()
    .prepare("UPDATE scoreboard_undo SET available = 0 WHERE id = 1")
    .run();
  return getScoreboardState();
}
