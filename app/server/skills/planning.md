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
6. **Reminders**: when the owner says "remind me to X on/by Y", `add_task` with the title X and due Y.
   - A day only → `YYYY-MM-DD` (it appears in that morning's brief).
   - A time too ("at 6pm", "in 2 hours", "tomorrow 9am") → `YYYY-MM-DD HH:MM`, 24-hour, local time. This one
     pings the owner's phone at that moment, so get it exactly right: take weekdays from the calendar in the
     context note, and use run_python for "in N hours/minutes".
   Confirm in one line with the weekday, date and time, e.g. "Set for Fri 20 Nov, 18:00."
7. Mark things done with `complete_task` when the owner says they finished them.
