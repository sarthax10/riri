"""Client for llama.cpp's llama-server (OpenAI-compatible API, streaming)."""
import json
import time

import httpx


class LLM:
    def __init__(self, base_url):
        self.base = base_url.rstrip("/")
        # Prompt processing on this CPU can take many minutes, so reads never time out.
        self.client = httpx.AsyncClient(timeout=httpx.Timeout(connect=10, read=None, write=60, pool=None))
        self._props = None
        self._props_at = 0

    async def health(self):
        try:
            r = await self.client.get(self.base + "/health", timeout=5)
            return r.status_code == 200
        except Exception:
            return False

    async def props(self):
        if self._props and time.time() - self._props_at < 60:
            return self._props
        try:
            r = await self.client.get(self.base + "/props", timeout=5)
            p = r.json()
            gs = p.get("default_generation_settings", {})
            path = p.get("model_path", "") or ""
            self._props = {
                "model": path.rsplit("/", 1)[-1].removesuffix(".gguf") or "model",
                "n_ctx": gs.get("n_ctx") or p.get("n_ctx") or 0,
            }
            self._props_at = time.time()
        except Exception:
            return self._props or {"model": "offline", "n_ctx": 0}
        return self._props

    async def slot(self, action, filename):
        r = await self.client.post(f"{self.base}/slots/0?action={action}", json={"filename": filename}, timeout=120)
        r.raise_for_status()
        return r.json()

    async def stream(self, messages, tools=None, max_tokens=4096, temperature=0.6, effort=None):
        """Yields dicts: {type: progress|reasoning|content|tool_delta|done, ...}."""
        body = {"messages": messages, "stream": True, "max_tokens": max_tokens, "temperature": temperature,
                "cache_prompt": True, "return_progress": True}
        if tools:
            body["tools"] = tools
        if effort:
            body["chat_template_kwargs"] = {"reasoning_effort": effort}
            body["reasoning_effort"] = effort
        async with self.client.stream("POST", self.base + "/v1/chat/completions", json=body) as r:
            if r.status_code != 200:
                text = (await r.aread()).decode(errors="replace")
                raise RuntimeError(f"model server returned {r.status_code}: {text[:300]}")
            async for line in r.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    chunk = json.loads(data)
                except ValueError:
                    continue
                if "error" in chunk:
                    raise RuntimeError(str(chunk["error"])[:300])
                prog = chunk.get("prompt_progress")
                if prog:
                    yield {"type": "progress", "total": prog.get("total", 0), "cache": prog.get("cache", 0),
                           "processed": prog.get("processed", 0)}
                for ch in chunk.get("choices") or []:
                    d = ch.get("delta") or {}
                    if d.get("reasoning_content"):
                        yield {"type": "reasoning", "text": d["reasoning_content"]}
                    if d.get("content"):
                        yield {"type": "content", "text": d["content"]}
                    for tc in d.get("tool_calls") or []:
                        yield {"type": "tool_delta", "index": tc.get("index", 0), "id": tc.get("id"),
                               "name": (tc.get("function") or {}).get("name"),
                               "args": (tc.get("function") or {}).get("arguments")}
                if chunk.get("timings"):
                    t = chunk["timings"]
                    yield {"type": "timings", "prompt_n": t.get("prompt_n", 0), "cache_n": t.get("cache_n", 0),
                           "prompt_ms": t.get("prompt_ms", 0), "predicted_n": t.get("predicted_n", 0),
                           "predicted_ms": t.get("predicted_ms", 0),
                           "pp_tps": t.get("prompt_per_second", 0), "tg_tps": t.get("predicted_per_second", 0)}
