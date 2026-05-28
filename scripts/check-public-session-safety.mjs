import fs from "node:fs";

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function fail(message) {
  throw new Error(`public session safety verification failed: ${message}`);
}

function requireIncludes(source, needle, label) {
  if (!source.includes(needle)) fail(`missing ${label}`);
}

function segment(source, startNeedle, endNeedle, label) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  if (start === -1 || end === -1) fail(`missing ${label}`);
  return source.slice(start, end);
}

function requireActiveSessionInSegment(source, startNeedle, endNeedle, label) {
  const route = segment(source, startNeedle, endNeedle, label);
  const hasSharedActiveSession = route.includes("getActiveSession(c)") && route.includes("if (!activeSession)");
  const hasLocalActiveSession = route.includes("getCurrentSession(sessionId)") && route.includes("if (!session)");
  const hasRequireSession = route.includes("requireSession(c)") && route.includes("if (!session)");
  if (!hasSharedActiveSession && !hasLocalActiveSession && !hasRequireSession) {
    fail(`${label} does not require an active session before doing work`);
  }
}

const activeSessionHelper = read("server/src/domain/session.ts");
requireIncludes(activeSessionHelper, "eq(guestSessions.status, \"active\")", "shared active session status check");

const tasks = read("server/src/routes/tasks.ts");
requireActiveSessionInSegment(tasks, ".post(\"/\"", "\n  .get(\"/:id\"", "task creation route");
requireActiveSessionInSegment(tasks, ".get(\"/:id\"", "\n  });", "task polling route");

const sms = read("server/src/routes/sms.ts");
requireActiveSessionInSegment(sms, ".post(\"/send-code\"", "\n  });", "SMS send-code route");

const voice = read("server/src/routes/voice.ts");
requireActiveSessionInSegment(voice, ".post(\"/speak\"", "\n  .post(\"/transcribe\"", "voice speak route");
requireActiveSessionInSegment(voice, ".post(\"/transcribe\"", "\n  });", "voice transcribe route");

const orders = read("server/src/routes/orders.ts");
requireIncludes(orders, "eq(guestSessions.status, \"active\")", "orders local active session query");
requireActiveSessionInSegment(orders, ".post(\"/\"", "\n  .get(\"/:id/payment-status\"", "order creation route");
requireActiveSessionInSegment(orders, ".get(\"/:id/payment-status\"", "\n  .post(\"/:id/pay\"", "payment status route");
requireActiveSessionInSegment(orders, ".post(\"/:id/pay\"", "\n  .get(\"/:id\"", "order retry payment route");

const exportsRoute = read("server/src/routes/exports.ts");
requireIncludes(exportsRoute, "eq(guestSessions.status, \"active\")", "exports local active session query");
requireActiveSessionInSegment(exportsRoute, ".post(\"/letters/:id\"", "\n  });", "letter export route");

const letters = read("server/src/routes/letters.ts");
requireIncludes(letters, "eq(guestSessions.status, \"active\")", "letters local active session query");
requireActiveSessionInSegment(letters, ".post(\"/:id/claim\"", "\n  });", "letter claim route");

const users = read("server/src/routes/users.ts");
requireActiveSessionInSegment(users, ".post(\"/bind-phone\"", "\n  });", "bind phone route");

const profiles = read("server/src/routes/profiles.ts");
requireIncludes(profiles, "eq(guestSessions.status, \"active\")", "profiles local active session query");
requireActiveSessionInSegment(profiles, ".post(\"/\"", "\n  .patch(\"/:id\"", "profile create route");
requireActiveSessionInSegment(profiles, ".patch(\"/:id\"", "\n  .delete(\"/:id\"", "profile update route");
requireActiveSessionInSegment(profiles, ".delete(\"/:id\"", "\n  });", "profile delete route");

const feedback = read("server/src/routes/feedback.ts");
requireActiveSessionInSegment(feedback, ".post(\"/\"", "\n  });", "feedback submit route");

const wechat = read("server/src/routes/wechat.ts");
requireActiveSessionInSegment(wechat, ".post(\"/jssdk-config\"", "\n  .get(\"/oauth/start\"", "WeChat JS-SDK config route");
requireActiveSessionInSegment(wechat, ".get(\"/oauth/start\"", "\n  .get(\"/oauth/callback\"", "WeChat OAuth start route");
requireActiveSessionInSegment(wechat, ".get(\"/oauth/callback\"", "\n  });", "WeChat OAuth callback route");

console.log("[ok] public write, payment, SMS, voice, export, and OAuth routes require active sessions");
