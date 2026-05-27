const homePage = {
  brand_name: "下笔有元",
  top_slogan: "你只管说，智多星帮你写。",
  hero_title: "说出目标，\n我们帮你写成销售信。",
  hero_subtitle: "告诉我们你想达成的产品或客户目标，智多星会通过提问帮你理清思路，并为你写成有说服力的销售信。",
  primary_button_text: "开始语音通话 · 首次免费",
  free_hint: "首次体验可免费生成一封",
  unclaimed_notice: "你有一封已经写好的销售信，还没有领取。",
  unclaimed_notice_desc: "可以继续回来查看完整内容。",
  unclaimed_button_text: "领取我的销售信",
  pain_points: [
    "产品很好，但写出来没有成交力",
    "客户明明需要，却不知道怎么说服他",
    "一写就像广告，客户看了不想回"
  ],
  steps_title: "你不用会写，开口说就行",
  steps: [
    "跟智多星说说产品和客户",
    "智多星帮你追问并整理",
    "生成一封能发出去的销售信"
  ],
  hero_image_url: "",
  bottom_nav: [
    { key: "home", label: "首页", icon: "⌂" },
    { key: "records", label: "记录", icon: "▤" },
    { key: "profile", label: "我的", icon: "○" }
  ],
  allow_guest_preview: true,
  generation_entry_enabled: true
};

const switches = {
  guest_home_preview: true,
  new_conversation: true,
  new_generation: true,
  text_mode: true,
  payment_entry: true
};

module.exports = {
  homePage,
  switches
};
