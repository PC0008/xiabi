const mockFlow = require("../../services/mock-flow");

Page({
  data: {
    selectedPlan: "annual",
    payButtonText: "开通年卡 ¥2000/年"
  },

  selectPlan(event) {
    const plan = event.currentTarget.dataset.plan;
    this.setData({
      selectedPlan: plan,
      payButtonText: plan === "single" ? "单封解锁 ¥200" : "开通年卡 ¥2000/年"
    });
  },

  mockPay() {
    mockFlow.completeGeneration(true);
    wx.showToast({
      title: this.data.selectedPlan === "single" ? "已模拟解锁" : "已模拟开通",
      icon: "success"
    });
    setTimeout(() => {
      wx.navigateTo({
        url: "/pages/letter/letter?claimed=true"
      });
    }, 550);
  }
});
