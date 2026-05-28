import fs from "node:fs";

const files = ["h5/app.js", "h5/admin.js"];
const failures = [];
const forbiddenRuntimeMarkers = [
  "db-polling-placeholder",
  "window.prompt(",
  "phoneBound: readFlag(keys.phoneBound)",
  "annualActive: readFlag(keys.annualActive)",
  "writeFlag(keys.phoneBound",
  "writeFlag(keys.annualActive",
  "phoneBound: \"h5PhoneBound\"",
  "annualActive: \"h5AnnualActive\"",
  "phoneBound: storedState.phoneBound",
  "annualActive: storedState.annualActive",
  "${state.generationError}",
  "${state.smsNotice}",
  "${state.paymentNotice}",
  "${state.feedbackText}",
  "${state.typedText}",
  "${state.phoneInput}",
  "${state.smsCode}",
  "${state.voiceError ||",
  "${adminState.toast}",
  "${adminState.loginUsername}",
  "${adminState.loginPassword}",
  "${adminState.loginError}",
  "${adminState.adminUser.displayName",
  "adminMockConfig",
  "readAdminMockConfig",
  "XiabiMockStore",
  "const sampleAnswers",
  "state.answers.push(value ||",
  "export-pdf"
];
const requiredMarkers = [
  {
    file: "h5/app.js",
    marker: "answerItems: currentAnswerItems()",
    message: "generation task must send structured question/answer context"
  },
  {
    file: "server/src/adapters/letter/deepseek.ts",
    marker: "input.input?.answerItems",
    message: "DeepSeek brief must read structured question/answer context"
  },
  {
    file: "server/src/routes/tasks.ts",
    marker: "HOURLY_GENERATION_LIMIT",
    message: "public generation task creation must be rate-limited"
  },
  {
    file: "server/src/routes/tasks.ts",
    marker: "return ok(c, publicTask(task));",
    message: "public task polling must not re-trigger generation work"
  },
  {
    file: "server/src/routes/tasks.ts",
    marker: "getActiveSession(c)",
    message: "paid or costly public generation entry must reject logged-out sessions"
  },
  {
    file: "server/src/routes/tasks.ts",
    marker: "answer_too_long",
    message: "public generation task creation must reject oversized answers before queuing"
  },
  {
    file: "server/src/routes/admin.ts",
    marker: "ADMIN_LOGIN_FAILURE_LIMIT",
    message: "admin login must rate-limit repeated failed attempts"
  },
  {
    file: "server/src/routes/admin.ts",
    marker: "ADMIN_USERNAME_MAX_LENGTH",
    message: "admin login must reject oversized credentials before hashing or auditing"
  },
  {
    file: "server/src/routes/admin.ts",
    marker: "buildConfigAuditDiff",
    message: "admin config updates must record field-level audit diffs"
  },
  {
    file: "h5/admin.js",
    marker: "renderAuditLogDetail",
    message: "admin audit log details must render config diffs as readable rows"
  },
  {
    file: "h5/admin.js",
    marker: "logsTargetType",
    message: "admin audit log list must expose operator-friendly filters"
  },
  {
    file: "h5/admin.js",
    marker: "voice.transcribe_attempt",
    message: "admin audit log filters must expose voice events"
  },
  {
    file: "server/src/routes/admin.ts",
    marker: "audit_filter_too_long",
    message: "admin audit log filters must be validated server-side"
  },
  {
    file: "server/src/routes/profiles.ts",
    marker: "MAX_PROFILES_PER_OWNER",
    message: "public product profile writes must have count and length limits"
  },
  {
    file: "server/src/routes/exports.ts",
    marker: "letter_not_ready",
    message: "letter exports must reject empty generated content instead of creating blank files"
  },
  {
    file: "server/src/routes/exports.ts",
    marker: "onConflictDoUpdate",
    message: "letter export file records must refresh ownership/status on repeated exports"
  },
  {
    file: "server/src/routes/exports.ts",
    marker: "letter_plain_text",
    message: "letter exports must include a plain text file for direct saving and sharing"
  },
  {
    file: "server/src/routes/exports.ts",
    marker: "letter_docx",
    message: "letter exports must include a DOCX file for editable customer documents"
  },
  {
    file: "server/src/routes/exports.ts",
    marker: "letter_pdf",
    message: "letter exports must include a direct PDF file for final customer delivery"
  },
  {
    file: "scripts/verify-production.mjs",
    marker: "verifyDocxBytes",
    message: "production export verification must inspect DOCX package structure"
  },
  {
    file: "scripts/verify-production.mjs",
    marker: "verifyPdfBytes",
    message: "production export verification must inspect direct PDF structure"
  },
  {
    file: "scripts/verify-production.mjs",
    marker: "userRecordingEnabled",
    message: "production ASR verification must prove the public user recording fallback is enabled"
  },
  {
    file: "server/src/routes/exports.ts",
    marker: "export_rate_limited",
    message: "letter exports must rate-limit repeated download generation"
  },
  {
    file: "server/src/routes/exports.ts",
    marker: "letter.export",
    message: "letter exports must write audit events for operations traceability"
  },
  {
    file: "server/src/routes/voice.ts",
    marker: "voice.speak_attempt",
    message: "voice TTS attempts must be audited and rate-limited before external provider calls"
  },
  {
    file: "server/src/routes/voice.ts",
    marker: "voice.speak_failed",
    message: "voice TTS failures must write audit events for production troubleshooting"
  },
  {
    file: "server/src/routes/voice.ts",
    marker: "voice.transcribe_attempt",
    message: "voice transcription attempts must be audited and rate-limited before external provider calls"
  },
  {
    file: "server/src/routes/voice.ts",
    marker: "voice.transcribe_failed",
    message: "voice transcription failures must write audit events for production troubleshooting"
  },
  {
    file: "h5/admin.js",
    marker: "voice.speak_failed",
    message: "admin audit log filters must expose voice failure events"
  },
  {
    file: "h5/admin.js",
    marker: "voice.transcribe_failed",
    message: "admin audit log filters must expose voice transcription failure events"
  },
  {
    file: "h5/app.js",
    marker: "export-text",
    message: "user export page must expose the plain text download action"
  },
  {
    file: "h5/app.js",
    marker: "export-docx",
    message: "user export page must expose the editable document download action"
  },
  {
    file: "h5/app.js",
    marker: "export-file-pdf",
    message: "user export page must expose the direct PDF download action"
  },
  {
    file: "h5/app.js",
    marker: "copy-letter",
    message: "claimed letters must support direct copy for real customer messaging"
  },
  {
    file: "h5/app.js",
    marker: "feedbackCategory",
    message: "user feedback tags must be submitted as backend categories"
  },
  {
    file: "h5/admin.js",
    marker: "feedbackStatus",
    message: "admin feedback list must support open/resolved filtering"
  },
  {
    file: "server/src/routes/orders.ts",
    marker: "wechat_pay_external_blocked",
    message: "WeChat product permission errors must be classified as external blockers"
  },
  {
    file: "server/src/routes/orders.ts",
    marker: "order.payment_attempt",
    message: "public payment attempts must write order audit events"
  },
  {
    file: "server/src/routes/orders.ts",
    marker: "PAYMENT_ATTEMPT_HOURLY_LIMIT",
    message: "public payment attempts must be rate-limited before external provider calls"
  },
  {
    file: "server/src/routes/orders.ts",
    marker: "PAYMENT_STATUS_CHECK_HOURLY_LIMIT",
    message: "public payment status refreshes must be rate-limited before external provider calls"
  },
  {
    file: "server/src/routes/orders.ts",
    marker: "order.payment_status_check",
    message: "public payment status refreshes must write order audit events"
  },
  {
    file: "server/src/routes/orders.ts",
    marker: "payment_status_rate_limited",
    message: "payment status refreshes must return a friendly rate-limit error"
  },
  {
    file: "h5/app.js",
    marker: "payment_rate_limited",
    message: "user payment flow must show a friendly rate-limit message"
  },
  {
    file: "server/src/routes/orders.ts",
    marker: "PAYMENT_CREATE_FAILED_MESSAGE",
    message: "payment provider errors must not leak raw external messages to users"
  },
  {
    file: "h5/app.js",
    marker: "payment_create_failed",
    message: "user payment flow must map payment creation failures to recovery copy"
  },
  {
    file: "server/src/routes/orders.ts",
    marker: "order.payment_failed",
    message: "public payment failures must write order audit events"
  },
  {
    file: "server/src/routes/tasks.ts",
    marker: "PUBLIC_GENERATION_FAILED_MESSAGE",
    message: "public generation failures must not leak raw provider errors to users"
  },
  {
    file: "h5/admin.js",
    marker: "order.payment_attempt",
    message: "admin audit log filters must expose payment attempt events"
  },
  {
    file: "h5/app.js",
    marker: "userPaymentErrorMessage",
    message: "payment provider setup errors must be shown as user-facing order recovery copy"
  },
  {
    file: "server/src/routes/sms.ts",
    marker: "smsSendFailedMessage",
    message: "SMS provider errors must be mapped to user-facing copy"
  },
  {
    file: "server/src/routes/sms.ts",
    marker: "status: \"replaced\"",
    message: "sending a new SMS code must invalidate older pending codes for the same phone"
  },
  {
    file: "server/src/routes/sms.ts",
    marker: "status: \"sending\"",
    message: "SMS codes must be stored before provider send to avoid unusable delivered codes"
  },
  {
    file: "server/src/routes/sms.ts",
    marker: "status: \"failed\"",
    message: "failed SMS provider sends must close their pre-created verification code record"
  },
  {
    file: "server/src/routes/sms.ts",
    marker: "sms.send_attempt",
    message: "SMS send attempts must be audited before external provider calls"
  },
  {
    file: "server/src/routes/sms.ts",
    marker: "sms.send_failed",
    message: "SMS send failures must write audit events without leaking verification codes"
  },
  {
    file: "h5/admin.js",
    marker: "sms.send_attempt",
    message: "admin audit log filters must expose SMS events"
  },
  {
    file: "scripts/verify-production.mjs",
    marker: "sms audit trail",
    message: "production verification must prove SMS sends are visible in audit logs"
  },
  {
    file: "server/src/adapters/sms/index.ts",
    marker: "GetSmsTemplate",
    message: "SMS provider diagnostics must verify Aliyun template approval without sending a code"
  },
  {
    file: "server/src/routes/admin.ts",
    marker: "diagnostics.sms_provider_check",
    message: "admin diagnostics must audit SMS provider live checks"
  },
  {
    file: "h5/admin.js",
    marker: "check-sms-provider",
    message: "admin diagnostics UI must expose SMS provider live checks"
  },
  {
    file: "scripts/verify-production.mjs",
    marker: "sms provider config",
    message: "production verification must run the no-send SMS provider sign/template check"
  },
  {
    file: "server/src/routes/admin.ts",
    marker: "diagnostics.wechat_pay_check",
    message: "admin diagnostics must audit WeChat Pay provider checks"
  },
  {
    file: "server/src/adapters/payment/wechat.ts",
    marker: "validateWechatPlatformPublicKey",
    message: "WeChat Pay diagnostics must validate manual platform public key format"
  },
  {
    file: "server/src/adapters/payment/wechat.ts",
    marker: "signature.ready = true",
    message: "WeChat Pay diagnostics must prove the merchant private key can sign locally"
  },
  {
    file: "h5/admin.js",
    marker: "check-wechat-pay",
    message: "admin diagnostics UI must expose WeChat Pay provider checks"
  },
  {
    file: "server/src/routes/admin.ts",
    marker: "diagnostics.voice_asr_check",
    message: "admin diagnostics must audit voice ASR readiness checks"
  },
  {
    file: "h5/admin.js",
    marker: "check-voice-asr",
    message: "admin diagnostics UI must expose voice ASR readiness checks"
  },
  {
    file: "server/src/routes/wechat.ts",
    marker: "/jssdk-config",
    message: "WeChat in-H5 voice input must have a signed JS-SDK config route"
  },
  {
    file: "h5/app.js",
    marker: "translateVoice",
    message: "user H5 voice input must support WeChat JS-SDK speech translation"
  },
  {
    file: "scripts/verify-production.mjs",
    marker: "wechat provider config",
    message: "production verification must run the no-order WeChat Pay provider check"
  },
  {
    file: "scripts/verify-production.mjs",
    marker: "wechat payment audit trail",
    message: "production verification must prove payment attempts are visible in audit logs"
  },
  {
    file: "server/src/routes/admin.ts",
    marker: "requireOwnerOrFail",
    message: "high-risk admin mutations must require owner role"
  },
  {
    file: "server/src/routes/admin.ts",
    marker: ".post(\"/admins\"",
    message: "owner admins must be able to create read-only admin accounts"
  },
  {
    file: "server/src/routes/admin.ts",
    marker: ".patch(\"/admins/:id\"",
    message: "owner admins must be able to disable or reset read-only admin accounts"
  },
  {
    file: "h5/admin.js",
    marker: "data-admin-field",
    message: "admin UI must expose account creation fields"
  },
  {
    file: "h5/admin.js",
    marker: "data-admin-reset-password",
    message: "admin UI must expose account password reset controls"
  },
  {
    file: "h5/store.js",
    marker: "adminPatch",
    message: "admin UI must support PATCH mutations"
  },
  {
    file: "h5/admin.js",
    marker: "canAdminWrite",
    message: "admin UI must hide or block owner-only controls for non-owner roles"
  },
  {
    file: "h5/admin.js",
    marker: "detailFileTable",
    message: "admin letter details must expose export file download actions"
  },
  {
    file: "server/src/routes/admin.ts",
    marker: "createPresignedGetUrl(file.objectKey",
    message: "admin letter details must return temporary download URLs for exported files"
  },
  {
    file: "h5/app.js",
    marker: "maybeAutoSpeakCurrentPrompt",
    message: "call flow must auto-play configured assistant voice prompts"
  },
  {
    file: "server/src/routes/voice.ts",
    marker: "console.error(\"voice_transcribe_failed\"",
    message: "public voice API must log provider details server-side instead of exposing raw errors"
  },
  {
    file: "server/src/domain/runtime.ts",
    marker: "optionalVar",
    message: "optional provider runtime vars must be centralized so they do not block deploy"
  },
  {
    file: "server/src/domain/runtime.ts",
    marker: "optionalSecret",
    message: "optional provider secrets must be centralized so they do not block deploy"
  },
  {
    file: "server/src/domain/fetch.ts",
    marker: "fetchWithTimeout",
    message: "external provider calls must use a shared timeout wrapper"
  },
  {
    file: "server/src/adapters/voice/index.ts",
    marker: "timeoutMs",
    message: "voice provider calls must have timeout guards"
  },
  {
    file: "server/src/adapters/payment/wechat.ts",
    marker: "fetchWithTimeout",
    message: "WeChat provider calls must have timeout guards"
  },
  {
    file: "server/src/domain/session.ts",
    marker: "eq(guestSessions.status, \"active\")",
    message: "shared session guard must verify active session status"
  },
  {
    file: "server/src/domain/entitlements.ts",
    marker: "db.batch([",
    message: "payment closure must update paid order and grant entitlement in one batched operation"
  },
  {
    file: "server/src/adapters/payment/wechat.ts",
    marker: "assertWechatPaidTransactionMatchesOrder",
    message: "WeChat paid transaction validation must be centralized across callbacks and reconciliation"
  },
  {
    file: "server/src/routes/admin.ts",
    marker: "wechat_transaction_mismatch",
    message: "admin order reconciliation must not grant entitlement when WeChat transaction fields mismatch"
  },
  {
    file: "server/src/routes/webhooks.ts",
    marker: "invalid_json",
    message: "invalid WeChat webhook payloads must be recorded before failing"
  },
  {
    file: "server/src/routes/webhooks.ts",
    marker: "event.status === \"processed\"",
    message: "duplicate WeChat webhook events must still pass signature verification before duplicate ack"
  },
  {
    file: "server/src/routes/users.ts",
    marker: "ownershipUpdates",
    message: "phone binding must migrate session assets in a single batched ownership update"
  }
];

function unique(values) {
  return [...new Set(values)].sort();
}

function literalAttributes(source, name) {
  return [...source.matchAll(new RegExp(`${name}="([^"]+)"`, "g"))]
    .map((match) => match[1])
    .filter((value) => !value.includes("${"));
}

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const actions = unique(literalAttributes(source, "data-action"));
  const handledActions = unique([...source.matchAll(/action === "([^"]+)"/g)].map((match) => match[1]));
  const missingActions = actions.filter((action) => !handledActions.includes(action));
  if (missingActions.length) failures.push(`${file} missing action handlers: ${missingActions.join(", ")}`);

  const routes = unique(literalAttributes(source, "data-go"));
  if (routes.length) {
    const renderedRoutes = new Set([
      "home",
      ...[...source.matchAll(/route === "([^"]+)"/g)].map((match) => match[1])
    ]);
    const missingRoutes = routes.filter((route) => !renderedRoutes.has(route));
    if (missingRoutes.length) failures.push(`${file} missing route renderers: ${missingRoutes.join(", ")}`);
  }
}

for (const marker of forbiddenRuntimeMarkers) {
  for (const file of ["h5/app.js", "h5/admin.js", "h5/store.js", "server/src/adapters/task/index.ts", "server/src/routes/tasks.ts"]) {
    const source = fs.readFileSync(file, "utf8");
    if (source.includes(marker)) failures.push(`${file} still contains runtime placeholder marker: ${marker}`);
  }
}

for (const requirement of requiredMarkers) {
  const source = fs.readFileSync(requirement.file, "utf8");
  if (!source.includes(requirement.marker)) {
    failures.push(`${requirement.file} missing required marker: ${requirement.message}`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("UI action coverage check passed.");
