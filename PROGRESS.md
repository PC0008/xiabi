# PROGRESS.md

## 当前状态

时间：2026-05-27

### 项目口径

- 当前按手机端响应式 H5/Web + H5 总后台推进，部署目标是 Edgespark.dev。
- `h5/` 是当前有效开发目录；`pages/`、`cloudfunctions/` 只作历史参考。
- 用户端统一称呼“智多星”，用户端不暴露 AI、大模型、prompt、智能体等技术概念。
- 写信生成走 DeepSeek，默认模型 `deepseek-v4-pro`。
- MiniMax 当前已接入 TTS 说话接口位和克隆音色 ID；官方公开文档未确认可用 ASR 接口，因此用户端语音输入目前仍使用浏览器语音识别能力，服务端保留 MiniMax 语音处理边界。
- 微信支付、短信、语音、DeepSeek Key 都只放服务端密钥，不进入前端文件。

### 当前线上地址

- 生产地址：`https://immortal-sponge-1728.edgespark.app`
- 用户端：`https://immortal-sponge-1728.edgespark.app/index.html`
- 管理后台：`https://immortal-sponge-1728.edgespark.app/admin.html`
- 健康检查：`https://immortal-sponge-1728.edgespark.app/api/public/health`

### 本轮已完成

- 已建立本轮本地 checkpoint：`checkpoint-before-5stage-20260527-201129`。
- 用户端生成流程接入真实 `/api/public/tasks`，本地验证 DeepSeek 写信任务可成功创建信件。
- 信件读取、列表、领取已按当前会话做服务端校验，不再允许跨会话读取。
- 首次免费领取会写入 `entitlement_ledger`，并用 dedupe key 防止重复发放。
- 订单创建现在只认后台价格配置，前端不能传金额决定权益。
- 服务端订单创建会尊重后台 `payment_enabled`、`annual_enabled`、`single_enabled` 开关。
- 微信 H5 支付已接入下单位：`/v3/pay/transactions/h5`；用户端拿到 `h5_url` 后会跳转微信支付。
- 微信支付回调已做签名验签、AES-GCM 解密、订单置 paid、权益流水发放、重复回调幂等；失败回调允许同事件再次重试处理。
- 管理后台订单列表已增加“查单”补偿入口，可通过微信商户订单号主动查询支付状态；查到支付成功后会置 paid 并幂等发放权益。
- 短信已接入阿里云发送位，验证码写入 `sms_codes`，绑定手机号会校验验证码并写入 masked/hash。
- 用户端领取完整内容前加入手机号验证码绑定流程。
- 后台配置保存失败不再静默兜底；后台模板可编辑、可新增、可保存，并会进入服务端写信规则。
- 后台用户、信件、订单、权益、日志、任务列表已改为优先读取真实 API 数据。
- 用户端订单页、权益判断不再依赖本地伪造支付流水。
- 用户端运行态已移除本地伪订单/伪权益写入逻辑；设置页只保留清除本机缓存。
- 导出、反馈接口已建立：反馈写入审计日志，导出当前为服务端生成文本文件并返回下载地址。
- 已更新 `.env.example`，补充 `WECHAT_PAY_PLATFORM_PUBLIC_KEY`。

### 本轮验证

- `npm run typecheck` 通过。
- `npm run build` 通过，输出 `web/dist`。
- `npm run deploy:dry` 通过。
- `npm run deploy` 通过。
- `npm run verify:live` 通过，线上入口、配置接口和截图验收正常。
- 本地 Edgespark：`http://localhost:7776` 已启动。
- 本地 API 验证：
  - `POST /api/public/session/guest` 成功。
  - `POST /api/public/tasks` 成功创建任务和信件。
  - `GET /api/public/letters/:id` 成功读取当前会话信件。
  - `POST /api/public/letters/:id/claim` 成功领取并写入权益流水。
  - `GET /api/public/entitlements` 返回 `firstFreeUsed: true`。
  - 后台未开启支付时，`POST /api/public/orders` 返回 403，服务端开关生效。
- Playwright Chromium 已安装并完成线上截图验收：
  - 手机用户端截图：`docs/assets/verify-home-mobile.png`
  - 后台登录页截图：`docs/assets/verify-admin-login.png`
- Edgespark dry-run 通过，当前线上部署通过。

### 还没完成 / 风险

- MiniMax 官方公开文档未确认 ASR/语音转文字接口；如果必须“输入也走 MiniMax”，需要用户提供 MiniMax 对应语音识别接口文档或后台开通说明。
- 微信 H5 支付适合普通手机浏览器；如果用户在微信内打开 H5，正式付款通常还需要 JSAPI + openid 授权链路。
- 微信支付回调验签需要配置 `WECHAT_PAY_PLATFORM_PUBLIC_KEY`，否则正式回调会失败。
- 阿里云短信发送位已实现，但尚未用真实手机号发短信验证，避免产生费用。
- 导出目前不是严格 PDF 文件，而是服务端文本下载；如需正式 PDF，需要继续做 PDF/HTML 打印版方案。
- 后台还有二级详情和补偿操作可继续补强：订单详情、回调事件详情、任务重试、信件详情、用户详情。

### 下一步

1. 配置 `WECHAT_PAY_PLATFORM_PUBLIC_KEY`，并确认 H5 支付还是微信内 JSAPI 支付。
2. 用后台打开 `payment_enabled` 后，做一笔真实小额支付闭环验证：下单、跳转、回调、订单 paid、权益发放。
3. 用真实手机号验证阿里云短信发送与绑定流程。
4. 补 PDF/打印版导出和后台详情/补偿操作。
5. 完成 Edgespark dry-run、部署、线上手机端验收。
