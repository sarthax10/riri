/* The Server page: the machine at a glance, then trends, then detail.
   Built once, then each tile updates in place every 3 s (hand-made SVG, no chart library). Uses app.js helpers. */
"use strict";

const SRV = { timer: 0, hist: [], coarse: [], lastT: 0, range: "15m", metric: "cpu", sort: "cpu", data: null, hover: null };
const KB = 1024, MB = KB * 1024, GB = MB * 1024;
const fmtB = (n) => (n == null ? "–" : n >= GB ? (n / GB).toFixed(n >= 100 * GB ? 0 : 1) + " GB" : n >= MB ? (n / MB).toFixed(n >= 100 * MB ? 0 : 1) + " MB" : n >= KB ? Math.round(n / KB) + " KB" : Math.round(n) + " B");
const fmtR = (n) => fmtB(n) + "/s";
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
function upFor(sec) {
  sec = Math.round(sec); const d = Math.floor(sec / 86400), hh = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return d ? `${d}d ${hh}h` : hh ? `${hh}h ${m}m` : `${m}m`;
}
const level = (v, warn, bad) => (v >= bad ? "bad" : v >= warn ? "warn" : "ok");

// ------------------------------------------------------------------ small SVG instruments
function tickDial(frac, cls = "on", n = 41) {          // a 220° arc of ticks, lit up to frac
  const cx = 110, cy = 104, r1 = 78, r2 = 96, a0 = 160, a1 = 380;
  let s = "";
  for (let i = 0; i < n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / (n - 1)) * Math.PI) / 180, long = i % 5 === 0;
    const x1 = cx + Math.cos(a) * (long ? r1 - 6 : r1), y1 = cy + Math.sin(a) * (long ? r1 - 6 : r1);
    const x2 = cx + Math.cos(a) * r2, y2 = cy + Math.sin(a) * r2;
    s += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="tk ${i / (n - 1) <= frac + 0.001 && frac > 0 ? cls : ""}"/>`;
  }
  const na = ((a0 + (a1 - a0) * clamp(frac)) * Math.PI) / 180;
  s += `<line class="needle" x1="${cx}" y1="${cy}" x2="${(cx + Math.cos(na) * 64).toFixed(1)}" y2="${(cy + Math.sin(na) * 64).toFixed(1)}"/><circle class="hub" cx="${cx}" cy="${cy}" r="4"/>`;
  return `<svg class="dial" viewBox="0 0 220 130" aria-hidden="true">${s}</svg>`;
}
function tickBar(parts, n = 48) {                          // parts: [{f: fraction, c: class}] stacked left to right
  let s = "", i = 0;
  const w = 300 / n;
  const bounds = []; let acc = 0;
  for (const p of parts) { acc += p.f; bounds.push([acc, p.c]); }
  for (; i < n; i++) {
    const mid = (i + 0.5) / n, b = bounds.find(([edge]) => mid <= edge);
    s += `<rect x="${(i * w).toFixed(2)}" y="0" width="${(w - 2.2).toFixed(2)}" height="26" rx="1.5" class="tk ${b ? b[1] : ""}"/>`;
  }
  return `<svg class="tickbar" viewBox="0 0 300 26" preserveAspectRatio="none" aria-hidden="true">${s}</svg>`;
}
function bullet(v, max, warn, bad, unit) {               // Stephen Few's bullet graph: zones, bar, marker
  const x = (n) => (clamp(n / max) * 100).toFixed(2);
  return `<div class="bullet" role="img" aria-label="${v}${unit} of ${max}${unit}">
    <i class="z z-ok" style="width:${x(warn)}%"></i><i class="z z-warn" style="left:${x(warn)}%;width:${(x(bad) - x(warn)).toFixed(2)}%"></i><i class="z z-bad" style="left:${x(bad)}%;right:0"></i>
    <b class="bar ${level(v, warn, bad)}" style="width:${x(v)}%"></b></div>`;
}
function spark(points, keys, opts = {}) {                  // tiny area/line chart of recent history
  const w = 300, hgt = opts.h || 44, pts = points.slice(-(opts.n || 200));
  if (pts.length < 2) return `<svg class="spark" viewBox="0 0 ${w} ${hgt}" preserveAspectRatio="none"></svg>`;
  const max = opts.max || Math.max(1, ...pts.flatMap((p) => keys.map((k) => p[k] || 0))) * 1.15;
  const X = (i) => (i / (pts.length - 1)) * w, Y = (v) => hgt - 2 - (clamp((v || 0) / max) * (hgt - 4));
  return `<svg class="spark" viewBox="0 0 ${w} ${hgt}" preserveAspectRatio="none" aria-hidden="true">${keys.map((k, ki) => {
    const line = pts.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(p[k]).toFixed(1)}`).join("");
    return `${ki === 0 ? `<path class="sp-area" d="${line}L${w} ${hgt}L0 ${hgt}Z"/>` : ""}<path class="sp-line s${ki}" d="${line}"/>`;
  }).join("")}</svg>`;
}
function ring(frac, cls) {
  const r = 34, c = 2 * Math.PI * r;
  return `<svg class="ring2" viewBox="0 0 84 84" aria-hidden="true"><circle cx="42" cy="42" r="${r}" class="rg-track"/>
    <circle cx="42" cy="42" r="${r}" class="rg-val ${cls}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - clamp(frac))).toFixed(1)}"/></svg>`;
}

// ------------------------------------------------------------------ the page
const TILE_TAB = { "tv-proc": "procs", "tv-ctr": "ctr", "tv-sens": "sens", "tv-pow": "sens", "tv-dev": "dev", "tv-du": "store" };
const TILE = (n, id, label, span, body) => `<article class="tile ${span}" id="${id}" data-tab="${TILE_TAB[id] || "overview"}"><header class="tile-h"><span class="tile-n">${n}</span><span class="tile-l">${label}</span><i class="tile-dot"></i></header>${body}</article>`;
async function renderServer() {
  S.view = "server"; setNav("server");
  clearTimeout(SRV.timer);
  const stage = $("#stage");
  stage.innerHTML = `<div class="page srv">
    <header class="srv-head">
      <div class="srv-title"><p class="srv-kicker"><i class="srv-live"></i><span id="sv-live">Connecting…</span></p>
        <h1 id="sv-status">Reading the machine</h1><p class="srv-sub" id="sv-sub"></p></div>
      <details class="srv-hostbox" open><summary>Machine details</summary><dl class="srv-host" id="sv-host"></dl></details>
    </header>
    <div class="seg srv-tabs" role="tablist" aria-label="Sections">
      <button role="tab" data-tab="overview">Overview</button><button role="tab" data-tab="procs">Processes</button>
      <button role="tab" data-tab="store">Storage</button><button role="tab" data-tab="ctr">Docker</button><button role="tab" data-tab="sens">Sensors</button><button role="tab" data-tab="dev">Device</button></div>
    <section class="srv-grid">
      ${TILE("01", "tv-cpu", "Processor", "s3", `<div class="tile-v"><b id="cpu-v">–</b><small>%</small></div><div class="viz" id="cpu-viz"></div><div class="tile-spark" id="cpu-sp"></div><footer class="tile-f" id="cpu-f"></footer>`)}
      ${TILE("02", "tv-mem", "Memory", "s3", `<div class="tile-v"><b id="mem-v">–</b><small id="mem-u">GB</small></div><div class="viz" id="mem-viz"></div><div class="legend" id="mem-lg"></div><footer class="tile-f" id="mem-f"></footer>`)}
      ${TILE("03", "tv-temp", "Temperature", "s3", `<div class="tile-v"><b id="temp-v">–</b><small>°C</small></div><div class="viz" id="temp-viz"></div><div class="tile-spark" id="temp-sp"></div><footer class="tile-f" id="temp-f"></footer>`)}
      ${TILE("04", "tv-disk", "Storage", "s3", `<div class="tile-v"><b id="disk-v">–</b><small>% used</small></div><div class="viz" id="disk-viz"></div><div class="mounts" id="disk-m"></div><footer class="tile-f" id="disk-f"></footer>`)}
      ${TILE("05", "tv-act", "Activity", "s8", `<div class="act-top"><div class="seg act-seg" role="tablist">${["cpu:CPU", "mem:Memory", "temp:Temp", "net:Network", "io:Disk"].map((x) => { const [k, l] = x.split(":"); return `<button role="tab" data-m="${k}">${l}</button>`; }).join("")}</div></div>
        <div class="act-sub"><div class="act-read" id="act-read"></div><div class="seg act-range" role="tablist" aria-label="Time range"><button role="tab" data-r="15m">15 min</button><button role="tab" data-r="24h">24 h</button></div></div>
        <div class="act-chart" id="act-chart"></div>`)}
      ${TILE("06", "tv-cores", "Cores", "s4", `<div class="cores" id="cores"></div><footer class="tile-f" id="cores-f"></footer>`)}
      ${TILE("07", "tv-net", "Network", "s4", `<div class="duo"><div><span>↓ In</span><b id="rx-v">–</b></div><div><span>↑ Out</span><b id="tx-v">–</b></div></div><div class="tile-spark" id="net-sp"></div><footer class="tile-f" id="net-f"></footer>`)}
      ${TILE("08", "tv-io", "Disk activity", "s4", `<div class="duo"><div><span>Read</span><b id="rd-v">–</b></div><div><span>Write</span><b id="wr-v">–</b></div></div><div class="tile-spark" id="io-sp"></div><footer class="tile-f" id="io-f"></footer>`)}
      ${TILE("09", "tv-pow", "Power", "s4", `<div class="pow"><div class="pow-ring" id="pow-ring"></div><dl class="kv" id="pow-kv"></dl></div>`)}
      ${TILE("10", "tv-proc", "Processes", "s8", `<div class="proc-top"><span class="meta" id="proc-n"></span><div class="seg proc-seg" role="tablist"><button role="tab" data-s="cpu">By CPU</button><button role="tab" data-s="mem">By memory</button></div></div><div class="proc" id="proc"></div>`)}
      ${TILE("11", "tv-model", esc(AN()) + "'s model", "s4", `<div class="model" id="model"></div>`)}
      ${TILE("12", "tv-ctr", "Containers", "s6", `<div class="ctr" id="ctr"><p class="empty-note">Loading…</p></div>`)}
      ${TILE("13", "tv-sens", "Sensors", "s6", `<div class="sens" id="sens"></div>`)}
      ${TILE("14", "tv-du", "Disk usage", "s12", `<div class="du" id="du"><p class="empty-note">Reading the disk…</p></div>`)}
      ${TILE("15", "tv-dev", "Device", "s12", `<div class="spec" id="spec"><p class="empty-note">Reading the hardware…</p></div>`)}
    </section></div>`;
  const pick = (sel, attr, val) => $$(sel + " button", stage).forEach((b) => b.setAttribute("aria-selected", b.dataset[attr] === val));
  pick(".act-seg", "m", SRV.metric); pick(".act-range", "r", SRV.range); pick(".proc-seg", "s", SRV.sort);
  $(".act-seg", stage).onclick = (e) => { const b = e.target.closest("button"); if (!b) return; SRV.metric = b.dataset.m; pick(".act-seg", "m", SRV.metric); paintActivity(); };
  $(".act-range", stage).onclick = (e) => { const b = e.target.closest("button"); if (!b) return; SRV.range = b.dataset.r; pick(".act-range", "r", SRV.range); paintActivity(); };
  $(".proc-seg", stage).onclick = (e) => { const b = e.target.closest("button"); if (!b) return; SRV.sort = b.dataset.s; pick(".proc-seg", "s", SRV.sort); paintProcs(); };
  const srv = $(".srv", stage);
  const tab = (t) => { SRV.tab = t; srv.dataset.tab = t; $$(".srv-tabs button", stage).forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === t)); if (t === "overview") paintActivity(); };
  $(".srv-tabs", stage).onclick = (e) => { const b = e.target.closest("button"); if (b) tab(b.dataset.tab); };
  tab(SRV.tab || "overview");
  if (matchMedia("(max-width: 860px)").matches) $(".srv-hostbox", stage).open = false;
  // tap a vital to chart it
  const toMetric = { "tv-cpu": "cpu", "tv-mem": "mem", "tv-temp": "temp", "tv-net": "net", "tv-io": "io" };
  for (const [id, m] of Object.entries(toMetric)) {
    const t = $("#" + id, stage); t.classList.add("tappable"); t.tabIndex = 0;
    const go = () => { SRV.metric = m; pick(".act-seg", "m", m); paintActivity(); $("#tv-act").scrollIntoView({ behavior: "smooth", block: "center" }); };
    t.addEventListener("click", go); t.addEventListener("keydown", (e) => e.key === "Enter" && go());
  }
  const disk = $("#tv-disk", stage); disk.classList.add("tappable"); disk.tabIndex = 0;
  const toDu = () => (matchMedia("(max-width: 860px)").matches ? tab("store") : $("#tv-du").scrollIntoView({ behavior: "smooth", block: "start" }));
  disk.addEventListener("click", toDu); disk.addEventListener("keydown", (e) => e.key === "Enter" && toDu());
  SRV.hist = []; SRV.coarse = []; SRV.lastT = 0;
  await pollServer(true);
  renderFeed();
}
async function pollServer(first) {
  clearTimeout(SRV.timer);
  if (S.view !== "server") return;
  if (!document.hidden) {
    try {
      const d = await api("/api/system?since=" + (first ? 0 : SRV.lastT));
      if (S.view !== "server") return;
      if (first) { SRV.coarse = d.coarse || []; if (d.device) SRV.device = d.device; }
      for (const p of d.fine) if (p.t > SRV.lastT) SRV.hist.push(p);
      SRV.hist = SRV.hist.slice(-420);
      if (SRV.hist.length) SRV.lastT = SRV.hist.at(-1).t;
      SRV.data = d;
      paintServer();
    } catch (e) {
      const l = $("#sv-live"); if (l) l.textContent = /two-step|locked/i.test(e.message) ? "Locked: turn on two-step sign-in" : "Can't reach the server";
    }
  }
  SRV.timer = setTimeout(() => pollServer(false), 3000);
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && S.view === "server") pollServer(false); });
let srvResize; window.addEventListener("resize", () => { clearTimeout(srvResize); srvResize = setTimeout(() => S.view === "server" && paintActivity(), 150); });

// ------------------------------------------------------------------ painting
function paintServer() {
  const d = SRV.data, n = d && d.now;
  if (!n) { $("#sv-status").textContent = d && d.error ? "Can't read the machine" : "Reading the machine"; $("#sv-sub").textContent = (d && d.error) || "First reading in a moment…"; return; }
  const set = (id, v) => { const e = document.getElementById(id); if (e && e.innerHTML !== v) e.innerHTML = v; };
  const cpuT = (n.temps.find((t) => t.name === "CPU package") || n.temps[0] || {}).c;
  const memUsed = n.mem.used, memTot = n.mem.total, root = n.disks.find((x) => x.mount === "/") || n.disks[0];
  const mp = n.model_proc, swapMB = mp ? mp.swap / MB : 0;
  // headline: one sentence that answers "is it OK?"
  const issues = [];
  if (cpuT >= 90) issues.push(["bad", "running very hot"]); else if (cpuT >= 80) issues.push(["warn", "running warm"]);
  if (n.mem.available < 0.6 * GB) issues.push(["bad", "almost out of memory"]);
  if (swapMB > 200) issues.push(["warn", `${AN()}'s model is partly swapped out (slower replies)`]);
  if (root && root.used / root.size > 0.9) issues.push(["bad", "disk almost full"]);
  if (n.cpu.total > 90) issues.push(["warn", "CPU busy"]);
  const worst = issues.some((i) => i[0] === "bad") ? "bad" : issues.length ? "warn" : "ok";
  $(".srv").dataset.state = worst;
  set("sv-status", worst === "ok" ? "All systems normal" : (worst === "bad" ? "Needs attention: " : "Healthy, ") + issues.map((i) => i[1]).join(", "));
  const who = d.model.active ? `${AN()} is working` : `${AN()} is idle`;
  set("sv-sub", `${who} · ${n.cpu.cores.length} threads at ${(n.cpu.freq.reduce((a, b) => a + b, 0) / n.cpu.freq.length / 1000).toFixed(1)} GHz · ${fmtB(n.mem.available)} memory free`);
  set("sv-live", `Live · ${clock(n.t)}`);
  set("sv-host", [["Host", n.host.hostname], ["Machine", n.host.machine], ["System", n.host.os], ["Kernel", n.host.kernel], ["Uptime", upFor(n.host.uptime)], ["Address", n.host.lan_ip || "–"]]
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v || "–")}</dd></div>`).join(""));

  // 01 processor
  const cl = level(n.cpu.total, 75, 92);
  set("cpu-v", Math.round(n.cpu.total)); $("#tv-cpu").dataset.l = cl;
  set("cpu-viz", tickDial(n.cpu.total / 100, cl));
  set("cpu-sp", spark(SRV.hist, ["cpu"], { max: 100, n: 120 }));
  set("cpu-f", `<span>load ${n.cpu.load.map((x) => x.toFixed(1)).join(" · ")}</span><span>${n.cpu.running} running / ${n.cpu.procs}</span>`);
  // 02 memory: used / cache / free, with swap
  set("mem-v", (memUsed / GB).toFixed(1)); set("mem-u", `/ ${(memTot / GB).toFixed(0)} GB`);
  const cache = Math.max(0, Math.min(n.mem.cached + n.mem.buffers, memTot - memUsed));
  $("#tv-mem").dataset.l = level(memUsed / memTot, 0.85, 0.95);
  set("mem-viz", tickBar([{ f: memUsed / memTot, c: "on" }, { f: cache / memTot, c: "soft" }]));
  set("mem-lg", `<span><i class="lg-on"></i>Used ${fmtB(memUsed)}</span><span><i class="lg-soft"></i>Cache ${fmtB(cache)}</span><span><i class="lg-off"></i>Free ${fmtB(n.mem.free)}</span>`);
  set("mem-f", `<span>swap ${fmtB(n.mem.swap_used)} / ${fmtB(n.mem.swap_total)}</span><span>${pct(memUsed, memTot)}%</span>`);
  // 03 temperature: a bullet graph against the CPU's limits
  const tl = level(cpuT || 0, 80, 92);
  set("temp-v", cpuT != null ? Math.round(cpuT) : "–"); $("#tv-temp").dataset.l = tl;
  set("temp-viz", bullet(cpuT || 0, 105, 80, 92, "°C") + `<div class="bullet-scale"><span style="left:0">0</span><span style="left:${(80 / 105) * 100}%">80</span><span style="left:${(92 / 105) * 100}%">92</span><span style="left:100%">105°</span></div>`);
  set("temp-sp", spark(SRV.hist, ["temp"], { max: 105, n: 120 }));
  const fan = n.fans[0];
  set("temp-f", `<span>${fan ? `fan ${fan.rpm.toLocaleString()} rpm` : "no fan reading"}</span><span>${tl === "ok" ? "normal" : tl === "warn" ? "warm" : "hot"}</span>`);
  // 04 storage
  if (root) {
    const up = pct(root.used, root.size);
    set("disk-v", up); $("#tv-disk").dataset.l = level(up, 80, 92);
    set("disk-viz", tickBar([{ f: root.used / root.size, c: "on" }]));
    set("disk-m", n.disks.filter((x) => x !== root).map((x) => `<span>${esc(x.mount)} <b>${pct(x.used, x.size)}%</b></span>`).join(""));
    set("disk-f", `<span>${fmtB(root.avail)} free of ${fmtB(root.size)}</span><span>${esc(root.fs)}</span>`);
  }
  // 06 cores: dot columns
  set("cores", n.cpu.cores.map((c, i) => {
    const lit = Math.round((c / 100) * 12);
    return `<div class="core" title="Thread ${i}: ${c}% at ${n.cpu.freq[i]} MHz"><div class="dots">${Array.from({ length: 12 }, (_, k) => `<i class="${11 - k < lit ? (c > 90 ? "hot" : "on") : ""}"></i>`).join("")}</div><span>${Math.round(c)}</span></div>`;
  }).join(""));
  set("cores-f", `<span>${esc((n.host.cpu_model || "").replace(/\(R\)|\(TM\)|CPU|11th Gen /g, "").replace(/\s+/g, " ").trim())}</span><span>max ${(n.cpu.max_freq / 1000).toFixed(1)} GHz</span>`);
  // 07 network, 08 disk activity
  set("rx-v", fmtR(n.rates.rx)); set("tx-v", fmtR(n.rates.tx));
  set("net-sp", spark(SRV.hist, ["rx", "tx"], { n: 120 }));
  const wifi = n.net.ifaces.find((i) => i.up);
  set("net-f", `<span>${wifi ? `${wifi.wifi ? "Wi-Fi" : "Ethernet"} · ${esc(wifi.name)}` : "offline"}</span><span>${fmtB(n.net.rx)} in since boot</span>`);
  set("rd-v", fmtR(n.rates.rd)); set("wr-v", fmtR(n.rates.wr));
  set("io-sp", spark(SRV.hist, ["rd", "wr"], { n: 120 }));
  set("io-f", `<span>${esc(n.io.model || "disk")}</span><span>${fmtB(n.io.write)} written</span>`);
  // 09 power
  const b = n.battery;
  set("pow-ring", b ? `${ring((b.capacity || 0) / 100, b.capacity < 20 ? "bad" : "on")}<div class="pow-mid"><b>${Math.round(b.capacity)}</b><small>%</small></div>` : `<div class="pow-mid"><b>AC</b></div>`);
  set("pow-kv", [["Source", n.ac ? "Mains power" : "Battery"], ["State", b ? b.status : "–"], ["Battery health", b && b.health ? b.health + "%" : "–"],
    ["Draw", b && b.power_w ? b.power_w + " W" : "–"], ["Fan", fan ? fan.rpm.toLocaleString() + " rpm" : "–"],
    ["Graphics", n.gpu ? `${n.gpu.freq} / ${n.gpu.max} MHz` : "–"]].map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(String(v))}</dd></div>`).join(""));
  // 11 the model
  const sp = d.model.speed || {};
  set("model", `<div class="duo"><div><span>Writing</span><b>${sp.tg_tps ? sp.tg_tps.toFixed(1) : "–"}<small> tok/s</small></b></div><div><span>Reading</span><b>${sp.pp_tps ? Math.round(sp.pp_tps) : "–"}<small> tok/s</small></b></div></div>
    <dl class="kv"><div><dt>Model</dt><dd>${esc(prettyModel(d.model.name))}</dd></div>
    <div><dt>State</dt><dd><i class="st ${d.model.online ? (d.model.active ? "busy" : "ok") : "bad"}"></i>${d.model.online ? (d.model.active ? "Working" : "Ready") : "Offline"}</dd></div>
    <div><dt>In memory</dt><dd>${mp ? fmtB(mp.rss) : "–"}</dd></div>
    <div><dt>Swapped out</dt><dd class="${swapMB > 200 ? "warn" : ""}">${mp ? (swapMB < 1 ? "none" : fmtB(mp.swap)) : "–"}</dd></div>
    <div><dt>Context</dt><dd>${d.model.ctx ? d.model.ctx.toLocaleString() + " tokens" : "–"}</dd></div>
    <div><dt>Using CPU</dt><dd>${mp ? Math.round(mp.cpu) + "%" : "–"}</dd></div></dl>`);
  paintProcs(); paintContainers(); paintSensors(); paintActivity(); paintDevice(); paintStorage();
}
function paintProcs() {
  const n = SRV.data && SRV.data.now; if (!n) return;
  const list = SRV.sort === "cpu" ? n.top_cpu : n.top_mem;
  const maxCpu = Math.max(100, ...list.map((p) => p.cpu)), memTot = n.mem.total;
  $("#proc-n").textContent = `${n.cpu.procs} processes · ${n.cpu.running} running`;
  $("#proc").innerHTML = `<div class="pr pr-h"><span>Process</span><span>User</span><span>CPU</span><span>Memory</span><span class="hide-xs">Threads</span></div>` +
    list.slice(0, 10).map((p) => `<div class="pr${p.name === "llama-server" ? " pr-model" : ""}" title="${esc(p.cmd || p.name)}">
      <span class="pr-name"><b>${esc(p.name === "llama-server" ? `${p.name}` : p.name)}</b><small>${esc(p.name === "llama-server" ? `${AN()}'s model · pid ${p.pid}` : (p.cmd || "").slice(0, 70))}</small></span>
      <span class="pr-user">${esc(p.user)}</span>
      <span class="pr-bar"><i style="width:${clamp(p.cpu / maxCpu) * 100}%"></i><em>${p.cpu.toFixed(1)}%</em></span>
      <span class="pr-bar mem"><i style="width:${clamp(p.rss / memTot) * 100}%"></i><em>${fmtB(p.rss)}</em></span>
      <span class="pr-thr hide-xs">${p.threads}</span></div>`).join("");
}
function paintContainers() {
  const c = SRV.data && SRV.data.containers; if (!c) return;
  const el = $("#ctr"); if (!el) return;
  if (!c.length) { el.innerHTML = `<p class="empty-note">Collecting container stats…</p>`; return; }
  const row = (x) => `<div class="ct ${x.state === "running" ? "" : "ct-off"}"><i class="st ${x.state === "running" ? "ok" : "off"}"></i>
    <span class="ct-name"><b>${esc((x.name || "").replace(/^reliquary-/, ""))}</b><small>${esc(x.status || "")}</small></span>
    <span class="ct-cpu">${x.state === "running" ? x.cpu.toFixed(1) + "%" : "–"}</span>
    <span class="ct-mem">${x.mem ? esc(x.mem) : "–"}${x.mem_pct ? `<i style="width:${clamp(x.mem_pct / 100) * 100}%"></i>` : ""}</span></div>`;
  const on = c.filter((x) => x.state === "running"), off = c.filter((x) => x.state !== "running");
  const wasOpen = el.querySelector(".ct-more")?.open;
  el.innerHTML = `<p class="ct-sum"><b>${on.length}</b> running${off.length ? ` · ${off.length} stopped` : ""}</p>` + on.map(row).join("") +
    (off.length ? `<details class="ct-more"${wasOpen ? " open" : ""}><summary>${off.length} stopped container${off.length === 1 ? "" : "s"}</summary>${off.map(row).join("")}</details>` : "");
}
function paintSensors() {
  const n = SRV.data && SRV.data.now; if (!n) return;
  const seen = new Map();
  for (const t of n.temps) { const k = t.name + (seen.has(t.name) ? " " + (seen.get(t.name) + 1) : ""); seen.set(t.name, (seen.get(t.name) || 0) + 1); t.label = k; }
  $("#sens").innerHTML = n.temps.filter((t) => t.c > 0).map((t) => {
    const max = t.max && t.max < 130 ? t.max : 100;
    return `<div class="sn"><span>${esc(t.label)}</span>${bullet(t.c, max, max * 0.8, max * 0.92, "°C")}<b class="${level(t.c, max * 0.8, max * 0.92)}">${Math.round(t.c)}°</b></div>`;
  }).join("") + n.fans.map((f) => `<div class="sn"><span>${esc(f.name)}</span><div class="sn-fan"><i style="animation-duration:${f.rpm ? Math.max(0.15, 60 / f.rpm * 8).toFixed(2) : 0}s"></i></div><b>${f.rpm.toLocaleString()}<small> rpm</small></b></div>`).join("");
}

// ------------------------------------------------------------------ 14 device: what the machine is made of
const tidyHw = (s) => String(s || "").replace(/\((R|TM)\)/g, "").replace(/\s*\(rev [0-9a-f]+\)/i, "").replace(/ (Corporation|Co\., Ltd\.|Semiconductor|Inc\.)/g, "")
  .replace(/PCI Express /, "").replace(/\s+/g, " ").trim();
const SPEC_ICON = {
  cpu: '<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2.5"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/></svg>',
  ram: '<svg viewBox="0 0 24 24"><path d="M4.5 7h15A1.5 1.5 0 0 1 21 8.5V15H3V8.5A1.5 1.5 0 0 1 4.5 7Z"/><path d="M3 15v2.5h18V15M7 10v2M10.5 10v2M14 10v2M17.5 10v2"/></svg>',
  ssd: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 14h18M14 17h3"/><circle cx="7" cy="17" r=".6"/><circle cx="10" cy="17" r=".6"/></svg>',
  gpu: '<svg viewBox="0 0 24 24"><rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8.5 21h7M12 17v4"/></svg>',
  net: '<svg viewBox="0 0 24 24"><path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r=".8"/></svg>',
  bat: '<svg viewBox="0 0 24 24"><rect x="2.5" y="7" width="17" height="10" rx="2.5"/><path d="M22 10.5v3M6 10.5v3M9 10.5v3"/></svg>',
  board: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/></svg>',
  os: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="m7 9 3 3-3 3M13 15h4"/></svg>',
};
function paintDevice() {
  const d = SRV.device, el = $("#spec"); if (!el) return;
  if (!d) return;
  if (el.dataset.done) return;   // hardware doesn't change: draw once
  el.dataset.done = "1";
  const c = d.cpu, ssd = d.storage[0] || {}, b = d.battery, disp = d.displays[0];
  const ghz = (m) => (m / 1000).toFixed(1).replace(/\.0$/, "");
  const cards = [
    ["cpu", "Processor", tidyHw(c.model).replace(/^\d+th Gen /, "").replace(/ @ [\d.]+GHz/, ""), [`${c.cores} cores · ${c.threads} threads`, `${ghz(c.min_mhz)}–${ghz(c.max_mhz)} GHz`, [c.l2 && `L2 ${c.l2}`, c.l3 && `L3 ${c.l3}`].filter(Boolean).join(" · "), c.features.map((f) => f.replace("avx512f", "AVX-512").replace("avx512_vnni", "VNNI").replace("avx2", "AVX2").replace("sha_ni", "SHA").replace("aes", "AES").replace("vmx", "VT-x")).join(" · ")]],
    ["ram", "Memory", `${Math.round(d.memory.total / 1e9)} GB`, [`${(d.memory.total / 2 ** 30).toFixed(1)} GiB usable`, `swap ${Math.round(d.memory.swap / 2 ** 30)} GB`, "type & speed need root:", "sudo dmidecode -t memory"]],
    ["ssd", "Storage", ssd.model ? ssd.model.replace(/\s+/g, " ").replace(/NVMe /, "") : "–", [`${Math.round((ssd.size || 0) / 1e9)} GB · ${ssd.transport || ""}${ssd.rotational ? " · spinning" : " · solid state"}`, tidyHw(d.storage_controller), ssd.firmware ? `firmware ${ssd.firmware}` : ""]],
    ["gpu", "Graphics & display", tidyHw(d.gpu).replace(/^Intel /, "Intel ").replace(/TigerLake-LP GT2 \[(.+)\]/, "$1"), [disp ? `${disp.mode} · ${disp.port.startsWith("eDP") ? "built-in screen" : disp.port}` : "no display connected", tidyHw(d.audio)]],
    ["net", "Network", tidyHw(d.wifi) || "–", [tidyHw(d.ethernet).replace(/\/\d+(\/\d+)*/g, ""), SRV.data?.now?.host?.lan_ip ? `LAN ${SRV.data.now.host.lan_ip}` : ""]],
    ["bat", "Battery", b ? `${b.health}% health` : "No battery", b ? [`${b.full} of ${b.design} ${b.unit} design capacity`, `${b.model} · ${b.maker}`, b.health < 60 ? "worn: fine on mains, short on battery" : ""] : []],
    ["board", "Machine", `${d.board.vendor.replace(/ Inc\.?/, "")} ${d.board.product}`, [`board ${d.board.board}`, `BIOS ${d.board.bios.replace(/^Dell Inc\. /, "")}${d.board.bios_date ? " · " + d.board.bios_date : ""}`]],
    ["os", "Software", d.system.os, [`Linux ${d.system.kernel}`, `Docker ${d.system.docker || "–"} · Python ${d.system.python}`, `host ${d.system.hostname}`]],
  ];
  el.innerHTML = cards.map(([ic, label, main, lines]) => `<div class="spec-c"><span class="spec-i">${SPEC_ICON[ic]}</span>
    <div><small>${esc(label)}</small><b>${esc(main)}</b>${lines.filter(Boolean).map((l) => `<span>${esc(l)}</span>`).join("")}</div></div>`).join("");
}

// ------------------------------------------------------------------ 14 disk usage: what is filling the disk
const DU_C = { img: "#FF6B2C", vol: "#F5B04C", dock: "#C9784A", home: "#6EA8FF", prog: "#A08CFF", logs: "#4FC3A1", swap: "#8A8F99", other: "#4A4E57" };
let duAsked = 0;
function paintStorage() {
  const el = $("#du"); if (!el) return;
  const st = SRV.data && SRV.data.storage, n = SRV.data && SRV.data.now;
  if (!st) {
    if (Date.now() - duAsked > 120000) { duAsked = Date.now(); api("/api/system/storage", { method: "POST" }).catch(() => {}); }
    el.innerHTML = `<p class="empty-note">Measuring what's on the disk… this takes up to a minute the first time.</p>`; return;
  }
  const key = st.t + "|" + !!SRV.data.storage_busy;
  if (el.dataset.k === key) return;   // only redraw when there is a new scan
  el.dataset.k = key;
  const r = st.root, used = r.used, total = r.size;
  const dk = (t) => (st.docker.find((x) => x.type === t) || { size: 0, reclaimable: 0, count: 0, active: 0 });
  const img = dk("Images"), vol = dk("Local Volumes"), ctr = dk("Containers"), cache = dk("Build Cache");
  const sys = (name) => (st.system.find((x) => x.name.startsWith(name)) || { size: 0 }).size;
  const parts = [
    ["img", "Docker images", img.size, `${img.count} images, ${img.active} in use`],
    ["vol", "Docker volumes", vol.size, `${vol.count} volumes`],
    ["dock", "Containers & build cache", ctr.size + cache.size, `${ctr.count} containers`],
    ["home", "Your files", st.home_total, st.home],
    ["prog", "Programs", sys("Programs"), "/usr, /opt, /snap"],
    ["logs", "Logs & caches", sys("Logs"), "/var/log, /var/cache"],
    ["swap", "Swap & boot", sys("Swap") + sys("Boot"), "swap file, kernels"],
  ].filter((p) => p[2] > 0);
  const known = parts.reduce((a, p) => a + p[2], 0);
  if (used - known > 0.3 * GB) parts.push(["other", "System & other", used - known, "everything else on /"]);
  const reclaim = st.docker.reduce((a, x) => a + (x.reclaimable || 0), 0);
  const f = (v) => ((100 * v) / total).toFixed(2) + "%";
  // home folder: the biggest top-level folders, each with its biggest children
  const tops = st.home_items.filter((x) => !x.path.includes("/")).slice(0, 8);
  const kids = (p) => st.home_items.filter((x) => x.path.startsWith(p + "/")).slice(0, 3);
  const maxTop = Math.max(1, ...tops.map((x) => x.size));
  const ago2 = Math.round((Date.now() / 1000 - st.t) / 60);
  el.innerHTML = `<div class="du-head"><div class="du-free"><b>${fmtB(r.avail)}</b><span>free of ${fmtB(total)} · ${pct(used, total)}% used</span></div>
      <div class="du-when">${SRV.data.storage_busy ? "Measuring…" : `measured ${ago2 < 1 ? "just now" : ago2 < 60 ? ago2 + " min ago" : Math.round(ago2 / 60) + " h ago"}`}
        <button class="mini-btn du-rescan" type="button" ${SRV.data.storage_busy ? "disabled" : ""}>Measure again</button></div></div>
    <div class="du-bar" role="img" aria-label="Disk: ${parts.map((p) => `${p[1]} ${fmtB(p[2])}`).join(", ")}, free ${fmtB(r.avail)}">${parts.map((p) => `<i style="width:${f(p[2])};background:${DU_C[p[0]]}" title="${esc(p[1])} · ${fmtB(p[2])}"></i>`).join("")}</div>
    <div class="du-cols">
      <div class="du-legend">${parts.map((p) => `<div class="du-row"><i style="background:${DU_C[p[0]]}"></i><span><b>${esc(p[1])}</b><small>${esc(p[3])}</small></span><em>${fmtB(p[2])}</em><u>${pct(p[2], total)}%</u></div>`).join("")}
        <div class="du-row du-freerow"><i></i><span><b>Free</b><small>available to you</small></span><em>${fmtB(r.avail)}</em><u>${pct(r.avail, total)}%</u></div>
        ${reclaim > 0.5 * GB ? `<p class="du-tip">Docker could give back <b>${fmtB(reclaim)}</b> (unused images, stopped containers, build cache): <code>docker system prune</code></p>` : ""}</div>
      <div class="du-home"><h4>Biggest folders in your home</h4>${tops.length ? tops.map((x) => `<div class="du-dir">
          <div class="du-dir-h"><span>${fileIcon(x.path, true, false)}<b>${esc(x.path)}</b></span><em>${fmtB(x.size)}</em></div>
          <div class="du-dir-bar"><i style="width:${((100 * x.size) / maxTop).toFixed(1)}%"></i></div>
          ${kids(x.path).length ? `<p>${kids(x.path).map((k) => `<span>${esc(k.path.slice(x.path.length + 1))} <b>${fmtB(k.size)}</b></span>`).join("")}</p>` : ""}</div>`).join("") : `<p class="empty-note">Nothing over 50 MB.</p>`}</div>
    </div>`;
  $(".du-rescan", el).onclick = async (e) => { e.target.disabled = true; e.target.textContent = "Measuring…"; await api("/api/system/storage", { method: "POST" }).catch(() => {}); };
}

// ------------------------------------------------------------------ Home: the machine in one card
const HSRV = { hist: [], lastT: 0, timer: 0 };
async function homeServerCard(cards) {
  const card = h(`<a class="card c-server" href="#/server" aria-label="Server status, open the Server page"><div class="card-h"><h2>Server</h2><span class="hs-live" id="hs-live">Reading…</span></div><div class="hs" id="hs"></div></a>`);
  cards.append(card);
  HSRV.hist = []; HSRV.lastT = 0;
  const tick = async () => {
    clearTimeout(HSRV.timer);
    if (S.view !== "home" || !document.body.contains(card)) return;
    if (!document.hidden) {
      try {
        const d = await api("/api/system?since=" + HSRV.lastT);
        for (const p of d.fine) if (p.t > HSRV.lastT) HSRV.hist.push(p);
        HSRV.hist = HSRV.hist.slice(-120); if (HSRV.hist.length) HSRV.lastT = HSRV.hist.at(-1).t;
        paintHomeServer(d);
      } catch { $("#hs-live").textContent = "Can't reach it"; }
    }
    HSRV.timer = setTimeout(tick, 5000);
  };
  tick();
}
function paintHomeServer(d) {
  const n = d.now, el = $("#hs"); if (!n || !el) return;
  const cpuT = (n.temps.find((t) => t.name === "CPU package") || n.temps[0] || {}).c;
  const root = n.disks.find((x) => x.mount === "/") || n.disks[0];
  const sp = d.model.speed || {};
  const meter = (frac, lv) => `<span class="hs-m"><i class="${lv}" style="width:${(clamp(frac) * 100).toFixed(1)}%"></i></span>`;
  const cell = (label, val, unit, sub, viz, lv = "ok") => `<div class="hs-c" data-l="${lv}"><small>${label}</small><b>${val}<em>${unit}</em></b>${viz}<span>${sub}</span></div>`;
  const cl = level(n.cpu.total, 75, 92), ml = level(n.mem.used / n.mem.total, 0.85, 0.95), tl = level(cpuT || 0, 80, 92), dl = root ? level(root.used / root.size, 0.8, 0.92) : "ok";
  el.innerHTML = cell("CPU", Math.round(n.cpu.total), "%", `load ${n.cpu.load[0].toFixed(1)}`, `<span class="hs-sp">${spark(HSRV.hist, ["cpu"], { max: 100, h: 28 })}</span>`, cl) +
    cell("Memory", (n.mem.used / GB).toFixed(1), ` / ${Math.round(n.mem.total / GB)} GB`, `${fmtB(n.mem.available)} free`, meter(n.mem.used / n.mem.total, ml), ml) +
    cell("Temperature", cpuT != null ? Math.round(cpuT) : "–", "°C", tl === "ok" ? "normal" : tl === "warn" ? "warm" : "hot", meter((cpuT || 0) / 105, tl), tl) +
    (root ? cell("Storage", fmtB(root.avail).split(" ")[0], ` ${fmtB(root.avail).split(" ")[1]} free`, `${pct(root.used, root.size)}% of ${fmtB(root.size)} used`, meter(root.used / root.size, dl), dl) : "") +
    cell(`${esc(AN())}'s model`, sp.tg_tps ? sp.tg_tps.toFixed(1) : "–", " tok/s", d.model.online ? (d.model.active ? "working" : "ready") : "offline",
      `<span class="hs-state"><i class="st ${d.model.online ? (d.model.active ? "busy" : "ok") : "bad"}"></i>${esc(prettyModel(d.model.name).replace(/ \(uncensored\)/, ""))}</span>`, d.model.online ? "ok" : "bad");
  $("#hs-live").innerHTML = `<i class="srv-live"></i>up ${upFor(n.host.uptime)}`;
  // keep the Live card's services line current too (container stats arrive a few seconds after the page opens)
  const foot = $("#h-live .hl-foot"), ctr = d.containers || [];
  if (foot && ctr.length) {
    const down = ctr.filter((c) => c.state !== "running" && (c.name || "").startsWith("reliquary-") && c.name !== "reliquary-app-dev").map((c) => c.name.replace("reliquary-", ""));
    const run = ctr.filter((c) => c.state === "running").length;
    foot.innerHTML = down.length ? `<span class="hl-svc bad"><i></i>${esc(down.join(", "))} ${down.length === 1 ? "is" : "are"} down</span>` : `<span class="hl-svc"><i></i>${run} services running, all healthy</span>`;
  }
}

// ------------------------------------------------------------------ 05 activity: the one big chart
const ACT = {
  cpu: { keys: ["cpu"], names: ["CPU"], max: 100, fmt: (v) => Math.round(v) + "%" },
  mem: { keys: ["mem"], names: ["Memory"], max: 100, fmt: (v) => Math.round(v) + "%" },
  temp: { keys: ["temp"], names: ["CPU package"], max: 105, fmt: (v) => Math.round(v) + "°C" },
  net: { keys: ["rx", "tx"], names: ["In", "Out"], fmt: fmtR },
  io: { keys: ["rd", "wr"], names: ["Read", "Write"], fmt: fmtR },
};
function paintActivity() {
  const box = $("#act-chart"); if (!box) return;
  const m = ACT[SRV.metric], pts = SRV.range === "24h" ? SRV.coarse.concat(SRV.hist.filter((p) => !SRV.coarse.length || p.t > SRV.coarse.at(-1).t).filter((_, i, a) => i === a.length - 1)) : SRV.hist.slice(-300);
  const W = Math.max(280, Math.round(box.clientWidth)), H = Math.max(150, Math.round(box.clientHeight)), L = W < 460 ? 40 : 50, B = 22;   // real pixels: crisp text
  if (pts.length < 2) { box.innerHTML = `<p class="empty-note">Collecting history… the chart fills in as samples arrive.</p>`; $("#act-read").innerHTML = ""; return; }
  const max = m.max || Math.max(1, ...pts.flatMap((p) => m.keys.map((k) => p[k] || 0))) * 1.2;
  const t0 = pts[0].t, t1 = pts.at(-1).t, X = (t) => L + ((t - t0) / Math.max(1, t1 - t0)) * (W - L - 8), Y = (v) => H - B - clamp((v || 0) / max) * (H - B - 10);
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => `<line class="gl" x1="${L}" x2="${W - 8}" y1="${Y(max * f)}" y2="${Y(max * f)}"/><text class="gt" x="${L - 8}" y="${Y(max * f) + 4}" text-anchor="end">${m.fmt(max * f)}</text>`).join("");
  const ticks = W < 460 ? 3 : 5, day = SRV.range === "24h";
  const tl = (t) => new Date(t * 1000).toLocaleTimeString([], day ? { hour: "numeric" } : { hour: "numeric", minute: "2-digit" }).replace(day ? /$^/ : /\s?[AP]M$/i, "");
  const xt = Array.from({ length: ticks }, (_, i) => t0 + ((t1 - t0) * i) / (ticks - 1)).map((t, i, a) => i && tl(t) === tl(a[i - 1]) ? "" :   // no repeated labels while history is short
    `<text class="gt" x="${X(t)}" y="${H - 4}" text-anchor="${i === 0 ? "start" : i === ticks - 1 ? "end" : "middle"}">${tl(t)}</text>`).join("");
  const series = m.keys.map((k, ki) => {
    const line = pts.map((p, i) => `${i ? "L" : "M"}${X(p.t).toFixed(1)} ${Y(p[k]).toFixed(1)}`).join("");
    return `${ki === 0 ? `<path class="ch-area" d="${line}L${X(t1)} ${H - B}L${L} ${H - B}Z"/>` : ""}<path class="ch-line s${ki}" d="${line}"/>`;
  }).join("");
  box.innerHTML = `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${m.names.join(" and ")} over ${SRV.range === "24h" ? "24 hours" : "15 minutes"}">
    <defs><linearGradient id="chg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--ember)" stop-opacity=".28"/><stop offset="1" stop-color="var(--ember)" stop-opacity="0"/></linearGradient></defs>
    ${grid}${xt}${series}<line class="ch-x" x1="0" x2="0" y1="10" y2="${H - B}" visibility="hidden"/></svg>`;
  const read = (p, live) => { $("#act-read").innerHTML = m.keys.map((k, ki) => `<span class="s${ki}"><i></i>${m.names[ki]} <b>${m.fmt(p[k] || 0)}</b></span>`).join("") +
    `<span class="act-when">${live ? "now" : new Date(p.t * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: SRV.range === "24h" ? undefined : "2-digit" })}</span>`; };
  read(pts.at(-1), true);
  const svg = $("svg", box), cross = $(".ch-x", box);
  const move = (e) => {
    const r = svg.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * W;
    if (x < L) return;
    const t = t0 + ((x - L) / (W - L - 8)) * (t1 - t0);
    let best = pts[0]; for (const p of pts) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
    cross.setAttribute("x1", X(best.t)); cross.setAttribute("x2", X(best.t)); cross.setAttribute("visibility", "visible"); read(best, false);
  };
  svg.addEventListener("pointermove", move); svg.addEventListener("pointerdown", move);
  svg.addEventListener("pointerleave", () => { cross.setAttribute("visibility", "hidden"); read(pts.at(-1), true); });
}
