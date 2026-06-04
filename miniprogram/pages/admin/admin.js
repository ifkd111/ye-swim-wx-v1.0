const api = require("../../utils/api");

Page({
  data: {
    stats: {},
    pendingBookings: []
  },

  onShow() {
    if (!api.requireSession("admin")) return;
    this.load();
  },

  load() {
    api.call("getHomeData").then((data) => {
      const today = new Date().toISOString().slice(0, 10);
      const accounts = data.accounts || [];
      const pendingBookings = (data.bookingRequests || []).filter((item) => item.status === "pending");
      const pendingApplications = (data.courseApplications || []).filter((item) => item.status === "pending");
      this.setData({
        pendingBookings: pendingBookings.slice(0, 5),
        stats: {
          pendingBookings: pendingBookings.length,
          pendingApplications: pendingApplications.length,
          todaySchedules: (data.schedules || []).filter((item) => item.lessonDate === today).length,
          members: (data.members || []).length,
          coaches: accounts.filter((item) => item.role === "coach").length
        }
      });
    });
  },

  go(event) {
    wx.navigateTo({ url: event.currentTarget.dataset.url });
  },

  changePassword() {
    wx.navigateTo({ url: "/pages/change-password/change-password" });
  },

  logout() {
    api.clearSession();
    wx.reLaunch({ url: "/pages/login/login" });
  }
});
