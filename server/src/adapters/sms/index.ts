import { secret, vars } from "edgespark";
import { fetchWithTimeout } from "../../domain/fetch";

export type SendSmsCodeInput = {
  phone: string;
  code: string;
};

type AliyunSmsPayload = {
  Code?: string;
  Message?: string;
  RequestId?: string;
  BizId?: string;
  SignName?: string;
  SignStatus?: number;
  Reason?: string;
  TemplateCode?: string;
  TemplateName?: string;
  TemplateStatus?: string;
  TemplateType?: string;
  RelatedSignName?: string;
  AuditInfo?: {
    RejectInfo?: string;
    AuditDate?: string;
  };
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

function getSmsConfig() {
  return {
    accessKeyId: secret.get("SMS_API_KEY"),
    accessKeySecret: secret.get("SMS_API_SECRET"),
    signName: vars.get("SMS_ALIYUN_SIGN_NAME"),
    templateCode: vars.get("SMS_ALIYUN_TEMPLATE_CODE")
  };
}

async function aliyunSmsRequest(action: string, input: Record<string, string>) {
  const { accessKeyId, accessKeySecret } = getSmsConfig();
  if (!accessKeyId || !accessKeySecret) {
    throw new SmsProviderError("Aliyun SMS credentials are not configured.", "not_configured");
  }
  const params: Record<string, string> = {
    AccessKeyId: accessKeyId,
    Action: action,
    Format: "JSON",
    RegionId: "cn-hangzhou",
    SignatureMethod: "HMAC-SHA1",
    SignatureNonce: crypto.randomUUID(),
    SignatureVersion: "1.0",
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    Version: "2017-05-25",
    ...input
  };
  const canonical = Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join("&");
  const stringToSign = `GET&%2F&${percentEncode(canonical)}`;
  const signature = await hmacSha1Base64(`${accessKeySecret}&`, stringToSign);
  const url = `https://dysmsapi.aliyuncs.com/?Signature=${percentEncode(signature)}&${canonical}`;
  const response = await fetchWithTimeout(url, { timeoutMs: 10_000 });
  const payload = await response.json() as AliyunSmsPayload;
  if (!response.ok || payload.Code !== "OK") {
    throw new SmsProviderError(payload.Message || `Aliyun SMS failed: ${response.status}`, payload.Code, response.status);
  }
  return payload;
}

export async function checkSmsProviderConfig() {
  const { accessKeyId, accessKeySecret, signName, templateCode } = getSmsConfig();
  if (!accessKeyId || !accessKeySecret || !signName || !templateCode) {
    return {
      provider: "aliyun",
      configured: false,
      ready: false,
      sign: { configured: !!signName, ready: false },
      template: { configured: !!templateCode, ready: false },
      message: "短信服务还没有完成配置。"
    };
  }
  const [sign, template] = await Promise.all([
    aliyunSmsRequest("GetSmsSign", { SignName: signName }),
    aliyunSmsRequest("GetSmsTemplate", { TemplateCode: templateCode })
  ]);
  const signReady = Number(sign.SignStatus) === 1;
  const templateReady = String(template.TemplateStatus || "") === "1";
  return {
    provider: "aliyun",
    configured: true,
    ready: signReady && templateReady,
    sign: {
      configured: true,
      ready: signReady,
      signName: sign.SignName || signName,
      status: sign.SignStatus,
      requestId: sign.RequestId || "",
      reason: sign.Reason || ""
    },
    template: {
      configured: true,
      ready: templateReady,
      templateCode: template.TemplateCode || templateCode,
      templateName: template.TemplateName || "",
      status: template.TemplateStatus || "",
      templateType: template.TemplateType || "",
      relatedSignName: template.RelatedSignName || "",
      requestId: template.RequestId || "",
      reason: template.AuditInfo?.RejectInfo || ""
    }
  };
}

export async function sendSmsCode(input: SendSmsCodeInput) {
  const { accessKeyId, accessKeySecret, signName, templateCode } = getSmsConfig();
  if (!accessKeyId || !accessKeySecret || !signName || !templateCode) {
    return {
      provider: "aliyun",
      configured: false,
      phone: input.phone.replace(/^(\d{3})\d+(\d{4})$/, "$1****$2"),
      message: "短信服务还没有完成配置。"
    };
  }

  const payload = await aliyunSmsRequest("SendSms", {
    PhoneNumbers: input.phone,
    SignName: signName,
    TemplateCode: templateCode,
    TemplateParam: JSON.stringify({ code: input.code })
  });
  return {
    provider: "aliyun",
    configured: true,
    bizId: payload.BizId,
    phone: input.phone.replace(/^(\d{3})\d+(\d{4})$/, "$1****$2")
  };
}
