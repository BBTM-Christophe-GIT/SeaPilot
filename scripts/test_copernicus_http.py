"""Loopback HTTP checks for Vercel's real handler, without SDK or account access."""
import http.client
import importlib.util
import json
from http.server import HTTPServer
from pathlib import Path
import threading
import unittest
from unittest.mock import Mock, patch


ENDPOINT = Path(__file__).resolve().parents[1] / "api/sea-operation-ukc.py"
SPEC = importlib.util.spec_from_file_location("copernicus_http_handler_under_test", ENDPOINT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class HttpHandlerTests(unittest.TestCase):
    def setUp(self):
        self.gateway = Mock()
        self.gateway.handle.return_value = (200, {"status": "available", "message": "Profondeur et marée conservées — donnée indicative"})
        self.gateway_patch = patch.object(MODULE, "gateway", self.gateway)
        self.gateway_patch.start()
        self.addCleanup(self.gateway_patch.stop)
        self.server = HTTPServer(("127.0.0.1", 0), MODULE.handler)
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={"poll_interval": .01}, daemon=True)
        self.thread.start()

    def tearDown(self):
        try:
            self.server.shutdown()
        finally:
            self.server.server_close()
            self.thread.join(timeout=3)
        self.assertFalse(self.thread.is_alive())

    def request(self, method="POST", headers=(), body=b""):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        try:
            # putrequest deliberately avoids HTTPConnection.request's automatic Content-Length.
            connection.putrequest(method, "/api/sea-operation-ukc", skip_host=True, skip_accept_encoding=True)
            connection.putheader("Host", "seapilot.example")
            for name, value in headers:
                connection.putheader(name, value)
            connection.endheaders(body or None)
            response = connection.getresponse()
            return response.status, dict(response.headers), response.read()
        finally:
            connection.close()

    def assert_private_json(self, headers, raw):
        self.assertEqual(headers["Cache-Control"], "private, no-store")
        self.assertEqual(headers["Pragma"], "no-cache")
        self.assertEqual(headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(headers["Content-Type"], "application/json; charset=utf-8")
        self.assertEqual(int(headers["Content-Length"]), len(raw))
        self.assertNotIn("Access-Control-Allow-Origin", headers)
        return json.loads(raw.decode("utf-8"))

    def test_post_forwards_the_exact_utf8_body_and_safe_request_origin(self):
        body = json.dumps({"pointId": "wp-1", "label": "Étel"}, ensure_ascii=False).encode("utf-8")
        status, headers, raw = self.request(headers=[("Content-Length", str(len(body))),
            ("Content-Type", "application/json"), ("Authorization", "Bearer synthetic-http-token")], body=body)
        self.assertEqual(status, 200)
        value = self.assert_private_json(headers, raw)
        self.assertIn("marée conservées", value["message"])
        self.assertIn("marée".encode("utf-8"), raw)
        method, forwarded, received, origin = self.gateway.handle.call_args.args
        self.assertEqual((method, received, origin), ("POST", body, "https://seapilot.example"))
        self.assertEqual(forwarded["Authorization"], "Bearer synthetic-http-token")
        self.gateway.handle.assert_called_once()

    def test_get_and_other_defined_methods_return_405_and_allow_post(self):
        for method in ("GET", "PUT", "DELETE", "PATCH", "OPTIONS"):
            with self.subTest(method=method):
                status, headers, raw = self.request(method=method)
                self.assertEqual(status, 405)
                self.assertEqual(headers["Allow"], "POST")
                self.assertEqual(self.assert_private_json(headers, raw), {"error": "UKC_METHOD_NOT_ALLOWED"})
        self.gateway.handle.assert_not_called()

    def test_missing_negative_and_malformed_content_length_are_rejected_before_gateway(self):
        for request_headers in ([], [("Content-Length", "-1")], [("Content-Length", "not-a-length")]):
            with self.subTest(headers=request_headers):
                status, headers, raw = self.request(headers=request_headers)
                self.assertEqual(status, 400)
                self.assertEqual(self.assert_private_json(headers, raw), {"error": "UKC_INVALID_REQUEST"})
        self.gateway.handle.assert_not_called()

    def test_transfer_encoding_is_rejected_even_with_a_length(self):
        for encoding in ("chunked", "identity"):
            with self.subTest(encoding=encoding):
                status, headers, raw = self.request(headers=[("Content-Length", "0"), ("Transfer-Encoding", encoding)])
                self.assertEqual(status, 400)
                self.assertEqual(self.assert_private_json(headers, raw), {"error": "UKC_INVALID_REQUEST"})
        self.gateway.handle.assert_not_called()

    def test_body_larger_than_4096_is_rejected_without_reading_or_calling_gateway(self):
        self.assertEqual(MODULE.MAX_BODY, 4096)
        status, headers, raw = self.request(headers=[("Content-Length", "4097")])
        self.assertEqual(status, 413)
        self.assertEqual(self.assert_private_json(headers, raw), {"error": "UKC_INVALID_REQUEST"})
        self.gateway.handle.assert_not_called()

    def test_gateway_failure_keeps_only_its_public_error_code_and_private_headers(self):
        # These are fixed test sentinels, never real environment values or credentials.
        self.gateway.internal_password = "synthetic-password-do-not-return"
        self.gateway.internal_token = "synthetic-token-do-not-return"
        self.gateway.handle.return_value = (502, {"error": "UKC_SERVICE_UNAVAILABLE"})
        status, headers, raw = self.request(headers=[("Content-Length", "2")], body=b"{}")
        self.assertEqual(status, 502)
        self.assertEqual(self.assert_private_json(headers, raw), {"error": "UKC_SERVICE_UNAVAILABLE"})
        self.assertNotIn(b"synthetic-password", raw)
        self.assertNotIn(b"synthetic-token", raw)


if __name__ == "__main__":
    unittest.main()
