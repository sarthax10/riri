---
name: slides
description: making a presentation or slide deck as an artifact (keyboard and swipe navigation, one idea per slide)
---
# Slide decks

Easiest: content.json with `"layout": "slides"` and a `slides` list of blocks (artifacts skill); the renderer
makes the deck (arrow keys, swipe, progress bar). For a hand-made deck, build as an artifact with the kit (`artifact-new ... --theme ink` or `studio` suit decks). One idea per slide;
the deck should make sense read alone.

## Structure
title → the point in one sentence → 3-8 content slides → what to do / decide → sources.
Each slide's heading is a full sentence stating its point. Max ~25 words of body text per slide; the rest is a
number, a chart, a diagram or an image.

## Template (paste into index.html's <main>, then fill)
```html
<style>
  .deck { height: 100dvh; overflow: hidden; position: relative; }
  .slide { position: absolute; inset: 0; padding: clamp(24px, 7vw, 96px); display: grid; align-content: center; gap: var(--space-5);
    opacity: 0; transform: translateX(30px); transition: opacity .45s var(--ease), transform .45s var(--ease); pointer-events: none; }
  .slide.on { opacity: 1; transform: none; pointer-events: auto; }
  .slide h2 { font-size: clamp(2rem, 4.6vw, 3.6rem); max-width: 22ch; }
  .deck-bar { position: fixed; left: 0; right: 0; bottom: 0; display: flex; justify-content: space-between; align-items: center;
    padding: 14px 24px; font: 500 var(--t-sm) var(--mono); color: var(--muted); }
  .deck-bar i { position: absolute; left: 0; top: 0; height: 2px; background: var(--accent); transition: width .45s var(--ease); }
</style>
<div class="deck">
  <section class="slide"><p class="eyebrow">Topic</p><h1 class="display">Title that states the point</h1><p class="lede">Subtitle</p></section>
  <section class="slide"><h2>First point, as a sentence</h2><div class="stats">...</div></section>
</div>
<div class="deck-bar"><i></i><span id="n"></span><span>← → to move</span></div>
<script>
  const S = [...document.querySelectorAll(".slide")]; let k = +(location.hash.slice(1) || 1) - 1;
  function go(i) { k = Math.max(0, Math.min(S.length - 1, i)); S.forEach((s, j) => s.classList.toggle("on", j === k));
    document.getElementById("n").textContent = (k + 1) + " / " + S.length; document.querySelector(".deck-bar i").style.width = ((k + 1) / S.length * 100) + "%";
    history.replaceState(null, "", "#" + (k + 1)); }
  addEventListener("keydown", (e) => { if (["ArrowRight", " ", "PageDown"].includes(e.key)) go(k + 1); if (["ArrowLeft", "PageUp"].includes(e.key)) go(k - 1); });
  let x0 = null; addEventListener("touchstart", (e) => (x0 = e.touches[0].clientX), { passive: true });
  addEventListener("touchend", (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) go(k + (dx < 0 ? 1 : -1)); x0 = null; });
  addEventListener("click", (e) => { if (!e.target.closest("a,button,input")) go(k + (e.clientX > innerWidth / 3 ? 1 : -1)); });
  go(k);
</script>
```
Remove the kit's top bar and footer for decks. Charts: Chart.js via `KIT.chart` (see `data-viz`), diagrams as
inline SVG (see `diagrams`). Follow the `design` skill: one accent, left-aligned, no bullet walls.
