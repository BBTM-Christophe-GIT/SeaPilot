"""Vercel file-based Python function; the rest of the Vite application remains Node.js."""
import json
import os
from http.server import BaseHTTPRequestHandler

from server.copernicus_gateway import HEADERS, MAX_BODY, UkcGateway

gateway = UkcGateway(os.environ)


class handler(BaseHTTPRequestHandler):
    def _respond(self, status, value):
        body = json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        for name, header in HEADERS.items():
            self.send_header(name, header)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        if status == 405:
            self.send_header("Allow", "POST")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", "-1"))
        except ValueError:
            length = -1
        if length < 0 or self.headers.get("Transfer-Encoding"):
            return self._respond(400, {"error": "UKC_INVALID_REQUEST"})
        if length > MAX_BODY:
            return self._respond(413, {"error": "UKC_INVALID_REQUEST"})
        body = self.rfile.read(length)
        # Host is Vercel's routed request host; no user-supplied callback/provider URL.
        origin = f"https://{self.headers.get('Host', '')}"
        status, value = gateway.handle("POST", dict(self.headers.items()), body, origin)
        self._respond(status, value)

    def do_GET(self):
        self._respond(405, {"error": "UKC_METHOD_NOT_ALLOWED"})

    do_PUT = do_GET
    do_DELETE = do_GET
    do_PATCH = do_GET
    do_OPTIONS = do_GET

    def log_message(self, *_args):
        # The platform records request status; never log tokens, account values or SDK exceptions.
        pass
