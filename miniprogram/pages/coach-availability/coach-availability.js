const api = require("../../utils/api");

Page({
  data: {
    slots: [],
    form: {
      slotDate: "",
      slotTime: "17:00-18:00",
      campus: "绿洲",
      capacity: 1
    }
  },

  onShow() {
    if (!api.requireSession("coach")) return;
    this.load();
  },

  load() {
    api.call("getHomeData").then((data) => {
      this.setData({ slots: data.availabilitySlots || [] });
    });
  },

  input(event) {
    this.setData({ ["form." + event.currentTarget.dataset.field]: event.detail.value });
  },

  create() {
    api.syncing("正在提交");
    api
      .call("createAvailabilitySlot", this.data.form)
      .then((result) => {
        api.done(result.message);
        this.load();
      })
      .catch(api.fail);
  }
});
