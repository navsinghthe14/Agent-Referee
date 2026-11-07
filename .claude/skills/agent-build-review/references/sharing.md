# Sharing and context: areas 11–15

Read this only if the agent uses or exposes MCP, files, skills, or large result sets.

## 11. Sharing tools through MCP
- Put a capability other apps need (lookup, search, a workflow) behind an MCP server instead of rebuilding it per app. The server wraps the existing service; the data stays where it is.
- The tool description must make sense alone: what it returns, whose data, when to use it. Other apps see only the name, the description and the input and output schemas. Flag a bare name like `get_order` with a thin description.
- The output schema includes an explicit not-found result.
- Access rules stay in the service. On a shared or remote server, identity comes from verified sign-in on the server, never from a tool argument.
- Two registrations are needed: on the server (exposes the tool) and in the agent's client (gives it to the model). When a call fails, follow it: model → client → server → service → back.
- Remote servers run over HTTPS. Localhost is for development.

## 12. Reference info, loaded only when needed
- Keep the instructions short. Policies and guides go in MCP resources or files that the agent finds and reads when a question needs them.
- Build reference text from the source the code uses (the return-policy text generated from the same rules as the eligibility check). Flag a second, hand-kept copy.
- The agent needs list and read tools for resources. Publishing a resource doesn't put it in the model's context.
- File access: one folder, read-only unless writing is needed, a short description of what's in it (not every file), and the files mounted wherever the agent is deployed. Check how the framework enforces the boundary.

## 13. Code mode for bulk comparison
- When the model would otherwise read and compare many results (catalogue searches, combinations, totals), let it write a short program that calls the same tools in a sandbox with no file or network access, and returns only the chosen results.
- One course benchmark (one task, three runs each): about 96% fewer tokens, about 72% faster, and correct more often. That's one task, not a rule. Simple lookups stay as direct calls. Compare both on your own task for tokens, time and correctness; code that runs isn't necessarily right.

## 14. Confirmation from another app
- **Elicitation:** the server asks the client app to collect a structured answer (confirm or decline) and resumes the saved workflow with it. Carry the workflow run ID so the answer resumes the right run.
- **MCP apps:** the server ships its own small interface (a `ui://` resource shown in a sandboxed frame) when you need your own layout or branding. A button click calls a decision tool with a reference to the saved proposal, so the user decides, not the model. The server checks the reference and resumes the workflow.
- Either way, the workflow and database own the process. The other app only collects the answer.

## 15. Procedures as skills
- Package a multi-step procedure (which tools, in what order, how to branch) as a skill: `SKILL.md` plus a `references/` folder.
- The description is the trigger. Write it in the user's words ("didn't arrive", "missing from the box"), not internal terms.
- Name the tool for each step and call out traps. Example: match the missing item to its own shipment, not to the other parcel that was delivered.
- Progressive disclosure: name and description are always visible → `SKILL.md` loads when the request matches → a reference file loads only when that branch needs it. Keep rare branches out of `SKILL.md`.
- Skills can also be shared over MCP.
