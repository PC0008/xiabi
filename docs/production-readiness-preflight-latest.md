# 生产验收状态报告

生成时间：2026-05-28T05:43:13.845Z
线上地址：https://immortal-sponge-1728.edgespark.app
整体结果：基础通过：仍有真实外部链路等待输入或付费验收。
完整可用：否

## 汇总

- 已验证：1
- 待输入：12
- 外部阻塞：0
- 失败：0

## 验收矩阵

| 能力 | 状态 | 证据 | 下一步 |
| --- | --- | --- | --- |
| 线上基础运行 | 已验证 | health, public config, session logout, product profile crud |  |
| 管理后台登录与运营接口 | 待输入 | admin diagnostics, admin read operations, admin account controls, admin config propagation, admin config audit diff | 设置 XIABI_VERIFY_ADMIN_USERNAME / XIABI_VERIFY_ADMIN_PASSWORD 后复验。 |
| DeepSeek 写信闭环 | 待输入 | deepseek generation | 设置 XIABI_VERIFY_DEEPSEEK=1 会真实消耗一次生成额度。 |
| 首次免费权益与导出 | 待输入 | first free entitlement and export | 设置 XIABI_VERIFY_DEEPSEEK=1 后会在同一会话内验证领取、权益流水和打印版导出。 |
| 首次免费重复领取限制 | 待输入 | first free repeat guard | 设置 XIABI_VERIFY_DEEPSEEK=1 和 XIABI_VERIFY_REPEAT_FREE=1 后，会生成第二封信并验证重复免费领取被拒绝。 |
| 微信支付下单 | 待输入 | wechat payment create | 设置 XIABI_VERIFY_PAYMENT_CREATE=1 后复验。 |
| 微信支付拉起审计链路 | 待输入 | wechat payment audit trail | 同一轮设置 XIABI_VERIFY_PAYMENT_CREATE=1、XIABI_VERIFY_ADMIN_USERNAME 和 XIABI_VERIFY_ADMIN_PASSWORD 后，会复验支付拉起尝试/结果已写入后台审计日志。 |
| 微信付款回调与权益到账 | 待输入 | wechat paid order closure, paid entitlement idempotency | 完成真实付款后设置 XIABI_VERIFY_PAID_ORDER_ID，并可设置 XIABI_VERIFY_REQUIRE_WEBHOOK=1；脚本会复验重复补发不重复加权益。 |
| 短信发送与手机号绑定 | 待输入 | sms send, sms bind | 设置 XIABI_VERIFY_SMS_PHONE 发送验证码；收到后设置 XIABI_VERIFY_SMS_CODE 复验绑定。 |
| 短信发送审计链路 | 待输入 | sms audit trail | 同一轮设置 XIABI_VERIFY_SMS_PHONE、XIABI_VERIFY_ADMIN_USERNAME 和 XIABI_VERIFY_ADMIN_PASSWORD 后，会复验短信发送尝试/结果已写入后台审计日志。 |
| 手机号绑定后资产归属 | 待输入 | sms ownership propagation | 同一轮设置 XIABI_VERIFY_DEEPSEEK=1、XIABI_VERIFY_SMS_PHONE 和 XIABI_VERIFY_SMS_CODE，可复验绑定后信件和权益归属到手机号用户。 |
| MiniMax 说话播放 | 待输入 | minimax tts | 设置 XIABI_VERIFY_TTS=1 会真实调用一次 MiniMax TTS。 |
| 语音输入转写 | 待输入 | voice asr | MiniMax 官方 API 总览当前未列独立 ASR 端点；拿到可用 VOICE_ASR_ENDPOINT 后，设置 XIABI_VERIFY_ASR_AUDIO=本地音频路径复验，兼容 JSON base64 和 OpenAI-compatible multipart。 |

## 最终人工验证批次

下面这些批次只在要做最终交付验收时执行；会真实调用外部服务或产生支付/短信/模型费用。不要把真实密钥写入仓库，只在本机或 Edgespark 环境变量里设置。

### 1. 后台账号与后台控制前台

证明：管理员登录、系统自检、运营列表、后台配置传播到用户端、配置审计差异。

```powershell
$env:XIABI_VERIFY_ADMIN_USERNAME="后台账号"
$env:XIABI_VERIFY_ADMIN_PASSWORD="后台密码"
$env:XIABI_PRODUCTION_STRICT="1"
npm run verify:production:report
```

### 2. DeepSeek 写信、首次免费、导出与 MiniMax 说话

证明：真实写信任务、首次免费权益流水、重复免费领取拦截、打印版/文本版导出、MiniMax TTS 返回可播放音频。

```powershell
$env:XIABI_VERIFY_DEEPSEEK="1"
$env:XIABI_VERIFY_REPEAT_FREE="1"
$env:XIABI_VERIFY_TTS="1"
npm run verify:production:report
```

### 3. 阿里云短信与手机号绑定

证明：真实短信发送、验证码绑定、同一轮写信资产归属迁移到绑定手机号用户。

```powershell
$env:XIABI_VERIFY_ADMIN_USERNAME="后台账号"
$env:XIABI_VERIFY_ADMIN_PASSWORD="后台密码"
$env:XIABI_VERIFY_DEEPSEEK="1"
$env:XIABI_VERIFY_SMS_PHONE="可接收验证码的手机号"
npm run verify:production:report

$env:XIABI_VERIFY_SMS_CODE="收到的6位验证码"
npm run verify:production:report
```

### 4. 微信支付下单权限

证明：真实请求微信支付创建订单；如果商户产品权限未开通，会被标成外部阻塞而不是代码失败。

```powershell
$env:XIABI_VERIFY_ADMIN_USERNAME="后台账号"
$env:XIABI_VERIFY_ADMIN_PASSWORD="后台密码"
$env:XIABI_VERIFY_PAYMENT_CREATE="1"
$env:XIABI_VERIFY_ALLOW_EXTERNAL_BLOCKED="1"
npm run verify:production:report
```

### 5. 微信真实付款、回调与权益到账

证明：真实付款后订单 paid、权益流水到账、回调事件已处理、后台补权益连续执行两次仍幂等。

```powershell
$env:XIABI_VERIFY_ADMIN_USERNAME="后台账号"
$env:XIABI_VERIFY_ADMIN_PASSWORD="后台密码"
$env:XIABI_VERIFY_PAID_ORDER_ID="已完成付款的订单ID"
$env:XIABI_VERIFY_REQUIRE_WEBHOOK="1"
npm run verify:production:report
```

### 6. 语音输入 ASR 样本

证明：服务端 ASR 接入位能识别真实音频；通过后才应把 VOICE_ASR_VERIFIED 设为 1 并重新部署。

```powershell
$env:XIABI_VERIFY_ASR_AUDIO="D:\path\to\sample.wav"
$env:XIABI_VERIFY_ASR_EXPECTED_TEXT="样本音频里应出现的关键句"
npm run verify:production:report
```

## 历史联调证据

这些记录来自此前已执行的生产验收，用于防止基础巡检报告覆盖真实联调痕迹；它们不替代最终交付前的当前配置复验。

| 能力 | 状态 | 证据 |
| --- | --- | --- |
| DOCX 文档版导出 | 当前配置已跑通，最终交付前可按需复验 | 2026-05-28 生产验收：任务 ed9aecec-d3f1-43e2-a72d-0ab0f6c51845 / 信件 e0bb86cc-5d27-43f8-9fbe-bf256a26e913 / DOCX exports/3cf59eb0-1591-47cb-a694-d9e1091b83fe/e0bb86cc-5d27-43f8-9fbe-bf256a26e913.docx |
| DeepSeek 写信 | 历史已跑通，最终交付前需按当前配置复验 | 任务 9b8d26e3-7693-4fea-9bff-519a73294201 / 信件 60ca6afd-e328-4a0b-b88f-e293a8c52848；任务 98055e89-2479-4168-8dbe-330bc3996f3d / 信件 7eb8602f-ee74-4942-b86a-1ad18f4ebb78 |
| 首次免费权益、重复领取限制、打印版导出 | 历史已跑通，最终交付前需按当前配置复验 | 已通过 XIABI_VERIFY_DEEPSEEK=1、XIABI_VERIFY_REPEAT_FREE=1 的生产验收路径 |
| MiniMax TTS 说话播放 | 历史已跑通，最终交付前需按当前配置复验 | speech-2.8-hd + hex 输出返回 audio/mp3，traceId 06665fa1c520e487c74987a4296b424a |
| 微信支付下单 | 历史已确认代码可请求微信，当前阻塞在商户产品权限 | 微信返回商户产品权限未开通；需开通 H5 支付或 JSAPI 支付后复验真实小额付款 |

## 原始检查项

- health: ok
- public config: ok
- session logout: ok
- product profile crud: ok
- admin diagnostics: skipped；set XIABI_VERIFY_ADMIN_USERNAME and XIABI_VERIFY_ADMIN_PASSWORD
- admin account controls: skipped；set XIABI_VERIFY_ADMIN_USERNAME and XIABI_VERIFY_ADMIN_PASSWORD to verify owner can manage admin accounts
- admin config propagation: skipped；set XIABI_VERIFY_ADMIN_USERNAME and XIABI_VERIFY_ADMIN_PASSWORD to verify admin config controls public config
- admin config audit diff: skipped；set XIABI_VERIFY_ADMIN_USERNAME and XIABI_VERIFY_ADMIN_PASSWORD to verify config update audit details
- deepseek generation: skipped；set XIABI_VERIFY_DEEPSEEK=1 to run a real generation
- first free entitlement and export: skipped；set XIABI_VERIFY_DEEPSEEK=1 to verify first free entitlement and export
- first free repeat guard: skipped；set XIABI_VERIFY_DEEPSEEK=1 and XIABI_VERIFY_REPEAT_FREE=1 to verify repeat guard
- sms ownership propagation: skipped；set XIABI_VERIFY_DEEPSEEK=1 with SMS bind verification to check ownership propagation
- wechat payment create: skipped；set XIABI_VERIFY_PAYMENT_CREATE=1 to create a real unpaid WeChat H5 order
- wechat payment audit trail: skipped；set XIABI_VERIFY_PAYMENT_CREATE=1 and admin verifier credentials to verify payment audit logs
- wechat paid order closure: skipped；set XIABI_VERIFY_PAID_ORDER_ID after completing a real payment
- paid entitlement idempotency: skipped；set XIABI_VERIFY_PAID_ORDER_ID to verify repeated entitlement repair is idempotent
- sms send: skipped；set XIABI_VERIFY_SMS_PHONE to send a real SMS code
- sms audit trail: skipped；set XIABI_VERIFY_SMS_PHONE and admin verifier credentials to verify SMS audit logs
- minimax tts: skipped；set XIABI_VERIFY_TTS=1 to call MiniMax TTS
- voice asr: skipped；set XIABI_VERIFY_ASR_AUDIO to an audio file path after configuring a real VOICE_ASR_ENDPOINT
