const api = require("../../utils/api");
const rules = require("../../utils/rules");

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

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

function groupCoachSlots(slots) {
  const groups = {};
  slots.forEach((slot) => {
    const key = slot.coach || "待定教练";
    if (!groups[key]) groups[key] = { coach: key, campus: slot.campus, times: [], slots: [], draftCount: 0, publishedCount: 0 };
    groups[key].times.push(slot.slotTime);
    groups[key].slots.push(slot);
    if (slot.status === "draft") groups[key].draftCount += 1;
    if (slot.status === "published") groups[key].publishedCount += 1;
  });
  return Object.keys(groups).map((key) => Object.assign(groups[key], { initial: key.slice(0, 1), timeText: groups[key].times.join("、") }));
}

Page({
  data: {
    viewer: {},
    raw: {},
    dateTabs: dateTabs(),
    selectedDate: rules.formatDateChina(rules.shanghaiNow()),
    selectedDateLabel: "今天",
    coachSupply: [],
    courseDrafts: [],
    daySchedules: [],
    demandMembers: [],
    pendingLeaves: 0,
    pendingApplications: 0,
    coachCount: 0,
    memberCount: 0,
    approvalBusy: "",
    publishingAll: false,
    adjustmentVisible: false,
    adjustingDraft: null,
    adjustmentSlots: [],
    selectedAdjustmentSlotId: ""
  },

  onShow() {
    if (!api.requireSession("admin")) return;
    this.load();
  },

  load() {
    api.call("getHomeData").then((data) => {
      this.setData({ viewer: data.viewer || {}, raw: data });
      this.refreshDay();
    }).catch(api.fail);
  },

  refreshDay() {
    const data = this.data.raw || {};
    const date = this.data.selectedDate;
    const slots = (data.availabilitySlots || []).filter((item) => item.slotDate === date && item.status !== "closed");
    const drafts = (data.bookingRequests || []).filter((item) => item.slotDate === date && item.status === "pending")
      .sort((a, b) => String(a.slotTime || "").localeCompare(String(b.slotTime || "")));
    const members = data.members || [];
    const demandMembers = drafts.map((item) => {
      const member = members.find((row) => row.id === item.memberId || row.chineseName === item.memberName) || {};
      return Object.assign({}, item, { remainingLessons: member.remainingLessons, memberStatus: member.status || "" });
    });
    const schedules = (data.schedules || []).filter((item) => item.lessonDate === date && item.lessonStatus !== "cancelled")
      .sort((a, b) => String(a.lessonTime || "").localeCompare(String(b.lessonTime || "")));
    this.setData({
      selectedDateLabel: rules.dayLabel(date),
      coachSupply: groupCoachSlots(slots),
      courseDrafts: demandMembers,
      demandMembers,
      daySchedules: schedules,
      pendingLeaves: (data.leaveRequests || []).filter((item) => item.status === "pending").length,
      pendingApplications: (data.courseApplications || []).filter((item) => item.status === "pending").length,
      coachCount: (data.accounts || []).filter((item) => item.role === "coach" && item.status !== "disabled").length,
      memberCount: members.length
    });
  },

  selectDate(event) {
    this.setData({ selectedDate: event.currentTarget.dataset.date });
    this.refreshDay();
  },

  approveDraft(event) {
    const id = event.currentTarget.dataset.id;
    if (this.data.approvalBusy) return;
    this.setData({ approvalBusy: id });
    api.syncing("正在发布课程");
    api.call("approveBookingRequest", { requestId: id }).then((result) => {
      api.done(result.message);
      this.load();
    }).catch(api.fail).finally(() => this.setData({ approvalBusy: "" }));
  },

  rejectDraft(event) {
    const id = event.currentTarget.dataset.id;
    wx.showModal({
      title: "不发布这节课",
      editable: true,
      placeholderText: "可填写原因",
      confirmText: "确认",
      success: (res) => {
        if (!res.confirm) return;
        api.syncing("正在处理");
        api.call("rejectBookingRequest", { requestId: id, reason: res.content || "时间暂不合适" })
          .then((result) => { api.done(result.message); this.load(); }).catch(api.fail);
      }
    });
  },

  openAdjustment(event) {
    const draft = this.data.courseDrafts.find((item) => item.id === event.currentTarget.dataset.id);
    if (!draft) return;
    const adjustmentSlots = (this.data.raw.availabilitySlots || [])
      .filter((item) => item.slotDate === this.data.selectedDate && item.status === "published" && (item.id === draft.slotId || Number(item.left || 0) > 0))
      .sort((a, b) => String(a.slotTime || "").localeCompare(String(b.slotTime || "")));
    this.setData({
      adjustmentVisible: true,
      adjustingDraft: draft,
      adjustmentSlots,
      selectedAdjustmentSlotId: draft.slotId
    });
  },

  selectAdjustmentSlot(event) {
    this.setData({ selectedAdjustmentSlotId: event.currentTarget.dataset.id });
  },

  closeAdjustment() {
    this.setData({ adjustmentVisible: false, adjustingDraft: null, adjustmentSlots: [], selectedAdjustmentSlotId: "" });
  },

  saveAdjustment() {
    if (!this.data.adjustingDraft || !this.data.selectedAdjustmentSlotId) return;
    api.syncing("正在调整草稿");
    api.call("updateBookingRequestMatch", {
      requestId: this.data.adjustingDraft.id,
      slotId: this.data.selectedAdjustmentSlotId
    }).then((result) => {
      api.done(result.message);
      this.closeAdjustment();
      this.load();
    }).catch(api.fail);
  },

  publishAllDrafts() {
    if (!this.data.courseDrafts.length || this.data.publishingAll) return;
    this.setData({ publishingAll: true });
    api.syncing("正在发布全部课程");
    const ids = this.data.courseDrafts.map((item) => item.id);
    ids.reduce((chain, id) => chain.then(() => api.call("approveBookingRequest", { requestId: id })), Promise.resolve())
      .then(() => { api.done("课程已全部发布"); this.load(); })
      .catch(api.fail)
      .finally(() => this.setData({ publishingAll: false }));
  },

  publishCoachSlots(event) {
    const coach = event.currentTarget.dataset.coach;
    const group = this.data.coachSupply.find((item) => item.coach === coach);
    const ids = group ? group.slots.filter((item) => item.status === "draft").map((item) => item.id) : [];
    if (!ids.length) return;
    api.syncing("正在开放时间");
    ids.reduce((chain, id) => chain.then(() => api.call("publishAvailabilitySlot", { slotId: id })), Promise.resolve())
      .then(() => { api.done("已开放给学员"); this.load(); }).catch(api.fail);
  },

  go(event) { wx.navigateTo({ url: event.currentTarget.dataset.url }); },
  changePassword() { wx.navigateTo({ url: "/pages/change-password/change-password" }); },
  noop() {},
  logout() { api.clearSession(); wx.reLaunch({ url: "/pages/login/login" }); }
});
