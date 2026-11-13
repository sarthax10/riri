"""SQLite storage: sessions, messages, tasks, notes, memories, settings and logins."""
import json
import sqlite3
import threading
import time
import uuid

SCHEMA = """
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS sessions(
  id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT 'New chat', mode TEXT NOT NULL DEFAULT 'chat',
  workspace TEXT, pinned INTEGER NOT NULL DEFAULT 0, created REAL NOT NULL, updated REAL NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS messages(
  id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', reasoning TEXT, tool_calls TEXT, tool_call_id TEXT,
  meta TEXT NOT NULL DEFAULT '{}', created REAL NOT NULL);
CREATE INDEX IF NOT EXISTS messages_session ON messages(session_id, id);
CREATE TABLE IF NOT EXISTS tasks(
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', due TEXT,
  done INTEGER NOT NULL DEFAULT 0, created REAL NOT NULL, done_at REAL);
CREATE TABLE IF NOT EXISTS notes(
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
  pinned INTEGER NOT NULL DEFAULT 0, created REAL NOT NULL, updated REAL NOT NULL);
CREATE TABLE IF NOT EXISTS memories(id INTEGER PRIMARY KEY AUTOINCREMENT, fact TEXT NOT NULL, created REAL NOT NULL);
CREATE TABLE IF NOT EXISTS usage(day TEXT PRIMARY KEY, prompt_tokens INTEGER NOT NULL DEFAULT 0,
  gen_tokens INTEGER NOT NULL DEFAULT 0, gen_seconds REAL NOT NULL DEFAULT 0, chats INTEGER NOT NULL DEFAULT 0,
  agent_runs INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS logins(token_hash TEXT PRIMARY KEY, created REAL NOT NULL, expires REAL NOT NULL, agent TEXT);
"""


class DB:
    def __init__(self, path):
        self.conn = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys=ON")
        self.lock = threading.Lock()
        with self.lock:
            self.conn.executescript(SCHEMA)

    def q(self, sql, args=()):
        with self.lock:
            return [dict(r) for r in self.conn.execute(sql, args).fetchall()]

    def one(self, sql, args=()):
        rows = self.q(sql, args)
        return rows[0] if rows else None

    def x(self, sql, args=()):
        with self.lock:
            cur = self.conn.execute(sql, args)
            return cur.lastrowid

    # ---- key/value settings ----
    def get(self, key, default=None):
        row = self.one("SELECT value FROM kv WHERE key=?", (key,))
        return json.loads(row["value"]) if row else default

    def put(self, key, value):
        self.x("INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
               (key, json.dumps(value)))

    # ---- sessions ----
    def create_session(self, mode="chat", workspace=None, title="New chat", meta=None):
        sid = uuid.uuid4().hex[:12]
        now = time.time()
        self.x("INSERT INTO sessions(id,title,mode,workspace,created,updated,meta) VALUES(?,?,?,?,?,?,?)",
               (sid, title, mode, workspace, now, now, json.dumps(meta or {})))
        return self.session(sid)

    def session(self, sid):
        s = self.one("SELECT * FROM sessions WHERE id=?", (sid,))
        if s:
            s["meta"] = json.loads(s["meta"])
        return s

    def sessions(self, limit=200, mode=None):
        sql = ("SELECT s.*, (SELECT content FROM messages m WHERE m.session_id=s.id AND m.role='assistant' "
               "AND m.content!='' ORDER BY m.id DESC LIMIT 1) AS last, "
               "(SELECT COUNT(*) FROM messages m WHERE m.session_id=s.id AND m.role='user') AS turns FROM sessions s")
        args = []
        if mode:
            sql += " WHERE s.mode=?"
            args.append(mode)
        sql += " ORDER BY s.pinned DESC, s.updated DESC LIMIT ?"
        args.append(limit)
        out = self.q(sql, args)
        for s in out:
            s["meta"] = json.loads(s["meta"])
            s["last"] = (s["last"] or "")[:180]
        return out

    def update_session(self, sid, **fields):
        if "meta" in fields:
            fields["meta"] = json.dumps(fields["meta"])
        fields["updated"] = time.time()
        cols = ",".join(f"{k}=?" for k in fields)
        self.x(f"UPDATE sessions SET {cols} WHERE id=?", (*fields.values(), sid))

    def touch(self, sid):
        self.x("UPDATE sessions SET updated=? WHERE id=?", (time.time(), sid))

    # ---- messages ----
    def add_message(self, sid, role, content="", reasoning=None, tool_calls=None, tool_call_id=None, meta=None):
        mid = self.x("INSERT INTO messages(session_id,role,content,reasoning,tool_calls,tool_call_id,meta,created) "
                     "VALUES(?,?,?,?,?,?,?,?)",
                     (sid, role, content or "", reasoning, json.dumps(tool_calls) if tool_calls else None,
                      tool_call_id, json.dumps(meta or {}), time.time()))
        self.touch(sid)
        return mid

    def messages(self, sid):
        rows = self.q("SELECT * FROM messages WHERE session_id=? ORDER BY id", (sid,))
        for r in rows:
            r["meta"] = json.loads(r["meta"])
            r["tool_calls"] = json.loads(r["tool_calls"]) if r["tool_calls"] else None
        return rows

    # ---- usage ----
    def add_usage(self, prompt=0, gen=0, gen_seconds=0.0, chats=0, agent_runs=0):
        day = time.strftime("%Y-%m-%d")
        self.x("INSERT INTO usage(day,prompt_tokens,gen_tokens,gen_seconds,chats,agent_runs) VALUES(?,?,?,?,?,?) "
               "ON CONFLICT(day) DO UPDATE SET prompt_tokens=prompt_tokens+excluded.prompt_tokens, "
               "gen_tokens=gen_tokens+excluded.gen_tokens, gen_seconds=gen_seconds+excluded.gen_seconds, "
               "chats=chats+excluded.chats, agent_runs=agent_runs+excluded.agent_runs",
               (day, prompt, gen, gen_seconds, chats, agent_runs))
