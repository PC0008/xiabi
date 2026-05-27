# 生产验收状态报告

生成时间：2026-05-27T23:14:23.596Z
线上地址：https://immortal-sponge-1728.edgespark.app
整体结果：基础通过：仍有真实外部链路等待输入或付费验收。
完整可用：否

## 汇总

- 已验证：1
- 待输入：10
- 外部阻塞：0
- 失败：0

## 验收矩阵

| 能力 | 状态 | 证据 | 下一步 |
| --- | --- | --- | --- |
| 线上基础运行 | 已验证 | health, public config, session logout, product profile crud |  |
| 管理后台登录与运营接口 | 待输入 | admin diagnostics, admin read operations, admin config propagation, admin config audit diff | 设置 XIABI_VERIFY_ADMIN_USERNAME / XIABI_VERIFY_ADMIN_PASSWORD 后复验。 |
| DeepSeek 写信闭环 | 待输入 | deepseek generation | 设置 XIABI_VERIFY_DEEPSEEK=1 会真实消耗一次生成额度。 |
| 首次免费权益与导出 | 待输入 | first free entitlement and export | 设置 XIABI_VERIFY_DEEPSEEK=1 后会在同一会话内验证领取、权益流水和打印版导出。 |
| 首次免费重复领取限制 | 待输入 | first free repeat guard | 设置 XIABI_VERIFY_DEEPSEEK=1 和 XIABI_VERIFY_REPEAT_FREE=1 后，会生成第二封信并验证重复免费领取被拒绝。 |
| 微信支付下单 | 待输入 | wechat payment create | 设置 XIABI_VERIFY_PAYMENT_CREATE=1 后复验。 |
| 微信付款回调与权益到账 | 待输入 | wechat paid order closure, paid entitlement idempotency | 完成真实付款后设置 XIABI_VERIFY_PAID_ORDER_ID，并可设置 XIABI_VERIFY_REQUIRE_WEBHOOK=1；脚本会复验重复补发不重复加权益。 |
| 短信发送与手机号绑定 | 待输入 | sms send, sms bind | 设置 XIABI_VERIFY_SMS_PHONE 发送验证码；收到后设置 XIABI_VERIFY_SMS_CODE 复验绑定。 |
| 手机号绑定后资产归属 | 待输入 | sms ownership propagation | 同一轮设置 XIABI_VERIFY_DEEPSEEK=1、XIABI_VERIFY_SMS_PHONE 和 XIABI_VERIFY_SMS_CODE，可复验绑定后信件和权益归属到手机号用户。 |
| MiniMax 说话播放 | 待输入 | minimax tts | 设置 XIABI_VERIFY_TTS=1 会真实调用一次 MiniMax TTS。 |
| 语音输入转写 | 待输入 | voice asr | MiniMax 官方 API 总览当前未列独立 ASR 端点；拿到可用 VOICE_ASR_ENDPOINT 后，设置 XIABI_VERIFY_ASR_AUDIO=本地音频路径复验，兼容 JSON base64 和 OpenAI-compatible multipart。 |

## 原始检查项

- health: ok
- public config: ok
- session logout: ok
- product profile crud: ok
- admin diagnostics: skipped；set XIABI_VERIFY_ADMIN_USERNAME and XIABI_VERIFY_ADMIN_PASSWORD
- admin config propagation: skipped；set XIABI_VERIFY_ADMIN_USERNAME and XIABI_VERIFY_ADMIN_PASSWORD to verify admin config controls public config
- admin config audit diff: skipped；set XIABI_VERIFY_ADMIN_USERNAME and XIABI_VERIFY_ADMIN_PASSWORD to verify config update audit details
- deepseek generation: skipped；set XIABI_VERIFY_DEEPSEEK=1 to run a real generation
- first free entitlement and export: skipped；set XIABI_VERIFY_DEEPSEEK=1 to verify first free entitlement and export
- first free repeat guard: skipped；set XIABI_VERIFY_DEEPSEEK=1 and XIABI_VERIFY_REPEAT_FREE=1 to verify repeat guard
- sms ownership propagation: skipped；set XIABI_VERIFY_DEEPSEEK=1 with SMS bind verification to check ownership propagation
- wechat payment create: skipped；set XIABI_VERIFY_PAYMENT_CREATE=1 to create a real unpaid WeChat H5 order
- wechat paid order closure: skipped；set XIABI_VERIFY_PAID_ORDER_ID after completing a real payment
- paid entitlement idempotency: skipped；set XIABI_VERIFY_PAID_ORDER_ID to verify repeated entitlement repair is idempotent
- sms send: skipped；set XIABI_VERIFY_SMS_PHONE to send a real SMS code
- minimax tts: skipped；set XIABI_VERIFY_TTS=1 to call MiniMax TTS
- voice asr: skipped；set XIABI_VERIFY_ASR_AUDIO to an audio file path after configuring a real VOICE_ASR_ENDPOINT
