import fs from "node:fs";

const schema = fs.readFileSync("server/src/defs/db_schema.ts", "utf8");
const usersRoute = fs.readFileSync("server/src/routes/users.ts", "utf8");

function fail(message) {
  throw new Error(`bind phone unique verification failed: ${message}`);
}

if (!schema.includes("uniqueIndex(\"users_tenant_phone_hash_idx\").on(table.tenantId, table.phoneHash)")) {
  fail("users table must have a tenant + phone_hash unique index");
}

if (!usersRoute.includes("function findUserByPhoneHash")) {
  fail("bind-phone route must have a tenant-scoped phone hash lookup helper");
}

if (!usersRoute.includes("eq(users.tenantId, TENANT_ID)") || !usersRoute.includes("eq(users.phoneHash, phoneHash)")) {
  fail("bind-phone lookup must be scoped by tenant and phone hash");
}

if (!usersRoute.includes(".onConflictDoNothing()")) {
  fail("bind-phone insert must tolerate concurrent unique conflicts");
}

if (!usersRoute.includes("user = await findUserByPhoneHash(phoneHash)")) {
  fail("bind-phone route must re-read the winning user after a conflict-safe insert");
}

console.log("[ok] bind-phone uses tenant-scoped phone hash uniqueness and conflict-safe user lookup");
