import { relations } from "drizzle-orm";
import {
  adminSessions,
  adminUsers,
  appConfig,
  auditLogs,
  entitlementLedger,
  files,
  generationTasks,
  guestSessions,
  orders,
  paymentWebhookEvents,
  productProfiles,
  salesLetters,
  smsCodes,
  tenants,
  users
} from "./db_schema";

export const tenantsRelations = relations(tenants, ({ many }) => ({
  admins: many(adminUsers),
  configs: many(appConfig),
  users: many(users),
  letters: many(salesLetters),
  tasks: many(generationTasks),
  orders: many(orders),
  productProfiles: many(productProfiles),
  entitlements: many(entitlementLedger),
  webhooks: many(paymentWebhookEvents),
  files: many(files),
  smsCodes: many(smsCodes),
  auditLogs: many(auditLogs)
}));

export const adminUsersRelations = relations(adminUsers, ({ one, many }) => ({
  tenant: one(tenants, { fields: [adminUsers.tenantId], references: [tenants.id] }),
  sessions: many(adminSessions)
}));

export const salesLettersRelations = relations(salesLetters, ({ one, many }) => ({
  tenant: one(tenants, { fields: [salesLetters.tenantId], references: [tenants.id] }),
  user: one(users, { fields: [salesLetters.userId], references: [users.id] }),
  session: one(guestSessions, { fields: [salesLetters.sessionId], references: [guestSessions.id] }),
  tasks: many(generationTasks),
  orders: many(orders),
  entitlements: many(entitlementLedger),
  files: many(files)
}));

export const productProfilesRelations = relations(productProfiles, ({ one }) => ({
  tenant: one(tenants, { fields: [productProfiles.tenantId], references: [tenants.id] }),
  user: one(users, { fields: [productProfiles.userId], references: [users.id] }),
  session: one(guestSessions, { fields: [productProfiles.sessionId], references: [guestSessions.id] })
}));
