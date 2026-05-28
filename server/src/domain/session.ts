import { db } from "edgespark";
import { and, eq } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import { guestSessions } from "@defs";
import { TENANT_ID } from "./defaults";

export const SESSION_COOKIE = "xiabi_session";

export async function getActiveSession(c: any) {
  const sessionId = getCookie(c, SESSION_COOKIE);
  if (!sessionId) return null;
  const [session] = await db
    .select()
    .from(guestSessions)
    .where(and(
      eq(guestSessions.tenantId, TENANT_ID),
      eq(guestSessions.id, sessionId),
      eq(guestSessions.status, "active")
    ))
    .limit(1);
  return session ? { sessionId, session } : null;
}
