import { secret, vars } from "edgespark";

export type VoiceTurnInput = {
  sessionId: string;
  text?: string;
  audioObjectKey?: string;
};

type MiniMaxT2AResponse = {
  data?: {
    audio?: string;
    status?: number;
  } | null;
  trace_id?: string;
  base_resp?: {
    status_code?: number;
    status_msg?: string;
  };
};

export async function speakWithMiniMax(text: string) {
  const apiKey = secret.get("VOICE_API_KEY");
  const voiceId = vars.get("MINIMAX_VOICE_ID");
  if (!apiKey || !voiceId) {
    return { provider: "minimax", configured: false, message: "MiniMax 语音服务还没有完成配置。" };
  }
  const response = await fetch("https://api.minimax.io/v1/t2a_v2", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "speech-2.8-hd",
      text: text.slice(0, 1000),
      stream: false,
      language_boost: "auto",
      output_format: "url",
      voice_setting: {
        voice_id: voiceId,
        speed: 1,
        vol: 1,
        pitch: 0
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: "mp3",
        channel: 1
      }
    })
  });
  const payload = await response.json() as MiniMaxT2AResponse;
  if (!response.ok || payload.base_resp?.status_code !== 0 || !payload.data?.audio) {
    throw new Error(payload.base_resp?.status_msg || `MiniMax TTS failed: ${response.status}`);
  }
  return {
    provider: "minimax",
    configured: true,
    voiceId,
    audioUrl: payload.data.audio,
    traceId: payload.trace_id
  };
}

export async function processVoiceTurn(input: VoiceTurnInput) {
  const provider = vars.get("VOICE_PROVIDER") || "minimax";
  const voiceId = vars.get("MINIMAX_VOICE_ID");
  return {
    provider,
    configured: false,
    voiceId,
    sessionId: input.sessionId,
    transcript: input.text || "",
    message: input.audioObjectKey
      ? "MiniMax 官方语音输入接口尚未确认，当前仅保存语音输入接入边界。"
      : "已接收文本输入。"
  };
}
