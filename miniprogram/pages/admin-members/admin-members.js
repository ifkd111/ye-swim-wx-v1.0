const api = require("../../utils/api");
const rules = require("../../utils/rules");

function nextStudentAccount(accounts) {
  const max = (accounts || []).reduce((value, item) => {
    const match = /^xy(\d+)$/.exec(String(item.account || "").toLowerCase());
    return match ? Math.max(value, Number(match[1])) : value;
  }, 0);
  return "xy" + String(max + 1).padStart(3, "0");
}

function emptyForm(options) {
  const product = options && options.product || { id: "product-class-pack", name: "20次卡", type: "class_pack", totalLessons: 20 };
  return {
    id: "",
    chineseName: "",
    phone: "",
    campus: options && options.campus || "绿洲",
    coach: options && options.coach || "",
    productId: product.id || "",
    productName: product.name || "20次卡",
    productType: product.type || "class_pack",
    totalLessons: Number(product.totalLessons || 20),
    notes: ""
  };
}

Page({
  data: {
    viewMode: "list",
    members: [],
    allMembers: [],
    accounts: [],
    keyword: "",
    filter: "all",
    filterStats: { all: 0, low: 0, debt: 0, done: 0, monthly: 0 },
    campusOptions: ["绿洲", "古北"],
    coachOptions: [],
    productOptions: [],
    form: emptyForm(),
    linkedAccount: null,
    saving: false
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
      const accounts = data.accounts || [];
      const members = data.members || [];
      const coachOptions = accounts.filter((item) => item.role === "coach" && item.status !== "disabled")
        .map((item) => item.coachName || item.fullName).filter(Boolean);
      const campusOptions = Array.from(new Set(["绿洲", "古北"].concat(
        members.map((item) => item.campus),
        accounts.filter((item) => item.role === "coach").map((item) => item.campus)
      ).filter(Boolean)));
      const productOptions = (data.courseProducts || []).map((item) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        totalLessons: Number(item.totalLessons || 0),
        metaText: item.type === "monthly" ? "按有效期" : Number(item.totalLessons || 0) + " 课时"
      }));
      if (!productOptions.length) productOptions.push({ id: "product-class-pack", name: "20次卡", type: "class_pack", totalLessons: 20, metaText: "20 课时" });
      this.setData({ accounts, allMembers: members, coachOptions, campusOptions, productOptions }, () => this.applyFilter());
    }).catch(api.fail);
  },

  accountForMember(member) {
    return (this.data.accounts || []).find((account) => account.role === "student" && String(account.memberId || "") === String(member.id || "")) || null;
  },

  decorateMember(member) {
    const account = this.accountForMember(member);
    const total = Number(member.totalLessons || 0);
    const used = Number(member.usedLessons || 0);
    const progressPercent = total > 0 ? Math.min(100, Math.max(0, Math.round(used / total * 100))) : 0;
    return Object.assign({}, member, {
      progressPercent,
      loginText: account ? (account.wechatBound ? "微信已绑定" : "待首次登录") : (member.phone ? "登录账号待创建" : "未绑定手机号"),
      loginTone: account && account.wechatBound ? "" : "warn"
    });
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
      low: allMembers.filter((item) => ["即将用完", "欠课", "已完成"].indexOf(item.status) >= 0).length,
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
    }).map((item) => this.decorateMember(item));
    this.setData({ members, filterStats });
  },

  openCreate() {
    const product = this.data.productOptions[0];
    this.setData({
      viewMode: "form",
      linkedAccount: null,
      form: emptyForm({
        campus: this.data.campusOptions[0] || "绿洲",
        coach: this.data.coachOptions[0] || "",
        product
      })
    });
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },

  editMember(event) {
    const member = (this.data.allMembers || []).find((item) => item.id === event.currentTarget.dataset.id);
    if (!member) return;
    const linkedAccount = this.accountForMember(member);
    this.setData({
      viewMode: "form",
      linkedAccount,
      form: {
        id: member.id,
        chineseName: member.chineseName || "",
        phone: linkedAccount && linkedAccount.phone || member.phone || "",
        campus: member.campus || "",
        coach: member.coach || "",
        productId: member.productId || "",
        productName: member.productName || "20次卡",
        productType: member.productType || "class_pack",
        totalLessons: Number(member.totalLessons || 0),
        notes: member.notes || ""
      }
    });
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },

  closeForm() {
    this.setData({ viewMode: "list", linkedAccount: null });
  },

  input(event) {
    this.setData({ ["form." + event.currentTarget.dataset.field]: event.detail.value });
  },

  selectCampus(event) {
    this.setData({ "form.campus": event.currentTarget.dataset.value });
  },

  selectCoach(event) {
    this.setData({ "form.coach": event.currentTarget.dataset.value });
  },

  selectProduct(event) {
    const product = this.data.productOptions.find((item) => item.id === event.currentTarget.dataset.id);
    if (!product) return;
    this.setData({
      "form.productId": product.id,
      "form.productName": product.name,
      "form.productType": product.type,
      "form.totalLessons": Number(product.totalLessons || 0)
    });
  },

  syncStudentAccount(member) {
    const phone = rules.normalizePhone(this.data.form.phone);
    if (!phone) return Promise.reject(new Error("请先绑定学员手机号"));
    const current = this.data.linkedAccount || this.accountForMember(member);
    const account = {
      id: current && current.id || "",
      account: current && current.account || nextStudentAccount(this.data.accounts),
      fullName: member.chineseName,
      phone,
      campus: member.campus,
      memberId: member.id,
      memberName: member.chineseName,
      status: current && current.status || "active"
    };
    return api.call("saveAccount", { account });
  },

  saveMember() {
    if (this.data.saving) return;
    const form = this.data.form;
    if (!String(form.chineseName || "").trim()) return api.toast("请填写学员姓名");
    if (!rules.isChinaMobile(form.phone)) return api.toast("请绑定学员的 11 位手机号");
    if (!form.campus) return api.toast("请选择上课地点");
    if (!form.coach) return api.toast("请选择教练");
    if (this.data.linkedAccount && !form.phone) return api.toast("已开通登录的学员不能清空手机号");
    this.setData({ saving: true });
    api.syncing("正在保存学员");
    let savedMember = null;
    api.call("saveMember", { member: form }).then((result) => {
      savedMember = result.member;
      return this.syncStudentAccount(result.member);
    }).then(() => {
      api.done("学员与登录已保存");
      this.setData({ viewMode: "list", linkedAccount: null });
      this.load();
    }).catch((error) => {
      if (savedMember) {
        wx.hideLoading();
        api.toast("资料已保存，登录同步失败：" + (error.message || "请重试"));
        this.setData({ viewMode: "list", linkedAccount: null });
        this.load();
        return;
      }
      api.fail(error);
    }).finally(() => this.setData({ saving: false }));
  },

  goImport() {
    wx.navigateTo({ url: "/pages/admin-import/admin-import" });
  }
});
