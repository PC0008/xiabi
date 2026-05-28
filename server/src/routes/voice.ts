import { db } from "edgespark";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { auditLogs } from "@defs";
import { processVoiceTurn, speakWithMiniMax } from "../adapters/voice";
import { getAdminConfig } from "../domain/config";
import { TENANT_ID } from "../domain/defaults";
import { fail, ok, readJson } from "../domain/http";
import { getActiveSession } from "../domain/session";

const MAX_TRANSCRIBE_TEXT_LENGTH = 2000;
const MAX_AUDIO_BASE64_LENGTH = 8 * 1024 * 1024;
const VOICE_SPEAK_HOURLY_LIMIT = 60;
const VOICE_TRANSCRIBE_HOURLY_LIMIT = 40;
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

async function voiceRateLimited(sessionId: string, action: string, limit: number) {
  const recent = await db
    .select({ createdAt: auditLogs.createdAt })
    .from(auditLogs)
    .where(and(eq(auditLogs.tenantId, TENANT_ID), eq(auditLogs.actorId, sessionId), eq(auditLogs.action, action)))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
  const cutoff = Date.now() - 60 * 60 * 1000;
  return recent.filter((row) => new Date(row.createdAt).getTime() >= cutoff).length >= limit;
}

async function logVoiceEvent(sessionId: string, action: string, detail: Record<string, unknown>) {
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    tenantId: TENANT_ID,
    actorId: sessionId,
    actorType: "guest_session",
    action,
    targetType: "voice",
    targetId: sessionId,
    detailJson: JSON.stringify(detail)
  });
}

export const voiceRoutes = new Hono()
  .post("/speak", async (c) => {
    const activeSession = await getActiveSession(c);
    if (!activeSession) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const { sessionId } = activeSession;
    const config = await getAdminConfig(db);
    const system = config.system as Record<string, unknown>;
    if (system.voice_enabled === false) return fail(c, "voice_disabled", "语音服务暂未开启。", 503);
    const body = await readJson<SpeakBody>(c);
    const text = String(body.text || "").trim();
    if (!text) return fail(c, "missing_text", "请输入要朗读的内容。", 400);
    if (await voiceRateLimited(sessionId, "voice.speak_attempt", VOICE_SPEAK_HOURLY_LIMIT)) {
      return fail(c, "voice_speak_rate_limited", "语音播放太频繁了，请稍后再试。", 429);
    }
    await logVoiceEvent(sessionId, "voice.speak_attempt", { textLength: text.length });
    try {
      const result = await speakWithMiniMax(text);
      await logVoiceEvent(sessionId, "voice.speak", {
        configured: result.configured,
        provider: result.provider,
        textLength: text.length
      });
      return ok(c, result);
    } catch (error) {
      console.error("voice_speak_failed", error);
      return fail(c, "voice_speak_failed", "语音播放暂时不可用，请继续按住说话或切换打字模式。", 502);
    }
  })
  .post("/transcribe", async (c) => {
    const activeSession = await getActiveSession(c);
    if (!activeSession) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const { sessionId } = activeSession;
    const config = await getAdminConfig(db);
    const system = config.system as Record<string, unknown>;
    if (system.voice_enabled === false) return fail(c, "voice_disabled", "语音服务暂未开启。", 503);
    const body = await readJson<TranscribeBody>(c);
    const text = body.text ? String(body.text) : "";
    const audioBase64 = body.audioBase64 ? String(body.audioBase64).trim() : "";
    const rawMimeType = body.mimeType ? String(body.mimeType).trim().toLowerCase() : "";
    const mimeType = rawMimeType.split(";")[0].trim();
    if (text.length > MAX_TRANSCRIBE_TEXT_LENGTH) return fail(c, "text_too_long", "输入内容过长，请分几次发送。", 413);
    if (audioBase64.length > MAX_AUDIO_BASE64_LENGTH) return fail(c, "audio_too_large", "录音太长，请缩短后再试。", 413);
    if (audioBase64 && mimeType && !ALLOWED_AUDIO_MIME.has(mimeType)) return fail(c, "unsupported_audio_type", "当前录音格式暂不支持。", 415);
    if (await voiceRateLimited(sessionId, "voice.transcribe_attempt", VOICE_TRANSCRIBE_HOURLY_LIMIT)) {
      return fail(c, "voice_transcribe_rate_limited", "语音输入太频繁了，请稍后再试。", 429);
    }
    await logVoiceEvent(sessionId, "voice.transcribe_attempt", {
      inputMode: text ? "text" : "audio",
      textLength: text.length,
      audioBytesApprox: audioBase64 ? Math.ceil(audioBase64.length * 0.75) : 0,
      mimeType: mimeType || rawMimeType || ""
    });
    try {
      const result = await processVoiceTurn({
        sessionId,
        text,
        audioObjectKey: body.audioObjectKey ? String(body.audioObjectKey) : undefined,
        audioBase64: audioBase64 || undefined,
        mimeType: mimeType || rawMimeType || undefined
      });
      await logVoiceEvent(sessionId, "voice.transcribe", {
        configured: result.configured,
        provider: result.provider,
        requestFormat: result.requestFormat,
        inputMode: text ? "text" : "audio",
        transcriptLength: result.transcript?.length || 0,
        audioBytesApprox: audioBase64 ? Math.ceil(audioBase64.length * 0.75) : 0,
        mimeType: mimeType || rawMimeType || ""
      });
      return ok(c, result);
    } catch (error) {
      console.error("voice_transcribe_failed", error);
      return fail(c, "voice_transcribe_failed", "这次没有听清楚，请再说一遍或切换打字模式。", 502);
    }
  });
