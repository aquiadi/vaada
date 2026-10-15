"""Stand-in for Supabase's API gateway in this container: /auth/v1/* goes to GoTrue, and the OTP email
template is served for GoTrue to fetch, as the Supabase CLI does."""
import http.client
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

GOTRUE = ("127.0.0.1", 9999)
TEMPLATE = Path(sys.argv[1]).read_bytes()
CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Expose-Headers": "x-sb-error-code, x-supabase-api-version",
}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.command, self.path))

    def _send(self, status, headers, body):
        self.send_response(status)
        for k, v in headers:
            if k.lower() not in ("transfer-encoding", "connection", "content-length") and not k.lower().startswith("access-control-"):
                self.send_header(k, v)
        for k, v in CORS.items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _proxy(self):
        if self.command == "OPTIONS":
            return self._send(204, [], b"")
        if self.path == "/templates/otp.html":
            return self._send(200, [("Content-Type", "text/html")], TEMPLATE)
        if not self.path.startswith("/auth/v1/"):
            return self._send(404, [("Content-Type", "text/plain")], b"not found")
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None
        conn = http.client.HTTPConnection(*GOTRUE, timeout=30)
        headers = {k: v for k, v in self.headers.items() if k.lower() not in ("host", "connection")}
        conn.request(self.command, self.path[len("/auth/v1"):], body=body, headers=headers)
        resp = conn.getresponse()
        data = resp.read()
        self._send(resp.status, resp.getheaders(), data)

    do_GET = do_POST = do_PUT = do_PATCH = do_DELETE = do_OPTIONS = _proxy


ThreadingHTTPServer(("127.0.0.1", 54321), Handler).serve_forever()
