const api = require("../../utils/api");

const emptyForm = {
  id: "",
  chineseName: "",
  phone: "",
  campus: "绿洲",
  coach: "绿洲教练",
  productName: "20次卡",
  productType: "class_pack",
  totalLessons: 20,
  notes: ""
};

Page({
  data: {
    members: [],
    allMembers: [],
    keyword: "",
    filter: "all",
    filterStats: {},
    form: Object.assign({}, emptyForm)
  },

  onLoad(query) {
    if (query && query.filter) this.setData({ filter: query.filter });
  },

  onShow() {
    if (!api.requireSession("admin")) return;
    this.load();
  },

  load() {
    api.call("getHomeData").then((data) => {
      const members = data.members || [];
      this.setData({ allMembers: members }, () => this.applyFilter());
    });
  },

  input(event) {
    this.setData({ ["form." + event.currentTarget.dataset.field]: event.detail.value });
  },

  search(event) {
    this.setData({ keyword: event.detail.value }, () => this.applyFilter());
  },

  setFilter(event) {
    this.setData({ filter: event.currentTarget.dataset.filter || "all" }, () => this.applyFilter());
  },

  applyFilter() {
    const keyword = String(this.data.keyword || "").trim().toLowerCase();
    const allMembers = this.data.allMembers || [];
    const filterStats = {
      all: allMembers.length,
      low: allMembers.filter((item) => item.status === "即将用完" || item.status === "欠课" || item.status === "已完成").length,
      debt: allMembers.filter((item) => item.status === "欠课").length,
      done: allMembers.filter((item) => item.status === "已完成").length,
      monthly: allMembers.filter((item) => item.productType === "monthly").length
    };
    const members = allMembers.filter((item) => {
      if (this.data.filter === "low" && ["即将用完", "欠课", "已完成"].indexOf(item.status) < 0) return false;
      if (this.data.filter === "debt" && item.status !== "欠课") return false;
      if (this.data.filter === "done" && item.status !== "已完成") return false;
      if (this.data.filter === "monthly" && item.productType !== "monthly") return false;
      if (!keyword) return true;
      return [item.chineseName, item.phone, item.campus, item.coach, item.productName, item.notes, item.memberNo]
        .some((value) => String(value || "").toLowerCase().indexOf(keyword) >= 0);
    });
    this.setData({ members, filterStats });
  },

  editMember(event) {
    const id = event.currentTarget.dataset.id;
    const member = this.data.members.find((item) => item.id === id);
    if (!member) return;
    this.setData({
      form: {
        id: member.id,
        chineseName: member.chineseName || "",
        phone: member.phone || "",
        campus: member.campus || "",
        coach: member.coach || "",
        productName: member.productName || "20次卡",
        productType: member.productType || "class_pack",
        totalLessons: Number(member.totalLessons || 0),
        notes: member.notes || ""
      }
    });
    wx.pageScrollTo({ scrollTop: 0, duration: 180 });
  },

  resetForm() {
    this.setData({ form: Object.assign({}, emptyForm) });
  },

  saveMember() {
    api.syncing("正在保存");
    api
      .call("saveMember", { member: this.data.form })
      .then((result) => {
        api.done(result.message);
        this.resetForm();
        this.load();
      })
      .catch(api.fail);
  },

  goImport() {
    wx.navigateTo({ url: "/pages/admin-import/admin-import" });
  }
});
