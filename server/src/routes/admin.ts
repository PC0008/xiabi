import { db, secret, vars } from "edgespark";
import { and, desc, eq } from "drizzle-orm";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { Hono } from "hono";
import { adminSessions, adminUsers, auditLogs, entitlementLedger, generationTasks, guestSessions, orders, paymentWebhookEvents, salesLetters, users } from "@defs";
import { getAdminConfig, upsertConfigScope } from "../domain/config";
import { ConfigScope, configScopes, TENANT_ID } from "../domain/defaults";
import { fail, ok, parseJson, readJson } from "../domain/http";
import { createToken, daysFromNow, hashPassword, hashToken, isFuture } from "../domain/security";

const ADMIN_COOKIE = "xiabi_admin_session";

type AdminLoginBody = {
  username: string;
  password: string;
};

type AdminConfigBody = {
  home?: unknown;
  homeConfig?: unknown;
  pricing?: unknown;
  guideStages?: unknown;
  templates?: unknown;
  system?: unknown;
};

async function logAdmin(adminId: string, action: string, targetType?: string, detail?: unknown) {
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    tenantId: TENANT_ID,
    actorId: adminId,
    actorType: "admin",
    action,
    targetType,
    detailJson: detail ? JSON.stringify(detail) : null
  });
}

async function findAdminSession(c: Parameters<Hono["fetch"]>[0] extends never ? never : any) {
  const token = getCookie(c, ADMIN_COOKIE);
  if (!token) return null;
  const tokenHash = await hashToken(token);
  const [session] = await db
    .select()
    .from(adminSessions)
    .where(eq(adminSessions.tokenHash, tokenHash))
    .limit(1);
  if (!session || !isFuture(session.expiresAt)) return null;
  const [admin] = await db
    .select()
    .from(adminUsers)
    .where(and(eq(adminUsers.id, session.adminId), eq(adminUsers.status, "active")))
    .limit(1);
  if (!admin) return null;
  return { session, admin };
}

async function requireAdmin(c: any) {
  const auth = await findAdminSession(c);
  if (!auth) return null;
  return auth.admin;
}

async function maybeBootstrapAdmin(username: string, password: string) {
  const [existing] = await db.select().from(adminUsers).limit(1);
  if (existing) return null;

  const bootstrapUsername = vars.get("ADMIN_INITIAL_USERNAME") || "admin";
  const bootstrapPassword = secret.get("ADMIN_INITIAL_PASSWORD");
  if (!bootstrapPassword || username !== bootstrapUsername || password !== bootstrapPassword) return null;

  const pepper = secret.get("ADMIN_PASSWORD_PEPPER") || "";
  const [admin] = await db
    .insert(adminUsers)
    .values({
      id: crypto.randomUUID(),
      tenantId: TENANT_ID,
      username,
      displayName: "Owner",
      role: "owner",
      passwordHash: await hashPassword(password, pepper)
    })
    .returning();
  await logAdmin(admin.id, "admin.bootstrap", "admin_user", { username });
  return admin;
}

async function createSession(c: any, adminId: string) {
  const token = createToken();
  const expiresAt = daysFromNow(14);
  await db.insert(adminSessions).values({
    id: crypto.randomUUID(),
    tenantId: TENANT_ID,
    adminId,
    tokenHash: await hashToken(token),
    expiresAt
  });
  setCookie(c, ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: c.req.url.startsWith("https://"),
    path: "/",
    expires: new Date(expiresAt)
  });
}

function publicAdmin(admin: typeof adminUsers.$inferSelect) {
  return {
    id: admin.id,
    username: admin.username,
    displayName: admin.displayName,
    role: admin.role
  };
}

function requireAdminOrFail(c: any, admin: typeof adminUsers.$inferSelect | null) {
  if (!admin) return fail(c, "not_authenticated", "请先登录后台。", 401);
  return null;
}

export const adminRoutes = new Hono()
  .post("/login", async (c) => {
    const body = await readJson<AdminLoginBody>(c);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (!username || !password) return fail(c, "missing_credentials", "请输入账号和密码。", 400);

    const bootstrapped = await maybeBootstrapAdmin(username, password);
    const [admin] = bootstrapped ? [bootstrapped] : await db
      .select()
      .from(adminUsers)
      .where(and(eq(adminUsers.tenantId, TENANT_ID), eq(adminUsers.username, username), eq(adminUsers.status, "active")))
      .limit(1);
    if (!admin) return fail(c, "invalid_credentials", "账号或密码不正确。", 401);

    const pepper = secret.get("ADMIN_PASSWORD_PEPPER") || "";
    const passwordHash = await hashPassword(password, pepper);
    if (passwordHash !== admin.passwordHash) return fail(c, "invalid_credentials", "账号或密码不正确。", 401);

    await createSession(c, admin.id);
    await db.update(adminUsers).set({ lastLoginAt: new Date().toISOString() }).where(eq(adminUsers.id, admin.id));
    await logAdmin(admin.id, "admin.login", "admin_user", { username });
    return ok(c, { admin: publicAdmin(admin) });
  })
  .post("/logout", async (c) => {
    const token = getCookie(c, ADMIN_COOKIE);
    if (token) await db.delete(adminSessions).where(eq(adminSessions.tokenHash, await hashToken(token)));
    deleteCookie(c, ADMIN_COOKIE, { path: "/" });
    return ok(c, { loggedOut: true });
  })
  .get("/me", async (c) => {
    const admin = await requireAdmin(c);
    if (!admin) return fail(c, "not_authenticated", "请先登录后台。", 401);
    return ok(c, { admin: publicAdmin(admin) });
  })
  .get("/config", async (c) => {
    const admin = await requireAdmin(c);
    if (!admin) return fail(c, "not_authenticated", "请先登录后台。", 401);
    return ok(c, await getAdminConfig(db));
  })
  .patch("/config", async (c) => {
    const admin = await requireAdmin(c);
    if (!admin) return fail(c, "not_authenticated", "请先登录后台。", 401);
    const body = await readJson<AdminConfigBody>(c);
    const updates: Partial<Record<ConfigScope, unknown>> = {};
    if (body.homeConfig) updates.home = body.homeConfig;
    for (const scope of configScopes()) {
      if (scope in body) updates[scope] = body[scope as keyof AdminConfigBody];
    }
    for (const [scope, data] of Object.entries(updates)) {
      await upsertConfigScope(db, scope as ConfigScope, data, admin.id);
    }
    await logAdmin(admin.id, "config.update", "app_config", { scopes: Object.keys(updates) });
    return ok(c, await getAdminConfig(db));
  })
  .get("/dashboard", async (c) => {
    const admin = await requireAdmin(c);
    const denied = requireAdminOrFail(c, admin);
    if (denied) return denied;
    const [sessionRows, letterRows, orderRows, taskRows] = await Promise.all([
      db.select().from(guestSessions).where(eq(guestSessions.tenantId, TENANT_ID)).limit(200),
      db.select().from(salesLetters).where(eq(salesLetters.tenantId, TENANT_ID)).limit(200),
      db.select().from(orders).where(eq(orders.tenantId, TENANT_ID)).limit(200),
      db.select().from(generationTasks).where(eq(generationTasks.tenantId, TENANT_ID)).limit(200)
    ]);
    return ok(c, {
      metrics: {
        sessions: sessionRows.length,
        letters: letterRows.length,
        orders: orderRows.length,
        failedTasks: taskRows.filter((task) => task.status === "failed").length,
        pendingOrders: orderRows.filter((order) => order.status === "pending").length
      },
      todo: [
        { title: "生成失败任务", count: taskRows.filter((task) => task.status === "failed").length, level: "danger" },
        { title: "待支付订单", count: orderRows.filter((order) => order.status === "pending").length, level: "warn" },
        { title: "待领取销售信", count: letterRows.filter((letter) => letter.status === "ready").length, level: "normal" }
      ]
    });
  })
  .get("/users", async (c) => {
    const admin = await requireAdmin(c);
    const denied = requireAdminOrFail(c, admin);
    if (denied) return denied;
    const [sessionRows, userRows] = await Promise.all([
      db.select().from(guestSessions).where(eq(guestSessions.tenantId, TENANT_ID)).orderBy(desc(guestSessions.createdAt)).limit(100),
      db.select().from(users).where(eq(users.tenantId, TENANT_ID)).orderBy(desc(users.createdAt)).limit(100)
    ]);
    return ok(c, { users: userRows, sessions: sessionRows });
  })
  .get("/letters", async (c) => {
    const admin = await requireAdmin(c);
    const denied = requireAdminOrFail(c, admin);
    if (denied) return denied;
    const rows = await db.select().from(salesLetters).where(eq(salesLetters.tenantId, TENANT_ID)).orderBy(desc(salesLetters.createdAt)).limit(100);
    return ok(c, { letters: rows.map((letter) => ({ ...letter, input: parseJson(letter.inputJson, {}), content: parseJson(letter.contentJson, null) })) });
  })
  .get("/tasks", async (c) => {
    const admin = await requireAdmin(c);
    const denied = requireAdminOrFail(c, admin);
    if (denied) return denied;
    const rows = await db.select().from(generationTasks).where(eq(generationTasks.tenantId, TENANT_ID)).orderBy(desc(generationTasks.createdAt)).limit(100);
    return ok(c, { tasks: rows.map((task) => ({ ...task, input: parseJson(task.inputJson, {}), progress: parseJson(task.progressJson, null) })) });
  })
  .get("/orders", async (c) => {
    const admin = await requireAdmin(c);
    const denied = requireAdminOrFail(c, admin);
    if (denied) return denied;
    const rows = await db.select().from(orders).where(eq(orders.tenantId, TENANT_ID)).orderBy(desc(orders.createdAt)).limit(100);
    return ok(c, { orders: rows });
  })
  .get("/entitlements", async (c) => {
    const admin = await requireAdmin(c);
    const denied = requireAdminOrFail(c, admin);
    if (denied) return denied;
    const rows = await db.select().from(entitlementLedger).where(eq(entitlementLedger.tenantId, TENANT_ID)).orderBy(desc(entitlementLedger.createdAt)).limit(100);
    return ok(c, { entitlements: rows });
  })
  .get("/payment-events", async (c) => {
    const admin = await requireAdmin(c);
    const denied = requireAdminOrFail(c, admin);
    if (denied) return denied;
    const rows = await db.select().from(paymentWebhookEvents).where(eq(paymentWebhookEvents.tenantId, TENANT_ID)).orderBy(desc(paymentWebhookEvents.createdAt)).limit(100);
    return ok(c, { events: rows });
  })
  .get("/audit-logs", async (c) => {
    const admin = await requireAdmin(c);
    const denied = requireAdminOrFail(c, admin);
    if (denied) return denied;
    const rows = await db.select().from(auditLogs).where(eq(auditLogs.tenantId, TENANT_ID)).orderBy(desc(auditLogs.createdAt)).limit(100);
    return ok(c, { logs: rows.map((log) => ({ ...log, detail: parseJson(log.detailJson, null) })) });
  });
