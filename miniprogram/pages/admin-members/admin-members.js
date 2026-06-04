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
    form: Object.assign({}, emptyForm)
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

  applyFilter() {
    const keyword = String(this.data.keyword || "").trim().toLowerCase();
    const members = (this.data.allMembers || []).filter((item) => {
      if (!keyword) return true;
      return [item.chineseName, item.phone, item.campus, item.coach, item.productName, item.notes, item.memberNo]
        .some((value) => String(value || "").toLowerCase().indexOf(keyword) >= 0);
    });
    this.setData({ members });
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
