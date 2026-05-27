import { db } from "edgespark";
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
