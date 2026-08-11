const api = require("../../utils/api");

Page({
  data: { scene: "", loading: true, context: null, selectedIds: [], lessonOptions: [1, 2, 3], lessons: 1, submitting: false, receipt: null },
  onLoad(options) {
    const scene = decodeURIComponent(options && options.scene || wx.getStorageSync("pendingCheckinScene") || "");
    if (!scene) { this.setData({ loading: false }); api.toast("没有识别到教练码"); return; }
    wx.setStorageSync("pendingCheckinScene", scene);
    this.setData({ scene });
    const session = api.currentSession();
    if (!session) { wx.reLaunch({ url: "/pages/login/login" }); return; }
    if (session.role !== "student") { this.setData({ loading: false }); api.toast("请使用家长或学员手机号登录"); return; }
    this.load();
  },
  load() {
    api.call("checkinContext", { scene: this.data.scene }).then((context) => {
      const members = (context.members || []).map((item) => Object.assign({}, item, { selected: true }));
      this.setData({ context: Object.assign({}, context, { members }), selectedIds: members.map((item) => item.id), loading: false });
    }).catch((error) => { this.setData({ loading: false }); api.fail(error); });
  },
  toggleMember(event) {
    const id = event.currentTarget.dataset.id;
    const selected = this.data.selectedIds.slice();
    const index = selected.indexOf(id);
    if (index >= 0) selected.splice(index, 1); else selected.push(id);
    this.setData({ selectedIds: selected, "context.members": this.data.context.members.map((item) => item.id === id ? Object.assign({}, item, { selected: index < 0 }) : item) });
  },
  chooseLessons(event) { this.setData({ lessons: Number(event.currentTarget.dataset.value || 1) }); },
  confirm() {
    if (this.data.submitting) return;
    if (!this.data.selectedIds.length) return api.toast("请至少选择一名到场学员");
    this.setData({ submitting: true });
    api.syncing("正在消课");
    api.call("confirmDailyCheckin", {
      scene: this.data.scene,
      memberIds: this.data.selectedIds,
      lessons: this.data.lessons,
      requestId: Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
    }).then((result) => {
      wx.removeStorageSync("pendingCheckinScene");
      api.done("消课成功");
      const chargedIds = (result.logs || []).map((item) => item.memberId);
      result.chargedMembers = (result.members || []).filter((item) => chargedIds.indexOf(item.id) >= 0);
      this.setData({ receipt: result, submitting: false });
    }).catch((error) => { this.setData({ submitting: false }); api.fail(error); });
  },
  goHome() { wx.removeStorageSync("pendingCheckinScene"); wx.reLaunch({ url: "/pages/student/student" }); }
});
