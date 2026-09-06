#!/usr/bin/env python3
"""Throwaway static server for the prototypes.

http.server sends no Cache-Control, so browsers apply heuristic caching and keep serving
stale CSS/JS after an edit. These are prototypes being iterated on minute by minute, so
every response is explicitly uncacheable.
"""

import json
import os
import sys
import urllib.error
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

CORE = os.environ.get("PYXIS_CORE", "http://127.0.0.1:4488")
_token = None


def core_call(payload, token=None):
    request = urllib.request.Request(
        f"{CORE}/rpc",
        data=json.dumps(payload).encode(),
        headers={
            "content-type": "application/json",
            **({"authorization": f"Bearer {token}"} if token else {}),
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read())


def bearer():
    """Claim one device for the reference set and reuse it.

    The claim happens here rather than in the page so the token never reaches the browser,
    and so opening a prototype does not register a new device every reload.
    """
    global _token
    if _token is None:
        claimed = core_call({"_tag": "auth.device.claim", "payload": {"name": "pyxis-reference"}})
        _token = claimed["outcome"]["value"]["bearerToken"]
    return _token


class NoCacheHandler(SimpleHTTPRequestHandler):
    # The wall pulls hundreds of covers at once. A single-threaded server serialises them
    # and the page appears to hang, so keep-alive and threading are both required.
    protocol_version = "HTTP/1.1"

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write(f"{self.address_string()} {fmt % args}\n")

    def do_POST(self):  # noqa: N802 - http.server's naming
        """Forward one RPC to the running core.

        A design reference that renders a fixture eventually disagrees with the product and
        nobody notices, because both look fine on their own. Pointing it at the real core over
        the real contract means a change to either shows up here as a broken page.
        """
        if self.path != "/api/rpc":
            self.send_error(404)
            return
        body = self.rfile.read(int(self.headers.get("content-length", 0)))
        try:
            result = core_call(json.loads(body), bearer())
        except (urllib.error.URLError, OSError, KeyError, ValueError) as error:
            # The core being down is a state the surfaces already draw, so say so in their
            # language instead of failing the request.
            result = {
                "_tag": "rpc.failure",
                "outcome": {
                    "status": "rejected",
                    "value": {"code": "core.unreachable", "message": str(error), "retryable": True},
                },
            }
        payload = json.dumps(result).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def main():
    host = sys.argv[1] if len(sys.argv) > 1 else "127.0.0.1"
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 4499
    directory = sys.argv[3] if len(sys.argv) > 3 else "."
    handler = partial(NoCacheHandler, directory=directory)
    server = ThreadingHTTPServer((host, port), handler)
    server.daemon_threads = True
    print(f"serving {directory} on http://{host}:{port} with no-store", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
