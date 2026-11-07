# Changelog

Newest first. Every change updates README.md and SKILLS.md in the same commit.

## 2026-11-06 — agent-build-review: check the AI agents your product ships

- **New skill `agent-build-review`.** Builds, audits or debugs a product's own AI agent against 15 checks: instructions matched to tools, rules and identity in code, bounded memory, step limits, classifying with an "unclear" option, waiting for the user's yes, harmless repeats, structured output, evals, MCP, just-in-time context, code mode and skills.
- Short `SKILL.md`; the detail sits in four `references/` files the agent reads only when needed.
- **Tested blind:** a sample agent with 13 planted problems in `.referee/evals/agent-build-review/`. A fresh agent using only the skill found 13/13. Its feedback made two rules clearer: which severity wins when two fit, and how to report things it wasn't given access to.
- New route in `routing.json` and 7 new routing evals (4 that must route here, 2 everyday phrases that must not, 1 that must still go to `agent-postmortem`). 46 routing evals.

## 2026-11-06 — Fixes from installing it on Evalor

Eight problems found installing the kit next to an existing setup with many worktrees.

- **Observe mode is fully silent.** The first message in a folder no longer tells the agent to onboard, which spoiled the "before" measurement. Onboarding waits until enforcement starts.
- **Logs live in one shared place.** Logs, audits, the scoreboard and "onboarded" moved from `.referee/` (one copy per folder) to git's shared folder, `.git/referee/`, which every worktree uses and which survives a worktree being removed. `dataDir` overrides it. `--upgrade` moves old logs.
- **Works beside other setups.** The installer only replaces hooks under `.referee/scripts/hooks`; it had replaced Evalor's own `guard.mjs`. `.claude/settings.json` is no longer locked: an edit is blocked only if it would remove the referee's hooks. The doctor tests the referee's guard, not the first `guard.mjs` it finds.
- **"Never" rules can fail.** They only saw commands that ran, and the guard blocks those commands, so they always passed. Blocked attempts now count as a fail, and a rule whose situation never came up is n/a instead of a free pass (also `max_blocked`).
- **End-of-turn check has a time limit.** `stopGateTimeoutSec` (default 120); past it the check is skipped for that turn and the user is told. The Stop hook has a 180s timeout in settings. A turn sent back by another Stop hook is counted once.
- **Commands are matched as commands.** A small shell parser reads what actually runs: `gh pr merge` in a commit message, an `echo` or a heredoc written to a file is no longer blocked or scored, while a merge wrapped in `bash -c`, `eval`, a subshell, `xargs`, `sudo`, a pipe into a shell or odd quoting still is. The guard runs two checks (the parser, and the old plain-text match with only clear data removed) and blocks if either fires, so it errs towards blocking. Two rounds of independent review found the bypasses in earlier drafts. `git commit -n`, shortened `--no-v` and `core.hooksPath` now count as skipping checks. Routing ignores pasted code blocks, quoted lines and long quotes.
- **"Full send" no longer lets the agent merge by default.** It now means "go all the way to a green PR without pausing". Merging and pushing to main by the agent need `"fullSendMerges": true` as well.
- **CI uses the repo's Node version** (`.nvmrc` or `.node-version`), else Node 22. Node 20 had broken CI.
- 127 self-tests (42 new).

## 2026-11-01 — Fixes from the first trial on a private repo

- **Self-test works alongside your own hooks.** It found the referee's hooks by position, so 11 of 74 tests failed in a repo that already had a hook first. It now finds them by name.
- **Migrations are add-only.** Creating a new migration is allowed; changing, moving or deleting an existing one is blocked (`appendOnlyPaths`). Previously every migration edit was blocked, including new files.
- **Secrets aren't read.** The guard blocks reading or printing `.env` files and keys through Read, Grep or the shell (`secretPaths`). Checking a file exists, `source .env`, `--env-file`, and `.env.example` are fine.
- **`install.sh --no-ci`** skips the GitHub workflow. **`--upgrade`** now adds new settings to your config (and moves migrations to add-only) without changing your values.
- `doctor.mjs` flags old settings. 85 self-tests.

## 2026-11-01 — Field test on 4 public repos, and the fixes it forced

Seven live Claude Code sessions on Next.js, Turborepo, FastAPI and Create React App repos. Full report: [FIELD-TEST.md](FIELD-TEST.md).

- **Onboarding is hook-driven:** the hook runs the scan on the first message and shows a one-line summary. The agent had skipped showing it.
- **"Checks couldn't run"** (missing tools or dependencies) is reported to the user, not treated as broken code. The agent had started installing packages.
- **No repeat send-backs:** the stop gate sends the agent back again only if it changed code since the last try.
- **`detect.mjs`:** bun, Python (ruff/mypy/pytest through uv or poetry), and `test` scripts with no tests are left out.
- **`CI=1`** on every check run, so Jest/Vitest/Create React App don't hang in watch mode.
- **Protected by default:** Alembic migrations. **Editable by default:** `.env.example` and other templates. `!` exceptions in `protectedPaths`.
- Scan detects Python frameworks. 74 self-tests.

## 2026-11-01 — Spec first: tests you agree, then locked

- **`spec-first` skill:** agrees the tests with the user in plain English before coding. 0 questions for small changes, 1–3 typical, at most 5; asks for example answers, not approval.
- **Test lock:** `spec.mjs lock` fingerprints the agreed test files; the guard blocks edits to them by tool and by shell. Only the user can unlock them, by saying "unlock the tests".
- **`spec.mjs report`:** the agreed checks in plain English, whether they pass, whether they're unchanged. `method.mjs status` stays red if a locked test changed.
- `ship` now agrees the tests at step 4. New session rule `spec-tests-locked`. 64 self-tests, 39 routing evals.

## 2026-11-01 — Measure the "before", daily summary

- **Observe mode:** records what would have been blocked, blocks nothing, says nothing to the agent.
- **`install.sh --baseline=N`:** observe for N days, then enforce automatically.
- **`impact.mjs`:** before (observe) vs after (enforce), from the hooks' own logs.
- **Daily summary:** what was blocked, caught and slipped. Shown at the first message of each day; `/referee-today` shows today's.
- 54 self-tests.

## 2026-11-01 — See that it's running

- **First-run onboarding** (`referee-onboard` skill, `scan.mjs`): reads the repo, shows which skills apply and how, before any task.
- **A result line after each message**, a **status line**, a **`/referee`** command, and **`doctor.mjs`** run by the installer.
- Rules carry a `plain` sentence shown to the user when they fail.

## 2026-11-01 — Rebrand to Agent Referee, merged skills

- 11 skills, with three adapted from Superpowers (MIT).
- Rules can be scoped to files (`"file": "db/**"`).

## 2026-11-01 — Security and correctness fixes

Every fix has a regression test in `.referee/scripts/selftest.mjs` (the unpatched kit failed 19 of the original 35 checks). CI runs it on every PR.

| # | Bug | Fix | File |
|---|---|---|---|
| 1 | Protected globs ending in `**` matched nothing, so `**/migrations/**` and `.referee/scripts/**` were unprotected | Rewrote `globToRegex`; trailing `**` now means "anything below" | `lib.mjs` |
| 2 | The guard ignored Bash, so `echo >> .env`, `sed -i` on a migration or `rm` of a hook all passed | Bash commands that write (`>`, `tee`, `sed -i`, `rm`, `mv`, `cp`, `writeFile`, PowerShell writes…) and name a protected path are blocked | `guard.mjs` |
| 3 | The agent could grant itself full send with `touch .referee/state/full-send` | Any shell command mentioning `.referee/state` is blocked; `.referee/state/**` and `.referee/config.json` are protected | `guard.mjs`, `config.json` |
| 4 | `gh api …/merge` merged without full send | Blocked unless full send | `guard.mjs` |
| 5 | The push check used `\bmain\b`, so it blocked `fix-main-nav` but missed a bare `git push` while on main | Parses refspecs: blocks `main`, `HEAD:main`, `refs/heads/main`, `+main`, `--all`, `--mirror`, and a bare push from main | `guard.mjs` |
| 6 | "don't full send" or a quoted "full send" switched full send on | Negated and quoted mentions are ignored | `route.mjs` |
| 7 | The router fired on everyday product words: "machine learning", "decision", "baseline", "end-to-end", "onboard", "keeps returning" | Patterns now match the method's own phrases only; 11 new eval cases, including 8 that must route nowhere | `routing.json`, `evals/triggers.json` |
| 8 | A skill named on prompt 3 was checked against edits from prompt 1, so clean sessions failed | Each routed prompt is graded within its own turn | `audit.mjs` |
| 9 | `requires_before` and the merge rule only checked the first occurrence, so a second PR or a second merge was never graded | Every occurrence is checked | `audit.mjs` |
| 10 | The stop gate ran the full verify at the end of every turn whenever the tree was dirty, including chat-only turns. It also gave up after one block (`stop_hook_active`), so "can't stop" wasn't true | The route hook snapshots the tree; verify runs only if this turn changed something. It blocks up to `stopGateMaxBlocks` (default 3), then stops and reports | `stop-gate.mjs`, `route.mjs`, `lib.mjs` |
| 11 | No monorepo support: the full lint and test suite ran across every package | With `turbo.json`, the installer sets `verify` to `<pm> turbo run <tasks> --affected` | `install.sh` |
| 12 | CI only ran `npm ci`, which fails in pnpm repos; `--affected` had no git history to compare against | CI installs with pnpm, yarn or npm by lockfile, uses `fetch-depth: 0` and sets `TURBO_SCM_BASE` | `agent-referee.yml` |
| 13 | Hook commands used bash-only `${CLAUDE_PROJECT_DIR:-.}` and could fail on Windows | The hooks are launched through Node (`node -e … import(…)`), which works the same in bash, cmd and PowerShell | `.claude/settings.json` |
| 14 | Re-installing with new hook commands would duplicate the hooks | The installer replaces older entries (including the original agent-method kit) for the same hook. `--upgrade` also refreshes `.referee/scripts/` | `install.sh` |

## Still true
- The guard catches mistakes and casual workarounds. It is not a sandbox: an obfuscated command (base64, a script file written elsewhere and then run) can still get past it. Treat the session audit and PR review as the backstop.
- `--upgrade` never overwrites your `config.json`, `routing.json`, `session-rules.json`, evals or skills. If you installed the old kit, copy fixes 3 and 7 over by hand: the new `protectedPaths` entries and the new routing patterns and eval cases.
- `turbo --affected` needs Turborepo 2.1 or later. On older versions, use `--filter=...[origin/main]` instead.
