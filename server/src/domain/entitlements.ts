import { db } from "edgespark";
import { eq } from "drizzle-orm";
import { entitlementLedger, orders } from "@defs";
import { TENANT_ID } from "./defaults";

export async function activateOrderEntitlement(order: typeof orders.$inferSelect) {
  await db.insert(entitlementLedger).values({
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
  }).onConflictDoNothing();
}

export async function markOrderPaidAndGrantEntitlement(order: typeof orders.$inferSelect, transaction?: { transaction_id?: string }) {
  await activateOrderEntitlement(order);
  await db.update(orders).set({
    status: "paid",
    providerTransactionId: transaction?.transaction_id || order.providerTransactionId,
    paidAt: order.paidAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }).where(eq(orders.id, order.id));
  const [updated] = await db.select().from(orders).where(eq(orders.id, order.id)).limit(1);
  return updated || order;
}
