const api = require("../../utils/api");
const rules = require("../../utils/rules");

function decorateSchedule(item) {
  return Object.assign({}, item, {
    dayLabel: rules.dayLabel(item.lessonDate),
    diff: rules.daysFromToday(item.lessonDate)
  });
}

Page({
  data: {
    viewer: {},
    member: {},
    nextSchedule: null,
    weekSchedules: [],
    bookingRequests: [],
    pendingApplications: [],
    courseProducts: [],
    accountCards: [],
    courseProductIndex: 0,
    selectedProduct: {},
    courseNote: ""
  },

  onShow() {
    if (!api.requireSession("student")) return;
    this.load();
  },

  load() {
    api.call("getHomeData").then((data) => {
      const schedules = (data.schedules || []).map(decorateSchedule).sort((a, b) => rules.sortByDateTime(a, b));
      const weekSchedules = schedules.filter((item) => item.diff >= 0 && item.diff <= 6);
      const nextSchedule = schedules.find((item) => item.diff >= 0 && item.lessonStatus !== "cancelled") || null;
      const products = data.courseProducts || [];
      const index = Math.min(this.data.courseProductIndex || 0, Math.max(products.length - 1, 0));
      this.setData({
        viewer: data.viewer,
        member: (data.members || [])[0] || {},
        nextSchedule,
        weekSchedules: weekSchedules.slice(0, 8),
        bookingRequests: data.bookingRequests || [],
        pendingApplications: (data.courseApplications || []).filter((item) => item.status === "pending"),
        courseProducts: products,
        accountCards: [
          { label: "绑定账号", value: data.viewer.account || "-" },
          { label: "手机号", value: (data.members || [])[0] && (data.members || [])[0].phone || "未填写" },
          { label: "校区", value: (data.members || [])[0] && (data.members || [])[0].campus || "-" },
          { label: "教练", value: (data.members || [])[0] && (data.members || [])[0].coach || "-" }
        ],
        courseProductIndex: index,
        selectedProduct: products[index] || {}
      });
    });
  },

  noteInput(event) { this.setData({ courseNote: event.detail.value }); },

  productChange(event) {
    const index = Number(event.detail.value || 0);
    this.setData({ courseProductIndex: index, selectedProduct: this.data.courseProducts[index] || {} });
  },

  goBooking() { wx.navigateTo({ url: "/pages/student-booking/student-booking" }); },
  goRecords() { wx.navigateTo({ url: "/pages/student-records/student-records?focus=attendance" }); },
  changePassword() { wx.navigateTo({ url: "/pages/change-password/change-password" }); },

  applyCourse() {
    const product = this.data.selectedProduct || this.data.courseProducts[0] || {};
    if (!product.id) {
      api.toast("暂无可申请课程");
      return;
    }
    api.syncing("正在提交");
    api.call("createCourseApplication", { productId: product.id || "", note: this.data.courseNote }).then((result) => {
      api.done(result.message);
      this.setData({ courseNote: "" });
      this.load();
    }).catch(api.fail);
  },

  logout() { api.clearSession(); wx.reLaunch({ url: "/pages/login/login" }); }
});
