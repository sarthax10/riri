# RiRi — design notes

**Subject.** A private AI that lives on one small server: it chats, remembers, codes and runs the machine. The model is
slow, so the interface must always say what it is doing and how long it will take, and stay calm while it waits.

**Direction: night instrument.** Minimal, dark and precise, like a piece of good equipment at night. Graphite
surfaces with a faint dot screen; frosted-glass panels with hairline borders; thin, oversized display type; one warm
accent. (Mood references were collected privately from Pinterest and are not part of this repository.)

## The one bold thing: RiRi's ring
RiRi is a luminous ember ring, not a mascot or an avatar. It *is* her state: breathing when idle, filling with the
real prompt progress while she reads, shimmering while she writes, dashed and spinning while a tool runs, a steady
amber pulse when she needs an approval. It is the only gradient in the product besides the ambient glow.

## Tokens
| Name | Value | Use |
|---|---|---|
| ground | `#121316` → `#17191D` | page background, with a 4px dot screen |
| glass | `rgba(30,32,37,.62)` + blur | panels and cards |
| line | `rgba(255,255,255,.07)` | hairlines |
| text / cream | `#ECEAE6` / `#F2E6D6` | body / display |
| muted / faint | `#9B9EA6` / `#6A6D75` | secondary text |
| ember | `#FF6B2C` | the single accent: live state, primary action, focus |
| ok / warn / bad | `#7BD6A3` / `#F2C35C` / `#FF7A70` | status only |

**Type.** *Funnel Display* (light weights, tight tracking) for greetings, titles and numbers; *Geist* for interface
and reading text; *Geist Mono* only for code, paths and command output. Tabular figures for anything that counts.

**Layout.** A floating black icon rail; a glass sidebar of conversations and folders; the stage; a live activity
panel (her current step, the plan checklist, today's tasks, the machine). On phones: a top bar, a bottom tab bar,
drawers for the side panels.

**Avoided on purpose.** Purple gradients, Inter, rows of three identical cards, emoji icons, all-caps eyebrows,
big-number-with-tiny-label stat cards, decorative motion.
