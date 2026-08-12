const api = require("../../utils/api");
const rules = require("../../utils/rules");

function envVersion() { try { return wx.getAccountInfoSync().miniProgram.envVersion || "release"; } catch (error) { return "release"; } }

Page({
  data: { viewer: {}, members: [], accounts: [], todayLogs: [], stats: {}, code: null, loading: true, loadError: "", codeLoading: true, codeError: "", manualVisible: false, selectedCoach: "", manualMembers: [], lessonOptions: [1, 2, 3], manualLessons: 1, manualDate: "", manualTime: "", manualReason: "", saving: false },
  onShow() { if (!api.requireSession("admin")) return; this.load(); },
  load() {
    this.setData({ loading: true, loadError: "" });
    api.call("consumptionHomeData").then((data) => {
      const coaches = (data.accounts || []).filter((item) => item.role === "coach" && item.status !== "disabled");
      const own = { account: data.viewer.account, fullName: data.viewer.fullName || "老板本人", coachName: data.viewer.coachName || data.viewer.fullName || "老板本人", role: "admin" };
      this.setData({ viewer: data.viewer || {}, members: data.members || [], accounts: [own].concat(coaches), todayLogs: data.todayLogs || [], stats: data.stats || {}, loading: false });
    }).catch((error) => {
      this.setData({ loading: false, loadError: error && error.message ? error.message : "数据读取失败" });
    });
    this.loadCode();
  },
  loadCode() {
    this.setData({ codeLoading: true, codeError: "" });
    api.call("dailyCoachCode", { envVersion: envVersion() }).then((code) => {
      this.setData({ code, codeLoading: false });
    }).catch((error) => {
      this.setData({ code: null, codeLoading: false, codeError: error && error.message ? error.message : "生成失败，请重试" });
    });
  },
  retryLoad() { this.load(); },
  retryCode() { this.loadCode(); },
  goCoaches() { wx.navigateTo({ url: "/pages/admin-coaches/admin-coaches" }); },
  goMembers() { wx.navigateTo({ url: "/pages/admin-members/admin-members" }); },
  goRegistration() { wx.navigateTo({ url: "/pages/admin-registration/admin-registration" }); },
  previewCode() { if (this.data.code && this.data.code.fileId) wx.previewImage({ urls: [this.data.code.fileId] }); },
  openManual() {
    const now = rules.shanghaiNow();
    this.setData({ manualVisible: true, selectedCoach: this.data.viewer.account, manualMembers: this.data.members.map((item) => Object.assign({}, item, { selected: false })), manualLessons: 1, manualDate: rules.formatDateChina(now), manualTime: String(now.getHours()).padStart(2,"0") + ":" + String(now.getMinutes()).padStart(2,"0"), manualReason: "老板补录" });
  },
  closeManual() { this.setData({ manualVisible: false }); },
  selectCoach(event) { this.setData({ selectedCoach: event.currentTarget.dataset.account }); },
  toggleManualMember(event) { const id = event.currentTarget.dataset.id; this.setData({ manualMembers: this.data.manualMembers.map((item) => item.id === id ? Object.assign({}, item, { selected: !item.selected }) : item) }); },
  selectManualLessons(event) { this.setData({ manualLessons: Number(event.currentTarget.dataset.value) }); },
  manualInput(event) {
    const field = event.currentTarget.dataset.field;
    const value = field === "manualLessons" ? Number(event.detail.value) : event.detail.value;
    this.setData({ [field]: value });
  },
  submitManual() {
    const ids = this.data.manualMembers.filter((item) => item.selected).map((item) => item.id);
    if (!ids.length) return api.toast("请选择学员");
    if (!Number.isInteger(Number(this.data.manualLessons)) || Number(this.data.manualLessons) < 1 || Number(this.data.manualLessons) > 99) return api.toast("请输入 1 至 99 的整数课时");
    this.setData({ saving: true }); api.syncing("正在补录");
    api.call("manualConsumption", { coachAccount: this.data.selectedCoach, memberIds: ids, lessons: this.data.manualLessons, attendanceDate: this.data.manualDate, attendanceTime: this.data.manualTime, reason: this.data.manualReason }).then((result) => { api.done(result.message); this.closeManual(); this.load(); }).catch(api.fail).finally(() => this.setData({ saving: false }));
  },
  manageLog(event) {
    const log = this.data.todayLogs.find((item) => item.id === event.currentTarget.dataset.id);
    if (!log) return;
    wx.showActionSheet({ itemList: ["修改扣除课时", "撤销本次消课"], success: (choice) => choice.tapIndex === 0 ? this.adjustLog(log) : this.reverseLog(log) });
  },
  adjustLog(log) {
    wx.showModal({ title: "修改扣除课时", editable: true, placeholderText: "当前 " + Number(log.lessonsDeducted || 1) + " 节，输入新课时", success: (res) => { if (!res.confirm) return; const lessons = Number(res.content); if (!Number.isInteger(lessons) || lessons < 1 || lessons > 99) return api.toast("请输入 1 至 99 的整数"); api.syncing("正在调整"); api.call("adjustConsumption", { logId: log.id, lessons, reason: "老板调整" }).then((result) => { api.done(result.message); this.load(); }).catch(api.fail); } });
  },
  reverseLog(log) {
    wx.showModal({ title: "撤销消课", content: "撤销 " + log.memberName + " 的 " + log.lessonsDeducted + " 节课？课时会自动返还。", confirmText: "确认撤销", success: (res) => { if (!res.confirm) return; api.syncing("正在撤销"); api.call("reverseConsumption", { logId: log.id, reason: "老板纠错" }).then((result) => { api.done(result.message); this.load(); }).catch(api.fail); } });
  },
  noop() {},
  logout() { api.clearSession(); wx.reLaunch({ url: "/pages/login/login" }); }
});
