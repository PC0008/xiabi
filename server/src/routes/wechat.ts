import { getCookie, setCookie } from "hono/cookie";
import { Hono } from "hono";
import { buildWechatOAuthUrl, exchangeWechatOAuthCode } from "../adapters/payment/wechat";
import { fail, ok } from "../domain/http";

const SESSION_COOKIE = "xiabi_session";
const WECHAT_OPENID_COOKIE = "xiabi_wechat_openid";

function decodeState(value: string) {
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = `${base64}${"=".repeat((4 - base64.length % 4) % 4)}`;
    const decoded = decodeURIComponent(escape(atob(padded)));
    return decoded.startsWith("/") && !decoded.startsWith("//") ? decoded : "/index.html#orders";
  } catch {
    return "/index.html#orders";
  }
}

export const wechatRoutes = new Hono()
  .get("/oauth/start", async (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (!sessionId) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const returnUrl = c.req.query("returnUrl") || "/index.html#orders";
    const oauthUrl = buildWechatOAuthUrl(returnUrl);
    if (!oauthUrl) return fail(c, "wechat_oauth_not_configured", "微信公众号授权还没有完成配置。", 503);
    return ok(c, { oauthUrl });
  })
  .get("/oauth/callback", async (c) => {
    const code = c.req.query("code") || "";
    const state = c.req.query("state") || "";
    if (!code) return fail(c, "missing_wechat_code", "微信授权没有返回 code。", 400);
    const result = await exchangeWechatOAuthCode(code);
    if (!result.configured || !result.openid) return fail(c, "wechat_oauth_not_configured", result.message || "微信公众号授权还没有完成配置。", 503);
    setCookie(c, WECHAT_OPENID_COOKIE, result.openid, {
      httpOnly: true,
      sameSite: "Lax",
      secure: c.req.url.startsWith("https://"),
      path: "/",
      expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });
    return c.redirect(decodeState(state), 302);
  });
