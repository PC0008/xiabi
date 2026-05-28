import fs from "node:fs";

const sources = {
  admin: fs.readFileSync("server/src/routes/admin.ts", "utf8"),
  orders: fs.readFileSync("server/src/routes/orders.ts", "utf8"),
  sms: fs.readFileSync("server/src/routes/sms.ts", "utf8"),
  tasks: fs.readFileSync("server/src/routes/tasks.ts", "utf8"),
  voice: fs.readFileSync("server/src/routes/voice.ts", "utf8"),
  app: fs.readFileSync("h5/app.js", "utf8"),
  verifyProduction: fs.readFileSync("scripts/verify-production.mjs", "utf8")
};

function fail(message) {
  throw new Error(`sensitive output safety verification failed: ${message}`);
}

function requireIncludes(source, needle, label) {
  if (!source.includes(needle)) fail(`missing ${label}`);
}

function requireNotIncludes(source, needle, label) {
  if (source.includes(needle)) fail(`forbidden ${label}`);
}

function requireNoPattern(source, pattern, label) {
  if (pattern.test(source)) fail(`forbidden ${label}`);
}

function routeSegment(source, startNeedle, endNeedle, label) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  if (start === -1 || end === -1) fail(`missing ${label}`);
  return source.slice(start, end);
}

function requireBefore(source, beforeNeedle, afterNeedle, label) {
  const beforeIndex = source.indexOf(beforeNeedle);
  const afterIndex = source.indexOf(afterNeedle);
  if (beforeIndex === -1) fail(`missing ${label} guard`);
  if (afterIndex === -1) fail(`missing ${label} target`);
  if (beforeIndex > afterIndex) fail(`${label} guard runs after target`);
}

const publicRouteSources = [
  ["orders", sources.orders],
  ["sms", sources.sms],
  ["tasks", sources.tasks],
  ["voice", sources.voice]
];

for (const [name, source] of publicRouteSources) {
  requireNoPattern(source, /return\s+fail\([^;]*(error\.message|String\(error|JSON\.stringify\(error)/s, `${name} route returning raw caught errors`);
  requireNoPattern(source, /detailJson:\s*JSON\.stringify\([^)]*(secret\.get|ADMIN_INITIAL_PASSWORD|ADMIN_PASSWORD_PEPPER|WECHAT_PAY_PRIVATE_KEY|SMS_API_SECRET|VOICE_API_KEY|DEEPSEEK_API_KEY)/s, `${name} route writing secret material to audit detail`);
}

const createOrderRoute = routeSegment(sources.orders, ".post(\"/\", async (c) => {", "\n  .get(\"/:id/payment-status\"", "public create order route");
const retryPayRoute = routeSegment(sources.orders, ".post(\"/:id/pay\"", "\n  .get(\"/:id\",", "public retry payment route");
for (const [label, source] of [["create payment", createOrderRoute], ["retry payment", retryPayRoute]]) {
  requireIncludes(source, "PAYMENT_CREATE_FAILED_MESSAGE", `${label} generic provider failure message`);
  requireIncludes(source, "WECHAT_PAY_EXTERNAL_BLOCKED_MESSAGE", `${label} external block message`);
  requireIncludes(source, "isWechatPaymentExternalBlock(error)", `${label} external block classifier`);
  requireIncludes(source, "reason: isWechatPaymentExternalBlock(error) ? \"external_blocked\" : \"provider_error\"", `${label} sanitized audit reason`);
  requireNotIncludes(source, "error.message", `${label} raw provider error in response or audit`);
}

const smsSendRoute = routeSegment(sources.sms, ".post(\"/send-code\"", "\n  });", "public SMS send route");
requireBefore(smsSendRoute, "phoneMasked: maskPhone(phone)", "result = await sendSmsCode({ phone, code })", "SMS masked audit before provider call");
requireIncludes(smsSendRoute, "smsSendFailedMessage(error)", "SMS provider error mapping");
requireIncludes(smsSendRoute, "phoneMasked: maskPhone(phone)", "SMS audit masked phone");
requireNoPattern(smsSendRoute, /logSmsEvent\([^)]*sms\.send_(?:attempt|failed|")?[^)]*\bphone\s*:/s, "SMS audit full phone field");
const smsFailedDetail = routeSegment(smsSendRoute, "await logSmsEvent(sessionId, \"sms.send_failed\", {", "}, codeId);", "SMS provider failure audit detail");
requireNoPattern(smsFailedDetail, /\bcode\s*:/, "SMS failure audit verification code");
requireNoPattern(smsFailedDetail, /error\.message|String\(error|JSON\.stringify\(error/s, "SMS failure audit raw provider error");

const taskFailure = routeSegment(sources.tasks, "const PUBLIC_GENERATION_FAILED_MESSAGE", "async function hasTooManyRecentGenerationTasks", "public generation failure handling");
requireIncludes(taskFailure, "console.error(\"deepseek_generation_failed\", error)", "server-side DeepSeek error log");
requireIncludes(taskFailure, "errorCode: \"deepseek_generation_failed\"", "DeepSeek failure code");
requireIncludes(taskFailure, "errorMessage: PUBLIC_GENERATION_FAILED_MESSAGE", "DeepSeek generic user-visible failure message");
requireNoPattern(taskFailure, /errorMessage:\s*(error\.message|String\(error|JSON\.stringify\(error)/s, "DeepSeek raw provider error stored for users");

const voiceSpeakRoute = routeSegment(sources.voice, ".post(\"/speak\"", "\n  .post(\"/transcribe\"", "public voice speak route");
const voiceTranscribeRoute = routeSegment(sources.voice, ".post(\"/transcribe\"", "\n  });", "public voice transcribe route");
for (const [label, source, eventName] of [
  ["voice speak", voiceSpeakRoute, "voice.speak_failed"],
  ["voice transcribe", voiceTranscribeRoute, "voice.transcribe_failed"]
]) {
  requireIncludes(source, `logVoiceEvent(sessionId, \"${eventName}\"`, `${label} failure audit`);
  requireIncludes(source, "voiceFailureDetail(error", `${label} sanitized failure detail`);
  requireNoPattern(source, /return\s+fail\([^;]*(error\.message|String\(error|JSON\.stringify\(error)/s, `${label} raw provider error response`);
}
const voiceFailureDetail = routeSegment(sources.voice, "function voiceFailureDetail", "\n}\n\nexport const voiceRoutes", "voice failure detail sanitizer");
requireIncludes(voiceFailureDetail, "errorType:", "voice failure type classification");
requireIncludes(voiceFailureDetail, "reason: \"provider_error\"", "voice generic provider failure reason");
requireNoPattern(voiceFailureDetail, /message|stack|cause|String\(error|JSON\.stringify\(error/, "voice raw error detail fields");

const diagnostics = routeSegment(sources.admin, "async function buildDiagnostics()", "\n  const summary = groups.reduce", "admin diagnostics builder");
requireIncludes(diagnostics, "diagnosticItem(\"DEEPSEEK_API_KEY\", hasSecret(\"DEEPSEEK_API_KEY\"))", "DeepSeek diagnostic boolean");
requireIncludes(diagnostics, "diagnosticItem(\"WECHAT_PAY_PRIVATE_KEY\", hasSecret(\"WECHAT_PAY_PRIVATE_KEY\"))", "WeChat private key diagnostic boolean");
requireIncludes(diagnostics, "diagnosticItem(\"SMS_API_SECRET\", hasSecret(\"SMS_API_SECRET\"))", "SMS secret diagnostic boolean");
requireIncludes(diagnostics, "diagnosticItem(\"VOICE_API_KEY\", hasSecret(\"VOICE_API_KEY\"))", "voice secret diagnostic boolean");
requireNoPattern(diagnostics, /diagnosticItem\([^)]*secret\.get/s, "admin diagnostics direct secret value exposure");
requireNoPattern(diagnostics, /items:\s*\[[^\]]*(ADMIN_INITIAL_PASSWORD|ADMIN_PASSWORD_PEPPER)[^\]]*secret\.get/s, "admin diagnostics password material exposure");

requireIncludes(sources.verifyProduction, "leaked the admin password", "production admin password leak check");
requireIncludes(sources.verifyProduction, "Payment audit trail leaked payment credential-shaped data", "production payment credential leak check");
requireIncludes(sources.verifyProduction, "SMS audit trail leaked full phone number", "production SMS full phone leak check");
requireIncludes(sources.verifyProduction, "SMS audit trail leaked a verification code field", "production SMS code leak check");

requireIncludes(sources.app, "wechat_pay_external_blocked", "user payment external block handling");
requireIncludes(sources.app, "payment_create_failed", "user payment generic provider failure handling");
requireIncludes(sources.app, "wechat_pay_not_configured", "user payment setup failure handling");

console.log("[ok] public provider failures, admin diagnostics, and production verifiers avoid leaking secrets or raw external error material");
