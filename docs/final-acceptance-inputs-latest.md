# 最终验收输入检查

生成时间：2026-05-28T09:26:24.924Z

## 当前报告快照

- 生产验收报告：已找到，生成时间 2026-05-28T07:26:30.953Z
- 生产结论：未完成：存在外部阻塞项，需要商户、短信或语音供应商侧配合。
- 完整可用：否
- 正式矩阵：已验证 5 / 待输入 7 / 外部阻塞 1 / 失败 0
- 交付状态清单：本轮预检稍后刷新；当前文件，生成时间 2026-05-28T08:04:51.075Z
- 无外部费用预检：本轮预检执行中，最终报告将在本清单之后写入；当前文件，生成时间 2026-05-28T09:15:47.422Z

## 本机输入准备度

- 可直接执行的最终验收批次：0/7
- 当前仍缺少的 verifier 输入：XIABI_VERIFY_ADMIN_USERNAME、XIABI_VERIFY_ADMIN_PASSWORD、XIABI_VERIFY_DEEPSEEK、XIABI_VERIFY_REPEAT_FREE、XIABI_VERIFY_TTS、XIABI_VERIFY_SMS_PHONE、XIABI_VERIFY_PAYMENT_CREATE、XIABI_VERIFY_PAID_ORDER_ID、XIABI_VERIFY_ASR_AUDIO、XIABI_VERIFY_WECHAT_VOICE

说明：本脚本只检查环境变量是否已准备，不打印任何真实账号、密码、手机号、订单号、密钥或音频路径，也不会调用外部服务。

## 分批检查

### 后台账号、后台控制前台与供应商前置自检

- 状态：未就绪
- 外部影响：不发短信、不创建订单、不调用模型
- 可验收能力：管理后台登录与运营接口、后台配置控制用户端、短信供应商无发码自检、微信支付无订单自检
- 必需输入：XIABI_VERIFY_ADMIN_USERNAME（缺少）、XIABI_VERIFY_ADMIN_PASSWORD（缺少）
- 可选输入：XIABI_PRODUCTION_STRICT（缺少）

```powershell
$env:XIABI_VERIFY_ADMIN_USERNAME="后台账号"
$env:XIABI_VERIFY_ADMIN_PASSWORD="后台密码"
$env:XIABI_PRODUCTION_STRICT="1"
npm run verify:production:report
```

### DeepSeek 写信、权益、导出与 MiniMax 说话

- 状态：未就绪
- 外部影响：会真实调用 DeepSeek 和 MiniMax TTS，可能消耗额度
- 可验收能力：DeepSeek 写信闭环、首次免费权益与导出、重复领取限制、MiniMax 说话播放
- 必需输入：XIABI_VERIFY_DEEPSEEK（缺少）、XIABI_VERIFY_REPEAT_FREE（缺少）、XIABI_VERIFY_TTS（缺少）

```powershell
$env:XIABI_VERIFY_DEEPSEEK="1"
$env:XIABI_VERIFY_REPEAT_FREE="1"
$env:XIABI_VERIFY_TTS="1"
npm run verify:production:report
```

### 真实短信发送、验证码绑定与资产归属

- 状态：未就绪
- 外部影响：会真实发送短信；收到验证码后需要第二次运行
- 可验收能力：短信发送与手机号绑定、短信发送审计链路、手机号绑定后资产归属
- 必需输入：XIABI_VERIFY_ADMIN_USERNAME（缺少）、XIABI_VERIFY_ADMIN_PASSWORD（缺少）、XIABI_VERIFY_DEEPSEEK（缺少）、XIABI_VERIFY_SMS_PHONE（缺少）
- 可选输入：XIABI_VERIFY_SMS_CODE（缺少）

```powershell
$env:XIABI_VERIFY_ADMIN_USERNAME="后台账号"
$env:XIABI_VERIFY_ADMIN_PASSWORD="后台密码"
$env:XIABI_VERIFY_DEEPSEEK="1"
$env:XIABI_VERIFY_SMS_PHONE="可接收验证码的手机号"
npm run verify:production:report

$env:XIABI_VERIFY_SMS_CODE="收到的6位验证码"
npm run verify:production:report
```

### 微信支付下单与支付审计

- 状态：未就绪
- 外部影响：会真实向微信支付创建未支付订单；当前仍依赖商户产品权限
- 可验收能力：微信支付下单、微信支付拉起审计链路
- 必需输入：XIABI_VERIFY_ADMIN_USERNAME（缺少）、XIABI_VERIFY_ADMIN_PASSWORD（缺少）、XIABI_VERIFY_PAYMENT_CREATE（缺少）
- 可选输入：XIABI_VERIFY_ALLOW_EXTERNAL_BLOCKED（缺少）

```powershell
$env:XIABI_VERIFY_ADMIN_USERNAME="后台账号"
$env:XIABI_VERIFY_ADMIN_PASSWORD="后台密码"
$env:XIABI_VERIFY_PAYMENT_CREATE="1"
$env:XIABI_VERIFY_ALLOW_EXTERNAL_BLOCKED="1"
npm run verify:production:report
```

### 真实付款、回调与权益到账

- 状态：未就绪
- 外部影响：需要先完成一笔真实小额付款；会复验回调/查单补偿和幂等发权益
- 可验收能力：微信付款回调与权益到账、重复补发不重复加权益
- 必需输入：XIABI_VERIFY_ADMIN_USERNAME（缺少）、XIABI_VERIFY_ADMIN_PASSWORD（缺少）、XIABI_VERIFY_PAID_ORDER_ID（缺少）
- 可选输入：XIABI_VERIFY_REQUIRE_WEBHOOK（缺少）

```powershell
$env:XIABI_VERIFY_ADMIN_USERNAME="后台账号"
$env:XIABI_VERIFY_ADMIN_PASSWORD="后台密码"
$env:XIABI_VERIFY_PAID_ORDER_ID="已完成付款的订单ID"
$env:XIABI_VERIFY_REQUIRE_WEBHOOK="1"
npm run verify:production:report
```

### 服务端 ASR 音频样本与手机端语音入口

- 状态：未就绪
- 外部影响：会真实调用已配置的 ASR endpoint；微信内语音还需要手机微信实测
- 可验收能力：语音输入转写、手机端按住说话服务端转写入口
- 必需输入：XIABI_VERIFY_ASR_AUDIO（缺少）
- 可选输入：XIABI_VERIFY_ASR_EXPECTED_TEXT（缺少）
- 线上/平台前置项：VOICE_ASR_ENDPOINT、VOICE_ASR_VERIFIED、VOICE_INPUT_MODE

```powershell
$env:XIABI_VERIFY_ASR_AUDIO="D:\path\to\sample.wav"
$env:XIABI_VERIFY_ASR_EXPECTED_TEXT="样本音频里应出现的关键句"
npm run verify:production:report
```

### 微信内 H5 语音 JS-SDK 人工验收

- 状态：未就绪
- 外部影响：会调用微信 access_token/jsapi_ticket 接口做签名自检；手机按住说话仍需人工确认
- 可验收能力：微信 JS-SDK 签名配置、微信内录音与 translateVoice 返回文字
- 必需输入：XIABI_VERIFY_WECHAT_VOICE（缺少）
- 可选输入：XIABI_VERIFY_WECHAT_VOICE_MANUAL（缺少）
- 线上/平台前置项：WECHAT_MP_APP_SECRET、PUBLIC_BASE_URL、微信公众平台 JS 接口安全域名

```powershell
$env:XIABI_VERIFY_WECHAT_VOICE="1"
npm run verify:production:report

# 在手机微信打开线上用户端，按住说话确认能返回真实文本并进入确认页后：
$env:XIABI_VERIFY_WECHAT_VOICE_MANUAL="1"
npm run verify:production:report
```

