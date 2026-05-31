const api = require("../../utils/api");
const rules = require("../../utils/rules");

function toDate(value) {
  return new Date(String(value) + "T00:00:00");
}

function daysBetween(a, b) {
  return Math.floor((toDate(a) - toDate(b)) / 86400000);
}

function dayLabel(slotDate) {
  const today = rules.formatDateChina(new Date());
  const diff = daysBetween(slotDate, today);
  if (diff === 1) return "明天";
  if (diff === 2) return "后天";
  const week = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][toDate(slotDate).getDay()];
  return slotDate + " " + week;
}

Page({
  data: {
    ruleText: rules.bookingRuleText(),
    slots: [],
    visibleSlots: [],
    recommended: [],
    bookings: [],
    filter: "all",
    statusText: {
      pending: "待审批",
      approved: "已通过",
      rejected: "已拒绝"
    }
  },

  onShow() {
    if (!api.requireSession("student")) return;
    this.load();
  },

  load() {
    api.call("getHomeData").then((data) => {
      const bookings = data.bookingRequests || [];
      const activeBySlot = {};
      bookings.forEach((booking) => {
        if (booking.status === "pending" || booking.status === "approved") activeBySlot[booking.slotId] = true;
      });
      const slots = (data.availabilitySlots || [])
        .filter((slot) => !activeBySlot[slot.id])
        .map((slot) => {
          const left = Math.max(1, Number(slot.capacity || 1));
          return Object.assign({}, slot, {
            dayLabel: dayLabel(slot.slotDate),
            left
          });
        })
        .sort((a, b) => (a.slotDate + a.slotTime).localeCompare(b.slotDate + b.slotTime));
      this.setData({
        slots,
        bookings,
        recommended: slots.slice(0, 3)
      });
      this.applyFilter();
    });
  },

  setFilter(event) {
    this.setData({ filter: event.currentTarget.dataset.filter });
    this.applyFilter();
  },

  applyFilter() {
    const today = rules.formatDateChina(new Date());
    const visibleSlots = this.data.slots.filter((slot) => {
      const diff = daysBetween(slot.slotDate, today);
      const weekday = toDate(slot.slotDate).getDay();
      if (this.data.filter === "tomorrow") return diff >= 1;
      if (this.data.filter === "week") return diff >= 0 && diff <= 7;
      if (this.data.filter === "weekend") return weekday === 0 || weekday === 6;
      return true;
    });
    this.setData({ visibleSlots });
  },

  confirmBook(event) {
    const slotId = event.currentTarget.dataset.id;
    const slot = this.data.slots.find((item) => item.id === slotId);
    if (!slot) return;
    wx.showModal({
      title: "确认预约",
      content: slot.dayLabel + " " + slot.slotTime + "\n" + slot.campus + " · " + slot.coach + "\n提交后等待老板确认",
      confirmText: "提交",
      success: (res) => {
        if (res.confirm) this.book(slot.id);
      }
    });
  },

  book(slotId) {
    api.syncing("正在提交");
    api
      .call("createBookingRequest", {
        slotId,
        note: ""
      })
      .then((result) => {
        api.done(result.message);
        this.load();
      })
      .catch(api.fail);
  }
});
