# tools/serve.py — a static server for development (npm run serve): threaded, with a deep listen queue (python's
# http.server keeps 5 pending connections, and the browser opens dozens at once while the city streams in, so some
# requests failed) and no caching (edited modules are always reloaded).
# usage: python3 tools/serve.py [port]   → http://127.0.0.1:8765/
import http.server
import sys


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *args):
        pass


class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 256
    daemon_threads = True


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
print(f'http://127.0.0.1:{port}/')
Server(('127.0.0.1', port), Handler).serve_forever()
