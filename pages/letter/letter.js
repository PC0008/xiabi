const mockFlow = require("../../services/mock-flow");

Page({
  data: {
    claimed: true,
    letter: {
      title: "给潜在客户的一封成交销售信",
      scene: "成交邀约",
      version: 1,
      paragraphs: []
    }
  },

  onLoad(query) {
    const letter = mockFlow.getLetter();
    const claimed = query.claimed !== "false" && letter.claimed !== false;
    this.setData({
      claimed,
      letter: Object.assign({}, letter, { claimed })
    });
  },

  claimNow() {
    wx.navigateTo({
      url: "/pages/generating/generating"
    });
  },

  saveLetter() {
    wx.showToast({
      title: "已保存",
      icon: "success"
    });
  },

  goPaywall() {
    wx.navigateTo({
      url: "/pages/paywall/paywall"
    });
  }
});
