# receives POSTs from the page: /save?name=<file> writes the body into this folder
import http.server, urllib.parse, os, re
HERE = os.path.dirname(os.path.abspath(__file__))
class H(http.server.BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*'); self.send_header('Access-Control-Allow-Headers', '*')
    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()
    def do_POST(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        name = re.sub(r'[^A-Za-z0-9._-]', '_', q.get('name', ['out.txt'])[0])
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        open(os.path.join(HERE, name), 'wb').write(body)
        self.send_response(200); self._cors(); self.end_headers(); self.wfile.write(b'ok')
    def log_message(self, *a): pass
http.server.HTTPServer(('127.0.0.1', 9340), H).serve_forever()
