const api = require("../../utils/api");
const rules = require("../../utils/rules");
const qrcode = require("../../utils/qrcode");
const subscribe = require("../../utils/subscribe");

function decorateSchedule(item) {
  const status = item.verificationStatus || rules.verificationStatus(item);
  return Object.assign({}, item, {
    dayLabel: rules.dayLabel(item.lessonDate),
    verificationStatus: status,
    diff: rules.daysFromToday(item.lessonDate),
    verificationStatusClass: status === "active" ? "warn" : status === "verified" ? "" : "danger",
    verificationStatusText: status === "active" ? "待核销" : status === "verified" ? "已核销" : "已过期"
  });
}

Page({
  data: {
    focus: "attendance",
    schedules: [],
    qrVisible: false,
    qrSchedule: null,
    attendanceLogs: [],
    courseApplications: [],
    leaveRequests: [],
    lessonFeedbacks: [],
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
        schedules: (data.schedules || [])
          .filter((item) => item.lessonStatus !== "cancelled")
          .map(decorateSchedule)
          .sort((a, b) => rules.sortByDateTime(a, b))
          .slice(0, 20),
        attendanceLogs: data.attendanceLogs || [],
        courseApplications: data.courseApplications || [],
        leaveRequests: data.leaveRequests || [],
        lessonFeedbacks: (data.lessonFeedbacks || []).map((item) => Object.assign({}, item, {
          tagsText: (item.tags || []).join("、")
        }))
      });
    });
  },

  showQr(event) {
    const id = event.currentTarget.dataset.id;
    const schedule = (this.data.schedules || []).find((item) => item.id === id);
    if (!schedule) return;
    if (schedule.verificationStatus !== "active") {
      api.toast(schedule.verificationStatusText || "该课程暂不可核销");
      return;
    }
    this.setData({ qrVisible: true, qrSchedule: schedule });
    setTimeout(() => {
      qrcode.drawCanvas("qrCanvas", schedule.verificationPayload || rules.verificationPayload(schedule.verificationCode), { size: 220 });
    }, 80);
  },

  hideQr() {
    this.setData({ qrVisible: false, qrSchedule: null });
  },

  requestLeave(event) {
    const scheduleId = event.currentTarget.dataset.id;
    wx.showModal({
      title: "申请请假",
      editable: true,
      placeholderText: "例如：临时有事，希望安排补课",
      confirmText: "提交",
      success: (res) => {
        if (!res.confirm) return;
        api.syncing("正在提交");
        subscribe.request(["leaveResult"]).then(() => api.call("createLeaveRequest", { scheduleId, reason: res.content || "" })).then((result) => {
          api.done(result.message);
          this.onShow();
        }).catch(api.fail);
      }
    });
  },

  noop() {
  }
});
