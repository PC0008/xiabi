import { getCookie } from "hono/cookie";
import { Hono } from "hono";
import { processVoiceTurn, speakWithMiniMax } from "../adapters/voice";
import { fail, ok, readJson } from "../domain/http";

const SESSION_COOKIE = "xiabi_session";

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
    const body = await readJson<SpeakBody>(c);
    const text = String(body.text || "").trim();
    if (!text) return fail(c, "missing_text", "请输入要朗读的内容。", 400);
    return ok(c, await speakWithMiniMax(text));
  })
  .post("/transcribe", async (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (!sessionId) return fail(c, "missing_session", "请先开始一次会话。", 401);
    const body = await readJson<TranscribeBody>(c);
    return ok(c, await processVoiceTurn({
      sessionId,
      text: body.text ? String(body.text) : "",
      audioObjectKey: body.audioObjectKey ? String(body.audioObjectKey) : undefined,
      audioBase64: body.audioBase64 ? String(body.audioBase64) : undefined,
      mimeType: body.mimeType ? String(body.mimeType) : undefined
    }));
  });
