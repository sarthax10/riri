#!/usr/bin/env python3
"""apply_patch: applies an OpenAI-style patch (the format gpt-oss was trained to write) to files.

Installed on the server as ~/.local/bin/apply_patch. Reads the patch from stdin or the first argument:

  *** Begin Patch
  *** Update File: path/to/file.py
  @@ optional context line
   unchanged line
  -removed line
  +added line
  *** Add File: new.txt
  +content
  *** Delete File: old.txt
  *** End Patch
"""
import os
import sys


def fail(msg):
    sys.stderr.write("apply_patch: " + msg + "\n")
    sys.exit(1)


def parse(text):
    lines = text.splitlines()
    try:
        start = next(i for i, l in enumerate(lines) if l.strip() == "*** Begin Patch")
    except StopIteration:
        fail("no '*** Begin Patch' line")
    ops, i = [], start + 1
    while i < len(lines):
        l = lines[i]
        if l.strip() == "*** End Patch":
            return ops
        for kind in ("Update File: ", "Add File: ", "Delete File: "):
            if l.startswith("*** " + kind):
                path = l[len("*** " + kind):].strip()
                body, i = [], i + 1
                while i < len(lines) and not lines[i].startswith("*** "):
                    body.append(lines[i])
                    i += 1
                move = None
                if i < len(lines) and lines[i].startswith("*** Move to: "):
                    move = lines[i][len("*** Move to: "):].strip()
                    i += 1
                    while i < len(lines) and not lines[i].startswith("*** "):
                        body.append(lines[i])
                        i += 1
                ops.append((kind.split()[0], path, body, move))
                break
        else:
            i += 1
    return ops


def hunks(body):
    """Splits an update body into hunks of (old_lines, new_lines)."""
    out, old, new = [], [], []
    for l in body:
        if l.startswith("@@"):
            if old or new:
                out.append((old, new))
            old, new = [], []
        elif l.startswith("-"):
            old.append(l[1:])
        elif l.startswith("+"):
            new.append(l[1:])
        elif l.startswith(" ") or l == "":
            old.append(l[1:] if l else "")
            new.append(l[1:] if l else "")
        elif l.strip() == "*** End of File":
            continue
        else:  # a context line written without its leading space
            old.append(l)
            new.append(l)
    if old or new:
        out.append((old, new))
    return out


def find(lines, seq, start):
    for strip in (False, True):  # exact first, then ignoring trailing whitespace
        norm = (lambda s: s.rstrip()) if strip else (lambda s: s)
        target = [norm(s) for s in seq]
        for i in range(start, len(lines) - len(seq) + 1):
            if [norm(s) for s in lines[i:i + len(seq)]] == target:
                return i
    return -1


def main():
    text = sys.argv[1] if len(sys.argv) > 1 and "*** Begin Patch" in sys.argv[1] else sys.stdin.read()
    done = []
    for kind, path, body, move in parse(text):
        if kind == "Add":
            os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                f.write("\n".join(l[1:] if l.startswith("+") else l for l in body) + "\n")
            done.append("A " + path)
        elif kind == "Delete":
            os.remove(path)
            done.append("D " + path)
        else:
            with open(path, encoding="utf-8") as f:
                content = f.read()
            lines = content.split("\n")
            pos = 0
            for old, new in hunks(body):
                at = find(lines, old, pos) if old else len(lines)
                if at < 0:
                    fail(f"in {path}: could not find these lines:\n" + "\n".join(old[:8]))
                lines[at:at + len(old)] = new
                pos = at + len(new)
            target = move or path
            with open(target, "w", encoding="utf-8") as f:
                f.write("\n".join(lines))
            if move and move != path:
                os.remove(path)
            done.append("M " + target)
    print("\n".join(done) or "nothing to do")


if __name__ == "__main__":
    main()
