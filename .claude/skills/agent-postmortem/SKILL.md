---
name: agent-postmortem
description: Use when an agent used the wrong skill, tool, command or file, skipped a step, grew scope, or repeated a mistake, and the user asks why or wants it prevented. Finds the cause and fixes it at the highest layer, with a test.
---

# Agent postmortem

Agents are good at saying what went wrong and poor at choosing the fix. Trust the diagnosis, not the proposed solution.

## 1. What happened
Read the session or thread the user points to. If you can't find it, ask for the exact prompt; don't reconstruct it. Write three lines: what was asked, what the agent did, what it should have done.

## 2. Why: check in this order, stop at the first that explains it
1. The router (`.referee/routing.json`) sent the request nowhere or to the wrong skill. Add the prompt to `.referee/evals/triggers.json` and run `node .referee/scripts/eval-triggers.mjs`.
2. A skill's description didn't match the request.
3. A skill named the wrong tool or command, or said it vaguely ("if available", "a subagent or CLI").
4. Two skills overlapped and the wrong one won.
5. The code itself was confusing: two paths that do the same thing, misleading names, a stale map.
6. The step was lost in a long plan or after compaction.

## 3. Fix at the highest layer
| Layer | Example |
| --- | --- |
| Code | Merge the two auth paths into one; rename the misleading module |
| Hook or lint | Block the edit in `guard.mjs`; add a lint rule |
| Test or eval | A new case in `.referee/evals/triggers.json` |
| Router | A new pattern in `.referee/routing.json` |
| Skill text | Name the exact tool: "Agent tool, `subagent_type: independent-reviewer`" |

Every fix must add a check or test that would have caught this failure. If it can't, say why.

## 4. Report
Three lines: what happened, why, and the fix with its layer.
