# Core: areas 1–5

Think of the agent as a new hire at a shop: the model is the person, the instructions are the training manual, the tools are what they may touch, and the code is the till that won't open for a final-sale item however nicely the customer asks.

## 1. Model choice
- Start with the smallest model that follows the instructions and calls tools correctly. Move up only when evals show it failing.
- Flag: the largest model with no eval to justify it.

## 2. Instructions match tools (the most common bug)
- For every action or detail the instructions tell the agent to collect, find the tool that uses it. None = the agent asks questions it can't act on. Example: it asks for a replacement size, then says it can't do exchanges.
- Instructions hold: identity, "never" rules (never invent order details), what to do when a tool is unavailable, permission to ask for missing info, permission to fail rather than guess.
- Tool descriptions hold: what the tool does and when to use it. Don't repeat that in the instructions.
- Fallback rules stay in the instructions because they must work when a tool isn't registered (tools switched on by a flag or permission).

## 3. Rules in code, not in the prompt
- The user's identity comes from the session or runtime context. Flag any tool input such as `customerId` or `userId` that the model fills in.
- Access is checked in the query (`WHERE order_id = ? AND customer_id = ?`). Another user's record returns "not found" and nothing else.
- Policies (time windows, final sale, quantity limits), prices and quotes are functions. The model explains their result; it never computes or overrides it.
- Eligible is not approved. Passing the checks only means the request may go ahead to a proposal.
- A schema checks the request's shape. A valid shape doesn't mean the user is allowed.
- Tools return real IDs (product, variant) so the model never invents one.

## 4. Memory and context
- The model remembers nothing between calls. Each call carries instructions, recent messages, tool definitions and tool results, and each costs tokens every time.
- Bound the history (for example the last 20 messages) and note the trade-off. Consider compaction for long threads.
- Decide on purpose what survives across conversations. Don't carry order numbers or other one-off details into the next chat.
- Durable preferences go through explicit save/read tools: a fixed list of categories, stored per user and category, saved only when the user asks.
- Leave automatic recall and working memory off unless there's a reason.

## 5. Limits
- Set a cap on model calls per run (`maxSteps`). One call can request several tools, so this is not a tool-call cap. Size it from evals: steps seen plus a buffer.
- Each tool has its own retry and timeout limits (for example 2 retries, 10 s each). Retries inside a tool don't count against the step cap, so bound both.
