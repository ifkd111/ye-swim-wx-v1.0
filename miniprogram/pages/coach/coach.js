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
    canMark: item.lessonStatus !== "completed"
  });
}

Page({
  data: {
    viewer: {},
    stats: {},
    weekSchedules: [],
    arrangedSchedules: [],
    schedules: []
  },

  onShow() {
    if (!api.requireSession("coach")) return;
    this.load();
  },

  load() {
    api.call("getHomeData").then((data) => {
      const schedules = (data.schedules || [])
        .map(decorateSchedule)
        .sort((a, b) => (a.lessonDate + a.lessonTime).localeCompare(b.lessonDate + b.lessonTime));
      const weekSchedules = schedules.filter((item) => {
        const diff = daysFromToday(item.lessonDate);
        return diff >= 0 && diff <= 6;
      });
      const arrangedSchedules = schedules.filter((item) => daysFromToday(item.lessonDate) >= 0 && item.lessonStatus !== "completed");
      this.setData({
        viewer: data.viewer,
        schedules: schedules.slice(0, 50),
        weekSchedules: weekSchedules.slice(0, 8),
        arrangedSchedules: arrangedSchedules.slice(0, 8),
        stats: {
          pending: schedules.filter((item) => item.lessonStatus !== "completed").length,
          members: (data.members || []).length,
          week: weekSchedules.length
        }
      });
    });
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
            this.load();
          })
          .catch(api.fail);
      }
    });
  },

  goAvailability() {
    wx.navigateTo({ url: "/pages/coach-availability/coach-availability" });
  },

  goSchedule(event) {
    const filter = event && event.currentTarget.dataset.filter ? event.currentTarget.dataset.filter : "week";
    wx.navigateTo({ url: "/pages/coach-schedule/coach-schedule?filter=" + filter });
  },

  goMembers() {
    wx.navigateTo({ url: "/pages/coach-members/coach-members" });
  },

  changePassword() {
    wx.navigateTo({ url: "/pages/change-password/change-password" });
  },

  logout() {
    api.clearSession();
    wx.reLaunch({ url: "/pages/login/login" });
  }
});
