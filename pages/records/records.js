const mockFlow = require("../../services/mock-flow");

Page({
  data: {
    records: []
  },

  onShow() {
    this.setData({
      records: mockFlow.getRecords()
    });
  },

  openLetter(event) {
    const rawClaimed = event.currentTarget.dataset.claimed;
    const claimed = rawClaimed !== false && rawClaimed !== "false";
    wx.navigateTo({
      url: `/pages/letter/letter?claimed=${claimed ? "true" : "false"}`
    });
  },

  goHome() {
    wx.redirectTo({
      url: "/pages/home/home"
    });
  },

  goProfile() {
    wx.redirectTo({
      url: "/pages/profile/profile"
    });
  }
});
