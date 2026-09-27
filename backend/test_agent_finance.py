import json
from contextlib import closing
import sqlite3
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from fastapi.testclient import TestClient
from . import agent_finance as finance
from .main import app
from .kiln import KilnAdapter


class FinanceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "audit.sqlite3"
        self.sid = uuid4()
        self.env = patch.dict("os.environ", {}, clear=True)
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.temp.cleanup()

    def run_action(self, action="generate", scenario="user", **kwargs):
        request = finance.FinanceRequest(session_id=self.sid, action=action, scenario=scenario, **kwargs)
        with patch.object(KilnAdapter, "judge", new_callable=AsyncMock) as kiln, \
             patch.object(finance.TestnetTransport, "record", new_callable=AsyncMock) as chain, \
             patch.object(finance.TestnetTransport, "receipt", new_callable=AsyncMock) as receipt:
            result = finance.review(request, self.path)
            kiln.assert_not_called()
            chain.assert_not_called()
            receipt.assert_not_called()
        self.assertEqual(result["kiln_call_count"], 0)
        self.assertEqual(result["blockchain_execution"], "없음")
        self.assertFalse(result["payment_allowed"])
        self.assertIsNone(result["proposal"])
        return result

    def test_missing_kiln_and_real_audit(self):
        result = self.run_action()
        self.assertEqual(result["code"], "KILN_NOT_CONFIGURED")
        with closing(sqlite3.connect(self.path)) as db:
            record = json.loads(db.execute("SELECT payload FROM audit").fetchone()[0])
        self.assertEqual(record, result["audit"])
        self.assertFalse(record["kiln_called"])
        self.assertEqual(record["tokens"], "제공되지 않음")

    def test_normal_demo_is_not_fake_success(self):
        result = self.run_action(scenario="normal")
        self.assertEqual(result["code"], "KILN_NOT_CONFIGURED")
        self.assertTrue(result["audit"]["checks"]["budget"])
        self.assertFalse(result["audit"]["checks"]["evidence"])

    def test_budget_excess_blocks_before_kiln(self):
        self.assertEqual(self.run_action(scenario="over_budget")["code"], "RULE_BUDGET")

    def test_seller_blocks_before_kiln(self):
        self.assertEqual(self.run_action(scenario="unapproved_seller")["code"], "RULE_SELLER")

    def test_expired_blocks_before_kiln(self):
        policy = finance.Policy(deadline=datetime.now(timezone.utc)-timedelta(seconds=1))
        self.assertEqual(self.run_action(policy=policy)["code"], "RULE_DEADLINE")

    def test_approval_cannot_create_proposal_or_transaction(self):
        self.assertEqual(self.run_action(action="approve")["code"], "NO_VERIFIED_PROPOSAL")

    def test_stop_is_persistent_for_session(self):
        self.assertEqual(self.run_action(action="stop")["code"], "AGENT_STOPPED")
        self.assertEqual(self.run_action(scenario="normal")["code"], "AGENT_STOPPED")
        self.assertEqual(self.run_action(action="approve")["code"], "AGENT_STOPPED")

    def test_rejection_is_recorded_and_latches_stop(self):
        self.assertEqual(self.run_action(action="reject")["code"], "USER_REJECTED")
        self.assertEqual(self.run_action()["code"], "AGENT_STOPPED")

    def test_exact_decimal_total_and_all_rules(self):
        p = finance.Policy(budget="100.00", max_spend="99.99", fee="0.01",
                           sellers=["allowed"], items=["allowed"],
                           deadline=datetime.now(timezone.utc)+timedelta(days=1))
        c = finance.Candidate(item="allowed", seller="allowed", amount="99.99")
        checks = finance.check_rules(p, c, evidence_verified=True, human_approved=True)
        self.assertTrue(checks["budget"])
        self.assertFalse(checks["max_spend"])
        self.assertFalse(finance.execution_allowed(checks))
        p.max_spend = Decimal(100)
        self.assertTrue(finance.execution_allowed(finance.check_rules(p, c, evidence_verified=True, human_approved=True)))
        for override in ({"evidence_verified": False}, {"human_approved": False}, {"stopped": True}):
            args = {"evidence_verified": True, "human_approved": True, **override}
            self.assertFalse(finance.execution_allowed(finance.check_rules(p, c, **args)))
        c.item = "not allowed"
        self.assertFalse(finance.check_rules(p, c)["item"])

    def test_no_secret_in_response_audit_or_repr(self):
        marker = "synthetic-private-test-marker"
        with patch.dict("os.environ", {"KILN_API_KEY": marker}):
            with self.assertNoLogs():
                result = self.run_action(policy=finance.Policy(sellers=[marker], items=[marker]))
        self.assertNotIn(marker, json.dumps(result))
        with closing(sqlite3.connect(self.path)) as db:
            self.assertNotIn(marker, str(db.execute("SELECT payload FROM audit").fetchall()))

    def test_invalid_body_does_not_echo_input(self):
        marker = "synthetic-private-test-marker"
        result = TestClient(app).post("/api/agent-finance/review", json={"api_key": marker})
        self.assertEqual(result.status_code, 422)
        self.assertNotIn("synthetic-private-test-marker", result.text)

    def test_no_network_implementation_or_transaction_hash(self):
        result = self.run_action()
        self.assertNotIn("transaction_hash", result)
        source = Path(finance.__file__).read_text(encoding="utf-8")
        self.assertNotIn("import httpx", source)
        self.assertNotIn("import requests", source)

    def test_status_graph_and_selection_changes_never_call_kiln(self):
        client = TestClient(app)
        with patch.object(KilnAdapter, "judge", new_callable=AsyncMock) as kiln:
            self.assertEqual(client.get("/api/kiln/status").status_code, 200)
            for crop, pest, region in [("복숭아", "복숭아순나방", "전체"),
                                       ("고추", "점박이응애", "경기도")]:
                response = client.get("/api/simulate", params={"crop": crop, "pest": pest, "region": region})
                self.assertEqual(response.status_code, 200)
                self.assertIn("trend", response.json())
                self.assertIn("recommendations", response.json())
            kiln.assert_not_called()

    def test_research_load_and_filter_changes_never_call_kiln(self):
        client = TestClient(app)
        with patch.object(KilnAdapter, "judge", new_callable=AsyncMock) as kiln, \
             patch("backend.main.research_context", return_value={"status": "test-only"}):
            for params in ({}, {"crop": "복숭아", "pest": "복숭아순나방", "region": "전체"},
                           {"crop": "고추", "pest": "점박이응애", "region": "경기도"}):
                self.assertEqual(client.get("/api/analysis/research", params=params).status_code, 200)
            kiln.assert_not_called()

    def test_route_returns_saved_audit_and_real_stop(self):
        original = finance.review
        with patch.object(finance, "review", side_effect=lambda data: original(data, self.path)):
            response = TestClient(app).post("/api/agent-finance/review", json={
                "session_id": str(self.sid), "action": "generate", "scenario": "over_budget"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["code"], "RULE_BUDGET")
        self.assertTrue(self.path.exists())


if __name__ == "__main__":
    unittest.main()
