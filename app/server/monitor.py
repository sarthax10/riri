"""The Server page's data: live snapshots of the host, turned into rates and kept as history.

A helper on the host (stats_helper.py, run over SSH) returns one JSON snapshot. Here we:
- sample every 3 s while someone has the Server page open (any request in the last 20 s), otherwise once a minute,
  so an idle machine isn't polled for nobody;
- turn cumulative counters (network, disk) into bytes per second;
- keep two histories: 3-second points for the last ~20 minutes, and 1-minute points for 24 hours;
- refresh Docker container stats every 15 s while watched (docker stats takes ~2 s, so never per request).
"""
import asyncio
import collections
import json
import time

FAST, SLOW, WATCH = 3, 60, 20


class Monitor:
    def __init__(self, host):
        self.host = host
        self.snap = None
        self.prev = None
        self.fine = collections.deque(maxlen=420)     # ~21 min at 3 s
        self.coarse = collections.deque(maxlen=1440)  # 24 h at 1 min
        self.last_coarse = 0
        self.watched_until = 0
        self.device, self.device_at = None, 0
        self.storage, self.storage_at, self.s_busy = None, 0, False
        self.containers = []
        self.containers_at = 0
        self.error = None
        self.wake = None

    def watch(self):
        was_idle = time.time() > self.watched_until
        self.watched_until = time.time() + WATCH
        if was_idle and self.wake:
            self.wake.set()   # someone just opened the page: sample now, not in a minute

    async def sample(self):
        r = await self.host.exec("python3 ~/.local/share/riri/stats.py", timeout=20)
        try:
            s = json.loads((r.get("output") or "").strip().splitlines()[-1])
        except (ValueError, IndexError):
            self.error = (r.get("output") or "no answer")[-300:]
            return
        self.error = None
        p = self.snap
        rates = {"rx": 0.0, "tx": 0.0, "rd": 0.0, "wr": 0.0}
        if p:
            dt = max(0.5, s["t"] - p["t"])
            rates = {"rx": max(0, s["net"]["rx"] - p["net"]["rx"]) / dt, "tx": max(0, s["net"]["tx"] - p["net"]["tx"]) / dt,
                     "rd": max(0, s["io"]["read"] - p["io"]["read"]) / dt, "wr": max(0, s["io"]["write"] - p["io"]["write"]) / dt}
        s["rates"] = rates
        cpu_temp = next((t["c"] for t in s["temps"] if t["name"] == "CPU package"), None) or max((t["c"] for t in s["temps"]), default=None)
        point = {"t": s["t"], "cpu": s["cpu"]["total"], "mem": round(100 * s["mem"]["used"] / max(1, s["mem"]["total"]), 1),
                 "temp": cpu_temp, "rx": round(rates["rx"]), "tx": round(rates["tx"]), "rd": round(rates["rd"]), "wr": round(rates["wr"]),
                 "swap": s["mem"]["swap_used"]}
        self.prev, self.snap = p, s
        self.fine.append(point)
        if s["t"] - self.last_coarse >= 55:
            self.coarse.append(point)
            self.last_coarse = s["t"]

    async def refresh_containers(self):
        if getattr(self, "c_busy", False):
            return
        self.c_busy = True
        try:
            await self._containers()
        finally:
            self.c_busy = False

    async def _containers(self):
        r = await self.host.exec("docker ps -a --format '{{json .}}'; echo '<<STATS>>'; docker stats --no-stream --format '{{json .}}'", timeout=30)
        out = r.get("output") or ""
        ps, _, st = out.partition("<<STATS>>")
        stats = {}
        for line in st.splitlines():
            try:
                j = json.loads(line)
                stats[j["Name"]] = j
            except ValueError:
                pass
        rows = []
        for line in ps.splitlines():
            try:
                j = json.loads(line)
            except ValueError:
                continue
            x = stats.get(j.get("Names"), {})
            mem_use = (x.get("MemUsage") or "").split(" / ")
            rows.append({"name": j.get("Names"), "image": j.get("Image"), "status": j.get("Status"), "state": j.get("State"),
                         "ports": j.get("Ports"), "cpu": float((x.get("CPUPerc") or "0%").rstrip("%") or 0),
                         "mem": mem_use[0] if mem_use[0] else None, "mem_limit": mem_use[1] if len(mem_use) > 1 else None,
                         "mem_pct": float((x.get("MemPerc") or "0%").rstrip("%") or 0), "pids": x.get("PIDs")})
        rows.sort(key=lambda c: (c["state"] != "running", -c["cpu"]))
        self.containers, self.containers_at = rows, time.time()

    async def read_device(self):
        r = await self.host.exec("python3 ~/.local/share/riri/stats.py --device", timeout=30)
        try:
            self.device = json.loads((r.get("output") or "").strip().splitlines()[-1])
            self.device_at = time.time()
        except (ValueError, IndexError):
            pass

    async def read_storage(self):
        """Walks the disk (du), so: rarely, never twice at once, and never blocking the 3-second samples."""
        if self.s_busy:
            return
        self.s_busy, self.storage_at = True, time.time()   # counts as tried even if it fails: no retry storm
        try:
            r = await self.host.exec("python3 ~/.local/share/riri/stats.py --storage", timeout=200)
            self.storage = json.loads((r.get("output") or "").strip().splitlines()[-1])
        except (ValueError, IndexError):
            pass
        finally:
            self.s_busy = False

    async def loop(self):
        self.wake = asyncio.Event()
        self.device, self.device_at = getattr(self, "device", None), 0
        while True:
            watched = time.time() < self.watched_until
            try:
                if time.time() - self.device_at > 3600:
                    await self.read_device()
                await self.sample()
                if watched and time.time() - self.storage_at > 1800:
                    asyncio.create_task(self.read_storage())
                if watched and time.time() - self.containers_at > 15:
                    asyncio.create_task(self.refresh_containers())
            except Exception as e:   # never let a bad sample stop the loop
                self.error = repr(e)[:300]
            self.wake.clear()
            try:
                await asyncio.wait_for(self.wake.wait(), timeout=FAST if watched else SLOW)
            except asyncio.TimeoutError:
                pass

    def view(self, since=0.0):
        self.watch()
        return {"now": self.snap, "device": getattr(self, "device", None) if not since else None, "fine": [p for p in self.fine if p["t"] > since],
                "coarse": list(self.coarse) if not since else [], "containers": self.containers, "error": self.error,
                "storage": self.storage, "storage_busy": self.s_busy}
