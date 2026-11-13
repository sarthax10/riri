// RiRi's presence: a luminous ring. It breathes when idle, fills with real progress while reading,
// shimmers while writing, spins dashed while using a tool, and pulses steadily when it needs you.
// States: idle, queued, reading, writing, tool, awaiting, error. `progress` is 0..1 (reading only).
(function () {
  let n = 0;
  function svg(size, state, progress) {
    const id = "rr" + ++n;
    const r = 40, circ = 2 * Math.PI * r;
    const p = Math.max(0, Math.min(1, progress || 0));
    const off = state === "reading" ? circ * (1 - Math.max(p, 0.03))
      : state === "writing" || state === "awaiting" || state === "error" ? 0
      : state === "queued" ? circ * 0.9 : circ * 0.72;
    const name = typeof AN === "function" ? AN() : "RiRi";
    return `<svg class="ring ring-${state}" width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="${name} is ${label(state)}">
  <defs>
    <linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFB27A"/><stop offset=".6" stop-color="#FF6B2C"/><stop offset="1" stop-color="#E8432A"/>
    </linearGradient>
    <radialGradient id="${id}c"><stop offset="0" stop-color="#FF7A3D" stop-opacity=".45"/><stop offset=".55" stop-color="#FF6B2C" stop-opacity=".08"/>
      <stop offset="1" stop-color="#FF6B2C" stop-opacity="0"/></radialGradient>
  </defs>
  <circle class="ring-glow" cx="50" cy="50" r="49" fill="url(#${id}c)"/>
  <circle class="ring-track" cx="50" cy="50" r="${r}" fill="none" stroke-width="1.6"/>
  <g class="ring-spin"><circle class="ring-arc" cx="50" cy="50" r="${r}" fill="none" stroke="url(#${id}g)" stroke-width="3"
    stroke-linecap="round" stroke-dasharray="${state === "tool" ? "6 9" : circ}" stroke-dashoffset="${state === "tool" ? 0 : off}" transform="rotate(-90 50 50)"/></g>
  <circle class="ring-core" cx="50" cy="50" r="5.5" fill="url(#${id}g)"/>
</svg>`;
  }
  function label(s) {
    return { idle: "resting", queued: "waiting its turn", reading: "reading", writing: "writing", tool: "using a tool",
      awaiting: "waiting for you", error: "stuck" }[s] || "resting";
  }
  window.Reli = { svg, label };
})();
