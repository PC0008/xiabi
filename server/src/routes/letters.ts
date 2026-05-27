import { db } from "edgespark";
import { and, desc, eq } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import { Hono } from "hono";
import { entitlementLedger, guestSessions, salesLetters } from "@defs";
import { TENANT_ID } from "../domain/defaults";
import { fail, ok, parseJson } from "../domain/http";

const SESSION_COOKIE = "xiabi_session";

function publicLetter(letter: typeof salesLetters.$inferSelect) {
  return {
    ...letter,
    input: parseJson(letter.inputJson, {}),
    content: parseJson(letter.contentJson, null)
  };
}

export const letterRoutes = new Hono()
  .get("/", async (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (!sessionId) return ok(c, { letters: [] });
    const rows = await db
      .select()
      .from(salesLetters)
      .where(and(eq(salesLetters.tenantId, TENANT_ID), eq(salesLetters.sessionId, sessionId)))
      .orderBy(desc(salesLetters.createdAt))
      .limit(50);
    return ok(c, { letters: rows.map(publicLetter) });
  })
  .get("/:id", async (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (!sessionId) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const [letter] = await db
      .select()
      .from(salesLetters)
      .where(and(eq(salesLetters.id, c.req.param("id")), eq(salesLetters.sessionId, sessionId)))
      .limit(1);
    if (!letter) return fail(c, "letter_not_found", "没有找到这封销售信。", 404);
    return ok(c, publicLetter(letter));
  })
  .post("/:id/claim", async (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (!sessionId) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const letterId = c.req.param("id");
    const [session] = await db
      .select()
      .from(guestSessions)
      .where(and(eq(guestSessions.tenantId, TENANT_ID), eq(guestSessions.id, sessionId)))
      .limit(1);
    const [existingFree] = await db
      .select()
      .from(entitlementLedger)
      .where(and(eq(entitlementLedger.tenantId, TENANT_ID), eq(entitlementLedger.sessionId, sessionId), eq(entitlementLedger.type, "first_free_letter")))
      .orderBy(desc(entitlementLedger.createdAt))
      .limit(1);
    if (existingFree && existingFree.letterId !== letterId) {
      return fail(c, "first_free_used", "首次免费权益已经使用过，可以选择单封解锁或开通年卡。", 403);
    }
    const [letter] = await db
      .update(salesLetters)
      .set({ userId: session?.userId || null, status: "claimed", claimedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(and(eq(salesLetters.id, letterId), eq(salesLetters.sessionId, sessionId)))
      .returning();
    if (!letter) return fail(c, "letter_not_found", "没有找到这封销售信。", 404);
    await db.insert(entitlementLedger).values({
      id: crypto.randomUUID(),
      tenantId: TENANT_ID,
      userId: session?.userId || null,
      sessionId,
      letterId: letter.id,
      type: "first_free_letter",
      status: "used",
      quantity: 1,
      dedupeKey: `first_free_letter:${sessionId}:${letter.id}`,
      startsAt: new Date().toISOString()
    }).onConflictDoNothing();
    return ok(c, publicLetter(letter));
  });
