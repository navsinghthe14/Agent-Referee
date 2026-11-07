<div align="center">

# ⚖ Agent Referee

### Your coding agent said "All done! ✅"
### It wasn't.

**Agent Referee makes Claude Code prove its work, blocks the moves you'd regret, and scores every session.**
Not with more prompts. With code it can't talk its way past.

![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat-square)
![Works with Claude Code](https://img.shields.io/badge/works%20with-Claude%20Code-orange?style=flat-square)
![Self-tests](https://img.shields.io/badge/self--tests-127%2F127%20passing-brightgreen?style=flat-square)
![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen?style=flat-square)
![Windows · macOS · Linux](https://img.shields.io/badge/os-windows%20%C2%B7%20macos%20%C2%B7%20linux-lightgrey?style=flat-square)

</div>

## 📊 The impact, measured

| | |
| :---: | --- |
| **100%** | of the risky moves in our test suite are **blocked**: 62 of 62, including pushing to `main`, merges hidden inside `bash -c`, `eval` or a subshell, changing existing migrations, writing or **reading `.env` and keys**, merging without permission, `--no-verify`, the agent switching on "full send" by itself, removing the referee's hooks from `.claude/settings.json`, and **rewriting tests you agreed so they pass** |
| **0%** | false alarms on the 18 everyday actions we tested, like pushing a feature branch, **adding a new migration**, reading and editing `.env.example`, loading `.env` into a command, editing other tools' settings, a commit message that mentions `gh pr merge`, running your checks and editing ordinary code |
| **100%** | of sessions get a **score you can see**, after every single message |
| **0** | turns can end with your checks failing. The agent has to fix them or tell you exactly what's broken |
| **0 sec** | added to chat-only turns. Checks run only when code changed, and in a monorepo only for the packages you touched |
| **5 of 7** | live Claude Code sessions on [4 public repos](FIELD-TEST.md) (Next.js, Turborepo, FastAPI, React) went the way they should. The other 2 exposed real bugs, which we fixed; both passed when re-run |
| **54%** | of these protections **silently failed** in our own first version, agent-method (19 of 35 checks). That's why every rule here has a test |

<sub>Measured by <code>node .referee/scripts/selftest.mjs</code> (127 checks) and <code>eval-triggers.mjs</code> (39 cases), which run in CI on every PR. Run them yourself. To measure the impact on <b>your</b> repo, install with <code>--baseline=7</code>: the referee watches for a week without blocking anything, then switches on, and <code>impact.mjs</code> shows your before and after.</sub>

<div align="center">

[Quick start](#-quick-start-60-seconds) · [What you'll see](#-what-youll-see) · [The 13 skills](#-the-12-skills) · [Why it's different](#-why-its-different) · [FAQ](#-faq)

</div>

---

## 😬 Sound familiar?

- The agent says **"All tests pass!"** You run them. They don't.
- It **pushed straight to `main`**.
- It **"fixed" a migration** that was already applied in production.
- It ran `git commit --no-verify` to **skip the check that was failing**.
- You asked for a one-line fix and got **400 lines and a new abstraction**.
- It made **the same mistake as last week.** And the week before.

You've added rules to `CLAUDE.md`. In capital letters. It still happens, because **a rule in a prompt is a suggestion.**

## ⚖ Agent Referee turns suggestions into rules.

> Don't tape a "please don't touch" note on the oven. **Put a lock on it.**

| | Without a referee | With Agent Referee |
| --- | --- | --- |
| "All tests pass!" | You find out later | It can't finish the turn while your checks fail |
| `git push origin main` | Done before you notice | **Blocked:** "Pushing to main is the human's call. Push a branch and open a PR." |
| Changing an existing migration | Silent | **Blocked,** by tool *and* by shell. New migrations are fine |
| Printing your `.env` secrets | Silent, and now in the transcript | **Blocked.** `.env.example` is fine |
| "Ready to merge" | Its opinion | Computed: branch, checks, review, PR, CI |
| Did it follow your process? | No idea | **A score after every message** |
| Same mistake twice | Add another line to CLAUDE.md | Becomes a rule that's graded forever |

---

## 🚀 Quick start (60 seconds)

```bash
git clone https://github.com/navsinghthe14/Agent-Referee agent-referee
bash agent-referee/install.sh /path/to/your-repo
```

The installer checks itself before you open Claude Code:

```
⚖ Agent Referee — doctor

  ✓ Node 22
  ✓ Hooks registered in .claude/settings.json — 4 of 4
  ✓ Status line — shows "⚖ Referee on" at the bottom of Claude Code
  ✓ Skills — 13 found
  ✓ Checks command (verify) — pnpm turbo run typecheck lint --affected
  ✓ Live test: guard blocks a push to main — blocked as expected

✓ The referee is on.
```

Then open Claude Code in your repo and **send any message.** That's it.

> **No config needed.** It finds your checks command by itself: `npm`/`pnpm`/`yarn`/`bun` scripts, `turbo --affected` in a monorepo, and `ruff`/`mypy`/`pytest` for Python (through `uv` or `poetry`). It skips a `test` script that has no tests yet, and runs everything with `CI=1` so test runners don't hang in watch mode.

**Don't want a GitHub workflow added?** Add `--no-ci`. **Upgrading?** Run it again with `--upgrade`: it adds new settings to your config without changing yours.

**Want proof it helps before you rely on it?** Add `--baseline=7`. For a week the referee only watches, then it switches on by itself, and you get your own before-and-after. [How it works ↓](#6-your-own-before-and-after)

---

## 👀 What you'll see

### 1. Its first move is to read your repo

On the first message, the referee looks around **before touching anything** and shows you what it found:

```
⚖ Agent Referee — first look at this repo

What I found
  Monorepo     Turborepo, 2 packages: apps/web, packages/scoring
  Frameworks   Next.js, Supabase, Vitest
  Migrations   supabase/migrations
  Branch       feature

How the referee will work here
  ship            Branch → test → fix → run `pnpm turbo run typecheck lint --affected` → review → PR
  writing-plans   Multi-package changes get a plan in kb/tasks/ first, naming packages like apps/web
  file-pr         Titles match your style, e.g. "Fix timeouts scoring as 0"
  ...

What the referee will block here
  - Changing existing migrations in supabase/migrations (new ones are fine)
  - Editing or reading .env files (.env.example is fine)
  - Merging, or pushing to main (agents never merge unless you switch that on)
  - ⚠ Not protected yet: infra. Want it protected?
```

Every line is read from **your** repo. It doesn't guess. The hook runs this scan itself and shows you a one-line summary after your first message, so it's never skipped:

```
⚖ Referee scanned this repo: Turborepo, 13 packages · Next.js, React, Drizzle · checks: pnpm turbo run typecheck lint --affected · ⚠ not protected: .github/workflows
```

The agent also shows you the full tables. It then asks once whether you'd like to [measure your "before"](#6-your-own-before-and-after) first, and carries on with what you asked for.

### 2. A score after every message

```
⚖ Referee · 6/6 ✓ · checks ✓
```

When something's off, you hear about it in plain English:

```
⚖ Referee · 4/6 · checks ✓ · ✗ opened a PR without an independent review (+1 more) · say /referee for details
```

### 3. A status line that's always on

```
⚖ Referee on · FULL STOP · 6/6 ✓ · checks ✓
```

You always know it's running and what mode it's in. In full send you'll see `FULL SEND (5h 12m left)`, so you never forget.

### 4. `/referee` for the full scorecard

```
Mode:    FULL STOP (the agent stops at a ready PR; you press merge)
Checks:  `pnpm turbo run typecheck lint --affected`
This session: 4/6
  ✗ The agent opened a PR without an independent review.
  ✗ The agent said it was ready without running the readiness check.

Across 23 sessions: repeated failures: review-before-pr ×3.
Say "why does it keep doing this?" to fix the cause.
```

> 💡 **The score comes from a log the scripts write, not from what the agent says.** It can't claim it ran the reviewer if it didn't.

### 5. A daily summary of how it helped

At your first message each day, you see yesterday's summary. `/referee-today` shows today's so far:

```
⚖ Referee — 2026-11-04

Today the referee stopped 3 risky moves and sent the agent back 2 times
to fix failing checks before it finished.

  Blocked          2× push to main, 1× edit a protected file
  Process slips    The agent opened a PR without an independent review.
```

### 6. Your own before and after

Not sure it's worth it? Measure it on your repo first:

```bash
bash agent-referee/install.sh /path/to/your-repo --baseline=7
```

For 7 days the referee **only watches**. Nothing is blocked, and it records every risky move it would have stopped. Then it switches on by itself. After a week of each, run `node .referee/scripts/impact.mjs`:

```
|                                         | Before (observe) | After (enforce) |
| Turns that ended with your checks failing | 9 of 31 (29%)   | 0 of 28 (0%)    |
| Risky moves the agent tried              | 4 (none stopped) | 3 (all stopped) |
```

<sub>Example output, not real data. Yours comes from your own sessions.</sub>


### 7. Tests you agree, not tests you accept

Agents write tests that agree with their own code, and people approve them without reading. So before building a feature or fix, the referee asks **you** what "correct" means, in plain English, one question at a time:

```
I'll check that:
✓ an on-time submission scores normally
✓ an empty submission scores 0
? A candidate submits 1 second after the limit. What should they get?
(assumed) the time limit comes from the challenge settings
```

- **0 questions** for a small, clear change; **1–3** for a typical feature or fix; **never more than 5**. It only asks when your answer could differ from its guess *and* would change the code.
- It asks for **an example answer**, not "is this test OK?", so there's nothing to rubber-stamp. Your answers become the expected values.
- Then it **locks the tests.** If the agent tries to edit them to make them pass:

```
Referee: Blocked. tests/score.test.ts holds tests you agreed with the user.
Fix the code, or stop and tell the user why the test looks wrong.
```

Only you can unlock them, by saying **"unlock the tests"**. When it's done, you get the report in plain English: every agreed check, whether it passes, and whether the tests are unchanged since you agreed them.

---

## 🎮 Two words control it

| You say | What happens |
| --- | --- |
| **"Fix the login bug. Full stop."** | Branch → failing test → fix → checks → independent review → PR. **Then it stops.** You press merge. *(This is the default.)* |
| **"Fix the typo. Full send."** | Same steps without pausing to ask, up to a green PR. **Merging stays with you** unless your repo sets `"fullSendMerges": true`; then it merges itself when everything is green. It lasts 6 hours, or until you say "full stop". |

The agent **can't switch "full send" on by itself.** If it tries `touch .referee/state/full-send`, the referee blocks it, and there's a test that proves it.

---

## 🧠 The 13 skills

| Skill | What it does | Say |
| --- | --- | --- |
| **referee-onboard** | Reads your repo first and shows how everything below will work in it | *(automatic on first run)* |
| **referee-rules** | The rulebook. Loads first and points to the right skill | *(automatic)* |
| **ship** | Takes a task all the way to a ready PR | "Fix X, full stop." |
| **writing-plans** | Bigger jobs get a plan of small, tested steps before any code | "Write a plan for team accounts." |
| **spec-first** | You decide what "correct" means: it asks 0–5 plain-English questions, writes the tests from your answers, and locks them | "Spec it first: late submissions." |
| **verification-before-completion** | No "done" without proof. Shows the real output | "Is it actually fixed?" |
| **review-loop** | A *separate* agent reviews the change, max 3 rounds, no scope creep | "Second opinion on this diff." |
| **receiving-code-review** | Checks each review comment against the code and pushes back when it's wrong | "Address the review comments." |
| **file-pr** | PR titles humans can read: *"Fix timeouts scoring as 0"*, not *"Refactor utils"* | "Open a PR." |
| **repo-knowledge** | Saves the *why* (decisions, lessons) to `kb/`, where future agents read it | "Record the decision to use Postgres." |
| **repo-audit** | Finds what confuses agents in your repo and how to fix it | "Audit the repo." |
| **agent-postmortem** | "Why does it keep doing that?" Finds the cause and adds a rule so it can't happen again | "Why did it use the wrong tool?" |
| **method-upkeep** | Scores across sessions, unused skills, stale notes | "Run the session audit." |

Examples for every skill, in plain English: **[SKILLS.md](SKILLS.md)**

---

## 💡 Why it's different

Most skill packs are **prompts that hope the model complies.** Agent Referee is a referee:

| | Prompt-only skill packs | Agent Referee |
| --- | --- | --- |
| Knows the rules | ✓ | ✓ 13 skills |
| **Blows the whistle** (blocks bad moves) | ✗ | ✓ 4 hooks, in plain Node |
| **Keeps score** (grades the session) | ✗ | ✓ every message |
| Learns from mistakes | Write more prompt | Each mistake becomes a graded rule |
| Tested | Rarely | **127 self-tests + 39 routing evals, run in CI** |

**The philosophy:** if code can check it, code checks it. Only judgment calls are left to the agent.

---

## 🛠 Make it yours

**Turn any mistake into a rule.** For example, "never run the production seed script":

```json
{ "id": "no-prod-seed", "type": "forbid",
  "plain": "ran the production seed script",
  "when": { "tool": "Bash", "match": "seed:prod" },
  "why": "Production data is seeded by hand." }
```

Add it to `.referee/session-rules.json`. From then on, every session is graded on it, and if it breaks, you see *"✗ ran the production seed script"* after the message.

**Lock a folder completely:** add `"infra/**"` to `protectedPaths` in `.referee/config.json`.

<details>
<summary><b>All rule types</b></summary>

- `requires_before`: X must happen before Y. Add `"after": true` to mean X must happen after Y. You can scope by command (`"match"`) or by file (`"file": "db/**"`).
- `routed_skill_before_edit`: the skill the router named must load before the first edit.
- `forbid`: never do this. A blocked attempt counts as a fail too; if it never came up, the rule is n/a, not a pass.
- `forbid_unless_full_send`: only allowed after the user says "full send". Same scoring as `forbid`.
- `max_blocked`: fail the session if the agent keeps hitting the guard (n/a when nothing was blocked).

Command matches (`"match": "gh pr create"`) look at commands that run, not text: a commit message, an `echo` or a heredoc that mentions the command doesn't count.

</details>

<details>
<summary><b>All commands</b></summary>

```bash
node .referee/scripts/doctor.mjs           # Is the referee installed and working?
node .referee/scripts/scan.mjs             # Re-run the first look at the repo
node .referee/scripts/report.mjs           # What /referee shows
node .referee/scripts/method.mjs status    # Ready to merge? (computed, not claimed)
node .referee/scripts/method.mjs audits    # Scores across recent sessions
node .referee/scripts/impact.mjs           # Before (observe) vs after (enforce)
node .referee/scripts/daily.mjs            # Today's summary (also /referee-today)
node .referee/scripts/spec.mjs report <spec> # Agreed tests in plain English, and whether they still pass
node .referee/scripts/spec.mjs check       # Are all agreed tests unchanged?
node .referee/scripts/method.mjs claude-md # Which CLAUDE.md lines should be a lint rule or test instead
node .referee/scripts/eval-triggers.mjs    # Does each request route to the right skill?
node .referee/scripts/selftest.mjs         # Does the referee itself work?
```

</details>

<details>
<summary><b>Settings</b> (<code>.referee/config.json</code>)</summary>

| Setting | Default | What it does |
| --- | --- | --- |
| `verify` | auto-detected | Quick checks run before the agent can finish |
| `verifyFull` | auto-detected | Full suite, used for "ready to merge" and CI |
| `protectedPaths` | `.env*`, referee scripts and config | Paths the agent can't edit. Start a pattern with `!` for an exception: `.env.example` and other templates stay editable by default |
| `appendOnlyPaths` | `**/migrations/**`, `**/alembic/versions/**` | New files may be added; existing ones can't be changed, moved or deleted |
| `secretPaths` | `.env*`, `*.pem`, `*.key` (not `.env.example`) | Never read, so secrets don't end up in the agent's context or transcript. Checking a file exists, and loading it into a command (`source`, `--env-file`), are fine |
| `mainBranch` | `main` | The branch only humans push to (or the agent, with `fullSendMerges`) |
| `fullSendHours` | `6` | How long "full send" lasts |
| `fullSendMerges` | `false` | `true` lets the agent merge and push to main after the user says "full send" |
| `stopGateTimeoutSec` | `120` | Longest the end-of-turn check may run; past it, the check is skipped for that turn and the user is told |
| `dataDir` | `.git/referee` | Where logs, audits and the scoreboard live. Shared by all worktrees and kept when one is removed |
| `stopGateMaxBlocks` | `3` | Retries on failing checks before it must stop and tell you |
| `showResultsEachMessage` | `true` | The result line after each message |
| `mode` | `enforce` | `observe` = watch and record only, block nothing |
| `baselineUntil` | none | Observe until this date, then enforce. Set by `--baseline=N` |
| `reviewer` | `independent-reviewer` subagent | Or a CLI, to review with a different model family |

</details>

<details>
<summary><b>Already have a status line?</b></summary>

The installer never replaces yours. To show both, set `statusLine.command` in `.claude/settings.json` to `<your command>; node .referee/scripts/statusline.mjs`.

</details>

---

## ❓ FAQ

**Will it slow me down?**
Checks run only when a turn actually changed code, and in a monorepo only for the packages you touched. Chat-only turns cost nothing.

**Has it been tested on real code?**
Yes: [FIELD-TEST.md](FIELD-TEST.md) has 7 live Claude Code sessions on 4 public repos (Next.js + Prisma, a Turborepo, FastAPI + React, Create React App), what went wrong and what we fixed. It doesn't replace real users: that's what `--baseline=7` is for.

**What if my checks can't run (dependencies not installed)?**
The referee says "checks couldn't run" and lets the agent finish. It doesn't send the agent back to "fix" it, so the agent won't start installing packages on its own.

**My repo already has hooks. Will it clash?**
No. The installer adds its hooks next to yours and leaves yours in place. The self-test finds the referee's hooks by name, wherever they sit.

**Is it a security sandbox?**
No, and we won't pretend it is. It stops mistakes and casual workarounds. A deliberately disguised command could still get past it, and the agent could still print a secret through a program it writes (for example a script that prints environment variables). The score and your PR review are the backstop.

**Does it phone home?**
No. There are zero dependencies and no network calls. Logs and scores stay on your machine and are git-ignored.

**Windows?**
Yes. The hooks run through Node, not bash.

**Can my whole team use it?**
Commit the pack. Everyone's agent then follows the same process, and everyone sees the same score.

**What happens during the baseline week?**
Nothing is blocked and the agent is told nothing, not even on the first message in a folder, so it behaves as it would without the referee. Onboarding waits until the referee switches on. That also means nothing is protected that week, so turn on GitHub branch protection for `main` first.

**Does it work beside my own hooks?**
Yes. The installer only replaces the referee's own hooks (those under `.referee/scripts/hooks`), so your guard and other hooks stay. `.claude/settings.json` isn't locked: the agent can edit it, except for an edit that would remove the referee's hooks. The doctor tests the referee's own guard, not the first `guard.mjs` it finds.

**I use many worktrees. Where do the logs go?**
Into git's shared folder (`.git/referee/`), which every worktree uses and which survives a worktree being removed. Onboarding runs once per repository, not once per folder. `install.sh --upgrade` moves old logs from `.referee/logs/` there.

**Can I remove it?**
Delete `.referee/`, `.git/referee/`, the 13 skill folders in `.claude/skills/` (listed in [SKILLS.md](SKILLS.md)), `.claude/commands/referee.md` and `referee-today.md`, `.claude/agents/independent-reviewer.md`, and the hooks and `statusLine` entries in `.claude/settings.json`.

---

<div align="center">

### Your agent is fast. Make it honest.

**[⭐ Star it](../../stargazers)** if your agent has ever said "done" when it wasn't.
Then **share your first scorecard.** Everyone's first one is humbling. 😅

</div>

---

<sub><a href="LICENSE">MIT licensed</a> · © 2026 Navneet Singh. Built with Claude. The writing-plans, verification-before-completion and receiving-code-review skills are adapted from <a href="https://github.com/obra/superpowers">Superpowers</a> by Jesse Vincent (MIT); see <a href="THIRD_PARTY_NOTICES.md">THIRD_PARTY_NOTICES.md</a>.</sub>
