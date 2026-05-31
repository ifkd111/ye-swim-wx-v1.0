const api = require("../../utils/api");

Page({
  data: {
    viewer: {},
    stats: {},
    todaySchedules: [],
    schedules: []
  },

  onShow() {
    if (!api.requireSession("coach")) return;
    this.load();
  },

  load() {
    api.call("getHomeData").then((data) => {
      const today = new Date().toISOString().slice(0, 10);
      const schedules = data.schedules || [];
      this.setData({
        viewer: data.viewer,
        schedules: schedules.slice(0, 50),
        todaySchedules: schedules.filter((item) => item.lessonDate === today),
        stats: {
          pending: schedules.filter((item) => item.lessonStatus !== "completed").length,
          members: (data.members || []).length
        }
      });
    });
  },

  mark(event) {
    api.syncing("正在确认");
    api
      .call("markAttendance", { scheduleId: event.currentTarget.dataset.id })
      .then((result) => {
        api.done(result.message);
        this.load();
      })
      .catch(api.fail);
  },

  goAvailability() {
    wx.navigateTo({ url: "/pages/coach-availability/coach-availability" });
  },

  logout() {
    api.clearSession();
    wx.reLaunch({ url: "/pages/login/login" });
  }
});
