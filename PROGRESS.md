# PROGRESS.md

## 当前状态

时间：2026-05-27

### 当前口径

- 当前按手机端响应式 H5/Web + H5 总后台推进，部署目标是 Edgespark.dev。
- `h5/` 是当前有效开发目录；`pages/`、`cloudfunctions/` 只作为历史参考。
- 用户端统一称呼“智多星”，用户端不暴露 AI、大模型、prompt、智能体等技术概念。
- 写信生成走 DeepSeek `deepseek-v4-pro`；语音互动、输入和智多星说话声音走 MiniMax 接入位。
- 微信支付、短信、语音、DeepSeek Key 都只能放服务端密钥，不进入前端文件。

### 当前线上地址

- 生产地址：`https://immortal-sponge-1728.edgespark.app`
- 用户端：`https://immortal-sponge-1728.edgespark.app/index.html`
- 管理后台：`https://immortal-sponge-1728.edgespark.app/admin.html`
- 健康检查：`https://immortal-sponge-1728.edgespark.app/api/public/health`

### 已完成

- 已初始化 Git，远程仓库：`https://github.com/PC0008/xiabi.git`。
- 已创建 EdgeSpark 项目 `xiabi`，`project_id = 2a5ef7af-ba13-444e-8972-d4e663f0156d`。
- 已建立 `server/` Hono API、`web/` 静态构建层、`edgespark.toml`、`configs/auth-config.yaml`。
- 已建立数据库 schema 和迁移：租户、管理员、后台配置、用户、会话、销售信、生成任务、订单、权益流水、支付回调事件、文件、短信验证码、审计日志。
- 已执行远端数据库迁移、创建 `xiabi-files` 存储桶、应用 Auth 配置。
- 已实现管理员账号密码登录、后台配置读取/保存、用户端配置读取、用户会话、写信任务、信件读取/领取、订单创建、支付回调入口。
- 已把 H5 用户端和后台接入 API 优先、本地兜底的数据层。
- 已配置微信支付 AppID/商户号、阿里云短信签名/模板、MiniMax 音色 ID、支付回调地址等运行变量。
- 已移除公开开发支付标记接口。
- 已给手机端增加按住说话输入入口；当前浏览器能力可用时会把语音转成输入文本。
- 已接入 DeepSeek 写信适配器：`/api/public/tasks` 会优先调用 DeepSeek，后台 `templates` 配置会进入写信规则。
- 已收紧用户端生成流程：服务端真实信件返回前，生成页不再允许直接领取本地兜底信件。
- 已更新 `.env.example` 和 `docs/Edgespark真实版本接入清单_v0.1.md`，补充 DeepSeek 变量和密钥。

### 本轮验证

- `npm run typecheck` 通过。
- `npm run build` 通过，输出 `web/dist`。
- 已启动 EdgeSpark `DEEPSEEK_API_KEY` 密钥配置流程，待在浏览器保存后继续 `edgespark deploy --dry-run` 和 `edgespark deploy`。

### 下一步

1. 在 EdgeSpark 密钥页面填写并保存 `DEEPSEEK_API_KEY`。
2. 执行 `edgespark deploy --dry-run`，通过后执行 `edgespark deploy`。
3. 补 MiniMax 服务端语音输入/语音合成真实接口，替换当前浏览器语音识别兜底。
4. 补微信支付真实下单、验签、回调解密、订单状态更新、权益发放。
5. 补阿里云短信发送、验证码校验、手机号 hash/masked 入库和频率限制。
6. 继续把后台用户、信件、订单、权益、日志列表从静态数组改成真实 API 数据。
