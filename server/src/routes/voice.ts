import { db } from "edgespark";
import { getCookie } from "hono/cookie";
import { Hono } from "hono";
import { processVoiceTurn, speakWithMiniMax } from "../adapters/voice";
import { getAdminConfig } from "../domain/config";
import { fail, ok, readJson } from "../domain/http";

const SESSION_COOKIE = "xiabi_session";
const MAX_TRANSCRIBE_TEXT_LENGTH = 2000;
const MAX_AUDIO_BASE64_LENGTH = 8 * 1024 * 1024;
const ALLOWED_AUDIO_MIME = new Set([
  "audio/webm",
  "audio/wav",
  "audio/wave",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/ogg"
]);

type SpeakBody = {
  text?: string;
};

type TranscribeBody = {
  text?: string;
  audioObjectKey?: string;
  audioBase64?: string;
  mimeType?: string;
};

export const voiceRoutes = new Hono()
  .post("/speak", async (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (!sessionId) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const config = await getAdminConfig(db);
    const system = config.system as Record<string, unknown>;
    if (system.voice_enabled === false) return fail(c, "voice_disabled", "语音服务暂未开启。", 503);
    const body = await readJson<SpeakBody>(c);
    const text = String(body.text || "").trim();
    if (!text) return fail(c, "missing_text", "请输入要朗读的内容。", 400);
    try {
      return ok(c, await speakWithMiniMax(text));
    } catch (error) {
      return fail(c, "voice_speak_failed", error instanceof Error ? error.message : "语音播放失败，请稍后再试。", 502);
    }
  })
  .post("/transcribe", async (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (!sessionId) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const config = await getAdminConfig(db);
    const system = config.system as Record<string, unknown>;
    if (system.voice_enabled === false) return fail(c, "voice_disabled", "语音服务暂未开启。", 503);
    const body = await readJson<TranscribeBody>(c);
    const text = body.text ? String(body.text) : "";
    const audioBase64 = body.audioBase64 ? String(body.audioBase64).trim() : "";
    const mimeType = body.mimeType ? String(body.mimeType).trim().toLowerCase() : "";
    if (text.length > MAX_TRANSCRIBE_TEXT_LENGTH) return fail(c, "text_too_long", "输入内容过长，请分几次发送。", 413);
    if (audioBase64.length > MAX_AUDIO_BASE64_LENGTH) return fail(c, "audio_too_large", "录音太长，请缩短后再试。", 413);
    if (audioBase64 && mimeType && !ALLOWED_AUDIO_MIME.has(mimeType)) return fail(c, "unsupported_audio_type", "当前录音格式暂不支持。", 415);
    try {
      return ok(c, await processVoiceTurn({
        sessionId,
        text,
        audioObjectKey: body.audioObjectKey ? String(body.audioObjectKey) : undefined,
        audioBase64: audioBase64 || undefined,
        mimeType: mimeType || undefined
      }));
    } catch (error) {
      return fail(c, "voice_transcribe_failed", error instanceof Error ? error.message : "语音识别失败，请稍后再试。", 502);
    }
  });
