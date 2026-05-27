import { db, secret, vars } from "edgespark";
import { and, desc, eq } from "drizzle-orm";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { Hono } from "hono";
import { adminSessions, adminUsers, auditLogs, entitlementLedger, files, generationTasks, guestSessions, orders, paymentWebhookEvents, salesLetters, users } from "@defs";
import { generateSalesLetterWithDeepSeek, SalesLetterContent } from "../adapters/letter/deepseek";
import { queryWechatPaymentByOutTradeNo } from "../adapters/payment/wechat";
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

type DiagnosticStatus = "ok" | "warn" | "missing";

function getVar(key: string) {
  return String(vars.get(key as any) || "").trim();
}

function hasVar(key: string) {
  return !!getVar(key);
}

function hasSecret(key: string) {
  return !!String(secret.get(key as any) || "").trim();
}

function diagnosticStatus(required: boolean[], optional: boolean[] = []): DiagnosticStatus {
  if (required.every(Boolean) && optional.every(Boolean)) return "ok";
  if (required.every(Boolean)) return "warn";
  return "missing";
}

function diagnosticItem(name: string, configured: boolean, required = true) {
  return { name, configured, required };
}

async function buildDiagnostics() {
  const [adminUser] = await db.select().from(adminUsers).where(eq(adminUsers.tenantId, TENANT_ID)).limit(1);
  const publicBaseUrl = getVar("PUBLIC_BASE_URL");
  const notifyUrl = getVar("PAYMENT_NOTIFY_URL");
  const voiceAsrSecretConfigured = hasSecret("VOICE_ASR_API_KEY") || hasSecret("VOICE_API_KEY");
  const groups = [
    {
      key: "deepseek",
      title: "DeepSeek 写信",
      status: diagnosticStatus([hasSecret("DEEPSEEK_API_KEY")], [hasVar("LETTER_PROVIDER"), hasVar("DEEPSEEK_MODEL"), hasVar("DEEPSEEK_BASE_URL")]),
      items: [
        diagnosticItem("LETTER_PROVIDER", hasVar("LETTER_PROVIDER"), false),
        diagnosticItem("DEEPSEEK_API_KEY", hasSecret("DEEPSEEK_API_KEY")),
        diagnosticItem("DEEPSEEK_MODEL", hasVar("DEEPSEEK_MODEL"), false),
        diagnosticItem("DEEPSEEK_BASE_URL", hasVar("DEEPSEEK_BASE_URL"), false)
      ],
      note: "缺少 DeepSeek Key 时，写信任务会真实失败，不会生成本地兜底内容。"
    },
    {
      key: "wechat_pay",
      title: "微信 H5 支付",
      status: diagnosticStatus([
        hasVar("WECHAT_PAY_APP_ID"),
        hasVar("WECHAT_PAY_MCH_ID"),
        hasSecret("WECHAT_PAY_PRIVATE_KEY"),
        hasSecret("WECHAT_PAY_CERT_SERIAL_NO"),
        hasSecret("WECHAT_PAY_API_V3_KEY"),
        hasSecret("WECHAT_PAY_PLATFORM_PUBLIC_KEY")
      ], [hasVar("PAYMENT_PROVIDER"), !!publicBaseUrl, !!notifyUrl]),
      items: [
        diagnosticItem("PAYMENT_PROVIDER", hasVar("PAYMENT_PROVIDER"), false),
        diagnosticItem("WECHAT_PAY_APP_ID", hasVar("WECHAT_PAY_APP_ID")),
        diagnosticItem("WECHAT_PAY_MCH_ID", hasVar("WECHAT_PAY_MCH_ID")),
        diagnosticItem("WECHAT_PAY_PRIVATE_KEY", hasSecret("WECHAT_PAY_PRIVATE_KEY")),
        diagnosticItem("WECHAT_PAY_CERT_SERIAL_NO", hasSecret("WECHAT_PAY_CERT_SERIAL_NO")),
        diagnosticItem("WECHAT_PAY_API_V3_KEY", hasSecret("WECHAT_PAY_API_V3_KEY")),
        diagnosticItem("WECHAT_PAY_PLATFORM_PUBLIC_KEY", hasSecret("WECHAT_PAY_PLATFORM_PUBLIC_KEY")),
        diagnosticItem("PUBLIC_BASE_URL", !!publicBaseUrl, false),
        diagnosticItem("PAYMENT_NOTIFY_URL", !!notifyUrl, false)
      ],
      note: "缺少平台公钥会导致正式回调验签失败；微信内支付通常还需要 JSAPI/openid 链路。"
    },
    {
      key: "sms",
      title: "阿里云短信",
      status: diagnosticStatus([
        hasVar("SMS_ALIYUN_SIGN_NAME"),
        hasVar("SMS_ALIYUN_TEMPLATE_CODE"),
        hasSecret("SMS_API_KEY"),
        hasSecret("SMS_API_SECRET")
      ], [hasVar("SMS_PROVIDER")]),
      items: [
        diagnosticItem("SMS_PROVIDER", hasVar("SMS_PROVIDER"), false),
        diagnosticItem("SMS_ALIYUN_SIGN_NAME", hasVar("SMS_ALIYUN_SIGN_NAME")),
        diagnosticItem("SMS_ALIYUN_TEMPLATE_CODE", hasVar("SMS_ALIYUN_TEMPLATE_CODE")),
        diagnosticItem("SMS_API_KEY", hasSecret("SMS_API_KEY")),
        diagnosticItem("SMS_API_SECRET", hasSecret("SMS_API_SECRET"))
      ],
      note: "未配置完整时，用户端不会假提示验证码已发送。"
    },
    {
      key: "voice_tts",
      title: "MiniMax 说话",
      status: diagnosticStatus([hasSecret("VOICE_API_KEY"), hasVar("MINIMAX_VOICE_ID")], [hasVar("VOICE_PROVIDER")]),
      items: [
        diagnosticItem("VOICE_PROVIDER", hasVar("VOICE_PROVIDER"), false),
        diagnosticItem("VOICE_API_KEY", hasSecret("VOICE_API_KEY")),
        diagnosticItem("MINIMAX_VOICE_ID", hasVar("MINIMAX_VOICE_ID"))
      ],
      note: "用于智多星说话播放，当前按 MiniMax TTS 接入。"
    },
    {
      key: "voice_asr",
      title: "语音输入转写",
      status: diagnosticStatus([hasVar("VOICE_ASR_ENDPOINT"), voiceAsrSecretConfigured], [hasVar("VOICE_ASR_PROVIDER"), hasVar("VOICE_ASR_MODEL")]),
      items: [
        diagnosticItem("VOICE_ASR_ENDPOINT", hasVar("VOICE_ASR_ENDPOINT")),
        diagnosticItem("VOICE_ASR_API_KEY 或 VOICE_API_KEY", voiceAsrSecretConfigured),
        diagnosticItem("VOICE_ASR_PROVIDER", hasVar("VOICE_ASR_PROVIDER"), false),
        diagnosticItem("VOICE_ASR_MODEL", hasVar("VOICE_ASR_MODEL"), false)
      ],
      note: "浏览器不支持直接语音识别时会走这里；未配置则提示用户切换打字模式。"
    },
    {
      key: "admin",
      title: "管理员安全",
      status: diagnosticStatus([!!adminUser, hasSecret("ADMIN_PASSWORD_PEPPER")], [hasVar("ADMIN_INITIAL_USERNAME"), hasSecret("ADMIN_INITIAL_PASSWORD")]),
      items: [
        diagnosticItem("admin_user_created", !!adminUser),
        diagnosticItem("ADMIN_INITIAL_USERNAME", hasVar("ADMIN_INITIAL_USERNAME"), false),
        diagnosticItem("ADMIN_PASSWORD_PEPPER", hasSecret("ADMIN_PASSWORD_PEPPER")),
        diagnosticItem("ADMIN_INITIAL_PASSWORD", hasSecret("ADMIN_INITIAL_PASSWORD"), false)
      ],
      note: "管理员登录失败会写审计日志；初始密码只用于首次创建管理员。"
    },
    {
      key: "runtime",
      title: "运行地址",
      status: diagnosticStatus([!!publicBaseUrl]),
      items: [
        diagnosticItem("PUBLIC_BASE_URL", !!publicBaseUrl),
        diagnosticItem("PAYMENT_NOTIFY_URL", !!notifyUrl, false)
      ],
      note: "公网地址用于支付回跳、回调定位和线上验收。"
    }
  ];
  const summary = groups.reduce((acc, group) => {
    acc[group.status] += 1;
    return acc;
  }, { ok: 0, warn: 0, missing: 0 } as Record<DiagnosticStatus, number>);
  return {
    generatedAt: new Date().toISOString(),
    publicBaseUrl: publicBaseUrl || null,
    summary,
    groups
  };
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function cleanText(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanBoolean(value: unknown, fallback = true) {
  return typeof value === "boolean" ? value : fallback;
}

function cleanPrice(value: unknown, fallback: number) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.round(num * 100) / 100 : fallback;
}

function sanitizeHomeConfig(value: unknown) {
  const input = asRecord(value);
  return {
    ...input,
    brand_name: cleanText(input.brand_name || "下笔有元", 40),
    hero_title: cleanText(input.hero_title || "说出目标，我们帮你写成销售信。", 80),
    hero_subtitle: cleanText(input.hero_subtitle || "", 300),
    primary_button_text: cleanText(input.primary_button_text || "开始语音通话 · 首次免费", 40),
    free_hint: cleanText(input.free_hint || "首次体验可免费生成一封", 60),
    unclaimed_notice: cleanText(input.unclaimed_notice || "你有一封已经写好的销售信，还没有领取。", 80),
    allow_guest_preview: cleanBoolean(input.allow_guest_preview, true),
    generation_entry_enabled: cleanBoolean(input.generation_entry_enabled, true),
    text_mode_enabled: cleanBoolean(input.text_mode_enabled, true),
    phone_bind_enabled: cleanBoolean(input.phone_bind_enabled, true)
  };
}

function sanitizePricing(value: unknown) {
  const input = asRecord(value);
  return {
    ...input,
    single: cleanPrice(input.single, 200),
    annual: cleanPrice(input.annual, 2000),
    payment_mode: cleanText(input.payment_mode || "wechat", 20) === "wechat" ? "wechat" : "wechat",
    payment_enabled: cleanBoolean(input.payment_enabled, true),
    annual_enabled: cleanBoolean(input.annual_enabled, true),
    single_enabled: cleanBoolean(input.single_enabled, true),
    pdf_upsell_enabled: cleanBoolean(input.pdf_upsell_enabled, true),
    pdf_annual_title: cleanText(input.pdf_annual_title || "经常要写销售信，可以开通年卡", 80),
    pdf_annual_desc: cleanText(input.pdf_annual_desc || "", 240)
  };
}

function sanitizeGuideStages(value: unknown) {
  if (!Array.isArray(value)) throw new Error("通话引导必须是阶段数组。");
  const stages = value.map((item, index) => {
    const input = asRecord(item);
    const options = Array.isArray(input.options) ? input.options.map((option) => cleanText(option, 80)).filter(Boolean).slice(0, 8) : [];
    const question = cleanText(input.question || input.title, 160);
    if (!question) throw new Error(`第 ${index + 1} 个引导阶段缺少问题文案。`);
    if (!options.length) throw new Error(`第 ${index + 1} 个引导阶段至少需要一个快捷选项。`);
    return {
      ...input,
      key: cleanText(input.key || `stage_${index + 1}`, 60),
      title: cleanText(input.title || question, 80),
      question,
      desc: cleanText(input.desc || "", 160),
      required: cleanBoolean(input.required, index < 2),
      enabled: cleanBoolean(input.enabled, true),
      options
    };
  });
  if (!stages.length) throw new Error("至少需要一个通话引导阶段。");
  return stages;
}

function sanitizeTemplates(value: unknown) {
  if (!Array.isArray(value)) throw new Error("销售信模板必须是数组。");
  const keys = new Set<string>();
  const templates = value.map((item, index) => {
    const input = asRecord(item);
    const key = cleanText(input.key || `template_${index + 1}`, 60);
    if (keys.has(key)) throw new Error(`模板 key 重复：${key}`);
    keys.add(key);
    const structure = Array.isArray(input.structure)
      ? input.structure.map((part) => cleanText(part, 80)).filter(Boolean).slice(0, 12)
      : cleanText(input.structure, 400).split(/\n|->/).map((part) => cleanText(part, 80)).filter(Boolean).slice(0, 12);
    return {
      ...input,
      key,
      name: cleanText(input.name || key, 80),
      goal: cleanText(input.goal || "", 80),
      scene: cleanText(input.scene || "", 80),
      status: cleanText(input.status || "draft", 20) === "enabled" ? "enabled" : "draft",
      version: cleanText(input.version || "v1.0", 20),
      structure,
      rules: cleanText(input.rules || input.prompt || input.requirement || "", 1200)
    };
  });
  if (!templates.length) throw new Error("至少需要一个销售信模板。");
  if (!templates.some((template) => template.status === "enabled")) throw new Error("至少需要启用一个销售信模板。");
  return templates;
}

function sanitizeConfigScope(scope: ConfigScope, value: unknown) {
  if (scope === "home") return sanitizeHomeConfig(value);
  if (scope === "pricing") return sanitizePricing(value);
  if (scope === "guideStages") return sanitizeGuideStages(value);
  if (scope === "templates") return sanitizeTemplates(value);
  return asRecord(value);
}

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

async function logAdminFailure(action: string, detail?: unknown) {
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    tenantId: TENANT_ID,
    actorId: null,
    actorType: "admin",
    action,
    targetType: "admin_user",
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

function selectTemplateMeta(templates: unknown) {
  if (!Array.isArray(templates)) return { key: "default", version: "v1" };
  const enabled = templates.find((item) => {
    if (!item || typeof item !== "object") return false;
    return (item as Record<string, unknown>).status === "enabled" || (item as Record<string, unknown>).status === "启用";
  }) || templates[0];
  if (!enabled || typeof enabled !== "object") return { key: "default", version: "v1" };
  const data = enabled as Record<string, unknown>;
  return {
    key: String(data.key || data.name || "default"),
    version: String(data.version || "v1")
  };
}

function parseTaskInput(task: typeof generationTasks.$inferSelect) {
  const payload = parseJson<{ answers?: unknown; input?: unknown }>(task.inputJson, {});
  const answers = Array.isArray(payload.answers) ? payload.answers.map(String).filter(Boolean) : [];
  const input = payload.input && typeof payload.input === "object" && !Array.isArray(payload.input)
    ? payload.input as Record<string, unknown>
    : {};
  return { answers, input };
}

function publicTask(task: typeof generationTasks.$inferSelect) {
  return {
    ...task,
    input: parseJson(task.inputJson, {}),
    progress: parseJson(task.progressJson, null)
  };
}

function publicLetter(letter: typeof salesLetters.$inferSelect) {
  return {
    ...letter,
    input: parseJson(letter.inputJson, {}),
    content: parseJson(letter.contentJson, null)
  };
}

function requireAdminOrFail(c: any, admin: typeof adminUsers.$inferSelect | null) {
  if (!admin) return fail(c, "not_authenticated", "请先登录后台。", 401);
  return null;
}

async function activateOrderEntitlement(order: typeof orders.$inferSelect) {
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
    if (!admin) {
      await logAdminFailure("admin.login_failed", { username, reason: "admin_not_found" });
      return fail(c, "invalid_credentials", "账号或密码不正确。", 401);
    }

    const pepper = secret.get("ADMIN_PASSWORD_PEPPER") || "";
    const passwordHash = await hashPassword(password, pepper);
    if (passwordHash !== admin.passwordHash) {
      await logAdminFailure("admin.login_failed", { username, reason: "password_not_match" });
      return fail(c, "invalid_credentials", "账号或密码不正确。", 401);
    }

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
  .get("/diagnostics", async (c) => {
    const admin = await requireAdmin(c);
    const denied = requireAdminOrFail(c, admin);
    if (denied) return denied;
    return ok(c, await buildDiagnostics());
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
    const sanitized: Partial<Record<ConfigScope, unknown>> = {};
    try {
      for (const [scope, data] of Object.entries(updates)) {
        sanitized[scope as ConfigScope] = sanitizeConfigScope(scope as ConfigScope, data);
      }
    } catch (error) {
      return fail(c, "invalid_config", error instanceof Error ? error.message : "后台配置格式不正确。", 400);
    }
    for (const [scope, data] of Object.entries(sanitized)) {
      await upsertConfigScope(db, scope as ConfigScope, data, admin.id);
    }
    await logAdmin(admin.id, "config.update", "app_config", { scopes: Object.keys(sanitized) });
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
        pendingOrders: orderRows.filter((order) => order.status === "pending").length,
        failedPayments: orderRows.filter((order) => order.status === "payment_failed").length
      },
      todo: [
        { title: "生成失败任务", count: taskRows.filter((task) => task.status === "failed").length, level: "danger" },
        { title: "待支付订单", count: orderRows.filter((order) => order.status === "pending").length, level: "warn" },
        { title: "支付未完成订单", count: orderRows.filter((order) => order.status === "payment_failed").length, level: "warn" },
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
  .get("/users/:id", async (c) => {
    const admin = await requireAdmin(c);
    const denied = requireAdminOrFail(c, admin);
    if (denied) return denied;
    const id = c.req.param("id");
    const [user] = await db.select().from(users).where(and(eq(users.tenantId, TENANT_ID), eq(users.id, id))).limit(1);
    const [session] = await db.select().from(guestSessions).where(and(eq(guestSessions.tenantId, TENANT_ID), eq(guestSessions.id, id))).limit(1);
    if (!user && !session) return fail(c, "user_not_found", "没有找到用户或会话。", 404);
    const userId = user?.id || session?.userId || "";
    const sessionId = session?.id || "";
    const [sessions, letters, orderRows, entitlements] = await Promise.all([
      userId
        ? db.select().from(guestSessions).where(and(eq(guestSessions.tenantId, TENANT_ID), eq(guestSessions.userId, userId))).orderBy(desc(guestSessions.createdAt)).limit(20)
        : db.select().from(guestSessions).where(and(eq(guestSessions.tenantId, TENANT_ID), eq(guestSessions.id, sessionId))).limit(1),
      sessionId
        ? db.select().from(salesLetters).where(and(eq(salesLetters.tenantId, TENANT_ID), eq(salesLetters.sessionId, sessionId))).orderBy(desc(salesLetters.createdAt)).limit(20)
        : db.select().from(salesLetters).where(and(eq(salesLetters.tenantId, TENANT_ID), eq(salesLetters.userId, userId))).orderBy(desc(salesLetters.createdAt)).limit(20),
      sessionId
        ? db.select().from(orders).where(and(eq(orders.tenantId, TENANT_ID), eq(orders.sessionId, sessionId))).orderBy(desc(orders.createdAt)).limit(20)
        : db.select().from(orders).where(and(eq(orders.tenantId, TENANT_ID), eq(orders.userId, userId))).orderBy(desc(orders.createdAt)).limit(20),
      sessionId
        ? db.select().from(entitlementLedger).where(and(eq(entitlementLedger.tenantId, TENANT_ID), eq(entitlementLedger.sessionId, sessionId))).orderBy(desc(entitlementLedger.createdAt)).limit(20)
        : db.select().from(entitlementLedger).where(and(eq(entitlementLedger.tenantId, TENANT_ID), eq(entitlementLedger.userId, userId))).orderBy(desc(entitlementLedger.createdAt)).limit(20)
    ]);
    return ok(c, { user, session, sessions, letters: letters.map(publicLetter), orders: orderRows, entitlements });
  })
  .get("/letters", async (c) => {
    const admin = await requireAdmin(c);
    const denied = requireAdminOrFail(c, admin);
    if (denied) return denied;
    const rows = await db.select().from(salesLetters).where(eq(salesLetters.tenantId, TENANT_ID)).orderBy(desc(salesLetters.createdAt)).limit(100);
    return ok(c, { letters: rows.map(publicLetter) });
  })
  .get("/letters/:id", async (c) => {
    const admin = await requireAdmin(c);
    const denied = requireAdminOrFail(c, admin);
    if (denied) return denied;
    const id = c.req.param("id");
    const [letter] = await db.select().from(salesLetters).where(and(eq(salesLetters.tenantId, TENANT_ID), eq(salesLetters.id, id))).limit(1);
    if (!letter) return fail(c, "letter_not_found", "没有找到这封销售信。", 404);
    const [taskRows, orderRows, entitlements, fileRows] = await Promise.all([
      db.select().from(generationTasks).where(and(eq(generationTasks.tenantId, TENANT_ID), eq(generationTasks.letterId, id))).orderBy(desc(generationTasks.createdAt)).limit(20),
      db.select().from(orders).where(and(eq(orders.tenantId, TENANT_ID), eq(orders.letterId, id))).orderBy(desc(orders.createdAt)).limit(20),
      db.select().from(entitlementLedger).where(and(eq(entitlementLedger.tenantId, TENANT_ID), eq(entitlementLedger.letterId, id))).orderBy(desc(entitlementLedger.createdAt)).limit(20),
      db.select().from(files).where(and(eq(files.tenantId, TENANT_ID), eq(files.letterId, id))).orderBy(desc(files.createdAt)).limit(20)
    ]);
    return ok(c, { letter: publicLetter(letter), tasks: taskRows.map(publicTask), orders: orderRows, entitlements, files: fileRows });
  })
  .get("/tasks", async (c) => {
    const admin = await requireAdmin(c);
    const denied = requireAdminOrFail(c, admin);
    if (denied) return denied;
    const rows = await db.select().from(generationTasks).where(eq(generationTasks.tenantId, TENANT_ID)).orderBy(desc(generationTasks.createdAt)).limit(100);
    return ok(c, { tasks: rows.map(publicTask) });
  })
  .get("/tasks/:id", async (c) => {
    const admin = await requireAdmin(c);
    const denied = requireAdminOrFail(c, admin);
    if (denied) return denied;
    const id = c.req.param("id");
    const [task] = await db.select().from(generationTasks).where(and(eq(generationTasks.tenantId, TENANT_ID), eq(generationTasks.id, id))).limit(1);
    if (!task) return fail(c, "task_not_found", "没有找到任务。", 404);
    const [letter] = task.letterId
      ? await db.select().from(salesLetters).where(and(eq(salesLetters.tenantId, TENANT_ID), eq(salesLetters.id, task.letterId))).limit(1)
      : [null];
    return ok(c, { task: publicTask(task), letter: letter ? publicLetter(letter) : null });
  })
  .post("/tasks/:id/retry", async (c) => {
    const admin = await requireAdmin(c);
    const denied = requireAdminOrFail(c, admin);
    if (denied) return denied;
    const id = c.req.param("id");
    const [task] = await db.select().from(generationTasks).where(and(eq(generationTasks.tenantId, TENANT_ID), eq(generationTasks.id, id))).limit(1);
    if (!task) return fail(c, "task_not_found", "没有找到任务。", 404);
    if (task.status !== "failed") return fail(c, "task_not_failed", "只有失败任务可以重试。", 409);
    const { answers, input } = parseTaskInput(task);
    if (!answers.length) return fail(c, "missing_task_input", "任务缺少可重试的信息。", 400);

    const templates = (await getAdminConfig(db)).templates;
    const templateMeta = selectTemplateMeta(templates);
    await db.update(generationTasks).set({
      status: "running",
      progressJson: JSON.stringify({ percent: 20, stage: "retrying", provider: "deepseek" }),
      errorCode: null,
      errorMessage: null,
      attempts: Number(task.attempts || 0) + 1,
      updatedAt: new Date().toISOString()
    }).where(eq(generationTasks.id, id));

    let content: SalesLetterContent | null = null;
    try {
      content = await generateSalesLetterWithDeepSeek({ answers, input, templates });
      if (!content) throw new Error("DeepSeek provider is not configured.");
    } catch (error) {
      await db.update(generationTasks).set({
        status: "failed",
        progressJson: JSON.stringify({ percent: 0, stage: "failed", provider: "deepseek" }),
        errorCode: "deepseek_generation_failed",
        errorMessage: error instanceof Error ? error.message.slice(0, 500) : "DeepSeek generation failed.",
        updatedAt: new Date().toISOString()
      }).where(eq(generationTasks.id, id));
      await logAdmin(admin!.id, "task.retry_failed", "generation_task", { taskId: id });
      return fail(c, "generation_failed", "写信服务暂时没有完成，请稍后再试。", 502);
    }

    const letterId = crypto.randomUUID();
    await db.insert(salesLetters).values({
      id: letterId,
      tenantId: TENANT_ID,
      userId: task.userId,
      sessionId: task.sessionId,
      title: content.title,
      scene: content.scene,
      status: "ready",
      inputJson: task.inputJson,
      contentJson: JSON.stringify(content),
      templateKey: templateMeta.key,
      templateVersion: templateMeta.version
    });
    await db.update(generationTasks).set({
      letterId,
      status: "succeeded",
      progressJson: JSON.stringify({ percent: 100, stage: "ready", provider: content.provider || "deepseek" }),
      updatedAt: new Date().toISOString()
    }).where(eq(generationTasks.id, id));
    await logAdmin(admin!.id, "task.retry_succeeded", "generation_task", { taskId: id, letterId });
    const [updated] = await db.select().from(generationTasks).where(eq(generationTasks.id, id)).limit(1);
    const [letter] = await db.select().from(salesLetters).where(eq(salesLetters.id, letterId)).limit(1);
    return ok(c, { task: publicTask(updated), letter: publicLetter(letter) });
  })
  .get("/orders", async (c) => {
    const admin = await requireAdmin(c);
    const denied = requireAdminOrFail(c, admin);
    if (denied) return denied;
    const rows = await db.select().from(orders).where(eq(orders.tenantId, TENANT_ID)).orderBy(desc(orders.createdAt)).limit(100);
    return ok(c, { orders: rows });
  })
  .post("/orders/:id/reconcile", async (c) => {
    const admin = await requireAdmin(c);
    const denied = requireAdminOrFail(c, admin);
    if (denied) return denied;
    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.tenantId, TENANT_ID), eq(orders.id, c.req.param("id"))))
      .limit(1);
    if (!order) return fail(c, "order_not_found", "没有找到订单。", 404);
    if (!order.providerOrderNo) return fail(c, "missing_provider_order_no", "订单缺少微信商户订单号。", 400);

    const query = await queryWechatPaymentByOutTradeNo(order.providerOrderNo);
    if (!query.configured) return fail(c, "wechat_pay_not_configured", query.message || "微信支付未配置完整。", 400);
    const transaction = query.transaction;
    if (!transaction) return fail(c, "wechat_pay_empty_query", "微信支付查单没有返回交易数据。", 502);
    if (transaction.trade_state === "SUCCESS") {
      if (order.status !== "paid") {
        await db.update(orders).set({
          status: "paid",
          providerTransactionId: transaction.transaction_id || null,
          paidAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }).where(eq(orders.id, order.id));
      }
      await activateOrderEntitlement(order);
    }
    await logAdmin(admin!.id, "order.reconcile", "order", {
      orderId: order.id,
      providerOrderNo: order.providerOrderNo,
      tradeState: transaction.trade_state,
      transactionId: transaction.transaction_id
    });
    const [updated] = await db.select().from(orders).where(eq(orders.id, order.id)).limit(1);
    return ok(c, { order: updated || order, transaction });
  })
  .post("/orders/:id/rebuild-entitlement", async (c) => {
    const admin = await requireAdmin(c);
    const denied = requireAdminOrFail(c, admin);
    if (denied) return denied;
    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.tenantId, TENANT_ID), eq(orders.id, c.req.param("id"))))
      .limit(1);
    if (!order) return fail(c, "order_not_found", "没有找到订单。", 404);
    if (order.status !== "paid") return fail(c, "order_not_paid", "只有已支付订单可以补发权益。", 409);
    await activateOrderEntitlement(order);
    await logAdmin(admin!.id, "order.entitlement_rebuild", "order", { orderId: order.id });
    const rows = await db.select().from(entitlementLedger).where(and(eq(entitlementLedger.tenantId, TENANT_ID), eq(entitlementLedger.orderId, order.id))).orderBy(desc(entitlementLedger.createdAt)).limit(20);
    return ok(c, { order, entitlements: rows });
  })
  .get("/orders/:id", async (c) => {
    const admin = await requireAdmin(c);
    const denied = requireAdminOrFail(c, admin);
    if (denied) return denied;
    const id = c.req.param("id");
    const [order] = await db.select().from(orders).where(and(eq(orders.tenantId, TENANT_ID), eq(orders.id, id))).limit(1);
    if (!order) return fail(c, "order_not_found", "没有找到订单。", 404);
    const [letter] = order.letterId
      ? await db.select().from(salesLetters).where(and(eq(salesLetters.tenantId, TENANT_ID), eq(salesLetters.id, order.letterId))).limit(1)
      : [null];
    const [entitlements, events] = await Promise.all([
      db.select().from(entitlementLedger).where(and(eq(entitlementLedger.tenantId, TENANT_ID), eq(entitlementLedger.orderId, id))).orderBy(desc(entitlementLedger.createdAt)).limit(20),
      db.select().from(paymentWebhookEvents).where(and(eq(paymentWebhookEvents.tenantId, TENANT_ID), eq(paymentWebhookEvents.orderId, id))).orderBy(desc(paymentWebhookEvents.createdAt)).limit(20)
    ]);
    return ok(c, {
      order,
      letter: letter ? publicLetter(letter) : null,
      entitlements,
      events: events.map((event) => ({ ...event, payload: parseJson(event.payloadJson, null) }))
    });
  })
  .get("/entitlements", async (c) => {
    const admin = await requireAdmin(c);
    const denied = requireAdminOrFail(c, admin);
    if (denied) return denied;
    const rows = await db.select().from(entitlementLedger).where(eq(entitlementLedger.tenantId, TENANT_ID)).orderBy(desc(entitlementLedger.createdAt)).limit(100);
    return ok(c, { entitlements: rows });
  })
  .get("/entitlements/:id", async (c) => {
    const admin = await requireAdmin(c);
    const denied = requireAdminOrFail(c, admin);
    if (denied) return denied;
    const id = c.req.param("id");
    const [entitlement] = await db.select().from(entitlementLedger).where(and(eq(entitlementLedger.tenantId, TENANT_ID), eq(entitlementLedger.id, id))).limit(1);
    if (!entitlement) return fail(c, "entitlement_not_found", "没有找到权益流水。", 404);
    const [order] = entitlement.orderId
      ? await db.select().from(orders).where(and(eq(orders.tenantId, TENANT_ID), eq(orders.id, entitlement.orderId))).limit(1)
      : [null];
    const [letter] = entitlement.letterId
      ? await db.select().from(salesLetters).where(and(eq(salesLetters.tenantId, TENANT_ID), eq(salesLetters.id, entitlement.letterId))).limit(1)
      : [null];
    return ok(c, { entitlement, order, letter: letter ? publicLetter(letter) : null });
  })
  .get("/payment-events", async (c) => {
    const admin = await requireAdmin(c);
    const denied = requireAdminOrFail(c, admin);
    if (denied) return denied;
    const rows = await db.select().from(paymentWebhookEvents).where(eq(paymentWebhookEvents.tenantId, TENANT_ID)).orderBy(desc(paymentWebhookEvents.createdAt)).limit(100);
    return ok(c, { events: rows });
  })
  .get("/payment-events/:id", async (c) => {
    const admin = await requireAdmin(c);
    const denied = requireAdminOrFail(c, admin);
    if (denied) return denied;
    const id = c.req.param("id");
    const [event] = await db.select().from(paymentWebhookEvents).where(and(eq(paymentWebhookEvents.tenantId, TENANT_ID), eq(paymentWebhookEvents.id, id))).limit(1);
    if (!event) return fail(c, "payment_event_not_found", "没有找到回调事件。", 404);
    const [order] = event.orderId
      ? await db.select().from(orders).where(and(eq(orders.tenantId, TENANT_ID), eq(orders.id, event.orderId))).limit(1)
      : [null];
    return ok(c, { event: { ...event, payload: parseJson(event.payloadJson, null) }, order });
  })
  .get("/audit-logs", async (c) => {
    const admin = await requireAdmin(c);
    const denied = requireAdminOrFail(c, admin);
    if (denied) return denied;
    const rows = await db.select().from(auditLogs).where(eq(auditLogs.tenantId, TENANT_ID)).orderBy(desc(auditLogs.createdAt)).limit(100);
    return ok(c, { logs: rows.map((log) => ({ ...log, detail: parseJson(log.detailJson, null) })) });
  })
  .get("/audit-logs/:id", async (c) => {
    const admin = await requireAdmin(c);
    const denied = requireAdminOrFail(c, admin);
    if (denied) return denied;
    const id = c.req.param("id");
    const [log] = await db.select().from(auditLogs).where(and(eq(auditLogs.tenantId, TENANT_ID), eq(auditLogs.id, id))).limit(1);
    if (!log) return fail(c, "audit_log_not_found", "没有找到审计日志。", 404);
    return ok(c, { log: { ...log, detail: parseJson(log.detailJson, null) } });
  });
