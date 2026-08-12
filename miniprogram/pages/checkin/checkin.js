const api = require("../../utils/api");

Page({
  data: { scene: "", loading: true, context: null, selectedIds: [], lessonOptions: [1, 2, 3], selectedCount: 0, totalLessons: 0, submitting: false, receipt: null },
  onLoad(options) {
    const scene = decodeURIComponent(options && options.scene || wx.getStorageSync("pendingCheckinScene") || "");
    if (!scene) { this.setData({ loading: false }); api.toast("没有识别到教练码"); return; }
    wx.setStorageSync("pendingCheckinScene", scene);
    this.setData({ scene });
    const session = api.currentSession();
    if (!session) { wx.reLaunch({ url: "/pages/login/login" }); return; }
    if (session.role !== "student") { this.setData({ loading: false }); api.toast("请使用家长或学员手机号登录"); return; }
    // 已经带着有效家长会话进入确认页后，扫码中转任务就完成了。
    // 及时清除它，避免点击微信原生“回到首页”时又被登录页送回本页。
    wx.removeStorageSync("pendingCheckinScene");
    this.load();
  },
  load() {
    api.call("checkinContext", { scene: this.data.scene }).then((context) => {
      const members = (context.members || []).map((item) => Object.assign({}, item, { selected: true, lessons: 1 }));
      this.updateSelection(members, { context: Object.assign({}, context, { members }), loading: false });
    }).catch((error) => { this.setData({ loading: false }); api.fail(error); });
  },
  updateSelection(members, extra) {
    const selected = members.filter((item) => item.selected);
    const patch = {
      selectedIds: selected.map((item) => item.id),
      selectedCount: selected.length,
      totalLessons: selected.reduce((sum, item) => sum + Number(item.lessons || 1), 0)
    };
    if (extra && extra.context) patch.context = extra.context;
    else patch["context.members"] = members;
    this.setData(Object.assign(patch, extra || {}));
  },
  toggleMember(event) {
    const id = event.currentTarget.dataset.id;
    const members = this.data.context.members.map((item) => item.id === id ? Object.assign({}, item, { selected: !item.selected }) : item);
    this.updateSelection(members);
  },
  chooseMemberLessons(event) {
    const id = event.currentTarget.dataset.id;
    const lessons = Number(event.currentTarget.dataset.value || 1);
    if ([1, 2, 3].indexOf(lessons) < 0) return;
    const members = this.data.context.members.map((item) => item.id === id ? Object.assign({}, item, { lessons }) : item);
    this.updateSelection(members);
  },
  confirm() {
    if (this.data.submitting) return;
    if (!this.data.selectedIds.length) return api.toast("请至少选择一名到场学员");
    this.setData({ submitting: true });
    api.syncing("正在消课");
    api.call("confirmDailyCheckin", {
      scene: this.data.scene,
      memberIds: this.data.selectedIds,
      memberLessons: this.data.context.members.filter((item) => item.selected).map((item) => ({ memberId: item.id, lessons: item.lessons })),
      requestId: Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
    }).then((result) => {
      wx.removeStorageSync("pendingCheckinScene");
      api.done("消课成功");
      const chargedById = {};
      (result.logs || []).forEach((item) => { chargedById[item.memberId] = Number(item.lessonsDeducted || 1); });
      result.chargedMembers = (result.members || []).filter((item) => chargedById[item.id]).map((item) => Object.assign({}, item, { chargedLessons: chargedById[item.id] }));
      this.setData({ receipt: result, submitting: false });
    }).catch((error) => { this.setData({ submitting: false }); api.fail(error); });
  },
  goHome() { wx.removeStorageSync("pendingCheckinScene"); wx.reLaunch({ url: "/pages/student/student" }); }
});
