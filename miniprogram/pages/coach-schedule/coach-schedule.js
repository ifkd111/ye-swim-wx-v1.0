const api = require("../../utils/api");
const rules = require("../../utils/rules");

function decorate(item) {
  const verificationStatus = item.verificationStatus || rules.verificationStatus(item);
  const statusText = item.lessonStatus === "completed" ? "完成" : item.lessonStatus === "cancelled" ? "已取消" : item.lessonStatus === "leave_approved" ? "已请假" : "待确认";
  const statusClass = item.lessonStatus === "completed" ? "" : ["cancelled", "leave_approved"].indexOf(item.lessonStatus) >= 0 ? "danger" : verificationStatus === "expired" ? "danger" : "warn";
  return Object.assign({}, item, {
    dayLabel: rules.dayLabel(item.lessonDate),
    diff: rules.daysFromToday(item.lessonDate),
    verificationStatus,
    verificationStatusText: verificationStatus === "verified" ? "已核销" : verificationStatus === "expired" ? "已过期" : "待核销",
    verificationStatusClass: verificationStatus === "active" ? "warn" : verificationStatus === "verified" ? "" : "danger",
    statusText,
    statusClass,
    canMark: item.lessonStatus === "pending" && rules.daysFromToday(item.lessonDate) <= 0
  });
}

Page({
  data: {
    filter: "week",
    schedules: [],
    visibleSchedules: [],
    stats: {
      week: 0,
      pending: 0,
      all: 0
    },
    feedbackVisible: false,
    feedbackScheduleId: "",
    feedbackTags: [],
    feedbackNote: "",
    feedbackOptions: ["状态好", "动作进步", "需加强", "配合度高", "体能提升"].map((label) => ({ label, selected: false }))
  },

  onLoad(options) {
    if (options && options.filter) this.setData({ filter: options.filter });
  },

  onShow() {
    if (!api.requireSession("coach")) return;
    this.load();
  },

  load() {
    api.call("getHomeData").then((data) => {
      const schedules = (data.schedules || [])
        .map(decorate)
        .sort((a, b) => rules.sortByDateTime(a, b));
      this.setData({
        schedules,
        stats: {
          week: schedules.filter((item) => item.diff >= 0 && item.diff <= 6 && item.lessonStatus !== "cancelled" && item.lessonStatus !== "leave_approved").length,
          pending: schedules.filter((item) => item.lessonStatus === "pending").length,
          all: schedules.length
        }
      });
      this.applyFilter();
    });
  },

  setFilter(event) {
    this.setData({ filter: event.currentTarget.dataset.filter });
    this.applyFilter();
  },

  applyFilter() {
    const visibleSchedules = this.data.schedules.filter((item) => {
      if (this.data.filter === "week") return item.diff >= 0 && item.diff <= 6 && item.lessonStatus !== "cancelled" && item.lessonStatus !== "leave_approved";
      if (this.data.filter === "pending") return item.lessonStatus === "pending";
      if (this.data.filter === "completed") return item.lessonStatus === "completed";
      return true;
    });
    this.setData({ visibleSchedules });
  },

  mark(event) {
    const scheduleId = event.currentTarget.dataset.id;
    const schedule = (this.data.schedules || this.data.visibleSchedules || []).find((item) => item.id === scheduleId) ||
      (this.data.weekSchedules || []).find((item) => item.id === scheduleId) || {};
    wx.showModal({
      title: "确认出勤",
      content: [schedule.memberName || "该学员", (schedule.lessonDate || "") + " " + (schedule.lessonTime || ""), "确认后将按课程类型扣课。"].join("\n"),
      confirmText: "确认出勤",
      success: (res) => {
        if (!res.confirm) return;
        api.syncing("正在确认");
        api
          .call("markAttendance", { scheduleId })
          .then((result) => {
            api.done(result.message);
            this.openFeedback(scheduleId);
            this.load();
          })
          .catch(api.fail);
      }
    });
  },

  scanVerify() {
    wx.scanCode({
      onlyFromCamera: false,
      scanType: ["qrCode"],
      success: (res) => {
        const code = res.result || res.path || res.scanType || "";
        if (!code) {
          api.toast("没有识别到核销码");
          return;
        }
        api.syncing("正在核销");
        api.call("verifyScheduleQr", { code }).then((result) => {
          api.done(result.message || "已核销");
          if (result.log && result.log.sourceScheduleId) this.openFeedback(result.log.sourceScheduleId);
          this.load();
        }).catch(api.fail);
      },
      fail: () => {
        api.toast("扫码已取消");
      }
    });
  },

  openFeedback(scheduleId) {
    this.setData({
      feedbackVisible: true,
      feedbackScheduleId: scheduleId,
      feedbackTags: [],
      feedbackNote: "",
      feedbackOptions: this.data.feedbackOptions.map((item) => Object.assign({}, item, { selected: false }))
    });
  },

  toggleFeedbackTag(event) {
    const tag = event.currentTarget.dataset.tag;
    const options = this.data.feedbackOptions.map((item) => item.label === tag ? Object.assign({}, item, { selected: !item.selected }) : item);
    this.setData({
      feedbackOptions: options,
      feedbackTags: options.filter((item) => item.selected).map((item) => item.label)
    });
  },

  feedbackNoteInput(event) {
    this.setData({ feedbackNote: event.detail.value });
  },

  hideFeedback() {
    this.setData({
      feedbackVisible: false,
      feedbackScheduleId: "",
      feedbackTags: [],
      feedbackNote: "",
      feedbackOptions: this.data.feedbackOptions.map((item) => Object.assign({}, item, { selected: false }))
    });
  },

  submitFeedback() {
    if (!this.data.feedbackTags.length && !this.data.feedbackNote) {
      api.toast("请选择标签或填写备注");
      return;
    }
    api.syncing("正在保存");
    api.call("submitLessonFeedback", {
      scheduleId: this.data.feedbackScheduleId,
      tags: this.data.feedbackTags,
      note: this.data.feedbackNote
    }).then((result) => {
      api.done(result.message);
      this.hideFeedback();
    }).catch(api.fail);
  },

  noop() {
  }
});
