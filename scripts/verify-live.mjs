import { exec } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);
const baseUrl = process.env.XIABI_VERIFY_BASE_URL || "https://immortal-sponge-1728.edgespark.app";
const assetsDir = path.resolve("docs/assets");

async function assertHttp(pathname, check) {
  const { status, text } = await fetchText(pathname);
  if (check && !check(text)) throw new Error(`${pathname} returned unexpected content`);
  return { pathname, status };
}

async function assertJson(pathname, init, expectedStatus, check) {
  const response = await fetch(`${baseUrl}${pathname}`, init);
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    // Keep the raw text for the error below.
  }
  const expectedStatuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  if (!expectedStatuses.includes(response.status)) {
    throw new Error(`${pathname} returned ${response.status}, expected ${expectedStatuses.join(" or ")}: ${text.slice(0, 160)}`);
  }
  if (check && !check(payload, response)) throw new Error(`${pathname} returned unexpected JSON`);
  return { pathname, status: response.status };
}

function getCookie(headers) {
  const value = headers.get("set-cookie") || "";
  return value.split(";")[0];
}

async function fetchText(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  const text = await response.text();
  if (!response.ok) throw new Error(`${pathname} returned ${response.status}`);
  return { pathname, status: response.status, text };
}

async function assertStaticFrontendAssets() {
  const store = await assertHttp("/store.js", (text) => text.includes("window.XiabiStore"));
  const storeText = (await fetchText("/store.js")).text;
  if (storeText.includes("XiabiMockStore")) throw new Error("/store.js still exposes XiabiMockStore");
  console.log(`[ok] /store.js returned ${store.status} and exposes window.XiabiStore`);

  const pages = [];
  for (const [pathname, entryScript] of [["/index.html", "app.js"], ["/admin.html", "admin.js"]]) {
    const { status, text } = await fetchText(pathname);
    if (!text.includes(entryScript)) throw new Error(`${pathname} does not reference ${entryScript}`);
    if (!text.includes("store.js")) throw new Error(`${pathname} does not reference store.js`);
    if (text.includes("mock-store.js")) throw new Error(`${pathname} still references mock-store.js`);
    console.log(`[ok] ${pathname} returned ${status}, references store.js, and does not reference mock-store.js`);
    pages.push({ pathname, status });
  }

  console.log("[ok] Static frontend asset checks passed");
  return [store, ...pages];
}

async function screenshot(url, output, viewport) {
  const command = `npx --yes playwright screenshot --wait-for-timeout=3000 --viewport-size=${viewport} "${url}" "${output}"`;
  await execAsync(command, { windowsHide: true });
  const stat = await fs.stat(output);
  if (stat.size < 10_000) throw new Error(`${output} looks too small to be a valid screenshot`);
  return { output, size: stat.size };
}

await fs.mkdir(assetsDir, { recursive: true });

const checks = [
  await assertHttp("/api/public/health", (text) => text.includes("\"status\":\"ok\"")),
  ...(await assertStaticFrontendAssets()),
  await assertHttp("/api/public/config", (text) => text.includes("pricing")),
  await assertJson("/api/public/config", undefined, 200, (payload) => {
    const system = payload?.data?.system;
    const voiceCapabilities = payload?.data?.capabilities?.voice;
    return system &&
      ["voice_enabled", "sms_enabled", "file_export_enabled"].every((key) => key in system) &&
      typeof voiceCapabilities?.ttsConfigured === "boolean" &&
      typeof voiceCapabilities?.asrConfigured === "boolean" &&
      typeof voiceCapabilities?.asrVerified === "boolean" &&
      typeof voiceCapabilities?.asrPreferred === "boolean";
  }),
  await assertJson("/api/public/tasks/not-a-task", undefined, 401, (payload) => payload?.error?.code === "missing_session")
];

const guest = await fetch(`${baseUrl}/api/public/session/guest`, { method: "POST" });
if (!guest.ok) throw new Error(`guest session returned ${guest.status}`);
const cookie = getCookie(guest.headers);
if (!cookie) throw new Error("guest session did not set a cookie");
checks.push(await assertJson(
  "/api/public/tasks/not-a-task",
  { headers: { cookie } },
  404,
  (payload) => payload?.error?.code === "task_not_found"
));
checks.push(await assertJson(
  "/api/public/tasks",
  {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ answers: ["x".repeat(1201)] })
  },
  413,
  (payload) => payload?.error?.code === "answer_too_long"
));
checks.push(await assertJson(
  "/api/public/tasks",
  {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      answers: ["short"],
      input: { answerItems: [{ question: "q".repeat(201), answer: "short" }] }
    })
  },
  413,
  (payload) => payload?.error?.code === "answer_item_too_long"
));
checks.push(await assertJson(
  "/api/public/orders",
  { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ productType: "single" }) },
  [400, 403],
  (payload) => ["payment_disabled", "missing_letter"].includes(payload?.error?.code)
));
checks.push(await assertJson(
  "/api/public/orders",
  {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "Mozilla/5.0 MicroMessenger/8.0 xiabi-production-smoke",
      cookie
    },
    body: JSON.stringify({ productType: "annual" })
  },
  [200, 503],
  (payload, response) => response.status === 503
    ? payload?.error?.code === "wechat_oauth_not_configured"
    : payload?.data?.requiresWechatAuth === true
      && payload?.data?.payment?.provider === "wechat_jsapi"
      && String(payload?.data?.oauthUrl || "").includes("open.weixin.qq.com/connect/oauth2/authorize")
));
checks.push(await assertJson(
  "/api/public/feedback",
  { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ category: "production-smoke", content: "自动验收：用户反馈链路可写入。" }) },
  200,
  (payload) => payload?.data?.submitted === true
));
checks.push(await assertJson(
  "/api/public/feedback",
  { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ category: "production-smoke", content: "x".repeat(2001) }) },
  413,
  (payload) => payload?.error?.code === "feedback_too_long"
));
checks.push(await assertJson(
  "/api/public/voice/transcribe",
  { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ text: "测试语音文本" }) },
  200,
  (payload) => payload?.data?.transcript === "测试语音文本"
));
checks.push(await assertJson(
  "/api/public/voice/transcribe",
  { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ audioBase64: "UklGRg==", mimeType: "audio/wav" }) },
  200,
  (payload) => payload?.data?.configured === false || typeof payload?.data?.transcript === "string"
));
checks.push(await assertJson(
  "/api/public/voice/transcribe",
  { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ audioBase64: "UklGRg==", mimeType: "audio/webm;codecs=opus" }) },
  200,
  (payload) => payload?.data?.configured === false || typeof payload?.data?.transcript === "string"
));
checks.push(await assertJson(
  "/api/public/admin/diagnostics",
  undefined,
  401,
  (payload) => payload?.error?.code === "not_authenticated"
));
checks.push(await assertJson(
  "/api/public/admin/password",
  { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentPassword: "x", newPassword: "1234567890" }) },
  401,
  (payload) => payload?.error?.code === "not_authenticated"
));
checks.push(await assertJson(
  "/api/public/admin/login",
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "u".repeat(65), password: "p" })
  },
  413,
  (payload) => payload?.error?.code === "admin_credentials_too_long"
));
const rateLimitUsername = `codex-rate-limit-${Date.now()}`;
for (let index = 0; index < 9; index += 1) {
  checks.push(await assertJson(
    "/api/public/admin/login",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: rateLimitUsername, password: "wrong-password" })
    },
    index < 8 ? 401 : 429,
    (payload) => payload?.error?.code === (index < 8 ? "invalid_credentials" : "admin_login_rate_limited")
  ));
}
checks.push(await assertJson(
  "/api/public/wechat/oauth/start",
  undefined,
  401,
  (payload) => payload?.error?.code === "missing_session"
));
checks.push(await assertJson(
  "/api/public/wechat/oauth/start?returnUrl=%2Findex.html%23orders",
  { headers: { cookie } },
  [200, 503],
  (payload, response) => response.status === 503
    ? payload?.error?.code === "wechat_oauth_not_configured"
    : String(payload?.data?.oauthUrl || "").includes("open.weixin.qq.com/connect/oauth2/authorize")
));
checks.push(await assertJson(
  "/api/public/wechat/oauth/callback?code=fake-code&state=bad-state",
  { headers: { cookie } },
  [400, 503],
  (payload, response) => response.status === 503
    ? payload?.error?.code === "wechat_oauth_not_configured"
    : payload?.error?.code === "invalid_wechat_oauth_state"
));

if (process.env.XIABI_VERIFY_ADMIN_USERNAME && process.env.XIABI_VERIFY_ADMIN_PASSWORD) {
  const login = await fetch(`${baseUrl}/api/public/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: process.env.XIABI_VERIFY_ADMIN_USERNAME,
      password: process.env.XIABI_VERIFY_ADMIN_PASSWORD
    })
  });
  const adminCookie = getCookie(login.headers);
  if (!login.ok || !adminCookie) throw new Error(`admin login returned ${login.status}`);
  checks.push(await assertJson(
    "/api/public/admin/diagnostics",
    { headers: { cookie: adminCookie } },
    200,
    (payload) => {
      const groups = payload?.data?.groups || [];
      const voiceAsr = groups.find((group) => group.key === "voice_asr");
      return Array.isArray(groups) &&
        groups.length >= 5 &&
        Array.isArray(voiceAsr?.items) &&
        voiceAsr.items.some((item) => item.name === "VOICE_INPUT_MODE" && item.required === false) &&
        !JSON.stringify(payload).includes(process.env.XIABI_VERIFY_ADMIN_PASSWORD);
    }
  ));
  checks.push(await assertJson(
    "/api/public/admin/feedback",
    { headers: { cookie: adminCookie } },
    200,
    (payload) => Array.isArray(payload?.data?.feedback) && !JSON.stringify(payload).includes(process.env.XIABI_VERIFY_ADMIN_PASSWORD)
  ));
  checks.push(await assertJson(
    "/api/public/admin/orders?status=pending",
    { headers: { cookie: adminCookie } },
    200,
    (payload) => Array.isArray(payload?.data?.orders)
  ));
}

const screenshots = [
  await screenshot(`${baseUrl}/index.html`, path.join(assetsDir, "verify-home-mobile.png"), "390,844"),
  await screenshot(`${baseUrl}/admin.html`, path.join(assetsDir, "verify-admin-login.png"), "1440,1000")
];

console.log(JSON.stringify({ ok: true, baseUrl, checks, screenshots }, null, 2));
