Page({
  data: {
    profile: {}
  },

  onShow() {
    this.setData({
      profile: wx.getStorageSync("mockUserProfile") || {}
    });
  },

  goHome() {
    wx.redirectTo({
      url: "/pages/home/home"
    });
  },

  goRecords() {
    wx.redirectTo({
      url: "/pages/records/records"
    });
  },

  goMemory() {
    wx.navigateTo({
      url: "/pages/memory/memory"
    });
  }
});
