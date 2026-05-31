const env = require("./env");

App({
  globalData: {
    env,
    session: null
  },

  onLaunch() {
    if (!env.useMock && wx.cloud) {
      wx.cloud.init({
        env: env.envId,
        traceUser: true
      });
    }

    const session = wx.getStorageSync("session");
    if (session && session.account) {
      this.globalData.session = session;
    }
  }
});
