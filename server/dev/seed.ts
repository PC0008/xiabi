import { defineSeed } from "@edgespark/devkit";
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import * as schema from "../src/defs/db_schema";
import { defaultConfigByScope, TENANT_ID } from "../src/domain/defaults";
import { hashPassword } from "../src/domain/security";

export default defineSeed<SqliteRemoteDatabase<typeof schema>>(async (ctx) => {
  await ctx.db.insert(schema.tenants).values({
    id: TENANT_ID,
    name: "下笔有元",
    slug: "main"
  }).onConflictDoNothing();

  const scopes = Object.entries(defaultConfigByScope);
  for (const [scope, data] of scopes) {
    await ctx.db.insert(schema.appConfig).values({
      id: `cfg_${TENANT_ID}_${scope}`,
      tenantId: TENANT_ID,
      scope,
      dataJson: JSON.stringify(data),
      version: 1
    }).onConflictDoNothing();
  }

  const username = "admin";
  const password = "ChangeMe123!";
  await ctx.db.insert(schema.adminUsers).values({
    id: "admin_owner",
    tenantId: TENANT_ID,
    username,
    displayName: "Owner",
    role: "owner",
    passwordHash: await hashPassword(password)
  }).onConflictDoNothing();

  console.log(`Seeded tenant ${TENANT_ID}. Local admin: ${username} / ${password}`);
});
