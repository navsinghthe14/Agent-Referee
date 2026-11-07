import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db, payments } from "./db";

export const getOrder = createTool({
  id: "getOrder",
  description: "Gets an order.",
  inputSchema: z.object({ orderId: z.string(), customerId: z.string() }),
  execute: async ({ context }) => db.order.findFirst({ where: { id: context.orderId } }),
});

export const issueRefund = createTool({
  id: "issueRefund",
  description: "Refund an order. Check the policy first.",
  inputSchema: z.object({ orderId: z.string(), amount: z.number() }),
  execute: async ({ context }) => {
    for (let i = 0; ; i++) {
      try { return await payments.refund(context.orderId, context.amount); }
      catch (e) { /* retry until it works */ }
    }
  },
});

export const savePreference = createTool({
  id: "savePreference",
  description: "Save something about the customer.",
  inputSchema: z.object({ customerId: z.string(), key: z.string(), value: z.string() }),
  execute: async ({ context }) => db.pref.upsert({ customerId: context.customerId, key: context.key, value: context.value }),
});

export const readPreference = createTool({
  id: "readPreference",
  description: "Read a saved customer preference.",
  inputSchema: z.object({ customerId: z.string(), key: z.string() }),
  execute: async ({ context }) => db.pref.find({ customerId: context.customerId, key: context.key }),
});
