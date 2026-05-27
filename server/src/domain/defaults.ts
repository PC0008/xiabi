export const TENANT_ID = "main";

export const defaultHomeConfig = {
  brand_name: "下笔有元",
  hero_title: "说出目标，\n我们帮你写成销售信。",
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
};

export const defaultPricing = {
  single: 200,
  annual: 2000,
  payment_mode: "wechat",
  payment_enabled: true,
  annual_enabled: true,
  single_enabled: true,
  pdf_upsell_enabled: true,
  pdf_annual_title: "经常要写销售信，可以开通年卡",
  pdf_annual_desc: "一年内正常使用范围内不限次数生成、保存、继续完善和导出。"
};

export const defaultGuideStages = [
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

export const defaultTemplates = [
  {
    key: "wechat_private_sales_letter",
    name: "微信私聊成交信",
    goal: "促进购买/付款",
    scene: "我的产品 / 公司产品",
    status: "enabled",
    version: "v1.0",
    structure: ["开头共鸣", "痛点拆解", "解决方案", "证据", "行动引导"]
  },
  {
    key: "appointment_letter",
    name: "预约沟通信",
    goal: "预约一次沟通",
    scene: "服务咨询",
    status: "enabled",
    version: "v1.0",
    structure: ["理解处境", "低门槛邀请", "明确沟通价值", "预约入口"]
  }
];

export const defaultSystemConfig = {
  generation_enabled: true,
  payment_enabled: true,
  sms_enabled: true,
  voice_enabled: true,
  file_export_enabled: true
};

export const defaultConfigByScope = {
  home: defaultHomeConfig,
  pricing: defaultPricing,
  guideStages: defaultGuideStages,
  templates: defaultTemplates,
  system: defaultSystemConfig
} as const;

export type ConfigScope = keyof typeof defaultConfigByScope;

export function configScopes(): ConfigScope[] {
  return Object.keys(defaultConfigByScope) as ConfigScope[];
}
