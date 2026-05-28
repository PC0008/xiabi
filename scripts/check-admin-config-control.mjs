import fs from "node:fs";

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function fail(message) {
  throw new Error(`admin config control verification failed: ${message}`);
}

function requireIncludes(source, needle, label) {
  if (!source.includes(needle)) fail(`missing ${label}`);
}

function requireNotIncludes(source, needle, label) {
  if (source.includes(needle)) fail(`unexpected ${label}`);
}

function requireAll(source, entries, label) {
  for (const needle of entries) requireIncludes(source, needle, `${label}: ${needle}`);
}

function sliceBetween(source, start, end, label) {
  const startIndex = source.indexOf(start);
  if (startIndex === -1) fail(`missing ${label} start`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (endIndex === -1) fail(`missing ${label} end`);
  return source.slice(startIndex, endIndex);
}

const defaults = read("server/src/domain/defaults.ts");
requireAll(defaults, [
  "defaultHomeConfig",
  "defaultPricing",
  "defaultGuideStages",
  "defaultTemplates",
  "defaultSystemConfig",
  "home: defaultHomeConfig",
  "pricing: defaultPricing",
  "guideStages: defaultGuideStages",
  "templates: defaultTemplates",
  "system: defaultSystemConfig"
], "default config scopes");

const config = read("server/src/domain/config.ts");
requireAll(config, [
  "getPublicConfig",
  "getAdminConfig",
  "upsertConfigScope",
  "homeConfig: home.data",
  "pricing: pricing.data",
  "guideStages: guideStages.data",
  "system: system.data",
  "versions:",
  "for (const scope of configScopes())"
], "config domain");

const publicRoutes = read("server/src/routes/public.ts");
requireAll(publicRoutes, [
  "getPublicConfig(db)",
  "capabilities:",
  "ttsConfigured",
  "asrConfigured",
  "asrVerified",
  "asrPreferred"
], "public config route");

const adminRoutes = read("server/src/routes/admin.ts");
requireAll(adminRoutes, [
  ".get(\"/config\"",
  ".patch(\"/config\"",
  "requireOwnerOrFail(c, admin)",
  "if (body.homeConfig) updates.home = body.homeConfig",
  "for (const scope of configScopes())",
  "sanitizeConfigScope(scope as ConfigScope, data)",
  "buildConfigAuditDiff(beforeConfig, sanitized)",
  "upsertConfigScope(db, scope as ConfigScope, data, admin!.id)",
  "logAdmin(admin!.id, \"config.update\"",
  "sanitizeHomeConfig",
  "sanitizePricing",
  "sanitizeGuideStages",
  "sanitizeTemplates",
  "sanitizeSystemConfig",
  "if (scope === \"system\") return sanitizeSystemConfig(value);",
  "throw new Error(\"unsupported config scope\")"
], "admin config mutation");

for (const [start, end, label] of [
  ["function sanitizeHomeConfig", "function sanitizePricing", "home config whitelist"],
  ["function sanitizePricing", "function sanitizeGuideStages", "pricing whitelist"],
  ["function sanitizeGuideStages", "function sanitizeTemplates", "guide stages whitelist"],
  ["function sanitizeTemplates", "function sanitizeSystemConfig", "templates whitelist"],
  ["function sanitizeSystemConfig", "function sanitizeConfigScope", "system config whitelist"]
]) {
  requireNotIncludes(sliceBetween(adminRoutes, start, end, label), "...input", label);
}

const store = read("h5/store.js");
requireAll(store, [
  "normalizeRemoteConfig",
  "homeConfig: data.homeConfig || data.home || {}",
  "pricing: data.pricing || {}",
  "guideStages: data.guideStages || []",
  "templates: data.templates || []",
  "system: data.system || {}",
  "syncPublicConfig",
  "syncAdminConfig",
  "saveAdminConfig",
  "home: config.homeConfig || {}",
  "pricing: config.pricing || {}",
  "guideStages: config.guideStages || []",
  "templates: config.templates || []",
  "system: config.system || {}"
], "H5 config store");

const app = read("h5/app.js");
requireAll(app, [
  "runtimeConfig.pricing",
  "runtimeConfig.homeConfig",
  "runtimeConfig.system",
  "buildQuestionsFromConfig(runtimeConfig.guideStages)",
  "appSystem.voice_enabled !== false",
  "appSystem.sms_enabled !== false",
  "homePage.generation_entry_enabled !== false",
  "appSystem.generation_enabled !== false",
  "commerceConfig.payment_enabled !== false",
  "commerceConfig.single_enabled !== false",
  "commerceConfig.annual_enabled !== false"
], "user H5 config consumption");

const adminUi = read("h5/admin.js");
requireAll(adminUi, [
  "homeConfig: adminState.homeConfig",
  "pricing: adminState.pricing",
  "system: adminState.system",
  "guideStages: adminState.guideStages",
  "templates: getEditableTemplates()",
  "saveAdminConfig",
  "generation_entry_enabled",
  "payment_enabled",
  "sms_enabled",
  "voice_enabled"
], "admin UI config controls");

const tasks = read("server/src/routes/tasks.ts");
requireAll(tasks, [
  "getConfigScope(db, \"templates\")",
  "getConfigScope(db, \"home\")",
  "getConfigScope(db, \"system\")",
  "generation_entry_enabled === false",
  "generation_enabled === false",
  "generateSalesLetterWithDeepSeek({ answers, input, templates })"
], "generation config controls");

const orders = read("server/src/routes/orders.ts");
requireAll(orders, [
  "getConfigScope(db, \"pricing\")",
  "pricing.payment_enabled === false",
  "pricing.annual_enabled === false",
  "pricing.single_enabled === false",
  "pricing.annual || 2000",
  "pricing.single || 200"
], "payment pricing controls");

const sms = read("server/src/routes/sms.ts");
requireAll(sms, [
  "getAdminConfig(db)",
  "system.sms_enabled === false"
], "SMS system controls");

const voice = read("server/src/routes/voice.ts");
requireAll(voice, [
  "getAdminConfig(db)",
  "system.voice_enabled === false"
], "voice system controls");

const exportsRoute = read("server/src/routes/exports.ts");
requireAll(exportsRoute, [
  "getAdminConfig(db)",
  "system.file_export_enabled === false"
], "export system controls");

console.log("[ok] admin config is persisted, audited, publicly propagated, and consumed by user and backend flows");
