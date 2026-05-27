const mockFlow = require("../../services/mock-flow");

Page({
  data: {
    ready: false,
    steps: [
      { text: "智多星正在整理你的表达", done: false },
      { text: "智多星正在匹配销售信结构", done: false },
      { text: "智多星正在设计成交逻辑", done: false },
      { text: "智多星正在写完整信件", done: false },
      { text: "智多星正在排版", done: false }
    ]
  },

  onLoad() {
    this.stepIndex = 0;
    this.timer = setInterval(() => {
      const steps = this.data.steps.map((item, index) => Object.assign({}, item, {
        done: index <= this.stepIndex
      }));
      this.setData({
        steps,
        ready: this.stepIndex >= steps.length - 1
      });
      this.stepIndex += 1;

      if (this.stepIndex > steps.length) {
        clearInterval(this.timer);
      }
    }, 520);
  },

  onUnload() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  },

  mockPhone() {
    mockFlow.completeGeneration(true);
    wx.setStorageSync("mockPhoneBound", true);
    wx.removeStorageSync("mockPendingLetter");
    wx.showToast({
      title: "已模拟授权",
      icon: "success"
    });

    setTimeout(() => {
      wx.navigateTo({
        url: "/pages/letter/letter?claimed=true"
      });
    }, 650);
  },

  skipPhone() {
    mockFlow.completeGeneration(false);
    wx.setStorageSync("mockPendingLetter", true);
    wx.showModal({
      title: "这封信会继续生成",
      content: "绑定手机号后，你可以领取完整内容，并且下次回来继续完善。",
      confirmText: "先返回首页",
      cancelText: "继续看看",
      success: (res) => {
        if (res.confirm) {
          wx.redirectTo({
            url: "/pages/home/home"
          });
        } else {
          wx.navigateTo({
            url: "/pages/letter/letter?claimed=false"
          });
        }
      }
    });
  }
});
