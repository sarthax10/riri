#!/usr/bin/env python3
"""reliquary: talk to RiRi, your assistant, from the terminal. Same sessions as the website.

  reliquary                 start a new chat
  reliquary "question"      ask once and print the answer (stdin is attached if piped)
  reliquary -c              continue the most recent chat
  reliquary ls              list conversations          reliquary open <id>     resume one
  reliquary code <ws>       coding session in a workspace   reliquary ws          list workspaces
  reliquary tasks           your open tasks             reliquary add "task"    add a task
  reliquary status          model and machine status    reliquary passwd        set the website password
"""
import argparse
import getpass
import json
import os
import sys
import time

import httpx
from prompt_toolkit import PromptSession
from prompt_toolkit.formatted_text import HTML
from prompt_toolkit.history import FileHistory
from prompt_toolkit.styles import Style
from rich.console import Console, Group
from rich.live import Live
from rich.markdown import Markdown
from rich.padding import Padding
from rich.panel import Panel
from rich.table import Table
from rich.text import Text
from rich.theme import Theme
from rich import box

API = os.environ.get("RELIQUARY_API", "http://127.0.0.1:8700")
TOKEN_FILE = os.path.expanduser(os.environ.get("RELIQUARY_TOKEN_FILE", "~/reliquary/data/cli.token"))
STATE = os.path.expanduser("~/.local/state/reliquary")

P = "#F2542D"; MAG = "#E5307E"; BUT = "#F8D865"; SAGE = "#B5D49C"; LIL = "#C4B6F6"; APR = "#F7B57F"; DIM = "#8E8A9A"; CREAM = "#FBE6C4"
theme = Theme({"p": P, "mag": MAG, "but": BUT, "sage": SAGE, "lil": LIL, "apr": APR, "dim": DIM, "cream": CREAM,
               "markdown.code": f"{BUT}", "markdown.h1": f"bold {P}", "markdown.h2": f"bold {APR}", "markdown.link": LIL})
con = Console(theme=theme, highlight=False)

FACES = {"idle": "◕‿◕", "reading": "◔_◔", "writing": "◕o◕", "tool": "◕▿◕", "awaiting": "◕︿◕", "queued": "–‿–", "error": "×_×"}
KIND = {"list_files": ("read", SAGE), "read_file": ("read", SAGE), "search": ("search", SAGE), "write_file": ("write", APR),
        "edit_file": ("edit", APR), "run": ("run", LIL)}
VERB = {"todo": "Updated the plan", "load_skill": "Loaded a skill", "run_python": "Ran Python", "glob": "Found files",
        "forget": "Forgot", "update_note": "Updated a note", "web_search": "Searched the web", "read_webpage": "Read a page",
        "list_files": "Listed", "read_file": "Read", "search": "Searched", "write_file": "Wrote", "edit_file": "Edited", "run": "Ran",
        "add_task": "Added a task", "list_tasks": "Checked tasks", "complete_task": "Completed a task", "save_note": "Saved a note",
        "search_notes": "Searched notes", "remember": "Remembered"}


# ------------------------------------------------------------------ API
def token():
    try:
        return open(TOKEN_FILE).read().strip()
    except OSError:
        con.print(f"[p]Can't read the access token at {TOKEN_FILE}.[/] Is Reliquary running on this server?")
        sys.exit(1)


client = None


def c():
    global client
    if client is None:
        client = httpx.Client(base_url=API, headers={"Authorization": f"Bearer {token()}"}, timeout=httpx.Timeout(30, read=None))
    return client


def call(method, path, **kw):
    try:
        r = c().request(method, path, **kw)
    except httpx.ConnectError:
        con.print("[p]Reliquary isn't answering on this machine.[/] Start it with: [cream]cd ~/reliquary && docker compose up -d[/]")
        sys.exit(1)
    if r.status_code >= 400:
        try:
            msg = r.json().get("detail", r.text)
        except ValueError:
            msg = r.text
        raise RuntimeError(msg)
    return r.json()


# ------------------------------------------------------------------ look
NAME = ["RiRi"]


def load_name():
    try:
        NAME[0] = call("GET", "/api/settings").get("assistant_name") or "RiRi"
    except Exception:
        pass


def banner(status):
    load_name()
    m = status["model"]
    sp = status["engine"]["speed"]
    online = status["online"]
    face = Text(" " + FACES["idle"] + " ", style=f"bold #1D1B24 on {BUT}")
    t = Text()
    t.append(f"  {NAME[0]}", style=f"bold {P}")
    t.append("  on your server", style=DIM)
    t.append(f"   {m.get('model', 'model')}", style=CREAM)
    t.append("   ready" if online else "   starting up", style=SAGE if online else BUT)
    if sp.get("tg_tps"):
        t.append(f"   {sp['tg_tps']:.1f} tok/s", style=DIM)
    con.print()
    con.print(Text.assemble(face, t))
    con.print(Text("  /help for commands   Ctrl+C stops a reply   Ctrl+D leaves", style=DIM))
    con.print()


def rule(label, color=DIM):
    con.print(Text(f"── {label} ", style=color) + Text("─" * max(0, con.width - len(label) - 4), style="#3A3646"))


def bar(frac, width=28):
    n = int(frac * width)
    return Text("━" * n, style=P) + Text("━" * (width - n), style="#3A3646")


def fmtk(n):
    return f"{n / 1000:.1f}k" if n >= 1000 else str(int(n))


def tool_line(t):
    kind, color = KIND.get(t["name"], ("tool", BUT))
    a = t.get("args") or {}
    arg = a.get("command") or a.get("path") or a.get("pattern") or a.get("title") or a.get("fact") or a.get("query") or "" if isinstance(a, dict) else str(a)
    state = t.get("state", "…")
    mark = {"ok": Text(" ✓", style=SAGE), "bad": Text(" ✗", style=P), "ask": Text(" waiting for you", style=BUT), "no": Text(" declined", style=DIM)}.get(state, Text(" …", style=DIM))
    line = Text("  ◆ ", style=color) + Text(VERB.get(t["name"], t["name"]), style="bold") + Text(" " + str(arg)[:90], style=DIM) + mark
    return line


# ------------------------------------------------------------------ a live run
class RunView:
    def __init__(self, run, session):
        self.run, self.session = run, session
        self.phase, self.progress, self.content, self.reasoning = "queued", None, "", ""
        self.tools, self.stats, self.started, self.notice = [], None, time.time(), None
        self.speed = 20

    def render(self):
        parts = []
        if self.reasoning and not self.content:
            tail = self.reasoning[-220:].replace("\n", " ")
            parts.append(Text(f"  thinking  {tail}", style=f"italic {DIM}", overflow="ellipsis", no_wrap=True))
        if self.content:
            parts.append(Padding(Markdown(self.content), (0, 2)))
        for t in self.tools:
            parts.append(tool_line(t))
        face = Text(f" {FACES.get(self.phase, FACES['idle'])} ", style=f"bold #1D1B24 on {BUT}")
        if self.phase == "reading":
            p = self.progress
            if p and p["total"]:
                todo = max(1, p["total"] - p["cache"]); done = max(0, p["processed"] - p["cache"])
                eta = (todo - done) / max(1, self.speed)
                parts.append(Text.assemble(face, "  Reading ", bar(done / todo), Text(f"  {fmtk(done)}/{fmtk(todo)}  about {int(eta)}s left", style=DIM)))
            else:
                parts.append(Text.assemble(face, Text("  Reading the conversation…", style=DIM)))
        elif self.phase == "queued":
            parts.append(Text.assemble(face, Text("  Waiting its turn behind another reply…", style=DIM)))
        elif self.phase == "tool":
            parts.append(Text.assemble(face, Text("  Working in the workbench…", style=DIM)))
        elif self.phase == "writing" and not self.content and not self.reasoning:
            parts.append(Text.assemble(face, Text("  Writing…", style=DIM)))
        return Group(*parts) if parts else Text("")

    def flush_block(self):
        """Prints the finished part of the reply above the live area and resets it."""
        out = []
        if self.content:
            out.append(Padding(Markdown(self.content), (0, 2)))
        for t in self.tools:
            out.append(tool_line(t))
        self.content, self.reasoning, self.tools = "", "", []
        return out


def follow(run, session):
    """Streams a run's events until it ends. Ctrl+C stops the run."""
    v = RunView(run, session)
    try:
        st = call("GET", "/api/status")
        v.speed = st["engine"]["speed"].get("pp_tps") or 20
    except Exception:
        pass
    after = -1
    with Live(v.render(), console=con, refresh_per_second=10, transient=False, vertical_overflow="visible") as live:
        try:
            while True:
                try:
                    with c().stream("GET", f"/api/runs/{run['id']}/events", params={"after": after}) as r:
                        for line in r.iter_lines():
                            if not line.startswith("data:"):
                                continue
                            ev = json.loads(line[5:])
                            after = ev["seq"]
                            end = handle(ev, v, live)
                            live.update(v.render())
                            if end:
                                return end
                except httpx.HTTPError:
                    time.sleep(1.5)
        except KeyboardInterrupt:
            call("POST", f"/api/runs/{run['id']}/stop")
            live.update(Text("  Stopped.", style=DIM))
            return "stopped"


def handle(ev, v, live):
    k = ev["type"]
    if k == "phase":
        v.phase = ev["phase"]
    elif k == "progress":
        v.progress = ev
    elif k == "reasoning":
        v.reasoning += ev["text"]
    elif k == "content":
        v.content += ev["text"]
    elif k == "message":
        v.content = ev["content"]
        v.tools = []
        for tc in ev.get("tool_calls") or []:
            try:
                args = json.loads(tc["function"]["arguments"] or "{}")
            except ValueError:
                args = {}
            v.tools.append({"id": tc["id"], "name": tc["function"]["name"], "args": args, "state": "…"})
        if not v.tools:
            for part in v.flush_block():
                live.console.print(part)
            m = ev.get("meta") or {}
            if m.get("tg_tps"):
                pct = f"   {round(100 * m['ctx_used'] / m['ctx_max'])}% of memory" if m.get("ctx_max") else ""
                live.console.print(Text(f"  {m['tg_tps']:.1f} tok/s{pct}", style=DIM))
    elif k == "approval":
        t = next((t for t in v.tools if t["id"] == ev["id"]), None)
        if t:
            t["state"] = "ask"
        live.update(v.render())
        live.stop()
        a = ev["args"]
        what = {"run": "Run this command?", "write_file": f"Write {a.get('path')}?", "edit_file": f"Edit {a.get('path')}?"}[ev["name"]]
        body = a.get("command") if ev["name"] == "run" else a.get("content") if ev["name"] == "write_file" else f"- {a.get('old')}\n+ {a.get('new')}"
        con.print(Panel(Text(str(body)[:1500]), title=Text(what, style=f"bold {BUT}"), border_style=BUT, box=box.ROUNDED, padding=(0, 1)))
        ans = ""
        while ans not in ("y", "a", "n"):
            ans = (con.input(f"  [but]Allow?[/] [cream]y[/]es  [cream]a[/]lways this session  [cream]n[/]o  › ").strip().lower() or "y")[:1]
        call("POST", f"/api/runs/{v.run['id']}/approve", json={"id": ev["id"], "allow": ans != "n", "always": ans == "a"})
        live.start()
    elif k == "approval_result":
        t = next((t for t in v.tools if t["id"] == ev["id"]), None)
        if t and not ev["allow"]:
            t["state"] = "no"
    elif k == "tool_result":
        t = next((t for t in v.tools if t["id"] == ev["id"]), None)
        if t and t["state"] != "no":
            t["state"] = "ok" if ev["ok"] else "bad"
        if all(t["state"] in ("ok", "bad", "no") for t in v.tools):
            for part in v.flush_block():
                live.console.print(part)
    elif k == "todo":
        marks = {"done": ("✓", SAGE), "in_progress": ("◉", P), "pending": ("○", DIM)}
        lines = [Text.assemble(Text(f"  {marks[i['status']][0]} ", style=marks[i['status']][1]),
                               Text(i["text"], style=DIM if i["status"] == "done" else CREAM)) for i in ev["items"]]
        done = sum(i["status"] == "done" for i in ev["items"])
        live.console.print(Panel(Group(*lines), title=Text(f"plan  {done}/{len(ev['items'])}", style=f"bold {P}"),
                                 title_align="left", border_style="#3A3646", box=box.ROUNDED, expand=False))
    elif k == "notice":
        v.notice = ev["text"]
    elif k == "error":
        live.console.print(Text(f"  Something went wrong: {ev['message']}", style=P))
        return "error"
    elif k == "stopped":
        return "stopped"
    elif k == "done":
        if v.notice:
            live.console.print(Text("  " + v.notice, style=BUT))
        secs = int(time.time() - v.started)
        live.console.print(Text(f"  done in {secs // 60}m {secs % 60}s" if secs >= 60 else f"  done in {secs}s", style=DIM))
        return "done"
    return None


# ------------------------------------------------------------------ chat loop
def print_history(sid):
    data = call("GET", f"/api/sessions/{sid}")
    s = data["session"]
    rule(s["title"] + (f"   code in {s['workspace']}" if s["mode"] == "agent" else ""), P)
    for m in data["messages"][-12:]:
        if m["role"] == "user":
            con.print(Text("  you  ", style=f"bold {MAG}") + Text(m["content"][:600]))
        elif m["role"] == "assistant" and m["content"]:
            con.print(Text(f"  {NAME[0]}", style=f"bold {P}"))
            con.print(Padding(Markdown(m["content"]), (0, 2)))
        elif m["role"] == "tool":
            con.print(Text(f"  ◆ {VERB.get(m['meta'].get('name'), 'Tool')}", style=DIM))
    con.print()
    return data


def repl(session):
    os.makedirs(STATE, exist_ok=True)
    style = Style.from_dict({"prompt": f"bold {MAG}", "bottom-toolbar": f"bg:#1D1B24 {DIM}"})
    ps = PromptSession(history=FileHistory(os.path.join(STATE, "history")), style=style)
    sid = session["id"] if session else None
    mode = session["mode"] if session else "chat"
    banner(call("GET", "/api/status"))
    if sid:
        data = print_history(sid)
        if data["run"]:
            follow(data["run"], data["session"])

    def toolbar():
        where = f"code in {session['workspace']}" if session and session["mode"] == "agent" else "chat"
        return HTML(f" {where}   /help   Alt+Enter or Esc Enter for a new line ")

    while True:
        try:
            text = ps.prompt(HTML("<prompt>  › </prompt>"), bottom_toolbar=toolbar, multiline=False).strip()
        except KeyboardInterrupt:
            continue
        except EOFError:
            con.print(Text("  See you.", style=DIM))
            return
        if not text:
            continue
        if text.startswith("/"):
            cmd, _, arg = text[1:].partition(" ")
            if cmd in ("exit", "quit", "q"):
                return
            if cmd == "help":
                con.print(Panel(Text.from_markup(
                    "[cream]/new[/]  new chat        [cream]/ls[/]  conversations      [cream]/open <id>[/]  resume\n"
                    "[cream]/code <ws>[/]  code session  [cream]/ws[/]  workspaces       [cream]/effort low|medium|high[/]\n"
                    "[cream]/auto[/]  stop asking before changes (code)   [cream]/ask[/]  ask again\n"
                    "[cream]/tasks[/]  your tasks    [cream]/status[/]  machine   [cream]/exit[/]"), border_style=DIM, box=box.ROUNDED))
                continue
            if cmd == "new":
                session, sid, mode = None, None, "chat"
                rule("new chat", P)
                continue
            if cmd == "ls":
                list_sessions()
                continue
            if cmd == "open" and arg:
                s = find_session(arg)
                if s:
                    session, sid, mode = s, s["id"], s["mode"]
                    data = print_history(sid)
                continue
            if cmd == "code":
                s = new_code(arg.strip())
                if s:
                    session, sid, mode = s, s["id"], "agent"
                    rule(f"code in {s['workspace']}", LIL)
                continue
            if cmd == "ws":
                list_ws()
                continue
            if cmd == "effort" and sid and arg in ("low", "medium", "high"):
                call("PATCH", f"/api/sessions/{sid}", json={"effort": arg})
                con.print(Text(f"  Thinking set to {arg}.", style=DIM))
                continue
            if cmd in ("auto", "ask") and sid:
                call("PATCH", f"/api/sessions/{sid}", json={"approval": cmd, "reset_trust": cmd == "ask"})
                con.print(Text("  Working without asking." if cmd == "auto" else "  Asking before changes.", style=DIM))
                continue
            if cmd == "tasks":
                list_tasks()
                continue
            if cmd == "status":
                show_status()
                continue
            con.print(Text("  Unknown command. Try /help.", style=DIM))
            continue
        if not sid:
            session = call("POST", "/api/sessions", json={"mode": "chat"})
            sid, mode = session["id"], "chat"
        try:
            run = call("POST", f"/api/sessions/{sid}/messages", json={"content": text})
        except RuntimeError as e:
            con.print(Text(f"  {e}", style=P))
            continue
        con.print()
        follow(run, session)
        con.print()


def find_session(prefix):
    for s in call("GET", "/api/sessions"):
        if s["id"].startswith(prefix):
            return s
    con.print(Text(f"  No conversation starts with {prefix}.", style=P))
    return None


def new_code(ws):
    names = [w["name"] for w in call("GET", "/api/workspaces")]
    if not ws:
        con.print(Text("  Name a workspace: " + (", ".join(names) or "none yet (create one on the website or with /code <new-name>)"), style=DIM))
        return None
    if ws not in names:
        if con.input(f"  [but]Create a new workspace '{ws}'?[/] [cream]y[/]/n › ").strip().lower() not in ("", "y", "yes"):
            return None
        call("POST", "/api/workspaces", json={"name": ws})
    return call("POST", "/api/sessions", json={"mode": "agent", "workspace": ws, "title": f"New task in {ws}"})


# ------------------------------------------------------------------ listings
def list_sessions():
    t = Table(box=box.SIMPLE_HEAD, header_style=f"bold {DIM}", pad_edge=False)
    t.add_column("id", style=DIM); t.add_column("", width=2); t.add_column("title", style=CREAM, overflow="ellipsis", max_width=56)
    t.add_column("when", style=DIM, justify="right")
    for s in call("GET", "/api/sessions")[:25]:
        icon = Text("◆", style=LIL) if s["mode"] == "agent" else Text("●", style=BUT)
        live = Text(" ●", style=MAG) if s.get("running") else Text("")
        t.add_row(s["id"][:6], icon, Text(s["title"]) + live, ago(s["updated"]))
    con.print(Padding(t, (0, 2)))


def list_ws():
    for w in call("GET", "/api/workspaces"):
        con.print(Text("  ◆ ", style=LIL) + Text(w["name"], style=CREAM) + Text(f"  {w['sessions']} sessions" + ("  working" if w["running"] else ""), style=DIM))


def list_tasks():
    rows = call("GET", "/api/tasks")
    if not rows:
        con.print(Text("  Nothing on your list.", style=DIM))
    today = time.strftime("%Y-%m-%d")
    for r in rows:
        due = Text(f"  {r['due']}", style=P if r["due"] and r["due"] < today else DIM) if r["due"] else Text("")
        con.print(Text("  ☐ ", style=BUT) + Text(r["title"]) + due + Text(f"  #{r['id']}", style=DIM))


def show_status():
    st = call("GET", "/api/status")
    sv, sp = st["server"], st["engine"]["speed"]
    t = Table.grid(padding=(0, 2))
    t.add_column(style=DIM); t.add_column(style=CREAM)
    t.add_row("model", f"{st['model'].get('model')}  ({'online' if st['online'] else 'starting'})")
    t.add_row("memory window", f"{st['model'].get('n_ctx', 0):,} tokens")
    t.add_row("speed", f"reads {sp.get('pp_tps') or '?'} tok/s, writes {sp.get('tg_tps') or '?'} tok/s")
    if sv.get("mem_total"):
        t.add_row("RAM", f"{sv['mem_used'] / 2**30:.1f} of {sv['mem_total'] / 2**30:.0f} GB")
    if sv.get("temp"):
        t.add_row("temperature", f"{sv['temp']:.0f} °C")
    t.add_row("working on", f"{len(st['engine']['active'])} task(s), {st['engine']['queue']} waiting")
    con.print(Panel(t, title=Text("the machine", style=f"bold {P}"), border_style="#3A3646", box=box.ROUNDED, expand=False))


def ago(t):
    s = time.time() - t
    return "now" if s < 60 else f"{int(s // 60)} min" if s < 3600 else f"{int(s // 3600)} h" if s < 86400 else time.strftime("%d %b", time.localtime(t))


# ------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser(prog="reliquary", description="Talk to your Reliquary model.", add_help=True)
    ap.add_argument("words", nargs="*", help="a question, or a command: ls, open, code, ws, tasks, add, status, passwd")
    ap.add_argument("-c", "--continue", dest="cont", action="store_true", help="continue the most recent chat")
    a = ap.parse_args()
    w = a.words
    try:
        if a.cont:
            chats = [s for s in call("GET", "/api/sessions") if s["mode"] == "chat"]
            return repl(chats[0] if chats else None)
        if not w:
            return repl(None)
        cmd = w[0]
        if cmd == "ls":
            return list_sessions()
        if cmd == "open" and len(w) > 1:
            s = find_session(w[1])
            return repl(s) if s else None
        if cmd == "code":
            s = new_code(w[1] if len(w) > 1 else "")
            return repl(s) if s else None
        if cmd == "ws":
            return list_ws()
        if cmd == "tasks":
            return list_tasks()
        if cmd == "add" and len(w) > 1:
            r = call("POST", "/api/tasks", json={"title": " ".join(w[1:])})
            return con.print(Text("  Added ", style=DIM) + Text(r["title"], style=CREAM))
        if cmd == "status":
            return show_status()
        if cmd == "passwd":
            return passwd()
        # a one-off question
        q = " ".join(w)
        if not sys.stdin.isatty():
            q += "\n\n```\n" + sys.stdin.read()[:200000] + "\n```"
        s = call("POST", "/api/sessions", json={"mode": "chat"})
        run = call("POST", f"/api/sessions/{s['id']}/messages", json={"content": q})
        follow(run, s)
    except RuntimeError as e:
        con.print(Text(f"  {e}", style=P))
        sys.exit(1)


def passwd():
    con.print(Text("  Set the password for the Reliquary website.", style=CREAM))
    con.print(Text("  Use at least 10 characters. Everyone signed in will be signed out.", style=DIM))
    p1 = getpass.getpass("  New password: ")
    p2 = getpass.getpass("  Again: ")
    if p1 != p2:
        con.print(Text("  Those didn't match. Nothing changed.", style=P))
        sys.exit(1)
    call("POST", "/api/auth/password", json={"new": p1, "sign_out_everywhere": True})
    con.print(Text("  Password set. Sign in at your site.", style=SAGE))


if __name__ == "__main__":
    main()
