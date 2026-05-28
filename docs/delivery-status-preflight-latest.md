# 最终交付状态清单

生成时间：2026-05-28T09:15:47.388Z
来源报告：docs/production-readiness-preflight-latest.md
来源报告生成时间：2026-05-28T09:15:46.622Z
线上地址：https://immortal-sponge-1728.edgespark.app

## 当前结论

- 完整可用：否
- 整体结果：基础通过：仍有真实外部链路等待输入或付费验收。
- 已验证：1
- 待输入：12
- 外部阻塞：0
- 失败：0

## 剩余验收项

| 能力 | 当前状态 | 下一步 |
| --- | --- | --- |
| 管理后台登录与运营接口 | 待输入 | 设置 XIABI_VERIFY_ADMIN_USERNAME / XIABI_VERIFY_ADMIN_PASSWORD 后复验。 |
| DeepSeek 写信闭环 | 待输入 | 设置 XIABI_VERIFY_DEEPSEEK=1 会真实消耗一次生成额度。 |
| 首次免费权益与导出 | 待输入 | 设置 XIABI_VERIFY_DEEPSEEK=1 后会在同一会话内验证领取、权益流水和 HTML/TXT/DOCX/PDF 导出。 |
| 首次免费重复领取限制 | 待输入 | 设置 XIABI_VERIFY_DEEPSEEK=1 和 XIABI_VERIFY_REPEAT_FREE=1 后，会生成第二封信并验证重复免费领取被拒绝。 |
| 微信支付下单 | 待输入 | 设置 XIABI_VERIFY_PAYMENT_CREATE=1 后复验。 |
| 微信支付拉起审计链路 | 待输入 | 同一轮设置 XIABI_VERIFY_PAYMENT_CREATE=1、XIABI_VERIFY_ADMIN_USERNAME 和 XIABI_VERIFY_ADMIN_PASSWORD 后，会复验支付拉起尝试/结果已写入后台审计日志。 |
| 微信付款回调与权益到账 | 待输入 | 完成真实付款后设置 XIABI_VERIFY_PAID_ORDER_ID，并可设置 XIABI_VERIFY_REQUIRE_WEBHOOK=1；脚本会复验重复补发不重复加权益。 |
| 短信发送与手机号绑定 | 待输入 | 先提供后台账号运行短信供应商自检；再设置 XIABI_VERIFY_SMS_PHONE 发送验证码，收到后设置 XIABI_VERIFY_SMS_CODE 复验绑定。 |
| 短信发送审计链路 | 待输入 | 同一轮设置 XIABI_VERIFY_SMS_PHONE、XIABI_VERIFY_ADMIN_USERNAME 和 XIABI_VERIFY_ADMIN_PASSWORD 后，会复验短信发送尝试/结果已写入后台审计日志。 |
| 手机号绑定后资产归属 | 待输入 | 同一轮设置 XIABI_VERIFY_DEEPSEEK=1、XIABI_VERIFY_SMS_PHONE 和 XIABI_VERIFY_SMS_CODE，可复验绑定后信件和权益归属到手机号用户。 |
| MiniMax 说话播放 | 待输入 | 设置 XIABI_VERIFY_TTS=1 会真实调用一次 MiniMax TTS。 |
| 语音输入转写 | 待输入 | MiniMax 官方 API 总览当前未列独立 ASR 端点；拿到可用 VOICE_ASR_ENDPOINT 后，设置 XIABI_VERIFY_ASR_AUDIO=本地音频路径复验，兼容 JSON base64 和 OpenAI-compatible multipart。 |

## 最终人工验证批次

以下命令只在最终交付验收时执行。它们可能真实调用 DeepSeek、短信、微信支付、MiniMax 或 ASR 服务；不要把真实密钥写入仓库。

### 后台账号、后台控制前台与供应商前置自检

- 责任方：项目管理员
- 需要准备：后台账号、后台密码；该批次不发送短信、不创建订单，会自检短信签名/模板和微信支付证书

```powershell
$env:XIABI_VERIFY_ADMIN_USERNAME="后台账号"
$env:XIABI_VERIFY_ADMIN_PASSWORD="后台密码"
$env:XIABI_PRODUCTION_STRICT="1"
npm run verify:production:report
```

### DeepSeek 写信、权益、导出与 MiniMax 说话

- 责任方：项目验收
- 需要准备：允许消耗一次 DeepSeek 和 MiniMax TTS 调用额度

```powershell
$env:XIABI_VERIFY_DEEPSEEK="1"
$env:XIABI_VERIFY_REPEAT_FREE="1"
$env:XIABI_VERIFY_TTS="1"
npm run verify:production:report
```

### 阿里云短信与手机号绑定

- 责任方：项目管理员
- 需要准备：可接收验证码的真实手机号、短信验证码

```powershell
$env:XIABI_VERIFY_ADMIN_USERNAME="后台账号"
$env:XIABI_VERIFY_ADMIN_PASSWORD="后台密码"
$env:XIABI_VERIFY_DEEPSEEK="1"
$env:XIABI_VERIFY_SMS_PHONE="可接收验证码的手机号"
npm run verify:production:report

$env:XIABI_VERIFY_SMS_CODE="收到的6位验证码"
npm run verify:production:report
```

### 微信支付下单权限

- 责任方：微信商户平台管理员
- 需要准备：H5 支付或 JSAPI 支付产品权限

```powershell
$env:XIABI_VERIFY_ADMIN_USERNAME="后台账号"
$env:XIABI_VERIFY_ADMIN_PASSWORD="后台密码"
$env:XIABI_VERIFY_PAYMENT_CREATE="1"
$env:XIABI_VERIFY_ALLOW_EXTERNAL_BLOCKED="1"
npm run verify:production:report
```

### 微信真实付款、回调与权益到账

- 责任方：项目管理员
- 需要准备：已完成真实付款的订单 ID

```powershell
$env:XIABI_VERIFY_ADMIN_USERNAME="后台账号"
$env:XIABI_VERIFY_ADMIN_PASSWORD="后台密码"
$env:XIABI_VERIFY_PAID_ORDER_ID="已完成付款的订单ID"
$env:XIABI_VERIFY_REQUIRE_WEBHOOK="1"
npm run verify:production:report
```

### 语音输入 ASR 样本

- 责任方：语音供应商/项目管理员
- 需要准备：可用 VOICE_ASR_ENDPOINT、真实音频样本、预期关键句；微信内 H5 还需要公众号 JS 接口安全域名已配置，并在微信里按住说话确认能返回文本

```powershell
$env:XIABI_VERIFY_ASR_AUDIO="D:\path\to\sample.wav"
$env:XIABI_VERIFY_ASR_EXPECTED_TEXT="样本音频里应出现的关键句"
npm run verify:production:report
```

## 判定规则

- `npm run verify:production` 返回 `complete=true`，才表示目标进入完整真实运行状态。
- `ok=true` 只代表本次执行的检查没有失败，不代表所有外部链路都已经验收。
- MiniMax 官方当前未公开独立 ASR/STT 端点；只有拿到可用 `VOICE_ASR_ENDPOINT` 并通过真实音频样本后，才应设置 `VOICE_ASR_VERIFIED=1`。
