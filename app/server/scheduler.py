"""Background jobs: timed reminders, the morning brief, and "reply finished" notifications.

Everything runs in the app's own event loop, checked every 30 seconds. Times are the server's local time (TZ).
"""
import asyncio
import time

BRIEF_PROMPT = ("Prepare my morning brief for today. Load the morning-brief skill and follow it. "
                "{extra}Keep it short enough to read in under a minute.")


class Scheduler:
    def __init__(self, db, engine, push):
        self.db, self.engine, self.push = db, engine, push
        self.artifacts = None  # set by main
        self.learner = None    # set by main
        self.ticks = 0
        try:
            db.x("ALTER TABLE tasks ADD COLUMN notified INTEGER NOT NULL DEFAULT 0")
        except Exception:
            pass  # already there
        engine.on_finish = self.run_finished
        if db.get("brief_last") is None:  # first start: the first brief is tomorrow morning, not right now
            db.put("brief_last", time.strftime("%Y-%m-%d"))

    def settings(self):
        return self.db.get("settings", {})

    async def loop(self):
        while True:
            try:
                await self.tick()
            except Exception as e:  # never let a bad tick stop the loop
                print("scheduler error:", repr(e), flush=True)
            await asyncio.sleep(30)

    async def tick(self):
        self.ticks += 1
        if self.artifacts and self.ticks % 2 == 0:  # every minute: notice artifacts whose process died
            try:
                await self.artifacts.check()
            except Exception as e:
                print("artifact check failed:", repr(e), flush=True)
        if self.learner:
            await self.learner.idle_tick()
        now = time.localtime()
        today, hhmm = time.strftime("%Y-%m-%d", now), time.strftime("%H:%M", now)
        s = self.settings()
        assistant = s.get("assistant_name") or "RiRi"
        # 1) timed reminders: due "YYYY-MM-DD HH:MM" that has passed
        stamp = f"{today} {hhmm}"
        for t in self.db.q("SELECT id, title, due FROM tasks WHERE done=0 AND notified=0 AND length(due)=16 AND due<=?", (stamp,)):
            self.db.x("UPDATE tasks SET notified=1 WHERE id=?", (t["id"],))
            await self.push.send(f"Reminder: {t['title']}", f"Due {t['due'][11:]}. Open your tasks to tick it off.",
                                 url="/#/tasks", tag=f"task-{t['id']}")
        # 2) the morning brief, once a day at the chosen time
        brief_time = s.get("brief_time") or "07:30"
        if s.get("brief_enabled", True) and hhmm >= brief_time and self.db.get("brief_last") != today:
            self.db.put("brief_last", today)
            await self.start_brief(s, assistant)
        # 3) date-only tasks due today, when there's no brief to mention them
        if not s.get("brief_enabled", True) and hhmm >= brief_time:
            due = self.db.q("SELECT id, title FROM tasks WHERE done=0 AND notified=0 AND due=?", (today,))
            if due:
                for t in due:
                    self.db.x("UPDATE tasks SET notified=1 WHERE id=?", (t["id"],))
                names = ", ".join(t["title"] for t in due[:4]) + (" and more" if len(due) > 4 else "")
                await self.push.send(f"Due today: {len(due)} task{'s' if len(due) > 1 else ''}", names, url="/#/tasks", tag="due-today")

    async def start_brief(self, s, assistant):
        extra = []
        if s.get("brief_city"):
            extra.append(f"Include today's weather for {s['brief_city']}.")
        else:
            extra.append("No city is set: leave the Weather section out completely, don't mention it.")
        if s.get("brief_topics"):
            extra.append(f"Include the top news on: {s['brief_topics']}.")
        else:
            extra.append("No news topics are set: leave the News section out completely, don't mention it.")
        title = "Morning brief, " + time.strftime("%A %d %B").replace(" 0", " ")
        session = self.db.create_session("chat", None, title, {"auto": "brief"})
        self.db.add_message(session["id"], "user", BRIEF_PROMPT.format(extra=" ".join(extra) + (" " if extra else "")))
        for t in self.db.q("SELECT id FROM tasks WHERE done=0 AND notified=0 AND due=?", (time.strftime("%Y-%m-%d"),)):
            self.db.x("UPDATE tasks SET notified=1 WHERE id=?", (t["id"],))
        self.engine.start(self.db.session(session["id"]), "chat")

    async def run_finished(self, run, status):
        """Called by the engine when a run ends: notify for briefs and for replies that took a while."""
        s = self.db.session(run.session_id)
        if not s or status != "done":
            return
        last = self.db.one("SELECT content FROM messages WHERE session_id=? AND role='assistant' AND content!='' "
                           "ORDER BY id DESC LIMIT 1", (run.session_id,))
        preview = (last["content"] if last else "").replace("#", "").replace("*", "").strip()
        assistant = self.settings().get("assistant_name") or "RiRi"
        if s["meta"].get("auto") == "brief":
            await self.push.send(f"Your morning brief is ready", preview[:200], url=f"/#/c/{s['id']}", tag="brief")
        elif time.time() - run.created > 45:
            await self.push.send(f"{assistant} replied: {s['title'][:60]}", preview[:200], url=f"/#/c/{s['id']}",
                                 tag=f"run-{s['id']}", quiet_if_visible=True)
