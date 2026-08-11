const api = require("../../utils/api");

Page({
  data: { viewer: {}, members: [], logs: [], loading: true },
  onShow() { if (!api.requireSession("student")) return; this.load(); },
  load() {
    this.setData({ loading: true });
    api.call("consumptionHomeData").then((data) => {
      this.setData({ viewer: data.viewer || {}, members: data.members || [], logs: data.logs || [], loading: false });
    }).catch((error) => { this.setData({ loading: false }); api.fail(error); });
  },
  logout() { api.clearSession(); wx.reLaunch({ url: "/pages/login/login" }); }
});
