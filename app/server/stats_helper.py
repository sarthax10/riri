#!/usr/bin/env python3
"""RiRi's eyes on the machine: one JSON snapshot of the host (CPU, memory, sensors, storage, network, processes).

Installed by the app as ~/.local/share/riri/stats.py and run over SSH as the owner's user (no root needed).
CPU figures come from two readings 0.4 s apart, so per-core and per-process numbers are current, not averages
since boot. Byte counters (disk, network) are cumulative; the app turns consecutive snapshots into rates.
"""
import glob
import json
import os
import platform
import pwd
import socket
import time

TICK = os.sysconf("SC_CLK_TCK")


def read(p, default=""):
    try:
        with open(p) as f:
            return f.read().strip()
    except OSError:
        return default


def num(p, default=None, div=1):
    v = read(p)
    try:
        return int(v) / div
    except ValueError:
        return default


def cpu_times():
    out = {}
    for line in read("/proc/stat").splitlines():
        if line.startswith("cpu"):
            name, *vals = line.split()
            vals = list(map(int, vals[:8]))
            idle = vals[3] + vals[4]
            out[name] = (sum(vals), idle, vals[4])
    return out


def proc_times():
    out = {}
    for d in os.listdir("/proc"):
        if not d.isdigit():
            continue
        try:
            with open(f"/proc/{d}/stat") as f:
                s = f.read()
            r = s.rfind(")")
            fields = s[r + 2:].split()
            out[int(d)] = (int(fields[11]) + int(fields[12]), s[s.find("(") + 1:r], fields[0], int(fields[17]), int(fields[19]))
        except (OSError, ValueError, IndexError):
            pass
    return out


def main():
    t0, c0, p0 = time.time(), cpu_times(), proc_times()
    time.sleep(0.4)
    t1, c1, p1 = time.time(), cpu_times(), proc_times()
    dt = t1 - t0

    def pct(name):
        a, b = c0.get(name), c1.get(name)
        if not a or not b or b[0] == a[0]:
            return 0.0
        tot = b[0] - a[0]
        return round(100 * (1 - (b[1] - a[1]) / tot), 1)

    cores = sorted((k for k in c1 if k != "cpu"), key=lambda k: int(k[3:]))
    tot = c1["cpu"][0] - c0["cpu"][0] or 1
    iowait = round(100 * (c1["cpu"][2] - c0["cpu"][2]) / tot, 1)
    freqs = [round(num(f"/sys/devices/system/cpu/{c}/cpufreq/scaling_cur_freq", 0) / 1000) for c in cores]
    load = read("/proc/loadavg").split()

    mem = {}
    for line in read("/proc/meminfo").splitlines():
        k, v = line.split(":", 1)
        mem[k] = int(v.split()[0]) * 1024
    m = {"total": mem.get("MemTotal", 0), "available": mem.get("MemAvailable", 0), "free": mem.get("MemFree", 0),
         "cached": mem.get("Cached", 0) + mem.get("SReclaimable", 0) - mem.get("Shmem", 0), "buffers": mem.get("Buffers", 0),
         "swap_total": mem.get("SwapTotal", 0), "swap_used": mem.get("SwapTotal", 0) - mem.get("SwapFree", 0)}
    m["used"] = m["total"] - m["available"]

    # sensors: hwmon gives labelled readings (coretemp, nvme, wifi, dell_smm fans, battery)
    temps, fans = [], []
    pretty = {"coretemp": "CPU", "nvme": "SSD", "iwlwifi_1_5": "Wi-Fi", "dell_smm": "Board", "acpitz": "Board",
              "pch_cannonlake": "Chipset", "BAT0": "Battery"}
    for h in sorted(glob.glob("/sys/class/hwmon/hwmon*")):
        name = read(h + "/name")
        for t in sorted(glob.glob(h + "/temp*_input")):
            v = num(t, None, 1000)
            if v is None or v <= 0 or v > 125:
                continue
            label = read(t.replace("_input", "_label")) or pretty.get(name, name)
            if name == "coretemp" and label.startswith("Package"):
                label = "CPU package"
            elif name in pretty and not label.startswith(pretty[name]) and name != "coretemp":
                label = f"{pretty[name]} {label}".strip()
            temps.append({"name": label, "c": round(v, 1), "src": name,
                          "max": num(t.replace("_input", "_max"), None, 1000) or num(t.replace("_input", "_crit"), None, 1000)})
        for f in sorted(glob.glob(h + "/fan*_input")):
            rpm = num(f)
            if rpm is not None:
                fans.append({"name": read(f.replace("_input", "_label")) or "Fan", "rpm": int(rpm)})

    bat = None
    for b in glob.glob("/sys/class/power_supply/BAT*"):
        full, design = num(b + "/energy_full") or num(b + "/charge_full"), num(b + "/energy_full_design") or num(b + "/charge_full_design")
        power = num(b + "/power_now", None, 1e6)
        if power is None and num(b + "/current_now") is not None and num(b + "/voltage_now") is not None:
            power = num(b + "/current_now") * num(b + "/voltage_now") / 1e12
        bat = {"capacity": num(b + "/capacity"), "status": read(b + "/status"), "power_w": round(power, 1) if power else None,
               "health": round(100 * full / design) if full and design else None, "cycles": num(b + "/cycle_count")}
    ac = any(read(p + "/online") == "1" for p in glob.glob("/sys/class/power_supply/A*"))

    disks = []
    seen = set()
    for line in read("/proc/mounts").splitlines():
        dev, mnt, fs = line.split()[:3]
        if not dev.startswith("/dev/") or fs in ("squashfs", "efivarfs") or dev in seen:
            continue
        seen.add(dev)
        try:
            s = os.statvfs(mnt)
        except OSError:
            continue
        size = s.f_blocks * s.f_frsize
        if size < 64 * 2**20:
            continue
        disks.append({"mount": mnt, "fs": fs, "dev": dev.split("/")[-1], "size": size,
                      "used": (s.f_blocks - s.f_bfree) * s.f_frsize, "avail": s.f_bavail * s.f_frsize})
    rd = wr = 0
    for line in read("/proc/diskstats").splitlines():
        f = line.split()
        if len(f) > 9 and (f[2].startswith("nvme") and "p" not in f[2][4:] or f[2] in ("sda", "sdb", "vda", "mmcblk0")):
            rd += int(f[5]) * 512
            wr += int(f[9]) * 512
    model = read("/sys/block/nvme0n1/device/model") or read("/sys/block/sda/device/model")

    ifaces, rx, tx = [], 0, 0
    for i in sorted(os.listdir("/sys/class/net")):
        if i == "lo" or i.startswith(("veth", "br-", "docker")):
            continue
        r, t = num(f"/sys/class/net/{i}/statistics/rx_bytes", 0), num(f"/sys/class/net/{i}/statistics/tx_bytes", 0)
        up = read(f"/sys/class/net/{i}/operstate") == "up"
        if up:
            rx += r
            tx += t
        speed = num(f"/sys/class/net/{i}/speed")
        ifaces.append({"name": i, "up": up, "rx": r, "tx": t, "wifi": os.path.isdir(f"/sys/class/net/{i}/wireless"),
                       "speed": speed if speed and speed > 0 else None})
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("192.0.2.1", 9))
        lan_ip = s.getsockname()[0]
        s.close()
    except OSError:
        lan_ip = None

    # processes: CPU from the same 0.4 s window; memory from RSS
    page = os.sysconf("SC_PAGE_SIZE")
    boot = time.time() - float(read("/proc/uptime").split()[0])
    users = {}
    procs = []
    for pid, (t, name, state, threads, start) in p1.items():
        prev = p0.get(pid)
        cpu = 100 * (t - prev[0]) / TICK / dt if prev else 0.0
        try:
            rss = int(read(f"/proc/{pid}/statm").split()[1]) * page
            uid = os.stat(f"/proc/{pid}").st_uid
        except (ValueError, IndexError, OSError):
            continue
        if uid not in users:
            try:
                users[uid] = pwd.getpwuid(uid).pw_name
            except KeyError:
                users[uid] = str(uid)
        procs.append({"pid": pid, "name": name, "user": users[uid], "cpu": round(cpu, 1), "rss": rss, "threads": threads,
                      "state": state, "age": round(time.time() - (boot + start / TICK))})
    running = sum(1 for p in procs if p["state"] == "R")
    user_procs = [p for p in procs if p["rss"] > 0]
    top_cpu = sorted(user_procs, key=lambda p: (-p["cpu"], -p["rss"]))[:12]
    top_mem = sorted(procs, key=lambda p: -p["rss"])[:12]
    for p in top_cpu + top_mem:   # a readable command line for the top ones
        cmd = read(f"/proc/{p['pid']}/cmdline").replace("\0", " ").strip()
        p["cmd"] = cmd[:160] if cmd else f"[{p['name']}]"

    # the model server: is it all in RAM? (swapped weights are what make replies crawl)
    model_proc = None
    for p in top_mem:
        if p["name"] == "llama-server":
            st = {}
            for line in read(f"/proc/{p['pid']}/status").splitlines():
                k, _, v = line.partition(":")
                if k in ("VmRSS", "VmSwap", "VmLck"):
                    st[k] = int(v.split()[0]) * 1024
            model_proc = {"pid": p["pid"], "cpu": next((q["cpu"] for q in top_cpu if q["pid"] == p["pid"]), 0.0),
                          "rss": st.get("VmRSS", 0), "swap": st.get("VmSwap", 0), "locked": st.get("VmLck", 0)}
            break

    gpu = None
    for card in glob.glob("/sys/class/drm/card*/gt_cur_freq_mhz"):
        d = os.path.dirname(card)
        gpu = {"freq": num(card), "max": num(d + "/gt_max_freq_mhz") or num(d + "/gt_RP0_freq_mhz")}
        break

    os_name = "Linux"
    for line in read("/etc/os-release").splitlines():
        if line.startswith("PRETTY_NAME="):
            os_name = line.split("=", 1)[1].strip('"')
    cpu_model = next((l.split(":", 1)[1].strip() for l in read("/proc/cpuinfo").splitlines() if l.startswith("model name")), "")
    print(json.dumps({
        "t": round(t1, 2),
        "host": {"hostname": socket.gethostname(), "os": os_name, "kernel": platform.release(), "uptime": round(time.time() - boot),
                 "machine": " ".join(x for x in (read("/sys/class/dmi/id/sys_vendor"), read("/sys/class/dmi/id/product_name")) if x),
                 "cpu_model": cpu_model, "threads": len(cores), "lan_ip": lan_ip},
        "cpu": {"total": pct("cpu"), "cores": [pct(c) for c in cores], "freq": freqs, "iowait": iowait,
                "load": [float(x) for x in load[:3]], "running": running, "procs": len(procs),
                "max_freq": round((num("/sys/devices/system/cpu/cpu0/cpufreq/cpuinfo_max_freq", 0) or 0) / 1000)},
        "mem": m, "temps": temps, "fans": fans, "battery": bat, "ac": ac,
        "disks": disks, "io": {"read": rd, "write": wr, "model": model},
        "net": {"rx": rx, "tx": tx, "ifaces": ifaces, "lan_ip": lan_ip},
        "gpu": gpu, "top_cpu": top_cpu, "top_mem": top_mem, "model_proc": model_proc,
    }))


def device():
    """What the machine is made of (read once; nothing here changes while it runs). No root needed."""
    import subprocess

    def run(*cmd):
        try:
            return subprocess.run(cmd, capture_output=True, text=True, timeout=10).stdout
        except (OSError, subprocess.TimeoutExpired):
            return ""
    info = read("/proc/cpuinfo")
    first = info.split("\n\n")[0]
    field = lambda k: next((l.split(":", 1)[1].strip() for l in first.splitlines() if l.startswith(k)), "")
    cores = {(l.split(":")[1].strip()) for l in info.splitlines() if l.startswith("core id")}
    threads = sum(1 for l in info.splitlines() if l.startswith("processor"))
    caches = {}
    for idx in glob.glob("/sys/devices/system/cpu/cpu*/cache/index*"):
        lvl, typ, size, shared = read(idx + "/level"), read(idx + "/type"), read(idx + "/size"), read(idx + "/shared_cpu_list")
        if typ == "Instruction":
            continue
        caches.setdefault(f"L{lvl}", {})[shared] = size
    def to_kb(s):   # "48K", "1280K", "5M"
        s = s.strip()
        return int(s[:-1]) * (1024 if s[-1] == "M" else 1) if s[:-1].isdigit() else 0

    def cache_total(lvl):   # one entry per distinct sharing group, so a shared L3 counts once
        kb = sum(to_kb(s) for s in caches.get(lvl, {}).values())
        return (f"{kb / 1024:g} MB" if kb >= 1024 else f"{kb} KB") if kb else ""
    flags = field("flags").split()
    pci = run("lspci")
    def pci_line(*keys):   # the first key that matches anything wins (so NVMe beats SATA)
        for k in keys:
            for l in pci.splitlines():
                if k in l.lower():
                    return l.split(": ", 1)[1]
        return ""
    disks = []
    for b in sorted(glob.glob("/sys/block/*")):
        name = os.path.basename(b)
        if name.startswith(("loop", "ram", "zram", "dm-")):
            continue
        size = num(b + "/size", 0) * 512
        disks.append({"name": name, "model": read(b + "/device/model").strip(), "size": size, "firmware": read(b + "/device/firmware_rev").strip(),
                      "rotational": read(b + "/queue/rotational") == "1", "transport": "NVMe" if name.startswith("nvme") else "SATA/USB"})
    displays = []
    for c in sorted(glob.glob("/sys/class/drm/card*-*")):
        if read(c + "/status") == "connected":
            displays.append({"port": c.split("-", 1)[1], "mode": (read(c + "/modes").splitlines() or [""])[0]})
    bat = None
    for b in glob.glob("/sys/class/power_supply/BAT*"):
        energy = num(b + "/energy_full_design") is not None   # some batteries report energy (Wh), others charge (Ah)
        design = num(b + "/energy_full_design") if energy else num(b + "/charge_full_design")
        full = num(b + "/energy_full") if energy else num(b + "/charge_full")
        bat = {"model": read(b + "/model_name"), "maker": read(b + "/manufacturer"), "tech": read(b + "/technology"),
               "unit": "Wh" if energy else "Ah", "design": round(design / 1e6, 2) if design else None,
               "full": round(full / 1e6, 2) if full else None, "health": round(100 * full / design) if full and design else None}
    mem_total = int(read("/proc/meminfo").splitlines()[0].split()[1]) * 1024
    os_name = next((l.split("=", 1)[1].strip('"') for l in read("/etc/os-release").splitlines() if l.startswith("PRETTY_NAME=")), "Linux")
    dmi = lambda k: read(f"/sys/class/dmi/id/{k}")
    print(json.dumps({
        "cpu": {"model": field("model name"), "vendor": field("vendor_id"), "cores": len(cores) or threads, "threads": threads,
                "max_mhz": round(num("/sys/devices/system/cpu/cpu0/cpufreq/cpuinfo_max_freq", 0) / 1000),
                "min_mhz": round(num("/sys/devices/system/cpu/cpu0/cpufreq/cpuinfo_min_freq", 0) / 1000),
                "l2": cache_total("L2"), "l3": cache_total("L3"), "arch": platform.machine(),
                "features": [f for f in ("avx2", "avx512f", "avx512_vnni", "aes", "sha_ni", "vmx") if f in flags]},
        "memory": {"total": mem_total, "swap": int(next((l.split()[1] for l in read("/proc/meminfo").splitlines() if l.startswith("SwapTotal")), 0)) * 1024},
        "storage": disks, "storage_controller": pci_line("non-volatile", "sata controller"),
        "gpu": pci_line("vga", "3d controller", "display controller"), "wifi": pci_line("network controller"),
        "ethernet": pci_line("ethernet controller"), "audio": pci_line("audio"), "displays": displays, "battery": bat,
        "board": {"vendor": dmi("sys_vendor"), "product": dmi("product_name"), "family": dmi("product_family"), "board": dmi("board_name"),
                  "bios": f"{dmi('bios_vendor')} {dmi('bios_version')}".strip(), "bios_date": dmi("bios_date")},
        "system": {"os": os_name, "kernel": platform.release(), "hostname": socket.gethostname(),
                   "docker": run("docker", "version", "--format", "{{.Server.Version}}").strip(), "python": platform.python_version()},
    }))


def storage():
    """What is filling the main disk: Docker, your home folder (two levels deep), the system, and what's free.
    Slow-ish (it walks the disk), so the app runs it rarely and at the lowest CPU and disk priority."""
    import re
    import subprocess

    t0 = time.time()

    def run(cmd, timeout=150):
        try:
            return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout).stdout
        except (OSError, subprocess.TimeoutExpired):
            return ""

    def size_of(txt):          # docker's "12.3GB", "512MB", "1.2kB", "0B"
        m = re.match(r"([\d.]+)\s*([kKMGTP]?)B", (txt or "").strip())
        return int(float(m.group(1)) * {"": 1, "k": 1e3, "K": 1e3, "M": 1e6, "G": 1e9, "T": 1e12, "P": 1e15}[m.group(2)]) if m else 0

    def du(paths, depth=0):
        paths = [p for p in paths if os.path.exists(p)]
        if not paths:
            return []
        out = run(["nice", "-n", "19", "ionice", "-c", "3", "du", "-xb", f"--max-depth={depth}", *paths])
        rows = []
        for line in out.splitlines():
            n, _, p = line.partition("\t")
            if n.isdigit():
                rows.append((p, int(n)))
        return rows

    s = os.statvfs("/")
    root = {"size": s.f_blocks * s.f_frsize, "used": (s.f_blocks - s.f_bfree) * s.f_frsize, "avail": s.f_bavail * s.f_frsize}

    docker = []
    for line in run(["docker", "system", "df", "--format", "{{json .}}"], timeout=60).splitlines():
        try:
            j = json.loads(line)
        except ValueError:
            continue
        docker.append({"type": j.get("Type"), "size": size_of(j.get("Size")), "reclaimable": size_of((j.get("Reclaimable") or "").split(" (")[0]),
                       "count": int(j.get("TotalCount") or 0), "active": int(j.get("Active") or 0)})

    home = os.path.expanduser("~")
    rows = du([home], depth=2)
    home_total = next((n for p, n in rows if p == home), 0)
    items = [{"path": p[len(home) + 1:], "size": n} for p, n in rows if p != home and n >= 50 * 2**20]
    items.sort(key=lambda x: -x["size"])

    system = []
    for name, paths in [("Programs (/usr, /opt, /snap)", ["/usr", "/opt", "/snap"]), ("Logs & caches", ["/var/log", "/var/cache", "/var/tmp"]),
                        ("Boot", ["/boot"])]:
        n = sum(x for _, x in du(paths))
        if n:
            system.append({"name": name, "size": n})
    for swap in ("/swap.img", "/swapfile"):
        try:
            system.append({"name": "Swap file", "size": os.stat(swap).st_blocks * 512})
        except OSError:
            pass

    print(json.dumps({"t": time.time(), "took": round(time.time() - t0, 1), "root": root, "home": home, "home_total": home_total,
                      "home_items": items[:40], "docker": docker, "system": system}))


if __name__ == "__main__":
    import sys
    device() if "--device" in sys.argv else storage() if "--storage" in sys.argv else main()
