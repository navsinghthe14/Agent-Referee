# Skills — what each one does and how the code uses it

Fourteen skills in `.claude/skills/`. Eight come from the original agent-method kit, three (referee-onboard, spec-first, agent-build-review) are new; three came from Superpowers (writing-plans, verification-before-completion, receiving-code-review) and were rewritten to use this kit's paths, scripts and rules.

## How a skill gets used

There are three ways a skill comes into play, and the code checks all three:

1. **The router names it.** Every prompt goes through `.referee/scripts/hooks/route.mjs`, which matches `.referee/routing.json` (first match wins) and tells the agent "load `<skill>` before doing anything else".
2. **Its description matches.** Claude Code reads each skill's `description:` and loads the skill itself when the request fits. This is why each description starts with the trigger.
3. **Another skill calls it.** `ship` calls `writing-plans`, `verification-before-completion`, `review-loop` and `file-pr`, and `review-loop` calls `receiving-code-review`.

Then `.referee/scripts/hooks/log.mjs` records every Skill call, and `.referee/scripts/audit.mjs` grades the session against `.referee/session-rules.json` at the end of each turn. A skill that should have loaded but didn't shows up as `✗` in `.git/referee/audits/<session>.md` (shared by all worktrees).

## The flow

```
prompt ─▶ route.mjs ─▶ referee-rules (rules + map)
                           │
            ┌──────────────┼──────────────────────────────┐
            ▼              ▼                              ▼
         ship        repo-audit / repo-knowledge   agent-postmortem / method-upkeep
            │
            ├─▶ writing-plans          (multi-file work → kb/tasks/planned/)
            ├─▶ [change, test first]   ◀── guard.mjs blocks protected paths, merges, pushes to main
            ├─▶ verification-before-completion   ◀── stop-gate.mjs runs config.verify
            ├─▶ review-loop ─▶ independent-reviewer agent ─▶ receiving-code-review
            ├─▶ file-pr ─▶ gh pr create
            └─▶ method.mjs status ─▶ READY → hand over (merge only with full send + fullSendMerges)
```

## Each skill

### referee-onboard
- **Description:** Use the first time the referee runs in a repo, or when asked to "set up the referee" or "show what the referee will do here". Scans the codebase, then shows which skills apply and how, before any task starts.
- **What it does:** runs a read-only scan of the repo, then shows three tables: what it found, how each skill will work here, and what will be blocked. It asks about anything unprotected, offers a baseline week to measure the "before", and explains the daily summary.
- **How it's triggered:** automatically at the first message in a repo, or by `set up the referee` / `what will the referee do here`. On that first message `route.mjs` runs the scan itself and marks onboarding done, and the stop hook shows the user a one-line summary. In a [live test](FIELD-TEST.md) the agent skipped showing the scan, so this part no longer depends on the agent.
- **Code behind it:**
  - `scan.mjs` reads files and git only, and saves `.referee/reports/scan.md` (`--summary` prints the one-line version);
  - the checks command comes from `detect.mjs` (bun/pnpm/yarn/npm, Turborepo, Python through uv or poetry);
  - `install.sh --baseline=N` sets the observe period, and `impact.mjs` reports the before and after.

### referee-rules
- **Description:** Load first when starting any task in this repo, onboarding to it, or when an agent misbehaved. Holds the working rules and routes to the other thirteen skills.
- **What it does:** the house rules (seven judgment rules) and the map of which skill fits which situation. It also lists what the code enforces, so the agent knows it can't skip those.
- **How it's triggered:** by its description. It isn't in `routing.json`, because it's the entry point the others hang off.
- **Code behind it:** it describes all four hooks and `method.mjs`.

### ship
- **Description:** Use when the user says "full stop" or "full send", or asks you to take a fix or feature end to end. Plan if needed, change, prove, review, PR, CI green; then hands over. Merges only if the user said "full send" and the repo allows it.
- **What it does:** owns a task from the branch to a ready PR. In Full Stop mode (the default) it hands over. In Full Send mode it goes to a green PR without pausing, and merges only if `.referee/config.json` sets `"fullSendMerges": true`.
- **Router:** `full send`, `full stop`, `ship it`, `take this end to end`.
- **Code behind it:**
  - `route.mjs` sets `.referee/state/full-send` from the user's message only;
  - `guard.mjs` blocks merging and pushing to main without it, and blocks the agent from creating it;
  - session rule `ship-checked-status` requires `method.mjs status` to run after ship loads.
- **Example:** "Fix timeouts scoring as 0, full stop" → branch, test, fix, verify, review, PR, status READY, summary posted.

### writing-plans
- **Description:** Use when a task spans several files, steps or packages and needs a plan before code: "write a plan", "plan this out", a spec to implement. Writes a task plan to kb/tasks/ that another agent could execute.
- **What it does:** turns a spec into tasks. Each task names its files, exact signatures and failing tests, plus a "Review focus" list of the inputs most likely to break.
- **Router:** `write/make/draft a plan`, `implementation plan`, `plan this out`, `break this into tasks`.
- **Code behind it:**
  - it writes to `kb/tasks/planned/`, which `repo-knowledge` and `ship` read;
  - `ship` moves the plan to `active/`, then to `done/`.
- **Example:** "Write an implementation plan for rubric versioning" → `kb/tasks/planned/rubric-versioning.md` with tasks for `packages/shared-types`, the migration and the scoring service.

### spec-first
- **Description:** Use before building a feature or bug fix that needs tests, when the user says "spec it first" or "agree the tests", and from ship for plan-sized work. Agrees the tests with the user in plain English, then locks them.
- **What it does:** shows the planned checks in plain English, asks 0–5 questions one at a time (only where the user's answer could differ from the agent's guess and would change the code), asks for example answers rather than approval, writes the tests from those answers, makes sure they fail before the change, and locks them.
- **Router:** `spec it first`, `agree the tests`, `write the tests with me`. `ship` loads it at step 4.
- **Code behind it:**
  - the spec goes to `kb/tasks/specs/<name>.md`;
  - `spec.mjs lock` records a fingerprint of each agreed test file, and `guard.mjs` then blocks edits to them, by tool and by shell (`sed`, `rm`, `git checkout`…);
  - only the user can unlock them, by saying "unlock the tests" (`route.mjs`), just like "full send";
  - `spec.mjs check` and `method.mjs status` catch a locked file changed some other way;
  - session rule `spec-tests-locked` requires the lock after the skill loads.

### verification-before-completion
- **Description:** Use before saying work is done, fixed, passing or ready, before every commit, PR or hand-over, and after any subagent reports success. Run the command that proves the claim and quote its output; never claim from memory.
- **What it does:** a table of which command proves which claim in this repo, plus the red-green check for regression tests.
- **Router:** `verify it`, `prove it works`, `is it actually fixed`, `did the tests pass`. Mostly it's loaded by `ship` step 5.
- **Code behind it:**
  - `stop-gate.mjs` runs `config.verify` on any turn that changed files;
  - `method.mjs status` computes readiness;
  - session rule `verify-before-pr` requires this skill before `gh pr create`.

### review-loop
- **Description:** Use before opening a PR, or when asked for a review or second opinion on a change. Runs the independent reviewer set in .referee/config.json, at most three rounds, without growing scope.
- **What it does:** sends only the task statement and the diff to the configured reviewer, then records each finding as `fixed:`, `declined:` or `open:`.
- **Router:** `review my diff`, `second opinion`.
- **Code behind it:**
  - the reviewer is set in `.referee/config.json` (the `independent-reviewer` subagent, or a CLI for another model family);
  - it writes `.referee/reports/review-<branch>.md`, and `method.mjs status` stays red while any `open:` line remains;
  - session rule `review-before-pr` requires both this skill and the reviewer before `gh pr create`.

### receiving-code-review
- **Description:** Use when acting on review feedback from any source: the independent reviewer, a human, or GitHub PR comments ("address the review comments"). Verify each point against the code before changing anything; push back with evidence.
- **What it does:** handles each item in order: restate, verify, then fix, decline or leave open, fixing one item at a time. It's different for each source (the user, the reviewer agent, external comments), it does a YAGNI check (grep for callers), and it doesn't do performative agreement.
- **Router:** `address the review comments`, `the reviewer says…`.
- **Code behind it:**
  - it writes the same report file as `review-loop`;
  - session rule `review-feedback-handled` requires it after `review-loop`;
  - it replies to GitHub inline comments through `gh api …/replies`.

### file-pr
- **Description:** Use whenever you file, open, create or update a pull request, or write a commit message or branch name. Keeps titles and descriptions short and human-readable, with bad and good examples.
- **What it does:** checks for an existing PR, then writes a title that matches the repo's convention and a description in two parts (problem, then fix) with the evidence and the review summary.
- **Router:** `open/create/update … PR`, `commit message`, `branch name`.
- **Code behind it:** session rule `pr-uses-file-pr` requires it before `gh pr create`.

### repo-knowledge
- **Description:** Use to record or look up a decision, its reason, a plan or a lesson learned, or when files are in kb/inbox/. Keeps knowledge the code can't express in kb/ as plain text. Not for describing where code lives.
- **What it does:** files decisions in `kb/decisions/`, tasks in `kb/tasks/{planned,active,done,archived}/`, lessons in `kb/learnings/`, and sorts `kb/inbox/`.
- **Router:** `record the decision`, `ADR`, `lessons learned`, `why did we`, `kb/…`.
- **Code behind it:** the templates in `.referee/templates/`; `method-upkeep` checks the notes for staleness.

### repo-audit
- **Description:** Use when first setting up agents in a repo, when agents keep getting confused or making the same mistake, or when asked to audit CLAUDE.md or agent guidance. Runs a dumb-questions baseline and sorts every fix onto the fix ladder.
- **What it does:** works one real task with no help from the docs, logs every point of confusion, and sorts each fix by layer: code, lint, guidance or human.
- **Router:** `audit the repo`, `dumb questions`, `trim our CLAUDE.md`, `agents keep…`.
- **Code behind it:**
  - `method.mjs claude-md` flags CLAUDE.md lines that should be lint rules, tests or decisions instead;
  - the output goes to `kb/reports/` and `kb/tasks/planned/`.

### agent-postmortem
- **Description:** Use when an agent used the wrong skill, tool, command or file, skipped a step, grew scope, or repeated a mistake, and the user asks why or wants it prevented. Finds the cause and fixes it at the highest layer, with a test.
- **What it does:** writes three lines on what happened, walks through six likely causes in order, and fixes the problem at the highest layer it can. Every fix adds a check that would have caught it.
- **Router:** `why did it…`, `wrong tool`, `it keeps making…`, `postmortem`.
- **Code behind it:** its fixes land in `routing.json`, `evals/triggers.json`, `session-rules.json` or `guard.mjs`.

### method-upkeep
- **Description:** Use when asked to audit or tidy agent skills, routing, CLAUDE.md, kb/ or past sessions (did the agent call the right skills and tools?), or when a scheduled upkeep run starts. Runs exactly one named routine per invocation.
- **What it does:** six routines, one per run:
  - session audit;
  - trigger audit;
  - skill audit;
  - guidance audit;
  - knowledge staleness;
  - review history.
- **Router:** `session audit`, `skill audit`, `audit the last session`, `stale notes`.
- **Code behind it:**
  - `method.mjs audits` gives pass rates per check;
  - `eval-triggers.mjs` (add `--live` for the real CLI) tests the router.

### agent-build-review
- **Description:** Use when building, reviewing or debugging an AI agent the repo ships (its prompt, tools, memory, workflows, MCP server or evals): "review my agent", "is our agent safe". Checks it against a 15-point checklist. Not for agents working on this repo.
- **What it does:** builds, audits or debugs a product's own AI agent (a support bot, an MCP server) against 15 checks: every instruction has a tool behind it, rules and identity live in code, memory is bounded, irreversible actions wait for the user, repeats are harmless, and evals cover the risky cases. Audits report findings by severity with file and fix.
- **How it's built:** a short `SKILL.md` that maps each check to one of four files in `references/` (`core.md`, `actions.md`, `sharing.md`, `evals.md`). The agent reads only the file the job needs, so a simple chatbot review never loads the MCP material.
- **Router:** `review my agent`, `is our agent safe`, `audit our support agent's tools`, `design a customer service agent`. Everyday phrases like "travel agent booking form" route nowhere, and "why did the agent…" still goes to `agent-postmortem`.
- **Code behind it:** none of its own. Fixes it proposes land as code or evals in your product, and it hands off to `verification-before-completion` before saying an agent is fixed.
- **How it's tested:** `.referee/evals/agent-build-review/` holds a sample agent with 13 planted problems and a hidden answer key. A fresh agent audits it using only the skill. First run: 13/13 found, no wrong findings.

## Examples in simple English

One real situation for each skill: what you say, what the agent does, and what the referee checks.

**referee-onboard**
- *You say:* anything, the first time, for example "fix the login bug".
- *The agent:* the referee scans the repo, and the agent shows what it found (for example "Turborepo, 2 packages, migrations in `supabase/migrations`"), how each skill will work there, and what's not protected yet. It offers a baseline week, then fixes the bug.
- *The referee checks:* this skill loaded before the first edit of that first turn.

**referee-rules**
- *You say:* anything. This is the first thing the agent reads.
- *The agent:* learns the house rules: look at the code before changing it, keep changes small, prove things work, ask when unsure.
- *The referee checks:* nothing directly. This skill tells the agent what the other scripts will check.

**ship**
- *You say:* "The save button doesn't work on mobile. Full stop."
- *The agent:* makes a branch, reproduces the bug in a test, fixes it, runs the checks, gets a review, opens a PR, and tells you it's ready.
- *The referee checks:* that it ran `method.mjs status` before saying ready, and that it didn't merge, because you said "full stop".

**writing-plans**
- *You say:* "Write a plan for letting companies invite team members."
- *The agent:* writes `kb/tasks/planned/team-invites.md` with small steps such as "Task 1: add an `invites` table, test: an invite expires after 7 days". Then it asks you to check the plan before any code is written.
- *The referee checks:* plans go in `kb/tasks/`, where the next agent will find them.

**spec-first**
- *You say:* "Spec it first: late submissions should be handled properly."
- *The agent:* shows what it will check, then asks one question at a time: *"A candidate submits 1 second after the limit. What should they get?"* You answer "incomplete". That becomes the test. It locks the tests, then builds.
- *The referee checks:* the tests were locked after agreeing them, and blocks any edit to them. If the agent thinks a test is wrong, it has to stop and ask you.

**verification-before-completion**
- *You say:* "Is the login bug actually fixed?"
- *The agent:* runs the test that used to fail, shows it now passes, and pastes the output. It never just says "yes, it should work".
- *The referee checks:* `stop-gate.mjs` reruns your checks before the agent can finish, and the agent must load this skill before opening a PR.

**review-loop**
- *You say:* "Get a second opinion on this change."
- *The agent:* sends only the task and the code changes to a separate reviewer agent, which hasn't seen the author's reasoning. It fixes real bugs, politely declines extras nobody asked for, and stops after 3 rounds.
- *The referee checks:* the reviewer actually ran before the PR. Any finding left "open" keeps the PR marked not ready.

**receiving-code-review**
- *You say:* "Address the review comments on PR 42."
- *The agent:* checks each comment against the code before changing anything. For example: *"The reviewer wants a cache here, but nothing calls this function. Should we delete it instead?"*
- *The referee checks:* this skill ran after every review, so feedback is checked rather than blindly applied.

**file-pr**
- *You say:* "Open a PR for this."
- *The agent:* writes a title people understand, like *"Fix timeouts scoring as 0 instead of incomplete"*, not *"Refactor scoring utils"*, and a two-part description: the problem, then the fix.
- *The referee checks:* this skill loaded before every `gh pr create`.

**repo-knowledge**
- *You say:* "Record the decision to use Supabase instead of Firebase."
- *The agent:* writes `kb/decisions/0004-supabase.md` covering the options considered, what was chosen, and why.
- *The referee checks:* nothing directly. These notes are what future agents read before starting work.

**repo-audit**
- *You say:* "Audit the repo, agents keep getting lost."
- *The agent:* tries a real small task like a new hire would and writes down every confusing spot. For example: *"Two functions, `scoreSubmission` and `scoreAttempt`, do the same thing. Which one is used?"* Then it suggests a fix for each.
- *The referee checks:* the report goes in `kb/reports/`. The agent suggests fixes but doesn't make them.

**agent-postmortem**
- *You say:* "Why does it keep editing the wrong config file?"
- *The agent:* finds the cause (two config files with similar names) and fixes it at the strongest level it can: renaming the file, adding a guard, or adding a rule. It always adds a check that would have caught the mistake.
- *The referee checks:* the fix lands in a rule, test or guard, so the next session catches it.

**method-upkeep**
- *You say:* "Run the session audit."
- *The agent:* shows pass rates for the last 20 sessions. For example: *"The review-before-PR check failed 4 times. Here's the latest one, and here's a fix."*
- *The referee checks:* it runs one routine per request, so a bad run can only damage one thing.

**agent-build-review**
- *You say:* "Review my agent before we launch it."
- *The agent:* reads the agent's definition, prompt and tools, and reports, for example: *"Critical: `lookupOrder` takes `customerId` from the model, so anyone can read anyone's order. Fix: take it from the session. Medium: the prompt asks for a replacement size, but no tool does exchanges."* It ends with the missing evals and the three fixes to do first.
- *The referee checks:* the route sends the request here, not to `agent-postmortem`, and it can't say the agent is fixed without running its evals.

## How to write a description

1. **Lead with the trigger:** "Use when…" plus the phrases a user would actually type.
2. **Then say what it does,** in one clause.
3. **Then state any limit or boundary,** for example "Not for describing where code lives" or "at most three rounds".
4. **Keep it under 250 characters.** Claude Code reads it on every request to decide whether to load the skill.
5. **Avoid everyday product words** like "decision", "learning" or "plan" on their own. Pair them with a verb ("record the decision", "write a plan"), or the skill fires on feature work. `routing.json` follows the same rule, and the evals check for it.

## Adding a skill

1. Create `.claude/skills/<name>/SKILL.md` with `name` and `description` frontmatter.
2. If users ask for it in a predictable way, add a route to `.referee/routing.json`, placing specific routes above general ones.
3. Add cases to `.referee/evals/triggers.json`: at least one phrase that should route to it, and one everyday phrase that must not.
4. If it must run before some action, add a `requires_before` rule to `.referee/session-rules.json`.
5. Add it to the table in `referee-rules/SKILL.md` and to this file.
6. Run `node .referee/scripts/eval-triggers.mjs` and `node .referee/scripts/selftest.mjs`.
