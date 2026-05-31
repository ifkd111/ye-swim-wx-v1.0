const api = require("../../utils/api");

Page({
  data: {
    members: []
  },

  onShow() {
    if (!api.requireSession("admin")) return;
    api.call("getHomeData").then((data) => {
      this.setData({ members: data.members || [] });
    });
  }
});
