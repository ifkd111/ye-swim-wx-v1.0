const api = require("../../utils/api");

Page({
  data: {
    stats: {},
    pendingBookings: [],
    lowBalanceMembers: [],
    todaySchedules: [],
    todoCards: []
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
      const lowBalanceMembers = (data.members || []).filter((item) => ["即将用完", "欠课", "已完成"].indexOf(item.status) >= 0);
      const todaySchedules = (data.schedules || []).filter((item) => item.lessonDate === today && item.lessonStatus !== "cancelled");
      this.setData({
        pendingBookings: pendingBookings.slice(0, 5),
        lowBalanceMembers: lowBalanceMembers.slice(0, 6),
        todaySchedules: todaySchedules.slice(0, 6),
        todoCards: [
          { title: "预约审批", value: pendingBookings.length, desc: "学员等待确认", url: "/pages/admin-bookings/admin-bookings", level: pendingBookings.length ? "warn" : "" },
          { title: "续课申请", value: pendingApplications.length, desc: "及时跟进续费", url: "/pages/admin-course-applications/admin-course-applications", level: pendingApplications.length ? "warn" : "" },
          { title: "低课时", value: lowBalanceMembers.length, desc: "防止流失", url: "/pages/admin-members/admin-members?filter=low", level: lowBalanceMembers.length ? "danger" : "" }
        ],
        stats: {
          pendingBookings: pendingBookings.length,
          pendingApplications: pendingApplications.length,
          todaySchedules: todaySchedules.length,
          members: (data.members || []).length,
          coaches: accounts.filter((item) => item.role === "coach").length,
          lowBalance: lowBalanceMembers.length
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
