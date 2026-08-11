const api = require("../../utils/api");
const rules = require("../../utils/rules");

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const TIMES = ["08:00-09:00", "09:00-10:00", "10:00-11:00", "14:00-15:00", "15:00-16:00", "16:00-17:00", "17:00-18:00", "18:00-19:00", "19:00-20:00"];

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dateTabs() {
  const today = rules.toDate(rules.formatDateChina(rules.shanghaiNow()));
  return Array.from({ length: 7 }).map((_, index) => {
    const date = addDays(today, index);
    return { value: rules.formatDateChina(date), day: date.getDate(), label: index === 0 ? "今天" : WEEKDAYS[date.getDay()] };
  });
}

function unique(values) {
  return values.filter((value, index, list) => value && list.indexOf(value) === index);
}

function decorateSchedule(item, members) {
  const member = (members || []).find((row) => row.id === item.memberId || row.chineseName === item.memberName) || {};
  return Object.assign({}, item, {
    remainingLessons: member.remainingLessons,
    memberStatus: member.status || "",
    canMark: item.lessonStatus === "pending",
    statusText: item.lessonStatus === "completed" ? "已完成" : "待上课"
  });
}

Page({
  data: {
    viewer: {},
    raw: {},
    dateTabs: dateTabs(),
    selectedDate: rules.formatDateChina(rules.shanghaiNow()),
    selectedDateLabel: "今天",
    campuses: [],
    selectedCampus: "",
    timeOptions: TIMES.map((value) => ({ value, submitted: false, selected: false })),
    selectedTimes: [],
    submittedSlots: [],
    daySchedules: [],
    submitting: false,
    feedbackVisible: false,
    feedbackScheduleId: "",
    feedbackTags: [],
    feedbackNote: "",
    feedbackOptions: ["状态好", "动作进步", "需加强", "配合度高", "体能提升"].map((label) => ({ label, selected: false }))
  },

  onShow() {
    if (!api.requireSession("coach")) return;
    this.load();
  },

  load() {
    api.call("getHomeData").then((data) => {
      const campuses = unique((data.members || []).map((item) => item.campus).concat((data.availabilitySlots || []).map((item) => item.campus), data.viewer && data.viewer.campus || []));
      const selectedCampus = campuses.indexOf(this.data.selectedCampus) >= 0 ? this.data.selectedCampus : data.viewer.campus || campuses[0] || "绿洲";
      const schedules = (data.schedules || []).map((item) => decorateSchedule(item, data.members || []));
      this.setData({ viewer: data.viewer || {}, raw: Object.assign({}, data, { schedules }), campuses, selectedCampus });
      this.refreshDay();
    }).catch(api.fail);
  },

  refreshDay() {
    const data = this.data.raw || {};
    const date = this.data.selectedDate;
    const submittedSlots = (data.availabilitySlots || []).filter((item) => item.slotDate === date && item.status !== "closed");
    const submittedTimes = submittedSlots.map((item) => item.slotTime);
    const daySchedules = (data.schedules || []).filter((item) => item.lessonDate === date && item.lessonStatus !== "cancelled")
      .sort((a, b) => String(a.lessonTime || "").localeCompare(String(b.lessonTime || "")));
    this.setData({
      selectedDateLabel: rules.dayLabel(date),
      submittedSlots,
      daySchedules,
      selectedTimes: [],
      timeOptions: TIMES.map((value) => ({ value, submitted: submittedTimes.indexOf(value) >= 0, selected: false }))
    });
  },

  selectDate(event) {
    this.setData({ selectedDate: event.currentTarget.dataset.date });
    this.refreshDay();
  },

  selectCampus(event) {
    this.setData({ selectedCampus: event.currentTarget.dataset.value });
  },

  toggleTime(event) {
    const value = event.currentTarget.dataset.value;
    const current = this.data.timeOptions.find((item) => item.value === value);
    if (!current || current.submitted) return;
    const timeOptions = this.data.timeOptions.map((item) => item.value === value ? Object.assign({}, item, { selected: !item.selected }) : item);
    this.setData({ timeOptions, selectedTimes: timeOptions.filter((item) => item.selected).map((item) => item.value) });
  },

  submitAvailability() {
    if (!this.data.selectedTimes.length || this.data.submitting) return;
    const slots = this.data.selectedTimes.map((slotTime) => ({ slotDate: this.data.selectedDate, slotTime, campus: this.data.selectedCampus, capacity: 1, notes: "教练日程提交" }));
    this.setData({ submitting: true });
    api.syncing("正在提交空闲时间");
    api.call("createAvailabilitySlots", { slots }).then((result) => {
      api.done(result.message);
      this.load();
    }).catch(api.fail).finally(() => this.setData({ submitting: false }));
  },

  mark(event) {
    const id = event.currentTarget.dataset.id;
    const schedule = this.data.daySchedules.find((item) => item.id === id) || {};
    wx.showModal({
      title: "确认出勤",
      content: (schedule.memberName || "该学员") + " · " + (schedule.lessonTime || "") + "\n确认后按课程类型扣课",
      confirmText: "确认",
      success: (res) => {
        if (!res.confirm) return;
        api.syncing("正在确认");
        api.call("markAttendance", { scheduleId: id }).then((result) => {
          api.done(result.message); this.openFeedback(id); this.load();
        }).catch(api.fail);
      }
    });
  },

  scanVerify() {
    wx.scanCode({
      onlyFromCamera: false,
      scanType: ["qrCode"],
      success: (res) => {
        const code = res.result || res.path || "";
        if (!code) return;
        api.syncing("正在核销");
        api.call("verifyScheduleQr", { code }).then((result) => { api.done(result.message || "已核销"); this.load(); }).catch(api.fail);
      },
      fail: () => api.toast("扫码已取消")
    });
  },

  openFeedback(id) {
    this.setData({ feedbackVisible: true, feedbackScheduleId: id, feedbackTags: [], feedbackNote: "", feedbackOptions: this.data.feedbackOptions.map((item) => Object.assign({}, item, { selected: false })) });
  },
  toggleFeedbackTag(event) {
    const tag = event.currentTarget.dataset.tag;
    const options = this.data.feedbackOptions.map((item) => item.label === tag ? Object.assign({}, item, { selected: !item.selected }) : item);
    this.setData({ feedbackOptions: options, feedbackTags: options.filter((item) => item.selected).map((item) => item.label) });
  },
  feedbackNoteInput(event) { this.setData({ feedbackNote: event.detail.value }); },
  hideFeedback() { this.setData({ feedbackVisible: false, feedbackScheduleId: "", feedbackTags: [], feedbackNote: "" }); },
  submitFeedback() {
    api.syncing("正在保存");
    api.call("submitLessonFeedback", { scheduleId: this.data.feedbackScheduleId, tags: this.data.feedbackTags, note: this.data.feedbackNote })
      .then((result) => { api.done(result.message); this.hideFeedback(); }).catch(api.fail);
  },
  goSchedule() { wx.navigateTo({ url: "/pages/coach-schedule/coach-schedule?filter=week" }); },
  goMembers() { wx.navigateTo({ url: "/pages/coach-members/coach-members" }); },
  noop() {},
  logout() { api.clearSession(); wx.reLaunch({ url: "/pages/login/login" }); }
});
