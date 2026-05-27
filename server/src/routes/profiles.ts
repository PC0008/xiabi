import { db } from "edgespark";
import { and, desc, eq, or } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import { Hono } from "hono";
import { guestSessions, productProfiles } from "@defs";
import { TENANT_ID } from "../domain/defaults";
import { fail, ok, readJson } from "../domain/http";

const SESSION_COOKIE = "xiabi_session";
const MAX_PROFILES_PER_OWNER = 20;
const PROFILE_LIMITS = {
  name: 80,
  audience: 120,
  value: 160,
  proof: 500
};

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

function rawTextLength(value: unknown) {
  return String(value || "").trim().length;
}

function oversizedProfileField(body: Partial<ProfileBody>) {
  if (rawTextLength(body.name) > PROFILE_LIMITS.name) return "name";
  if (rawTextLength(body.audience) > PROFILE_LIMITS.audience) return "audience";
  if (rawTextLength(body.value) > PROFILE_LIMITS.value) return "value";
  if (rawTextLength(body.proof) > PROFILE_LIMITS.proof) return "proof";
  return "";
}

function cleanProfileBody(body: Partial<ProfileBody>) {
  return {
    name: cleanText(body.name, PROFILE_LIMITS.name),
    audience: cleanText(body.audience, PROFILE_LIMITS.audience),
    value: cleanText(body.value, PROFILE_LIMITS.value),
    proof: cleanText(body.proof, PROFILE_LIMITS.proof)
  };
}

async function activeProfileCount(session: GuestSession) {
  const rows = await db
    .select({ id: productProfiles.id })
    .from(productProfiles)
    .where(and(eq(productProfiles.tenantId, TENANT_ID), eq(productProfiles.status, "active"), profileOwnerWhere(session)))
    .limit(MAX_PROFILES_PER_OWNER);
  return rows.length;
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
    const body = await readJson<ProfileBody>(c);
    if (oversizedProfileField(body)) return fail(c, "profile_too_long", "产品档案内容太长，请精简后再保存。", 413);
    if (await activeProfileCount(session) >= MAX_PROFILES_PER_OWNER) {
      return fail(c, "too_many_profiles", "产品档案数量已达上限，请先删除不用的档案。", 429);
    }
    const input = cleanProfileBody(body);
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
    const body = await readJson<ProfileBody>(c);
    if (oversizedProfileField(body)) return fail(c, "profile_too_long", "产品档案内容太长，请精简后再保存。", 413);
    const input = cleanProfileBody(body);
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
