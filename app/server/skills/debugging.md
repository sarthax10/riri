---
name: debugging
description: finding and fixing a bug, an error message, a failing test or a crash
---
# Debugging

1. **Reproduce first.** Run the failing command or test and capture the exact error. If you cannot
   reproduce it, say so and ask for the steps; do not guess-fix.
2. **Read the error bottom-up.** The last line says what; the deepest frame in the project's own code says
   where. Ignore frames inside libraries unless the cause is the arguments you passed in.
3. **Form one hypothesis** that explains every symptom. Check it cheaply: read the 20 lines around the
   failing line, print a value with a one-off `run`, or search for where the bad value comes from.
4. **Fix the cause, minimally.** Do not silence the error, widen a `try/except`, or edit the test to match the
   bug. If the test itself is wrong, say why before changing it.
5. **Re-run the original reproduction**, then the nearby tests, to show the fix and that nothing else broke.
6. **Unknown error text** (a library message, an exit code, a system error): `web_search` the exact message in
   quotes plus the library name, and read the most relevant issue or doc page.

Common causes worth checking first: wrong working directory or path, off-by-one in ranges, None/empty input,
string vs number, mutated shared state, stale build or cache, missing environment variable, version mismatch.

Report: the cause in one sentence, the fix, and the command that now passes.
