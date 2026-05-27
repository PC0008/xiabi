import { db } from "edgespark";
import { and, desc, eq } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import { Hono } from "hono";
import { smsCodes } from "@defs";
import { sendSmsCode } from "../adapters/sms";
import { TENANT_ID } from "../domain/defaults";
import { fail, ok, readJson } from "../domain/http";
import { sha256 } from "../domain/security";

const SESSION_COOKIE = "xiabi_session";

type SendCodeBody = {
  phone?: string;
};

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

function createCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export const smsRoutes = new Hono()
  .post("/send-code", async (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (!sessionId) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const body = await readJson<SendCodeBody>(c);
    const phone = normalizePhone(String(body.phone || ""));
    if (!/^1\d{10}$/.test(phone)) return fail(c, "invalid_phone", "请输入正确的手机号。", 400);

    const phoneHash = await sha256(`phone:${phone}`);
    const [latest] = await db
      .select()
      .from(smsCodes)
      .where(and(eq(smsCodes.tenantId, TENANT_ID), eq(smsCodes.phoneHash, phoneHash), eq(smsCodes.status, "pending")))
      .orderBy(desc(smsCodes.createdAt))
      .limit(1);
    if (latest && Date.now() - new Date(latest.createdAt).getTime() < 60_000) {
      return fail(c, "too_frequent", "验证码发送太频繁，请稍后再试。", 429);
    }

    const code = createCode();
    const result = await sendSmsCode({ phone, code });
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
