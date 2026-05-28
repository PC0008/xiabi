# 下笔有元

当前项目按 H5/Web + H5 总后台 + Edgespark.dev 后端推进。用户端统一称呼为“智多星”。

## 线上地址

- 用户端：https://immortal-sponge-1728.edgespark.app/index.html
- 管理后台：https://immortal-sponge-1728.edgespark.app/admin.html
- 健康检查：https://immortal-sponge-1728.edgespark.app/api/public/health

## 常用命令

```powershell
npm run typecheck
npm run build
npm run deploy:dry
npm run deploy
npm run verify:journey
npm run verify:live
npm run verify:production
npm run verify:preflight
npm run delivery:status
```

## 验收分级

- 基础线上验收：`npm run verify:live`，检查页面、公开配置、游客会话、反馈、订单保护、语音兜底、后台未登录保护和截图。
- 用户端流程验收：`npm run verify:journey`，用移动端视口自动点击授权、首页、通话问题和确认页，不触发付费或外部生成调用。
- 生产外部验收：`npm run verify:production`，默认只跑健康检查和公开配置；配置 verifier 环境变量后，会真实调用 DeepSeek、微信支付创建、真实已支付订单闭环、短信、MiniMax TTS 和 ASR。
- 严格生产验收：设置 `XIABI_PRODUCTION_STRICT=1` 后，任何外部链路 verifier 未配置都会失败，不再跳过。
- 生产状态报告：`npm run verify:production:report` 会刷新 `docs/production-readiness-latest.md`，并输出最后人工验证批次；其中 `ok=true` 只表示本次已执行项目没有失败，`complete=true` 才表示所有生产链路已经完整验收。
- 最终无外部费用预检：`npm run verify:preflight` 会串行运行类型检查、构建、静态回归、线上巡检、移动端旅程、生产基础验收和交付状态生成，并写入 `docs/final-preflight-latest.md`；它不会主动触发 DeepSeek、短信、微信支付、MiniMax TTS 或 ASR 的真实调用。
- 最终交付状态：先用 `npm run verify:production:report` 刷新生产状态报告，再执行 `npm run delivery:status` 生成 `docs/delivery-status-latest.md`；后者不触发外部付费调用，只汇总人工验收顺序、责任方和剩余阻塞。

## 当前真实状态

项目已经部署到 Edgespark 生产环境，基础 API、后台配置、用户端主流程、订单/权益、微信支付接入位、短信接入位、MiniMax TTS、ASR 转发接入位和 DeepSeek 写信链路均已接入代码。写信任务创建后会通过 Edgespark 后台执行能力推进，前端轮询负责查询。

已在线上真实验收 DeepSeek 写信、首次免费领取、重复免费领取拦截、打印版导出和 MiniMax TTS。微信支付创建已真实请求微信支付，但当前商户号仍被微信产品权限阻塞，需要在商户平台开通 H5 支付或 JSAPI 支付后复验。完整商业闭环剩余后台账号验收、真实短信绑定、真实微信小额付款与回调、ASR 音频样本。

旧的小程序、CloudBase、mock 阶段文档仅作历史参考；当前权威口径以本 README、`PROGRESS.md`、`docs/production-readiness-latest.md`、`docs/生产验收与配置清单_v1.md` 为准。

## 配置入口

环境变量示例见 `.env.example`。密钥类配置只能放在 Edgespark secret 中，不要写入前端文件。

外部凭据交接清单见 `docs/生产外部凭据交接清单.md`。
