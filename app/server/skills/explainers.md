---
name: explainers
description: an interactive explainer or visual guide that teaches how something works (a concept, a system, an event, research findings)
---
# Interactive explainers

Goal: someone who knew nothing understands the idea in three minutes and remembers one picture of it. Build it with
the artifacts skill's content.json (blocks named below).

## 1. Plan with todo
1. **The takeaway in one sentence.** It becomes `meta.headline`. Specific: "Webb sees galaxies from 290 million years
   after the Big Bang", not "Exploring the Universe".
2. **Facts**: 2-3 searches, read the 1-2 best pages. Write down each number with its unit, date and URL.
   Check dates (MM-DD vs DD-MM). Compute derived numbers with run_python.
3. **Beats → blocks**, in the order a curious person asks:
   | Beat | Block |
   |---|---|
   | What is it, in numbers | `meta.hero_stats` (3 figures) |
   | How it works | `text` with an `aside` `diagram` (mermaid flowchart), then `steps` (`interactive: true`) |
   | How it compares | `comparison` (different units) or `chart` (one measure) |
   | What happened / was found | `timeline` (5-8 dated items, newest last) |
   | Play with it | `slider` with an honest formula, `marks` for famous examples |
   | Scale or detail | `table` or `cards` |
   | What's uncertain | `callout` |
   | Where this comes from | `sources` (every URL you used) |
   Never pad: skip a beat that has nothing real in it.

## 2. Writing
- Each block title states its point as a sentence ("Its mirror is 2.7 times wider than Hubble's").
- Body: 2-4 short sentences per paragraph, plain words; define a term the first time in passing.
- Diagrams: 4-8 nodes, labels of 1-3 words, one direction. The caption says what to notice.
- Slider: the input is a real quantity with a unit; the formula is physics/maths you can state in the `note`.
  Example (light travel): input distance in light-years, output `x` years ago ("light covers one light-year a year").
- Numbers in JSON are plain numbers (6.5, not "6.5 m"); units go in `unit`.

## 3. Before artifact_start
`artifact-new --check` passes · every number has a source · the headline is a claim · 5-9 blocks · the comparison or
chart uses the same units within a row/series. Then serve it and give the owner the takeaway plus the link.
