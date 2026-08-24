#!/usr/bin/env python3
"""Throwaway static server for the prototypes.

http.server sends no Cache-Control, so browsers apply heuristic caching and keep serving
stale CSS/JS after an edit. These are prototypes being iterated on minute by minute, so
every response is explicitly uncacheable.
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


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
