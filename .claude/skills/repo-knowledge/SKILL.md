---
name: repo-knowledge
description: Use to record or look up a decision, its reason, a plan or a lesson learned, or when files are in kb/inbox/. Keeps knowledge the code can't express in kb/ as plain text. Not for describing where code lives.
---

# Repo knowledge (what code can't say)

Code says *what* and *where*. `kb/` says *why*, *what's next* and *what we learned*. Never write down where code lives; the agent can find that, and a written map goes stale.

| Kind | Where | Template |
| --- | --- | --- |
| A decision and its reason | `kb/decisions/NNNN-short-name.md` | `.referee/templates/decision.md` |
| Planned, active, finished or dropped work | `kb/tasks/{planned,active,done,archived}/` | `.referee/templates/task.md` |
| Something learned the hard way | `kb/learnings/short-name.md` | one paragraph with an example |
| Anything new, unsorted | `kb/inbox/` | — |

## Rules, each with its reason
- **Before starting work, read `kb/tasks/planned/`.** Planned work changes how you build now. *Example:* if "move storage to S3" is planned, put export behind a storage interface.
- **Move task files, don't copy them**, and add a dated line on each move. The history is what makes the file useful.
- **Link related notes** with relative links. An agent only reads what it reaches.
- **Inbox:** file each item where the table says, link it to at least one existing note, then delete it from the inbox.
- **Search order:** grep `kb/` for exact words first, then read the decision titles in `kb/decisions/`.
