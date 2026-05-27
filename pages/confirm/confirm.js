const mockFlow = require("../../services/mock-flow");

Page({
  data: {
    items: []
  },

  onLoad() {
    this.setData({
      items: mockFlow.getSummaryItems()
    });
  },

  generate() {
    mockFlow.createGenerationTask();
    wx.navigateTo({
      url: "/pages/generating/generating"
    });
  },

  backToCall() {
    wx.navigateBack();
  },

  supplementMaterials() {
    wx.navigateTo({
      url: "/pages/call/call?supplement=1"
    });
  }
});
