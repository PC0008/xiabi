const mockFlow = require("../../services/mock-flow");

Page({
  data: {
    durationText: "00:48",
    statusText: "正在倾听你的目标",
    currentQuestion: "",
    questionDesc: "",
    holding: false,
    speakerOn: true,
    inputMode: "voice",
    typedText: "",
    hasEnoughInfo: false,
    answerCount: 0,
    quickOptions: [],
    showMicSheet: false
  },

  onLoad(query) {
    const session = mockFlow.getOrCreateSession({
      forceNew: query && query.new === "1"
    });
    const question = mockFlow.getCurrentQuestion();
    this.setData({
      currentQuestion: question.title,
      questionDesc: question.desc,
      quickOptions: question.options || [],
      hasEnoughInfo: session.answers.length >= 3,
      answerCount: session.answers.length,
      statusText: query && query.supplement === "1" ? "继续补充你的素材" : (question.stage || "正在倾听你的目标")
    });
  },

  startHold() {
    this.setData({
      holding: true,
      statusText: "正在听你说"
    });
  },

  endHold() {
    const result = mockFlow.addAnswer("voice");
    this.setData({
      holding: false,
      statusText: "正在整理你的回答",
      currentQuestion: result.question.title,
      questionDesc: result.question.desc,
      quickOptions: result.question.options || [],
      hasEnoughInfo: result.hasEnoughInfo,
      answerCount: result.session.answers.length
    });
  },

  switchToText() {
    this.setData({
      inputMode: "text"
    });
  },

  switchToVoice() {
    this.setData({
      inputMode: "voice"
    });
  },

  onTypeInput(event) {
    this.setData({
      typedText: event.detail.value
    });
  },

  sendTypedText() {
    if (!this.data.typedText.trim()) {
      wx.showToast({
        title: "先输入内容",
        icon: "none"
      });
      return;
    }

    const result = mockFlow.addAnswer("text", this.data.typedText.trim());
    this.setData({
      typedText: "",
      statusText: "正在整理你的文字",
      currentQuestion: result.question.title,
      questionDesc: result.question.desc,
      quickOptions: result.question.options || [],
      hasEnoughInfo: result.hasEnoughInfo,
      answerCount: result.session.answers.length
    });
  },

  chooseQuickOption(event) {
    const value = event.currentTarget.dataset.value;
    const result = mockFlow.addAnswer("option", value);
    this.setData({
      statusText: result.question.stage || "正在继续追问",
      currentQuestion: result.question.title,
      questionDesc: result.question.desc,
      quickOptions: result.question.options || [],
      hasEnoughInfo: result.hasEnoughInfo,
      answerCount: result.session.answers.length
    });
  },

  toggleSpeaker() {
    this.setData({
      speakerOn: !this.data.speakerOn
    });
  },

  showMore() {
    wx.showActionSheet({
      itemList: ["重新说这一轮", "保存草稿", "模拟麦克风未开启"],
      success: (res) => {
        if (res.tapIndex === 2) {
          this.setData({ showMicSheet: true });
        }
      }
    });
  },

  closeMicSheet() {
    this.setData({ showMicSheet: false });
  },

  useTextFromSheet() {
    this.setData({
      showMicSheet: false,
      inputMode: "text"
    });
  },

  openSetting() {
    wx.openSetting({
      complete: () => {
        this.setData({ showMicSheet: false });
      }
    });
  },

  hangup() {
    wx.showModal({
      title: "先保存草稿吗？",
      content: "现在信息还不够写出完整销售信。你可以继续聊，或者先保存草稿。",
      confirmText: "继续聊",
      cancelText: "保存草稿",
      success: (res) => {
        if (!res.confirm) {
          wx.navigateBack();
        }
      }
    });
  },

  goBack() {
    wx.navigateBack();
  },

  goConfirm() {
    wx.navigateTo({
      url: "/pages/confirm/confirm"
    });
  }
});
