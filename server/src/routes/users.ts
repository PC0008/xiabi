import { db } from "edgespark";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { entitlementLedger, files, generationTasks, guestSessions, orders, productProfiles, salesLetters, smsCodes, users } from "@defs";
import { getAdminConfig } from "../domain/config";
import { TENANT_ID } from "../domain/defaults";
import { fail, ok, readJson } from "../domain/http";
import { getActiveSession } from "../domain/session";
import { sha256 } from "../domain/security";

type BindPhoneBody = {
  phone?: string;
  code?: string;
};

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

function maskPhone(phone: string) {
  return phone.replace(/^(\d{3})\d+(\d{4})$/, "$1****$2");
}

async function findUserByPhoneHash(phoneHash: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.tenantId, TENANT_ID), eq(users.phoneHash, phoneHash)))
    .limit(1);
  return user || null;
}

export const userRoutes = new Hono()
  .post("/bind-phone", async (c) => {
    const activeSession = await getActiveSession(c);
    if (!activeSession) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const { sessionId } = activeSession;
    const body = await readJson<BindPhoneBody>(c);
    const phone = normalizePhone(String(body.phone || ""));
    const code = String(body.code || "").trim();
    if (!/^1\d{10}$/.test(phone)) return fail(c, "invalid_phone", "请输入正确的手机号。", 400);
    if (!/^\d{6}$/.test(code)) return fail(c, "invalid_code", "请输入 6 位验证码。", 400);
    const config = await getAdminConfig(db);
    const system = config.system as Record<string, unknown>;
    if (system.sms_enabled === false) {
      return fail(c, "sms_disabled", "短信服务暂未开启。", 503);
    }

    const phoneHash = await sha256(`phone:${phone}`);
    const codeHash = await sha256(`sms:${phone}:${code}`);
    const [row] = await db
      .select()
      .from(smsCodes)
      .where(and(eq(smsCodes.tenantId, TENANT_ID), eq(smsCodes.phoneHash, phoneHash), eq(smsCodes.status, "pending")))
      .orderBy(desc(smsCodes.createdAt))
      .limit(1);
    if (!row) {
      return fail(c, "code_not_match", "验证码不正确或已过期。", 400);
    }
    if (Number(row.attempts || 0) >= 5) {
      await db.update(smsCodes).set({ status: "locked" }).where(eq(smsCodes.id, row.id));
      return fail(c, "code_locked", "验证码错误次数过多，请重新获取。", 429);
    }
    if (new Date(row.expiresAt).getTime() < Date.now()) {
      await db.update(smsCodes).set({ status: "expired" }).where(eq(smsCodes.id, row.id));
      return fail(c, "code_not_match", "验证码不正确或已过期。", 400);
    }
    if (row.codeHash !== codeHash) {
      const nextAttempts = Number(row.attempts || 0) + 1;
      await db.update(smsCodes).set({
        attempts: sql`${smsCodes.attempts} + 1`,
        status: nextAttempts >= 5 ? "locked" : "pending"
      }).where(eq(smsCodes.id, row.id));
      return fail(c, nextAttempts >= 5 ? "code_locked" : "code_not_match", nextAttempts >= 5 ? "验证码错误次数过多，请重新获取。" : "验证码不正确或已过期。", nextAttempts >= 5 ? 429 : 400);
    }

    let user = await findUserByPhoneHash(phoneHash);
    if (!user) {
      const newUserId = crypto.randomUUID();
      await db.insert(users).values({
        id: newUserId,
        tenantId: TENANT_ID,
        phoneMasked: maskPhone(phone),
        phoneHash,
        status: "active"
      }).onConflictDoNothing();
      user = await findUserByPhoneHash(phoneHash);
      if (!user) return fail(c, "bind_phone_conflict", "手机号绑定冲突，请重新提交。", 409);
    }
    const userId = user.id;
    const sessionLetterIds = (await db
      .select({ id: salesLetters.id })
      .from(salesLetters)
      .where(and(eq(salesLetters.tenantId, TENANT_ID), eq(salesLetters.sessionId, sessionId))))
      .map((letter) => letter.id);
    const updatedAt = new Date().toISOString();
    const ownershipUpdates = [
      db.update(users).set({ phoneMasked: maskPhone(phone), updatedAt }).where(eq(users.id, user.id)),
      db.update(guestSessions).set({ userId, updatedAt }).where(eq(guestSessions.id, sessionId)),
      db.update(salesLetters).set({ userId, updatedAt }).where(and(eq(salesLetters.tenantId, TENANT_ID), eq(salesLetters.sessionId, sessionId))),
      db.update(productProfiles).set({ userId, updatedAt }).where(and(eq(productProfiles.tenantId, TENANT_ID), eq(productProfiles.sessionId, sessionId))),
      db.update(generationTasks).set({ userId, updatedAt }).where(and(eq(generationTasks.tenantId, TENANT_ID), eq(generationTasks.sessionId, sessionId))),
      db.update(orders).set({ userId, updatedAt }).where(and(eq(orders.tenantId, TENANT_ID), eq(orders.sessionId, sessionId))),
      db.update(entitlementLedger).set({ userId }).where(and(eq(entitlementLedger.tenantId, TENANT_ID), eq(entitlementLedger.sessionId, sessionId))),
      db.update(smsCodes).set({ status: "verified" }).where(eq(smsCodes.id, row.id))
    ] as const;
    if (sessionLetterIds.length) {
      await db.batch([
        ...ownershipUpdates,
        db.update(files).set({ userId }).where(and(eq(files.tenantId, TENANT_ID), inArray(files.letterId, sessionLetterIds)))
      ]);
    } else {
      await db.batch(ownershipUpdates);
    }
    return ok(c, { userId, phoneMasked: maskPhone(phone), bound: true });
  });
