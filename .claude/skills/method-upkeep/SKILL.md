---
name: method-upkeep
description: Use when asked to audit or tidy agent skills, routing, CLAUDE.md, kb/ or past sessions (did the agent call the right skills and tools?), or when a scheduled upkeep run starts. Runs exactly one named routine per invocation.
---

# Method upkeep

Run one routine per invocation; its name comes from the request or the schedule. If none is named, ask which one. One job per run means a bad run damages one thing at most.

## session-audit
Every agent turn is already graded by the Stop hook from the harness's own log (not from what the agent claims). This routine reads the results across sessions.
1. `node .referee/scripts/method.mjs audits --last=20` — pass rate per check, skills loaded, latest failing session.
2. Open the failing session's `.git/referee/audits/<id>.md`. Example: `routed-skill-loaded ✗ — router named ship; not loaded before first edit`.
3. A check that failed twice or more is a pattern: run `agent-postmortem` on it. Its fix must add a rule to `.referee/session-rules.json`, a case to `.referee/evals/triggers.json`, or a guard, so the next audit catches it.
4. A check that has been `n/a` for 20 sessions tests nothing: propose deleting it.

## trigger-audit
Run `node .referee/scripts/eval-triggers.mjs`; router failures are bugs, so fix `.referee/routing.json`. If the `claude` CLI is available, add `--live`. A live miss where the router passes means the skill's description is weak: rewrite it with the trigger first, under 250 characters. Use `agent-postmortem` for anything still failing.

## skill-audit
For each skill in `.claude/skills/`: how often it ran (`method.mjs audits` lists skill loads), and how many resulting PRs merged without human edits. Recommend one skill to edit and one to delete, with reasons. A skill nobody has loaded in 20 sessions is suspect. Don't delete anything yourself.

## guidance-audit
Run `node .referee/scripts/method.mjs claude-md`. Propose moving each flagged line down the fix ladder (see `repo-audit`). Goal: `CLAUDE.md` gets shorter every month.

## knowledge-staleness
List notes in `kb/decisions/` and `kb/learnings/` that name a tool, version, path or person that may have changed, and tasks sitting in `kb/tasks/active/` for more than two weeks. Edit nothing; report.

## review-history
Read recent PR review comments. Any comment made three or more times is a candidate for a lint rule, type or test. List them with an example each.

Every routine ends with a short report in `kb/reports/` and a branch for the human.
