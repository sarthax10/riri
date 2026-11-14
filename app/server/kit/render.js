/* RiRi kit renderer: builds a designed page (or a slide deck) from content.json, so the content is all you write.
   index.html:  <div id="app"></div><script src="kit.js"></script><script src="render.js"></script>
   Schema: see the "content" skill, or the example content.json that artifact-new writes. */
(function () {
  "use strict";
  const FONTS = {
    paper: "family=Fraunces:opsz,wght@9..144,400..700&family=Inter+Tight:wght@400..700",
    ink: "family=Instrument+Serif:ital@0;1&family=Inter+Tight:wght@400..700",
    night: "family=Funnel+Display:wght@300..700&family=Geist:wght@400..700",
    studio: "family=Space+Grotesk:wght@400..700&family=Inter:wght@400..700",
    grove: "family=DM+Serif+Display:ital@0;1&family=DM+Sans:opsz,wght@9..40,400..700",
  };
  const CDN = { chart: "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js",
    mermaid: "https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js" };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const el = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const load = (src) => new Promise((ok, fail) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = fail; document.head.append(s); });
  const loaded = {};
  const need = (k) => (loaded[k] ||= load(CDN[k]));

  // a little Markdown: paragraphs, - lists, **bold**, *em*, `code`, [text](url)
  function inline(s) {
    return esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }
  function prose(s) {
    if (!s) return "";
    if (Array.isArray(s)) s = s.join("\n\n");
    return String(s).split(/\n\s*\n/).map((p) => {
      const lines = p.trim().split("\n");
      if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) return "<ul>" + lines.map((l) => "<li>" + inline(l.replace(/^\s*[-*•]\s+/, "")) + "</li>").join("") + "</ul>";
      return "<p>" + inline(p.trim()) + "</p>";
    }).join("");
  }
  const head = (b, n) => `${b.eyebrow ? `<p class="eyebrow">${esc(b.eyebrow)}</p>` : n ? `<p class="eyebrow">${String(n).padStart(2, "0")}</p>` : ""}${b.title ? `<h2>${esc(b.title)}</h2>` : ""}`;
  const fmt = (v, d) => (typeof v === "number" ? v.toLocaleString(undefined, { maximumFractionDigits: d ?? 2 }) : esc(v));

  // ---------------------------------------------------------------- blocks
  const B = {};
  B.text = (b, n) => {
    const body = `${head(b, n)}${prose(b.body)}`;
    if (!b.aside) return el(`<section class="page section reveal"><div class="narrow" style="margin:0">${body}</div></section>`);
    const sec = el(`<section class="page section reveal"><div class="split"><div>${body}</div><div class="rk-aside"></div></div></section>`);
    const inner = render(b.aside, 0, true); if (inner) sec.querySelector(".rk-aside").append(inner);
    return sec;
  };
  B.stats = (b, n, bare) => {
    const box = el(`<div>${bare ? "" : head(b, n)}<div class="stats">${(b.items || []).map((s) => {
      const num = typeof s.value === "number";
      return `<div class="stat"><div class="stat-value"${num ? ` data-count="${s.value}" data-decimals="${s.decimals ?? (Number.isInteger(s.value) ? 0 : 1)}"` : ""}>${fmt(s.value, s.decimals)}</div>
        ${s.unit ? `<div class="rk-unit">${esc(s.unit)}</div>` : ""}<div class="stat-label">${esc(s.label)}</div></div>`; }).join("")}</div>${b.note ? `<p class="meta" style="margin-top:12px">${inline(b.note)}</p>` : ""}</div>`);
    return bare ? box : wrap(box);
  };
  B.callout = (b, n, bare) => { const c = el(`<div class="callout">${b.title ? `<h4>${esc(b.title)}</h4>` : ""}${prose(b.body)}</div>`); return bare ? c : wrap(c); };
  B.quote = (b, n, bare) => { const q = el(`<figure class="rk-quote"><blockquote>${inline(b.text)}</blockquote>${b.by ? `<figcaption>${inline(b.by)}</figcaption>` : ""}</figure>`); return bare ? q : wrap(q); };
  B.image = (b, n, bare) => { const f = el(`<figure class="figure"><img src="${esc(b.src)}" alt="${esc(b.alt || b.caption || "")}" loading="lazy" style="border-radius:var(--r-3);width:100%;${b.ratio ? `aspect-ratio:${esc(b.ratio)};object-fit:cover;` : ""}">${b.caption ? `<figcaption>${inline(b.caption)}</figcaption>` : ""}</figure>`); return bare ? f : wrap(el(`<div>${head(b, n)}</div>`), f); };
  B.table = (b, n, bare) => {
    const t = el(`<div><div class="table-wrap"><table><thead><tr>${(b.columns || []).map((c, i) => `<th${i && b.numeric !== false ? ' class="num"' : ""}>${esc(c)}</th>`).join("")}</tr></thead>
      <tbody>${(b.rows || []).map((r) => `<tr>${r.map((c, i) => `<td${i && typeof c === "number" ? ' class="num"' : ""}>${typeof c === "number" ? fmt(c) : inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
      ${b.source ? `<p class="meta" style="margin-top:10px">Source: ${inline(b.source)}</p>` : ""}</div>`);
    return bare ? t : wrap(el(`<div>${head(b, n)}</div>`), t);
  };
  B.timeline = (b, n) => wrap(el(`<div>${head(b, n)}${b.intro ? prose(b.intro) : ""}<ol class="timeline" style="margin-top:28px">${(b.items || []).map((i) => `
      <li class="reveal"><time>${esc(i.date)}</time><h3 style="font-size:var(--t-lg)">${i.link ? `<a href="${esc(i.link)}" target="_blank" rel="noopener" style="color:inherit">${esc(i.title)}</a>` : esc(i.title)}</h3>${prose(i.body)}</li>`).join("")}</ol></div>`));
  B.steps = (b, n) => {
    if (!b.interactive) return wrap(el(`<div>${head(b, n)}${b.intro ? prose(b.intro) : ""}<div class="steps" style="margin-top:28px">${(b.items || []).map((s) => `
      <div class="step reveal"><div><h3 style="font-size:var(--t-lg)">${esc(s.title)}</h3>${prose(s.body)}</div></div>`).join("")}</div></div>`));
    const box = el(`<div>${head(b, n)}${b.intro ? prose(b.intro) : ""}<div class="stepper" style="margin-top:24px"><div class="stepper-stage">${(b.items || []).map((s, i) => `
      <div data-step class="rk-step"><p class="eyebrow">Step ${i + 1} of ${b.items.length}</p><h3>${esc(s.title)}</h3>${prose(s.body)}</div>`).join("")}</div></div></div>`);
    return wrap(box);
  };
  B.diagram = (b, n, bare) => {
    const f = el(`<figure class="figure rk-diagram"><div class="rk-dia card"></div>${b.caption ? `<figcaption>${inline(b.caption)}</figcaption>` : ""}</figure>`);
    const box = f.querySelector(".rk-dia");
    if (b.svg) box.innerHTML = b.svg;
    else if (b.mermaid) drawMermaid(box, b.mermaid);
    return bare ? f : wrap(el(`<div>${head(b, n)}${b.intro ? prose(b.intro) : ""}</div>`), f);
  };
  B.chart = (b, n, bare) => {
    const f = el(`<figure class="figure card rk-chart"><h3>${esc(b.title || "")}</h3>${b.subtitle ? `<p class="meta" style="margin:-4px 0 14px">${esc(b.subtitle)}</p>` : ""}
      <div class="chart" style="height:${+b.height || 320}px"><canvas></canvas></div>${b.source || b.note ? `<figcaption>${b.note ? inline(b.note) + " " : ""}${b.source ? "Source: " + inline(b.source) : ""}</figcaption>` : ""}</figure>`);
    const kind = b.kind || "bar";
    need("chart").then(() => {
      const series = b.series || (b.values ? [{ name: b.title || "", values: b.values }] : []);
      const highlight = b.highlight;
      KIT.chart(f.querySelector("canvas"), {
        type: kind === "hbar" ? "bar" : kind,
        data: { labels: b.labels || [], datasets: series.map((s, k) => ({ label: s.name, data: s.values,
          color: s.color || undefined,
          backgroundColor: kind.includes("bar") && highlight != null && series.length === 1
            ? (b.labels || []).map((l, i) => (l === highlight || i === highlight ? KIT.css("--accent") : KIT.css("--line-2"))) : undefined })) },
        options: Object.assign(kind === "hbar" ? { indexAxis: "y", scales: { x: { beginAtZero: true, grid: { color: KIT.css("--line") }, border: { display: false } }, y: { grid: { display: false } } } } : {},
          b.unit ? { plugins: { tooltip: { callbacks: { label: (c) => ` ${c.dataset.label ? c.dataset.label + ": " : ""}${c.formattedValue} ${b.unit}` } } } } : {}),
      });
    }).catch(() => (f.querySelector(".chart").textContent = "The chart library couldn't load."));
    return bare ? f : wrap(f);
  };
  // side-by-side comparison of 2-4 things across measures with different units: one small bar pair per measure
  B.comparison = (b, n) => {
    const cols = b.columns || [];
    const colours = KIT.colors();
    const rows = (b.rows || []).map((r) => {
      const nums = (r.values || []).map((v) => (typeof v === "number" ? v : NaN));
      const max = Math.max(...nums.filter((v) => !isNaN(v)), 0) || 1;
      return `<div class="rk-cmp-row reveal"><div class="rk-cmp-label"><b>${esc(r.label)}</b>${r.note ? `<small>${inline(r.note)}</small>` : ""}</div>
        <div class="rk-cmp-bars">${cols.map((c, i) => { const v = r.values?.[i];
          const w = typeof v === "number" ? Math.max(2, (v / max) * 100) : 0;
          return `<div class="rk-cmp-bar"><span class="rk-cmp-name">${esc(c)}</span><span class="rk-cmp-track">${typeof v === "number" ? `<i style="width:${w}%;background:${i === (b.highlight ?? cols.length - 1) ? "var(--accent)" : "var(--line-2)"}"></i>` : ""}</span>
            <span class="rk-cmp-val">${typeof v === "number" ? fmt(v) : esc(v ?? "–")}${r.unit && typeof v === "number" ? ` <small>${esc(r.unit)}</small>` : ""}</span></div>`; }).join("")}</div></div>`;
    }).join("");
    return wrap(el(`<div>${head(b, n)}${b.intro ? prose(b.intro) : ""}<div class="rk-cmp card" style="margin-top:24px">${rows}</div>
      ${b.source ? `<p class="meta" style="margin-top:12px">Source: ${inline(b.source)}</p>` : ""}</div>`));
  };
  // an interactive calculation: a slider (x) and a formula in plain JS using x
  B.slider = (b, n, bare) => {
    const i = b.input || {}, o = b.output || {};
    const box = el(`<div class="card rk-slider"><label class="field"><span class="rk-sl-top"><span>${esc(i.label || "Value")}</span><output class="rk-sl-in"></output></span>
      <input type="range" min="${+i.min || 0}" max="${+i.max || 100}" step="${+i.step || 1}" value="${+(i.value ?? i.min ?? 0)}"></label>
      <div class="rk-sl-out"><div class="stat-value"></div><div class="stat-label">${esc(o.label || "")}</div></div>
      ${b.note ? `<p class="meta" style="margin:14px 0 0">${inline(b.note)}</p>` : ""}${b.marks ? `<div class="rk-marks">${b.marks.map((m) => `<button class="tag" type="button" data-v="${+m.value}">${esc(m.label)}</button>`).join("")}</div>` : ""}</div>`);
    let f;
    try { f = new Function("x", "return (" + (o.formula || "x") + ");"); } catch { f = (x) => x; }
    const r = box.querySelector("input"), out = box.querySelector(".rk-sl-in"), res = box.querySelector(".stat-value");
    const upd = () => { const x = +r.value; out.textContent = `${fmt(x, i.decimals)} ${i.unit || ""}`;
      let y; try { y = f(x); } catch { y = NaN; } res.textContent = (typeof y === "number" && isFinite(y) ? fmt(y, o.decimals ?? 2) : String(y)) + (o.unit ? " " + o.unit : ""); };
    r.addEventListener("input", upd);
    box.querySelectorAll("[data-v]").forEach((m) => (m.onclick = () => { r.value = m.dataset.v; upd(); }));
    upd();
    return bare ? box : wrap(el(`<div>${head(b, n)}${b.intro ? prose(b.intro) : ""}</div>`), box);
  };
  B.cards = (b, n) => wrap(el(`<div>${head(b, n)}${b.intro ? prose(b.intro) : ""}<div class="grid" style="margin-top:24px">${(b.items || []).map((c) => `
      <article class="card reveal">${c.tag ? `<span class="tag accent">${esc(c.tag)}</span>` : ""}<h3 style="margin-top:${c.tag ? 14 : 0}px">${esc(c.title)}</h3>${prose(c.body)}${c.link ? `<p><a href="${esc(c.link)}" target="_blank" rel="noopener">Read more</a></p>` : ""}</article>`).join("")}</div></div>`));
  B.sources = (b) => wrap(el(`<div id="sources"><h2>${esc(b.title || "Sources")}</h2><ol class="sources">${(b.items || []).map((s) =>
      `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title || s.url)}</a>${s.publisher ? `, ${esc(s.publisher)}` : ""}${s.date ? `, ${esc(s.date)}` : ""}</li>`).join("")}</ol></div>`));
  const wrap = (...kids) => { const s = el(`<section class="page section reveal"></section>`); kids.forEach((k) => s.append(k)); return s; };
  function render(b, n, bare) {
    const f = B[b.type];
    if (!f) { console.warn("unknown block type", b.type); return null; }
    try { return f(b, n, bare); } catch (e) { console.error(b.type, e); return el(`<section class="page section"><p class="meta">Couldn't draw a ${esc(b.type)} block: ${esc(e.message)}</p></section>`); }
  }

  // ---------------------------------------------------------------- mermaid, themed from the page's own colours
  let mmN = 0;
  // models often write labels like a[Mirror (18 parts)]: mermaid needs quotes around punctuation, so add them
  const mmFix = (code) => String(code).replace(/(\w)(\(\[|\[\(|\(\(|\[|\{)([^"\]\)\}\n]*[()<>:;,&#][^"\]\)\}\n]*)(\]\)|\)\]|\)\)|\]|\})/g,
    (m, id, open, label, close) => (open.length === 2 && /[()]$/.test(label) ? m : `${id}${open}"${label.replace(/"/g, "'")}"${close}`));
  function drawMermaid(box, code) {
    box.innerHTML = `<p class="meta">Drawing…</p>`;
    need("mermaid").then(async () => {
      const c = (v) => KIT.css(v);
      const dark = (() => { const m = c("--bg").match(/#(..)(..)(..)/); return m ? (parseInt(m[1], 16) + parseInt(m[2], 16) + parseInt(m[3], 16)) / 3 < 110 : false; })();
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "base", htmlLabels: false, fontFamily: c("--text"),
        flowchart: { htmlLabels: false, curve: "basis", padding: 16 },
        themeVariables: { darkMode: dark, fontFamily: c("--text"), fontSize: "15px", background: "transparent",
          primaryColor: c("--surface"), primaryTextColor: c("--ink"), primaryBorderColor: c("--line-2"), lineColor: c("--ink-2"),
          secondaryColor: c("--accent-soft"), secondaryTextColor: c("--ink"), secondaryBorderColor: c("--accent"),
          tertiaryColor: c("--bg-2"), tertiaryTextColor: c("--ink"), tertiaryBorderColor: c("--line"), textColor: c("--ink-2"),
          mainBkg: c("--surface"), nodeBorder: c("--line-2"), clusterBkg: c("--bg-2"), clusterBorder: c("--line"),
          edgeLabelBackground: c("--surface"), titleColor: c("--ink"), actorBkg: c("--surface"), actorBorder: c("--line-2"),
          actorTextColor: c("--ink"), signalColor: c("--ink-2"), signalTextColor: c("--ink"), noteBkgColor: c("--accent-soft"),
          noteTextColor: c("--ink"), noteBorderColor: c("--accent"), cScale0: c("--accent"), pie1: KIT.colors()[0], pie2: KIT.colors()[1], pie3: KIT.colors()[2] } });
      try { const { svg } = await mermaid.render("rkmm" + ++mmN, mmFix(code)); box.innerHTML = svg; }
      catch (e) { box.innerHTML = `<pre>${esc(code)}</pre>`; }
    }).catch(() => (box.innerHTML = `<pre>${esc(code)}</pre>`));
  }

  // ---------------------------------------------------------------- page & deck
  function hero(m) {
    const s = el(`<section class="page hero"><p class="eyebrow">${esc(m.eyebrow || "")}</p><h1 class="display">${esc(m.headline || m.title || "")}</h1>
      ${m.lede ? `<p class="lede">${inline(m.lede)}</p>` : ""}${m.byline ? `<p class="meta" style="margin-top:20px">${inline(m.byline)}</p>` : ""}</section>`);
    if (m.hero_stats) s.append(B.stats({ items: m.hero_stats }, 0, true));
    if (m.hero_image) s.append(el(`<img src="${esc(m.hero_image)}" alt="" style="margin-top:40px;border-radius:var(--r-4);width:100%;aspect-ratio:21/9;object-fit:cover">`));
    return s;
  }
  function page(c) {
    const m = c.meta || {}, app = document.getElementById("app");
    const nav = (c.sections || []).filter((b) => b.nav && b.title).slice(0, 5);
    app.append(el(`<header class="page topbar"><a class="brand" href="#"><i></i>${esc(m.name || m.title || "")}</a>
      <nav class="nav">${nav.map((b, i) => `<a href="#s${(c.sections || []).indexOf(b)}">${esc(b.nav === true ? b.title : b.nav)}</a>`).join("")}${(c.sections || []).some((b) => b.type === "sources") ? `<a href="#sources">Sources</a>` : ""}</nav></header>`));
    const main = el(`<main></main>`); app.append(main);
    main.append(hero(m));
    let n = 0;
    (c.sections || []).forEach((b, i) => {
      const numbered = !["sources", "callout", "quote"].includes(b.type) && m.numbered !== false;
      const s = render(b, numbered && b.title ? ++n : 0);
      if (s) { s.id = s.id || "s" + i; main.append(s); }
    });
    app.append(el(`<footer class="page footer">${inline(m.footer || "Made by RiRi")}${m.updated ? ` · ${esc(m.updated)}` : ""}</footer>`));
  }
  function deck(c) {
    const app = document.getElementById("app"), m = c.meta || {};
    const slides = [{ type: "_title" }, ...(c.slides || c.sections || [])];
    const d = el(`<div class="rk-deck"></div>`); app.append(d);
    slides.forEach((b) => {
      const s = el(`<section class="rk-slide"></section>`);
      if (b.type === "_title") s.append(hero(m));
      else { const inner = render(b, 0); if (inner) { inner.classList.remove("section", "reveal"); s.append(inner); } }
      d.append(s);
    });
    app.append(el(`<div class="rk-deckbar"><i></i><span class="rk-n"></span><span>← → to move</span></div>`));
    const S = [...d.children]; let k = Math.max(0, (+location.hash.slice(1) || 1) - 1);
    const go = (i) => { k = Math.max(0, Math.min(S.length - 1, i)); S.forEach((s, j) => s.classList.toggle("on", j === k));
      app.querySelector(".rk-n").textContent = `${k + 1} / ${S.length}`; app.querySelector(".rk-deckbar i").style.width = ((k + 1) / S.length) * 100 + "%";
      history.replaceState(null, "", "#" + (k + 1)); S[k].querySelectorAll(".reveal").forEach((r) => r.classList.add("in")); };
    addEventListener("keydown", (e) => { if (["ArrowRight", " ", "PageDown"].includes(e.key)) go(k + 1); if (["ArrowLeft", "PageUp"].includes(e.key)) go(k - 1); });
    let x0 = null; addEventListener("touchstart", (e) => (x0 = e.touches[0].clientX), { passive: true });
    addEventListener("touchend", (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) go(k + (dx < 0 ? 1 : -1)); x0 = null; });
    go(k);
  }
  function setup(c) {
    const m = c.meta || {};
    const theme = FONTS[m.theme] ? m.theme : "paper";
    document.documentElement.dataset.theme = theme;
    if (m.accent) document.documentElement.style.setProperty("--accent", m.accent);
    if (m.accent_soft) document.documentElement.style.setProperty("--accent-soft", m.accent_soft);
    document.title = m.title || m.headline || document.title;
    const f = document.createElement("link"); f.rel = "stylesheet";
    f.href = `https://fonts.googleapis.com/css2?${FONTS[theme]}&family=JetBrains+Mono:wght@400;500&display=swap`; document.head.append(f);
    if (m.description) { const d = document.createElement("meta"); d.name = "description"; d.content = m.description; document.head.append(d); }
  }
  function fail(msg) {
    document.getElementById("app").innerHTML = `<main class="page hero"><p class="eyebrow">content.json</p><h1>Couldn't read the content</h1><pre>${esc(msg)}</pre></main>`;
  }
  const src = document.currentScript?.dataset.content || "content.json";
  fetch(src, { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(`${src}: HTTP ${r.status}`); return r.text(); })
    .then((t) => { let c; try { c = JSON.parse(t); } catch (e) { throw new Error(`${src} is not valid JSON: ${e.message}`); }
      setup(c); ((c.meta || {}).layout === "slides" ? deck : page)(c); KIT.wire(); })
    .catch((e) => fail(e.message));
})();
