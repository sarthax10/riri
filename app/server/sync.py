"""Live sync across devices and tabs.

The pattern production apps use (Linear's sync IDs, resumable SSE streams): every change on the server becomes a
small numbered event on one channel; each open tab holds one Server-Sent Events connection to it.

- Events are invalidations ("the session list changed", "session X changed", "a reply started in session X"), not
  data. Clients refetch what they show. Idempotent, so a client seeing its own change again is harmless.
- Every event has an id "<epoch>:<seq>". On reconnect the browser sends Last-Event-ID; the hub replays what was
  missed from a ring buffer. If the client is too far behind, or the server restarted (new epoch), it gets one
  "resync" event and refetches everything: never a silent gap.
- Heartbeats keep proxies and phones from closing an idle connection; `retry:` tells browsers how soon to reconnect.
"""
import asyncio
import collections
import json
import time
import uuid


class Hub:
    def __init__(self, keep=1000):
        self.epoch = uuid.uuid4().hex[:8]
        self.seq = 0
        self.buf = collections.deque(maxlen=keep)
        self.cond = None   # created lazily inside the running event loop
        self.clients = 0

    def publish(self, type_, **data):
        self.seq += 1
        ev = {**data, "id": f"{self.epoch}:{self.seq}", "seq": self.seq, "type": type_, "t": round(time.time(), 3)}
        self.buf.append(ev)
        if self.cond is not None:
            try:
                asyncio.get_running_loop().create_task(self._wake())
            except RuntimeError:
                pass
        return ev

    async def _wake(self):
        async with self.cond:
            self.cond.notify_all()

    def since(self, cursor):
        """Events after a cursor, or None when the client must resync."""
        if not cursor:
            return []
        try:
            epoch, seq = cursor.split(":")
            seq = int(seq)
        except ValueError:
            return None
        if epoch != self.epoch:
            return None
        if self.buf and seq < self.buf[0]["seq"] - 1:
            return None
        return [e for e in self.buf if e["seq"] > seq]

    async def stream(self, request, cursor):
        if self.cond is None:
            self.cond = asyncio.Condition()
        self.clients += 1
        try:
            yield "retry: 3000\n\n"
            missed = self.since(cursor)
            if missed is None:
                yield f"id: {self.epoch}:{self.seq}\nevent: resync\ndata: {{}}\n\n"
                missed = []
            else:
                yield f"event: hello\ndata: {json.dumps({'id': f'{self.epoch}:{self.seq}'})}\n\n"
            last = self.seq
            for e in missed:
                yield f"id: {e['id']}\ndata: {json.dumps(e)}\n\n"
                last = e["seq"]
            while True:
                if await request.is_disconnected():
                    return
                if self.seq == last:   # nothing new since we last sent: wait for the next event (or ping)
                    async with self.cond:
                        try:
                            await asyncio.wait_for(self.cond.wait(), timeout=20)
                        except asyncio.TimeoutError:
                            pass
                    if self.seq == last:
                        yield ": ping\n\n"
                        continue
                for e in [e for e in self.buf if e["seq"] > last]:
                    yield f"id: {e['id']}\ndata: {json.dumps(e)}\n\n"
                    last = e["seq"]
        finally:
            self.clients -= 1
