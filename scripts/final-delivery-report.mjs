import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const verifierInputs = [
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
];

function hasEnv(name) {
  return typeof process.env[name] === "string" && process.env[name].trim() !== "";
}

const hasAnyFinalInput = verifierInputs.some(hasEnv);
const allowBasicRefresh = process.env.XIABI_DELIVERY_FINAL_ALLOW_BASIC === "1";

if (!hasAnyFinalInput && !allowBasicRefresh) {
  console.error("delivery:final refused to refresh formal production reports without final verifier inputs.");
  console.error("Set at least one XIABI_VERIFY_* input for real acceptance, or run npm run verify:preflight for a no-cost basic check.");
  console.error("To intentionally refresh the formal report from basic checks, set XIABI_DELIVERY_FINAL_ALLOW_BASIC=1.");
  process.exit(2);
}

function runStep(name, args) {
  return new Promise((resolve) => {
    console.log(`\n=== ${name} ===`);
    const child = spawn([npmCommand, ...args].join(" "), {
      cwd: process.cwd(),
      env: process.env,
      shell: true,
      stdio: "inherit"
    });
    child.on("close", (code) => resolve({ name, code: code ?? 1 }));
    child.on("error", (error) => {
      console.error(error);
      resolve({ name, code: 1 });
    });
  });
}

const verification = await runStep("verify:production:report", ["run", "verify:production:report"]);
const delivery = await runStep("delivery:status", ["run", "delivery:status"]);
const acceptance = await runStep("acceptance:inputs", ["run", "acceptance:inputs"]);

if (delivery.code !== 0 || acceptance.code !== 0) {
  process.exit(delivery.code || acceptance.code || 1);
}

process.exit(verification.code);
