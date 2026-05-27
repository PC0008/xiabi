import { db } from "edgespark";
import { eq } from "drizzle-orm";
import { getCookie, setCookie } from "hono/cookie";
import { Hono } from "hono";
import { guestSessions, users } from "@defs";
import { TENANT_ID } from "../domain/defaults";
import { ok } from "../domain/http";

const SESSION_COOKIE = "xiabi_session";

async function createGuest(c: any) {
  const sessionId = crypto.randomUUID();
  await db.insert(guestSessions).values({
    id: sessionId,
    tenantId: TENANT_ID,
    status: "active"
  });
  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "Lax",
    secure: c.req.url.startsWith("https://"),
    path: "/",
    expires: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000)
  });
  return sessionId;
}

export const sessionRoutes = new Hono()
  .post("/guest", async (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE) || await createGuest(c);
    return ok(c, { sessionId });
  })
  .get("/me", async (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (!sessionId) return ok(c, { session: null, user: null });
    const [session] = await db.select().from(guestSessions).where(eq(guestSessions.id, sessionId)).limit(1);
    const [user] = session?.userId
      ? await db.select().from(users).where(eq(users.id, session.userId)).limit(1)
      : [];
    return ok(c, { session, user: user || null });
  });
