---
name: verification-before-completion
description: Use before saying work is done, fixed, passing or ready, before every commit, PR or hand-over, and after any subagent reports success. Run the command that proves the claim and quote its output; never claim from memory.
---

# Verification before completion

**Evidence before claims, always.** If you haven't run the check in this turn, you can't say it passes. Rewording the claim ("looks good", "should work") is the same claim.

## The gate
Before any statement about the state of the work:
1. **Identify** the command that proves it (table below).
2. **Run** it in full, fresh.
3. **Read** all of the output: exit code, failure count.
4. **State** the result with the evidence. If it failed, say so with the output.

## What proves what in this repo

| Claim | Run | Not enough |
| --- | --- | --- |
| Quick checks pass | `config.verify` from `.referee/config.json` (in a Turborepo: `… --affected`) | lint passed, so the build must too |
| Full suite passes | `config.verifyFull` | the quick check |
| Bug fixed | a test that reproduces the original symptom: it fails before the fix, passes after | "I changed the line that caused it" |
| Regression test is real | write it, see it pass, revert the fix, see it **fail**, restore it, see it pass | a test that passed once |
| Ready to merge / hand over | `node .referee/scripts/method.mjs status` shows READY | your own checklist |
| Subagent finished | `git diff` shows the change, and you ran the check yourself | the subagent said "done" |
| Requirements met | re-read the task or plan and tick each line with its evidence | tests passing |
| UI works | a screenshot or recording of the real behaviour (it goes in the PR, not the repo) | "the component renders" |

## Stop signs
"should", "probably", "seems to"; "Great, done!" before running anything; committing or opening a PR without a fresh run; trusting a subagent's report; a partial run; "just this once".

## How the code backs this up
- The Stop hook (`stop-gate.mjs`) runs `config.verify` if this turn changed files and won't let you finish while it fails (up to 3 times, then you must tell the user what's broken).
- `method.mjs status` computes readiness; `ship` must run it (session rule `ship-checked-status`).
- The session rule `verify-before-pr` checks that this skill was loaded before `gh pr create`.

The hooks catch a failing check. They can't catch a claim the check never covered. That part is yours.
