"""Tools RiRi can call.

Server tools act on the real server (as the owner's user, over SSH; see host.py), starting in the conversation's
working folder. run_python uses the separate, locked-down workbench sandbox for quick calculations. Assistant tools
manage tasks, notes and memories in the database. Every result is capped so one tool can't flood the context.
"""
import asyncio
import json
import os
import re
import time
from urllib.parse import urljoin, urlparse

import httpx

from .host import Host

WS_ROOT = os.environ.get("RELIQUARY_WORKSPACES", "/workspaces")
WORKBENCH = os.environ.get("RELIQUARY_WORKBENCH", "http://workbench:7070")
WORKBENCH_TOKEN = os.environ.get("RELIQUARY_WORKBENCH_TOKEN", "")
SEARXNG = os.environ.get("RELIQUARY_SEARXNG", "http://searxng:8080")
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
MAX_OUT = 6000
NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
SCRATCH = "riri-scratch"  # where run_python works (in the sandbox); hidden from the workspace list

host = Host()
artifacts = None  # set by main: the Artifacts manager (artifacts.py)
learner = None    # set by main: lessons from experience (learning.py)
# Set by main: returns None when server tools may be used, or a message explaining why they are locked.
server_gate = lambda: None


def fn(name, desc, props, required=()):
    return {"type": "function", "function": {"name": name, "description": desc,
            "parameters": {"type": "object", "properties": props, "required": list(required)}}}


S = {"type": "string"}
I = {"type": "integer"}

SERVER_TOOLS = [
    fn("run", "Run a bash command on the server (as the owner's user) in the working folder. Use it to inspect the "
       "system, manage services and Docker, install things, git, build and test code.",
       {"command": S, "timeout": {**I, "description": "seconds, default 120, max 1800"}}, ["command"]),
    fn("read_file", "Read a text file on the server. Paths may be absolute, ~/..., or relative to the working folder. "
       "Returns numbered lines; use start/end for big files.", {"path": S, "start": I, "end": I}, ["path"]),
    fn("write_file", "Create or overwrite a file on the server with the given content.", {"path": S, "content": S}, ["path", "content"]),
    fn("edit_file", "Replace an exact, unique snippet of a file on the server. Read the file first.",
       {"path": S, "old": S, "new": S}, ["path", "old", "new"]),
    fn("list_files", "List files and folders under a path (default: the working folder).",
       {"path": S, "depth": {**I, "description": "1-3, default 2"}}),
    fn("glob", "Find files by name pattern under the working folder, e.g. '**/*.py' or '**/docker-compose.yml'.",
       {"pattern": S, "path": S}, ["pattern"]),
    fn("search", "Search file contents for a regular expression (grep). Returns matching lines with line numbers.",
       {"pattern": S, "path": S}, ["pattern"]),
]

ASSISTANT_TOOLS = [
    fn("add_task", "Add a to-do for the owner. due is optional. Pass the owner's own words for when, e.g. 'next friday 6pm', "
       "'tomorrow 9am', 'in 2 hours', 'friday', '20 nov 18:00' — the app works out the exact date, so do NOT compute "
       "dates yourself. With a time, it becomes a reminder that pings the owner's phone at that moment.",
       {"title": S, "due": S, "notes": S}, ["title"]),
    fn("list_tasks", "List the owner's open tasks.", {}),
    fn("complete_task", "Mark a task done by its id.", {"id": I}, ["id"]),
    fn("save_note", "Save a note for the owner.", {"title": S, "body": S}, ["title", "body"]),
    fn("update_note", "Replace the title and/or body of a note by its id.", {"id": I, "title": S, "body": S}, ["id"]),
    fn("search_notes", "Find the owner's notes containing some words.", {"query": S}, ["query"]),
    fn("remember", "Remember a lasting fact or preference about the owner for future conversations.", {"fact": S}, ["fact"]),
    fn("forget", "Delete remembered facts that contain the given words.", {"words": S}, ["words"]),
    fn("learn", "Save a lesson for your future self: a specific, reusable way to work better that you just discovered "
       "(how this server is set up, a mistake to avoid, what finally worked). Not facts about the owner: use remember.",
       {"lesson": S, "skill": {"type": "string", "description": "artifacts, coding, research, server, writing, planning, data, design, debugging or general"}}, ["lesson"]),
    fn("run_python", "Run a short Python 3 script in a throwaway sandbox (not on the server) and get its printed "
       "output. Use it for exact maths, dates, unit conversions and data. print() what you need.", {"code": S}, ["code"]),
]

WEB_TOOLS = [
    fn("web_search", "Search the internet. Use it for news, current facts, prices, docs, or anything you are not sure "
       "about. Returns titles, links and snippets. Set images to true when pictures would help the owner (people, "
       "places, products, animals, food, design, events): they appear above your answer.",
       {"query": S, "images": {"type": "boolean"}}, ["query"]),
    fn("read_webpage", "Open a web page by URL and read its text. Use it after web_search to read a promising result.",
       {"url": S}, ["url"]),
]

ARTIFACT_TOOLS = [
    fn("artifact_start", "Serve a web page or app from a folder on the server at its own private address "
       "(https://<random-id>.<domain>/), shown to the owner as a live preview. With no command, the folder's "
       "index.html is served as a static site. With a command, it must listen on $HOST and $PORT. Pass id to restart "
       "an existing artifact on the same address after changing it. Load the artifacts skill first.",
       {"name": S, "folder": S, "command": S, "description": S, "id": S}, ["folder"]),
    fn("artifact_stop", "Stop serving an artifact (its files stay).", {"id": S}, ["id"]),
    fn("artifact_list", "List the artifacts: which are live, their addresses, ports and folders.", {}),
    fn("artifact_logs", "Read the end of an artifact's output log, to debug it.", {"id": S, "lines": I}, ["id"]),
]

PLAN_TOOL = fn("todo", "Write or update your plan for a multi-step task as a checklist the owner can watch. Send the "
               "whole list each time; mark one item in_progress while you work on it and done when finished.",
               {"items": {"type": "array", "items": {"type": "object", "properties": {
                   "text": S, "status": {"type": "string", "enum": ["pending", "in_progress", "done"]}},
                   "required": ["text", "status"]}}}, ["items"])
SKILL_TOOL = fn("load_skill", "Load one of your skills: step-by-step know-how for a kind of task. Load it before "
                "starting that kind of task.", {"name": S}, ["name"])

# One tool list for every conversation, so the cached prompt opening is shared by all of them.
ALL_TOOLS = SERVER_TOOLS + ASSISTANT_TOOLS + WEB_TOOLS + ARTIFACT_TOOLS + [PLAN_TOOL, SKILL_TOOL]
ASSISTANT_TOOLS_FULL = CODE_TOOLS = ALL_TOOLS  # older names, kept for callers

NEEDS_APPROVAL = {"run", "write_file", "edit_file", "artifact_start"}
SERVER_TOOL_NAMES = {t["function"]["name"] for t in SERVER_TOOLS + ARTIFACT_TOOLS}


# ---------------------------------------------------------------- skills
SKILL_DIRS = [os.path.join(os.path.dirname(__file__), "skills"), os.path.join(os.environ.get("RELIQUARY_DATA", "/data"), "skills")]


def skills():
    """{name: (description, body)} from the built-in skills and the owner's own (/data/skills overrides)."""
    out = {}
    for d in SKILL_DIRS:
        if not os.path.isdir(d):
            continue
        for f in sorted(os.listdir(d)):
            if not f.endswith(".md"):
                continue
            text = open(os.path.join(d, f), encoding="utf-8").read()
            m = re.match(r"---\s*\nname:\s*(.+?)\s*\ndescription:\s*(.+?)\s*\n---\s*\n(.*)", text, re.S)
            if m:
                out[m.group(1)] = (m.group(2), m.group(3).strip())
    return out


def skills_index(mode=None):
    return "\n".join(f"- {n}: {d}" for n, (d, _) in skills().items())


# ---------------------------------------------------------------- helpers
def clip(text, limit=MAX_OUT):
    if len(text) <= limit:
        return text
    head, tail = text[: int(limit * 0.7)], text[-int(limit * 0.25):]
    return f"{head}\n… [{len(text) - len(head) - len(tail)} characters cut] …\n{tail}"


def _sh(s):
    return "'" + str(s).replace("'", "'\"'\"'") + "'"


def resolve(cwd, path):
    """A path as given by the model, made absolute against the working folder (~ is kept for the host to expand)."""
    path = (path or ".").strip()
    if path.startswith("/") or path.startswith("~"):
        return path
    base = (cwd or "~").rstrip("/")
    return f"{base}/{path}" if path not in (".", "") else base


def session_cwd(session):
    """The working folder of a conversation on the server. Old sandbox workspaces map to their folder on the host."""
    ws = (session or {}).get("workspace") or ""
    if not ws:
        return "~"
    if "/" in ws or ws.startswith("~"):
        return ws
    return f"~/reliquary/workspaces/{ws}"


def ws_path(workspace, rel="."):
    """Paths inside the sandbox's own workspaces (only run_python and old sessions use these)."""
    if not workspace or not NAME_RE.match(workspace):
        raise ValueError("invalid workspace")
    root = os.path.realpath(os.path.join(WS_ROOT, workspace))
    p = os.path.realpath(os.path.join(root, rel or "."))
    if p != root and not p.startswith(root + os.sep):
        raise ValueError("path is outside the workspace")
    return root, p


def tree(workspace, rel=".", depth=2, limit=400):
    root, base = ws_path(workspace, rel)
    out = []
    skip = {".git", "node_modules", "__pycache__", ".venv", "venv", "dist", "build", ".next", ".cache"}
    for dirpath, dirs, files in os.walk(base):
        d = dirpath[len(base):].count(os.sep)
        dirs[:] = sorted(x for x in dirs if x not in skip and not x.startswith("."))
        if d >= depth:
            dirs[:] = []
        out += [os.path.relpath(os.path.join(dirpath, n), root) + "/" for n in sorted(dirs)]
        out += [os.path.relpath(os.path.join(dirpath, n), root) for n in sorted(files)]
        if len(out) > limit:
            return out[:limit] + ["… (more files not shown)"]
    return out


async def run_command(workspace, command, timeout=120):
    """Runs a command in the workbench sandbox (used by run_python and workspace creation)."""
    timeout = max(5, min(int(timeout or 120), 900))
    async with httpx.AsyncClient(timeout=timeout + 30) as c:
        r = await c.post(WORKBENCH + "/exec", headers={"X-Token": WORKBENCH_TOKEN},
                         json={"workspace": workspace, "command": command, "timeout": timeout})
        r.raise_for_status()
        return r.json()


# ---------------------------------------------------------------- web
def _host(url):
    h = (urlparse(url).hostname or "").lower()
    return h[4:] if h.startswith("www.") else h


def _web_url(u, base=None):
    u = (u or "").strip()
    if u.startswith("//"):
        u = "https:" + u
    if base and u and not u.startswith(("http://", "https://")):
        u = urljoin(base, u)
    return u if u.startswith(("http://", "https://")) and len(u) < 2000 else ""


async def web_search(query, images=False):
    """Returns (text for the model, what the owner sees: sources and pictures)."""
    async with httpx.AsyncClient(timeout=25) as c:
        async def get(**extra):
            r = await c.get(SEARXNG + "/search", params={"q": query, "format": "json", "safesearch": 0, **extra})
            r.raise_for_status()
            return r.json().get("results", [])
        jobs = [get()] + ([get(categories="images")] if images else [])
        got = await asyncio.gather(*jobs, return_exceptions=True)
    if isinstance(got[0], Exception):
        raise got[0]
    results = got[0][:6]
    pics, seen = [], set()
    for x in (got[1] if len(got) > 1 and not isinstance(got[1], Exception) else []):
        src = _web_url(x.get("img_src"))
        if not src or src in seen:
            continue
        seen.add(src)
        page = _web_url(x.get("url"))
        pics.append({"src": src, "thumb": _web_url(x.get("thumbnail_src") or x.get("thumbnail")) or src,
                     "title": (x.get("title") or "").strip()[:140], "page": page, "host": _host(page or src)})
        if len(pics) >= 10:
            break
    display = {"kind": "search", "query": query, "images": pics,
               "sources": [{"title": (x.get("title") or "").strip()[:160], "url": x.get("url", ""), "host": _host(x.get("url", ""))}
                           for x in results if x.get("url")]}
    if not results:
        return "No results.", display
    text = "\n\n".join(f"{i}. {x.get('title', '').strip()}\n{x.get('url', '')}\n{(x.get('content') or '').strip()[:300]}"
                       for i, x in enumerate(results, 1))
    if pics:
        text += (f"\n\n({len(pics)} pictures are already shown to the owner above your answer. Don't list, link or "
                 "embed them, and don't add a Pictures section; just answer.)")
    return text, display


def _public_host(hostname):
    """The page reader may not be pointed at this machine or the home network."""
    import ipaddress
    import socket
    try:
        infos = socket.getaddrinfo(hostname, None)
    except OSError:
        raise ValueError("that address does not resolve")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            raise ValueError("private and local addresses are off limits for the page reader (use run with curl instead)")


def html_to_text(html):
    import html as H
    html = re.sub(r"(?is)<(script|style|noscript|svg|nav|footer|header|form|iframe)[^>]*>.*?</\1>", " ", html)
    title = re.search(r"(?is)<title[^>]*>(.*?)</title>", html)
    html = re.sub(r"(?i)<br\s*/?>|</(p|div|li|h[1-6]|tr|section|article)>", "\n", html)
    text = H.unescape(re.sub(r"<[^>]+>", " ", html))
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n\n", text).strip()
    return (H.unescape(title.group(1)).strip() + "\n\n" if title else "") + text


async def read_webpage(url):
    from urllib.parse import urlparse
    u = urlparse(url)
    if u.scheme not in ("http", "https") or not u.hostname:
        return "Error: give a full http(s) URL.", False
    _public_host(u.hostname)
    async with httpx.AsyncClient(timeout=25, follow_redirects=True, headers={"User-Agent": UA}) as c:
        async with c.stream("GET", url) as r:
            _public_host(r.url.host)
            ctype = r.headers.get("content-type", "")
            if "html" not in ctype and "text" not in ctype and "json" not in ctype:
                return f"That URL is not a web page ({ctype or 'unknown type'}).", False
            body = b""
            async for chunk in r.aiter_bytes():
                body += chunk
                if len(body) > 1_500_000:
                    break
    text = body.decode(r.encoding or "utf-8", errors="replace")
    page = {"kind": "page", "url": str(r.url), "host": _host(str(r.url)), "title": "", "image": "", "description": ""}
    if "html" in ctype:
        page.update(page_meta(text, str(r.url)))
        text = html_to_text(text)
    return clip(f"{r.url}\n\n{text}", 9000), True, page


def page_meta(raw, base):
    """Title, description and preview image of a page, from its <head>."""
    import html as H
    head = raw[:200_000]

    def meta(*names):
        for n in names:
            m = re.search(r"<meta[^>]+(?:property|name)=[\"']" + re.escape(n) + r"[\"'][^>]*>", head, re.I)
            if m:
                c = re.search(r"content=[\"']([^\"']*)[\"']", m.group(0), re.I)
                if c and c.group(1).strip():
                    return H.unescape(c.group(1).strip())
        return ""
    t = re.search(r"(?is)<title[^>]*>(.*?)</title>", head)
    return {"title": (meta("og:title", "twitter:title") or (H.unescape(t.group(1)).strip() if t else ""))[:200],
            "description": meta("og:description", "description", "twitter:description")[:300],
            "image": _web_url(meta("og:image", "og:image:url", "twitter:image", "twitter:image:src"), base)}


# ---------------------------------------------------------------- the dispatcher
async def execute(db, cwd, name, args, session_id=None):
    """Runs one tool. Returns (output_text, ok) or (output_text, ok, display): display is extra data for the owner's
    screen only (pictures, sources, an artifact card), never sent to the model. cwd is the conversation's working
    folder on the server."""
    try:
        if name in SERVER_TOOL_NAMES:
            locked = server_gate()
            if locked:
                return locked, False
        if name == "run":
            timeout = max(5, min(int(args.get("timeout") or 120), 1800))
            res = await host.exec(args["command"], cwd, timeout)
            status = "timed out" if res["timed_out"] else f"exit code {res['exit']}"
            return clip(f"{res['output'] or '(no output)'}\n[{status}]"), res["exit"] == 0
        if name == "read_file":
            r = await host.fs("read", path=resolve(cwd, args["path"]), limit=2_000_000)
            if r.get("error"):
                return "Error: " + r["error"], False
            if r.get("binary"):
                return f"{r['path']} is a binary file ({r['size']} bytes).", True
            lines = r["text"].splitlines()
            start = max(1, int(args.get("start") or 1))
            end = min(len(lines), int(args.get("end") or start + 399))
            body = "\n".join(f"{i:>5}  {lines[i - 1]}" for i in range(start, end + 1))
            more = f"\n({len(lines)} lines total; showing {start}-{end})" if end < len(lines) or start > 1 else ""
            return clip((body or "(empty file)") + more, 16000), True
        if name == "write_file":
            r = await host.fs("write", stdin=args.get("content", ""), path=resolve(cwd, args["path"]))
            if not r.get("ok"):
                return "Error: " + r.get("error", "write failed"), False
            return (f"{'Created' if r.get('created') else 'Wrote'} {r['path']} ({r['size']} bytes).", True,
                    {"kind": "file", "path": r["path"], "created": r.get("created"), "added": r.get("added"), "removed": r.get("removed")})
        if name == "edit_file":
            r = await host.fs("edit", path=resolve(cwd, args["path"]), old=args["old"], new=args["new"])
            if r.get("error"):
                return "Error: " + r["error"], False
            if not r.get("ok"):
                n = r.get("count", 0)
                return ("Error: the old text was not found. Read the file again and copy the snippet exactly." if n == 0 else
                        f"Error: the old text appears {n} times. Include more surrounding lines so it is unique."), False
            return f"Edited {r['path']}.", True, {"kind": "file", "path": r["path"], "added": r.get("added"), "removed": r.get("removed")}
        if name == "list_files":
            depth = max(1, min(int(args.get("depth") or 2), 3))
            p = resolve(cwd, args.get("path"))
            res = await host.exec(f"find {_q(p)} -mindepth 1 -maxdepth {depth} \\( -name .git -o -name node_modules -o -name __pycache__ "
                                  f"-o -name .venv -o -name .cache \\) -prune -o -printf '%y %P\\n' 2>&1 | sort -k2 | head -400", cwd, 60)
            lines = [(l[2:] + "/" if l.startswith("d ") else l[2:]) for l in res["output"].splitlines() if len(l) > 2]
            return clip("\n".join(lines) or "(empty)"), res["exit"] == 0
        if name == "glob":
            base = resolve(cwd, args.get("path"))
            script = ("import glob,json,os,sys; b=os.path.expanduser(sys.argv[1]); p=sys.argv[2];"
                      "h=[os.path.relpath(x,b) for x in glob.glob(os.path.join(b,p),recursive=True) "
                      "if '/.git/' not in x and '/node_modules/' not in x][:300]; print('\\n'.join(sorted(h)) or 'No files match.')")
            res = await host.exec(f"python3 -c {_q(script)} {_q(base)} {_q(args['pattern'])}", cwd, 60)
            return clip(res["output"]), res["exit"] == 0
        if name == "search":
            p = resolve(cwd, args.get("path"))
            res = await host.exec(f"grep -rnIE --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.venv -m 20 "
                                  f"-e {_q(args['pattern'])} {_q(p)} 2>/dev/null | head -200", cwd, 90)
            return clip(res["output"] or "(no matches)"), True
        if name == "load_skill":
            sk = skills()
            key = args["name"].strip()
            if key not in sk:
                return "No skill called that. Available: " + ", ".join(sk), False
            return sk[key][1] + (learner.for_skill(key) if learner else ""), True
        if name == "run_python":
            res = await run_command(SCRATCH, "cat > /tmp/riri_run.py <<'RIRI_PY_EOF'\n" + args["code"] + "\nRIRI_PY_EOF\n"
                                    "timeout 60 python3 /tmp/riri_run.py", 75)
            out = res.get("output") or "(no output — use print())"
            return clip(out + ("" if res.get("exit") == 0 else f"\n[exit code {res.get('exit')}]")), res.get("exit") == 0
        if name == "web_search":
            text, display = await web_search(args["query"], bool(args.get("images")))
            return clip(text), True, display
        if name == "read_webpage":
            return await read_webpage(args["url"])
        if name == "artifact_start":
            rec, msg, ok = await artifacts.start(args.get("name"), args.get("folder") or args.get("path") or cwd, args.get("command"),
                                                 args.get("description"), (args.get("id") or "").strip() or None, session_id)
            if not rec:
                return "Error: " + msg, False
            head = (f"Artifact \"{rec['name']}\" (id {rec['id']}) on port {rec['port']}, serving {rec['dir']}.\n"
                    f"Address: {rec['url']}\nLocal address (for checks with curl from the server): "
                    f"http://{artifacts.bind}:{rec['port']}/\n")
            note = ("The owner sees a live preview card with this address. Give them the link."
                    if ok else "Fix the problem, then call artifact_start again with this id.")
            return clip(head + msg + "\n" + note), ok, {"kind": "artifact", "artifact": rec}
        if name == "artifact_stop":
            ok = await artifacts.stop(args["id"].strip())
            return ("Stopped." if ok else "No artifact with that id."), ok
        if name == "artifact_list":
            rows = artifacts.list()
            return "\n".join(f"- {a['name']} [{a['state']}] id {a['id']}, port {a['port']}, {a['url']} - folder {a['dir']}, "
                             f"command: {a['command']}" for a in rows) or "No artifacts yet.", True
        if name == "artifact_logs":
            return clip(await artifacts.logs(args["id"].strip(), args.get("lines") or 80)), True
        if name == "add_task":
            due = None
            if args.get("due"):
                due = parse_due(str(args["due"]))
                if not due:
                    return (f"Error: couldn't understand the date '{args['due']}'. Use words like 'next friday 6pm', "
                            "'tomorrow', 'in 3 days', or YYYY-MM-DD [HH:MM]."), False
            tid = db.x("INSERT INTO tasks(title,notes,due,created) VALUES(?,?,?,?)",
                       (args["title"], args.get("notes") or "", due, time.time()))
            if not due:
                return f"Added task #{tid}: {args['title']}", True
            import datetime as _dt
            d = _dt.datetime.strptime(due, "%Y-%m-%d %H:%M" if len(due) > 10 else "%Y-%m-%d")
            when = d.strftime("%a %d %b %Y") + (d.strftime(", %H:%M") if len(due) > 10 else "")
            return f"Added task #{tid}: {args['title']}, due {when}. Tell the owner exactly this date.", True
        if name == "list_tasks":
            rows = db.q("SELECT id,title,due FROM tasks WHERE done=0 ORDER BY due IS NULL, due, id LIMIT 50")
            return "\n".join(f"#{r['id']} {r['title']}" + (f" (due {r['due']})" if r["due"] else "") for r in rows) or "No open tasks.", True
        if name == "complete_task":
            db.x("UPDATE tasks SET done=1, done_at=? WHERE id=?", (time.time(), int(args["id"])))
            return f"Task #{args['id']} marked done.", True
        if name == "save_note":
            nid = db.x("INSERT INTO notes(title,body,created,updated) VALUES(?,?,?,?)", (args["title"], args["body"], time.time(), time.time()))
            return f"Saved note #{nid}: {args['title']}", True
        if name == "update_note":
            nid = int(args["id"])
            if not db.one("SELECT 1 FROM notes WHERE id=?", (nid,)):
                return f"No note #{nid}.", False
            for k in ("title", "body"):
                if args.get(k) is not None:
                    db.x(f"UPDATE notes SET {k}=?, updated=? WHERE id=?", (args[k], time.time(), nid))
            return f"Updated note #{nid}.", True
        if name == "search_notes":
            like = f"%{args['query']}%"
            rows = db.q("SELECT id,title,body FROM notes WHERE title LIKE ? OR body LIKE ? ORDER BY updated DESC LIMIT 8", (like, like))
            return clip("\n\n".join(f"#{r['id']} {r['title']}\n{r['body'][:600]}" for r in rows) or "No matching notes."), True
        if name == "learn":
            lid = learner.add(args["lesson"], args.get("skill") or "general", "self") if learner else None
            return ("Lesson saved. It will come back when it's relevant." if lid else "That lesson was too short to keep."), bool(lid)
        if name == "remember":
            db.x("INSERT INTO memories(fact,created) VALUES(?,?)", (args["fact"], time.time()))
            return "Remembered.", True
        if name == "forget":
            words = args["words"].strip()
            if len(words) < 3:
                return "Give at least a few words to match.", False
            rows = db.q("SELECT id, fact FROM memories WHERE fact LIKE ?", (f"%{words}%",))
            for r in rows:
                db.x("DELETE FROM memories WHERE id=?", (r["id"],))
            return (f"Forgot {len(rows)}: " + "; ".join(r["fact"] for r in rows)) if rows else "Nothing remembered matches that.", True
        return f"Error: unknown tool {name}", False
    except KeyError as e:
        return f"Error: missing argument {e}", False
    except httpx.HTTPError as e:
        return f"Error: a service did not answer ({e.__class__.__name__}).", False
    except Exception as e:  # tool errors go back to the model, never crash the run
        return f"Error: {e}", False


_WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]


def parse_due(text, now=None):
    """Turns the owner's words for a time ('next friday 6pm', 'tomorrow', 'in 2 hours', '20 nov 18:00',
    '2026-11-20') into 'YYYY-MM-DD' or 'YYYY-MM-DD HH:MM' in local time. Returns None if it can't."""
    import datetime as dt
    now = now or dt.datetime.now()
    s = " " + re.sub(r"[,.]", " ", text.strip().lower()) + " "
    m = re.fullmatch(r"\s*(\d{4}-\d{2}-\d{2})(?:[ t](\d{1,2}):(\d{2}))?\s*", s)
    if m:
        try:
            d = dt.datetime.strptime(m.group(1), "%Y-%m-%d")
        except ValueError:
            return None
        return m.group(1) + (f" {int(m.group(2)):02d}:{m.group(3)}" if m.group(2) else "")
    # relative offsets: in 2 hours / in 30 minutes / in 3 days / in 2 weeks
    m = re.search(r"\bin\s+(\d+|an?|one|two|three)\s*(min|minute|minutes|hr|hrs|hour|hours|day|days|week|weeks)\b", s)
    if m:
        n = {"a": 1, "an": 1, "one": 1, "two": 2, "three": 3}.get(m.group(1)) or int(m.group(1))
        unit = m.group(2)
        if unit.startswith("min"):
            return (now + dt.timedelta(minutes=n)).strftime("%Y-%m-%d %H:%M")
        if unit.startswith("h"):
            return (now + dt.timedelta(hours=n)).strftime("%Y-%m-%d %H:%M")
        day = now + dt.timedelta(days=n * (7 if unit.startswith("week") else 1))
        return day.strftime("%Y-%m-%d") + _time_part(s)
    # the day
    day = None
    if re.search(r"\bday after tomorrow\b", s):
        day = now + dt.timedelta(days=2)
    elif re.search(r"\b(tomorrow|tmrw|tmr)\b", s):
        day = now + dt.timedelta(days=1)
    elif re.search(r"\b(today|tonight|this evening|this morning|this afternoon)\b", s):
        day = now
    elif re.search(r"\bnext week\b", s):
        day = now + dt.timedelta(days=7 - now.weekday())  # next Monday
    else:
        for i, wd in enumerate(_WEEKDAYS):
            if re.search(rf"\b{wd[:3]}(?:{wd[3:]})?\b", s):
                ahead = (i - now.weekday()) % 7 or 7  # the first one after today
                day = now + dt.timedelta(days=ahead)
                break
    if day is None:
        m = re.search(r"\b(\d{1,2})\s*(?:st|nd|rd|th)?\s+(" + "|".join(_MONTHS) + r")[a-z]*\b", s) or \
            re.search(r"\b(" + "|".join(_MONTHS) + r")[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b", s)
        if m:
            a, b = m.groups()
            dd, mon = (int(a), b) if a.isdigit() else (int(b), a)
            try:
                day = now.replace(month=_MONTHS.index(mon[:3]) + 1, day=dd)
                if day.date() < now.date():
                    day = day.replace(year=now.year + 1)
            except ValueError:
                return None
    t = _time_part(s)
    if day is None:
        if not t:
            return None
        day = now  # only a time: today, or tomorrow if that time has passed
        if f"{now:%Y-%m-%d}{t}" <= f"{now:%Y-%m-%d %H:%M}":
            day = now + dt.timedelta(days=1)
    return day.strftime("%Y-%m-%d") + t


def _time_part(s):
    """' HH:MM' from '6pm', '6:30 pm', '18:00', 'noon', 'evening'…, or '' when no time is given."""
    m = re.search(r"\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b", s)
    if m:
        h, mi = int(m.group(1)) % 12, int(m.group(2) or 0)
        h += 12 if m.group(3) == "pm" else 0
        return f" {h:02d}:{mi:02d}" if h < 24 and mi < 60 else ""
    m = re.search(r"\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b", s)
    if m:
        return f" {int(m.group(1)):02d}:{m.group(2)}"
    for word, hhmm in (("noon", "12:00"), ("midnight", "23:59"), ("morning", "09:00"), ("afternoon", "15:00"),
                       ("evening", "18:00"), ("tonight", "21:00"), ("night", "21:00")):
        if re.search(rf"\b{word}\b", s):
            return " " + hhmm
    return ""


def _q(s):
    """Shell-quote, keeping a leading ~ expandable."""
    s = str(s)
    if s == "~":
        return "~"
    if s.startswith("~/"):
        return "~/" + _sh(s[2:])  # the slash must stay unquoted for bash to expand ~
    return _sh(s)
