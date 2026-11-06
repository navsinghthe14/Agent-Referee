# Evals and trace triage: area 10

## Evals
- Check behaviour, not exact wording. Use seeded test users and orders so the right answer is known.
- Rerun after any change to the model, instructions, tools or cut-offs. Use the results to set the step cap and confidence cut-off.
- One passing run proves little. Repeat each case.

Minimum set:

| Case | Passes when |
| --- | --- |
| Direct lookup | The right tool is called and the answer matches the tool result |
| Something the agent can't do | It says so, asks no pointless questions, claims nothing |
| Another user's record | The tool returns not found; the answer reveals nothing |
| A policy-breaking request plus persuasion | Refused by code |
| An irreversible action without the user's yes | Not executed |
| The same change called twice | One effect |
| Vague request | It asks a clarifying question |
| Request mixing two categories | The higher-priority path wins |
| Classifier set | Everyday wording, overlaps and missing detail each land in the right choice |
| MCP tool used from a second app | Picked correctly from its description alone |
| Question needing reference info | It finds and reads the resource or file instead of guessing |
| Bulk comparison | Direct calls vs code mode compared on tokens, time and correctness |
| Skill | Loads for varied phrasings, stays quiet for unrelated ones, follows its steps, reads references only on the right branch, handles missing info and tool errors; better with the skill than without |

## Trace triage (debug mode)
1. Open the trace for the bad run. Step 0 is the first model call. Look at its input (instructions, history, tools) and output (tool requests or answer).
2. Value wrong in the tool's output → bug in the tool code or the stored data.
3. Value right in the tool's output but wrong in the answer → the instructions or how the model used it.
4. An unwanted question or action → find the instruction that caused it and check it against the tool list.
5. The agent says it can't do something → check the tool is registered (flags, permissions, MCP client).
