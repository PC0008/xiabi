Page({
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

  goProfile() {
    wx.redirectTo({
      url: "/pages/profile/profile"
    });
  }
});
