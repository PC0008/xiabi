import { db, vars } from "edgespark";
import { and, desc, eq, or } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import { Hono } from "hono";
import { auditLogs, guestSessions, orders, salesLetters } from "@defs";
import { buildWechatOAuthUrl, createWechatJsapiPayment, createWechatPayment, getWechatOAuthReadiness, getWechatPaymentReadiness, isWechatPaymentExternalBlock, queryWechatPaymentByOutTradeNo, wechatPaidTransactionMatchesOrder } from "../adapters/payment/wechat";
import { getConfigScope } from "../domain/config";
import { TENANT_ID } from "../domain/defaults";
import { markOrderPaidAndGrantEntitlement } from "../domain/entitlements";
import { fail, ok, readJson } from "../domain/http";

const SESSION_COOKIE = "xiabi_session";
const WECHAT_OPENID_COOKIE = "xiabi_wechat_openid";
const WECHAT_PAY_EXTERNAL_BLOCKED_MESSAGE = "微信支付商户号缺少当前支付产品权限，请到微信支付商户平台产品中心开通 H5 支付或 JSAPI 支付后再试。";

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

type GuestSession = typeof guestSessions.$inferSelect;

async function logOrderPaymentEvent(sessionId: string, action: string, orderId: string, detail: Record<string, unknown>) {
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    tenantId: TENANT_ID,
    actorId: sessionId,
    actorType: "guest_session",
    action,
    targetType: "order",
    targetId: orderId,
    detailJson: JSON.stringify(detail)
  });
}

async function getCurrentSession(sessionId: string) {
  const [session] = await db
    .select()
    .from(guestSessions)
    .where(and(eq(guestSessions.tenantId, TENANT_ID), eq(guestSessions.id, sessionId), eq(guestSessions.status, "active")))
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
    const mode = useJsapi && openid ? "wechat_jsapi" : "wechat_h5";
    await logOrderPaymentEvent(sessionId, "order.payment_attempt", orderId, {
      orderId,
      providerOrderNo,
      productType,
      amountCents: Math.round(amount * 100),
      mode,
      source: "create"
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
      await logOrderPaymentEvent(sessionId, "order.payment_failed", orderId, {
        orderId,
        providerOrderNo,
        productType,
        amountCents: Math.round(amount * 100),
        mode,
        source: "create",
        reason: isWechatPaymentExternalBlock(error) ? "external_blocked" : "provider_error"
      });
      if (isWechatPaymentExternalBlock(error)) {
        return fail(c, "wechat_pay_external_blocked", WECHAT_PAY_EXTERNAL_BLOCKED_MESSAGE, 424, { orderId, providerOrderNo });
      }
      return fail(c, "payment_create_failed", error instanceof Error ? error.message : "微信支付拉起失败。", 502, { orderId, providerOrderNo });
    }
    if (!payment.configured) {
      await db.update(orders).set({ status: "payment_failed", updatedAt: new Date().toISOString() }).where(eq(orders.id, orderId));
      await logOrderPaymentEvent(sessionId, "order.payment_failed", orderId, {
        orderId,
        providerOrderNo,
        productType,
        amountCents: Math.round(amount * 100),
        mode,
        source: "create",
        reason: "not_configured"
      });
      return fail(c, "wechat_pay_not_configured", payment.message || "微信支付还没有完成配置。", 503, { orderId, providerOrderNo });
    }
    await logOrderPaymentEvent(sessionId, "order.payment", orderId, {
      orderId,
      providerOrderNo,
      productType,
      amountCents: Math.round(amount * 100),
      mode,
      source: "create",
      provider: payment.provider
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
      if (query?.configured && query.transaction && wechatPaidTransactionMatchesOrder(order, query.transaction)) {
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
    const mode = useJsapi && openid ? "wechat_jsapi" : "wechat_h5";
    await logOrderPaymentEvent(sessionId, "order.payment_attempt", order.id, {
      orderId: order.id,
      providerOrderNo: order.providerOrderNo,
      productType: order.productType,
      amountCents: order.amountCents,
      mode,
      source: "retry"
    });
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
      await logOrderPaymentEvent(sessionId, "order.payment_failed", order.id, {
        orderId: order.id,
        providerOrderNo: order.providerOrderNo,
        productType: order.productType,
        amountCents: order.amountCents,
        mode,
        source: "retry",
        reason: isWechatPaymentExternalBlock(error) ? "external_blocked" : "provider_error"
      });
      if (isWechatPaymentExternalBlock(error)) {
        return fail(c, "wechat_pay_external_blocked", WECHAT_PAY_EXTERNAL_BLOCKED_MESSAGE, 424, { orderId: order.id, providerOrderNo: order.providerOrderNo });
      }
      return fail(c, "payment_create_failed", error instanceof Error ? error.message : "微信支付拉起失败。", 502, { orderId: order.id, providerOrderNo: order.providerOrderNo });
    }
    if (!payment.configured) {
      await db.update(orders).set({ status: "payment_failed", updatedAt: new Date().toISOString() }).where(eq(orders.id, order.id));
      await logOrderPaymentEvent(sessionId, "order.payment_failed", order.id, {
        orderId: order.id,
        providerOrderNo: order.providerOrderNo,
        productType: order.productType,
        amountCents: order.amountCents,
        mode,
        source: "retry",
        reason: "not_configured"
      });
      return fail(c, "wechat_pay_not_configured", payment.message || "微信支付还没有完成配置。", 503, { orderId: order.id, providerOrderNo: order.providerOrderNo });
    }
    await db.update(orders).set({ status: "pending", updatedAt: new Date().toISOString() }).where(eq(orders.id, order.id));
    await logOrderPaymentEvent(sessionId, "order.payment", order.id, {
      orderId: order.id,
      providerOrderNo: order.providerOrderNo,
      productType: order.productType,
      amountCents: order.amountCents,
      mode,
      source: "retry",
      provider: payment.provider
    });
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
