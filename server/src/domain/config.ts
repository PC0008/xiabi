import { and, eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { drizzleSchema } from "@defs";
import { appConfig, tenants } from "@defs";
import { ConfigScope, configScopes, defaultConfigByScope, TENANT_ID } from "./defaults";
import { parseJson } from "./http";

type Database = DrizzleD1Database<typeof drizzleSchema>;

export async function ensureTenant(db: Database) {
  const [existing] = await db.select().from(tenants).where(eq(tenants.id, TENANT_ID)).limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(tenants)
    .values({ id: TENANT_ID, name: "下笔有元", slug: "main" })
    .returning();
  return created;
}

export async function getConfigScope<T extends ConfigScope>(db: Database, scope: T) {
  await ensureTenant(db);
  const [row] = await db
    .select()
    .from(appConfig)
    .where(and(eq(appConfig.tenantId, TENANT_ID), eq(appConfig.scope, scope)))
    .limit(1);
  return {
    data: parseJson(row?.dataJson, defaultConfigByScope[scope]),
    version: row?.version ?? 0,
    updatedAt: row?.updatedAt ?? null
  };
}

export async function getPublicConfig(db: Database) {
  const [home, pricing, guideStages, system] = await Promise.all([
    getConfigScope(db, "home"),
    getConfigScope(db, "pricing"),
    getConfigScope(db, "guideStages"),
    getConfigScope(db, "system")
  ]);
  return {
    homeConfig: home.data,
    pricing: pricing.data,
    guideStages: guideStages.data,
    system: system.data,
    versions: {
      home: home.version,
      pricing: pricing.version,
      guideStages: guideStages.version,
      system: system.version
    }
  };
}

export async function getAdminConfig(db: Database) {
  const result: Record<string, unknown> = {};
  for (const scope of configScopes()) {
    result[scope] = (await getConfigScope(db, scope)).data;
  }
  return result;
}

export async function upsertConfigScope(db: Database, scope: ConfigScope, data: unknown, adminId: string) {
  await ensureTenant(db);
  const existing = await getConfigScope(db, scope);
  await db
    .insert(appConfig)
    .values({
      id: `cfg_${TENANT_ID}_${scope}`,
      tenantId: TENANT_ID,
      scope,
      dataJson: JSON.stringify(data),
      version: existing.version + 1,
      updatedBy: adminId,
      updatedAt: new Date().toISOString()
    })
    .onConflictDoUpdate({
      target: [appConfig.tenantId, appConfig.scope],
      set: {
        dataJson: JSON.stringify(data),
        version: existing.version + 1,
        updatedBy: adminId,
        updatedAt: new Date().toISOString()
      }
    });
}
