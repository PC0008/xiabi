import { vars } from "edgespark";

export type VoiceTurnInput = {
  sessionId: string;
  text?: string;
  audioObjectKey?: string;
};

export async function processVoiceTurn(input: VoiceTurnInput) {
  const provider = vars.get("VOICE_PROVIDER") || "minimax";
  const voiceId = vars.get("MINIMAX_VOICE_ID");
  return {
    provider,
    configured: !!voiceId,
    voiceId,
    sessionId: input.sessionId,
    transcript: input.text || "",
    message: voiceId
      ? "智多星语音将使用已配置的 MiniMax 克隆音色。"
      : "配置 MiniMax voice_id 后，这里处理语音识别、追问和整理。"
  };
}
