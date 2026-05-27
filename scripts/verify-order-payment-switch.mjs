import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve("server/src/routes/orders.ts"), "utf8");

function fail(message) {
  throw new Error(`order payment switch verification failed: ${message}`);
}

function requireIncludes(haystack, needle, label) {
  if (!haystack.includes(needle)) fail(`missing ${label}`);
}

function requireBefore(route, beforeNeedle, afterNeedle, label) {
  const beforeIndex = route.indexOf(beforeNeedle);
  const afterIndex = route.indexOf(afterNeedle);
  if (beforeIndex === -1) fail(`missing ${label} guard`);
  if (afterIndex === -1) fail(`missing ${label} target`);
  if (beforeIndex > afterIndex) fail(`${label} guard runs after ${afterNeedle}`);
}

const helperStart = source.indexOf("function getPaymentDisabledError");
const helperEnd = source.indexOf("\nfunction isWeChatBrowser", helperStart);
if (helperStart === -1 || helperEnd === -1) fail("payment disabled helper");

const helper = source.slice(helperStart, helperEnd);
requireIncludes(helper, "pricing.payment_enabled === false", "global payment_enabled check");
requireIncludes(helper, "pricing.annual_enabled === false", "annual_enabled check");
requireIncludes(helper, "pricing.single_enabled === false", "single_enabled check");
requireIncludes(helper, "\"payment_disabled\"", "payment_disabled error code");
requireIncludes(helper, "\"annual_disabled\"", "annual_disabled error code");
requireIncludes(helper, "\"single_disabled\"", "single_disabled error code");

const payStart = source.indexOf(".post(\"/:id/pay\"");
const payEnd = source.indexOf("\n  .get(\"/:id\"", payStart);
if (payStart === -1 || payEnd === -1) fail("orders/:id/pay route");

const payRoute = source.slice(payStart, payEnd);
requireIncludes(payRoute, "getConfigScope(db, \"pricing\")", "fresh pricing config read in pay route");
requireIncludes(payRoute, "getPaymentDisabledError(pricing, order.productType)", "order product switch check");
requireIncludes(payRoute, "return fail(c, disabledPayment.code, disabledPayment.message, disabledPayment.status)", "disabled payment fail response");

const guardNeedle = "getPaymentDisabledError(pricing, order.productType)";
requireBefore(payRoute, guardNeedle, "getWechatPaymentReadiness()", "payment switch");
requireBefore(payRoute, guardNeedle, "createWechatJsapiPayment", "payment switch");
requireBefore(payRoute, guardNeedle, "createWechatPayment", "payment switch");
requireBefore(payRoute, guardNeedle, "status: \"pending\"", "payment switch");

console.log("[ok] /orders/:id/pay rechecks pricing switches before payment creation or pending status update");
