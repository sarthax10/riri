"""The server itself: run commands and work with files on the host, as the owner's own user, over SSH.

The app holds its own SSH key (/data/host_key). The host only accepts that key from the app's private Docker
networks (a from= restriction in ~/.ssh/authorized_keys), so the key is useless anywhere else. File operations go
through a small helper script on the host that answers in JSON, so paths and contents never pass through a shell.
"""
import asyncio
import base64
import json
import os
import shlex

DATA = os.environ.get("RELIQUARY_DATA", "/data")
HOST = os.environ.get("RELIQUARY_HOST", "host.docker.internal")
USER = os.environ.get("RELIQUARY_HOST_USER", "")  # the server account RiRi acts as (HOST_USER in .env)
KEY = os.path.join(DATA, "host_key")
KNOWN = os.path.join(DATA, "known_hosts")
HELPER_PATH = ".local/share/riri/fs.py"  # relative to the owner's home on the host
MAX_READ = 1_500_000

HELPER = r'''
import base64, json, os, shutil, stat, sys, time
def out(x): sys.stdout.write(json.dumps(x)); sys.stdout.flush()
op, args = sys.argv[1], json.loads(sys.argv[2])
home = os.path.expanduser("~")
P = lambda p: os.path.abspath(os.path.expanduser(p or "~"))
try:
    if op == "list":
        p = P(args.get("path")); items = []
        with os.scandir(p) as it:
            for e in it:
                try:
                    st = e.stat(follow_symlinks=False); isdir = e.is_dir(follow_symlinks=True)
                except OSError:
                    continue
                items.append({"name": e.name, "dir": isdir, "link": e.is_symlink(), "size": st.st_size,
                              "mtime": st.st_mtime, "mode": stat.filemode(st.st_mode)})
        items.sort(key=lambda i: (not i["dir"], i["name"].lower()))
        out({"path": p, "home": home, "items": items[:5000], "more": len(items) > 5000})
    elif op == "read":
        p = P(args["path"]); size = os.path.getsize(p); limit = int(args.get("limit", 1500000))
        with open(p, "rb") as f: raw = f.read(limit)
        binary = b"\0" in raw[:8000]
        out({"path": p, "size": size, "binary": binary, "truncated": size > len(raw),
             "b64": base64.b64encode(raw).decode() if args.get("raw") else None,
             "text": None if binary or args.get("raw") else raw.decode("utf-8", "replace")})
    elif op == "write":
        p = P(args["path"]); os.makedirs(os.path.dirname(p), exist_ok=True)
        data = base64.b64decode(sys.stdin.read()) if args.get("b64") else sys.stdin.read().encode()
        tmp = p + ".riri-tmp"
        with open(tmp, "wb") as f: f.write(data)
        if os.path.exists(p): shutil.copymode(p, tmp)
        os.replace(tmp, p); out({"ok": True, "path": p, "size": len(data)})
    elif op == "edit":
        p = P(args["path"]); text = open(p, encoding="utf-8").read(); n = text.count(args["old"])
        if n != 1:
            out({"ok": False, "count": n})
        else:
            with open(p, "w", encoding="utf-8") as f: f.write(text.replace(args["old"], args["new"], 1))
            out({"ok": True, "path": p})
    elif op == "mkdir":
        p = P(args["path"]); os.makedirs(p, exist_ok=True); out({"ok": True, "path": p})
    elif op == "rename":
        a, b = P(args["path"]), P(args["to"])
        if os.path.exists(b): out({"ok": False, "error": "something with that name already exists"})
        else: os.rename(a, b); out({"ok": True, "path": b})
    elif op == "trash":
        p = P(args["path"]); t = os.path.join(home, ".local/share/riri/trash", time.strftime("%Y%m%d-%H%M%S"))
        os.makedirs(t, exist_ok=True); shutil.move(p, os.path.join(t, os.path.basename(p)))
        out({"ok": True, "trash": t})
    elif op == "stat":
        p = P(args["path"]); st = os.stat(p); out({"path": p, "dir": os.path.isdir(p), "size": st.st_size, "home": home})
    else:
        out({"error": "unknown op"})
except FileNotFoundError: out({"error": "No such file or folder."})
except PermissionError: out({"error": "Permission denied (this needs root)."})
except IsADirectoryError: out({"error": "That is a folder, not a file."})
except NotADirectoryError: out({"error": "That is a file, not a folder."})
except Exception as e: out({"error": str(e)[:300]})
'''


class Host:
    def __init__(self):
        self.ready = False
        self.home = f"/home/{USER}"

    def pubkey(self):
        try:
            return open(KEY + ".pub").read().strip()
        except OSError:
            return None

    async def ensure_key(self):
        if not os.path.exists(KEY):
            p = await asyncio.create_subprocess_exec("ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-C", "riri@reliquary", "-f", KEY)
            await p.wait()

    def _ssh(self):
        return ["ssh", "-i", KEY, "-o", f"UserKnownHostsFile={KNOWN}", "-o", "StrictHostKeyChecking=accept-new",
                "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=30",
                "-o", "LogLevel=ERROR", f"{USER}@{HOST}"]

    async def _run(self, remote, stdin=None, timeout=120):
        proc = await asyncio.create_subprocess_exec(*self._ssh(), remote, stdin=asyncio.subprocess.PIPE,
                                                    stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
        try:
            out, _ = await asyncio.wait_for(proc.communicate(stdin.encode() if isinstance(stdin, str) else stdin), timeout)
            return proc.returncode, out, False
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            return None, b"", True

    async def setup(self):
        """Installs the file helper on the host. Returns an error string, or None when the host is reachable."""
        await self.ensure_key()
        code, out, _ = await self._run(f"mkdir -p ~/.local/share/riri && cat > ~/{HELPER_PATH} && echo ok:$HOME", HELPER, 30)
        text = out.decode(errors="replace").strip()
        if code == 0 and "ok:" in text:
            self.home = text.split("ok:")[-1].strip()
            self.ready = True
            return None
        self.ready = False
        return text[-300:] or "the server did not answer"

    async def exec(self, command, cwd=None, timeout=120):
        """Runs a bash command on the host. Returns {exit, output, timed_out}."""
        if not self.ready:
            err = await self.setup()
            if err:
                return {"exit": None, "output": f"Cannot reach the server over SSH: {err}", "timed_out": False}
        wd = cwd or "~"
        wd_q = "~" if wd == "~" else ("~/" + shlex.quote(wd[2:]) if wd.startswith("~/") else shlex.quote(wd))
        remote = f"cd {wd_q} 2>/dev/null || cd ~; exec bash -lc {shlex.quote(command)} 2>&1"
        code, out, timed_out = await self._run(remote, timeout=timeout)
        text = out[:200_000].decode("utf-8", errors="replace")
        if len(out) > 200_000:
            text += f"\n… [{len(out) - 200_000} more bytes]"
        return {"exit": code, "output": text, "timed_out": timed_out}

    async def fs(self, op, stdin=None, timeout=60, **args):
        if not self.ready:
            err = await self.setup()
            if err:
                return {"error": f"Cannot reach the server over SSH: {err}"}
        remote = f"python3 ~/{HELPER_PATH} {op} {shlex.quote(json.dumps(args))}"
        code, out, timed_out = await self._run(remote, stdin=stdin or "", timeout=timeout)
        if timed_out:
            return {"error": "The server took too long to answer."}
        try:
            return json.loads(out.decode("utf-8", errors="replace"))
        except ValueError:
            return {"error": out.decode(errors="replace")[-300:] or "no answer"}

    async def read_bytes(self, path):
        r = await self.fs("read", path=path, raw=True, limit=200_000_000, timeout=300)
        if r.get("error"):
            return None, r["error"]
        return base64.b64decode(r["b64"] or ""), None

    async def write_bytes(self, path, data: bytes):
        return await self.fs("write", stdin=base64.b64encode(data).decode(), path=path, b64=True, timeout=300)
