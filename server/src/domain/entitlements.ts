import { db } from "edgespark";
import { and, eq } from "drizzle-orm";
import { entitlementLedger, orders } from "@defs";
import { TENANT_ID } from "./defaults";

function orderEntitlementValues(order: typeof orders.$inferSelect) {
  return {
    id: crypto.randomUUID(),
    tenantId: TENANT_ID,
    userId: order.userId,
    sessionId: order.sessionId,
    orderId: order.id,
    letterId: order.letterId,
    type: order.productType,
    status: "active",
    quantity: 1,
    dedupeKey: `order:${order.id}:${order.productType}`,
    startsAt: new Date().toISOString(),
    expiresAt: order.productType === "annual" ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() : null
  };
}

export async function activateOrderEntitlement(order: typeof orders.$inferSelect) {
  if (order.status !== "paid") throw new Error("order_not_paid");
  await db.insert(entitlementLedger).values(orderEntitlementValues(order)).onConflictDoNothing();
}

export async function markOrderPaidAndGrantEntitlement(order: typeof orders.$inferSelect, transaction?: { transaction_id?: string }) {
  const paidAt = order.paidAt || new Date().toISOString();
  await db.batch([
    db.update(orders).set({
      status: "paid",
      providerTransactionId: transaction?.transaction_id || order.providerTransactionId,
      paidAt,
      updatedAt: new Date().toISOString()
    }).where(and(eq(orders.tenantId, TENANT_ID), eq(orders.id, order.id))),
    db.insert(entitlementLedger).values(orderEntitlementValues({ ...order, status: "paid", paidAt })).onConflictDoNothing()
  ]);
  const [updated] = await db.select().from(orders).where(and(eq(orders.tenantId, TENANT_ID), eq(orders.id, order.id))).limit(1);
  return updated || order;
}
