"""Learning from experience.

The model's weights can't be retrained on this machine, so RiRi improves the way agents in production do: she keeps
a notebook of lessons about her own work and reads the relevant ones before similar work.

  notice   -> signals: a thumbs-down (with the owner's note), a stopped or regenerated reply, a correction in the
              owner's next message, repeated tool errors, an app nudge, a thumbs-up on something that went well
  reflect  -> when the machine is idle, the model reviews one flagged conversation and writes 0-3 lessons
  apply    -> lessons relevant to a new message ride along with it (frozen into that message, so the prompt cache
              stays valid), and skill-specific lessons are appended when a skill is loaded
  learn    -> RiRi can also write a lesson herself mid-task (the `learn` tool)
The owner sees, edits and deletes every lesson on the Memory page.
"""
import asyncio
import json
import math
import re
import time

SCHEMA = [
    """CREATE TABLE IF NOT EXISTS lessons(id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, skill TEXT NOT NULL DEFAULT 'general',
       origin TEXT NOT NULL DEFAULT 'reflect', session_id TEXT, created REAL NOT NULL, updated REAL NOT NULL,
       uses INTEGER NOT NULL DEFAULT 0, score REAL NOT NULL DEFAULT 1)""",
    """CREATE TABLE IF NOT EXISTS learn_signals(id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, kind TEXT NOT NULL,
       detail TEXT NOT NULL DEFAULT '', created REAL NOT NULL, done INTEGER NOT NULL DEFAULT 0)""",
]
SKILLS = ["general", "artifacts", "coding", "research", "server", "writing", "planning", "data", "design", "diagrams",
          "explainers", "debugging"]
STOP = set("""about after again also another because been before being both could does doing done each from have having here
into just like make more most much need only other over same should some such than that their them then there these they this
those through very want what when where which while will with would your yours please thanks riri can you the and for are
was were not but how why who its it's i'm i've don't""".split())
CORRECTION = re.compile(r"^\s*(no\b|nope|wrong|that'?s (not|wrong)|not what|you (didn'?t|forgot|missed|broke)|didn'?t work|"
                        r"doesn'?t work|it'?s (broken|wrong)|still (not|broken|wrong)|why did you|stop |that is wrong|incorrect)", re.I)

REFLECT_PROMPT = """You are reviewing one of your own past conversations to get better at your job. You are {assistant}, an AI \
assistant with tools (shell, files, web search, artifacts) on {name}'s home server.

Write 0 to 3 lessons for your future self: specific, reusable instructions about HOW to work better next time, learned \
from what went wrong or right below. Good lessons name the situation and the action, e.g. "When serving an artifact, \
copy the exact Address line from the tool result; never write placeholder links." or "On this server, pip install fails \
outside a venv: create .venv first."
Bad lessons: facts about the topic of the conversation, vague advice ("be careful", "double-check"), or things already in \
the existing lessons.

Answer with only a JSON array, no other text: [{{"skill": "<one of {skills}>", "lesson": "<one sentence, at most 30 words>"}}]. \
If there is nothing worth learning, answer [].

Existing lessons:
{existing}

The conversation:
{digest}"""


def words(text):
    return {w for w in re.findall(r"[a-z][a-z0-9_.-]{3,}", (text or "").lower()) if w not in STOP}


def similar(a, b):
    wa, wb = words(a), words(b)
    return len(wa & wb) / max(1, min(len(wa), len(wb)))


class Learner:
    def __init__(self, db, engine, llm):
        self.db, self.engine, self.llm = db, engine, llm
        for s in SCHEMA:
            db.x(s)
        self.busy = False
        self.last_activity = time.time()
        self.on_change = None  # set by main: publishes a sync event

    def enabled(self):
        return self.db.get("settings", {}).get("learning", True)

    # ------------------------------------------------------------ signals
    def signal(self, session_id, kind, detail=""):
        if not session_id or not self.enabled():
            return
        self.db.x("INSERT INTO learn_signals(session_id,kind,detail,created) VALUES(?,?,?,?)",
                  (session_id, kind, str(detail)[:600], time.time()))

    def check_correction(self, session_id, text):
        """The owner's new message pushes back on the last reply."""
        if CORRECTION.search(text or "") and self.db.one(
                "SELECT 1 FROM messages WHERE session_id=? AND role='assistant' AND content!=''", (session_id,)):
            self.signal(session_id, "corrected", text[:400])

    # ------------------------------------------------------------ the notebook
    def lessons(self):
        return self.db.q("SELECT * FROM lessons ORDER BY score * (1 + uses) DESC, updated DESC")

    def add(self, text, skill="general", origin="reflect", session_id=None):
        text = re.sub(r"\s+", " ", str(text or "")).strip().strip('"')[:300]
        if len(text) < 12:
            return None
        skill = skill if skill in SKILLS else "general"
        for l in self.db.q("SELECT id, text FROM lessons"):
            if similar(l["text"], text) >= 0.7:   # the same lesson again: it matters more
                self.db.x("UPDATE lessons SET score=score+0.5, updated=? WHERE id=?", (time.time(), l["id"]))
                self._changed()
                return l["id"]
        lid = self.db.x("INSERT INTO lessons(text,skill,origin,session_id,created,updated) VALUES(?,?,?,?,?,?)",
                        (text, skill, origin, session_id, time.time(), time.time()))
        self._changed()
        return lid

    def _changed(self):
        if self.on_change:
            self.on_change()

    def relevant(self, text, skills=(), k=4):
        """Lessons that fit a message: shared words, the skills it will use, and how proven a lesson is."""
        if not self.enabled():
            return []
        w = words(text)
        scored = []
        for l in self.db.q("SELECT * FROM lessons"):
            overlap = len(w & words(l["text"] + " " + l["skill"]))
            bonus = 2 if l["skill"] in skills else 0
            if overlap + bonus == 0:
                continue
            scored.append(((overlap + bonus) * l["score"] * (1 + math.log1p(l["uses"])), l))
        best = [l for s, l in sorted(scored, key=lambda x: -x[0])[:k]]
        for l in best:
            self.db.x("UPDATE lessons SET uses=uses+1 WHERE id=?", (l["id"],))
        return best

    def note_for(self, text, skills=()):
        best = self.relevant(text, skills)
        if not best:
            return ""
        return ("\n\n[Lessons from your past work that may apply:\n" + "\n".join("- " + l["text"] for l in best) + "]")

    def for_skill(self, skill, k=6):
        if not self.enabled():
            return ""
        rows = self.db.q("SELECT * FROM lessons WHERE skill=? ORDER BY score * (1 + uses) DESC LIMIT ?", (skill, k))
        for l in rows:
            self.db.x("UPDATE lessons SET uses=uses+1 WHERE id=?", (l["id"],))
        return ("\n\n## Lessons you've learned doing this before\n" + "\n".join("- " + l["text"] for l in rows)) if rows else ""

    # ------------------------------------------------------------ reflection
    def pending(self):
        return self.db.q("SELECT session_id, COUNT(*) AS n, MIN(created) AS t FROM learn_signals WHERE done=0 "
                         "GROUP BY session_id ORDER BY t LIMIT 5")

    def digest(self, session_id, signals):
        msgs = self.db.messages(session_id)
        lines = []
        for m in msgs[-40:]:
            if m["meta"].get("hidden"):
                lines.append("[the app reminded you: " + m["content"][:160] + "]")
            elif m["role"] == "user":
                lines.append("OWNER: " + re.sub(r"\s+", " ", m["content"])[:400])
            elif m["role"] == "assistant":
                for c in m.get("tool_calls") or []:
                    lines.append(f"YOU called {c['function']['name']}({c['function']['arguments'][:160]})")
                if m["content"]:
                    lines.append("YOU answered: " + re.sub(r"\s+", " ", m["content"])[:500])
            elif m["role"] == "tool":
                ok = m["meta"].get("ok")
                lines.append(f"  -> {'ok' if ok else 'ERROR'}: " + re.sub(r"\s+", " ", m["content"])[:200 if ok else 300])
        text = "\n".join(lines)
        if len(text) > 6000:
            text = text[:1500] + "\n…\n" + text[-4400:]
        sig = "\n".join(f"- {s['kind']}" + (f": {s['detail']}" if s["detail"] else "") for s in signals)
        return text + "\n\nWhat happened afterwards (signals):\n" + sig

    async def reflect(self, session_id=None, force=False):
        """Reviews one flagged conversation and stores what it teaches. Returns the lessons added."""
        if self.busy or not self.enabled():
            return []
        pend = self.pending()
        if session_id:
            pend = [p for p in pend if p["session_id"] == session_id] or pend
        if not pend:
            return []
        sid = pend[0]["session_id"]
        signals = self.db.q("SELECT * FROM learn_signals WHERE session_id=? AND done=0", (sid,))
        settings = self.db.get("settings", {})
        existing = "\n".join("- " + l["text"] for l in self.lessons()[:12]) or "(none yet)"
        prompt = REFLECT_PROMPT.format(assistant=settings.get("assistant_name") or "RiRi", name=settings.get("name") or "the owner",
                                       skills=", ".join(SKILLS), existing=existing, digest=self.digest(sid, signals))
        self.busy = True
        out = []
        try:
            async with self.engine.lock:
                await self.engine._switch_slot("__reflect__")   # keep the open conversation's cache intact
                self.engine.current = "reflect"
                text = []
                async for ev in self.llm.stream([{"role": "user", "content": prompt}], max_tokens=700, temperature=0.2, effort="low"):
                    if ev["type"] == "content":
                        text.append(ev["text"])
                    if self.engine.waiting and not force:   # someone wants the model: give it back, try later
                        return []
                raw = "".join(text)
            m = re.search(r"\[.*\]", raw, re.S)
            items = json.loads(m.group(0)) if m else []
            for it in items[:3]:
                if isinstance(it, dict) and it.get("lesson"):
                    lid = self.add(it["lesson"], it.get("skill", "general"), "reflect", sid)
                    if lid:
                        out.append(it["lesson"])
            self.db.x("UPDATE learn_signals SET done=1 WHERE session_id=? AND done=0", (sid,))
        except (ValueError, json.JSONDecodeError):
            self.db.x("UPDATE learn_signals SET done=1 WHERE session_id=? AND done=0", (sid,))
        finally:
            if self.engine.current == "reflect":
                self.engine.current = None
            if self.db.get("slot_owner") == "__reflect__":
                self.db.put("slot_owner", None)   # nothing worth saving in the slot now
            self.busy = False
        return out

    async def idle_tick(self):
        """Called by the scheduler: reflect only when nobody has used the model for a few minutes."""
        if self.busy or self.engine.waiting or self.engine.lock.locked():
            return
        if any(r.finished is None for r in self.engine.runs.values()):
            self.last_activity = time.time()
            return
        if time.time() - self.last_activity < 240:
            return
        if self.pending():
            try:
                await self.reflect()
            except Exception as e:
                print("reflection failed:", repr(e), flush=True)
