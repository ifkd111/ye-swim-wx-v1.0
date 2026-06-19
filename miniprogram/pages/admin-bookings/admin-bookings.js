const api = require("../../utils/api");

Page({
  data: {
    bookings: [],
    statusText: {
      pending: "待审批",
      approved: "已通过",
      rejected: "已拒绝",
      cancelled_by_student: "学员取消",
      cancelled_by_admin: "已取消"
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
    wx.showModal({
      title: "通过预约",
      content: "通过后将自动生成正式排课，确认处理？",
      confirmText: "通过",
      success: (res) => { if (res.confirm) this.submit("approveBookingRequest", event.currentTarget.dataset.id); }
    });
  },

  reject(event) {
    this.askReason("拒绝预约", "例如：名额已满 / 时间需调整", "rejectBookingRequest", event.currentTarget.dataset.id);
  },

  cancel(event) {
    this.askReason("取消预约", "例如：教练临时有事", "cancelBookingRequest", event.currentTarget.dataset.id);
  },

  askReason(title, placeholderText, action, requestId) {
    wx.showModal({
      title,
      editable: true,
      placeholderText,
      confirmText: "确认",
      success: (res) => {
        if (!res.confirm) return;
        this.submit(action, requestId, res.content || "");
      }
    });
  },

  submit(action, requestId, reason) {
    api.syncing("正在同步");
    api.call(action, { requestId, reason }).then((result) => {
      api.done(result.message);
      this.load();
    }).catch(api.fail);
  }
});
