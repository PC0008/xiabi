import { db } from "edgespark";
import { and, desc, eq, or } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import { Hono } from "hono";
import { entitlementLedger, guestSessions } from "@defs";
import { TENANT_ID } from "../domain/defaults";
import { ok } from "../domain/http";

const SESSION_COOKIE = "xiabi_session";

async function getCurrentSession(sessionId: string) {
  const [session] = await db
    .select()
    .from(guestSessions)
    .where(and(eq(guestSessions.tenantId, TENANT_ID), eq(guestSessions.id, sessionId)))
    .limit(1);
  return session || null;
}

export const entitlementRoutes = new Hono()
  .get("/", async (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (!sessionId) return ok(c, { entitlements: [], summary: { annualActive: false, singleCredits: 0, firstFreeUsed: false } });
    const session = await getCurrentSession(sessionId);
    if (!session) return ok(c, { entitlements: [], summary: { annualActive: false, singleCredits: 0, firstFreeUsed: false } });
    const ownerWhere = session.userId
      ? or(eq(entitlementLedger.sessionId, session.id), eq(entitlementLedger.userId, session.userId))
      : eq(entitlementLedger.sessionId, session.id);
    const rows = await db
      .select()
      .from(entitlementLedger)
      .where(and(eq(entitlementLedger.tenantId, TENANT_ID), ownerWhere))
      .orderBy(desc(entitlementLedger.createdAt))
      .limit(100);
    const now = Date.now();
    const activeRows = rows.filter((item) => item.status === "active" || item.status === "used");
    const annualActive = activeRows.some((item) =>
      item.type === "annual" &&
      item.status === "active" &&
      (!item.expiresAt || new Date(item.expiresAt).getTime() > now)
    );
    const unlockedLetterIds = Array.from(new Set(activeRows
      .filter((item) => ["single", "first_free_letter"].includes(item.type) && item.letterId)
      .map((item) => item.letterId)));
    const summary = {
      annualActive,
      singleCredits: rows.filter((item) => item.type === "single" && item.status === "active").reduce((sum, item) => sum + item.quantity, 0),
      firstFreeUsed: rows.some((item) => item.type === "first_free_letter"),
      unlockedLetterIds
    };
    return ok(c, { entitlements: rows, summary });
  });
