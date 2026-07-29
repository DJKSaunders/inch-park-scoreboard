"use client";

import { useState } from "react";
import { formatOvers, matches, type ScoreboardState } from "../lib/matches";
import { useScoreboard } from "./useScoreboard";

type ApiBody = Record<string, string | number | undefined>;

export function AdminConsole() {
  const { state, setState, loaded } = useScoreboard(1500);
  const [selectedMatchId, setSelectedMatchId] = useState(matches[0].id);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function send(body: ApiBody, successMessage: string) {
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

  function addBall() {
    const nextBall = state.balls + 1;
    void send(
      {
        action: "update",
        completedOvers:
          nextBall === 6 ? state.completedOvers + 1 : state.completedOvers,
        balls: nextBall === 6 ? 0 : nextBall,
      },
      "Legal ball added.",
    );
  }

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <div className="brand">
          <div className="brand-mark">IP</div>
          <div className="brand-copy">
            <strong>Cricket scoreboard</strong>
            <span>Display control</span>
          </div>
        </div>
        <div className="connection-pill">
          <i className="connection-dot" />
          <span>{loaded ? "Display service online" : "Connecting"}</span>
        </div>
      </header>

      <main className="admin-main">
        <div className="admin-heading">
          <div>
            <p className="eyebrow">Main pavilion</p>
            <h1>Choose the featured match</h1>
            <p>Both landscape screens follow the same selection.</p>
          </div>
          <nav className="display-links" aria-label="Display previews">
            <a className="outline-link" href="/score" target="_blank">
              Open score screen
            </a>
            <a className="outline-link" href="/overs" target="_blank">
              Open overs screen
            </a>
          </nav>
        </div>

        <div className="admin-grid">
          <section className="card">
            <div className="card-header">
              <h2>Available fixtures</h2>
              <span className="card-kicker">Simulated PlayHQ data</span>
            </div>

            <div className="match-list">
              {matches.map((match) => (
                <label
                  className={`match-option${selectedMatchId === match.id ? " selected" : ""}`}
                  key={match.id}
                >
                  <input
                    checked={selectedMatchId === match.id}
                    name="featured-match"
                    onChange={() => setSelectedMatchId(match.id)}
                    type="radio"
                    value={match.id}
                  />
                  <span>
                    <span className="match-teams">
                      {match.homeTeam} v {match.awayTeam}
                    </span>
                    <span className="match-meta">
                      {match.startTime} · {match.venue}
                    </span>
                  </span>
                  <span className="match-status">{match.status}</span>
                </label>
              ))}
            </div>

            <button
              className="primary-button"
              disabled={busy}
              onClick={() =>
                void send(
                  { action: "select", matchId: selectedMatchId },
                  "Both screens updated.",
                )
              }
              type="button"
            >
              {busy ? "Updating screens…" : "Display this match"}
            </button>
            <p className="status-message" role="status">
              {message}
            </p>
          </section>

          <section className="card">
            <div className="card-header">
              <h2>Currently displayed</h2>
              <span className="card-kicker">
                {state.matchId ? state.matchStatus : "Idle"}
              </span>
            </div>

            <div className="now-playing">
              <span className="now-playing-label">Paired landscape screens</span>
              {state.matchId ? (
                <>
                  <div className="now-playing-teams">
                    {state.homeTeam} v {state.awayTeam}
                  </div>
                  <div className="now-playing-meta">
                    {state.startTime} · {state.venue}
                  </div>
                  <div className="mini-score">
                    <span>
                      {state.runs}/{state.wickets}
                    </span>
                    <span className="mini-overs">
                      {formatOvers(state.completedOvers, state.balls)}
                    </span>
                  </div>
                </>
              ) : (
                <p className="empty-copy">
                  No match is selected. Both displays are safely blank.
                </p>
              )}
            </div>

            <div className="simulator">
              <h3>Webhook simulator</h3>
              <p>
                Test both screens before PlayHQ credentials are connected.
              </p>
              <div className="control-row">
                <button
                  className="control-button"
                  disabled={!state.matchId || busy}
                  onClick={() =>
                    void send(
                      { action: "update", runs: state.runs + 1 },
                      "Run added.",
                    )
                  }
                  type="button"
                >
                  + Run
                </button>
                <button
                  className="control-button"
                  disabled={!state.matchId || busy || state.wickets >= 10}
                  onClick={() =>
                    void send(
                      { action: "update", wickets: state.wickets + 1 },
                      "Wicket added.",
                    )
                  }
                  type="button"
                >
                  + Wicket
                </button>
                <button
                  className="control-button"
                  disabled={!state.matchId || busy}
                  onClick={addBall}
                  type="button"
                >
                  + Ball
                </button>
              </div>
              <button
                className="control-button"
                disabled={!state.matchId || busy}
                onClick={() =>
                  void send({ action: "clear" }, "Both screens cleared.")
                }
                style={{ marginTop: 8, width: "100%" }}
                type="button"
              >
                Clear both screens
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
