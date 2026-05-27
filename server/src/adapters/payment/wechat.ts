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
  appid?: string;
  mchid?: string;
  out_trade_no?: string;
  transaction_id?: string;
  trade_state?: string;
  trade_state_desc?: string;
  amount?: {
    total?: number;
    currency?: string;
  };
};

export type NormalizedWechatWebhook = {
  eventId: string;
  providerOrderNo: string;
  transactionId: string;
  status: "paid" | "failed" | "refunded" | "unknown";
  raw: unknown;
};

type WechatCertificateResponse = {
  data?: Array<{
    serial_no?: string;
    encrypt_certificate?: {
      algorithm?: string;
      nonce?: string;
      associated_data?: string;
      ciphertext?: string;
    };
  }>;
  message?: string;
  code?: string;
};

const platformCertificateCache = new Map<string, string>();

function base64UrlEncode(value: string | ArrayBuffer) {
  let binary = "";
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = `${normalized}${"=".repeat((4 - normalized.length % 4) % 4)}`;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function pemToArrayBuffer(pem: string) {
  const base64 = pem.replace(/-----BEGIN [^-]+-----/g, "").replace(/-----END [^-]+-----/g, "").replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function readDerTlv(bytes: Uint8Array, offset: number) {
  if (offset >= bytes.length) throw new Error("Invalid DER offset.");
  const tag = bytes[offset];
  const firstLengthByte = bytes[offset + 1];
  if (firstLengthByte === undefined) throw new Error("Invalid DER length.");
  let length = firstLengthByte;
  let headerLength = 2;
  if (firstLengthByte & 0x80) {
    const lengthBytes = firstLengthByte & 0x7f;
    if (!lengthBytes || lengthBytes > 4) throw new Error("Unsupported DER length.");
    length = 0;
    for (let i = 0; i < lengthBytes; i += 1) {
      length = (length << 8) + bytes[offset + 2 + i];
    }
    headerLength += lengthBytes;
  }
  const valueStart = offset + headerLength;
  const end = valueStart + length;
  if (end > bytes.length) throw new Error("Invalid DER value.");
  return { tag, start: offset, valueStart, end };
}

function extractSpkiFromCertificateDer(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const cert = readDerTlv(bytes, 0);
  if (cert.tag !== 0x30) throw new Error("Invalid X.509 certificate.");
  const tbs = readDerTlv(bytes, cert.valueStart);
  if (tbs.tag !== 0x30) throw new Error("Invalid X.509 certificate body.");
  let offset = tbs.valueStart;
  let item = readDerTlv(bytes, offset);
  if (item.tag === 0xa0) offset = item.end;
  for (let i = 0; i < 5; i += 1) {
    item = readDerTlv(bytes, offset);
    offset = item.end;
  }
  const spki = readDerTlv(bytes, offset);
  if (spki.tag !== 0x30) throw new Error("Invalid certificate public key.");
  return bytes.slice(spki.start, spki.end).buffer;
}

function pemToPublicKeyArrayBuffer(pem: string) {
  const der = pemToArrayBuffer(pem);
  return /BEGIN CERTIFICATE/.test(pem) ? extractSpkiFromCertificateDer(der) : der;
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

function wechatApiHeaders(auth: string) {
  return {
    "Authorization": auth,
    "Accept": "application/json",
    "Content-Type": "application/json",
    "User-Agent": "xiabi-edgespark/1.0"
  };
}

function getMerchantAuthConfig() {
  const mchId = vars.get("WECHAT_PAY_MCH_ID");
  const serialNo = secret.get("WECHAT_PAY_CERT_SERIAL_NO");
  if (!mchId || !serialNo || !secret.get("WECHAT_PAY_PRIVATE_KEY")) {
    return null;
  }
  return { mchId, serialNo };
}

function getWechatOAuthConfig() {
  const appId = vars.get("WECHAT_PAY_APP_ID");
  const appSecret = secret.get("WECHAT_MP_APP_SECRET" as any);
  const baseUrl = (vars.get("PUBLIC_BASE_URL") || "").replace(/\/+$/, "");
  if (!appId || !appSecret || !baseUrl) return null;
  return { appId, appSecret, baseUrl };
}

async function signOAuthState(payload: string, appSecret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64UrlEncode(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

function sanitizeOAuthReturnUrl(returnUrl: string) {
  return returnUrl.startsWith("/") && !returnUrl.startsWith("//") ? returnUrl : "/index.html#orders";
}

export function getWechatPaymentReadiness() {
  const merchantAuthReady = !!vars.get("WECHAT_PAY_MCH_ID") && !!secret.get("WECHAT_PAY_CERT_SERIAL_NO") && !!secret.get("WECHAT_PAY_PRIVATE_KEY");
  const apiV3KeyReady = !!secret.get("WECHAT_PAY_API_V3_KEY");
  const platformVerifierReady = !!secret.get("WECHAT_PAY_PLATFORM_PUBLIC_KEY" as any) || (merchantAuthReady && apiV3KeyReady);
  const items = {
    appId: !!vars.get("WECHAT_PAY_APP_ID"),
    mchId: !!vars.get("WECHAT_PAY_MCH_ID"),
    privateKey: !!secret.get("WECHAT_PAY_PRIVATE_KEY"),
    certSerialNo: !!secret.get("WECHAT_PAY_CERT_SERIAL_NO"),
    apiV3Key: apiV3KeyReady,
    platformPublicKey: !!secret.get("WECHAT_PAY_PLATFORM_PUBLIC_KEY" as any),
    platformCertificateAutoFetch: merchantAuthReady && apiV3KeyReady,
    notifyUrl: !!(vars.get("PAYMENT_NOTIFY_URL") || vars.get("PUBLIC_BASE_URL"))
  };
  return {
    configured: items.appId && merchantAuthReady && apiV3KeyReady && platformVerifierReady && items.notifyUrl,
    items,
    message: "微信支付、回调验签或回调解密配置还不完整。"
  };
}

export function getWechatOAuthReadiness() {
  const items = {
    appId: !!vars.get("WECHAT_PAY_APP_ID"),
    appSecret: !!secret.get("WECHAT_MP_APP_SECRET" as any),
    publicBaseUrl: !!vars.get("PUBLIC_BASE_URL")
  };
  return {
    configured: items.appId && items.appSecret && items.publicBaseUrl,
    items,
    message: "微信公众号授权配置还不完整。"
  };
}

export async function buildWechatOAuthUrl(returnUrl = "/index.html#orders", sessionId = "") {
  const config = getWechatOAuthConfig();
  if (!config || !sessionId) return "";
  const { appId, appSecret, baseUrl } = config;
  const redirectUri = `${baseUrl}/api/public/wechat/oauth/callback`;
  const statePayload = base64UrlEncode(JSON.stringify({
    returnUrl: sanitizeOAuthReturnUrl(returnUrl),
    sessionId,
    nonce: crypto.randomUUID(),
    expiresAt: Date.now() + 10 * 60 * 1000
  }));
  const state = `${statePayload}.${await signOAuthState(statePayload, appSecret)}`;
  return `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=snsapi_base&state=${encodeURIComponent(state)}#wechat_redirect`;
}

export async function verifyWechatOAuthState(value: string, sessionId = "") {
  const config = getWechatOAuthConfig();
  if (!config) return { configured: false, message: "微信公众号授权配置还不完整。" };
  const [payload, signature] = value.split(".");
  if (!payload || !signature) throw new Error("invalid_wechat_oauth_state");
  const expected = await signOAuthState(payload, config.appSecret);
  if (signature !== expected) throw new Error("invalid_wechat_oauth_state_signature");
  const parsed = JSON.parse(base64UrlDecode(payload)) as { returnUrl?: string; sessionId?: string; expiresAt?: number };
  if (!parsed.sessionId || parsed.sessionId !== sessionId) throw new Error("wechat_oauth_session_mismatch");
  if (!parsed.expiresAt || parsed.expiresAt < Date.now()) throw new Error("wechat_oauth_state_expired");
  return { configured: true, returnUrl: sanitizeOAuthReturnUrl(parsed.returnUrl || "/index.html#orders") };
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
    headers: wechatApiHeaders(buildAuthHeader({ mchId: authConfig.mchId, serialNo: authConfig.serialNo, nonce, timestamp, signature })),
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
    headers: wechatApiHeaders(buildAuthHeader({ mchId: authConfig.mchId, serialNo: authConfig.serialNo, nonce, timestamp, signature })),
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
      "Accept": "application/json",
      "User-Agent": "xiabi-edgespark/1.0"
    }
  });
  const payload = await response.json().catch(() => ({})) as WechatOrderQueryResult & { message?: string; code?: string };
  if (!response.ok) {
    throw new Error(payload.message || payload.code || `WeChat Pay query failed: ${response.status}`);
  }
  return { configured: true, transaction: payload };
}

async function decryptWechatAesGcm(input: { associatedData?: string; nonce: string; ciphertext: string }, apiV3Key: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(apiV3Key), "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: new TextEncoder().encode(input.nonce),
      additionalData: new TextEncoder().encode(input.associatedData || ""),
      tagLength: 128
    },
    key,
    base64ToArrayBuffer(input.ciphertext)
  );
  return new TextDecoder().decode(plain);
}

async function fetchWechatPlatformCertificate(serial: string) {
  if (platformCertificateCache.has(serial)) return platformCertificateCache.get(serial) || "";
  const authConfig = getMerchantAuthConfig();
  const apiV3Key = secret.get("WECHAT_PAY_API_V3_KEY");
  if (!authConfig || !apiV3Key) throw new Error("wechat_pay_certificate_fetch_config_missing");
  const path = "/v3/certificates";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const signature = await signWithMerchantKey(`GET\n${path}\n${timestamp}\n${nonce}\n\n`);
  const response = await fetch(`https://api.mch.weixin.qq.com${path}`, {
    method: "GET",
    headers: {
      "Authorization": buildAuthHeader({ mchId: authConfig.mchId, serialNo: authConfig.serialNo, nonce, timestamp, signature }),
      "Accept": "application/json",
      "User-Agent": "xiabi-edgespark/1.0"
    }
  });
  const payload = await response.json().catch(() => ({})) as WechatCertificateResponse;
  if (!response.ok || !Array.isArray(payload.data)) {
    throw new Error(payload.message || payload.code || `WeChat Pay certificate request failed: ${response.status}`);
  }
  for (const item of payload.data) {
    const certificate = item.encrypt_certificate;
    if (!item.serial_no || !certificate?.nonce || !certificate.ciphertext) continue;
    if (certificate.algorithm && certificate.algorithm !== "AEAD_AES_256_GCM") continue;
    const pem = await decryptWechatAesGcm({
      associatedData: certificate.associated_data,
      nonce: certificate.nonce,
      ciphertext: certificate.ciphertext
    }, apiV3Key);
    platformCertificateCache.set(item.serial_no, pem);
  }
  return platformCertificateCache.get(serial) || "";
}

export async function verifyWechatWebhook(headers: Headers, body: string) {
  const signature = headers.get("wechatpay-signature");
  const timestamp = headers.get("wechatpay-timestamp");
  const nonce = headers.get("wechatpay-nonce");
  const serial = headers.get("wechatpay-serial");
  if (!signature || !timestamp || !nonce || !serial) {
    return { verified: false, reason: "wechatpay_signature_headers_missing" };
  }
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds) || Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > 5 * 60) {
    return { verified: false, reason: "wechatpay_timestamp_out_of_range" };
  }
  const expectedPlatformSerial = secret.get("WECHAT_PAY_PLATFORM_CERT_SERIAL_NO" as any) || vars.get("WECHAT_PAY_PLATFORM_CERT_SERIAL_NO" as any);
  if (expectedPlatformSerial && serial !== expectedPlatformSerial) {
    return { verified: false, reason: "wechatpay_serial_mismatch" };
  }
  const configuredPublicKey = secret.get("WECHAT_PAY_PLATFORM_PUBLIC_KEY" as any);
  const publicKey = configuredPublicKey || await fetchWechatPlatformCertificate(serial).catch(() => "");
  if (!publicKey) {
    return { verified: false, reason: "wechat_pay_platform_public_key_or_certificate_missing" };
  }
  const key = await crypto.subtle.importKey(
    "spki",
    pemToPublicKeyArrayBuffer(publicKey),
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
