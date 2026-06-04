const api = require("../../utils/api");

Page({
  data: {
    viewer: {},
    members: [],
    allMembers: [],
    keyword: ""
  },

  onShow() {
    if (!api.requireSession("coach")) return;
    this.load();
  },

  load() {
    api.call("getHomeData").then((data) => {
      const members = data.members || [];
      this.setData({
        viewer: data.viewer,
        allMembers: members
      }, () => this.applyFilter());
    });
  },

  search(event) {
    this.setData({ keyword: event.detail.value }, () => this.applyFilter());
  },

  applyFilter() {
    const keyword = String(this.data.keyword || "").trim().toLowerCase();
    const members = (this.data.allMembers || []).filter((item) => {
      if (!keyword) return true;
      return [item.chineseName, item.phone, item.campus, item.productName, item.notes, item.memberNo]
        .some((value) => String(value || "").toLowerCase().indexOf(keyword) >= 0);
    });
    this.setData({ members });
  }
});
