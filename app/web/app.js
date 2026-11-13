/* Reliquary web app. No framework: state in S, views rendered from templates, live runs over SSE. */
"use strict";

// ------------------------------------------------------------------ helpers
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const h = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtK = (n) => (n >= 10000 ? Math.round(n / 1000) + "k" : n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(Math.round(n || 0)));
const clock = (t) => new Date(t * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
function ago(t) {
  const s = Date.now() / 1000 - t;
  if (s < 60) return "now";
  if (s < 3600) return Math.floor(s / 60) + " min";
  const d = new Date(t * 1000), today = new Date();
  if (d.toDateString() === today.toDateString()) return clock(t);
  const y = new Date(today); y.setDate(today.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}
function dur(sec) {
  sec = Math.max(0, Math.round(sec));
  if (sec < 60) return sec + " s";
  const m = Math.floor(sec / 60), s = sec % 60;
  return m < 60 ? `${m} min ${s ? s + " s" : ""}`.trim() : `${Math.floor(m / 60)} h ${m % 60} min`;
}
const I = {
  chat: '<svg viewBox="0 0 24 24"><path d="M5 5h14v10H9l-4 4z"/></svg>',
  code: '<svg viewBox="0 0 24 24"><path d="m9 8-4 4 4 4M15 8l4 4-4 4"/></svg>',
  read: '<svg viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  run: '<svg viewBox="0 0 24 24"><path d="m5 7 5 5-5 5M12 18h7"/></svg>',
  mind: '<svg viewBox="0 0 24 24"><path d="M5 12.5 9.5 17 19 7.5"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v7"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="3"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  redo: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>',
  pen: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/></svg>',
  send: '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/></svg>',
  clip: '<svg viewBox="0 0 24 24"><path d="M15.5 7.5 8 15a2.5 2.5 0 0 0 3.5 3.5L19 11a4.5 4.5 0 0 0-6.4-6.4L5 12.2"/></svg>',
  dots: '<svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3.5 7a2 2 0 0 1 2-2H10l2 2.5h6.5a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
  bolt: '<svg viewBox="0 0 24 24"><path d="M13 3 5 13h6l-1 8 8-10h-6z"/></svg>',
  web: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.5 2.6 2.5 13.4 0 16M12 4c-2.5 2.6-2.5 13.4 0 16"/></svg>',
  hand: '<svg viewBox="0 0 24 24"><path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11V5a1.5 1.5 0 0 1 3 0v6M14 11V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.5A5.5 5.5 0 0 1 6 17.4L4.5 14a1.5 1.5 0 0 1 2.6-1.4L8 14"/></svg>',
};
const TOOL_KIND = { todo: "mind", load_skill: "mind", run_python: "run", glob: "read", forget: "mind", update_note: "mind",
  web_search: "web", read_webpage: "web", list_files: "read", read_file: "read", search: "read", write_file: "edit", edit_file: "edit", run: "run",
  add_task: "mind", list_tasks: "mind", complete_task: "mind", save_note: "mind", search_notes: "mind", remember: "mind" };
const TOOL_VERB = { todo: "Updated the plan", load_skill: "Loaded a skill", run_python: "Ran Python", glob: "Found files",
  forget: "Forgot", update_note: "Updated a note", web_search: "Searched the web", read_webpage: "Read a page", list_files: "Listed", read_file: "Read", search: "Searched", write_file: "Wrote", edit_file: "Edited", run: "Ran",
  add_task: "Added a task", list_tasks: "Checked tasks", complete_task: "Completed a task", save_note: "Saved a note",
  search_notes: "Searched notes", remember: "Remembered" };
function toolArg(name, a) {
  if (!a || typeof a !== "object") return String(a || "");
  if (name === "run") return a.command || "";
  if (name === "web_search") return a.query || "";
  if (name === "todo") { const it = a.items || []; return `${it.filter((i) => i.status === "done").length} of ${it.length} done`; }
  if (name === "load_skill") return a.name || "";
  if (name === "run_python") return (a.code || "").split("\n").find((l) => l.trim() && !l.startsWith("import")) || "";
  if (name === "glob") return a.pattern || "";
  if (name === "forget") return a.words || "";
  if (name === "update_note") return "#" + a.id;
  if (name === "read_webpage") return a.url || "";
  if (name === "search") return `${a.pattern || ""}${a.path ? "  in " + a.path : ""}`;
  if (name === "add_task" || name === "save_note") return a.title || "";
  if (name === "remember") return a.fact || "";
  if (name === "search_notes") return a.query || "";
  if (name === "complete_task") return "#" + a.id;
  return a.path || ".";
}

async function api(path, opts = {}) {
  const init = { method: opts.method || "GET", headers: { "X-Reliquary": "1" }, credentials: "same-origin" };
  if (opts.body !== undefined) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(opts.body); }
  const r = await fetch(path, init);
  if (r.status === 401 && !opts.allow401) { showLogin(); throw new Error("Sign in first."); }
  let data = null;
  try { data = await r.json(); } catch { /* empty body */ }
  if (!r.ok) throw new Error((data && data.detail) || `Request failed (${r.status}).`);
  return data;
}
let toastTimer;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 3200);
}
function md(text) {
  const html = DOMPurify.sanitize(marked.parse(text || "", { breaks: false, gfm: true }));
  const el = document.createElement("div"); el.className = "md"; el.innerHTML = html;
  $$("pre", el).forEach((pre) => {
    const code = $("code", pre);
    if (!code) return;
    const lang = ([...code.classList].find((c) => c.startsWith("language-")) || "").slice(9);
    if (lang && window.hljs && hljs.getLanguage(lang)) { try { hljs.highlightElement(code); } catch { /* plain */ } }
    const wrap = h(`<div class="codeblock"><div class="codeblock-h"><span>${esc(lang || "text")}</span><button class="copy-code" type="button">Copy</button></div></div>`);
    pre.replaceWith(wrap); wrap.append(pre);
  });
  $$("a", el).forEach((a) => { a.target = "_blank"; a.rel = "noopener noreferrer"; });
  return el;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest(".copy-code");
  if (b) { navigator.clipboard.writeText((b.closest(".codeblock") || b.parentElement).querySelector("code")?.innerText || ""); b.textContent = "Copied"; setTimeout(() => (b.textContent = "Copy"), 1400); }
});

// ------------------------------------------------------------------ state
const AN = () => (S.settings && S.settings.assistant_name) || "RiRi";
const S = {
  view: "home", sid: null, session: null, messages: [], sessions: [], workspaces: [], filter: "all", settings: {},
  status: null, dash: null, editFrom: null, attachments: [],
  live: null,            // the live run of the open session
  feeds: {},             // run id -> feed items (kept after the run ends)
  lastFeedRun: null,
};

// ------------------------------------------------------------------ auth
async function boot() {
  let st;
  try { st = await api("/api/auth/state", { allow401: true }); } catch { st = { authenticated: false }; }
  $("#boot").hidden = true;
  if (!st.authenticated) return showLogin(st);
  $("#login").hidden = true; $("#app").hidden = false;
  $("#brand-reli").innerHTML = Reli.svg(34, "idle");
  S.settings = await api("/api/settings").catch(() => ({}));
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  await Promise.all([loadSessions(), loadWorkspaces()]);
  pollStatus();
  route();
}
function showLogin(st = {}) {
  $("#app").hidden = true; $("#boot").hidden = true; $("#login").hidden = false;
  $("#login-reli").innerHTML = Reli.svg(120, "idle");
  if (st.password_set === false) {
    $("#login-sub").innerHTML = "No password yet. Over SSH on the server, run <b>riri passwd</b> to set one.";
  }
  $("#login-code-wrap").hidden = !st.totp;
}
$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#login-error").textContent = "";
  try {
    await api("/api/auth/login", { method: "POST", body: { password: $("#login-pw").value, code: $("#login-code").value }, allow401: true });
    $("#login-pw").value = ""; $("#login-code").value = "";
    boot();
  } catch (err) {
    $("#login-error").textContent = err.message;
    if (/code/i.test(err.message)) $("#login-code-wrap").hidden = false;
  }
});

// ------------------------------------------------------------------ routing
window.addEventListener("hashchange", route);
function route() {
  const hsh = location.hash.replace(/^#\/?/, "");
  const [a, b] = hsh.split("/");
  closeDrawers();
  if (a === "c" && b) return openSession(b);
  S.sid = null; S.session = null; stopLive();
  $("#stage").classList.toggle("stage-conv", a === "fs");
  if (a === "tasks") return renderTasks();
  if (a === "notes") return renderNotes();
  if (a === "memory") return renderMemory();
  if (a === "fs") return renderFS(hsh.length > 3 ? decodeURIComponent(hsh.slice(3)) : "~");
  if (a === "files" && b) { location.hash = "#/fs/" + encodeURIComponent(folderOf(decodeURIComponent(b))); return; }
  renderHome();
}
function setNav(name) {
  $$("[data-nav]").forEach((t) => (t.dataset.nav === name ? t.setAttribute("aria-current", "page") : t.removeAttribute("aria-current")));
  renderSessionList();
}

// ------------------------------------------------------------------ left column
async function loadSessions() { S.sessions = await api("/api/sessions").catch(() => S.sessions); renderSessionList(); }
async function loadWorkspaces() { S.workspaces = await api("/api/workspaces").catch(() => S.workspaces); renderWorkspaces(); }
function renderSessionList() {
  const list = $("#session-list");
  const items = S.sessions.filter((s) => S.filter === "all" || s.mode === S.filter);
  if (!items.length) { list.innerHTML = `<p class="empty-note">No conversations yet. Say hello on the home page.</p>`; return; }
  const groups = { Pinned: [], Today: [], "This week": [], Earlier: [] };
  const now = Date.now() / 1000, day0 = new Date().setHours(0, 0, 0, 0) / 1000;
  for (const s of items) {
    if (s.pinned) groups.Pinned.push(s);
    else if (s.updated >= day0) groups.Today.push(s);
    else if (now - s.updated < 7 * 86400) groups["This week"].push(s);
    else groups.Earlier.push(s);
  }
  list.innerHTML = "";
  for (const [name, arr] of Object.entries(groups)) {
    if (!arr.length) continue;
    list.append(h(`<h3 class="group-h">${name}</h3>`));
    for (const s of arr) {
      const running = isRunning(s.id);
      const row = h(`<div class="s-row"><a class="s-card" href="#/c/${s.id}">
        <span class="s-text"><span class="s-title">${s.mode === "agent" ? '<span class="code-tag">code</span>' : ""}<span style="overflow:hidden;text-overflow:ellipsis">${esc(s.title)}</span></span>
          <span class="s-sub">${esc(s.mode === "agent" ? folderOf(s.workspace) : (s.last || "No reply yet"))}</span></span>
        <span class="s-meta">${running ? '<span class="live-dot" title="Working"></span>' : esc(ago(s.updated))}${s.pinned ? `<span class="pin-mark">${I.pin}</span>` : ""}</span>
      </a><button class="s-del" type="button" aria-label="Delete ${esc(s.title)}" title="Delete">${I.trash}</button></div>`);
      if (s.id === S.sid) $("a", row).setAttribute("aria-current", "page");
      $(".s-del", row).onclick = (e) => { e.preventDefault(); e.stopPropagation(); deleteSession(s); };
      list.append(row);
    }
  }
}
function isRunning(sid) { return !!(S.status && S.status.engine.active.some((r) => r.session_id === sid)); }
function wsThumb(name) {
  const parts = name.replace(/[^A-Za-z0-9]+/g, " ").trim().split(" ");
  return esc(((parts[0] || "?")[0] + (parts[1] ? parts[1][0] : (parts[0][1] || ""))).toUpperCase());
}
function folderOf(ws) {
  if (!ws) return "~";
  return ws.includes("/") || ws.startsWith("~") ? ws : `~/reliquary/workspaces/${ws}`;
}
function shortPath(p) { return p.replace(/^\/home\/[^/]+/, "~"); }
function renderWorkspaces() {
  const box = $("#ws-list"); box.innerHTML = "";
  const seen = new Set();
  for (const s of S.sessions) {
    if (!s.workspace) continue;
    const f = folderOf(s.workspace);
    if (seen.has(f) || seen.size >= 6) continue;
    seen.add(f);
    box.append(h(`<a class="ws-chip" href="#/fs/${encodeURIComponent(f)}" title="${esc(f)}">
      <span class="ws-thumb">${I.folder}</span><span class="ws-name">${esc(shortPath(f).split("/").pop() || f)}</span></a>`));
  }
  const add = h(`<a class="ws-chip ws-add" href="#/fs">Browse the server</a>`);
  box.append(add);
}
$("#filter").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  S.filter = b.dataset.f; $$("#filter button").forEach((x) => x.setAttribute("aria-selected", x === b)); renderSessionList();
});
$("#new-chat").onclick = () => { location.hash = "#/"; setTimeout(() => $(".hero textarea")?.focus(), 50); };
$("#dock-chat").onclick = () => { location.hash = "#/"; setTimeout(() => $(".hero textarea")?.focus(), 50); };
$("#dock-code").onclick = () => openCodeModal();

// ------------------------------------------------------------------ composer
function composer({ placeholder, onSend, running, compact, extra = "" }) {
  const el = h(`<form class="composer">
    <textarea rows="1" placeholder="${esc(placeholder)}" aria-label="Message"></textarea>
    <div class="composer-actions">
      <label class="mini-btn" title="Attach text or code files">${I.clip}<span>Attach</span><input type="file" multiple hidden></label>
      <button class="send ${running ? "stop" : ""}" type="submit" aria-label="${running ? "Stop" : "Send"}">${running ? I.stop : I.send}</button>
    </div>
    <div class="composer-tools">${extra}</div>
  </form>`);
  const ta = $("textarea", el), sendBtn = $(".send", el), tools = $(".composer-tools", el);
  const grow = () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 220) + "px"; };
  const renderAttach = () => {
    $$(".attach-chip", tools).forEach((c) => c.remove());
    S.attachments.forEach((f, i) => {
      const c = h(`<span class="attach-chip">${esc(f.name)}<button type="button" aria-label="Remove">${I.x}</button></span>`);
      $("button", c).onclick = () => { S.attachments.splice(i, 1); renderAttach(); };
      tools.prepend(c);
    });
  };
  ta.addEventListener("input", grow);
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && window.innerWidth > 860) { e.preventDefault(); el.requestSubmit(); }
  });
  $("input[type=file]", el).addEventListener("change", async (e) => {
    for (const f of e.target.files) {
      if (f.size > 300_000) { toast(`${f.name} is too big (300 KB max).`); continue; }
      S.attachments.push({ name: f.name, text: await f.text() });
    }
    e.target.value = ""; renderAttach();
  });
  el.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (sendBtn.classList.contains("stop")) { stopRun(); return; }
    let text = ta.value.trim();
    if (!text && !S.attachments.length) return;
    for (const a of S.attachments) text += `\n\nAttached file \`${a.name}\`:\n\`\`\`\n${a.text}\n\`\`\``;
    sendBtn.disabled = true;
    try { await onSend(text.trim()); ta.value = ""; S.attachments = []; renderAttach(); grow(); }
    catch (err) { toast(err.message); }
    finally { sendBtn.disabled = false; }
  });
  el.setRunning = (r) => { sendBtn.classList.toggle("stop", r); sendBtn.innerHTML = r ? I.stop : I.send; sendBtn.setAttribute("aria-label", r ? "Stop" : "Send"); };
  el.fill = (t) => { ta.value = t; grow(); ta.focus(); };
  renderAttach();
  attachSlash(el);
  return el;
}
function askNotify() {
  if (S.settings.notify !== false && "Notification" in window && Notification.permission === "default") Notification.requestPermission();
}

// ------------------------------------------------------------------ home
function greeting() {
  const hr = new Date().getHours();
  const part = hr < 5 ? "Up late" : hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
  return [part, S.settings.name || ""];
}
async function renderHome() {
  S.view = "home";
  setNav("home");
  const stage = $("#stage");
  stage.innerHTML = "";
  const home = h(`<div class="home"></div>`);
  const [part, who] = greeting();
  const today = new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
  const hero = h(`<section class="hero">
    <div class="hero-watermark" aria-hidden="true">${esc(AN())}</div>
    <div><p class="hero-kicker"><i></i>${esc(today)}</p>
      <h1 class="hero-greet">${esc(part)}${who ? `,<br><b>${esc(who)}.</b>` : "."}</h1><p class="hero-status" id="hero-status">Waking up…</p></div>
    <div class="hero-reli" id="hero-reli">${Reli.svg(210, "idle")}</div>
  </section>`);
  const comp = composer({ placeholder: `Ask ${AN()} anything, or type / for commands…`, onSend: async (text) => {
    if (await runSlash(text)) return;
    askNotify();
    const s = await api("/api/sessions", { method: "POST", body: { mode: "chat" } });
    await api(`/api/sessions/${s.id}/messages`, { method: "POST", body: { content: text } });
    await loadSessions();
    location.hash = "#/c/" + s.id;
  } });
  hero.append(comp);
  const chips = h(`<div class="chips"></div>`);
  for (const c of ["Plan my day from my tasks", "Explain a concept simply", "Draft a polite email", "What do you remember about me?"]) {
    const b = h(`<button class="chip" type="button">${esc(c)}</button>`);
    b.onclick = () => comp.fill(c);
    chips.append(b);
  }
  hero.append(chips);
  home.append(hero);
  const cards = h(`<div class="cards"></div>`);
  home.append(cards);
  stage.append(home);
  try { S.dash = await api("/api/dashboard"); } catch { return; }
  if (S.view !== "home") return;
  const d = S.dash;
  $("#hero-status").textContent = heroLine(d);
  // recent
  const rec = h(`<section class="card c-recent"><div class="card-h"><h2>Recent</h2><span>${d.totals.sessions} conversation${d.totals.sessions === 1 ? "" : "s"}</span></div><div class="recent-row"></div></section>`);
  const row = $(".recent-row", rec);
  if (!d.recent.length) row.append(h(`<p class="empty-note">Your conversations will gather here.</p>`));
  for (const s of d.recent.slice(0, 6)) {
    row.append(h(`<a class="r-card" href="#/c/${s.id}"><span class="r-title">${s.mode === "agent" ? '<span class="s-title" style="display:inline-flex"><span class="code-tag">code</span></span> ' : ""}${esc(s.title)}</span>
      <span class="r-when">${esc(ago(s.updated))}</span><span class="r-sub">${esc(s.mode === "agent" ? "In " + s.workspace : s.last || "")}</span></a>`));
  }
  cards.append(rec);
  // usage
  const week = d.usage.reduce((a, u) => a + u.gen_tokens, 0);
  const replies = d.usage.reduce((a, u) => a + u.chats + u.agent_runs, 0);
  const max = Math.max(1, ...d.usage.map((u) => u.gen_tokens));
  const usage = h(`<section class="card c-usage"><div class="card-h"><h2>This week</h2><span>tokens written each day</span></div>
    <p class="usage-line"><b>${fmtK(week)}</b>tokens across ${replies} repl${replies === 1 ? "y" : "ies"} and tasks</p>
    <div class="bars">${d.usage.map((u, i) => `<div class="bar ${i === 6 ? "today" : ""}" title="${fmtK(u.gen_tokens)} tokens">
      <i style="height:${Math.round((u.gen_tokens / max) * 100)}%"></i>${new Date(u.day + "T12:00").toLocaleDateString([], { weekday: "narrow" })}</div>`).join("")}</div>
    <div class="trio"><div><b>${d.totals.sessions}</b><span>conversations</span></div><div><b>${d.totals.tasks_done}</b><span>tasks done</span></div>
      <div><b>${d.totals.memories}</b><span>things remembered</span></div></div></section>`);
  cards.append(usage);
  const notes = h(`<section class="card c-notes"><div class="card-h"><h2>Notes</h2><a href="#/notes">All notes</a></div><div class="notes-row"></div></section>`);
  if (!d.notes.length) $(".notes-row", notes).append(h(`<p class="empty-note">Ask ${AN()} to "note this" and it lands here.</p>`));
  for (const n of d.notes) $(".notes-row", notes).append(h(`<a class="note-mini" href="#/notes"><b>${esc(n.title)}</b><span>${esc(n.body)}</span></a>`));
  cards.append(notes);
  renderToday(d.tasks, d.overdue);
  setupCard(home, cards);
}

// "Finish setting up": the few things only the owner can do, right on Home until they're done.
async function setupCard(home, cards) {
  const st = await api("/api/settings").catch(() => S.settings);
  const sub = await pushSubscription().catch(() => null);
  const steps = [
    !sub && { id: "push", title: "Get notifications on this device", sub: "Reminders, your morning brief, and a ping when a long reply is ready.", btn: "Turn on" },
    !st.totp && { id: "totp", title: "Turn on two-step sign-in", sub: "Your site is public. With this, a password alone can't open it.", btn: "Set up" },
    !st.name && { id: "name", title: `Tell ${AN()} your name`, sub: "For greetings and your morning brief. Also: weather city and news topics.", btn: "Open settings" },
  ].filter(Boolean);
  if (!steps.length || S.view !== "home") return;
  const card = h(`<section class="card c-setup"><div class="card-h"><h2>Finish setting up</h2><span>${steps.length} left</span></div><div class="setup-list"></div></section>`);
  for (const s of steps) {
    const row = h(`<div class="setup-row"><div><b>${esc(s.title)}</b><span>${esc(s.sub)}</span></div><button class="btn btn-accent btn-small" type="button">${esc(s.btn)}</button></div>`);
    $("button", row).onclick = async () => {
      if (s.id === "push") {
        try { await enablePush(); await api("/api/push/test", { method: "POST" }); toast("Notifications are on. A test is on its way."); row.remove(); }
        catch (e) { toast(e.message); }
      } else if (s.id === "totp") totpSetup();
      else openSettings();
    };
    $(".setup-list", card).append(row);
  }
  cards.prepend(card);
}
function prettyModel(m) { return String(m || "model").replace(/[-_.](UD-)?(Q\d\w*|MXFP4\w*|F16|BF16)$/i, "").replace(/-(\d+)b$/i, " $1B"); }
function heroLine(d) {
  if (!d.online) return `${AN()} is waking up. Replies begin once the model has loaded.`;
  const tps = d.engine.speed.tg_tps;
  const busy = d.engine.active.length;
  const base = `${AN()} is ${busy ? "working on something" : "here"}, running ${prettyModel(d.model.model)} on this machine`;
  return tps ? `${base}. Answers stream at about ${Math.max(1, Math.round(tps))} tokens a second, so a long one takes a minute or two.` : base + ".";
}

// ------------------------------------------------------------------ conversation
async function openSession(sid) {
  if (S.sid !== sid) stopLive();
  S.sid = sid; S.view = "chat"; S.editFrom = null;
  let data;
  try { data = await api(`/api/sessions/${sid}`); } catch (err) { toast(err.message); location.hash = "#/"; return; }
  S.session = data.session; S.messages = data.messages;
  setNav(data.session.mode === "agent" ? "code" : "chat");
  renderConversation();
  if (data.run) startLive(data.run);
  else renderFeed();
}
function renderConversation() {
  const s = S.session, stage = $("#stage");
  stage.classList.add("stage-conv");
  const agent = s.mode === "agent";
  stage.innerHTML = "";
  const band = h(`<div class="band">
    <input class="band-title" value="${esc(s.title)}" aria-label="Conversation title" maxlength="120">
    <a class="band-chip hide-narrow" href="#/fs/${encodeURIComponent(folderOf(s.workspace))}" title="Working folder">${I.folder}${esc(shortPath(folderOf(s.workspace)))}</a>
    <button class="band-chip" id="approval-chip" type="button" title="Whether ${esc(AN())} asks before running commands or changing files">${s.meta.approval === "auto" ? I.bolt + "Auto" : I.hand + "Ask first"}</button>
    <button class="band-chip hide-narrow" id="effort-chip" type="button" title="How long the model thinks before answering">Thinking: ${esc(s.meta.effort || S.settings.effort || "low")}</button>
    <button class="icon-btn" id="session-menu" aria-label="Conversation options">${I.dots}</button>
  </div>`);
  const title = $(".band-title", band);
  title.addEventListener("change", async () => {
    await api(`/api/sessions/${s.id}`, { method: "PATCH", body: { title: title.value } }).catch((e) => toast(e.message));
    s.title = title.value; loadSessions();
  });
  title.addEventListener("keydown", (e) => e.key === "Enter" && title.blur());
  $("#effort-chip", band).onclick = async (e) => {
    const order = ["low", "medium", "high"], cur = s.meta.effort || S.settings.effort || "low";
    s.meta.effort = order[(order.indexOf(cur) + 1) % 3];
    e.currentTarget.textContent = "Thinking: " + s.meta.effort;
    await api(`/api/sessions/${s.id}`, { method: "PATCH", body: { effort: s.meta.effort } });
    toast(s.meta.effort === "low" ? "Quick answers. Best on this machine." : s.meta.effort === "medium" ? "More careful, slower answers." : "Deep thinking. This can take several minutes.");
  };
  const ap = $("#approval-chip", band);
  if (ap) ap.onclick = async () => {
    s.meta.approval = s.meta.approval === "auto" ? "ask" : "auto";
    ap.innerHTML = s.meta.approval === "auto" ? I.bolt + "Auto" : I.hand + "Ask first";
    await api(`/api/sessions/${s.id}`, { method: "PATCH", body: { approval: s.meta.approval, reset_trust: s.meta.approval === "ask" } });
    toast(s.meta.approval === "auto" ? `${AN()} will edit files and run commands without asking.` : `${AN()} will ask before editing files or running commands.`);
  };
  $("#session-menu", band).onclick = () => sessionMenu();
  stage.append(band);
  const tr = h(`<div class="transcript" id="transcript"><div class="t-inner" id="t-inner"></div></div>`);
  stage.append(tr);
  const foot = h(`<div class="stage-foot"></div>`);
  const comp = composer({
    placeholder: agent ? `Describe a change, or type / for commands…` : "Reply, or type / for commands…",
    running: !!S.live,
    onSend: async (text) => {
      if (await runSlash(text)) return;
      askNotify();
      if (S.editFrom) { await api(`/api/sessions/${s.id}/truncate`, { method: "POST", body: { from_id: S.editFrom } }); S.editFrom = null; }
      const run = await api(`/api/sessions/${s.id}/messages`, { method: "POST", body: { content: text } });
      const data = await api(`/api/sessions/${s.id}`);
      S.messages = data.messages; renderMessages();
      startLive(run); loadSessions();
    },
  });
  comp.id = "conv-composer";
  foot.append(comp);
  stage.append(foot);
  renderMessages();
}
function renderMessages() {
  const box = $("#t-inner"); if (!box) return;
  box.innerHTML = "";
  const base = S.live ? S.live.base : Infinity;
  const msgs = S.messages.filter((m) => m.id <= base);
  if (!msgs.length && !S.live) {
    box.append(h(`<div class="t-empty">${Reli.svg(110, "idle")}<h2 class="hero-greet">${S.session.mode === "agent" ? "What should we build?" : "Ask away."}</h2>
      <p>${S.session.mode === "agent" ? "Name the files involved and how to check the result. Small, specific tasks work best on this machine." : `${AN()} runs on your server, so this conversation stays private.`}</p></div>`));
  }
  const results = {};
  for (const m of msgs) if (m.role === "tool") results[m.tool_call_id] = m;
  const lastAi = [...msgs].reverse().find((m) => m.role === "assistant");
  const compacted = msgs.filter((m) => m.meta && m.meta.compacted && (m.role === "user" || (m.role === "assistant" && m.content)));
  if (compacted.length) {
    const d = h(`<details class="compacted"><summary>${compacted.length} earlier message${compacted.length === 1 ? "" : "s"}, compacted</summary><div class="compacted-body"></div></details>`);
    for (const m of compacted) $(".compacted-body", d).append(m.role === "user" ? userBubble(m) : aiBlock({ content: m.content, meta: {} }));
    box.append(d);
  }
  for (const m of msgs) {
    if (m.meta && (m.meta.compacted || m.meta.summary_ack)) continue;
    if (m.meta && m.meta.summary) {
      const c = h(`<details class="summary-card"><summary>Summary of the earlier conversation</summary></details>`);
      c.append(md(m.content.replace(/^\[Summary[^\]]*\]\n?/, "")));
      box.append(c);
      continue;
    }
    if (m.role === "user") box.append(userBubble(m));
    else if (m.role === "assistant") box.append(aiBlock({ content: m.content, reasoning: m.reasoning, meta: m.meta,
      tools: (m.tool_calls || []).map((c) => toolFromCall(c, results[c.id])), id: m.id, last: m === lastAi && !S.live }));
  }
  if (S.live) box.append(h(`<div id="live"></div>`)), renderLive();
  else if (msgs.length && (msgs.at(-1).role === "user" || msgs.at(-1).role === "tool")) {
    // the last reply was interrupted (a restart, or a stop): offer to finish it
    const n = h(`<div class="notice">${esc(AN())} didn't finish replying to this. <button class="btn btn-ghost btn-small" type="button" style="margin-left:8px">Get a reply</button></div>`);
    $("button", n).onclick = regenerate;
    box.append(n);
  }
  scrollDown(true);
}
function toolFromCall(c, res) {
  let args; try { args = JSON.parse(c.function.arguments || "{}"); } catch { args = c.function.arguments; }
  return { id: c.id, name: c.function.name, args, output: res ? res.content : null, ok: res ? res.meta.ok : null };
}
function userBubble(m) {
  const el = h(`<div class="msg-user"><div class="msg-actions"><button aria-label="Edit and resend">${I.pen}</button><button aria-label="Copy">${I.copy}</button></div></div>`);
  el.append(document.createTextNode(m.content));
  const [edit, copy] = $$(".msg-actions button", el);
  edit.onclick = () => { if (S.live) return toast("Stop the running reply first."); S.editFrom = m.id; $("#conv-composer").fill(m.content); toast("Editing. Sending replaces this message and everything after it."); };
  copy.onclick = () => { navigator.clipboard.writeText(m.content); toast("Copied."); };
  return el;
}
function aiBlock(b) {
  const el = h(`<div class="msg-ai"><div class="msg-ai-av">${Reli.svg(26, b.live ? b.state || "writing" : "idle")}</div><div class="msg-ai-body"></div></div>`);
  const body = $(".msg-ai-body", el);
  if (b.reasoning) {
    const th = h(`<details class="thought"><summary>${b.live && !b.content && !b.tools?.length ? "Thinking…" : "Thought it through"}</summary><div class="thought-body"></div></details>`);
    $(".thought-body", th).textContent = b.reasoning;
    body.append(th);
  }
  if (b.content || b.live) {
    const m = md(b.content || "");
    if (b.live && b.streaming) m.classList.add("caret");
    body.append(m);
  }
  if (b.tools && b.tools.length) {
    const tl = h(`<div class="tools"></div>`);
    for (const t of b.tools) tl.append(toolView(t));
    body.append(tl);
  }
  const foot = h(`<div class="msg-foot"></div>`);
  if (b.meta && b.meta.tg_tps) {
    foot.append(h(`<span class="stat">${b.meta.tg_tps.toFixed(1)} tokens/s</span>`));
    if (b.meta.ctx_max) foot.append(h(`<span class="stat" title="How full the model's memory is">${Math.round((b.meta.ctx_used / b.meta.ctx_max) * 100)}% of memory</span>`));
  }
  if (!b.live && b.content) {
    const acts = h(`<div class="msg-actions"><button aria-label="Copy">${I.copy}</button>${b.last ? `<button aria-label="Regenerate">${I.redo}</button>` : ""}</div>`);
    $$("button", acts)[0].onclick = () => { navigator.clipboard.writeText(b.content); toast("Copied."); };
    if (b.last) $$("button", acts)[1].onclick = regenerate;
    foot.append(acts);
  }
  if (foot.children.length) body.append(foot);
  return el;
}
function toolView(t) {
  const kind = TOOL_KIND[t.name] || "run";
  const state = t.awaiting ? "Waiting for you" : t.output == null ? "Working…" : t.ok ? "Done" : "Failed";
  const el = h(`<details class="tool"><summary><span class="tool-kind k-${kind}">${I[kind]}</span><span class="tool-name">${esc(TOOL_VERB[t.name] || t.name)}</span>
    <span class="tool-arg">${esc(toolArg(t.name, t.args))}</span><span class="tool-state ${t.output == null ? "" : t.ok ? "ok" : "bad"}">${state}</span></summary></details>`);
  if (t.output != null) { const pre = h(`<pre class="tool-out"></pre>`); pre.textContent = t.output; el.append(pre); }
  else if (t.name === "write_file" || t.name === "edit_file") {
    const pre = h(`<pre class="tool-out"></pre>`);
    pre.textContent = t.name === "edit_file" ? `--- replace\n${t.args?.old ?? ""}\n+++ with\n${t.args?.new ?? ""}` : (t.args?.content ?? "");
    el.append(pre);
  }
  return el;
}
function approvalCard(t) {
  const what = t.name === "run" ? "Run this command?" : t.name === "write_file" ? `Write ${t.args.path}?` : `Edit ${t.args.path}?`;
  const preview = t.name === "run" ? t.args.command : t.name === "write_file" ? t.args.content : `--- replace\n${t.args.old}\n+++ with\n${t.args.new}`;
  const el = h(`<div class="approval"><div class="approval-q">${esc(what)}</div><pre></pre>
    <div class="approval-btns"><button class="btn btn-ink btn-small" data-a="allow">Allow</button>
    <button class="btn btn-butter btn-small" data-a="always">Allow ${t.name === "run" ? "commands" : "edits"} for this session</button>
    <button class="btn btn-ghost btn-small" data-a="deny">Don't allow</button></div></div>`);
  $("pre", el).textContent = preview;
  el.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-a]"); if (!b) return;
    $$("button", el).forEach((x) => (x.disabled = true));
    try { await api(`/api/runs/${S.live.id}/approve`, { method: "POST", body: { id: t.id, allow: b.dataset.a !== "deny", always: b.dataset.a === "always" } }); }
    catch (err) { toast(err.message); $$("button", el).forEach((x) => (x.disabled = false)); }
  });
  return el;
}
function scrollDown(force) {
  const tr = $("#transcript"); if (!tr) return;
  if (force || tr.scrollHeight - tr.scrollTop - tr.clientHeight < 160) tr.scrollTop = tr.scrollHeight;
}
async function regenerate() {
  try {
    const run = await api(`/api/sessions/${S.sid}/regenerate`, { method: "POST" });
    const data = await api(`/api/sessions/${S.sid}`); S.messages = data.messages;
    startLive(run);
  } catch (err) { toast(err.message); }
}
async function stopRun() {
  if (!S.live) return;
  await api(`/api/runs/${S.live.id}/stop`, { method: "POST" }).catch((e) => toast(e.message));
}
function sessionMenu() {
  const s = S.session;
  const m = openModal(`<div class="modal-in"><div class="modal-h"><h2>${esc(s.title)}</h2><button class="icon-btn" data-close aria-label="Close">${I.x}</button></div>
    <div class="menu-list">
      <button type="button" data-a="pin">${I.pin}<span>${s.pinned ? "Unpin" : "Pin to the top"}</span></button>
      <button type="button" data-a="compact">${I.redo}<span>Compact the conversation</span><small>/compact</small></button>
      <a href="/api/sessions/${s.id}/export" download>${I.copy}<span>Download as Markdown</span></a>
      <a href="#/fs/${encodeURIComponent(folderOf(s.workspace))}">${I.folder}<span>Open the working folder</span></a>
      <button type="button" data-a="delete" class="danger">${I.trash}<span>Delete this conversation</span></button>
    </div></div>`);
  $('[data-a="pin"]', m).onclick = async () => { await api(`/api/sessions/${s.id}`, { method: "PATCH", body: { pinned: !s.pinned } }); s.pinned = !s.pinned; closeModal(); loadSessions(); };
  $('[data-a="compact"]', m).onclick = () => { closeModal(); runSlash("/compact"); };
  $('[data-a="delete"]', m).onclick = () => deleteSession(s);
  $$("a", m).forEach((a) => a.addEventListener("click", () => closeModal()));
}
function deleteSession(s) {
  const c = openModal(`<div class="modal-in"><div class="modal-h"><h2>Delete this conversation?</h2></div>
    <div class="modal-sec"><p>"${esc(s.title)}" and its messages will be removed for good. Files on the server are not touched.</p></div>
    <div class="row-btns"><button class="btn btn-ghost" data-close type="button">Keep it</button><button class="btn btn-danger" data-go type="button">Delete</button></div></div>`);
  $("[data-go]", c).onclick = async () => {
    try { await api(`/api/sessions/${s.id}`, { method: "DELETE" }); }
    catch (e) { toast(e.message); return; }
    closeModal(); await loadSessions();
    if (S.sid === s.id) location.hash = "#/";
    toast("Conversation deleted.");
  };
}

// ------------------------------------------------------------------ slash commands
const SLASH = [
  { n: "new", d: "Start a new chat", run: () => { location.hash = "#/"; } },
  { n: "code", a: "[folder]", d: "Start a coding session in a folder on the server", run: (x) => openCodeModal(x) },
  { n: "compact", a: "[what to keep]", d: "Summarise this conversation to free up the model's memory", conv: true, run: async (x) => {
      const run = await api(`/api/sessions/${S.sid}/compact`, { method: "POST", body: { focus: x } });
      startLive(run); toast("Compacting…"); } },
  { n: "files", a: "[path]", d: "Browse the server's files", run: (x) => { location.hash = "#/fs/" + encodeURIComponent(x || (S.session ? folderOf(S.session.workspace) : "~")); } },
  { n: "effort", a: "low|medium|high", d: "How long to think before answering", conv: true, run: async (x) => {
      if (!["low", "medium", "high"].includes(x)) return toast("Use /effort low, /effort medium or /effort high.");
      await api(`/api/sessions/${S.sid}`, { method: "PATCH", body: { effort: x } }); S.session.meta.effort = x; renderConversation(); toast(`Thinking: ${x}.`); } },
  { n: "auto", d: "Run commands and edit files without asking", conv: true, run: async () => {
      await api(`/api/sessions/${S.sid}`, { method: "PATCH", body: { approval: "auto" } }); S.session.meta.approval = "auto"; renderConversation(); toast("Auto: no more approval prompts in this conversation."); } },
  { n: "ask", d: "Ask before running commands or changing files", conv: true, run: async () => {
      await api(`/api/sessions/${S.sid}`, { method: "PATCH", body: { approval: "ask", reset_trust: true } }); S.session.meta.approval = "ask"; renderConversation(); toast("Asking first again."); } },
  { n: "rename", a: "<title>", d: "Rename this conversation", conv: true, run: async (x) => {
      if (!x) return toast("Add the new title after /rename.");
      await api(`/api/sessions/${S.sid}`, { method: "PATCH", body: { title: x } }); S.session.title = x; renderConversation(); loadSessions(); } },
  { n: "remember", a: "<fact>", d: "Add something to memory", run: async (x) => { if (!x) return toast("What should be remembered?"); await api("/api/memories", { method: "POST", body: { fact: x } }); toast("Remembered."); } },
  { n: "task", a: "<title>", d: "Add a task", run: async (x) => { if (!x) return toast("Add the task after /task."); await api("/api/tasks", { method: "POST", body: { title: x } }); renderToday(); toast("Task added."); } },
  { n: "note", a: "<text>", d: "Save a note", run: async (x) => {
      if (!x) return noteEditor();
      await api("/api/notes", { method: "POST", body: { title: x.split("\n")[0].slice(0, 80), body: x } }); toast("Note saved."); } },
  { n: "search", a: "<words>", d: "Search conversations and notes", run: (x) => openPalette(x) },
  { n: "export", d: "Download this conversation as Markdown", conv: true, run: () => { location.href = `/api/sessions/${S.sid}/export`; } },
  { n: "delete", d: "Delete this conversation", conv: true, run: () => deleteSession(S.session) },
  { n: "help", d: "List the commands", run: () => slashHelp() },
];
async function runSlash(text) {
  const m = text.trim().match(/^\/(\w+)\s*([\s\S]*)$/);
  if (!m) return false;
  const cmd = SLASH.find((c) => c.n === m[1].toLowerCase());
  if (!cmd) { toast(`No command /${m[1]}. Type /help for the list.`); return true; }
  if (cmd.conv && !S.sid) { toast(`/${cmd.n} works inside a conversation.`); return true; }
  try { await cmd.run(m[2].trim()); } catch (e) { toast(e.message); }
  return true;
}
function slashHelp() {
  openModal(`<div class="modal-in"><div class="modal-h"><h2>Commands</h2><button class="icon-btn" data-close aria-label="Close">${I.x}</button></div>
    <div class="modal-sec"><ul class="cmd-list">${SLASH.map((c) => `<li><code>/${c.n}${c.a ? " " + esc(c.a) : ""}</code><span>${esc(c.d)}</span></li>`).join("")}</ul></div></div>`);
}
function attachSlash(form) {
  const ta = $("textarea", form);
  const pop = h(`<div class="slash-pop" role="listbox" hidden></div>`);
  form.append(pop);
  let items = [], sel = 0;
  const show = () => {
    const v = ta.value;
    const m = v.match(/^\/(\w*)$/);
    if (!m) { pop.hidden = true; return; }
    items = SLASH.filter((c) => c.n.startsWith(m[1].toLowerCase()) && (!c.conv || S.sid));
    if (!items.length) { pop.hidden = true; return; }
    sel = Math.min(sel, items.length - 1);
    pop.innerHTML = items.map((c, i) => `<button type="button" role="option" aria-selected="${i === sel}" data-i="${i}"><code>/${c.n}</code>${c.a ? `<i>${esc(c.a)}</i>` : ""}<span>${esc(c.d)}</span></button>`).join("");
    pop.hidden = false;
  };
  const pick = (i) => { ta.value = "/" + items[i].n + (items[i].a ? " " : ""); pop.hidden = true; ta.focus(); if (!items[i].a) form.requestSubmit(); };
  ta.addEventListener("input", () => { sel = 0; show(); });
  ta.addEventListener("keydown", (e) => {
    if (pop.hidden) return;
    if (e.key === "ArrowDown") { e.preventDefault(); sel = (sel + 1) % items.length; show(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = (sel - 1 + items.length) % items.length; show(); }
    else if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) { e.preventDefault(); e.stopImmediatePropagation(); pick(sel); }
    else if (e.key === "Escape") pop.hidden = true;
  }, true);
  pop.addEventListener("mousedown", (e) => { const b = e.target.closest("button[data-i]"); if (b) { e.preventDefault(); pick(+b.dataset.i); } });
  ta.addEventListener("blur", () => setTimeout(() => (pop.hidden = true), 150));
}

// ------------------------------------------------------------------ live runs// ------------------------------------------------------------------ live runs
function stopLive() { if (S.live && S.live.es) S.live.es.close(); S.live = null; }
function startLive(run) {
  stopLive();
  const L = S.live = { id: run.id, base: run.base_message_id ?? -1, events: [], blocks: [], phase: "queued", progress: null,
    notices: [], started: run.created || Date.now() / 1000, finished: false };
  S.feeds[run.id] = S.feeds[run.id] || [];
  S.lastFeedRun = run.id;
  $("#conv-composer")?.setRunning(true);
  renderMessages();
  connect(L, -1);
}
function connect(L, after) {
  const es = new EventSource(`/api/runs/${L.id}/events?after=${after}`);
  L.es = es;
  es.onmessage = (e) => { const ev = JSON.parse(e.data); if (ev.seq <= (L.events.at(-1)?.seq ?? -1)) return; L.events.push(ev); applyEvent(L, ev); };
  es.onerror = async () => {
    es.close();
    if (L.finished || S.live !== L) return;
    await sleep(2500);
    if (S.live !== L || L.finished) return;
    // Is this run still alive? After a server restart it may have been resumed as a new run, or be gone.
    const st = await api(`/api/sessions/${S.sid}`).catch(() => undefined);
    if (S.live !== L || L.finished) return;
    if (st === undefined) return connect(L, L.events.at(-1)?.seq ?? -1);   // server unreachable: keep trying
    if (st.run && st.run.id === L.id) return connect(L, L.events.at(-1)?.seq ?? -1);
    L.finished = true;
    S.messages = st.messages; S.session = st.session;
    if (st.run) { startLive(st.run); toast(`${AN()} picked the reply up again.`); }
    else { S.live = null; renderMessages(); $("#conv-composer")?.setRunning(false); renderFeed(); }
  };
}
let liveFrame = 0;
function applyEvent(L, ev) {
  const cur = () => { let b = L.blocks.at(-1); if (!b || b.closed) { b = { live: true, content: "", reasoning: "", tools: [], streaming: true }; L.blocks.push(b); } return b; };
  const feed = S.feeds[L.id];
  switch (ev.type) {
    case "phase":
      L.phase = ev.phase;
      if (ev.phase === "queued") feed.push({ t: ev.t, k: "wait", text: `Waiting its turn${ev.position > 1 ? ` (${ev.position - 1} ahead)` : ""}` });
      if (ev.phase === "reading") { L.progress = null; L.readStart = ev.t; feed.push({ t: ev.t, k: "read", text: "Reading the conversation" }); }
      if (ev.phase === "writing") { feed.push({ t: ev.t, k: "write", text: "Writing" }); cur(); }
      break;
    case "progress": L.progress = ev; break;
    case "reasoning": cur().reasoning += ev.text; break;
    case "content": cur().content += ev.text; break;
    case "message": {
      const b = cur(); b.closed = true; b.streaming = false; b.content = ev.content; b.reasoning = ev.reasoning; b.meta = ev.meta;
      b.tools = (ev.tool_calls || []).map((c) => toolFromCall(c, null));
      break;
    }
    case "tool_call": { const t = findTool(L, ev.id); if (t && typeof ev.args === "object") t.args = ev.args; break; }
    case "approval": { const t = findTool(L, ev.id); if (t) t.awaiting = true; L.phase = "awaiting";
      feed.push({ t: ev.t, k: "ask", text: `Asking to ${ev.name === "run" ? "run a command" : "change " + (ev.args.path || "a file")}`, sub: ev.name === "run" ? ev.args.command : "" });
      notify(`${AN()} needs your OK`, ev.name === "run" ? ev.args.command : `Change ${ev.args.path}`); break; }
    case "approval_result": { const t = findTool(L, ev.id); if (t) t.awaiting = false; if (!ev.allow) feed.push({ t: ev.t, k: "no", text: "You said no" }); break; }
    case "tool_result": { const t = findTool(L, ev.id); if (t) { t.output = ev.output; t.ok = ev.ok; }
      feed.push({ t: ev.t, k: ev.ok ? "ok" : "bad", text: `${TOOL_VERB[ev.name] || ev.name}`, sub: t ? toolArg(ev.name, t.args) : "" }); break; }
    case "stats": L.stats = ev; break;
    case "todo": L.todos = ev.items; if (S.session) S.session.meta.todos = ev.items; break;
    case "notice": L.notices.push({ text: ev.text }); feed.push({ t: ev.t, k: "wait", text: ev.text }); break;
    case "error": L.notices.push({ text: ev.message, err: true }); feed.push({ t: ev.t, k: "bad", text: "Something went wrong", sub: ev.message }); finish(L, "error"); return;
    case "stopped": feed.push({ t: ev.t, k: "no", text: "Stopped" }); finish(L, "stopped"); return;
    case "done": feed.push({ t: ev.t, k: "ok", text: `Finished in ${dur(ev.t - L.started)}` }); finish(L, "done"); return;
  }
  if (!liveFrame) liveFrame = requestAnimationFrame(() => { liveFrame = 0; if (S.live === L) { renderLive(); renderFeed(); } });
}
function findTool(L, id) { for (const b of L.blocks) for (const t of b.tools) if (t.id === id) return t; return null; }
async function finish(L, how) {
  L.finished = true; L.es && L.es.close();
  renderFeed();
  if (how === "done" && document.hidden) notify(`${AN()} finished`, S.session ? S.session.title : "Your reply is ready");
  if (S.live !== L) return;
  const data = await api(`/api/sessions/${S.sid}`).catch(() => null);
  S.live = null;
  if (data) { S.messages = data.messages; S.session = data.session; }
  renderMessages();
  for (const n of L.notices) $("#t-inner")?.append(h(`<div class="notice ${n.err ? "err" : ""}">${esc(n.text)}</div>`));
  $("#conv-composer")?.setRunning(false);
  loadSessions(); pollStatus(true);
}
function notify(title, body) {
  if (!document.hidden || S.settings.notify === false || !("Notification" in window) || Notification.permission !== "granted") return;
  try { new Notification(title, { body: String(body || "").slice(0, 140), icon: "/icon.svg", tag: "reliquary" }); } catch { /* not supported */ }
}
function renderLive() {
  const box = $("#live"), L = S.live; if (!box || !L) return;
  box.innerHTML = "";
  for (const b of L.blocks) {
    const el = aiBlock({ ...b, state: L.phase === "writing" ? "writing" : L.phase });
    box.append(el);
    for (const t of b.tools) if (t.awaiting) el.querySelector(".msg-ai-body").append(approvalCard(t));
  }
  const p = L.progress;
  if (L.phase === "reading" || L.phase === "queued" || L.phase === "tool") {
    let title = "Waiting its turn", sub = "Another reply is using the model. Yours starts right after.", pct = 0;
    if (L.phase === "tool") { title = "Using a tool"; sub = "Running in the workbench."; }
    if (L.phase === "reading") {
      title = "Reading"; sub = "Taking in the conversation before answering.";
      if (p && p.total) {
        const todo = Math.max(1, p.total - p.cache), done = Math.max(0, p.processed - p.cache);
        pct = done / todo;
        const speed = S.status?.engine.speed.pp_tps || 20;
        sub = `${fmtK(done)} of ${fmtK(todo)} new tokens${p.cache ? ` (${fmtK(p.cache)} remembered)` : ""}. About ${dur((todo - done) / speed)} left.`;
      }
    }
    box.append(h(`<div class="reading-card">${Reli.svg(54, L.phase, pct)}<div><b>${title}</b><p>${esc(sub)}</p>
      ${L.phase === "reading" ? `<div class="meter"><i style="width:${Math.round(pct * 100)}%"></i></div>` : ""}</div></div>`));
  }
  scrollDown();
}

// ------------------------------------------------------------------ right column: feed, today, machine
const FEED_ICON = { read: ["#8FC9B0", ""], write: ["var(--ember)", ""], ok: ["var(--ok)", ""], bad: ["var(--bad)", ""],
  ask: ["var(--warn)", ""], wait: ["#9DB4FF", ""], no: ["var(--faint)", ""] };
function renderFeed() {
  const L = S.live;
  const state = L ? L.phase : "idle";
  $("#log-reli").innerHTML = Reli.svg(46, L ? (state === "writing" ? "writing" : state) : "idle", L?.progress ? (L.progress.processed - L.progress.cache) / Math.max(1, L.progress.total - L.progress.cache) : 0);
  $("#log-state").textContent = L ? Reli.label(state) : "resting"; $("#log-title").textContent = AN();
  renderPlan(L ? L.todos || S.session?.meta?.todos : S.session?.meta?.todos);
  const feedEl = $("#feed");
  const items = S.feeds[L ? L.id : S.lastFeedRun] || [];
  feedEl.innerHTML = "";
  if (!items.length) {
    const others = S.status?.engine.active.filter((r) => r.session_id !== S.sid) || [];
    feedEl.append(h(`<li class="feed-empty">${others.length ? "Working in another conversation." : `Nothing running. Steps show up here as ${AN()} works.`}</li>`));
    for (const r of others) {
      const s = S.sessions.find((x) => x.id === r.session_id);
      feedEl.append(h(`<li><time>${clock(r.created)}</time><span class="f-ico" style="background:var(--lilac)">${I.dots}</span><span class="f-text"><a href="#/c/${r.session_id}">${esc(s ? s.title : "Open it")}</a></span></li>`));
    }
    return;
  }
  for (const it of items.slice(-40)) {
    const [bg, ico] = FEED_ICON[it.k] || FEED_ICON.wait;
    feedEl.append(h(`<li><time>${clock(it.t)}</time><span class="f-ico" style="background:${bg}">${ico}</span>
      <span class="f-text">${esc(it.text)}${it.sub ? `<small>${esc(String(it.sub).slice(0, 120))}</small>` : ""}</span></li>`));
  }
  feedEl.scrollTop = feedEl.scrollHeight;
}
function fmtDue(due) {
  const d = new Date(due.slice(0, 10) + "T12:00");
  const day = d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
  return due.length > 10 ? `${day}, ${due.slice(11, 16)}` : day;
}
function renderPlan(items) {
  let box = $("#plan");
  if (!items || !items.length || !S.sid) { if (box) box.remove(); return; }
  if (!box) { box = h(`<section class="plan" id="plan"></section>`); $(".log-live").after(box); }
  const done = items.filter((i) => i.status === "done").length;
  box.innerHTML = `<div class="plan-h"><h3>Plan</h3><span>${done} of ${items.length}</span></div>
    <div class="meter"><i style="width:${Math.round((done / items.length) * 100)}%"></i></div><ol></ol>`;
  for (const it of items) {
    const li = h(`<li class="p-${it.status}"><span class="p-mark" aria-hidden="true"></span><span></span></li>`);
    $$("span", li)[1].textContent = it.text;
    li.setAttribute("aria-label", `${it.text}: ${it.status.replace("_", " ")}`);
    $("ol", box).append(li);
  }
}
async function renderToday(tasks, overdue) {
  if (!tasks) tasks = await api("/api/tasks").catch(() => []);
  const today = new Date().toISOString().slice(0, 10);
  const box = $("#today");
  box.innerHTML = `<h3>Today</h3><ul></ul><form class="sticky-add"><input placeholder="Add a task" aria-label="New task"></form>`;
  const ul = $("ul", box);
  if (!tasks.length) ul.append(h(`<li><span></span><small>Nothing on your list. Add something, or ask ${AN()} to remind you.</small></li>`));
  for (const t of tasks.slice(0, 7)) {
    const li = h(`<li class="${t.due && t.due < today ? "over" : ""}"><input type="checkbox" aria-label="Done"><span>${esc(t.title)}${t.due ? `<br><small>${t.due.slice(0, 10) < today ? "Overdue, " : ""}${esc(fmtDue(t.due))}</small>` : ""}</span></li>`);
    $("input", li).onchange = async () => { await api(`/api/tasks/${t.id}`, { method: "PATCH", body: { done: true } }); li.remove(); toast("Nice. Task done."); };
    ul.append(li);
  }
  $("form", box).onsubmit = async (e) => {
    e.preventDefault(); const inp = $("input", e.target); if (!inp.value.trim()) return;
    await api("/api/tasks", { method: "POST", body: { title: inp.value } }); inp.value = ""; renderToday();
    if (location.hash.startsWith("#/tasks")) renderTasks();
  };
}
function renderMachine() {
  const st = S.status; if (!st) return;
  const sv = st.server || {}, m = st.model || {};
  const memPct = sv.mem_total ? sv.mem_used / sv.mem_total : 0;
  $("#machine").innerHTML = `<h3>The machine</h3>
    <div class="m-row"><span>Model</span><b>${esc(m.model ? prettyModel(m.model) : "offline")}</b></div>
    <div class="m-row"><span>Memory in use</span><b>${sv.mem_total ? (sv.mem_used / 1073741824).toFixed(1) + " of " + (sv.mem_total / 1073741824).toFixed(0) + " GB" : "unknown"}</b>
      <div class="meter"><i style="width:${Math.round(memPct * 100)}%"></i></div></div>
    <div class="m-row"><span>Temperature</span><b>${sv.temp ? Math.round(sv.temp) + " °C" : "unknown"}</b></div>
    <div class="m-row"><span>Reading speed</span><b>${st.engine.speed.pp_tps ? st.engine.speed.pp_tps + " tokens/s" : "not measured yet"}</b></div>
    <div class="m-row"><span>Writing speed</span><b>${st.engine.speed.tg_tps ? st.engine.speed.tg_tps + " tokens/s" : "not measured yet"}</b></div>
    <div class="m-row"><span>Up for</span><b>${sv.uptime ? dur(sv.uptime) : "unknown"}</b></div>`;
}
let pollTimer;
async function pollStatus(once) {
  clearTimeout(pollTimer);
  try {
    const prev = S.status;
    S.status = await api("/api/status");
    const st = S.status, busy = st.engine.active.length > 0;
    $("#speed-pill").innerHTML = `<i class="dot ${!st.online ? "off" : busy ? "busy" : ""}"></i><span>${esc(prettyModel(st.model.model))}</span>${st.engine.speed.tg_tps ? `<b>${st.engine.speed.tg_tps.toFixed(1)}/s</b>` : ""}`;
    renderMachine();
    const changed = !prev || JSON.stringify(prev.engine.active.map((r) => r.id)) !== JSON.stringify(st.engine.active.map((r) => r.id));
    if (changed) { renderSessionList(); if (!S.live) renderFeed(); loadWorkspaces(); }
    if (S.view === "home" && !S.sid && $("#hero-status") && S.dash) $("#hero-status").textContent = heroLine({ ...S.dash, ...st, engine: st.engine });
  } catch { /* offline: try again later */ }
  if (!once) pollTimer = setTimeout(pollStatus, S.status?.engine.active.length ? 4000 : 15000);
}
$("#speed-pill").onclick = () => { $("#log").classList.add("open"); $("#scrim").hidden = false; };

// ------------------------------------------------------------------ code sessions & workspaces
function openCodeModal(prefill) {
  const recent = [...new Set(S.sessions.filter((s) => s.mode === "agent" && s.workspace).map((s) => folderOf(s.workspace)))].slice(0, 6);
  const m = openModal(`<form class="modal-in"><div class="modal-h"><h2>Start coding</h2><button class="icon-btn" type="button" data-close aria-label="Close">${I.x}</button></div>
    <div class="modal-sec">
      <label class="field"><span>Folder on the server</span><input name="cwd" required placeholder="~/projects/my-app"><small>Any path. It's created if it doesn't exist.</small></label>
      ${recent.length ? `<div class="chips">${recent.map((f) => `<button class="chip" type="button" data-f="${esc(f)}">${esc(shortPath(f))}</button>`).join("")}</div>` : ""}
      <label class="field"><span>Clone a git repository into it (optional)</span><input name="git" placeholder="https://github.com/you/repo.git"></label>
      <label class="field"><span>What should ${esc(AN())} do? (optional)</span><textarea name="task" rows="3" placeholder="e.g. Get it running and tell me how it's structured."></textarea></label>
      <p class="form-error"></p></div>
    <div class="row-btns"><a class="btn btn-ghost" href="#/fs" data-close>Browse files instead</a><button class="btn btn-accent" type="submit">Start</button></div></form>`);
  const f = $("form", m);
  f.cwd.value = typeof prefill === "string" && prefill ? prefill : (recent[0] || "~/projects/");
  $$("[data-f]", m).forEach((b) => (b.onclick = () => { f.cwd.value = b.dataset.f; }));
  f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = $("button[type=submit]", f), err = $(".form-error", f);
    btn.disabled = true; err.textContent = "";
    try {
      const cwd = f.cwd.value.trim().replace(/\/+$/, "") || "~";
      await api("/api/fs/mkdir", { method: "POST", body: { path: cwd } }).catch((x) => { if (/two-step/i.test(x.message)) throw x; });
      await startCode(cwd, f.git.value.trim(), f.task.value.trim());
    } catch (x) { err.textContent = x.message; btn.disabled = false; }
  };
}
async function startCode(cwd, git, task) {
  const s = await api("/api/sessions", { method: "POST", body: { mode: "agent", cwd, approval: S.settings.approval || "ask" } });
  closeModal(); await loadSessions(); location.hash = "#/c/" + s.id;
  const first = [git && `Clone ${git} into this folder (it may be empty).`, task].filter(Boolean).join(" ");
  if (first) {
    const run = await api(`/api/sessions/${s.id}/messages`, { method: "POST", body: { content: first } });
    setTimeout(async () => { const d = await api(`/api/sessions/${s.id}`); if (S.sid === s.id) { S.messages = d.messages; startLive(run); } }, 300);
  }
}

// ------------------------------------------------------------------ the server's files
const FS = { path: "~", items: [], hidden: false, open: null };
async function renderFS(path) {
  S.view = "fs"; setNav("files");
  const stage = $("#stage");
  stage.classList.add("stage-conv");
  stage.innerHTML = "";
  let data;
  try { data = await api(`/api/fs/list?path=${encodeURIComponent(path || "~")}`); }
  catch (e) {
    if (/two-step/i.test(e.message)) {
      stage.innerHTML = `<div class="page"><div class="page-h"><div><h1>Files</h1><p>Browse, edit and manage everything on your server.</p></div></div>
        <div class="card lock-card"><b>Server access is locked</b><p>Because this site is public, ${esc(AN())} and this page can only touch your server once two-step sign-in is on. It takes a minute with an authenticator app.</p>
        <button class="btn btn-accent" type="button">Set up two-step sign-in</button></div></div>`;
      $(".lock-card button", stage).onclick = totpSetup;
    } else {
      stage.innerHTML = `<div class="page"><div class="notice err">${esc(e.message)}</div><p><a href="#/fs">Back to your home folder</a></p></div>`;
    }
    return;
  }
  FS.path = data.path; FS.items = data.items; FS.home = data.home;
  const parts = data.path.split("/").filter(Boolean);
  const crumbs = [`<a href="#/fs/${encodeURIComponent("/")}">/</a>`].concat(parts.map((p, i) =>
    `<a href="#/fs/${encodeURIComponent("/" + parts.slice(0, i + 1).join("/"))}">${esc(p)}</a>`)).join(`<span class="sep">/</span>`);
  const band = h(`<div class="band fs-band"><nav class="crumbs" aria-label="Path">${crumbs}</nav>
    <button class="band-chip" data-a="home" type="button" title="Home folder">${I.folder}Home</button>
    <button class="band-chip" data-a="ask" type="button">${I.chat}Ask ${esc(AN())} here</button>
    <button class="band-chip hide-narrow" data-a="code" type="button">${I.code}Code here</button>
    <button class="icon-btn" data-a="more" type="button" aria-label="More">${I.dots}</button></div>`);
  stage.append(band);
  const wrap = h(`<div class="fs"><section class="fs-list">
      <div class="fs-tools"><button class="mini-btn" data-a="up" type="button">↑ Up</button><button class="mini-btn" data-a="newdir" type="button">New folder</button>
        <button class="mini-btn" data-a="newfile" type="button">New file</button><label class="mini-btn">Upload<input type="file" multiple hidden></label>
        <label class="mini-btn fs-hidden"><input type="checkbox"${FS.hidden ? " checked" : ""}> Hidden files</label></div>
      <div class="fs-rows" role="list"></div></section>
    <section class="fs-view"><div class="fs-empty">Pick a file to view or edit it.</div></section></div>`);
  stage.append(wrap);
  const rows = $(".fs-rows", wrap);
  const list = data.items.filter((it) => FS.hidden || !it.name.startsWith("."));
  if (!list.length) rows.append(h(`<p class="empty-note">This folder is empty.</p>`));
  for (const it of list) {
    const full = (data.path === "/" ? "" : data.path) + "/" + it.name;
    const r = h(`<div class="fs-row" role="listitem"><button type="button" class="fs-name">${it.dir ? I.folder : `<span class="fs-ext">${esc((it.name.split(".").pop() || "").slice(0, 4))}</span>`}<span>${esc(it.name)}${it.link ? " ↗" : ""}</span></button>
      <span class="fs-size">${it.dir ? "" : fmtSize(it.size)}</span><span class="fs-time">${esc(ago(it.mtime))}</span>
      <span class="fs-acts"><button type="button" data-a="rename" title="Rename" aria-label="Rename">${I.pen}</button><button type="button" data-a="del" title="Move to trash" aria-label="Move to trash">${I.trash}</button></span></div>`);
    $(".fs-name", r).onclick = () => (it.dir ? (location.hash = "#/fs/" + encodeURIComponent(full)) : openFsFile(full, it));
    $('[data-a="rename"]', r).onclick = () => fsRename(full);
    $('[data-a="del"]', r).onclick = () => fsDelete(full, it.dir);
    rows.append(r);
  }
  const act = (a) => $(`[data-a="${a}"]`, stage);
  act("up").onclick = () => { location.hash = "#/fs/" + encodeURIComponent(data.path.replace(/\/[^/]+\/?$/, "") || "/"); };
  act("home").onclick = () => { location.hash = "#/fs/" + encodeURIComponent(data.home || "~"); };
  act("ask").onclick = () => startChatIn(data.path);
  act("code").onclick = () => openCodeModal(data.path);
  act("more").onclick = () => { openModal(`<div class="modal-in"><div class="modal-h"><h2>${esc(shortPath(data.path))}</h2><button class="icon-btn" data-close aria-label="Close">${I.x}</button></div>
      <div class="menu-list"><button type="button" data-m="code">${I.code}<span>Start a coding session here</span></button>
      <button type="button" data-m="trash">${I.trash}<span>Open the trash</span><small>deleted files go here</small></button></div></div>`);
    $('[data-m="code"]').onclick = () => openCodeModal(data.path);
    $('[data-m="trash"]').onclick = () => { closeModal(); location.hash = "#/fs/" + encodeURIComponent("~/.local/share/riri/trash"); }; };
  act("newdir").onclick = async () => { const n = prompt("Name of the new folder"); if (!n) return;
    try { await api("/api/fs/mkdir", { method: "POST", body: { path: data.path + "/" + n } }); renderFS(data.path); } catch (e) { toast(e.message); } };
  act("newfile").onclick = async () => { const n = prompt("Name of the new file"); if (!n) return;
    try { await api("/api/fs/write", { method: "POST", body: { path: data.path + "/" + n, content: "" } }); await renderFS(data.path); openFsFile(data.path + "/" + n, { size: 0 }); } catch (e) { toast(e.message); } };
  $(".fs-hidden input", wrap).onchange = (e) => { FS.hidden = e.target.checked; renderFS(data.path); };
  $(".fs-tools input[type=file]", wrap).onchange = async (e) => {
    for (const file of e.target.files) {
      toast(`Uploading ${file.name}…`);
      const r = await fetch(`/api/fs/upload?path=${encodeURIComponent(data.path + "/" + file.name)}`, { method: "POST", body: file,
        headers: { "X-Reliquary": "1" }, credentials: "same-origin" });
      if (!r.ok) toast(`${file.name}: upload failed (${r.status}).`);
    }
    renderFS(data.path);
  };
  renderFeed();
}
function fmtSize(n) { return n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(1) + " KB" : n < 1073741824 ? (n / 1048576).toFixed(1) + " MB" : (n / 1073741824).toFixed(2) + " GB"; }
async function openFsFile(path, it) {
  const view = $(".fs-view");
  view.innerHTML = `<div class="fs-empty">Opening…</div>`;
  let f;
  try { f = await api(`/api/fs/read?path=${encodeURIComponent(path)}`); } catch (e) { view.innerHTML = `<div class="notice err">${esc(e.message)}</div>`; return; }
  const name = path.split("/").pop();
  view.innerHTML = `<div class="fs-view-h"><b title="${esc(path)}">${esc(name)}</b><span>${fmtSize(f.size)}${f.truncated ? ", showing the start" : ""}</span>
    <span class="grow"></span><button class="mini-btn" data-v="ask" type="button">Ask ${esc(AN())}</button>
    <a class="mini-btn" href="/api/fs/download?path=${encodeURIComponent(path)}">Download</a>
    ${f.binary || f.truncated ? "" : `<button class="btn btn-accent btn-small" data-v="save" type="button" disabled>Save</button>`}</div>`;
  if (f.binary) view.append(h(`<div class="fs-empty">This is a binary file. Download it to open it.</div>`));
  else {
    const ta = h(`<textarea class="fs-edit" spellcheck="false"></textarea>`);
    ta.value = f.text; view.append(ta);
    const save = $('[data-v="save"]', view);
    if (save) {
      ta.addEventListener("input", () => (save.disabled = false));
      ta.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); save.click(); } });
      save.onclick = async () => { save.disabled = true;
        try { await api("/api/fs/write", { method: "POST", body: { path, content: ta.value } }); toast(`Saved ${name}.`); } catch (e) { toast(e.message); save.disabled = false; } };
    }
  }
  $('[data-v="ask"]', view).onclick = () => startChatIn(path.replace(/\/[^/]+$/, "") || "/", `Have a look at ${path}. `);
}
async function startChatIn(cwd, prefill) {
  const s = await api("/api/sessions", { method: "POST", body: { mode: "chat", cwd } });
  await loadSessions(); location.hash = "#/c/" + s.id;
  if (prefill) setTimeout(() => $("#conv-composer")?.fill(prefill), 400);
}
async function fsRename(path) {
  const n = prompt("New name", path.split("/").pop()); if (!n) return;
  try { await api("/api/fs/rename", { method: "POST", body: { path, to: path.replace(/[^/]+$/, n) } }); renderFS(FS.path); } catch (e) { toast(e.message); }
}
function fsDelete(path, dir) {
  const c = openModal(`<div class="modal-in"><div class="modal-h"><h2>Move to the trash?</h2></div>
    <div class="modal-sec"><p><code>${esc(path)}</code>${dir ? " and everything in it" : ""} will be moved to <code>~/.local/share/riri/trash</code>, where you can restore it.</p></div>
    <div class="row-btns"><button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn btn-danger" data-go type="button">Move to trash</button></div></div>`);
  $("[data-go]", c).onclick = async () => { try { await api("/api/fs/delete", { method: "POST", body: { path } }); closeModal(); toast("Moved to the trash."); renderFS(FS.path); } catch (e) { toast(e.message); } };
}

// ------------------------------------------------------------------ tasks, notes, memory
async function renderTasks() {
  S.view = "tasks"; setNav("tasks");
  const stage = $("#stage");
  stage.innerHTML = `<div class="page"><div class="page-h"><div><h1>Tasks</h1><p>Your list. ${AN()} can add to it and tick things off when you ask.</p></div></div>
    <form class="add-row"><input class="grow" name="title" placeholder="What needs doing?" required aria-label="Task">
      <input name="due" type="date" aria-label="Due date"><input name="at" type="time" aria-label="Reminder time (optional)" title="Add a time to get a notification then">
      <button class="btn btn-accent" type="submit">Add task</button></form>
    <div class="board" id="board"></div><details class="done-list"><summary>Done</summary><ul id="done"></ul></details></div>`;
  $(".add-row", stage).onsubmit = async (e) => {
    e.preventDefault(); const f = new FormData(e.target);
    const due = f.get("due") ? (f.get("at") ? `${f.get("due")} ${f.get("at")}` : f.get("due")) : (f.get("at") ? `${new Date().toISOString().slice(0, 10)} ${f.get("at")}` : null);
    await api("/api/tasks", { method: "POST", body: { title: f.get("title"), due } });
    e.target.reset(); renderTasks(); renderToday();
  };
  const [open, done] = await Promise.all([api("/api/tasks"), api("/api/tasks?done=1")]);
  const today = new Date().toISOString().slice(0, 10);
  const board = $("#board");
  if (!open.length) board.append(h(`<p class="empty-note" style="padding:16px">All clear. Add a task above, or tell ${AN()} "remind me to…" in a chat.</p>`));
  for (const t of open) {
    const el = h(`<div class="task"><input type="checkbox" aria-label="Mark done"><div><div class="task-title"></div>${t.notes ? `<div class="task-notes">${esc(t.notes)}</div>` : ""}</div>
      <span class="task-due ${t.due && t.due.slice(0, 10) < today ? "over" : ""}">${t.due ? (t.due.slice(0, 10) < today ? "Overdue, " : "") + esc(fmtDue(t.due)) : ""}</span>
      <button class="task-del" aria-label="Delete task">${I.trash}</button></div>`);
    $(".task-title", el).textContent = t.title;
    $("input", el).onchange = async () => { await api(`/api/tasks/${t.id}`, { method: "PATCH", body: { done: true } }); renderTasks(); renderToday(); };
    $(".task-del", el).onclick = async () => { await api(`/api/tasks/${t.id}`, { method: "DELETE" }); renderTasks(); renderToday(); };
    board.append(el);
  }
  for (const t of done.slice(0, 50)) $("#done").append(h(`<li>${esc(t.title)}</li>`));
  renderFeed();
}
async function renderNotes() {
  S.view = "notes"; setNav("notes");
  const stage = $("#stage");
  stage.innerHTML = `<div class="page"><div class="page-h"><div><h1>Notes</h1><p>Saved by you, or by ${AN()} when you say "note this".</p></div>
    <button class="btn btn-accent" id="new-note">New note</button></div><div class="notes-grid" id="notes"></div></div>`;
  $("#new-note").onclick = () => noteEditor();
  const notes = await api("/api/notes");
  const grid = $("#notes");
  if (!notes.length) grid.append(h(`<p class="empty-note">No notes yet.</p>`));
  for (const n of notes) {
    const el = h(`<article class="note" tabindex="0"><h3>${n.pinned ? "" : ""}${esc(n.title)}</h3><small>${esc(ago(n.updated))}</small></article>`);
    el.insertBefore(md(n.body), $("small", el));
    el.onclick = () => noteEditor(n);
    el.onkeydown = (e) => e.key === "Enter" && noteEditor(n);
    grid.append(el);
  }
  renderFeed();
}
function noteEditor(n) {
  const m = openModal(`<form class="modal-in"><div class="modal-h"><h2>${n ? "Edit note" : "New note"}</h2><button class="icon-btn" type="button" data-close aria-label="Close">${I.x}</button></div>
    <div class="modal-sec"><label class="field"><span>Title</span><input name="title" required></label>
    <label class="field"><span>Note (Markdown works)</span><textarea name="body" rows="10"></textarea></label>
    <label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" name="pinned"> Pin to the top</label></div>
    <div class="row-btns">${n ? `<button class="btn btn-danger" type="button" data-del>Delete</button>` : ""}<button class="btn btn-ink" type="submit">Save note</button></div></form>`);
  const f = $("form", m);
  f.title.value = n?.title || ""; f.body.value = n?.body || ""; f.pinned.checked = !!n?.pinned;
  f.onsubmit = async (e) => {
    e.preventDefault();
    const body = { title: f.title.value, body: f.body.value, pinned: f.pinned.checked ? 1 : 0 };
    n ? await api(`/api/notes/${n.id}`, { method: "PATCH", body }) : await api("/api/notes", { method: "POST", body });
    closeModal(); renderNotes(); toast("Note saved.");
  };
  const del = $("[data-del]", m);
  if (del) del.onclick = async () => { await api(`/api/notes/${n.id}`, { method: "DELETE" }); closeModal(); renderNotes(); toast("Note deleted."); };
}
async function renderMemory() {
  S.view = "memory"; setNav("memory");
  const stage = $("#stage");
  stage.innerHTML = `<div class="page"><div class="page-h"><div><h1>Memory</h1><p>What ${AN()} knows about you. New chats start with these in mind.</p></div></div>
    <form class="add-row"><input class="grow" name="fact" placeholder="e.g. I prefer short answers with examples" required aria-label="Fact">
      <button class="btn btn-accent" type="submit">Remember this</button></form><ul class="mem-list" id="mems"></ul></div>`;
  $(".add-row", stage).onsubmit = async (e) => {
    e.preventDefault(); await api("/api/memories", { method: "POST", body: { fact: new FormData(e.target).get("fact") } }); renderMemory();
  };
  const mems = await api("/api/memories");
  const ul = $("#mems");
  if (!mems.length) ul.append(h(`<p class="empty-note">Nothing yet. Tell ${AN()} "remember that…" in a chat, or add a fact above.</p>`));
  for (const mm of mems) {
    const li = h(`<li><span class="s-ico">${I.heart}</span><span></span><button class="task-del" aria-label="Forget this">${I.trash}</button></li>`);
    $$("span", li)[1].textContent = mm.fact;
    $("button", li).onclick = async () => { await api(`/api/memories/${mm.id}`, { method: "DELETE" }); renderMemory(); toast("Forgotten."); };
    ul.append(li);
  }
  renderFeed();
}

// ------------------------------------------------------------------ settings
$("#open-settings").onclick = openSettings;
$("#open-settings-m").onclick = openSettings;
$("#open-search-m").onclick = () => openPalette();
async function openSettings() {
  const st = await api("/api/settings");
  const m = openModal(`<div class="modal-in"><div class="modal-h"><h2>Settings</h2><button class="icon-btn" data-close aria-label="Close">${I.x}</button></div>
    <form class="modal-sec" id="set-main">
      <label class="field"><span>Your assistant's name</span><input name="assistant_name" maxlength="24"></label>
      <label class="field"><span>What should ${AN()} call you?</span><input name="name" maxlength="40"></label>
      <label class="field"><span>Standing instructions for every chat</span><textarea name="instructions" rows="4" placeholder="e.g. Answer in British English. Keep it short unless I ask for detail."></textarea>
        <small>Applies to conversations you start from now on.</small></label>
      <label class="field"><span>Thinking before answering</span><select name="effort"><option value="low">Quick (recommended on this machine)</option>
        <option value="medium">Careful</option><option value="high">Deep (slow)</option></select></label>
      <label class="field"><span>In code sessions</span><select name="approval"><option value="ask">Ask before editing files or running commands</option>
        <option value="auto">Work without asking</option></select></label>
      <label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" name="notify"> Notify me when a reply finishes while I'm in another tab</label>
      <h3 style="margin-top:6px">Morning brief</h3>
      <label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" name="brief_enabled"> Prepare a brief every morning and notify me</label>
      <div style="display:grid;grid-template-columns:120px 1fr;gap:10px">
        <label class="field"><span>At</span><input name="brief_time" type="time"></label>
        <label class="field"><span>Weather for (city)</span><input name="brief_city" placeholder="e.g. Bengaluru" maxlength="60"></label></div>
      <label class="field"><span>News about</span><input name="brief_topics" placeholder="e.g. AI, Indian startups, cricket" maxlength="200"></label>
      <div class="row-btns"><button class="btn btn-ghost" type="button" id="brief-now">Make one now</button><button class="btn btn-ink" type="submit">Save settings</button></div></form>
    <div class="modal-sec" id="set-push"><h3>Notifications on this device</h3>
      <p id="push-state">Checking…</p>
      <div class="row-btns"><button class="btn btn-ghost" type="button" id="push-test">Send a test</button>
        <button class="btn btn-accent" type="button" id="push-on">Turn on</button></div></div>
    <form class="modal-sec" id="set-pw"><h3>Password</h3>
      <label class="field"><span>Current password</span><input name="current" type="password" autocomplete="current-password" required></label>
      <label class="field"><span>New password</span><input name="new" type="password" autocomplete="new-password" minlength="10" required></label>
      <p class="form-error"></p><div class="row-btns"><button class="btn btn-ghost" type="submit">Change password</button></div></form>
    <div class="modal-sec" id="set-totp"><h3>Two-step sign-in</h3>
      <p>${st.totp ? "On. Signing in asks for a code from your authenticator app." : "Off. Turn it on so a password alone can't open Reliquary."}</p>
      <div class="row-btns"><button class="btn ${st.totp ? "btn-ghost" : "btn-butter"}" type="button" id="totp-btn">${st.totp ? "Turn off" : "Set it up"}</button></div></div>
    <div class="row-btns"><button class="btn btn-ghost" id="sign-out" type="button">Sign out</button></div></div>`);
  const f = $("#set-main", m);
  f.name.value = st.name || ""; f.assistant_name.value = st.assistant_name || "RiRi"; f.instructions.value = st.instructions || ""; f.effort.value = st.effort || "low";
  f.approval.value = st.approval || "ask"; f.notify.checked = st.notify !== false;
  f.brief_enabled.checked = st.brief_enabled !== false; f.brief_time.value = st.brief_time || "07:30";
  f.brief_city.value = st.brief_city || ""; f.brief_topics.value = st.brief_topics || "";
  $("#brief-now", m).onclick = async () => { await api("/api/brief/now", { method: "POST" }); closeModal(); await loadSessions(); toast(`${AN()} is preparing your brief. You'll get a notification.`); };
  pushPanel(m);
  f.onsubmit = async (e) => {
    e.preventDefault();
    S.settings = await api("/api/settings", { method: "PUT", body: { name: f.name.value.trim(), assistant_name: f.assistant_name.value.trim() || "RiRi", instructions: f.instructions.value,
      effort: f.effort.value, approval: f.approval.value, notify: f.notify.checked,
      brief_enabled: f.brief_enabled.checked, brief_time: f.brief_time.value, brief_city: f.brief_city.value.trim(),
      brief_topics: f.brief_topics.value.trim() } });
    if (f.notify.checked) askNotify();
    closeModal(); toast("Settings saved."); if (!S.sid) renderHome();
  };
  $("#set-pw", m).onsubmit = async (e) => {
    e.preventDefault(); const fd = new FormData(e.target);
    try { await api("/api/auth/password", { method: "POST", body: { current: fd.get("current"), new: fd.get("new") } }); e.target.reset(); toast("Password changed."); }
    catch (x) { $(".form-error", e.target).textContent = x.message; }
  };
  $("#totp-btn", m).onclick = () => (st.totp ? totpOff() : totpSetup());
  $("#sign-out", m).onclick = async () => { await api("/api/auth/logout", { method: "POST" }).catch(() => {}); closeModal(); location.reload(); };
}
// ---- push notifications ----
function b64urlToBytes(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
async function pushSubscription() {
  // Never waits on .ready: if the worker isn't registered (or can't be, in some browsers) this just says "off".
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}
async function workerReady() {
  let reg = await navigator.serviceWorker.getRegistration("/");
  if (!reg) reg = await navigator.serviceWorker.register("/sw.js");
  if (reg.active) return reg;
  return Promise.race([navigator.serviceWorker.ready,
    sleep(10000).then(() => { throw new Error("This browser didn't start the notification service. Reload the page and try again."); })]);
}
async function enablePush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window))
    throw new Error("This browser can't receive notifications. On an iPhone, first add Reliquary to your Home Screen (Share, Add to Home Screen) and open it from there.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Notifications are blocked for this site. Allow them in your browser's site settings, then try again.");
  const reg = await workerReady();
  const { key } = await api("/api/push/key");
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try { sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(key) }); }
    catch (e) {
      const brave = navigator.brave && (await navigator.brave.isBrave().catch(() => false));
      throw new Error(brave
        ? "Brave has push turned off. In Brave: Settings, Privacy and security, turn on \"Use Google services for push messaging\", restart Brave, then try again."
        : "This browser couldn't reach its push service. Use Chrome, Edge or Firefox (not an in-app browser), check that a VPN or ad-blocker isn't blocking Google's push servers, or turn notifications on from your phone.");
    }
  }
  return api("/api/push/subscribe", { method: "POST", body: { subscription: sub.toJSON() } });
}
async function pushPanel(m) {
  const state = $("#push-state", m), on = $("#push-on", m), test = $("#push-test", m);
  const refresh = async () => {
    const sub = await pushSubscription().catch(() => null);
    const { devices } = await api("/api/push/key").catch(() => ({ devices: 0 }));
    state.textContent = sub ? `On for this device. ${devices} device${devices === 1 ? "" : "s"} in total get reminders, your morning brief and long-reply alerts.`
      : `Off for this device.${devices ? ` ${devices} other device${devices === 1 ? "" : "s"} are on.` : " Turn it on to get reminders, your morning brief and long-reply alerts."}`;
    on.textContent = sub ? "Turn off" : "Turn on";
    on.dataset.on = sub ? "1" : "";
  };
  on.onclick = async () => {
    on.disabled = true;
    try {
      if (on.dataset.on) {
        const sub = await pushSubscription();
        if (sub) { await api("/api/push/unsubscribe", { method: "POST", body: { endpoint: sub.endpoint } }); await sub.unsubscribe(); }
        toast("Notifications are off on this device.");
      } else { await enablePush(); toast("Notifications are on. Try Send a test."); }
    } catch (e) { toast(e.message); }
    on.disabled = false; refresh();
  };
  test.onclick = async () => {
    const r = await api("/api/push/test", { method: "POST" }).catch((e) => ({ error: e.message }));
    toast(r.error || (r.sent ? `Sent to ${r.sent} device${r.sent === 1 ? "" : "s"}.` : "No devices are subscribed yet. Turn notifications on first."));
  };
  refresh();
}
async function totpSetup() {
  const r = await api("/api/auth/totp/setup", { method: "POST" });
  const qr = qrcode(0, "M"); qr.addData(r.uri); qr.make();
  const m = openModal(`<form class="modal-in"><div class="modal-h"><h2>Two-step sign-in</h2><button class="icon-btn" type="button" data-close aria-label="Close">${I.x}</button></div>
    <div class="modal-sec"><p>Scan this with an authenticator app (Google Authenticator, 1Password, Aegis…), then type the 6-digit code it shows.</p>
    <div class="qr">${qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true })}</div>
    <p>Can't scan? Enter this key: <code></code></p>
    <label class="field"><span>Code</span><input name="code" inputmode="numeric" maxlength="7" required autocomplete="one-time-code"></label><p class="form-error"></p></div>
    <div class="row-btns"><button class="btn btn-ink" type="submit">Turn on</button></div></form>`);
  $("code", m).textContent = r.secret;
  $("form", m).onsubmit = async (e) => {
    e.preventDefault();
    try { await api("/api/auth/totp/enable", { method: "POST", body: { code: e.target.code.value } }); closeModal(); toast("Two-step sign-in is on."); }
    catch (x) { $(".form-error", m).textContent = x.message; }
  };
}
function totpOff() {
  const m = openModal(`<form class="modal-in"><div class="modal-h"><h2>Turn off two-step sign-in?</h2></div>
    <div class="modal-sec"><label class="field"><span>Your password</span><input name="password" type="password" required></label><p class="form-error"></p></div>
    <div class="row-btns"><button class="btn btn-ghost" type="button" data-close>Keep it on</button><button class="btn btn-danger" type="submit">Turn off</button></div></form>`);
  $("form", m).onsubmit = async (e) => {
    e.preventDefault();
    try { await api("/api/auth/totp/disable", { method: "POST", body: { password: e.target.password.value } }); closeModal(); toast("Two-step sign-in is off."); }
    catch (x) { $(".form-error", m).textContent = x.message; }
  };
}

// ------------------------------------------------------------------ search palette
$("#open-search").onclick = openPalette;
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); }
});
function openPalette(q) {
  const m = openModal(`<div class="palette-in"><input placeholder="Search conversations and notes" aria-label="Search"><div class="palette-res"></div></div>`);
  const inp = $("input", m), res = $(".palette-res", m);
  if (typeof q === "string" && q) setTimeout(() => { inp.value = q; inp.dispatchEvent(new Event("input")); }, 40);
  const actions = [["New chat", "#/"], ["Tasks", "#/tasks"], ["Notes", "#/notes"], ["Memory", "#/memory"]];
  const show = (sessions, notes) => {
    res.innerHTML = "";
    for (const s of sessions) res.append(h(`<a href="#/c/${s.id}"><b>${esc(s.title)}</b><span>${esc(s.snippet || (s.mode === "agent" ? "Code session" : "Chat"))}</span></a>`));
    for (const n of notes) res.append(h(`<a href="#/notes"><b>${esc(n.title)}</b><span>Note: ${esc(n.body)}</span></a>`));
    if (!sessions.length && !notes.length) for (const [l, href] of actions) res.append(h(`<a href="${href}"><b>${l}</b></a>`));
    $$("a", res).forEach((a) => a.addEventListener("click", closeModal));
  };
  show(S.sessions.slice(0, 6).map((s) => ({ ...s, snippet: ago(s.updated) })), []);
  let t;
  inp.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(async () => { if (!inp.value.trim()) return show(S.sessions.slice(0, 6), []); const r = await api("/api/search?q=" + encodeURIComponent(inp.value.trim())); show(r.sessions, r.notes); }, 180);
  });
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { const a = $("a", res); if (a) { location.hash = a.getAttribute("href"); closeModal(); } } });
  setTimeout(() => inp.focus(), 30);
}

// ------------------------------------------------------------------ modal & drawers
function openModal(html) {
  const d = $("#modal");
  d.innerHTML = html;
  if (!d.open) d.showModal();
  $$("[data-close]", d).forEach((b) => (b.onclick = closeModal));
  return d;
}
function closeModal() { const d = $("#modal"); if (d.open) d.close(); }
$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
$("#open-left").onclick = () => { $("#left").classList.add("open"); $("#scrim").hidden = false; };
$("#open-log").onclick = () => { $("#log").classList.add("open"); $("#scrim").hidden = false; };
$("#scrim").onclick = closeDrawers;
function closeDrawers() { $("#left").classList.remove("open"); $("#log").classList.remove("open"); $("#scrim").hidden = true; }
document.addEventListener("visibilitychange", () => { if (!document.hidden) pollStatus(); });

marked.use({ renderer: { html: (t) => esc(typeof t === "object" ? t.text : t) } }); // show raw HTML from the model as text
boot();
