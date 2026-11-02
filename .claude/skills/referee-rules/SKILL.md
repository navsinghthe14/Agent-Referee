---
name: referee-rules
description: Load first when starting any task in this repo, onboarding to it, or when an agent misbehaved. Holds the working rules and routes to the other twelve skills.
---

# How agents work in this repo

Every thread starts with no memory. Your job is to find what you need, not to be told it. The code is the main source of truth; `kb/` holds what code can't say (decisions, plans, lessons learned).

## Enforced by code (you can't skip it)

| Rule | Enforced by |
| --- | --- |
| Protected paths (see `.referee/config.json`) are never edited, by tool or by shell | `.referee/scripts/hooks/guard.mjs` blocks the call |
| Existing migrations are never changed; add a new migration instead | `guard.mjs` (`appendOnlyPaths`) |
| Secrets files (`.env`, keys) are never read or printed. Read `.env.example` for variable names; ask the user for a value | `guard.mjs` (`secretPaths`) |
| Nothing merges or pushes to the main branch unless the user said "full send"; you can't set full send yourself | `guard.mjs` |
| You can't finish a turn that changed files while the repo's quick check fails | `.referee/scripts/hooks/stop-gate.mjs` runs `config.verify` |
| Common requests name their skill | `.referee/scripts/hooks/route.mjs` + `.referee/routing.json` |
| "Ready to merge" is computed, not claimed | `node .referee/scripts/method.mjs status` |
| CI repeats the checks on every PR | `.github/workflows/agent-referee.yml` |
| Every session is graded on which skills and tools it called | `.referee/session-rules.json`, report in `.referee/audits/<session>.md` |

If a hook blocks you, fix the cause. Never work around a hook or edit `.referee/` to get past one.

## Judgment rules, each with its reason

1. **Explore before you change.** Read the code the task touches and grep for the strings involved. A map in a doc may be stale; the code isn't.
2. **Fix problems at the highest layer: code → lint/tests/CI → written guidance → human review.** A boundary in the code holds every time; a sentence in CLAUDE.md holds only some of the time.
3. **Keep changes the size of the task.** No extra tests, edge cases or compatibility layers the task didn't ask for.
4. **Prove it, don't claim it.** See `verification-before-completion`.
5. **Say what's unclear.** Ask the dumb question rather than guess. A wrong guess costs more than a question.
6. **Name things precisely.** "The scoring service in `packages/scoring`", not "the scorer".
7. **New task, new thread.** Long threads get compacted and rules blur.

## Which skill to load

| Situation | Skill |
| --- | --- |
| First message in this repo (the router asks for it), or "set up the referee" | `referee-onboard` |
| Agents keep getting confused; a deep review of the repo | `repo-audit` |
| Make a change end to end ("full stop" or "full send") | `ship` |
| The change spans several files, steps or packages | `writing-plans` (from `ship`, or on its own) |
| A feature or bug fix that needs tests: agree them with the user first | `spec-first` |
| About to say done, fixed, passing or ready; a subagent says it finished | `verification-before-completion` |
| Get the change reviewed by the independent reviewer | `review-loop` |
| Act on review feedback from anyone | `receiving-code-review` |
| Open or update a pull request, write a commit message | `file-pr` |
| Record a decision, plan or lesson; something in `kb/inbox/` | `repo-knowledge` |
| An agent used the wrong skill, tool or file | `agent-postmortem` |
| Audit skills, triggers, CLAUDE.md, past sessions, stale knowledge | `method-upkeep` |
