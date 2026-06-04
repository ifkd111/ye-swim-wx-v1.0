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

function decorate(item) {
  return Object.assign({}, item, {
    dayLabel: dayLabel(item.lessonDate),
    diff: daysFromToday(item.lessonDate)
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
    }
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
        .sort((a, b) => (a.lessonDate + a.lessonTime).localeCompare(b.lessonDate + b.lessonTime));
      this.setData({
        schedules,
        stats: {
          week: schedules.filter((item) => item.diff >= 0 && item.diff <= 6).length,
          pending: schedules.filter((item) => item.lessonStatus !== "completed").length,
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
      if (this.data.filter === "week") return item.diff >= 0 && item.diff <= 6;
      if (this.data.filter === "pending") return item.lessonStatus !== "completed";
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
            this.load();
          })
          .catch(api.fail);
      }
    });
  }
});
