#!/usr/bin/env python3
"""
Dev static server for the site at the repo root.

Why not `python3 -m http.server`: it sends Last-Modified and no Cache-Control,
so the browser keeps serving a stale scripts/*.js after you edit it. ES module
graphs make that worse — a cached module is reused across reloads, so an edit
appears to have no effect and you debug code the page is not running.

This sends `no-store`, so every reload picks up what is on disk.

    npm run site        # then open http://localhost:8000
"""
import http.server
import os
import sys

PORT = int(os.environ.get("PORT", 8000))
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        super().end_headers()


if __name__ == "__main__":
    os.chdir(ROOT)
    print(f"Serving {ROOT} on http://localhost:{PORT} (no-store)")
    try:
        http.server.ThreadingHTTPServer(("", PORT), NoCacheHandler).serve_forever()
    except KeyboardInterrupt:
        sys.exit(0)
