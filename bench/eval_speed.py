#!/usr/bin/env python3
"""Checks the two speed features: a shared cached opening across new chats, and restoring a chat's saved state
when you switch back to it. Prints tokens read vs reused for each step, then deletes its test chats."""
import json, os, time, urllib.request

B = "http://127.0.0.1:8700"
TOK = open(os.path.expanduser("~/reliquary/data/cli.token")).read().strip()


def call(method, path, body=None):
    req = urllib.request.Request(B + path, data=json.dumps(body).encode() if body is not None else None, method=method,
                                 headers={"Authorization": "Bearer " + TOK, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def ask(sid, text):
    r = call("POST", f"/api/sessions/{sid}/messages", {"content": text})
    t0, first = time.time(), None
    req = urllib.request.Request(f"{B}/api/runs/{r['id']}/events?after=-1", headers={"Authorization": "Bearer " + TOK})
    with urllib.request.urlopen(req, timeout=1200) as resp:
        for raw in resp:
            line = raw.decode().strip()
            if not line.startswith("data:"):
                continue
            e = json.loads(line[5:])
            if e["type"] == "stats" and first is None:
                first = e
            if e["type"] in ("done", "error", "stopped"):
                break
    return round(time.time() - t0, 1), first


sessions = []
try:
    a = call("POST", "/api/sessions", {"mode": "chat"}); sessions.append(a["id"])
    b = call("POST", "/api/sessions", {"mode": "chat"}); sessions.append(b["id"])
    steps = [("A first message (cold)", a, "In one sentence: why is the sky blue?"),
             ("A follow-up (same chat)", a, "And why are sunsets red? One sentence."),
             ("B first message (new chat: shares the opening)", b, "Name three primary colours, comma separated."),
             ("A again (switch back: restores A's saved state)", a, "Thanks. Now one sentence on rainbows.")]
    for label, s, text in steps:
        secs, st = ask(s["id"], text)
        st = st or {}
        print(f"{label}\n   total {secs}s   new tokens read {st.get('prompt_n')}   reused from cache {st.get('cache_n')}"
              f"   writing {st.get('tg_tps', 0):.1f} tok/s", flush=True)
finally:
    for sid in sessions:
        call("DELETE", f"/api/sessions/{sid}")
    print("cleaned up")
