import { db, vars } from "edgespark";
import { and, desc, eq, or } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import { Hono } from "hono";
import { guestSessions, orders, salesLetters } from "@defs";
import { buildWechatOAuthUrl, createWechatJsapiPayment, createWechatPayment, getWechatOAuthReadiness, getWechatPaymentReadiness, queryWechatPaymentByOutTradeNo } from "../adapters/payment/wechat";
import { getConfigScope } from "../domain/config";
import { TENANT_ID } from "../domain/defaults";
import { markOrderPaidAndGrantEntitlement } from "../domain/entitlements";
import { fail, ok, readJson } from "../domain/http";

const SESSION_COOKIE = "xiabi_session";
const WECHAT_OPENID_COOKIE = "xiabi_wechat_openid";

type CreateOrderBody = {
  productType?: "single" | "annual";
  letterId?: string;
};

function getPaymentDisabledError(pricing: Record<string, unknown>, productType: string) {
  if (pricing.payment_enabled === false) return { code: "payment_disabled", message: "支付入口暂未开放。", status: 403 };
  if (productType === "annual" && pricing.annual_enabled === false) return { code: "annual_disabled", message: "年卡暂未开放。", status: 403 };
  if (productType === "single" && pricing.single_enabled === false) return { code: "single_disabled", message: "单封解锁暂未开放。", status: 403 };
  return null;
}

function isWeChatBrowser(c: any) {
  return /micromessenger/i.test(c.req.header("user-agent") || "");
}

function getReturnUrl(c: any) {
  const referer = c.req.header("referer") || "";
  try {
    const url = new URL(referer);
    return `${url.pathname}${url.search}${url.hash}` || "/index.html#orders";
  } catch {
    return "/index.html#orders";
  }
}

async function wechatAuthResponse(c: any, sessionId: string, returnUrl = getReturnUrl(c)) {
  const readiness = getWechatOAuthReadiness();
  if (!readiness.configured) {
    return fail(c, "wechat_oauth_not_configured", readiness.message, 503);
  }
  const oauthUrl = await buildWechatOAuthUrl(returnUrl, sessionId);
  if (!oauthUrl) return fail(c, "wechat_oauth_not_configured", readiness.message, 503);
  return ok(c, {
    requiresWechatAuth: true,
    payment: {
      provider: "wechat_jsapi",
      configured: false,
      message: "请先完成微信授权后再继续支付。"
    },
    oauthUrl
  });
}

function createProviderOrderNo() {
  return `xiabi${Date.now().toString(36)}${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function paymentMatchesOrder(order: typeof orders.$inferSelect, transaction: {
  appid?: string;
  mchid?: string;
  out_trade_no?: string;
  transaction_id?: string;
  trade_state?: string;
  amount?: { total?: number; currency?: string };
}) {
  if (transaction.trade_state !== "SUCCESS") return false;
  if (!transaction.out_trade_no || transaction.out_trade_no !== order.providerOrderNo) return false;
  if (!transaction.transaction_id) return false;
  const expectedAppId = vars.get("WECHAT_PAY_APP_ID");
  const expectedMchId = vars.get("WECHAT_PAY_MCH_ID");
  if (!expectedAppId || transaction.appid !== expectedAppId) return false;
  if (!expectedMchId || transaction.mchid !== expectedMchId) return false;
  if (Number(transaction.amount?.total) !== Number(order.amountCents)) return false;
  if (transaction.amount?.currency !== order.currency) return false;
  return true;
}

type GuestSession = typeof guestSessions.$inferSelect;

async function getCurrentSession(sessionId: string) {
  const [session] = await db
    .select()
    .from(guestSessions)
    .where(and(eq(guestSessions.tenantId, TENANT_ID), eq(guestSessions.id, sessionId)))
    .limit(1);
  return session || null;
}

function orderOwnerWhere(session: GuestSession) {
  return session.userId
    ? or(eq(orders.sessionId, session.id), eq(orders.userId, session.userId))
    : eq(orders.sessionId, session.id);
}

function letterOwnerWhere(session: GuestSession) {
  return session.userId
    ? or(eq(salesLetters.sessionId, session.id), eq(salesLetters.userId, session.userId))
    : eq(salesLetters.sessionId, session.id);
}

export const orderRoutes = new Hono()
  .get("/", async (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (!sessionId) return ok(c, { orders: [] });
    const session = await getCurrentSession(sessionId);
    if (!session) return ok(c, { orders: [] });
    const rows = await db
      .select()
      .from(orders)
      .where(and(eq(orders.tenantId, TENANT_ID), orderOwnerWhere(session)))
      .orderBy(desc(orders.createdAt))
      .limit(50);
    return ok(c, { orders: rows });
  })
  .post("/", async (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (!sessionId) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const session = await getCurrentSession(sessionId);
    if (!session) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const body = await readJson<CreateOrderBody>(c);
    const productType = body.productType === "single" ? "single" : "annual";
    const pricing = (await getConfigScope(db, "pricing")).data as Record<string, unknown>;
    const disabledPayment = getPaymentDisabledError(pricing, productType);
    if (disabledPayment) return fail(c, disabledPayment.code, disabledPayment.message, disabledPayment.status);
    const letterId = typeof body.letterId === "string" && body.letterId.trim() ? body.letterId.trim() : null;
    if (letterId) {
      const [letter] = await db
        .select({ id: salesLetters.id })
        .from(salesLetters)
        .where(and(eq(salesLetters.id, letterId), letterOwnerWhere(session), eq(salesLetters.tenantId, TENANT_ID)))
        .limit(1);
      if (!letter) return fail(c, "letter_not_found", "没有找到这封销售信。", 404);
    }
    if (productType === "single" && !letterId) return fail(c, "missing_letter", "单封解锁需要关联一封销售信。", 400);
    const amount = Number(productType === "annual" ? pricing.annual || 2000 : pricing.single || 200);
    const title = productType === "annual" ? "年卡会员" : "单封解锁";
    const readiness = getWechatPaymentReadiness();
    if (!readiness.configured) {
      return fail(c, "wechat_pay_not_configured", readiness.message, 503);
    }
    const openid = getCookie(c, WECHAT_OPENID_COOKIE);
    const useJsapi = isWeChatBrowser(c);
    if (useJsapi && !openid) return await wechatAuthResponse(c, sessionId, "/index.html#orders");
    const orderId = crypto.randomUUID();
    const providerOrderNo = createProviderOrderNo();
    await db.insert(orders).values({
      id: orderId,
      tenantId: TENANT_ID,
      sessionId,
      userId: session.userId || null,
      letterId,
      provider: "wechat",
      providerOrderNo,
      productType,
      title,
      amountCents: Math.round(amount * 100),
      status: "pending"
    });
    let payment;
    try {
      if (useJsapi && openid) {
        payment = await createWechatJsapiPayment({
          orderId,
          providerOrderNo,
          title,
          amountCents: Math.round(amount * 100),
          notifyUrl: vars.get("PAYMENT_NOTIFY_URL") || `${vars.get("PUBLIC_BASE_URL") || ""}/api/webhooks/wechat-pay`,
          openid
        });
      } else {
        payment = await createWechatPayment({
          orderId,
          providerOrderNo,
          title,
          amountCents: Math.round(amount * 100),
          notifyUrl: vars.get("PAYMENT_NOTIFY_URL") || `${vars.get("PUBLIC_BASE_URL") || ""}/api/webhooks/wechat-pay`,
          clientIp: c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
        });
      }
    } catch (error) {
      await db.update(orders).set({ status: "payment_failed", updatedAt: new Date().toISOString() }).where(eq(orders.id, orderId));
      return fail(c, "payment_create_failed", error instanceof Error ? error.message : "微信支付拉起失败。", 502);
    }
    if (!payment.configured) {
      await db.update(orders).set({ status: "payment_failed", updatedAt: new Date().toISOString() }).where(eq(orders.id, orderId));
      return fail(c, "wechat_pay_not_configured", payment.message || "微信支付还没有完成配置。", 503);
    }
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
    const session = await getCurrentSession(sessionId);
    if (!session) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.tenantId, TENANT_ID), eq(orders.id, c.req.param("id")), orderOwnerWhere(session)))
      .limit(1);
    if (!order) return fail(c, "order_not_found", "没有找到订单。", 404);
    if (order.status === "pending" && order.providerOrderNo) {
      const query = await queryWechatPaymentByOutTradeNo(order.providerOrderNo).catch(() => null);
      if (query?.configured && query.transaction && paymentMatchesOrder(order, query.transaction)) {
        const updated = await markOrderPaidAndGrantEntitlement(order, query.transaction);
        return ok(c, { orderId: updated.id, status: updated.status, paidAt: updated.paidAt });
      }
    }
    return ok(c, { orderId: order.id, status: order.status, paidAt: order.paidAt });
  })
  .post("/:id/pay", async (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (!sessionId) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const session = await getCurrentSession(sessionId);
    if (!session) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, c.req.param("id")), orderOwnerWhere(session), eq(orders.tenantId, TENANT_ID)))
      .limit(1);
    if (!order) return fail(c, "order_not_found", "没有找到订单。", 404);
    if (order.status === "paid") return fail(c, "order_already_paid", "这笔订单已经支付完成。", 409);
    if (!order.providerOrderNo) return fail(c, "missing_provider_order_no", "订单缺少商户订单号。", 400);
    const pricing = (await getConfigScope(db, "pricing")).data as Record<string, unknown>;
    const disabledPayment = getPaymentDisabledError(pricing, order.productType);
    if (disabledPayment) return fail(c, disabledPayment.code, disabledPayment.message, disabledPayment.status);
    const readiness = getWechatPaymentReadiness();
    if (!readiness.configured) return fail(c, "wechat_pay_not_configured", readiness.message, 503);
    const openid = getCookie(c, WECHAT_OPENID_COOKIE);
    const useJsapi = isWeChatBrowser(c);
    if (useJsapi && !openid) return await wechatAuthResponse(c, sessionId, "/index.html#orders");
    let payment;
    try {
      if (useJsapi && openid) {
        payment = await createWechatJsapiPayment({
          orderId: order.id,
          providerOrderNo: order.providerOrderNo,
          title: order.title,
          amountCents: order.amountCents,
          notifyUrl: vars.get("PAYMENT_NOTIFY_URL") || `${vars.get("PUBLIC_BASE_URL") || ""}/api/webhooks/wechat-pay`,
          openid
        });
      } else {
        payment = await createWechatPayment({
          orderId: order.id,
          providerOrderNo: order.providerOrderNo,
          title: order.title,
          amountCents: order.amountCents,
          notifyUrl: vars.get("PAYMENT_NOTIFY_URL") || `${vars.get("PUBLIC_BASE_URL") || ""}/api/webhooks/wechat-pay`,
          clientIp: c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
        });
      }
    } catch (error) {
      await db.update(orders).set({ status: "payment_failed", updatedAt: new Date().toISOString() }).where(eq(orders.id, order.id));
      return fail(c, "payment_create_failed", error instanceof Error ? error.message : "微信支付拉起失败。", 502);
    }
    if (!payment.configured) return fail(c, "wechat_pay_not_configured", payment.message || "微信支付还没有完成配置。", 503);
    await db.update(orders).set({ status: "pending", updatedAt: new Date().toISOString() }).where(eq(orders.id, order.id));
    return ok(c, { orderId: order.id, providerOrderNo: order.providerOrderNo, status: "pending", amount: order.amountCents / 100, payment });
  })
  .get("/:id", async (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (!sessionId) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const session = await getCurrentSession(sessionId);
    if (!session) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.tenantId, TENANT_ID), eq(orders.id, c.req.param("id")), orderOwnerWhere(session)))
      .limit(1);
    if (!order) return fail(c, "order_not_found", "没有找到订单。", 404);
    return ok(c, order);
  });
