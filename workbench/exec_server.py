"""The workbench: runs the agent's shell commands inside this locked-down container.

Only the app container can reach it (internal Docker network) and every request needs the shared token.
Commands run as an unprivileged user, in /workspaces/<name>, with a time limit; the whole process group is
killed when the limit is hit.
"""
import json
import os
import re
import signal
import subprocess
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN = os.environ.get("WORKBENCH_TOKEN", "")
ROOT = "/workspaces"
NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
MAX_OUTPUT = 200_000


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def reply(self, code, obj):
        data = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self.reply(200, {"ok": True}) if self.path == "/health" else self.reply(404, {})

    def do_POST(self):
        if self.path != "/exec" or not TOKEN or self.headers.get("X-Token") != TOKEN:
            return self.reply(403, {"error": "forbidden"})
        try:
            req = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
            ws, cmd = req["workspace"], req["command"]
            timeout = max(1, min(int(req.get("timeout", 120)), 900))
            if not NAME_RE.match(ws):
                raise ValueError("bad workspace")
        except Exception as e:
            return self.reply(400, {"error": str(e)})
        cwd = os.path.join(ROOT, ws)
        os.makedirs(cwd, exist_ok=True)
        t0 = time.time()
        p = subprocess.Popen(["bash", "-lc", cmd], cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                             stdin=subprocess.DEVNULL, start_new_session=True,
                             env={**os.environ, "WORKBENCH_TOKEN": "", "TERM": "dumb", "CI": "1"})
        timed_out = False
        try:
            out, _ = p.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
            os.killpg(p.pid, signal.SIGKILL)
            out, _ = p.communicate()
        text = out[:MAX_OUTPUT].decode("utf-8", errors="replace")
        if len(out) > MAX_OUTPUT:
            text += f"\n… [{len(out) - MAX_OUTPUT} more bytes]"
        self.reply(200, {"exit": p.returncode, "output": text, "timed_out": timed_out,
                         "seconds": round(time.time() - t0, 1)})


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 7070), Handler).serve_forever()
