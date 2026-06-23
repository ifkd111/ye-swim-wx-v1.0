const api = require("../../utils/api");
const rules = require("../../utils/rules");
const qrcode = require("../../utils/qrcode");

function decorateSchedule(item) {
  const status = item.verificationStatus || rules.verificationStatus(item);
  return Object.assign({}, item, {
    dayLabel: rules.dayLabel(item.lessonDate),
    verificationStatus: status,
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
        courseApplications: data.courseApplications || []
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

  noop() {
  }
});
