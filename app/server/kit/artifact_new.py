#!/usr/bin/env python3
"""artifact-new FOLDER [--template content|page] [--theme paper|ink|night|studio|grove] [--title "Title"]
artifact-new --check FOLDER

content (default): index.html draws a designed page (or slide deck) from content.json; you only write content.json.
page: a themed index.html to write by hand with the kit's classes.
--check: validates FOLDER/content.json and lists every problem. Run it after writing content.json.
Installed on the server as ~/.local/bin/artifact-new; the kit lives in ~/.local/share/riri/kit.
"""
import argparse
import datetime
import json
import os
import shutil
import sys

KIT = os.path.expanduser("~/.local/share/riri/kit")
FONTS = {
    "paper": "family=Fraunces:opsz,wght@9..144,400..700&family=Inter+Tight:wght@400..700",
    "ink": "family=Instrument+Serif:ital@0;1&family=Inter+Tight:wght@400..700",
    "night": "family=Funnel+Display:wght@300..700&family=Geist:wght@400..700",
    "studio": "family=Space+Grotesk:wght@400..700&family=Inter:wght@400..700",
    "grove": "family=DM+Serif+Display:ital@0;1&family=DM+Sans:opsz,wght@9..40,400..700",
}
NEEDS = {  # block type -> fields it must have
    "text": ["title", "body"], "stats": ["items"], "callout": ["body"], "quote": ["text"], "image": ["src"],
    "table": ["columns", "rows"], "timeline": ["items"], "steps": ["items"], "diagram": [], "chart": ["labels"],
    "comparison": ["columns", "rows"], "slider": ["input", "output"], "cards": ["items"], "sources": ["items"],
}


def check(folder):
    path = os.path.join(os.path.abspath(os.path.expanduser(folder)), "content.json")
    try:
        c = json.load(open(path, encoding="utf-8"))
    except FileNotFoundError:
        return [f"{path} doesn't exist"]
    except json.JSONDecodeError as e:
        return [f"content.json is not valid JSON: {e}"]
    errs = []
    m = c.get("meta") or {}
    if m.get("theme") and m["theme"] not in FONTS:
        errs.append(f"meta.theme '{m['theme']}' unknown; use one of {', '.join(FONTS)}")
    if not (m.get("headline") or m.get("title")):
        errs.append("meta needs a headline (the page's main claim) and a title")
    blocks = c.get("slides") if m.get("layout") == "slides" else c.get("sections")
    if not isinstance(blocks, list) or not blocks:
        errs.append("add a 'sections' list (or 'slides' with meta.layout = 'slides')")
        return errs

    def one(b, where):
        t = b.get("type")
        if t not in NEEDS:
            errs.append(f"{where}: unknown type '{t}'; use one of {', '.join(NEEDS)}")
            return
        for f in NEEDS[t]:
            if not b.get(f):
                errs.append(f"{where} ({t}): missing '{f}'")
        if t == "diagram" and not (b.get("mermaid") or b.get("svg")):
            errs.append(f"{where} (diagram): give 'mermaid' (text) or 'svg'")
        if t == "chart":
            labels = b.get("labels") or []
            series = b.get("series") or ([{"values": b["values"]}] if b.get("values") else [])
            if not series:
                errs.append(f"{where} (chart): give 'series': [{{'name':..., 'values':[...]}}]")
            for s in series:
                v = s.get("values") or []
                if len(v) != len(labels):
                    errs.append(f"{where} (chart): {len(labels)} labels but {len(v)} values in series '{s.get('name', '')}'")
                if any(not isinstance(x, (int, float)) for x in v):
                    errs.append(f"{where} (chart): values must be plain numbers (no units or quotes)")
        if t == "comparison":
            n = len(b.get("columns") or [])
            for r in b.get("rows") or []:
                if len(r.get("values") or []) != n:
                    errs.append(f"{where} (comparison): row '{r.get('label')}' has {len(r.get('values') or [])} values for {n} columns")
        if t == "slider":
            o = b.get("output") or {}
            f = o.get("formula", "x")
            if any(w in f for w in ("document", "window", "fetch", "=>", ";")):
                errs.append(f"{where} (slider): the formula must be a plain expression of x, like 'x * 9.461'")
        if t == "aside" or b.get("aside"):
            one(b["aside"], where + ".aside")
        for k, it in enumerate(b.get("items") or []):
            if t == "timeline" and not (isinstance(it, dict) and it.get("date") and it.get("title")):
                errs.append(f"{where} (timeline) item {k + 1}: needs 'date' and 'title'")
            if t == "sources" and not (isinstance(it, dict) and str(it.get("url", "")).startswith("http")):
                errs.append(f"{where} (sources) item {k + 1}: needs a full 'url'")

    for i, b in enumerate(blocks):
        if not isinstance(b, dict):
            errs.append(f"block {i + 1} is not an object")
            continue
        one(b, f"block {i + 1}")
    return errs


ap = argparse.ArgumentParser(description="Start an artifact folder from RiRi's design kit, or check one.")
ap.add_argument("folder")
ap.add_argument("--template", default="content", choices=["content", "page"])
ap.add_argument("--theme", default="paper", choices=sorted(FONTS))
ap.add_argument("--title", default="Untitled")
ap.add_argument("--name", default=None)
ap.add_argument("--force", action="store_true")
ap.add_argument("--check", action="store_true", help="validate FOLDER/content.json")
a = ap.parse_args()

if a.check:
    problems = check(a.folder)
    if problems:
        print("content.json has problems:\n- " + "\n- ".join(problems))
        sys.exit(1)
    print("content.json looks right.")
    sys.exit(0)

folder = os.path.abspath(os.path.expanduser(a.folder))
os.makedirs(folder, exist_ok=True)
files = ["kit.css", "kit.js"] + (["render.js"] if a.template == "content" else [])
for f in files:
    shutil.copyfile(os.path.join(KIT, f), os.path.join(folder, f))
index = os.path.join(folder, "index.html")
if os.path.exists(index) and not a.force:
    print(f"{index} exists, left as is ({', '.join(files)} refreshed). Use --force to overwrite.")
    sys.exit(0)
if a.template == "content":
    shutil.copyfile(os.path.join(KIT, "content.html"), index)
    example = json.load(open(os.path.join(KIT, "content.json"), encoding="utf-8"))
    example["meta"].update({"theme": a.theme, "title": a.title, "name": a.name or a.title,
                            "updated": datetime.date.today().strftime("%d %b %Y").lstrip("0")})
    json.dump(example, open(os.path.join(folder, "content.json"), "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    print(f"Created {folder}: index.html + render.js draw the page from content.json (theme {a.theme}).\n"
          f"content.json holds an EXAMPLE about solar panels: replace it entirely with your content (write_file), then run\n"
          f"  artifact-new --check {a.folder}\nand fix anything it reports, then artifact_start.")
else:
    html = open(os.path.join(KIT, "starter.html"), encoding="utf-8").read()
    html = html.replace('data-theme="paper"', f'data-theme="{a.theme}"')
    html = html.replace("family=Fraunces:opsz,wght@9..144,400..700&family=Inter+Tight:wght@400..700", FONTS[a.theme])
    html = html.replace("<title>TITLE</title>", f"<title>{a.title}</title>")
    html = html.replace("NAME", a.name or a.title).replace("DATE", datetime.date.today().strftime("%d %B %Y").lstrip("0"))
    open(index, "w", encoding="utf-8").write(html)
    print(f"Created {folder}: index.html (theme {a.theme}), kit.css, kit.js. Fill in index.html, then artifact_start.")
