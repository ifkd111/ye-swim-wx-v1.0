const api = require("../../utils/api");
const rules = require("../../utils/rules");

function toDate(value) {
  return new Date(String(value) + "T00:00:00");
}

function daysFromToday(value) {
  const today = toDate(rules.formatDateChina(new Date()));
  return Math.floor((toDate(value) - today) / 86400000);
}

function dayLabel(value) {
  const diff = daysFromToday(value);
  if (diff === 0) return "今天";
  if (diff === 1) return "明天";
  if (diff === 2) return "后天";
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][toDate(value).getDay()];
}

function decorateSchedule(item) {
  return Object.assign({}, item, {
    dayLabel: dayLabel(item.lessonDate),
    diff: daysFromToday(item.lessonDate)
  });
}

Page({
  data: {
    viewer: {},
    member: {},
    weekSchedules: [],
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
      const schedules = (data.schedules || [])
        .map(decorateSchedule)
        .sort((a, b) => (a.lessonDate + a.lessonTime).localeCompare(b.lessonDate + b.lessonTime));
      const weekSchedules = schedules.filter((item) => item.diff >= 0 && item.diff <= 6);
      this.setData({
        viewer: data.viewer,
        member: (data.members || [])[0] || {},
        weekSchedules: weekSchedules.slice(0, 8),
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
    wx.navigateTo({ url: "/pages/student-records/student-records?focus=attendance" });
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
