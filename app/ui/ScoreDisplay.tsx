"use client";

import { useScoreboard } from "./useScoreboard";

export function ScoreDisplay() {
  const { state, loaded } = useScoreboard();

  if (!loaded || !state.matchId) {
    return (
      <main className="display-page display-idle" aria-label="Scoreboard idle" />
    );
  }

  const compact = state.wickets >= 10 || state.runs >= 1000;

  return (
    <main
      className="display-page"
      aria-label={`${state.runs} runs for ${state.wickets} wickets`}
    >
      <div className={`display-value score-value pixel-shift${compact ? " compact" : ""}`}>
        <span>{state.runs}</span>
        <span className="slash">/</span>
        <span>{state.wickets}</span>
      </div>
    </main>
  );
}
