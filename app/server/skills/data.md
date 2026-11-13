---
name: data
description: calculations, unit conversions, dates, statistics, and working with CSV/JSON data
---
# Numbers and data

- **Never do non-trivial arithmetic in your head.** Use `run_python` and `print()` the result. This includes
  percentages, compound interest, currency maths, date differences, time zones and unit conversions.
- Keep scripts short and self-contained. Standard library is always there (`math`, `statistics`, `datetime`,
  `json`, `csv`, `decimal`, `fractions`, `zoneinfo`). `numpy`/`pandas` may need `pip install --user` first; prefer
  the standard library for small jobs.
- **Money**: use `decimal.Decimal`, round only at the end, state the currency.
- **Dates**: `datetime.date.today()` is the server's date; for "next Friday" etc. compute it, don't guess.
- **Data the owner pasted** (CSV, JSON, a table): put it in the script as a string, parse it, compute, and
  print a compact summary or table. For larger results print only what answers the question.
- **Show your work briefly**: the result first, then a one-line note on the method or the formula if useful.
  Show the code only if the owner asks or might want to reuse it.
- Sanity-check results: orders of magnitude, units, and totals that should add up.
