Page({
  data: {
    avatarUrl: "",
    nickname: "",
    agreed: false
  },

  onChooseAvatar(event) {
    this.setData({
      avatarUrl: event.detail.avatarUrl
    });
  },

  onNicknameInput(event) {
    this.setData({
      nickname: event.detail.value
    });
  },

  toggleAgreement() {
    this.setData({
      agreed: !this.data.agreed
    });
  },

  submitAuth() {
    if (!this.data.agreed) {
      wx.showToast({
        title: "请先同意协议",
        icon: "none"
      });
      return;
    }

    wx.setStorageSync("mockUserProfile", {
      nickname: this.data.nickname || "王总",
      avatarUrl: this.data.avatarUrl,
      authed: true
    });

    wx.redirectTo({
      url: "/pages/home/home"
    });
  },

  lookAround() {
    wx.setStorageSync("mockGuest", true);
    wx.redirectTo({
      url: "/pages/home/home"
    });
  }
});
