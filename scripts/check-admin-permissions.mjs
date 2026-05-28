import fs from "node:fs";

const source = fs.readFileSync("server/src/routes/admin.ts", "utf8");
const sensitiveRoutes = [
  [".patch(\"/config\"", ".get(\"/dashboard\""],
  [".post(\"/admins\"", ".get(\"/config\""],
  [".patch(\"/admins/:id\"", ".get(\"/config\""],
  [".post(\"/tasks/:id/retry\"", ".get(\"/orders\""],
  [".post(\"/orders/:id/reconcile\"", ".post(\"/orders/:id/rebuild-entitlement\""],
  [".post(\"/orders/:id/rebuild-entitlement\"", ".get(\"/orders/:id\""],
  [".post(\"/payment-events/:id/reprocess\"", ".get(\"/feedback\""]
];

const failures = [];

if (!source.includes("function requireOwnerOrFail")) {
  failures.push("missing requireOwnerOrFail helper");
}

for (const [start, end] of sensitiveRoutes) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (startIndex === -1 || endIndex === -1) {
    failures.push(`missing route segment ${start}`);
    continue;
  }
  const segment = source.slice(startIndex, endIndex);
  if (!segment.includes("requireOwnerOrFail(c, admin)")) {
    failures.push(`${start} does not require owner role`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("[ok] sensitive admin mutations require owner role");
