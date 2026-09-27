import asyncio
import json
import unittest
from unittest.mock import patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from .kiln import (KilnAdapter, KilnInput, KilnSettings, MODEL, TokenUsage,
                   router, safe_failure)


class KilnTests(unittest.TestCase):
    def test_missing_settings_stop(self):
        adapter = KilnAdapter(KilnSettings.load({}))
        with patch("socket.create_connection", side_effect=AssertionError("network forbidden")):
            result = asyncio.run(adapter.judge(KilnInput("", ())))
        self.assertEqual(result["code"], "KILN_NOT_CONFIGURED")
        self.assertEqual(result["status"], "STOP")
        self.assertFalse(result["purchase_approved"])
        self.assertFalse(result["payment_allowed"])

    def test_default_model(self):
        self.assertEqual(KilnSettings.load({}).model, "Qwen3-32B")

    def test_configured_still_not_callable(self):
        settings = KilnSettings.load({"KILN_API_BASE_URL": "https://example.invalid",
                                      "KILN_API_KEY": "test-placeholder-only"})
        adapter = KilnAdapter(settings)
        self.assertTrue(adapter.status()["configured"])
        self.assertFalse(adapter.status()["callable"])
        self.assertIsNone(adapter.status()["last_call_success"])
        result = asyncio.run(adapter.judge(KilnInput("", ())))
        self.assertEqual(result["code"], "KILN_PROTOCOL_NOT_IMPLEMENTED")
        self.assertFalse(result["payment_allowed"])

    def test_status_endpoint_no_secret_or_partial_key(self):
        # A synthetic marker exists only inside this test, never a real credential.
        marker = "test-only-sensitive-marker"
        app = FastAPI()
        app.include_router(router)
        with patch.dict("os.environ", {"KILN_API_KEY": marker,
                        "KILN_API_BASE_URL": "https://example.invalid"}, clear=True):
            with self.assertNoLogs(level="WARNING"):
                response = TestClient(app).get("/api/kiln/status")
            self.assertEqual(response.status_code, 200)
            self.assertNotIn(marker, response.text)
            self.assertNotIn(marker[:8], response.text)
            self.assertNotIn("example.invalid", response.text)
            self.assertNotIn(marker, repr(KilnSettings.load()))

    def test_errors_are_redacted_and_block_purchase(self):
        for error in (RuntimeError("test-only-sensitive-marker"),
                      TimeoutError("test-only-sensitive-marker")):
            with self.assertNoLogs():
                result = safe_failure(error)
            self.assertEqual(result["status"], "STOP")
            self.assertFalse(result["purchase_approved"])
            self.assertFalse(result["payment_allowed"])
            self.assertNotIn("test-only-sensitive-marker", json.dumps(result))

    def test_invalid_settings_fail_closed(self):
        for timeout in ("bad", "-1", "0", "nan", "inf"):
            self.assertFalse(KilnSettings.load({"KILN_API_TIMEOUT_SECONDS": timeout}).valid)
        self.assertFalse(KilnSettings.load({"KILN_MODEL": "unsupported"}).valid)

    def test_usage_is_not_fabricated(self):
        self.assertEqual(set(TokenUsage().for_audit().values()), {"제공되지 않음"})
        self.assertEqual(TokenUsage(input_tokens=7).for_audit()["total_tokens"], "제공되지 않음")


if __name__ == "__main__":
    unittest.main()
