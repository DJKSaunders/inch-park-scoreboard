#!/usr/bin/env python3
"""LAN-only scoreboard web and revision-safe API server for the Raspberry Pi."""

from __future__ import annotations

import hmac
import json
import mimetypes
import os
import threading
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from scoreboard_core.scoring import (
    ConflictError,
    ScoreboardError,
    SessionInactiveError,
    accept_remote_state,
    apply_action,
    initial_state,
    normalize_state,
    public_state,
)

WEB_ROOT = Path(os.environ.get("SCOREBOARD_WEB_ROOT", "./web")).resolve()
STATE_FILE = Path(os.environ.get("SCOREBOARD_STATE", "./state.json")).resolve()
STATE_ROOT = Path(os.environ.get("SCOREBOARD_STATE_ROOT", STATE_FILE.parent / "state")).resolve()
CURRENT_FILE = STATE_ROOT / "current.json"
REVISION_DIR = STATE_ROOT / "revisions"
PASSWORD = os.environ.get("SCORER_PASSWORD", "")
SYNC_TOKEN = os.environ.get("SCOREBOARD_SYNC_TOKEN", "")
PORT = int(os.environ.get("SCOREBOARD_PORT", "8080"))
STATE_LOCK = threading.Lock()


def write_json_atomic(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    temporary.write_text(json.dumps(value, separators=(",", ":")))
    temporary.replace(path)


def save_state(state: dict) -> None:
    write_json_atomic(STATE_FILE, state)
    snapshot = public_state(state)
    revision_file = REVISION_DIR / f"{state['revision']:010d}.json"
    if not revision_file.exists():
        write_json_atomic(revision_file, snapshot)
    write_json_atomic(CURRENT_FILE, snapshot)


def load_state() -> dict:
    if not STATE_FILE.exists():
        state = initial_state()
        save_state(state)
        return state
    try:
        return normalize_state(json.loads(STATE_FILE.read_text()))
    except (OSError, ValueError, json.JSONDecodeError):
        return initial_state()


class ScoreboardHandler(SimpleHTTPRequestHandler):
    server_version = "InchParkScoreboard/1.0"

    def send_json(
        self,
        value: dict,
        status: HTTPStatus = HTTPStatus.OK,
        cache_control: str = "no-store",
        etag: str | None = None,
    ) -> None:
        if etag and self.headers.get("if-none-match") == etag:
            self.send_response(HTTPStatus.NOT_MODIFIED)
            self.send_header("Cache-Control", cache_control)
            self.send_header("ETag", etag)
            self.end_headers()
            return
        payload = json.dumps(value, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", cache_control)
        if etag:
            self.send_header("ETag", etag)
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/state":
            with STATE_LOCK:
                self.send_json(public_state(load_state()))
            return
        if path == "/state/current.json":
            with STATE_LOCK:
                state = public_state(load_state())
                self.send_json(
                    state,
                    cache_control="public, max-age=0, s-maxage=2, stale-while-revalidate=1, stale-if-error=86400",
                    etag=f'"score-{state["revision"]}"',
                )
            return
        super().do_GET()

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/remote-state":
            self.receive_remote_state()
            return
        if path != "/api/state":
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        supplied = self.headers.get("x-scoreboard-password", "")
        if not PASSWORD or not hmac.compare_digest(supplied, PASSWORD):
            self.send_json({"error": "Incorrect scoring password."}, HTTPStatus.UNAUTHORIZED)
            return
        try:
            length = max(0, min(65536, int(self.headers.get("content-length", 0))))
            body = json.loads(self.rfile.read(length))
            with STATE_LOCK:
                state = apply_action(load_state(), body)
                if body.get("action") != "authenticate":
                    save_state(state)
                self.send_json(public_state(state))
        except ConflictError as error:
            with STATE_LOCK:
                latest = public_state(load_state())
            self.send_json(
                {"error": str(error), "code": "REVISION_CONFLICT", "state": latest},
                HTTPStatus.CONFLICT,
            )
        except SessionInactiveError as error:
            with STATE_LOCK:
                latest = public_state(load_state())
            self.send_json(
                {"error": str(error), "code": "SESSION_INACTIVE", "state": latest},
                HTTPStatus.LOCKED,
            )
        except (ScoreboardError, TypeError, ValueError, json.JSONDecodeError) as error:
            self.send_json({"error": str(error)}, HTTPStatus.BAD_REQUEST)

    def receive_remote_state(self) -> None:
        supplied = self.headers.get("x-scoreboard-sync-token", "")
        if self.client_address[0] not in {"127.0.0.1", "::1"}:
            self.send_json({"error": "Remote state is accepted only from this device."}, HTTPStatus.FORBIDDEN)
            return
        if not SYNC_TOKEN or not hmac.compare_digest(supplied, SYNC_TOKEN):
            self.send_json({"error": "Invalid local synchronisation token."}, HTTPStatus.UNAUTHORIZED)
            return
        try:
            length = max(0, min(65536, int(self.headers.get("content-length", 0))))
            incoming = json.loads(self.rfile.read(length))
            with STATE_LOCK:
                state = accept_remote_state(load_state(), incoming)
                save_state(state)
            self.send_json(public_state(state))
        except ConflictError as error:
            self.send_json({"error": str(error), "code": "STALE_REMOTE_STATE"}, HTTPStatus.CONFLICT)
        except (ScoreboardError, TypeError, ValueError, json.JSONDecodeError) as error:
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
