---
name: review-loop
description: Use before opening a PR, or when asked for a review or second opinion on a change. Runs the independent reviewer set in .referee/config.json, at most three rounds, without growing scope.
---

# Review loop

An independent reviewer catches what the author misses. A reviewer from a different model family catches different things again.

1. **Use exactly the reviewer in `.referee/config.json`.** Don't substitute another one.
   - `"kind": "subagent"` → call the Agent tool with `subagent_type` set to `reviewer.referee` (default `independent-reviewer`).
   - `"kind": "cli"` → run `reviewer.cli` in Bash and pipe the diff and the task statement in on stdin.
   - If the configured reviewer isn't available, stop and say so. Never review your own work instead.
2. **Give the reviewer** the task statement, `git diff <base>...HEAD` and nothing else. Leave out your reasoning.
3. **Handle the findings with `receiving-code-review`**, also when the reviewer says `no findings` (the session audit checks it was loaded). Fix real bugs in the changed lines; decline nits, new tests or edge cases the task didn't ask for, and "while you're here" changes, with a one-line reason each.
4. **Re-review only what changed.** Stop after `maxReviewRounds` (default 3). Leave remaining disagreements as `open:` for the human; don't keep looping.
5. **Write `.referee/reports/review-<branch>.md`**, one line per finding:

```
# review — <branch> — <date> — reviewer: independent-reviewer
fixed: off-by-one in pagination (src/list.ts:42)
declined: add tests for empty unicode names — not in scope
open: reviewer thinks the cache should be per-user; needs a product decision
```

`method.mjs status` reads this file; any `open:` line keeps status red until the human resolves it.
