const api = require("../../utils/api");
const profile = require("../../utils/profile");

function envVersion() {
  try { return wx.getAccountInfoSync().miniProgram.envVersion || "release"; } catch (error) { return "release"; }
}

Page({
  data: { viewer: {}, code: null, todayLogs: [], stats: {}, loading: true, loadError: "", codeError: "", profileVisible: false, profileNickname: "", profileAvatar: "", profileSaving: false },
  onShow() { if (!api.requireSession("coach")) return; this.load(); },
  load() {
    this.setData({ loading: true, loadError: "", codeError: "" });
    Promise.all([
      api.call("consumptionHomeData"),
      api.call("dailyCoachCode", { envVersion: envVersion() }).then((code) => ({ code, error: "" })).catch((error) => ({ code: null, error: error && error.message ? error.message : "生成失败，请重试" }))
    ]).then(([data, codeResult]) => {
      this.setData({ viewer: data.viewer || {}, todayLogs: data.todayLogs || [], stats: data.stats || {}, code: codeResult.code, codeError: codeResult.error, loading: false });
    }).catch((error) => { this.setData({ loading: false, loadError: error && error.message ? error.message : "数据读取失败" }); });
  },
  retryLoad() { this.load(); },
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
