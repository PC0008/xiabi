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
  homeConfig: Object.assign({
    brand_name: "下笔有元",
    hero_title: "说出目标，我们帮你写成销售信。",
    hero_subtitle: "告诉我们你想达成的产品或客户目标，智多星会通过提问帮你理清思路，并为你写成有说服力的销售信。",
    primary_button_text: "开始语音通话 · 首次免费",
    free_hint: "首次体验可免费生成一封",
    unclaimed_notice: "你有一封已经写好的销售信，还没有领取。",
    allow_guest_preview: true,
    generation_entry_enabled: true,
    text_mode_enabled: true,
    phone_bind_enabled: true
  }, savedAdminConfig.homeConfig || {}),
  pricing: Object.assign({
    single: 200,
    annual: 2000,
    payment_mode: "mock",
    payment_enabled: true,
    annual_enabled: true,
    single_enabled: true,
    pdf_upsell_enabled: true,
    pdf_annual_title: "经常要写销售信，可以开通年卡",
    pdf_annual_desc: "一年内正常使用范围内不限次数生成、保存、继续完善和导出。"
  }, savedAdminConfig.pricing || {}),
  guideStages: savedAdminConfig.guideStages || defaultGuideStages
};

function readSavedAdminConfig() {
  return window.XiabiMockStore.getAdminConfig();
}

const navItems = [
  ["dashboard", "概览", "dashboard"],
  ["miniapp", "H5 配置", "phone"],
  ["guides", "通话引导", "guide"],
  ["templates", "销售信模板", "template"],
  ["pricing", "价格权益", "crown"],
  ["users", "用户管理", "user"],
  ["letters", "销售信管理", "doc"],
  ["orders", "订单支付", "order"],
  ["ledger", "权益流水", "ledger"],
  ["logs", "日志审计", "log"]
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

const users = [
  ["U10021", "王总", "未绑定", "免费体验", "4", "1", "今天 11:42"],
  ["U10020", "陈女士", "已绑定", "年卡", "12", "6", "今天 10:18"],
  ["U10019", "李经理", "已绑定", "单封解锁", "3", "2", "昨天 19:44"]
];

const letters = [
  ["L20260523001", "给潜在客户的一封成交销售信", "已领取", "微信私聊成交信 v1.3", "王总", "今天 11:20"],
  ["L20260523002", "招商合作邀约信", "信息未完成", "合作代理邀请信 v0.8", "李经理", "今天 09:31"],
  ["L20260522009", "给老客户的复购邀约信", "待领取", "微信私聊成交信 v1.3", "陈女士", "昨天 20:08"]
];

const orders = [
  ["O20260523001", "王总", "年卡", "¥2000", "mock", "待支付", "未回调"],
  ["O20260522011", "陈女士", "年卡", "¥2000", "mock", "已支付", "已处理"],
  ["O20260521008", "李经理", "单封解锁", "¥200", "mock", "已支付", "已处理"]
];

const ledger = [
  ["E20260523001", "王总", "首次免费", "L20260523001", "已使用", "今天 11:20"],
  ["E20260522011", "陈女士", "年卡", "O20260522011", "生效中", "昨天 20:11"],
  ["E20260521008", "李经理", "单封解锁", "O20260521008", "已使用", "5月21日"]
];

const logs = [
  ["配置修改", "运营A", "修改首页按钮文案", "今天 11:02"],
  ["支付回调", "系统", "订单 O20260522011 回调成功", "昨天 20:11"],
  ["生成失败", "系统", "L20260523002 缺少客户顾虑", "今天 09:35"]
];

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
    log: '<svg viewBox="0 0 32 32"><path d="M7 6h18v20H7z"/><path d="M11 11h10M11 16h10M11 21h6"/></svg>'
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
            <button class="secondary" data-action="save">保存 mock 配置</button>
            <button class="ghost" data-action="preview-user">查看用户端</button>
          </div>
        </section>
        ${content}
      </main>
      ${adminState.toast ? `<div class="toast">${adminState.toast}</div>` : ""}
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
    users: "查看用户、手机号、权益和使用记录。",
    letters: "排查每一封销售信的状态、模板和任务来源。",
    orders: "查看订单、支付状态、回调和补偿入口。",
    ledger: "权益只从订单和权益流水计算，前端不直接决定权限。",
    logs: "记录配置修改、支付回调、生成失败和敏感操作。"
  };
  return desc[route] || "";
}

function renderDashboard() {
  return layout(`
    <section class="section grid cols-4">
      ${metric("今日新增用户", "28", "+16%")}
      ${metric("通话会话数", "64", "正常")}
      ${metric("销售信生成", "41", "失败 2")}
      ${metric("支付金额", "¥4,400", "成功率 92%")}
    </section>
    <section class="section split">
      <div class="panel card">
        <div class="panel-head"><div><div class="panel-title">待处理事项</div><div class="panel-desc">先处理会影响领取、支付和生成的问题。</div></div></div>
        <div class="list">
          ${row("2 个生成失败任务", "需要查看失败原因并决定是否重试", "danger")}
          ${row("1 个支付待回调订单", "等待回调或触发补偿查询", "warn")}
          ${row("3 个手机号未绑定待领取", "用户已生成但尚未领取完整内容", "")}
        </div>
      </div>
      <div class="panel card">
        <div class="panel-head"><div><div class="panel-title">系统开关</div><div class="panel-desc">一期关键能力必须能随时关闭。</div></div></div>
        ${switchRow("新通话入口", "开启后用户可进入通话页", adminState.homeConfig.generation_entry_enabled, "homeConfig.generation_entry_enabled")}
        ${switchRow("新生成任务", "关闭后只保留历史查看", adminState.homeConfig.generation_entry_enabled, "homeConfig.generation_entry_enabled")}
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
        </div>
      </div>
      <div class="panel card">
        <div class="panel-head"><div><div class="panel-title">入口开关</div><div class="panel-desc">所有影响转化的入口都由后台控制。</div></div></div>
        ${switchRow("游客可浏览首页", "游客能看首页，但进入通话需授权", adminState.homeConfig.allow_guest_preview, "homeConfig.allow_guest_preview")}
        ${switchRow("开始生成入口", "控制首页主按钮是否可点击", adminState.homeConfig.generation_entry_enabled, "homeConfig.generation_entry_enabled")}
        ${switchRow("打字模式入口", "通话页显示切换打字模式", adminState.homeConfig.text_mode_enabled, "homeConfig.text_mode_enabled")}
        ${switchRow("手机号授权入口", "排队生成页引导绑定手机号", adminState.homeConfig.phone_bind_enabled, "homeConfig.phone_bind_enabled")}
      </div>
    </section>
  `);
}

function renderGuides() {
  return layout(`
    <section class="section split">
      <div class="panel card">
        <div class="panel-head"><div><div class="panel-title">通话阶段顺序</div><div class="panel-desc">这些问题在通话页内部引导，不做独立三连页面。</div></div><button class="primary">新增阶段</button></div>
        <div class="list">
          ${adminState.guideStages.map((stage, index) => `
            <div class="row-card guide-stage">
              <div>
                <div class="row-title">${index + 1}. ${stage.title}</div>
                <div class="row-meta">${stage.question}</div>
                <div class="row-meta">选项：${stage.options.join(" / ")}</div>
              </div>
              <span class="tag ${stage.required ? "" : "warn"}">${stage.enabled === false ? "停用" : stage.required ? "必答" : "可跳过"}</span>
            </div>
          `).join("")}
        </div>
      </div>
      <div class="panel card">
        <div class="panel-head"><div><div class="panel-title">阶段配置示例</div><div class="panel-desc">当前选中：帮谁写。</div></div></div>
        <div class="form-grid">
          ${field("阶段 key", "stage_key", "recipient_scope")}
          ${field("排序", "sort", "1")}
          ${area("问题文案", "stage_question", adminState.guideStages[0].question)}
          ${area("说明文案", "stage_desc", adminState.guideStages[0].desc)}
          ${area("快捷选项", "stage_options", adminState.guideStages[0].options.join("\n"))}
          ${field("写入位置", "write_to", "本次项目 / 产品档案")}
          ${field("适用用户", "user_scope", "新用户 / 多产品用户 / 免费用户")}
        </div>
      </div>
    </section>
  `);
}

function renderTemplates() {
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
        <div class="panel-head"><div><div class="panel-title">价格与支付模式</div><div class="panel-desc">测试阶段用 mock，正式阶段接真实微信支付。</div></div></div>
        <div class="form-grid">
          ${field("单封解锁价格", "single", adminState.pricing.single)}
          ${field("年卡价格", "annual", adminState.pricing.annual)}
          <div class="field"><label>支付模式</label><select data-field="payment_mode"><option ${adminState.pricing.payment_mode === "mock" ? "selected" : ""}>mock</option><option ${adminState.pricing.payment_mode === "wechat" ? "selected" : ""}>wechat</option></select></div>
          <div class="field"><label>年卡推荐标签</label><input value="更划算" /></div>
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
        ${switchRow("7 天内升级抵扣", "单封解锁后升级年卡可抵扣", true)}
      </div>
    </section>
  `);
}

function renderUsers() {
  return layout(tablePanel("用户列表", "查看用户基础信息和权益状态。", ["用户ID", "昵称", "手机号", "权益", "会话", "信件", "最近访问"], users));
}

function renderLetters() {
  return layout(tablePanel("销售信列表", "排查信件状态、模板版本和关联用户。", ["信件ID", "标题", "状态", "模板", "用户", "创建时间"], letters));
}

function renderOrders() {
  return layout(tablePanel("订单与支付", "真实支付接入后查看微信交易号、回调和补偿查询。", ["订单号", "用户", "商品", "金额", "模式", "订单状态", "回调"], orders));
}

function renderLedger() {
  return layout(tablePanel("权益流水", "所有权限从这里计算，不从前端传参决定。", ["流水ID", "用户", "权益类型", "来源", "状态", "时间"], ledger));
}

function renderLogs() {
  return layout(tablePanel("日志审计", "记录谁在什么时候改了什么，以及支付和生成关键事件。", ["类型", "操作人", "内容", "时间"], logs));
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
  return `<div class="field ${cls}"><label>${label}</label><input data-field="${name}" value="${value}" /></div>`;
}

function area(label, name, value) {
  return `<div class="field full"><label>${label}</label><textarea data-field="${name}">${value}</textarea></div>`;
}

function tablePanel(title, desc, heads, rows) {
  return `
    <section class="section panel card">
      <div class="panel-head"><div><div class="panel-title">${title}</div><div class="panel-desc">${desc}</div></div><button class="secondary">导出</button></div>
      <div class="table-wrap">
        <table>
          <thead><tr>${heads.map((head) => `<th>${head}</th>`).join("")}</tr></thead>
          <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody>
        </table>
      </div>
    </section>
  `;
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
  const routes = {
    dashboard: renderDashboard,
    miniapp: renderMiniapp,
    guides: renderGuides,
    templates: renderTemplates,
    pricing: renderPricing,
    users: renderUsers,
    letters: renderLetters,
    orders: renderOrders,
    ledger: renderLedger,
    logs: renderLogs
  };
  const view = routes[adminState.route] || renderDashboard;
  document.getElementById("adminApp").innerHTML = view();
}

document.addEventListener("click", (event) => {
  const routeTarget = event.target.closest("[data-route]");
  if (routeTarget) {
    setRoute(routeTarget.dataset.route);
    return;
  }

  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) return;
  const action = actionTarget.dataset.action;
  if (action === "save") {
    window.XiabiMockStore.setAdminConfig({
      homeConfig: adminState.homeConfig,
      pricing: adminState.pricing,
      guideStages: adminState.guideStages,
      updatedAt: new Date().toISOString()
    });
    showToast("mock 配置已保存");
  } else if (action === "preview-user") {
    window.open("./index.html#home", "_blank");
  } else if (action === "toggle") {
    actionTarget.classList.toggle("on");
    setPath(actionTarget.dataset.togglePath, actionTarget.classList.contains("on"));
  }
});

document.addEventListener("input", (event) => {
  const fieldName = event.target.dataset.field;
  if (!fieldName) return;
  if (fieldName === "stage_question") {
    adminState.guideStages[0].question = event.target.value;
    return;
  }
  if (fieldName === "stage_desc") {
    adminState.guideStages[0].desc = event.target.value;
    return;
  }
  if (fieldName === "stage_options") {
    adminState.guideStages[0].options = event.target.value.split("\n").map((item) => item.trim()).filter(Boolean);
    return;
  }
  if (fieldName in adminState.homeConfig) adminState.homeConfig[fieldName] = event.target.value;
  if (fieldName in adminState.pricing) adminState.pricing[fieldName] = event.target.value;
});

if (!location.hash) location.hash = adminState.route;
render();
