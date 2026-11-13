---
name: morning-brief
description: preparing the owner's daily morning brief (tasks, weather, news), usually started automatically
---
# The morning brief

The owner reads this on their phone, first thing. It must be scannable in under a minute.

1. `list_tasks`. Note what is overdue, what is due today, and at most 3 other open items worth attention.
2. Weather, only if a city was given: one `web_search` like "weather <city> today", and use the snippet; do not
   open pages for weather.
3. News, only if topics were given: one `web_search` per topic (at most 3 topics), adding "today" or this month
   to the query. Read a page only if the snippets are unclear. Pick the single most important story per topic.
4. Write it in this shape, nothing more:

   **Good morning{, name}.** One line on the day (e.g. "Busy one: 3 things due.").

   **Today** — bullet list: overdue first (mark them "overdue"), then due today. If none: "Nothing due today."

   **Weather** — one line: conditions, high/low, rain chance. (Skip the heading if no city.)

   **News** — one bullet per topic: the headline in your words + [source](url). (Skip if no topics.)

   **One thing** — a single, specific suggestion for the day, based on the tasks (e.g. "Clear the two quick
   emails before 10, then block the afternoon for the report.").

5. No preamble, no sign-off, no questions. Under 150 words.
