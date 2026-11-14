/* RiRi media: the full-screen picture viewer, the video/audio player, and the code viewer/editor.
   Plain functions; app.js calls them (its helpers h, $, esc, toast are shared globals). */
"use strict";

// ------------------------------------------------------------------ file kinds
const EXT_LANG = { js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
  py: "python", rb: "ruby", go: "go", rs: "rust", java: "java", kt: "kotlin", c: "c", h: "c", cc: "cpp", cpp: "cpp", hpp: "cpp",
  cs: "csharp", php: "php", swift: "swift", sh: "bash", bash: "bash", zsh: "bash", fish: "bash", ps1: "powershell",
  json: "json", jsonc: "json", yml: "yaml", yaml: "yaml", toml: "ini", ini: "ini", conf: "ini", cfg: "ini", env: "bash",
  xml: "xml", html: "xml", htm: "xml", svg: "xml", vue: "xml", css: "css", scss: "scss", less: "less", sql: "sql",
  md: "markdown", markdown: "markdown", dockerfile: "dockerfile", makefile: "makefile", lua: "lua", r: "r", pl: "perl",
  diff: "diff", patch: "diff", nginx: "nginx", caddyfile: "nginx", txt: "plaintext", log: "plaintext", csv: "plaintext" };
const KIND_EXT = {
  image: ["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "ico", "svg", "heic", "jfif"],
  video: ["mp4", "m4v", "webm", "mov", "mkv", "ogv", "avi"],
  audio: ["mp3", "m4a", "aac", "flac", "wav", "ogg", "oga", "opus", "weba"],
  pdf: ["pdf"],
  archive: ["zip", "tar", "gz", "tgz", "xz", "bz2", "7z", "rar", "zst", "deb", "iso"],
};
function extOf(name) {
  const n = String(name || "").toLowerCase();
  if (n === "dockerfile" || n.endsWith(".dockerfile")) return "dockerfile";
  if (n === "makefile") return "makefile";
  if (n === "caddyfile") return "caddyfile";
  const i = n.lastIndexOf(".");
  return i > 0 ? n.slice(i + 1) : "";
}
function fileKind(name) {
  const e = extOf(name);
  for (const [k, list] of Object.entries(KIND_EXT)) if (list.includes(e)) return k;
  return EXT_LANG[e] && EXT_LANG[e] !== "plaintext" ? "code" : "text";
}
function langOf(name) { return EXT_LANG[extOf(name)] || ""; }
const LANG_LABEL = { javascript: "JavaScript", typescript: "TypeScript", python: "Python", bash: "Shell", json: "JSON", yaml: "YAML",
  xml: "HTML / XML", css: "CSS", scss: "SCSS", sql: "SQL", markdown: "Markdown", dockerfile: "Dockerfile", go: "Go", rust: "Rust",
  ini: "Config", cpp: "C++", c: "C", csharp: "C#", java: "Java", kotlin: "Kotlin", ruby: "Ruby", php: "PHP", nginx: "Config",
  plaintext: "Text", diff: "Diff", powershell: "PowerShell", lua: "Lua", swift: "Swift", makefile: "Makefile" };
const langLabel = (l) => LANG_LABEL[l] || (l ? l[0].toUpperCase() + l.slice(1) : "Text");
const rawUrl = (path, dl) => `/api/fs/raw?path=${encodeURIComponent(path)}${dl ? "&dl=1" : ""}`;
const webImg = (u) => (/^https?:\/\//i.test(u || "") ? "/api/img?u=" + encodeURIComponent(u) : u);
const favicon = (host) => webImg(`https://icons.duckduckgo.com/ip3/${host}.ico`);

const MI = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><rect x="7" y="5.5" width="3.6" height="13" rx="1" fill="currentColor" stroke="none"/><rect x="13.4" y="5.5" width="3.6" height="13" rx="1" fill="currentColor" stroke="none"/></svg>',
  vol: '<svg viewBox="0 0 24 24"><path d="M4.5 9.5h3l4.5-4v13l-4.5-4h-3z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M4.5 9.5h3l4.5-4v13l-4.5-4h-3z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/></svg>',
  full: '<svg viewBox="0 0 24 24"><path d="M4.5 9V4.5H9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15"/></svg>',
  pip: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="14" rx="2"/><rect x="12" y="11.5" width="6.5" height="5" rx="1" fill="currentColor" stroke="none"/></svg>',
  back10: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5"/><text x="12" y="15.5" text-anchor="middle" font-size="7" fill="currentColor" stroke="none" font-family="sans-serif">10</text></svg>',
  fwd10: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v4.5h-4.5"/><text x="12" y="15.5" text-anchor="middle" font-size="7" fill="currentColor" stroke="none" font-family="sans-serif">10</text></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="m14.5 6-6 6 6 6"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="m9.5 6 6 6-6 6"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 6v12M6 12h12"/></svg>',
  minus: '<svg viewBox="0 0 24 24"><path d="M6 12h12"/></svg>',
  dl: '<svg viewBox="0 0 24 24"><path d="M12 4.5v11M7.5 11l4.5 4.5 4.5-4.5M5 19.5h14"/></svg>',
  ext: '<svg viewBox="0 0 24 24"><path d="M13.5 5.5h5v5M18.5 5.5 11 13M10 6.5H6.5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V14"/></svg>',
  wrap: '<svg viewBox="0 0 24 24"><path d="M4.5 7h15M4.5 12h12a3 3 0 0 1 0 6H12M14 15.5 11.5 18l2.5 2.5M4.5 17H8"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6"/></svg>',
};
const fmtTime = (s) => { if (!isFinite(s)) return "0:00"; s = Math.max(0, Math.floor(s)); const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  return (hh ? hh + ":" + String(mm).padStart(2, "0") : mm) + ":" + String(ss).padStart(2, "0"); };

// ------------------------------------------------------------------ picture viewer (full screen, zoom, pan, swipe)
function openViewer(items, index = 0) {
  if (!items.length) return;
  document.querySelector(".viewer")?.remove();
  const v = h(`<div class="viewer" role="dialog" aria-modal="true" aria-label="Picture viewer">
    <div class="viewer-top"><div class="viewer-cap"><b></b><span></span></div>
      <span class="viewer-count"></span>
      <button class="v-btn" data-v="out" aria-label="Zoom out">${MI.minus}</button><button class="v-btn" data-v="in" aria-label="Zoom in">${MI.plus}</button>
      <a class="v-btn" data-v="open" target="_blank" rel="noopener noreferrer" aria-label="Open the original">${MI.ext}</a>
      <a class="v-btn" data-v="dl" aria-label="Download">${MI.dl}</a>
      <button class="v-btn" data-v="close" aria-label="Close">${I.x}</button></div>
    <div class="viewer-stage"><img alt="" draggable="false"><div class="viewer-spin"></div></div>
    <button class="v-nav v-prev" aria-label="Previous">${MI.prev}</button><button class="v-nav v-next" aria-label="Next">${MI.next}</button>
    <div class="viewer-strip"></div></div>`);
  document.body.append(v);
  const img = $("img", v), stage = $(".viewer-stage", v), strip = $(".viewer-strip", v);
  let i = index, z = 1, x = 0, y = 0;
  const apply = (anim) => { img.style.transition = anim ? "transform .22s cubic-bezier(.2,.8,.2,1)" : "none"; img.style.transform = `translate(${x}px, ${y}px) scale(${z})`; stage.classList.toggle("zoomed", z > 1.01); };
  const reset = () => { z = 1; x = 0; y = 0; apply(true); };
  if (items.length > 1) strip.innerHTML = items.map((it, k) => `<button data-k="${k}" aria-label="Picture ${k + 1}"><img loading="lazy" alt="" src="${esc(it.thumb || it.src)}"></button>`).join("");
  else { strip.remove(); $$(".v-nav", v).forEach((b) => b.remove()); }
  const show = (k) => {
    i = (k + items.length) % items.length; const it = items[i];
    v.classList.add("loading"); img.onload = () => v.classList.remove("loading"); img.onerror = () => { v.classList.remove("loading"); v.classList.add("broken"); };
    v.classList.remove("broken"); img.src = it.src; reset();
    $(".viewer-cap b", v).textContent = it.title || ""; $(".viewer-cap span", v).textContent = it.sub || "";
    $(".viewer-count", v).textContent = items.length > 1 ? `${i + 1} / ${items.length}` : "";
    const open = $('[data-v="open"]', v), dl = $('[data-v="dl"]', v);
    open.hidden = !it.href; if (it.href) open.href = it.href;
    dl.hidden = !it.download; if (it.download) dl.href = it.download;
    $$("button", strip).forEach((b) => b.toggleAttribute("aria-current", +b.dataset.k === i));
    strip.querySelector(`[data-k="${i}"]`)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  };
  const zoomTo = (nz, cx, cy) => {
    nz = Math.min(8, Math.max(1, nz));
    const r = stage.getBoundingClientRect(); cx = (cx ?? r.left + r.width / 2) - r.left - r.width / 2; cy = (cy ?? r.top + r.height / 2) - r.top - r.height / 2;
    x = cx - ((cx - x) * nz) / z; y = cy - ((cy - y) * nz) / z; z = nz; if (z === 1) { x = 0; y = 0; } apply(true);
  };
  const close = () => { v.remove(); document.removeEventListener("keydown", key); };
  const key = (e) => {
    if (e.key === "Escape") close(); else if (e.key === "ArrowRight") show(i + 1); else if (e.key === "ArrowLeft") show(i - 1);
    else if (e.key === "+" || e.key === "=") zoomTo(z * 1.5); else if (e.key === "-") zoomTo(z / 1.5);
  };
  document.addEventListener("keydown", key);
  v.addEventListener("click", (e) => {
    const b = e.target.closest("[data-v], .v-nav, .viewer-strip button");
    if (!b) { if (e.target === stage && z === 1) close(); return; }
    if (b.dataset.v === "close") close(); else if (b.dataset.v === "in") zoomTo(z * 1.6); else if (b.dataset.v === "out") zoomTo(z / 1.6);
    else if (b.classList.contains("v-prev")) show(i - 1); else if (b.classList.contains("v-next")) show(i + 1);
    else if (b.dataset.k) show(+b.dataset.k);
  });
  stage.addEventListener("wheel", (e) => { e.preventDefault(); zoomTo(z * (e.deltaY < 0 ? 1.2 : 1 / 1.2), e.clientX, e.clientY); }, { passive: false });
  stage.addEventListener("dblclick", (e) => zoomTo(z > 1 ? 1 : 2.5, e.clientX, e.clientY));
  // pointers: one finger pans (or swipes when not zoomed), two pinch
  const pts = new Map(); let start = null, pinch = null, lastTap = 0;
  stage.addEventListener("pointerdown", (e) => {
    stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) start = { px: e.clientX, py: e.clientY, x, y, t: Date.now() };
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; }
  });
  stage.addEventListener("pointermove", (e) => {
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      const nz = Math.min(8, Math.max(1, (pinch.z * d) / pinch.d)); const r = stage.getBoundingClientRect(); const cx = pinch.cx - r.left - r.width / 2, cy = pinch.cy - r.top - r.height / 2;
      x = cx - ((cx - x) * nz) / z; y = cy - ((cy - y) * nz) / z; z = nz; apply(false); return; }
    if (start && pts.size === 1) {
      const dx = e.clientX - start.px, dy = e.clientY - start.py;
      if (z > 1.01) { x = start.x + dx; y = start.y + dy; apply(false); }
      else { img.style.transition = "none"; img.style.transform = `translate(${dx}px, ${Math.max(0, dy) * 0.6}px)`; img.style.opacity = String(1 - Math.min(0.5, Math.max(0, dy) / 400)); }
    }
  });
  const up = (e) => {
    if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (start && pts.size === 0) {
      const dx = e.clientX - start.px, dy = e.clientY - start.py, quick = Date.now() - start.t < 400;
      img.style.opacity = "";
      if (z <= 1.01) {
        if (dy > 110 && Math.abs(dy) > Math.abs(dx)) return close();
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) && items.length > 1) show(i + (dx < 0 ? 1 : -1)); else reset();
      }
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6 && quick && e.pointerType === "touch") {
        if (Date.now() - lastTap < 300) zoomTo(z > 1 ? 1 : 2.5, e.clientX, e.clientY);
        lastTap = Date.now();
      }
      start = null;
    }
  };
  stage.addEventListener("pointerup", up); stage.addEventListener("pointercancel", up);
  show(i);
  return v;
}

// ------------------------------------------------------------------ video & audio player
function mediaPlayer(src, { kind = "video", title = "", sub = "" } = {}) {
  const video = kind === "video";
  const el = h(`<div class="player ${video ? "is-video" : "is-audio"}" tabindex="0">
    ${video ? `<video playsinline preload="metadata"></video><div class="player-big">${MI.play}</div>`
      : `<div class="player-art"><div class="disc"><i></i></div><div class="player-meta"><b></b><span></span></div></div><audio preload="metadata"></audio>`}
    <div class="player-bar">
      <div class="player-seek"><div class="ps-buf"></div><div class="ps-fill"></div><div class="ps-knob"></div><div class="ps-tip"></div>
        <input type="range" min="0" max="1000" value="0" step="1" aria-label="Seek"></div>
      <div class="player-row">
        <button class="p-btn p-play" aria-label="Play">${MI.play}</button>
        <button class="p-btn hide-xs" data-p="back" aria-label="Back 10 seconds">${MI.back10}</button>
        <button class="p-btn hide-xs" data-p="fwd" aria-label="Forward 10 seconds">${MI.fwd10}</button>
        <span class="p-time"><b>0:00</b> / <span>0:00</span></span><span class="grow"></span>
        <button class="p-btn" data-p="mute" aria-label="Mute">${MI.vol}</button>
        <input class="p-vol hide-xs" type="range" min="0" max="1" step="0.05" value="1" aria-label="Volume">
        <button class="p-btn p-rate" data-p="rate" aria-label="Playback speed">1×</button>
        ${video ? `<button class="p-btn hide-xs" data-p="pip" aria-label="Picture in picture">${MI.pip}</button><button class="p-btn" data-p="full" aria-label="Full screen">${MI.full}</button>` : ""}
      </div></div></div>`);
  const m = $(video ? "video" : "audio", el);
  m.src = src;
  if (!video) { $(".player-meta b", el).textContent = title; $(".player-meta span", el).textContent = sub; }
  const seek = $(".player-seek input", el), fill = $(".ps-fill", el), buf = $(".ps-buf", el), knob = $(".ps-knob", el), tip = $(".ps-tip", el);
  const play = $(".p-play", el), mute = $('[data-p="mute"]', el), vol = $(".p-vol", el), rate = $('[data-p="rate"]', el);
  const sync = () => {
    const d = m.duration || 0, p = d ? m.currentTime / d : 0;
    fill.style.width = knob.style.left = p * 100 + "%";
    if (document.activeElement !== seek) seek.value = String(Math.round(p * 1000));
    $(".p-time b", el).textContent = fmtTime(m.currentTime); $(".p-time span", el).textContent = fmtTime(d);
    if (m.buffered.length && d) buf.style.width = (m.buffered.end(m.buffered.length - 1) / d) * 100 + "%";
  };
  const state = () => { const p = !m.paused; play.innerHTML = p ? MI.pause : MI.play; play.setAttribute("aria-label", p ? "Pause" : "Play"); el.classList.toggle("playing", p); };
  const toggle = () => (m.paused ? m.play().catch((e) => toast("Can't play this file here: " + (e.message || "unsupported format"))) : m.pause());
  ["timeupdate", "progress", "loadedmetadata", "durationchange"].forEach((ev) => m.addEventListener(ev, sync));
  ["play", "pause", "ended"].forEach((ev) => m.addEventListener(ev, state));
  m.addEventListener("waiting", () => el.classList.add("buffering")); m.addEventListener("playing", () => el.classList.remove("buffering"));
  m.addEventListener("error", () => { el.classList.add("failed"); toast("This browser can't play that format. Download it instead."); });
  play.onclick = toggle;
  if (video) { m.addEventListener("click", toggle); $(".player-big", el).onclick = toggle; m.addEventListener("dblclick", () => full()); }
  seek.addEventListener("input", () => { if (m.duration) m.currentTime = (seek.value / 1000) * m.duration; sync(); });
  $(".player-seek", el).addEventListener("pointermove", (e) => {
    const r = e.currentTarget.getBoundingClientRect(), p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    tip.textContent = fmtTime(p * (m.duration || 0)); tip.style.left = p * 100 + "%";
  });
  $('[data-p="back"]', el).onclick = () => (m.currentTime = Math.max(0, m.currentTime - 10));
  $('[data-p="fwd"]', el).onclick = () => (m.currentTime = Math.min(m.duration || 0, m.currentTime + 10));
  mute.onclick = () => { m.muted = !m.muted; mute.innerHTML = m.muted ? MI.mute : MI.vol; };
  vol.addEventListener("input", () => { m.volume = +vol.value; m.muted = m.volume === 0; mute.innerHTML = m.muted ? MI.mute : MI.vol; });
  const rates = [1, 1.25, 1.5, 2, 0.75];
  rate.onclick = () => { const r = rates[(rates.indexOf(m.playbackRate) + 1) % rates.length]; m.playbackRate = r; rate.textContent = r + "×"; };
  const full = () => {
    const fs = document.fullscreenElement;
    if (fs) return document.exitFullscreen();
    if (el.requestFullscreen) el.requestFullscreen().catch(() => m.webkitEnterFullscreen?.());
    else if (m.webkitEnterFullscreen) m.webkitEnterFullscreen();   // iPhone Safari
  };
  if (video) {
    $('[data-p="full"]', el).onclick = full;
    const pip = $('[data-p="pip"]', el);
    if (!document.pictureInPictureEnabled) pip.remove(); else pip.onclick = () => (document.pictureInPictureElement ? document.exitPictureInPicture() : m.requestPictureInPicture()).catch(() => {});
    let idle; const wake = () => { el.classList.add("awake"); clearTimeout(idle); idle = setTimeout(() => !m.paused && el.classList.remove("awake"), 2600); };
    el.addEventListener("pointermove", wake); el.addEventListener("touchstart", wake, { passive: true }); wake();
  }
  el.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" && e.target.type !== "range") return;
    if (e.key === " " || e.key === "k") { e.preventDefault(); toggle(); }
    else if (e.key === "ArrowRight") m.currentTime = Math.min(m.duration || 0, m.currentTime + 5);
    else if (e.key === "ArrowLeft") m.currentTime = Math.max(0, m.currentTime - 5);
    else if (e.key === "m") mute.click(); else if (e.key === "f" && video) full();
  });
  el.media = m;
  return el;
}

// ------------------------------------------------------------------ code: highlighted view with line numbers, and an editor
function highlight(text, lang) {
  if (text.length > 400_000 || !window.hljs) return esc(text);
  try {
    if (lang && hljs.getLanguage(lang)) return hljs.highlight(text, { language: lang, ignoreIllegals: true }).value;
    if (text.length < 60_000) return hljs.highlightAuto(text).value;
  } catch { /* fall through */ }
  return esc(text);
}
function gutterText(n) { let s = ""; for (let k = 1; k <= n; k++) s += k + "\n"; return s; }
/* codeView({ text, name, onSave(newText) }) -> element. View mode first; Edit switches to an overlay editor. */
function codeView({ text, name, onSave, readOnly }) {
  const lang = langOf(name);
  const isMd = lang === "markdown";
  const lines = text.split("\n").length;
  const el = h(`<div class="code-doc">
    <div class="code-bar"><span class="code-lang">${esc(langLabel(lang))}</span><span class="code-meta">${lines.toLocaleString()} line${lines === 1 ? "" : "s"}</span>
      <span class="grow"></span>
      ${isMd ? `<button class="mini-btn" data-c="preview" type="button">${MI.eye}<span>Preview</span></button>` : ""}
      <button class="mini-btn" data-c="wrap" type="button" aria-pressed="false">${MI.wrap}<span>Wrap</span></button>
      <button class="mini-btn" data-c="copy" type="button">${I.copy}<span>Copy</span></button>
      ${readOnly ? "" : `<button class="mini-btn" data-c="edit" type="button">${I.pen}<span>Edit</span></button>
      <button class="btn btn-accent btn-small" data-c="save" type="button" hidden disabled>Save</button>`}</div>
    <div class="code-body"><pre class="code-gutter" aria-hidden="true"></pre><div class="code-scroll"><pre class="code-pre"><code class="hljs"></code></pre></div></div></div>`);
  const body = $(".code-body", el), gutter = $(".code-gutter", el), code = $("code", el), scroll = $(".code-scroll", el);
  let current = text, editing = false, ta = null;
  const renderView = () => { gutter.textContent = gutterText(current.split("\n").length); code.innerHTML = highlight(current, lang); };
  renderView();
  scroll.addEventListener("scroll", () => (gutter.scrollTop = scroll.scrollTop));
  $('[data-c="wrap"]', el).onclick = (e) => { const on = el.classList.toggle("wrapped"); e.currentTarget.setAttribute("aria-pressed", on); };
  $('[data-c="copy"]', el).onclick = () => { navigator.clipboard.writeText(editing ? ta.value : current); toast("Copied."); };
  const pv = $('[data-c="preview"]', el);
  if (pv) pv.onclick = () => {
    const on = el.classList.toggle("previewing");
    $(".code-md", el)?.remove();
    if (on) { const m = md(editing ? ta.value : current); m.classList.add("code-md"); el.append(m); }
  };
  if (isMd && current.trim()) setTimeout(() => pv.click());
  const save = $('[data-c="save"]', el), edit = $('[data-c="edit"]', el);
  if (edit) edit.onclick = () => {
    if (editing) return;
    editing = true; el.classList.add("editing"); el.classList.remove("previewing"); $(".code-md", el)?.remove();
    edit.hidden = true; save.hidden = false;
    ta = h(`<textarea class="code-ta" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off"></textarea>`);
    ta.value = current; $(".code-pre", el).append(ta);
    const big = current.length > 150_000;
    let raf = 0;
    const paint = () => { raf = 0; const v = ta.value; code.innerHTML = (big ? esc(v) : highlight(v, lang)) + "\n"; gutter.textContent = gutterText(v.split("\n").length); };
    ta.addEventListener("input", () => { save.disabled = false; if (!raf) raf = requestAnimationFrame(paint); });
    ta.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save.click(); }
      else if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); document.execCommand("insertText", false, lang === "python" ? "    " : "  "); }
    });
    ta.focus({ preventScroll: true });
  };
  if (save) save.onclick = async () => {
    save.disabled = true;
    try { await onSave(ta.value); current = ta.value; toast(`Saved ${name}.`); }
    catch (e) { save.disabled = false; toast(e.message); }
  };
  el.dirty = () => editing && save && !save.disabled;
  el.gotoLine = (n) => {          // scroll to a line and mark it (used by text search)
    if (el.classList.contains("previewing")) $('[data-c="preview"]', el)?.click();
    const pre = $(".code-pre", el), lh = parseFloat(getComputedStyle(pre).lineHeight) || 21, pad = parseFloat(getComputedStyle(pre).paddingTop) || 14;
    $(".code-hl", el)?.remove();
    const mark = h(`<i class="code-hl" style="top:${pad + (n - 1) * lh}px;height:${lh}px"></i>`);
    pre.prepend(mark);
    scroll.scrollTop = Math.max(0, pad + (n - 1) * lh - scroll.clientHeight / 3);
  };
  return el;
}

// ------------------------------------------------------------------ diagrams in replies: ```mermaid and ```svg blocks
const DIAGRAMS = new Map();   // code -> rendered svg text (or "" when it failed to parse)
let mermaidReady = null, diagramSeq = 0;
function loadMermaid() {
  if (!mermaidReady) mermaidReady = new Promise((ok, fail) => {
    const s = document.createElement("script"); s.src = "/vendor/mermaid.min.js";
    s.onload = () => {
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "base", fontFamily: "Geist, system-ui, sans-serif", htmlLabels: false,
        flowchart: { htmlLabels: false, curve: "basis", padding: 14 }, sequence: { useMaxWidth: true },
        themeVariables: { darkMode: true, background: "transparent", fontSize: "14px", fontFamily: "Geist, system-ui, sans-serif",
          primaryColor: "#1C1E23", primaryTextColor: "#ECEAE6", primaryBorderColor: "#41444D", secondaryColor: "#2A1A12",
          secondaryTextColor: "#F2E6D6", secondaryBorderColor: "#FF6B2C", tertiaryColor: "#15171B", tertiaryTextColor: "#C3C4C9",
          tertiaryBorderColor: "#33363E", lineColor: "#8E9198", textColor: "#C3C4C9", mainBkg: "#1C1E23", nodeBorder: "#41444D",
          clusterBkg: "rgba(255,255,255,0.025)", clusterBorder: "#33363E", edgeLabelBackground: "#15171B", titleColor: "#F2E6D6",
          actorBkg: "#1C1E23", actorBorder: "#41444D", actorTextColor: "#ECEAE6", actorLineColor: "#55585F", signalColor: "#C3C4C9",
          signalTextColor: "#ECEAE6", labelBoxBkgColor: "#1C1E23", labelTextColor: "#ECEAE6", noteBkgColor: "#2A1A12",
          noteTextColor: "#F2E6D6", noteBorderColor: "#FF6B2C", activationBkgColor: "#2A1A12", activationBorderColor: "#FF6B2C",
          pie1: "#FF6B2C", pie2: "#9DB4FF", pie3: "#7BD6A3", pie4: "#F2C35C", pie5: "#C7A6FF", pie6: "#8FC9D6",
          pieStrokeColor: "#0F1013", pieTitleTextColor: "#F2E6D6", pieSectionTextColor: "#0F1013",
          cScale0: "#FF6B2C", cScale1: "#9DB4FF", cScale2: "#7BD6A3", cScale3: "#F2C35C", cScale4: "#C7A6FF" } });
      ok();
    };
    s.onerror = () => fail(new Error("couldn't load the diagram library"));
    document.head.append(s);
  });
  return mermaidReady;
}
  // models often write labels like a[Mirror (18 parts)]: mermaid needs quotes around punctuation, so add them
const mmFix = (code) => String(code).replace(/(\w)(\(\[|\[\(|\(\(|\[|\{)([^"\]\)\}\n]*[()<>:;,&#][^"\]\)\}\n]*)(\]\)|\)\]|\)\)|\]|\})/g,
  (m, id, open, label, close) => (open.length === 2 && /[()]$/.test(label) ? m : `${id}${open}"${label.replace(/"/g, "'")}"${close}`));
function svgSafe(code) {
  // drawn as a picture (<img>), so any script inside can't run; sanitised anyway
  return DOMPurify.sanitize(code, { USE_PROFILES: { svg: true, svgFilters: true } });
}
/* Replaces a code block's <pre> with a rendered diagram; the code stays one click away. */
function diagramBlock(code, kind) {
  code = code.replace(/\n$/, "");
  const box = h(`<figure class="dia dia-${kind}"><div class="dia-view"><div class="dia-wait"><i class="spin"></i>Drawing…</div></div>
    <figcaption><span>${kind === "svg" ? "Drawing" : "Diagram"}</span><span class="grow"></span>
      <button type="button" class="mini-btn" data-a="code">Code</button><button type="button" class="mini-btn" data-a="open">${MI.ext}<span>Open</span></button></figcaption>
    <pre class="dia-code" hidden><code></code></pre></figure>`);
  $("code", box).textContent = code;
  const view = $(".dia-view", box);
  const fail = () => { box.classList.add("dia-failed"); view.innerHTML = ""; $(".dia-code", box).hidden = false; $('[data-a="code"]', box).hidden = true; $('[data-a="open"]', box).hidden = true; };
  const show = (svg) => {
    if (!svg) return fail();
    if (kind === "svg") { const img = new Image(); img.alt = "Drawing"; img.src = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })); view.replaceChildren(img); }
    else view.innerHTML = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true }, ADD_TAGS: ["style"] });
  };
  $('[data-a="code"]', box).onclick = (e) => { const p = $(".dia-code", box); p.hidden = !p.hidden; e.currentTarget.textContent = p.hidden ? "Code" : "Hide code"; };
  $('[data-a="open"]', box).onclick = () => {
    const svg = DIAGRAMS.get(code); if (!svg) return;
    let s = svg;
    if (kind !== "svg") s = s.replace(/<svg /, '<svg style="background:#0F1013" ');
    openViewer([{ src: URL.createObjectURL(new Blob([s], { type: "image/svg+xml" })), title: kind === "svg" ? "Drawing" : "Diagram" }]);
  };
  if (DIAGRAMS.has(code)) { show(DIAGRAMS.get(code)); return box; }
  if (kind === "svg") {
    const t = code.trim();
    const svg = /^<svg[\s>]/i.test(t) && /<\/svg>$/i.test(t) ? svgSafe(t) : "";
    if (svg) DIAGRAMS.set(code, svg);
    show(svg);
    return box;
  }
  loadMermaid().then(async () => {
    if (DIAGRAMS.has(code)) return show(DIAGRAMS.get(code));
    try {
      await mermaid.parse(mmFix(code));
      const { svg } = await mermaid.render("mmd" + ++diagramSeq, mmFix(code));
      DIAGRAMS.set(code, svg); show(svg);
    } catch { fail(); }   // half-written while streaming, or not valid: show the code
  }).catch(fail);
  return box;
}
