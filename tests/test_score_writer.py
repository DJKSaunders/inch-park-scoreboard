from __future__ import annotations

import hashlib
import json
import unittest
from datetime import datetime, timezone

from cloud.score_writer import process_request
from pi.scoreboard_core.scoring import initial_state


NOW = datetime(2026, 8, 4, 12, 0, tzinfo=timezone.utc)
TOKEN = "test-control-token-with-sufficient-entropy"
TOKEN_HASH = hashlib.sha256(TOKEN.encode()).hexdigest()


class MemoryStore:
    def __init__(self):
        self.state = initial_state(at=NOW)
        self.etag = "initial"
        self.commits = 0

    def load(self):
        return self.state, self.etag

    def commit(self, state, _etag):
        self.state = state
        self.etag = f"revision-{state['revision']}"
        self.commits += 1


class MemoryPublisher:
    def __init__(self):
        self.values = []

    def publish(self, state):
        self.values.append(state)


def event(method="GET", body=None, token=None):
    return {
        "requestContext": {"http": {"method": method}},
        "headers": {"x-scoreboard-token": token} if token else {},
        "body": json.dumps(body) if body is not None else None,
    }


class ScoreWriterTest(unittest.TestCase):
    def setUp(self):
        self.store = MemoryStore()
        self.publisher = MemoryPublisher()

    def call(self, request):
        return process_request(request, self.store, self.publisher, TOKEN_HASH, at=NOW)

    def body(self, result):
        return json.loads(result["body"])

    def test_public_get_does_not_invoke_storage_writes(self):
        result = self.call(event())
        self.assertEqual(result["statusCode"], 200)
        self.assertEqual(self.store.commits, 0)

    def test_invalid_control_token_is_rejected_before_a_write(self):
        result = self.call(event("POST", {"action": "start_session", "expectedRevision": 0}, "wrong"))
        self.assertEqual(result["statusCode"], 401)
        self.assertEqual(self.store.commits, 0)

    def test_restart_then_score_publishes_each_new_revision(self):
        start = self.call(event("POST", {"action": "start_session", "expectedRevision": 0}, TOKEN))
        self.assertEqual(start["statusCode"], 200)
        score = self.call(
            event(
                "POST",
                {"action": "score", "runsAdded": 4, "legalBall": True, "expectedRevision": 1},
                TOKEN,
            )
        )
        self.assertEqual(score["statusCode"], 200)
        self.assertEqual(self.body(score)["runs"], 4)
        self.assertEqual(self.store.commits, 2)
        self.assertEqual([value["revision"] for value in self.publisher.values], [1, 2])

    def test_stale_controller_receives_latest_state(self):
        self.call(event("POST", {"action": "start_session", "expectedRevision": 0}, TOKEN))
        result = self.call(
            event("POST", {"action": "score", "runsAdded": 1, "legalBall": True, "expectedRevision": 0}, TOKEN)
        )
        self.assertEqual(result["statusCode"], 409)
        self.assertEqual(self.body(result)["state"]["revision"], 1)


if __name__ == "__main__":
    unittest.main()
