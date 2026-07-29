"use client";

import { useEffect, useState } from "react";
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

type ModalName = "reset" | "innings" | "override" | null;

const runActions: ScoringAction[] = [0, 1, 2, 3, 4, 6].map((runs) => ({
  label: `${runs} run${runs === 1 ? "" : "s"}`,
  shortLabel: String(runs),
  runsAdded: runs,
  legalBall: true,
}));

const extraActions: ScoringAction[] = [
  {
    label: "Wide +1",
    shortLabel: "WD",
    detail: "+1",
    runsAdded: 1,
    legalBall: false,
  },
  {
    label: "No ball +1",
    shortLabel: "NB",
    detail: "+1",
    runsAdded: 1,
    legalBall: false,
  },
  {
    label: "Bye +1",
    shortLabel: "B",
    detail: "+1 & ball",
    runsAdded: 1,
    legalBall: true,
  },
  {
    label: "Leg bye +1",
    shortLabel: "LB",
    detail: "+1 & ball",
    runsAdded: 1,
    legalBall: true,
  },
  {
    label: "Penalty +5",
    shortLabel: "P5",
    detail: "+5",
    runsAdded: 5,
    legalBall: false,
  },
];

export function ScoringConsole() {
  const { state, setState, loaded } = useScoreboard(1500);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [modal, setModal] = useState<ModalName>(null);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [overrideValues, setOverrideValues] = useState({
    runs: "0",
    wickets: "0",
    completedOvers: "0",
    balls: "0",
    innings: "1",
  });

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
      setModal(null);
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

  function openOverride() {
    setOverrideValues({
      runs: String(state.runs),
      wickets: String(state.wickets),
      completedOvers: String(state.completedOvers),
      balls: String(state.balls),
      innings: String(state.innings),
    });
    setModal("override");
  }

  const disabled = busy || !loaded || !state.matchId;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target?.matches("input, select, textarea") ||
        target?.isContentEditable
      ) {
        return;
      }
      if (modal) {
        if (event.key === "Escape") setModal(null);
        return;
      }
      if (disabled || event.repeat) return;

      const runAction = runActions.find(
        (action) => action.shortLabel === event.key,
      );
      if (runAction) {
        event.preventDefault();
        score(runAction);
        return;
      }

      const key = event.key.toLowerCase();
      const extraByKey: Record<string, ScoringAction> = {
        w: extraActions[0],
        n: extraActions[1],
        b: extraActions[2],
        l: extraActions[3],
        p: extraActions[4],
      };
      if (extraByKey[key]) {
        event.preventDefault();
        score(extraByKey[key]);
      } else if (key === "x" && state.wickets < 10) {
        event.preventDefault();
        score({
          label: "Wicket",
          runsAdded: 0,
          wicketAdded: true,
          legalBall: true,
        });
      } else if (key === "u") {
        event.preventDefault();
        void post({ action: "undo" }, "Last action undone");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <main className="scorer-page">
      <header className="scorer-header">
        <a className="scorer-brand" href="/" aria-label="Back to match control">
          <img src="/club-logo.png" alt="" />
          <span>
            <strong>Scoreboard control</strong>
            <small>Edinburgh South CC</small>
          </span>
        </a>
        <span className={`scorer-live${state.matchId ? " is-live" : ""}`}>
          {state.matchId ? `Innings ${state.innings}` : "No match"}
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
        <div className="scorer-action-row">
          <label htmlFor="scoreboard-actions">Manage score</label>
          <select
            disabled={disabled}
            id="scoreboard-actions"
            onChange={(event) => {
              const action = event.target.value;
              event.target.value = "";
              if (action === "override") openOverride();
              if (action === "innings") setModal("innings");
              if (action === "reset") {
                setResetConfirmation("");
                setModal("reset");
              }
            }}
            value=""
          >
            <option value="">Scoreboard actions…</option>
            <option value="override">Manual override</option>
            <option disabled={state.innings >= 2} value="innings">
              Start second innings
            </option>
            <option value="reset">Reset score</option>
          </select>
        </div>

        <div className="scorer-section-heading">
          <h1>Runs</h1>
          <span>Keyboard: 0, 1, 2, 3, 4, 6</span>
        </div>
        <div className="run-grid">
          {runActions.map((action) => (
            <button
              aria-label={`${action.label}; keyboard ${action.shortLabel}`}
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
          <span>+ ball · keyboard X</span>
        </button>

        <div className="scorer-section-heading extras-heading">
          <h2>Extras</h2>
          <span>Keys: W, N, B, L, P</span>
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
          ↶ Undo last action <span>Keyboard U</span>
        </button>
        <p className="scorer-message" role="status">
          {busy ? "Updating scoreboard…" : message}
        </p>
      </section>

      {modal && (
        <div
          aria-label={
            modal === "override"
              ? "Manual scoreboard override"
              : modal === "innings"
                ? "Start second innings"
                : "Reset score"
          }
          aria-modal="true"
          className="modal-backdrop"
          role="dialog"
        >
          <section className="score-modal">
            <button
              aria-label="Close"
              className="modal-close"
              onClick={() => setModal(null)}
              type="button"
            >
              ×
            </button>

            {modal === "reset" && (
              <>
                <p className="modal-eyebrow">Destructive action</p>
                <h2>Reset the scoreboard?</h2>
                <p>
                  This returns the match to the first innings at 0/0 after 0.0
                  overs. Type <strong>RESET</strong> to confirm.
                </p>
                <label className="modal-field">
                  Confirmation
                  <input
                    autoComplete="off"
                    autoFocus
                    onChange={(event) =>
                      setResetConfirmation(event.target.value)
                    }
                    placeholder="Type RESET"
                    value={resetConfirmation}
                  />
                </label>
                <button
                  className="modal-danger"
                  disabled={busy || resetConfirmation !== "RESET"}
                  onClick={() =>
                    void post(
                      { action: "reset", confirmation: resetConfirmation },
                      "Scoreboard reset",
                    )
                  }
                  type="button"
                >
                  Reset score
                </button>
              </>
            )}

            {modal === "innings" && (
              <>
                <p className="modal-eyebrow">Innings control</p>
                <h2>Start the second innings?</h2>
                <p>
                  The live score will return to 0/0 after 0.0 overs and the
                  innings indicator will change to 2.
                </p>
                <div className="modal-actions">
                  <button onClick={() => setModal(null)} type="button">
                    Cancel
                  </button>
                  <button
                    className="modal-primary"
                    disabled={busy}
                    onClick={() =>
                      void post(
                        { action: "next_innings" },
                        "Second innings started",
                      )
                    }
                    type="button"
                  >
                    Start second innings
                  </button>
                </div>
              </>
            )}

            {modal === "override" && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void post(
                    {
                      action: "update",
                      runs: Number(overrideValues.runs),
                      wickets: Number(overrideValues.wickets),
                      completedOvers: Number(overrideValues.completedOvers),
                      balls: Number(overrideValues.balls),
                      innings: Number(overrideValues.innings),
                    },
                    "Manual score applied",
                  );
                }}
              >
                <p className="modal-eyebrow">Manual control</p>
                <h2>Override scoreboard</h2>
                <p>Change every live scoreboard value, then apply once.</p>
                <div className="override-grid">
                  <label className="modal-field">
                    Runs
                    <input
                      max="9999"
                      min="0"
                      onChange={(event) =>
                        setOverrideValues({
                          ...overrideValues,
                          runs: event.target.value,
                        })
                      }
                      required
                      type="number"
                      value={overrideValues.runs}
                    />
                  </label>
                  <label className="modal-field">
                    Wickets
                    <select
                      onChange={(event) =>
                        setOverrideValues({
                          ...overrideValues,
                          wickets: event.target.value,
                        })
                      }
                      value={overrideValues.wickets}
                    >
                      {Array.from({ length: 11 }, (_, value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="modal-field">
                    Completed overs
                    <input
                      max="999"
                      min="0"
                      onChange={(event) =>
                        setOverrideValues({
                          ...overrideValues,
                          completedOvers: event.target.value,
                        })
                      }
                      required
                      type="number"
                      value={overrideValues.completedOvers}
                    />
                  </label>
                  <label className="modal-field">
                    Balls
                    <select
                      onChange={(event) =>
                        setOverrideValues({
                          ...overrideValues,
                          balls: event.target.value,
                        })
                      }
                      value={overrideValues.balls}
                    >
                      {Array.from({ length: 6 }, (_, value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="modal-field">
                    Innings
                    <select
                      onChange={(event) =>
                        setOverrideValues({
                          ...overrideValues,
                          innings: event.target.value,
                        })
                      }
                      value={overrideValues.innings}
                    >
                      <option value="1">First</option>
                      <option value="2">Second</option>
                    </select>
                  </label>
                </div>
                <button
                  className="modal-primary modal-submit"
                  disabled={busy}
                  type="submit"
                >
                  Apply manual score
                </button>
              </form>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
