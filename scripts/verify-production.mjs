import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.XIABI_VERIFY_BASE_URL || "https://immortal-sponge-1728.edgespark.app";
const strict = process.env.XIABI_PRODUCTION_STRICT === "1";
const checks = [];

function addCheck(name, status, detail = {}) {
  checks.push({ name, status, ...detail });
}

function getCookie(headers) {
  const value = headers.get("set-cookie") || "";
  return value.split(";")[0];
}

async function readJsonResponse(response, label) {
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${label} returned non-JSON: ${text.slice(0, 160)}`);
  }
  if (!response.ok || payload?.ok === false) {
    const message = payload?.error?.message || payload?.error?.code || text.slice(0, 160);
    throw new Error(`${label} failed: ${response.status} ${message}`);
  }
  return payload.data ?? payload;
}

async function api(pathname, init = {}, cookie = "") {
  const response = await fetch(`${baseUrl}${pathname}`, {
    credentials: "include",
    ...init,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...(init.headers || {})
    }
  });
  return readJsonResponse(response, pathname);
}

async function createGuestSession() {
  const response = await fetch(`${baseUrl}/api/public/session/guest`, { method: "POST" });
  await readJsonResponse(response, "guest session");
  const cookie = getCookie(response.headers);
  if (!cookie) throw new Error("guest session did not set a cookie");
  return cookie;
}

async function verifyAdminDiagnostics() {
  const username = process.env.XIABI_VERIFY_ADMIN_USERNAME;
  const password = process.env.XIABI_VERIFY_ADMIN_PASSWORD;
  if (!username || !password) {
    addCheck("admin diagnostics", "skipped", { reason: "set XIABI_VERIFY_ADMIN_USERNAME and XIABI_VERIFY_ADMIN_PASSWORD" });
    if (strict) throw new Error("strict verification requires admin credentials");
    return;
  }

  const response = await fetch(`${baseUrl}/api/public/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  await readJsonResponse(response, "admin login");
  const cookie = getCookie(response.headers);
  if (!cookie) throw new Error("admin login did not set a cookie");

  const diagnostics = await api("/api/public/admin/diagnostics", {}, cookie);
  const groups = diagnostics.groups || [];
  const missingRequired = groups.flatMap((group) =>
    (group.items || [])
      .filter((item) => item.required !== false && !item.configured)
      .map((item) => `${group.title}:${item.name}`)
  );
  addCheck("admin diagnostics", missingRequired.length ? "missing" : "ok", {
    summary: diagnostics.summary,
    missingRequired
  });
  if (strict && missingRequired.length) {
    throw new Error(`strict verification found missing required config: ${missingRequired.join(", ")}`);
  }
}

async function verifyDeepSeek() {
  if (process.env.XIABI_VERIFY_DEEPSEEK !== "1") {
    addCheck("deepseek generation", "skipped", { reason: "set XIABI_VERIFY_DEEPSEEK=1 to run a real generation" });
    return;
  }
  const cookie = await createGuestSession();
  const task = await api("/api/public/tasks", {
    method: "POST",
    body: JSON.stringify({
      answers: [
        "给我自己的产品写",
        "让对方愿意预约沟通",
        "一款帮助销售人员写私聊销售信的服务",
        "客户担心写出来太硬、不像自己说的话",
        "语气真诚，适合微信私聊发送"
      ],
      input: { source: "production-verification" }
    })
  }, cookie);
  if (task.status !== "succeeded" || !task.letterId) throw new Error("DeepSeek generation did not return a completed letter");
  addCheck("deepseek generation", "ok", { taskId: task.taskId, letterId: task.letterId });
}

async function verifyPaymentCreate() {
  if (process.env.XIABI_VERIFY_PAYMENT_CREATE !== "1") {
    addCheck("wechat payment create", "skipped", { reason: "set XIABI_VERIFY_PAYMENT_CREATE=1 to create a real unpaid WeChat H5 order" });
    return;
  }
  const cookie = await createGuestSession();
  const order = await api("/api/public/orders", {
    method: "POST",
    body: JSON.stringify({ productType: "annual" })
  }, cookie);
  if (!order.payment?.configured || !order.payment?.h5Url) throw new Error("WeChat payment create did not return h5Url");
  addCheck("wechat payment create", "ok", { orderId: order.orderId, providerOrderNo: order.providerOrderNo });
}

async function verifySmsSend() {
  const phone = process.env.XIABI_VERIFY_SMS_PHONE;
  if (!phone) {
    addCheck("sms send", "skipped", { reason: "set XIABI_VERIFY_SMS_PHONE to send a real SMS code" });
    return;
  }
  const cookie = await createGuestSession();
  const result = await api("/api/public/sms/send-code", {
    method: "POST",
    body: JSON.stringify({ phone })
  }, cookie);
  if (!result.sent || result.configured === false) throw new Error("SMS send did not report sent=true");
  addCheck("sms send", "ok", { phoneMasked: result.phoneMasked || result.phone, provider: result.provider });
}

async function verifyTts() {
  if (process.env.XIABI_VERIFY_TTS !== "1") {
    addCheck("minimax tts", "skipped", { reason: "set XIABI_VERIFY_TTS=1 to call MiniMax TTS" });
    return;
  }
  const cookie = await createGuestSession();
  const result = await api("/api/public/voice/speak", {
    method: "POST",
    body: JSON.stringify({ text: "你好，我是智多星。" })
  }, cookie);
  if (!result.configured || !result.audioUrl) throw new Error("MiniMax TTS did not return an audio URL");
  addCheck("minimax tts", "ok", { voiceId: result.voiceId, traceId: result.traceId });
}

function mimeFromFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".wav") return "audio/wav";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".m4a") return "audio/mp4";
  return "audio/webm";
}

async function verifyAsr() {
  const audioPath = process.env.XIABI_VERIFY_ASR_AUDIO;
  if (!audioPath) {
    addCheck("voice asr", "skipped", { reason: "set XIABI_VERIFY_ASR_AUDIO to an audio file path" });
    return;
  }
  const cookie = await createGuestSession();
  const bytes = await fs.readFile(audioPath);
  const result = await api("/api/public/voice/transcribe", {
    method: "POST",
    body: JSON.stringify({
      audioBase64: bytes.toString("base64"),
      mimeType: mimeFromFile(audioPath)
    })
  }, cookie);
  if (!result.configured || !result.transcript) throw new Error("ASR did not return a transcript");
  addCheck("voice asr", "ok", { provider: result.provider, transcriptLength: result.transcript.length });
}

await api("/api/public/health");
addCheck("health", "ok");
await api("/api/public/config");
addCheck("public config", "ok");

await verifyAdminDiagnostics();
await verifyDeepSeek();
await verifyPaymentCreate();
await verifySmsSend();
await verifyTts();
await verifyAsr();

const failed = checks.filter((item) => item.status === "missing" || item.status === "failed");
if (failed.length) {
  console.error(JSON.stringify({ ok: false, baseUrl, checks }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, baseUrl, strict, checks }, null, 2));
