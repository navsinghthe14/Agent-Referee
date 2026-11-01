# Agent Referee

**A referee for your coding agent.** It knows the rules, blows the whistle on bad moves, and keeps score.

Agent Referee is a pack you drop into any repo. It makes Claude Code follow one way of working, and it grades every session on whether it did.

- **The rules:** 11 skills that tell the agent how to plan, build, test, review and ship.
- **The whistle:** small scripts (hooks) that stop dangerous moves before they happen.
- **The score:** a report after every session showing what the agent did and which rules it broke.

**The idea in one line:** if code can check it, code checks it. Only judgment calls are left to the agent.
*Everyday version:* don't tape a "please don't touch" note on the oven. Put a lock on it.

---

## What it looks like in practice

**You ask for a fix and want to review it yourself.**
> You: "Fix the bug where timed-out tests score 0. Full stop."

The agent makes a branch, writes a test that shows the bug, fixes it, runs your checks, gets a second opinion from a separate reviewer agent, and opens a pull request. Then it stops and tells you: *"PR is ready. Here's the problem, the fix, the test output and what the reviewer said."* You press merge.

**You trust it to finish the job.**
> You: "Fix the typo on the pricing page. Full send."

Same steps, but when every check is green, the agent merges the PR itself. "Full send" lasts 6 hours, or until you say "full stop".

**The agent tries something risky.**
> Agent runs: `git push origin main`
> Referee: *Blocked. Pushing to main needs "full send". Push a branch and open a PR.*

It also blocks editing your database migrations or `.env` files, merging without permission, skipping checks with `--no-verify`, and the agent trying to switch "full send" on by itself.

**The agent says "done" but the tests fail.**
> Agent: "All fixed!"
> Referee: *`pnpm turbo run lint typecheck --affected` fails. Fix it before finishing, or tell the user exactly what is broken.*

The agent can't end its turn with broken checks. After 3 tries it has to stop and tell you what's still broken.

**You want to know if the agent followed the process.**
> You: "Audit the last session."

You get a scorecard:

| Check | Result | Evidence |
| --- | --- | --- |
| routed-skill-loaded | ✗ fail | asked to ship, but didn't load the ship skill before editing |
| review-before-pr | ✗ fail | opened a PR without the reviewer |
| verify-before-pr | ✓ pass | ran the checks before the PR |

The score comes from a log the scripts write, not from what the agent says it did. It can't fake it.

**The agent keeps making the same mistake.**
> You: "Why does it keep editing the wrong config file?"

The agent finds the cause and fixes it at the strongest level it can. For example, it might rename a confusing file, add a check, or add a rule, so the mistake gets caught next time.

---

## Install

```bash
bash agent-referee/install.sh /path/to/your-repo
```

- It adds files and never overwrites yours. It's safe to run again.
- It adds its hooks to `.claude/settings.json` and keeps your existing settings.
- It finds your check command automatically:
  - a normal Node project: `npm run lint && npm run test`;
  - a Turborepo: `pnpm turbo run lint typecheck --affected`, which checks only the packages you changed.
- On other stacks, set `"verify"` in `.referee/config.json` yourself, for example `cargo check && cargo test`.
- To update scripts from a newer version, run `bash install.sh /path/to/repo --upgrade`. Your config and rules are kept.

Commit the pack. Now everyone's Claude on the team works the same way.

**Needs:** Node 18 or newer, git, and Claude Code. The `gh` CLI is optional but needed for the pull-request steps.

---

## The 11 skills

| Skill | What it does, in plain words | You might say |
| --- | --- | --- |
| **referee** | The rulebook. Loads first and points to the right skill. | *(loads by itself)* |
| **ship** | Takes a task all the way to a ready pull request. | "Fix the save button, full stop." |
| **writing-plans** | Breaks a bigger job into small steps, each with a test, before any code is written. | "Write a plan for adding team accounts." |
| **verification-before-completion** | No "done" without proof. Runs the checks and shows the output. | "Is it actually fixed?" |
| **review-loop** | Gets a separate reviewer agent to check the change, at most 3 rounds. | "Get a second opinion on this diff." |
| **receiving-code-review** | Checks each review comment against the code before changing anything. Pushes back if the comment is wrong. | "Address the review comments on PR 42." |
| **file-pr** | Writes short, clear pull-request titles and descriptions. | "Open a PR for this." |
| **repo-knowledge** | Saves decisions, plans and lessons in `kb/`, the things the code can't explain. | "Record the decision to use Postgres." |
| **repo-audit** | Finds what confuses agents in your repo and how to fix it. | "Audit the repo, agents keep getting lost." |
| **agent-postmortem** | Works out why the agent did the wrong thing and stops it happening again. | "Why did it use the wrong tool?" |
| **method-upkeep** | Regular tidy-up: session scores, skill usage, stale notes. | "Run the session audit." |

See [SKILLS.md](SKILLS.md) for how each skill is triggered and what code backs it up.

---

## What runs, and when

| When | Script | Example |
| --- | --- | --- |
| You send a message | `route.mjs` picks the right skill | "fix the header, full stop" → tells the agent to load **ship** |
| Before every edit or command | `guard.mjs` blocks dangerous moves | `gh pr merge` without "full send" → blocked |
| After every action | `log.mjs` writes it to `.referee/logs/` | `{tool: "Skill", skill: "ship"}` |
| When the agent tries to finish | `stop-gate.mjs` scores the session and runs your checks | lint fails → the agent has to keep going |

---

## Make your own rules

Every mistake you never want to see twice can become a rule. Add it to `.referee/session-rules.json`.

**Example:** "Before editing anything in `db/`, the agent must load the migration skill."

```json
{ "id": "db-uses-migration-skill", "type": "requires_before",
  "when": { "tool": "Edit", "file": "db/**" },
  "require": [{ "tool": "Skill", "skill": "migration" }],
  "why": "Database edits follow the migration checklist." }
```

**Example:** "Never run the production seed script."

```json
{ "id": "no-prod-seed", "type": "forbid",
  "when": { "tool": "Bash", "match": "seed:prod" },
  "why": "Production data is seeded by hand." }
```

Rule types:
- `requires_before`: X must happen before Y. Add `"after": true` to mean X must happen after Y.
- `routed_skill_before_edit`: the skill the router named must load before the first edit.
- `forbid`: never do this.
- `forbid_unless_full_send`: only allowed after the user says "full send".
- `max_blocked`: fail the session if the agent keeps hitting the guard.

To protect a file from edits completely, add it to `protectedPaths` in `.referee/config.json`. For example, `"infra/**"` protects everything under `infra/`.

---

## Commands

```bash
node .referee/scripts/method.mjs status         # Is this branch ready to merge? (computed, not guessed)
node .referee/scripts/method.mjs audits         # Scores across recent sessions
node .referee/scripts/audit.mjs latest          # Score the latest session now
node .referee/scripts/method.mjs claude-md      # Which CLAUDE.md lines should be a lint rule or test instead
node .referee/scripts/eval-triggers.mjs         # Does each request go to the right skill? (also runs in CI)
node .referee/scripts/selftest.mjs              # Does the referee itself work? (37 checks, also runs in CI)
```

---

## Good to know

- **It catches mistakes. It isn't a security sandbox.** A deliberately disguised command can still get past the guard. The session score and your PR review are the backstop.
- **It only scores what it can see.** "Was the fix actually good?" still needs the reviewer, and you.
- **Logs and scores stay on your machine.** They're in `.gitignore` and never committed.
- **Windows works.** The hooks run through Node, not bash.

## Credits

Built on the original agent-method kit. The writing-plans, verification-before-completion and receiving-code-review skills are adapted from [Superpowers](https://github.com/obra/superpowers) by Jesse Vincent (MIT).
