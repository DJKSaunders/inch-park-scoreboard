"""Authoritative, storage-independent cricket scoring rules."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta, timezone
from typing import Any

DEFAULT_SESSION_SECONDS = 10 * 60
UNDO_FIELDS = ("runs", "wickets", "completedOvers", "balls", "innings")


class ScoreboardError(ValueError):
    """A scoring action was invalid."""


class ConflictError(ScoreboardError):
    """A controller attempted to update an old score revision."""


class SessionInactiveError(ScoreboardError):
    """A controller attempted to score while its session was paused."""


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def isoformat(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_time(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


def bounded(value: Any, minimum: int, maximum: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError) as error:
        raise ScoreboardError("A score value was not a valid number.") from error
    return max(minimum, min(maximum, parsed))


def initial_state(*, at: datetime | None = None, active: bool = False) -> dict[str, Any]:
    current = at or utc_now()
    return {
        "schemaVersion": 2,
        "revision": 0,
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
        "activeUntil": isoformat(current + timedelta(seconds=DEFAULT_SESSION_SECONDS)) if active else None,
        "updatedAt": isoformat(current),
        "_undo": None,
    }


def normalize_state(value: Any, *, at: datetime | None = None) -> dict[str, Any]:
    """Migrate persisted state without discarding a displayed score."""
    base = initial_state(at=at)
    if not isinstance(value, dict):
        return base
    state = {**base, **value}
    state["schemaVersion"] = 2
    state["revision"] = bounded(state.get("revision", 0), 0, 2_147_483_647)
    state["runs"] = bounded(state.get("runs", 0), 0, 9999)
    state["wickets"] = bounded(state.get("wickets", 0), 0, 10)
    state["completedOvers"] = bounded(state.get("completedOvers", 0), 0, 999)
    state["balls"] = bounded(state.get("balls", 0), 0, 5)
    state["innings"] = bounded(state.get("innings", 1), 1, 2)
    if parse_time(state.get("activeUntil")) is None:
        state["activeUntil"] = None
    if parse_time(state.get("updatedAt")) is None:
        state["updatedAt"] = base["updatedAt"]
    if not isinstance(state.get("_undo"), dict):
        state["_undo"] = None
    return state


def session_is_active(state: dict[str, Any], *, at: datetime | None = None) -> bool:
    deadline = parse_time(state.get("activeUntil"))
    return bool(deadline and deadline > (at or utc_now()))


def public_state(state: dict[str, Any], *, at: datetime | None = None) -> dict[str, Any]:
    result = {key: value for key, value in state.items() if not key.startswith("_")}
    result["sessionActive"] = session_is_active(state, at=at)
    return result


def accept_remote_state(existing: dict[str, Any], incoming: Any, *, at: datetime | None = None) -> dict[str, Any]:
    """Validate a newer state received through the authenticated IoT channel."""
    if not isinstance(incoming, dict):
        raise ScoreboardError("The remote score was not a JSON object.")
    required_ranges = {
        "revision": (1, 2_147_483_647),
        "runs": (0, 9999),
        "wickets": (0, 10),
        "completedOvers": (0, 999),
        "balls": (0, 5),
        "innings": (1, 2),
    }
    for field, (minimum, maximum) in required_ranges.items():
        if field not in incoming:
            raise ScoreboardError(f"The remote score is missing {field}.")
        try:
            value = int(incoming[field])
        except (TypeError, ValueError) as error:
            raise ScoreboardError(f"The remote {field} value is invalid.") from error
        if value < minimum or value > maximum:
            raise ScoreboardError(f"The remote {field} value is outside its allowed range.")
    current = normalize_state(existing, at=at)
    if int(incoming["revision"]) <= current["revision"]:
        raise ConflictError("The remote score revision is not newer than the local score.")
    accepted = normalize_state(incoming, at=at)
    accepted["_undo"] = None
    return accepted


def _remember_undo(state: dict[str, Any]) -> None:
    state["_undo"] = {key: state[key] for key in UNDO_FIELDS}


def _require_revision(state: dict[str, Any], body: dict[str, Any]) -> None:
    if "expectedRevision" not in body:
        return
    try:
        expected = int(body["expectedRevision"])
    except (TypeError, ValueError) as error:
        raise ConflictError("The score revision was invalid. Refresh and try again.") from error
    if expected != state["revision"]:
        raise ConflictError("The score changed on another device. Review the latest score and try again.")


def apply_action(
    existing: dict[str, Any],
    body: dict[str, Any],
    *,
    at: datetime | None = None,
    session_seconds: int = DEFAULT_SESSION_SECONDS,
) -> dict[str, Any]:
    """Return the next state without mutating the supplied state."""
    current = at or utc_now()
    state = deepcopy(normalize_state(existing, at=current))
    action = body.get("action")

    if action == "authenticate":
        return state

    _require_revision(state, body)

    if action == "start_session":
        state["activeUntil"] = isoformat(current + timedelta(seconds=session_seconds))
    elif action == "end_session":
        state["activeUntil"] = None
    else:
        if action != "start" and not session_is_active(state, at=current):
            raise SessionInactiveError("The scoring session has paused. Restart it to continue.")

        if action == "start":
            revision = state["revision"]
            state = initial_state(at=current, active=True)
            state["revision"] = revision
        elif action == "score":
            runs_added = bounded(body.get("runsAdded", -1), -1, 6)
            if runs_added < 0:
                raise ScoreboardError("Invalid run value.")
            _remember_undo(state)
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
                raise ScoreboardError("There is no scoring action to undo.")
            undo = state["_undo"]
            state.update({key: undo[key] for key in UNDO_FIELDS})
            state["_undo"] = None
        elif action == "reset":
            if body.get("confirmation") != "RESET":
                raise ScoreboardError("Type RESET to confirm.")
            state.update(runs=0, wickets=0, completedOvers=0, balls=0, innings=1, _undo=None)
        elif action == "next_innings":
            if state["innings"] >= 2:
                raise ScoreboardError("The second innings is already active.")
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
            raise ScoreboardError("Invalid action.")

        state["activeUntil"] = isoformat(current + timedelta(seconds=session_seconds))

    state["revision"] += 1
    state["updatedAt"] = isoformat(current)
    return state
