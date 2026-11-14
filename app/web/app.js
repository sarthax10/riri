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
  live: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="2.2"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/></svg>',
  spark: '<svg viewBox="0 0 24 24"><path d="M12 3.5c.6 4.4 2.9 6.9 8 8.5-5.1 1.6-7.4 4.1-8 8.5-.6-4.4-2.9-6.9-8-8.5 5.1-1.6 7.4-4.1 8-8.5z"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
  task: '<svg viewBox="0 0 24 24"><rect x="4.5" y="4.5" width="15" height="15" rx="4"/><path d="m8.5 12.2 2.4 2.4 4.6-4.8"/></svg>',
  note: '<svg viewBox="0 0 24 24"><path d="M7 4.5h7.5L18 8v11.5H7z"/><path d="M9.5 11h6M9.5 14.5h6"/></svg>',
  mem: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.5"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="2.8"/><path d="M12 3.5v2.3M12 18.2v2.3M4.6 7.7l2 1.2M17.4 15.1l2 1.2M4.6 16.3l2-1.2M17.4 8.9l2-1.2"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="m15.5 15.5 4 4"/></svg>',
  grid: '<svg viewBox="0 0 24 24"><rect x="4.5" y="4.5" width="6.5" height="6.5" rx="1.5"/><rect x="13" y="4.5" width="6.5" height="6.5" rx="1.5"/><rect x="4.5" y="13" width="6.5" height="6.5" rx="1.5"/><rect x="13" y="13" width="6.5" height="6.5" rx="1.5"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M8.5 7h11M8.5 12h11M8.5 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01"/></svg>',
  image: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="m5 17 4.5-4.5 3 3 2.5-2.5L19 17"/></svg>',
  film: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2.5"/><path d="m10.5 9.5 4 2.5-4 2.5z"/></svg>',
  music: '<svg viewBox="0 0 24 24"><path d="M9.5 17V6.5l9-2V15"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="15" r="2"/></svg>',
  doc: '<svg viewBox="0 0 24 24"><path d="M7 3.5h7l4 4v13H7z"/><path d="M14 3.5v4h4"/></svg>',
  box: '<svg viewBox="0 0 24 24"><path d="M4.5 8 12 4.5 19.5 8v8L12 19.5 4.5 16z"/><path d="M4.5 8 12 11.5 19.5 8M12 11.5v8"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="m14.5 6-6 6 6 6"/></svg>',
  gauge: '<svg viewBox="0 0 24 24"><path d="M4.5 16.5a8 8 0 1 1 15 0"/><path d="m12 13 3.5-4"/><circle cx="12" cy="13" r="1.2"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M7.5 10.5V19H5a1 1 0 0 1-1-1v-6.5a1 1 0 0 1 1-1zM7.5 10.5 11 4.5a2 2 0 0 1 2.9 1.9L13.5 9.5H18a2 2 0 0 1 2 2.3l-1 5.5a2 2 0 0 1-2 1.7H7.5"/></svg>',
  dn: '<svg viewBox="0 0 24 24"><path d="M7.5 13.5V5H5a1 1 0 0 0-1 1v6.5a1 1 0 0 0 1 1zM7.5 13.5 11 19.5a2 2 0 0 0 2.9-1.9l-.4-3.1H18a2 2 0 0 0 2-2.3l-1-5.5A2 2 0 0 0 17 5H7.5"/></svg>',
  brain: '<svg viewBox="0 0 24 24"><path d="M9 4.5a3 3 0 0 0-3 3 3 3 0 0 0-1.5 5.5A3 3 0 0 0 7 18a2.5 2.5 0 0 0 5 .5V6a1.5 1.5 0 0 0-3-1.5zM15 4.5a3 3 0 0 1 3 3 3 3 0 0 1 1.5 5.5A3 3 0 0 1 17 18a2.5 2.5 0 0 1-5 .5"/></svg>',
  hand: '<svg viewBox="0 0 24 24"><path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11V5a1.5 1.5 0 0 1 3 0v6M14 11V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.5A5.5 5.5 0 0 1 6 17.4L4.5 14a1.5 1.5 0 0 1 2.6-1.4L8 14"/></svg>',
};
const TOOL_KIND = { learn: "mind", artifact_start: "live", artifact_stop: "live", artifact_list: "live", artifact_logs: "live", todo: "mind", load_skill: "mind", run_python: "run", glob: "read", forget: "mind", update_note: "mind",
  web_search: "web", read_webpage: "web", list_files: "read", read_file: "read", search: "read", write_file: "edit", edit_file: "edit", run: "run",
  add_task: "mind", list_tasks: "mind", complete_task: "mind", save_note: "mind", search_notes: "mind", remember: "mind" };
const TOOL_VERB = { learn: "Learned a lesson", artifact_start: "Served an artifact", artifact_stop: "Stopped an artifact", artifact_list: "Checked artifacts",
  artifact_logs: "Read an artifact's log", todo: "Updated the plan", load_skill: "Loaded a skill", run_python: "Ran Python", glob: "Found files",
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
  if (name === "artifact_start") return a.name || a.folder || "";
  if (name === "artifact_stop" || name === "artifact_logs") return (a.id || "").slice(0, 8);
  if (name === "artifact_list") return "";
  if (name === "learn") return a.lesson || "";
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
// gpt-oss writes some characters fonts lack, and its own citation marks; tidy them before rendering.
function tidy(text) {
  return String(text || "").replace(/‑/g, "-").replace(/[  ]/g, " ").replace(/【[^】\n]{0,40}】/g, "")
    // a table straight after a line of text needs a blank line before it
    .replace(/^([^\n|].*)\n(\|.*\|[ \t]*\n\|[ \t:|-]+\|[ \t]*$)/gm, "$1\n\n$2");
}
// Maths ($$…$$, \[…\], \(…\), $…$) is lifted out before Markdown (which would eat the backslashes) and typeset after.
function liftMath(text) {
  const store = [];
  const parts = text.split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g);
  for (let i = 0; i < parts.length; i += 2) {
    parts[i] = parts[i].replace(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|(?<![\\$\w])\$(?![\s$\d])([^$\n]{1,240}?)(?<![\s\\])\$(?![\w$])/g,
      (m, a, b, c, d) => { store.push({ tex: a ?? b ?? c ?? d, display: a != null || b != null }); return `⁣M${store.length - 1}⁣`; });
  }
  return [parts.join(""), store];
}
function md(text) {
  const [lifted, maths] = liftMath(tidy(text));
  const html = DOMPurify.sanitize(marked.parse(lifted, { breaks: false, gfm: true }));
  const el = document.createElement("div"); el.className = "md"; el.innerHTML = html;
  if (maths.length) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const hits = [];
    while (walker.nextNode()) if (walker.currentNode.nodeValue.includes("⁣M")) hits.push(walker.currentNode);
    for (const node of hits) {
      const frag = document.createDocumentFragment();
      node.nodeValue.split(/⁣M(\d+)⁣/).forEach((piece, k) => {
        if (k % 2 === 0) { if (piece) frag.append(piece); return; }
        const m = maths[+piece]; const span = document.createElement("span");
        span.className = m.display ? "math math-block" : "math";
        try { span.innerHTML = window.katex ? katex.renderToString(m.tex, { displayMode: m.display, throwOnError: false, output: "html" }) : esc(m.tex); }
        catch { span.textContent = m.tex; }
        frag.append(span);
      });
      node.replaceWith(frag);
    }
  }
  $$("pre", el).forEach((pre) => {
    const code = $("code", pre);
    if (!code) return;
    const lang = ([...code.classList].find((c) => c.startsWith("language-")) || "").slice(9);
    if (lang === "mermaid" || ((lang === "svg" || lang === "xml") && /^\s*<svg[\s>]/i.test(code.textContent))) {
      pre.replaceWith(diagramBlock(code.textContent, lang === "mermaid" ? "mermaid" : "svg"));
      return;
    }
    if (lang && window.hljs && hljs.getLanguage(lang)) { try { hljs.highlightElement(code); } catch { /* plain */ } }
    const n = code.textContent.replace(/\n$/, "").split("\n").length;
    const label = lang ? langLabel(EXT_LANG[lang] || lang) : "text";
    const wrap = h(`<div class="codeblock"><div class="codeblock-h"><span>${esc(label)}</span>${n > 12 ? `<small>${n} lines</small>` : ""}<button class="copy-code" type="button">${I.copy}<span>Copy</span></button></div></div>`);
    pre.replaceWith(wrap); wrap.append(pre);
  });
  $$("table", el).forEach((t) => { const w = document.createElement("div"); w.className = "table-wrap"; t.replaceWith(w); w.append(t); });
  $$("img", el).forEach((im) => {
    const src = im.getAttribute("src") || "";
    if (/^https?:\/\//i.test(src)) { im.src = webImg(src); im.dataset.orig = src; }
    im.loading = "lazy"; im.decoding = "async";
    im.onerror = () => im.replaceWith(Object.assign(document.createElement("span"), { className: "img-missing", textContent: im.alt || "image unavailable" }));
    im.addEventListener("click", () => openViewer([{ src: im.src, title: im.alt, href: im.dataset.orig }]));
  });
  $$("a", el).forEach((a) => { a.target = "_blank"; a.rel = "noopener noreferrer"; });
  return el;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest(".copy-code");
  if (b) { navigator.clipboard.writeText((b.closest(".codeblock") || b.parentElement).querySelector("code")?.innerText || "");
    const sp = b.querySelector("span") || b; sp.textContent = "Copied"; b.classList.add("done"); setTimeout(() => { sp.textContent = "Copy"; b.classList.remove("done"); }, 1400); }
});

// ------------------------------------------------------------------ state
const AN = () => (S.settings && S.settings.assistant_name) || "RiRi";
const S = {
  view: "home", sid: null, session: null, messages: [], sessions: [], workspaces: [], filter: "all", settings: {},
  status: null, dash: null, editFrom: null, attachments: [],
  live: null,            // the live run of the open session
  feeds: {},             // run id -> feed items (kept after the run ends)
  lastFeedRun: null,
  rich: new Map(),       // tool id -> its picture strip / artifact card, kept so live re-renders don't reload them
  stepState: {},         // step groups the owner opened or closed by hand: first tool id -> "open" | "closed"
  artifacts: [],
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
  startSync();
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
  document.body.dataset.view = a || "home";
  closeDrawers();
  if (a === "c" && b) return openSession(b);
  S.sid = null; S.session = null; stopLive();
  $("#stage").classList.toggle("stage-conv", a === "fs");
  if (a === "tasks") return renderTasks();
  if (a === "notes") return renderNotes();
  if (a === "memory") return renderMemory();
  if (a === "live") return renderArtifacts();
  if (a === "chats") return renderChats();
  if (a === "server") return renderServer();
  if (a === "fs") return renderFS(hsh.length > 3 ? decodeURIComponent(hsh.slice(3)) : "~");
  if (a === "files" && b) { location.hash = "#/fs/" + encodeURIComponent(folderOf(decodeURIComponent(b))); return; }
  renderHome();
}
const VIEW_TITLE = { server: "Server", home: "", chats: "Chats", files: "Files", live: "Live", tasks: "Tasks", notes: "Notes", memory: "Memory" };
function setNav(name) {
  $$("[data-nav]").forEach((t) => (t.dataset.nav === name ? t.setAttribute("aria-current", "page") : t.removeAttribute("aria-current")));
  const t = $(".mobile-title"); if (t) t.textContent = VIEW_TITLE[name] || AN();
  renderSessionList();
}

// ------------------------------------------------------------------ left column
async function loadSessions() { S.sessions = await api("/api/sessions").catch(() => S.sessions); renderSessionList(); }
async function loadWorkspaces() { S.workspaces = await api("/api/workspaces").catch(() => S.workspaces); renderWorkspaces(); }
const plain = (s) => String(s || "").replace(/!\[([^\]]*)\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*_`#>|]+/g, "").replace(/\s+/g, " ").trim();
function renderSessionList() {
  fillSessionList($("#session-list"));
  const page = $("#chats-list"); if (page) fillSessionList(page, S.chatQuery);
  const runs = S.status?.engine.active.length || 0;
  $$(".run-badge").forEach((b) => { b.hidden = !runs; });
}
function fillSessionList(list, query) {
  if (!list) return;
  const q = (query || "").toLowerCase();
  const items = S.sessions.filter((s) => (S.filter === "all" || s.mode === S.filter) && (!q || (s.title + " " + (s.last || "")).toLowerCase().includes(q)));
  if (!items.length) { list.innerHTML = `<p class="empty-note">${q ? "Nothing matches that." : "No conversations yet. Say hello on the home page."}</p>`; return; }
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
          <span class="s-sub">${esc(s.mode === "agent" ? shortPath(folderOf(s.workspace)) : (plain(s.last) || "No reply yet"))}</span></span>
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
document.addEventListener("click", (e) => {   // the All / Chats / Code filter, in the side panel and on the Chats page
  const b = e.target.closest("#filter button, #chats-filter button"); if (!b) return;
  S.filter = b.dataset.f; $$("#filter button, #chats-filter button").forEach((x) => x.setAttribute("aria-selected", x.dataset.f === S.filter)); renderSessionList();
});
async function renderChats() {
  S.view = "chats"; setNav("chats");
  const stage = $("#stage");
  stage.innerHTML = `<div class="page chats-page">
    <div class="chats-top"><label class="search-field">${I.search}<input type="search" placeholder="Search conversations" aria-label="Search conversations" enterkeyhint="search"></label>
      <button class="btn btn-accent new-btn" type="button" aria-label="Start something new"><svg viewBox="0 0 24 24"><path d="M12 5.5v13M5.5 12h13"/></svg><span>New</span></button></div>
    <div class="seg" role="tablist" id="chats-filter"><button role="tab" data-f="all">All</button><button role="tab" data-f="chat">Chats</button><button role="tab" data-f="agent">Code</button></div>
    <div class="session-list chats-list" id="chats-list"></div><div class="chats-found" id="chats-found"></div></div>`;
  $$("#chats-filter button").forEach((x) => x.setAttribute("aria-selected", x.dataset.f === S.filter));
  $(".new-btn", stage).onclick = newMenu;
  const inp = $(".search-field input", stage);
  inp.value = S.chatQuery || "";
  let t;
  inp.addEventListener("input", () => {
    S.chatQuery = inp.value; fillSessionList($("#chats-list"), S.chatQuery);
    clearTimeout(t);
    const found = $("#chats-found"); found.innerHTML = "";
    if (inp.value.trim().length < 3) return;
    t = setTimeout(async () => {   // also look inside the messages
      const r = await api("/api/search?q=" + encodeURIComponent(inp.value.trim())).catch(() => null);
      if (!r || S.view !== "chats") return;
      const shown = new Set($$("#chats-list .s-card").map((a) => a.getAttribute("href")));
      const extra = r.sessions.filter((s) => !shown.has("#/c/" + s.id));
      if (!extra.length) return;
      found.innerHTML = `<h3 class="group-h">In the messages</h3>` + extra.map((s) => `<a class="s-card" href="#/c/${s.id}"><span class="s-text"><span class="s-title">${esc(s.title)}</span><span class="s-sub">${esc(plain(s.snippet))}</span></span></a>`).join("");
    }, 260);
  });
  fillSessionList($("#chats-list"), S.chatQuery);
  renderFeed();
}
$("#new-chat").onclick = () => newMenu();
// One place to start anything new: a chat, or a code session in a folder.
function newMenu() {
  const m = openModal(`<div class="modal-in"><div class="modal-h"><h2>Start something</h2><button class="icon-btn" data-close aria-label="Close">${I.x}</button></div>
    <div class="choice">
      <button type="button" data-n="chat"><span class="s-ico">${I.chat}</span><span><b>New chat</b><small>Ask, research, plan, write, or have ${esc(AN())} build something</small></span></button>
      <button type="button" data-n="code"><span class="s-ico">${I.code}</span><span><b>Code in a folder</b><small>Work on a project on the server: edit, run, test</small></span></button>
    </div></div>`);
  $('[data-n="chat"]', m).onclick = () => { closeModal(); newChat(); };
  $('[data-n="code"]', m).onclick = () => { closeModal(); openCodeModal(); };
}
function newChat() {
  if (location.hash.replace(/^#\/?/, "") !== "") location.hash = "#/";
  setTimeout(() => { const t = $(".home-foot textarea") || $(".hero textarea"); t?.focus(); }, 80);
}

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
  const comp = composer({ placeholder: innerWidth < 600 ? `Ask ${AN()} anything…` : `Ask ${AN()} anything, or type / for commands…`, onSend: async (text) => {
    if (await runSlash(text)) return;
    askNotify();
    const s = await api("/api/sessions", { method: "POST", body: { mode: "chat" } });
    await api(`/api/sessions/${s.id}/messages`, { method: "POST", body: { content: text } });
    await loadSessions();
    location.hash = "#/c/" + s.id;
  } });
  const phone = matchMedia("(max-width: 860px)").matches;
  if (!phone) hero.append(comp);
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
  if (phone) { const foot = h(`<div class="stage-foot home-foot"></div>`); foot.append(comp); stage.append(foot); }
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
      <span class="r-when">${esc(ago(s.updated))}</span><span class="r-sub">${esc(s.mode === "agent" ? "In " + shortPath(folderOf(s.workspace)) : plain(s.last))}</span></a>`));
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
  homeServerCard(cards);
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
function prettyModel(m) {
  // "p-e-w_gpt-oss-20b-heretic-MXFP4_MOE" -> "gpt-oss 20B (uncensored)"
  let s = String(m || "model").replace(/^[\w.-]+?_(?=[a-z])/i, (x) => (/^(p-e-w|bartowski|unsloth|huihui-ai)_/i.test(x) ? "" : x));
  const free = /heretic|abliterat|uncensor/i.test(s);
  s = s.replace(/[-_.](heretic|abliterated|uncensored)/ig, "").replace(/[-_.](UD-)?(Q\d\w*|IQ\d\w*|MXFP4\w*|F16|BF16)$/i, "").replace(/-(\d+)b$/i, " $1B");
  return free ? `${s} (uncensored)` : s;
}
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
  setNav("chats");
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
    <a class="icon-btn band-back" href="#/chats" aria-label="Back to chats">${I.back}</a>
    <input class="band-title" value="${esc(s.title)}" aria-label="Conversation title" maxlength="120">
    <a class="band-chip hide-narrow" href="#/fs/${encodeURIComponent(folderOf(s.workspace))}" title="Working folder">${I.folder}${esc(shortPath(folderOf(s.workspace)))}</a>
    <button class="band-chip" id="approval-chip" type="button" title="Whether ${esc(AN())} asks before running commands or changing files">${s.meta.approval === "auto" ? I.bolt + "Auto" : I.hand + "Ask first"}</button>
    <button class="band-chip hide-narrow" id="effort-chip" type="button" title="How long the model thinks before answering">Thinking: ${esc(s.meta.effort || S.settings.effort || "low")}</button>
    <button class="icon-btn band-activity" type="button" aria-label="Activity">${I.live}</button>
    <button class="icon-btn" id="session-menu" aria-label="Conversation options">${I.dots}</button>
  </div>`);
  $(".band-activity", band).onclick = () => $("#open-log").click();
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
  attachJump(tr);
  const foot = h(`<div class="stage-foot"></div>`);
  const comp = composer({
    placeholder: innerWidth < 600 ? "Reply…" : agent ? `Describe a change, or type / for commands…` : "Reply, or type / for commands…",
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
  foot.append(runbar());
  foot.append(comp);
  stage.append(foot);
  renderMessages();
}
function renderMessages(keepPlace) {
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
  const compacted = msgs.filter((m) => m.meta && m.meta.compacted && (m.role === "user" || (m.role === "assistant" && m.content)));
  if (compacted.length) {
    const d = h(`<details class="compacted"><summary>${compacted.length} earlier message${compacted.length === 1 ? "" : "s"}, compacted</summary><div class="compacted-body"></div></details>`);
    for (const m of compacted) $(".compacted-body", d).append(m.role === "user" ? userBubble(m) : turnView([{ content: m.content, meta: {} }]));
    box.append(d);
  }
  // A reply is everything the assistant did between two of your messages: its steps, then its answer.
  const items = [];
  let turn = null;
  for (const m of msgs) {
    if (m.meta && (m.meta.compacted || m.meta.summary_ack || m.meta.hidden)) continue;
    if (m.meta && m.meta.summary) { items.push({ summary: m }); turn = null; continue; }
    if (m.role === "user") { items.push({ user: m }); turn = null; continue; }
    if (m.role !== "assistant") continue;
    if (!turn) { turn = { blocks: [] }; items.push(turn); }
    turn.blocks.push({ content: m.content, reasoning: m.reasoning, meta: m.meta, id: m.id,
      tools: (m.tool_calls || []).map((c) => toolFromCall(c, results[c.id])) });
  }
  const lastTurn = [...items].reverse().find((x) => x.blocks);
  for (const it of items) {
    if (it.user) box.append(userBubble(it.user));
    else if (it.summary) {
      const c = h(`<details class="summary-card"><summary>Summary of the earlier conversation</summary></details>`);
      c.append(md(it.summary.content.replace(/^\[Summary[^\]]*\]\n?/, "")));
      box.append(c);
    } else box.append(turnView(it.blocks, { last: it === lastTurn && !S.live }));
  }
  if (S.live) box.append(h(`<div id="live"></div>`)), renderLive();
  else if (msgs.length && (msgs.at(-1).role === "user" || msgs.at(-1).role === "tool")) {
    // the last reply was interrupted (a restart, or a stop): offer to finish it
    const n = h(`<div class="notice">${esc(AN())} didn't finish replying to this. <button class="btn btn-ghost btn-small" type="button" style="margin-left:8px">Get a reply</button></div>`);
    $("button", n).onclick = regenerate;
    box.append(n);
  }
  scrollDown(!keepPlace);
}
function toolFromCall(c, res) {
  let args; try { args = JSON.parse(c.function.arguments || "{}"); } catch { args = c.function.arguments; }
  return { id: c.id, name: c.function.name, args, output: res ? res.content : null, ok: res ? res.meta.ok : null, display: res ? res.meta.display : null };
}
function userBubble(m) {
  const el = h(`<div class="msg-user"><div class="msg-actions"><button aria-label="Edit and resend">${I.pen}</button><button aria-label="Copy">${I.copy}</button></div></div>`);
  el.append(document.createTextNode(m.content));
  const [edit, copy] = $$(".msg-actions button", el);
  edit.onclick = () => { if (S.live) return toast("Stop the running reply first."); S.editFrom = m.id; $("#conv-composer").fill(m.content); toast("Editing. Sending replaces this message and everything after it."); };
  copy.onclick = () => { navigator.clipboard.writeText(m.content); toast("Copied."); };
  return el;
}
function aiBlock(b) { return turnView([b], { live: b.live, state: b.state, last: b.last }); }

const STEP_NOUN = { web_search: ["search", "searches"], read_webpage: ["page read", "pages read"], read_file: ["file read", "files read"],
  run: ["command", "commands"], write_file: ["file written", "files written"], edit_file: ["edit", "edits"], search: ["code search", "code searches"],
  glob: ["file lookup", "file lookups"], list_files: ["folder listed", "folders listed"], run_python: ["Python run", "Python runs"],
  artifact_start: ["artifact served", "artifacts served"] };
function stepsSummary(tools) {
  const counts = {};
  for (const t of tools) if (t.name !== "todo" && t.name !== "load_skill") counts[t.name] = (counts[t.name] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, c]) => {
    const w = STEP_NOUN[n]; return w ? `${c} ${c === 1 ? w[0] : w[1]}` : (TOOL_VERB[n] || n).toLowerCase();
  }).join(" · ");
}
/* One assistant reply: a "steps" group per run of tool calls, the pictures/artifacts they produced, then the text. */
function turnView(blocks, o = {}) {
  const el = h(`<div class="msg-ai ${o.live ? "is-live" : ""}"><div class="msg-ai-av">${Reli.svg(26, o.live ? o.state || "writing" : "idle")}</div><div class="msg-ai-body"></div></div>`);
  const body = $(".msg-ai-body", el);
  const all = [];
  let group = null;
  blocks.forEach((b, bi) => {
    const text = (b.content || "").trim();
    const tools = (b.tools || []).filter(Boolean);
    if (tools.length) {
      if (!group) { group = { tools: [], list: [], el: h(`<details class="steps"></details>`) }; body.append(group.el); }
      if (b.reasoning) group.list.push({ thought: b.reasoning });
      if (text) group.list.push({ note: text });
      for (const t of tools) { group.tools.push(t); group.list.push({ tool: t }); all.push(t); const r = richView(t, o.live); if (r) body.append(r); }
      fillSteps(group, o.live && bi === blocks.length - 1);
      return;
    }
    group = null;
    if (b.reasoning && (text || o.live)) {
      const th = h(`<details class="thought"><summary>${o.live && !text ? "Thinking…" : "Thought it through"}</summary><div class="thought-body"></div></details>`);
      $(".thought-body", th).textContent = b.reasoning;
      body.append(th);
    }
    if (text || (b.live && b.streaming)) {
      const m = md(b.content || "");
      if (b.live && b.streaming) m.classList.add("caret");
      body.append(m);
    }
  });
  const last = [...blocks].reverse().find((b) => (b.content || "").trim()) || blocks.at(-1) || {};
  const files = collectFiles(all);
  if (files.length && !o.live) body.append(filesCard(files));
  const foot = h(`<div class="msg-foot"></div>`);
  const sources = collectSources(all);
  if (sources.length) foot.append(sourcesChip(sources));
  if (last.meta && last.meta.tg_tps && !o.live) {
    foot.append(h(`<span class="stat">${last.meta.tg_tps.toFixed(1)} tok/s</span>`));
    if (last.meta.ctx_max) foot.append(h(`<span class="stat" title="How full the model's memory is">${Math.round((last.meta.ctx_used / last.meta.ctx_max) * 100)}% memory</span>`));
  }
  if (!o.live && (last.content || "").trim()) {
    const acts = h(`<div class="msg-actions"><button aria-label="Copy" title="Copy">${I.copy}</button>${o.last ? `<button aria-label="Regenerate" title="Regenerate">${I.redo}</button>` : ""}</div>`);
    if (last.id) acts.prepend(feedbackButtons(last));
    $$("button", acts)[0].onclick = () => { navigator.clipboard.writeText(blocks.map((b) => b.content || "").filter(Boolean).join("\n\n")); toast("Copied."); };
    if (o.last) $$("button", acts)[1].onclick = regenerate;
    foot.append(acts);
  }
  if (foot.children.length) body.append(foot);
  return el;
}
function fillSteps(g, live) {
  const key = g.tools[0]?.id || "";
  const working = g.tools.some((t) => t.output == null);
  const failed = g.tools.filter((t) => t.ok === false).length;
  const cur = [...g.tools].reverse().find((t) => t.output == null) || g.tools.at(-1);
  const manual = S.stepState[key];
  const open = manual ? manual === "open" : (live && working) || g.tools.some((t) => t.awaiting);
  const title = working && cur ? `${TOOL_VERB[cur.name] || cur.name}…` : `${g.tools.length} step${g.tools.length === 1 ? "" : "s"}`;
  g.el.open = open;
  g.el.className = `steps ${working ? "working" : ""}`;
  g.el.innerHTML = `<summary><span class="steps-ico">${working ? '<i class="spin"></i>' : I.mind}</span><span class="steps-title">${esc(title)}</span>
    <span class="steps-sub">${esc(working && cur ? toolArg(cur.name, cur.args) : stepsSummary(g.tools))}</span>${failed ? `<span class="steps-bad">${failed} failed</span>` : ""}</summary><div class="steps-body"></div>`;
  const sb = $(".steps-body", g.el);
  for (const it of g.list) {
    if (it.thought) { const th = h(`<details class="thought step-thought"><summary>Thought</summary><div class="thought-body"></div></details>`); $(".thought-body", th).textContent = it.thought; sb.append(th); }
    else if (it.note) { const n = md(it.note); n.classList.add("step-note"); sb.append(n); }
    else sb.append(toolView(it.tool));
  }
  g.el.ontoggle = () => { if (g.el.open !== open) S.stepState[key] = g.el.open ? "open" : "closed"; };
}
// 👍 / 👎: what RiRi learns from. A thumbs-down asks (optionally) what went wrong.
function feedbackButtons(m) {
  const fb = (m.meta && m.meta.feedback) || {};
  const box = h(`<span class="fb"><button type="button" class="fb-up ${fb.value > 0 ? "on" : ""}" aria-label="Good reply" title="Good reply">${I.up}</button>
    <button type="button" class="fb-dn ${fb.value < 0 ? "on" : ""}" aria-label="Bad reply" title="Bad reply">${I.dn}</button></span>`);
  const send = async (value, note) => {
    await api(`/api/messages/${m.id}/feedback`, { method: "POST", body: { value, note } }).catch((e) => toast(e.message));
    m.meta = { ...(m.meta || {}), feedback: { value, note } };
    $(".fb-up", box).classList.toggle("on", value > 0); $(".fb-dn", box).classList.toggle("on", value < 0);
  };
  $(".fb-up", box).onclick = () => { send(1, ""); toast(`Noted. ${AN()} will remember what worked.`); };
  $(".fb-dn", box).onclick = () => {
    send(-1, "");
    const body = box.closest(".msg-ai-body"); if (!body || $(".fb-note", body)) return;
    const f = h(`<form class="fb-note"><input placeholder="What went wrong? (optional, helps ${esc(AN())} learn)" aria-label="What went wrong"><button class="btn btn-small btn-ghost" type="submit">Send</button></form>`);
    f.onsubmit = async (e) => { e.preventDefault(); const v = $("input", f).value.trim(); if (v) await send(-1, v); f.remove(); toast(`Thanks. ${AN()} will learn from this.`); };
    body.append(f); $("input", f).focus();
  };
  return box;
}
function collectSources(tools) {
  const seen = new Set(), out = [];
  const read = new Set(tools.filter((t) => t.display?.kind === "page").map((t) => t.display.url));
  for (const t of tools) {
    const d = t.display; if (!d) continue;
    const list = d.kind === "search" ? d.sources || [] : d.kind === "page" ? [{ title: d.title, url: d.url, host: d.host }] : [];
    for (const x of list) if (x.url && !seen.has(x.url)) { seen.add(x.url); out.push(x); }
  }
  return out.sort((a, b) => read.has(b.url) - read.has(a.url));   // pages actually read first
}
function favImg(host) {
  const letter = esc((host || "?")[0].toUpperCase());
  return `<img class="fav" alt="" loading="lazy" src="${esc(favicon(host))}" data-l="${letter}">`;
}
document.addEventListener("error", (e) => {   // a missing favicon becomes the site's initial
  const im = e.target;
  if (im.tagName === "IMG" && im.classList.contains("fav")) { const i = document.createElement("i"); i.className = "fav fav-x"; i.textContent = im.dataset.l || "•"; im.replaceWith(i); }
}, true);
function sourcesChip(sources) {
  const el = h(`<div class="sources"><button type="button" class="sources-btn"><span class="favs">${sources.slice(0, 4).map((x) => favImg(x.host)).join("")}</span>
    <span>${sources.length} source${sources.length === 1 ? "" : "s"}</span></button><div class="sources-list" hidden></div></div>`);
  const list = $(".sources-list", el);
  list.innerHTML = sources.slice(0, 16).map((x, i) => `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer"><em>${i + 1}</em>${favImg(x.host)}<span><b>${esc(x.title || x.host)}</b><small>${esc(x.host)}</small></span></a>`).join("");
  $("button", el).onclick = () => { list.hidden = !list.hidden; el.classList.toggle("open", !list.hidden); };
  return el;
}
/* Pictures from a search, or an artifact card: built once per tool call and reused across live re-renders. */
function richView(t, live) {
  const d = t.display; if (!d) return null;
  if (S.rich.has(t.id)) return S.rich.get(t.id);
  let el = null;
  if (d.kind === "search" && d.images && d.images.length) {
    el = h(`<div class="pics" role="list" aria-label="Pictures"></div>`);
    d.images.forEach((p) => {
      const b = h(`<button class="pic" type="button" role="listitem"><img alt="${esc(p.title)}" loading="lazy" decoding="async" src="${esc(webImg(p.thumb))}"><span>${esc(p.host)}</span></button>`);
      b.item = { src: webImg(p.src), thumb: webImg(p.thumb), title: p.title, sub: p.host, href: p.page || p.src };
      $("img", b).onerror = () => b.remove();
      b.onclick = () => { const all = [...el.children]; openViewer(all.map((c) => c.item), all.indexOf(b)); };
      el.append(b);
    });
  } else if (d.kind === "artifact" && d.artifact) el = artifactCard(d.artifact, live);
  if (el) S.rich.set(t.id, el);
  return el;
}
function artifactCard(a, fresh) {
  const host = a.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const el = h(`<div class="art-card"><div class="art-top"><span class="art-ico">${I.spark}</span>
      <div class="art-name"><b>${esc(a.name)}</b><a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${esc(host.length > 46 ? host.slice(0, 14) + "…" + host.slice(-28) : host)}</a></div>
      <span class="art-state s-${esc(a.state)}">${a.state === "live" ? "Live" : esc(a.state)}</span></div>
    <div class="art-frame" hidden></div>
    <div class="art-acts"><a class="btn btn-accent btn-small" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${MI.ext}Open</a>
      <button class="btn btn-ghost btn-small" data-a="preview" type="button">${MI.eye}<span>Preview</span></button>
      <button class="btn btn-ghost btn-small" data-a="copy" type="button">${I.copy}<span>Copy link</span></button>
      <a class="mini-btn" href="#/live">All artifacts</a></div></div>`);
  const frame = $(".art-frame", el), pv = $('[data-a="preview"]', el);
  const toggle = (on) => {
    frame.hidden = !on; $("span", pv).textContent = on ? "Hide preview" : "Preview";
    if (on && !frame.firstChild) frame.innerHTML = `<iframe src="${esc(a.url)}" title="${esc(a.name)}" loading="lazy" sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals allow-downloads" allow="clipboard-write; fullscreen"></iframe>`;
  };
  pv.onclick = () => toggle(frame.hidden);
  $('[data-a="copy"]', el).onclick = () => { navigator.clipboard.writeText(a.url); toast("Link copied."); };
  if (fresh && a.state === "live") toggle(true);
  return el;
}
function toolView(t) {
  const kind = TOOL_KIND[t.name] || "run";
  const state = t.awaiting ? "Waiting for you" : t.output == null ? "Working…" : t.ok ? "" : "Failed";
  const el = h(`<details class="tool"><summary><span class="tool-kind k-${kind}">${I[kind]}</span><span class="tool-name">${esc(TOOL_VERB[t.name] || t.name)}</span>
    <span class="tool-arg">${esc(toolArg(t.name, t.args))}</span><span class="tool-state ${t.output == null ? "busy" : t.ok ? "ok" : "bad"}">${state}</span></summary></details>`);
  const d = t.display;
  if (d && d.kind === "file") {
    $(".tool-name", el).textContent = d.created ? "Created" : "Edited";
    $(".tool-arg", el).textContent = shortPath(d.path);
    $(".tool-state", el).replaceWith(diffstat(d));
    el.append(diffPreview(t));
    return el;
  }
  if (d && d.kind === "search" && d.sources && d.sources.length) {
    const box = h(`<div class="tool-sources"></div>`);
    box.innerHTML = d.sources.map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${favImg(x.host)}<span>${esc(x.title || x.host)}</span><small>${esc(x.host)}</small></a>`).join("");
    el.append(box);
  } else if (d && d.kind === "page") {
    el.append(h(`<a class="tool-page" href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">${d.image ? `<img alt="" loading="lazy" src="${esc(webImg(d.image))}" onerror="this.remove()">` : ""}
      <span><b>${favImg(d.host)}${esc(d.title || d.host)}</b><small>${esc(d.description || d.url)}</small></span></a>`));
  } else if (t.output != null) { const pre = h(`<pre class="tool-out"></pre>`); pre.textContent = t.output; el.append(pre); }
  else if (t.name === "write_file" || t.name === "edit_file") {
    const pre = h(`<pre class="tool-out"></pre>`);
    pre.textContent = t.name === "edit_file" ? `--- replace\n${t.args?.old ?? ""}\n+++ with\n${t.args?.new ?? ""}` : (t.args?.content ?? "");
    el.append(pre);
  }
  return el;
}
function diffstat(d) {
  const s = h(`<span class="diffstat"></span>`);
  if (d.added != null) s.innerHTML = `<b class="add">+${d.added}</b>${d.removed ? `<b class="rem">−${d.removed}</b>` : ""}`;
  else s.textContent = d.created ? "new" : "changed";
  return s;
}
function diffPreview(t) {
  const pre = h(`<pre class="tool-out diff"></pre>`);
  const a = t.args || {};
  const lines = t.name === "edit_file"
    ? [...String(a.old ?? "").split("\n").map((l) => ["rem", "- " + l]), ...String(a.new ?? "").split("\n").map((l) => ["add", "+ " + l])]
    : String(a.content ?? "").split("\n").slice(0, 400).map((l) => ["add", "+ " + l]);
  for (const [k, l] of lines) { const s = document.createElement("span"); s.className = k; s.textContent = l + "\n"; pre.append(s); }
  return pre;
}
function collectFiles(tools) {
  const by = new Map();
  for (const t of tools) {
    const d = t.display; if (!d || d.kind !== "file" || t.ok === false) continue;
    const f = by.get(d.path) || { path: d.path, added: 0, removed: 0, created: false, known: true };
    f.created ||= !!d.created; if (d.added == null) f.known = false; else { f.added += d.added; f.removed += d.removed || 0; }
    by.set(d.path, f);
  }
  return [...by.values()];
}
function filesCard(files) {
  const add = files.reduce((n, f) => n + f.added, 0), rem = files.reduce((n, f) => n + f.removed, 0);
  const el = h(`<div class="files-card"><div class="files-h"><b>${files.length} file${files.length === 1 ? "" : "s"} ${files.every((f) => f.created) ? "created" : "changed"}</b>
    <span class="diffstat"><b class="add">+${add}</b>${rem ? `<b class="rem">−${rem}</b>` : ""}</span></div><div class="files-rows"></div></div>`);
  for (const f of files) {
    const name = f.path.split("/").pop(), dir = shortPath(f.path.slice(0, -name.length - 1) || "/");
    const r = h(`<button type="button" class="file-row">${fsIcon({ name })}<span class="fr-name"><b>${esc(name)}</b><small>${esc(dir)}${f.created ? " · new" : ""}</small></span></button>`);
    r.append(diffstat(f.known ? f : { created: f.created }));
    r.onclick = () => { FS.pendingOpen = f.path; location.hash = "#/fs/" + encodeURIComponent(f.path.slice(0, -name.length - 1) || "/"); };
    $(".files-rows", el).append(r);
  }
  return el;
}
function approvalCard(t) {
  const what = t.name === "run" ? "Run this command?" : t.name === "write_file" ? `Write ${t.args.path}?` : t.name === "artifact_start" ? `Serve "${t.args.name || t.args.folder || "this"}" at its own link?` : `Edit ${t.args.path}?`;
  const preview = t.name === "run" ? t.args.command : t.name === "write_file" ? t.args.content : t.name === "artifact_start"
    ? `folder:  ${t.args.folder || "(working folder)"}\ncommand: ${t.args.command || "static files (index.html)"}` : `--- replace\n${t.args.old}\n+++ with\n${t.args.new}`;
  const el = h(`<div class="approval"><div class="approval-q">${esc(what)}</div><pre></pre>
    <div class="approval-btns"><button class="btn btn-ink btn-small" data-a="allow">Allow</button>
    <button class="btn btn-butter btn-small" data-a="always">Allow ${t.name === "run" ? "commands" : t.name === "artifact_start" ? "serving" : "edits"} for this session</button>
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
// "Jump to latest" when you've scrolled up in a long conversation
function attachJump(tr) {
  const b = h(`<button class="jump" type="button" aria-label="Jump to the latest message" hidden>${I.down}</button>`);
  tr.parentElement.append(b);
  b.onclick = () => tr.scrollTo({ top: tr.scrollHeight, behavior: "smooth" });
  tr.addEventListener("scroll", () => { b.hidden = tr.scrollHeight - tr.scrollTop - tr.clientHeight < 400; }, { passive: true });
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
  { n: "live", d: "See the artifacts RiRi is serving", run: () => { location.hash = "#/live"; } },
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
function stopLive() { if (S.live && S.live.es) S.live.es.close(); S.live = null; S.stepState = {}; clearInterval(S.runTick); }
function startLive(run) {
  stopLive();
  const L = S.live = { id: run.id, base: run.base_message_id ?? -1, events: [], blocks: [], phase: "queued", progress: null,
    notices: [], started: run.created || Date.now() / 1000, finished: false };
  S.feeds[run.id] = S.feeds[run.id] || [];
  S.lastFeedRun = run.id;
  L.seed = Math.floor(Math.random() * 97);
  $("#conv-composer")?.setRunning(true);
  renderMessages();
  connect(L, -1);
  clearInterval(S.runTick); S.runTick = setInterval(paintRunbar, 1000);
  paintRunbar();
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
    case "reasoning": cur().reasoning += ev.text; L.toks = (L.toks || 0) + 1; L.lastTok = ev.t; L.writeT0 ??= ev.t; break;
    case "content": cur().content += ev.text; L.toks = (L.toks || 0) + 1; L.lastTok = ev.t; L.writeT0 ??= ev.t; break;
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
    case "tool_result": { const t = findTool(L, ev.id); if (t) { t.output = ev.output; t.ok = ev.ok; t.display = ev.display || null; }
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
  clearInterval(S.runTick); paintRunbar();
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
  try { new Notification(title, { body: String(body || "").slice(0, 140), icon: "/icon-192.png", tag: "riri" }); } catch { /* not supported */ }
}
function renderLive() {
  const box = $("#live"), L = S.live; if (!box || !L) return;
  box.innerHTML = "";
  if (L.blocks.length) {
    const el = turnView(L.blocks.map((b) => ({ ...b, live: true })), { live: true, state: L.phase === "writing" ? "writing" : L.phase });
    box.append(el);
    for (const b of L.blocks) for (const t of b.tools) if (t.awaiting) el.querySelector(".msg-ai-body").append(approvalCard(t));
  }
  paintRunbar();
  scrollDown();
}

// ------------------------------------------------------------------ the run bar
/* While RiRi works: an orb, a word with some attitude, what she's on right now, a timer, tokens, and the plan.
   One small element, updated once a second and on events; the animation is CSS (transform/opacity only). */
const RUN_WORDS = {
  think: ["Scheming", "Plotting", "Conjuring", "Overclocking", "Weaponizing ideas", "Bending reality", "Cooking", "Forging",
    "Outsmarting entropy", "Wrangling neurons", "Summoning", "Calculating trajectories", "Brewing chaos", "Assembling the payload",
    "Hacking the planet", "Rewiring", "Going full send", "Igniting thrusters", "Spinning up the reactor", "Locking on",
    "Sharpening the blade", "Running the gauntlet", "Plotting world domination", "Cracking it open"],
  read: ["Absorbing", "Decrypting", "Ingesting", "Scanning the archives", "Speed-reading", "Jacking into the matrix",
    "Inhaling context", "Loading the arsenal", "Studying the battlefield"],
  web: ["Hunting", "Interrogating the internet", "Tracking it down", "Infiltrating the web", "Raiding the archives",
    "Following the trail", "Shaking down sources"],
  run: ["Executing", "Firing commands", "Taking the wheel", "Breaking things carefully", "Pulling the trigger", "Running ops"],
  edit: ["Forging code", "Rewriting reality", "Hammering it out", "Patching the matrix", "Welding", "Carving"],
  build: ["Building", "Launching", "Raising the stage", "Lighting it up", "Deploying"],
  wait: ["Holding the line", "Queued for launch", "Waiting in the wings"],
  ask: ["Waiting on your call"],
};
const TOOL_NOW = { learn: "Noting a lesson", web_search: "Searching the web", read_webpage: "Reading a page", run: "Running", run_python: "Running Python",
  write_file: "Writing", edit_file: "Editing", read_file: "Reading", list_files: "Looking through", glob: "Finding files", search: "Searching code",
  load_skill: "Loading the skill", artifact_start: "Starting", artifact_stop: "Stopping", artifact_logs: "Reading the log", todo: "Planning",
  add_task: "Adding a task", save_note: "Saving a note", remember: "Remembering", search_notes: "Searching notes" };
const TOOL_WORDKIND = { web_search: "web", read_webpage: "web", run: "run", run_python: "run", write_file: "edit", edit_file: "edit",
  artifact_start: "build", artifact_stop: "build", read_file: "read", list_files: "read", glob: "read", search: "read", load_skill: "read" };
function runbar() {
  const el = h(`<div class="runbar" id="runbar" role="status" aria-live="polite" hidden>
    <div class="rb-plan-list" hidden></div>
    <div class="rb-row"><span class="rb-orb" aria-hidden="true"><i></i></span>
      <span class="rb-main"><span class="rb-word"></span><span class="rb-what"></span></span>
      <span class="rb-meta"></span><button class="rb-plan" type="button" hidden></button></div>
    <i class="rb-line" aria-hidden="true"></i></div>`);
  $(".rb-plan", el).onclick = () => { const l = $(".rb-plan-list", el); l.hidden = !l.hidden; el.classList.toggle("open", !l.hidden); };
  return el;
}
function currentTool(L) { for (let i = L.blocks.length - 1; i >= 0; i--) for (const t of [...L.blocks[i].tools].reverse()) if (t.output == null) return t; return null; }
function paintRunbar() {
  const bar = $("#runbar"), L = S.live;
  if (!bar) return;
  if (!L || L.finished) { bar.hidden = true; bar.classList.remove("open"); return; }
  bar.hidden = false;
  const now = Date.now() / 1000, tool = currentTool(L), lastB = L.blocks.at(-1);
  let kind = "think", what = "";
  if (L.phase === "awaiting") { kind = "ask"; what = "Needs your OK below"; }
  else if (L.phase === "queued") { kind = "wait"; what = "Another reply is using the model"; }
  else if (L.phase === "reading") {
    kind = "read"; const p = L.progress;
    if (p && p.total) { const todo = Math.max(1, p.total - p.cache), done = Math.max(0, p.processed - p.cache);
      const speed = S.status?.engine.speed.pp_tps || 15;
      what = `Reading ${fmtK(done)} of ${fmtK(todo)} tokens · ~${dur((todo - done) / speed)} left`; bar.style.setProperty("--rb-p", done / todo); }
    else what = "Reading the conversation";
  } else if (tool && (L.phase === "tool" || !lastB || lastB.closed)) {
    kind = TOOL_WORDKIND[tool.name] || "run"; what = `${TOOL_NOW[tool.name] || TOOL_VERB[tool.name] || tool.name} · ${toolArg(tool.name, tool.args)}`.replace(/ · $/, "");
  } else if (lastB && !lastB.closed && !lastB.content && lastB.reasoning) {
    const tail = lastB.reasoning.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s/).pop().slice(-90);
    what = tail ? `Thinking: ${tail}` : "Thinking";
  } else if (lastB && !lastB.closed && lastB.content) what = "Writing the answer";
  else what = "Thinking";
  const words = RUN_WORDS[kind] || RUN_WORDS.think;
  const word = words[(Math.floor(now / 3.5) + (L.seed || 0)) % words.length] + "…";
  const w = $(".rb-word", bar);
  if (w.textContent !== word) { w.textContent = word; w.classList.remove("swap"); void w.offsetWidth; w.classList.add("swap"); }
  $(".rb-what", bar).textContent = what;
  bar.dataset.kind = kind;
  const secs = now - (L.started || now);
  const tps = L.toks && L.lastTok && L.writeT0 && L.lastTok > L.writeT0 ? L.toks / (L.lastTok - L.writeT0) : 0;
  $(".rb-meta", bar).innerHTML = `<b>${fmtClock(secs)}</b>${L.toks ? `<span>${fmtK(L.toks)} tok${tps ? ` · ${tps.toFixed(1)}/s` : ""}</span>` : ""}`;
  // the plan, like a checklist you can open
  const todos = L.todos || S.session?.meta?.todos || [];
  const pb = $(".rb-plan", bar), list = $(".rb-plan-list", bar);
  if (todos.length) {
    const done = todos.filter((i) => i.status === "done").length;
    pb.hidden = false; pb.innerHTML = `<i style="--p:${done / todos.length}"></i>${done}/${todos.length}`;
    list.innerHTML = `<p>Plan</p>` + todos.map((i) => `<div class="p-${i.status}"><span class="p-mark"></span><span>${esc(i.text)}</span></div>`).join("");
    if (L.phase !== "reading") bar.style.setProperty("--rb-p", done / todos.length);
  } else { pb.hidden = true; list.hidden = true; if (L.phase !== "reading") bar.style.removeProperty("--rb-p"); }
}
function fmtClock(s) { s = Math.max(0, Math.floor(s)); const m = Math.floor(s / 60); return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`; }

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
  $("#machine").innerHTML = `<h3><a href="#/server" class="machine-link">The machine →</a></h3>
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
    if (st.artifacts_live != null) updateLiveBadge(st.artifacts_live);
    const changed = !prev || JSON.stringify(prev.engine.active.map((r) => r.id)) !== JSON.stringify(st.engine.active.map((r) => r.id));
    if (changed) { renderSessionList(); if (!S.live) renderFeed(); loadWorkspaces(); }
    if (S.view === "home" && !S.sid && $("#hero-status") && S.dash) $("#hero-status").textContent = heroLine({ ...S.dash, ...st, engine: st.engine });
  } catch { /* offline: try again later */ }
  if (!once) pollTimer = setTimeout(pollStatus, S.status?.engine.active.length ? 4000 : 15000);
}
$("#speed-pill").onclick = () => $("#open-log").click();

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
const FS = { path: "~", items: [], hidden: false, open: null, dirs: new Map(), smode: "name",
  expanded: (() => { try { return new Set(JSON.parse(localStorage.getItem("fs-exp") || "[]")); } catch { return new Set(); } })(), grid: (() => { try { return localStorage.getItem("fs-grid") === "1"; } catch { return false; } })() };
const KIND_ICON = { image: "image", video: "film", audio: "music", pdf: "doc", archive: "box", code: "code", text: "doc" };
function fsIcon(it) { return fileIcon(it.name, it.dir); }
function fsImages() {
  const base = FS.path === "/" ? "" : FS.path;
  return FS.items.filter((x) => !x.dir && fileKind(x.name) === "image" && (FS.hidden || !x.name.startsWith(".")) && !/\.(svg|heic)$/i.test(x.name))
    .map((x) => ({ path: base + "/" + x.name, src: rawUrl(base + "/" + x.name), title: x.name, sub: `${fmtSize(x.size)} · ${ago(x.mtime)}`, download: rawUrl(base + "/" + x.name, 1) }));
}
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
      if (/permission denied|cannot reach the server/i.test(e.message)) return connectCard(stage);
      stage.innerHTML = `<div class="page"><div class="notice err">${esc(e.message)}</div><p><a href="#/fs">Back to your home folder</a></p></div>`;
    }
    return;
  }
  FS.path = data.path; FS.items = data.items; FS.home = data.home;
  const parts = data.path.split("/").filter(Boolean);
  const crumbs = [`<a href="#/fs/${encodeURIComponent("/")}">/</a>`].concat(parts.map((p, i) =>
    `<a href="#/fs/${encodeURIComponent("/" + parts.slice(0, i + 1).join("/"))}">${esc(p)}</a>`)).join(`<span class="sep">/</span>`);
  const band = h(`<div class="band fs-band"><nav class="crumbs" aria-label="Path">${crumbs}</nav>
    <button class="band-chip hide-narrow" data-a="home" type="button" title="Home folder">${I.folder}Home</button>
    <button class="band-chip" data-a="ask" type="button">${I.chat}Ask ${esc(AN())} here</button>
    <button class="band-chip hide-narrow" data-a="code" type="button">${I.code}Code here</button>
    <button class="icon-btn" data-a="more" type="button" aria-label="More">${I.dots}</button></div>`);
  stage.append(band);
  const wrap = h(`<div class="fs"><section class="fs-list">
      <div class="fs-tools"><button class="mini-btn" data-a="up" type="button" aria-label="Up one folder">↑<span>Up</span></button><button class="mini-btn" data-a="newdir" type="button">${I.folder}<span>Folder</span></button>
        <button class="mini-btn" data-a="newfile" type="button">${I.doc}<span>File</span></button><label class="mini-btn">${MI.dl.replace("M12 4.5v11M7.5 11l4.5 4.5 4.5-4.5", "M12 15.5v-11M7.5 9 12 4.5 16.5 9")}<span>Upload</span><input type="file" multiple hidden></label>
        <span class="grow"></span>
        <label class="mini-btn fs-hidden" title="Show hidden files"><input type="checkbox"${FS.hidden ? " checked" : ""}><span>Hidden</span></label>
        <button class="mini-btn" data-a="grid" type="button" aria-pressed="${FS.grid}" aria-label="${FS.grid ? "List view" : "Grid view"}">${FS.grid ? I.list : I.grid}</button></div>
      <div class="fs-search"><label class="fs-sbox">${I.search}<input type="search" placeholder="Search in ${esc(shortPath(data.path).split("/").pop() || "/")}" aria-label="Search files" enterkeyhint="search"><kbd class="hide-narrow">Ctrl P</kbd></label>
        <div class="seg fs-smode" role="tablist"><button role="tab" data-m="name">Names</button><button role="tab" data-m="content">Text</button></div></div>
      <div class="fs-results" hidden></div>
      <div class="fs-rows" role="tree" aria-label="Files"></div></section>
    <section class="fs-view"><div class="fs-empty">Pick a file to view or edit it.</div></section></div>`);
  stage.append(wrap);
  const rows = $(".fs-rows", wrap);
  rows.classList.toggle("fs-grid", FS.grid);
  const list = data.items.filter((it) => FS.hidden || !it.name.startsWith("."));
  if (!list.length) rows.append(h(`<p class="empty-note">This folder is empty.</p>`));
  FS.dirs.clear(); FS.dirs.set(data.path, data.items);   // fresh listing; expanded folders reload themselves
  if (!FS.grid) { drawTree(); }
  else for (const it of list) {
    const full = (data.path === "/" ? "" : data.path) + "/" + it.name;
    const k = it.dir ? "dir" : fileKind(it.name);
    const r = FS.grid
      ? h(`<div class="fs-tile" role="listitem" data-path="${esc(full)}"><button type="button" class="fs-name">
          ${k === "image" && !/\.(svg|heic)$/i.test(it.name) ? `<span class="fs-thumb"><img alt="" loading="lazy" decoding="async" src="${esc(rawUrl(full))}"></span>` : `<span class="fs-thumb fs-thumb-ico">${fsIcon(it)}</span>`}
          <span class="fs-tname">${esc(it.name)}</span><small>${it.dir ? "Folder" : fmtSize(it.size)}</small></button></div>`)
      : h(`<div class="fs-row" role="listitem" data-path="${esc(full)}"><button type="button" class="fs-name">${fsIcon(it)}<span>${esc(it.name)}${it.link ? " ↗" : ""}</span></button>
      <span class="fs-size">${it.dir ? "" : fmtSize(it.size)}</span><span class="fs-time">${esc(ago(it.mtime))}</span>
      <span class="fs-acts"><button type="button" data-a="rename" title="Rename" aria-label="Rename">${I.pen}</button><button type="button" data-a="del" title="Move to trash" aria-label="Move to trash">${I.trash}</button></span></div>`);
    $(".fs-name", r).onclick = () => (it.dir ? (location.hash = "#/fs/" + encodeURIComponent(full)) : openFsFile(full, it));
    if (!FS.grid) { $('[data-a="rename"]', r).onclick = () => fsRename(full); $('[data-a="del"]', r).onclick = () => fsDelete(full, it.dir); }
    rows.append(r);
  }
  const act = (a) => $(`[data-a="${a}"]`, stage);
  act("grid").onclick = () => { FS.grid = !FS.grid; try { localStorage.setItem("fs-grid", FS.grid ? "1" : "0"); } catch { /* private mode */ } renderFS(data.path); };
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
  act("newfile").onclick = async () => { const n = prompt("Name of the new file", "notes.md"); if (!n) return;
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
  wireSearch(wrap, data.path);
  if (FS.pendingOpen && FS.pendingOpen.startsWith(data.path)) {
    const p = FS.pendingOpen; FS.pendingOpen = null;
    const it = data.items.find((x) => x.name === p.split("/").pop());
    if (it) openFsFile(p, it);
  }
  renderFeed();
}
// ---- the explorer tree (VS Code style): expand in place, indent guides, keyboard navigation
const joinPath = (dir, name) => (dir === "/" ? "" : dir) + "/" + name;
function saveExpanded() { try { localStorage.setItem("fs-exp", JSON.stringify([...FS.expanded].slice(-300))); } catch { /* private mode */ } }
function drawTree() {
  const box = $(".fs-rows"); if (!box) return;
  const focused = document.activeElement?.closest(".tr")?.dataset.path;
  const missing = [];
  box.innerHTML = ""; box.classList.add("tree");
  const walk = (dir, depth) => {
    const items = (FS.dirs.get(dir) || []).filter((it) => FS.hidden || !it.name.startsWith("."));
    for (const it of items) {
      const full = joinPath(dir, it.name), open = it.dir && FS.expanded.has(full);
      const r = h(`<div class="tr${it.dir ? " is-dir" : ""}" role="treeitem" data-path="${esc(full)}" ${it.dir ? `aria-expanded="${open}"` : ""} style="--d:${depth}">
        <button type="button" class="tr-main" tabindex="-1"><span class="tr-ind" aria-hidden="true"></span><span class="tr-chev" aria-hidden="true">${it.dir ? '<svg viewBox="0 0 16 16"><path d="m6 4 4 4-4 4"/></svg>' : ""}</span>
          ${fileIcon(it.name, it.dir, open)}<span class="tr-name">${esc(it.name)}${it.link ? '<i class="tr-link">↗</i>' : ""}</span></button>
        <span class="tr-meta">${it.dir ? "" : fmtSize(it.size)}</span>
        <span class="fs-acts"><button type="button" data-a="rename" title="Rename" aria-label="Rename">${I.pen}</button><button type="button" data-a="del" title="Move to trash" aria-label="Move to trash">${I.trash}</button></span></div>`);
      if (full === FS.open) r.setAttribute("aria-current", "true");
      $(".tr-main", r).onclick = () => treeActivate(it, full);
      $(".tr-main", r).ondblclick = () => { if (it.dir) location.hash = "#/fs/" + encodeURIComponent(full); };
      $('[data-a="rename"]', r).onclick = () => fsRename(full);
      $('[data-a="del"]', r).onclick = () => fsDelete(full, it.dir);
      box.append(r);
      if (open) {
        if (FS.dirs.has(full)) walk(full, depth + 1);
        else missing.push(full), box.append(h(`<div class="tr tr-loading" style="--d:${depth + 1}"><span class="tr-main"><span class="tr-ind"></span><i class="spin"></i><span class="tr-name">Loading…</span></span></div>`));
      }
    }
    if (!items.length && depth > 0) box.append(h(`<div class="tr tr-empty" style="--d:${depth}"><span class="tr-main"><span class="tr-ind"></span><span class="tr-name">empty</span></span></div>`));
  };
  walk(FS.path, 0);
  if (missing.length) Promise.all(missing.map((p) => api(`/api/fs/list?path=${encodeURIComponent(p)}`)
    .then((d) => FS.dirs.set(p, d.items)).catch(() => { FS.dirs.set(p, []); FS.expanded.delete(p); }))).then(() => S.view === "fs" && drawTree());
  const rowsEls = $$(".tr[data-path] .tr-main", box);
  const keep = focused && box.querySelector(`.tr[data-path="${CSS.escape(focused)}"] .tr-main`);
  (keep || box.querySelector('.tr[aria-current] .tr-main') || rowsEls[0])?.setAttribute("tabindex", "0");
  if (keep) keep.focus({ preventScroll: true });
}
async function treeActivate(it, full) {
  if (!it.dir) { FS.open = full; $$(".tr", $(".fs-rows")).forEach((r) => r.toggleAttribute("aria-current", r.dataset.path === full)); return openFsFile(full, it); }
  if (FS.expanded.has(full)) { FS.expanded.delete(full); saveExpanded(); return drawTree(); }
  FS.expanded.add(full); saveExpanded(); drawTree();
  if (!FS.dirs.has(full)) {
    try { const d = await api(`/api/fs/list?path=${encodeURIComponent(full)}`); FS.dirs.set(full, d.items); }
    catch (e) { FS.dirs.set(full, []); toast(e.message); }
    drawTree();
  }
}
document.addEventListener("keydown", (e) => {     // arrows move through the tree like VS Code
  const cur = e.target.closest && e.target.closest(".fs-rows.tree .tr-main"); if (!cur) return;
  const all = $$(".fs-rows.tree .tr[data-path] .tr-main"), i = all.indexOf(cur), row = cur.closest(".tr");
  const go = (k) => { const t = all[Math.max(0, Math.min(all.length - 1, k))]; if (!t) return; all.forEach((x) => x.setAttribute("tabindex", "-1")); t.setAttribute("tabindex", "0"); t.focus(); t.scrollIntoView({ block: "nearest" }); };
  if (e.key === "ArrowDown") { e.preventDefault(); go(i + 1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); go(i - 1); }
  else if (e.key === "ArrowRight" && row.classList.contains("is-dir")) { e.preventDefault(); if (row.getAttribute("aria-expanded") === "true") go(i + 1); else cur.click(); }
  else if (e.key === "ArrowLeft") {
    e.preventDefault();
    if (row.getAttribute("aria-expanded") === "true") cur.click();
    else { const d = +row.style.getPropertyValue("--d"); for (let k = i - 1; k >= 0; k--) if (+all[k].closest(".tr").style.getPropertyValue("--d") < d) return go(k); }
  }
});
// ---- search: names (fuzzy, ranked) or text inside files (grep), under the current folder
function hiMatch(text, q) {
  const t = String(text), i = t.toLowerCase().indexOf(q.toLowerCase());
  return i < 0 ? esc(t) : esc(t.slice(0, i)) + "<mark>" + esc(t.slice(i, i + q.length)) + "</mark>" + esc(t.slice(i + q.length));
}
function wireSearch(wrap, base) {
  const inp = $(".fs-search input", wrap), res = $(".fs-results", wrap), rows = $(".fs-rows", wrap);
  const modes = $$(".fs-smode button", wrap);
  const setMode = (m) => { FS.smode = m; modes.forEach((b) => b.setAttribute("aria-selected", b.dataset.m === m)); inp.placeholder = m === "name" ? `Search names in ${shortPath(base).split("/").pop() || "/"}` : "Search text inside files"; run(); };
  let t, seq = 0;
  const run = () => {
    clearTimeout(t);
    const q = inp.value.trim();
    if (q.length < 2) { res.hidden = true; rows.hidden = false; return; }
    res.hidden = false; rows.hidden = true;
    res.innerHTML = `<p class="fs-sstat"><i class="spin"></i> Searching ${FS.smode === "name" ? "names" : "inside files"}…</p>`;
    t = setTimeout(async () => {
      const my = ++seq;
      let r;
      try { r = await api(`/api/fs/search?path=${encodeURIComponent(base)}&q=${encodeURIComponent(q)}&mode=${FS.smode}&hidden=${FS.hidden ? 1 : 0}`); }
      catch (e) { if (my === seq) res.innerHTML = `<p class="fs-sstat err">${esc(e.message)}</p>`; return; }
      if (my !== seq) return;
      const n = r.items.length;
      res.innerHTML = `<p class="fs-sstat">${n ? `${n}${r.truncated ? "+" : ""} ${FS.smode === "name" ? (n === 1 ? "match" : "matches") : (n === 1 ? "file" : "files")}` : "No matches"}${r.truncated ? " · showing the best" : ""}</p>`;
      for (const it of r.items) {
        const name = it.rel.split("/").pop(), dir = it.rel.slice(0, -name.length - 1);
        if (FS.smode === "name") {
          const row = h(`<button type="button" class="sr">${fileIcon(name, it.dir)}<span class="sr-name">${hiMatch(name, q)}</span><span class="sr-dir">${esc(dir)}</span></button>`);
          row.onclick = () => (it.dir ? (location.hash = "#/fs/" + encodeURIComponent(it.path)) : openFsFile(it.path, {}));
          res.append(row);
        } else {
          const grp = h(`<div class="sr-file"><button type="button" class="sr">${fileIcon(name, false)}<span class="sr-name">${esc(name)}</span><span class="sr-dir">${esc(dir)}</span><span class="sr-n">${it.matches.length}</span></button></div>`);
          $("button", grp).onclick = () => openFsFile(it.path, {});
          for (const m of it.matches) {
            const l = h(`<button type="button" class="sr-line"><em>${m.line}</em><span>${hiMatch(m.text, q)}</span></button>`);
            l.onclick = () => openFsFile(it.path, {}, m.line);
            grp.append(l);
          }
          res.append(grp);
        }
      }
    }, FS.smode === "name" ? 220 : 380);
  };
  inp.addEventListener("input", run);
  inp.addEventListener("keydown", (e) => { if (e.key === "Escape") { inp.value = ""; run(); inp.blur(); } if (e.key === "Enter") $(".fs-results .sr")?.click(); });
  modes.forEach((b) => (b.onclick = () => setMode(b.dataset.m)));
  setMode(FS.smode);
}
document.addEventListener("keydown", (e) => {
  if (S.view === "fs" && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") { e.preventDefault(); $(".fs-search input")?.focus(); }
});
async function connectCard(stage) {
  const hst = await api("/api/host").catch(() => ({}));
  const cmd = hst.pubkey ? `echo 'from="172.16.0.0/12",no-port-forwarding,no-agent-forwarding,no-X11-forwarding ${hst.pubkey}' >> ~/.ssh/authorized_keys` : "";
  stage.innerHTML = `<div class="page"><div class="page-h"><div><h1>Files</h1><p>Browse, edit and manage everything on your server.</p></div></div>
    <div class="card lock-card"><b>Connect ${esc(AN())} to your server</b>
      <p>${esc(AN())} has her own SSH key, accepted only from this app's private network. Authorise it once: SSH into the server as <code>${esc(hst.user || "your user")}</code> and run:</p>
      <div class="codeblock" style="width:100%"><div class="codeblock-h"><span>bash</span><button class="copy-code" type="button">Copy</button></div><pre><code></code></pre></div>
      <button class="btn btn-accent" type="button" data-again>Check again</button></div></div>`;
  $("code", stage).textContent = cmd || "The key hasn't been created yet. Restart the app and try again.";
  $("[data-again]", stage).onclick = () => renderFS(FS.path || "~");
}
function fmtSize(n) { return n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(1) + " KB" : n < 1073741824 ? (n / 1048576).toFixed(1) + " MB" : (n / 1073741824).toFixed(2) + " GB"; }
async function openFsFile(path, it = {}, line = 0) {
  const view = $(".fs-view"); if (!view) return;
  const name = path.split("/").pop(), kind = fileKind(name), folder = path.replace(/\/[^/]+$/, "") || "/";
  FS.open = path;
  $$(".fs-row, .fs-tile").forEach((r) => r.toggleAttribute("aria-current", r.dataset.path === path));
  view.innerHTML = "";
  const head = h(`<div class="fs-view-h"><button class="icon-btn fs-back" type="button" aria-label="Back to the folder">${I.back}</button>
    ${fsIcon({ name })}<div class="fs-title"><b title="${esc(path)}">${esc(name)}</b><span>${it.size != null ? fmtSize(it.size) : ""}${it.mtime ? " · " + esc(ago(it.mtime)) : ""}</span></div>
    <span class="grow"></span>
    <button class="mini-btn" data-v="ask" type="button">${I.chat}<span>Ask ${esc(AN())}</span></button>
    <a class="mini-btn" href="${esc(rawUrl(path, 1))}" download>${MI.dl}<span>Download</span></a></div>`);
  view.append(head);
  $(".fs-back", head).onclick = () => { view.innerHTML = `<div class="fs-empty">Pick a file to view or edit it.</div>`; FS.open = null; $$(".fs-row, .fs-tile").forEach((r) => r.removeAttribute("aria-current")); };
  $('[data-v="ask"]', head).onclick = () => startChatIn(folder, `Have a look at ${path}. `);
  const card = (title, text, btns = "") => view.append(h(`<div class="fs-card">${fsIcon({ name })}<b>${esc(title)}</b><p>${esc(text)}</p><div class="row-btns">${btns}</div></div>`));
  if (kind === "image") {
    let src = rawUrl(path);
    if (/\.svg$/i.test(name)) {   // SVG is drawn from its text (as a picture, so any script in it can't run)
      try { const f = await api(`/api/fs/read?path=${encodeURIComponent(path)}`); src = URL.createObjectURL(new Blob([f.text || ""], { type: "image/svg+xml" })); } catch (e) { return card("Couldn't open it", e.message); }
    }
    const box = h(`<div class="fs-media fs-image"><img alt="${esc(name)}" src="${esc(src)}"><span class="fs-dims"></span></div>`);
    const img = $("img", box);
    img.onload = () => { $(".fs-dims", box).textContent = `${img.naturalWidth} × ${img.naturalHeight}`; };
    img.onerror = () => { box.replaceWith(h(`<div class="fs-card">${fsIcon({ name })}<b>This browser can't show this picture</b><p>Download it to open it.</p></div>`)); };
    img.onclick = () => {
      const all = fsImages(); const i = all.findIndex((x) => x.path === path);
      openViewer(i >= 0 ? all : [{ src, title: name, download: rawUrl(path, 1) }], Math.max(0, i));
    };
    view.append(box);
    return;
  }
  if (kind === "video" || kind === "audio") {
    const box = h(`<div class="fs-media fs-${kind}"></div>`);
    box.append(mediaPlayer(rawUrl(path), { kind, title: name.replace(/\.[^.]+$/, ""), sub: shortPath(folder) }));
    view.append(box);
    return;
  }
  if (kind === "pdf") return card("PDF document", "Opens in your browser's PDF viewer.", `<a class="btn btn-accent" href="${esc(rawUrl(path))}" target="_blank" rel="noopener">${MI.ext}Open the PDF</a>`);
  if (kind === "archive") return card("Archive", `Download it, or ask ${AN()} to unpack it here.`, `<a class="btn btn-ghost" href="${esc(rawUrl(path, 1))}" download>${MI.dl}Download</a>`);
  const loading = h(`<div class="fs-empty">Opening…</div>`); view.append(loading);
  let f;
  try { f = await api(`/api/fs/read?path=${encodeURIComponent(path)}`); } catch (e) { loading.remove(); return card("Couldn't open it", e.message); }
  loading.remove();
  if (FS.open !== path) return;
  if (f.binary) return card("Binary file", `${fmtSize(f.size)}. It isn't text, so it can't be shown here.`, `<a class="btn btn-ghost" href="${esc(rawUrl(path, 1))}" download>${MI.dl}Download</a>`);
  const cv = codeView({ text: f.text, name, readOnly: f.truncated,
    onSave: (text) => api("/api/fs/write", { method: "POST", body: { path, content: text } }) });
  if (f.truncated) $(".code-meta", cv).textContent += ` · first ${fmtSize(f.text.length)} of ${fmtSize(f.size)} (read only)`;
  view.append(cv);
  if (line && cv.gotoLine) requestAnimationFrame(() => cv.gotoLine(line));
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

// ------------------------------------------------------------------ Live: artifacts RiRi is serving
let liveTimer;
async function renderArtifacts() {
  S.view = "live"; setNav("live");
  const stage = $("#stage");
  stage.innerHTML = `<div class="page live-page"><div class="page-h"><div><h1>Live</h1><p>Pages and apps ${esc(AN())} is serving, each at its own private link. Only someone with the link can open one.</p></div>
    <div class="live-sum" id="live-sum"></div></div><div class="art-grid" id="art-grid"><div class="fs-empty">Loading…</div></div></div>`;
  clearTimeout(liveTimer);
  await drawArtifacts();
  renderFeed();
}
async function drawArtifacts() {
  if (S.view !== "live") return;
  let data;
  try { data = await api("/api/artifacts"); } catch (e) { $("#art-grid").innerHTML = `<div class="notice err">${esc(e.message)}</div>`; return; }
  if (S.view !== "live") return;
  S.artifacts = data.artifacts;
  const grid = $("#art-grid"), live = data.artifacts.filter((a) => a.state === "live").length;
  $("#live-sum").innerHTML = data.artifacts.length ? `<span class="pulse ${live ? "on" : ""}"></span><b>${live}</b> live <span class="sep">·</span> ${data.artifacts.length} in all` : "";
  updateLiveBadge(live);
  grid.innerHTML = "";
  if (!data.artifacts.length) {
    const e = h(`<div class="card live-empty"><span class="art-ico big">${I.spark}</span><h2>Nothing live yet</h2>
      <p>Ask ${esc(AN())} to build something you can open: a page, a dashboard, a little tool or game. Or to clone and run a project. It gets its own link here.</p>
      <div class="chips"></div></div>`);
    for (const c of ["Build me a pomodoro timer page", "Make a dashboard of this server's disk and memory", "Clone a GitHub project and run it"]) {
      const b = h(`<button class="chip" type="button">${esc(c)}</button>`);
      b.onclick = async () => { location.hash = "#/"; setTimeout(() => { const t = $(".hero textarea"); if (t) { t.value = c; t.dispatchEvent(new Event("input")); t.focus(); } }, 120); };
      $(".chips", e).append(b);
    }
    grid.append(e);
    return;
  }
  if (data.firewall_blocked) {
    const w = h(`<div class="card fw-card"><b>The links can't open yet: the server's firewall is in the way</b>
      <p>Your artifacts are running, but the firewall (ufw) stops the web front door from reaching them. Run this once on the server (it only opens these ports to Docker's own networks, not your home network):</p>
      <div class="codeblock"><div class="codeblock-h"><span>bash</span><button class="copy-code" type="button">${I.copy}<span>Copy</span></button></div><pre><code></code></pre></div></div>`);
    $("code", w).textContent = data.firewall_fix;
    grid.append(w);
  }
  for (const a of data.artifacts) grid.append(artifactTile(a));
  liveTimer = setTimeout(() => { if (S.view === "live" && !document.hidden && !$(".art-tile.busy")) drawArtifacts(); }, 20000);
}
function artifactTile(a) {
  const host = a.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const st = a.state === "live" ? `Live${a.uptime ? " · " + dur(a.uptime).replace(/ \d+ s$/, "") : ""}` : a.state === "crashed" ? "Crashed" : "Stopped";
  const el = h(`<article class="art-tile s-${esc(a.state)}">
    <a class="art-thumb" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${esc(a.name)}">
      ${a.state === "live" ? `<iframe src="${esc(a.url)}" title="" tabindex="-1" loading="lazy" sandbox="allow-scripts allow-same-origin" aria-hidden="true"></iframe>` : `<span class="art-off">${I.spark}<small>${esc(st)}</small></span>`}</a>
    <div class="art-info">
      <div class="art-row"><b class="art-title"></b><span class="art-state s-${esc(a.state)}">${esc(st)}</span></div>
      ${a.description ? `<p class="art-desc"></p>` : ""}
      <dl class="art-facts">
        <div><dt>Link</dt><dd><a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer" class="mono">${esc(host.length > 40 ? host.slice(0, 13) + "…" + host.slice(-24) : host)}</a></dd></div>
        <div><dt>Port</dt><dd class="mono">${esc(String(a.port))}</dd></div>
        <div><dt>Folder</dt><dd><a class="mono" href="#/fs/${encodeURIComponent(a.dir)}">${esc(shortPath(a.dir))}</a></dd></div>
        <div><dt>Runs</dt><dd class="mono art-cmd"></dd></div>
        ${a.session_id ? `<div><dt>Made in</dt><dd><a href="#/c/${esc(a.session_id)}">${esc(a.session_title || "a conversation")}</a></dd></div>` : ""}
      </dl>
      <div class="art-acts">
        ${a.state === "live" ? `<a class="btn btn-accent btn-small" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${MI.ext}Open</a>
          <button class="btn btn-ghost btn-small" data-a="stop" type="button">${I.stop}Stop</button>`
          : `<button class="btn btn-accent btn-small" data-a="start" type="button">${MI.play}Start</button>`}
        <button class="btn btn-ghost btn-small" data-a="copy" type="button">${I.copy}Link</button>
        <button class="mini-btn" data-a="logs" type="button">Logs</button>
        <button class="icon-btn" data-a="more" type="button" aria-label="More">${I.dots}</button>
      </div></div></article>`);
  $(".art-title", el).textContent = a.name;
  if (a.description) $(".art-desc", el).textContent = a.description;
  $(".art-cmd", el).textContent = a.command;
  const busy = (b, label) => { el.classList.add("busy"); $$("button", el).forEach((x) => (x.disabled = true)); if (b) b.innerHTML = `<i class="spin"></i>${label}`; };
  const on = (n, f) => { const b = $(`[data-a="${n}"]`, el); if (b) b.onclick = () => f(b); };
  on("stop", async (b) => { busy(b, "Stopping"); await api(`/api/artifacts/${a.id}/stop`, { method: "POST" }).catch((e) => toast(e.message)); drawArtifacts(); });
  on("start", async (b) => {
    busy(b, "Starting");
    const r = await api(`/api/artifacts/${a.id}/start`, { method: "POST" }).catch((e) => ({ ok: false, message: e.message }));
    toast(r.ok ? `${a.name} is live.` : (r.message || "It didn't start.").split("\n")[0]);
    drawArtifacts();
  });
  on("copy", () => { navigator.clipboard.writeText(a.url); toast("Link copied."); });
  on("logs", () => artifactLogs(a));
  on("more", () => {
    const m = openModal(`<div class="modal-in"><div class="modal-h"><h2>${esc(a.name)}</h2><button class="icon-btn" data-close aria-label="Close">${I.x}</button></div>
      <div class="menu-list">
        <button type="button" data-m="rename">${I.pen}<span>Rename</span></button>
        <button type="button" data-m="ask">${I.chat}<span>Ask ${esc(AN())} to change it</span></button>
        <a href="#/fs/${encodeURIComponent(a.dir)}" data-close>${I.folder}<span>Open its folder</span></a>
        <button type="button" data-m="delete" class="danger">${I.trash}<span>Remove from Live</span><small>files stay</small></button></div></div>`);
    $('[data-m="rename"]', m).onclick = async () => { const n = prompt("Name", a.name); if (!n) return; await api(`/api/artifacts/${a.id}`, { method: "PATCH", body: { name: n } }); closeModal(); drawArtifacts(); };
    $('[data-m="ask"]', m).onclick = () => { closeModal(); startChatIn(a.dir, `Change the artifact "${a.name}" (id ${a.id}): `); };
    $('[data-m="delete"]', m).onclick = () => {
      const c = openModal(`<div class="modal-in"><div class="modal-h"><h2>Remove "${esc(a.name)}"?</h2></div>
        <div class="modal-sec"><p>It stops, and its link stops working for good. The files in <code>${esc(shortPath(a.dir))}</code> are kept.</p></div>
        <div class="row-btns"><button class="btn btn-ghost" data-close type="button">Keep it</button><button class="btn btn-danger" data-go type="button">Remove</button></div></div>`);
      $("[data-go]", c).onclick = async () => { await api(`/api/artifacts/${a.id}`, { method: "DELETE" }).catch((e) => toast(e.message)); closeModal(); drawArtifacts(); toast("Removed."); };
    };
    $$("[data-close]", m).forEach((x) => x.addEventListener("click", closeModal));
  });
  return el;
}
async function artifactLogs(a) {
  const m = openModal(`<div class="modal-in modal-wide"><div class="modal-h"><h2>${esc(a.name)} · log</h2><button class="icon-btn" data-close aria-label="Close">${I.x}</button></div>
    <pre class="log-pre">Loading…</pre><div class="row-btns"><button class="btn btn-ghost btn-small" data-r type="button">${I.redo}Refresh</button></div></div>`);
  const load = async () => {
    const pre = $(".log-pre", m);
    try { pre.textContent = (await api(`/api/artifacts/${a.id}/logs?lines=300`)).log; } catch (e) { pre.textContent = e.message; }
    pre.scrollTop = pre.scrollHeight;
  };
  $("[data-r]", m).onclick = load; load();
}
function updateLiveBadge(n) {
  $$(".live-badge").forEach((b) => { b.textContent = n || ""; b.hidden = !n; });
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
  renderLessons(stage);
  renderFeed();
}
const ORIGIN = { reflect: "learned from a past conversation", self: "noted while working", owner: "added by you" };
async function renderLessons(stage) {
  const d = await api("/api/lessons").catch(() => null);
  if (!d || S.view !== "memory") return;
  const sec = h(`<section class="lessons"><div class="page-h lessons-h"><div><h2>${I.brain}What ${esc(AN())} has learned</h2>
      <p>Lessons from her own work: mistakes, corrections, your 👍 and 👎. The relevant ones come back with similar requests.
      ${d.pending ? `<b>${d.pending} conversation${d.pending === 1 ? "" : "s"} waiting to be reviewed</b>; she reviews them when the machine is idle.` : ""}
      ${d.enabled ? "" : "<b>Learning is off in Settings.</b>"}</p></div>
      <button class="btn btn-ghost btn-small" type="button" data-reflect ${d.pending && d.enabled ? "" : "disabled"}>${d.busy ? "Reflecting…" : "Reflect now"}</button></div>
    <form class="add-row"><input class="grow" name="text" placeholder="Teach a lesson, e.g. Always run the tests before saying it's done" aria-label="Lesson"><button class="btn btn-ghost" type="submit">Teach</button></form>
    <ul class="mem-list lesson-list"></ul></section>`);
  const ul = $(".lesson-list", sec);
  if (!d.lessons.length) ul.append(h(`<p class="empty-note">Nothing yet. Lessons appear after ${esc(AN())} reviews a conversation that went wrong or right, or when she notes one while working.</p>`));
  for (const l of d.lessons) {
    const li = h(`<li class="lesson"><div><span class="tag-skill">${esc(l.skill)}</span><p></p><small>${esc(ORIGIN[l.origin] || l.origin)} · used ${l.uses}× · ${esc(ago(l.created))}${l.session_id ? ` · <a href="#/c/${esc(l.session_id)}">source</a>` : ""}</small></div>
      <span class="lesson-acts"><button class="task-del" type="button" data-e aria-label="Edit">${I.pen}</button><button class="task-del" type="button" data-d aria-label="Delete">${I.trash}</button></span></li>`);
    $("p", li).textContent = l.text;
    $("[data-d]", li).onclick = async () => { await api(`/api/lessons/${l.id}`, { method: "DELETE" }); li.remove(); toast("Lesson removed."); };
    $("[data-e]", li).onclick = async () => { const t = prompt("Edit the lesson", l.text); if (!t || t === l.text) return; await api(`/api/lessons/${l.id}`, { method: "PATCH", body: { text: t } }); renderMemory(); };
    ul.append(li);
  }
  $("form", sec).onsubmit = async (e) => { e.preventDefault(); const t = e.target.text.value.trim(); if (!t) return;
    try { await api("/api/lessons", { method: "POST", body: { text: t } }); toast("Lesson added."); renderMemory(); } catch (x) { toast(x.message); } };
  const rb = $("[data-reflect]", sec);
  rb.onclick = async () => { rb.disabled = true; rb.innerHTML = `<i class="spin"></i>Reflecting…`;
    const r = await api("/api/lessons/reflect", { method: "POST" }).catch((x) => ({ message: x.message }));
    toast(r.message || "Done."); renderMemory(); };
  $(".page", stage)?.append(sec);
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
      <label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" name="learning"> Learn from experience (review flagged conversations when the machine is idle)</label>
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
  f.approval.value = st.approval || "ask"; f.notify.checked = st.notify !== false; f.learning.checked = st.learning !== false;
  f.brief_enabled.checked = st.brief_enabled !== false; f.brief_time.value = st.brief_time || "07:30";
  f.brief_city.value = st.brief_city || ""; f.brief_topics.value = st.brief_topics || "";
  $("#brief-now", m).onclick = async () => { await api("/api/brief/now", { method: "POST" }); closeModal(); await loadSessions(); toast(`${AN()} is preparing your brief. You'll get a notification.`); };
  pushPanel(m);
  f.onsubmit = async (e) => {
    e.preventDefault();
    S.settings = await api("/api/settings", { method: "PUT", body: { name: f.name.value.trim(), assistant_name: f.assistant_name.value.trim() || "RiRi", instructions: f.instructions.value,
      effort: f.effort.value, approval: f.approval.value, notify: f.notify.checked, learning: f.learning.checked,
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
  const actions = [["New chat", "#/"], ["Live artifacts", "#/live"], ["Files", "#/fs"], ["Tasks", "#/tasks"], ["Notes", "#/notes"], ["Memory", "#/memory"]];
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

// ------------------------------------------------------------------ live sync across tabs and devices
/* One Server-Sent Events channel per tab. The server sends small numbered invalidations ("sessions changed",
   "a reply started in X"); we refetch only what this screen shows, debounced, never clobbering what you're typing.
   Reconnects resume from the last event id; if we fell too far behind the server says "resync" and we reload all. */
const SYNC = { es: null, cursor: null, timers: {}, hiddenAt: 0 };
function later(key, fn, ms = 250) { clearTimeout(SYNC.timers[key]); SYNC.timers[key] = setTimeout(fn, ms); }
function typing() { const a = document.activeElement; return !!(a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.value && a.closest("#stage")); }
function startSync() {
  if (SYNC.es) SYNC.es.close();
  const es = SYNC.es = new EventSource("/api/events" + (SYNC.cursor ? "?after=" + encodeURIComponent(SYNC.cursor) : ""));
  es.onmessage = (e) => { if (e.lastEventId) SYNC.cursor = e.lastEventId; try { onSync(JSON.parse(e.data)); } catch { /* ignore */ } };
  es.addEventListener("hello", (e) => { try { if (!SYNC.cursor) SYNC.cursor = JSON.parse(e.data).id; } catch { /* ignore */ } });
  es.addEventListener("resync", (e) => { if (e.lastEventId) SYNC.cursor = e.lastEventId; resyncAll(); });
  es.onerror = () => { if (es.readyState === EventSource.CLOSED && SYNC.es === es) setTimeout(startSync, 3000); };
}
async function refreshOpen() {
  if (!S.sid || S.live) return;   // a live reply streams on its own channel
  const sid = S.sid;
  const data = await api(`/api/sessions/${sid}`).catch(() => null);
  if (!data || S.sid !== sid || S.live) return;
  const changed = data.messages.length !== S.messages.length || data.messages.at(-1)?.id !== S.messages.at(-1)?.id;
  S.session = data.session;
  const title = $(".band-title");
  if (title && document.activeElement !== title) title.value = data.session.title;
  if (data.run) { S.messages = data.messages; startLive(data.run); return; }   // a reply started on another device: watch it live
  if (changed) { S.messages = data.messages; renderMessages(true); }
}
function onSync(ev) {
  switch (ev.type) {
    case "sessions":
      later("sessions", loadSessions);
      if (ev.deleted && ev.deleted === S.sid) { toast("This conversation was deleted on another device."); location.hash = "#/chats"; }
      break;
    case "session":
      later("sessions", loadSessions);
      if (ev.sid === S.sid) later("open", refreshOpen, 300);
      break;
    case "run":
      later("sessions", loadSessions); later("status", () => pollStatus(true), 400);
      if (ev.session_id === S.sid && (!S.live || S.live.id !== ev.run_id)) later("open", refreshOpen, 300);
      break;
    case "tasks": later("tasks", () => { renderToday(); if (S.view === "tasks" && !typing()) renderTasks(); }); break;
    case "notes": if (S.view === "notes") later("notes", () => !typing() && renderNotes()); break;
    case "memories": case "lessons": if (S.view === "memory") later("memory", () => !typing() && renderMemory(), 400); break;
    case "artifacts": later("artifacts", () => (S.view === "live" ? drawArtifacts() : pollStatus(true))); break;
    case "settings": later("settings", async () => { S.settings = await api("/api/settings").catch(() => S.settings); }); break;
  }
}
function resyncAll() {
  later("sessions", loadSessions, 50); later("status", () => pollStatus(true), 50);
  if (S.sid) later("open", refreshOpen, 100);
  else if (!typing()) later("view", route, 150);
}
// phones suspend background tabs and drop connections silently: on return, reconnect and catch up from the cursor
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { SYNC.hiddenAt = Date.now(); return; }
  if (!SYNC.es || SYNC.es.readyState === EventSource.CLOSED || Date.now() - SYNC.hiddenAt > 20000) startSync();
  if (Date.now() - SYNC.hiddenAt > 20000) resyncAll();
});
window.addEventListener("online", () => { startSync(); resyncAll(); });

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
const moreBtn = $("#open-more");
if (moreBtn) moreBtn.onclick = () => {
  const m = openModal(`<div class="modal-in"><div class="modal-h"><h2>More</h2><button class="icon-btn" data-close aria-label="Close">${I.x}</button></div>
    <div class="more-grid">
      <a href="#/tasks" data-close>${I.task}<span>Tasks</span></a><a href="#/notes" data-close>${I.note}<span>Notes</span></a>
      <a href="#/memory" data-close>${I.mem}<span>Memory</span></a><a href="#/server" data-close>${I.gauge}<span>Server</span></a>
      <button type="button" data-m="settings">${I.gear}<span>Settings</span></button>
    </div></div>`);
  $$("a[data-close]", m).forEach((x) => x.addEventListener("click", closeModal));
  $('[data-m="settings"]', m).onclick = () => { closeModal(); openSettings(); };
};
// Phones: keep the app above the on-screen keyboard, and hide the tab bar while typing.
if (window.visualViewport) {
  const vv = window.visualViewport;
  const fit = () => {
    document.documentElement.style.setProperty("--app-h", vv.height + "px");
    document.documentElement.style.setProperty("--app-top", vv.offsetTop + "px");
    document.body.classList.toggle("kb", window.innerHeight - vv.height > 140 && matchMedia("(max-width: 860px)").matches);
  };
  vv.addEventListener("resize", fit); vv.addEventListener("scroll", fit); fit();
}
// Swipe in from the left edge for the conversation list; swipe it away to close.
(() => {
  let sx = null, sy = 0, from = null;
  document.addEventListener("touchstart", (e) => {
    const t = e.touches[0]; if (!t || e.touches.length > 1) return;
    const left = $("#left");
    if (left.classList.contains("open")) { from = "drawer"; sx = t.clientX; sy = t.clientY; }
    else if (t.clientX < 24 && innerWidth <= 860 && !document.querySelector(".viewer, dialog[open]")) { from = "edge"; sx = t.clientX; sy = t.clientY; }
    else sx = null;
  }, { passive: true });
  document.addEventListener("touchend", (e) => {
    if (sx == null) return; const t = e.changedTouches[0]; const dx = t.clientX - sx, dy = Math.abs(t.clientY - sy);
    if (from === "edge" && dx > 60 && dy < 60) { if (location.hash.startsWith("#/c/")) location.hash = "#/chats"; }
    if (from === "drawer" && dx < -60 && dy < 60) closeDrawers();
    sx = null;
  }, { passive: true });
})();
$("#open-left").onclick = () => { $("#left").classList.add("open"); $("#scrim").hidden = false; document.body.classList.add("drawer-open"); };
$("#open-log").onclick = () => { $("#log").classList.add("open"); $("#scrim").hidden = false; document.body.classList.add("drawer-open"); };
$("#scrim").onclick = closeDrawers;
function closeDrawers() { $("#left").classList.remove("open"); $("#log").classList.remove("open"); $("#scrim").hidden = true; document.body.classList.remove("drawer-open"); }
document.addEventListener("visibilitychange", () => { if (!document.hidden) pollStatus(); });

marked.use({ renderer: { html: (t) => esc(typeof t === "object" ? t.text : t) } }); // show raw HTML from the model as text
boot();
