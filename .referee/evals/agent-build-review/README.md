# Eval: does agent-build-review catch what it should?

`flawed-agent/` is a small Mastra support agent with 13 planted problems. `answer-key.md` lists them. Don't show the key to the agent being tested.

Run it after any change to the skill:

1. Start a fresh agent (Agent tool, `subagent_type: general-purpose`). Tell it to follow `.claude/skills/agent-build-review/SKILL.md` in Audit mode on `.referee/evals/agent-build-review/flawed-agent/`, and not to open any other file in this folder.
2. Mark each answer-key item found or missed. Note any finding that is wrong.
3. Pass: all Critical and High items found, at least 11 of 13 in total, no wrong findings. Repeat at least twice; one run proves little.

First run (2026-11-06, claude-opus-5-5): 13/13 found, no wrong findings.
