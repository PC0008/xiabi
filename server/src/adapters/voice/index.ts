export type VoiceTurnInput = {
  sessionId: string;
  text?: string;
  audioObjectKey?: string;
};

export async function processVoiceTurn(input: VoiceTurnInput) {
  return {
    provider: "pending",
    configured: false,
    sessionId: input.sessionId,
    transcript: input.text || "",
    message: "配置语音交互 API 后，这里处理语音识别、追问和整理。"
  };
}
