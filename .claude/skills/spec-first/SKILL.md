---
name: spec-first
description: Use before building a feature or bug fix that needs tests, when the user says "spec it first" or "agree the tests", and from ship for plan-sized work. Agrees the tests with the user in plain English, then locks them.
---

# Spec first: agree the tests before the code

The user decides what "correct" means, not you. Agree it in plain English **before** writing code, write the tests from their answers, then lock them so they can't be quietly changed to pass.

## 1. Decide how many questions (0, 1–3, or at most 5)

| The request | Questions |
| --- | --- |
| Clear, small change (rename, copy, style) | **0**. Skip to step 2 and just show the list |
| Typical feature or bug fix | **1–3** |
| Big or vague feature | **At most 5**. Anything else becomes an "assumed" line |

A question is asked **only if both are true**:
1. the user might plausibly answer differently from your guess, and
2. their answer would change the code.

Everything else is a ✓ (obvious) or "assumed" line, not a question. Order questions by risk: the costliest wrong guess first.

## 2. Show the plan in plain English (no test code)

```
I'll check that:
✓ an on-time submission scores normally
✓ an empty submission scores 0
? a submission 1 second late scores…            → question 1
? a late submission with partial work scores…   → question 2
(assumed) the time limit comes from the challenge settings
```

## 3. Ask the ? lines one at a time

- Ask for an **example answer**, not approval. Ask *"A candidate submits 1 second after the limit. What should they get?"*, never *"Is this test OK?"*
- Don't suggest the answer in the question. If you must give options, give two or three neutral ones and no default.
- One question per message. Wait for the answer before the next.
- If the user says "skip" or "you decide", mark the rest as "assumed" and carry on.
- After the last question, show the final list once with the answers filled in, and ask them to fix any "assumed" line in a word.

## 4. Write the spec, then the tests, then lock them

1. Save `kb/tasks/specs/<short-name>.md`:

```markdown
# Spec — <task in the user's words>

- agreed: YYYY-MM-DD

## Checks
- [you said] late by 1 second → scores "incomplete" · test: `packages/scoring/score.test.ts` › "late by 1s is incomplete"
- [you said] late with partial work → partial work not counted · test: `packages/scoring/score.test.ts` › "late partial not counted"
- [obvious] on-time submission scores normally · test: `packages/scoring/score.test.ts` › "on time scores"
- [assumed] time limit comes from challenge settings · test: `packages/scoring/score.test.ts` › "uses challenge limit"

## Locked test files
- packages/scoring/score.test.ts
```

2. Write the tests. **The user's answers are the expected values, word for word.** Run them: each must **fail** now, before the change (red). If one passes already, it isn't testing the change. Fix the test, not the expectation.
3. Lock them: `node .referee/scripts/spec.mjs lock kb/tasks/specs/<short-name>.md`

From now on the guard blocks any edit to a locked test file, by tool or by shell.

## 5. Build

Write the code until the locked tests pass. **If a locked test looks wrong, stop and tell the user why.** Only they can unlock it, by saying "unlock the tests". Never work around the lock.

## 6. Report in plain English

Run `node .referee/scripts/spec.mjs report kb/tasks/specs/<short-name>.md` and show the result. Then add one line per check with its evidence:

```
Checked 4 things — all pass:
✓ late by 1 second → "incomplete" (you said)
✓ late with partial work → partial work not counted (you said)
✓ on-time submission scores normally
✓ time limit comes from challenge settings (assumed — say if that's wrong)
Each test failed before the change and passes now. Locked tests unchanged.
```

Never report a check as passing without the test output that shows it (see `verification-before-completion`).
