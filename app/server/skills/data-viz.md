---
name: data-viz
description: charts, dashboards and visual data stories (choosing the chart, making it honest and readable)
---
# Charts and dashboards

In an artifact, use content.json's `stats`, `chart`, `comparison` and `table` blocks (artifacts skill): they
are already styled. The rules below decide which block and how to fill it; section 3 is for hand-written pages.

## 1. Pick the chart from the question
| The question | Chart |
|---|---|
| How does it change over time? | line (many points) · column (few periods) |
| Which is bigger? | horizontal bar, sorted (long labels fit) |
| What is it made of? | stacked bar · 100% bar · donut only for 2-5 parts |
| How are two measures related? | scatter (+ trend line if real) |
| How is it distributed? | histogram · box plot |
| One number that matters | a big stat (`.stat-value`) with context ("+12% vs last year") |
| Where? | a map only if location is the point; otherwise a sorted bar by region |

No 3D, no dual y-axes, no pie with 8 slices, no radar unless comparing profiles.

## 2. Make it honest and readable
- Bars start at zero. Lines may not, but say so in the axis.
- Title states the finding ("Disk use doubled since May"), subtitle gives units, source and date.
- Label directly (end of a line, top of a bar) instead of a legend when there are <= 4 series.
- Sort categories by value unless they have a natural order (time, size bands).
- Grey for context, the accent for the one series or bar that matters.
- Round sensibly (3 significant figures), thousands separators, units once (in the axis or subtitle).
- Tooltips add detail; the chart must make sense without them.

## 3. With the kit + Chart.js (artifacts)
```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>
<figure class="figure card"><h3>Visitors doubled after the redesign</h3><p class="meta">Daily visitors, Jan-Jun 2026</p>
  <div class="chart" style="height:300px"><canvas id="c1"></canvas></div>
  <figcaption>Source: site analytics.</figcaption></figure>
<script src="kit.js"></script>
<script>
  KIT.chart(document.getElementById("c1"), { type: "line",
    data: { labels: ["Jan","Feb","Mar","Apr","May","Jun"], datasets: [{ label: "Visitors", data: [1200,1350,1300,2100,2400,2650] }] } });
</script>
```
`KIT.chart` applies the theme's fonts, colours, grid and tooltips. Pass `color:` on a dataset to override, e.g.
`{ label: "Others", data: [...], color: KIT.css("--line-2") }` for context series.
- Wrap each canvas in `.chart` with an explicit height; never let it be 0px tall.
- Small data or one-off shapes: hand-made SVG bars are fine and often sharper (see the `diagrams` skill).

## 4. Dashboards
- Top row: 3-5 `.stats` with the numbers someone checks daily, each with a comparison.
- Then the one chart that explains the top number, wide. Then supporting charts in a `.grid` (2 columns).
- Then a table (`.table-wrap`, right-aligned `td.num`) for detail.
- Live data: fetch from a small API in the artifact (Python/Node on $HOST:$PORT) and refresh on an interval;
  show "Updated 12:04" in `.meta`. Static data: embed it as a JS array with its source and date.
- Data from the server (disk, memory, Docker): gather it with `run`, write it to `data.json` beside index.html,
  `fetch("./data.json")` in the page. For live numbers, serve a tiny endpoint instead.
