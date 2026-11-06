---
name: agent-build-review
description: Use when building, reviewing or debugging an AI agent the repo ships (its prompt, tools, memory, workflows, MCP server or evals): "review my agent", "is our agent safe". Checks it against a 15-point checklist. Not for agents working on this repo.
---

# Agent build review

For agents that are part of the product (a support bot, a Mastra or Agent SDK agent, an MCP server), not the coding agent working on this repo. That one is `agent-postmortem`.

One principle: **anything that can be done in deterministic code, should be.** The model reads language and picks tools. Code enforces rules, does maths, controls who can see what, and gates anything that can't be undone.

## Pick a mode

| Mode | When | Do |
| --- | --- | --- |
| **Build** | A new agent, or a new capability on one | Walk the checklist in order; produce the agent definition, tools, workflow, output schema and evals |
| **Audit** | "Review my agent", "is it safe", "production ready?" | Read the agent definition, instructions, every tool, memory config, workflows and evals. Report findings by severity |
| **Debug** | The agent gave a wrong answer or asked a pointless question | Trace triage in `references/evals.md` before changing anything |

Explore first: grep for the agent definition, tool definitions (`createTool`, `tool(`, `@tool`), MCP servers and existing evals. Read the code, not a doc about it.

## The checklist: load only the reference you need

| # | Area | Reference |
| --- | --- | --- |
| 1 | Model choice: smallest that passes evals | `references/core.md` |
| 2 | Every instruction has a tool that can act on it | `references/core.md` |
| 3 | Rules, identity, maths and access live in code | `references/core.md` |
| 4 | Memory: what to send, what to keep across chats | `references/core.md` |
| 5 | Step limits and tool retry limits | `references/core.md` |
| 6 | Classifying requests, with an "unclear" option and a confidence cut-off | `references/actions.md` |
| 7 | Irreversible actions pause for the user's yes | `references/actions.md` |
| 8 | Repeat calls don't repeat the effect | `references/actions.md` |
| 9 | Structured output the UI can use | `references/actions.md` |
| 10 | Evals and trace triage | `references/evals.md` |
| 11 | Sharing tools through MCP | `references/sharing.md` |
| 12 | Reference info loaded only when needed | `references/sharing.md` |
| 13 | Code mode for bulk comparison | `references/sharing.md` |
| 14 | Confirmation from another app (elicitation, MCP apps) | `references/sharing.md` |
| 15 | Procedures as skills | `references/sharing.md` |

Areas 1–5 and 10 apply to every agent. Read `actions.md` if the agent changes anything (orders, payments, records). Read `sharing.md` only if it uses or exposes MCP, files, skills or large result sets.

## Severity

- **Critical:** another user's data can leak; an irreversible action can run without the user's yes; a policy can be talked around because it lives only in the prompt.
- **High:** identity or prices come from the model; no step limit; a mutating call can run twice.
- **Medium:** an instruction with no tool behind it; missing "unclear" option; unbounded memory; duplicated policy text.
- **Low:** vague tool descriptions; model bigger than evals justify.

## Report

1. One plain-English paragraph: what the agent does and the biggest risk.
2. Findings table: severity, issue, file:line, why it matters, fix.
3. Missing evals, written as cases (`references/evals.md` has the minimum set).
4. The three fixes to do first.

A fix that adds a rule should land in code or an eval, not only in the prompt (rule 2 in `referee-rules`). Before saying the agent is fixed, run its evals: `verification-before-completion`.
