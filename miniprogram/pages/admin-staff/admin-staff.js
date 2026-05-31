const api = require("../../utils/api");

Page({
  data: {
    accounts: [],
    roleText: {
      admin: "管理员",
      coach: "教练",
      student: "学员"
    }
  },

  onShow() {
    if (!api.requireSession("admin")) return;
    api.call("getHomeData").then((data) => {
      this.setData({ accounts: data.accounts || [] });
    });
  }
});
