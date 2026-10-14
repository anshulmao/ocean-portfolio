from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from pathlib import Path
import argparse
import gzip
import hashlib
import io
import re
import socket
parser = argparse.ArgumentParser()
parser.add_argument("--port", type=int, default=4180)
args = parser.parse_args()
root = Path(__file__).resolve().parent
cache_root = root / '.http-cache'
compressible = {'.html', '.js', '.css', '.json', '.svg', '.glb', '.rgba'}
def cache_path(path, stat):
    identity = str(path.relative_to(root)) + ':' + str(stat.st_mtime_ns) + ':' + str(stat.st_size)
    return cache_root / (hashlib.sha256(identity.encode()).hexdigest() + '.gz')
if args.port < 1 or args.port > 65535:
    parser.error('Port must be between 1 and 65535')
ThreadingHTTPServer.request_queue_size = 128
ThreadingHTTPServer.daemon_threads = True
class Server(ThreadingHTTPServer):
    allow_reuse_address = False
    def server_bind(self):
        # Windows otherwise permits two preview processes on the same address,
        # which can silently mix old/new resources during development and QA.
        if hasattr(socket, 'SO_EXCLUSIVEADDRUSE'):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()
class Handler(SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def log_message(self, *args): pass
    def send_head(self):
        path = Path(self.translate_path(self.path)).resolve()
        encoding = self.headers.get('Accept-Encoding', '')
        gzip_allowed = bool(re.search(r'(?:^|,)\s*gzip\s*(?:,|$|;\s*q=(?!0(?:\.0*)?(?:\s*,|\s*$))\d)', encoding))
        if (not path.is_relative_to(root) or not path.is_file() or path.suffix not in compressible
                or not gzip_allowed or self.headers.get('Range')):
            return super().send_head()
        stat = path.stat()
        if stat.st_size < 1024:
            return super().send_head()
        etag = '"%x-%x-gzip"' % (stat.st_mtime_ns, stat.st_size)
        if self.headers.get('If-None-Match') == etag:
            self.send_response(304)
            self.send_header('ETag', etag)
            self.send_header('Vary', 'Accept-Encoding')
            self.end_headers()
            return None
        cached = cache_path(path, stat)
        # Build once before benchmarking/deployment with tools/build-http-cache.py.
        # Missing entries still work, without making repeat requests recompress.
        cached_exists = cached.is_file()
        payload = b'' if self.command == 'HEAD' and cached_exists else (cached.read_bytes() if cached_exists else gzip.compress(path.read_bytes(), compresslevel=6, mtime=0))
        encoded_length = cached.stat().st_size if cached_exists else len(payload)
        self.send_response(200)
        self.send_header('Content-Type', self.guess_type(str(path)))
        self.send_header('Content-Encoding', 'gzip')
        self.send_header('Content-Length', str(encoded_length))
        self.send_header('X-Source-Length', str(stat.st_size))
        self.send_header('Last-Modified', self.date_time_string(stat.st_mtime))
        self.send_header('ETag', etag)
        self.send_header('Vary', 'Accept-Encoding')
        self.end_headers()
        return io.BytesIO(payload)
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()
print(f"Ocean editing kit: http://127.0.0.1:{args.port}/", flush=True)
Server(("127.0.0.1", args.port), partial(Handler, directory=str(root))).serve_forever()
