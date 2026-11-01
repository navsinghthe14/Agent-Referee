<div align="center">

# ⚖ Agent Referee

### Your coding agent said "All done! ✅"
### It wasn't.

**Agent Referee makes Claude Code prove its work, blocks the moves you'd regret, and scores every session.**
Not with more prompts. With code it can't talk its way past.

![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat-square)
![Works with Claude Code](https://img.shields.io/badge/works%20with-Claude%20Code-orange?style=flat-square)
![Self-tests](https://img.shields.io/badge/self--tests-44%2F44%20passing-brightgreen?style=flat-square)
![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen?style=flat-square)
![Windows · macOS · Linux](https://img.shields.io/badge/os-windows%20%C2%B7%20macos%20%C2%B7%20linux-lightgrey?style=flat-square)

</div>

## 📊 The impact, measured

| | |
| :---: | --- |
| **100%** | of the risky moves in our test suite are **blocked**: 21 of 21, including pushing to `main`, editing migrations, writing `.env`, merging without permission, `--no-verify`, and the agent switching on "full send" by itself |
| **0%** | false alarms on the everyday commands we tested: pushing a feature branch, reading `.env`, running your checks |
| **100%** | of sessions get a **score you can see**, after every single message |
| **0** | turns can end with your checks failing. The agent has to fix them or tell you exactly what's broken |
| **0 sec** | added to chat-only turns. Checks run only when code changed, and in a monorepo only for the packages you touched |
| **54%** | of these protections **silently failed** in the agent kit this project started from (19 of 35 checks). That's why every rule here has a test |

<sub>Measured by <code>node .referee/scripts/selftest.mjs</code> (44 checks) and <code>eval-triggers.mjs</code> (35 cases), which run in CI on every PR. Run them yourself. To see the impact on <b>your</b> team, run <code>node .referee/scripts/method.mjs audits</code> after a week: it shows the pass rate for every rule across your sessions.</sub>

<div align="center">

[Quick start](#-quick-start-60-seconds) · [What you'll see](#-what-youll-see) · [The 12 skills](#-the-12-skills) · [Why it's different](#-why-its-different) · [FAQ](#-faq)

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
| `git push origin main` | Done before you notice | **Blocked:** "Pushing to main needs 'full send'." |
| Editing `migrations/` | Silent | **Blocked,** by tool *and* by shell |
| "Ready to merge" | Its opinion | Computed: branch, checks, review, PR, CI |
| Did it follow your process? | No idea | **A score after every message** |
| Same mistake twice | Add another line to CLAUDE.md | Becomes a rule that's graded forever |

---

## 🚀 Quick start (60 seconds)

```bash
git clone https://github.com/<you>/agent-referee
bash agent-referee/install.sh /path/to/your-repo
```

The installer checks itself before you open Claude Code:

```
⚖ Agent Referee — doctor

  ✓ Node 22
  ✓ Hooks registered in .claude/settings.json — 4 of 4
  ✓ Status line — shows "⚖ Referee on" at the bottom of Claude Code
  ✓ Skills — 12 found
  ✓ Checks command (verify) — pnpm turbo run typecheck lint --affected
  ✓ Live test: guard blocks a push to main — blocked as expected

✓ The referee is on.
```

Then open Claude Code in your repo and **send any message.** That's it.

> **No config needed.** It finds your checks command by itself: `npm`/`pnpm`/`yarn` scripts, or `turbo --affected` in a monorepo.

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
  - Edits to **/migrations/** (covers supabase/migrations) and .env files
  - Merging, or pushing to main, unless you say "full send"
  - ⚠ Not protected yet: infra. Want it protected?
```

Every line is read from **your** repo. It doesn't guess.

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

You always know it's running and what mode it's in. If you've let it merge, you'll see `FULL SEND (5h 12m left)`, so you never forget.

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

---

## 🎮 Two words control it

| You say | What happens |
| --- | --- |
| **"Fix the login bug. Full stop."** | Branch → failing test → fix → checks → independent review → PR. **Then it stops.** You press merge. *(This is the default.)* |
| **"Fix the typo. Full send."** | Same steps, but when everything is green **it merges itself.** It lasts 6 hours, or until you say "full stop". |

The agent **can't switch "full send" on by itself.** If it tries `touch .referee/state/full-send`, the referee blocks it, and there's a test that proves it.

---

## 🧠 The 12 skills

| Skill | What it does | Say |
| --- | --- | --- |
| **referee-onboard** | Reads your repo first and shows how everything below will work in it | *(automatic on first run)* |
| **referee-rules** | The rulebook. Loads first and points to the right skill | *(automatic)* |
| **ship** | Takes a task all the way to a ready PR | "Fix X, full stop." |
| **writing-plans** | Bigger jobs get a plan of small, tested steps before any code | "Write a plan for team accounts." |
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
| Knows the rules | ✓ | ✓ 12 skills |
| **Blows the whistle** (blocks bad moves) | ✗ | ✓ 4 hooks, in plain Node |
| **Keeps score** (grades the session) | ✗ | ✓ every message |
| Learns from mistakes | Write more prompt | Each mistake becomes a graded rule |
| Tested | Rarely | **44 self-tests + 35 routing evals, run in CI** |

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
- `forbid`: never do this.
- `forbid_unless_full_send`: only allowed after the user says "full send".
- `max_blocked`: fail the session if the agent keeps hitting the guard.

</details>

<details>
<summary><b>All commands</b></summary>

```bash
node .referee/scripts/doctor.mjs           # Is the referee installed and working?
node .referee/scripts/scan.mjs             # Re-run the first look at the repo
node .referee/scripts/report.mjs           # What /referee shows
node .referee/scripts/method.mjs status    # Ready to merge? (computed, not claimed)
node .referee/scripts/method.mjs audits    # Scores across recent sessions
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
| `protectedPaths` | `.env*`, `**/migrations/**`, referee files | Paths the agent can't edit |
| `mainBranch` | `main` | The branch that needs "full send" |
| `fullSendHours` | `6` | How long "full send" lasts |
| `stopGateMaxBlocks` | `3` | Retries on failing checks before it must stop and tell you |
| `showResultsEachMessage` | `true` | The result line after each message |
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

**Is it a security sandbox?**
No, and we won't pretend it is. It stops mistakes and casual workarounds. A deliberately disguised command could still get past it. The score and your PR review are the backstop.

**Does it phone home?**
No. There are zero dependencies and no network calls. Logs and scores stay on your machine and are git-ignored.

**Windows?**
Yes. The hooks run through Node, not bash.

**Can my whole team use it?**
Commit the pack. Everyone's agent then follows the same process, and everyone sees the same score.

**Can I remove it?**
Delete `.referee/` and `.claude/skills/referee-*`, and remove the hooks from `.claude/settings.json`.

---

<div align="center">

### Your agent is fast. Make it honest.

**[⭐ Star it](../../stargazers)** if your agent has ever said "done" when it wasn't.
Then **share your first scorecard.** Everyone's first one is humbling. 😅

</div>

---

<sub>MIT licensed. The writing-plans, verification-before-completion and receiving-code-review skills are adapted from <a href="https://github.com/obra/superpowers">Superpowers</a> by Jesse Vincent (MIT); see <a href="THIRD_PARTY_NOTICES.md">THIRD_PARTY_NOTICES.md</a>. Built on the original agent-method kit.</sub>
