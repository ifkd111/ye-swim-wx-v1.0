const api = require("../../utils/api");

Page({
  data: {
    account: "yeats",
    password: "1324",
    loading: false
  },

  onLoad() {
    const session = api.currentSession();
    if (session && session.role) {
      wx.reLaunch({ url: api.homePath(session.role) });
    }
  },

  onAccountInput(event) {
    this.setData({ account: event.detail.value });
  },

  onPasswordInput(event) {
    this.setData({ password: event.detail.value });
  },

  login() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    api
      .call("login", {
        account: this.data.account,
        password: this.data.password,
        openid: "mock-openid"
      })
      .then((result) => {
        api.saveSession(result.session);
        wx.reLaunch({ url: api.homePath(result.session.role) });
      })
      .catch(api.fail)
      .finally(() => this.setData({ loading: false }));
  }
});
