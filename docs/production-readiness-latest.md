# 生产验收状态报告

生成时间：2026-05-27T20:20:20.605Z
线上地址：https://immortal-sponge-1728.edgespark.app
整体结果：未完全通过

## 汇总

- 已验证：5
- 待输入：5
- 外部阻塞：1
- 失败：0

## 验收矩阵

| 能力 | 状态 | 证据 | 下一步 |
| --- | --- | --- | --- |
| 线上基础运行 | 已验证 | health, public config, session logout, product profile crud |  |
| 管理后台登录与运营接口 | 待输入 | admin diagnostics, admin read operations, admin config propagation | 设置 XIABI_VERIFY_ADMIN_USERNAME / XIABI_VERIFY_ADMIN_PASSWORD 后复验。 |
| DeepSeek 写信闭环 | 已验证 | deepseek generation | 设置 XIABI_VERIFY_DEEPSEEK=1 会真实消耗一次生成额度。 |
| 首次免费权益与导出 | 已验证 | first free entitlement and export | 设置 XIABI_VERIFY_DEEPSEEK=1 后会在同一会话内验证领取、权益流水和打印版导出。 |
| 首次免费重复领取限制 | 已验证 | first free repeat guard | 设置 XIABI_VERIFY_DEEPSEEK=1 和 XIABI_VERIFY_REPEAT_FREE=1 后，会生成第二封信并验证重复免费领取被拒绝。 |
| 微信支付下单 | 外部阻塞 | wechat payment create | 在微信商户平台产品中心开通 H5 支付，或补齐公众号网页授权后改用微信内 JSAPI 支付。 |
| 微信付款回调与权益到账 | 待输入 | wechat paid order closure, paid entitlement idempotency | 完成真实付款后设置 XIABI_VERIFY_PAID_ORDER_ID，并可设置 XIABI_VERIFY_REQUIRE_WEBHOOK=1；脚本会复验重复补发不重复加权益。 |
| 短信发送与手机号绑定 | 待输入 | sms send, sms bind | 设置 XIABI_VERIFY_SMS_PHONE 发送验证码；收到后设置 XIABI_VERIFY_SMS_CODE 复验绑定。 |
| 手机号绑定后资产归属 | 待输入 | sms ownership propagation | 同一轮设置 XIABI_VERIFY_DEEPSEEK=1、XIABI_VERIFY_SMS_PHONE 和 XIABI_VERIFY_SMS_CODE，可复验绑定后信件和权益归属到手机号用户。 |
| MiniMax 说话播放 | 已验证 | minimax tts | 设置 XIABI_VERIFY_TTS=1 会真实调用一次 MiniMax TTS。 |
| 语音输入转写 | 待输入 | voice asr | 配置 VOICE_ASR_ENDPOINT 后，设置 XIABI_VERIFY_ASR_AUDIO=本地音频路径复验；兼容 JSON base64 和 OpenAI-compatible multipart。 |

## 原始检查项

- health: ok
- public config: ok
- session logout: ok
- product profile crud: ok
- admin diagnostics: skipped；set XIABI_VERIFY_ADMIN_USERNAME and XIABI_VERIFY_ADMIN_PASSWORD
- admin config propagation: skipped；set XIABI_VERIFY_ADMIN_USERNAME and XIABI_VERIFY_ADMIN_PASSWORD to verify admin config controls public config
- deepseek generation: ok
- first free entitlement and export: ok
- first free repeat guard: ok
- wechat payment create: external_blocked；/api/public/orders failed: 502 商户号该产品权限未开通，请前往商户平台>产品中心检查后重试。
- wechat paid order closure: skipped；set XIABI_VERIFY_PAID_ORDER_ID after completing a real payment
- paid entitlement idempotency: skipped；set XIABI_VERIFY_PAID_ORDER_ID to verify repeated entitlement repair is idempotent
- sms send: skipped；set XIABI_VERIFY_SMS_PHONE to send a real SMS code
- sms ownership propagation: skipped；set XIABI_VERIFY_SMS_PHONE, XIABI_VERIFY_SMS_CODE, and XIABI_VERIFY_DEEPSEEK=1 to verify ownership propagation
- minimax tts: ok
- voice asr: skipped；set XIABI_VERIFY_ASR_AUDIO to an audio file path
