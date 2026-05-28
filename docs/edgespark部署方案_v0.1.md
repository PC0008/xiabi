# Edgespark.dev 部署方案 v0.1

日期：2026-05-26

> 历史说明：本文是 2026-05-26 静态 mock 预览阶段方案，已不是当前部署事实。当前项目已经按 Edgespark 真实后端、数据库、H5 用户端和 H5 管理后台部署到生产环境；最新口径请看 `../README.md`、`../PROGRESS.md` 和 `生产验收与配置清单_v1.md`。

## 目标

把当前 `h5/` 目录从本地预览推进到 Edgespark.dev 可访问版本。当前阶段只部署静态 H5 和总后台 mock，不接真实数据库、任务队列和真实支付。

## 当前入口

- 用户端：`/h5/index.html`
- 总后台：`/h5/admin.html`
- 静态资源：`/assets/**`
- 本地预览：`node h5/server.js`

## 建议部署结构

一期按静态站点部署：

```text
/
├─ h5/
│  ├─ index.html
│  ├─ admin.html
│  ├─ app.js
│  ├─ admin.js
│  ├─ styles.css
│  └─ admin.css
└─ assets/
   └─ ui/
```

Edgespark.dev 侧先配置静态托管根目录为项目根目录，让 `/h5/index.html` 和 `/h5/admin.html` 直接可访问。

## 路由策略

当前用户端使用 hash 路由：

- `#auth`
- `#home`
- `#call`
- `#confirm`
- `#generating`
- `#letter`
- `#export`
- `#paywall`
- `#records`
- `#profile`
- `#memory`
- `#orders`
- `#feedback`
- `#settings`

静态部署无需服务端 rewrite。后续若改成 History API，再补 rewrite 到 `/h5/index.html`。

## 环境变量预留

当前 mock 阶段不读取环境变量。进入真实服务端前预留：

```text
APP_ENV=preview|production
PUBLIC_BASE_URL=https://...
API_BASE_URL=https://...
PAYMENT_PROVIDER=wechat|other
PAYMENT_NOTIFY_URL=https://.../api/payments/webhook
FILE_STORAGE_BUCKET=...
TASK_QUEUE_NAME=...
```

所有模型 Key、语音 Key、支付密钥只允许服务端读取，不进入 `h5/*.js`。

## 部署验收

- 用户端公网地址能打开首页。
- 总后台公网地址能打开配置页。
- `assets/ui/*.png` 正常加载。
- hash 路由刷新后仍能打开当前页面。
- 总后台保存 mock 配置后，同浏览器用户端可读取 `localStorage.xiabiAdminConfig`。
- 手机宽度下不出现手机壳式容器；桌面端内容居中展示。

## 后台公网注意

当前 `h5/admin.html` 仍是 mock 总后台，没有真实登录和服务端权限。公网预览阶段建议：

- 优先只开放用户端 `/h5/index.html`。
- 若必须开放 `/h5/admin.html`，先用平台访问控制、临时账号或 IP 白名单保护。
- 等 `docs/总后台登录与权限_v0.1.md` 的后台登录 API 完成后，再正式开放后台地址。

## 本地打包

当前项目提供静态部署打包脚本：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/package-edgespark-static.ps1
```

脚本会生成：

```text
dist/edgespark-static-YYYYMMDD-HHMMSS/
dist/edgespark-static-YYYYMMDD-HHMMSS.zip
```

部署时上传包内根目录，使以下路径可访问：

```text
/h5/index.html
/h5/admin.html
/assets/ui/zhiduoxing-auth.png
```

## 下一阶段切换点

当开始真实后端时，`localStorage` 只保留临时草稿和前端缓存；订单、权益、生成任务、PDF 文件、手机号绑定状态全部改为服务端 API 返回。
