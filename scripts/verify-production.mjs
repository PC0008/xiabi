import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.XIABI_VERIFY_BASE_URL || "https://immortal-sponge-1728.edgespark.app";
const strict = process.env.XIABI_PRODUCTION_STRICT === "1";
const allowExternalBlocked = process.env.XIABI_VERIFY_ALLOW_EXTERNAL_BLOCKED === "1";
const checks = [];
const reportArgIndex = process.argv.indexOf("--report");
const reportPath = reportArgIndex >= 0 ? process.argv[reportArgIndex + 1] : process.env.XIABI_VERIFY_REPORT_PATH;
let deepSeekVerification = null;

function addCheck(name, status, detail = {}) {
  checks.push({ name, status, ...detail });
}

function findCheck(name) {
  return checks.find((item) => item.name === name) || null;
}

function checkStatus(name) {
  return findCheck(name)?.status || "not_run";
}

function readinessStatus(names) {
  const statuses = names.map(checkStatus);
  if (statuses.every((status) => status === "ok")) return "verified";
  if (statuses.includes("external_blocked")) return "external_blocked";
  if (statuses.includes("missing") || statuses.includes("failed")) return "failed";
  return "pending_input";
}

function buildReadinessReport() {
  const matrix = [
    {
      requirement: "线上基础运行",
      status: readinessStatus(["health", "public config", "session logout", "product profile crud"]),
      evidence: ["health", "public config", "session logout", "product profile crud"]
    },
    {
      requirement: "管理后台登录与运营接口",
      status: readinessStatus(["admin diagnostics", "admin read operations", "admin config propagation", "admin config audit diff"]),
      evidence: ["admin diagnostics", "admin read operations", "admin config propagation", "admin config audit diff"],
      next: "设置 XIABI_VERIFY_ADMIN_USERNAME / XIABI_VERIFY_ADMIN_PASSWORD 后复验。"
    },
    {
      requirement: "DeepSeek 写信闭环",
      status: readinessStatus(["deepseek generation"]),
      evidence: ["deepseek generation"],
      next: "设置 XIABI_VERIFY_DEEPSEEK=1 会真实消耗一次生成额度。"
    },
    {
      requirement: "首次免费权益与导出",
      status: readinessStatus(["first free entitlement and export"]),
      evidence: ["first free entitlement and export"],
      next: "设置 XIABI_VERIFY_DEEPSEEK=1 后会在同一会话内验证领取、权益流水和打印版导出。"
    },
    {
      requirement: "首次免费重复领取限制",
      status: readinessStatus(["first free repeat guard"]),
      evidence: ["first free repeat guard"],
      next: "设置 XIABI_VERIFY_DEEPSEEK=1 和 XIABI_VERIFY_REPEAT_FREE=1 后，会生成第二封信并验证重复免费领取被拒绝。"
    },
    {
      requirement: "微信支付下单",
      status: readinessStatus(["wechat payment create"]),
      evidence: ["wechat payment create"],
      next: findCheck("wechat payment create")?.next || "设置 XIABI_VERIFY_PAYMENT_CREATE=1 后复验。"
    },
    {
      requirement: "微信付款回调与权益到账",
      status: readinessStatus(["wechat paid order closure", "paid entitlement idempotency"]),
      evidence: ["wechat paid order closure", "paid entitlement idempotency"],
      next: "完成真实付款后设置 XIABI_VERIFY_PAID_ORDER_ID，并可设置 XIABI_VERIFY_REQUIRE_WEBHOOK=1；脚本会复验重复补发不重复加权益。"
    },
    {
      requirement: "短信发送与手机号绑定",
      status: checkStatus("sms bind") === "ok" ? "verified" : readinessStatus(["sms send"]),
      evidence: ["sms send", "sms bind"],
      next: "设置 XIABI_VERIFY_SMS_PHONE 发送验证码；收到后设置 XIABI_VERIFY_SMS_CODE 复验绑定。"
    },
    {
      requirement: "手机号绑定后资产归属",
      status: readinessStatus(["sms ownership propagation"]),
      evidence: ["sms ownership propagation"],
      next: "同一轮设置 XIABI_VERIFY_DEEPSEEK=1、XIABI_VERIFY_SMS_PHONE 和 XIABI_VERIFY_SMS_CODE，可复验绑定后信件和权益归属到手机号用户。"
    },
    {
      requirement: "MiniMax 说话播放",
      status: readinessStatus(["minimax tts"]),
      evidence: ["minimax tts"],
      next: "设置 XIABI_VERIFY_TTS=1 会真实调用一次 MiniMax TTS。"
    },
    {
      requirement: "语音输入转写",
      status: readinessStatus(["voice asr"]),
      evidence: ["voice asr"],
      next: "MiniMax 官方 API 总览当前未列独立 ASR 端点；拿到可用 VOICE_ASR_ENDPOINT 后，设置 XIABI_VERIFY_ASR_AUDIO=本地音频路径复验，兼容 JSON base64 和 OpenAI-compatible multipart。"
    }
  ];
  return {
    summary: {
      verified: matrix.filter((item) => item.status === "verified").length,
      pendingInput: matrix.filter((item) => item.status === "pending_input").length,
      externalBlocked: matrix.filter((item) => item.status === "external_blocked").length,
      failed: matrix.filter((item) => item.status === "failed").length
    },
    matrix
  };
}

function statusLabel(status) {
  if (status === "verified") return "已验证";
  if (status === "pending_input") return "待输入";
  if (status === "external_blocked") return "外部阻塞";
  if (status === "failed") return "失败";
  return status;
}

function completionSummary(readiness, failed) {
  const hasExternalBlocked = readiness.summary.externalBlocked > 0 || failed.some((item) => item.status === "external_blocked");
  const hasFailed = readiness.summary.failed > 0 || failed.some((item) => item.status === "missing" || item.status === "failed");
  if (hasFailed) {
    return {
      status: "failed",
      complete: false,
      summary: "未通过：存在失败项，需要先修复。"
    };
  }
  if (hasExternalBlocked) {
    return {
      status: "external_blocked",
      complete: false,
      summary: "未完成：存在外部阻塞项，需要商户、短信或语音供应商侧配合。"
    };
  }
  if (readiness.summary.pendingInput > 0) {
    return {
      status: "pending_input",
      complete: false,
      summary: "基础通过：仍有真实外部链路等待输入或付费验收。"
    };
  }
  return {
    status: "complete",
    complete: true,
    summary: "完整通过：所有生产链路已验收。"
  };
}

function renderMarkdownReport(report) {
  const lines = [
    "# 生产验收状态报告",
    "",
    `生成时间：${report.generatedAt}`,
    `线上地址：${report.baseUrl}`,
    `整体结果：${report.completion.summary}`,
    `完整可用：${report.complete ? "是" : "否"}`,
    "",
    "## 汇总",
    "",
    `- 已验证：${report.readiness.summary.verified}`,
    `- 待输入：${report.readiness.summary.pendingInput}`,
    `- 外部阻塞：${report.readiness.summary.externalBlocked}`,
    `- 失败：${report.readiness.summary.failed}`,
    "",
    "## 验收矩阵",
    "",
    "| 能力 | 状态 | 证据 | 下一步 |",
    "| --- | --- | --- | --- |"
  ];
  for (const item of report.readiness.matrix) {
    lines.push(`| ${item.requirement} | ${statusLabel(item.status)} | ${item.evidence.join(", ")} | ${item.next || ""} |`);
  }
  lines.push("", "## 原始检查项", "");
  for (const item of report.checks) {
    const detail = item.reason || item.next || item.missingRequired?.join(", ") || "";
    lines.push(`- ${item.name}: ${item.status}${detail ? `；${detail}` : ""}`);
  }
  lines.push("");
  return lines.join("\n");
}

async function writeReport(report) {
  if (!reportPath) return;
  const outputPath = path.resolve(reportPath);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const content = outputPath.toLowerCase().endsWith(".md")
    ? renderMarkdownReport(report)
    : `${JSON.stringify(report, null, 2)}\n`;
  await fs.writeFile(outputPath, content, "utf8");
}

function skipOrStrict(name, reason) {
  addCheck(name, "skipped", { reason });
  if (strict) throw new Error(`strict verification requires ${name}: ${reason}`);
}

function getCookie(headers) {
  const value = headers.get("set-cookie") || "";
  return value.split(";")[0];
}

class ApiError extends Error {
  constructor(label, response, payload, text) {
    const message = payload?.error?.message || payload?.error?.code || text.slice(0, 160);
    super(`${label} failed: ${response.status} ${message}`);
    this.name = "ApiError";
    this.status = response.status;
    this.code = payload?.error?.code || "";
    this.payload = payload;
  }
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
    throw new ApiError(label, response, payload, text);
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

async function expectApiError(pathname, init = {}, cookie = "", expectedStatus, expectedCode) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    credentials: "include",
    ...init,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...(init.headers || {})
    }
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${pathname} returned non-JSON: ${text.slice(0, 160)}`);
  }
  const code = payload?.error?.code;
  if (response.status !== expectedStatus || code !== expectedCode) {
    throw new Error(`${pathname} expected ${expectedStatus}/${expectedCode}, got ${response.status}/${code || "missing_code"}`);
  }
  return payload;
}

async function createGuestSession() {
  const response = await fetch(`${baseUrl}/api/public/session/guest`, { method: "POST" });
  await readJsonResponse(response, "guest session");
  const cookie = getCookie(response.headers);
  if (!cookie) throw new Error("guest session did not set a cookie");
  return cookie;
}

async function verifySessionLogout() {
  const cookie = await createGuestSession();
  const before = await api("/api/public/session/me", {}, cookie);
  const beforeSessionId = before.session?.id;
  if (!beforeSessionId) throw new Error("session/me did not return the created guest session");

  const logoutResponse = await fetch(`${baseUrl}/api/public/session/logout`, {
    method: "POST",
    headers: { cookie }
  });
  const logout = await readJsonResponse(logoutResponse, "session logout");
  const clearCookie = getCookie(logoutResponse.headers);
  if (!logout.loggedOut || clearCookie !== "xiabi_session=") {
    throw new Error("session logout did not clear the xiabi_session cookie");
  }

  const after = await api("/api/public/session/me", {}, cookie);
  if (after.session?.id === beforeSessionId || after.user) {
    throw new Error("session/me reused the logged-out session");
  }

  const nextResponse = await fetch(`${baseUrl}/api/public/session/guest`, {
    method: "POST",
    headers: { cookie }
  });
  const next = await readJsonResponse(nextResponse, "guest session after logout");
  const nextCookie = getCookie(nextResponse.headers);
  if (!next.sessionId || next.sessionId === beforeSessionId || nextCookie === cookie) {
    throw new Error("guest session after logout reused the old session cookie");
  }
  addCheck("session logout", "ok", {
    beforeSessionId,
    nextSessionId: next.sessionId
  });
}

async function verifyProductProfileCrud() {
  const cookie = await createGuestSession();
  const created = await api("/api/public/profiles", {
    method: "POST",
    body: JSON.stringify({
      name: "生产验收产品档案",
      audience: "需要写销售信的人",
      value: "把产品价值讲清楚",
      proof: "自动验收样本"
    })
  }, cookie);
  const profileId = created.profile?.id;
  if (!profileId) throw new Error("product profile create did not return an id");

  const updated = await api(`/api/public/profiles/${encodeURIComponent(profileId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: "生产验收产品档案更新",
      audience: "需要写销售信的人",
      value: "把产品价值讲清楚",
      proof: "自动验收样本已更新"
    })
  }, cookie);
  if (updated.profile?.name !== "生产验收产品档案更新") throw new Error("product profile update did not persist");

  const listed = await api("/api/public/profiles", {}, cookie);
  const found = (listed.profiles || []).some((item) => item.id === profileId && item.name === "生产验收产品档案更新");
  if (!found) throw new Error("product profile list did not include the saved profile");

  const deleted = await api(`/api/public/profiles/${encodeURIComponent(profileId)}`, { method: "DELETE" }, cookie);
  if (!deleted.deleted) throw new Error("product profile delete did not report success");
  const afterDelete = await api("/api/public/profiles", {}, cookie);
  if ((afterDelete.profiles || []).some((item) => item.id === profileId)) {
    throw new Error("deleted product profile still appears in active list");
  }
  addCheck("product profile crud", "ok", { profileId });
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
    skipOrStrict("admin config propagation", "set XIABI_VERIFY_ADMIN_USERNAME and XIABI_VERIFY_ADMIN_PASSWORD to verify admin config controls public config");
    skipOrStrict("admin config audit diff", "set XIABI_VERIFY_ADMIN_USERNAME and XIABI_VERIFY_ADMIN_PASSWORD to verify config update audit details");
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
    ["/api/public/admin/users?limit=2&page=1", (payload) => Array.isArray(payload.users) && Array.isArray(payload.sessions) && !!payload.pageInfo],
    ["/api/public/admin/profiles?limit=2&page=1", (payload) => Array.isArray(payload.profiles) && !!payload.pageInfo],
    ["/api/public/admin/letters?status=ready&limit=2&page=1", (payload) => Array.isArray(payload.letters) && !!payload.pageInfo],
    ["/api/public/admin/tasks?status=failed&limit=2&page=1", (payload) => Array.isArray(payload.tasks) && !!payload.pageInfo],
    ["/api/public/admin/orders?status=pending&limit=2&page=1", (payload) => Array.isArray(payload.orders) && !!payload.pageInfo],
    ["/api/public/admin/entitlements?status=active&limit=2&page=1", (payload) => Array.isArray(payload.entitlements) && !!payload.pageInfo],
    ["/api/public/admin/payment-events?status=failed&limit=2&page=1", (payload) => Array.isArray(payload.events) && !!payload.pageInfo],
    ["/api/public/admin/feedback?limit=2&page=1", (payload) => Array.isArray(payload.feedback) && !!payload.pageInfo],
    ["/api/public/admin/audit-logs?limit=2&page=1", (payload) => Array.isArray(payload.logs) && !!payload.pageInfo]
  ];
  for (const [pathname, validate] of listChecks) {
    const payload = await api(pathname, {}, admin.cookie);
    if (!validate(payload)) throw new Error(`${pathname} returned unexpected admin list payload`);
    if (JSON.stringify(payload).includes(admin.password)) throw new Error(`${pathname} leaked the admin password`);
  }
  addCheck("admin read operations", "ok", { routes: listChecks.length });

  const config = await api("/api/public/admin/config", {}, admin.cookie);
  const saved = await api("/api/public/admin/config", {
    method: "PATCH",
    body: JSON.stringify({
      home: config.homeConfig || config.home || {},
      pricing: config.pricing || {},
      guideStages: config.guideStages || [],
      templates: config.templates || [],
      system: config.system || {}
    })
  }, admin.cookie);
  const publicConfig = await api("/api/public/config");
  const savedHome = saved.homeConfig || saved.home || {};
  const publicHome = publicConfig.homeConfig || publicConfig.home || {};
  const savedPricing = saved.pricing || {};
  const publicPricing = publicConfig.pricing || {};
  const savedGuideStages = Array.isArray(saved.guideStages) ? saved.guideStages : [];
  const publicGuideStages = Array.isArray(publicConfig.guideStages) ? publicConfig.guideStages : [];
  const savedSystem = saved.system || {};
  const publicSystem = publicConfig.system || {};
  if (
    savedHome.hero_title !== publicHome.hero_title ||
    Number(savedPricing.annual || 0) !== Number(publicPricing.annual || 0) ||
    Number(savedPricing.single || 0) !== Number(publicPricing.single || 0) ||
    savedPricing.payment_enabled !== publicPricing.payment_enabled ||
    savedSystem.generation_enabled !== publicSystem.generation_enabled ||
    savedSystem.sms_enabled !== publicSystem.sms_enabled ||
    savedSystem.voice_enabled !== publicSystem.voice_enabled ||
    savedSystem.file_export_enabled !== publicSystem.file_export_enabled ||
    JSON.stringify(savedGuideStages) !== JSON.stringify(publicGuideStages)
  ) {
    throw new Error("admin config propagation did not match public config");
  }
  addCheck("admin config propagation", "ok", {
    heroTitleLength: String(publicHome.hero_title || "").length,
    annualPrice: publicPricing.annual || null,
    singlePrice: publicPricing.single || null,
    guideStageCount: publicGuideStages.length
  });
  const auditLogs = await api("/api/public/admin/audit-logs?limit=10&page=1", {}, admin.cookie);
  const configAudit = (auditLogs.logs || []).find((item) => item.action === "config.update" && Array.isArray(item.detail?.changes));
  if (!configAudit || typeof configAudit.detail.changedCount !== "number" || typeof configAudit.detail.truncated !== "boolean") {
    throw new Error("admin config audit log did not include field-level diff metadata");
  }
  addCheck("admin config audit diff", "ok", {
    changedCount: configAudit.detail.changedCount,
    truncated: configAudit.detail.truncated,
    scopeCount: (configAudit.detail.scopes || []).length
  });
}

async function verifyDeepSeek() {
  if (process.env.XIABI_VERIFY_DEEPSEEK !== "1") {
    skipOrStrict("deepseek generation", "set XIABI_VERIFY_DEEPSEEK=1 to run a real generation");
    skipOrStrict("first free entitlement and export", "set XIABI_VERIFY_DEEPSEEK=1 to verify first free entitlement and export");
    skipOrStrict("first free repeat guard", "set XIABI_VERIFY_DEEPSEEK=1 and XIABI_VERIFY_REPEAT_FREE=1 to verify repeat guard");
    skipOrStrict("sms ownership propagation", "set XIABI_VERIFY_DEEPSEEK=1 with SMS bind verification to check ownership propagation");
    return;
  }
  const cookie = await createGuestSession();
  const current = await createDeepSeekLetter(cookie, "production-verification");
  const taskId = current.taskId;
  addCheck("deepseek generation", "ok", { taskId, letterId: current.letterId });
  let claimedLetterId = current.letterId;
  let claimed;
  let repeatGuard = null;
  if (process.env.XIABI_VERIFY_REPEAT_FREE === "1") {
    const second = await createDeepSeekLetter(cookie, "production-repeat-free-verification");
    const claims = await Promise.all([
      claimLetterForVerification(cookie, current.letterId),
      claimLetterForVerification(cookie, second.letterId)
    ]);
    const successes = claims.filter((item) => item.ok);
    const firstFreeRejected = claims.filter((item) => !item.ok && item.code === "first_free_used");
    if (successes.length !== 1 || firstFreeRejected.length !== 1) {
      throw new Error(`Concurrent first-free claim guard expected one success and one first_free_used rejection, got ${claims.map((item) => `${item.letterId}:${item.status}:${item.code || "ok"}`).join(", ")}`);
    }
    claimed = successes[0].data;
    claimedLetterId = successes[0].letterId;
    repeatGuard = {
      firstLetterId: current.letterId,
      secondLetterId: second.letterId,
      claimedLetterId,
      rejectedLetterId: firstFreeRejected[0].letterId
    };
  } else {
    claimed = await api(`/api/public/letters/${current.letterId}/claim`, { method: "POST" }, cookie);
  }
  if (!claimed.access?.complete || !claimed.claimedAt) throw new Error("First free claim did not unlock the generated letter");
  const entitlements = await api("/api/public/entitlements", {}, cookie);
  const rows = Array.isArray(entitlements.entitlements) ? entitlements.entitlements : [];
  const firstFree = rows.find((item) => item.type === "first_free_letter" && item.letterId === claimedLetterId);
  if (!entitlements.summary?.firstFreeUsed || !firstFree) {
    throw new Error("First free entitlement ledger was not created for the generated letter");
  }
  const exported = await api(`/api/public/exports/letters/${claimedLetterId}`, { method: "POST" }, cookie);
  if (!exported.downloadUrl || exported.fileType !== "print_html" || exported.contentType !== "text/html; charset=utf-8" || !String(exported.filename || "").endsWith(".html")) {
    throw new Error("Printable export did not return a download URL");
  }
  const html = await fetch(exported.downloadUrl);
  if (!html.ok) throw new Error(`Printable export URL returned ${html.status}`);
  const text = await html.text();
  if (!text.includes("<article") || !text.includes("智多星整理")) {
    throw new Error("Printable export did not contain the expected letter HTML");
  }
  addCheck("first free entitlement and export", "ok", {
    letterId: claimedLetterId,
    entitlementId: firstFree.id,
    objectKey: exported.objectKey
  });
  deepSeekVerification = {
    cookie,
    letterId: claimedLetterId,
    entitlementId: firstFree.id,
    exportObjectKey: exported.objectKey
  };
  if (process.env.XIABI_VERIFY_REPEAT_FREE === "1") {
    addCheck("first free repeat guard", "ok", {
      ...repeatGuard,
      mode: "concurrent"
    });
  } else {
    skipOrStrict("first free repeat guard", "set XIABI_VERIFY_REPEAT_FREE=1 to generate a second letter and verify repeat free claim is rejected");
  }
}

async function claimLetterForVerification(cookie, letterId) {
  const response = await fetch(`${baseUrl}/api/public/letters/${encodeURIComponent(letterId)}/claim`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie
    }
  });
  const payload = await response.json().catch(() => ({}));
  return {
    letterId,
    status: response.status,
    ok: response.ok && payload?.ok !== false,
    code: payload?.error?.code || "",
    data: payload?.data
  };
}

async function createDeepSeekLetter(cookie, source) {
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
      input: { source }
    })
  }, cookie);
  const taskId = task.taskId || task.id;
  if (!taskId) throw new Error("DeepSeek generation did not return a task id");
  if (task.queue?.mode && task.queue.mode !== "edgespark-background") {
    throw new Error(`Unexpected generation queue mode: ${task.queue.mode}`);
  }
  let current = task;
  for (let index = 0; index < 30; index += 1) {
    current = await api(`/api/public/tasks/${taskId}`, {}, cookie);
    if (current.status === "succeeded" && current.letterId) break;
    if (current.status === "failed") throw new Error(current.errorMessage || "DeepSeek generation failed");
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  if (current.status !== "succeeded" || !current.letterId) throw new Error("DeepSeek generation did not complete before timeout");
  return { ...current, taskId };
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
    if (error instanceof ApiError && error.code === "wechat_pay_external_blocked") {
      addCheck("wechat payment create", "external_blocked", {
        reason: error.message,
        next: "在微信支付商户平台产品中心开通 H5 支付；微信内支付还需要开通 JSAPI 支付并补齐公众号网页授权配置。"
      });
      return;
    }
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
    skipOrStrict("paid entitlement idempotency", "set XIABI_VERIFY_PAID_ORDER_ID to verify repeated entitlement repair is idempotent");
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
  const beforeCount = entitlements.length;
  const firstRepair = await api(`/api/public/admin/orders/${encodeURIComponent(orderId)}/rebuild-entitlement`, { method: "POST" }, admin.cookie);
  const secondRepair = await api(`/api/public/admin/orders/${encodeURIComponent(orderId)}/rebuild-entitlement`, { method: "POST" }, admin.cookie);
  const firstCount = Array.isArray(firstRepair.entitlements) ? firstRepair.entitlements.length : 0;
  const secondEntitlements = Array.isArray(secondRepair.entitlements) ? secondRepair.entitlements : [];
  const secondCount = secondEntitlements.length;
  if (firstCount !== secondCount || secondCount < beforeCount || secondCount === 0) {
    throw new Error(`paid entitlement idempotency expected stable entitlement count, got before=${beforeCount}, first=${firstCount}, second=${secondCount}`);
  }
  const dedupeKeys = secondEntitlements.map((item) => item.dedupeKey).filter(Boolean);
  if (new Set(dedupeKeys).size !== dedupeKeys.length) {
    throw new Error("paid entitlement idempotency found duplicate dedupe keys");
  }
  addCheck("wechat paid order closure", "ok", {
    orderId,
    productType: detail.order.productType,
    entitlementCount: entitlements.length,
    processedWebhookEvents: events.filter((item) => item.status === "processed").length
  });
  addCheck("paid entitlement idempotency", "ok", {
    orderId,
    beforeCount,
    firstRepairCount: firstCount,
    secondRepairCount: secondCount
  });
}

async function verifySmsSend() {
  const phone = process.env.XIABI_VERIFY_SMS_PHONE;
  if (!phone) {
    skipOrStrict("sms send", "set XIABI_VERIFY_SMS_PHONE to send a real SMS code");
    if (!findCheck("sms ownership propagation")) {
      skipOrStrict("sms ownership propagation", "set XIABI_VERIFY_SMS_PHONE, XIABI_VERIFY_SMS_CODE, and XIABI_VERIFY_DEEPSEEK=1 to verify ownership propagation");
    }
    return;
  }
  const cookie = deepSeekVerification?.cookie || await createGuestSession();
  const code = process.env.XIABI_VERIFY_SMS_CODE;
  if (code) {
    const bind = await api("/api/public/users/bind-phone", {
      method: "POST",
      body: JSON.stringify({ phone, code })
    }, cookie);
    if (!bind.bound || !bind.phoneMasked) throw new Error("SMS bind did not report bound=true");
    addCheck("sms bind", "ok", { phoneMasked: bind.phoneMasked });
    if (deepSeekVerification) {
      const [session, letter, entitlements] = await Promise.all([
        api("/api/public/session/me", {}, cookie),
        api(`/api/public/letters/${deepSeekVerification.letterId}`, {}, cookie),
        api("/api/public/entitlements", {}, cookie)
      ]);
      if (session.user?.id !== bind.userId) throw new Error("SMS bind did not attach the current session to the bound user");
      if (!letter.access?.complete) throw new Error("Bound user cannot access the generated first-free letter");
      const rows = Array.isArray(entitlements.entitlements) ? entitlements.entitlements : [];
      const boundFirstFree = rows.find((item) => item.id === deepSeekVerification.entitlementId && item.userId === bind.userId);
      if (!entitlements.summary?.firstFreeUsed || !boundFirstFree) {
        throw new Error("SMS bind did not propagate first-free entitlement ownership to the bound user");
      }
      const admin = await adminLogin();
      let exportFileOwnershipChecked = false;
      if (admin && deepSeekVerification.exportObjectKey) {
        const detail = await api(`/api/public/admin/letters/${encodeURIComponent(deepSeekVerification.letterId)}`, {}, admin.cookie);
        const file = (detail.files || []).find((item) => item.objectKey === deepSeekVerification.exportObjectKey);
        if (!file) throw new Error("SMS bind did not leave the exported file visible in admin letter detail");
        if (file.userId !== bind.userId) throw new Error("SMS bind did not propagate exported file ownership to the bound user");
        exportFileOwnershipChecked = true;
      }
      addCheck("sms ownership propagation", "ok", {
        userId: bind.userId,
        letterId: deepSeekVerification.letterId,
        entitlementId: deepSeekVerification.entitlementId,
        exportFileOwnershipChecked
      });
    } else {
      skipOrStrict("sms ownership propagation", "set XIABI_VERIFY_DEEPSEEK=1 in the same run to verify generated letter and entitlement ownership");
    }
    return;
  }
  if (!findCheck("sms ownership propagation")) {
    skipOrStrict("sms ownership propagation", "set XIABI_VERIFY_SMS_CODE with XIABI_VERIFY_DEEPSEEK=1 to verify generated letter and entitlement ownership");
  }
  let result;
  try {
    result = await api("/api/public/sms/send-code", {
      method: "POST",
      body: JSON.stringify({ phone })
    }, cookie);
  } catch (error) {
    if (error instanceof ApiError && ["sms_send_failed", "sms_not_configured"].includes(error.code)) {
      addCheck("sms send", "external_blocked", {
        reason: error.message,
        next: "检查阿里云短信 AccessKey、签名、模板、产品开通状态和模板审核状态后复验。"
      });
      return;
    }
    throw error;
  }
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

function normalizeTranscript(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[，。！？、,.!?;；:："'“”‘’（）()【】\[\]\-—_]/g, "");
}

async function verifyAsr() {
  const audioPath = process.env.XIABI_VERIFY_ASR_AUDIO;
  if (!audioPath) {
    skipOrStrict("voice asr", "set XIABI_VERIFY_ASR_AUDIO to an audio file path after configuring a real VOICE_ASR_ENDPOINT");
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
  const expectedText = process.env.XIABI_VERIFY_ASR_EXPECTED_TEXT;
  if (expectedText) {
    const transcript = normalizeTranscript(result.transcript);
    const expected = normalizeTranscript(expectedText);
    if (!transcript.includes(expected)) {
      throw new Error(`ASR transcript did not include expected text. expected=${expectedText} transcript=${result.transcript}`);
    }
  }
  addCheck("voice asr", "ok", {
    provider: result.provider,
    requestFormat: result.requestFormat,
    transcriptLength: result.transcript.length,
    expectedMatched: expectedText ? true : undefined
  });
}

await api("/api/public/health");
addCheck("health", "ok");
const publicConfig = await api("/api/public/config");
if (
  typeof publicConfig?.capabilities?.voice?.ttsConfigured !== "boolean" ||
  typeof publicConfig?.capabilities?.voice?.asrConfigured !== "boolean" ||
  typeof publicConfig?.capabilities?.voice?.asrVerified !== "boolean" ||
  typeof publicConfig?.capabilities?.voice?.asrPreferred !== "boolean"
) {
  throw new Error("public config did not expose voice capability booleans");
}
addCheck("public config", "ok", { voiceCapabilities: publicConfig.capabilities.voice });

await verifySessionLogout();
await verifyProductProfileCrud();
await verifyAdminDiagnostics();
await verifyDeepSeek();
await verifyPaymentCreate();
await verifyPaidOrderClosure();
await verifySmsSend();
await verifyTts();
await verifyAsr();

const failed = checks.filter((item) => ["missing", "failed", "external_blocked"].includes(item.status));
const readiness = buildReadinessReport();
const completion = completionSummary(readiness, failed);
const report = {
  ok: failed.length === 0,
  complete: completion.complete,
  overallStatus: completion.status,
  completion,
  generatedAt: new Date().toISOString(),
  baseUrl,
  strict,
  allowExternalBlocked,
  checks,
  readiness
};
await writeReport(report);
if (failed.length) {
  console.error(JSON.stringify(report, null, 2));
  if (allowExternalBlocked && failed.every((item) => item.status === "external_blocked")) {
    process.exit(0);
  }
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));
