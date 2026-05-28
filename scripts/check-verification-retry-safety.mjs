import fs from "node:fs";

const sources = {
  verifyProduction: fs.readFileSync("scripts/verify-production.mjs", "utf8"),
  verifyLive: fs.readFileSync("scripts/verify-live.mjs", "utf8")
};

function fail(message) {
  throw new Error(`verification retry safety check failed: ${message}`);
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

function segment(source, startNeedle, endNeedle, label) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  if (start === -1 || end === -1) fail(`missing ${label}`);
  return source.slice(start, end);
}

const production = sources.verifyProduction;
requireIncludes(production, "const idempotentMethods = new Set([\"GET\", \"HEAD\"]);", "production idempotent method allow-list");
requireIncludes(production, "return idempotentMethods.has(requestMethod(init)) && !init.body;", "production no-body retry guard");
requireIncludes(production, "const maxAttempts = shouldRetryRequest(init) ? 3 : 1;", "production retry attempt gate");
requireIncludes(production, "if (attempt >= maxAttempts || !shouldRetryRequest(init) || error instanceof ApiError) throw error;", "production caught-error retry guard");

const productionRetryGuard = segment(production, "function shouldRetryRequest(init = {})", "\n}\n\nasync function readJsonResponse", "production retry guard function");
requireNotIncludes(productionRetryGuard, "POST", "production POST retry allow-list");
requireNotIncludes(productionRetryGuard, "PUT", "production PUT retry allow-list");
requireNotIncludes(productionRetryGuard, "PATCH", "production PATCH retry allow-list");
requireNotIncludes(productionRetryGuard, "DELETE", "production DELETE retry allow-list");

const productionApi = segment(production, "async function api(pathname, init = {}, cookie = \"\")", "\n}\n\nasync function expectApiError", "production API wrapper");
requireIncludes(productionApi, "const maxAttempts = shouldRetryRequest(init) ? 3 : 1;", "production API wrapper gated attempts");
requireIncludes(productionApi, "retryableStatuses.has(response.status)", "production API wrapper retryable status check");
requireIncludes(productionApi, "!shouldRetryRequest(init)", "production API wrapper caught-error no-retry guard");
requireNoPattern(productionApi, /method:\s*["']POST["'][\s\S]*maxAttempts\s*=\s*3/, "production POST request with unconditional retry");

const expectApiError = segment(production, "async function expectApiError(pathname, init = {}, cookie = \"\", expectedStatus, expectedCode)", "\n}\n\nasync function expectAdminLoginFailure", "production expected-error helper");
requireNotIncludes(expectApiError, "for (let attempt", "production expected-error retry loop");
requireNotIncludes(expectApiError, "shouldRetryRequest", "production expected-error retry guard");

for (const envName of [
  "XIABI_VERIFY_DEEPSEEK",
  "XIABI_VERIFY_PAYMENT_CREATE",
  "XIABI_VERIFY_SMS_PHONE",
  "XIABI_VERIFY_TTS",
  "XIABI_VERIFY_ASR_AUDIO"
]) {
  const envIndex = production.indexOf(envName);
  if (envIndex === -1) fail(`missing production verifier env ${envName}`);
  const window = production.slice(Math.max(0, envIndex - 600), envIndex + 1200);
  requireNotIncludes(window, "maxAttempts = 3", `${envName} local unconditional retry`);
}

const live = sources.verifyLive;
requireIncludes(live, "function shouldRetryRequest(init = {})", "live retry guard function");
requireIncludes(live, "return [\"GET\", \"HEAD\"].includes(requestMethod(init)) && !init?.body;", "live no-body retry guard");
requireIncludes(live, "const maxAttempts = shouldRetryRequest(init) ? 3 : 1;", "live JSON retry attempt gate");

const liveRetryGuard = segment(live, "function shouldRetryRequest(init = {})", "\n}\n\nasync function assertHttp", "live retry guard function body");
requireNotIncludes(liveRetryGuard, "POST", "live POST retry allow-list");
requireNotIncludes(liveRetryGuard, "PUT", "live PUT retry allow-list");
requireNotIncludes(liveRetryGuard, "PATCH", "live PATCH retry allow-list");
requireNotIncludes(liveRetryGuard, "DELETE", "live DELETE retry allow-list");

const liveAssertJson = segment(live, "async function assertJson(pathname, init, expectedStatus, check)", "\n}\n\nfunction getCookie", "live JSON assertion helper");
requireIncludes(liveAssertJson, "const maxAttempts = shouldRetryRequest(init) ? 3 : 1;", "live JSON assertion gated attempts");
requireIncludes(liveAssertJson, "retryableStatuses.has(response.status)", "live JSON assertion retryable status check");
requireNoPattern(liveAssertJson, /method:\s*["']POST["'][\s\S]*attempt\s*<=\s*3/, "live POST request with unconditional retry");

const liveFetchText = segment(live, "async function fetchText(pathname)", "\n}\n\nasync function assertStaticFrontendAssets", "live text fetch helper");
requireIncludes(liveFetchText, "fetch(`${baseUrl}${pathname}`)", "live text fetch is GET-only");
requireNotIncludes(liveFetchText, "init", "live text fetch request init");
requireNotIncludes(liveFetchText, "method:", "live text fetch explicit method");

console.log("[ok] verification retries are limited to idempotent GET/HEAD requests without request bodies");
