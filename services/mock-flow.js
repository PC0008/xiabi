const SESSION_KEY = "mockConversationSession";
const LETTER_KEY = "mockSalesLetter";
const RECORDS_KEY = "mockSalesLetterRecords";

const questions = [
  {
    title: "这封信是给你自己的产品写，还是帮朋友写？",
    desc: "你可以直接说，也可以点一下。",
    stage: "正在确认这封信帮谁写",
    options: [
      { label: "给我自己的产品写", value: "给自己的产品写，主要面向正在观望的潜在客户。", icon: "♙" },
      { label: "给自己公司的产品写", value: "给自己公司的产品写，发信主体是公司。", icon: "▥" },
      { label: "帮朋友/客户写", value: "帮朋友或客户写，先作为独立项目整理。", icon: "♧" },
      { label: "先作为临时项目", value: "先作为临时项目，不写入长期产品档案。", icon: "□" }
    ]
  },
  {
    title: "这封信希望实现什么效果？",
    desc: "选一个最接近的目标就行。",
    stage: "正在确认这封信的目标",
    options: [
      { label: "让对方回复我", value: "希望客户看完后愿意回复我，先建立一次沟通。", icon: "↩" },
      { label: "预约一次沟通", value: "希望客户看完后愿意预约一次沟通。", icon: "◎" },
      { label: "促进购买/付款", value: "希望客户看完后愿意购买或付款。", icon: "¥" },
      { label: "邀请合作/代理", value: "希望对方愿意进一步聊合作或代理。", icon: "✦" }
    ]
  },
  {
    title: "这次要写的是哪个产品或服务？",
    desc: "如果没有档案，边聊边建立临时档案。",
    stage: "正在匹配产品档案",
    options: [
      { label: "门店复购方案", value: "产品是门店复购方案，帮助商家提升老客户回购。", icon: "▣" },
      { label: "销售表达辅导", value: "产品是销售表达辅导服务，帮助客户把复杂价值讲得更清楚。", icon: "✎" },
      { label: "新建临时产品", value: "本次先新建临时产品档案，生成前再确认归属。", icon: "+" }
    ]
  },
  {
    title: "客户现在最担心或最犹豫的是什么？",
    desc: "可以说价格、效果、时间、信任，或者真实反馈。",
    stage: "正在倾听你的目标",
    options: [
      { label: "担心效果", value: "客户最担心效果是否稳定，是否真的能带来改变。", icon: "!" },
      { label: "担心价格", value: "客户会觉得价格需要解释清楚，不想冲动购买。", icon: "¥" },
      { label: "担心复杂", value: "客户担心实施复杂，后续没人持续跟进。", icon: "…" }
    ]
  }
];

const sampleAnswers = [
  "给自己的产品写，主要面向正在观望的潜在客户。",
  "希望客户看完后愿意预约一次沟通，先把需求讲清楚。",
  "产品是销售表达辅导服务，帮助客户把复杂价值讲得更清楚。",
  "客户担心效果不稳定，也担心投入后没有持续跟进。"
];

function read(key, fallback) {
  try {
    const value = wx.getStorageSync(key);
    return value || fallback;
  } catch (error) {
    return fallback;
  }
}

function write(key, value) {
  wx.setStorageSync(key, value);
}

function nowLabel() {
  const date = new Date();
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `今天 ${hour}:${minute}`;
}

function buildItems(answers) {
  return [
    { label: "帮谁写", value: answers[0] || "给自己的产品写。" },
    { label: "写信目标", value: answers[1] || "让潜在客户理解产品价值，并愿意预约一次沟通。" },
    { label: "产品档案", value: answers[2] || "临时产品档案，本次通话中自动整理。" },
    { label: "客户顾虑", value: answers[3] || "担心效果不稳定，也担心投入后没有人持续跟进。" }
  ];
}

function getOrCreateSession(options) {
  const saved = read(SESSION_KEY, null);
  if (saved && !options.forceNew) {
    return saved;
  }

  const session = {
    id: `session_${Date.now()}`,
    answers: [],
    items: buildItems([]),
    created_at_label: nowLabel()
  };
  write(SESSION_KEY, session);
  return session;
}

function getCurrentQuestion() {
  const session = getOrCreateSession({});
  const index = Math.min(session.answers.length, questions.length - 1);
  return questions[index];
}

function getQuestionByAnswerCount(answerCount) {
  const index = Math.min(answerCount, questions.length - 1);
  return questions[index];
}

function addAnswer(mode, text) {
  const session = getOrCreateSession({});
  const nextIndex = session.answers.length;
  const answerText = text || sampleAnswers[nextIndex] || sampleAnswers[sampleAnswers.length - 1];

  session.answers.push({
    mode,
    text: answerText,
    created_at_label: nowLabel()
  });
  session.items = buildItems(session.answers.map((item) => item.text));
  write(SESSION_KEY, session);

  const questionIndex = Math.min(session.answers.length, questions.length - 1);
  return {
    session,
    question: questions[questionIndex],
    hasEnoughInfo: session.answers.length >= 3
  };
}

function getSummaryItems() {
  const session = getOrCreateSession({});
  return session.items && session.items.length ? session.items : buildItems([]);
}

function buildLetter(items) {
  const target = items.find((item) => item.label === "写信目标");
  const concern = items.find((item) => item.label === "客户顾虑");

  return {
    id: `letter_${Date.now()}`,
    title: "给潜在客户的一封成交销售信",
    scene: "成交邀约",
    version: 1,
    created_at_label: nowLabel(),
    claimed: false,
    paragraphs: [
      "你好，我认真想了你现在遇到的问题：产品有价值，但客户还没有真正理解为什么现在就该行动。",
      target ? `这封信的重点不是堆功能，而是围绕“${target.value}”把客户当下最关心的结果讲清楚。` : "这封信的重点不是堆功能，而是把客户当下最关心的结果讲清楚。",
      concern ? `我也会提前回应客户的顾虑：${concern.value}。当这些顾虑被看见，客户才更容易继续往下聊。` : "我也会提前回应客户的顾虑。当这些顾虑被看见，客户才更容易继续往下聊。",
      "如果你愿意，我们可以先从一次轻量沟通开始。我会根据你的具体情况，帮你判断哪一块最值得先改，避免你继续在低效表达上消耗时间。"
    ]
  };
}

function createGenerationTask() {
  const items = getSummaryItems();
  const letter = buildLetter(items);
  write(LETTER_KEY, letter);
  return {
    id: `task_${Date.now()}`,
    letter_id: letter.id,
    status: "generating"
  };
}

function getLetter() {
  return read(LETTER_KEY, buildLetter(getSummaryItems()));
}

function saveRecord(letter) {
  const records = read(RECORDS_KEY, []);
  const nextRecords = [
    {
      id: letter.id,
      title: letter.title,
      scene: letter.scene,
      status: letter.claimed ? "已领取" : "待领取",
      claimed: letter.claimed,
      created_at_label: letter.created_at_label
    }
  ].concat(records.filter((item) => item.id !== letter.id));
  write(RECORDS_KEY, nextRecords);
}

function completeGeneration(claimed) {
  const letter = getLetter();
  letter.claimed = !!claimed;
  write(LETTER_KEY, letter);
  saveRecord(letter);
  wx.setStorageSync("mockPendingLetter", !letter.claimed);
  return letter;
}

function getRecords() {
  const records = read(RECORDS_KEY, []);
  if (records.length) {
    return records;
  }

  return [
    {
      id: "sample_claimed",
      title: "给潜在客户的一封成交销售信",
      scene: "成交邀约",
      status: "已领取",
      claimed: true,
      created_at_label: "今天 11:20"
    },
    {
      id: "sample_pending",
      title: "给老客户的复购邀约信",
      scene: "成交邀约",
      status: "待领取",
      claimed: false,
      created_at_label: "已生成 · 未绑定手机号"
    },
    {
      id: "sample_incomplete",
      title: "招商合作邀约信",
      scene: "合作邀约",
      status: "信息未完成",
      claimed: false,
      created_at_label: "还差客户顾虑和行动目标"
    },
    {
      id: "sample_locked",
      title: "朋友圈成交短信",
      scene: "成交邀约",
      status: "待解锁",
      claimed: false,
      created_at_label: "二次生成 · 可预览"
    }
  ];
}

module.exports = {
  questions,
  getOrCreateSession,
  getCurrentQuestion,
  getQuestionByAnswerCount,
  addAnswer,
  getSummaryItems,
  createGenerationTask,
  completeGeneration,
  getLetter,
  getRecords
};
