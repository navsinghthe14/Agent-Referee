---
name: referee-onboard
description: Use the first time the referee runs in a repo, or when asked to "set up the referee" or "show what the referee will do here". Scans the codebase, then shows which skills apply and how, before any task starts.
---

# Referee onboarding (first run in a repo)

The user should see what the referee found and how it will work **before** you start their task. It takes about a minute, and it only happens once per repo.

## Steps
1. **Scan.** Run `node .referee/scripts/scan.mjs`. It reads the repo's files and git history and prints a report: what's in the repo, how each skill will work here, what will be blocked, and what to fix first. It also saves the report to `.referee/reports/scan.md`.
2. **Look for yourself, briefly.** Open the README and the main entry point or package the scan points to, so you can describe the repo in one sentence. Don't read the whole codebase.
3. **Show the user** the scan's three tables exactly as printed. Above them, add:
   - one sentence on what this repo is, from what you read;
   - one sentence on how the referee will work here.
4. **Ask once** about anything marked ⚠ that needs their decision, for example: *"`infra/` isn't protected. Should agents be blocked from editing it?"* Make only the changes they agree to, in `.referee/config.json`. That file is protected, so tell them the exact line to add and let them add it, or they can run the change themselves.
5. **Finish.** Run `node .referee/scripts/scan.mjs --done` so this doesn't run again. Then continue with what the user originally asked for, if anything.

## Rules
- Report only what the scan and your reading found. If something wasn't detected, say "not found". Don't guess.
- Keep it to one screen. The goal is "I can see what's going to happen", not a full audit. For a deep review, point them to "audit the repo" (`repo-audit`).
- If the user says "skip", run `node .referee/scripts/scan.mjs --done` and carry on with their task.
