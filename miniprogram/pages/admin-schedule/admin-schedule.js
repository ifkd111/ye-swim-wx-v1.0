const api = require("../../utils/api");

Page({
  data: {
    schedules: [],
    form: {
      lessonDate: "",
      lessonTime: "17:00-18:00",
      campus: "绿洲",
      coach: "绿洲教练",
      memberName: "白卓可"
    }
  },

  onShow() {
    if (!api.requireSession("admin")) return;
    this.load();
  },

  load() {
    api.call("getHomeData").then((data) => {
      this.setData({ schedules: (data.schedules || []).slice(0, 50) });
    });
  },

  input(event) {
    this.setData({ ["form." + event.currentTarget.dataset.field]: event.detail.value });
  },

  create() {
    api.syncing("正在创建");
    api
      .call("createManualSchedule", this.data.form)
      .then((result) => {
        api.done(result.message);
        this.load();
      })
      .catch(api.fail);
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
        api
          .call("cancelSchedule", { scheduleId, reason: res.content || "" })
          .then((result) => {
            api.done(result.message);
            this.load();
          })
          .catch(api.fail);
      }
    });
  }
});
