# Web API 与数据模型 v0.1

日期：2026-05-26

## 口径

本文按 H5/Web + Edgespark.dev 重新定义，不沿用旧小程序/CloudBase API。当前 H5 mock 可继续用 `localStorage`，但真实权限只从服务端订单流水和权益流水计算。

## 核心原则

- 所有表保留 `tenant_id`。
- 前端不传“是否有权益”作为可信字段。
- 手机号、订单、权益、生成任务、PDF 文件都由服务端保存。
- 支付回调必须幂等。
- 长耗时任务必须可查询、可恢复、可失败重试。

## 建议数据表

### tenants

```text
id
name
status
created_at
updated_at
```

### users

```text
id
tenant_id
display_name
avatar_url
phone_masked
phone_hash
status
created_at
updated_at
```

### app_config

```text
id
tenant_id
scope              home|guide|pricing|export|payment
config_json
version
updated_by
updated_at
```

### sales_letters

```text
id
tenant_id
user_id
title
scene
status             draft|generating|ready|claimed|exported|failed
input_json
content_json
version
created_at
updated_at
```

### generation_tasks

```text
id
tenant_id
user_id
letter_id
task_type          letter|voice_transcribe|pdf_export
status             queued|running|succeeded|failed|cancelled
progress
input_json
result_json
error_code
error_message
created_at
updated_at
finished_at
```

### orders

```text
id
tenant_id
user_id
order_no
product_type       single_unlock|annual_membership
amount_cent
currency
status             created|paying|paid|closed|refunded
provider
provider_trade_no
metadata_json
created_at
paid_at
updated_at
```

### entitlement_ledger

```text
id
tenant_id
user_id
order_id
entitlement_type   single_letter|annual_membership|free_claim
letter_id
delta
status             active|revoked|expired
effective_at
expires_at
created_at
```

### payment_webhook_events

```text
id
tenant_id
provider
event_id
order_no
raw_payload_json
signature_valid
processed_at
process_status     received|processed|ignored|failed
created_at
```

### files

```text
id
tenant_id
user_id
letter_id
file_type          pdf|image|voice
storage_key
public_url
status
created_at
```

## 索引建议

### users

```text
idx_users_tenant_created_at       tenant_id, created_at
idx_users_phone_hash              tenant_id, phone_hash
```

### app_config

```text
uniq_app_config_scope             tenant_id, scope
```

### sales_letters

```text
idx_letters_user_created_at       tenant_id, user_id, created_at
idx_letters_status                tenant_id, status, updated_at
```

### generation_tasks

```text
idx_tasks_letter_type             tenant_id, letter_id, task_type
idx_tasks_status_created_at       tenant_id, status, created_at
```

### orders

```text
uniq_orders_order_no              tenant_id, order_no
idx_orders_user_created_at        tenant_id, user_id, created_at
idx_orders_status                 tenant_id, status, updated_at
idx_orders_provider_trade_no      provider, provider_trade_no
```

### entitlement_ledger

```text
uniq_ledger_order_type            tenant_id, order_id, entitlement_type
idx_ledger_user_active            tenant_id, user_id, status, effective_at, expires_at
idx_ledger_letter                 tenant_id, letter_id
```

### payment_webhook_events

```text
uniq_webhook_provider_event       provider, event_id
idx_webhook_order_no              tenant_id, order_no
idx_webhook_status                process_status, created_at
```

### files

```text
idx_files_letter                  tenant_id, letter_id, file_type
idx_files_user_created_at         tenant_id, user_id, created_at
```

## 权限建议

- 用户端只能读取自己的 `users`、`sales_letters`、`orders`、`entitlement_ledger` 和 `files`。
- 用户端不能直接写 `orders.status`、`entitlement_ledger`、`payment_webhook_events`。
- 总后台需要登录后访问，按角色限制配置、订单、权益和日志操作。
- 支付回调只允许服务端路由写入 `payment_webhook_events`、更新 `orders`、写入 `entitlement_ledger`。
- `app_config` 分为 public 与 admin 两层返回，用户端只拿可展示配置。
- 所有查询默认带 `tenant_id`，不允许前端传空租户查询全量数据。

## 初始化配置

一期至少初始化：

```text
tenant_id=main
app_config.home
app_config.guide
app_config.pricing
app_config.export
app_config.payment
admin_user.owner
```

`pricing` 初始值与当前 H5 mock 保持一致：

```json
{
  "single": 200,
  "annual": 2000,
  "payment_enabled": true,
  "single_enabled": true,
  "annual_enabled": true,
  "pdf_upsell_enabled": true
}
```

## API 草案

### 配置

```text
GET /api/config/public
PATCH /api/admin/config
```

`GET /api/config/public` 只返回用户端可见配置：首页文案、通话引导、价格展示、导出页文案、入口开关。

### 用户与手机号

```text
POST /api/session/guest
POST /api/users/bind-phone
GET /api/users/me
```

手机号绑定只在生成中或领取完整内容节点触发。

### 销售信

```text
POST /api/letters
GET /api/letters
GET /api/letters/:id
POST /api/letters/:id/claim
POST /api/letters/:id/export-pdf
```

### 任务

```text
POST /api/tasks
GET /api/tasks/:id
POST /api/tasks/:id/retry
```

### 订单与权益

```text
POST /api/orders
GET /api/orders
GET /api/entitlements
POST /api/payments/webhook
GET /api/orders/:id/payment-status
```

## 迁移说明

当前本地字段到服务端字段的映射：

```text
h5Letter -> sales_letters + generation_tasks
h5MockOrders -> orders
h5MockLedger -> entitlement_ledger
h5PhoneBound -> users.phone_hash / phone_masked
xiabiAdminConfig -> app_config
```

进入真实后端前，先创建表、索引、权限和初始化配置，再改前端调用。
