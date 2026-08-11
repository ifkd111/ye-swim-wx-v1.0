const env = require("./env");
const runtime = require("./utils/runtime");

App({
  globalData: {
    env,
    session: null
  },

  onLaunch() {
    if (!runtime.useMock() && wx.cloud) {
      wx.cloud.init({
        env: env.envId,
        traceUser: true
      });
    }

    let session = wx.getStorageSync("session");
    if (runtime.developerMockEnabled() && session && !session.testLogin) {
      wx.removeStorageSync("session");
      session = null;
    }
    if (session && session.account) {
      this.globalData.session = session;
    }
  }
});
