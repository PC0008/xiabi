import { db, vars } from "edgespark";
import { eq } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import { Hono } from "hono";
import { orders } from "@defs";
import { TENANT_ID } from "../domain/defaults";
import { fail, ok, readJson } from "../domain/http";

const SESSION_COOKIE = "xiabi_session";

type CreateOrderBody = {
  productType?: "single" | "annual";
  letterId?: string;
  amount?: number;
  title?: string;
};

export const orderRoutes = new Hono()
  .post("/", async (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (!sessionId) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const body = await readJson<CreateOrderBody>(c);
    const productType = body.productType === "single" ? "single" : "annual";
    const amount = Number(body.amount || (productType === "annual" ? 2000 : 200));
    const orderId = crypto.randomUUID();
    await db.insert(orders).values({
      id: orderId,
      tenantId: TENANT_ID,
      sessionId,
      letterId: body.letterId || null,
      provider: vars.get("PAYMENT_PROVIDER") || "wechat",
      providerOrderNo: `xiabi_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      productType,
      title: body.title || (productType === "annual" ? "年卡会员" : "单封解锁"),
      amountCents: Math.round(amount * 100),
      status: "pending"
    });
    return ok(c, {
      orderId,
      status: "pending",
      payment: {
        provider: vars.get("PAYMENT_PROVIDER") || "wechat",
        configured: false,
        message: "微信支付参数配置后，这里返回真实支付参数。"
      }
    });
  })
  .get("/:id", async (c) => {
    const [order] = await db.select().from(orders).where(eq(orders.id, c.req.param("id"))).limit(1);
    if (!order) return fail(c, "order_not_found", "没有找到订单。", 404);
    return ok(c, order);
  });
