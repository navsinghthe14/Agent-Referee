# Actions: areas 6–9

Read this when the agent changes anything: orders, payments, bookings, records.

## 6. Classify before acting
- For a fixed set of options (issue type, frustration level, "is this a refund request?"), use a classifier that returns a choice, probabilities and a confidence. A dedicated decision model or a small LLM with structured output both work; pick by accuracy, speed and cost on your own test set.
- Always include an **unclear** option, so it isn't forced to pick between explanations the user never gave.
- Write choices that exclude each other. Example: "fit" explicitly excludes any reported defect, so "too tight and the sole came off" goes to the defect path.
- Validate the answer (a known choice, numbers between 0 and 1) before acting. If it fails, stop.
- Code branches on it: unclear or low confidence → ask the user; risky category → a person reviews; otherwise → proceed. Set the cut-off (for example 0.8) from evals. Confident is not the same as correct.
- Three question shapes: a **choice** (category), a **score** (levels such as calm 0 / frustrated 1 / angry 2, with the top level escalating), a **yes/no probability** (code sets the cut-off).

## 7. Irreversible actions wait for the user
- Any tool that changes something (exchange, refund, delete, send, charge) runs inside a workflow step that pauses, saves the proposal, and resumes only with the user's explicit decision. An instruction saying "ask first" is not a gate.
- Decline stops. Confirm lets the service try, and the service checks again.
- Like a shop's "Place your order" button: everything before it is only a basket.

## 8. Repeats are harmless (idempotency)
- Every change carries a request ID that code creates and saves. The model doesn't remember it. A repeat call with the same ID returns the saved result.
- Assume the model may call twice and tools may retry on their own.

## 9. Structured output
- If a website or app shows the answer, define a schema (for example Zod) from what the screen must show or do next: a `status` list (`awaiting_confirmation`, `completed`, `referred`, `ineligible`, `needs_clarification`), a `message`, IDs that may be null, and amounts.
- Each field's description says what it means and where its value comes from, not only its type. Export the schema for the code that calls the agent.
