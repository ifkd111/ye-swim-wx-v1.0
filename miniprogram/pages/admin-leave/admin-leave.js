const api = require("../../utils/api");

Page({
  data: {
    leaveRequests: [],
    makeupCredits: []
  },

  onShow() {
    if (!api.requireSession("admin")) return;
    this.load();
  },

  load() {
    api.call("getHomeData").then((data) => {
      const credits = data.makeupCredits || [];
      this.setData({
        leaveRequests: data.leaveRequests || [],
        makeupCredits: credits.map((item) => Object.assign({}, item, {
          lessonDateInput: "",
          lessonTimeInput: "17:00-18:00",
          campusInput: item.campus || "",
          coachInput: item.coach || ""
        }))
      });
    });
  },

  approve(event) {
    this.submit("approveLeaveRequest", event.currentTarget.dataset.id);
  },

  reject(event) {
    wx.showModal({
      title: "拒绝请假",
      editable: true,
      placeholderText: "填写拒绝原因",
      confirmText: "拒绝",
      success: (res) => {
        if (!res.confirm) return;
        this.submit("rejectLeaveRequest", event.currentTarget.dataset.id, res.content || "");
      }
    });
  },

  submit(action, requestId, reason) {
    api.syncing("正在处理");
    api.call(action, { requestId, reason }).then((result) => {
      api.done(result.message);
      this.load();
    }).catch(api.fail);
  },

  inputMakeup(event) {
    const id = event.currentTarget.dataset.id;
    const field = event.currentTarget.dataset.field;
    const index = this.data.makeupCredits.findIndex((item) => item.id === id);
    if (index < 0) return;
    this.setData({ ["makeupCredits[" + index + "]." + field]: event.detail.value });
  },

  createMakeup(event) {
    const creditId = event.currentTarget.dataset.id;
    const credit = this.data.makeupCredits.find((item) => item.id === creditId) || {};
    const form = {
      lessonDate: credit.lessonDateInput,
      lessonTime: credit.lessonTimeInput,
      campus: credit.campusInput,
      coach: credit.coachInput
    };
    if (!form.lessonDate || !form.lessonTime || !form.campus || !form.coach) {
      api.toast("请补全补课日期、时间、校区和教练");
      return;
    }
    api.syncing("正在排课");
    api.call("createMakeupSchedule", Object.assign({ creditId }, form)).then((result) => {
      api.done(result.message);
      this.load();
    }).catch(api.fail);
  }
});
