const api = require("../../utils/api");

Page({
  data: {
    viewer: {},
    members: []
  },

  onShow() {
    if (!api.requireSession("coach")) return;
    this.load();
  },

  load() {
    api.call("getHomeData").then((data) => {
      this.setData({
        viewer: data.viewer,
        members: data.members || []
      });
    });
  }
});
