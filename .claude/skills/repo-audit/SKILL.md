---
name: repo-audit
description: Use when first setting up agents in a repo, when agents keep getting confused or making the same mistake, or when asked to audit CLAUDE.md or agent guidance. Runs a dumb-questions baseline and sorts every fix onto the fix ladder.
---

# Repo audit (dumb-questions baseline + fix ladder)

Most agent mistakes come from confusing code, not missing docs. This audit finds the confusion and fixes it at the highest layer.

## 1. Baseline
Pick one real, small task from the user, or the oldest open issue. Work it as a new hire would, with no help from `CLAUDE.md`: explore, propose a fix, and write down every point where you were confused or had to guess.

Examples of useful confusion:
- "Two functions, `scoreSubmission` and `scoreAttempt`, do the same thing. Which one is live?"
- "Two config files. Which one is canonical?"
- "The README says the API is in `/server`, but it's in `/apps/api`."

## 2. Guidance triage
Run `node .referee/scripts/method.mjs claude-md`. It lists every line of `CLAUDE.md`/`AGENTS.md` flagged as a map line or a rule. For each line, decide:

| If the line… | Move it to |
| --- | --- |
| describes where code lives | Delete it; names and structure should say it. If they don't, propose a rename. |
| states a rule a tool can check | A lint rule, type, test or CI step |
| states a rule only judgment can apply | Keep it, one line, with its reason |
| records a decision or its reason | `kb/decisions/` (use `repo-knowledge`) |

## 3. Report
Write `kb/reports/repo-audit-<YYYY-MM-DD>.md` with a table: problem, evidence (file and line), fix, layer (code / lint / guidance / human). Create one task file in `kb/tasks/planned/` for each fix at the code or lint layer.

Don't make the fixes in this run. The audit's output is the list; the human picks what to do.
