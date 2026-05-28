import { and, eq, inArray } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { drizzleSchema } from "@defs";
import { appConfig, tenants } from "@defs";
import { ConfigScope, configScopes, defaultConfigByScope, TENANT_ID } from "./defaults";
import { withTransientDbRetry } from "./db_retry";
import { parseJson } from "./http";

type Database = DrizzleD1Database<typeof drizzleSchema>;

export async function ensureTenant(db: Database) {
  const [existing] = await withTransientDbRetry("tenant_select", () =>
    db.select().from(tenants).where(eq(tenants.id, TENANT_ID)).limit(1)
  );
  if (existing) return existing;
  const [created] = await withTransientDbRetry("tenant_insert", () =>
    db
      .insert(tenants)
      .values({ id: TENANT_ID, name: "下笔有元", slug: "main" })
      .returning()
  );
  return created;
}

export async function getConfigScope<T extends ConfigScope>(db: Database, scope: T) {
  await ensureTenant(db);
  const [row] = await withTransientDbRetry(`config_scope_${scope}`, () =>
    db
      .select()
      .from(appConfig)
      .where(and(eq(appConfig.tenantId, TENANT_ID), eq(appConfig.scope, scope)))
      .limit(1)
  );
  return {
    data: parseJson(row?.dataJson, defaultConfigByScope[scope]),
    version: row?.version ?? 0,
    updatedAt: row?.updatedAt ?? null
  };
}

async function getConfigScopes(db: Database, scopes: ConfigScope[]) {
  await ensureTenant(db);
  const rows = await withTransientDbRetry("config_scopes_select", () =>
    db
      .select()
      .from(appConfig)
      .where(and(eq(appConfig.tenantId, TENANT_ID), inArray(appConfig.scope, scopes)))
  );
  const byScope = new Map(rows.map((row) => [row.scope as ConfigScope, row]));
  return Object.fromEntries(scopes.map((scope) => {
    const row = byScope.get(scope);
    return [scope, {
      data: parseJson(row?.dataJson, defaultConfigByScope[scope]),
      version: row?.version ?? 0,
      updatedAt: row?.updatedAt ?? null
    }];
  })) as Record<ConfigScope, { data: unknown; version: number; updatedAt: string | null }>;
}

export async function getPublicConfig(db: Database) {
  const scopes = await getConfigScopes(db, ["home", "pricing", "guideStages", "system"]);
  const home = scopes.home;
  const pricing = scopes.pricing;
  const guideStages = scopes.guideStages;
  const system = scopes.system;
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
  const scopes = await getConfigScopes(db, configScopes());
  const result = Object.fromEntries(configScopes().map((scope) => [scope, scopes[scope].data]));
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
