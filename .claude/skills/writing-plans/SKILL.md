---
name: writing-plans
description: Use when a task spans several files, steps or packages and needs a plan before code — "write a plan", "plan this out", a spec to implement. Writes a task plan to kb/tasks/ that another agent could execute.
---

# Writing plans

Write the plan for an engineer who has not seen this codebase or this spec. They write idiomatic code once they know the exact interface and the exact test, and make a reasonable choice wherever the plan leaves one open. What they can't know is what you decided: which files, which names and signatures, which values from the spec, which tests prove each task. Write those down, as bite-sized tasks. DRY. YAGNI. Test first. Small commits.

**When to skip it:** a change that touches one or two files and has an obvious test. `ship` goes straight to the change.

## Where the plan lives
`kb/tasks/planned/<short-name>.md`, using the header below. When work starts, `ship` moves it to `kb/tasks/active/` (move, don't copy, and add a dated History line). This keeps plans in the same place `repo-knowledge` reads.

Before writing, read `kb/tasks/planned/` and `kb/decisions/`. A planned change elsewhere may shape this one.

## Scope check
If the spec covers several independent subsystems (in a monorepo: several packages that don't share an interface), write one plan per subsystem. Each plan must produce working, testable software on its own.

## File structure first
Map which files are created or changed and what each one is responsible for. This is where decomposition is decided.
- One clear responsibility per file. Prefer small focused files.
- Files that change together live together. Split by responsibility, not by technical layer.
- In existing code, follow the established pattern. Don't restructure unasked.
- Name the package and path exactly: "`packages/scoring/src/rubric.ts`", not "the scorer".

## Task size
A task is the smallest unit that carries its own test cycle and is worth an independent review. Fold setup, config and docs into the task whose deliverable needs them. Split only where a reviewer could reject one task while approving its neighbour.

## Plan header

```markdown
# <Feature> — plan

- goal: one sentence a new agent could act on
- done when: a check anyone can run (a test, a command, a screenshot)
- spec: <path or link>; executors read both
- related: links to decisions or other tasks

## Global constraints
The spec's project-wide requirements (versions, dependency limits, naming and copy rules), one line each, exact values copied from the spec.

## Review focus
The five inputs or failure modes the spec implies but no task's tests cover that are most likely to hurt a real user, most likely first. Then add a test for each one to the task that owns the code.

## History
- YYYY-MM-DD: planned
```

## Task format

````markdown
### Task N: <component>

**Files:** create `exact/path.ts` · modify `exact/other.ts:120-145` · test `exact/path.test.ts`
**Interfaces:** consumes <exact signatures from earlier tasks> · produces <exact names and types later tasks use>

- [ ] Write the failing test: `it("scores a timeout as incomplete")` with `expect(score(t)).toEqual({status: "incomplete"})`
- [ ] Run it: `pnpm turbo run test --filter=@evalor/scoring` → FAIL, "status is 0"
- [ ] Implement `score(attempt: Attempt): Score` in `packages/scoring/src/score.ts`
- [ ] Run it again → PASS
- [ ] Commit
````

## What a step contains
A step is done when the implementer can write exactly one reasonable thing from it: unambiguous, not complete.
- **Test step:** the test name and its assertions, with the spec's exact values.
- **Code step:** exact signature, file, and the values the spec pins. Write a body only for an algorithm the signature and test don't determine.
- **Verify step:** the command and the output that means it passed.

A plan longer than the code it describes has written the code instead. Lines that decide nothing ("TBD", "handle edge cases", "add validation") are the opposite failure.

## Self-review before handing over
1. **Coverage:** every spec requirement maps to a task. Add the missing ones.
2. **Steps:** no step decides nothing, no step is a transcript of the code.
3. **Consistency:** names and types match across tasks (`clearLayers` in Task 3 isn't `clearFullLayers` in Task 7).
4. **Review focus:** each line has its test in the owning task.
5. **Proportion:** if code blocks are most of the plan, replace bodies with signatures and assertions.

Fix inline, then hand over: give the plan's path and ask the user to confirm it before `ship` starts executing, unless they already said "full send".
