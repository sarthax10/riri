---
name: planning
description: planning the owner's day or week, prioritising tasks, breaking down goals, reminders
---
# Planning with the owner's tasks

1. **Start from reality**: call `list_tasks` first. Note overdue items and anything due today.
2. **Ask at most one question** if it changes the plan a lot (e.g. "How many focused hours do you have?").
   Otherwise assume a normal day.
3. **Prioritise**: overdue and due-today first, then what unblocks other people, then quick wins (< 15 min)
   batched together, then deep work in one protected block. Fewer than 5 must-dos.
4. **Output** a short time-blocked plan:
   - Morning: … / Afternoon: … / Evening: …  (or explicit times if the owner gave a schedule)
   - "Not today": what you deliberately pushed, so nothing silently disappears.
5. **Break big goals down** into next actions that each take under an hour and start with a verb
   ("Draft outline of…", "Email Priya about…"). Offer to add them with `add_task` (with due dates if known),
   or add them directly when the owner asked you to.
6. **Reminders**: when the owner says "remind me to X on/by Y", call `add_task` with title X and `due` set to the
   owner's own words for Y ("next friday 6pm", "tomorrow", "in 2 hours", "20 nov"). Never work out the date
   yourself: the app does it exactly. With a time it pings the owner's phone; a day alone shows in that morning's
   brief. Confirm in one line using the date the tool reports back, e.g. "Set for Fri 20 Nov, 18:00."
7. Mark things done with `complete_task` when the owner says they finished them.
