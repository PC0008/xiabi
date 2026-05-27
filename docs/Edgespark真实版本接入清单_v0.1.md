# Edgespark 真实版本接入清单 v0.1

时间：2026-05-27

## 当前项目

- EdgeSpark project_id: `2a5ef7af-ba13-444e-8972-d4e663f0156d`
- 生产地址：`https://immortal-sponge-1728.edgespark.app`
- 本地全栈开发：`edgespark dev --port 7776`
- 用户端入口：`http://localhost:7776/index.html`
- 管理后台入口：`http://localhost:7776/admin.html`
- API 前缀：`/api/public`
- 支付回调：`/api/webhooks/wechat-pay`

## 已建立的真实后端骨架

- Hono API：`server/src/index.ts`
- 数据库 schema：`server/src/defs/db_schema.ts`
- 迁移文件：`server/drizzle/0000_xiabi_core_schema.sql`
- 存储桶：`xiabi-files`
- 管理员账号密码登录：`/api/public/admin/login`
- 后台配置读取/保存：`/api/public/admin/config`
- 用户端配置读取：`/api/public/config`
- 用户会话：`/api/public/session/guest`
- 写信生成任务：`/api/public/tasks`
- 信件读取/领取：`/api/public/letters/:id`
- 订单创建：`/api/public/orders`
- 微信支付回调接收：`/api/webhooks/wechat-pay`

## 部署前必须配置

运行变量：

```powershell
edgespark var set PUBLIC_BASE_URL=https://你的域名 PAYMENT_PROVIDER=wechat PAYMENT_NOTIFY_URL=https://你的域名/api/webhooks/wechat-pay WECHAT_PAY_APP_ID=你的公众号或开放平台AppID WECHAT_PAY_MCH_ID=你的微信支付商户号 SMS_PROVIDER=aliyun SMS_ALIYUN_SIGN_NAME=你的短信签名 SMS_ALIYUN_TEMPLATE_CODE=你的短信模板Code LETTER_PROVIDER=deepseek DEEPSEEK_MODEL=deepseek-v4-pro DEEPSEEK_BASE_URL=https://api.deepseek.com VOICE_PROVIDER=minimax MINIMAX_VOICE_ID=你的MiniMax音色ID TASK_QUEUE_NAME=xiabi-generation ADMIN_INITIAL_USERNAME=admin
```

密钥：

```powershell
edgespark secret set ADMIN_INITIAL_PASSWORD ADMIN_PASSWORD_PEPPER WECHAT_PAY_API_V3_KEY WECHAT_PAY_PRIVATE_KEY WECHAT_PAY_CERT_SERIAL_NO SMS_API_KEY SMS_API_SECRET VOICE_API_KEY DEEPSEEK_API_KEY
```

配置完成后验证：

```powershell
edgespark deploy --dry-run
edgespark deploy
```

## 本地验证账号

本地 `edgespark dev --reset` 会运行 `server/dev/seed.ts`：

- 账号：`admin`
- 密码：`ChangeMe123!`

正式环境不要使用这个密码；正式环境通过 `ADMIN_INITIAL_PASSWORD` 首次引导创建管理员。

## 当前注意事项

- 写信生成已接入 DeepSeek 适配器；后台 `templates` 配置会作为写信规则进入服务端生成流程。
- MiniMax 当前已配置语音服务接入位和克隆音色 ID；下一步要继续补 MiniMax 语音合成/输入接口实现。
- 微信支付、短信目前已有服务端适配器边界，待补真实供应商请求和回调验签。
- 订单、支付回调、权益流水已经建表；支付回调已做事件幂等表，下一步要把微信验签、回调解密、订单状态更新和权益发放接上。
- 用户端会优先创建服务端任务和信件记录；API 不可用时本地预览仍保留兜底体验。
- 后台保存配置已经优先调用服务端；本地静态预览不可用时才保留本地兜底。
