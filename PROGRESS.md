# PROGRESS.md

## 当前状态

时间：2026-05-27

### 当前最新口径

- 《下笔有元》当前按手机端响应式 H5/Web 项目推进，不再按微信小程序/CloudBase 项目推进。
- 当前部署目标改为 Edgespark.dev。
- `h5/` 是当前有效开发目录，包含用户端 H5、H5 总后台和本地预览服务。
- `pages/`、`cloudfunctions/` 以及早期 CloudBase/小程序文档只作为历史探索参考，后续开发不要默认沿用。
- 后端 API、数据库、任务、文件存储、支付回调和部署方案需要按 Web/Edgespark.dev 口径重新规划。

### 当前可运行入口

- 用户端 H5：`http://127.0.0.1:8766/h5/index.html`
- H5 总后台：`http://127.0.0.1:8766/h5/admin.html`
- 本地服务：`node h5/server.js`
- 当前核心路由：`#auth`、`#home`、`#call`、`#confirm`、`#generating`、`#letter`、`#export`、`#paywall`、`#records`、`#profile`、`#memory`、`#orders`、`#feedback`、`#settings`

### 已完成

- 已初始化本地 Git 仓库，当前主分支为 `main`，初始 checkpoint 提交为 `6c6ab19`，远程已指向 `https://github.com/PC0008/xiabi.git`。
- 已通过 EdgeSpark CLI 创建项目 `xiabi`，当前 `project_id = 2a5ef7af-ba13-444e-8972-d4e663f0156d`。
- 已新增 EdgeSpark 标准项目骨架：`edgespark.toml`、`server/`、`web/`、`configs/auth-config.yaml`。
- 已新增真实后端 Hono API：公共配置、管理员登录、后台配置、用户会话、生成任务、信件领取、订单、支付回调入口。
- 已新增 Drizzle/D1 数据库 schema 与迁移：租户、管理员、后台配置、用户、会话、销售信、生成任务、订单、权益流水、支付回调事件、文件、短信验证码、审计日志。
- 已执行 `edgespark db generate --name xiabi_core_schema`、`edgespark db check`、`edgespark db migrate`，远端数据库迁移已应用。
- 已执行 `edgespark storage apply` 创建 `xiabi-files` 存储桶。
- 已执行 `edgespark auth apply`，禁用公开注册，仅保留邮箱密码能力供平台侧需要时使用；项目后台采用自有账号密码登录接口。
- 已新增 `web/` 打包层，将当前 `h5/` 静态前后台和 `assets/` 构建到 `web/dist`，用于 EdgeSpark Web 部署。
- 已将 `h5/mock-store.js` 扩展为 API 优先、本机兜底的数据适配层；用户端会读取 `/api/public/config`，后台登录/保存会优先走服务端接口。
- 已将用户端生成动作接入 `/api/public/tasks` 和 `/api/public/letters/:id`，API 可用时会创建真实服务端任务与信件记录。
- 已新增 `.env.example` 和 `docs/Edgespark真实版本接入清单_v0.1.md`，列出正式部署前必须配置的运行变量和密钥。
- 已读取并整理原始需求文件：`下笔有元_产品后台与OEM系统详细规划.md`。
- 已生成早期开发规划：`开发实施规划_v0.1.md`。
- 已确认用户端统一称呼为“智多星”，用户端不暴露 AI、大模型、prompt、智能体等技术概念。
- 已确认一期交互为“通话感界面 + 按住说话互动”，并保留“切换打字模式”。
- 已确认用户端主视觉为“微信亲和绿”：白底、粗标题、轻插画、绿色主按钮；通话页贴近微信私人语音通话。
- 已确认通话页底部只保留三个圆形按钮：扬声器、按住说话、挂断。
- 已确认首页文案必须由总后台配置下发，前端只保留兜底文案。
- 已确认“帮谁写 / 写信目标 / 产品档案选择”调整为通话页内引导卡片，不作为强制独立页面。
- 已确认手机号不在登录页强制获取，只在生成中/领取完整内容节点引导绑定。
- 已生成并多轮修订用户端高保真审核稿、页面串联关系图和总后台 P0 UI 审核稿。
- 已暂停继续开发小程序，改为先做手机端 H5 母版验证。
- 已移除 H5 的手机壳式容器，改为真实响应式网页：手机端满屏自适应，桌面端内容居中展示。
- 已建立 H5 用户端主流程：授权、首页、通话、确认、生成、销售信详情、导出、付费、记录、我的、档案、订单、反馈、设置。
- 已建立 H5 总后台静态/mock 骨架：概览、配置、通话引导、销售信模板、价格权益、用户、销售信、订单支付、权益流水、日志审计。
- H5 总后台 mock 配置写入同源 `localStorage.xiabiAdminConfig`，用户端已读取部分配置。
- 已打通后台配置到用户端的本地闭环：首页文案、通话引导、生成页手机号策略、单封/年卡价格、PDF 导出页年卡成交入口等。
- 已补齐“保存并带走”承接页：销售信详情页点击后进入 `#export`，页面主操作是直接导出 PDF，不把年卡作为导出门槛。
- 已确认 `#export` 页年卡按钮是支付按钮，当前文案为“微信支付开通年卡 ¥2000/年”，测试阶段走 mock，正式阶段需按 Web/Edgespark.dev 支付链路重做。
- 已建立 UI 实现规则：图标、通话按钮、精致小控件如果纯 CSS/文字效果不佳，优先用 SVG 实现。
- 已补齐 H5 本地 mock 订单/权益流水：付费页和 PDF 导出页的年卡 mock 支付会写入 `h5MockOrders`、`h5MockLedger`，订单页、我的页和导出页从同一份本地状态读取权益。
- 已补齐 PDF 导出回流状态：点击导出后信件标记为已领取/已导出，记录页展示“已导出”和“刚刚导出 PDF”，避免导出动作无状态。
- 已补齐 H5 本地 mock 边界：单封解锁与年卡权益分离，支付入口关闭时不产生订单，手机号入口关闭时不再要求绑定，清除本机数据后记录/订单/我的页都有空状态。
- 已新增当前 Web/Edgespark.dev 口径文档：`docs/edgespark部署方案_v0.1.md`、`docs/Web_API与数据模型_v0.1.md`、`docs/异步任务链路_v0.1.md`、`docs/正式支付链路_v0.1.md`。
- H5 总后台价格权益页已增加独立“支付入口”开关，保存后用户端可进入支付维护态。
- 已抽出 H5 前端 mock 数据适配层：`h5/mock-store.js` 统一管理本地配置、登录态、信件、订单和权益流水，`h5/app.js` 与 `h5/admin.js` 不再散落直接读写这些业务状态。
- 已新增静态部署打包脚本：`scripts/package-edgespark-static.ps1`，可生成 `dist/edgespark-static-YYYYMMDD-HHMMSS/` 和 zip 包。
- 已生成最新静态部署包：`dist/edgespark-static-20260527-135226.zip`，包内只包含静态 H5、总后台 mock 页面和图片资源，不包含本地预览 `server.js`。
- 已细化真实后端前置文档：`docs/Web_API与数据模型_v0.1.md` 增加索引、权限和初始化配置；新增 `docs/总后台登录与权限_v0.1.md`。
- 已在部署方案中标注后台公网风险：真实后台登录完成前，建议只开放用户端，或用平台访问控制保护后台。

### 历史暂停内容

- 早期微信小程序测试号、CloudBase、云函数、CloudBase 集合创建等规划已不再作为当前开发目标。
- 早期文档中关于“小程序配置”“CloudBase 数据模型”“CloudBase API 契约”的内容需要在进入真实后端前按 Edgespark.dev 重新编写。
- `pages/` 和 `cloudfunctions/` 不再默认维护，除非后续用户明确要求回到小程序。

## 下一步

1. 由用户配置 EdgeSpark 运行变量和密钥：微信支付、短信、语音、管理员初始密码，命令见 `docs/Edgespark真实版本接入清单_v0.1.md`。
2. 配置完成后重新执行 `edgespark deploy --dry-run`，再执行 `edgespark deploy`。
3. 补齐微信支付真实实现：H5 下单参数、回调验签/解密、订单状态更新、权益流水幂等发放。
4. 补齐短信真实实现：验证码发送、校验、手机号 hash/masked 入库和频率限制。
5. 补齐语音交互真实实现：上传/转写/追问/整理任务化，并替换当前文本兜底生成逻辑。
6. 管理后台继续正式化用户、信件、订单、权益、日志列表，让静态数组改为真实 API 数据。
