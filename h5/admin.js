const savedAdminConfig = readSavedAdminConfig();
const defaultGuideStages = [
  {
    key: "recipient_scope",
    title: "这封信帮谁写",
    question: "这封信是给你自己的产品写，还是帮朋友写？",
    desc: "你可以直接说，也可以点一下。",
    required: true,
    enabled: true,
    options: ["给我自己的产品写", "给自己公司的产品写", "帮朋友/客户写", "先作为临时项目"]
  },
  {
    key: "letter_goal",
    title: "写信目标",
    question: "这封信希望实现什么效果？",
    desc: "选一个最接近的目标就行。",
    required: true,
    enabled: true,
    options: ["让对方回复我", "预约一次沟通", "促进购买/付款", "邀请合作/代理"]
  },
  {
    key: "profile_match",
    title: "产品档案匹配",
    question: "这次要写的是哪个产品或服务？",
    desc: "如果没有档案，边聊边建立临时档案。",
    required: false,
    enabled: true,
    options: ["匹配已有产品", "新建临时产品", "先不写入长期档案"]
  }
];

const adminState = {
  route: location.hash.replace("#", "") || "dashboard",
  toast: "",
  authChecked: false,
  adminUser: null,
  loginUsername: "",
  loginPassword: "",
  loginError: "",
  homeConfig: Object.assign({
    brand_name: "下笔有元",
    hero_title: "说出目标，我们帮你写成销售信。",
    hero_subtitle: "告诉我们你想达成的产品或客户目标，智多星会通过提问帮你理清思路，并为你写成有说服力的销售信。",
    primary_button_text: "开始语音通话 · 首次免费",
    free_hint: "首次体验可免费生成一封",
    unclaimed_notice: "你有一封已经写好的销售信，还没有领取。",
    unclaimed_notice_desc: "可以继续回来查看完整内容。",
    unclaimed_button_text: "领取我的销售信",
    allow_guest_preview: true,
    generation_entry_enabled: true,
    text_mode_enabled: true,
    phone_bind_enabled: true
  }, savedAdminConfig.homeConfig || {}),
  pricing: Object.assign({
    single: 200,
    annual: 2000,
    payment_mode: "wechat",
    payment_enabled: true,
    annual_enabled: true,
    single_enabled: true,
    pdf_upsell_enabled: true,
    annual_badge_text: "更划算",
    upgrade_discount_enabled: true,
    pdf_annual_title: "经常要写销售信，可以开通年卡",
    pdf_annual_desc: "一年内正常使用范围内不限次数生成、保存、继续完善和导出。"
  }, savedAdminConfig.pricing || {}),
  system: Object.assign({
    generation_enabled: true,
    payment_enabled: false,
    sms_enabled: true,
    voice_enabled: true,
    file_export_enabled: true
  }, savedAdminConfig.system || {}),
  guideStages: savedAdminConfig.guideStages || defaultGuideStages,
  lists: {
    dashboard: null,
    admins: null,
    users: null,
    profiles: null,
    letters: null,
    orders: null,
    entitlements: null,
    logs: null,
    tasks: null,
    paymentEvents: null,
    feedback: null,
    diagnostics: null
  },
  templates: Array.isArray(savedAdminConfig.templates) ? savedAdminConfig.templates : [],
  selectedTemplateKey: Array.isArray(savedAdminConfig.templates) && savedAdminConfig.templates[0] ? savedAdminConfig.templates[0].key : "",
  selectedGuideIndex: 0,
  filters: {
    lettersStatus: "",
    tasksStatus: "",
    ordersStatus: "",
    entitlementsStatus: "",
    paymentEventsStatus: "",
    feedbackStatus: "",
    logsAction: "",
    logsTargetType: ""
  },
  pageLimit: 50,
  pages: {
    users: 1,
    profiles: 1,
    letters: 1,
    tasks: 1,
    orders: 1,
    entitlements: 1,
    paymentEvents: 1,
    feedback: 1,
    logs: 1
  },
  security: {
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  },
  adminCreate: {
    username: "",
    displayName: "",
    password: ""
  },
  adminResetPasswords: {},
  feedbackNotes: {},
  detail: null
};

function applyRemoteAdminConfig(config) {
  if (!config) return;
  Object.assign(adminState.homeConfig, config.homeConfig || config.home || {});
  Object.assign(adminState.pricing, config.pricing || {});
  Object.assign(adminState.system, config.system || {});
  if (Array.isArray(config.guideStages) && config.guideStages.length) {
    adminState.guideStages = config.guideStages;
  }
  if (Array.isArray(config.templates) && config.templates.length) {
    adminState.templates = config.templates;
    if (!adminState.selectedTemplateKey || !adminState.templates.some((tpl) => tpl.key === adminState.selectedTemplateKey)) {
      adminState.selectedTemplateKey = adminState.templates[0].key;
    }
  }
}

function readSavedAdminConfig() {
  return window.XiabiStore.getAdminConfig();
}

async function loadAdminLists() {
  if (!adminState.adminUser) return;
  try {
    const [dashboard, adminsData, usersData, profilesData, lettersData, ordersData, entitlementData, logsData, tasksData, paymentEventsData, feedbackData, diagnosticsData] = await Promise.all([
      window.XiabiStore.adminFetch("/dashboard"),
      window.XiabiStore.adminFetch("/admins"),
      window.XiabiStore.adminFetch(listPath("/users", "", "users")),
      window.XiabiStore.adminFetch(listPath("/profiles", "", "profiles")),
      window.XiabiStore.adminFetch(listPath("/letters", adminState.filters.lettersStatus, "letters")),
      window.XiabiStore.adminFetch(listPath("/orders", adminState.filters.ordersStatus, "orders")),
      window.XiabiStore.adminFetch(listPath("/entitlements", adminState.filters.entitlementsStatus, "entitlements")),
      window.XiabiStore.adminFetch(auditLogPath()),
      window.XiabiStore.adminFetch(listPath("/tasks", adminState.filters.tasksStatus, "tasks")),
      window.XiabiStore.adminFetch(listPath("/payment-events", adminState.filters.paymentEventsStatus, "paymentEvents")),
      window.XiabiStore.adminFetch(listPath("/feedback", adminState.filters.feedbackStatus, "feedback")),
      window.XiabiStore.adminFetch("/diagnostics")
    ]);
    adminState.lists = {
      dashboard,
      admins: adminsData,
      users: usersData,
      profiles: profilesData,
      letters: lettersData,
      orders: ordersData,
      entitlements: entitlementData,
      logs: logsData,
      tasks: tasksData,
      paymentEvents: paymentEventsData,
      feedback: feedbackData,
      diagnostics: diagnosticsData
    };
  } catch (error) {
    showToast(error.message || "后台数据加载失败");
  }
}

function listPath(path, status, pageKey = "") {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (pageKey && pageKey in adminState.pages) {
    params.set("page", String(adminState.pages[pageKey] || 1));
    params.set("limit", String(adminState.pageLimit));
  }
  return params.toString() ? `${path}?${params}` : path;
}

function auditLogPath() {
  const params = new URLSearchParams();
  if (adminState.filters.logsAction) params.set("action", adminState.filters.logsAction);
  if (adminState.filters.logsTargetType) params.set("targetType", adminState.filters.logsTargetType);
  params.set("page", String(adminState.pages.logs || 1));
  params.set("limit", String(adminState.pageLimit));
  return `/audit-logs?${params}`;
}

function canAdminWrite() {
  return adminState.adminUser?.role === "owner";
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

function yuan(cents) {
  return `¥${(Number(cents || 0) / 100).toFixed(2).replace(/\.00$/, "")}`;
}

const navItems = [
  ["dashboard", "概览", "dashboard"],
  ["miniapp", "H5 配置", "phone"],
  ["guides", "通话引导", "guide"],
  ["templates", "销售信模板", "template"],
  ["pricing", "价格权益", "crown"],
  ["admins", "管理员账号", "settings"],
  ["users", "用户管理", "user"],
  ["profiles", "产品档案", "archive"],
  ["letters", "销售信管理", "doc"],
  ["tasks", "生成任务", "refresh"],
  ["orders", "订单支付", "order"],
  ["paymentEvents", "支付回调", "log"],
  ["ledger", "权益流水", "ledger"],
  ["feedback", "用户反馈", "doc"],
  ["logs", "日志审计", "log"],
  ["security", "账号安全", "settings"],
  ["diagnostics", "系统自检", "settings"]
];

const templates = [
  {
    name: "微信私聊成交信",
    goal: "促进购买/付款",
    scene: "我的产品 / 公司产品",
    status: "启用",
    version: "v1.3",
    structure: "开头共鸣 -> 痛点拆解 -> 解决方案 -> 证据 -> 行动引导"
  },
  {
    name: "预约沟通信",
    goal: "预约一次沟通",
    scene: "服务咨询",
    status: "启用",
    version: "v1.1",
    structure: "理解处境 -> 低门槛邀请 -> 明确沟通价值 -> 预约入口"
  },
  {
    name: "合作代理邀请信",
    goal: "邀请合作/代理",
    scene: "朋友/客户产品",
    status: "草稿",
    version: "v0.8",
    structure: "机会描述 -> 适合人群 -> 合作理由 -> 下一步沟通"
  }
];

function getEditableTemplates() {
  return adminState.templates.length ? adminState.templates : templates.map((tpl, index) => ({
    key: tpl.key || `template_${index + 1}`,
    name: tpl.name,
    goal: tpl.goal,
    scene: tpl.scene,
    status: tpl.status === "草稿" || tpl.status === "draft" ? "draft" : "enabled",
    version: tpl.version,
    structure: Array.isArray(tpl.structure) ? tpl.structure : String(tpl.structure || "").split("->").map((item) => item.trim()).filter(Boolean),
    rules: tpl.rules || ""
  }));
}

function getSelectedTemplate() {
  const editableTemplates = getEditableTemplates();
  if (!adminState.selectedTemplateKey && editableTemplates[0]) adminState.selectedTemplateKey = editableTemplates[0].key;
  return editableTemplates.find((tpl) => tpl.key === adminState.selectedTemplateKey) || editableTemplates[0] || null;
}

function commitTemplates(nextTemplates) {
  adminState.templates = nextTemplates;
  if (!adminState.templates.some((tpl) => tpl.key === adminState.selectedTemplateKey) && adminState.templates[0]) {
    adminState.selectedTemplateKey = adminState.templates[0].key;
  }
}

function updateSelectedGuideStage(fieldName, value) {
  const index = Math.min(adminState.selectedGuideIndex || 0, Math.max(adminState.guideStages.length - 1, 0));
  const current = adminState.guideStages[index];
  if (!current) return;
  const next = Object.assign({}, current);
  if (fieldName === "stage_key") next.key = value.trim();
  if (fieldName === "stage_title") next.title = value;
  if (fieldName === "stage_question") next.question = value;
  if (fieldName === "stage_desc") next.desc = value;
  if (fieldName === "stage_options") next.options = value.split("\n").map((item) => item.trim()).filter(Boolean);
  if (fieldName === "stage_required") next.required = value === "true";
  if (fieldName === "stage_enabled") next.enabled = value === "true";
  adminState.guideStages = adminState.guideStages.map((stage, stageIndex) => (stageIndex === index ? next : stage));
}

function updateSelectedTemplate(fieldName, value) {
  const current = getSelectedTemplate();
  if (!current) return;
  const nextTemplates = getEditableTemplates().map((tpl) => {
    if (tpl.key !== current.key) return tpl;
    const next = Object.assign({}, tpl);
    if (fieldName === "structure") {
      next.structure = value.split("\n").map((item) => item.trim()).filter(Boolean);
    } else {
      next[fieldName] = value;
    }
    if (fieldName === "key") adminState.selectedTemplateKey = value;
    return next;
  });
  commitTemplates(nextTemplates);
}

const users = [];
const letters = [];
const orders = [];
const ledger = [];
const logs = [];

function icon(name) {
  const icons = {
    dashboard: '<svg viewBox="0 0 32 32"><path d="M5 17h8V6H5zM19 26h8V6h-8zM5 26h8v-5H5z"/></svg>',
    phone: '<svg viewBox="0 0 32 32"><rect x="10" y="4" width="12" height="24" rx="3"/><path d="M14 24h4"/></svg>',
    guide: '<svg viewBox="0 0 32 32"><path d="M6 8h20M6 16h12M6 24h16"/><path d="m22 13 4 3-4 3"/></svg>',
    template: '<svg viewBox="0 0 32 32"><path d="M8 5h16v22H8z"/><path d="M12 11h8M12 16h8M12 21h5"/></svg>',
    crown: '<svg viewBox="0 0 32 32"><path d="m5.8 11.5 6.2 5 4-8 4 8 6.2-5-2.1 13H7.9z"/><path d="M8.5 27h15"/></svg>',
    user: '<svg viewBox="0 0 32 32"><path d="M16 15.5a5 5 0 1 0 0-10 5 5 0 0 0 0 10z"/><path d="M6.5 27c1.5-4.9 5-7.5 9.5-7.5s8 2.6 9.5 7.5"/></svg>',
    doc: '<svg viewBox="0 0 32 32"><path d="M9 4.5h10.4L25 10v17.5H9z"/><path d="M19 4.5V10h6M12.5 15.5h8M12.5 20h8M12.5 24.5h5"/></svg>',
    order: '<svg viewBox="0 0 32 32"><path d="M9 5h14v22H9z"/><path d="M12 11h8M12 16h8M12 21h5"/></svg>',
    ledger: '<svg viewBox="0 0 32 32"><path d="M6 7h20v18H6z"/><path d="M10 13h12M10 18h12M10 23h7"/></svg>',
    log: '<svg viewBox="0 0 32 32"><path d="M7 6h18v20H7z"/><path d="M11 11h10M11 16h10M11 21h6"/></svg>',
    refresh: '<svg viewBox="0 0 32 32"><path d="M24 10a9 9 0 1 0 1 10"/><path d="M24 5v6h-6"/></svg>',
    settings: '<svg viewBox="0 0 32 32"><path d="M13.5 5.5h5l1 3.1 3 1.3 3-1.4 2.5 4.3-2.5 2.1v3.2l2.5 2.1-2.5 4.3-3-1.4-3 1.3-1 3.1h-5l-1-3.1-3-1.3-3 1.4L4 20.2l2.5-2.1v-3.2L4 12.8l2.5-4.3 3 1.4 3-1.3z"/><circle cx="16" cy="16" r="4"/></svg>'
  };
  return icons[name] || icons.dashboard;
}

function setRoute(route) {
  adminState.route = route;
  location.hash = route;
  render();
}

window.addEventListener("hashchange", () => {
  adminState.route = location.hash.replace("#", "") || "dashboard";
  render();
});

function layout(content) {
  const item = navItems.find(([key]) => key === adminState.route) || navItems[0];
  return `
    <div class="admin-shell">
      <aside class="sidebar">
        <div class="brand-block">
          <div class="brand-name">下笔有元</div>
          <div class="brand-sub">总后台 · H5 主站一期</div>
        </div>
        <nav class="nav">
          ${navItems.map(([key, label, iconName]) => `
            <button class="${adminState.route === key ? "active" : ""}" data-route="${key}">
              <span class="nav-icon">${icon(iconName)}</span>
              <span>${label}</span>
            </button>
          `).join("")}
        </nav>
      </aside>
      <main class="main">
        <section class="topbar">
          <div>
            <h1 class="page-title">${item[1]}</h1>
            <div class="page-desc">${pageDescription(adminState.route)}</div>
          </div>
          <div class="top-actions">
            <span class="pill">tenant_id: main</span>
      ${adminState.adminUser ? `<span class="pill">${h(adminState.adminUser.displayName || adminState.adminUser.username)}</span>` : ""}
            ${canAdminWrite() ? `<button class="secondary" data-action="save">保存配置</button>` : `<button class="secondary disabled" disabled>只读账号</button>`}
            <button class="ghost" data-action="preview-user">查看用户端</button>
            <button class="ghost" data-action="admin-logout">退出</button>
          </div>
        </section>
        ${content}
      </main>
      ${renderDetailDrawer()}
      ${adminState.toast ? `<div class="toast">${h(adminState.toast)}</div>` : ""}
    </div>
  `;
}

function renderLogin() {
  return `
    <div class="admin-login-shell">
      <section class="login-card card">
        <div class="brand-block login-brand">
          <div class="brand-name">下笔有元</div>
          <div class="brand-sub">总后台登录</div>
        </div>
        <div class="form-grid login-form">
          <div class="field full"><label>账号</label><input data-login-field="username" value="${h(adminState.loginUsername)}" autocomplete="username" maxlength="64" /></div>
          <div class="field full"><label>密码</label><input data-login-field="password" type="password" value="${h(adminState.loginPassword)}" autocomplete="current-password" maxlength="256" /></div>
        </div>
        ${adminState.loginError ? `<div class="login-error">${h(adminState.loginError)}</div>` : ""}
        <button class="primary login-submit" data-action="admin-login">登录后台</button>
        <div class="login-hint">首次部署后，用 Edgespark 密钥里配置的管理员账号和初始密码登录。</div>
      </section>
    </div>
  `;
}

function pageDescription(route) {
  const desc = {
    dashboard: "查看今天的运行健康状态、支付和异常。",
    miniapp: "控制用户端首页文案、入口开关和手机号提示。",
    guides: "配置通话页内的追问阶段、快捷选项和写入位置。",
    templates: "控制销售信生成结构、段落要求和模板版本。",
    pricing: "配置单封、年卡、支付模式和 PDF 导出承接。",
    admins: "管理后台登录账号和运营权限，owner 可创建只读运营账号。",
    users: "查看用户、手机号、权益和使用记录。",
    letters: "排查每一封销售信的状态、模板和任务来源。",
    tasks: "查看生成任务、失败原因和后台重试结果。",
    orders: "查看订单、支付状态、回调和补偿入口。",
    paymentEvents: "查看微信支付回调事件、失败原因和原始数据。",
    ledger: "权益只从订单和权益流水计算，前端不直接决定权限。",
    feedback: "查看用户提交的问题、建议和异常反馈。",
    logs: "记录配置修改、支付回调、生成失败和敏感操作。",
    security: "修改后台密码并让旧会话失效。",
    diagnostics: "检查真实服务配置是否齐全，只显示状态，不显示密钥内容。"
  };
  return desc[route] || "";
}

function h(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function actionCell(html) {
  return { html };
}

function shortId(value) {
  return value ? String(value).slice(0, 8) : "-";
}

function renderJson(value) {
  return `<pre class="json-block">${h(JSON.stringify(value ?? {}, null, 2))}</pre>`;
}

function formatAuditValue(value) {
  if (value && typeof value === "object") {
    if (value.type === "array") {
      return `数组 ${value.length || 0} 项${value.preview ? `：${JSON.stringify(value.preview).slice(0, 120)}` : ""}`;
    }
    if (value.type === "object") {
      return `对象：${(value.keys || []).join("、") || "-"}`;
    }
    return JSON.stringify(value).slice(0, 180);
  }
  return String(value ?? "-");
}

function renderAuditLogDetail(log) {
  const detail = log.detail || {};
  const changes = Array.isArray(detail.changes) ? detail.changes : [];
  return [
    detailSection("审计事件", [
      ["事件类型", log.action || "-"],
      ["操作人", shortId(log.actorId)],
      ["目标类型", log.targetType || "-"],
      ["目标ID", shortId(log.targetId)],
      ["发生时间", formatDate(log.createdAt)],
      ["变更数量", detail.changedCount ?? changes.length],
      ["是否截断", detail.truncated ? "是" : "否"]
    ]),
    changes.length
      ? detailMiniTable("变更字段", ["字段", "修改前", "修改后"], changes.map((item) => [
        item.path || "-",
        formatAuditValue(item.before),
        formatAuditValue(item.after)
      ]))
      : "",
    renderJson(detail)
  ].join("");
}

function renderDetailDrawer() {
  const detail = adminState.detail;
  if (!detail) return "";
  return `
    <aside class="detail-drawer">
      <div class="detail-head">
        <div>
          <div class="detail-title">${h(detail.title || "详情")}</div>
          <div class="detail-sub">${h(detail.sub || "真实数据详情")}</div>
        </div>
        <button class="ghost" data-action="close-detail">关闭</button>
      </div>
      <div class="detail-body">${detail.loading ? `<div class="empty">正在加载...</div>` : detail.html || ""}</div>
    </aside>
  `;
}

function detailSection(title, rows) {
  return `
    <div class="detail-section">
      <div class="detail-section-title">${h(title)}</div>
      ${rows.map(([label, value]) => `<div class="detail-row"><span>${h(label)}</span><strong>${h(value)}</strong></div>`).join("")}
    </div>
  `;
}

function detailMiniTable(title, heads, rows) {
  return `
    <div class="detail-section">
      <div class="detail-section-title">${h(title)}</div>
      <div class="table-wrap mini-table">
        <table>
          <thead><tr>${heads.map((head) => `<th>${h(head)}</th>`).join("")}</tr></thead>
          <tbody>${rows.length ? rows.map((row) => `<tr>${row.map((cell) => `<td>${h(cell)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${heads.length}">暂无记录</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;
}

function detailFileTable(files) {
  return `
    <div class="detail-section">
      <div class="detail-section-title">导出文件</div>
      <div class="table-wrap mini-table">
        <table>
          <thead><tr><th>文件ID</th><th>类型</th><th>状态</th><th>时间</th><th>操作</th></tr></thead>
          <tbody>${files.length ? files.map((item) => `
            <tr>
              <td>${h(shortId(item.id))}</td>
              <td>${h(item.kind)}</td>
              <td>${h(item.status)}</td>
              <td>${h(formatDate(item.createdAt))}</td>
              <td>${item.downloadUrl ? `<a class="mini-action" href="${h(item.downloadUrl)}" target="_blank" rel="noopener">打开</a>` : "-"}</td>
            </tr>
          `).join("") : `<tr><td colspan="5">暂无记录</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderDashboard() {
  const metrics = adminState.lists.dashboard?.metrics || {};
  const todo = adminState.lists.dashboard?.todo || [];
  return layout(`
    <section class="section grid cols-4">
      ${metric("会话数", metrics.sessions ?? "0", "实时数据")}
      ${metric("销售信", metrics.letters ?? "0", `失败 ${metrics.failedTasks ?? 0}`)}
      ${metric("订单数", metrics.orders ?? "0", `待支付 ${metrics.pendingOrders ?? 0}`)}
      ${metric("异常任务", metrics.failedTasks ?? "0", "需要处理")}
    </section>
    <section class="section split">
      <div class="panel card">
        <div class="panel-head"><div><div class="panel-title">待处理事项</div><div class="panel-desc">先处理会影响领取、支付和生成的问题。</div></div></div>
        <div class="list">
          ${(todo.length ? todo : [
            { title: "生成失败任务", count: 0, level: "danger" },
            { title: "待支付订单", count: 0, level: "warn" },
            { title: "待领取销售信", count: 0, level: "normal" }
          ]).map((item) => row(`${item.count} 个${item.title}`, item.count ? "需要尽快处理" : "当前没有待处理项", item.level === "danger" ? "danger" : item.level === "warn" ? "warn" : "")).join("")}
        </div>
      </div>
      <div class="panel card">
        <div class="panel-head"><div><div class="panel-title">系统开关</div><div class="panel-desc">一期关键能力必须能随时关闭。</div></div></div>
        ${switchRow("新通话入口", "开启后用户可进入通话页", adminState.homeConfig.generation_entry_enabled, "homeConfig.generation_entry_enabled")}
        ${switchRow("新生成任务", "关闭后只保留历史查看", adminState.system.generation_enabled, "system.generation_enabled")}
        ${switchRow("支付入口", "正式支付异常时可临时关闭", adminState.pricing.payment_enabled, "pricing.payment_enabled")}
        ${switchRow("打字模式", "用户不想语音时可切换", adminState.homeConfig.text_mode_enabled, "homeConfig.text_mode_enabled")}
      </div>
    </section>
  `);
}

function renderMiniapp() {
  return layout(`
    <section class="section split">
      <div class="panel card">
        <div class="panel-head"><div><div class="panel-title">首页文案配置</div><div class="panel-desc">这些字段后续要由接口下发，用户端只保留兜底值。</div></div></div>
        <div class="form-grid">
          ${field("品牌名", "brand_name", adminState.homeConfig.brand_name)}
          ${field("首页按钮", "primary_button_text", adminState.homeConfig.primary_button_text)}
          ${field("首页标题", "hero_title", adminState.homeConfig.hero_title, "full")}
          ${area("首页副标题", "hero_subtitle", adminState.homeConfig.hero_subtitle)}
          ${field("首次免费提示", "free_hint", adminState.homeConfig.free_hint)}
          ${field("未领取提醒", "unclaimed_notice", adminState.homeConfig.unclaimed_notice)}
          ${field("未领取说明", "unclaimed_notice_desc", adminState.homeConfig.unclaimed_notice_desc)}
          ${field("未领取按钮", "unclaimed_button_text", adminState.homeConfig.unclaimed_button_text)}
        </div>
      </div>
      <div class="panel card">
        <div class="panel-head"><div><div class="panel-title">入口开关</div><div class="panel-desc">所有影响转化的入口都由后台控制。</div></div></div>
        ${switchRow("游客可浏览首页", "游客能看首页，但进入通话需授权", adminState.homeConfig.allow_guest_preview, "homeConfig.allow_guest_preview")}
        ${switchRow("开始生成入口", "控制首页主按钮是否可点击", adminState.homeConfig.generation_entry_enabled, "homeConfig.generation_entry_enabled")}
        ${switchRow("后端写信服务", "关闭后会保留页面入口，但不会创建新的写信任务", adminState.system.generation_enabled, "system.generation_enabled")}
        ${switchRow("打字模式入口", "通话页显示切换打字模式", adminState.homeConfig.text_mode_enabled, "homeConfig.text_mode_enabled")}
        ${switchRow("手机号授权入口", "排队生成页引导绑定手机号", adminState.homeConfig.phone_bind_enabled, "homeConfig.phone_bind_enabled")}
        ${switchRow("短信绑定服务", "关闭后不发送验证码", adminState.system.sms_enabled, "system.sms_enabled")}
        ${switchRow("语音服务", "关闭后用户端只保留打字模式", adminState.system.voice_enabled, "system.voice_enabled")}
      </div>
    </section>
  `);
}

function renderGuides() {
  const selectedIndex = Math.min(adminState.selectedGuideIndex || 0, Math.max(adminState.guideStages.length - 1, 0));
  const selected = adminState.guideStages[selectedIndex] || adminState.guideStages[0];
  return layout(`
    <section class="section split">
      <div class="panel card">
        <div class="panel-head"><div><div class="panel-title">通话阶段顺序</div><div class="panel-desc">这些问题在通话页内部引导，不做独立三连页面。</div></div><button class="primary" data-action="add-guide-stage">新增阶段</button></div>
        <div class="list">
          ${adminState.guideStages.map((stage, index) => `
            <button class="row-card row-button guide-stage ${index === selectedIndex ? "active-row" : ""}" data-action="select-guide-stage" data-guide-index="${index}">
              <div>
                <div class="row-title">${index + 1}. ${h(stage.title)}</div>
                <div class="row-meta">${h(stage.question)}</div>
                <div class="row-meta">选项：${(stage.options || []).map(h).join(" / ")}</div>
              </div>
              <span class="tag ${stage.required ? "" : "warn"}">${stage.enabled === false ? "停用" : stage.required ? "必答" : "可跳过"}</span>
            </button>
          `).join("")}
        </div>
      </div>
      <div class="panel card">
        <div class="panel-head"><div><div class="panel-title">阶段配置</div><div class="panel-desc">当前选中：${h(selected?.title || "-")}</div></div></div>
        ${selected ? `
        <div class="form-grid">
          ${field("阶段 key", "stage_key", selected.key || "")}
          ${field("阶段标题", "stage_title", selected.title || "")}
          ${area("问题文案", "stage_question", selected.question || "")}
          ${area("说明文案", "stage_desc", selected.desc || "")}
          ${area("快捷选项", "stage_options", (selected.options || []).join("\n"))}
          <div class="field"><label>是否必答</label><select data-field="stage_required"><option value="true" ${selected.required !== false ? "selected" : ""}>必答</option><option value="false" ${selected.required === false ? "selected" : ""}>可跳过</option></select></div>
          <div class="field"><label>是否启用</label><select data-field="stage_enabled"><option value="true" ${selected.enabled !== false ? "selected" : ""}>启用</option><option value="false" ${selected.enabled === false ? "selected" : ""}>停用</option></select></div>
        </div>
        ` : `<div class="empty">还没有通话阶段。</div>`}
      </div>
    </section>
  `);
}

function renderTemplates() {
  const editableTemplates = getEditableTemplates();
  const selected = getSelectedTemplate();
  const selectedStructure = Array.isArray(selected?.structure) ? selected.structure.join("\n") : String(selected?.structure || "");
  return layout(`
    <section class="section split">
      <div class="panel card">
        <div class="panel-head">
          <div><div class="panel-title">模板列表</div><div class="panel-desc">后台保存后，会直接影响用户端下一次整理销售信。</div></div>
          <button class="primary" data-action="add-template">新增模板</button>
        </div>
        <div class="list">
          ${editableTemplates.map((tpl) => `
            <button class="row-card row-button ${selected?.key === tpl.key ? "active-row" : ""}" data-action="select-template" data-template-key="${tpl.key}">
              <div>
                <div class="row-title">${h(tpl.name || tpl.key)}</div>
                <div class="row-meta">${h(tpl.goal || "-")} · ${h(tpl.scene || "-")} · ${h(tpl.version || "v1.0")}</div>
                <div class="row-meta">${h(Array.isArray(tpl.structure) ? tpl.structure.join(" -> ") : (tpl.structure || ""))}</div>
              </div>
              <span class="tag ${tpl.status === "draft" ? "warn" : ""}">${tpl.status === "enabled" ? "启用" : "草稿"}</span>
            </button>
          `).join("")}
        </div>
      </div>
      <div class="panel card">
        <div class="panel-head"><div><div class="panel-title">模板规则</div><div class="panel-desc">这里保存的是实际写信规则，不会在用户端直接展示。</div></div></div>
        ${selected ? `
          <div class="form-grid">
            <div class="field"><label>模板 key</label><input data-template-field="key" value="${h(selected.key || "")}" /></div>
            <div class="field"><label>版本</label><input data-template-field="version" value="${h(selected.version || "v1.0")}" /></div>
            <div class="field"><label>模板名称</label><input data-template-field="name" value="${h(selected.name || "")}" /></div>
            <div class="field"><label>状态</label><select data-template-field="status"><option value="enabled" ${selected.status === "enabled" ? "selected" : ""}>启用</option><option value="draft" ${selected.status !== "enabled" ? "selected" : ""}>草稿</option></select></div>
            <div class="field"><label>适用目标</label><input data-template-field="goal" value="${h(selected.goal || "")}" /></div>
            <div class="field"><label>适用场景</label><input data-template-field="scene" value="${h(selected.scene || "")}" /></div>
            <div class="field full"><label>段落结构</label><textarea data-template-field="structure">${h(selectedStructure)}</textarea></div>
            <div class="field full"><label>写信要求</label><textarea data-template-field="rules">${h(selected.rules || selected.prompt || selected.requirement || "")}</textarea></div>
          </div>
        ` : `<div class="empty">还没有可编辑模板。</div>`}
      </div>
    </section>
  `);
  return layout(`
    <section class="section split">
      <div class="panel card">
        <div class="panel-head"><div><div class="panel-title">模板列表</div><div class="panel-desc">模板只在后台控制生成结构，用户端不展示模板概念。</div></div><button class="primary">新增模板</button></div>
        <div class="list">
          ${templates.map((tpl) => `
            <div class="row-card">
              <div>
                <div class="row-title">${tpl.name}</div>
                <div class="row-meta">${tpl.goal} · ${tpl.scene} · ${tpl.version}</div>
                <div class="row-meta">${tpl.structure}</div>
              </div>
              <span class="tag ${tpl.status === "草稿" ? "warn" : ""}">${tpl.status}</span>
            </div>
          `).join("")}
        </div>
      </div>
      <div class="panel card">
        <div class="panel-head"><div><div class="panel-title">模板规则预览</div><div class="panel-desc">后续每次修改都要记录版本和审计。</div></div></div>
        <div class="template-preview">
          <strong>微信私聊成交信 v1.3</strong><br />
          1. 开头先共鸣客户当前处境。<br />
          2. 不堆功能，先讲客户正在损失什么。<br />
          3. 用产品解决方案回应顾虑。<br />
          4. 必须给出轻量下一步行动。<br />
          5. 禁用夸张承诺、绝对化表达。
        </div>
      </div>
    </section>
  `);
}

function renderPricing() {
  return layout(`
    <section class="section grid cols-2">
      <div class="panel card">
        <div class="panel-head"><div><div class="panel-title">价格与支付模式</div><div class="panel-desc">用户端下单金额以这里为准，支付完成后由服务端回调发放权益。</div></div></div>
        <div class="form-grid">
          ${field("单封解锁价格", "single", adminState.pricing.single)}
          ${field("年卡价格", "annual", adminState.pricing.annual)}
          <div class="field"><label>支付模式</label><select data-field="payment_mode"><option ${adminState.pricing.payment_mode === "wechat" ? "selected" : ""}>wechat</option></select></div>
          ${field("年卡推荐标签", "annual_badge_text", adminState.pricing.annual_badge_text || "")}
          ${field("PDF 导出页年卡标题", "pdf_annual_title", adminState.pricing.pdf_annual_title, "full")}
          ${area("PDF 导出页年卡说明", "pdf_annual_desc", adminState.pricing.pdf_annual_desc)}
        </div>
      </div>
      <div class="panel card">
        <div class="panel-head"><div><div class="panel-title">权益规则</div><div class="panel-desc">权益只认订单流水和权益流水。</div></div></div>
        ${switchRow("支付入口", "关闭后用户端只保留查看和导出，不产生新订单", adminState.pricing.payment_enabled, "pricing.payment_enabled")}
        ${switchRow("单封解锁", "允许用户二次生成后单封解锁", adminState.pricing.single_enabled, "pricing.single_enabled")}
        ${switchRow("年卡购买", "允许用户开通年卡", adminState.pricing.annual_enabled, "pricing.annual_enabled")}
        ${switchRow("PDF 导出页成交入口", "体验高峰期展示年卡支付按钮", adminState.pricing.pdf_upsell_enabled, "pricing.pdf_upsell_enabled")}
        ${switchRow("7 天内升级抵扣", "单封解锁后升级年卡可抵扣", adminState.pricing.upgrade_discount_enabled !== false, "pricing.upgrade_discount_enabled")}
      </div>
    </section>
  `);
}

function renderUsers() {
  const sessions = adminState.lists.users?.sessions || [];
  const realUsers = adminState.lists.users?.users || [];
  const sessionsByUser = sessions.reduce((acc, item) => {
    if (!item.userId) return acc;
    acc[item.userId] = (acc[item.userId] || 0) + 1;
    return acc;
  }, {});
  const userRows = realUsers.map((item) => [
    shortId(item.id),
    shortId(item.id),
    item.phoneMasked || "-",
    item.status,
    String(sessionsByUser[item.id] || 0),
    formatDate(item.updatedAt || item.createdAt),
    formatDate(item.createdAt),
    actionCell(`<button class="mini-action" data-action="show-detail" data-detail-type="users" data-detail-id="${h(item.id)}">详情</button>`)
  ]);
  const guestRows = sessions.filter((item) => !item.userId).map((item) => [
    shortId(item.id),
    "游客会话",
    "-",
    item.status,
    "1",
    formatDate(item.updatedAt || item.createdAt),
    formatDate(item.createdAt),
    actionCell(`<button class="mini-action" data-action="show-detail" data-detail-type="users" data-detail-id="${h(item.id)}">详情</button>`)
  ]);
  const rows = [...userRows, ...guestRows];
  return layout(tablePanel("用户列表", "查看用户基础信息和权益状态。", ["主体ID", "用户", "手机号", "状态", "会话", "最近更新", "创建时间", "操作"], rows, "", paginationControls("users", adminState.lists.users?.pageInfo)));
}

function renderAdmins() {
  const admins = adminState.lists.admins?.admins || [];
  const rows = admins.map((item) => {
    const canManage = canAdminWrite() && item.role !== "owner";
    const resetValue = adminState.adminResetPasswords[item.id] || "";
    const nextStatus = item.status === "active" ? "disabled" : "active";
    return [
      shortId(item.id),
      item.username,
      item.displayName || "-",
      item.role === "owner" ? "owner" : "只读运营",
      item.status === "active" ? "启用" : "停用",
      formatDate(item.lastLoginAt),
      formatDate(item.createdAt),
      actionCell(canManage ? `
        <div class="inline-admin-actions">
          <button class="mini-action ${item.status === "active" ? "warn-action" : ""}" data-action="toggle-admin-status" data-admin-id="${h(item.id)}" data-admin-status="${h(nextStatus)}">${item.status === "active" ? "停用" : "启用"}</button>
          <input class="mini-input" data-admin-reset-password="${h(item.id)}" type="password" value="${h(resetValue)}" placeholder="新密码" maxlength="256" autocomplete="new-password" />
          <button class="mini-action" data-action="reset-admin-password" data-admin-id="${h(item.id)}">重置密码</button>
        </div>
      ` : `<span class="muted-text">${item.role === "owner" ? "Owner 保护" : "只读"}</span>`)
    ];
  });
  return layout(`
    <section class="section split">
      <div class="panel card">
        <div class="panel-head"><div><div class="panel-title">管理员列表</div><div class="panel-desc">只读运营账号可以查看数据和处理低风险反馈，不能改配置、查单、补权益或重处理回调。</div></div></div>
        ${tableOnly(["ID", "账号", "显示名", "角色", "状态", "最近登录", "创建时间", "操作"], rows)}
      </div>
      <div class="panel card">
        <div class="panel-head"><div><div class="panel-title">新增只读运营账号</div><div class="panel-desc">新账号创建后可用账号密码登录后台；初始密码请线下交接，后台不会回显。</div></div></div>
        ${canAdminWrite() ? `
          <div class="form-grid">
            <div class="field"><label>账号</label><input data-admin-field="username" value="${h(adminState.adminCreate.username)}" placeholder="ops@example" maxlength="64" /></div>
            <div class="field"><label>显示名</label><input data-admin-field="displayName" value="${h(adminState.adminCreate.displayName)}" placeholder="运营同事" maxlength="40" /></div>
            <div class="field full"><label>初始密码</label><input data-admin-field="password" type="password" value="${h(adminState.adminCreate.password)}" placeholder="至少 10 位" maxlength="256" autocomplete="new-password" /></div>
          </div>
          <button class="primary" data-action="create-admin">创建只读账号</button>
        ` : `<div class="empty">当前账号为只读权限，不能创建后台账号。</div>`}
      </div>
    </section>
  `);
}

function renderProfiles() {
  const rows = (adminState.lists.profiles?.profiles || []).map((item) => [
    shortId(item.id),
    item.name,
    item.audience || "-",
    item.value || "-",
    item.status,
    shortId(item.userId || item.sessionId),
    formatDate(item.updatedAt || item.createdAt),
    actionCell(`<button class="mini-action" data-action="show-detail" data-detail-type="profiles" data-detail-id="${h(item.id)}">详情</button>`)
  ]);
  return layout(tablePanel("产品档案", "查看用户在 H5 中保存的真实产品档案。", ["档案ID", "名称", "面向人群", "核心价值", "状态", "归属", "更新时间", "操作"], rows, "", paginationControls("profiles", adminState.lists.profiles?.pageInfo)));
}

function renderLetters() {
  const rows = (adminState.lists.letters?.letters || []).map((item) => [item.id.slice(0, 8), item.title, item.status, `${item.templateKey || "-"} ${item.templateVersion || ""}`, item.sessionId?.slice(0, 8) || "-", formatDate(item.createdAt)]);
  const detailRows = rows.length ? (adminState.lists.letters?.letters || []).map((item) => [
    shortId(item.id),
    item.title,
    item.status,
    `${item.templateKey || "-"} ${item.templateVersion || ""}`,
    shortId(item.sessionId),
    formatDate(item.createdAt),
    actionCell(`<button class="mini-action" data-action="show-detail" data-detail-type="letters" data-detail-id="${h(item.id)}">详情</button>`)
  ]) : [];
  const controls = statusFilter("lettersStatus", adminState.filters.lettersStatus, [["", "全部状态"], ["ready", "待领取"], ["claimed", "已领取"], ["draft", "草稿"], ["archived", "已归档"]]);
  return layout(tablePanel("销售信列表", "排查信件状态、模板版本和关联用户。", ["信件ID", "标题", "状态", "模板", "会话", "创建时间", "操作"], detailRows, controls, paginationControls("letters", adminState.lists.letters?.pageInfo)));
}

function renderTasks() {
  const rows = (adminState.lists.tasks?.tasks || []).map((item) => [
    shortId(item.id),
    item.type,
    item.status,
    shortId(item.letterId),
    item.errorCode || "-",
    formatDate(item.updatedAt || item.createdAt),
    actionCell(`
      <button class="mini-action" data-action="show-detail" data-detail-type="tasks" data-detail-id="${h(item.id)}">详情</button>
      ${canAdminWrite() && item.status === "failed" ? `<button class="mini-action warn-action" data-action="retry-task" data-task-id="${h(item.id)}">重试</button>` : ""}
    `)
  ]);
  const controls = statusFilter("tasksStatus", adminState.filters.tasksStatus, [["", "全部状态"], ["queued", "排队中"], ["running", "生成中"], ["succeeded", "已完成"], ["failed", "失败"]]);
  return layout(tablePanel("生成任务", "查看生成任务状态、失败原因，并对失败任务进行重试。", ["任务ID", "类型", "状态", "信件", "错误", "更新时间", "操作"], rows, controls, paginationControls("tasks", adminState.lists.tasks?.pageInfo)));
}

function renderOrders() {
  const rows = (adminState.lists.orders?.orders || []).map((item) => [
    item.id.slice(0, 8),
    item.sessionId?.slice(0, 8) || "-",
    item.title,
    yuan(item.amountCents),
    item.provider,
    item.status,
    item.providerTransactionId || item.providerOrderNo || "-",
    actionCell(`
      <button class="mini-action" data-action="show-detail" data-detail-type="orders" data-detail-id="${h(item.id)}">详情</button>
      ${canAdminWrite() && item.status === "pending" ? `<button class="mini-action" data-action="reconcile-order" data-order-id="${h(item.id)}">查单</button>` : ""}
      ${canAdminWrite() && item.status === "paid" ? `<button class="mini-action" data-action="repair-order-entitlement" data-order-id="${h(item.id)}">补权益</button>` : ""}
    `)
  ]);
  const controls = statusFilter("ordersStatus", adminState.filters.ordersStatus, [["", "全部状态"], ["pending", "待支付"], ["paid", "已支付"], ["payment_failed", "支付失败"], ["closed", "已关闭"], ["refunded", "已退款"]]);
  return layout(tablePanel("订单与支付", "真实支付接入后查看微信交易号、回调和补偿查询。", ["订单号", "会话", "商品", "金额", "模式", "订单状态", "交易号", "补偿"], rows, controls, paginationControls("orders", adminState.lists.orders?.pageInfo)));
}

function renderLedger() {
  const rows = (adminState.lists.entitlements?.entitlements || []).map((item) => [
    shortId(item.id),
    shortId(item.sessionId || item.userId),
    item.type,
    shortId(item.orderId || item.letterId),
    item.status,
    formatDate(item.createdAt),
    actionCell(`<button class="mini-action" data-action="show-detail" data-detail-type="entitlements" data-detail-id="${h(item.id)}">详情</button>`)
  ]);
  const controls = statusFilter("entitlementsStatus", adminState.filters.entitlementsStatus, [["", "全部状态"], ["active", "有效"], ["consumed", "已使用"], ["expired", "已过期"], ["revoked", "已撤销"]]);
  return layout(tablePanel("权益流水", "所有权限从这里计算，不从前端传参决定。", ["流水ID", "用户/会话", "权益类型", "来源", "状态", "时间", "操作"], rows, controls, paginationControls("entitlements", adminState.lists.entitlements?.pageInfo)));
}

function renderLogs() {
  const rows = (adminState.lists.logs?.logs || []).map((item) => [
    item.action,
    item.actorType || "-",
    item.targetType || JSON.stringify(item.detail || {}),
    formatDate(item.createdAt),
    actionCell(`<button class="mini-action" data-action="show-detail" data-detail-type="audit-logs" data-detail-id="${h(item.id)}">详情</button>`)
  ]);
  const controls = `
    <div class="table-controls">
      <label class="control-field">
        <span>事件</span>
        <select data-filter="logsAction">
          ${[
            ["", "全部事件"],
            ["config.update", "配置修改"],
            ["admin.login_failed", "登录失败"],
            ["admin.create", "账号创建"],
            ["admin.update", "账号修改"],
            ["task.retry_failed", "任务重试失败"],
            ["task.retry_succeeded", "任务重试成功"],
            ["order.payment_attempt", "支付拉起尝试"],
            ["order.payment", "支付拉起成功"],
            ["order.payment_failed", "支付拉起失败"],
            ["order.reconcile", "订单查单"],
            ["order.entitlement_rebuild", "权益补发"],
            ["payment_event.reprocess", "回调重处理"],
            ["sms.send_attempt", "短信发送尝试"],
            ["sms.send", "短信发送成功"],
            ["sms.send_failed", "短信发送失败"],
            ["voice.speak_attempt", "语音播放尝试"],
            ["voice.speak", "语音播放"],
            ["voice.transcribe_attempt", "语音输入尝试"],
            ["voice.transcribe", "语音输入"],
            ["feedback.submit", "反馈提交"],
            ["feedback.resolve", "反馈处理"],
            ["feedback.reopen", "反馈重开"]
          ].map(([value, label]) => `<option value="${h(value)}" ${adminState.filters.logsAction === value ? "selected" : ""}>${h(label)}</option>`).join("")}
        </select>
      </label>
      <label class="control-field">
        <span>对象</span>
        <select data-filter="logsTargetType">
          ${[
            ["", "全部对象"],
            ["app_config", "配置"],
            ["admin_user", "后台账号"],
            ["generation_task", "生成任务"],
            ["order", "订单"],
            ["payment_webhook_event", "支付回调"],
            ["sms", "短信服务"],
            ["voice", "语音服务"],
            ["feedback", "用户反馈"]
          ].map(([value, label]) => `<option value="${h(value)}" ${adminState.filters.logsTargetType === value ? "selected" : ""}>${h(label)}</option>`).join("")}
        </select>
      </label>
    </div>
  `;
  return layout(tablePanel("日志审计", "记录谁在什么时候改了什么，以及支付和生成关键事件。", ["类型", "操作人", "内容", "时间", "操作"], rows, controls, paginationControls("logs", adminState.lists.logs?.pageInfo)));
}

function renderFeedback() {
  const rows = (adminState.lists.feedback?.feedback || []).map((item) => [
    item.feedbackStatus === "resolved" ? "已处理" : "待处理",
    item.detail?.category || "用户反馈",
    item.detail?.content || "-",
    shortId(item.actorId),
    formatDate(item.createdAt),
    actionCell(`
      <button class="mini-action" data-action="show-detail" data-detail-type="feedback" data-detail-id="${h(item.id)}">详情</button>
      ${item.feedbackStatus === "resolved"
        ? `<button class="mini-action" data-action="reopen-feedback" data-feedback-id="${h(item.id)}">重开</button>`
        : `<button class="mini-action warn-action" data-action="resolve-feedback" data-feedback-id="${h(item.id)}">处理</button>`}
    `)
  ]);
  const controls = statusFilter("feedbackStatus", adminState.filters.feedbackStatus, [["", "全部状态"], ["open", "待处理"], ["resolved", "已处理"]]);
  return layout(tablePanel("用户反馈", "集中查看用户端提交的问题、建议和异常描述。", ["状态", "类型", "内容", "会话", "时间", "操作"], rows, controls, paginationControls("feedback", adminState.lists.feedback?.pageInfo)));
}

function renderSecurity() {
  return layout(`
    <section class="section split">
      <div class="panel card">
        <div class="panel-head"><div><div class="panel-title">修改后台密码</div><div class="panel-desc">修改成功后，当前账号的所有登录会话都会失效，需要用新密码重新登录。</div></div></div>
        <div class="form-grid">
          <div class="field full"><label>当前密码</label><input type="password" data-security-field="currentPassword" value="${h(adminState.security.currentPassword)}" autocomplete="current-password" maxlength="256" /></div>
          <div class="field"><label>新密码</label><input type="password" data-security-field="newPassword" value="${h(adminState.security.newPassword)}" autocomplete="new-password" maxlength="256" /></div>
          <div class="field"><label>确认新密码</label><input type="password" data-security-field="confirmPassword" value="${h(adminState.security.confirmPassword)}" autocomplete="new-password" maxlength="256" /></div>
        </div>
        <div class="detail-actions">
          <button class="primary" data-action="change-admin-password">保存新密码</button>
        </div>
      </div>
      <div class="panel card">
        <div class="panel-head"><div><div class="panel-title">当前账号</div><div class="panel-desc">这里不显示任何密钥或密码内容。</div></div></div>
        ${detailSection("账号信息", [
          ["账号", adminState.adminUser?.username || "-"],
          ["显示名", adminState.adminUser?.displayName || "-"],
          ["角色", adminState.adminUser?.role || "-"]
        ])}
      </div>
    </section>
  `);
}

function renderPaymentEvents() {
  const rows = (adminState.lists.paymentEvents?.events || []).map((item) => [
    shortId(item.id),
    item.provider,
    item.eventId,
    shortId(item.orderId),
    item.status,
    item.errorMessage || "-",
    formatDate(item.createdAt),
    actionCell(`
      <button class="mini-action" data-action="show-detail" data-detail-type="payment-events" data-detail-id="${h(item.id)}">详情</button>
      ${canAdminWrite() && item.status === "failed" ? `<button class="mini-action warn-action" data-action="reprocess-payment-event" data-event-id="${h(item.id)}">重处理</button>` : ""}
    `)
  ]);
  const controls = statusFilter("paymentEventsStatus", adminState.filters.paymentEventsStatus, [["", "全部状态"], ["received", "已接收"], ["processed", "已处理"], ["failed", "失败"]]);
  return layout(tablePanel("支付回调", "查看微信支付回调事件、失败原因和关联订单。", ["事件ID", "渠道", "回调ID", "订单", "状态", "错误", "时间", "操作"], rows, controls, paginationControls("paymentEvents", adminState.lists.paymentEvents?.pageInfo)));
}

function statusLabel(status) {
  if (status === "ok") return "已就绪";
  if (status === "warn") return "可优化";
  return "缺配置";
}

function statusClass(status) {
  if (status === "ok") return "";
  if (status === "warn") return "warn";
  return "danger";
}

function renderDiagnostics() {
  const diagnostics = adminState.lists.diagnostics || {};
  const summary = diagnostics.summary || {};
  const groups = diagnostics.groups || [];
  return layout(`
    <section class="section grid cols-3">
      ${metric("已就绪", summary.ok ?? 0, "可直接运行")}
      ${metric("可优化", summary.warn ?? 0, "建议补齐")}
      ${metric("缺配置", summary.missing ?? 0, "上线前处理")}
    </section>
    <section class="section panel card">
      <div class="panel-head">
        <div>
          <div class="panel-title">生产配置自检</div>
          <div class="panel-desc">最后检查：${h(formatDate(diagnostics.generatedAt))}</div>
        </div>
        <button class="secondary" data-action="refresh-diagnostics">刷新自检</button>
      </div>
      <div class="diagnostic-grid">
        ${groups.length ? groups.map((group) => `
          <article class="diagnostic-card ${statusClass(group.status)}">
            <div class="diagnostic-head">
              <div>
                <div class="diagnostic-title">${h(group.title)}</div>
                <div class="diagnostic-note">${h(group.note || "")}</div>
              </div>
              <span class="tag ${statusClass(group.status)}">${statusLabel(group.status)}</span>
            </div>
            <div class="diagnostic-items">
              ${(group.items || []).map((item) => `
                <div class="diagnostic-item">
                  <span>${h(item.name)}</span>
                  <strong class="${item.configured ? "ready" : item.required ? "missing" : "optional"}">${item.configured ? "已配置" : item.required ? "缺失" : "未填"}</strong>
                </div>
              `).join("")}
            </div>
          </article>
        `).join("") : `<div class="empty">还没有自检结果，请刷新后台数据。</div>`}
      </div>
    </section>
  `);
}

function metric(label, value, note) {
  return `<div class="metric card"><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-note">${note}</div></div>`;
}

function row(title, meta, status) {
  return `<div class="row-card"><div><div class="row-title">${title}</div><div class="row-meta">${meta}</div></div><span class="tag ${status}">${status === "danger" ? "高优先级" : status === "warn" ? "待确认" : "处理中"}</span></div>`;
}

function switchRow(title, sub, on, path = "") {
  return `<div class="switch-row"><div><div class="switch-text">${title}</div><div class="switch-sub">${sub}</div></div><button class="switch ${on ? "on" : ""}" data-action="toggle" data-toggle-path="${path}"></button></div>`;
}

function field(label, name, value, cls = "") {
  return `<div class="field ${h(cls)}"><label>${h(label)}</label><input data-field="${h(name)}" value="${h(value)}" /></div>`;
}

function area(label, name, value) {
  return `<div class="field full"><label>${h(label)}</label><textarea data-field="${h(name)}">${h(value)}</textarea></div>`;
}

function statusFilter(name, value, options) {
  return `
    <div class="table-controls">
      <label class="control-field">
        <span>状态筛选</span>
        <select data-filter="${h(name)}">
          ${options.map(([optionValue, label]) => `<option value="${h(optionValue)}" ${value === optionValue ? "selected" : ""}>${h(label)}</option>`).join("")}
        </select>
      </label>
    </div>
  `;
}

function paginationControls(pageKey, info) {
  if (!pageKey || !info) return "";
  const page = Number(info.page || 1);
  const returned = Number(info.returned || 0);
  const limit = Number(info.limit || adminState.pageLimit);
  return `
    <div class="pagination-bar">
      <div class="page-meta">第 ${page} 页 · 本页 ${returned} 条 · 每页 ${limit} 条</div>
      <div class="page-actions">
        <button class="mini-action" data-action="page-list" data-page-key="${h(pageKey)}" data-page-delta="-1" ${page <= 1 ? "disabled" : ""}>上一页</button>
        <button class="mini-action" data-action="page-list" data-page-key="${h(pageKey)}" data-page-delta="1" ${info.hasMore ? "" : "disabled"}>下一页</button>
      </div>
    </div>
  `;
}

function tablePanel(title, desc, heads, rows, controls = "", pagination = "") {
  return `
    <section class="section panel card">
      <div class="panel-head"><div><div class="panel-title">${h(title)}</div><div class="panel-desc">${h(desc)}</div></div></div>
      ${controls}
      <div class="table-wrap">
        <table>
          <thead><tr>${heads.map((head) => `<th>${h(head)}</th>`).join("")}</tr></thead>
          <tbody>${rows.length ? rows.map((row) => `<tr>${row.map((cell) => `<td>${cell && typeof cell === "object" && "html" in cell ? cell.html : h(cell)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${heads.length}">暂无数据</td></tr>`}</tbody>
        </table>
      </div>
      ${pagination}
    </section>
  `;
}

function tableOnly(heads, rows) {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr>${heads.map((head) => `<th>${h(head)}</th>`).join("")}</tr></thead>
        <tbody>${rows.length ? rows.map((row) => `<tr>${row.map((cell) => `<td>${cell && typeof cell === "object" && "html" in cell ? cell.html : h(cell)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${heads.length}">暂无数据</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function buildDetailHtml(type, data) {
  if (type === "users") {
    const subject = data.user || data.session || {};
    return [
      detailSection("基础信息", [
        ["用户ID", subject.id || "-"],
        ["手机号", data.user?.phoneMasked || "-"],
        ["状态", subject.status || "-"],
        ["创建时间", formatDate(subject.createdAt)]
      ]),
      detailMiniTable("会话", ["会话ID", "用户ID", "状态", "创建时间"], (data.sessions || []).map((item) => [shortId(item.id), shortId(item.userId), item.status, formatDate(item.createdAt)])),
      detailMiniTable("销售信", ["信件ID", "标题", "状态", "创建时间"], (data.letters || []).map((item) => [shortId(item.id), item.title, item.status, formatDate(item.createdAt)])),
      detailMiniTable("订单", ["订单ID", "商品", "金额", "状态"], (data.orders || []).map((item) => [shortId(item.id), item.title, yuan(item.amountCents), item.status])),
      detailMiniTable("权益", ["流水ID", "类型", "状态", "来源"], (data.entitlements || []).map((item) => [shortId(item.id), item.type, item.status, shortId(item.orderId || item.letterId)]))
    ].join("");
  }
  if (type === "profiles") {
    const profile = data.profile || {};
    return [
      detailSection("产品档案", [
        ["档案ID", profile.id || "-"],
        ["名称", profile.name || "-"],
        ["面向人群", profile.audience || "-"],
        ["核心价值", profile.value || "-"],
        ["状态", profile.status || "-"],
        ["用户", shortId(profile.userId)],
        ["会话", shortId(profile.sessionId)],
        ["更新时间", formatDate(profile.updatedAt || profile.createdAt)]
      ]),
      detailSection("成交证据 / 备注", [["内容", profile.proof || "-"]]),
      detailSection("归属", [
        ["手机号", data.user?.phoneMasked || "-"],
        ["会话状态", data.session?.status || "-"]
      ])
    ].join("");
  }
  if (type === "letters") {
    const letter = data.letter || {};
    return [
      detailSection("信件信息", [
        ["信件ID", letter.id || "-"],
        ["标题", letter.title || "-"],
        ["状态", letter.status || "-"],
        ["模板", `${letter.templateKey || "-"} ${letter.templateVersion || ""}`],
        ["会话", shortId(letter.sessionId)],
        ["领取时间", formatDate(letter.claimedAt)],
        ["导出时间", formatDate(letter.exportedAt)]
      ]),
      detailMiniTable("生成任务", ["任务ID", "状态", "错误", "时间"], (data.tasks || []).map((item) => [shortId(item.id), item.status, item.errorMessage || "-", formatDate(item.updatedAt || item.createdAt)])),
      detailMiniTable("关联订单", ["订单ID", "商品", "金额", "状态"], (data.orders || []).map((item) => [shortId(item.id), item.title, yuan(item.amountCents), item.status])),
      detailMiniTable("权益流水", ["流水ID", "类型", "状态", "来源"], (data.entitlements || []).map((item) => [shortId(item.id), item.type, item.status, shortId(item.orderId || item.letterId)])),
      detailFileTable(data.files || []),
      renderJson(letter.content || {})
    ].join("");
  }
  if (type === "tasks") {
    const task = data.task || {};
    return [
      detailSection("任务信息", [
        ["任务ID", task.id || "-"],
        ["类型", task.type || "-"],
        ["状态", task.status || "-"],
        ["信件", shortId(task.letterId)],
        ["尝试次数", task.attempts || 0],
        ["错误码", task.errorCode || "-"],
        ["错误信息", task.errorMessage || "-"]
      ]),
      canAdminWrite() && task.status === "failed" ? `<button class="primary" data-action="retry-task" data-task-id="${h(task.id)}">重试生成</button>` : "",
      detailSection("关联信件", [["标题", data.letter?.title || "-"], ["状态", data.letter?.status || "-"]]),
      renderJson({ input: task.input, progress: task.progress })
    ].join("");
  }
  if (type === "orders") {
    const order = data.order || {};
    return [
      detailSection("订单信息", [
        ["订单ID", order.id || "-"],
        ["商品", order.title || "-"],
        ["金额", yuan(order.amountCents)],
        ["状态", order.status || "-"],
        ["商户订单号", order.providerOrderNo || "-"],
        ["微信交易号", order.providerTransactionId || "-"],
        ["关联信件", shortId(order.letterId)]
      ]),
      `<div class="detail-actions">
        ${canAdminWrite() && order.status === "pending" ? `<button class="primary" data-action="reconcile-order" data-order-id="${h(order.id)}">查单</button>` : ""}
        ${canAdminWrite() && order.status === "paid" ? `<button class="secondary" data-action="repair-order-entitlement" data-order-id="${h(order.id)}">补发权益</button>` : ""}
      </div>`,
      detailMiniTable("权益流水", ["流水ID", "类型", "状态", "时间"], (data.entitlements || []).map((item) => [shortId(item.id), item.type, item.status, formatDate(item.createdAt)])),
      detailMiniTable("回调事件", ["事件ID", "状态", "错误", "时间"], (data.events || []).map((item) => [shortId(item.id), item.status, item.errorMessage || "-", formatDate(item.createdAt)]))
    ].join("");
  }
  if (type === "entitlements") {
    return detailSection("权益流水", Object.entries(data.entitlement || {}).map(([key, value]) => [key, value]));
  }
  if (type === "payment-events") {
    const event = data.event || {};
    return [
      detailSection("回调事件", [
        ["事件ID", event.id || "-"],
        ["渠道", event.provider || "-"],
        ["回调ID", event.eventId || "-"],
        ["状态", event.status || "-"],
        ["订单", shortId(event.orderId)],
        ["错误", event.errorMessage || "-"]
      ]),
      canAdminWrite() && event.status === "failed" ? `<div class="detail-actions"><button class="primary" data-action="reprocess-payment-event" data-event-id="${h(event.id)}">重新处理回调</button></div>` : "",
      renderJson(event.payload || {})
    ].join("");
  }
  if (type === "feedback") {
    const feedback = data.feedback || {};
    const feedbackId = feedback.id || "";
    const noteValue = adminState.feedbackNotes[feedbackId] || "";
    return [
      detailSection("反馈内容", [
        ["状态", feedback.feedbackStatus === "resolved" ? "已处理" : "待处理"],
        ["类型", feedback.detail?.category || "用户反馈"],
        ["内容", feedback.detail?.content || "-"],
        ["会话", shortId(feedback.actorId)],
        ["提交时间", formatDate(feedback.createdAt)],
        ["处理备注", feedback.handlerNote || "-"]
      ]),
      `<div class="feedback-note-box">
        <label for="feedbackNote">处理备注</label>
        <textarea id="feedbackNote" class="feedback-note-input" data-feedback-note="${h(feedbackId)}" placeholder="${feedback.feedbackStatus === "resolved" ? "写下重新打开的原因" : "写下处理结果或备注"}">${h(noteValue)}</textarea>
        <div class="feedback-note-hint">备注会写入处理记录，便于后续追踪。</div>
      </div>`,
      `<div class="detail-actions">
        ${feedback.feedbackStatus === "resolved"
          ? `<button class="secondary" data-action="reopen-feedback" data-feedback-id="${h(feedback.id)}">重新打开</button>`
          : `<button class="primary" data-action="resolve-feedback" data-feedback-id="${h(feedback.id)}">标记已处理</button>`}
      </div>`,
      detailMiniTable("处理记录", ["事件", "处理人", "备注", "时间"], (data.events || []).map((item) => [item.action, shortId(item.actorId), item.detail?.note || "-", formatDate(item.createdAt)]))
    ].join("");
  }
  if (type === "audit-logs") {
    return renderAuditLogDetail(data.log || {});
  }
  return renderJson(data);
}

async function openDetail(type, id) {
  adminState.detail = { title: "详情", sub: `${type}/${id}`, loading: true, html: "" };
  render();
  try {
    const data = await window.XiabiStore.adminFetch(`/${type}/${id}`);
    adminState.detail = { title: "详情", sub: `${type}/${id}`, loading: false, html: buildDetailHtml(type, data) };
  } catch (error) {
    adminState.detail = { title: "详情", sub: `${type}/${id}`, loading: false, html: `<div class="empty">${h(error.message || "详情加载失败")}</div>` };
  }
  render();
}

function showToast(text) {
  adminState.toast = text;
  render();
  setTimeout(() => {
    adminState.toast = "";
    render();
  }, 1600);
}

function setPath(path, value) {
  if (!path) return;
  const keys = path.split(".");
  let target = adminState;
  while (keys.length > 1) {
    const key = keys.shift();
    target = target[key];
    if (!target) return;
  }
  target[keys[0]] = value;
}

function render() {
  if (!adminState.authChecked) {
    document.getElementById("adminApp").innerHTML = `<div class="admin-login-shell"><section class="login-card card"><div class="brand-name">下笔有元</div><div class="page-desc">正在检查登录状态...</div></section></div>`;
    return;
  }
  if (!adminState.adminUser) {
    document.getElementById("adminApp").innerHTML = renderLogin();
    return;
  }
  const routes = {
    dashboard: renderDashboard,
    miniapp: renderMiniapp,
    guides: renderGuides,
    templates: renderTemplates,
    pricing: renderPricing,
    admins: renderAdmins,
    users: renderUsers,
    profiles: renderProfiles,
    letters: renderLetters,
    tasks: renderTasks,
    orders: renderOrders,
    paymentEvents: renderPaymentEvents,
    ledger: renderLedger,
    feedback: renderFeedback,
    logs: renderLogs,
    security: renderSecurity,
    diagnostics: renderDiagnostics
  };
  const view = routes[adminState.route] || renderDashboard;
  document.getElementById("adminApp").innerHTML = view();
}

document.addEventListener("click", async (event) => {
  const routeTarget = event.target.closest("[data-route]");
  if (routeTarget) {
    setRoute(routeTarget.dataset.route);
    loadAdminLists().then(() => render());
    return;
  }

  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) return;
  const action = actionTarget.dataset.action;
  if (action === "admin-login") {
    try {
      adminState.loginError = "";
      adminState.adminUser = await window.XiabiStore.adminLogin(adminState.loginUsername.trim(), adminState.loginPassword);
      applyRemoteAdminConfig(await window.XiabiStore.syncAdminConfig());
      await loadAdminLists();
      showToast("登录成功");
    } catch (error) {
      adminState.loginError = error.message || "登录失败";
      render();
    }
  } else if (action === "admin-logout") {
    await window.XiabiStore.adminLogout();
    adminState.adminUser = null;
    adminState.loginPassword = "";
    render();
  } else if (action === "save") {
    if (!canAdminWrite()) {
      showToast("当前账号没有权限保存配置");
      return;
    }
    try {
      await window.XiabiStore.saveAdminConfig({
        homeConfig: adminState.homeConfig,
        pricing: adminState.pricing,
        system: adminState.system,
        guideStages: adminState.guideStages,
        templates: getEditableTemplates(),
        updatedAt: new Date().toISOString()
      });
      showToast("配置已保存");
    } catch (error) {
      showToast(error.message || "配置保存失败");
    }
  } else if (action === "preview-user") {
    window.open("./index.html#home", "_blank");
  } else if (action === "refresh-diagnostics") {
    try {
      adminState.lists.diagnostics = await window.XiabiStore.adminFetch("/diagnostics");
      showToast("系统自检已刷新");
    } catch (error) {
      showToast(error.message || "系统自检刷新失败");
    }
  } else if (action === "create-admin") {
    if (!canAdminWrite()) {
      showToast("当前账号没有权限创建后台账号");
      return;
    }
    try {
      const created = await window.XiabiStore.adminPost("/admins", {
        username: adminState.adminCreate.username,
        displayName: adminState.adminCreate.displayName,
        password: adminState.adminCreate.password
      });
      adminState.adminCreate = { username: "", displayName: "", password: "" };
      adminState.lists.admins = await window.XiabiStore.adminFetch("/admins");
      showToast(`已创建后台账号：${created.admin?.username || ""}`);
      render();
    } catch (error) {
      showToast(error.message || "后台账号创建失败");
    }
  } else if (action === "toggle-admin-status") {
    if (!canAdminWrite()) {
      showToast("当前账号没有权限修改后台账号");
      return;
    }
    try {
      await window.XiabiStore.adminPatch(`/admins/${actionTarget.dataset.adminId}`, {
        status: actionTarget.dataset.adminStatus
      });
      adminState.lists.admins = await window.XiabiStore.adminFetch("/admins");
      showToast(actionTarget.dataset.adminStatus === "active" ? "后台账号已启用" : "后台账号已停用");
      render();
    } catch (error) {
      showToast(error.message || "后台账号状态修改失败");
    }
  } else if (action === "reset-admin-password") {
    if (!canAdminWrite()) {
      showToast("当前账号没有权限重置后台密码");
      return;
    }
    const adminId = actionTarget.dataset.adminId;
    const password = String(adminState.adminResetPasswords[adminId] || "");
    if (password.length < 10) {
      showToast("新密码至少需要 10 位");
      return;
    }
    try {
      await window.XiabiStore.adminPatch(`/admins/${adminId}`, { password });
      delete adminState.adminResetPasswords[adminId];
      adminState.lists.admins = await window.XiabiStore.adminFetch("/admins");
      showToast("后台账号密码已重置");
      render();
    } catch (error) {
      showToast(error.message || "后台账号密码重置失败");
    }
  } else if (action === "close-detail") {
    adminState.detail = null;
    render();
  } else if (action === "page-list") {
    const key = actionTarget.dataset.pageKey;
    const delta = Number(actionTarget.dataset.pageDelta || 0);
    if (key && key in adminState.pages && Number.isFinite(delta)) {
      adminState.pages[key] = Math.max(1, Number(adminState.pages[key] || 1) + delta);
      await loadAdminLists();
      render();
    }
  } else if (action === "show-detail") {
    await openDetail(actionTarget.dataset.detailType, actionTarget.dataset.detailId);
  } else if (action === "toggle") {
    if (!canAdminWrite()) {
      showToast("当前账号没有权限修改配置");
      return;
    }
    actionTarget.classList.toggle("on");
    setPath(actionTarget.dataset.togglePath, actionTarget.classList.contains("on"));
  } else if (action === "select-template") {
    adminState.selectedTemplateKey = actionTarget.dataset.templateKey;
    render();
  } else if (action === "select-guide-stage") {
    adminState.selectedGuideIndex = Number(actionTarget.dataset.guideIndex || 0);
    render();
  } else if (action === "add-guide-stage") {
    if (!canAdminWrite()) {
      showToast("当前账号没有权限修改通话引导");
      return;
    }
    adminState.guideStages = [
      ...adminState.guideStages,
      {
        key: `custom_stage_${Date.now()}`,
        title: "新的通话问题",
        question: "这一步想让用户补充什么信息？",
        desc: "写清楚后，用户端下一次会按这个阶段提问。",
        required: false,
        enabled: true,
        options: ["先简单说明", "我想补充细节"]
      }
    ];
    adminState.selectedGuideIndex = adminState.guideStages.length - 1;
    render();
  } else if (action === "add-template") {
    if (!canAdminWrite()) {
      showToast("当前账号没有权限修改模板");
      return;
    }
    const nextKey = `custom_template_${Date.now()}`;
    commitTemplates([
      ...getEditableTemplates(),
      {
        key: nextKey,
        name: "新销售信模板",
        goal: "促进购买/付款",
        scene: "微信私聊",
        status: "draft",
        version: "v1.0",
        structure: ["开头共鸣", "问题拆解", "解决方案", "下一步行动"],
        rules: "语气真诚、具体、克制，避免夸张承诺。"
      }
    ]);
    adminState.selectedTemplateKey = nextKey;
    render();
  } else if (action === "reconcile-order") {
    if (!canAdminWrite()) {
      showToast("当前账号没有权限查单补偿");
      return;
    }
    try {
      await window.XiabiStore.adminPost(`/orders/${actionTarget.dataset.orderId}/reconcile`);
      await loadAdminLists();
      if (adminState.detail?.sub === `orders/${actionTarget.dataset.orderId}`) await openDetail("orders", actionTarget.dataset.orderId);
      showToast("查单完成，订单状态已刷新");
    } catch (error) {
      showToast(error.message || "查单失败");
    }
  } else if (action === "repair-order-entitlement") {
    if (!canAdminWrite()) {
      showToast("当前账号没有权限补发权益");
      return;
    }
    try {
      await window.XiabiStore.adminPost(`/orders/${actionTarget.dataset.orderId}/rebuild-entitlement`);
      await loadAdminLists();
      if (adminState.detail?.sub === `orders/${actionTarget.dataset.orderId}`) await openDetail("orders", actionTarget.dataset.orderId);
      showToast("权益已按订单补发");
    } catch (error) {
      showToast(error.message || "补发权益失败");
    }
  } else if (action === "retry-task") {
    if (!canAdminWrite()) {
      showToast("当前账号没有权限重试生成任务");
      return;
    }
    try {
      await window.XiabiStore.adminPost(`/tasks/${actionTarget.dataset.taskId}/retry`);
      await loadAdminLists();
      if (adminState.detail?.sub === `tasks/${actionTarget.dataset.taskId}`) await openDetail("tasks", actionTarget.dataset.taskId);
      showToast("任务重试完成");
    } catch (error) {
      showToast(error.message || "任务重试失败");
    }
  } else if (action === "reprocess-payment-event") {
    if (!canAdminWrite()) {
      showToast("当前账号没有权限重处理支付回调");
      return;
    }
    try {
      await window.XiabiStore.adminPost(`/payment-events/${actionTarget.dataset.eventId}/reprocess`);
      await loadAdminLists();
      if (adminState.detail?.sub === `payment-events/${actionTarget.dataset.eventId}`) await openDetail("payment-events", actionTarget.dataset.eventId);
      showToast("支付回调已重新处理");
    } catch (error) {
      showToast(error.message || "回调重处理失败");
    }
  } else if (action === "change-admin-password") {
    try {
      if (adminState.security.newPassword !== adminState.security.confirmPassword) {
        showToast("两次输入的新密码不一致");
        return;
      }
      await window.XiabiStore.adminPost("/password", {
        currentPassword: adminState.security.currentPassword,
        newPassword: adminState.security.newPassword
      });
      adminState.adminUser = null;
      adminState.loginPassword = "";
      adminState.security = { currentPassword: "", newPassword: "", confirmPassword: "" };
      showToast("密码已修改，请重新登录");
    } catch (error) {
      showToast(error.message || "密码修改失败");
    }
  } else if (action === "resolve-feedback" || action === "reopen-feedback") {
    try {
      const status = action === "resolve-feedback" ? "resolved" : "open";
      const feedbackId = actionTarget.dataset.feedbackId;
      const note = String(adminState.feedbackNotes[feedbackId] || "").trim();
      await window.XiabiStore.adminPost(`/feedback/${feedbackId}/status`, { status, note });
      delete adminState.feedbackNotes[feedbackId];
      await loadAdminLists();
      if (adminState.detail?.sub === `feedback/${feedbackId}`) await openDetail("feedback", feedbackId);
      showToast(status === "resolved" ? "反馈已标记处理" : "反馈已重新打开");
    } catch (error) {
      showToast(error.message || "反馈状态更新失败");
    }
  }
});

document.addEventListener("change", async (event) => {
  const filterName = event.target.dataset.filter;
  if (filterName && filterName in adminState.filters) {
    adminState.filters[filterName] = event.target.value;
    const pageByFilter = {
      lettersStatus: "letters",
      tasksStatus: "tasks",
      ordersStatus: "orders",
      entitlementsStatus: "entitlements",
      paymentEventsStatus: "paymentEvents",
      feedbackStatus: "feedback",
      logsAction: "logs",
      logsTargetType: "logs"
    };
    if (pageByFilter[filterName]) adminState.pages[pageByFilter[filterName]] = 1;
    try {
      await loadAdminLists();
    } catch (error) {
      showToast(error.message || "列表刷新失败");
    }
    render();
    return;
  }

  const templateField = event.target.dataset.templateField;
  if (templateField) {
    updateSelectedTemplate(templateField, event.target.value);
    render();
    return;
  }

  const fieldName = event.target.dataset.field;
  if (fieldName === "stage_required" || fieldName === "stage_enabled") {
    updateSelectedGuideStage(fieldName, event.target.value);
    render();
  }
});

document.addEventListener("input", (event) => {
  const loginField = event.target.dataset.loginField;
  if (loginField === "username") {
    adminState.loginUsername = event.target.value;
    return;
  }
  if (loginField === "password") {
    adminState.loginPassword = event.target.value;
    return;
  }

  const templateField = event.target.dataset.templateField;
  if (templateField) {
    updateSelectedTemplate(templateField, event.target.value);
    return;
  }

  const securityField = event.target.dataset.securityField;
  if (securityField && securityField in adminState.security) {
    adminState.security[securityField] = event.target.value;
    return;
  }

  const feedbackNote = event.target.dataset.feedbackNote;
  if (feedbackNote) {
    adminState.feedbackNotes[feedbackNote] = event.target.value;
    return;
  }

  const adminField = event.target.dataset.adminField;
  if (adminField && adminField in adminState.adminCreate) {
    adminState.adminCreate[adminField] = event.target.value;
    return;
  }

  const adminResetPassword = event.target.dataset.adminResetPassword;
  if (adminResetPassword) {
    adminState.adminResetPasswords[adminResetPassword] = event.target.value;
    return;
  }

  const fieldName = event.target.dataset.field;
  if (!fieldName) return;
  if (fieldName === "stage_question") {
    updateSelectedGuideStage(fieldName, event.target.value);
    return;
  }
  if (fieldName === "stage_desc") {
    updateSelectedGuideStage(fieldName, event.target.value);
    return;
  }
  if (fieldName === "stage_options") {
    updateSelectedGuideStage(fieldName, event.target.value);
    return;
  }
  if (fieldName === "stage_key" || fieldName === "stage_title" || fieldName === "stage_required" || fieldName === "stage_enabled") {
    updateSelectedGuideStage(fieldName, event.target.value);
    return;
  }
  if (fieldName in adminState.homeConfig) adminState.homeConfig[fieldName] = event.target.value;
  if (fieldName in adminState.pricing) adminState.pricing[fieldName] = event.target.value;
});

if (!location.hash) location.hash = adminState.route;

async function initAdmin() {
  adminState.adminUser = await window.XiabiStore.getAdminSession();
  if (adminState.adminUser) {
    applyRemoteAdminConfig(await window.XiabiStore.syncAdminConfig());
    await loadAdminLists();
  }
  adminState.authChecked = true;
  render();
}

render();
initAdmin();
