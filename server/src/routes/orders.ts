import { db, vars } from "edgespark";
import { and, desc, eq } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import { Hono } from "hono";
import { orders, salesLetters } from "@defs";
import { createWechatPayment } from "../adapters/payment/wechat";
import { getConfigScope } from "../domain/config";
import { TENANT_ID } from "../domain/defaults";
import { fail, ok, readJson } from "../domain/http";

const SESSION_COOKIE = "xiabi_session";

type CreateOrderBody = {
  productType?: "single" | "annual";
  letterId?: string;
};

export const orderRoutes = new Hono()
  .get("/", async (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (!sessionId) return ok(c, { orders: [] });
    const rows = await db
      .select()
      .from(orders)
      .where(and(eq(orders.tenantId, TENANT_ID), eq(orders.sessionId, sessionId)))
      .orderBy(desc(orders.createdAt))
      .limit(50);
    return ok(c, { orders: rows });
  })
  .post("/", async (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (!sessionId) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const body = await readJson<CreateOrderBody>(c);
    const productType = body.productType === "single" ? "single" : "annual";
    const pricing = (await getConfigScope(db, "pricing")).data as Record<string, unknown>;
    if (pricing.payment_enabled === false) return fail(c, "payment_disabled", "支付入口暂未开放。", 403);
    if (productType === "annual" && pricing.annual_enabled === false) return fail(c, "annual_disabled", "年卡暂未开放。", 403);
    if (productType === "single" && pricing.single_enabled === false) return fail(c, "single_disabled", "单封解锁暂未开放。", 403);
    const letterId = typeof body.letterId === "string" && body.letterId.trim() ? body.letterId.trim() : null;
    if (letterId) {
      const [letter] = await db
        .select({ id: salesLetters.id })
        .from(salesLetters)
        .where(and(eq(salesLetters.id, letterId), eq(salesLetters.sessionId, sessionId), eq(salesLetters.tenantId, TENANT_ID)))
        .limit(1);
      if (!letter) return fail(c, "letter_not_found", "没有找到这封销售信。", 404);
    }
    if (productType === "single" && !letterId) return fail(c, "missing_letter", "单封解锁需要关联一封销售信。", 400);
    const amount = Number(productType === "annual" ? pricing.annual || 2000 : pricing.single || 200);
    const title = productType === "annual" ? "年卡会员" : "单封解锁";
    const orderId = crypto.randomUUID();
    const providerOrderNo = `xiabi_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    await db.insert(orders).values({
      id: orderId,
      tenantId: TENANT_ID,
      sessionId,
      letterId,
      provider: vars.get("PAYMENT_PROVIDER") || "wechat",
      providerOrderNo,
      productType,
      title,
      amountCents: Math.round(amount * 100),
      status: "pending"
    });
    const payment = await createWechatPayment({
      orderId,
      providerOrderNo,
      title,
      amountCents: Math.round(amount * 100),
      notifyUrl: vars.get("PAYMENT_NOTIFY_URL") || `${vars.get("PUBLIC_BASE_URL") || ""}/api/webhooks/wechat-pay`,
      clientIp: c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
    });
    return ok(c, {
      orderId,
      providerOrderNo,
      status: "pending",
      amount,
      payment
    });
  })
  .get("/:id/payment-status", async (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (!sessionId) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, c.req.param("id")), eq(orders.sessionId, sessionId)))
      .limit(1);
    if (!order) return fail(c, "order_not_found", "没有找到订单。", 404);
    return ok(c, { orderId: order.id, status: order.status, paidAt: order.paidAt });
  })
  .get("/:id", async (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (!sessionId) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, c.req.param("id")), eq(orders.sessionId, sessionId)))
      .limit(1);
    if (!order) return fail(c, "order_not_found", "没有找到订单。", 404);
    return ok(c, order);
  });
