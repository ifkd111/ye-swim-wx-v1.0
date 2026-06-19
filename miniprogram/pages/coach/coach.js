const api = require("../../utils/api");
const rules = require("../../utils/rules");

function decorateSchedule(item, members) {
  const member = (members || []).find((m) => m.id === item.memberId || m.chineseName === item.memberName) || {};
  return Object.assign({}, item, {
    dayLabel: rules.dayLabel(item.lessonDate),
    diff: rules.daysFromToday(item.lessonDate),
    remainingLessons: member.remainingLessons,
    memberStatus: member.status,
    canMark: item.lessonStatus !== "completed"
  });
}

Page({
  data: {
    viewer: {},
    stats: {},
    todaySchedules: [],
    weekSchedules: [],
    arrangedSchedules: [],
    recentAvailability: [],
    schedules: []
  },

  onShow() {
    if (!api.requireSession("coach")) return;
    this.load();
  },

  load() {
    api.call("getHomeData").then((data) => {
      const schedules = (data.schedules || [])
        .map((item) => decorateSchedule(item, data.members || []))
        .sort((a, b) => rules.sortByDateTime(a, b));
      const todaySchedules = schedules.filter((item) => item.diff === 0 && item.lessonStatus !== "cancelled");
      const weekSchedules = schedules.filter((item) => item.diff >= 0 && item.diff <= 6);
      const arrangedSchedules = schedules.filter((item) => item.diff >= 0 && item.lessonStatus !== "completed" && item.lessonStatus !== "cancelled");
      const dueCheckins = schedules.filter((item) => item.diff <= 0 && item.lessonStatus === "pending");
      const availability = (data.availabilitySlots || [])
        .slice()
        .sort((a, b) => (String(b.slotDate || "") + String(b.slotTime || "")).localeCompare(String(a.slotDate || "") + String(a.slotTime || "")));
      this.setData({
        viewer: data.viewer,
        schedules: schedules.slice(0, 50),
        todaySchedules: todaySchedules.slice(0, 8),
        weekSchedules: weekSchedules.slice(0, 8),
        arrangedSchedules: arrangedSchedules.slice(0, 8),
        recentAvailability: availability.slice(0, 4),
        stats: {
          pending: dueCheckins.length,
          upcoming: arrangedSchedules.length,
          members: (data.members || []).length,
          week: weekSchedules.length
        }
      });
    });
  },

  mark(event) {
    const scheduleId = event.currentTarget.dataset.id;
    const schedule = (this.data.schedules || []).find((item) => item.id === scheduleId) || {};
    const remainText = schedule.remainingLessons === undefined ? "" : "\n当前剩余课时：" + schedule.remainingLessons + "（" + (schedule.memberStatus || "") + "）";
    wx.showModal({
      title: "确认出勤",
      content: [schedule.memberName || "该学员", (schedule.lessonDate || "") + " " + (schedule.lessonTime || ""), "确认后将按课程类型扣课。" + remainText].join("\n"),
      confirmText: "确认出勤",
      success: (res) => {
        if (!res.confirm) return;
        api.syncing("正在确认");
        api.call("markAttendance", { scheduleId }).then((result) => {
          api.done(result.message);
          this.load();
        }).catch(api.fail);
      }
    });
  },

  goAvailability() { wx.navigateTo({ url: "/pages/coach-availability/coach-availability" }); },
  goSchedule(event) {
    const filter = event && event.currentTarget.dataset.filter ? event.currentTarget.dataset.filter : "week";
    wx.navigateTo({ url: "/pages/coach-schedule/coach-schedule?filter=" + filter });
  },
  goMembers() { wx.navigateTo({ url: "/pages/coach-members/coach-members" }); },
  changePassword() { wx.navigateTo({ url: "/pages/change-password/change-password" }); },
  logout() { api.clearSession(); wx.reLaunch({ url: "/pages/login/login" }); }
});
