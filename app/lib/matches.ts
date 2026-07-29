export type MatchStatus = "LIVE" | "UPCOMING" | "FINAL";

export type Match = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  venue: string;
  startTime: string;
  status: MatchStatus;
  runs: number;
  wickets: number;
  completedOvers: number;
  balls: number;
};

export const matches: Match[] = [
  {
    id: "inch-park-v-grange",
    homeTeam: "Edinburgh South",
    awayTeam: "Grange",
    venue: "Inch Park · Main Square",
    startTime: "Today · 13:00",
    status: "LIVE",
    runs: 187,
    wickets: 6,
    completedOvers: 37,
    balls: 4,
  },
  {
    id: "inch-park-2-v-carlton-3",
    homeTeam: "Edinburgh South 2",
    awayTeam: "Carlton 3",
    venue: "Inch Park · East Square",
    startTime: "Today · 13:30",
    status: "UPCOMING",
    runs: 0,
    wickets: 0,
    completedOvers: 0,
    balls: 0,
  },
  {
    id: "inch-park-women-v-st-boswells",
    homeTeam: "Edinburgh South Women",
    awayTeam: "St Boswells",
    venue: "Inch Park · Main Square",
    startTime: "Tomorrow · 11:00",
    status: "UPCOMING",
    runs: 0,
    wickets: 0,
    completedOvers: 0,
    balls: 0,
  },
];

export type ScoreboardState = {
  matchId: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  venue: string | null;
  startTime: string | null;
  matchStatus: MatchStatus | "IDLE";
  runs: number;
  wickets: number;
  completedOvers: number;
  balls: number;
  updatedAt: string;
};

export const idleState: ScoreboardState = {
  matchId: null,
  homeTeam: null,
  awayTeam: null,
  venue: null,
  startTime: null,
  matchStatus: "IDLE",
  runs: 0,
  wickets: 0,
  completedOvers: 0,
  balls: 0,
  updatedAt: new Date(0).toISOString(),
};

export function formatOvers(completedOvers: number, balls: number) {
  return `${completedOvers}.${balls}`;
}
