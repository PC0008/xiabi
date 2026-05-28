import fs from "node:fs";

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function fail(message) {
  throw new Error(`public config resilience check failed: ${message}`);
}

function requireIncludes(source, needle, label) {
  if (!source.includes(needle)) fail(`missing ${label}`);
}

function requireNotIncludes(source, needle, label) {
  if (source.includes(needle)) fail(`unexpected ${label}`);
}

function sliceBetween(source, start, end, label) {
  const startIndex = source.indexOf(start);
  if (startIndex === -1) fail(`missing ${label} start`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (endIndex === -1) fail(`missing ${label} end`);
  return source.slice(startIndex, endIndex);
}

const config = read("server/src/domain/config.ts");
const retry = read("server/src/domain/db_retry.ts");
const preflight = read("scripts/final-preflight.mjs");
const packageJson = JSON.parse(read("package.json"));

requireIncludes(config, "isTransientDbError", "transient DB classifier import");
requireIncludes(config, "public_config_default_fallback", "public config fallback log marker");
requireIncludes(config, "defaultConfigByScope.home", "home fallback default");
requireIncludes(config, "defaultConfigByScope.pricing", "pricing fallback default");
requireIncludes(config, "defaultConfigByScope.guideStages", "guide stages fallback default");
requireIncludes(config, "defaultConfigByScope.system", "system fallback default");

const getConfigScope = sliceBetween(config, "export async function getConfigScope", "\n}\n\nasync function getConfigScopes", "single config read");
const getConfigScopes = sliceBetween(config, "async function getConfigScopes", "\n}\n\nexport async function getPublicConfig", "batch config read");
const getPublicConfig = sliceBetween(config, "export async function getPublicConfig", "\n}\n\nexport async function getAdminConfig", "public config read");
requireNotIncludes(getConfigScope, "ensureTenant(db)", "tenant select in single config read");
requireNotIncludes(getConfigScopes, "ensureTenant(db)", "tenant select in batch config read");
requireIncludes(getPublicConfig, "try {", "public config try block");
requireIncludes(getPublicConfig, "if (!isTransientDbError(error)) throw error;", "public config only catches transient DB errors");
requireIncludes(getPublicConfig, "templates: { data: defaultConfigByScope.templates", "complete fallback record shape");

requireIncludes(retry, "function errorMessageChain", "recursive error message chain");
requireIncludes(retry, "(error as Error & { cause?: unknown }).cause", "Error cause traversal");
requireIncludes(retry, "message.includes(\"Failed query\")", "Drizzle wrapped query failure detection");
requireIncludes(retry, "attempts = 5", "expanded DB retry attempts");
requireIncludes(retry, "await delay(300 * attempt)", "expanded DB retry delay");

if (packageJson.scripts?.["check:public-config-resilience"] !== "node scripts/check-public-config-resilience.mjs") {
  fail("package.json check:public-config-resilience script");
}
requireIncludes(preflight, "[\"check:public-config-resilience\", [\"run\", \"check:public-config-resilience\"]", "final preflight resilience step");
if (preflight.indexOf("edgespark:readiness") > preflight.indexOf("verify:live")) {
  fail("edgespark readiness should run before live API checks so platform config reports refresh during API outages");
}

console.log("[ok] public config survives transient DB overload with default fallback and preflight coverage");
