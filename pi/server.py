#!/usr/bin/env python3
"""LAN-only scoreboard web and API server for the Raspberry Pi."""

from __future__ import annotations

import hmac
import json
import mimetypes
import os
import threading
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

WEB_ROOT = Path(os.environ.get("SCOREBOARD_WEB_ROOT", "./web")).resolve()
STATE_FILE = Path(os.environ.get("SCOREBOARD_STATE", "./state.json")).resolve()
PASSWORD = os.environ.get("SCORER_PASSWORD", "")
PORT = int(os.environ.get("SCOREBOARD_PORT", "8080"))
STATE_LOCK = threading.Lock()


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def initial_state() -> dict:
    return {
        "matchId": "manual",
        "homeTeam": None,
        "awayTeam": None,
        "venue": None,
        "startTime": None,
        "matchStatus": "LIVE",
        "runs": 0,
        "wickets": 0,
        "completedOvers": 0,
        "balls": 0,
        "innings": 1,
        "updatedAt": now(),
        "_undo": None,
    }


def public_state(state: dict) -> dict:
    return {key: value for key, value in state.items() if not key.startswith("_")}


def save_state(state: dict) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    temporary = STATE_FILE.with_suffix(".tmp")
    temporary.write_text(json.dumps(state, separators=(",", ":")))
    temporary.replace(STATE_FILE)


def load_state() -> dict:
    if not STATE_FILE.exists():
        state = initial_state()
        save_state(state)
        return state
    try:
        return {**initial_state(), **json.loads(STATE_FILE.read_text())}
    except (OSError, json.JSONDecodeError):
        return initial_state()


def bounded(value, minimum: int, maximum: int) -> int:
    return max(minimum, min(maximum, int(value)))


def apply_action(state: dict, body: dict) -> dict:
    action = body.get("action")
    if action == "authenticate":
        return state
    if action == "start":
        return initial_state()
    if action == "score":
        runs_added = int(body.get("runsAdded", -1))
        if runs_added < 0 or runs_added > 6:
            raise ValueError("Invalid run value.")
        state["_undo"] = {
            key: state[key]
            for key in ("runs", "wickets", "completedOvers", "balls")
        }
        state["runs"] = bounded(state["runs"] + runs_added, 0, 9999)
        if body.get("wicketAdded"):
            state["wickets"] = bounded(state["wickets"] + 1, 0, 10)
        if body.get("legalBall"):
            state["balls"] += 1
            if state["balls"] == 6:
                state["completedOvers"] += 1
                state["balls"] = 0
    elif action == "undo":
        if not state.get("_undo"):
            raise ValueError("There is no scoring action to undo.")
        state.update(state["_undo"])
        state["_undo"] = None
    elif action == "reset":
        if body.get("confirmation") != "RESET":
            raise ValueError("Type RESET to confirm.")
        state.update(runs=0, wickets=0, completedOvers=0, balls=0, innings=1, _undo=None)
    elif action == "next_innings":
        if state["innings"] >= 2:
            raise ValueError("The second innings is already active.")
        state.update(runs=0, wickets=0, completedOvers=0, balls=0, innings=2, _undo=None)
    elif action == "update":
        state.update(
            runs=bounded(body.get("runs", state["runs"]), 0, 9999),
            wickets=bounded(body.get("wickets", state["wickets"]), 0, 10),
            completedOvers=bounded(body.get("completedOvers", state["completedOvers"]), 0, 999),
            balls=bounded(body.get("balls", state["balls"]), 0, 5),
            innings=bounded(body.get("innings", state["innings"]), 1, 2),
            _undo=None,
        )
    else:
        raise ValueError("Invalid action.")
    state["updatedAt"] = now()
    return state


class ScoreboardHandler(SimpleHTTPRequestHandler):
    server_version = "InchParkScoreboard/1.0"

    def send_json(self, value: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        payload = json.dumps(value, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self) -> None:
        if urlparse(self.path).path == "/api/state":
            with STATE_LOCK:
                self.send_json(public_state(load_state()))
            return
        super().do_GET()

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/api/state":
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        supplied = self.headers.get("x-scoreboard-password", "")
        if not PASSWORD or not hmac.compare_digest(supplied, PASSWORD):
            self.send_json({"error": "Incorrect scoring password."}, HTTPStatus.UNAUTHORIZED)
            return
        try:
            length = bounded(self.headers.get("content-length", 0), 0, 65536)
            body = json.loads(self.rfile.read(length))
            with STATE_LOCK:
                state = apply_action(load_state(), body)
                save_state(state)
                self.send_json(public_state(state))
        except (ValueError, TypeError, json.JSONDecodeError) as error:
            self.send_json({"error": str(error)}, HTTPStatus.BAD_REQUEST)

    def translate_path(self, path: str) -> str:
        clean_path = urlparse(path).path
        if clean_path == "/":
            clean_path = "/score/"
        requested = (WEB_ROOT / clean_path.lstrip("/")).resolve()
        if WEB_ROOT not in requested.parents and requested != WEB_ROOT:
            return str(WEB_ROOT / "__not_found__")
        return str(requested)

    def end_headers(self) -> None:
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()


if __name__ == "__main__":
    if not PASSWORD:
        raise SystemExit("SCORER_PASSWORD is required.")
    if not WEB_ROOT.is_dir():
        raise SystemExit(f"Web root does not exist: {WEB_ROOT}")
    mimetypes.add_type("font/woff2", ".woff2")
    server = ThreadingHTTPServer(("0.0.0.0", PORT), ScoreboardHandler)
    print(f"Inch Park Scoreboard listening on port {PORT}", flush=True)
    server.serve_forever()
