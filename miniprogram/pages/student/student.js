const api = require("../../utils/api");

Page({
  data: {
    viewer: {},
    member: {},
    schedules: [],
    bookingRequests: [],
    courseProducts: [],
    courseNote: ""
  },

  onShow() {
    if (!api.requireSession("student")) return;
    this.load();
  },

  load() {
    api.call("getHomeData").then((data) => {
      this.setData({
        viewer: data.viewer,
        member: (data.members || [])[0] || {},
        schedules: (data.schedules || []).slice(0, 5),
        bookingRequests: data.bookingRequests || [],
        courseProducts: data.courseProducts || []
      });
    });
  },

  noteInput(event) {
    this.setData({ courseNote: event.detail.value });
  },

  goBooking() {
    wx.navigateTo({ url: "/pages/student-booking/student-booking" });
  },

  goRecords() {
    wx.navigateTo({ url: "/pages/student-records/student-records" });
  },

  applyCourse() {
    const product = this.data.courseProducts[0];
    if (!product) {
      api.toast("暂无可申请产品");
      return;
    }
    api.syncing("正在提交");
    api
      .call("createCourseApplication", { productId: product.id, note: this.data.courseNote })
      .then((result) => {
        api.done(result.message);
        this.setData({ courseNote: "" });
        this.load();
      })
      .catch(api.fail);
  },

  logout() {
    api.clearSession();
    wx.reLaunch({ url: "/pages/login/login" });
  }
});
