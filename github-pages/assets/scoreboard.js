(() => {
  "use strict";

  const api = `${window.SCOREBOARD_CONFIG.apiBase}/api/state`;
  const view = document.body.dataset.view;
  const $ = (selector) => document.querySelector(selector);
  let state = {
    matchId: null, runs: 0, wickets: 0, completedOvers: 0, balls: 0, innings: 1,
  };
  let busy = false;

  function formatOvers(value = state) {
    return `${value.completedOvers}.${value.balls}`;
  }

  function render(next) {
    state = next;
    if ($("#runs")) $("#runs").textContent = String(state.runs);
    if ($("#wickets")) $("#wickets").textContent = String(state.wickets);
    if ($("#overs")) $("#overs").textContent = formatOvers();
    if ($("#innings")) {
      $("#innings").textContent = state.matchId ? `Innings ${state.innings}` : "Not started";
      $("#innings").classList.toggle("is-live", Boolean(state.matchId));
    }
    if (view === "score") {
      $("#runs").classList.toggle("compact", state.runs >= 1000);
      $("#wickets").classList.toggle("two-digit", state.wickets >= 10);
    }
    try { localStorage.setItem("inch-park-score", JSON.stringify(state)); } catch {}
  }

  async function refresh() {
    try {
      const response = await fetch(api, { cache: "no-store" });
      if (!response.ok) throw new Error("Score service unavailable");
      render(await response.json());
      $("#connection-warning")?.classList.remove("visible");
    } catch {
      $("#connection-warning")?.classList.add("visible");
    }
  }

  function message(text, isError = false) {
    const element = $("#message");
    if (!element) return;
    element.textContent = text;
    element.classList.toggle("error", isError);
  }

  async function post(body, success = "") {
    if (busy) return null;
    const password = sessionStorage.getItem("inch-park-scorer-password");
    if (!password) {
      $("#login-dialog").showModal();
      return null;
    }
    busy = true;
    message("Updating scoreboard…");
    try {
      const response = await fetch(api, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-scoreboard-password": password,
        },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          sessionStorage.removeItem("inch-park-scorer-password");
          $("#login-dialog").showModal();
        }
        throw new Error(result.error || "Update failed.");
      }
      render(result);
      message(success);
      return result;
    } catch (error) {
      message(error.message || "Update failed.", true);
      return null;
    } finally {
      busy = false;
    }
  }

  async function score(runsAdded, legalBall, wicketAdded = false) {
    await post({ action: "score", runsAdded, legalBall, wicketAdded }, wicketAdded ? "Wicket" : "Score updated");
  }

  function actionMarkup(kind) {
    if (kind === "reset") return `
      <p class="eyebrow danger-text">Destructive action</p>
      <h2>Reset the scoreboard?</h2>
      <p>This returns the scoreboard to first innings, 0/0 after 0.0 overs. Type <strong>RESET</strong> to confirm.</p>
      <label>Confirmation<input id="reset-confirmation" autocomplete="off" placeholder="Type RESET" required></label>
      <button class="danger" id="confirm-reset" type="button" disabled>Reset score</button>`;
    if (kind === "innings") return `
      <p class="eyebrow">Innings control</p>
      <h2>Start the second innings?</h2>
      <p>The live score will return to 0/0 after 0.0 overs.</p>
      <button class="primary" id="confirm-innings" type="button">Start second innings</button>`;
    return `
      <p class="eyebrow">Manual control</p>
      <h2>Override scoreboard</h2>
      <div class="override-grid">
        <label>Runs<input id="override-runs" type="number" min="0" max="9999" value="${state.runs}"></label>
        <label>Wickets<select id="override-wickets">${options(0, 10, state.wickets)}</select></label>
        <label>Completed overs<input id="override-overs" type="number" min="0" max="999" value="${state.completedOvers}"></label>
        <label>Balls<select id="override-balls">${options(0, 5, state.balls)}</select></label>
        <label>Innings<select id="override-innings">${options(1, 2, state.innings)}</select></label>
      </div>
      <button class="primary" id="confirm-override" type="button">Apply manual score</button>`;
  }

  function options(from, to, selected) {
    return Array.from({ length: to - from + 1 }, (_, index) => {
      const value = from + index;
      return `<option value="${value}"${value === selected ? " selected" : ""}>${value}</option>`;
    }).join("");
  }

  function openAction(kind) {
    $("#action-content").innerHTML = actionMarkup(kind);
    const dialog = $("#action-dialog");
    dialog.showModal();
    if (kind === "reset") {
      const input = $("#reset-confirmation");
      input.addEventListener("input", () => { $("#confirm-reset").disabled = input.value !== "RESET"; });
      $("#confirm-reset").addEventListener("click", async () => {
        if (await post({ action: "reset", confirmation: input.value }, "Scoreboard reset")) dialog.close();
      });
    } else if (kind === "innings") {
      $("#confirm-innings").addEventListener("click", async () => {
        if (await post({ action: "next_innings" }, "Second innings started")) dialog.close();
      });
    } else {
      $("#confirm-override").addEventListener("click", async () => {
        const result = await post({
          action: "update",
          runs: Number($("#override-runs").value),
          wickets: Number($("#override-wickets").value),
          completedOvers: Number($("#override-overs").value),
          balls: Number($("#override-balls").value),
          innings: Number($("#override-innings").value),
        }, "Manual score applied");
        if (result) dialog.close();
      });
    }
  }

  function initialiseScorer() {
    $("#login-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const password = $("#password").value;
      sessionStorage.setItem("inch-park-scorer-password", password);
      const authenticated = await post({ action: "authenticate" });
      if (!authenticated) {
        $("#login-message").textContent = "Incorrect password.";
        return;
      }
      if (!authenticated.matchId) await post({ action: "start" }, "Scoreboard ready");
      $("#login-message").textContent = "";
      $("#login-dialog").close();
    });

    document.querySelectorAll("[data-score]").forEach((button) => {
      button.addEventListener("click", () => score(Number(button.dataset.score), button.dataset.legal === "true"));
    });
    $("#wicket").addEventListener("click", () => score(0, true, true));
    $("#undo").addEventListener("click", () => post({ action: "undo" }, "Last action undone"));
    $("#manage").addEventListener("change", (event) => {
      if (event.target.value) openAction(event.target.value);
      event.target.value = "";
    });
    window.addEventListener("keydown", (event) => {
      if (event.target.matches("input,select,textarea") || event.repeat || $("dialog[open]")) return;
      const runs = ["0", "1", "2", "3", "4", "6"];
      if (runs.includes(event.key)) return void score(Number(event.key), true);
      const actions = {
        w: [1, false, false], n: [1, false, false], b: [1, true, false],
        l: [1, true, false], p: [5, false, false], x: [0, true, true],
      };
      const action = actions[event.key.toLowerCase()];
      if (action) return void score(...action);
      if (event.key.toLowerCase() === "u") void post({ action: "undo" }, "Last action undone");
    });

    if (!sessionStorage.getItem("inch-park-scorer-password")) $("#login-dialog").showModal();
  }

  try {
    const cached = JSON.parse(localStorage.getItem("inch-park-score"));
    if (cached) render(cached);
  } catch {}
  void refresh();
  window.setInterval(refresh, view === "scoring" ? 1500 : 1000);
  if (view === "scoring") initialiseScorer();
})();
