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

type MiniMaxTtsResult = {
  provider: "minimax";
  configured: true;
  voiceId: string;
  audioUrl: string;
  traceId?: string;
  endpoint: string;
  outputFormat: string;
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

type AsrRequestFormat = "json" | "openai";

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

function hexToBase64(hex: string) {
  const clean = hex.trim();
  if (!/^[0-9a-f]+$/i.test(clean) || clean.length % 2 !== 0) return "";
  let binary = "";
  for (let index = 0; index < clean.length; index += 2) {
    binary += String.fromCharCode(Number.parseInt(clean.slice(index, index + 2), 16));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string) {
  const clean = base64.replace(/^data:[^,]+,/, "").trim();
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function extensionFromMime(mimeType: string) {
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

function resolveAsrRequestFormat(endpoint: string): AsrRequestFormat {
  const configured = String(vars.get("VOICE_ASR_REQUEST_FORMAT" as any) || "").trim().toLowerCase();
  if (configured === "openai" || configured === "multipart") return "openai";
  if (configured === "json") return "json";
  return endpoint.includes("/audio/transcriptions") ? "openai" : "json";
}

async function readAsrPayload(response: Response): Promise<AsrResponse> {
  const payload = await response.json().catch(() => ({})) as AsrResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message || payload.message || `Voice transcription failed: ${response.status}`);
  }
  return payload;
}

async function callJsonAsr(endpoint: string, apiKey: string, audioBase64: string, mimeType: string, model: string) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: model || undefined,
      audio: audioBase64,
      audio_base64: audioBase64,
      mime_type: mimeType,
      language: "zh"
    })
  });
  return readAsrPayload(response);
}

async function callOpenAiCompatibleAsr(endpoint: string, apiKey: string, audioBase64: string, mimeType: string, model: string) {
  const bytes = base64ToBytes(audioBase64);
  const form = new FormData();
  const fileName = `voice.${extensionFromMime(mimeType)}`;
  form.append("file", new Blob([bytes], { type: mimeType }), fileName);
  form.append("model", model || "whisper-1");
  form.append("language", "zh");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`
    },
    body: form
  });
  return readAsrPayload(response);
}

function withMiniMaxGroupId(endpoint: string, groupId: string) {
  if (!groupId) return endpoint;
  try {
    const url = new URL(endpoint);
    if (!url.searchParams.has("GroupId")) url.searchParams.set("GroupId", groupId);
    return url.toString();
  } catch {
    const separator = endpoint.includes("?") ? "&" : "?";
    return endpoint.includes("GroupId=") ? endpoint : `${endpoint}${separator}GroupId=${encodeURIComponent(groupId)}`;
  }
}

async function callMiniMaxTts(endpoint: string, apiKey: string, voiceId: string, text: string, outputFormat: string): Promise<MiniMaxTtsResult> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: vars.get("MINIMAX_TTS_MODEL") || "speech-2.8-hd",
      text: text.slice(0, 1000),
      stream: false,
      language_boost: "auto",
      output_format: outputFormat,
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
  const payload = await response.json().catch(() => ({})) as MiniMaxT2AResponse;
  const statusMsg = payload.base_resp?.status_msg;
  if (!response.ok || payload.base_resp?.status_code !== 0 || !payload.data?.audio) {
    throw new Error(statusMsg || `MiniMax TTS failed: ${response.status}`);
  }
  const audio = payload.data.audio;
  const audioUrl = audio.startsWith("http")
    ? audio
    : `data:audio/mp3;base64,${hexToBase64(audio)}`;
  if (!audioUrl || audioUrl.endsWith(",")) throw new Error("MiniMax TTS returned unsupported audio data.");
  return {
    provider: "minimax",
    configured: true,
    voiceId,
    audioUrl,
    traceId: payload.trace_id,
    endpoint,
    outputFormat
  };
}

export async function speakWithMiniMax(text: string) {
  const apiKey = secret.get("VOICE_API_KEY");
  const voiceId = vars.get("MINIMAX_VOICE_ID");
  if (!apiKey || !voiceId) {
    return { provider: "minimax", configured: false, message: "MiniMax 语音服务还没有完成配置。" };
  }
  const configuredOutput = String(vars.get("MINIMAX_TTS_OUTPUT_FORMAT") || "").trim().toLowerCase();
  const outputFormat = configuredOutput === "url" ? "url" : "hex";
  const primaryEndpoint = vars.get("MINIMAX_TTS_ENDPOINT") || "https://api.minimax.io/v1/t2a_v2";
  const groupId = String(vars.get("MINIMAX_GROUP_ID") || "").trim();
  const baseEndpoints = [
    primaryEndpoint,
    "https://api-uw.minimax.io/v1/t2a_v2",
    "https://api.minimax.io/v1/t2a_v2",
    "https://api.minimaxi.com/v1/t2a_v2"
  ];
  const endpoints = Array.from(new Set(baseEndpoints.flatMap((endpoint) => (
    groupId ? [withMiniMaxGroupId(endpoint, groupId), endpoint] : [endpoint]
  ))));
  const errors: string[] = [];
  for (const endpoint of endpoints) {
    try {
      return await callMiniMaxTts(endpoint, apiKey, voiceId, text, outputFormat);
    } catch (error) {
      errors.push(`${endpoint}: ${error instanceof Error ? error.message : "MiniMax TTS failed"}`);
    }
  }
  throw new Error(errors.join("；"));
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
  const mimeType = input.mimeType || "audio/webm";
  const requestFormat = resolveAsrRequestFormat(asrEndpoint);
  const payload = requestFormat === "openai"
    ? await callOpenAiCompatibleAsr(asrEndpoint, apiKey, audioBase64, mimeType, model)
    : await callJsonAsr(asrEndpoint, apiKey, audioBase64, mimeType, model);
  const transcript = pickTranscript(payload);
  if (!transcript) throw new Error("语音转文字服务没有返回识别内容。");
  return {
    provider: asrProvider,
    configured: true,
    voiceId,
    sessionId: input.sessionId,
    transcript,
    requestFormat,
    message: "语音转文字完成。"
  };
}
