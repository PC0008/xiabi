export type SendSmsCodeInput = {
  phone: string;
  code: string;
};

export async function sendSmsCode(input: SendSmsCodeInput) {
  return {
    provider: "pending",
    configured: false,
    phone: input.phone.replace(/^(\d{3})\d+(\d{4})$/, "$1****$2"),
    message: "配置短信服务商 API 后，这里发送验证码。"
  };
}
