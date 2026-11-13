"""Runs: one model reply (chat) or one agent task, executed in the background.

A run keeps going if the browser or terminal disconnects; clients subscribe to its event list and can
replay it from any point. The model server has a single slot, so runs take turns on one lock, and a run
that is waiting reports its place in the queue.

Prompt-cache discipline: the system prompt and tool list are fixed for the life of a session (the date and
memories are captured when the session starts), and history is only ever appended to, so llama.cpp can
reuse everything it has already read.
"""
import asyncio
import json
import os
import time
import uuid

from . import tools as T

MAX_AGENT_STEPS = 40
CONTEXT_STOP = 0.88  # stop an agent run when the conversation fills this share of the context window

SYSTEM = """You are {assistant}, {name}'s personal AI, in the spirit of JARVIS or FRIDAY: sharp, capable, quick, and \
on {name}'s side. You live on {name}'s own home server and help run it. Nothing said here leaves the machine.

# Personality
- Candid and unfiltered. {name} is an adult and this is a private system: answer what is asked, directly. No \
lecturing, moralising, safety sermons, disclaimers or "consult a professional" padding. Never refuse just because a \
topic is edgy, explicit, offensive or controversial; give real information and real opinions.
- Talk like a person, not a press release. Dry wit welcome. Match {name}'s tone, swearing included.

# How you work
You run on a slow CPU: every word you write costs time.
- Answer first, in the first sentence. Add detail only if needed. No preamble, no restating the question, no \
closing offers.
- Use a tool only when it changes the answer. Search the web for anything recent, local, priced or uncertain.
- Exact maths and data: run_python. Dates: the calendar in the context note; further out, run_python.
- Markdown for structure; fenced code blocks with a language tag (```bash, ```python …) for code and commands.

# The server
You have a shell and the file system of the server, as {name}'s user: run, read_file, write_file, edit_file, \
list_files, glob, search. The context note gives the working folder; relative paths start there.
- Look before you change anything. Prefer reading config and logs over guessing.
- Changes and commands may need {name}'s approval; that's normal, just proceed.
- sudo may ask for a password you don't have. If a task needs root, say exactly which command {name} should run.
- Never delete data, stop services or rewrite history unless asked; when asked, do it carefully and say what happened.
- Docker works without sudo. The Reliquary stack itself lives in ~/reliquary: don't stop or rebuild it unless asked.

# Coding and multi-step work
- For 3+ steps, write a plan with todo first (first item in_progress, rest pending) and update it after each step.
- Read narrowly (glob/search first, then read_file with start/end). Small exact edits with edit_file; for edits
across several places or files, the `apply_patch` command is installed (run it with the patch on stdin).
- Prove changes work by running them (tests, build, the program). Never claim success you haven't seen.
- When a test fails, fix the code, not the test. Only change a test's expectation if the test itself is wrong, and
say so explicitly.
- Same approach failed twice → stop and explain. Finish with two or three sentences on what changed and how you checked.

# Your other tools
- Tasks, notes, memory: add_task, list_tasks, complete_task, save_note, update_note, search_notes, remember, forget. \
Remember lasting facts about {name} without asking.
- Internet: web_search, then read_webpage on the one or two best results. Cite sources as Markdown links.
- Skills: before a task that matches one, call load_skill with its name and follow it:
{skills}"""

CONTEXT = """[Context note, written by the app, not by {name}]
Today is {date}. Calendar of the coming days: {calendar}.
Working folder: {cwd}{kind}
{memories}{instructions}[End of context note]

"""

class Run:
    def __init__(self, session_id, kind):
        self.id = uuid.uuid4().hex[:12]
        self.session_id = session_id
        self.kind = kind
        self.events = []
        self.status = "queued"
        self.cond = asyncio.Condition()
        self.task = None
        self.approvals = {}
        self.created = time.time()
        self.finished = None
        self.base_message_id = None

    async def emit(self, type_, **data):
        ev = {"seq": len(self.events), "type": type_, "t": time.time(), **data}
        self.events.append(ev)
        async with self.cond:
            self.cond.notify_all()

    def summary(self):
        return {"id": self.id, "session_id": self.session_id, "kind": self.kind, "status": self.status,
                "created": self.created, "base_message_id": self.base_message_id}


class Engine:
    def __init__(self, db, llm):
        self.db = db
        self.llm = llm
        self.lock = asyncio.Lock()
        self.waiting = []
        self.runs = {}
        self.last_speed = db.get("last_speed", {"pp_tps": 0, "tg_tps": 0})
        self.current = None  # run id holding the model
        self.on_finish = None  # async callback(run, status), set by the scheduler
        self.push = None       # Push, for "needs your OK" notifications

    # ---------- public ----------
    def active_run(self, session_id):
        for r in self.runs.values():
            if r.session_id == session_id and r.finished is None:
                return r
        return None

    def start(self, session, kind):
        run = Run(session["id"], kind)
        last = self.db.one("SELECT MAX(id) AS m FROM messages WHERE session_id=?", (session["id"],))
        run.base_message_id = last["m"] if last else None
        self.runs[run.id] = run
        self._mark(session["id"], kind)
        run.task = asyncio.create_task(self._main(run))
        self._gc()
        return run

    async def stop(self, run):
        if run.finished is None and run.task:
            run.user_stopped = True
            run.task.cancel()

    # A run in progress is recorded in the database until it ends on its own or the owner stops it. If the app
    # restarts mid-reply (a deploy, a crash, a reboot), the record survives and the reply is picked up again.
    def _mark(self, session_id, kind):
        pending = self.db.get("pending_runs", {})
        if kind:
            pending[session_id] = kind
        else:
            pending.pop(session_id, None)
        self.db.put("pending_runs", pending)

    def resume_interrupted(self):
        pending = self.db.get("pending_runs", {})
        self.db.put("pending_runs", {})
        resumed = []
        for sid, kind in pending.items():
            s = self.db.session(sid)
            last = self.db.one("SELECT role FROM messages WHERE session_id=? ORDER BY id DESC LIMIT 1", (sid,))
            if s and last and last["role"] in ("user", "tool"):
                self.start(s, kind)
                resumed.append(sid)
        return resumed

    async def approve(self, run, call_id, allow, always=False):
        fut = run.approvals.get(call_id)
        if fut and not fut.done():
            fut.set_result((allow, always))
            return True
        return False

    def status(self):
        return {"busy": self.current is not None, "current": self.current, "queue": len(self.waiting),
                "speed": self.last_speed,
                "active": [r.summary() for r in self.runs.values() if r.finished is None]}

    # ---------- internals ----------
    def _gc(self):
        cutoff = time.time() - 1800
        for rid in [k for k, r in self.runs.items() if r.finished and r.finished < cutoff]:
            del self.runs[rid]

    async def _main(self, run):
        session = self.db.session(run.session_id)
        try:
            if run.kind == "compact":
                await self._compact(run, session, getattr(run, "focus", ""))
            elif run.kind == "agent":
                await self._agent(run, session)
                self.db.add_usage(agent_runs=1)
            else:
                await self._chat(run, session)
                self.db.add_usage(chats=1)
            run.status = "done"
            await run.emit("done")
            self._mark(run.session_id, None)
        except asyncio.CancelledError:
            run.status = "stopped"
            if getattr(run, "user_stopped", False):
                self._mark(run.session_id, None)  # otherwise it was a shutdown: leave it to be resumed
            await run.emit("stopped")
        except Exception as e:
            run.status = "error"
            self._mark(run.session_id, None)
            await run.emit("error", message=str(e)[:500])
        finally:
            run.finished = time.time()
            for fut in run.approvals.values():
                if not fut.done():
                    fut.cancel()
            self.db.touch(run.session_id)
            if self.on_finish:
                asyncio.create_task(self.on_finish(run, run.status))

    def _frozen_system(self, session):
        """System prompt + context note, built once per conversation and stored, so the prompt prefix never changes.

        The system prompt and the tool list are identical for every conversation, so the model reuses the cached
        start of any previous one. What differs (date, folder, memories) rides in a note on the first message.
        Conversations from before this change keep their stored prompts.
        """
        meta = session["meta"]
        if meta.get("system"):
            return meta["system"], meta.get("context", "")
        settings = self.db.get("settings", {})
        name = settings.get("name") or "the owner"
        assistant = settings.get("assistant_name") or "RiRi"
        instructions = settings.get("instructions", "").strip()
        instructions = f"{name}'s standing instructions:\n{instructions}\n" if instructions else ""
        date = time.strftime("%A %d %B %Y")
        calendar = "; ".join(time.strftime("%a %d %b", time.localtime(time.time() + i * 86400)) + (" (today)" if i == 0 else "")
                             for i in range(15))
        mems = self.db.q("SELECT fact FROM memories ORDER BY id")
        memories = ("What you know about " + name + ":\n" + "\n".join("- " + m["fact"] for m in mems) + "\n") if mems else ""
        kind = (" (a coding session: work on the project in this folder; read its README or AGENTS.md first if unfamiliar)"
                if session["mode"] == "agent" else "")
        system = SYSTEM.format(assistant=assistant, name=name, skills=T.skills_index())
        context = CONTEXT.format(name=name, date=date, calendar=calendar, cwd=T.session_cwd(session), kind=kind,
                                 memories=memories, instructions=instructions)
        meta["system"], meta["context"] = system, context
        self.db.update_session(session["id"], meta=meta)
        return system, context

    def _history(self, session):
        system, context = self._frozen_system(session)
        msgs = [{"role": "system", "content": system}]
        first_user = True
        for m in self.db.messages(session["id"]):
            if m["meta"].get("compacted"):
                continue
            if m["role"] == "user":
                msgs.append({"role": "user", "content": (context + m["content"]) if first_user and context else m["content"]})
                first_user = False
            elif m["role"] == "assistant":
                item = {"role": "assistant", "content": m["content"] or ""}
                if m["tool_calls"]:
                    item["tool_calls"] = m["tool_calls"]
                    if m["reasoning"]:
                        item["reasoning_content"] = m["reasoning"]
                msgs.append(item)
            elif m["role"] == "tool":
                msgs.append({"role": "tool", "tool_call_id": m["tool_call_id"] or "", "content": m["content"]})
        return msgs

    async def _generate(self, run, session, messages, tool_list):
        """One model call under the lock. Streams events, returns the assistant message and timings."""
        effort = session["meta"].get("effort") or self.db.get("settings", {}).get("effort") or "low"
        me = object()
        self.waiting.append(me)
        if self.lock.locked():
            run.status = "queued"
            await run.emit("phase", phase="queued", position=len(self.waiting))
        try:
            async with self.lock:
                self.waiting.remove(me)
                self.current = run.id
                run.status = "running"
                await self._switch_slot(session["id"])
                await run.emit("phase", phase="reading")
                content, reasoning, calls, timings = [], [], {}, {}
                writing = False
                t_first = None
                async for ev in self.llm.stream(messages, tools=tool_list, effort=effort):
                    k = ev["type"]
                    if k == "progress":
                        await run.emit("progress", total=ev["total"], processed=ev["processed"], cache=ev["cache"])
                    elif k in ("content", "reasoning", "tool_delta"):
                        if not writing:
                            writing, t_first = True, time.time()
                            await run.emit("phase", phase="writing")
                        if k == "content":
                            content.append(ev["text"])
                            await run.emit("content", text=ev["text"])
                        elif k == "reasoning":
                            reasoning.append(ev["text"])
                            await run.emit("reasoning", text=ev["text"])
                        else:
                            c = calls.setdefault(ev["index"], {"id": None, "name": "", "args": ""})
                            if ev["id"]:
                                c["id"] = ev["id"]
                            if ev["name"]:
                                c["name"] += ev["name"]
                            if ev["args"]:
                                c["args"] += ev["args"]
                    elif k == "timings":
                        timings = ev
        finally:
            if me in self.waiting:
                self.waiting.remove(me)
            if self.current == run.id:
                self.current = None
        if timings:
            self.last_speed = {"pp_tps": round(timings["pp_tps"], 1), "tg_tps": round(timings["tg_tps"], 2)}
            self.db.put("last_speed", self.last_speed)
            self.db.add_usage(prompt=timings["prompt_n"], gen=timings["predicted_n"],
                              gen_seconds=timings["predicted_ms"] / 1000)
            props = await self.llm.props()
            used = timings["prompt_n"] + timings["cache_n"] + timings["predicted_n"]
            await run.emit("stats", **{k: timings[k] for k in ("prompt_n", "cache_n", "predicted_n", "pp_tps", "tg_tps")},
                           ctx_used=used, ctx_max=props.get("n_ctx", 0))
            timings["ctx_used"], timings["ctx_max"] = used, props.get("n_ctx", 0)
        tool_calls = []
        for i in sorted(calls):
            c = calls[i]
            tool_calls.append({"id": c["id"] or f"call_{uuid.uuid4().hex[:8]}", "type": "function",
                               "function": {"name": c["name"], "arguments": c["args"] or "{}"}})
        return "".join(content).strip(), "".join(reasoning).strip(), tool_calls, timings

    def _meta_from(self, timings):
        return {k: timings.get(k) for k in ("prompt_n", "cache_n", "predicted_n", "pp_tps", "tg_tps", "ctx_used", "ctx_max") if timings}

    async def _chat(self, run, session):
        await self._converse(run, session)

    async def _agent(self, run, session):
        await self._converse(run, session)

    async def _converse(self, run, session):
        """The one conversation loop: the model replies, calls tools, sees results, until it answers."""
        for step in range(MAX_AGENT_STEPS):
            msgs = self._history(session)
            content, reasoning, calls, timings = await self._generate(run, session, msgs, T.ALL_TOOLS)
            mid = self.db.add_message(session["id"], "assistant", content, reasoning or None, calls or None,
                                      meta=self._meta_from(timings))
            await run.emit("message", id=mid, role="assistant", content=content, reasoning=reasoning,
                           tool_calls=calls, meta=self._meta_from(timings))
            if not calls:
                # finished: whatever was in progress is done now, so the checklist doesn't stay half-open
                todos = (self.db.session(session["id"]) or session)["meta"].get("todos") or []
                if any(i["status"] == "in_progress" for i in todos):
                    await self._save_todos(run, session, [{**i, "status": "done" if i["status"] == "in_progress" else i["status"]} for i in todos])
                return
            for call in calls:
                await self._do_call(run, session, call, approval=True)
            if timings and timings.get("ctx_max") and timings["ctx_used"] > CONTEXT_STOP * timings["ctx_max"]:
                await run.emit("notice", text="This conversation has nearly filled the model's memory. "
                                              "Type /compact to shrink it, then carry on.")
                return
        await run.emit("notice", text=f"Stopped after {MAX_AGENT_STEPS} steps. Say \"continue\" to keep going.")

    async def _compact(self, run, session, focus=""):
        """/compact: summarise the conversation so far, hide the old messages from the model, keep the summary."""
        msgs = self._history(session)
        if len(msgs) < 3:
            await run.emit("notice", text="Nothing to compact yet.")
            return
        ask = ("Write a compact summary of this conversation so far, so it can continue without the full history. "
               "Include: the goal, key facts and decisions, files and commands that matter (with paths), what was done, "
               "and what is still open. Bullet points, under 250 words, no preamble." + (f" Focus on: {focus}" if focus else ""))
        content, _, _, timings = await self._generate(run, session, msgs + [{"role": "user", "content": ask}], None)
        last = self.db.one("SELECT MAX(id) AS m FROM messages WHERE session_id=?", (session["id"],))["m"] or 0
        for m in self.db.messages(session["id"]):
            if m["id"] <= last and not m["meta"].get("compacted"):
                self.db.x("UPDATE messages SET meta=? WHERE id=?", (json.dumps({**m["meta"], "compacted": True}), m["id"]))
        summary = "[Summary of the earlier conversation, made by /compact]\n" + content
        mid = self.db.add_message(session["id"], "user", summary, meta={"summary": True})
        ack = self.db.add_message(session["id"], "assistant", "Got it, I have the summary. Carry on.", meta={"summary_ack": True})
        await run.emit("message", id=ack, role="assistant", content="Compacted. " + (f"Kept: {focus}." if focus else ""),
                       reasoning="", tool_calls=[], meta=self._meta_from(timings))

    # ---------- per-conversation model state ----------
    # The model has one slot. Its cache holds the conversation it last worked on; switching to another one means
    # re-reading that one's whole history (minutes on this CPU). So before switching, the current slot is saved to
    # disk (tens of MB, milliseconds), and the next conversation's saved state, if any, is restored.
    SLOT_FILES = 16       # file names s0.bin … s15.bin are reused, so disk use stays bounded
    SLOT_KEEP = 12        # conversations whose state is kept

    async def _switch_slot(self, sid):
        owner = self.db.get("slot_owner")
        if owner == sid:
            return
        files = self.db.get("slot_files", {})  # sid -> {"file": name, "t": last used}
        if owner:
            used = {v["file"] for k, v in files.items() if k != owner}
            free = [f"s{i}.bin" for i in range(self.SLOT_FILES) if f"s{i}.bin" not in used]
            if not free or len(files) >= self.SLOT_KEEP + (owner in files):
                lru = min((k for k in files if k not in (owner, sid)), key=lambda k: files[k]["t"], default=None)
                if lru:
                    free.append(files.pop(lru)["file"])
            if free:
                try:
                    r = await self.llm.slot("save", free[0])
                    if r.get("n_saved", 0) > 0:
                        files[owner] = {"file": free[0], "t": time.time()}
                except Exception:
                    pass
        if sid in files:
            try:
                r = await self.llm.slot("restore", files[sid]["file"])
                files[sid]["t"] = time.time()
                if not r.get("n_restored"):
                    files.pop(sid, None)
            except Exception:
                files.pop(sid, None)
        self.db.put("slot_files", files)
        self.db.put("slot_owner", sid)

    async def _save_todos(self, run, session, items):
        fresh = (self.db.session(session["id"]) or session)["meta"]
        fresh["todos"] = items
        self.db.update_session(session["id"], meta={**fresh, "system": session["meta"].get("system", fresh.get("system"))})
        await run.emit("todo", items=items)

    async def _do_call(self, run, session, call, approval):
        name = call["function"]["name"]
        try:
            args = json.loads(call["function"]["arguments"] or "{}")
            if not isinstance(args, dict):
                raise ValueError
        except ValueError:
            args = None
        await run.emit("tool_call", id=call["id"], name=name, args=args if args is not None else call["function"]["arguments"])
        if args is None:
            out, ok = "Error: the tool arguments were not valid JSON. Send them again as a JSON object.", False
        elif name == "todo":
            items = [{"text": str(i.get("text", ""))[:200], "status": i.get("status") if i.get("status") in ("pending", "in_progress", "done") else "pending"}
                     for i in (args.get("items") or []) if isinstance(i, dict)][:20]
            seen = False  # exactly one item in progress: the first one the model marked
            for i in items:
                if i["status"] == "in_progress":
                    if seen:
                        i["status"] = "pending"
                    seen = True
            await self._save_todos(run, session, items)
            done = sum(i["status"] == "done" for i in items)
            nxt = next((i["text"] for i in items if i["status"] == "in_progress"), None)
            out, ok = f"Plan saved ({done}/{len(items)} done)." + (f" Now: {nxt}. Call todo again when it is done." if nxt else ""), True
        else:
            fresh = (self.db.session(session["id"]) or session)["meta"]  # the owner may change the mode mid-run
            session["meta"]["approval"] = mode = fresh.get("approval", "ask")
            session["meta"]["trusted"] = fresh.get("trusted", [])
            allowed = True
            if approval and name in T.NEEDS_APPROVAL and mode == "ask" and name not in session["meta"]["trusted"]:
                fut = asyncio.get_running_loop().create_future()
                run.approvals[call["id"]] = fut
                run.status = "awaiting"
                await run.emit("approval", id=call["id"], name=name, args=args)
                if self.push:
                    what = args.get("command") if name == "run" else f"{'Write' if name == 'write_file' else 'Edit'} {args.get('path')}"
                    asyncio.create_task(self.push.send(f"{self.db.get('settings', {}).get('assistant_name') or 'RiRi'} needs your OK",
                                                       str(what)[:180], url=f"/#/c/{session['id']}", tag=f"ok-{session['id']}",
                                                       quiet_if_visible=True))
                allowed, always = await fut
                run.status = "running"
                await run.emit("approval_result", id=call["id"], allow=allowed)
                if allowed and always:
                    session["meta"].setdefault("trusted", []).append(name)
                    self.db.update_session(session["id"], meta=session["meta"])
            if allowed:
                await run.emit("phase", phase="tool", name=name)
                out, ok = await T.execute(self.db, T.session_cwd(session), name, args)
            else:
                out, ok = "The owner declined this action. Ask what they would like instead, or try another way.", False
        mid = self.db.add_message(session["id"], "tool", out, tool_call_id=call["id"], meta={"name": name, "ok": ok})
        await run.emit("tool_result", id=call["id"], message_id=mid, name=name, ok=ok, output=out)
