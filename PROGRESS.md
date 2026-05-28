# PROGRESS.md

- 用户端反馈提交后状态收口：反馈提交成功会保留成功提示，但清空输入框并恢复默认分类，减少用户重复提交同一条内容的误操作；旅程验收已覆盖提交后输入清空。
- 用户端反馈分类补强：帮助反馈页的快捷标签现在会作为真实 `category` 提交到后端，而不是只塞进文本框；已增加选中态和移动端旅程验收，后台审计日志里的反馈分类更便于运营处理。
- 用户端合规入口补强：登录页《用户协议》《隐私政策》不再只是文字，已补成可打开二级页；设置页同步增加协议/隐私入口，移动端旅程验收新增用例覆盖登录入口和设置入口跳转。
- 交付验收报告补强：`verify:production:report` 现在会在 `docs/production-readiness-latest.md` 里自动生成“最终人工验证批次”，逐批列出后台账号、DeepSeek/权益/导出、短信绑定、微信下单、微信真实付款回调、ASR 音频样本需要设置的环境变量和执行命令，避免最后交付时只靠口头清单。
- 信件实际使用补强：已领取完整销售信的详情页新增“复制全文”，会复制标题、场景和全部正文，方便直接粘贴到微信或客户私聊；移动端旅程验收新增用例覆盖复制按钮与剪贴板内容。
- 导出体验补强：同一次信件导出现在会同时生成可打印 HTML 和 UTF-8 文本版 `.txt`，用户端导出页新增“下载文本版”，后台文件流水也会记录 `letter_plain_text`；生产验收会校验文本版下载地址、内容和手机号绑定后的文件归属迁移。
- MiniMax ASR 官方口径复核：2026-05-28 再次读取 MiniMax 官方文档索引 `https://platform.minimax.io/docs/llms.txt`，Speech API 仍只列 T2A HTTP/WebSocket/Async、Voice Cloning、Voice Design、Voice Management，未列 ASR/STT/Transcription；交付文档已补充来源说明，项目继续保留服务端 ASR 接入槽，不硬编码未公开 MiniMax 转写 URL。
- 生产验收报告证据留存补强：`verify:production:report` 现在会输出“历史联调证据”区，保留此前 DeepSeek、首次免费/导出、MiniMax TTS、微信支付权限阻塞等真实联调痕迹；基础巡检不会再把这些证据从交付报告里冲掉，同时报告仍明确这些历史记录不能替代最终当前配置复验。
- 生产验收脚本补强：`verify:production` 在提供 owner 后台账号时，会真实创建临时只读运营账号，验证登录、重置密码、旧会话失效、旧密码失效、停用账号、新会话失效和停用后不能登录，并把 `admin account controls` 纳入管理后台验收矩阵。
- 管理后台账号收口补强：owner 现在可以在“管理员账号”页停用/启用只读运营账号、重置只读账号密码；停用或重置后服务端会清理该账号已有后台会话，避免人员变动或密码泄露后旧登录态继续可用。owner 账号本身在该入口受保护，不能被误停用。
- 管理后台账号管理闭环：新增 owner-only 后台账号创建接口和“管理员账号”页面；owner 可创建只读运营账号，账号列表展示角色、状态、最近登录和创建时间；只读账号不能创建账号或执行高风险操作。`check:admin-permissions`、`check:ui` 和 `verify:production` 已把该路由纳入回归检查。

- 手机号绑定资产迁移补强：绑定手机号时，用户、会话、信件、产品档案、生成任务、订单、权益、短信验证码状态以及已导出文件归属现在会以批量数据库操作迁移，减少绑定成功但资产仍散落在游客会话里的半成功状态。
- 真实外部链路验收推进：已在线上真实跑通 DeepSeek 写信、首次免费领取、首次免费并发重复领取拦截、打印版导出和 MiniMax TTS 播放；本轮证据包括任务 `65a53858-8161-4155-b0c6-540e1f5be6bf`、信件 `335a8214-390a-4e36-8c0a-90a2b8602d3c`、权益 `dca2468b-c62a-4cc2-aa36-77ba2cd787e6`、MiniMax trace `0666bc40269e60eb0abb22ec7ca4ec58`。微信下单也已真实请求微信支付，但当前仍返回商户产品权限外部阻塞，需要在微信支付商户平台开通 H5 支付或 JSAPI 支付后复验。
- 线上会话回归补强：`verify:live` 新增登出后旧 cookie 回归，覆盖写信、短信、手机号绑定、语音播放/转写、订单创建、反馈和微信授权入口，确认这些会消耗资源或写数据的接口在会话失效后统一返回 `missing_session`。
- 支付权益一致性补强：微信支付回调、用户侧查单补偿、后台查单补偿统一使用批量数据库操作，把订单置为 `paid` 与订单权益流水写入放进同一批执行；订单权益补发函数内部也会拒绝非 paid 订单，降低“订单未支付但权益已激活”的风险。
- 公开会话安全补强：新增服务端 active session 统一校验，写信、短信、手机号绑定、语音播放/转写、微信授权、反馈等公开入口会拒绝已登出或失效会话；信件、权益、导出和订单读取也按 active 会话过滤，避免旧 cookie 继续消耗三方服务或访问资产。
- 生产闭环防重补强：公开任务轮询不再触发写信执行，避免用户端刷新/轮询在 running 恢复场景重复调用 DeepSeek；后台和回调侧支付校验兼容单独的 `WECHAT_MP_APP_ID`，微信内 JSAPI 支付不再被公众号 AppID 与支付 AppID 口径差异卡住；新短信验证码发送成功后会作废旧 pending 码，语音接口也不再向用户暴露供应商原始错误。
- 用户端语音互动补强：通话页在 MiniMax TTS 已配置且语音服务开启时，会在进入通话和切换到下一题后自动播放智多星当前问题，保留扬声器手动重播；`verify:journey` 新增用例拦截 `/api/public/voice/speak`，确认用户端真实调用说话接口，而不是只展示静态问题。
- 后台导出文件核查补强：后台信件详情现在会为导出文件生成 15 分钟临时下载链接，并在详情抽屉内提供“打开”入口；运营可以直接核查用户端打印版文件，不再只能看到文件流水却无法查看导出内容。
- 后台高风险操作权限补强：保留现有 `owner` 管理员口径，新增 owner-only 服务端校验；后台配置保存、失败任务重试、微信查单补偿、已支付订单补权益和支付回调重处理都必须由 `owner` 执行，非 owner 后台账号只能读取和处理低风险信息，用户端配置、订单权益和支付回调不再默认对所有后台角色开放。
- 短信供应商错误收口：阿里云短信发送失败不再把签名、模板、产品开通等供应商原始报错直接暴露给用户；服务端统一返回正式用户提示，生产验收在真实手机号发送失败且属于配置/审核侧问题时标为 `external_blocked`，下一步指向短信签名、模板、AccessKey 和产品开通状态复核。
- 支付失败用户侧闭环补强：用户端现在会保留服务端业务错误码；微信支付产品权限未开通等外部阻塞不再直接展示商户侧技术报错，而是清理待继续支付意图、跳转订单记录页，并提示“微信支付暂时还没有开通完成”，避免用户反复点击继续支付卡在同一失败状态；`verify:journey` 已新增手机端用例覆盖该链路。
- 微信支付外部阻塞识别补强：微信下单返回 `NO_AUTH`、商户无权限或产品权限未开通时，服务端会把订单标记为 `payment_failed` 并返回结构化错误 `wechat_pay_external_blocked`，生产验收据此标为 `external_blocked`，不再靠供应商中文报错字符串猜测。

- 打印版导出正式化：服务端导出不再为没有正文的信件生成空白文件，返回 `letter_not_ready`；导出结果补充 `contentType` 和安全文件名，用户端内部动作从 `export-pdf` 改为 `export-print`，避免把当前可打印 HTML 误标成服务端直出 PDF。
- 导出文件流水幂等补强：重复导出同一封信时，服务端现在会 upsert 文件记录并刷新 `userId`、`letterId`、`kind` 和 `status`，避免旧的游客导出流水在后续绑定手机号或重新导出后仍保留过期归属；`check:ui` 已加入回归标记。

- MiniMax ASR 口径复核：已重新核对 MiniMax 官方 API Overview，Speech 目录仍只公开列出 T2A、T2A Async、Voice Cloning、Voice Design、Voice Management，未列独立 ASR/语音转文字端点；新增 `docs/minimax-asr-status-2026-05-28.md` 作为交付说明，项目继续保留可配置 ASR 接入槽，不臆造 MiniMax 转写 URL。

- 生产验收补强：`verify:production` 在提供后台账号密码时，会在保存配置后检查最近的 `config.update` 审计日志是否包含 `changedCount`、`truncated` 和 `changes` 字段，防止后台控制链路只验保存、不验可追溯。

- 后台审计详情补强：日志审计详情页不再只展示原始 JSON；配置变更会以“字段 / 修改前 / 修改后”的表格展示，同时保留原始详情，运营可以直接看懂后台改动。

- 后台配置审计补强：`config.update` 审计日志现在会记录字段级变更摘要，包括变更路径、修改前后值、变更数量和截断状态；后台修改首页文案、价格、通话引导、模板和系统开关时，不再只留下 scope 名称，便于上线后追查“谁改了什么”。

- 产品档案写入风控补强：公开产品档案接口不再静默截断超长内容，字段超限会返回 `profile_too_long`；同一会话/用户最多保留 20 个活跃产品档案，超出返回 `too_many_profiles`；用户端输入框同步加长度限制，`verify:live` 已覆盖超长档案拒绝。
- 后台登录输入边界补强：管理员登录账号限制 64 字符、密码限制 256 字符，超限会在哈希和审计写入前返回 `admin_credentials_too_long`；后台登录/改密表单同步加 `maxlength`，`verify:live` 已覆盖超长账号返回 413。
- 后台登录风控补强：管理员登录新增同账号 15 分钟失败次数限制，连续失败达到阈值后返回 `admin_login_rate_limited`，并写入审计日志；`verify:live` 已加入独立用户名的 401→429 在线回归，不需要真实后台账号即可证明暴力尝试保护生效。
- 本地权限残留清理：用户端不再把 `h5PhoneBound` / `h5AnnualActive` 当作当前状态 key 定义或从本地恢复；这两个旧 key 只作为 legacy 清理项保留，手机号绑定和年卡权益继续只以服务端 `/session/me` 与 `/entitlements` 为准，`check:ui` 已加入回归检查。
- 线上 store 假口径清理：`h5/store.js` 不再把正式运行时对象暴露成 `window.XiabiMockStore`；`check:ui` 和 `verify:live` 已加入回归检查，确保生产静态资源只暴露 `window.XiabiStore`。
- 生产验收报告口径补强：`verify:production` 报告新增 `complete`、`overallStatus` 和 `completion.summary`；`ok=true` 只代表本次已执行检查没有失败，`complete=true` 才代表所有生产链路均已验收，避免把“基础通过但仍待外部输入”误判为完整交付。
- 用户端运行时命名正式化：`h5/app.js` 已移除旧的 `adminMockConfig` / `readAdminMockConfig` 命名，改为 `runtimeConfig` / `readRuntimeConfig`；`check:ui` 已加入回归检查，避免用户端真实运行代码再次残留 mock 命名造成验收和维护误判。
- 语音转写接入位兼容性补强：MiniMax 官方文档索引目前仍未列出独立 Speech-to-Text/ASR 端点，项目不臆造 MiniMax 转写 URL；服务端通用 ASR 解析已扩展支持纯文本、`asr_text`、`data.result.text`、`segments`、`utterances` 和 OpenAI-compatible `choices` 等常见返回结构，拿到真实 endpoint 后只需配置并跑样本验收。
- 公开写信入口风控补强：`POST /api/public/tasks` 现在会在进入 DeepSeek 队列前拦截超长回答、超多问题、过大的任务输入，并限制同一会话每小时最多创建 6 个写信任务；`verify:live` 已加入不触发真实生成费用的超限验收。
- 语音输入真实可用口径收紧：公开配置新增 `capabilities.voice.asrVerified`，用户端服务端录音转写只在 `VOICE_ASR_VERIFIED=1` 后视为可用；浏览器语音启动失败时，如果服务端 ASR 已验证，会自动退到录音上传识别，减少手机/微信环境“按了但不能说”的假体验。
- 用户端配置竞态补强：点击“开始通话”前会强制同步一次公开配置，再按最新的后台开关决定是否进入通话；`verify:journey` 已覆盖“首次加载允许生成、点击前后台关闭生成”的场景，避免用户端按旧配置进入流程。
- 用户输入真实性补强：跳过问题或空回答不再注入示例业务答案，确认页和 DeepSeek 输入会标记为“未补充”，避免系统替用户编造产品、客户或成交目标。
- 写信数据契约补强：用户端生成任务会随答案一起提交当时的通话问题标题和说明，DeepSeek 组装 brief 时优先使用真实问题上下文，避免后台修改通话引导后后端仍按固定旧标签误读答案。

## 2026-05-27 至 2026-05-28 补充进度

- 已部署到 Edgespark 生产环境：`https://immortal-sponge-1728.edgespark.app`。
- 管理后台补强：用户管理页改为优先展示真实绑定用户和手机号掩码，未绑定会话作为游客会话展示；信件、任务、订单、权益、支付回调列表新增状态筛选，并由服务端查询参数真实过滤。
- 管理后台分页补强：用户、产品档案、销售信、生成任务、订单、权益、支付回调、反馈和审计日志列表已支持 `page` / `limit` 分页，前端表格提供上一页/下一页，不再只截取前 100 条；空数据也不再回退展示示例数据。
- 已绑定用户领取补强：用户端生成完成后会识别已绑定手机号的会话，不再要求重复绑定；已绑定用户可直接领取完整销售信，避免老用户在领取节点被卡住。
- 用户端失败状态补强：生成失败会保留服务端返回的业务原因；记录、订单、我的和档案页在账号/资产同步失败时会显示明确提示，不再把网络或会话异常伪装成空数据。
- 通话页长内容补强：通话页允许纵向滚动，后台配置较长问题或快捷选项时不会被固定底部按钮遮住。
- 导出文件归属补强：打印版导出文件会写入当前用户归属，手机号绑定时会把同会话历史信件对应的导出文件同步迁移到绑定用户；生产验收在提供后台账号时会核对导出文件归属。
- 后台任务重试补强：失败任务重试会尊重后台写信入口开关，并用任务状态锁避免管理员双击或并发操作重复触发 DeepSeek、生成多封信。
- 支付成功判定补强：用户查单补偿、微信支付回调和后台回调重处理都必须完整匹配订单号、交易号、AppID、商户号、金额和币种后才会置 paid 并发放权益。
- 首次免费并发防护补强：首免权益改为用户/会话级唯一锁，同一会话或绑定用户并发领取两封信时，数据库唯一键会保证只有一封成功；生产验收的重复首免检查已改为并发双领取验证。
- 通话引导补强：后台“新增阶段”已变成真实操作，支持选中任意阶段并编辑 key、标题、问题、说明、快捷选项、必答/启用状态；保存后继续通过配置接口影响用户端通话问题。
- 系统开关补强：后台新增后端写信服务、短信绑定服务、语音服务开关；短信和语音接口已读取服务端配置，关闭后会返回明确业务错误。
- 短信安全补强：验证码发送加入同手机号 60 秒、每小时、每日限制；供应商异常会返回可识别业务错误，不再直接冒泡成不可控 500。
- 运营反馈补强：后台新增“用户反馈”菜单和 `/api/public/admin/feedback`，集中查看用户端提交的问题、建议和异常描述。
- 反馈处理闭环补强：用户反馈提交现在返回 `feedbackId`，后台反馈详情支持查看处理记录，并可标记已处理/重新打开；处理动作会写入审计事件，不额外引入迁移风险。
- 反馈写入风控补强：用户反馈新增 2000 字内容上限、80 字分类上限和同会话每小时 12 次限制，避免公开反馈入口被超长文本或高频提交撑爆后台审计表。
- 账号安全补强：后台新增“账号安全”页和 `/api/public/admin/password`，当前管理员可修改自己的密码；修改成功后会清理该账号所有后台会话并要求重新登录。
- 验收脚本补强：`verify:live` 覆盖反馈写入、后台改密码未登录保护；`verify:production` 严格模式会要求真实外部链路 verifier 输入，后台账号存在时会读取关键运营列表，短信支持 `XIABI_VERIFY_SMS_CODE` 绑定验证，MiniMax TTS 会校验返回音频资源可访问。
- 后台控制用户端验收补强：生产 verifier 提供后台账号密码时，会对当前后台配置做一次等值保存，再读取公开配置，确认后台配置写入链路真实影响用户端配置读取。
- 用户端开关闭环补强：用户端 H5 已读取公开配置里的 `system.voice_enabled`；后台关闭语音服务后，通话页会直接降级为打字模式，隐藏/阻止按住说话和切回语音入口。
- 生成入口开关闭环补强：用户端首页现在同时尊重 `home.generation_entry_enabled` 和 `system.generation_enabled`；后台关闭后端写信服务时，首页按钮会禁用且不会进入通话流程。
- 短信/导出开关闭环补强：用户端 H5 现在同时尊重 `system.sms_enabled` 和 `system.file_export_enabled`；后台关闭短信后不会继续展示可操作验证码绑定，关闭导出后用户端保留记录但不再提供打印版入口；服务端绑定手机号和导出接口也会按配置真实拒绝。
- 配置真实生效补强：后台“游客可浏览首页”、未领取说明/按钮、通话阶段必答/可跳过、付费页预览和系统开关概览已补齐到用户端真实逻辑；微信内支付授权回跳统一回到订单页，重新拉起失败订单会恢复待支付状态。
- 支付权益闭环补强：用户查单补偿、微信支付回调、后台订单查单和失败回调重处理统一走同一个“标记已支付并发放权益”的幂等服务函数，减少订单状态和权益流水分叉。
- 首次免费领取补强：领取接口改为先幂等写入 `first_free_letter` 权益流水，再标记信件已领取；如果权益写入失败会返回 JSON 业务错误，避免出现“信件已领取但权益流水缺失”的半完成状态和裸 500。
- 体验与风控补强：用户端删除未接真实后端的设置开关，记录页去掉不会命中的“信息未完成”筛选，我的档案写信项目可直接打开；语音转写接口增加文本长度、录音大小和音频格式保护。
- 写信任务补强：创建任务后使用 Edgespark `ctx.runInBackground()` 立即推进生成，前端轮询主要负责查状态；`GET /tasks/:id` 仍保留兜底恢复，避免刷新或后台执行异常时任务完全卡死。
- 写信任务调度口径补强：任务创建接口现在返回正式的 `edgespark-background` 队列元数据，不再保留 `db-polling-placeholder` 这种临时标识。
- 后台反馈处理补强：反馈详情内新增正式备注输入区，处理/重开反馈不再依赖浏览器原生 `prompt()`，备注继续写入真实处理记录。
- 用户端权限状态补强：手机号绑定和年卡权益不再从本机缓存恢复，页面刷新后必须以服务端会话和权益流水为准，避免缓存误显示已绑定或已开通。
- 用户端安全渲染补强：支付、短信、写信、语音、反馈等运行时提示和输入回显统一转义，避免外部供应商错误文本或用户输入被当作页面结构渲染；`check:ui` 已加入回归检查。
- 管理后台安全渲染补强：后台账号名、登录输入、登录错误和 toast 提示统一转义，避免后台侧运行时文本被当作页面结构渲染；`check:ui` 已加入回归检查。
- 用户端流程验收补强：新增 `npm run verify:journey`，用移动端浏览器自动点击授权、首页、通话问题和确认页；该验收不触发 DeepSeek、短信或支付费用。
- 用户端语音降级验收补强：`npm run verify:journey` 新增覆盖“浏览器语音识别不可用且服务端 ASR 未配置”场景，确认通话页会直接展示打字输入，不再出现不可用的按住说话入口。
- 生产支付闭环验收补强：`verify:production` 新增 `XIABI_VERIFY_PAID_ORDER_ID`，真实付款后可自动核对订单已支付、权益流水已生成，并可通过 `XIABI_VERIFY_REQUIRE_WEBHOOK=1` 要求存在已处理微信支付回调事件。
- MiniMax 首轮真实验收曾返回 `invalid api key`；语音接口已补强为返回 JSON 业务错误，不再让供应商错误冒泡成不可读 500。
- MiniMax TTS 兼容补强：新增 `MINIMAX_TTS_ENDPOINT`、`MINIMAX_TTS_OUTPUT_FORMAT`、`MINIMAX_TTS_MODEL` 可选项；默认按 HTTP T2A `hex` 音频返回，并自动尝试国际站、国际站加速端点和国内站端点。
- MiniMax TTS 真实验收通过：线上已配置 `MINIMAX_TTS_ENDPOINT=https://api.minimax.io/v1/t2a_v2`、`MINIMAX_TTS_OUTPUT_FORMAT=hex`、`MINIMAX_TTS_MODEL=speech-2.8-hd`，`XIABI_VERIFY_TTS=1 npm run verify:production` 返回 `audio/mp3`，traceId `06665fa1c520e487c74987a4296b424a`。
- MiniMax Group ID 已补入配置口径：新增 `MINIMAX_GROUP_ID=2000472756147200305` 运行时变量，TTS 请求会优先携带 `GroupId`，若端点不接受则自动回退无 GroupId 请求；后台系统自检会显示该项配置状态。
- 生产可选凭据清单补强：`VOICE_ASR_*`、`VOICE_ASR_API_KEY`、`WECHAT_MP_APP_SECRET`、微信平台公钥/证书序列号继续按动态可选配置读取，避免 Edgespark 把未配置的可选项判定为部署必填；MiniMax ASR 接入槽在配置 MiniMax endpoint 时会复用 `MINIMAX_GROUP_ID`。
- DeepSeek 真实写信验收通过：`XIABI_VERIFY_DEEPSEEK=1 npm run verify:production` 已在线上生成任务 `9b8d26e3-7693-4fea-9bff-519a73294201` 和信件 `60ca6afd-e328-4a0b-b88f-e293a8c52848`。
- DeepSeek 二次线上验收通过：`XIABI_VERIFY_DEEPSEEK=1 npm run verify:production` 已再次生成任务 `98055e89-2479-4168-8dbe-330bc3996f3d` 和信件 `7eb8602f-ee74-4942-b86a-1ad18f4ebb78`。
- 微信支付创建验收已越过后台开关和本地配置检查，真实请求到微信支付；当前微信侧返回 `商户号该产品权限未开通，请前往商户平台>产品中心检查后重试。`，需要在微信商户平台开通 H5 支付产品或改走微信内 JSAPI 支付并补 `WECHAT_MP_APP_SECRET` 后复验。
- 微信支付回调验签补强：平台公钥不再是唯一方式；如果未配置 `WECHAT_PAY_PLATFORM_PUBLIC_KEY`，服务端会用商户号、商户证书序列号、商户私钥和 API v3 Key 调用微信 `/v3/certificates` 自动拉取平台证书验签。
- 支付默认开关调整：默认配置已改为开放支付入口；后台仍可随时关闭 `payment_enabled`，微信支付凭据不完整时仍会 fail-fast，不创建脏订单。
- 生产验收脚本补强：微信支付创建遇到“商户号产品权限未开通”时会输出结构化 `external_blocked` 和下一步处理建议，避免被误判为代码崩溃或普通 500。
- 微信内支付验收补强：`verify:live` 新增微信浏览器 UA 下单检查，确认未取得 openid 时返回 `wechat_jsapi` 授权入口和公众号 OAuth 地址，不触发真实付款。
- 微信内支付授权加固：公众号 OAuth 现在要求 `WECHAT_MP_APP_SECRET` 和 `PUBLIC_BASE_URL` 配置完整后才返回授权地址；授权 `state` 已加入会话绑定、10 分钟过期和 HMAC 签名校验，缺配置时会 fail-fast 返回 `wechat_oauth_not_configured`，不再生成回调必失败的半授权链接。
- 用户端通话体验补强：通话页左侧“扬声器”改为真实播放控制，用户点击后由 MiniMax 朗读当前问题，再次点击可停止；默认不自动播放，避免自动验收和普通浏览器策略误触发。
- 生产验收报告补强：`verify:production` 输出新增 `readiness` 验收矩阵，按基础运行、后台、DeepSeek、微信支付、短信、MiniMax、ASR 汇总 `verified`、`pending_input`、`external_blocked` 和 `failed` 状态。
- 新增 `npm run verify:production:report`，可把生产验收矩阵写入 `docs/production-readiness-latest.md`，用于交付状态留档。
- 生产验收补强：`XIABI_VERIFY_DEEPSEEK=1` 现在不仅验证 DeepSeek 生成，还会继续验证首次免费领取、权益流水和可打印 HTML 导出。
- 生产验收补强：新增 `XIABI_VERIFY_REPEAT_FREE=1`，可在同一会话生成第二封信并验证重复首次免费领取会被 `first_free_used` 拒绝。
- 生产验收补强：`XIABI_VERIFY_PAID_ORDER_ID` 现在会在确认已支付和权益到账后，连续调用两次后台补权益，验证重复补发不会增加重复权益流水。
- 生产验收补强：同一轮设置 `XIABI_VERIFY_DEEPSEEK=1`、`XIABI_VERIFY_SMS_PHONE`、`XIABI_VERIFY_SMS_CODE` 时，会在已生成/领取信件的会话内绑定手机号，并验证信件、首次免费权益归属到绑定用户。
- 生产验收补强：后台配置传播校验不再只看首页文案和旧价格字段，现在会核对单封/年卡价格、支付开关、系统开关和通话阶段配置是否与公开配置一致。
- 语音输入接入槽补强：服务端 `/api/public/voice/transcribe` 现在同时支持 JSON base64 和 OpenAI-compatible `/audio/transcriptions` multipart 格式，`VOICE_ASR_REQUEST_FORMAT=openai|json` 可显式指定。
- 语音能力下发补强：公开配置新增 `capabilities.voice` 布尔状态，只暴露 TTS/ASR 是否可用，不暴露密钥；用户端在浏览器语音识别和服务端 ASR 都不可用时会提前降级到打字模式，不再让用户录完才失败。
- 语音录音体验补强：服务端兼容 `audio/webm;codecs=opus` 等浏览器 MIME，前端修复快速松手竞态，单次录音最多 15 秒自动送识别，并支持未来通过 `VOICE_INPUT_MODE=server` 或 `VOICE_ASR_PROVIDER=minimax` 优先走服务端 ASR。
- 语音配置交接补强：`.env.example`、Edgespark 接入清单和生产验收清单已补齐 `VOICE_INPUT_MODE=server` 说明，方便正式配置“输入走服务端/MiniMax ASR”。
- 后台自检补强：系统自检的“语音输入转写”组已展示 `VOICE_INPUT_MODE`，管理员能直接确认按住说话是否优先走服务端 ASR。
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
- 微信内浏览器已补 JSAPI/openid 接入位：无 openid 且公众号授权配置完整时返回带签名 state 的公众号 OAuth 地址，授权回调写入 httpOnly openid cookie；有 openid 时走 `/v3/pay/transactions/jsapi` 并返回 `WeixinJSBridge` 支付参数。
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
- `XIABI_PRODUCTION_STRICT=1` 现在会继续收集全部缺失 verifier 输入并写出完整生产验收矩阵，再统一失败退出；不会因为第一个缺项短路导致交付缺口报告不完整。
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
- `npm run verify:journey` 通过，7 个手机端交互用例覆盖通话流程、产品档案增删改、语音输入降级/服务端转写、智多星自动说话和微信支付权限阻塞提示。
- `npm run verify:production` 基础模式通过，已验证线上健康接口、公开配置、session logout 和产品档案 CRUD；真实短信、真实支付、真实 TTS/ASR、真实 DeepSeek 调用需显式设置对应环境变量后再执行。
- 导出文件流水幂等补强已完成部署：`npm run build`、`npm run deploy:dry`、`npm run deploy`、`npm run verify:production` 基础模式和部署后 `npm run verify:live` 均通过。
- `XIABI_PRODUCTION_STRICT=1` 临时报告路径复验通过：命令按预期退出 1，并完整列出后台、DeepSeek、支付、短信、MiniMax TTS、ASR 等缺失验收输入，没有在第一个缺项提前中断。
- `XIABI_VERIFY_DEEPSEEK=1`、`XIABI_VERIFY_REPEAT_FREE=1`、`XIABI_VERIFY_TTS=1`、`XIABI_VERIFY_PAYMENT_CREATE=1`、`XIABI_VERIFY_ALLOW_EXTERNAL_BLOCKED=1` 的生产报告已刷新：DeepSeek、首次免费权益/导出、重复领取限制、MiniMax TTS、产品档案 CRUD 均通过；微信支付下单仍被商户产品权限外部阻塞。最新报告汇总为已验证 5 项、待输入 5 项、外部阻塞 1 项、失败 0 项。
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
- 微信 H5 支付适合普通手机浏览器，但当前商户号的 H5 支付产品权限未开通；如果用户在微信内打开 H5，正式付款需要 JSAPI + openid 授权链路，并且必须补 `WECHAT_MP_APP_SECRET`，否则微信内下单会明确返回 `wechat_oauth_not_configured`。
- 微信支付回调验签已支持自动拉取平台证书；如果商户证书/API v3 Key 无效，正式回调仍会失败。
- 阿里云短信发送位已实现，但尚未用真实手机号发短信验证，避免产生费用。
- 导出目前不是二进制 PDF 文件，而是服务端可打印 HTML；用户可以在浏览器内保存为 PDF，如需服务端直接生成 PDF 还要继续接 PDF 渲染能力。
- 后台还有更细的账户权限和审计 diff 可继续补强。

### 下一步

1. 确认 H5 支付还是微信内 JSAPI 支付；微信内 JSAPI 需要补 `WECHAT_MP_APP_SECRET`。
2. 做一笔真实小额支付闭环验证：下单、跳转、回调、订单 paid、权益发放。
3. 用真实手机号验证阿里云短信发送与绑定流程。
4. 补服务端直出 PDF、后台角色权限/审计 diff。
5. 如果用户坚持语音输入也必须走 MiniMax，需要 MiniMax ASR/转写接口文档或已开通能力说明。
