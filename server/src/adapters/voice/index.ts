import { secret, vars } from "edgespark";

export type VoiceTurnInput = {
  sessionId: string;
  text?: string;
  audioObjectKey?: string;
  audioBase64?: string;
  mimeType?: string;
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

type AsrResponse = {
  transcript?: string;
  text?: string;
  data?: {
    transcript?: string;
    text?: string;
  };
  result?: {
    transcript?: string;
    text?: string;
  };
  message?: string;
  error?: {
    message?: string;
  };
};

function pickTranscript(payload: AsrResponse) {
  return [
    payload.transcript,
    payload.text,
    payload.data?.transcript,
    payload.data?.text,
    payload.result?.transcript,
    payload.result?.text
  ].map((item) => String(item || "").trim()).find(Boolean) || "";
}

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
  const text = String(input.text || "").trim();
  if (text) {
    return {
      provider,
      configured: true,
      voiceId,
      sessionId: input.sessionId,
      transcript: text,
      message: "已接收文本输入。"
    };
  }

  const audioBase64 = String(input.audioBase64 || "").trim();
  if (!audioBase64) {
    return {
      provider,
      configured: false,
      voiceId,
      sessionId: input.sessionId,
      transcript: "",
      message: "没有收到可转写的语音内容。"
    };
  }

  const asrEndpoint = vars.get("VOICE_ASR_ENDPOINT" as any);
  const apiKey = secret.get("VOICE_ASR_API_KEY" as any) || secret.get("VOICE_API_KEY");
  const asrProvider = vars.get("VOICE_ASR_PROVIDER" as any) || provider;
  if (!asrEndpoint || !apiKey) {
    return {
      provider: asrProvider,
      configured: false,
      voiceId,
      sessionId: input.sessionId,
      transcript: "",
      message: "语音转文字服务还没有完成配置，请先切换打字模式。"
    };
  }

  const model = vars.get("VOICE_ASR_MODEL" as any) || "";
  const response = await fetch(asrEndpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: model || undefined,
      audio: audioBase64,
      audio_base64: audioBase64,
      mime_type: input.mimeType || "audio/webm",
      language: "zh"
    })
  });
  const payload = await response.json().catch(() => ({})) as AsrResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message || payload.message || `Voice transcription failed: ${response.status}`);
  }
  const transcript = pickTranscript(payload);
  if (!transcript) throw new Error("语音转文字服务没有返回识别内容。");
  return {
    provider: asrProvider,
    configured: true,
    voiceId,
    sessionId: input.sessionId,
    transcript,
    message: "语音转文字完成。"
  };
}
