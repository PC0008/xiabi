import { secret, vars } from "edgespark";

export type CreateWechatPaymentInput = {
  orderId: string;
  providerOrderNo: string;
  title: string;
  amountCents: number;
  notifyUrl: string;
  clientIp?: string;
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

export async function createWechatPayment(input: CreateWechatPaymentInput) {
  const appId = vars.get("WECHAT_PAY_APP_ID");
  const mchId = vars.get("WECHAT_PAY_MCH_ID");
  const serialNo = secret.get("WECHAT_PAY_CERT_SERIAL_NO");
  if (!appId || !mchId || !serialNo || !secret.get("WECHAT_PAY_PRIVATE_KEY")) {
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
    mchid: mchId,
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
      "Authorization": buildAuthHeader({ mchId, serialNo, nonce, timestamp, signature }),
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
