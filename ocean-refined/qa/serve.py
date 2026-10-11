"""Quiet, loopback-only static preview with room for parallel ES-module requests."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


class Server(ThreadingHTTPServer):
    request_queue_size = 128
    daemon_threads = True


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[2]
    with Server(("127.0.0.1", 4175), partial(Handler, directory=str(root))) as server:
        print("Ocean preview: http://127.0.0.1:4175/ocean/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
