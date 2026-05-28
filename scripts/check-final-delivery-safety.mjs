import fs from "node:fs";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const source = fs.readFileSync("scripts/final-delivery-report.mjs", "utf8");

function fail(message) {
  throw new Error(`final delivery safety check failed: ${message}`);
}

function requireIncludes(text, needle, label) {
  if (!text.includes(needle)) fail(`missing ${label}`);
}

function requireBefore(text, beforeNeedle, afterNeedle, label) {
  const beforeIndex = text.indexOf(beforeNeedle);
  const afterIndex = text.indexOf(afterNeedle);
  if (beforeIndex === -1) fail(`missing ${label} before marker`);
  if (afterIndex === -1) fail(`missing ${label} after marker`);
  if (beforeIndex > afterIndex) fail(`${label} is out of order`);
}

if (packageJson.scripts?.["delivery:final"] !== "node scripts/final-delivery-report.mjs") {
  fail("package.json delivery:final script");
}

for (const envName of [
  "XIABI_VERIFY_ADMIN_USERNAME",
  "XIABI_VERIFY_ADMIN_PASSWORD",
  "XIABI_VERIFY_DEEPSEEK",
  "XIABI_VERIFY_REPEAT_FREE",
  "XIABI_VERIFY_TTS",
  "XIABI_VERIFY_SMS_PHONE",
  "XIABI_VERIFY_SMS_CODE",
  "XIABI_VERIFY_PAYMENT_CREATE",
  "XIABI_VERIFY_PAID_ORDER_ID",
  "XIABI_VERIFY_ASR_AUDIO",
  "XIABI_VERIFY_WECHAT_VOICE",
  "XIABI_VERIFY_WECHAT_VOICE_MANUAL"
]) {
  requireIncludes(source, `"${envName}"`, `${envName} guard input`);
}

requireIncludes(source, "const hasAnyFinalInput = verifierInputs.some(hasEnv);", "any verifier input guard");
requireIncludes(source, "const allowBasicRefresh = process.env.XIABI_DELIVERY_FINAL_ALLOW_BASIC === \"1\";", "explicit basic refresh override");
requireIncludes(source, "if (!hasAnyFinalInput && !allowBasicRefresh)", "formal report refresh refusal branch");
requireIncludes(source, "delivery:final refused to refresh formal production reports without final verifier inputs.", "operator-facing refusal message");
requireIncludes(source, "run npm run verify:preflight for a no-cost basic check", "safe no-cost alternative guidance");
requireIncludes(source, "process.exit(2);", "distinct refusal exit code");

requireIncludes(source, "runStep(\"verify:production:report\", [\"run\", \"verify:production:report\"])", "production report refresh step");
requireIncludes(source, "runStep(\"delivery:status\", [\"run\", \"delivery:status\"])", "delivery status refresh step");
requireIncludes(source, "runStep(\"acceptance:inputs\", [\"run\", \"acceptance:inputs\"])", "acceptance input refresh step");
requireBefore(source, "verify:production:report", "delivery:status", "final delivery report order");
requireBefore(source, "delivery:status", "acceptance:inputs", "final delivery status before inputs");
requireIncludes(source, "process.exit(verification.code);", "preserve production verification exit code");

console.log("[ok] delivery:final refuses basic formal refreshes and preserves final acceptance report ordering");
