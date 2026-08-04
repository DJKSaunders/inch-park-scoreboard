from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone

from pi.scoreboard_core.scoring import (
    ConflictError,
    ScoreboardError,
    SessionInactiveError,
    apply_action,
    accept_remote_state,
    initial_state,
    public_state,
)


NOW = datetime(2026, 8, 4, 12, 0, tzinfo=timezone.utc)


class ScoringRulesTest(unittest.TestCase):
    def active_state(self):
        return apply_action(initial_state(at=NOW), {"action": "start_session", "expectedRevision": 0}, at=NOW)

    def test_new_score_is_paused_until_a_session_is_started(self):
        state = initial_state(at=NOW)
        self.assertFalse(public_state(state, at=NOW)["sessionActive"])
        with self.assertRaises(SessionInactiveError):
            apply_action(state, {"action": "score", "runsAdded": 1, "legalBall": True}, at=NOW)

    def test_start_session_does_not_reset_the_score(self):
        state = initial_state(at=NOW)
        state.update(runs=198, wickets=7, completedOvers=39, balls=4)
        next_state = apply_action(state, {"action": "start_session", "expectedRevision": 0}, at=NOW)
        self.assertEqual((next_state["runs"], next_state["wickets"]), (198, 7))
        self.assertEqual((next_state["completedOvers"], next_state["balls"]), (39, 4))
        self.assertEqual(next_state["revision"], 1)
        self.assertTrue(public_state(next_state, at=NOW)["sessionActive"])

    def test_six_legal_deliveries_complete_an_over(self):
        state = self.active_state()
        for _ in range(6):
            state = apply_action(
                state,
                {
                    "action": "score",
                    "runsAdded": 0,
                    "legalBall": True,
                    "expectedRevision": state["revision"],
                },
                at=NOW,
            )
        self.assertEqual((state["completedOvers"], state["balls"]), (1, 0))

    def test_wides_and_no_balls_do_not_advance_the_over(self):
        state = self.active_state()
        for runs in (1, 1, 5):
            state = apply_action(
                state,
                {
                    "action": "score",
                    "runsAdded": runs,
                    "legalBall": False,
                    "expectedRevision": state["revision"],
                },
                at=NOW,
            )
        self.assertEqual(state["runs"], 7)
        self.assertEqual((state["completedOvers"], state["balls"]), (0, 0))

    def test_wicket_and_undo_restore_the_previous_delivery(self):
        state = self.active_state()
        state = apply_action(
            state,
            {
                "action": "score",
                "runsAdded": 0,
                "legalBall": True,
                "wicketAdded": True,
                "expectedRevision": state["revision"],
            },
            at=NOW,
        )
        self.assertEqual((state["wickets"], state["balls"]), (1, 1))
        state = apply_action(
            state,
            {"action": "undo", "expectedRevision": state["revision"]},
            at=NOW,
        )
        self.assertEqual((state["wickets"], state["balls"]), (0, 0))

    def test_score_action_renews_the_inactivity_deadline(self):
        state = self.active_state()
        later = NOW + timedelta(minutes=9)
        state = apply_action(
            state,
            {
                "action": "score",
                "runsAdded": 4,
                "legalBall": True,
                "expectedRevision": state["revision"],
            },
            at=later,
        )
        self.assertTrue(public_state(state, at=later + timedelta(minutes=9))["sessionActive"])
        self.assertFalse(public_state(state, at=later + timedelta(minutes=11))["sessionActive"])

    def test_stale_controller_revision_is_rejected(self):
        state = self.active_state()
        with self.assertRaises(ConflictError):
            apply_action(
                state,
                {"action": "score", "runsAdded": 1, "legalBall": True, "expectedRevision": 0},
                at=NOW,
            )

    def test_reset_requires_confirmation(self):
        state = self.active_state()
        with self.assertRaises(ScoreboardError):
            apply_action(
                state,
                {"action": "reset", "confirmation": "reset", "expectedRevision": state["revision"]},
                at=NOW,
            )

    def test_second_innings_resets_only_the_innings_score(self):
        state = self.active_state()
        state.update(runs=175, wickets=8, completedOvers=40, balls=0)
        state = apply_action(
            state,
            {"action": "next_innings", "expectedRevision": state["revision"]},
            at=NOW,
        )
        self.assertEqual((state["runs"], state["wickets"], state["completedOvers"], state["balls"]), (0, 0, 0, 0))
        self.assertEqual(state["innings"], 2)

    def test_apply_action_does_not_mutate_the_supplied_state(self):
        state = self.active_state()
        original = dict(state)
        apply_action(
            state,
            {
                "action": "score",
                "runsAdded": 1,
                "legalBall": True,
                "expectedRevision": state["revision"],
            },
            at=NOW,
        )
        self.assertEqual(state, original)

    def test_remote_sync_accepts_only_a_newer_valid_revision(self):
        state = self.active_state()
        incoming = {
            **public_state(state, at=NOW),
            "revision": state["revision"] + 1,
            "runs": 24,
            "balls": 3,
        }
        accepted = accept_remote_state(state, incoming, at=NOW)
        self.assertEqual((accepted["revision"], accepted["runs"], accepted["balls"]), (2, 24, 3))
        with self.assertRaises(ConflictError):
            accept_remote_state(accepted, incoming, at=NOW)

    def test_remote_sync_rejects_out_of_range_data(self):
        state = self.active_state()
        incoming = {**public_state(state, at=NOW), "revision": 2, "wickets": 99}
        with self.assertRaises(ScoreboardError):
            accept_remote_state(state, incoming, at=NOW)


if __name__ == "__main__":
    unittest.main()
