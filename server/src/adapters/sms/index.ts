import { secret, vars } from "edgespark";
import { fetchWithTimeout } from "../../domain/fetch";

export type SendSmsCodeInput = {
  phone: string;
  code: string;
};

export class SmsProviderError extends Error {
  providerCode?: string;
  httpStatus?: number;

  constructor(message: string, providerCode?: string, httpStatus?: number) {
    super(message);
    this.name = "SmsProviderError";
    this.providerCode = providerCode;
    this.httpStatus = httpStatus;
  }
}

function percentEncode(value: string) {
  return encodeURIComponent(value)
    .replace(/\+/g, "%20")
    .replace(/\*/g, "%2A")
    .replace(/%7E/g, "~");
}

async function hmacSha1Base64(key: string, value: string) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value));
  const bytes = new Uint8Array(signature);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

export async function sendSmsCode(input: SendSmsCodeInput) {
  const accessKeyId = secret.get("SMS_API_KEY");
  const accessKeySecret = secret.get("SMS_API_SECRET");
  const signName = vars.get("SMS_ALIYUN_SIGN_NAME");
  const templateCode = vars.get("SMS_ALIYUN_TEMPLATE_CODE");
  if (!accessKeyId || !accessKeySecret || !signName || !templateCode) {
    return {
      provider: "aliyun",
      configured: false,
      phone: input.phone.replace(/^(\d{3})\d+(\d{4})$/, "$1****$2"),
      message: "短信服务还没有完成配置。"
    };
  }

  const params: Record<string, string> = {
    AccessKeyId: accessKeyId,
    Action: "SendSms",
    Format: "JSON",
    PhoneNumbers: input.phone,
    RegionId: "cn-hangzhou",
    SignName: signName,
    SignatureMethod: "HMAC-SHA1",
    SignatureNonce: crypto.randomUUID(),
    SignatureVersion: "1.0",
    TemplateCode: templateCode,
    TemplateParam: JSON.stringify({ code: input.code }),
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    Version: "2017-05-25"
  };
  const canonical = Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join("&");
  const stringToSign = `GET&%2F&${percentEncode(canonical)}`;
  const signature = await hmacSha1Base64(`${accessKeySecret}&`, stringToSign);
  const url = `https://dysmsapi.aliyuncs.com/?Signature=${percentEncode(signature)}&${canonical}`;
  const response = await fetchWithTimeout(url, { timeoutMs: 10_000 });
  const payload = await response.json() as { Code?: string; Message?: string; BizId?: string };
  if (!response.ok || payload.Code !== "OK") {
    throw new SmsProviderError(payload.Message || `Aliyun SMS failed: ${response.status}`, payload.Code, response.status);
  }
  return {
    provider: "aliyun",
    configured: true,
    bizId: payload.BizId,
    phone: input.phone.replace(/^(\d{3})\d+(\d{4})$/, "$1****$2")
  };
}
