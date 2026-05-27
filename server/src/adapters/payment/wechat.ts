export type CreateWechatPaymentInput = {
  orderId: string;
  providerOrderNo: string;
  title: string;
  amountCents: number;
  notifyUrl: string;
};

export type NormalizedWechatWebhook = {
  eventId: string;
  providerOrderNo: string;
  transactionId: string;
  status: "paid" | "failed" | "refunded" | "unknown";
  raw: unknown;
};

export async function createWechatPayment(input: CreateWechatPaymentInput) {
  return {
    provider: "wechat",
    configured: false,
    orderId: input.orderId,
    providerOrderNo: input.providerOrderNo,
    amountCents: input.amountCents,
    message: "配置微信支付商户号、证书、API v3 密钥和回调域名后，在这里返回 H5 支付参数。"
  };
}

export async function verifyWechatWebhook(_headers: Headers, _body: string) {
  return {
    verified: false,
    reason: "wechat_pay_secret_not_configured"
  };
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
