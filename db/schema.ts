import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const scoreboardState = sqliteTable("scoreboard_state", {
  id: integer("id").primaryKey(),
  matchId: text("match_id"),
  homeTeam: text("home_team"),
  awayTeam: text("away_team"),
  venue: text("venue"),
  startTime: text("start_time"),
  matchStatus: text("match_status").notNull().default("IDLE"),
  runs: integer("runs").notNull().default(0),
  wickets: integer("wickets").notNull().default(0),
  completedOvers: integer("completed_overs").notNull().default(0),
  balls: integer("balls").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});
