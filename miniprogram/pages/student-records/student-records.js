const api = require("../../utils/api");

Page({
  data: {
    focus: "attendance",
    attendanceLogs: [],
    courseApplications: [],
    statusText: {
      pending: "待审批",
      approved: "已通过",
      rejected: "已拒绝"
    }
  },

  onLoad(options) {
    if (options && options.focus) this.setData({ focus: options.focus });
  },

  onShow() {
    if (!api.requireSession("student")) return;
    api.call("getHomeData").then((data) => {
      this.setData({
        attendanceLogs: data.attendanceLogs || [],
        courseApplications: data.courseApplications || []
      });
    });
  }
});
