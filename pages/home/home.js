const miniappApi = require("../../services/miniapp-api");

const fallbackHomePage = {
  brand_name: "下笔有元",
  hero_title: "说出目标，\n我们帮你写成销售信。",
  hero_subtitle: "告诉我们你想达成的产品或客户目标，智多星会通过提问帮你理清思路，并为你写成有说服力的销售信。",
  primary_button_text: "开始语音通话 · 首次免费",
  free_hint: "首次体验可免费生成一封",
  unclaimed_notice: "你有一封已经写好的销售信",
  unclaimed_notice_desc: "还没有领取完整内容，可以继续回来查看。",
  unclaimed_button_text: "领取我的销售信",
  bottom_nav: [
    { key: "home", label: "首页", icon: "⌂" },
    { key: "records", label: "记录", icon: "▤" },
    { key: "profile", label: "我的", icon: "○" }
  ],
  generation_entry_enabled: true
};

const fallbackSwitches = {
  new_conversation: true,
  new_generation: true,
  text_mode: true,
  payment_entry: true,
  guest_home_preview: true
};

function normalizeHomeState(homePage, switches) {
  const finalHomePage = Object.assign({}, fallbackHomePage, homePage || {});
  const finalSwitches = Object.assign({}, fallbackSwitches, switches || {});
  const configNav = Array.isArray(finalHomePage.bottom_nav) ? finalHomePage.bottom_nav : [];
  const bottomNav = fallbackHomePage.bottom_nav.map((item, index) => Object.assign(
    {},
    item,
    configNav[index] || {}
  ));
  const startDisabled = !finalHomePage.generation_entry_enabled
    || !finalSwitches.new_conversation
    || !finalSwitches.new_generation;

  return {
    homePage: finalHomePage,
    titleLines: String(finalHomePage.hero_title || "").split("\n"),
    bottomNav,
    switches: finalSwitches,
    startDisabled
  };
}

Page({
  data: {
    hasPendingLetter: false,
    configError: false,
    homePage: fallbackHomePage,
    titleLines: fallbackHomePage.hero_title.split("\n"),
    bottomNav: fallbackHomePage.bottom_nav,
    switches: fallbackSwitches,
    startDisabled: false
  },

  onLoad() {
    this.loadHomeConfig();
  },

  onShow() {
    this.setData({
      hasPendingLetter: !!wx.getStorageSync("mockPendingLetter")
    });
  },

  loadHomeConfig() {
    miniappApi.config.getMiniappConfig()
      .then((res) => {
        if (!res || !res.success) {
          throw new Error(res && res.error ? res.error.message : "配置加载失败");
        }

        const config = res.data || {};
        this.setData(Object.assign(
          { configError: false },
          normalizeHomeState(config.home_page, config.switches)
        ));
      })
      .catch(() => {
        this.setData({
          configError: true
        });
      });
  },

  startConversation() {
    if (this.data.startDisabled) {
      wx.showToast({
        title: "当前暂不可开始新的通话",
        icon: "none"
      });
      return;
    }

    const profile = wx.getStorageSync("mockUserProfile");
    if (!profile || !profile.authed) {
      wx.showToast({
        title: "先授权头像昵称",
        icon: "none"
      });
      setTimeout(() => {
        wx.redirectTo({
          url: "/pages/auth/auth"
        });
      }, 500);
      return;
    }

    wx.navigateTo({
      url: "/pages/call/call?new=1"
    });
  },

  claimLetter() {
    wx.navigateTo({
      url: "/pages/generating/generating"
    });
  },

  goRecords() {
    wx.navigateTo({
      url: "/pages/records/records"
    });
  },

  goProfile() {
    wx.navigateTo({
      url: "/pages/profile/profile"
    });
  }
});
