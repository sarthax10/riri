---
name: artifacts
description: building a page, explainer, dashboard, report, deck or app the owner can open at its own live link, or running a cloned web project
---
# Artifacts: things the owner can open

An artifact is a folder on the server served at its own private link; the owner gets a live preview card and it is
listed on the Live page.

## A. Pages, explainers, reports, dashboards, decks: write content.json only
A designed renderer draws the page from JSON, so you never write HTML or CSS and it always looks finished.
1. Research first if facts are needed (web_search, read_webpage). Keep exact numbers, units, dates and source URLs.
   Dates on websites are often MM-DD-YYYY: check the month. Do arithmetic with run_python, never in your head.
2. `run`: `artifact-new ~/artifacts/<short-name> --theme <theme> --title "<Title>"`
   Themes: `paper` (editorial, history, culture) · `grove` (nature, health, calm) · `studio` (tech, product, data) ·
   `ink` (serious, minimal, dark) · `night` (space, media, moody dark).
3. `write_file` `~/artifacts/<short-name>/content.json` with your content (one call, the whole file). Schema below.
4. `run`: `artifact-new --check ~/artifacts/<short-name>`. Fix every problem it lists, check again.
5. `artifact_start(name=..., folder="~/artifacts/<short-name>", description="one line")`. No command needed.

### content.json
```json
{"meta": {"theme": "studio", "title": "Short page title", "name": "Brand line in the top bar",
  "eyebrow": "Explainer · Space", "headline": "The main claim, specific, max ~12 words",
  "lede": "Two sentences: what this is and why it matters.", "accent": "#C2410C (optional, one colour)",
  "hero_stats": [{"value": 6.5, "unit": "m", "label": "mirror diameter"}], "updated": "14 Nov 2026",
  "layout": "page (default) or slides"},
 "sections": [ BLOCKS ]}
```
Blocks (each has "type"; most take "title" (a sentence stating the point), optional "intro", and "nav": "Short" to
list it in the top bar). Body text is light Markdown: **bold**, *em*, [text](url), "- " lists, blank line = paragraph.
- `{"type":"text","title":..,"body":"..","aside":BLOCK}`: prose; aside puts a diagram/chart/stats/image beside it.
- `{"type":"stats","items":[{"value":25.4,"unit":"m²","label":"collecting area"}]}`: 2-4 big numbers. value = number.
- `{"type":"diagram","title":..,"mermaid":"flowchart LR\n  a[Sun] --> b[Mirror]","caption":"what to notice"}`
  (Mermaid: `flowchart LR/TD`, `sequenceDiagram`, `timeline`; short labels; see the diagrams skill.)
- `{"type":"steps","title":..,"interactive":true,"items":[{"title":"Unfold","body":".."}]}`: a step-through.
- `{"type":"timeline","title":..,"items":[{"date":"Jul 2022","title":"First images","body":"..","link":"url"}]}`
- `{"type":"chart","title":"Finding as a sentence","subtitle":"What, units, period","kind":"bar|hbar|line|doughnut",
   "labels":["A","B"],"series":[{"name":"Size","values":[2.4,6.5]}],"unit":"m","highlight":"B","source":"[NASA](url)"}`
   values are plain numbers, one per label. For one series, "highlight" colours one bar with the accent.
- `{"type":"comparison","title":..,"columns":["Hubble","Webb"],"rows":[{"label":"Mirror","values":[2.4,6.5],"unit":"m"},
   {"label":"Orbit","values":[547,1500000],"unit":"km"}],"source":".."}`: things side by side, any units.
- `{"type":"slider","title":..,"input":{"label":"Distance","min":1,"max":13800,"step":10,"value":1000,"unit":"million ly"},
   "output":{"label":"years ago the light left","formula":"x * 1e6","unit":"years","decimals":0},
   "marks":[{"label":"Andromeda","value":2.5}],"note":"How it's computed."}`: formula is a JS expression of x.
- `{"type":"table","columns":[..],"rows":[[..],[..]],"source":".."}` · `{"type":"cards","items":[{"title","body","tag"}]}`
- `{"type":"callout","title":"What we don't know yet","body":".."}` · `{"type":"quote","text":"..","by":".."}`
- `{"type":"image","src":"https://...","alt":"..","caption":".."}` (only real image URLs from your research)
- `{"type":"sources","items":[{"title":"..","url":"https://..","publisher":"NASA","date":"2024"}]}`: always last.
Order like a story: hero → what it is → how it works (diagram/steps) → evidence (chart/comparison/timeline) →
the interactive bit → what's uncertain (callout) → sources. 5-9 blocks. Real facts only, every number sourced.
Slides: `"layout":"slides"` and `"slides": [BLOCKS]` instead of sections, one point per slide.

## B. Apps that need a server (APIs, databases, a cloned project)
Give `command`; it MUST listen on `$HOST` and `$PORT` (never localhost or a fixed port). Install dependencies first
with `run`, not inside the command. Examples: `python3 app.py` (reading os.environ HOST/PORT) · `uvicorn main:app
--host "$HOST" --port "$PORT"` · `flask run --host "$HOST" --port "$PORT"` · `npx vite --host "$HOST" --port "$PORT"
--strictPort` · `npx next dev -H "$HOST" -p "$PORT"` · `docker run --rm -p $HOST:$PORT:80 image`.
When the owner asks to clone/set up/run a project with a web UI or API: clone, install, read its README for the start
command, adapt host/port flags, then artifact_start with that command so they get a link.
A hand-written page (rare): `artifact-new <folder> --template page` and load the `design` skill.

## C. After artifact_start
- Not answering: `artifact_logs(id)`, fix, `artifact_start(id=<the uuid from the result>)` again (same link).
- Edited content.json later? No restart needed; the page reads it on load.
- Finish in two sentences: what it shows, and the link as a Markdown link. Don't paste the content into the chat.
