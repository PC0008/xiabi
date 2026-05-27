# PROGRESS.md

## 2026-05-27 至 2026-05-28 补充进度

- 已部署到 Edgespark 生产环境：`https://immortal-sponge-1728.edgespark.app`。
- 管理后台补强：用户管理页改为优先展示真实绑定用户和手机号掩码，未绑定会话作为游客会话展示；信件、任务、订单、权益、支付回调列表新增状态筛选，并由服务端查询参数真实过滤。
- 通话引导补强：后台“新增阶段”已变成真实操作，支持选中任意阶段并编辑 key、标题、问题、说明、快捷选项、必答/启用状态；保存后继续通过配置接口影响用户端通话问题。
- 系统开关补强：后台新增后端写信服务、短信绑定服务、语音服务开关；短信和语音接口已读取服务端配置，关闭后会返回明确业务错误。
- 短信安全补强：验证码发送加入同手机号 60 秒、每小时、每日限制；供应商异常会返回可识别业务错误，不再直接冒泡成不可控 500。
- 运营反馈补强：后台新增“用户反馈”菜单和 `/api/public/admin/feedback`，集中查看用户端提交的问题、建议和异常描述。
- 反馈处理闭环补强：用户反馈提交现在返回 `feedbackId`，后台反馈详情支持查看处理记录，并可标记已处理/重新打开；处理动作会写入审计事件，不额外引入迁移风险。
- 账号安全补强：后台新增“账号安全”页和 `/api/public/admin/password`，当前管理员可修改自己的密码；修改成功后会清理该账号所有后台会话并要求重新登录。
- 验收脚本补强：`verify:live` 覆盖反馈写入、后台改密码未登录保护；`verify:production` 严格模式会要求真实外部链路 verifier 输入，后台账号存在时会读取关键运营列表，短信支持 `XIABI_VERIFY_SMS_CODE` 绑定验证，MiniMax TTS 会校验返回音频资源可访问。
- 后台控制用户端验收补强：生产 verifier 提供后台账号密码时，会对当前后台配置做一次等值保存，再读取公开配置，确认后台配置写入链路真实影响用户端配置读取。
- 用户端开关闭环补强：用户端 H5 已读取公开配置里的 `system.voice_enabled`；后台关闭语音服务后，通话页会直接降级为打字模式，隐藏/阻止按住说话和切回语音入口。
- 生成入口开关闭环补强：用户端首页现在同时尊重 `home.generation_entry_enabled` 和 `system.generation_enabled`；后台关闭后端写信服务时，首页按钮会禁用且不会进入通话流程。
- 短信/导出开关闭环补强：用户端 H5 现在同时尊重 `system.sms_enabled` 和 `system.file_export_enabled`；后台关闭短信后不会继续展示可操作验证码绑定，关闭导出后用户端保留记录但不再提供打印版入口；服务端绑定手机号和导出接口也会按配置真实拒绝。
- 配置真实生效补强：后台“游客可浏览首页”、未领取说明/按钮、通话阶段必答/可跳过、付费页预览和系统开关概览已补齐到用户端真实逻辑；微信内支付授权回跳统一回到订单页，重新拉起失败订单会恢复待支付状态。
- 支付权益闭环补强：用户查单补偿、微信支付回调、后台订单查单和失败回调重处理统一走同一个“标记已支付并发放权益”的幂等服务函数，减少订单状态和权益流水分叉。
- 体验与风控补强：用户端删除未接真实后端的设置开关，记录页去掉不会命中的“信息未完成”筛选，我的档案写信项目可直接打开；语音转写接口增加文本长度、录音大小和音频格式保护。
- 写信任务补强：创建任务后使用 Edgespark `ctx.runInBackground()` 立即推进生成，前端轮询主要负责查状态；`GET /tasks/:id` 仍保留兜底恢复，避免刷新或后台执行异常时任务完全卡死。
- 用户端流程验收补强：新增 `npm run verify:journey`，用移动端浏览器自动点击授权、首页、通话问题和确认页；该验收不触发 DeepSeek、短信或支付费用。
- 生产支付闭环验收补强：`verify:production` 新增 `XIABI_VERIFY_PAID_ORDER_ID`，真实付款后可自动核对订单已支付、权益流水已生成，并可通过 `XIABI_VERIFY_REQUIRE_WEBHOOK=1` 要求存在已处理微信支付回调事件。
- MiniMax 首轮真实验收曾返回 `invalid api key`；语音接口已补强为返回 JSON 业务错误，不再让供应商错误冒泡成不可读 500。
- MiniMax TTS 兼容补强：新增 `MINIMAX_TTS_ENDPOINT`、`MINIMAX_TTS_OUTPUT_FORMAT`、`MINIMAX_TTS_MODEL` 可选项；默认按 HTTP T2A `hex` 音频返回，并自动尝试国际站、国际站加速端点和国内站端点。
- MiniMax TTS 真实验收通过：线上已配置 `MINIMAX_TTS_ENDPOINT=https://api.minimax.io/v1/t2a_v2`、`MINIMAX_TTS_OUTPUT_FORMAT=hex`、`MINIMAX_TTS_MODEL=speech-2.8-hd`，`XIABI_VERIFY_TTS=1 npm run verify:production` 返回 `audio/mp3`，traceId `06665fa1c520e487c74987a4296b424a`。
- DeepSeek 真实写信验收通过：`XIABI_VERIFY_DEEPSEEK=1 npm run verify:production` 已在线上生成任务 `9b8d26e3-7693-4fea-9bff-519a73294201` 和信件 `60ca6afd-e328-4a0b-b88f-e293a8c52848`。
- DeepSeek 二次线上验收通过：`XIABI_VERIFY_DEEPSEEK=1 npm run verify:production` 已再次生成任务 `98055e89-2479-4168-8dbe-330bc3996f3d` 和信件 `7eb8602f-ee74-4942-b86a-1ad18f4ebb78`。
- 微信支付创建验收已越过后台开关和本地配置检查，真实请求到微信支付；当前微信侧返回 `商户号该产品权限未开通，请前往商户平台>产品中心检查后重试。`，需要在微信商户平台开通 H5 支付产品或改走微信内 JSAPI 支付并补 `WECHAT_MP_APP_SECRET` 后复验。
- 微信支付回调验签补强：平台公钥不再是唯一方式；如果未配置 `WECHAT_PAY_PLATFORM_PUBLIC_KEY`，服务端会用商户号、商户证书序列号、商户私钥和 API v3 Key 调用微信 `/v3/certificates` 自动拉取平台证书验签。
- 支付默认开关调整：默认配置已改为开放支付入口；后台仍可随时关闭 `payment_enabled`，微信支付凭据不完整时仍会 fail-fast，不创建脏订单。
- 生产验收脚本补强：微信支付创建遇到“商户号产品权限未开通”时会输出结构化 `external_blocked` 和下一步处理建议，避免被误判为代码崩溃或普通 500。
- 微信内支付验收补强：`verify:live` 新增微信浏览器 UA 下单检查，确认未取得 openid 时返回 `wechat_jsapi` 授权入口和公众号 OAuth 地址，不触发真实付款。
- 用户端通话体验补强：通话页左侧“扬声器”改为真实播放控制，用户点击后由 MiniMax 朗读当前问题，再次点击可停止；默认不自动播放，避免自动验收和普通浏览器策略误触发。
- 生产验收报告补强：`verify:production` 输出新增 `readiness` 验收矩阵，按基础运行、后台、DeepSeek、微信支付、短信、MiniMax、ASR 汇总 `verified`、`pending_input`、`external_blocked` 和 `failed` 状态。
- 新增 `npm run verify:production:report`，可把生产验收矩阵写入 `docs/production-readiness-latest.md`，用于交付状态留档。
- 生产验收补强：`XIABI_VERIFY_DEEPSEEK=1` 现在不仅验证 DeepSeek 生成，还会继续验证首次免费领取、权益流水和可打印 HTML 导出。
- 生产验收补强：新增 `XIABI_VERIFY_REPEAT_FREE=1`，可在同一会话生成第二封信并验证重复首次免费领取会被 `first_free_used` 拒绝。
- 生产验收补强：`XIABI_VERIFY_PAID_ORDER_ID` 现在会在确认已支付和权益到账后，连续调用两次后台补权益，验证重复补发不会增加重复权益流水。
- 生产验收补强：同一轮设置 `XIABI_VERIFY_DEEPSEEK=1`、`XIABI_VERIFY_SMS_PHONE`、`XIABI_VERIFY_SMS_CODE` 时，会在已生成/领取信件的会话内绑定手机号，并验证信件、首次免费权益归属到绑定用户。
- 语音输入接入槽补强：服务端 `/api/public/voice/transcribe` 现在同时支持 JSON base64 和 OpenAI-compatible `/audio/transcriptions` multipart 格式，`VOICE_ASR_REQUEST_FORMAT=openai|json` 可显式指定。
- ASR 生产验收补强：`XIABI_VERIFY_ASR_EXPECTED_TEXT` 可验证音频转写结果包含预期关键句，避免只验证“返回了任意文本”。
- 前端运行时命名正式化：用户端和后台入口从 `mock-store.js` 迁移到 `store.js`，应用调用统一改为 `window.XiabiStore`，旧别名仅保留给浏览器缓存兼容。
- 运营漏洞修复：旧订单继续支付会重新读取后台支付开关，关闭支付/单封/年卡后不再拉起微信支付。
- 账号链路修复：退出登录和清除本机缓存会调用服务端会话登出接口，旧 `xiabi_session` 不再复用旧资产。
- 手机号绑定修复：线上数据库已应用 `tenant_id + phone_hash` 唯一索引，绑定并发冲突后会回查同一用户继续归属资产。
- 用户端二级页补齐：“我的档案”产品档案已支持新增、编辑、删除，并已从本机持久化升级为服务端 `product_profiles` 表真实存储。
- 管理后台补强：新增产品档案列表和详情接口，后台可以查看用户端真实保存的产品档案。
- 交付文档补强：新增根 `README.md` 和 `docs/生产外部凭据交接清单.md`，明确线上地址、常用命令、验收分级和真实外部联调所需凭据。
- 验证通过：`node --check h5/app.js`、`node --check h5/admin.js`、`node --check h5/store.js`、`node --check scripts/verify-production.mjs`、`node --check scripts/verify-live.mjs`、`npm run typecheck`、`npm run build`、`npm run check:ui`、`npm run check:bind-phone-unique`、`npm run verify:order-payment-switch`、`npm run verify:journey`（含通话主流程和服务端产品档案新增/编辑/删除）、`edgespark db check`、`edgespark db migrate`、`npm run deploy:dry`、`npm run deploy`、`npm run verify:live`、`npm run verify:production` 基础模式；线上公开配置已确认 `payment_enabled`、`annual_enabled`、`single_enabled`、`system.payment_enabled` 均为 `true`。
- 仍需真实外部验收输入：后台账号密码、微信支付产品权限或微信内 JSAPI 授权配置、真实付款环境、可接收短信手机号、ASR 音频样本。未设置这些 verifier 环境变量时，`verify:production` 会跳过真实付费/外部调用项。

## 当前状态

时间：2026-05-28

### 项目口径

- 当前按手机端响应式 H5/Web + H5 总后台推进，部署目标是 Edgespark.dev。
- `h5/` 是当前有效开发目录；`pages/`、`cloudfunctions/` 只作历史参考。
- 用户端统一称呼“智多星”，用户端不暴露 AI、大模型、prompt、智能体等技术概念。
- 写信生成走 DeepSeek，默认模型 `deepseek-v4-pro`。
- MiniMax 当前已接入 TTS 说话接口位和克隆音色 ID；官方公开文档未列出独立 ASR 接口，因此用户端语音输入优先使用浏览器语音识别，不支持时可录音提交到可配置的服务端 ASR 接入槽。
- 微信支付、短信、语音、DeepSeek Key 都只放服务端密钥，不进入前端文件。

### 当前线上地址

- 生产地址：`https://immortal-sponge-1728.edgespark.app`
- 用户端：`https://immortal-sponge-1728.edgespark.app/index.html`
- 管理后台：`https://immortal-sponge-1728.edgespark.app/admin.html`
- 健康检查：`https://immortal-sponge-1728.edgespark.app/api/public/health`

### 本轮已完成

- 已建立本轮本地 checkpoint：`checkpoint-before-5stage-20260527-201129`。
- 用户端生成流程接入真实 `/api/public/tasks`，本地验证 DeepSeek 写信任务可成功创建信件；DeepSeek 不可用时不再生成本地兜底信件，而是把任务置为 failed 并返回明确失败。
- 写信任务已从“创建时同步等待 DeepSeek”改为“创建 queued 任务、前端轮询推进任务”；`POST /api/public/tasks` 会快速返回 `taskId`，`GET /api/public/tasks/:id` 会推进 queued 或超时 running 任务并把 succeeded/failed 结果落库，刷新后仍可查询任务状态。
- 信件读取、列表、领取已按当前会话做服务端校验，不再允许跨会话读取。
- 首次免费领取会写入 `entitlement_ledger`，并限制同一会话只能使用一次首次免费，防止反复生成反复免费领取。
- 订单创建现在只认后台价格配置，前端不能传金额决定权益。
- 服务端订单创建会尊重后台 `payment_enabled`、`annual_enabled`、`single_enabled` 开关。
- 微信 H5 支付已接入下单位：`/v3/pay/transactions/h5`；用户端拿到 `h5_url` 后会跳转微信支付。
- 微信内浏览器已补 JSAPI/openid 接入位：无 openid 时返回公众号 OAuth 地址，授权回调写入 httpOnly openid cookie；有 openid 时走 `/v3/pay/transactions/jsapi` 并返回 `WeixinJSBridge` 支付参数。
- 微信支付回调已做签名验签、AES-GCM 解密、订单置 paid、权益流水发放、重复回调幂等；失败回调允许同事件再次重试处理。
- 管理后台订单列表已增加“查单”补偿入口，可通过微信商户订单号主动查询支付状态；查到支付成功后会置 paid 并幂等发放权益。
- 短信已接入阿里云发送位，验证码写入 `sms_codes`，绑定手机号会校验验证码并写入 masked/hash。
- 用户端领取完整内容前加入手机号验证码绑定流程。
- 后台配置保存失败不再静默兜底；后台模板可编辑、可新增、可保存，并会进入服务端写信规则。
- 后台用户、信件、订单、权益、日志、任务列表已改为优先读取真实 API 数据。
- 用户端订单页、权益判断不再依赖本地伪造支付流水。
- 用户端单封解锁、首次免费、年卡权益已统一进入信件完整内容判断；付费单封权益到账后可查看完整信件。
- 用户端订单页增加支付结果刷新入口，微信支付回跳后可主动刷新订单状态。
- 用户端待支付订单增加“继续支付”，可用原商户订单号重新拉起微信 H5 支付。
- 用户端记录页筛选已变成真实交互，可按全部、待领取、待解锁、已完成等状态查看。
- 用户端设置页提醒/档案开关已可交互；我的档案页不再展示硬编码样例档案，改为展示真实账号状态和真实写信项目。
- 用户端生成流程前端已兼容任务轮询：如果后续后端改成真正异步返回 taskId，前端会继续查询 `/api/public/tasks/:id`。
- 用户端按住说话不再只依赖浏览器 `SpeechRecognition`；不支持时会使用 `MediaRecorder` 录音并提交 `/api/public/voice/transcribe`，由服务端配置的 `VOICE_ASR_ENDPOINT` 转写。
- 用户端直接打开空信件/空导出页不再生成样例信，会提示先完成通话或回记录页。
- 用户端运行态已移除本地伪订单/伪权益写入逻辑；设置页只保留清除本机缓存。
- 用户端任务查询已收紧为当前会话可见，防止靠任务 ID 读取他人生成任务。
- 用户端下单会校验 `letterId` 属于当前会话；单封解锁必须关联当前会话的一封销售信。
- 微信支付回调按 `tenant_id + provider + provider_order_no` 查订单，避免跨 provider/order 误匹配。
- 用户端“我的/设置”账户状态已接入 `/api/public/session/me`，手机号绑定状态和脱敏手机号从服务端会话读取。
- 导出、反馈接口已建立：反馈写入审计日志，导出当前为服务端生成可打印 HTML 并返回下载地址；导出前会校验领取、单封或年卡权益。
- 短信发送未配置时会明确返回失败，不再写入验证码并提示“已发送”。
- 语音转写未配置时会明确返回失败，不会伪造识别文本；验收脚本已覆盖文本转写和未配置音频转写边界。
- 管理后台已新增生成任务、支付回调菜单，支持用户/信件/任务/订单/权益/回调/审计日志详情抽屉。
- 管理后台失败任务支持重试生成；已支付订单支持幂等补发权益；查单成功即使订单原本已 paid 也会补齐权益流水。
- 后台会记录管理员登录失败审计，便于排查暴力尝试和账号问题。
- 后台表格默认转义真实数据，降低存储型 XSS 风险；后台配置保存增加服务端校验，价格、引导阶段和模板不能写入明显破坏用户端的数据。
- 已更新 `.env.example`，补充 `WECHAT_PAY_PLATFORM_PUBLIC_KEY`。
- 后台已新增“系统自检”页和 `/api/public/admin/diagnostics` 接口，可检查 DeepSeek、微信支付、短信、MiniMax 说话、语音转写、管理员安全和公网运行地址的配置状态；接口只返回是否已配置，不返回任何密钥内容。
- 支付下单已改为 fail-fast：微信支付、回调验签或回调解密配置不完整时，服务端直接返回 `wechat_pay_not_configured`，不会创建“待支付”脏订单，也不会让用户端误以为可以继续付款。
- 用户端订单页已识别 `payment_failed`，显示“支付未完成”并提供“重新支付”入口；后台概览也会把支付未完成订单列为待处理项。
- 短信验证码已增加错码次数控制：同一验证码连续错误会累加 `attempts`，达到上限后锁定并要求重新获取，避免无限撞码。
- 新增 `npm run verify:production` 强验收脚本：可按环境变量显式触发后台自检严格校验、DeepSeek 真实生成、微信 H5 下单拉起、阿里云短信发送、MiniMax TTS 和服务端 ASR 转写验证；默认不主动触发会产生费用的外部调用。
- `WECHAT_PAY_PLATFORM_PUBLIC_KEY`、`WECHAT_PAY_PLATFORM_CERT_SERIAL_NO`、`VOICE_ASR_*` 继续作为可选生产接入槽读取，避免 Edgespark 把未配置的可选项判定为部署必填；是否缺项由后台系统自检和 `verify:production` 严格模式判断。
- `POST /api/public/session/logout` 已上线，登出会把当前会话标记为 `logged_out` 并清除 HTTP-only cookie；`/session/guest` 和 `/session/me` 只复用 active 会话。
- 旧订单续付已接入后台价格/支付开关校验；`npm run verify:order-payment-switch` 覆盖继续支付不会绕过后台关闭状态。
- `users_tenant_phone_hash_idx` 唯一索引已完成线上迁移，`npm run check:bind-phone-unique` 覆盖租户内手机号唯一和冲突后回查逻辑。
- 用户端“我的档案”已改为可操作产品档案，不再显示“未开放编辑”的占位状态；档案现在写入服务端 `product_profiles` 表，手机号绑定后会归属到绑定用户。
- 后台已新增产品档案列表与详情，便于运营查看用户保存的真实产品信息。

### 本轮验证

- `npm run typecheck` 通过。
- `npm run build` 通过，输出 `web/dist`。
- `npm run deploy:dry` 通过。
- `npm run deploy` 通过。
- `npm run verify:live` 通过，线上入口、`store.js` 静态资源、配置接口、会话隔离、无信件下单限制和截图验收正常。
- `npm run verify:production` 基础模式通过，已验证线上健康接口、公开配置、session logout 和产品档案 CRUD；真实短信、真实支付、真实 TTS/ASR、真实 DeepSeek 调用需显式设置对应环境变量后再执行。
- `XIABI_VERIFY_DEEPSEEK=1`、`XIABI_VERIFY_REPEAT_FREE=1`、`XIABI_VERIFY_TTS=1`、`XIABI_VERIFY_PAYMENT_CREATE=1` 的生产报告已刷新：DeepSeek、首次免费权益/导出、重复领取限制、MiniMax TTS、产品档案 CRUD 均通过；微信支付下单仍被商户产品权限外部阻塞。
- 本地 Edgespark：`http://localhost:7775` 已启动并通过健康检查。
- `node --check h5/app.js`、`node --check h5/admin.js` 通过。
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
- 线上接口补充验证：
  - 无会话访问 `GET /api/public/tasks/not-a-task` 返回 401。
  - 有会话访问不存在任务返回 404。
  - 没有关联当前会话销售信时创建单封订单返回 403。

### 还没完成 / 风险

- MiniMax 官方公开文档未列出独立 ASR/语音转文字接口；如果必须“输入也走 MiniMax”，需要用户提供 MiniMax 对应语音识别接口文档或后台开通说明，或配置可用的 `VOICE_ASR_ENDPOINT`。
- 微信 H5 支付适合普通手机浏览器，但当前商户号的 H5 支付产品权限未开通；如果用户在微信内打开 H5，正式付款需要 JSAPI + openid 授权链路和 `WECHAT_MP_APP_SECRET`。
- 微信支付回调验签已支持自动拉取平台证书；如果商户证书/API v3 Key 无效，正式回调仍会失败。
- 阿里云短信发送位已实现，但尚未用真实手机号发短信验证，避免产生费用。
- 导出目前不是二进制 PDF 文件，而是服务端可打印 HTML；用户可以在浏览器内保存为 PDF，如需服务端直接生成 PDF 还要继续接 PDF 渲染能力。
- 后台还有更细的筛选、分页、账户权限和审计 diff 可继续补强。

### 下一步

1. 确认 H5 支付还是微信内 JSAPI 支付；微信内 JSAPI 需要补 `WECHAT_MP_APP_SECRET`。
2. 做一笔真实小额支付闭环验证：下单、跳转、回调、订单 paid、权益发放。
3. 用真实手机号验证阿里云短信发送与绑定流程。
4. 补服务端直出 PDF、后台筛选分页/角色权限/审计 diff。
5. 如果用户坚持语音输入也必须走 MiniMax，需要 MiniMax ASR/转写接口文档或已开通能力说明。
