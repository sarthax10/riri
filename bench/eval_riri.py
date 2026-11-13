#!/usr/bin/env python3
"""Behaviour check for RiRi: does she pick the right tools and stay brief? Cleans up after itself.
Run on the server:  python3 eval_riri.py"""
import json, os, time, urllib.request

B = "http://127.0.0.1:8700"
TOK = open(os.path.expanduser("~/reliquary/data/cli.token")).read().strip()


def call(method, path, body=None):
    req = urllib.request.Request(B + path, data=json.dumps(body).encode() if body is not None else None, method=method,
                                 headers={"Authorization": "Bearer " + TOK, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def run(session, text):
    r = call("POST", f"/api/sessions/{session['id']}/messages", {"content": text})
    t0, tools, final, plan = time.time(), [], "", None
    req = urllib.request.Request(f"{B}/api/runs/{r['id']}/events?after=-1", headers={"Authorization": "Bearer " + TOK})
    with urllib.request.urlopen(req, timeout=1800) as resp:
        for raw in resp:
            line = raw.decode().strip()
            if not line.startswith("data:"):
                continue
            e = json.loads(line[5:])
            if e["type"] == "tool_call":
                a = e["args"]
                tools.append(f"{e['name']}({json.dumps(a)[:90]})")
            elif e["type"] == "todo":
                plan = [f"[{i['status']}] {i['text']}" for i in e["items"]]
            elif e["type"] == "message" and e["content"]:
                final = e["content"]
            elif e["type"] in ("done", "error", "stopped"):
                if e["type"] == "error":
                    final = "ERROR " + e.get("message", "")
                break
    return round(time.time() - t0), tools, plan, final


cases = [
    ("chat", None, "What is 17.5% of 2,340,000 rupees, and what is that amount plus 18% GST?"),
    ("chat", None, "Remind me to call mom next Friday."),
    ("agent", "eval-calc", "Create a small Python module calc.py with add(a, b) and divide(a, b) where dividing by zero raises "
                           "ValueError, write pytest tests for both in test_calc.py, and run the tests."),
]
made_sessions, made_ws = [], []
try:
    for mode, ws, prompt in cases:
        if ws:
            call("POST", "/api/workspaces", {"name": ws})
            made_ws.append(ws)
        s = call("POST", "/api/sessions", {"mode": mode, "workspace": ws, "approval": "auto"})
        made_sessions.append(s["id"])
        secs, tools, plan, final = run(s, prompt)
        print(f"\n=== {mode}: {prompt[:70]}")
        print(f"time: {secs}s   tools: {len(tools)}")
        for t in tools:
            print("  -", t)
        if plan:
            print("  plan:", *plan, sep="\n    ")
        print("  final:", final[:600].replace("\n", "\n         "))
    tasks = call("GET", "/api/tasks")
    print("\nopen tasks now:", [(t["id"], t["title"], t["due"]) for t in tasks])
finally:
    for sid in made_sessions:
        call("DELETE", f"/api/sessions/{sid}")
    for t in call("GET", "/api/tasks"):
        if "mom" in t["title"].lower():
            call("DELETE", f"/api/tasks/{t['id']}")
    for ws in made_ws:
        os.system(f"rm -r ~/reliquary/workspaces/{ws}")
    print("cleaned up")
