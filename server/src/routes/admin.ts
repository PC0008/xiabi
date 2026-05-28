import { db, secret, storage, vars } from "edgespark";
import { and, desc, eq } from "drizzle-orm";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { Hono } from "hono";
import { adminSessions, adminUsers, auditLogs, buckets, entitlementLedger, files, generationTasks, guestSessions, orders, paymentWebhookEvents, productProfiles, salesLetters, users } from "@defs";
import type { SecretKey, VarKey } from "@defs";
import { generateSalesLetterWithDeepSeek, SalesLetterContent } from "../adapters/letter/deepseek";
import { isExpectedWechatAppId, queryWechatPaymentByOutTradeNo } from "../adapters/payment/wechat";
import { getAdminConfig, upsertConfigScope } from "../domain/config";
import { ConfigScope, configScopes, TENANT_ID } from "../domain/defaults";
import { activateOrderEntitlement, markOrderPaidAndGrantEntitlement } from "../domain/entitlements";
import { fail, ok, parseJson, readJson } from "../domain/http";
import { optionalSecret, optionalVar } from "../domain/runtime";
import { createToken, daysFromNow, hashPassword, hashToken, isFuture } from "../domain/security";

const ADMIN_COOKIE = "xiabi_admin_session";
const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 200;
const ADMIN_LOGIN_FAILURE_LIMIT = 8;
const ADMIN_LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_USERNAME_MAX_LENGTH = 64;
const ADMIN_PASSWORD_MAX_LENGTH = 256;
const MAX_CONFIG_AUDIT_CHANGES = 80;

type AdminLoginBody = {
  username: string;
  password: string;
};

type AdminPasswordBody = {
  currentPassword?: string;
  newPassword?: string;
};

type AdminCreateBody = {
  username?: string;
  displayName?: string;
  password?: string;
};

type AdminUpdateBody = {
  displayName?: string;
  status?: string;
  password?: string;
};

type FeedbackStatusBody = {
  status?: string;
  note?: string;
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

function getVar(key: VarKey) {
  return String(vars.get(key) || "").trim();
}

function hasVar(key: VarKey) {
  return !!getVar(key);
}

function hasSecret(key: SecretKey) {
  return !!String(secret.get(key) || "").trim();
}

function hasOptionalVar(key: string) {
  return !!optionalVar(key);
}

function hasOptionalSecret(key: string) {
  return !!optionalSecret(key);
}

function listLimit(c: any) {
  const parsed = Number(c.req.query("limit") || DEFAULT_LIST_LIMIT);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIST_LIMIT;
  return Math.min(Math.floor(parsed), MAX_LIST_LIMIT);
}

function listPaging(c: any) {
  const limit = listLimit(c);
  const parsedPage = Number(c.req.query("page") || "1");
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.floor(parsedPage) : 1;
  return { limit, page, offset: (page - 1) * limit };
}

function pageInfo(input: { page: number; limit: number; count: number }) {
  return {
    page: input.page,
    limit: input.limit,
    returned: Math.min(input.count, input.limit),
    hasMore: input.count > input.limit
  };
}

function queryStatus(c: any, allowed: string[]) {
  const status = String(c.req.query("status") || "").trim();
  return allowed.includes(status) ? status : "";
}

function diagnosticStatus(required: boolean[], optional: boolean[] = []): DiagnosticStatus {
  if (required.every(Boolean) && optional.every(Boolean)) return "ok";
  if (required.every(Boolean)) return "warn";
  return "missing";
}

function diagnosticItem(name: string, configured: boolean, required = true) {
  return { name, configured, required };
}

type StoredWechatNotification = {
  event_type?: string;
  resource?: {
    ciphertext?: string;
    nonce?: string;
    associated_data?: string;
  };
};

type StoredWechatTransaction = {
  appid?: string;
  mchid?: string;
  out_trade_no?: string;
  transaction_id?: string;
  trade_state?: string;
  amount?: {
    total?: number;
    currency?: string;
  };
};

function base64ToArrayBuffer(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function decryptStoredWechatResource(resource: NonNullable<StoredWechatNotification["resource"]>) {
  const apiV3Key = secret.get("WECHAT_PAY_API_V3_KEY");
  if (!apiV3Key || !resource.ciphertext || !resource.nonce) throw new Error("wechat_pay_decrypt_config_missing");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(apiV3Key), "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: new TextEncoder().encode(resource.nonce),
      additionalData: new TextEncoder().encode(resource.associated_data || ""),
      tagLength: 128
    },
    key,
    base64ToArrayBuffer(resource.ciphertext)
  );
  return JSON.parse(new TextDecoder().decode(plain)) as StoredWechatTransaction;
}

function validateStoredWechatTransaction(notification: StoredWechatNotification, transaction: StoredWechatTransaction, order: typeof orders.$inferSelect) {
  if (notification.event_type !== "TRANSACTION.SUCCESS") throw new Error("unexpected_event_type");
  if (transaction.trade_state !== "SUCCESS") throw new Error("unexpected_trade_state");
  if (transaction.out_trade_no !== order.providerOrderNo) throw new Error("out_trade_no_mismatch");
  if (!transaction.transaction_id) throw new Error("transaction_id_missing");
  const expectedMchId = vars.get("WECHAT_PAY_MCH_ID");
  if (!isExpectedWechatAppId(transaction.appid)) throw new Error("appid_mismatch");
  if (!expectedMchId || transaction.mchid !== expectedMchId) throw new Error("mchid_mismatch");
  if (Number(transaction.amount?.total) !== Number(order.amountCents)) throw new Error("amount_mismatch");
  if (transaction.amount?.currency !== order.currency) throw new Error("currency_mismatch");
}

async function buildDiagnostics() {
  const [adminUser] = await db.select().from(adminUsers).where(eq(adminUsers.tenantId, TENANT_ID)).limit(1);
  const publicBaseUrl = getVar("PUBLIC_BASE_URL");
  const notifyUrl = getVar("PAYMENT_NOTIFY_URL");
  const voiceAsrSecretConfigured = hasOptionalSecret("VOICE_ASR_API_KEY") || hasSecret("VOICE_API_KEY");
  const wechatPlatformVerifierConfigured = hasOptionalSecret("WECHAT_PAY_PLATFORM_PUBLIC_KEY") || (
    hasVar("WECHAT_PAY_MCH_ID") &&
    hasSecret("WECHAT_PAY_PRIVATE_KEY") &&
    hasSecret("WECHAT_PAY_CERT_SERIAL_NO") &&
    hasSecret("WECHAT_PAY_API_V3_KEY")
  );
  const [paidOrders, entitlements, failedPaymentEvents, failedTasks] = await Promise.all([
    db.select().from(orders).where(and(eq(orders.tenantId, TENANT_ID), eq(orders.status, "paid"))).orderBy(desc(orders.createdAt)).limit(100),
    db.select().from(entitlementLedger).where(eq(entitlementLedger.tenantId, TENANT_ID)).orderBy(desc(entitlementLedger.createdAt)).limit(500),
    db.select().from(paymentWebhookEvents).where(and(eq(paymentWebhookEvents.tenantId, TENANT_ID), eq(paymentWebhookEvents.status, "failed"))).orderBy(desc(paymentWebhookEvents.createdAt)).limit(50),
    db.select().from(generationTasks).where(and(eq(generationTasks.tenantId, TENANT_ID), eq(generationTasks.status, "failed"))).orderBy(desc(generationTasks.createdAt)).limit(50)
  ]);
  const entitlementOrderIds = new Set(entitlements.map((item) => item.orderId).filter(Boolean));
  const paidOrdersWithoutEntitlement = paidOrders.filter((order) => !entitlementOrderIds.has(order.id));
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
          wechatPlatformVerifierConfigured
        ], [hasVar("PAYMENT_PROVIDER"), hasVar("WECHAT_MP_APP_ID"), !!publicBaseUrl, !!notifyUrl, hasOptionalSecret("WECHAT_MP_APP_SECRET")]),
        items: [
          diagnosticItem("PAYMENT_PROVIDER", hasVar("PAYMENT_PROVIDER"), false),
          diagnosticItem("WECHAT_PAY_APP_ID", hasVar("WECHAT_PAY_APP_ID")),
          diagnosticItem("WECHAT_MP_APP_ID", hasVar("WECHAT_MP_APP_ID"), false),
        diagnosticItem("WECHAT_PAY_MCH_ID", hasVar("WECHAT_PAY_MCH_ID")),
        diagnosticItem("WECHAT_PAY_PRIVATE_KEY", hasSecret("WECHAT_PAY_PRIVATE_KEY")),
        diagnosticItem("WECHAT_PAY_CERT_SERIAL_NO", hasSecret("WECHAT_PAY_CERT_SERIAL_NO")),
          diagnosticItem("WECHAT_PAY_API_V3_KEY", hasSecret("WECHAT_PAY_API_V3_KEY")),
          diagnosticItem("WECHAT_PAY_PLATFORM_PUBLIC_KEY", hasOptionalSecret("WECHAT_PAY_PLATFORM_PUBLIC_KEY"), false),
          diagnosticItem("wechat_platform_certificate_auto_fetch", wechatPlatformVerifierConfigured, false),
          diagnosticItem("WECHAT_MP_APP_SECRET", hasOptionalSecret("WECHAT_MP_APP_SECRET"), false),
          diagnosticItem("PUBLIC_BASE_URL", !!publicBaseUrl, false),
          diagnosticItem("PAYMENT_NOTIFY_URL", !!notifyUrl, false)
        ],
        note: "可手动配置平台公钥，也可由服务端用商户凭据自动拉取微信平台证书完成回调验签；微信内支付会走 JSAPI/openid 授权链路。"
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
        diagnosticItem("MINIMAX_GROUP_ID", hasVar("MINIMAX_GROUP_ID"), false),
        diagnosticItem("MINIMAX_VOICE_ID", hasVar("MINIMAX_VOICE_ID")),
        diagnosticItem("MINIMAX_TTS_ENDPOINT", hasVar("MINIMAX_TTS_ENDPOINT"), false),
        diagnosticItem("MINIMAX_TTS_OUTPUT_FORMAT", hasVar("MINIMAX_TTS_OUTPUT_FORMAT"), false),
        diagnosticItem("MINIMAX_TTS_MODEL", hasVar("MINIMAX_TTS_MODEL"), false)
      ],
      note: "用于智多星说话播放，当前按 MiniMax TTS 接入；端点、输出格式和模型可选配置，未填写时使用默认值。"
    },
    {
      key: "voice_asr",
      title: "语音输入转写",
      status: diagnosticStatus([hasOptionalVar("VOICE_ASR_ENDPOINT"), voiceAsrSecretConfigured], [hasOptionalVar("VOICE_ASR_PROVIDER"), hasOptionalVar("VOICE_ASR_MODEL"), hasOptionalVar("VOICE_ASR_REQUEST_FORMAT"), hasOptionalVar("VOICE_INPUT_MODE"), hasOptionalVar("VOICE_ASR_VERIFIED")]),
      items: [
        diagnosticItem("VOICE_ASR_ENDPOINT", hasOptionalVar("VOICE_ASR_ENDPOINT")),
        diagnosticItem("VOICE_ASR_API_KEY 或 VOICE_API_KEY", voiceAsrSecretConfigured),
        diagnosticItem("VOICE_ASR_PROVIDER", hasOptionalVar("VOICE_ASR_PROVIDER"), false),
        diagnosticItem("VOICE_ASR_MODEL", hasOptionalVar("VOICE_ASR_MODEL"), false),
        diagnosticItem("VOICE_ASR_REQUEST_FORMAT", hasOptionalVar("VOICE_ASR_REQUEST_FORMAT"), false),
        diagnosticItem("VOICE_INPUT_MODE", hasOptionalVar("VOICE_INPUT_MODE"), false),
        diagnosticItem("VOICE_ASR_VERIFIED", hasOptionalVar("VOICE_ASR_VERIFIED"), false)
      ],
      note: "浏览器不支持直接语音识别，或配置 VOICE_INPUT_MODE=server 时会走这里；支持 JSON base64 和 OpenAI-compatible multipart，真实音频验收通过并设置 VOICE_ASR_VERIFIED=1 后，用户端才会把服务端录音转写视为可用。MiniMax 官方 API 总览当前公开列出的是 T2A、T2A Async、Voice Cloning、Voice Design、Voice Management，未列出独立 ASR 端点；若要输入也走 MiniMax，需要先拿到账号后台实际转写 endpoint。"
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
    },
    {
      key: "business_closure",
      title: "业务闭环",
      status: diagnosticStatus([paidOrdersWithoutEntitlement.length === 0, failedPaymentEvents.length === 0], [failedTasks.length === 0]),
      items: [
        diagnosticItem(`已支付无权益订单：${paidOrdersWithoutEntitlement.length}`, paidOrdersWithoutEntitlement.length === 0),
        diagnosticItem(`失败支付回调：${failedPaymentEvents.length}`, failedPaymentEvents.length === 0),
        diagnosticItem(`失败生成任务：${failedTasks.length}`, failedTasks.length === 0, false)
      ],
      note: "发现异常时可在订单详情补发权益，或在支付回调详情重新处理。"
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
    unclaimed_notice_desc: cleanText(input.unclaimed_notice_desc || "可以继续回来查看完整内容。", 100),
    unclaimed_button_text: cleanText(input.unclaimed_button_text || "领取我的销售信", 40),
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
    annual_badge_text: cleanText(input.annual_badge_text || "更划算", 20),
    upgrade_discount_enabled: cleanBoolean(input.upgrade_discount_enabled, true),
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function jsonEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function compactAuditValue(value: unknown): unknown {
  if (typeof value === "string") return value.length > 160 ? `${value.slice(0, 157)}...` : value;
  if (typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      preview: value.slice(0, 3).map(compactAuditValue)
    };
  }
  if (isPlainObject(value)) {
    return {
      type: "object",
      keys: Object.keys(value).slice(0, 12)
    };
  }
  return String(value);
}

function collectConfigChanges(scope: string, before: unknown, after: unknown, path: string[], changes: Array<Record<string, unknown>>) {
  if (changes.length >= MAX_CONFIG_AUDIT_CHANGES || jsonEqual(before, after)) return;
  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
    for (const key of keys) collectConfigChanges(scope, before[key], after[key], [...path, key], changes);
    return;
  }
  changes.push({
    path: [scope, ...path].join("."),
    before: compactAuditValue(before),
    after: compactAuditValue(after)
  });
}

function buildConfigAuditDiff(beforeConfig: Record<string, unknown>, afterConfig: Partial<Record<ConfigScope, unknown>>) {
  const changes: Array<Record<string, unknown>> = [];
  for (const [scope, data] of Object.entries(afterConfig)) {
    collectConfigChanges(scope, beforeConfig[scope], data, [], changes);
  }
  return {
    changedCount: changes.length,
    truncated: changes.length >= MAX_CONFIG_AUDIT_CHANGES,
    changes
  };
}

async function logAdmin(adminId: string, action: string, targetType?: string, detail?: unknown, targetId?: string) {
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    tenantId: TENANT_ID,
    actorId: adminId,
    actorType: "admin",
    action,
    targetType,
    targetId,
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

function normalizeLoginName(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

async function recentLoginFailureCount(username: string) {
  const normalized = normalizeLoginName(username);
  const rows = await db
    .select({ createdAt: auditLogs.createdAt, detailJson: auditLogs.detailJson })
    .from(auditLogs)
    .where(and(eq(auditLogs.tenantId, TENANT_ID), eq(auditLogs.action, "admin.login_failed")))
    .orderBy(desc(auditLogs.createdAt))
    .limit(100);
  const cutoff = Date.now() - ADMIN_LOGIN_FAILURE_WINDOW_MS;
  return rows.filter((row) => {
    if (new Date(row.createdAt).getTime() < cutoff) return false;
    const detail = parseJson<Record<string, unknown>>(row.detailJson, {});
    return normalizeLoginName(detail.username) === normalized;
  }).length;
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
    role: admin.role,
    status: admin.status,
    lastLoginAt: admin.lastLoginAt,
    createdAt: admin.createdAt,
    updatedAt: admin.updatedAt
  };
}

function buildFeedbackRows(rows: Array<typeof auditLogs.$inferSelect>) {
  const actionsByTarget = new Map<string, typeof auditLogs.$inferSelect[]>();
  rows.filter((row) => row.action.startsWith("feedback.") && row.action !== "feedback.submit").forEach((row) => {
    const targetId = row.targetId || "";
    if (!targetId) return;
    actionsByTarget.set(targetId, [...(actionsByTarget.get(targetId) || []), row]);
  });
  return rows
    .filter((row) => row.action === "feedback.submit")
    .map((row) => {
      const events = actionsByTarget.get(row.id) || actionsByTarget.get(row.targetId || "") || [];
      const latest = events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      const latestDetail = parseJson(latest?.detailJson, {}) as Record<string, unknown>;
      return {
        ...row,
        targetId: row.targetId || row.id,
        detail: parseJson(row.detailJson, {}),
        feedbackStatus: latest?.action === "feedback.reopen" ? "open" : latest?.action === "feedback.resolve" ? "resolved" : "open",
        handledAt: latest?.createdAt || null,
        handledBy: latest?.actorId || null,
        handlerNote: latestDetail.note || ""
      };
    });
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

type AnswerItem = {
  index?: number;
  question?: string;
  desc?: string;
  answer?: string;
};

function cleanTaskString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeAnswerItems(items: unknown, answers: string[]) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const data = item as AnswerItem;
      return {
        index: Number.isFinite(Number(data.index)) ? Number(data.index) : index,
        question: cleanTaskString(data.question),
        desc: cleanTaskString(data.desc),
        answer: cleanTaskString(data.answer) || answers[index] || "用户未补充。"
      };
    })
    .filter((item) => item && item.question && item.answer);
}

function parseTaskInput(task: typeof generationTasks.$inferSelect) {
  const payload = parseJson<{ answers?: unknown; input?: unknown }>(task.inputJson, {});
  const answers = Array.isArray(payload.answers) ? payload.answers.map(String).filter(Boolean) : [];
  const input = payload.input && typeof payload.input === "object" && !Array.isArray(payload.input)
    ? payload.input as Record<string, unknown>
    : {};
  const answerItems = normalizeAnswerItems(input.answerItems, answers);
  if (answerItems.length) input.answerItems = answerItems;
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

function publicProfile(profile: typeof productProfiles.$inferSelect) {
  return {
    ...profile,
    summary: [profile.audience, profile.value].filter(Boolean).join(" · ")
  };
}

async function publicFile(file: typeof files.$inferSelect) {
  const signed = await storage
    .from(buckets.xiabiFiles)
    .createPresignedGetUrl(file.objectKey, 900)
    .catch(() => null);
  return {
    ...file,
    downloadUrl: signed?.downloadUrl || "",
    expiresInSeconds: signed ? 900 : 0
  };
}

function requireAdminOrFail(c: any, admin: typeof adminUsers.$inferSelect | null) {
  if (!admin) return fail(c, "not_authenticated", "请先登录后台。", 401);
  return null;
}

function requireOwnerOrFail(c: any, admin: typeof adminUsers.$inferSelect | null) {
  const denied = requireAdminOrFail(c, admin);
  if (denied) return denied;
  if (admin!.role !== "owner") return fail(c, "admin_permission_denied", "当前账号没有权限执行这个操作。", 403);
  return null;
}

export const adminRoutes = new Hono()
  .post("/login", async (c) => {
    const body = await readJson<AdminLoginBody>(c);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (!username || !password) return fail(c, "missing_credentials", "请输入账号和密码。", 400);
    if (username.length > ADMIN_USERNAME_MAX_LENGTH || password.length > ADMIN_PASSWORD_MAX_LENGTH) {
      return fail(c, "admin_credentials_too_long", "账号或密码长度超出限制。", 413);
    }
    if (await recentLoginFailureCount(username) >= ADMIN_LOGIN_FAILURE_LIMIT) {
      await logAdminFailure("admin.login_rate_limited", { username, windowMinutes: ADMIN_LOGIN_FAILURE_WINDOW_MS / 60000 });
      return fail(c, "admin_login_rate_limited", "登录尝试过于频繁，请稍后再试。", 429);
    }

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
  .post("/password", async (c) => {
    const admin = await requireAdmin(c);
    if (!admin) return fail(c, "not_authenticated", "请先登录后台。", 401);
    const body = await readJson<AdminPasswordBody>(c);
    const currentPassword = String(body.currentPassword || "");
    const newPassword = String(body.newPassword || "");
    if (!currentPassword || !newPassword) return fail(c, "missing_password", "请输入当前密码和新密码。", 400);
    if (newPassword.length < 10) return fail(c, "weak_password", "新密码至少需要 10 位。", 400);
    if (currentPassword.length > ADMIN_PASSWORD_MAX_LENGTH || newPassword.length > ADMIN_PASSWORD_MAX_LENGTH) {
      return fail(c, "admin_password_too_long", "密码长度超出限制。", 413);
    }
    const pepper = secret.get("ADMIN_PASSWORD_PEPPER");
    if (!pepper) return fail(c, "admin_pepper_missing", "后台密码安全配置缺失。", 500);
    if (await hashPassword(currentPassword, pepper) !== admin.passwordHash) {
      await logAdmin(admin.id, "admin.password_change_failed", "admin_user", { reason: "current_password_not_match" });
      return fail(c, "password_not_match", "当前密码不正确。", 403);
    }
    await db.update(adminUsers).set({
      passwordHash: await hashPassword(newPassword, pepper),
      updatedAt: new Date().toISOString()
    }).where(eq(adminUsers.id, admin.id));
    await db.delete(adminSessions).where(eq(adminSessions.adminId, admin.id));
    deleteCookie(c, ADMIN_COOKIE, { path: "/" });
    await logAdmin(admin.id, "admin.password_changed", "admin_user", { username: admin.username });
    return ok(c, { changed: true });
  })
  .get("/admins", async (c) => {
    const admin = await requireAdmin(c);
    const denied = requireAdminOrFail(c, admin);
    if (denied) return denied;
    const rows = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.tenantId, TENANT_ID))
      .orderBy(desc(adminUsers.createdAt))
      .limit(100);
    return ok(c, { admins: rows.map(publicAdmin), canCreate: admin!.role === "owner" });
  })
  .post("/admins", async (c) => {
    const admin = await requireAdmin(c);
    const denied = requireOwnerOrFail(c, admin);
    if (denied) return denied;
    const body = await readJson<AdminCreateBody>(c);
    const username = String(body.username || "").trim();
    const displayName = String(body.displayName || username || "运营账号").trim();
    const password = String(body.password || "");
    if (!username || !password) return fail(c, "missing_admin_account", "请输入账号和初始密码。", 400);
    if (!/^[a-zA-Z0-9_.@-]{3,64}$/.test(username)) {
      return fail(c, "invalid_admin_username", "账号需为 3-64 位字母、数字或 . _ @ -。", 400);
    }
    if (displayName.length > 40) return fail(c, "admin_display_name_too_long", "显示名称最多 40 位。", 413);
    if (password.length < 10) return fail(c, "weak_password", "初始密码至少需要 10 位。", 400);
    if (password.length > ADMIN_PASSWORD_MAX_LENGTH) return fail(c, "admin_password_too_long", "密码长度超出限制。", 413);
    const [existing] = await db
      .select({ id: adminUsers.id })
      .from(adminUsers)
      .where(and(eq(adminUsers.tenantId, TENANT_ID), eq(adminUsers.username, username)))
      .limit(1);
    if (existing) return fail(c, "admin_username_exists", "这个后台账号已存在。", 409);
    const pepper = secret.get("ADMIN_PASSWORD_PEPPER");
    if (!pepper) return fail(c, "admin_pepper_missing", "后台密码安全配置缺失。", 500);
    const [created] = await db.insert(adminUsers).values({
      id: crypto.randomUUID(),
      tenantId: TENANT_ID,
      username,
      displayName,
      role: "viewer",
      passwordHash: await hashPassword(password, pepper),
      status: "active"
    }).returning();
    await logAdmin(admin!.id, "admin.create", "admin_user", { username, displayName, role: "viewer" }, created.id);
    return ok(c, { admin: publicAdmin(created) });
  })
  .patch("/admins/:id", async (c) => {
    const admin = await requireAdmin(c);
    const denied = requireOwnerOrFail(c, admin);
    if (denied) return denied;
    const id = c.req.param("id");
    const body = await readJson<AdminUpdateBody>(c);
    const [target] = await db
      .select()
      .from(adminUsers)
      .where(and(eq(adminUsers.tenantId, TENANT_ID), eq(adminUsers.id, id)))
      .limit(1);
    if (!target) return fail(c, "admin_not_found", "后台账号不存在。", 404);
    if (target.role === "owner") return fail(c, "owner_account_protected", "Owner 账号不能在这里修改。", 403);

    const updates: Partial<typeof adminUsers.$inferInsert> = { updatedAt: new Date().toISOString() };
    const auditDetail: Record<string, unknown> = { username: target.username, role: target.role };
    const displayName = body.displayName === undefined ? undefined : String(body.displayName || "").trim();
    if (displayName !== undefined) {
      if (!displayName) return fail(c, "missing_admin_display_name", "请输入显示名称。", 400);
      if (displayName.length > 40) return fail(c, "admin_display_name_too_long", "显示名称最多 40 位。", 413);
      updates.displayName = displayName;
      auditDetail.displayName = displayName;
    }

    const status = body.status === undefined ? undefined : String(body.status || "").trim();
    if (status !== undefined) {
      if (!["active", "disabled"].includes(status)) return fail(c, "invalid_admin_status", "账号状态不正确。", 400);
      updates.status = status;
      auditDetail.status = status;
    }

    const password = body.password === undefined ? "" : String(body.password || "");
    if (password) {
      if (password.length < 10) return fail(c, "weak_password", "新密码至少需要 10 位。", 400);
      if (password.length > ADMIN_PASSWORD_MAX_LENGTH) return fail(c, "admin_password_too_long", "密码长度超出限制。", 413);
      const pepper = secret.get("ADMIN_PASSWORD_PEPPER");
      if (!pepper) return fail(c, "admin_pepper_missing", "后台密码安全配置缺失。", 500);
      updates.passwordHash = await hashPassword(password, pepper);
      auditDetail.passwordReset = true;
    }

    if (Object.keys(updates).length === 1) return fail(c, "missing_admin_update", "没有需要修改的后台账号内容。", 400);
    const [updated] = await db.update(adminUsers).set(updates).where(eq(adminUsers.id, target.id)).returning();
    if (updates.status === "disabled" || updates.passwordHash) {
      await db.delete(adminSessions).where(eq(adminSessions.adminId, target.id));
    }
    await logAdmin(admin!.id, "admin.update", "admin_user", auditDetail, target.id);
    return ok(c, { admin: publicAdmin(updated) });
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
    const denied = requireOwnerOrFail(c, admin);
    if (denied) return denied;
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
    const beforeConfig = await getAdminConfig(db) as Record<string, unknown>;
    const auditDiff = buildConfigAuditDiff(beforeConfig, sanitized);
    for (const [scope, data] of Object.entries(sanitized)) {
      await upsertConfigScope(db, scope as ConfigScope, data, admin!.id);
    }
    await logAdmin(admin!.id, "config.update", "app_config", { scopes: Object.keys(sanitized), ...auditDiff });
    return ok(c, await getAdminConfig(db));
  })
  .get("/dashboard", async (c) => {
    const admin = await requireAdmin(c);
    const denied = requireAdminOrFail(c, admin);
    if (denied) return denied;
    const [sessionRows, letterRows, orderRows, taskRows, profileRows] = await Promise.all([
      db.select().from(guestSessions).where(eq(guestSessions.tenantId, TENANT_ID)).limit(200),
      db.select().from(salesLetters).where(eq(salesLetters.tenantId, TENANT_ID)).limit(200),
      db.select().from(orders).where(eq(orders.tenantId, TENANT_ID)).limit(200),
      db.select().from(generationTasks).where(eq(generationTasks.tenantId, TENANT_ID)).limit(200),
      db.select().from(productProfiles).where(and(eq(productProfiles.tenantId, TENANT_ID), eq(productProfiles.status, "active"))).limit(200)
    ]);
    return ok(c, {
      metrics: {
        sessions: sessionRows.length,
        profiles: profileRows.length,
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
    const paging = listPaging(c);
    const [sessionRows, userRows] = await Promise.all([
      db.select().from(guestSessions).where(eq(guestSessions.tenantId, TENANT_ID)).orderBy(desc(guestSessions.createdAt)).limit(paging.limit + 1).offset(paging.offset),
      db.select().from(users).where(eq(users.tenantId, TENANT_ID)).orderBy(desc(users.createdAt)).limit(paging.limit + 1).offset(paging.offset)
    ]);
    return ok(c, {
      users: userRows.slice(0, paging.limit),
      sessions: sessionRows.slice(0, paging.limit),
      pageInfo: pageInfo({ ...paging, count: Math.max(userRows.length, sessionRows.length) })
    });
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
    const [sessions, letters, profiles, orderRows, entitlements] = await Promise.all([
      userId
        ? db.select().from(guestSessions).where(and(eq(guestSessions.tenantId, TENANT_ID), eq(guestSessions.userId, userId))).orderBy(desc(guestSessions.createdAt)).limit(20)
        : db.select().from(guestSessions).where(and(eq(guestSessions.tenantId, TENANT_ID), eq(guestSessions.id, sessionId))).limit(1),
      sessionId
        ? db.select().from(salesLetters).where(and(eq(salesLetters.tenantId, TENANT_ID), eq(salesLetters.sessionId, sessionId))).orderBy(desc(salesLetters.createdAt)).limit(20)
        : db.select().from(salesLetters).where(and(eq(salesLetters.tenantId, TENANT_ID), eq(salesLetters.userId, userId))).orderBy(desc(salesLetters.createdAt)).limit(20),
      sessionId
        ? db.select().from(productProfiles).where(and(eq(productProfiles.tenantId, TENANT_ID), eq(productProfiles.sessionId, sessionId))).orderBy(desc(productProfiles.updatedAt)).limit(20)
        : db.select().from(productProfiles).where(and(eq(productProfiles.tenantId, TENANT_ID), eq(productProfiles.userId, userId))).orderBy(desc(productProfiles.updatedAt)).limit(20),
      sessionId
        ? db.select().from(orders).where(and(eq(orders.tenantId, TENANT_ID), eq(orders.sessionId, sessionId))).orderBy(desc(orders.createdAt)).limit(20)
        : db.select().from(orders).where(and(eq(orders.tenantId, TENANT_ID), eq(orders.userId, userId))).orderBy(desc(orders.createdAt)).limit(20),
      sessionId
        ? db.select().from(entitlementLedger).where(and(eq(entitlementLedger.tenantId, TENANT_ID), eq(entitlementLedger.sessionId, sessionId))).orderBy(desc(entitlementLedger.createdAt)).limit(20)
        : db.select().from(entitlementLedger).where(and(eq(entitlementLedger.tenantId, TENANT_ID), eq(entitlementLedger.userId, userId))).orderBy(desc(entitlementLedger.createdAt)).limit(20)
    ]);
    return ok(c, { user, session, sessions, letters: letters.map(publicLetter), profiles: profiles.map(publicProfile), orders: orderRows, entitlements });
  })
  .get("/profiles", async (c) => {
    const admin = await requireAdmin(c);
    const denied = requireAdminOrFail(c, admin);
    if (denied) return denied;
    const status = queryStatus(c, ["active", "deleted"]);
    const paging = listPaging(c);
    const where = status ? and(eq(productProfiles.tenantId, TENANT_ID), eq(productProfiles.status, status)) : eq(productProfiles.tenantId, TENANT_ID);
    const rows = await db.select().from(productProfiles).where(where).orderBy(desc(productProfiles.updatedAt)).limit(paging.limit + 1).offset(paging.offset);
    return ok(c, { profiles: rows.slice(0, paging.limit).map(publicProfile), pageInfo: pageInfo({ ...paging, count: rows.length }) });
  })
  .get("/profiles/:id", async (c) => {
    const admin = await requireAdmin(c);
    const denied = requireAdminOrFail(c, admin);
    if (denied) return denied;
    const id = c.req.param("id");
    const [profile] = await db.select().from(productProfiles).where(and(eq(productProfiles.tenantId, TENANT_ID), eq(productProfiles.id, id))).limit(1);
    if (!profile) return fail(c, "profile_not_found", "没有找到这个产品档案。", 404);
    const [user] = profile.userId
      ? await db.select().from(users).where(and(eq(users.tenantId, TENANT_ID), eq(users.id, profile.userId))).limit(1)
      : [null];
    const [session] = profile.sessionId
      ? await db.select().from(guestSessions).where(and(eq(guestSessions.tenantId, TENANT_ID), eq(guestSessions.id, profile.sessionId))).limit(1)
      : [null];
    return ok(c, { profile: publicProfile(profile), user, session });
  })
  .get("/letters", async (c) => {
    const admin = await requireAdmin(c);
    const denied = requireAdminOrFail(c, admin);
    if (denied) return denied;
    const status = queryStatus(c, ["draft", "ready", "claimed", "archived"]);
    const paging = listPaging(c);
    const where = status ? and(eq(salesLetters.tenantId, TENANT_ID), eq(salesLetters.status, status)) : eq(salesLetters.tenantId, TENANT_ID);
    const rows = await db.select().from(salesLetters).where(where).orderBy(desc(salesLetters.createdAt)).limit(paging.limit + 1).offset(paging.offset);
    return ok(c, { letters: rows.slice(0, paging.limit).map(publicLetter), pageInfo: pageInfo({ ...paging, count: rows.length }) });
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
    return ok(c, {
      letter: publicLetter(letter),
      tasks: taskRows.map(publicTask),
      orders: orderRows,
      entitlements,
      files: await Promise.all(fileRows.map(publicFile))
    });
  })
  .get("/tasks", async (c) => {
    const admin = await requireAdmin(c);
    const denied = requireAdminOrFail(c, admin);
    if (denied) return denied;
    const status = queryStatus(c, ["queued", "running", "succeeded", "failed"]);
    const paging = listPaging(c);
    const where = status ? and(eq(generationTasks.tenantId, TENANT_ID), eq(generationTasks.status, status)) : eq(generationTasks.tenantId, TENANT_ID);
    const rows = await db.select().from(generationTasks).where(where).orderBy(desc(generationTasks.createdAt)).limit(paging.limit + 1).offset(paging.offset);
    return ok(c, { tasks: rows.slice(0, paging.limit).map(publicTask), pageInfo: pageInfo({ ...paging, count: rows.length }) });
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
    const denied = requireOwnerOrFail(c, admin);
    if (denied) return denied;
    const id = c.req.param("id");
    const [task] = await db.select().from(generationTasks).where(and(eq(generationTasks.tenantId, TENANT_ID), eq(generationTasks.id, id))).limit(1);
    if (!task) return fail(c, "task_not_found", "没有找到任务。", 404);
    if (task.status !== "failed") return fail(c, "task_not_failed", "只有失败任务可以重试。", 409);
    const { answers, input } = parseTaskInput(task);
    if (!answers.length) return fail(c, "missing_task_input", "任务缺少可重试的信息。", 400);

    const config = await getAdminConfig(db);
    const home = config.home as Record<string, unknown>;
    const system = config.system as Record<string, unknown>;
    if (home.generation_entry_enabled === false || system.generation_enabled === false) {
      return fail(c, "generation_disabled", "写信入口暂未开放。", 403);
    }
    const templates = config.templates;
    const templateMeta = selectTemplateMeta(templates);
    const [lockedTask] = await db.update(generationTasks).set({
      status: "running",
      progressJson: JSON.stringify({ percent: 20, stage: "retrying", provider: "deepseek" }),
      errorCode: null,
      errorMessage: null,
      attempts: Number(task.attempts || 0) + 1,
      updatedAt: new Date().toISOString()
    }).where(and(eq(generationTasks.tenantId, TENANT_ID), eq(generationTasks.id, id), eq(generationTasks.status, "failed"))).returning();
    if (!lockedTask) {
      return fail(c, "task_retry_conflict", "任务状态已经变化，请刷新后再试。", 409);
    }

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
    const status = queryStatus(c, ["pending", "paid", "payment_failed", "closed", "refunded"]);
    const paging = listPaging(c);
    const where = status ? and(eq(orders.tenantId, TENANT_ID), eq(orders.status, status)) : eq(orders.tenantId, TENANT_ID);
    const rows = await db.select().from(orders).where(where).orderBy(desc(orders.createdAt)).limit(paging.limit + 1).offset(paging.offset);
    return ok(c, { orders: rows.slice(0, paging.limit), pageInfo: pageInfo({ ...paging, count: rows.length }) });
  })
  .post("/orders/:id/reconcile", async (c) => {
    const admin = await requireAdmin(c);
    const denied = requireOwnerOrFail(c, admin);
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
      await markOrderPaidAndGrantEntitlement(order, transaction);
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
    const denied = requireOwnerOrFail(c, admin);
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
    const status = queryStatus(c, ["active", "consumed", "expired", "revoked"]);
    const paging = listPaging(c);
    const where = status ? and(eq(entitlementLedger.tenantId, TENANT_ID), eq(entitlementLedger.status, status)) : eq(entitlementLedger.tenantId, TENANT_ID);
    const rows = await db.select().from(entitlementLedger).where(where).orderBy(desc(entitlementLedger.createdAt)).limit(paging.limit + 1).offset(paging.offset);
    return ok(c, { entitlements: rows.slice(0, paging.limit), pageInfo: pageInfo({ ...paging, count: rows.length }) });
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
    const status = queryStatus(c, ["received", "processed", "failed"]);
    const paging = listPaging(c);
    const where = status ? and(eq(paymentWebhookEvents.tenantId, TENANT_ID), eq(paymentWebhookEvents.status, status)) : eq(paymentWebhookEvents.tenantId, TENANT_ID);
    const rows = await db.select().from(paymentWebhookEvents).where(where).orderBy(desc(paymentWebhookEvents.createdAt)).limit(paging.limit + 1).offset(paging.offset);
    return ok(c, { events: rows.slice(0, paging.limit), pageInfo: pageInfo({ ...paging, count: rows.length }) });
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
  .post("/payment-events/:id/reprocess", async (c) => {
    const admin = await requireAdmin(c);
    const denied = requireOwnerOrFail(c, admin);
    if (denied) return denied;
    const id = c.req.param("id");
    const [event] = await db.select().from(paymentWebhookEvents).where(and(eq(paymentWebhookEvents.tenantId, TENANT_ID), eq(paymentWebhookEvents.id, id))).limit(1);
    if (!event) return fail(c, "payment_event_not_found", "没有找到回调事件。", 404);
    const notification = parseJson<StoredWechatNotification>(event.payloadJson, {});
    try {
      const transaction = await decryptStoredWechatResource(notification.resource || {});
      const [order] = await db
        .select()
        .from(orders)
        .where(and(eq(orders.tenantId, TENANT_ID), eq(orders.providerOrderNo, transaction.out_trade_no || "")))
        .limit(1);
      if (!order) throw new Error("order_not_found");
      validateStoredWechatTransaction(notification, transaction, order);
      await markOrderPaidAndGrantEntitlement(order, transaction);
      await db.update(paymentWebhookEvents).set({ orderId: order.id, status: "processed", errorMessage: null }).where(eq(paymentWebhookEvents.id, event.id));
      await logAdmin(admin!.id, "payment_event.reprocess", "payment_webhook_event", { eventId: event.id, orderId: order.id });
      const [updated] = await db.select().from(orders).where(eq(orders.id, order.id)).limit(1);
      return ok(c, { eventId: event.id, order: updated || order, transaction });
    } catch (error) {
      const message = error instanceof Error ? error.message : "payment_event_reprocess_failed";
      await db.update(paymentWebhookEvents).set({ status: "failed", errorMessage: message }).where(eq(paymentWebhookEvents.id, event.id));
      await logAdmin(admin!.id, "payment_event.reprocess_failed", "payment_webhook_event", { eventId: event.id, error: message });
      return fail(c, "payment_event_reprocess_failed", "重新处理回调失败。", 502);
    }
  })
  .get("/feedback", async (c) => {
    const admin = await requireAdmin(c);
    const denied = requireAdminOrFail(c, admin);
    if (denied) return denied;
    const paging = listPaging(c);
    const status = queryStatus(c, ["open", "resolved"]);
    const rows = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.tenantId, TENANT_ID), eq(auditLogs.targetType, "feedback")))
      .orderBy(desc(auditLogs.createdAt))
      .limit(Math.min(Math.max(paging.offset + paging.limit + 1, 200), 1000));
    const filtered = buildFeedbackRows(rows).filter((item) => !status || item.feedbackStatus === status);
    const feedback = filtered.slice(paging.offset, paging.offset + paging.limit + 1);
    return ok(c, { feedback: feedback.slice(0, paging.limit), pageInfo: pageInfo({ ...paging, count: feedback.length }) });
  })
  .get("/feedback/:id", async (c) => {
    const admin = await requireAdmin(c);
    const denied = requireAdminOrFail(c, admin);
    if (denied) return denied;
    const id = c.req.param("id");
    const rows = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.tenantId, TENANT_ID), eq(auditLogs.targetType, "feedback")))
      .orderBy(desc(auditLogs.createdAt))
      .limit(500);
    const feedback = buildFeedbackRows(rows).find((row) => row.id === id || row.targetId === id);
    if (!feedback) return fail(c, "feedback_not_found", "没有找到这条反馈。", 404);
    const events = rows
      .filter((row) => row.id === feedback.id || row.targetId === feedback.id || row.targetId === feedback.targetId)
      .map((row) => ({ ...row, detail: parseJson(row.detailJson, {}) }));
    return ok(c, { feedback, events });
  })
  .post("/feedback/:id/status", async (c) => {
    const admin = await requireAdmin(c);
    const denied = requireAdminOrFail(c, admin);
    if (denied) return denied;
    const id = c.req.param("id");
    const body = await readJson<FeedbackStatusBody>(c);
    const nextStatus = String(body.status || "").trim();
    if (!["resolved", "open"].includes(nextStatus)) return fail(c, "invalid_feedback_status", "反馈状态不正确。", 400);
    const [feedback] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.tenantId, TENANT_ID), eq(auditLogs.id, id), eq(auditLogs.targetType, "feedback"), eq(auditLogs.action, "feedback.submit")))
      .limit(1);
    if (!feedback) return fail(c, "feedback_not_found", "没有找到这条反馈。", 404);
    await logAdmin(admin!.id, nextStatus === "resolved" ? "feedback.resolve" : "feedback.reopen", "feedback", {
      feedbackId: id,
      note: String(body.note || "").trim().slice(0, 500)
    }, id);
    await db.update(auditLogs).set({ targetId: id }).where(eq(auditLogs.id, feedback.id));
    return ok(c, { updated: true, feedbackId: id, status: nextStatus });
  })
  .get("/audit-logs", async (c) => {
    const admin = await requireAdmin(c);
    const denied = requireAdminOrFail(c, admin);
    if (denied) return denied;
    const paging = listPaging(c);
    const rows = await db.select().from(auditLogs).where(eq(auditLogs.tenantId, TENANT_ID)).orderBy(desc(auditLogs.createdAt)).limit(paging.limit + 1).offset(paging.offset);
    return ok(c, { logs: rows.slice(0, paging.limit).map((log) => ({ ...log, detail: parseJson(log.detailJson, null) })), pageInfo: pageInfo({ ...paging, count: rows.length }) });
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
