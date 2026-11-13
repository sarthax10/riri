#!/usr/bin/env python3
"""Phase 0 benchmark for reliquary: speed, prompt-cache reuse and tool calling, per model.

Starts llama-server in Docker for each model, measures it through the OpenAI-compatible API,
and writes one JSON line per test to ~/llm/logs/bench.jsonl plus a readable summary.
Usage: python3 bench.py gpt-oss-20b-Q4_K_M.gguf [more.gguf ...]   (files in ~/llm/models)
"""
import json, os, subprocess, sys, time, urllib.request

IMAGE = "ghcr.io/ggml-org/llama.cpp:server"
MODELS = os.path.expanduser("~/llm/models")
LOG = os.path.expanduser("~/llm/logs/bench.jsonl")
PORT = 8089
BASE = f"http://127.0.0.1:{PORT}"


def post(path, body, timeout=3600):
    req = urllib.request.Request(BASE + path, json.dumps(body).encode(), {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def start(model, threads, ctx=16384):
    subprocess.run(["docker", "rm", "-f", "rq-bench"], capture_output=True)
    cmd = ["docker", "run", "-d", "--name", "rq-bench", "-p", f"127.0.0.1:{PORT}:8080",
           "-v", f"{MODELS}:/models:ro", IMAGE, "-m", f"/models/{model}", "--host", "0.0.0.0",
           "--port", "8080", "-c", str(ctx), "-np", "1", "-t", str(threads), "-tb", str(threads),
           "-fa", "on", "--cache-reuse", "256", "--no-webui"]
    subprocess.run(cmd, check=True, capture_output=True)
    t0 = time.time()
    while time.time() - t0 < 600:
        try:
            with urllib.request.urlopen(BASE + "/health", timeout=5) as r:
                if r.status == 200:
                    return time.time() - t0
        except Exception:
            pass
        time.sleep(2)
    raise RuntimeError("server did not become healthy")


def stop():
    subprocess.run(["docker", "rm", "-f", "rq-bench"], capture_output=True)


def record(entry):
    with open(LOG, "a") as f:
        f.write(json.dumps(entry) + "\n")
    print(json.dumps(entry), flush=True)


# A ~3k-token prompt made of real-looking code, so tokenization is representative.
CODE = open("/usr/lib/python3.14/json/decoder.py").read() + open("/usr/lib/python3.14/json/encoder.py").read()
CODE = CODE[:11000]


def speed_test(model, threads):
    msgs = [{"role": "user", "content": "Read this code, then summarise what it does in one paragraph.\n\n" + CODE}]
    r1 = post("/v1/chat/completions", {"messages": msgs, "max_tokens": 128, "temperature": 0})
    t1 = r1["timings"]
    # Same conversation plus a follow-up: the prefix should come from the cache.
    msgs2 = msgs + [{"role": "assistant", "content": r1["choices"][0]["message"].get("content") or ""},
                    {"role": "user", "content": "Now list two possible bugs, briefly."}]
    r2 = post("/v1/chat/completions", {"messages": msgs2, "max_tokens": 64, "temperature": 0})
    t2 = r2["timings"]
    record({"model": model, "threads": threads, "test": "speed",
            "prompt_tokens": t1["prompt_n"], "pp_tps": round(t1["prompt_per_second"], 2),
            "tg_tps": round(t1["predicted_per_second"], 2), "gen_tokens": t1["predicted_n"],
            "followup_prompt_new": t2["prompt_n"], "followup_cached": t2.get("cache_n"),
            "followup_pp_seconds": round(t2["prompt_ms"] / 1000, 1)})


TOOLS = [
    {"type": "function", "function": {"name": "list_files", "description": "List files in a directory of the workspace.",
      "parameters": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}}},
    {"type": "function", "function": {"name": "read_file", "description": "Read a text file from the workspace.",
      "parameters": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}}},
    {"type": "function", "function": {"name": "edit_file", "description": "Replace an exact snippet in a file with new text.",
      "parameters": {"type": "object", "properties": {"path": {"type": "string"}, "old": {"type": "string"}, "new": {"type": "string"}},
                     "required": ["path", "old", "new"]}}},
    {"type": "function", "function": {"name": "run", "description": "Run a shell command in the workspace and return its output.",
      "parameters": {"type": "object", "properties": {"command": {"type": "string"}}, "required": ["command"]}}},
]

FS = {
    ".": "app.py\nconfig.py\nstats.py\ntest_stats.py",
    "config.py": "HOST = '0.0.0.0'\nPORT = 8417\nDEBUG = False\n",
    "stats.py": "def mean(xs):\n    total = 0\n    for i in range(len(xs) - 1):\n        total += xs[i]\n    return total / len(xs)\n",
    "test_stats.py": "from stats import mean\n\ndef test_mean():\n    assert mean([1, 2, 3]) == 2\n",
}

TASKS = [
    ("port", "Which port does this project listen on? Look it up in the files, then answer with just the number.",
     lambda calls, final: "8417" in (final or "")),
    ("fix", "stats.py has a bug in mean(). Find it and fix it with edit_file. Do not rewrite the whole file.",
     lambda calls, final: any(c[0] == "edit_file" and ("range(len(xs))" in c[1].get("new", "") or "sum(" in c[1].get("new", ""))
                              for c in calls)),
    ("test", "Run the test suite and tell me whether it passes.",
     lambda calls, final: any(c[0] == "run" and "pytest" in c[1].get("command", "") for c in calls)),
]


def fake_tool(name, args):
    if name == "list_files":
        return FS["."]
    if name == "read_file":
        return FS.get(os.path.basename(args.get("path", "")), "error: no such file")
    if name == "edit_file":
        return "ok: 1 replacement made"
    if name == "run":
        cmd = args.get("command", "")
        if "pytest" in cmd:
            return "F\nFAILED test_stats.py::test_mean - assert 1.0 == 2\n1 failed in 0.02s"
        return "(no output)"
    return "error: unknown tool"


def agent_task(model, key, prompt, check):
    msgs = [{"role": "system", "content": "You are a coding agent working in a small Python project. Use the tools to inspect and change files. Be brief."},
            {"role": "user", "content": prompt}]
    calls, final, steps, bad = [], None, 0, 0
    t0 = time.time()
    for steps in range(1, 7):
        r = post("/v1/chat/completions", {"messages": msgs, "tools": TOOLS, "max_tokens": 600, "temperature": 0.2})
        m = r["choices"][0]["message"]
        tcs = m.get("tool_calls") or []
        if not tcs:
            final = m.get("content")
            break
        msgs.append({"role": "assistant", "content": m.get("content") or "", "tool_calls": tcs})
        for tc in tcs:
            try:
                args = json.loads(tc["function"]["arguments"] or "{}")
            except Exception:
                args, bad = {}, bad + 1
            calls.append((tc["function"]["name"], args))
            msgs.append({"role": "tool", "tool_call_id": tc.get("id", ""), "content": fake_tool(tc["function"]["name"], args)})
    record({"model": model, "test": "agent", "task": key, "passed": bool(check(calls, final)), "steps": steps,
            "bad_json": bad, "seconds": round(time.time() - t0), "calls": [c[0] for c in calls],
            "final": (final or "")[:160]})


def main():
    for i, model in enumerate(sys.argv[1:]):
        thread_options = [4, 8] if i == 0 else [4]
        try:
            for th in thread_options:
                load = start(model, th)
                record({"model": model, "threads": th, "test": "load", "seconds": round(load, 1)})
                speed_test(model, th)
            for key, prompt, check in TASKS:
                agent_task(model, key, prompt, check)
        except Exception as e:
            record({"model": model, "test": "error", "error": repr(e)[:300]})
        finally:
            stop()
    print("BENCH_DONE", flush=True)


if __name__ == "__main__":
    main()
