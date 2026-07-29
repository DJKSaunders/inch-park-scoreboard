"use client";

import { useState } from "react";
import { formatOvers, type ScoreboardState } from "../lib/matches";
import { useScoreboard } from "./useScoreboard";

type ScoringAction = {
  label: string;
  shortLabel?: string;
  detail?: string;
  runsAdded: number;
  legalBall: boolean;
  wicketAdded?: boolean;
};

const runActions: ScoringAction[] = [0, 1, 2, 3, 4, 6].map((runs) => ({
  label: `${runs} run${runs === 1 ? "" : "s"}`,
  shortLabel: String(runs),
  runsAdded: runs,
  legalBall: true,
}));

const extraActions: ScoringAction[] = [
  { label: "Wide +1", shortLabel: "WD", detail: "+1", runsAdded: 1, legalBall: false },
  { label: "No ball +1", shortLabel: "NB", detail: "+1", runsAdded: 1, legalBall: false },
  { label: "Bye +1", shortLabel: "B", detail: "+1 & ball", runsAdded: 1, legalBall: true },
  { label: "Leg bye +1", shortLabel: "LB", detail: "+1 & ball", runsAdded: 1, legalBall: true },
  { label: "Penalty +5", shortLabel: "P5", detail: "+5", runsAdded: 5, legalBall: false },
];

export function ScoringConsole() {
  const { state, setState, loaded } = useScoreboard(1500);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function post(body: Record<string, unknown>, successMessage: string) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/state", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as ScoreboardState & {
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "Update failed.");
      setState(result);
      setMessage(successMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }

  function score(action: ScoringAction) {
    void post(
      {
        action: "score",
        runsAdded: action.runsAdded,
        wicketAdded: action.wicketAdded ?? false,
        legalBall: action.legalBall,
      },
      action.label,
    );
  }

  const disabled = busy || !loaded || !state.matchId;

  return (
    <main className="scorer-page">
      <header className="scorer-header">
        <a className="scorer-brand" href="/" aria-label="Back to match control">
          <img src="/club-logo.png" alt="" />
          <span>
            <strong>Fallback scorer</strong>
            <small>Edinburgh South CC</small>
          </span>
        </a>
        <span className={`scorer-live${state.matchId ? " is-live" : ""}`}>
          {state.matchId ? "Live" : "No match"}
        </span>
      </header>

      <section className="scorer-score" aria-live="polite">
        <div className="scorer-match">
          {state.matchId
            ? `${state.homeTeam} v ${state.awayTeam}`
            : "Select a match in the control portal"}
        </div>
        <div className="scorer-total">
          <strong>{state.runs}</strong>
          <span>/</span>
          <strong>{state.wickets}</strong>
        </div>
        <div className="scorer-overs">
          {formatOvers(state.completedOvers, state.balls)} overs
        </div>
      </section>

      <section className="scorer-controls" aria-label="Scoring controls">
        <div className="scorer-section-heading">
          <h1>Runs</h1>
          <span>Each records a legal ball</span>
        </div>
        <div className="run-grid">
          {runActions.map((action) => (
            <button
              aria-label={action.label}
              disabled={disabled}
              key={action.shortLabel}
              onClick={() => score(action)}
              type="button"
            >
              {action.shortLabel}
            </button>
          ))}
        </div>

        <button
          className="wicket-button"
          disabled={disabled || state.wickets >= 10}
          onClick={() =>
            score({
              label: "Wicket",
              runsAdded: 0,
              wicketAdded: true,
              legalBall: true,
            })
          }
          type="button"
        >
          Wicket
          <span>+ ball</span>
        </button>

        <div className="scorer-section-heading extras-heading">
          <h2>Extras</h2>
          <span>WD and NB do not add a ball</span>
        </div>
        <div className="extras-grid">
          {extraActions.map((action) => (
            <button
              disabled={disabled}
              key={action.shortLabel}
              onClick={() => score(action)}
              type="button"
            >
              <strong>{action.shortLabel}</strong>
              <span>{action.detail}</span>
            </button>
          ))}
        </div>

        <button
          className="undo-button"
          disabled={disabled}
          onClick={() => void post({ action: "undo" }, "Last action undone")}
          type="button"
        >
          ↶ Undo last action
        </button>
        <p className="scorer-message" role="status">
          {busy ? "Updating scoreboard…" : message}
        </p>
      </section>
    </main>
  );
}
