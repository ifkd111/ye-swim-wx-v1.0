const api = require("../../utils/api");

Page({
  data: {
    bookings: [],
    statusText: {
      pending: "待审批",
      approved: "已通过",
      rejected: "已拒绝"
    }
  },

  onShow() {
    if (!api.requireSession("admin")) return;
    this.load();
  },

  load() {
    api.call("getHomeData").then((data) => {
      this.setData({ bookings: data.bookingRequests || [] });
    });
  },

  approve(event) {
    this.submit("approveBookingRequest", event.currentTarget.dataset.id);
  },

  reject(event) {
    this.submit("rejectBookingRequest", event.currentTarget.dataset.id);
  },

  submit(action, requestId) {
    api.syncing("正在同步");
    api
      .call(action, { requestId })
      .then((result) => {
        api.done(result.message);
        this.load();
      })
      .catch(api.fail);
  }
});
