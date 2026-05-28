import fs from "node:fs";

const paymentSource = fs.readFileSync("server/src/adapters/payment/wechat.ts", "utf8");
const ordersSource = fs.readFileSync("server/src/routes/orders.ts", "utf8");
const webhooksSource = fs.readFileSync("server/src/routes/webhooks.ts", "utf8");
const adminSource = fs.readFileSync("server/src/routes/admin.ts", "utf8");
const entitlementSource = fs.readFileSync("server/src/domain/entitlements.ts", "utf8");

function fail(message) {
  throw new Error(`payment entitlement safety verification failed: ${message}`);
}

function requireIncludes(source, needle, label) {
  if (!source.includes(needle)) fail(`missing ${label}`);
}

function requireBefore(source, beforeNeedle, afterNeedle, label) {
  const beforeIndex = source.indexOf(beforeNeedle);
  const afterIndex = source.indexOf(afterNeedle);
  if (beforeIndex === -1) fail(`missing ${label} guard`);
  if (afterIndex === -1) fail(`missing ${label} target`);
  if (beforeIndex > afterIndex) fail(`${label} guard runs after target`);
}

function routeSegment(source, startNeedle, endNeedle, label) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  if (start === -1 || end === -1) fail(`missing ${label}`);
  return source.slice(start, end);
}

const assertStart = paymentSource.indexOf("export function assertWechatPaidTransactionMatchesOrder");
const assertEnd = paymentSource.indexOf("\nexport function wechatPaidTransactionMatchesOrder", assertStart);
if (assertStart === -1 || assertEnd === -1) fail("strict WeChat paid transaction assertion");
const assertion = paymentSource.slice(assertStart, assertEnd);

[
  ["event type", "eventType && eventType !== \"TRANSACTION.SUCCESS\""],
  ["trade state", "transaction.trade_state !== \"SUCCESS\""],
  ["merchant order number", "transaction.out_trade_no !== order.providerOrderNo"],
  ["transaction id", "!transaction.transaction_id"],
  ["appid", "!isExpectedWechatAppId(transaction.appid)"],
  ["mchid", "transaction.mchid !== expectedMchId"],
  ["amount", "Number(transaction.amount?.total) !== Number(order.amountCents)"],
  ["currency", "transaction.amount?.currency !== order.currency"]
].forEach(([label, needle]) => requireIncludes(assertion, needle, label));

const pollingRoute = routeSegment(ordersSource, ".get(\"/:id/payment-status\"", "\n  .post(\"/:id/pay\"", "payment status polling route");
requireBefore(pollingRoute, "wechatPaidTransactionMatchesOrder(order, query.transaction)", "markOrderPaidAndGrantEntitlement(order, query.transaction)", "polling payment validation");

const webhookRoute = routeSegment(webhooksSource, ".post(\"/wechat-pay\"", "\n  });", "WeChat webhook route");
requireBefore(webhookRoute, "verifyWechatWebhook(c.req.raw.headers, payload)", "assertWechatPaidTransactionMatchesOrder({ eventType: notification.event_type, transaction, order })", "webhook signature verification");
requireBefore(webhookRoute, "assertWechatPaidTransactionMatchesOrder({ eventType: notification.event_type, transaction, order })", "markOrderPaidAndGrantEntitlement(order, transaction)", "webhook payment validation");

const reconcileRoute = routeSegment(adminSource, ".post(\"/orders/:id/reconcile\"", "\n  .post(\"/orders/:id/rebuild-entitlement\"", "admin order reconcile route");
requireBefore(reconcileRoute, "assertWechatPaidTransactionMatchesOrder({ transaction, order })", "markOrderPaidAndGrantEntitlement(order, transaction)", "admin reconcile validation");

const reprocessRoute = routeSegment(adminSource, ".post(\"/payment-events/:id/reprocess\"", "\n  .get(\"/feedback\"", "admin payment event reprocess route");
requireBefore(reprocessRoute, "assertWechatPaidTransactionMatchesOrder({ eventType: notification.event_type, transaction, order })", "markOrderPaidAndGrantEntitlement(order, transaction)", "payment event reprocess validation");

const rebuildRoute = routeSegment(adminSource, ".post(\"/orders/:id/rebuild-entitlement\"", "\n  .get(\"/orders/:id\"", "admin entitlement rebuild route");
requireBefore(rebuildRoute, "order.status !== \"paid\"", "activateOrderEntitlement(order)", "paid-only entitlement rebuild");

requireIncludes(entitlementSource, "dedupeKey: `order:${order.id}:${order.productType}`", "order entitlement dedupe key");
requireIncludes(entitlementSource, "onConflictDoNothing()", "entitlement duplicate suppression");
requireIncludes(entitlementSource, "db.batch([", "paid order and entitlement batch");

console.log("[ok] payment success and entitlement issuance paths require strict WeChat validation and idempotent ledger writes");
