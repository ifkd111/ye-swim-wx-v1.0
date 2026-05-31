const api = require("../../utils/api");

Page({
  data: {
    attendanceLogs: [],
    courseApplications: [],
    statusText: {
      pending: "待审批",
      approved: "已通过",
      rejected: "已拒绝"
    }
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
