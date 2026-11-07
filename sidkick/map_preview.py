"""Loopback-only, static SVG viewer. This module has no game adapter or control API."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

from civ7.svg_preview import PREVIEW_DIR, PREVIEW_NAME, PREVIEW_URL


class PreviewHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PREVIEW_DIR), **kwargs)

    def send_head(self):
        if urlsplit(self.path).path != "/" + PREVIEW_NAME:
            self.send_error(404)
            return None
        # Always return current bytes, even if a browser cached an earlier view.
        for header in ("If-Modified-Since", "If-None-Match"):
            if header in self.headers:
                del self.headers[header]
        return super().send_head()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'")
        super().end_headers()

    def log_message(self, format, *args):
        pass


def serve_preview(port: int = 8765):
    if type(port) is not int or not 1 <= port <= 65535:
        raise ValueError("A valid local preview port is required")
    with ThreadingHTTPServer(("127.0.0.1", port), PreviewHandler) as server:
        url = PREVIEW_URL.replace(":8765/", f":{port}/")
        print(f"Static map viewer: {url} (loopback only; no game calls)", flush=True)
        server.serve_forever()


if __name__ == "__main__":
    serve_preview()
