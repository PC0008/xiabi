import { db } from "edgespark";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { smsCodes } from "@defs";
import { sendSmsCode, SmsProviderError } from "../adapters/sms";
import { getAdminConfig } from "../domain/config";
import { TENANT_ID } from "../domain/defaults";
import { fail, ok, readJson } from "../domain/http";
import { getActiveSession } from "../domain/session";
import { sha256 } from "../domain/security";

const RESEND_INTERVAL_MS = 60_000;
const HOURLY_LIMIT = 5;
const DAILY_LIMIT = 12;
const SMS_PROVIDER_SETUP_CODES = new Set([
  "isv.SMS_SIGNATURE_SCENE_ILLEGAL",
  "isv.SMS_TEMPLATE_ILLEGAL",
  "isv.SMS_SIGNATURE_ILLEGAL",
  "isv.BUSINESS_LIMIT_CONTROL",
  "isv.OUT_OF_SERVICE",
  "isv.PRODUCT_UN_SUBSCRIPT",
  "isv.PRODUCT_UNSUBSCRIBE"
]);

type SendCodeBody = {
  phone?: string;
};

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

function createCode() {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return String(100000 + (value[0] % 900000));
}

function toTime(value: string) {
  return new Date(value).getTime();
}

function smsSendFailedMessage(error: unknown) {
  if (error instanceof SmsProviderError && error.providerCode && SMS_PROVIDER_SETUP_CODES.has(error.providerCode)) {
    return "短信服务暂时还没有开通完成，请稍后再试或联系管理员。";
  }
  return "验证码暂时发送失败，请稍后再试。";
}

export const smsRoutes = new Hono()
  .post("/send-code", async (c) => {
    const activeSession = await getActiveSession(c);
    if (!activeSession) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const body = await readJson<SendCodeBody>(c);
    const phone = normalizePhone(String(body.phone || ""));
    if (!/^1\d{10}$/.test(phone)) return fail(c, "invalid_phone", "请输入正确的手机号。", 400);
    const config = await getAdminConfig(db);
    const system = config.system as Record<string, unknown>;
    if (system.sms_enabled === false) {
      return fail(c, "sms_disabled", "短信服务暂未开启。", 503);
    }

    const phoneHash = await sha256(`phone:${phone}`);
    const [latest] = await db
      .select()
      .from(smsCodes)
      .where(and(eq(smsCodes.tenantId, TENANT_ID), eq(smsCodes.phoneHash, phoneHash), eq(smsCodes.status, "pending")))
      .orderBy(desc(smsCodes.createdAt))
      .limit(1);
    const now = Date.now();
    if (latest && now - toTime(latest.createdAt) < RESEND_INTERVAL_MS) {
      return fail(c, "too_frequent", "验证码发送太频繁，请稍后再试。", 429);
    }

    const recentCodes = await db
      .select({ createdAt: smsCodes.createdAt })
      .from(smsCodes)
      .where(and(eq(smsCodes.tenantId, TENANT_ID), eq(smsCodes.phoneHash, phoneHash)))
      .orderBy(desc(smsCodes.createdAt))
      .limit(DAILY_LIMIT + 1);
    const hourlyCount = recentCodes.filter((row) => now - toTime(row.createdAt) < 60 * 60 * 1000).length;
    const dailyCount = recentCodes.filter((row) => now - toTime(row.createdAt) < 24 * 60 * 60 * 1000).length;
    if (hourlyCount >= HOURLY_LIMIT || dailyCount >= DAILY_LIMIT) {
      return fail(c, "too_many_codes", "验证码获取次数过多，请稍后再试。", 429);
    }

    const code = createCode();
    let result;
    try {
      result = await sendSmsCode({ phone, code });
    } catch (error) {
      return fail(c, "sms_send_failed", smsSendFailedMessage(error), 502);
    }
    if (!result.configured) {
      return fail(c, "sms_not_configured", result.message || "短信服务还没有完成配置。", 503);
    }
    await db.update(smsCodes).set({ status: "replaced" }).where(and(
      eq(smsCodes.tenantId, TENANT_ID),
      eq(smsCodes.phoneHash, phoneHash),
      eq(smsCodes.status, "pending")
    ));
    await db.insert(smsCodes).values({
      id: crypto.randomUUID(),
      tenantId: TENANT_ID,
      phoneHash,
      codeHash: await sha256(`sms:${phone}:${code}`),
      status: "pending",
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
    });
    return ok(c, { sent: true, phoneMasked: result.phone, provider: result.provider, configured: result.configured });
  });
