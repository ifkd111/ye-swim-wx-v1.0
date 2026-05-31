const api = require("../../utils/api");
const rules = require("../../utils/rules");

Page({
  data: {
    ruleText: rules.bookingRuleText(),
    slots: [],
    bookings: [],
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
      this.setData({
        slots: data.availabilitySlots || [],
        bookings: data.bookingRequests || []
      });
    });
  },

  book(event) {
    api.syncing("正在提交");
    api
      .call("createBookingRequest", {
        slotId: event.currentTarget.dataset.id,
        note: ""
      })
      .then((result) => {
        api.done(result.message);
        this.load();
      })
      .catch(api.fail);
  }
});
