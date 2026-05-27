import { db } from "edgespark";
import { and, desc, eq, or } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import { Hono } from "hono";
import { guestSessions, productProfiles } from "@defs";
import { TENANT_ID } from "../domain/defaults";
import { fail, ok, readJson } from "../domain/http";

const SESSION_COOKIE = "xiabi_session";

type ProfileBody = {
  name?: string;
  audience?: string;
  value?: string;
  proof?: string;
};

type GuestSession = typeof guestSessions.$inferSelect;

async function getCurrentSession(sessionId: string) {
  const [session] = await db
    .select()
    .from(guestSessions)
    .where(and(eq(guestSessions.tenantId, TENANT_ID), eq(guestSessions.id, sessionId), eq(guestSessions.status, "active")))
    .limit(1);
  return session || null;
}

async function requireSession(c: any) {
  const sessionId = getCookie(c, SESSION_COOKIE);
  if (!sessionId) return null;
  return getCurrentSession(sessionId);
}

function profileOwnerWhere(session: GuestSession) {
  return session.userId
    ? or(eq(productProfiles.sessionId, session.id), eq(productProfiles.userId, session.userId))
    : eq(productProfiles.sessionId, session.id);
}

function cleanText(value: unknown, max = 240) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

function cleanProfileBody(body: Partial<ProfileBody>) {
  return {
    name: cleanText(body.name, 80),
    audience: cleanText(body.audience, 120),
    value: cleanText(body.value, 160),
    proof: cleanText(body.proof, 500)
  };
}

export const profileRoutes = new Hono()
  .get("/", async (c) => {
    const session = await requireSession(c);
    if (!session) return ok(c, { profiles: [] });
    const rows = await db
      .select()
      .from(productProfiles)
      .where(and(eq(productProfiles.tenantId, TENANT_ID), eq(productProfiles.status, "active"), profileOwnerWhere(session)))
      .orderBy(desc(productProfiles.updatedAt))
      .limit(50);
    return ok(c, { profiles: rows });
  })
  .post("/", async (c) => {
    const session = await requireSession(c);
    if (!session) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const input = cleanProfileBody(await readJson<ProfileBody>(c));
    if (!input.name) return fail(c, "missing_profile_name", "请填写产品或服务名称。", 400);
    const now = new Date().toISOString();
    const [profile] = await db.insert(productProfiles).values({
      id: crypto.randomUUID(),
      tenantId: TENANT_ID,
      userId: session.userId || null,
      sessionId: session.id,
      name: input.name,
      audience: input.audience || null,
      value: input.value || null,
      proof: input.proof || null,
      status: "active",
      createdAt: now,
      updatedAt: now
    }).returning();
    return ok(c, { profile });
  })
  .patch("/:id", async (c) => {
    const session = await requireSession(c);
    if (!session) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const input = cleanProfileBody(await readJson<ProfileBody>(c));
    if (!input.name) return fail(c, "missing_profile_name", "请填写产品或服务名称。", 400);
    const [profile] = await db
      .update(productProfiles)
      .set({
        name: input.name,
        audience: input.audience || null,
        value: input.value || null,
        proof: input.proof || null,
        updatedAt: new Date().toISOString()
      })
      .where(and(eq(productProfiles.tenantId, TENANT_ID), eq(productProfiles.id, c.req.param("id")), profileOwnerWhere(session)))
      .returning();
    if (!profile) return fail(c, "profile_not_found", "没有找到这个产品档案。", 404);
    return ok(c, { profile });
  })
  .delete("/:id", async (c) => {
    const session = await requireSession(c);
    if (!session) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const [profile] = await db
      .update(productProfiles)
      .set({ status: "deleted", updatedAt: new Date().toISOString() })
      .where(and(eq(productProfiles.tenantId, TENANT_ID), eq(productProfiles.id, c.req.param("id")), profileOwnerWhere(session)))
      .returning();
    if (!profile) return fail(c, "profile_not_found", "没有找到这个产品档案。", 404);
    return ok(c, { deleted: true, profileId: profile.id });
  });
