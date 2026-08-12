const api = require("../../utils/api");
const profile = require("../../utils/profile");

function envVersion() {
  try { return wx.getAccountInfoSync().miniProgram.envVersion || "release"; } catch (error) { return "release"; }
}

Page({
  data: { viewer: {}, code: null, todayLogs: [], stats: {}, loading: true, profileVisible: false, profileNickname: "", profileAvatar: "", profileSaving: false },
  onShow() { if (!api.requireSession("coach")) return; this.load(); },
  load() {
    this.setData({ loading: true });
    Promise.all([
      api.call("consumptionHomeData"),
      api.call("dailyCoachCode", { envVersion: envVersion() }).catch(() => null)
    ]).then(([data, code]) => {
      this.setData({ viewer: data.viewer || {}, todayLogs: data.todayLogs || [], stats: data.stats || {}, code, loading: false });
    }).catch((error) => { this.setData({ loading: false }); api.fail(error); });
  },
  previewCode() { if (this.data.code && this.data.code.fileId) wx.previewImage({ urls: [this.data.code.fileId] }); },
  openProfile() { if (this.data.viewer.developerReadOnly) return this.switchDeveloper(); profile.open(this); },
  switchDeveloper() { wx.reLaunch({ url: "/pages/developer/developer" }); },
  closeProfile() { if (!this.data.profileSaving) this.setData({ profileVisible: false }); },
  chooseAvatar(event) { profile.chooseAvatar(this, event); },
  profileNicknameInput(event) { this.setData({ profileNickname: event.detail.value }); },
  saveProfile() { profile.save(this); },
  noop() {},
  logout() { api.clearSession(); wx.reLaunch({ url: "/pages/login/login" }); }
});
