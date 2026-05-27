import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const tenants = sqliteTable("tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`)
}, (table) => [
  uniqueIndex("tenants_slug_idx").on(table.slug)
]);

export const adminUsers = sqliteTable("admin_users", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  username: text("username").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull().default("owner"),
  passwordHash: text("password_hash").notNull(),
  status: text("status").notNull().default("active"),
  lastLoginAt: text("last_login_at"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`)
}, (table) => [
  uniqueIndex("admin_users_tenant_username_idx").on(table.tenantId, table.username),
  index("admin_users_status_idx").on(table.status)
]);

export const adminSessions = sqliteTable("admin_sessions", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  adminId: text("admin_id").notNull().references(() => adminUsers.id),
  tokenHash: text("token_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`)
}, (table) => [
  uniqueIndex("admin_sessions_token_hash_idx").on(table.tokenHash),
  index("admin_sessions_admin_idx").on(table.adminId),
  index("admin_sessions_expires_idx").on(table.expiresAt)
]);

export const appConfig = sqliteTable("app_config", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  scope: text("scope").notNull(),
  dataJson: text("data_json").notNull(),
  version: integer("version").notNull().default(1),
  updatedBy: text("updated_by"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`)
}, (table) => [
  uniqueIndex("app_config_tenant_scope_idx").on(table.tenantId, table.scope)
]);

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  nickname: text("nickname"),
  avatarUrl: text("avatar_url"),
  phoneMasked: text("phone_masked"),
  phoneHash: text("phone_hash"),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`)
}, (table) => [
  index("users_tenant_idx").on(table.tenantId),
  uniqueIndex("users_tenant_phone_hash_idx").on(table.tenantId, table.phoneHash)
]);

export const guestSessions = sqliteTable("guest_sessions", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  userId: text("user_id").references(() => users.id),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`)
}, (table) => [
  index("guest_sessions_user_idx").on(table.userId)
]);

export const salesLetters = sqliteTable("sales_letters", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  userId: text("user_id").references(() => users.id),
  sessionId: text("session_id").references(() => guestSessions.id),
  title: text("title").notNull(),
  scene: text("scene").notNull(),
  status: text("status").notNull().default("draft"),
  inputJson: text("input_json").notNull(),
  contentJson: text("content_json"),
  templateKey: text("template_key"),
  templateVersion: text("template_version"),
  claimedAt: text("claimed_at"),
  exportedAt: text("exported_at"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`)
}, (table) => [
  index("sales_letters_tenant_user_idx").on(table.tenantId, table.userId),
  index("sales_letters_session_idx").on(table.sessionId),
  index("sales_letters_status_idx").on(table.status)
]);

export const generationTasks = sqliteTable("generation_tasks", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  userId: text("user_id").references(() => users.id),
  sessionId: text("session_id").references(() => guestSessions.id),
  letterId: text("letter_id").references(() => salesLetters.id),
  type: text("type").notNull(),
  status: text("status").notNull().default("queued"),
  inputJson: text("input_json").notNull(),
  progressJson: text("progress_json"),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  attempts: integer("attempts").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`)
}, (table) => [
  index("generation_tasks_status_idx").on(table.status),
  index("generation_tasks_letter_idx").on(table.letterId)
]);

export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  userId: text("user_id").references(() => users.id),
  sessionId: text("session_id").references(() => guestSessions.id),
  letterId: text("letter_id").references(() => salesLetters.id),
  provider: text("provider").notNull(),
  providerOrderNo: text("provider_order_no"),
  providerTransactionId: text("provider_transaction_id"),
  productType: text("product_type").notNull(),
  title: text("title").notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("CNY"),
  status: text("status").notNull().default("pending"),
  paidAt: text("paid_at"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`)
}, (table) => [
  index("orders_tenant_user_idx").on(table.tenantId, table.userId),
  uniqueIndex("orders_provider_order_idx").on(table.provider, table.providerOrderNo),
  index("orders_status_idx").on(table.status)
]);

export const entitlementLedger = sqliteTable("entitlement_ledger", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  userId: text("user_id").references(() => users.id),
  sessionId: text("session_id").references(() => guestSessions.id),
  orderId: text("order_id").references(() => orders.id),
  letterId: text("letter_id").references(() => salesLetters.id),
  type: text("type").notNull(),
  status: text("status").notNull().default("active"),
  quantity: integer("quantity").notNull().default(1),
  dedupeKey: text("dedupe_key").notNull(),
  startsAt: text("starts_at"),
  expiresAt: text("expires_at"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`)
}, (table) => [
  uniqueIndex("entitlement_ledger_dedupe_idx").on(table.tenantId, table.dedupeKey),
  index("entitlement_ledger_user_idx").on(table.userId),
  index("entitlement_ledger_order_idx").on(table.orderId)
]);

export const paymentWebhookEvents = sqliteTable("payment_webhook_events", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  provider: text("provider").notNull(),
  eventId: text("event_id").notNull(),
  orderId: text("order_id"),
  status: text("status").notNull().default("received"),
  payloadJson: text("payload_json").notNull(),
  errorMessage: text("error_message"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`)
}, (table) => [
  uniqueIndex("payment_webhook_provider_event_idx").on(table.provider, table.eventId),
  index("payment_webhook_order_idx").on(table.orderId)
]);

export const files = sqliteTable("files", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  userId: text("user_id").references(() => users.id),
  letterId: text("letter_id").references(() => salesLetters.id),
  bucket: text("bucket").notNull(),
  objectKey: text("object_key").notNull(),
  kind: text("kind").notNull(),
  status: text("status").notNull().default("ready"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`)
}, (table) => [
  uniqueIndex("files_object_idx").on(table.bucket, table.objectKey),
  index("files_letter_idx").on(table.letterId)
]);

export const smsCodes = sqliteTable("sms_codes", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  phoneHash: text("phone_hash").notNull(),
  codeHash: text("code_hash").notNull(),
  status: text("status").notNull().default("pending"),
  expiresAt: text("expires_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`)
}, (table) => [
  index("sms_codes_phone_idx").on(table.phoneHash),
  index("sms_codes_expires_idx").on(table.expiresAt)
]);

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  actorId: text("actor_id"),
  actorType: text("actor_type").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  detailJson: text("detail_json"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`)
}, (table) => [
  index("audit_logs_tenant_action_idx").on(table.tenantId, table.action),
  index("audit_logs_actor_idx").on(table.actorId)
]);
