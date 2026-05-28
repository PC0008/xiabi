import fs from "node:fs";

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function fail(message) {
  throw new Error(`voice input contract check failed: ${message}`);
}

function requireIncludes(source, needle, label) {
  if (!source.includes(needle)) fail(`missing ${label}`);
}

function requireNotIncludes(source, needle, label) {
  if (source.includes(needle)) fail(`unexpected ${label}`);
}

const voiceAdapter = read("server/src/adapters/voice/index.ts");
const publicRoutes = read("server/src/routes/public.ts");
const adminRoutes = read("server/src/routes/admin.ts");
const h5App = read("h5/app.js");
const verifier = read("scripts/verify-production.mjs");
const statusDoc = read("docs/minimax-asr-status-2026-05-28.md");
const preflight = read("scripts/final-preflight.mjs");
const packageJson = JSON.parse(read("package.json"));

requireIncludes(voiceAdapter, "const configuredAsrEndpoint = optionalVar(\"VOICE_ASR_ENDPOINT\")", "service ASR endpoint configuration gate");
requireIncludes(voiceAdapter, "optionalSecret(\"VOICE_ASR_API_KEY\") || secret.get(\"VOICE_API_KEY\")", "service ASR secret fallback");
requireIncludes(voiceAdapter, "resolveAsrRequestFormat", "ASR request format resolver");
requireIncludes(voiceAdapter, "callOpenAiCompatibleAsr", "OpenAI-compatible multipart ASR path");
requireIncludes(voiceAdapter, "callJsonAsr", "JSON base64 ASR path");
requireIncludes(voiceAdapter, "withMiniMaxGroupId", "MiniMax GroupId propagation when an actual MiniMax ASR endpoint is provided");
requireNotIncludes(voiceAdapter, "api.minimax.io/v1/asr", "guessed MiniMax ASR endpoint");
requireNotIncludes(voiceAdapter, "api.minimax.io/v1/audio/transcriptions", "guessed MiniMax transcription endpoint");
requireNotIncludes(voiceAdapter, "api.minimaxi.com/v1/asr", "guessed MiniMax China ASR endpoint");

requireIncludes(publicRoutes, "const asrVerified = asrConfigured && optionalVar(\"VOICE_ASR_VERIFIED\") === \"1\"", "public ASR verification gate");
requireIncludes(publicRoutes, "wechatJssdkConfigured: wechatJssdk.configured", "public WeChat JS-SDK readiness flag");
requireIncludes(h5App, "return serverAsrConfigured() && runtimeCapabilities.voice?.asrVerified === true;", "H5 server ASR readiness requires verified flag");
requireIncludes(h5App, "return recordingSupported() && serverAsrReady();", "H5 recording fallback requires verified server ASR");
requireIncludes(h5App, "return wechatBrowser() && wechatVoiceConfigured();", "H5 WeChat voice path requires WeChat browser and config");

requireIncludes(adminRoutes, "MiniMax 官方 API 总览当前公开列出的是 T2A、T2A Async、Voice Cloning、Voice Design、Voice Management", "admin diagnostic does not present MiniMax ASR as already available");
requireIncludes(statusDoc, "官方总览没有列出独立的 Speech-to-Text / ASR / audio transcription 接口", "MiniMax ASR status conclusion");
requireIncludes(statusDoc, "https://platform.minimax.io/docs/api-reference/api-overview", "MiniMax official overview source");
requireIncludes(statusDoc, "https://platform.minimax.io/docs/llms.txt", "MiniMax official docs index source");

requireIncludes(verifier, "if (voiceCapabilities.asrVerified !== true)", "production verifier rejects unverified service ASR");
requireIncludes(verifier, "XIABI_VERIFY_WECHAT_VOICE_MANUAL", "production verifier separates WeChat JS-SDK config from phone manual check");

if (packageJson.scripts?.["check:voice-input-contract"] !== "node scripts/check-voice-input-contract.mjs") {
  fail("package.json check:voice-input-contract script");
}
requireIncludes(preflight, "[\"check:voice-input-contract\", [\"run\", \"check:voice-input-contract\"]", "final preflight voice input contract step");

console.log("[ok] voice input contract keeps MiniMax TTS real, ASR configurable, and phone voice gated by verified paths");
