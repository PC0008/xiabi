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
```

## 验收分级

- 基础线上验收：`npm run verify:live`，检查页面、公开配置、游客会话、反馈、订单保护、语音兜底、后台未登录保护和截图。
- 用户端流程验收：`npm run verify:journey`，用移动端视口自动点击授权、首页、通话问题和确认页，不触发付费或外部生成调用。
- 生产外部验收：`npm run verify:production`，默认只跑健康检查和公开配置；配置 verifier 环境变量后，会真实调用 DeepSeek、微信支付创建、真实已支付订单闭环、短信、MiniMax TTS 和 ASR。
- 严格生产验收：设置 `XIABI_PRODUCTION_STRICT=1` 后，任何外部链路 verifier 未配置都会失败，不再跳过。
- 生产状态报告：`npm run verify:production:report` 会刷新 `docs/production-readiness-latest.md`；其中 `ok=true` 只表示本次已执行项目没有失败，`complete=true` 才表示所有生产链路已经完整验收。

## 当前真实状态

项目已经部署到 Edgespark 生产环境，基础 API、后台配置、用户端主流程、订单/权益、微信支付接入位、短信接入位、MiniMax TTS、ASR 转发接入位和 DeepSeek 写信链路均已接入代码。写信任务创建后会通过 Edgespark 后台执行能力推进，前端轮询负责查询和兜底恢复。

完整商业闭环仍需要一次带真实外部凭据的生产联调：后台登录、真实 DeepSeek 生成、真实短信绑定、真实微信小额付款与回调、MiniMax TTS、ASR 音频样本。

## 配置入口

环境变量示例见 `.env.example`。密钥类配置只能放在 Edgespark secret 中，不要写入前端文件。

外部凭据交接清单见 `docs/生产外部凭据交接清单.md`。
