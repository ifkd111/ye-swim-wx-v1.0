const api = require("../../utils/api");
const rules = require("../../utils/rules");
const scanner = require("../../utils/scanner");

const emptyForm = {
  lessonDate: "",
  lessonTime: "17:00-18:00",
  campus: "",
  coach: "",
  memberName: ""
};

function unique(values) {
  return values.filter((value, index) => value && values.indexOf(value) === index);
}

function decorateSchedule(item) {
  const verificationStatus = item.verificationStatus || rules.verificationStatus(item);
  const statusText = item.lessonStatus === "completed" ? "完成" : item.lessonStatus === "cancelled" ? "已取消" : "待上课";
  const statusClass = item.lessonStatus === "completed" ? "" : item.lessonStatus === "cancelled" ? "danger" : verificationStatus === "expired" ? "danger" : "warn";
  return Object.assign({}, item, {
    verificationStatus,
    verificationStatusText: verificationStatus === "verified" ? "已核销" : verificationStatus === "expired" ? "已过期" : "待核销",
    verificationStatusClass: verificationStatus === "active" ? "warn" : verificationStatus === "verified" ? "" : "danger",
    statusText,
    statusClass
  });
}

Page({
  data: {
    filter: "today",
    schedules: [],
    visibleSchedules: [],
    stats: { today: 0, pending: 0, completed: 0, all: 0 },
    members: [],
    memberNames: [],
    campuses: [],
    coaches: [],
    form: Object.assign({}, emptyForm),
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
    if (!api.requireSession("admin")) return;
    this.load();
  },

  load() {
    api.call("getHomeData").then((data) => {
      const members = data.members || [];
      const schedules = (data.schedules || []).map(decorateSchedule).sort((a, b) => rules.sortByDateTime(a, b));
      this.setData({
        schedules,
        stats: {
          today: schedules.filter((item) => rules.daysFromToday(item.lessonDate) === 0 && item.lessonStatus !== "cancelled").length,
          pending: schedules.filter((item) => item.lessonStatus === "pending").length,
          completed: schedules.filter((item) => item.lessonStatus === "completed").length,
          all: schedules.length
        },
        members,
        memberNames: members.map((item) => item.chineseName),
        campuses: unique(members.map((item) => item.campus)),
        coaches: unique(members.map((item) => item.coach))
      }, () => this.applyFilter());
    });
  },

  setFilter(event) {
    this.setData({ filter: event.currentTarget.dataset.filter || "today" }, () => this.applyFilter());
  },

  applyFilter() {
    const visibleSchedules = (this.data.schedules || []).filter((item) => {
      if (this.data.filter === "today") return rules.daysFromToday(item.lessonDate) === 0 && item.lessonStatus !== "cancelled";
      if (this.data.filter === "pending") return item.lessonStatus === "pending";
      if (this.data.filter === "completed") return item.lessonStatus === "completed";
      return true;
    }).slice(0, 80);
    this.setData({ visibleSchedules });
  },

  input(event) { this.setData({ ["form." + event.currentTarget.dataset.field]: event.detail.value }); },

  pickMember(event) {
    const member = this.data.members[Number(event.detail.value || 0)];
    if (!member) return;
    this.setData({ form: Object.assign({}, this.data.form, { memberName: member.chineseName, campus: member.campus, coach: member.coach }) });
  },

  pickCampus(event) {
    this.setData({ "form.campus": this.data.campuses[Number(event.detail.value || 0)] || "" });
  },

  pickCoach(event) {
    this.setData({ "form.coach": this.data.coaches[Number(event.detail.value || 0)] || "" });
  },

  create() {
    const form = this.data.form;
    if (!form.lessonDate || !form.lessonTime || !form.campus || !form.coach || !form.memberName) {
      api.toast("请补全日期、时间、校区、教练和学员");
      return;
    }
    api.syncing("正在创建");
    api.call("createManualSchedule", form).then((result) => {
      api.done(result.message);
      this.setData({ form: Object.assign({}, emptyForm) });
      this.load();
    }).catch(api.fail);
  },

  cancel(event) {
    const scheduleId = event.currentTarget.dataset.id;
    wx.showModal({
      title: "取消排课",
      editable: true,
      placeholderText: "填写取消原因",
      confirmText: "确认取消",
      success: (res) => {
        if (!res.confirm) return;
        api.syncing("正在取消");
        api.call("cancelSchedule", { scheduleId, reason: res.content || "" }).then((result) => {
          api.done(result.message);
          this.load();
        }).catch(api.fail);
      }
    });
  },

  scanVerify() {
    scanner.scanQr().then((code) => {
      api.syncing("正在核销");
      return api.call("verifyScheduleQr", { code });
    }).then((result) => {
      api.done(result.message || "已核销");
      if (result.log && result.log.sourceScheduleId) this.openFeedback(result.log.sourceScheduleId);
      this.load();
    }).catch((error) => {
      if (!scanner.isCancelled(error)) api.fail(error);
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
