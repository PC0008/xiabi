import { db } from "edgespark";
import { and, eq } from "drizzle-orm";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { Hono } from "hono";
import { guestSessions, users } from "@defs";
import { withTransientDbRetry } from "../domain/db_retry";
import { TENANT_ID } from "../domain/defaults";
import { ok } from "../domain/http";

const SESSION_COOKIE = "xiabi_session";

async function createGuest(c: any) {
  const sessionId = crypto.randomUUID();
  await withTransientDbRetry("guest_session_insert", () =>
    db.insert(guestSessions).values({
      id: sessionId,
      tenantId: TENANT_ID,
      status: "active"
    })
  );
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
    const cookieSessionId = getCookie(c, SESSION_COOKIE);
    const [session] = cookieSessionId
      ? await withTransientDbRetry("guest_session_select", () =>
          db
            .select()
            .from(guestSessions)
            .where(and(eq(guestSessions.id, cookieSessionId), eq(guestSessions.status, "active")))
            .limit(1)
        )
      : [];
    const sessionId = session?.id || await createGuest(c);
    return ok(c, { sessionId });
  })
  .post("/logout", async (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (sessionId) {
      await withTransientDbRetry("guest_session_logout", () =>
        db.update(guestSessions).set({
          status: "logged_out",
          updatedAt: new Date().toISOString()
        }).where(eq(guestSessions.id, sessionId))
      );
    }
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return ok(c, { loggedOut: true });
  })
  .get("/me", async (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (!sessionId) return ok(c, { session: null, user: null });
    const [session] = await withTransientDbRetry("guest_session_me_select", () =>
      db
        .select()
        .from(guestSessions)
        .where(and(eq(guestSessions.id, sessionId), eq(guestSessions.status, "active")))
        .limit(1)
    );
    const userId = session?.userId;
    const [user] = userId
      ? await withTransientDbRetry("guest_session_user_select", () =>
          db.select().from(users).where(eq(users.id, userId)).limit(1)
        )
      : [];
    return ok(c, { session, user: user || null });
  });
