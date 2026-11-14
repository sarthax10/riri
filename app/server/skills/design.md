---
name: design
description: making any page, app or artifact look designed by a sharp human, not generic AI output (layout, type, colour, polish)
---
# Front-end design that doesn't look like AI slop

Start from the kit: `artifact-new <folder> --theme <t> --title "..."` gives kit.css (tokens, type, components) and
kit.js. Build on its classes and variables instead of writing a stylesheet from zero.

## 1. Decide before you write (one line each, in your head)
- **Who and what for**: the one thing the reader should get or do. Design for that, cut the rest.
- **Tone → theme**: editorial/history/long reads → `paper` or `grove` · data, tools, tech → `studio` or `ink` ·
  moody, night, space, media → `night` or `ink`. Change `--accent` if the subject has a natural colour
  (`:root{--accent:#0E7C86}` for ocean). One accent only.
- **The signature element**: one thing that makes it memorable: a huge set number, an annotated diagram, a real
  timeline, a big interactive control. Everything else stays quiet.

## 2. The rules
**Type**
- Two families max (the theme's display + text). Display face only for headlines and big numbers.
- Real hierarchy: one `h1.display` per page, then `h2`, with clear size jumps. Body 16-18px, lines <= 70 characters
  (`p` is already capped by `--measure`).
- Write like an editor: specific headlines ("JWST saw galaxies 300 million years after the Big Bang"), not
  "Unlocking the Universe". Sentence case. No exclamation marks. No emoji in headings.

**Layout**
- Left-aligned text; centre only short hero lines if you must. Use asymmetry: `.split` (5/7), a narrow text column
  beside a wide figure, a full-bleed band.
- Generous, consistent spacing from the scale (`--space-5` inside cards, `--space-8` between sections). Align to
  edges; don't float things in the middle.
- Vary the rhythm: not every section is "title + 3 cards". Mix a stat row, a figure, a table, a quote, a timeline.

**Colour & surface**
- Mostly the theme's neutrals; the accent is for the few things that matter (key number, active state, links).
- Hairline borders (`--line`) over drop shadows. Shadows, if any, soft and low. No glassmorphism, no neon glows,
  no gradient text, no purple-to-blue gradients, no rainbow icon tiles.

**Details that read as "designed"**
- Numbers: `tabular-nums`, units in smaller muted text, thousands separators. Real dates ("12 Jul 2022").
- Small uppercase `.eyebrow` labels to orient; `.meta` for dates and sources.
- Real content only: no lorem ipsum, no "Feature 1/2/3", no fake testimonials, no stock "John Doe".
- Icons only when they carry meaning; prefer text labels. If you use icons, one consistent stroke style (inline SVG,
  1.5px stroke, currentColor).
- Interactive states: hover, focus-visible, active, disabled, and an empty state for anything that can be empty.
- Motion is subtle and purposeful: `.reveal` on sections, a count-up on key stats. Never bounce, never spin.

**Must work everywhere**
- Mobile first: check it at 380px wide in your head. `.grid`, `.split` and `.stats` collapse on their own; tables go
  in `.table-wrap`. Tap targets >= 40px.
- Contrast >= 4.5:1 for text (the themes already are; don't put grey text on a coloured band).
- Images: `alt` text, `width`/`height` or `aspect-ratio` set so nothing jumps; `object-fit: cover` for photos.

## 3. Banned (instant "AI made this")
Centred hero + "Welcome to X" + two buttons · three identical feature cards with emoji/icons · "Unleash / Elevate /
Seamless / Revolutionize / Dive in" · Inter-for-everything with no hierarchy · every corner `border-radius: 24px` ·
`box-shadow: 0 10px 30px` on everything · purple gradients · glowing blobs · fake stats ("10x faster") · walls of
bullets · a dark mode with pure #000 and pure #FFF.

## 4. Before you call it done
Re-read your HTML once against this list: one accent? clear h1 → h2 → body steps? left-aligned, varied sections?
real content and sources? mobile OK? hover/focus states? Fix what fails, then serve it.
