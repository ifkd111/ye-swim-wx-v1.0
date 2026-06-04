const api = require("../../utils/api");

Page({
  data: {
    applications: [],
    statusText: {
      pending: "待处理",
      approved: "已通过",
      rejected: "已拒绝"
    }
  },

  onShow() {
    if (!api.requireSession("admin")) return;
    this.load();
  },

  load() {
    api.call("getHomeData").then((data) => {
      const members = data.members || [];
      const applications = (data.courseApplications || [])
        .map((item) => {
          const member = members.find((m) => m.id === item.memberId || m.businessId === item.memberId) || {};
          return Object.assign({}, item, {
            remainingLessons: member.remainingLessons,
            currentProductName: member.productName,
            currentTotalLessons: member.totalLessons
          });
        })
        .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      this.setData({ applications });
    });
  },

  approve(event) {
    const id = event.currentTarget.dataset.id;
    const app = this.data.applications.find((item) => item.id === id);
    wx.showModal({
      title: "通过课程申请",
      content: [app ? app.memberName + " · " + app.productName : "确认通过？", "通过后会更新学员课程和总课时。"].join("\n"),
      confirmText: "通过",
      success: (res) => {
        if (res.confirm) this.submit("approveCourseApplication", id);
      }
    });
  },

  reject(event) {
    const id = event.currentTarget.dataset.id;
    wx.showModal({
      title: "拒绝课程申请",
      editable: true,
      placeholderText: "可填写原因",
      confirmText: "拒绝",
      success: (res) => {
        if (res.confirm) this.submit("rejectCourseApplication", id, res.content || "");
      }
    });
  },

  submit(action, applicationId, reason) {
    api.syncing("正在处理");
    api
      .call(action, { applicationId, reason })
      .then((result) => {
        api.done(result.message);
        this.load();
      })
      .catch(api.fail);
  }
});
