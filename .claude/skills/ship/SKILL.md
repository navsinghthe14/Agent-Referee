---
name: ship
description: Use when the user says "full stop" or "full send", or asks you to take a fix or feature end to end. Plan if needed, change, prove, review, PR, CI green; stops for the human unless the user said "full send".
---

# Ship (Full Stop by default, Full Send on request)

You own the work from its current state to a PR that's ready to merge. Don't bother the human before then unless a decision is truly theirs. The checklist is `node .referee/scripts/method.mjs status`; run it whenever you're unsure what's left.

**Mode.** The default is **Full Stop**: stop when the PR is ready and tell the human. If the user's message said "full send", the router created `.referee/state/full-send` and you may merge once status is all ✓. The guard blocks merging without that file, and blocks you from creating it, so don't try.

1. **Branch.** Create a branch named for the problem. Never work on the main branch.
2. **Understand.** Read the code involved and `kb/tasks/planned/`. If the task is ambiguous in a way that changes the result, ask one question. Otherwise decide, and record the decision in the PR.
3. **Plan, if it's more than a small change.** Several files, steps or packages → load `writing-plans` and execute that plan task by task (move it to `kb/tasks/active/`). One or two files with an obvious test → skip to 4.
4. **Change.** The smallest change that solves the stated problem. Test first where there's a test to write.
5. **Prove.** Load `verification-before-completion`: run `config.verify`, plus a test that fails before your change and passes after it. UI changes: screenshot or recording, kept out of the repo.
6. **Review.** Load `review-loop` (which uses `receiving-code-review` for the findings), at most three rounds.
7. **PR.** Load `file-pr`.
8. **CI.** Watch checks until they're green. Fix failures your change caused. Report unrelated ones; don't fix them.
9. **Status.** Run `node .referee/scripts/method.mjs status`, then repeat the failing steps until every line shows ✓.
10. **Hand over or merge.** Full Stop: post a summary with the problem, the fix, the evidence, the review findings and anything unsure. Full Send: merge, then post the same summary. Move the plan, if any, to `kb/tasks/done/`.
