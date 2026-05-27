import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.XIABI_VERIFY_BASE_URL || "https://immortal-sponge-1728.edgespark.app";
const strict = process.env.XIABI_PRODUCTION_STRICT === "1";
const checks = [];

function addCheck(name, status, detail = {}) {
  checks.push({ name, status, ...detail });
}

function skipOrStrict(name, reason) {
  addCheck(name, "skipped", { reason });
  if (strict) throw new Error(`strict verification requires ${name}: ${reason}`);
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

async function adminLogin() {
  const username = process.env.XIABI_VERIFY_ADMIN_USERNAME;
  const password = process.env.XIABI_VERIFY_ADMIN_PASSWORD;
  if (!username || !password) return null;

  const response = await fetch(`${baseUrl}/api/public/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  await readJsonResponse(response, "admin login");
  const cookie = getCookie(response.headers);
  if (!cookie) throw new Error("admin login did not set a cookie");
  return { cookie, password };
}

async function verifyAdminDiagnostics() {
  const admin = await adminLogin();
  if (!admin) {
    skipOrStrict("admin diagnostics", "set XIABI_VERIFY_ADMIN_USERNAME and XIABI_VERIFY_ADMIN_PASSWORD");
    return;
  }

  const diagnostics = await api("/api/public/admin/diagnostics", {}, admin.cookie);
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

  const listChecks = [
    ["/api/public/admin/dashboard", (payload) => !!payload.metrics],
    ["/api/public/admin/users", (payload) => Array.isArray(payload.users) && Array.isArray(payload.sessions)],
    ["/api/public/admin/letters?status=ready", (payload) => Array.isArray(payload.letters)],
    ["/api/public/admin/tasks?status=failed", (payload) => Array.isArray(payload.tasks)],
    ["/api/public/admin/orders?status=pending", (payload) => Array.isArray(payload.orders)],
    ["/api/public/admin/entitlements?status=active", (payload) => Array.isArray(payload.entitlements)],
    ["/api/public/admin/payment-events?status=failed", (payload) => Array.isArray(payload.events)],
    ["/api/public/admin/feedback", (payload) => Array.isArray(payload.feedback)],
    ["/api/public/admin/audit-logs", (payload) => Array.isArray(payload.logs)]
  ];
  for (const [pathname, validate] of listChecks) {
    const payload = await api(pathname, {}, admin.cookie);
    if (!validate(payload)) throw new Error(`${pathname} returned unexpected admin list payload`);
    if (JSON.stringify(payload).includes(admin.password)) throw new Error(`${pathname} leaked the admin password`);
  }
  addCheck("admin read operations", "ok", { routes: listChecks.length });
}

async function verifyDeepSeek() {
  if (process.env.XIABI_VERIFY_DEEPSEEK !== "1") {
    skipOrStrict("deepseek generation", "set XIABI_VERIFY_DEEPSEEK=1 to run a real generation");
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
  const taskId = task.taskId || task.id;
  if (!taskId) throw new Error("DeepSeek generation did not return a task id");
  let current = task;
  for (let index = 0; index < 30; index += 1) {
    current = await api(`/api/public/tasks/${taskId}`, {}, cookie);
    if (current.status === "succeeded" && current.letterId) break;
    if (current.status === "failed") throw new Error(current.errorMessage || "DeepSeek generation failed");
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  if (current.status !== "succeeded" || !current.letterId) throw new Error("DeepSeek generation did not complete before timeout");
  addCheck("deepseek generation", "ok", { taskId, letterId: current.letterId });
}

async function verifyPaymentCreate() {
  if (process.env.XIABI_VERIFY_PAYMENT_CREATE !== "1") {
    skipOrStrict("wechat payment create", "set XIABI_VERIFY_PAYMENT_CREATE=1 to create a real unpaid WeChat H5 order");
    return;
  }
  const cookie = await createGuestSession();
  let order;
  try {
    order = await api("/api/public/orders", {
      method: "POST",
      body: JSON.stringify({ productType: "annual" })
    }, cookie);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "");
    if (message.includes("产品权限未开通")) {
      addCheck("wechat payment create", "external_blocked", {
        reason: message,
        next: "在微信商户平台产品中心开通 H5 支付，或补齐公众号网页授权后改用微信内 JSAPI 支付。"
      });
      return;
    }
    throw error;
  }
  if (!order.payment?.configured || !order.payment?.h5Url) throw new Error("WeChat payment create did not return h5Url");
  addCheck("wechat payment create", "ok", { orderId: order.orderId, providerOrderNo: order.providerOrderNo });
}

async function verifyPaidOrderClosure() {
  const orderId = process.env.XIABI_VERIFY_PAID_ORDER_ID;
  if (!orderId) {
    skipOrStrict("wechat paid order closure", "set XIABI_VERIFY_PAID_ORDER_ID after completing a real payment");
    return;
  }
  const admin = await adminLogin();
  if (!admin) throw new Error("XIABI_VERIFY_PAID_ORDER_ID requires XIABI_VERIFY_ADMIN_USERNAME and XIABI_VERIFY_ADMIN_PASSWORD");
  const detail = await api(`/api/public/admin/orders/${encodeURIComponent(orderId)}`, {}, admin.cookie);
  if (detail.order?.status !== "paid") throw new Error(`paid order closure expected paid, got ${detail.order?.status || "missing"}`);
  const entitlements = Array.isArray(detail.entitlements) ? detail.entitlements : [];
  if (!entitlements.some((item) => item.status === "active" || item.status === "used")) {
    throw new Error("paid order closure did not find an active/used entitlement ledger row");
  }
  const events = Array.isArray(detail.events) ? detail.events : [];
  if (process.env.XIABI_VERIFY_REQUIRE_WEBHOOK === "1" && !events.some((item) => item.status === "processed")) {
    throw new Error("paid order closure did not find a processed payment webhook event");
  }
  addCheck("wechat paid order closure", "ok", {
    orderId,
    productType: detail.order.productType,
    entitlementCount: entitlements.length,
    processedWebhookEvents: events.filter((item) => item.status === "processed").length
  });
}

async function verifySmsSend() {
  const phone = process.env.XIABI_VERIFY_SMS_PHONE;
  if (!phone) {
    skipOrStrict("sms send", "set XIABI_VERIFY_SMS_PHONE to send a real SMS code");
    return;
  }
  const cookie = await createGuestSession();
  const code = process.env.XIABI_VERIFY_SMS_CODE;
  if (code) {
    const bind = await api("/api/public/users/bind-phone", {
      method: "POST",
      body: JSON.stringify({ phone, code })
    }, cookie);
    if (!bind.bound || !bind.phoneMasked) throw new Error("SMS bind did not report bound=true");
    addCheck("sms bind", "ok", { phoneMasked: bind.phoneMasked });
    return;
  }
  const result = await api("/api/public/sms/send-code", {
    method: "POST",
    body: JSON.stringify({ phone })
  }, cookie);
  if (!result.sent || result.configured === false) throw new Error("SMS send did not report sent=true");
  addCheck("sms send", "ok", {
    phoneMasked: result.phoneMasked || result.phone,
    provider: result.provider,
    next: "set XIABI_VERIFY_SMS_CODE to the received code and rerun to verify binding"
  });
}

async function verifyTts() {
  if (process.env.XIABI_VERIFY_TTS !== "1") {
    skipOrStrict("minimax tts", "set XIABI_VERIFY_TTS=1 to call MiniMax TTS");
    return;
  }
  const cookie = await createGuestSession();
  const result = await api("/api/public/voice/speak", {
    method: "POST",
    body: JSON.stringify({ text: "你好，我是智多星。" })
  }, cookie);
  if (!result.configured || !result.audioUrl) throw new Error("MiniMax TTS did not return an audio URL");
  const audio = await fetch(result.audioUrl);
  if (!audio.ok) throw new Error(`MiniMax TTS audio URL returned ${audio.status}`);
  const contentType = audio.headers.get("content-type") || "";
  const bytes = await audio.arrayBuffer();
  if (bytes.byteLength < 1000) throw new Error("MiniMax TTS audio response is unexpectedly small");
  addCheck("minimax tts", "ok", { voiceId: result.voiceId, traceId: result.traceId, contentType, bytes: bytes.byteLength });
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
    skipOrStrict("voice asr", "set XIABI_VERIFY_ASR_AUDIO to an audio file path");
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
await verifyPaidOrderClosure();
await verifySmsSend();
await verifyTts();
await verifyAsr();

const failed = checks.filter((item) => ["missing", "failed", "external_blocked"].includes(item.status));
if (failed.length) {
  console.error(JSON.stringify({ ok: false, baseUrl, checks }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, baseUrl, strict, checks }, null, 2));
