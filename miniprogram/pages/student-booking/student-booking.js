const api = require("../../utils/api");
const rules = require("../../utils/rules");
const subscribe = require("../../utils/subscribe");

Page({
  data: {
    ruleText: rules.bookingRuleText(),
    slots: [],
    visibleSlots: [],
    recommended: [],
    bookings: [],
    bookingSlotId: "",
    filter: "all",
    statusText: {
      pending: "待审批",
      approved: "已通过",
      rejected: "已拒绝",
      cancelled_by_student: "学员取消",
      cancelled_by_admin: "已取消"
    }
  },

  onShow() {
    if (!api.requireSession("student")) return;
    this.load();
  },

  load() {
    api.call("getHomeData").then((data) => {
      const bookings = (data.bookingRequests || []).map((item) => Object.assign({}, item, {
        statusClass: item.status === "pending" ? "warn" : item.status === "rejected" || item.status === "cancelled_by_student" || item.status === "cancelled_by_admin" ? "danger" : "",
        statusTip: item.status === "approved" ? "已约好，到时间上课即可" : item.status === "pending" ? "处理中" : item.status === "rejected" ? "可重新选择其他时间" : "该预约已取消"
      }));
      const activeBySlot = {};
      bookings.forEach((booking) => {
        if (booking.status === "pending" || booking.status === "approved") activeBySlot[booking.slotId] = true;
      });
      const slots = (data.availabilitySlots || [])
        .filter((slot) => !activeBySlot[slot.id] && Number(slot.left === undefined ? slot.capacity || 1 : slot.left) > 0)
        .map((slot) => {
          const left = Math.max(0, Number(slot.left === undefined ? slot.capacity || 1 : slot.left));
          return Object.assign({}, slot, {
            dayLabel: rules.dayLabel(slot.slotDate),
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
    const visibleSlots = this.data.slots.filter((slot) => {
      const diff = rules.daysFromToday(slot.slotDate);
      const weekday = rules.toDate(slot.slotDate).getDay();
      if (this.data.filter === "tomorrow") return diff >= 1;
      if (this.data.filter === "week") return diff >= 0 && diff <= 7;
      if (this.data.filter === "weekend") return weekday === 0 || weekday === 6;
      return true;
    });
    this.setData({ visibleSlots });
  },

  confirmBook(event) {
    if (this.data.bookingSlotId) return;
    const slotId = event.currentTarget.dataset.id;
    const slot = this.data.slots.find((item) => item.id === slotId);
    if (!slot) return;
    wx.showModal({
      title: "确认预约",
      content: slot.dayLabel + " " + slot.slotTime + "\n" + slot.campus + " · " + slot.coach + "\n确认后生成课程草稿，由老板发布",
      confirmText: "生成草稿",
      success: (res) => {
        if (res.confirm) this.book(slot.id);
      }
    });
  },

  book(slotId) {
    if (this.data.bookingSlotId) return;
    this.setData({ bookingSlotId: slotId });
    api.syncing("正在提交");
    subscribe.request(["bookingResult"]).then(() => api
      .call("createBookingRequest", {
        slotId,
        note: ""
      })
    )
      .then((result) => {
        api.done(result.message);
        this.load();
      })
      .catch(api.fail)
      .finally(() => this.setData({ bookingSlotId: "" }));
  },

  cancelBooking(event) {
    const requestId = event.currentTarget.dataset.id;
    wx.showModal({
      title: "取消预约",
      content: "确认取消这个待审批预约？",
      confirmText: "取消预约",
      success: (res) => {
        if (!res.confirm) return;
        api.syncing("正在取消");
        api
          .call("cancelBookingRequest", { requestId, reason: "学员自行取消" })
          .then((result) => {
            api.done(result.message);
            this.load();
          })
          .catch(api.fail);
      }
    });
  }
});
