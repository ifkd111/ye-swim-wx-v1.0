const api = require("../../utils/api");

Page({
  data: { loading: true, admins: [], coaches: [], students: [], coachIndex: 0, studentIndex: 0, helpVisible: false },

  onShow() {
    const session = api.currentSession();
    if (!session || (!session.developerReadOnly && session.role !== "developer")) {
      wx.reLaunch({ url: "/pages/login/login" });
      return;
    }
    this.load();
  },

  load() {
    this.setData({ loading: true });
    api.call("developerOverview").then((data) => this.setData({
      admins: data.admins || [], coaches: data.coaches || [], students: data.students || [], loading: false
    })).catch((error) => { this.setData({ loading: false }); api.fail(error); });
  },

  coachChange(event) { this.setData({ coachIndex: Number(event.detail.value || 0) }); },
  studentChange(event) { this.setData({ studentIndex: Number(event.detail.value || 0) }); },
  showHelp() { this.setData({ helpVisible: true }); },
  closeHelp() { this.setData({ helpVisible: false }); },
  noop() {},

  enter(event) {
    const role = event.currentTarget.dataset.role;
    const list = role === "admin" ? this.data.admins : role === "coach" ? this.data.coaches : this.data.students;
    const index = role === "coach" ? this.data.coachIndex : role === "student" ? this.data.studentIndex : 0;
    const target = list[index];
    if (!target) return api.toast("当前没有可预览的" + (role === "coach" ? "教练" : role === "student" ? "家长" : "老板") + "账号");
    api.syncing("正在切换视角");
    api.call("developerSwitchRole", { targetAccount: target.account }).then((result) => {
      api.saveSession(result.session);
      wx.reLaunch({ url: api.homePath(result.session.role) });
    }).catch(api.fail);
  },

  logout() { api.clearSession(); wx.reLaunch({ url: "/pages/login/login" }); }
});
