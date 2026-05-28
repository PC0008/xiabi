import { setCookie } from "hono/cookie";
import { Hono } from "hono";
import { buildWechatJssdkConfig, buildWechatOAuthUrl, exchangeWechatOAuthCode, verifyWechatOAuthState } from "../adapters/payment/wechat";
import { fail, ok } from "../domain/http";
import { getActiveSession } from "../domain/session";

const WECHAT_OPENID_COOKIE = "xiabi_wechat_openid";

export const wechatRoutes = new Hono()
  .post("/jssdk-config", async (c) => {
    const activeSession = await getActiveSession(c);
    if (!activeSession) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const body = await c.req.json().catch(() => ({})) as { url?: string };
    const url = String(body.url || "").trim();
    if (!url) return fail(c, "missing_wechat_jssdk_url", "缺少当前页面地址。", 400);
    try {
      const result = await buildWechatJssdkConfig(url);
      if (!result.configured) return fail(c, "wechat_jssdk_not_configured", result.message || "微信公众号 JS-SDK 配置还没有完成。", 503);
      return ok(c, { config: result });
    } catch (error) {
      return fail(c, "wechat_jssdk_config_failed", "微信语音输入暂时不可用，请先切换打字模式。", 502);
    }
  })
  .get("/oauth/start", async (c) => {
    const activeSession = await getActiveSession(c);
    if (!activeSession) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const { sessionId } = activeSession;
    const returnUrl = c.req.query("returnUrl") || "/index.html#orders";
    const oauthUrl = await buildWechatOAuthUrl(returnUrl, sessionId);
    if (!oauthUrl) return fail(c, "wechat_oauth_not_configured", "微信公众号授权还没有完成配置。", 503);
    return ok(c, { oauthUrl });
  })
  .get("/oauth/callback", async (c) => {
    const activeSession = await getActiveSession(c);
    if (!activeSession) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const { sessionId } = activeSession;
    const code = c.req.query("code") || "";
    const state = c.req.query("state") || "";
    if (!code) return fail(c, "missing_wechat_code", "微信授权没有返回 code。", 400);
    let returnUrl = "/index.html#orders";
    try {
      const stateResult = await verifyWechatOAuthState(state, sessionId);
      if (!stateResult.configured) return fail(c, "wechat_oauth_not_configured", stateResult.message || "微信公众号授权还没有完成配置。", 503);
      returnUrl = stateResult.returnUrl || returnUrl;
    } catch (error) {
      return fail(c, "invalid_wechat_oauth_state", "微信授权状态已失效，请重新发起支付。", 400);
    }
    const result = await exchangeWechatOAuthCode(code);
    if (!result.configured || !result.openid) return fail(c, "wechat_oauth_not_configured", result.message || "微信公众号授权还没有完成配置。", 503);
    setCookie(c, WECHAT_OPENID_COOKIE, result.openid, {
      httpOnly: true,
      sameSite: "Lax",
      secure: c.req.url.startsWith("https://"),
      path: "/",
      expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });
    return c.redirect(returnUrl, 302);
  });
