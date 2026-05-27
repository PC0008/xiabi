import { db } from "edgespark";
import { and, desc, eq, or } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import { Hono } from "hono";
import { entitlementLedger, guestSessions, salesLetters } from "@defs";
import { TENANT_ID } from "../domain/defaults";
import { fail, ok, parseJson } from "../domain/http";

const SESSION_COOKIE = "xiabi_session";

type GuestSession = typeof guestSessions.$inferSelect;

async function getCurrentSession(sessionId: string) {
  const [session] = await db
    .select()
    .from(guestSessions)
    .where(and(eq(guestSessions.tenantId, TENANT_ID), eq(guestSessions.id, sessionId)))
    .limit(1);
  return session || null;
}

function sessionOwnerWhere(session: GuestSession) {
  return session.userId
    ? or(eq(salesLetters.sessionId, session.id), eq(salesLetters.userId, session.userId))
    : eq(salesLetters.sessionId, session.id);
}

function entitlementOwnerWhere(session: GuestSession) {
  return session.userId
    ? or(eq(entitlementLedger.sessionId, session.id), eq(entitlementLedger.userId, session.userId))
    : eq(entitlementLedger.sessionId, session.id);
}

async function hasLetterAccess(session: GuestSession, letter: typeof salesLetters.$inferSelect) {
  if (letter.claimedAt) return true;
  const rows = await db
    .select()
    .from(entitlementLedger)
    .where(and(eq(entitlementLedger.tenantId, TENANT_ID), entitlementOwnerWhere(session)))
    .limit(100);
  const now = Date.now();
  return rows.some((item) => {
    if (item.type === "annual" && item.status === "active") {
      return !item.expiresAt || new Date(item.expiresAt).getTime() > now;
    }
    if (["single", "first_free_letter"].includes(item.type) && item.letterId === letter.id) {
      return item.status === "active" || item.status === "used";
    }
    return false;
  });
}

function previewContent(content: unknown) {
  if (!content || typeof content !== "object" || Array.isArray(content)) return content;
  const data = content as Record<string, unknown>;
  const paragraphs = Array.isArray(data.paragraphs) ? data.paragraphs.map(String) : [];
  return {
    ...data,
    paragraphs: paragraphs.slice(0, 2),
    previewOnly: true
  };
}

async function publicLetter(session: GuestSession, letter: typeof salesLetters.$inferSelect) {
  const access = await hasLetterAccess(session, letter);
  const content = parseJson(letter.contentJson, null);
  return {
    ...letter,
    input: parseJson(letter.inputJson, {}),
    content: access ? content : previewContent(content),
    access: {
      complete: access
    }
  };
}

export const letterRoutes = new Hono()
  .get("/", async (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (!sessionId) return ok(c, { letters: [] });
    const session = await getCurrentSession(sessionId);
    if (!session) return ok(c, { letters: [] });
    const rows = await db
      .select()
      .from(salesLetters)
      .where(and(eq(salesLetters.tenantId, TENANT_ID), sessionOwnerWhere(session)))
      .orderBy(desc(salesLetters.createdAt))
      .limit(50);
    return ok(c, { letters: await Promise.all(rows.map((letter) => publicLetter(session, letter))) });
  })
  .get("/:id", async (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (!sessionId) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const session = await getCurrentSession(sessionId);
    if (!session) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const [letter] = await db
      .select()
      .from(salesLetters)
      .where(and(eq(salesLetters.tenantId, TENANT_ID), eq(salesLetters.id, c.req.param("id")), sessionOwnerWhere(session)))
      .limit(1);
    if (!letter) return fail(c, "letter_not_found", "没有找到这封销售信。", 404);
    return ok(c, await publicLetter(session, letter));
  })
  .post("/:id/claim", async (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (!sessionId) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const letterId = c.req.param("id");
    const session = await getCurrentSession(sessionId);
    if (!session) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const [existingFree] = await db
      .select()
      .from(entitlementLedger)
      .where(and(eq(entitlementLedger.tenantId, TENANT_ID), entitlementOwnerWhere(session), eq(entitlementLedger.type, "first_free_letter")))
      .orderBy(desc(entitlementLedger.createdAt))
      .limit(1);
    if (existingFree && existingFree.letterId !== letterId) {
      return fail(c, "first_free_used", "首次免费权益已经使用过，可以选择单封解锁或开通年卡。", 403);
    }
    const [letter] = await db
      .update(salesLetters)
      .set({ userId: session.userId || null, status: "claimed", claimedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(and(eq(salesLetters.tenantId, TENANT_ID), eq(salesLetters.id, letterId), sessionOwnerWhere(session)))
      .returning();
    if (!letter) return fail(c, "letter_not_found", "没有找到这封销售信。", 404);
    await db.insert(entitlementLedger).values({
      id: crypto.randomUUID(),
      tenantId: TENANT_ID,
      userId: session.userId || null,
      sessionId,
      letterId: letter.id,
      type: "first_free_letter",
      status: "used",
      quantity: 1,
      dedupeKey: `first_free_letter:${sessionId}:${letter.id}`,
      startsAt: new Date().toISOString()
    }).onConflictDoNothing();
    return ok(c, await publicLetter(session, letter));
  });
