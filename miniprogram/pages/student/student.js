const api = require("../../utils/api");
const rules = require("../../utils/rules");
const qrcode = require("../../utils/qrcode");
const subscribe = require("../../utils/subscribe");

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function decorateSchedule(item) {
  return Object.assign({}, item, {
    dayLabel: rules.dayLabel(item.lessonDate),
    diff: rules.daysFromToday(item.lessonDate),
    verificationStatus: item.verificationStatus || rules.verificationStatus(item),
    statusText: item.lessonStatus === "completed" ? "已完成" : item.lessonStatus === "leave_approved" ? "已请假" : item.lessonStatus === "cancelled" ? "已取消" : "待上课",
    statusClass: item.lessonStatus === "completed" ? "" : item.lessonStatus === "cancelled" || item.lessonStatus === "leave_approved" ? "muted" : "warn"
  });
}

function unique(values) {
  return values.filter((value, index, list) => value && list.indexOf(value) === index);
}

function buildCalendar(schedules, requests, slots) {
  const today = rules.toDate(rules.formatDateChina(rules.shanghaiNow()));
  return Array.from({ length: 21 }).map((_, index) => {
    const date = addDays(today, index);
    const value = rules.formatDateChina(date);
    const daySchedules = schedules.filter((item) => item.lessonDate === value && item.lessonStatus !== "cancelled");
    const dayRequests = requests.filter((item) => item.slotDate === value && item.status === "pending");
    const available = slots.filter((item) => item.slotDate === value && Number(item.left || 0) > 0);
    return {
      value,
      day: date.getDate(),
      weekday: "周" + WEEKDAYS[date.getDay()],
      today: index === 0,
      hasSchedule: daySchedules.length > 0,
      hasPending: dayRequests.length > 0,
      availableCount: available.length
    };
  });
}

Page({
  data: {
    viewer: {},
    member: {},
    schedules: [],
    requests: [],
    slots: [],
    calendarDays: [],
    selectedDate: rules.formatDateChina(rules.shanghaiNow()),
    selectedDateLabel: "今天",
    daySchedules: [],
    dayRequests: [],
    campuses: [],
    selectedCampus: "",
    courseProducts: [],
    pendingApplications: [],
    selectedProductId: "",
    selectedProduct: {},
    visibleSlots: [],
    selectedSlotId: "",
    selectedSlot: null,
    submitting: false,
    qrVisible: false,
    qrSchedule: null
  },

  onShow() {
    if (!api.requireSession("student")) return;
    this.load();
  },

  load() {
    api.call("getHomeData").then((data) => {
      const member = (data.members || [])[0] || {};
      const schedules = (data.schedules || []).map(decorateSchedule).sort((a, b) => rules.sortByDateTime(a, b));
      const requests = (data.bookingRequests || []).map((item) => Object.assign({}, item, {
        statusText: item.status === "pending" ? "等待老板发布" : item.status === "approved" ? "已发布" : item.status === "rejected" ? "未通过" : "已取消"
      }));
      const activeBySlot = {};
      requests.forEach((item) => {
        if (item.status === "pending" || item.status === "approved") activeBySlot[item.slotId] = true;
      });
      const slots = (data.availabilitySlots || [])
        .filter((item) => item.status === "published" && rules.isBookableSlot(item.slotDate, item.slotTime) && !activeBySlot[item.id] && Number(item.left === undefined ? item.capacity || 1 : item.left) > 0)
        .sort((a, b) => (a.slotDate + a.slotTime).localeCompare(b.slotDate + b.slotTime));
      const campuses = unique(slots.map((item) => item.campus).concat(member.campus || []));
      const products = data.courseProducts || [];
      const selectedCampus = campuses.indexOf(this.data.selectedCampus) >= 0
        ? this.data.selectedCampus
        : campuses.indexOf(member.campus) >= 0 ? member.campus : campuses[0] || member.campus || "";
      const selectedProduct = products.find((item) => item.id === this.data.selectedProductId)
        || products.find((item) => item.id === member.productId || item.name === member.productName)
        || products[0] || { id: member.productId || "", name: member.productName || "常规课程" };
      this.setData({
        viewer: data.viewer || {},
        member,
        schedules,
        requests,
        slots,
        campuses,
        selectedCampus,
        courseProducts: products.length ? products : [selectedProduct],
        pendingApplications: (data.courseApplications || []).filter((item) => item.status === "pending"),
        selectedProductId: selectedProduct.id || "",
        selectedProduct,
        calendarDays: buildCalendar(schedules, requests, slots)
      });
      this.refreshDay();
    }).catch(api.fail);
  },

  refreshDay() {
    const date = this.data.selectedDate;
    const daySchedules = this.data.schedules.filter((item) => item.lessonDate === date && item.lessonStatus !== "cancelled");
    const dayRequests = this.data.requests.filter((item) => item.slotDate === date && item.status === "pending");
    const visibleSlots = this.data.slots.filter((item) => item.slotDate === date && (!this.data.selectedCampus || item.campus === this.data.selectedCampus));
    const selectedSlot = visibleSlots.find((item) => item.id === this.data.selectedSlotId) || null;
    this.setData({
      selectedDateLabel: rules.dayLabel(date),
      daySchedules,
      dayRequests,
      visibleSlots,
      selectedSlotId: selectedSlot ? selectedSlot.id : "",
      selectedSlot
    });
  },

  selectDate(event) {
    this.setData({ selectedDate: event.currentTarget.dataset.date, selectedSlotId: "", selectedSlot: null });
    this.refreshDay();
  },

  selectCampus(event) {
    this.setData({ selectedCampus: event.currentTarget.dataset.value, selectedSlotId: "", selectedSlot: null });
    this.refreshDay();
  },

  selectProduct(event) {
    const id = event.currentTarget.dataset.id;
    const selectedProduct = this.data.courseProducts.find((item) => item.id === id) || this.data.courseProducts[0] || {};
    this.setData({ selectedProductId: id, selectedProduct });
  },

  selectSlot(event) {
    const id = event.currentTarget.dataset.id;
    const selectedSlot = this.data.visibleSlots.find((item) => item.id === id) || null;
    this.setData({ selectedSlotId: id, selectedSlot });
  },

  confirmBooking() {
    if (!this.data.selectedSlotId || this.data.submitting) return;
    this.setData({ submitting: true });
    api.syncing("正在生成草稿");
    subscribe.request(["bookingResult"]).then(() => api.call("createBookingRequest", {
      slotId: this.data.selectedSlotId,
      productId: this.data.selectedProduct.id || "",
      productName: this.data.selectedProduct.name || this.data.member.productName || ""
    })).then((result) => {
      api.done(result.message);
      this.setData({ selectedSlotId: "", selectedSlot: null });
      this.load();
    }).catch(api.fail).finally(() => this.setData({ submitting: false }));
  },

  showQr(event) {
    const schedule = this.data.schedules.find((item) => item.id === event.currentTarget.dataset.id);
    if (!schedule || schedule.verificationStatus !== "active") return;
    this.setData({ qrVisible: true, qrSchedule: schedule });
    setTimeout(() => qrcode.drawCanvas("homeQrCanvas", schedule.verificationPayload || rules.verificationPayload(schedule.verificationCode), { size: 220 }), 80);
  },

  hideQr() { this.setData({ qrVisible: false, qrSchedule: null }); },

  requestLeave(event) {
    const schedule = this.data.schedules.find((item) => item.id === event.currentTarget.dataset.id);
    if (!schedule) return;
    wx.showModal({
      title: "申请请假",
      editable: true,
      placeholderText: "简单说明原因",
      confirmText: "提交",
      success: (res) => {
        if (!res.confirm) return;
        api.syncing("正在提交");
        api.call("createLeaveRequest", { scheduleId: schedule.id, reason: res.content || "" })
          .then((result) => { api.done(result.message); this.load(); }).catch(api.fail);
      }
    });
  },

  applyCourse() {
    if (this.data.pendingApplications.length) {
      api.toast("续课申请正在处理中");
      return;
    }
    const product = this.data.selectedProduct || {};
    if (!product.id) {
      api.toast("暂无可申请课程");
      return;
    }
    wx.showModal({
      title: "申请续课",
      content: "申请 " + (product.name || "当前课程") + "，老板确认后更新课时",
      confirmText: "提交申请",
      success: (res) => {
        if (!res.confirm) return;
        api.syncing("正在提交");
        api.call("createCourseApplication", { productId: product.id, note: "学员首页申请续课" })
          .then((result) => { api.done(result.message); this.load(); }).catch(api.fail);
      }
    });
  },

  goRecords() { wx.navigateTo({ url: "/pages/student-records/student-records?focus=attendance" }); },
  noop() {},
  logout() { api.clearSession(); wx.reLaunch({ url: "/pages/login/login" }); }
});
