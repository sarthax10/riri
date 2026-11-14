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
from .artifacts import Artifacts
from .learning import Learner
from .monitor import Monitor
from .sync import Hub
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
artifacts = T.artifacts = scheduler.artifacts = Artifacts(db, T.host)
hub = engine.hub = Hub()
monitor = Monitor(T.host)
learner = T.learner = engine.learner = scheduler.learner = Learner(db, engine, llm)
learner.on_change = lambda: hub.publish("lessons")
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


# Every successful change through the API becomes a sync event, so other tabs and devices update without a refresh.
SYNC_TOPICS = {"tasks": "tasks", "notes": "notes", "memories": "memories", "artifacts": "artifacts", "settings": "settings",
               "lessons": "lessons"}


def publish_change(method, path):
    parts = path.strip("/").split("/")   # api, <topic>, [id], [action]
    if len(parts) < 2 or parts[0] != "api":
        return
    topic = parts[1]
    if topic == "sessions":
        if len(parts) == 2:
            hub.publish("sessions")
        elif method == "DELETE" and len(parts) == 3:
            hub.publish("sessions", deleted=parts[2])
        else:
            hub.publish("session", sid=parts[2])
    elif topic == "messages":
        hub.publish("sessions")
    elif topic in SYNC_TOPICS:
        hub.publish(SYNC_TOPICS[topic])


class SyncEvents:
    """Plain ASGI middleware (streams pass straight through): after a successful change, publish a sync event."""
    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] not in ("POST", "PUT", "PATCH", "DELETE"):
            return await self.inner(scope, receive, send)
        status = {}

        async def watch(msg):
            if msg["type"] == "http.response.start":
                status["code"] = msg["status"]
            await send(msg)
        await self.inner(scope, receive, watch)
        if status.get("code", 500) < 400:
            publish_change(scope["method"], scope["path"])


app.add_middleware(SyncEvents)
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
    if not err:
        try:
            back = await artifacts.setup()
            print(f"artifacts bind {artifacts.bind}" + (f"; restarted {', '.join(back)}" if back else ""), flush=True)
        except Exception as e:
            print("artifacts: setup failed:", repr(e), flush=True)
    resumed = engine.resume_interrupted()
    if resumed:
        print(f"resumed {len(resumed)} interrupted repl{'y' if len(resumed) == 1 else 'ies'}: {', '.join(resumed)}", flush=True)
    app.state.scheduler_task = asyncio.create_task(scheduler.loop())
    app.state.monitor_task = asyncio.create_task(monitor.loop())


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


@app.get("/api/events")
async def events(request: Request, after: str = "", kind=Depends(need)):
    """The live sync channel (Server-Sent Events). Last-Event-ID or ?after= resumes from a cursor."""
    cursor = request.headers.get("last-event-id") or after
    return StreamingResponse(hub.stream(request, cursor), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


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
    return {"model": props, "online": await llm.health(), "engine": engine.status(), "server": server_health(),
            "artifacts_live": db.one("SELECT COUNT(*) AS n FROM artifacts WHERE state='live'")["n"]}


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
    learner.check_correction(sid, text)
    learner.last_activity = time.time()
    skills = [w for w in ("artifacts", "coding", "research", "server", "design", "explainers") if w in text.lower()]
    lessons = learner.note_for(text, skills)
    db.add_message(sid, "user", text, meta={"lessons": lessons} if lessons else None)
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
    learner.signal(sid, "regenerated", "The owner asked for this reply again (the first one wasn't good enough).")
    if engine.active_run(sid):
        raise HTTPException(409, "This session is still working.")
    last_user = db.one("SELECT MAX(id) AS m FROM messages WHERE session_id=? AND role='user' AND meta NOT LIKE '%\"hidden\": true%'", (sid,))["m"]
    if not last_user:
        raise HTTPException(400, "Nothing to regenerate.")
    db.x("DELETE FROM messages WHERE session_id=? AND id>?", (sid, last_user))
    return engine.start(s, "agent" if s["mode"] == "agent" else "chat").summary()


@app.get("/api/sessions/{sid}/export")
async def export(sid: str, kind=Depends(need)):
    s = session_or_404(sid)
    lines = [f"# {s['title']}", ""]
    for m in db.messages(sid):
        if m["meta"].get("hidden"):
            continue
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
                    "brief_enabled": True, "brief_time": "07:30", "brief_city": "", "brief_topics": "", "learning": True}


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


@app.get("/api/fs/search")
async def fs_search(path: str = "~", q: str = "", mode: str = "name", hidden: int = 0, kind=Depends(need)):
    """Files whose name matches (fuzzy, ranked) or lines that contain the text, under a folder."""
    require_server()
    q = q.strip()
    if len(q) < 2:
        return {"items": [], "mode": mode}
    if mode != "content":
        r = await T.host.fs("find", path=path, q=q, hidden=bool(hidden), timeout=30)
        if r.get("error"):
            raise HTTPException(400, r["error"])
        return {**r, "mode": "name"}
    excl = " ".join(f"--exclude-dir={d}" for d in ("node_modules", ".git", "__pycache__", ".venv", "venv", ".cache", "dist", "build", ".next"))
    # '.[!.]*', not '.*': the latter also matches ".", the folder being searched, and grep would skip everything
    hid = "" if hidden else "--exclude='.*' --exclude-dir='.[!.]*'"
    cmd = (f"timeout 15 grep -rnIiF {excl} {hid} --exclude='*.min.js' --exclude='*.map' -m 5 -e {T._sh(q)} . 2>/dev/null "
           f"| cut -c1-400 | head -300")
    res = await T.host.exec(cmd, path, timeout=30)
    files = {}
    for line in (res.get("output") or "").splitlines():
        parts = line.split(":", 2)
        if len(parts) < 3 or not parts[1].isdigit():
            continue
        rel = parts[0][2:] if parts[0].startswith("./") else parts[0]
        files.setdefault(rel, []).append({"line": int(parts[1]), "text": parts[2].strip()[:240]})
    base = (await T.host.fs("stat", path=path)).get("path", path)
    items = [{"path": base.rstrip("/") + "/" + rel, "rel": rel, "matches": m} for rel, m in files.items()]
    return {"base": base, "items": items[:120], "mode": "content", "truncated": len(items) > 120 or res.get("timed_out")}


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


RAW_INLINE = ("image/", "video/", "audio/", "application/pdf", "text/plain")


@app.api_route("/api/fs/raw", methods=["GET", "HEAD"])
async def fs_raw(path: str, request: Request, dl: int = 0, kind=Depends(need)):
    """A file's bytes, streamed, with Range support so videos and songs can seek. Anything that could run script
    on this site (HTML, SVG, JS...) is only ever sent as a sandboxed download."""
    import mimetypes
    st = await fs("stat", path=path)
    if st.get("dir"):
        raise HTTPException(400, "That is a folder.")
    size = int(st["size"])
    name = path.rstrip("/").split("/")[-1].replace('"', "") or "file"
    ctype = mimetypes.guess_type(name)[0] or "application/octet-stream"
    if ctype.startswith("text/") or ctype in ("application/json", "application/xml"):
        ctype = "text/plain; charset=utf-8"
    inline = not dl and ctype.startswith(RAW_INLINE) and ctype != "image/svg+xml"
    from urllib.parse import quote
    headers = {"Accept-Ranges": "bytes", "Cache-Control": "private, max-age=300",
               "Content-Disposition": f"{'inline' if inline else 'attachment'}; filename*=UTF-8''{quote(name)}",
               "Last-Modified": time.strftime("%a, %d %b %Y %H:%M:%S GMT", time.gmtime(st.get("mtime") or 0))}
    if ctype != "application/pdf":
        headers["Content-Security-Policy"] = "sandbox; default-src 'none'; img-src 'self'; media-src 'self'"
    if not inline:
        ctype = "application/octet-stream"
    start, end, status = 0, size - 1, 200
    m = re.match(r"bytes=(\d*)-(\d*)$", request.headers.get("range", "").strip())
    if m and size:
        if m.group(1):
            start = int(m.group(1))
            end = min(int(m.group(2)), size - 1) if m.group(2) else size - 1
        elif m.group(2):  # the last N bytes
            start = max(0, size - int(m.group(2)))
        if start >= size or start > end:
            return Response(status_code=416, headers={"Content-Range": f"bytes */{size}"})
        status = 206
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    length = max(0, end - start + 1) if size else 0
    headers["Content-Length"] = str(length)
    if request.method == "HEAD" or not length:
        return Response(status_code=status, headers=headers, media_type=ctype)
    return StreamingResponse(T.host.stream(path, start, length), status_code=status, headers=headers, media_type=ctype)


@app.get("/api/img")
async def img_proxy(u: str, kind=Depends(need)):
    """Pictures from the web (search results, page previews, images in replies), fetched by the server so the
    browser only ever talks to this site."""
    import httpx
    from urllib.parse import urlparse
    url = urlparse(u)
    if url.scheme not in ("http", "https") or not url.hostname:
        raise HTTPException(400, "Not a web address.")
    try:
        T._public_host(url.hostname)
        async with httpx.AsyncClient(timeout=15, follow_redirects=True,
                                     headers={"User-Agent": T.UA, "Accept": "image/avif,image/webp,image/*;q=0.9,*/*;q=0.5"}) as c:
            async with c.stream("GET", u) as r:
                T._public_host(r.url.host)
                ctype = r.headers.get("content-type", "").split(";")[0].strip().lower()
                if r.status_code >= 400 or not ctype.startswith("image/"):
                    raise HTTPException(404, "Not an image.")
                data = b""
                async for chunk in r.aiter_bytes():
                    data += chunk
                    if len(data) > 8_000_000:
                        raise HTTPException(413, "Image too large.")
    except (httpx.HTTPError, ValueError):
        raise HTTPException(404, "Couldn't fetch that image.")
    return Response(data, media_type=ctype, headers={"Cache-Control": "private, max-age=86400",
                                                     "Content-Security-Policy": "sandbox; default-src 'none'"})


@app.post("/api/fs/upload")
async def fs_upload(request: Request, path: str, kind=Depends(need)):
    require_server()
    data = await request.body()
    r = await T.host.write_bytes(path, data)
    if r.get("error"):
        raise HTTPException(400, r["error"])
    return r


# ---------------------------------------------------------------- the Server page
@app.get("/api/system")
async def system(since: float = 0, kind=Depends(need)):
    v = monitor.view(since)
    props = await llm.props()
    v["model"] = {"name": props.get("model"), "ctx": props.get("n_ctx"), "online": await llm.health(),
                  "speed": engine.status()["speed"], "busy": engine.status()["busy"],
                  "active": len([r for r in engine.runs.values() if r.finished is None])}
    v["app"] = {"uptime": time.time() - STARTED, "sessions": db.one("SELECT COUNT(*) AS n FROM sessions")["n"],
                "artifacts_live": db.one("SELECT COUNT(*) AS n FROM artifacts WHERE state='live'")["n"]}
    return v


@app.post("/api/system/storage")
async def system_storage(kind=Depends(need)):
    asyncio.create_task(monitor.read_storage())
    return {"ok": True}


# ---------------------------------------------------------------- artifacts
@app.get("/api/artifacts")
async def list_artifacts(kind=Depends(need)):
    rows = artifacts.list()
    for a in rows:
        s = db.session(a["session_id"]) if a.get("session_id") else None
        a["session_title"] = s["title"] if s else None
    from .artifacts import FIREWALL_FIX
    blocked = await artifacts.firewall_blocked() if any(a["state"] == "live" for a in rows) else False
    return {"artifacts": rows, "domain": os.environ.get("RELIQUARY_DOMAIN", ""), "bind": artifacts.bind,
            "firewall_blocked": blocked, "firewall_fix": FIREWALL_FIX}


def artifact_or_404(aid):
    a = artifacts.get(aid)
    if not a:
        raise HTTPException(404, "No such artifact.")
    return a


@app.post("/api/artifacts/{aid}/start")
async def start_artifact(aid: str, kind=Depends(need)):
    require_server()
    artifact_or_404(aid)
    rec, msg, ok = await artifacts.start(aid=aid)
    return {"ok": ok, "message": msg, "artifact": rec}


@app.post("/api/artifacts/{aid}/stop")
async def stop_artifact(aid: str, kind=Depends(need)):
    require_server()
    artifact_or_404(aid)
    await artifacts.stop(aid)
    return {"ok": True, "artifact": artifacts.public(artifacts.get(aid))}


@app.patch("/api/artifacts/{aid}")
async def patch_artifact(aid: str, request: Request, kind=Depends(need)):
    artifact_or_404(aid)
    d = await body(request)
    for k, n in (("name", 80), ("description", 300)):
        if k in d:
            db.x(f"UPDATE artifacts SET {k}=? WHERE id=?", (str(d[k] or "")[:n], aid))
    return artifacts.public(artifacts.get(aid))


@app.delete("/api/artifacts/{aid}")
async def delete_artifact(aid: str, kind=Depends(need)):
    require_server()
    artifact_or_404(aid)
    await artifacts.delete(aid)
    return {"ok": True}


@app.get("/api/artifacts/{aid}/logs")
async def artifact_logs(aid: str, lines: int = 200, kind=Depends(need)):
    require_server()
    artifact_or_404(aid)
    return {"log": await artifacts.logs(aid, lines)}


@app.get("/api/artifacts/gate")
async def artifact_gate(request: Request):
    """Caddy's forward_auth for *.DOMAIN: 200 plus where to send the request, or the page to show instead.
    Public on purpose: the random address is the key, like a share link."""
    upstream, page = artifacts.gate(request.headers.get("x-forwarded-host") or request.headers.get("host"))
    if page:
        status, html = page
        return Response(html, status_code=status, media_type="text/html", headers={"Cache-Control": "no-store"})
    return Response(status_code=200, headers={"X-Art-Upstream": upstream})


# ---------------------------------------------------------------- learning
@app.post("/api/messages/{mid}/feedback")
async def feedback(mid: int, request: Request, kind=Depends(need)):
    d = await body(request)
    m = db.one("SELECT * FROM messages WHERE id=?", (mid,))
    if not m or m["role"] != "assistant":
        raise HTTPException(404, "No such reply.")
    meta = json.loads(m["meta"] or "{}")
    value = 1 if d.get("value", 0) > 0 else -1 if d.get("value", 0) < 0 else 0
    note = str(d.get("note") or "")[:500]
    meta["feedback"] = {"value": value, "note": note}
    db.x("UPDATE messages SET meta=? WHERE id=?", (json.dumps(meta), mid))
    if value < 0:
        learner.signal(m["session_id"], "thumbs_down", note or "The owner disliked this reply.")
    elif value > 0:
        learner.signal(m["session_id"], "thumbs_up", note or "The owner liked this reply: note what worked.")
    return {"ok": True}


@app.get("/api/lessons")
async def list_lessons(kind=Depends(need)):
    return {"lessons": learner.lessons(), "pending": len(learner.pending()), "busy": learner.busy, "enabled": learner.enabled()}


@app.post("/api/lessons")
async def add_lesson(request: Request, kind=Depends(need)):
    d = await body(request)
    lid = learner.add(d.get("text", ""), d.get("skill", "general"), "owner")
    if not lid:
        raise HTTPException(400, "Write the lesson as a sentence.")
    return {"ok": True, "id": lid}


@app.patch("/api/lessons/{lid}")
async def edit_lesson(lid: int, request: Request, kind=Depends(need)):
    d = await body(request)
    if d.get("text"):
        db.x("UPDATE lessons SET text=?, updated=? WHERE id=?", (str(d["text"])[:300], time.time(), lid))
    return {"ok": True}


@app.delete("/api/lessons/{lid}")
async def del_lesson(lid: int, kind=Depends(need)):
    db.x("DELETE FROM lessons WHERE id=?", (lid,))
    return {"ok": True}


@app.post("/api/lessons/reflect")
async def reflect_now(kind=Depends(need)):
    """Review the flagged conversations now instead of waiting for an idle moment."""
    if not learner.pending():
        return {"added": [], "message": "Nothing to reflect on yet: no flagged conversations."}
    added = await learner.reflect(force=True)
    return {"added": added, "message": f"Learned {len(added)} new lesson{'s' if len(added) != 1 else ''}." if added else "Reviewed it; nothing new to learn."}


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
    for f in ("/app.css", "/app.js", "/reli.js", "/media.js", "/server.js", "/icons.js"):
        html = html.replace(f'"{f}"', f'"{f}?v={v}"')
    return Response(html, media_type="text/html", headers={"Cache-Control": "no-cache"})


app.mount("/", StaticFiles(directory=WEB), name="web")
