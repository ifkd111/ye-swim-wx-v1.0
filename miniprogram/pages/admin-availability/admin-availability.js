const api = require("../../utils/api");

Page({
  data: {
    slots: [],
    form: {
      slotDate: "",
      slotTime: "17:00-18:00",
      campus: "绿洲",
      coach: "绿洲教练",
      capacity: 1,
      status: "published"
    }
  },

  onShow() {
    if (!api.requireSession("admin")) return;
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
    api.syncing("正在发布");
    api
      .call("createAvailabilitySlot", this.data.form)
      .then((result) => {
        api.done(result.message);
        this.load();
      })
      .catch(api.fail);
  },

  publish(event) {
    api.syncing("正在发布");
    api
      .call("publishAvailabilitySlot", { slotId: event.currentTarget.dataset.id })
      .then((result) => {
        api.done(result.message);
        this.load();
      })
      .catch(api.fail);
  }
});
