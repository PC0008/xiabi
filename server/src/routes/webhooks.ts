import { db, secret, vars } from "edgespark";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { orders, paymentWebhookEvents } from "@defs";
import { verifyWechatWebhook } from "../adapters/payment/wechat";
import { TENANT_ID } from "../domain/defaults";
import { activateOrderEntitlement } from "../domain/entitlements";
import { fail, ok } from "../domain/http";

type WechatNotification = {
  id?: string;
  event_type?: string;
  resource?: {
    ciphertext?: string;
    nonce?: string;
    associated_data?: string;
  };
};

type WechatTransaction = {
  appid?: string;
  mchid?: string;
  out_trade_no?: string;
  transaction_id?: string;
  trade_state?: string;
  amount?: {
    total?: number;
    currency?: string;
  };
};

function base64ToArrayBuffer(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function decryptWechatResource(resource: NonNullable<WechatNotification["resource"]>) {
  const apiV3Key = secret.get("WECHAT_PAY_API_V3_KEY");
  if (!apiV3Key || !resource.ciphertext || !resource.nonce) throw new Error("wechat_pay_decrypt_config_missing");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(apiV3Key), "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: new TextEncoder().encode(resource.nonce),
      additionalData: new TextEncoder().encode(resource.associated_data || ""),
      tagLength: 128
    },
    key,
    base64ToArrayBuffer(resource.ciphertext)
  );
  return JSON.parse(new TextDecoder().decode(plain)) as WechatTransaction;
}

function validateWechatTransaction(notification: WechatNotification, transaction: WechatTransaction, order: typeof orders.$inferSelect) {
  if (notification.event_type !== "TRANSACTION.SUCCESS") throw new Error("unexpected_event_type");
  if (transaction.trade_state !== "SUCCESS") throw new Error("unexpected_trade_state");
  if (transaction.out_trade_no !== order.providerOrderNo) throw new Error("out_trade_no_mismatch");
  const expectedAppId = vars.get("WECHAT_PAY_APP_ID");
  const expectedMchId = vars.get("WECHAT_PAY_MCH_ID");
  if (expectedAppId && transaction.appid && transaction.appid !== expectedAppId) throw new Error("appid_mismatch");
  if (expectedMchId && transaction.mchid && transaction.mchid !== expectedMchId) throw new Error("mchid_mismatch");
  if (transaction.amount?.total !== undefined && Number(transaction.amount.total) !== Number(order.amountCents)) throw new Error("amount_mismatch");
  if (transaction.amount?.currency && transaction.amount.currency !== order.currency) throw new Error("currency_mismatch");
}

export const webhookRoutes = new Hono()
  .post("/wechat-pay", async (c) => {
    const payload = await c.req.text();
    const notification = JSON.parse(payload || "{}") as WechatNotification;
    const eventId = notification.id || crypto.randomUUID();
    const [insertedEvent] = await db.insert(paymentWebhookEvents).values({
      id: crypto.randomUUID(),
      tenantId: TENANT_ID,
      provider: "wechat",
      eventId,
      status: "received",
      payloadJson: payload || "{}"
    }).onConflictDoNothing().returning();
    const [event] = insertedEvent ? [insertedEvent] : await db
      .select()
      .from(paymentWebhookEvents)
      .where(and(eq(paymentWebhookEvents.provider, "wechat"), eq(paymentWebhookEvents.eventId, eventId)))
      .limit(1);
    if (event?.status === "processed") return ok(c, { received: true, duplicate: true });
    if (!event) return fail(c, "webhook_event_missing", "webhook event missing", 500);
    if (!insertedEvent) {
      await db.update(paymentWebhookEvents).set({
        status: "received",
        payloadJson: payload || "{}",
        errorMessage: null
      }).where(eq(paymentWebhookEvents.id, event.id));
    }

    const verified = await verifyWechatWebhook(c.req.raw.headers, payload);
    if (!verified.verified) {
      await db.update(paymentWebhookEvents).set({ status: "failed", errorMessage: verified.reason }).where(eq(paymentWebhookEvents.id, event.id));
      return fail(c, "invalid_signature", "invalid signature", 401);
    }

    try {
      const transaction = await decryptWechatResource(notification.resource || {});
      const [order] = await db
        .select()
        .from(orders)
        .where(and(eq(orders.tenantId, TENANT_ID), eq(orders.providerOrderNo, transaction.out_trade_no || "")))
        .limit(1);
      if (!order) throw new Error("order_not_found");
      validateWechatTransaction(notification, transaction, order);
      await activateOrderEntitlement(order);
      if (order.status !== "paid") {
        await db.update(orders).set({
          status: "paid",
          providerTransactionId: transaction.transaction_id || null,
          paidAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }).where(eq(orders.id, order.id));
      }
      await db.update(paymentWebhookEvents).set({ orderId: order.id, status: "processed" }).where(eq(paymentWebhookEvents.id, event.id));
      return ok(c, { received: true });
    } catch (error) {
      await db.update(paymentWebhookEvents).set({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "wechat_pay_webhook_failed"
      }).where(eq(paymentWebhookEvents.id, event.id));
      return fail(c, "webhook_failed", "webhook failed", 500);
    }
  });
