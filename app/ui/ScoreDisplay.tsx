"use client";

import { useScoreboard } from "./useScoreboard";

export function ScoreDisplay() {
  const { state, loaded } = useScoreboard();

  if (!loaded || !state.matchId) {
    return (
      <main className="display-page display-idle" aria-label="Scoreboard idle" />
    );
  }

  const compactRuns = state.runs >= 1000;

  return (
    <main
      className="display-page"
      aria-label={`${state.runs} runs for ${state.wickets} wickets`}
    >
      <div
        className={`score-diagonal pixel-shift${state.runs >= 200 ? " crowded" : ""}`}
      >
        <span className={`score-runs${compactRuns ? " compact" : ""}`}>
          {state.runs}
        </span>
        <span
          className={`score-wickets${state.wickets >= 10 ? " two-digit" : ""}`}
        >
          <small>FOR</small>
          <span>{state.wickets}</span>
        </span>
      </div>
    </main>
  );
}
