import { db } from "edgespark";
import { Hono } from "hono";
import { paymentWebhookEvents } from "@defs";
import { TENANT_ID } from "../domain/defaults";
import { ok } from "../domain/http";

export const webhookRoutes = new Hono()
  .post("/wechat-pay", async (c) => {
    const payload = await c.req.text();
    const eventId = c.req.header("wechatpay-serial") || c.req.header("idempotency-key") || crypto.randomUUID();
    await db.insert(paymentWebhookEvents).values({
      id: crypto.randomUUID(),
      tenantId: TENANT_ID,
      provider: "wechat",
      eventId,
      status: "received",
      payloadJson: payload || "{}"
    }).onConflictDoNothing();
    return ok(c, { received: true });
  });
