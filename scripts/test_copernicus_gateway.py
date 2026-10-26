"""Offline gateway/auth/UTC/capture tests; no Copernicus SDK or secrets required."""
import copy
import json
from pathlib import Path
import unittest
from unittest.mock import Mock

from server.copernicus_gateway import UkcError, UkcGateway, build_estimate, paris_eta, utc

FIXTURE = json.loads((Path(__file__).resolve().parents[1] / "src/features/seaOperations/testFixtures/copernicus-ukc.json").read_text(encoding="utf-8"))
HEADERS = {"Content-Type": "application/json", "Authorization": "Bearer synthetic-test-token", "Origin": "https://seapilot.example"}
ENV = {"COPERNICUSMARINE_SERVICE_USERNAME": "synthetic-user", "COPERNICUSMARINE_SERVICE_PASSWORD": "synthetic-password"}


class GatewayTests(unittest.TestCase):
    def setUp(self):
        self.input = copy.deepcopy(FIXTURE["input"])
        self.backend = Mock()
        self.backend.user.return_value = "synthetic-actor"
        self.backend.context.side_effect = lambda project, vessel: {"projectId": project, "vesselId": vessel, "draftMeters": 2}
        self.provider = Mock(return_value=copy.deepcopy(FIXTURE["provider"]))
        self.clock = Mock(return_value=utc(FIXTURE["fetchedAt"]).timestamp())
        self.gateway = UkcGateway(ENV, backend_factory=lambda _jwt: self.backend, provider=self.provider, now=self.clock)

    def call(self, payload=None, headers=None, method="POST", raw=None):
        return self.gateway.handle(method, HEADERS if headers is None else headers,
                                   json.dumps(self.input if payload is None else payload).encode() if raw is None else raw, "https://seapilot.example")

    def test_shared_cross_language_arithmetic_and_unknown_uncertainty(self):
        status, result = self.call()
        self.assertEqual(status, 200)
        self.assertEqual(result["status"], "available")
        self.assertEqual(result["etaUtc"], FIXTURE["expected"]["etaUtc"])
        for key in ("waterLevelMeters", "ukcMeters"):
            self.assertAlmostEqual(result["estimate"][key], FIXTURE["expected"][key], places=8)
        budget = result["estimate"]["uncertainty"]
        self.assertEqual(budget["missingComponents"], FIXTURE["expected"]["missingComponents"])
        self.assertIsNone(budget["quantifiedMeters"])
        self.assertFalse(budget["complete"])
        self.assertIsNone(budget["confidenceLevel"])

    def test_requires_authentication_and_does_not_offer_anonymous_preview(self):
        self.assertEqual(self.call(headers={"Content-Type": "application/json"})[0], 401)
        self.backend.user.return_value = None
        self.assertEqual(self.call()[0], 401)
        self.provider.assert_not_called()

    def test_rejects_cross_origin_and_non_post(self):
        self.assertEqual(self.call(headers={**HEADERS, "Origin": "https://other.example"})[0], 403)
        self.assertEqual(self.call(headers={**HEADERS, "Sec-Fetch-Site": "cross-site"})[0], 403)
        self.assertEqual(self.call(method="GET")[0], 405)
        self.backend.user.assert_not_called()

    def test_bounds_request_and_validates_json_inputs(self):
        self.assertEqual(self.call(raw=b"x" * 4097)[0], 413)
        self.assertEqual(self.call(raw=b"not-json")[0], 400)
        for patch in ({"projectId": "0"}, {"vesselId": "9223372036854775808"}, {"latitude": True}, {"longitude": float("nan")},
                      {"draftMeters": 0}, {"pointId": "../other"}, {"eta": "12:07"}, {"eta": "2026-10-25T02:30"}, {"eta": "2026-03-29T02:30"}):
            with self.subTest(patch=patch):
                self.assertEqual(self.call({**self.input, **patch})[0], 400)
        self.provider.assert_not_called()

    def test_authorizes_project_vessel_and_real_draft_before_provider(self):
        self.backend.context.side_effect = UkcError(403, "UKC_ACCESS_DENIED")
        self.assertEqual(self.call()[0], 403)
        self.backend.context.side_effect = None
        for context, status in (({"projectId": "3", "vesselId": "1", "draftMeters": 2}, 403),
                                ({"projectId": "2", "vesselId": "1", "draftMeters": None}, 400),
                                ({"projectId": "2", "vesselId": "1", "draftMeters": 3}, 409)):
            self.backend.context.return_value = context
            self.assertEqual(self.call()[0], status)
        self.provider.assert_not_called()

    def test_does_not_pass_request_urls_or_supplied_credentials_to_sdk(self):
        self.call({**self.input, "providerUrl": "https://other.example", "username": "caller", "password": "caller"})
        self.provider.assert_called_once_with(49.65, -1.62, FIXTURE["expected"]["etaUtc"], ENV["COPERNICUSMARINE_SERVICE_USERNAME"], ENV["COPERNICUSMARINE_SERVICE_PASSWORD"])

    def test_cache_is_authorized_each_time_and_reidentified_without_reusing_draft(self):
        _, first = self.call()
        _, second = self.call({**self.input, "projectId": "3", "pointId": "wp-2"})
        self.assertEqual(second["projectId"], "3")
        self.assertEqual(second["pointId"], "wp-2")
        self.assertEqual(second["fetchedAt"], first["fetchedAt"])
        self.assertEqual(self.provider.call_count, 1)
        self.assertEqual(self.backend.context.call_count, 2)
        self.backend.context.side_effect = UkcError(403, "UKC_ACCESS_DENIED")
        self.assertEqual(self.call()[0], 403)

    def test_missing_configuration_and_rate_limit_are_explicit(self):
        self.gateway.env = {}
        self.assertEqual(self.call(), (503, {"error": "UKC_NOT_CONFIGURED"}))
        self.gateway.env = ENV
        for _ in range(29):
            self.assertEqual(self.call()[0], 200)
        self.assertEqual(self.call(), (429, {"error": "UKC_RATE_LIMIT"}))

    def test_concurrency_is_bounded_and_slots_released_after_error(self):
        self.gateway.slots.acquire(); self.gateway.slots.acquire()
        self.assertEqual(self.call(), (503, {"error": "UKC_BUSY"}))
        self.gateway.slots.release(); self.gateway.slots.release()
        self.provider.side_effect = RuntimeError("synthetic-password must never appear")
        self.assertEqual(self.call(), (502, {"error": "UKC_SERVICE_UNAVAILABLE"}))
        self.assertTrue(self.gateway.slots.acquire(blocking=False))
        self.gateway.slots.release()

    def test_does_not_reconstruct_past_forecasts(self):
        status, result = self.call({**self.input, "eta": "2026-10-25T12:00"})
        self.assertEqual(status, 200)
        self.assertEqual(result["status"], "unavailable")
        self.assertIsNone(result["estimate"])
        self.provider.assert_not_called()

    def test_checks_source_identity_cell_and_shallow_water(self):
        for field, value in (("datum", "LAT"), ("datasetVersion", "wrong"), ("sourceUrl", "https://other.example")):
            provider = copy.deepcopy(FIXTURE["provider"])
            provider["source"][field] = value
            with self.assertRaises(UkcError):
                build_estimate(self.input, paris_eta(self.input["eta"]), provider, utc(FIXTURE["fetchedAt"]))
        for patch in ({"depthMeters": 10}, {"bounds": {"west": -1.64, "east": -1.6, "south": 49.651, "north": 49.66}}):
            provider = copy.deepcopy(FIXTURE["provider"]); provider["cell"].update(patch)
            with self.assertRaises(UkcError):
                build_estimate(self.input, paris_eta(self.input["eta"]), provider, utc(FIXTURE["fetchedAt"]))

    def test_rejects_source_utc_year_before_1000(self):
        self.provider.return_value["source"]["referenceTimeUtc"] = "0999-01-01T00:00:00Z"
        self.assertEqual(self.call(), (502, {"error": "UKC_SERVICE_UNAVAILABLE"}))
        self.provider.assert_called_once()
        self.assertEqual(self.gateway.cache, {})
        with self.assertRaises(ValueError):
            utc("0001-01-01T00:00:00Z")
        self.assertEqual(utc("1000-01-01T00:00:00Z").year, 1000)

    def test_unavailable_and_exception_messages_do_not_expose_upstream_details(self):
        self.provider.return_value = {"status": "unavailable", "code": "shallowWater", "message": "synthetic-password", "source": None}
        status, result = self.call()
        self.assertEqual(status, 200)
        self.assertNotIn("synthetic-password", json.dumps(result))
        self.assertIsNone(result["estimate"])


if __name__ == "__main__":
    unittest.main()
