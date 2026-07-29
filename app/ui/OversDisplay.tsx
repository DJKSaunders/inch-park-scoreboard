"use client";

import { formatOvers } from "../lib/matches";
import { useScoreboard } from "./useScoreboard";

export function OversDisplay() {
  const { state, loaded } = useScoreboard();

  if (!loaded || !state.matchId) {
    return (
      <main className="display-page display-idle" aria-label="Scoreboard idle" />
    );
  }

  const overs = formatOvers(state.completedOvers, state.balls);

  return (
    <main className="display-page" aria-label={`${overs} overs`}>
      <div className="display-value overs-value pixel-shift">{overs}</div>
    </main>
  );
}
