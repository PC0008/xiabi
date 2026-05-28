import fs from "node:fs";

const securitySource = fs.readFileSync("server/src/domain/security.ts", "utf8");
const smsSource = fs.readFileSync("server/src/routes/sms.ts", "utf8");
const usersSource = fs.readFileSync("server/src/routes/users.ts", "utf8");

function fail(message) {
  throw new Error(`SMS code safety verification failed: ${message}`);
}

function requireIncludes(source, needle, label) {
  if (!source.includes(needle)) fail(`missing ${label}`);
}

function requireNotIncludes(source, needle, label) {
  if (source.includes(needle)) fail(`forbidden ${label}`);
}

requireIncludes(securitySource, "export async function hashSmsCode", "peppered SMS code hash helper");
requireIncludes(securitySource, "xiabi-sms-code:${phone}:${code}:${pepper}", "SMS code hash namespace and pepper");
requireIncludes(securitySource, "export async function legacyHashSmsCode", "legacy SMS code compatibility helper");

requireIncludes(smsSource, "optionalSecret(\"SMS_CODE_PEPPER\") || optionalSecret(\"ADMIN_PASSWORD_PEPPER\")", "SMS code pepper fallback");
requireIncludes(smsSource, "hashSmsCode(phone, code, smsCodePepper())", "peppered SMS hash on send");
requireNotIncludes(smsSource, "sha256(`sms:${phone}:${code}`)", "new SMS sends using legacy enumerable hash");

requireIncludes(usersSource, "hashSmsCode(phone, code, smsCodePepper())", "peppered SMS hash on bind");
requireIncludes(usersSource, "legacyHashSmsCode(phone, code)", "legacy SMS bind compatibility");
requireIncludes(usersSource, "row.codeHash !== codeHash && row.codeHash !== legacyCodeHash", "SMS bind checks both new and legacy hashes");
requireNotIncludes(usersSource, "const codeHash = await sha256(`sms:${phone}:${code}`)", "bind route using raw enumerable SMS hash");

console.log("[ok] SMS verification codes are stored with a server-side pepper while preserving short-lived legacy compatibility");
