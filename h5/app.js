const ASSETS = {
  auth: "../assets/ui/zhiduoxing-auth.png",
  home: "../assets/ui/home-pen-paper.png",
  callAvatar: "../assets/ui/zhiduoxing-call-avatar.png",
  generating: "../assets/ui/generating-zdx.png"
};

let adminMockConfig = readAdminMockConfig();
let commerceConfig = Object.assign({
  single: 200,
  annual: 2000,
  payment_mode: "wechat",
  payment_enabled: true,
  annual_enabled: true,
  single_enabled: true,
  pdf_upsell_enabled: true,
  pdf_annual_title: "经常要写销售信，可以开通年卡",
  pdf_annual_desc: "一年内正常使用范围内不限次数生成、保存、继续完善和导出。"
}, adminMockConfig.pricing || {});

let homePage = Object.assign({
  brand_name: "下笔有元",
  hero_title: "说出目标，\n我们帮你写成销售信。",
  hero_subtitle: "告诉我们你想达成的产品或客户目标，智多星会通过提问帮你理清思路，并为你写成有说服力的销售信。",
  primary_button_text: "开始语音通话 · 首次免费",
  free_hint: "首次体验可免费生成一封",
  unclaimed_notice: "你有一封已经写好的销售信，还没有领取。",
  unclaimed_notice_desc: "可以继续回来查看完整内容。",
  unclaimed_button_text: "领取我的销售信"
}, adminMockConfig.homeConfig || {});

function readAdminMockConfig() {
  return window.XiabiMockStore.getAdminConfig();
}

function applyAdminConfig(config) {
  adminMockConfig = config || {};
  commerceConfig = Object.assign({}, commerceConfig, adminMockConfig.pricing || {});
  homePage = Object.assign({}, homePage, adminMockConfig.homeConfig || {});
  questions = buildQuestionsFromConfig(adminMockConfig.guideStages);
}

const defaultQuestions = [
  {
    title: "这封信是给你自己的产品写，还是帮朋友写？",
    desc: "你可以直接说，也可以点一下。",
    stage: "正在确认这封信帮谁写",
    options: [
      { label: "给我自己的产品写", value: "给自己的产品写，主要面向正在观望的潜在客户。", icon: "user" },
      { label: "给自己公司的产品写", value: "给自己公司的产品写，发信主体是公司。", icon: "archive" },
      { label: "帮朋友/客户写", value: "帮朋友或客户写，先作为独立项目整理。", icon: "help" },
      { label: "先作为临时项目", value: "先作为临时项目，不写入长期产品档案。", icon: "plus" }
    ]
  },
  {
    title: "这封信希望实现什么效果？",
    desc: "选一个最接近的目标就行。",
    stage: "正在确认这封信的目标",
    options: [
      { label: "让对方回复我", value: "希望客户看完后愿意回复我，先建立一次沟通。", icon: "refresh" },
      { label: "预约一次沟通", value: "希望客户看完后愿意预约一次沟通。", icon: "records" },
      { label: "促进购买/付款", value: "希望客户看完后愿意购买或付款。", icon: "crown" },
      { label: "邀请合作/代理", value: "希望对方愿意进一步聊合作或代理。", icon: "spark" }
    ]
  },
  {
    title: "这次要写的是哪个产品或服务？",
    desc: "如果没有档案，边聊边建立临时档案。",
    stage: "正在匹配产品档案",
    options: [
      { label: "门店复购方案", value: "产品是门店复购方案，帮助商家提升老客户回购。", icon: "archive" },
      { label: "销售表达辅导", value: "产品是销售表达辅导服务，帮助客户把复杂价值讲得更清楚。", icon: "edit" },
      { label: "新建临时产品", value: "本次先新建临时产品档案，生成前再确认归属。", icon: "plus" }
    ]
  },
  {
    title: "客户现在最担心或最犹豫的是什么？",
    desc: "可以说价格、效果、时间、信任，或者真实反馈。",
    stage: "正在倾听你的目标",
    options: [
      { label: "担心效果", value: "客户最担心效果是否稳定，是否真的能带来改变。", icon: "help" },
      { label: "担心价格", value: "客户会觉得价格需要解释清楚，不想冲动购买。", icon: "crown" },
      { label: "担心复杂", value: "客户担心实施复杂，后续没人持续跟进。", icon: "settings" }
    ]
  }
];

let questions = buildQuestionsFromConfig(adminMockConfig.guideStages);

function buildQuestionsFromConfig(stages) {
  if (!Array.isArray(stages) || !stages.length) return defaultQuestions;
  const iconSets = [
    ["user", "archive", "help", "plus"],
    ["refresh", "records", "crown", "spark"],
    ["archive", "edit", "plus", "doc"],
    ["help", "crown", "settings"]
  ];
  const mapped = stages
    .filter((stage) => stage.enabled !== false)
    .map((stage, stageIndex) => ({
      title: stage.question || defaultQuestions[stageIndex]?.title || stage.title,
      desc: stage.desc || defaultQuestions[stageIndex]?.desc || "你可以直接说，也可以点一下。",
      stage: `正在确认${stage.title || "信息"}`,
      options: (stage.options || []).map((label, optionIndex) => ({
        label,
        value: `${label}。`,
        icon: iconSets[stageIndex]?.[optionIndex] || "doc"
      }))
    }))
    .filter((stage) => stage.title && stage.options.length);
  return mapped.length ? mapped : defaultQuestions;
}

const sampleAnswers = [
  "给自己的产品写，主要面向正在观望的潜在客户。",
  "希望客户看完后愿意预约一次沟通，先把需求讲清楚。",
  "产品是销售表达辅导服务，帮助客户把复杂价值讲得更清楚。",
  "客户担心效果不稳定，也担心投入后没有持续跟进。"
];

const storedState = window.XiabiMockStore.getAppState();
const state = {
  authed: storedState.authed,
  guest: storedState.guest,
  route: location.hash.replace("#", "") || "auth",
  inputMode: "voice",
  holding: false,
  voiceTranscript: "",
  voiceError: "",
  speakerOn: true,
  showMicSheet: false,
  typedText: "",
  feedbackText: "",
  feedbackSent: false,
  answers: storedState.answers,
  pendingLetter: storedState.pendingLetter,
  phoneBound: storedState.phoneBound,
  annualActive: storedState.annualActive,
  generationStep: 0,
  selectedPlan: "annual",
  letter: storedState.letter,
  remoteLetters: [],
  remoteOrders: [],
  entitlements: [],
  entitlementSummary: { annualActive: false, singleCredits: 0, firstFreeUsed: false },
  sessionUser: null,
  phoneMasked: "",
  generationPending: false,
  generationError: "",
  paymentNotice: "",
  paymentRefreshing: false,
  phoneInput: "",
  smsCode: "",
  smsNotice: ""
};

let speechRecognition = null;
let activeSpeechText = "";
let suppressVoiceClick = false;
let assistantAudio = null;

function persist() {
  window.XiabiMockStore.persistAppState(state);
}

function hasAnnualEntitlement() {
  return state.entitlementSummary.annualActive;
}

function hasLetterAccess(letterId) {
  if (!letterId) return false;
  if (hasAnnualEntitlement()) return true;
  const unlocked = state.entitlementSummary.unlockedLetterIds || [];
  if (unlocked.includes(letterId)) return true;
  return state.entitlements.some((item) =>
    item.letterId === letterId &&
    ["single", "first_free_letter"].includes(item.type) &&
    ["active", "used"].includes(item.status)
  );
}

function isLetterComplete(letter) {
  if (!letter) return false;
  return !!(letter.claimed || letter.claimedAt || hasLetterAccess(letter.id));
}

function paymentOpen() {
  return commerceConfig.payment_enabled !== false;
}

function continueWechatPayment(result) {
  const h5Url = result?.payment?.h5Url;
  if (!h5Url) return false;
  state.paymentNotice = "订单已创建，正在打开微信支付。支付完成后回到订单页查看结果。";
  persist();
  const redirectUrl = `${location.origin}${location.pathname}#orders`;
  const separator = h5Url.includes("?") ? "&" : "?";
  window.location.href = `${h5Url}${separator}redirect_url=${encodeURIComponent(redirectUrl)}`;
  return true;
}

function go(route) {
  state.route = route;
  location.hash = route;
  render();
}

window.addEventListener("hashchange", () => {
  state.route = location.hash.replace("#", "") || "auth";
  render();
});

window.addEventListener("xiabi:config-updated", (event) => {
  applyAdminConfig(event.detail || readAdminMockConfig());
  render();
});

function topbar() {
  return `
    <header class="topbar">
      <button class="brand" data-go="home">${homePage.brand_name}</button>
      <nav class="top-links" aria-label="主导航">
        <button data-go="records">记录</button>
        <button data-go="profile">我的</button>
      </nav>
    </header>
  `;
}

function shell(content, options = {}) {
  const appClass = options.call ? "web-app call-page-shell" : "web-app";
  const screenClass = options.call ? "screen call-screen" : "screen";
  return `<div class="${appClass}"><section class="${screenClass}">${content}</section>${options.tab ? tabbar(options.tab) : ""}</div>`;
}

function tabbar(active) {
  return `
    <nav class="tabbar">
      <button class="${active === "home" ? "active" : ""}" data-go="home"><span class="tab-icon">${uiIcon("home")}</span><span>首页</span></button>
      <button class="${active === "records" ? "active" : ""}" data-go="records"><span class="tab-icon">${uiIcon("records")}</span><span>记录</span></button>
      <button class="${active === "profile" ? "active" : ""}" data-go="profile"><span class="tab-icon">${uiIcon("user")}</span><span>我的</span></button>
    </nav>
  `;
}

function currentQuestion() {
  return questions[Math.min(state.answers.length, questions.length - 1)];
}

function getSpeechRecognition() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  return Recognition ? new Recognition() : null;
}

async function playAssistantVoice(text) {
  const content = String(text || "").trim();
  if (!content) return;
  try {
    const result = await window.XiabiMockStore.speak(content);
    if (!result.audioUrl) {
      state.voiceError = result.message || "语音播放暂时不可用，请继续按住说话或切换打字模式。";
      render();
      return;
    }
    if (assistantAudio) assistantAudio.pause();
    assistantAudio = new Audio(result.audioUrl);
    await assistantAudio.play();
  } catch (error) {
    state.voiceError = error.message || "语音播放暂时不可用，请继续按住说话或切换打字模式。";
    render();
  }
}

function speechSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function titleLines() {
  if (homePage.hero_title.includes("\n")) return homePage.hero_title.split("\n");
  const match = homePage.hero_title.match(/^(.*?[，,])(.+)$/);
  if (match) return [match[1], match[2]];
  return [homePage.hero_title, ""];
}

function money(value) {
  return `¥${Number(value || 0)}`;
}

function paymentModeLabel(mode) {
  return mode === "wechat" ? "微信支付" : "支付记录";
}


function moneyFromCents(cents) {
  return `¥${(Number(cents || 0) / 100).toFixed(2).replace(/\.00$/, "")}`;
}

async function loadAccountData() {
  try {
    const [sessionData, lettersData, ordersData, entitlementData] = await Promise.all([
      window.XiabiMockStore.getSession(),
      window.XiabiMockStore.listLetters(),
      window.XiabiMockStore.listOrders(),
      window.XiabiMockStore.getEntitlements()
    ]);
    state.sessionUser = sessionData.user || null;
    state.phoneMasked = state.sessionUser?.phoneMasked || "";
    state.phoneBound = !!state.phoneMasked;
    state.remoteLetters = lettersData.letters || [];
    state.remoteOrders = ordersData.orders || [];
    state.entitlements = entitlementData.entitlements || [];
    state.entitlementSummary = entitlementData.summary || state.entitlementSummary;
    if (!state.letter && state.remoteLetters[0]) applyRemoteLetter(state.remoteLetters[0]);
  } catch (error) {
    // Keep the current screen usable if the network drops.
  }
}

function uiIcon(type, extraClass = "") {
  const cls = `ui-icon ${extraClass}`.trim();
  const icons = {
    home: `<svg class="${cls}" viewBox="0 0 32 32" aria-hidden="true"><path d="M5 14.2 16 5l11 9.2v11.1a1.7 1.7 0 0 1-1.7 1.7h-5.8v-8.4h-7V27H6.7A1.7 1.7 0 0 1 5 25.3z"/></svg>`,
    records: `<svg class="${cls}" viewBox="0 0 32 32" aria-hidden="true"><path d="M8 5.5h16a2 2 0 0 1 2 2v17a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-17a2 2 0 0 1 2-2z"/><path d="M11 11h10M11 16h10M11 21h7"/></svg>`,
    user: `<svg class="${cls}" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 15.7a5.2 5.2 0 1 0 0-10.4 5.2 5.2 0 0 0 0 10.4z"/><path d="M6.5 27c1.4-5 5-7.6 9.5-7.6s8.1 2.6 9.5 7.6"/></svg>`,
    check: `<svg class="${cls}" viewBox="0 0 32 32" aria-hidden="true"><path d="m8 16.5 5.1 5.1L24.5 10"/></svg>`,
    doc: `<svg class="${cls}" viewBox="0 0 32 32" aria-hidden="true"><path d="M9 4.5h10.4L25 10v17.5H9z"/><path d="M19 4.5V10h6M12.5 15.5h8M12.5 20h8M12.5 24.5h5"/></svg>`,
    dot: `<svg class="${cls}" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="5.5"/></svg>`,
    crown: `<svg class="${cls}" viewBox="0 0 32 32" aria-hidden="true"><path d="m5.8 11.5 6.2 5 4-8 4 8 6.2-5-2.1 13H7.9z"/><path d="M8.5 27h15"/></svg>`,
    spark: `<svg class="${cls}" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 4.5 18.4 13l8.1 3-8.1 3L16 27.5 13.6 19l-8.1-3 8.1-3z"/></svg>`,
    image: `<svg class="${cls}" viewBox="0 0 32 32" aria-hidden="true"><path d="M6 7h20v18H6z"/><path d="m9 22 5.3-6 4 4.5 2.3-2.7L25 22"/><circle cx="20.5" cy="12.3" r="2"/></svg>`,
    pdf: `<svg class="${cls}" viewBox="0 0 32 32" aria-hidden="true"><path d="M8 4.5h11L25 10v17.5H8z"/><path d="M19 4.5V10h6"/><path d="M11.5 16.5h3.2c1.7 0 2.8 1 2.8 2.5s-1.1 2.5-2.8 2.5h-3.2v-5zM20 21.5v-5h4.2M20 19h3.5"/></svg>`,
    edit: `<svg class="${cls}" viewBox="0 0 32 32" aria-hidden="true"><path d="M8 23.8 9.2 18 21.5 5.7a3 3 0 0 1 4.2 4.2L13.4 22.2z"/><path d="M19.6 7.6 23.8 11.8M7 27h18"/></svg>`,
    archive: `<svg class="${cls}" viewBox="0 0 32 32" aria-hidden="true"><path d="M6 8h20v5H6z"/><path d="M8.5 13v13h15V13M13 18h6"/></svg>`,
    order: `<svg class="${cls}" viewBox="0 0 32 32" aria-hidden="true"><path d="M9 5h14v22H9z"/><path d="M12 11h8M12 16h8M12 21h5"/></svg>`,
    help: `<svg class="${cls}" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="11"/><path d="M12.5 12a3.8 3.8 0 0 1 3.7-2.6c2.3 0 4 1.4 4 3.4 0 2.6-2.8 3-3.6 5.1"/><circle cx="16" cy="23" r="1"/></svg>`,
    settings: `<svg class="${cls}" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 20.2a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4z"/><path d="M25.5 17.8v-3.6l-3-.9a7.5 7.5 0 0 0-1-1.8l.7-3-3.1-1.8-2.3 2a8 8 0 0 0-2.1 0l-2.3-2-3.1 1.8.7 3a7.5 7.5 0 0 0-1 1.8l-3 .9v3.6l3 .9a7.5 7.5 0 0 0 1 1.8l-.7 3 3.1 1.8 2.3-2a8 8 0 0 0 2.1 0l2.3 2 3.1-1.8-.7-3a7.5 7.5 0 0 0 1-1.8z"/></svg>`,
    plus: `<svg class="${cls}" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 7v18M7 16h18"/></svg>`,
    arrow: `<svg class="${cls}" viewBox="0 0 32 32" aria-hidden="true"><path d="m12 7 9 9-9 9"/></svg>`,
    download: `<svg class="${cls}" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 5v14M10 14l6 6 6-6"/><path d="M7 25h18"/></svg>`,
    refresh: `<svg class="${cls}" viewBox="0 0 32 32" aria-hidden="true"><path d="M24 10a9 9 0 1 0 1 10"/><path d="M24 5v6h-6"/></svg>`
  };
  return icons[type] || "";
}

function callIcon(type) {
  const icons = {
    speaker: `
      <svg class="action-icon" viewBox="0 0 48 48" aria-hidden="true">
        <path class="icon-fill" d="M8 19.5h7.2L26 10.8v26.4l-10.8-8.7H8z" />
        <path class="icon-stroke" d="M31.5 17.5c2.1 1.8 3.4 4.4 3.4 6.9s-1.3 5.1-3.4 6.9" />
        <path class="icon-stroke" d="M36.5 12.4c3.6 3 5.8 7.3 5.8 12s-2.2 9-5.8 12" />
      </svg>
    `,
    mic: `
      <svg class="action-icon" viewBox="0 0 48 48" aria-hidden="true">
        <rect class="icon-fill" x="18" y="8" width="12" height="22" rx="6" />
        <path class="icon-stroke" d="M12.5 22.5c0 6.4 5.1 11.5 11.5 11.5s11.5-5.1 11.5-11.5" />
        <path class="icon-stroke" d="M24 34v6" />
        <path class="icon-stroke" d="M18 40h12" />
      </svg>
    `,
    hang: `
      <svg class="action-icon hang-icon" viewBox="0 0 48 48" aria-hidden="true">
        <path class="icon-stroke" d="M12 28.5c7.1-6.4 16.9-6.4 24 0" />
        <path class="icon-fill" d="M11.3 30.2c-.9.8-.9 2.2-.1 3l2.5 2.6c.8.8 2.1.8 2.9.1l3.4-3.1c.4-.4.6-.9.6-1.5l-.1-2.5c2.3-.5 4.7-.5 7 0l-.1 2.5c0 .6.2 1.1.6 1.5l3.4 3.1c.8.7 2.1.7 2.9-.1l2.5-2.6c.8-.8.8-2.2-.1-3-7.2-6.5-18.8-6.5-26 0z" />
      </svg>
    `
  };
  return icons[type] || "";
}

function buildSummaryItems() {
  return [
    { label: "帮谁写", value: state.answers[0] || "给自己的产品写。" },
    { label: "写信目标", value: state.answers[1] || "让潜在客户理解产品价值，并愿意预约一次沟通。" },
    { label: "产品档案", value: state.answers[2] || "临时产品档案，本次通话中自动整理。" },
    { label: "客户顾虑", value: state.answers[3] || "担心效果不稳定，也担心投入后没有人持续跟进。" }
  ];
}

function renderAuth() {
  return shell(`
    ${topbar()}
    <img class="auth-hero" src="${ASSETS.auth}" alt="智多星" />
    <h1 class="auth-title">我是智多星</h1>
    <p class="auth-desc">开始体验后，智多星会通过几句对话帮你整理目标，并保存写好的销售信。</p>
    <div class="agreement"><span class="agree-dot"></span>我已阅读并同意《用户协议》和《隐私政策》</div>
    <button class="primary-btn" data-action="auth">${uiIcon("user", "btn-svg")}开始体验</button>
    <div class="look-around" data-action="guest">暂不登录，先看看</div>
  `);
}

function renderHome() {
  const lines = titleLines();
  const generationEnabled = homePage.generation_entry_enabled !== false;
  return shell(`
    ${topbar()}
    <h1 class="home-title"><span>${lines[0]}</span>${lines[1]}</h1>
    <p class="home-copy">${homePage.hero_subtitle}</p>
    <img class="home-ill" src="${ASSETS.home}" alt="写销售信插画" />
    <div class="free-hint">${homePage.free_hint}</div>
    <button class="primary-btn ${generationEnabled ? "" : "disabled"}" data-action="start-call">${uiIcon("spark", "btn-svg")} ${generationEnabled ? homePage.primary_button_text : "生成入口暂未开放"}</button>
    ${state.pendingLetter ? `
      <div class="pending-card card">
        <div class="pending-title">${homePage.unclaimed_notice}</div>
        <div class="pending-desc">${homePage.unclaimed_notice_desc}</div>
        <button class="secondary-btn" data-go="generating">${homePage.unclaimed_button_text}</button>
      </div>
    ` : ""}
  `, { tab: "home" });
}

function renderCall() {
  const q = currentQuestion();
  const enough = state.answers.length >= 3;
  return shell(`
    <div class="call-top">
      <button class="call-top-btn" data-go="home">↙</button>
      <div class="call-timer">语音通话中 00:48</div>
      <button class="call-top-btn" data-action="show-mic-sheet">•••</button>
    </div>
    <div class="voice-bars"><i></i><i></i><i></i></div>
    <img class="call-avatar" src="${ASSETS.callAvatar}" alt="智多星" />
    <div class="assistant-name">智多星</div>
    <div class="assistant-state">${state.holding ? "正在听你说话" : q.stage}</div>
    <div class="dots">●●●</div>
    <div class="question-card">
      <div class="question-label">智多星正在提问</div>
      <div class="question-title">${q.title}</div>
      <div class="question-desc">${q.desc}</div>
      <div class="option-grid">
        ${q.options.map((item) => `
          <button class="quick-option" data-answer="${item.value}">
            <span class="option-icon">${uiIcon(item.icon)}</span>
            <span class="option-label">${item.label}</span>
            <span>〉</span>
          </button>
        `).join("")}
      </div>
      ${enough ? `<button class="ready-mini" data-go="confirm">信息够了，查看整理结果</button>` : ""}
    </div>
    ${(state.voiceTranscript || state.voiceError) ? `
      <div class="speech-live ${state.voiceError ? "error" : ""}">
        ${state.voiceError || `我听到：${state.voiceTranscript}`}
      </div>
    ` : ""}
    ${state.inputMode === "voice" ? `
      <div class="voice-controls">
        <div class="call-actions">
          <button class="call-action" data-action="speaker"><span class="action-circle speaker">${callIcon("speaker")}</span><span>扬声器</span></button>
          <button class="call-action" data-action="voice-answer"><span class="action-circle mic ${state.holding ? "holding" : ""}">${callIcon("mic")}</span><span>${state.holding ? "松开发送" : "按住说话"}</span></button>
          <button class="call-action" data-action="hangup"><span class="action-circle hang">${callIcon("hang")}</span><span>挂断</span></button>
        </div>
        ${homePage.text_mode_enabled !== false ? `<div class="switch-mode" data-action="text-mode">切换打字模式 〉</div>` : ""}
      </div>
    ` : `
      <div class="text-controls">
        <div class="text-input-row">
          <input id="typedText" value="${state.typedText}" placeholder="打字告诉智多星" />
          <button class="send-btn" data-action="send-text">发送</button>
        </div>
        ${homePage.text_mode_enabled !== false ? `<div class="switch-mode" data-action="voice-mode">切回语音模式 〉</div>` : ""}
      </div>
    `}
    ${state.showMicSheet ? renderMicSheet() : ""}
  `, { call: true });
}

function renderMicSheet() {
  const unsupported = !speechSupported();
  return `
    <div class="sheet-mask" data-action="close-sheet"></div>
    <div class="bottom-sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-row">
        <div class="sheet-icon">麦</div>
        <div>
          <div class="sheet-title">麦克风权限没有开启</div>
          <div class="sheet-desc">${state.voiceError || (unsupported ? "当前浏览器不支持直接语音转文字，请先改用打字模式。" : "开启后才能按住说话。你也可以先切换打字模式。")}</div>
        </div>
      </div>
      <div class="sheet-note">系统弹窗拒绝后，需要到设置里重新开启。</div>
      <button class="primary-btn" data-action="close-sheet">去开启权限</button>
      <div class="sheet-link" data-action="text-from-sheet">改用打字模式</div>
    </div>
  `;
}

function renderConfirm() {
  const rows = buildSummaryItems().map((item) => `
    <div class="summary-row">
        <div class="summary-icon">${uiIcon("check")}</div>
      <div class="summary-main">
        <div class="summary-label">${item.label}</div>
        <div class="summary-value">${item.value}</div>
      </div>
      <div class="edit-link">修改</div>
    </div>
  `).join("");
  return shell(`
    ${topbar()}
    <div class="tag">${uiIcon("check", "tag-svg")} 智多星已整理</div>
    <h1 class="page-title">写这封销售信的信息已经够了</h1>
    <p class="page-desc">我已经知道这封信要写给谁、想让对方做什么、你的产品解决什么问题。</p>
    <div class="summary-card card">${rows}</div>
    <div class="tip-card" data-go="call">
      <div class="tip-icon">${uiIcon("image")}</div>
      <div>
        <div class="tip-title">建议补充</div>
        <div class="tip-text">如果你有客户反馈、成交故事、真实案例，可以点这里继续补充。没有也可以先生成。</div>
        <div class="tip-link">补充一个案例或素材 〉</div>
      </div>
    </div>
    <div class="confirm-actions">
      <button class="primary-btn" data-action="generate">${uiIcon("spark", "btn-svg")}立即生成销售信</button>
      <button class="secondary-btn" data-go="call">再和智多星聊两句</button>
    </div>
  `);
}

function renderGenerating() {
  const steps = [
    "整理你的表达",
    "匹配销售信结构",
    "设计成交逻辑",
    "写完整信件",
    "排版"
  ];
  const letterReady = !!state.letter;
  const waitingForLetter = state.generationPending && !letterReady && !state.generationError;
  return shell(`
    ${topbar()}
    <img class="generating-hero" src="${ASSETS.generating}" alt="智多星正在整理" />
    <h1 class="page-title">智多星正在<span class="green-text">排队整理</span>这封信</h1>
    <p class="page-desc">绑定手机号后，这封信会保存到你的账号里。生成完成后，我会提醒你回来领取完整内容。</p>
    <div class="steps-card card">
      ${steps.map((text, index) => `
        <div class="step-row ${index <= state.generationStep ? "done" : ""}">
          <div class="step-dot">${index <= state.generationStep ? uiIcon("check", "step-svg") : index + 1}</div>
          <div>${text}</div>
        </div>
      `).join("")}
    </div>
    <div class="contact-note">${homePage.phone_bind_enabled === false ? "这封信会先保存到你的记录里，后续可以回来领取和导出。" : "手机号仅用于确认首次免费权益、保存销售信和结果提醒，不会公开展示。"}</div>
    ${state.generationError ? `<div class="contact-note error-note">${state.generationError}</div><button class="secondary-btn" data-action="generate">重新整理</button>` : ""}
    ${waitingForLetter ? `<button class="primary-btn" disabled>智多星正在写信...</button>` : ""}
    ${letterReady && homePage.phone_bind_enabled === false ? `
      <button class="primary-btn" data-action="skip-phone">保存到我的销售信</button>
    ` : letterReady ? `
      <div class="phone-bind-card card">
        <div class="field-line"><input id="phoneInput" inputmode="tel" value="${state.phoneInput}" placeholder="输入手机号，用于保存和提醒" /></div>
        <div class="code-line">
          <input id="smsCode" inputmode="numeric" value="${state.smsCode}" placeholder="验证码" />
          <button class="secondary-btn inline-btn" data-action="send-sms">发送验证码</button>
        </div>
        ${state.smsNotice ? `<div class="small-note">${state.smsNotice}</div>` : ""}
      </div>
      <button class="primary-btn" data-action="bind-phone">绑定手机号并领取</button>
      <div class="later-link" data-action="skip-phone">先不绑定，稍后再领取</div>
    ` : ""}
  `);
}

function renderLetter(claimedOverride) {
  const letter = state.letter;
  if (!letter) {
    return shell(`
      ${topbar()}
      <div class="empty-card card">
        <div class="empty-title">还没有可查看的销售信</div>
        <div class="empty-desc">完成一次通话后，智多星整理好的内容会出现在这里。</div>
        <button class="secondary-btn empty-action" data-go="records">查看我的销售信</button>
      </div>
    `, { tab: "records" });
  }
  const claimed = claimedOverride ?? isLetterComplete(letter);
  const phoneEnabled = homePage.phone_bind_enabled !== false;
  return shell(`
    ${topbar()}
    <div class="letter-head">
      <div class="doc-tag">${uiIcon("doc", "tag-svg")} ${claimed ? "完整销售信" : "待领取销售信"}</div>
      <h1 class="letter-title">${letter.title}</h1>
      <div class="letter-meta">智多星整理 · ${letter.scene}场景 · 第 ${letter.version} 版</div>
    </div>
    <article class="letter-card card">
      ${letter.paragraphs.map((p, index) => `<p class="paragraph ${!claimed && index > 1 ? "blurred" : ""}">${p}</p>`).join("")}
      ${claimed ? `
        <div class="image-suggestion">
          <div class="image-icon">${uiIcon("image")}</div>
          <div>
            <div class="suggest-title">建议放图：客户反馈截图</div>
            <div class="suggest-desc">放在这里，会让这段更有说服力。</div>
          </div>
        </div>
      ` : `
        <div class="lock-mask">
          <div class="lock-title">完整内容已经写好</div>
          <div class="lock-desc">${phoneEnabled ? "绑定手机号后领取全文，并保存到你的账号。" : "可以先领取全文，并保存到你的本机记录。"}</div>
          <button class="primary-btn" data-go="generating">${phoneEnabled ? "领取完整销售信" : "保存并领取全文"}</button>
        </div>
      `}
    </article>
    ${claimed ? `
      <div class="letter-actions">
        <button class="primary-btn" data-action="save-letter">${uiIcon("download", "btn-svg")}保存并带走</button>
        <div class="rewrite-link" data-go="paywall">${uiIcon("refresh", "link-svg")}让智多星再写一版</div>
      </div>
    ` : ""}
  `);
}

function renderPaywall() {
  const availablePlans = [
    commerceConfig.single_enabled !== false ? "single" : null,
    commerceConfig.annual_enabled !== false ? "annual" : null
  ].filter(Boolean);
  if (!availablePlans.includes(state.selectedPlan)) state.selectedPlan = availablePlans[0] || "single";
  const single = state.selectedPlan === "single";
  const canPay = paymentOpen() && availablePlans.length;
  const buttonText = single ? `单封解锁 ${money(commerceConfig.single)}` : `开通年卡 ${money(commerceConfig.annual)}/年`;
  return shell(`
    ${topbar()}
    <div class="tag">${uiIcon("check", "tag-svg")} 新信件已写好</div>
    <h1 class="page-title">这封信先给你看前半段</h1>
    <div class="preview-card card">
      <p class="paragraph">你现在卡住的地方，不是产品没有价值，而是客户还没有看见这件事和他自己的关系。</p>
      <p class="paragraph">所以这封信不会一上来就介绍功能，而是先把他正在损失的机会讲清楚。</p>
      <p class="paragraph blurred">接下来要把你的案例、价格和行动建议放在同一条成交线上...</p>
      <div class="fade-lock">解锁后查看完整成交逻辑</div>
    </div>
    ${commerceConfig.single_enabled !== false ? offerCard("single", "doc", "单封解锁", "解锁当前这封销售信，7 天内升级年卡可抵扣。", money(commerceConfig.single)) : ""}
    ${commerceConfig.annual_enabled !== false ? offerCard("annual", "crown", "年卡会员", "一年内正常使用范围内不限次数生成、保存和继续完善。", `${money(commerceConfig.annual)}/年`) : ""}
    ${canPay ? `<button class="primary-btn" data-action="create-order">${buttonText}</button>` : `<button class="primary-btn disabled">支付入口暂未开放</button>`}
    <div class="pay-safe">${paymentOpen() ? "支付安全由微信支付保障" : "支付入口维护中，已生成内容会保留在记录里"}</div>
  `);
}

function renderExport() {
  const letter = state.letter;
  if (!letter) {
    return shell(`
      ${topbar()}
      <div class="empty-card card">
        <div class="empty-title">还没有可导出的销售信</div>
        <div class="empty-desc">先完成一次通话，或从记录里打开已经生成的销售信。</div>
        <button class="secondary-btn empty-action" data-go="records">查看我的销售信</button>
      </div>
    `, { tab: "records" });
  }
  const annualActive = hasAnnualEntitlement();
  const canPayAnnual = paymentOpen() && commerceConfig.annual_enabled !== false;
  return shell(`
    ${topbar()}
    <div class="tag">${uiIcon("pdf", "tag-svg")} 打印版带走</div>
    <h1 class="page-title">把这封销售信保存成打印版</h1>
    <p class="page-desc">适合发给客户、团队或自己存档。打开后可直接打印或保存为 PDF。</p>
    <div class="pdf-card card">
      <div class="pdf-sheet">
        <div class="pdf-topline"></div>
        <div class="pdf-title">${letter.title}</div>
        <div class="pdf-meta">智多星整理 · ${letter.scene}场景</div>
        <div class="pdf-line wide"></div>
        <div class="pdf-line"></div>
        <div class="pdf-line short"></div>
        <div class="pdf-stamp">打印版已准备好</div>
      </div>
      <div class="pdf-info">
        <div class="pdf-info-title">这封可以直接导出</div>
        <div class="pdf-info-desc">导出后可以发给客户、保存到手机，或交给团队继续跟进。</div>
      </div>
    </div>
    <div class="export-actions">
      <button class="primary-btn" data-action="export-pdf">${uiIcon("download", "btn-svg")}打开打印版</button>
      <button class="secondary-btn" data-go="records">先保存到我的销售信</button>
    </div>
    ${commerceConfig.pdf_upsell_enabled !== false && commerceConfig.annual_enabled !== false ? `
    <div class="annual-card soft-upsell">
      <div class="annual-icon">${uiIcon("crown")}</div>
      <div>
        <div class="annual-title">${annualActive ? "年卡已经开通" : commerceConfig.pdf_annual_title}</div>
        <div class="annual-desc">${annualActive ? "这封信已经可以继续保存、导出和完善，订单记录里也会保留本次开通记录。" : commerceConfig.pdf_annual_desc}</div>
      </div>
      <div class="annual-price">${money(commerceConfig.annual)}/年</div>
    </div>
    ${annualActive ? `
      <button class="secondary-btn annual-pay-btn" data-go="orders">${uiIcon("order", "btn-svg")}查看订单记录</button>
    ` : !canPayAnnual ? `
      <button class="secondary-btn annual-pay-btn disabled">${uiIcon("crown", "btn-svg")}支付入口暂未开放</button>
    ` : `
      <button class="secondary-btn annual-pay-btn" data-action="annual-pay">${uiIcon("crown", "btn-svg")}微信支付开通年卡 ${money(commerceConfig.annual)}/年</button>
    `}
    <div class="pay-safe">${paymentOpen() ? "支付安全由微信支付保障" : "支付入口维护中，打印版导出不受影响"}</div>
    ` : ""}
  `);
}

function offerCard(plan, icon, name, note, price) {
  const selected = state.selectedPlan === plan;
  const annual = plan === "annual";
  return `
    <button class="offer-card ${annual ? "annual" : ""} ${selected ? "selected" : ""}" data-plan="${plan}">
      <div class="select-dot">${selected ? uiIcon("check") : ""}</div>
      <div class="offer-icon">${uiIcon(icon)}</div>
      <div>
        <div class="offer-name">${name}${annual ? " <span class='text-link'>更划算</span>" : ""}</div>
        <div class="offer-note">${note}</div>
      </div>
      <div class="price">${price}</div>
    </button>
  `;
}

function getRecords() {
  const source = state.remoteLetters.length ? state.remoteLetters : (state.letter ? [state.letter] : []);
  return source.map((letter) => {
    const completed = isLetterComplete(letter);
    const unlocked = hasLetterAccess(letter.id);
    return {
      id: letter.id,
      title: letter.title,
      scene: letter.scene || letter.content?.scene || "销售信",
      status: letter.exported || letter.exportedAt ? "已导出" : unlocked ? "已解锁" : letter.claimed || letter.claimedAt ? "已领取" : "待领取",
      claimed: completed,
      meta: letter.createdAt ? new Date(letter.createdAt).toLocaleString() : "刚刚生成"
    };
  });
}

function renderRecords() {
  return shell(`
    ${topbar()}
    <h1 class="record-title">我的销售信</h1>
    <div class="tabs"><span class="tab active">全部</span><span class="tab">信息未完成</span><span class="tab">待领取</span><span class="tab">待解锁</span><span class="tab">已完成</span></div>
    ${getRecords().length ? getRecords().map((item) => recordCard(item)).join("") : `
      <div class="empty-card card">
        <div class="empty-title">还没有保存的销售信</div>
        <div class="empty-desc">和智多星完成一次通话后，生成的信会自动出现在这里。</div>
        <button class="secondary-btn empty-action" data-go="home">回到首页</button>
      </div>
    `}
    <div class="status-card">
      <div class="status-head">状态说明</div>
      <div class="legend-row"><span class="dot blue"></span><span>信息未完成</span><span>还差关键信息，补充后才能生成信件。</span></div>
      <div class="legend-row"><span class="dot orange"></span><span>待领取</span><span>信件已生成，绑定手机号后可领取完整内容。</span></div>
      <div class="legend-row"><span class="dot purple"></span><span>待解锁</span><span>可预览前半段，解锁后查看完整成交逻辑。</span></div>
      <div class="legend-row"><span class="dot green"></span><span>已完成</span><span>已领取或已解锁，可以随时查看。</span></div>
    </div>
  `, { tab: "records" });
}

function recordCard(item) {
  const pending = !["已领取", "已导出", "已解锁"].includes(item.status);
  return `
    <div class="record-card card" data-letter-id="${item.id || ""}" data-open-letter="${item.claimed ? "true" : "false"}">
      <div class="doc-thumb ${pending ? "orange" : ""}">${uiIcon("doc")}</div>
      <div class="record-main">
        <div class="record-name">${item.title}</div>
        <div class="record-meta">${item.scene} · ${item.meta}</div>
        <div class="record-action">${item.claimed ? "查看完整内容" : item.status === "信息未完成" ? "继续补充信息" : "领取完整内容"}</div>
      </div>
      <div class="status-pill ${pending ? "pending" : ""}">${item.status}</div>
    </div>
  `;
}

function renderProfile() {
  const annualActive = hasAnnualEntitlement();
  const savedCount = state.letter ? 1 : 0;
  const accountLabel = state.phoneMasked || (state.phoneBound ? "手机号已绑定" : "手机号未绑定");
  return shell(`
    ${topbar()}
    <div class="profile-card card">
      <img class="avatar" src="${ASSETS.callAvatar}" alt="王总" />
      <div>
        <div class="profile-name">${state.phoneMasked ? "已绑定用户" : "访客用户"}</div>
        <div class="profile-member">${accountLabel} · ${annualActive ? "年卡会员" : "免费体验用户"}</div>
      </div>
      <button class="bind-btn" data-go="generating">${state.phoneBound ? "已绑定" : "绑定手机号"}</button>
    </div>
    <div class="benefit-card">
      <div class="medal">${uiIcon("check")}</div>
      <div>
        <div class="benefit-title">${annualActive ? "年卡权益生效中" : savedCount ? "已有销售信保存" : "还没有保存销售信"}</div>
        <div class="benefit-desc">${annualActive ? "年卡权益已写入订单流水和权益流水，可继续使用对应权益。" : savedCount ? "你可以继续导出、查看记录，或开通年卡继续完善。" : "开始一次通话后，智多星会把写好的销售信保存在这里。"}</div>
      </div>
    </div>
    <div class="menu-card card">
      <button class="menu-item" data-go="records"><span class="menu-icon">${uiIcon("doc")}</span><span>我的销售信</span><span class="arrow">${uiIcon("arrow")}</span></button>
      <button class="menu-item" data-go="memory"><span class="menu-icon">${uiIcon("archive")}</span><span>我的档案</span><span class="arrow">${uiIcon("arrow")}</span></button>
      <button class="menu-item" data-go="orders"><span class="menu-icon">${uiIcon("order")}</span><span>订单记录</span><span class="arrow">${uiIcon("arrow")}</span></button>
      <button class="menu-item" data-go="paywall"><span class="menu-icon">${uiIcon("crown")}</span><span>升级年卡</span><span class="arrow">${uiIcon("arrow")}</span></button>
      <button class="menu-item" data-go="feedback"><span class="menu-icon">${uiIcon("help")}</span><span>帮助反馈</span><span class="arrow">${uiIcon("arrow")}</span></button>
      <button class="menu-item" data-go="settings"><span class="menu-icon">${uiIcon("settings")}</span><span>设置</span><span class="arrow">${uiIcon("arrow")}</span></button>
    </div>
  `, { tab: "profile" });
}

function renderOrders() {
  const remoteOrders = state.remoteOrders.map((order) => ({
    id: order.id,
    title: order.title,
    amount: moneyFromCents(order.amountCents),
    status: order.status === "paid" ? "已支付" : order.status === "pending" ? "待支付" : order.status,
    time: `${order.createdAt ? new Date(order.createdAt).toLocaleString() : "刚刚"} · ${paymentModeLabel(order.provider)}`,
    icon: order.productType === "annual" ? "crown" : "doc",
    highlight: order.productType === "annual"
  }));
  const orders = [
    ...remoteOrders,
    ...(state.letter ? [{ title: "首次免费销售信", amount: "¥0", status: state.letter?.claimed ? "已领取" : "可领取", time: state.letter?.claimed ? "刚刚" : "生成后领取", icon: "check" }] : [])
  ];
  return shell(`
    ${topbar()}
    <h1 class="record-title">订单记录</h1>
    <p class="page-desc">这里记录你的开通、解锁和免费领取记录。正式支付后，以微信支付结果为准。</p>
    ${state.paymentNotice ? `<div class="contact-note">${state.paymentNotice}</div>` : ""}
    <button class="secondary-btn" data-action="refresh-orders">${state.paymentRefreshing ? "正在刷新..." : "刷新支付结果"}</button>
    ${orders.length ? "" : `
      <div class="empty-card card">
        <div class="empty-title">还没有付费订单</div>
        <div class="empty-desc">单封解锁和年卡开通完成后，会在这里出现订单流水。</div>
        <button class="secondary-btn empty-action" data-go="home">回到首页</button>
      </div>
    `}
    <div class="order-list">
      ${orders.map((order) => `
        <div class="order-card card ${order.highlight ? "highlight" : ""}">
          <div class="order-icon">${uiIcon(order.icon)}</div>
          <div class="order-main">
            <div class="order-title">${order.title}</div>
            <div class="order-meta">${order.time} · ${order.status}</div>
          </div>
          <div class="order-amount">${order.amount}</div>
          ${order.status === "待支付" && order.id ? `<button class="mini-outline" data-action="refresh-order" data-order-id="${order.id}">刷新</button>` : ""}
        </div>
      `).join("")}
    </div>
    <div class="status-card">
      <div class="status-head">订单说明</div>
      <div class="legend-row"><span class="dot green"></span><span>已支付</span><span>已完成支付并写入权益流水，可继续使用对应权益。</span></div>
      <div class="legend-row"><span class="dot orange"></span><span>待支付</span><span>还没有完成支付，不会发放年卡权益。</span></div>
    </div>
  `, { tab: "profile" });
}

function renderFeedback() {
  const quick = ["生成结果不满意", "支付或订单问题", "想增加功能", "使用时遇到问题"];
  return shell(`
    ${topbar()}
    <h1 class="record-title">帮助反馈</h1>
    <p class="page-desc">告诉我们你遇到的问题，或者你希望智多星下一步帮你做什么。</p>
    ${state.feedbackSent ? `
      <div class="success-card card">
        <div class="success-icon">${uiIcon("check")}</div>
        <div>
          <div class="success-title">反馈已收到</div>
          <div class="success-desc">我们会优先处理影响生成、领取和支付的问题。</div>
        </div>
      </div>
    ` : ""}
    <div class="feedback-card card">
      <div class="feedback-label">选择一个类型</div>
      <div class="feedback-tags">
        ${quick.map((item) => `<button class="feedback-tag" data-feedback-tag="${item}">${item}</button>`).join("")}
      </div>
      <div class="feedback-label">补充说明</div>
      <textarea id="feedbackText" class="feedback-input" placeholder="把问题写在这里，比如哪一步不顺、哪句话不满意、希望怎么改。">${state.feedbackText}</textarea>
      <button class="primary-btn" data-action="submit-feedback">${uiIcon("help", "btn-svg")}提交反馈</button>
    </div>
  `, { tab: "profile" });
}

function renderSettings() {
  const accountLabel = state.phoneMasked || (state.phoneBound ? "手机号已绑定" : "手机号未绑定");
  return shell(`
    ${topbar()}
    <h1 class="record-title">设置</h1>
    <div class="settings-card card">
      <div class="setting-row">
        <div>
          <div class="setting-title">当前账号</div>
          <div class="setting-desc">${accountLabel}</div>
        </div>
        <button class="mini-outline" data-go="generating">绑定手机号</button>
      </div>
      <div class="setting-row">
        <div>
          <div class="setting-title">生成完成提醒</div>
          <div class="setting-desc">用于提醒你回来领取写好的销售信。</div>
        </div>
        <span class="switch on"></span>
      </div>
      <div class="setting-row">
        <div>
          <div class="setting-title">保存我的档案</div>
          <div class="setting-desc">开启后，下次写信会少问重复问题。</div>
        </div>
        <span class="switch on"></span>
      </div>
    </div>
    <div class="settings-card card">
      <button class="settings-action" data-go="feedback">${uiIcon("help")}帮助与反馈<span>${uiIcon("arrow", "tiny-arrow")}</span></button>
      <button class="settings-action" data-action="clear-local-cache">${uiIcon("refresh")}清除本机缓存<span>${uiIcon("arrow", "tiny-arrow")}</span></button>
      <button class="settings-action danger" data-action="logout">${uiIcon("user")}退出当前登录<span>${uiIcon("arrow", "tiny-arrow")}</span></button>
    </div>
  `, { tab: "profile" });
}

function renderMemory() {
  return shell(`
    ${topbar()}
    <h1 class="memory-title">我的档案</h1>
    <div class="privacy-note">这些内容只用于帮智多星更好地理解你，你可以随时修改或删除。</div>
    <div class="memory-card card">
      <div class="section-head"><div class="section-icon">${uiIcon("user")}</div><div class="section-title">个人档案</div><div class="text-link">编辑</div></div>
      <div class="kv-row"><span>常用称呼</span><span>王总</span></div>
      <div class="kv-row"><span>写信偏好</span><span>表达直接一点</span></div>
    </div>
    <div class="memory-card card">
      <div class="section-head"><div class="section-icon">${uiIcon("archive")}</div><div class="section-title">产品档案</div></div>
      <div class="segment-row"><span class="segment active">我的产品</span><span class="segment">朋友/客户的产品</span><span class="segment">临时产品</span></div>
      ${profileRow("doc", "门店复购方案", "我的产品", "查看 〉")}
      ${profileRow("spark", "朋友的茶叶礼盒", "临时产品", "确认归属 〉", true)}
      <div class="add-profile">${uiIcon("plus", "plus-svg")}新增产品档案</div>
    </div>
    <div class="memory-card card">
      <div class="section-head"><div class="section-icon">${uiIcon("records")}</div><div class="section-title">写信项目</div></div>
      ${profileRow("doc", "给老客户的复购邀约信", "发信主体：我　使用产品：门店复购方案", "查看 〉")}
      ${profileRow("user", "帮朋友写招商信", "发信主体：朋友　使用产品：朋友的茶叶礼盒", "查看 〉", true)}
    </div>
  `, { tab: "profile" });
}

function profileRow(icon, name, meta, action, orange) {
  return `
    <div class="profile-row">
      <div class="profile-icon ${orange ? "orange-bg" : ""}">${uiIcon(icon)}</div>
      <div class="profile-row-main">
        <div class="small-name">${name}</div>
        <div class="small-meta">${meta}</div>
      </div>
      <div class="text-link">${action.replace("〉", "")}${uiIcon("arrow", "tiny-arrow")}</div>
    </div>
  `;
}

function render() {
  const route = state.route;
  let html;
  if (route === "auth" && !state.authed && !state.guest) html = renderAuth();
  else if (route === "auth") html = renderHome();
  else if (route === "home") html = renderHome();
  else if (route === "call") html = renderCall();
  else if (route === "confirm") html = renderConfirm();
  else if (route === "generating") html = renderGenerating();
  else if (route === "letter") html = renderLetter();
  else if (route === "export") html = renderExport();
  else if (route === "paywall") html = renderPaywall();
  else if (route === "records") html = renderRecords();
  else if (route === "profile") html = renderProfile();
  else if (route === "orders") html = renderOrders();
  else if (route === "feedback") html = renderFeedback();
  else if (route === "settings") html = renderSettings();
  else if (route === "memory") html = renderMemory();
  else html = renderHome();
  document.getElementById("app").innerHTML = html;
}

function addAnswer(value) {
  const nextIndex = state.answers.length;
  state.answers.push(value || sampleAnswers[nextIndex] || sampleAnswers[sampleAnswers.length - 1]);
  persist();
  render();
}

function startVoiceInput() {
  if (state.holding) return;
  state.voiceError = "";
  state.voiceTranscript = "";
  activeSpeechText = "";
  const recognition = getSpeechRecognition();
  if (!recognition) {
    state.showMicSheet = true;
    state.voiceError = "当前浏览器不支持语音转文字，请先切换打字模式。";
    render();
    return;
  }
  speechRecognition = recognition;
  recognition.lang = "zh-CN";
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.onresult = (event) => {
    let text = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      text += event.results[index][0].transcript;
    }
    activeSpeechText = text.trim();
    state.voiceTranscript = activeSpeechText;
    if (state.route === "call") render();
  };
  recognition.onerror = (event) => {
    const reason = event.error === "not-allowed" ? "没有麦克风权限，请允许后再试。" : "这次没有听清楚，可以再按住说一遍。";
    state.voiceError = reason;
    state.holding = false;
    if (state.route === "call") render();
  };
  recognition.onend = () => {
    state.holding = false;
    if (activeSpeechText) {
      const answer = activeSpeechText;
      activeSpeechText = "";
      state.voiceTranscript = "";
      addAnswer(answer);
      return;
    }
    if (!state.voiceError) state.voiceError = "没有识别到内容，可以再按住说一遍。";
    if (state.route === "call") render();
  };
  try {
    state.holding = true;
    render();
    recognition.start();
  } catch (error) {
    state.holding = false;
    state.voiceError = "语音入口启动失败，请再试一次或切换打字模式。";
    render();
  }
}

function stopVoiceInput() {
  if (!speechRecognition) return;
  try {
    speechRecognition.stop();
  } catch (error) {
    state.holding = false;
    render();
  }
}

function applyRemoteLetter(remoteLetter) {
  if (!remoteLetter) return;
  const content = remoteLetter.content || {};
  const complete = !!remoteLetter.claimedAt || hasLetterAccess(remoteLetter.id);
  state.letter = {
    id: remoteLetter.id,
    title: content.title || remoteLetter.title || "给潜在客户的一封成交销售信",
    scene: remoteLetter.scene || content.scene || "成交邀约",
    version: content.version || 1,
    claimed: complete,
    exported: !!remoteLetter.exportedAt,
    unlockPlan: null,
    paragraphs: Array.isArray(content.paragraphs) ? content.paragraphs : []
  };
  state.pendingLetter = !state.letter.claimed;
  persist();
}

async function refreshOrders(orderId) {
  state.paymentRefreshing = true;
  state.paymentNotice = "正在刷新支付结果...";
  render();
  try {
    if (orderId) {
      await window.XiabiMockStore.getOrderPaymentStatus(orderId);
    } else {
      const pending = state.remoteOrders.filter((order) => order.status === "pending");
      await Promise.all(pending.map((order) => window.XiabiMockStore.getOrderPaymentStatus(order.id).catch(() => null)));
    }
    await loadAccountData();
    state.paymentNotice = "支付结果已刷新。如果刚完成付款，微信回调可能还需要一点时间。";
  } catch (error) {
    state.paymentNotice = error.message || "支付结果刷新失败，请稍后再试。";
  } finally {
    state.paymentRefreshing = false;
    if (state.route === "orders") render();
  }
}

document.addEventListener("pointerdown", (event) => {
  const voiceTarget = event.target.closest('[data-action="voice-answer"]');
  if (!voiceTarget) return;
  event.preventDefault();
  suppressVoiceClick = true;
  startVoiceInput();
});

document.addEventListener("pointerup", (event) => {
  const voiceTarget = event.target.closest('[data-action="voice-answer"]');
  if (!voiceTarget && !state.holding) return;
  event.preventDefault();
  stopVoiceInput();
});

document.addEventListener("pointercancel", () => {
  stopVoiceInput();
});

document.addEventListener("click", async (event) => {
  const goTarget = event.target.closest("[data-go]");
  if (goTarget) {
    go(goTarget.dataset.go);
    if (["records", "orders", "profile"].includes(goTarget.dataset.go)) {
      loadAccountData().then(() => {
        if (["records", "orders", "profile"].includes(state.route)) render();
      });
    }
    return;
  }

  const answerTarget = event.target.closest("[data-answer]");
  if (answerTarget) {
    addAnswer(answerTarget.dataset.answer);
    return;
  }

  const planTarget = event.target.closest("[data-plan]");
  if (planTarget) {
    state.selectedPlan = planTarget.dataset.plan;
    render();
    return;
  }

  const feedbackTag = event.target.closest("[data-feedback-tag]");
  if (feedbackTag) {
    state.feedbackText = `${feedbackTag.dataset.feedbackTag}：`;
    render();
    return;
  }

  const openLetter = event.target.closest("[data-open-letter]");
  if (openLetter) {
    const letterId = openLetter.dataset.letterId;
    if (letterId) {
      try {
        applyRemoteLetter(await window.XiabiMockStore.getLetter(letterId));
      } catch (error) {
        return;
      }
    } else {
      if (!state.letter) return;
      state.letter.claimed = openLetter.dataset.openLetter === "true";
      persist();
    }
    go("letter");
    return;
  }

  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) return;
  const action = actionTarget.dataset.action;

  if (action === "auth") {
    state.authed = true;
    window.XiabiMockStore.setAuthed(true);
    go("home");
  } else if (action === "guest") {
    state.guest = true;
    window.XiabiMockStore.setGuest(true);
    go("home");
  } else if (action === "start-call") {
    if (homePage.generation_entry_enabled === false) return;
    if (!state.authed) {
      state.guest = false;
      window.XiabiMockStore.clearGuest();
      go("auth");
      return;
    }
    state.answers = [];
    state.inputMode = "voice";
    persist();
    go("call");
  } else if (action === "voice-answer") {
    if (suppressVoiceClick) {
      suppressVoiceClick = false;
      return;
    }
    startVoiceInput();
  } else if (action === "text-mode") {
    if (homePage.text_mode_enabled === false) return;
    state.inputMode = "text";
    render();
  } else if (action === "voice-mode") {
    state.inputMode = "voice";
    render();
  } else if (action === "send-text") {
    const input = document.getElementById("typedText");
    const value = input && input.value.trim();
    if (value) addAnswer(value);
  } else if (action === "speaker") {
    state.speakerOn = !state.speakerOn;
    render();
    if (state.speakerOn && state.route === "call") {
      const question = currentQuestion();
      playAssistantVoice(question?.title || question?.stage || "");
    } 
  } else if (action === "hangup") {
    go("home");
  } else if (action === "show-mic-sheet") {
    state.showMicSheet = true;
    render();
  } else if (action === "close-sheet") {
    state.showMicSheet = false;
    render();
  } else if (action === "text-from-sheet") {
    state.showMicSheet = false;
    state.inputMode = "text";
    render();
  } else if (action === "generate") {
    state.letter = null;
    state.pendingLetter = false;
    state.generationPending = true;
    state.generationError = "";
    state.generationStep = 0;
    go("generating");
    startGenerationTicker();
    window.XiabiMockStore.createGenerationTask(state.answers)
      .then((task) => window.XiabiMockStore.getLetter(task.letterId))
      .then((remoteLetter) => {
        state.generationPending = false;
        applyRemoteLetter(remoteLetter);
        loadAccountData();
        if (state.route === "generating" || state.route === "letter") render();
      })
      .catch(() => {
        state.generationPending = false;
        state.generationError = "写信服务暂时没有完成，请稍后再试。";
        if (state.route === "generating") render();
      });
  } else if (action === "bind-phone") {
    try {
      const result = await window.XiabiMockStore.bindPhone(state.phoneInput, state.smsCode);
      state.phoneBound = true;
      state.phoneMasked = result.phoneMasked || state.phoneMasked;
      state.smsNotice = `已绑定 ${result.phoneMasked}`;
    } catch (error) {
      state.smsNotice = error.message || "手机号绑定失败，请检查验证码。";
      render();
      return;
    }
    if (state.letter?.id) {
      try {
        const remoteLetter = await window.XiabiMockStore.claimLetter(state.letter.id);
        applyRemoteLetter(remoteLetter);
      } catch (error) {
        state.generationError = error.message || "领取失败，请稍后再试。";
        render();
        return;
      }
    } else {
      state.generationError = "还没有可领取的销售信。";
      render();
      return;
    }
    state.pendingLetter = false;
    persist();
    go("letter");
  } else if (action === "send-sms") {
    try {
      const result = await window.XiabiMockStore.sendSmsCode(state.phoneInput);
      state.smsNotice = `验证码已发送到 ${result.phoneMasked}`;
    } catch (error) {
      state.smsNotice = error.message || "验证码发送失败。";
    }
    render();
  } else if (action === "refresh-orders") {
    await refreshOrders();
  } else if (action === "refresh-order") {
    await refreshOrders(actionTarget.dataset.orderId);
  } else if (action === "skip-phone") {
    if (!state.letter) {
      state.generationError = "还没有可保存的销售信。";
      render();
      return;
    }
    state.pendingLetter = true;
    persist();
    go("letter");
  } else if (action === "create-order") {
    if (!paymentOpen() || (state.selectedPlan === "single" && commerceConfig.single_enabled === false) || (state.selectedPlan === "annual" && commerceConfig.annual_enabled === false)) return;
    try {
      const result = await window.XiabiMockStore.createOrder({
        productType: state.selectedPlan,
        letterId: state.letter?.id || null
      });
      if (continueWechatPayment(result)) return;
      state.paymentNotice = result.payment?.message || "订单已创建，请等待支付结果。";
      await loadAccountData();
      go("orders");
    } catch (error) {
      state.paymentNotice = error.message || "订单创建失败，请稍后再试。";
      render();
    }
  } else if (action === "save-letter") {
    go("export");
  } else if (action === "annual-pay") {
    if (!paymentOpen() || commerceConfig.annual_enabled === false) return;
    try {
      const result = await window.XiabiMockStore.createOrder({ productType: "annual", letterId: state.letter?.id || null });
      if (continueWechatPayment(result)) return;
      state.paymentNotice = result.payment?.message || "订单已创建，请等待支付结果。";
      await loadAccountData();
      go("orders");
    } catch (error) {
      state.paymentNotice = error.message || "订单创建失败，请稍后再试。";
      render();
    }
  } else if (action === "export-pdf") {
    if (!state.letter) {
      state.generationError = "还没有可导出的销售信。";
      go("generating");
      return;
    }
    try {
      const result = await window.XiabiMockStore.exportLetter(state.letter.id);
      state.letter.exported = true;
      state.pendingLetter = false;
      persist();
      if (result.downloadUrl) window.open(result.downloadUrl, "_blank");
      await loadAccountData();
      go("records");
    } catch (error) {
      state.generationError = error.message || "导出失败，请稍后再试。";
      render();
    }
  } else if (action === "submit-feedback") {
    const input = document.getElementById("feedbackText");
    state.feedbackText = input ? input.value.trim() : state.feedbackText;
    try {
      await window.XiabiMockStore.submitFeedback(state.feedbackText);
      state.feedbackSent = true;
      render();
    } catch (error) {
      state.feedbackText = error.message || state.feedbackText;
      render();
    }
  } else if (action === "clear-local-cache") {
    window.XiabiMockStore.clearAppState();
    state.authed = false;
    state.guest = false;
    state.answers = [];
    state.pendingLetter = false;
    state.phoneBound = false;
    state.phoneMasked = "";
    state.sessionUser = null;
    state.annualActive = false;
    state.letter = null;
    go("auth");
  } else if (action === "logout") {
    window.XiabiMockStore.logout();
    state.authed = false;
    state.guest = false;
    state.phoneBound = false;
    state.phoneMasked = "";
    state.sessionUser = null;
    go("auth");
  }
});

document.addEventListener("input", (event) => {
  if (event.target.id === "typedText") {
    state.typedText = event.target.value;
  } else if (event.target.id === "feedbackText") {
    state.feedbackText = event.target.value;
  } else if (event.target.id === "phoneInput") {
    state.phoneInput = event.target.value;
  } else if (event.target.id === "smsCode") {
    state.smsCode = event.target.value;
  }
});

let generationTimer = null;
function startGenerationTicker() {
  if (generationTimer) clearInterval(generationTimer);
  generationTimer = setInterval(() => {
    state.generationStep = Math.min(state.generationStep + 1, 4);
    if (state.route === "generating") render();
    if (state.generationStep >= 4) clearInterval(generationTimer);
  }, 650);
}

if (!location.hash) {
  location.hash = state.authed || state.guest ? "home" : "auth";
}
render();
window.XiabiMockStore.syncPublicConfig();
loadAccountData().then(() => render());
