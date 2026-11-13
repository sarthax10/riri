---
name: coding
description: building a feature or making a change in a codebase, start to finish
---
# Making a change in a codebase

1. **Orient in one or two calls.** `glob` for likely files (e.g. `**/*.py`, `src/**/*.ts`), or `search` for a
   name from the request. Read a README or AGENTS.md only if the project is unfamiliar. Do not list every folder.
2. **Plan with `todo`** when there are 3+ steps. Items are outcomes ("Add /health endpoint"), not actions
   ("Open file"). One item `in_progress` at a time.
3. **Read narrowly.** `read_file` with `start`/`end` around the code you will change; the search output gives
   you line numbers. Read callers only if you change a signature.
4. **Match the house style**: naming, error handling, imports, test layout. Do not reformat code you are not
   changing. Do not add dependencies unless asked.
5. **Edit small.** `edit_file` with an `old` snippet copied exactly from what you read, including indentation,
   and unique in the file (add a neighbouring line if needed). New files: `write_file`.
6. **Verify for real.** Run the narrowest check that proves it: the one test file, `python -m py_compile`,
   `node --check`, the build, or running the script with sample input. Read the output; a passing exit code with
   an error message in it is not a pass.
7. **If a check fails**, read the error, fix the cause (not the test), re-run. Twice failed on the same idea →
   stop and report what you know.
8. **Finish** with 2-3 sentences: what changed (files), how you verified, anything left for the owner.

Useful commands in the workbench: `python3 -m pytest -q path`, `python3 -m venv .venv && . .venv/bin/activate`,
`pip install --user pkg`, `npm ci`, `npm test`, `node file.js`, `git diff --stat`, `rg -n pattern`.
The workbench has internet access for installing packages; it cannot see the rest of the server.
