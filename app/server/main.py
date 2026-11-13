"""Reliquary API: auth, sessions, runs (SSE), workspaces, tasks, notes, memories, dashboard, settings."""
import asyncio
import glob
import json
import os
import re
import time

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, PlainTextResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from . import tools as T
from .auth import Auth, hash_password, check_password, check_totp, new_totp_secret
from .db import DB
from .llm import LLM
from .push import Push
from .runs import Engine
from .scheduler import Scheduler

DATA = os.environ.get("RELIQUARY_DATA", "/data")
WEB = os.environ.get("RELIQUARY_WEB", os.path.join(os.path.dirname(__file__), "..", "web"))
os.makedirs(DATA, exist_ok=True)

db = DB(os.path.join(DATA, "reliquary.db"))
auth = Auth(db, DATA, dev_noauth=os.environ.get("RELIQUARY_DEV_NOAUTH") == "1")
llm = LLM(os.environ.get("RELIQUARY_LLM", "http://llm:8080"))
engine = Engine(db, llm)
push = Push(db, DATA)
engine.push = push
scheduler = Scheduler(db, engine, push)
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
COOKIE = "rq_session"
STARTED = time.time()


def server_gate():
    """Server access (shell and files) needs two-step sign-in, unless the owner switched that safeguard off."""
    if auth.dev_noauth or auth.totp_enabled or not {**DEFAULT_SETTINGS, **db.get("settings", {})}.get("server_requires_2fa", True):
        return None
    return ("Server access is locked: the owner has to turn on two-step sign-in (Settings) first. "
            "Tell them that, and what you would have done.")


T.server_gate = server_gate


def require_server():
    msg = server_gate()
    if msg:
        raise HTTPException(423, "Server access needs two-step sign-in. Turn it on in Settings first.")


@app.on_event("startup")
async def on_startup():
    err = await T.host.setup()
    print("server access: " + ("ready, home " + T.host.home if not err else "NOT ready: " + err), flush=True)
    resumed = engine.resume_interrupted()
    if resumed:
        print(f"resumed {len(resumed)} interrupted repl{'y' if len(resumed) == 1 else 'ies'}: {', '.join(resumed)}", flush=True)
    app.state.scheduler_task = asyncio.create_task(scheduler.loop())


# ---------------------------------------------------------------- auth
def bearer(request: Request):
    h = request.headers.get("authorization", "")
    return h[7:].strip() if h.lower().startswith("bearer ") else None


def need(request: Request):
    kind = auth.check(request.cookies.get(COOKIE), bearer(request))
    if not kind:
        raise HTTPException(401, "Sign in first.")
    # Cookie-authenticated writes must carry a custom header, which other sites cannot send (CSRF guard).
    if kind == "web" and request.method not in ("GET", "HEAD") and request.headers.get("x-reliquary") != "1":
        raise HTTPException(403, "Missing request header.")
    return kind


async def body(request: Request):
    try:
        data = await request.json()
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


@app.get("/api/auth/state")
async def auth_state(request: Request):
    kind = auth.check(request.cookies.get(COOKIE), bearer(request))
    return {"authenticated": bool(kind), "password_set": auth.password_set, "totp": auth.totp_enabled,
            "name": db.get("settings", {}).get("name", ""),
            "assistant_name": db.get("settings", {}).get("assistant_name", "RiRi")}


@app.post("/api/auth/login")
async def login(request: Request, response: Response):
    data = await body(request)
    tok, err, wait = auth.login(data.get("password", ""), data.get("code", ""), request.headers.get("user-agent", ""))
    if err:
        await asyncio.sleep(0.8)
        raise HTTPException(429 if wait else 401, err)
    response.set_cookie(COOKIE, tok, max_age=30 * 86400, httponly=True, secure=True, samesite="strict", path="/")
    return {"ok": True}


@app.post("/api/auth/logout")
async def logout(request: Request, response: Response, kind=Depends(need)):
    auth.logout(request.cookies.get(COOKIE))
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@app.post("/api/auth/password")
async def set_password(request: Request, kind=Depends(need)):
    data = await body(request)
    new = data.get("new", "")
    if len(new) < 10:
        raise HTTPException(400, "Use at least 10 characters.")
    if kind == "web" and not check_password(data.get("current", ""), db.get("password_hash", "")):
        raise HTTPException(400, "The current password is not right.")
    db.put("password_hash", hash_password(new))
    if data.get("sign_out_everywhere", kind == "cli"):
        auth.logout_everywhere()
    return {"ok": True}


@app.post("/api/auth/totp/setup")
async def totp_setup(kind=Depends(need)):
    secret = new_totp_secret()
    db.put("totp_pending", secret)
    return {"secret": secret, "uri": f"otpauth://totp/Reliquary?secret={secret}&issuer=Reliquary"}


@app.post("/api/auth/totp/enable")
async def totp_enable(request: Request, kind=Depends(need)):
    data = await body(request)
    secret = db.get("totp_pending")
    if not secret or not check_totp(secret, data.get("code", "")):
        raise HTTPException(400, "That code did not match. Check the time on your phone and try again.")
    db.put("totp_secret", secret)
    db.x("DELETE FROM kv WHERE key='totp_pending'")
    return {"ok": True}


@app.post("/api/auth/totp/disable")
async def totp_disable(request: Request, kind=Depends(need)):
    data = await body(request)
    if kind == "web" and not check_password(data.get("password", ""), db.get("password_hash", "")):
        raise HTTPException(400, "The password is not right.")
    db.x("DELETE FROM kv WHERE key='totp_secret'")
    return {"ok": True}


# ---------------------------------------------------------------- status & dashboard
def server_health():
    h = {}
    try:
        mem = dict(l.split(":", 1) for l in open("/proc/meminfo"))
        kb = lambda k: int(mem[k].strip().split()[0])
        h["mem_total"] = kb("MemTotal") * 1024
        h["mem_used"] = (kb("MemTotal") - kb("MemAvailable")) * 1024
        h["load"] = float(open("/proc/loadavg").read().split()[0])
        h["uptime"] = float(open("/proc/uptime").read().split()[0])
        temps = [int(open(p).read()) / 1000 for p in glob.glob("/sys/class/thermal/thermal_zone*/temp")]
        h["temp"] = max(temps) if temps else None
    except Exception:
        pass
    return h


@app.get("/api/status")
async def status(kind=Depends(need)):
    props = await llm.props()
    return {"model": props, "online": await llm.health(), "engine": engine.status(), "server": server_health()}


@app.get("/api/dashboard")
async def dashboard(kind=Depends(need)):
    props = await llm.props()
    days = []
    for i in range(6, -1, -1):
        d = time.strftime("%Y-%m-%d", time.localtime(time.time() - i * 86400))
        row = db.one("SELECT * FROM usage WHERE day=?", (d,)) or {"day": d, "gen_tokens": 0, "prompt_tokens": 0,
                                                                  "chats": 0, "agent_runs": 0, "gen_seconds": 0}
        days.append(row)
    today = time.strftime("%Y-%m-%d")
    return {
        "name": db.get("settings", {}).get("name", ""),
        "model": props, "online": await llm.health(), "engine": engine.status(), "server": server_health(),
        "recent": db.sessions(limit=8),
        "tasks": db.q("SELECT * FROM tasks WHERE done=0 ORDER BY due IS NULL, due, id LIMIT 8"),
        "overdue": db.one("SELECT COUNT(*) AS n FROM tasks WHERE done=0 AND due<?", (today,))["n"],
        "notes": db.q("SELECT id,title,substr(body,1,140) AS body,updated FROM notes ORDER BY pinned DESC, updated DESC LIMIT 4"),
        "usage": days,
        "totals": {"sessions": db.one("SELECT COUNT(*) AS n FROM sessions")["n"],
                   "notes": db.one("SELECT COUNT(*) AS n FROM notes")["n"],
                   "memories": db.one("SELECT COUNT(*) AS n FROM memories")["n"],
                   "tasks_done": db.one("SELECT COUNT(*) AS n FROM tasks WHERE done=1")["n"]},
        "workspaces": workspace_list(),
    }


# ---------------------------------------------------------------- sessions
@app.get("/api/sessions")
async def list_sessions(mode: str = None, kind=Depends(need)):
    out = db.sessions(mode=mode)
    for s in out:
        s["meta"].pop("system", None); s["meta"].pop("context", None)
        r = engine.active_run(s["id"])
        s["running"] = r.summary() if r else None
    return out


@app.post("/api/sessions")
async def create_session(request: Request, kind=Depends(need)):
    data = await body(request)
    mode = "agent" if data.get("mode") == "agent" else "chat"
    # The working folder on the server: any absolute or ~ path (code sessions), or home for chats.
    cwd = (data.get("cwd") or data.get("workspace") or "").strip() or None
    if cwd and not (cwd.startswith("/") or cwd.startswith("~") or T.NAME_RE.match(cwd)):
        raise HTTPException(400, "Give the folder as a full path, like /home/you/project or ~/project.")
    if mode == "agent" and not cwd:
        raise HTTPException(400, "Pick a folder for a code session.")
    settings = {**DEFAULT_SETTINGS, **db.get("settings", {})}
    meta = {"approval": data.get("approval") or settings.get("approval", "ask"), "effort": data.get("effort")}
    title = data.get("title") or ("New task in " + cwd.rstrip("/").split("/")[-1] if mode == "agent" else "New chat")
    return db.create_session(mode, cwd, title[:120], meta)


def session_or_404(sid):
    s = db.session(sid)
    if not s:
        raise HTTPException(404, "No such session.")
    return s


@app.get("/api/sessions/{sid}")
async def get_session(sid: str, kind=Depends(need)):
    s = session_or_404(sid)
    s["meta"].pop("system", None); s["meta"].pop("context", None)
    r = engine.active_run(sid)
    return {"session": s, "messages": db.messages(sid), "run": r.summary() if r else None}


@app.patch("/api/sessions/{sid}")
async def patch_session(sid: str, request: Request, kind=Depends(need)):
    s = session_or_404(sid)
    data = await body(request)
    fields = {}
    if "title" in data:
        fields["title"] = (data["title"] or "Untitled")[:120]
    if "pinned" in data:
        fields["pinned"] = 1 if data["pinned"] else 0
    meta = s["meta"]
    for k in ("approval", "effort"):
        if k in data:
            meta[k] = data[k]
    if data.get("reset_trust"):
        meta["trusted"] = []
    fields["meta"] = meta
    db.update_session(sid, **fields)
    return {"ok": True}


@app.delete("/api/sessions/{sid}")
async def delete_session(sid: str, kind=Depends(need)):
    r = engine.active_run(sid)
    if r:
        await engine.stop(r)
    db.x("DELETE FROM messages WHERE session_id=?", (sid,))
    db.x("DELETE FROM sessions WHERE id=?", (sid,))
    return {"ok": True}


def auto_title(text):
    t = re.sub(r"\s+", " ", text).strip()
    if len(t) <= 56:
        return t or "New chat"
    cut = t[:56].rsplit(" ", 1)[0]
    return cut + "…"


@app.post("/api/sessions/{sid}/messages")
async def send(sid: str, request: Request, kind=Depends(need)):
    s = session_or_404(sid)
    data = await body(request)
    text = (data.get("content") or "").strip()
    if not text:
        raise HTTPException(400, "Write a message first.")
    if engine.active_run(sid):
        raise HTTPException(409, "This session is still working. Stop it or wait for it to finish.")
    db.add_message(sid, "user", text)
    if (s["title"] in ("New chat", "") or s["title"].startswith("New task in ")) and not db.one("SELECT 1 FROM messages WHERE session_id=? AND role='assistant'", (sid,)):
        db.update_session(sid, title=auto_title(text))
    run = engine.start(db.session(sid), "agent" if s["mode"] == "agent" else "chat")
    return run.summary()


@app.post("/api/sessions/{sid}/truncate")
async def truncate(sid: str, request: Request, kind=Depends(need)):
    """Delete a message and everything after it (used by edit and regenerate)."""
    session_or_404(sid)
    if engine.active_run(sid):
        raise HTTPException(409, "Stop the running reply first.")
    data = await body(request)
    db.x("DELETE FROM messages WHERE session_id=? AND id>=?", (sid, int(data.get("from_id", 0))))
    return {"ok": True}


@app.post("/api/sessions/{sid}/compact")
async def compact(sid: str, request: Request, kind=Depends(need)):
    s = session_or_404(sid)
    if engine.active_run(sid):
        raise HTTPException(409, "Wait for the current reply to finish, or stop it.")
    d = await body(request)
    run = engine.start(s, "compact")
    run.focus = (d.get("focus") or "")[:300]
    return run.summary()


@app.post("/api/sessions/{sid}/regenerate")
async def regenerate(sid: str, kind=Depends(need)):
    s = session_or_404(sid)
    if engine.active_run(sid):
        raise HTTPException(409, "This session is still working.")
    last_user = db.one("SELECT MAX(id) AS m FROM messages WHERE session_id=? AND role='user'", (sid,))["m"]
    if not last_user:
        raise HTTPException(400, "Nothing to regenerate.")
    db.x("DELETE FROM messages WHERE session_id=? AND id>?", (sid, last_user))
    return engine.start(s, "agent" if s["mode"] == "agent" else "chat").summary()


@app.get("/api/sessions/{sid}/export")
async def export(sid: str, kind=Depends(need)):
    s = session_or_404(sid)
    lines = [f"# {s['title']}", ""]
    for m in db.messages(sid):
        if m["role"] == "user":
            lines += ["## You", "", m["content"], ""]
        elif m["role"] == "assistant" and m["content"]:
            lines += ["## Reliquary", "", m["content"], ""]
        elif m["role"] == "tool":
            lines += [f"<details><summary>{m['meta'].get('name', 'tool')}</summary>", "", "```", m["content"], "```",
                      "</details>", ""]
    fname = re.sub(r"[^A-Za-z0-9]+", "-", s["title"]).strip("-")[:50] or "chat"
    return PlainTextResponse("\n".join(lines), headers={"Content-Disposition": f'attachment; filename="{fname}.md"'})


@app.get("/api/search")
async def search(q: str, kind=Depends(need)):
    like = f"%{q}%"
    rows = db.q("SELECT s.id, s.title, s.mode, s.updated, (SELECT substr(m.content, max(1, instr(lower(m.content), lower(?)) - 60), 180) "
                "FROM messages m WHERE m.session_id=s.id AND m.content LIKE ? AND m.role IN ('user','assistant') LIMIT 1) AS snippet "
                "FROM sessions s WHERE s.title LIKE ? OR EXISTS (SELECT 1 FROM messages m WHERE m.session_id=s.id AND m.content LIKE ?) "
                "ORDER BY s.updated DESC LIMIT 30", (q, like, like, like))
    notes = db.q("SELECT id,title,substr(body,1,160) AS body FROM notes WHERE title LIKE ? OR body LIKE ? LIMIT 10", (like, like))
    return {"sessions": rows, "notes": notes}


# ---------------------------------------------------------------- runs
def run_or_404(rid):
    r = engine.runs.get(rid)
    if not r:
        raise HTTPException(404, "That run has finished and is no longer live.")
    return r


@app.get("/api/runs/{rid}/events")
async def run_events(rid: str, request: Request, after: int = -1, kind=Depends(need)):
    run = run_or_404(rid)

    async def gen():
        i = after + 1
        while True:
            while i < len(run.events):
                yield f"data: {json.dumps(run.events[i])}\n\n"
                i += 1
            if run.finished and i >= len(run.events):
                return
            if await request.is_disconnected():
                return
            async with run.cond:
                try:
                    await asyncio.wait_for(run.cond.wait(), timeout=15)
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/runs/{rid}/stop")
async def stop_run(rid: str, kind=Depends(need)):
    await engine.stop(run_or_404(rid))
    return {"ok": True}


@app.post("/api/runs/{rid}/approve")
async def approve(rid: str, request: Request, kind=Depends(need)):
    data = await body(request)
    ok = await engine.approve(run_or_404(rid), data.get("id"), bool(data.get("allow")), bool(data.get("always")))
    if not ok:
        raise HTTPException(409, "That request is no longer waiting.")
    return {"ok": True}


# ---------------------------------------------------------------- workspaces
def workspace_list():
    out = []
    active = {}
    for r in engine.runs.values():
        if r.finished is None:
            s = db.session(r.session_id)
            if s and s["workspace"]:
                active[s["workspace"]] = r.summary()
    for p in sorted(glob.glob(os.path.join(T.WS_ROOT, "*"))):
        if os.path.isdir(p) and os.path.basename(p) != T.SCRATCH:
            name = os.path.basename(p)
            n = db.one("SELECT COUNT(*) AS n, MAX(updated) AS u FROM sessions WHERE workspace=?", (name,))
            out.append({"name": name, "sessions": n["n"], "updated": n["u"] or os.path.getmtime(p),
                        "running": active.get(name), "git": os.path.isdir(os.path.join(p, ".git"))})
    return sorted(out, key=lambda w: -(w["updated"] or 0))


@app.get("/api/workspaces")
async def workspaces(kind=Depends(need)):
    return workspace_list()


@app.post("/api/workspaces")
async def create_workspace(request: Request, kind=Depends(need)):
    data = await body(request)
    name = (data.get("name") or "").strip()
    if not T.NAME_RE.match(name):
        raise HTTPException(400, "Use letters, numbers, dots, dashes or underscores (up to 64).")
    _, p = T.ws_path(name)
    if os.path.exists(p):
        raise HTTPException(409, "A workspace with that name already exists.")
    url = (data.get("git_url") or "").strip()
    os.makedirs(p)
    if url:
        if not re.match(r"^(https://|git@)[\w.@:/~+-]+$", url):
            raise HTTPException(400, "That does not look like a git URL.")
        res = await T.run_command(name, f"git clone --depth 50 {T._sh(url)} . 2>&1", 600)
        if res.get("exit") != 0:
            raise HTTPException(400, "git clone failed: " + (res.get("output") or "")[-300:])
    else:
        await T.run_command(name, "git init -q && git config user.name Reliquary && git config user.email reliquary@localhost", 30)
    return {"ok": True, "name": name}


@app.get("/api/workspaces/{name}/tree")
async def ws_tree(name: str, path: str = ".", kind=Depends(need)):
    try:
        return {"items": T.tree(name, path, depth=4, limit=2000)}
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/api/workspaces/{name}/file")
async def ws_file(name: str, path: str, kind=Depends(need)):
    try:
        _, p = T.ws_path(name, path)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if not os.path.isfile(p):
        raise HTTPException(404, "No such file.")
    with open(p, "rb") as f:
        raw = f.read(300_000)
    if b"\0" in raw[:4000]:
        return {"path": path, "binary": True, "size": os.path.getsize(p)}
    return {"path": path, "content": raw.decode("utf-8", errors="replace"), "size": os.path.getsize(p),
            "truncated": os.path.getsize(p) > len(raw)}


@app.get("/api/workspaces/{name}/changes")
async def ws_changes(name: str, kind=Depends(need)):
    try:
        res = await T.run_command(name, "git status --short 2>/dev/null | head -100; echo '---DIFF---'; git diff --stat 2>/dev/null | tail -30", 30)
    except Exception:
        return {"status": "", "diffstat": ""}
    out = res.get("output", "")
    st, _, diff = out.partition("---DIFF---")
    return {"status": st.strip(), "diffstat": diff.strip()}


# ---------------------------------------------------------------- tasks, notes, memories
@app.get("/api/tasks")
async def tasks(done: int = 0, kind=Depends(need)):
    order = "done_at DESC" if done else "due IS NULL, due, id"
    return db.q(f"SELECT * FROM tasks WHERE done=? ORDER BY {order} LIMIT 300", (1 if done else 0,))


@app.post("/api/tasks")
async def add_task(request: Request, kind=Depends(need)):
    d = await body(request)
    if not (d.get("title") or "").strip():
        raise HTTPException(400, "Give the task a title.")
    tid = db.x("INSERT INTO tasks(title,notes,due,created) VALUES(?,?,?,?)",
               (d["title"].strip()[:300], d.get("notes", ""), d.get("due") or None, time.time()))
    return db.one("SELECT * FROM tasks WHERE id=?", (tid,))


@app.patch("/api/tasks/{tid}")
async def patch_task(tid: int, request: Request, kind=Depends(need)):
    d = await body(request)
    for k in ("title", "notes", "due"):
        if k in d:
            db.x(f"UPDATE tasks SET {k}=? WHERE id=?", (d[k] or (None if k == "due" else ""), tid))
            if k == "due":
                db.x("UPDATE tasks SET notified=0 WHERE id=?", (tid,))
    if "done" in d:
        db.x("UPDATE tasks SET done=?, done_at=? WHERE id=?", (1 if d["done"] else 0, time.time() if d["done"] else None, tid))
    return db.one("SELECT * FROM tasks WHERE id=?", (tid,))


@app.delete("/api/tasks/{tid}")
async def del_task(tid: int, kind=Depends(need)):
    db.x("DELETE FROM tasks WHERE id=?", (tid,))
    return {"ok": True}


@app.get("/api/notes")
async def notes(kind=Depends(need)):
    return db.q("SELECT * FROM notes ORDER BY pinned DESC, updated DESC LIMIT 500")


@app.post("/api/notes")
async def add_note(request: Request, kind=Depends(need)):
    d = await body(request)
    nid = db.x("INSERT INTO notes(title,body,created,updated) VALUES(?,?,?,?)",
               ((d.get("title") or "Untitled").strip()[:200], d.get("body", ""), time.time(), time.time()))
    return db.one("SELECT * FROM notes WHERE id=?", (nid,))


@app.patch("/api/notes/{nid}")
async def patch_note(nid: int, request: Request, kind=Depends(need)):
    d = await body(request)
    for k in ("title", "body", "pinned"):
        if k in d:
            db.x(f"UPDATE notes SET {k}=?, updated=? WHERE id=?", (d[k], time.time(), nid))
    return db.one("SELECT * FROM notes WHERE id=?", (nid,))


@app.delete("/api/notes/{nid}")
async def del_note(nid: int, kind=Depends(need)):
    db.x("DELETE FROM notes WHERE id=?", (nid,))
    return {"ok": True}


@app.get("/api/memories")
async def memories(kind=Depends(need)):
    return db.q("SELECT * FROM memories ORDER BY id DESC")


@app.post("/api/memories")
async def add_memory(request: Request, kind=Depends(need)):
    d = await body(request)
    if not (d.get("fact") or "").strip():
        raise HTTPException(400, "Write the fact to remember.")
    mid = db.x("INSERT INTO memories(fact,created) VALUES(?,?)", (d["fact"].strip()[:500], time.time()))
    return db.one("SELECT * FROM memories WHERE id=?", (mid,))


@app.delete("/api/memories/{mid}")
async def del_memory(mid: int, kind=Depends(need)):
    db.x("DELETE FROM memories WHERE id=?", (mid,))
    return {"ok": True}


# ---------------------------------------------------------------- settings
DEFAULT_SETTINGS = {"assistant_name": "RiRi", "name": "", "instructions": "", "effort": "low", "approval": "ask", "notify": True,
                    "server_requires_2fa": True,
                    "brief_enabled": True, "brief_time": "07:30", "brief_city": "", "brief_topics": ""}


@app.get("/api/settings")
async def get_settings(kind=Depends(need)):
    return {**DEFAULT_SETTINGS, **db.get("settings", {}), "totp": auth.totp_enabled}


@app.put("/api/settings")
async def put_settings(request: Request, kind=Depends(need)):
    d = await body(request)
    cur = {**DEFAULT_SETTINGS, **db.get("settings", {})}
    for k in DEFAULT_SETTINGS:
        if k in d:
            cur[k] = d[k]
    cur["assistant_name"] = (str(cur.get("assistant_name") or "RiRi").strip() or "RiRi")[:24]
    if cur["effort"] not in ("low", "medium", "high"):
        cur["effort"] = "low"
    if not re.match(r"^([01]\d|2[0-3]):[0-5]\d$", str(cur.get("brief_time") or "")):
        cur["brief_time"] = "07:30"
    cur["brief_city"] = str(cur.get("brief_city") or "")[:60]
    cur["brief_topics"] = str(cur.get("brief_topics") or "")[:200]
    db.put("settings", cur)
    return cur


# ---------------------------------------------------------------- the server's files
from fastapi.responses import Response as RawResponse


@app.get("/api/host")
async def host_status(kind=Depends(need)):
    if not T.host.ready:
        await T.host.setup()
    # the public half of RiRi's key, so the page can show the one command that authorises it
    return {"ready": T.host.ready, "home": T.host.home, "locked": bool(server_gate()),
            "user": os.environ.get("RELIQUARY_HOST_USER", ""), "pubkey": T.host.pubkey()}


async def fs(op, **kw):
    require_server()
    r = await T.host.fs(op, **kw)
    if r.get("error"):
        raise HTTPException(400, r["error"])
    return r


@app.get("/api/fs/list")
async def fs_list(path: str = "~", kind=Depends(need)):
    return await fs("list", path=path)


@app.get("/api/fs/read")
async def fs_read(path: str, kind=Depends(need)):
    return await fs("read", path=path, limit=2_000_000)


@app.post("/api/fs/write")
async def fs_write(request: Request, kind=Depends(need)):
    d = await body(request)
    return await fs("write", stdin=d.get("content", ""), path=d["path"])


@app.post("/api/fs/mkdir")
async def fs_mkdir(request: Request, kind=Depends(need)):
    d = await body(request)
    return await fs("mkdir", path=d["path"])


@app.post("/api/fs/rename")
async def fs_rename(request: Request, kind=Depends(need)):
    d = await body(request)
    return await fs("rename", path=d["path"], to=d["to"])


@app.post("/api/fs/delete")
async def fs_delete(request: Request, kind=Depends(need)):
    """Moves to ~/.local/share/riri/trash rather than deleting, so mistakes can be undone."""
    d = await body(request)
    return await fs("trash", path=d["path"])


@app.get("/api/fs/download")
async def fs_download(path: str, kind=Depends(need)):
    require_server()
    data, err = await T.host.read_bytes(path)
    if err:
        raise HTTPException(400, err)
    name = path.rstrip("/").split("/")[-1].replace('"', "") or "file"
    return RawResponse(data, media_type="application/octet-stream", headers={"Content-Disposition": f'attachment; filename="{name}"'})


@app.post("/api/fs/upload")
async def fs_upload(request: Request, path: str, kind=Depends(need)):
    require_server()
    data = await request.body()
    r = await T.host.write_bytes(path, data)
    if r.get("error"):
        raise HTTPException(400, r["error"])
    return r


# ---------------------------------------------------------------- notifications
@app.get("/api/push/key")
async def push_key(kind=Depends(need)):
    return {"key": push.public_key, "devices": push.count()}


@app.post("/api/push/subscribe")
async def push_subscribe(request: Request, kind=Depends(need)):
    d = await body(request)
    try:
        push.subscribe(d.get("subscription"), request.headers.get("user-agent", ""))
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"ok": True, "devices": push.count()}


@app.post("/api/push/unsubscribe")
async def push_unsubscribe(request: Request, kind=Depends(need)):
    d = await body(request)
    push.unsubscribe(d.get("endpoint", ""))
    return {"ok": True, "devices": push.count()}


@app.post("/api/push/test")
async def push_test(kind=Depends(need)):
    name = db.get("settings", {}).get("assistant_name") or "RiRi"
    sent = await push.send(f"{name} here", "Notifications work. I'll ping you for reminders, your morning brief, and long replies.",
                           url="/", tag="test")
    return {"sent": sent, "devices": push.count()}


@app.post("/api/brief/now")
async def brief_now(kind=Depends(need)):
    s = {**DEFAULT_SETTINGS, **db.get("settings", {})}
    await scheduler.start_brief(s, s.get("assistant_name") or "RiRi")
    return {"ok": True}


# ---------------------------------------------------------------- static web app
@app.get("/healthz")
async def healthz():
    return {"ok": True, "uptime": time.time() - STARTED}


@app.get("/")
async def index():
    # Version the app's own files by start time, so after every update browsers fetch the new ones.
    html = open(os.path.join(WEB, "index.html"), encoding="utf-8").read()
    v = str(int(STARTED))
    for f in ("/app.css", "/app.js", "/reli.js"):
        html = html.replace(f'"{f}"', f'"{f}?v={v}"')
    return Response(html, media_type="text/html", headers={"Cache-Control": "no-cache"})


app.mount("/", StaticFiles(directory=WEB), name="web")
