/* RiRi kit helpers. <script src="kit.js"></script> at the end of <body>. Everything is optional.
   - .reveal elements fade in when scrolled into view
   - [data-count="1234"] numbers count up when visible (data-decimals, data-prefix, data-suffix)
   - .stepper with [data-step] children: prev/next/dots wired automatically (needs .stepper-stage, .stepper-bar)
   - .segmented with buttons [data-value]: fires a "change" event on the .segmented element (event.detail = value)
   - KIT.colors()  -> the theme's series colours, KIT.css("--accent") -> any variable
   - KIT.chart(canvas, config) -> a Chart.js chart styled to the theme (load Chart.js first)
*/
(function () {
  "use strict";
  const css = (name, el) => getComputedStyle(el || document.documentElement).getPropertyValue(name).trim();
  const colors = () => css("--series").split(",").map((s) => s.trim()).filter(Boolean);

  // reveal on scroll
  const io = "IntersectionObserver" in window ? new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add("in");
    if (e.target.dataset.count != null) countUp(e.target);
    io.unobserve(e.target);
  }), { threshold: 0.15 }) : null;
  function countUp(el) {
    const end = parseFloat(el.dataset.count), dec = +(el.dataset.decimals || 0), pre = el.dataset.prefix || "", suf = el.dataset.suffix || "";
    const t0 = performance.now(), dur = 1100;
    const step = (t) => { const p = Math.min(1, (t - t0) / dur), v = end * (1 - Math.pow(1 - p, 3));
      el.textContent = pre + v.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suf; if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function wire() {
    document.querySelectorAll(".reveal, [data-count]").forEach((el) => (io ? io.observe(el) : el.classList.add("in")));
    document.querySelectorAll(".stepper").forEach(stepper);
    document.querySelectorAll(".segmented").forEach((seg) => seg.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-selected", x === b));
      seg.dispatchEvent(new CustomEvent("change", { detail: b.dataset.value ?? b.textContent }));
    }));
  }
  function stepper(root) {
    const steps = [...root.querySelectorAll("[data-step]")]; if (!steps.length) return;
    let i = 0;
    const bar = root.querySelector(".stepper-bar") || root.appendChild(Object.assign(document.createElement("div"), { className: "stepper-bar" }));
    if (!bar.children.length) bar.innerHTML = `<button class="btn ghost" data-prev type="button">Back</button><div class="stepper-dots"></div><button class="btn" data-next type="button">Next</button>`;
    const dots = bar.querySelector(".stepper-dots"); dots.innerHTML = steps.map(() => "<i></i>").join("");
    const show = (k) => { i = Math.max(0, Math.min(steps.length - 1, k)); steps.forEach((s, j) => (s.hidden = j !== i));
      [...dots.children].forEach((d, j) => d.classList.toggle("on", j <= i));
      bar.querySelector("[data-prev]").disabled = i === 0; bar.querySelector("[data-next]").textContent = i === steps.length - 1 ? "Start over" : "Next";
      root.dispatchEvent(new CustomEvent("step", { detail: i })); };
    bar.querySelector("[data-prev]").onclick = () => show(i - 1);
    bar.querySelector("[data-next]").onclick = () => show(i === steps.length - 1 ? 0 : i + 1);
    root.tabIndex = 0; root.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") show(i + 1); if (e.key === "ArrowLeft") show(i - 1); });
    show(0);
  }
  function chart(canvas, config) {
    if (!window.Chart) { console.warn("Load Chart.js before KIT.chart"); return null; }
    const ink = css("--ink-2"), line = css("--line"), font = css("--text") || "sans-serif", series = colors();
    Chart.defaults.color = ink; Chart.defaults.borderColor = line; Chart.defaults.font.family = font; Chart.defaults.font.size = 12;
    (config.data.datasets || []).forEach((d, k) => {
      const c = d.color || series[k % series.length];
      if (!d.borderColor) d.borderColor = c;
      if (!d.backgroundColor) d.backgroundColor = config.type === "line" ? c + "22" : (["pie", "doughnut", "polarArea"].includes(config.type) ? series : c);
      if (config.type === "line") { d.tension ??= 0.3; d.pointRadius ??= 0; d.pointHoverRadius ??= 4; d.borderWidth ??= 2; }
      if (config.type === "bar") { d.borderRadius ??= 4; d.borderWidth ??= 0; d.maxBarThickness ??= 42; }
    });
    config.options = Object.assign({ responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: (config.data.datasets || []).length > 1, labels: { boxWidth: 10, boxHeight: 10 } },
        tooltip: { backgroundColor: css("--ink"), titleColor: css("--bg"), bodyColor: css("--bg"), padding: 10, cornerRadius: 8 } },
      scales: ["pie", "doughnut", "polarArea", "radar"].includes(config.type) ? undefined
        : { x: { grid: { display: false } }, y: { grid: { color: line }, border: { display: false }, beginAtZero: true } } }, config.options || {});
    return new Chart(canvas, config);
  }
  window.KIT = { css, colors, chart, countUp, stepper, wire };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire); else wire();
})();
