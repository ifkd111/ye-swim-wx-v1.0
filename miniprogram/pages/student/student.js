const api = require("../../utils/api");
const profile = require("../../utils/profile");

Page({
  data: { viewer: {}, members: [], logs: [], loading: true, loadError: "", profileVisible: false, profileNickname: "", profileAvatar: "", profileSaving: false },
  onShow() { if (!api.requireSession("student")) return; this.load(); },
  load() {
    this.setData({ loading: true, loadError: "" });
    api.call("consumptionHomeData").then((data) => {
      this.setData({ viewer: data.viewer || {}, members: data.members || [], logs: data.logs || [], loading: false });
    }).catch((error) => { this.setData({ loading: false, loadError: error && error.message ? error.message : "数据读取失败" }); });
  },
  retryLoad() { this.load(); },
  openProfile() { if (this.data.viewer.developerReadOnly) return this.switchDeveloper(); profile.open(this); },
  switchDeveloper() { wx.reLaunch({ url: "/pages/developer/developer" }); },
  closeProfile() { if (!this.data.profileSaving) this.setData({ profileVisible: false }); },
  chooseAvatar(event) { profile.chooseAvatar(this, event); },
  profileNicknameInput(event) { this.setData({ profileNickname: event.detail.value }); },
  saveProfile() { profile.save(this); },
  noop() {},
  logout() { api.clearSession(); wx.reLaunch({ url: "/pages/login/login" }); }
});
