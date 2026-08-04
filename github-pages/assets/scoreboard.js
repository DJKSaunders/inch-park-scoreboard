(() => {
  "use strict";

  const config = window.SCOREBOARD_CONFIG;
  const base = config.apiBase;
  const linkTokenMode = config.authMode === "link-token";
  const credentialKey = linkTokenMode ? "inch-park-control-token" : "inch-park-scorer-password";
  const credentialHeader = linkTokenMode ? "x-scoreboard-token" : "x-scoreboard-password";
  const api = `${base}/api/state`;
  const snapshot = `${base}/state/current.json`;
  const view = document.body.dataset.view;
  const $ = (selector) => document.querySelector(selector);
  let state = {
    schemaVersion: 2,
    revision: 0,
    matchId: "manual",
    runs: 0,
    wickets: 0,
    completedOvers: 0,
    balls: 0,
    innings: 1,
    activeUntil: null,
    sessionActive: false,
  };
  let busy = false;
  let failures = 0;
  let refreshTimer = null;

  function captureLinkToken() {
    if (!linkTokenMode || !window.location.hash.slice(1)) return;
    try {
      const token = decodeURIComponent(window.location.hash.slice(1));
      sessionStorage.setItem(credentialKey, token);
      history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    } catch {}
  }

  async function sha256Hex(value) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function activeAt(value = state, at = Date.now()) {
    const deadline = Date.parse(value.activeUntil || "");
    return Number.isFinite(deadline) && deadline > at;
  }

  function formatOvers(value = state) {
    return `${value.completedOvers}.${value.balls}`;
  }

  function setText(selector, value) {
    const element = $(selector);
    const text = String(value);
    if (element && element.textContent !== text) element.textContent = text;
  }

  function renderSession() {
    if (view !== "scoring") return;
    const active = activeAt();
    const sessionPanel = $("#session-panel");
    const controls = $("#scoring-controls");
    if (sessionPanel) sessionPanel.hidden = active;
    controls?.querySelectorAll("button,select").forEach((element) => {
      element.disabled = !active;
    });
    if ($("#innings")) {
      $("#innings").textContent = active ? `Innings ${state.innings}` : "Paused";
      $("#innings").classList.toggle("is-live", active);
    }
  }

  function render(next) {
    state = {
      ...state,
      ...next,
      revision: Number(next.revision ?? state.revision ?? 0),
    };
    state.sessionActive = activeAt(state);
    setText("#runs", state.runs);
    setText("#wickets", state.wickets);
    setText("#overs", formatOvers());
    if ($("#innings") && view !== "scoring") {
      $("#innings").textContent = state.matchId ? `Innings ${state.innings}` : "Not started";
      $("#innings").classList.toggle("is-live", Boolean(state.matchId));
    }
    if (view === "score") {
      $("#runs").classList.toggle("compact", state.runs >= 1000);
      $("#wicket-block").classList.toggle("two-digit", state.wickets >= 10);
      $("#score").classList.toggle("crowded", state.runs >= 200);
    }
    renderSession();
    try { localStorage.setItem("inch-park-score", JSON.stringify(state)); } catch {}
  }

  function pollDelay() {
    if (document.hidden && view !== "score" && view !== "overs") return 60000;
    if (failures) return [15000, 30000, 60000][Math.min(failures - 1, 2)];
    if (activeAt()) return view === "scoring" ? 1500 : 1000;
    return 15000;
  }

  function scheduleRefresh(delay = pollDelay()) {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(refresh, delay);
  }

  async function refresh() {
    try {
      const response = await fetch(view === "scoring" ? api : snapshot, {
        cache: view === "scoring" ? "no-store" : "default",
      });
      if (!response.ok) throw new Error("Score service unavailable");
      render(await response.json());
      failures = 0;
      $("#connection-warning")?.classList.remove("visible");
    } catch {
      failures += 1;
      $("#connection-warning")?.classList.add("visible");
      if (view === "scoring") message("Connection lost. The displayed score has been preserved.", true);
    } finally {
      renderSession();
      scheduleRefresh();
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
    const credential = sessionStorage.getItem(credentialKey);
    if (!credential) {
      $("#login-dialog").showModal();
      return null;
    }
    const requestBody = { ...body };
    if (requestBody.action !== "authenticate" && requestBody.expectedRevision === undefined) {
      requestBody.expectedRevision = state.revision;
    }
    busy = true;
    message("Updating scoreboard…");
    try {
      const payload = JSON.stringify(requestBody);
      const headers = {
        "content-type": "application/json",
        [credentialHeader]: credential,
      };
      if (linkTokenMode) headers["x-amz-content-sha256"] = await sha256Hex(payload);
      const response = await fetch(api, {
        method: "POST",
        headers,
        body: payload,
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.state) render(result.state);
        if (response.status === 401) {
          sessionStorage.removeItem(credentialKey);
          $("#login-dialog").showModal();
        }
        throw new Error(result.error || "Update failed.");
      }
      render(result);
      failures = 0;
      message(success);
      scheduleRefresh();
      return result;
    } catch (error) {
      message(error.message || "Update failed.", true);
      return null;
    } finally {
      busy = false;
    }
  }

  async function score(runsAdded, legalBall, wicketAdded = false) {
    if (!activeAt()) {
      renderSession();
      message("Restart the scoring session to continue.", true);
      return;
    }
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
    if (linkTokenMode) {
      $("#login-title").textContent = "Private control link required";
      $("#login-dialog p:not(.eyebrow)").textContent = "Open the private link supplied by the scoreboard administrator, or paste its access key below.";
      $("#login-dialog label").firstChild.textContent = "Access key";
      $("#login-form button.primary").textContent = "Open scoreboard control";
    }
    $("#login-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const credential = $("#password").value;
      sessionStorage.setItem(credentialKey, credential);
      const authenticated = await post({ action: "authenticate" });
      if (!authenticated) {
        $("#login-message").textContent = "Incorrect password.";
        return;
      }
      $("#login-message").textContent = "";
      $("#login-dialog").close();
      renderSession();
    });

    $("#restart-session").addEventListener("click", () => post({ action: "start_session" }, "Scoring session restarted"));
    $("#end-session").addEventListener("click", () => post({ action: "end_session" }, "Scoring session ended"));
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
      if (!activeAt() || event.target.matches("input,select,textarea") || event.repeat || $("dialog[open]")) return;
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

    if (!sessionStorage.getItem(credentialKey)) $("#login-dialog").showModal();
  }

  captureLinkToken();
  try {
    const cached = JSON.parse(localStorage.getItem("inch-park-score"));
    if (cached) render(cached);
  } catch {}

  if (view === "scoring") initialiseScorer();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) scheduleRefresh(0);
  });
  void refresh();
})();
