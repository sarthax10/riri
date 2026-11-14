"""Artifacts: pages and small web apps RiRi builds and serves, each at its own address, https://<uuid>.<domain>/.

An artifact is a folder on the server plus a command that serves it. The command runs as the owner's user, detached
(setsid) so it outlives the SSH call that started it, with PORT and HOST in its environment. HOST is the Docker
bridge address (172.17.0.1), so the app is reachable from Caddy but not from the home network. Caddy holds one
wildcard certificate for *.<domain> and asks this module (forward_auth to /api/artifacts/gate) where each
subdomain lives. The random uuid is the only key, the way a "share by link" document works.
"""
import asyncio
import html
import os
import re
import shlex
import time
import uuid

import httpx

from .host import qpath

PORT_MIN, PORT_MAX = 9100, 9199
LOGDIR = ".local/share/riri/artifacts"
DOMAIN = os.environ.get("RELIQUARY_DOMAIN", "")
STATIC = 'python3 -m http.server "$PORT" --bind "$HOST"'
FIREWALL_FIX = f"sudo ufw allow from 172.16.0.0/12 to 172.17.0.1 port {PORT_MIN}:{PORT_MAX} proto tcp comment 'RiRi artifacts'"
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")

SCHEMA = """CREATE TABLE IF NOT EXISTS artifacts(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', dir TEXT NOT NULL,
  command TEXT NOT NULL, port INTEGER NOT NULL, pid INTEGER, state TEXT NOT NULL DEFAULT 'stopped',
  session_id TEXT, created REAL NOT NULL, started REAL, updated REAL NOT NULL, error TEXT)"""


def gate_page(title, text, status):
    """What a visitor sees at an artifact address that isn't serving."""
    return status, f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)}</title><meta name="robots" content="noindex"><style>
body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#0F1013;color:#ECEAE6;font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}}
main{{max-width:440px;padding:32px;text-align:center}}
i{{display:block;width:54px;height:54px;margin:0 auto 22px;border-radius:50%;border:2px solid #FF6B2C;box-shadow:0 0 30px -4px rgba(255,107,44,.6)}}
h1{{font-weight:300;font-size:30px;letter-spacing:-.03em;margin:0 0 8px;color:#F2E6D6}}p{{margin:0;color:#999CA4}}
</style></head><body><main><i></i><h1>{html.escape(title)}</h1><p>{html.escape(text)}</p></main></body></html>"""


class Artifacts:
    def __init__(self, db, host):
        self.db, self.host = db, host
        self.bind = "172.17.0.1"
        self.blocked = False
        self.lock = asyncio.Lock()
        db.x(SCHEMA)

    # ------------------------------------------------------------ records
    def get(self, aid):
        return self.db.one("SELECT * FROM artifacts WHERE id=?", (aid,))

    def url(self, a):
        return f"https://{a['id']}.{DOMAIN}/" if DOMAIN else f"http://{self.bind}:{a['port']}/"

    def public(self, a):
        if not a:
            return None
        return {**a, "url": self.url(a), "uptime": (time.time() - a["started"]) if a["state"] == "live" and a["started"] else None}

    def list(self):
        rows = self.db.q("SELECT * FROM artifacts ORDER BY state='live' DESC, updated DESC")
        return [self.public(a) for a in rows]

    def _save(self, aid, **f):
        f["updated"] = time.time()
        cols = ",".join(f"{k}=?" for k in f)
        self.db.x(f"UPDATE artifacts SET {cols} WHERE id=?", (*f.values(), aid))

    # ------------------------------------------------------------ the host side
    async def setup(self):
        """Finds the bridge address to bind to, then brings back artifacts that were live before a restart."""
        r = await self.host.exec("ip -4 -o addr show docker0 2>/dev/null | awk '{print $4}' | cut -d/ -f1", timeout=20)
        ip = (r.get("output") or "").strip().splitlines()
        self.bind = ip[0] if ip and re.match(r"^\d+\.\d+\.\d+\.\d+$", ip[0]) else "0.0.0.0"
        return await self.restore()

    def upstream(self, a):
        return f"{self.bind if self.bind != '0.0.0.0' else 'host.docker.internal'}:{a['port']}"

    async def alive(self, rows):
        """The ids whose process is still running. A process counts only if its environment still says PORT=<its
        port>, so a pid reused by something else after a reboot is never mistaken for the artifact."""
        rows = [a for a in rows if a.get("pid")]
        if not rows:
            return set()
        checks = " ".join(f"{int(a['pid'])}:{int(a['port'])}" for a in rows)
        cmd = (f"for x in {checks}; do p=${{x%%:*}}; q=${{x##*:}}; "
               f"tr '\\0' '\\n' < /proc/$p/environ 2>/dev/null | grep -qx \"PORT=$q\" && echo ALIVE:$p; done; true")
        r = await self.host.exec(cmd, timeout=20)
        pids = {int(l[6:]) for l in (r.get("output") or "").split() if l.startswith("ALIVE:") and l[6:].isdigit()}
        return {a["id"] for a in rows if a["pid"] in pids}

    async def probe(self, a, timeout=2.0):
        """True when something answers HTTP on the artifact's port (any status counts)."""
        try:
            async with httpx.AsyncClient(timeout=timeout) as c:
                await c.get(f"http://{self.upstream(a)}/", headers={"Host": f"{a['id']}.{DOMAIN or 'localhost'}"})
            return True
        except httpx.HTTPError:
            return False

    async def probe_host(self, a):
        """The same check made from the server itself (not through Docker's networks)."""
        r = await self.host.exec(f"curl -s -o /dev/null -m 3 -w '%{{http_code}}' http://{self.bind}:{a['port']}/ || true", timeout=15)
        code = (r.get("output") or "").strip()[-3:]
        return code.isdigit() and code != "000"

    async def firewall_blocked(self):
        """True when a live artifact answers on the server but Caddy's networks can't reach it (a host firewall)."""
        live = self.db.q("SELECT * FROM artifacts WHERE state='live' LIMIT 1")
        if not live or await self.probe(live[0], 1.5):
            self.blocked = False
            return False
        self.blocked = await self.probe_host(live[0])
        return self.blocked

    async def _listening(self):
        r = await self.host.exec("ss -ltnH 2>/dev/null | awk '{print $4}'", timeout=20)
        return {int(m.group(1)) for m in re.finditer(r":(\d+)\s*$", r.get("output") or "", re.M)}

    async def _free_port(self, prefer=None, me=None):
        taken = {a["port"] for a in self.db.q("SELECT id, port FROM artifacts WHERE state!='stopped'") if a["id"] != me}
        busy = await self._listening()
        if prefer and prefer not in taken and prefer not in busy:
            return prefer
        for p in range(PORT_MIN, PORT_MAX + 1):
            if p not in taken and p not in busy:
                return p
        raise RuntimeError(f"every artifact port ({PORT_MIN}-{PORT_MAX}) is in use; stop one first")

    async def _kill(self, a):
        if not a.get("pid"):
            return
        p = int(a["pid"])
        if a["id"] not in await self.alive([a]):
            return
        await self.host.exec(f"kill -TERM -- -{p} 2>/dev/null || kill -TERM {p} 2>/dev/null; "
                             f"for i in 1 2 3 4 5 6; do kill -0 {p} 2>/dev/null || exit 0; sleep 0.5; done; "
                             f"kill -KILL -- -{p} 2>/dev/null || kill -KILL {p} 2>/dev/null; true", timeout=20)

    async def logs(self, aid, lines=80):
        lines = max(5, min(int(lines or 80), 400))
        r = await self.host.exec(f"tail -n {lines} ~/{LOGDIR}/{aid}.log 2>/dev/null || echo '(no log yet)'", timeout=20)
        return (r.get("output") or "").rstrip() or "(the log is empty)"

    # ------------------------------------------------------------ lifecycle
    async def start(self, name=None, folder=None, command=None, description=None, aid=None, session_id=None, wait=25):
        """Starts (or restarts) an artifact. Returns (record, message, ok)."""
        async with self.lock:
            if aid and not UUID_RE.match(aid):
                aid = None   # a made-up id ("jwst"): treat it as a new artifact rather than failing
            old = self.get(aid) if aid else None
            if aid and not old:
                return None, f"No artifact with id {aid}. Leave id out to create a new one.", False
            folder = (folder or (old and old["dir"]) or "").strip()
            if not folder:
                return None, "Give the folder that holds the artifact.", False
            st = await self.host.fs("stat", path=folder)
            if st.get("error") or not st.get("dir"):
                return None, f"{folder} is not a folder on the server ({st.get('error') or 'it is a file'}).", False
            folder = st["path"]
            command = (command or (old and old["command"]) or "").strip()
            if not command:
                idx = await self.host.fs("stat", path=folder + "/index.html")
                if idx.get("error"):
                    return None, ("There is no index.html in that folder. Either add one (a static page is served "
                                  "as is) or give the command that starts the app on $HOST:$PORT."), False
                command = STATIC
            if old:
                await self._kill(old)
            port = await self._free_port(old["port"] if old else None, me=aid)
            aid = aid or str(uuid.uuid4())
            # cd first, then background only the command: `cd x && cmd &` would background a subshell that keeps
            # the SSH channel open (and $! would be that subshell, not the app)
            launch = (f"mkdir -p ~/{LOGDIR}; cd {qpath(folder)} || exit 1; "
                      f"PORT={port} HOST={self.bind} setsid nohup bash -lc {shlex.quote(command)} "
                      f"> ~/{LOGDIR}/{aid}.log 2>&1 < /dev/null & echo PID:$!")
            r = await self.host.exec(launch, timeout=30)
            m = re.search(r"PID:(\d+)", r.get("output") or "")
            if not m:
                return None, "Could not start it: " + (r.get("output") or "no answer from the server")[-400:], False
            now = time.time()
            fields = dict(name=(name or (old and old["name"]) or os.path.basename(folder.rstrip("/")) or "Artifact")[:80],
                          description=(description if description is not None else (old and old["description"]) or "")[:300],
                          dir=folder, command=command, port=port, pid=int(m.group(1)), state="live", started=now, error=None)
            if old:
                self._save(aid, **fields)
            else:
                self.db.x("INSERT INTO artifacts(id,name,description,dir,command,port,pid,state,session_id,created,started,updated) "
                          "VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                          (aid, fields["name"], fields["description"], folder, command, port, fields["pid"], "live",
                           session_id, now, now, now))
        a = self.get(aid)
        deadline = time.time() + wait
        tries = 0
        while time.time() < deadline:
            if await self.probe(a):
                self.blocked = False
                return self.public(a), f"Live at {self.url(a)}", True
            tries += 1
            if tries % 3 == 0 and await self.probe_host(a):
                self.blocked = True
                return self.public(a), (f"It is running and answers on the server, but the server's firewall stops the web "
                                        f"front door from reaching it, so the link won't open yet. Tell the owner to run "
                                        f"once:\n{FIREWALL_FIX}"), True
            await asyncio.sleep(0.7)
            if aid not in await self.alive([a]):
                log = await self.logs(aid, 40)
                self._save(aid, state="crashed", error=log[-2000:])
                return self.public(self.get(aid)), f"It exited straight away. Its log:\n{log}", False
        log = await self.logs(aid, 30)
        return (self.public(a), f"It is running but nothing answers on $HOST:$PORT ({self.bind}:{a['port']}) after {wait} s. "
                f"Make sure it listens on $HOST and $PORT (not localhost or a fixed port), or check the log:\n{log}", False)

    async def stop(self, aid):
        a = self.get(aid)
        if not a:
            return False
        await self._kill(a)
        self._save(aid, state="stopped", pid=None)
        return True

    async def delete(self, aid):
        await self.stop(aid)
        self.db.x("DELETE FROM artifacts WHERE id=?", (aid,))

    async def check(self):
        """Marks artifacts whose process has died. Called by the scheduler."""
        live = self.db.q("SELECT * FROM artifacts WHERE state='live'")
        if not live:
            return
        ok = await self.alive(live)
        for a in live:
            if a["id"] not in ok:
                self._save(a["id"], state="crashed", pid=None, error=(await self.logs(a["id"], 30))[-2000:])

    async def restore(self):
        """After the server or the app restarts, starts again the artifacts that should be live."""
        live = self.db.q("SELECT * FROM artifacts WHERE state='live'")
        ok = await self.alive(live) if live else set()
        back = []
        for a in live:
            if a["id"] not in ok:
                rec, _, good = await self.start(aid=a["id"], wait=8)
                back.append(a["name"] + ("" if good else " (not answering yet)"))
        return back

    # ------------------------------------------------------------ Caddy asks: where does this address go?
    def gate(self, hostname):
        sub = (hostname or "").split(":")[0].split(".")[0].lower()
        a = self.get(sub) if UUID_RE.match(sub) else None
        if not a:
            return None, gate_page("Nothing here", "This address doesn't point to anything. It may have been deleted.", 404)
        if a["state"] != "live":
            return None, gate_page(a["name"], "This artifact is switched off right now. Its owner can start it again from the Live page.", 503)
        return self.upstream(a), None
