import { secret, vars } from "edgespark";

export type CreateWechatPaymentInput = {
  orderId: string;
  providerOrderNo: string;
  title: string;
  amountCents: number;
  notifyUrl: string;
  clientIp?: string;
  openid?: string;
};

export type WechatOrderQueryResult = {
  out_trade_no?: string;
  transaction_id?: string;
  trade_state?: string;
  trade_state_desc?: string;
};

export type NormalizedWechatWebhook = {
  eventId: string;
  providerOrderNo: string;
  transactionId: string;
  status: "paid" | "failed" | "refunded" | "unknown";
  raw: unknown;
};

function pemToArrayBuffer(pem: string) {
  const base64 = pem.replace(/-----BEGIN [^-]+-----/g, "").replace(/-----END [^-]+-----/g, "").replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function base64ToArrayBuffer(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function signWithMerchantKey(message: string) {
  const privateKey = secret.get("WECHAT_PAY_PRIVATE_KEY");
  if (!privateKey) throw new Error("WECHAT_PAY_PRIVATE_KEY is not configured.");
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return arrayBufferToBase64(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(message)));
}

function buildAuthHeader(input: { mchId: string; serialNo: string; nonce: string; timestamp: string; signature: string }) {
  return `WECHATPAY2-SHA256-RSA2048 mchid="${input.mchId}",nonce_str="${input.nonce}",signature="${input.signature}",timestamp="${input.timestamp}",serial_no="${input.serialNo}"`;
}

function getMerchantAuthConfig() {
  const mchId = vars.get("WECHAT_PAY_MCH_ID");
  const serialNo = secret.get("WECHAT_PAY_CERT_SERIAL_NO");
  if (!mchId || !serialNo || !secret.get("WECHAT_PAY_PRIVATE_KEY")) {
    return null;
  }
  return { mchId, serialNo };
}

export function getWechatPaymentReadiness() {
  const items = {
    appId: !!vars.get("WECHAT_PAY_APP_ID"),
    mchId: !!vars.get("WECHAT_PAY_MCH_ID"),
    privateKey: !!secret.get("WECHAT_PAY_PRIVATE_KEY"),
    certSerialNo: !!secret.get("WECHAT_PAY_CERT_SERIAL_NO"),
    apiV3Key: !!secret.get("WECHAT_PAY_API_V3_KEY"),
    platformPublicKey: !!secret.get("WECHAT_PAY_PLATFORM_PUBLIC_KEY" as any),
    notifyUrl: !!(vars.get("PAYMENT_NOTIFY_URL") || vars.get("PUBLIC_BASE_URL"))
  };
  return {
    configured: Object.values(items).every(Boolean),
    items,
    message: "微信支付、回调验签或回调解密配置还不完整。"
  };
}

export function getWechatOAuthReadiness() {
  return {
    configured: !!vars.get("WECHAT_PAY_APP_ID") && !!secret.get("WECHAT_MP_APP_SECRET" as any),
    message: "微信公众号授权配置还不完整。"
  };
}

export function buildWechatOAuthUrl(returnUrl = "/index.html#orders") {
  const appId = vars.get("WECHAT_PAY_APP_ID");
  if (!appId) return "";
  const baseUrl = (vars.get("PUBLIC_BASE_URL") || "").replace(/\/+$/, "");
  const redirectUri = `${baseUrl}/api/public/wechat/oauth/callback`;
  const safeReturnUrl = returnUrl.startsWith("/") && !returnUrl.startsWith("//") ? returnUrl : "/index.html#orders";
  const state = btoa(unescape(encodeURIComponent(safeReturnUrl))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=snsapi_base&state=${encodeURIComponent(state)}#wechat_redirect`;
}

export async function exchangeWechatOAuthCode(code: string) {
  const appId = vars.get("WECHAT_PAY_APP_ID");
  const appSecret = secret.get("WECHAT_MP_APP_SECRET" as any);
  if (!appId || !appSecret) return { configured: false, message: "微信公众号授权配置还不完整。" };
  const url = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(code)}&grant_type=authorization_code`;
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({})) as { openid?: string; errmsg?: string; errcode?: number };
  if (!response.ok || !payload.openid) {
    throw new Error(payload.errmsg || `WeChat OAuth failed: ${response.status}`);
  }
  return { configured: true, openid: payload.openid };
}

export async function createWechatPayment(input: CreateWechatPaymentInput) {
  const readiness = getWechatPaymentReadiness();
  if (!readiness.configured) {
    return {
      provider: "wechat",
      configured: false,
      orderId: input.orderId,
      providerOrderNo: input.providerOrderNo,
      amountCents: input.amountCents,
      message: readiness.message
    };
  }
  const appId = vars.get("WECHAT_PAY_APP_ID");
  const authConfig = getMerchantAuthConfig();
  if (!appId || !authConfig) {
    return {
      provider: "wechat",
      configured: false,
      orderId: input.orderId,
      providerOrderNo: input.providerOrderNo,
      amountCents: input.amountCents,
      message: "微信支付商户号、证书序列号或商户私钥未配置完整。"
    };
  }
  const path = "/v3/pay/transactions/h5";
  const body = JSON.stringify({
    appid: appId,
    mchid: authConfig.mchId,
    description: input.title.slice(0, 127),
    out_trade_no: input.providerOrderNo,
    notify_url: input.notifyUrl,
    amount: { total: input.amountCents, currency: "CNY" },
    scene_info: {
      payer_client_ip: input.clientIp || "127.0.0.1",
      h5_info: { type: "Wap" }
    }
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const signature = await signWithMerchantKey(`POST\n${path}\n${timestamp}\n${nonce}\n${body}\n`);
  const response = await fetch(`https://api.mch.weixin.qq.com${path}`, {
    method: "POST",
    headers: {
      "Authorization": buildAuthHeader({ mchId: authConfig.mchId, serialNo: authConfig.serialNo, nonce, timestamp, signature }),
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    body
  });
  const payload = await response.json().catch(() => ({})) as { h5_url?: string; message?: string; code?: string };
  if (!response.ok || !payload.h5_url) {
    throw new Error(payload.message || payload.code || `WeChat Pay request failed: ${response.status}`);
  }
  return {
    provider: "wechat",
    configured: true,
    orderId: input.orderId,
    providerOrderNo: input.providerOrderNo,
    amountCents: input.amountCents,
    h5Url: payload.h5_url
  };
}

export async function createWechatJsapiPayment(input: CreateWechatPaymentInput & { openid: string }) {
  const readiness = getWechatPaymentReadiness();
  if (!readiness.configured) {
    return {
      provider: "wechat_jsapi",
      configured: false,
      orderId: input.orderId,
      providerOrderNo: input.providerOrderNo,
      amountCents: input.amountCents,
      message: readiness.message
    };
  }
  const appId = vars.get("WECHAT_PAY_APP_ID");
  const authConfig = getMerchantAuthConfig();
  if (!appId || !authConfig) {
    return {
      provider: "wechat_jsapi",
      configured: false,
      orderId: input.orderId,
      providerOrderNo: input.providerOrderNo,
      amountCents: input.amountCents,
      message: "微信支付商户号、证书序列号或商户私钥未配置完整。"
    };
  }
  const path = "/v3/pay/transactions/jsapi";
  const body = JSON.stringify({
    appid: appId,
    mchid: authConfig.mchId,
    description: input.title.slice(0, 127),
    out_trade_no: input.providerOrderNo,
    notify_url: input.notifyUrl,
    amount: { total: input.amountCents, currency: "CNY" },
    payer: { openid: input.openid }
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const signature = await signWithMerchantKey(`POST\n${path}\n${timestamp}\n${nonce}\n${body}\n`);
  const response = await fetch(`https://api.mch.weixin.qq.com${path}`, {
    method: "POST",
    headers: {
      "Authorization": buildAuthHeader({ mchId: authConfig.mchId, serialNo: authConfig.serialNo, nonce, timestamp, signature }),
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    body
  });
  const payload = await response.json().catch(() => ({})) as { prepay_id?: string; message?: string; code?: string };
  if (!response.ok || !payload.prepay_id) {
    throw new Error(payload.message || payload.code || `WeChat Pay JSAPI request failed: ${response.status}`);
  }
  const payTimestamp = String(Math.floor(Date.now() / 1000));
  const payNonce = crypto.randomUUID().replace(/-/g, "");
  const packageValue = `prepay_id=${payload.prepay_id}`;
  const paySign = await signWithMerchantKey(`${appId}\n${payTimestamp}\n${payNonce}\n${packageValue}\n`);
  return {
    provider: "wechat_jsapi",
    configured: true,
    orderId: input.orderId,
    providerOrderNo: input.providerOrderNo,
    amountCents: input.amountCents,
    jsapi: {
      appId,
      timeStamp: payTimestamp,
      nonceStr: payNonce,
      package: packageValue,
      signType: "RSA",
      paySign
    }
  };
}

export async function queryWechatPaymentByOutTradeNo(providerOrderNo: string) {
  const authConfig = getMerchantAuthConfig();
  if (!authConfig) {
    return {
      configured: false,
      message: "微信支付商户号、证书序列号或商户私钥未配置完整。"
    };
  }
  const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(providerOrderNo)}`;
  const query = `?mchid=${encodeURIComponent(authConfig.mchId)}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const signature = await signWithMerchantKey(`GET\n${path}${query}\n${timestamp}\n${nonce}\n\n`);
  const response = await fetch(`https://api.mch.weixin.qq.com${path}${query}`, {
    method: "GET",
    headers: {
      "Authorization": buildAuthHeader({ mchId: authConfig.mchId, serialNo: authConfig.serialNo, nonce, timestamp, signature }),
      "Accept": "application/json"
    }
  });
  const payload = await response.json().catch(() => ({})) as WechatOrderQueryResult & { message?: string; code?: string };
  if (!response.ok) {
    throw new Error(payload.message || payload.code || `WeChat Pay query failed: ${response.status}`);
  }
  return { configured: true, transaction: payload };
}

export async function verifyWechatWebhook(headers: Headers, body: string) {
  const publicKey = secret.get("WECHAT_PAY_PLATFORM_PUBLIC_KEY" as any);
  const signature = headers.get("wechatpay-signature");
  const timestamp = headers.get("wechatpay-timestamp");
  const nonce = headers.get("wechatpay-nonce");
  if (!publicKey || !signature || !timestamp || !nonce) {
    return { verified: false, reason: "wechat_pay_platform_public_key_or_headers_missing" };
  }
  const key = await crypto.subtle.importKey(
    "spki",
    pemToArrayBuffer(publicKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64ToArrayBuffer(signature),
    new TextEncoder().encode(`${timestamp}\n${nonce}\n${body}\n`)
  ).catch(() => false);
  return { verified: ok, reason: ok ? undefined : "invalid_wechatpay_signature" };
}

export function normalizeWechatWebhook(payload: unknown): NormalizedWechatWebhook {
  const data = typeof payload === "object" && payload ? payload as Record<string, unknown> : {};
  return {
    eventId: String(data.id || crypto.randomUUID()),
    providerOrderNo: String(data.out_trade_no || ""),
    transactionId: String(data.transaction_id || ""),
    status: data.trade_state === "SUCCESS" ? "paid" : "unknown",
    raw: payload
  };
}
