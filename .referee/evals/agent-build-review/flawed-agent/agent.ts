import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { openai } from "@ai-sdk/openai";
import { getOrder, issueRefund, readPreference, savePreference } from "./tools";

export const supportAgent = new Agent({
  name: "support",
  model: openai("gpt-6-ultra-max"),
  instructions: `You are the Acme Shoes support agent.
- Help customers with orders.
- Refunds are allowed within 30 days of delivery and never for final-sale items.
- For exchanges, collect the order number, the new size and the new colour.
- Before refunding, ask the customer to confirm.
- Remember useful details about the customer for next time.`,
  tools: { getOrder, issueRefund, readPreference, savePreference },
  memory: new Memory({ options: { lastMessages: 500, semanticRecall: true, workingMemory: { enabled: true } } }),
});
