---
name: git
description: committing, reviewing changes, branches and history in a git repository
---
# Working with git

- **Look before you commit**: `git status --short` and `git diff --stat`, then `git diff path` for anything
  you did not write in this session.
- **Commit only what the task changed.** Stage named files (`git add path1 path2`), never `git add -A` blindly.
- **Message**: a short imperative subject (≤ 60 characters, e.g. "Fix off-by-one in mean()"), a blank line, then
  why in a sentence or two if it is not obvious.
- **Never** force-push, rewrite published history, delete branches, or run `git reset --hard` / `git clean -fd`
  unless the owner asked for exactly that. Never push unless asked.
- **Branch** for larger work: `git switch -c short-name`.
- **History questions**: `git log --oneline -15`, `git log -p -S'text' -- path`, `git blame -L 10,30 path`.
- **Undo safely**: `git restore path` discards an uncommitted change to one file (ask first if the change is not
  yours); `git revert <sha>` undoes a commit with a new commit.
- If git says "dubious ownership", run `git config --global --add safe.directory '*'` in the workbench.
