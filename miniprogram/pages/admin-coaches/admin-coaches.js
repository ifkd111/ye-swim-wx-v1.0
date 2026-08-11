const api = require("../../utils/api");
const rules = require("../../utils/rules");

function nextCoachAccount(accounts) {
  const max = (accounts || []).reduce((value, item) => {
    const match = /^jl(\d+)$/.exec(String(item.account || "").toLowerCase());
    return match ? Math.max(value, Number(match[1])) : value;
  }, 0);
  return "jl" + String(max + 1).padStart(3, "0");
}

function emptyForm(account) {
  return {
    id: "",
    account: account || "jl001",
    fullName: "",
    phone: "",
    campus: "",
    coachName: "",
    status: "active"
  };
}

Page({
  data: {
    viewMode: "list",
    accounts: [],
    coaches: [],
    keyword: "",
    filter: "all",
    filterStats: { all: 0, active: 0, pending: 0, disabled: 0 },
    form: emptyForm("jl001"),
    saving: false
  },

  onShow() {
    if (!api.requireSession("admin")) return;
    this.load();
  },

  load() {
    api.call("consumptionHomeData").then((data) => {
      const accounts = data.accounts || [];
      this.setData({ accounts }, () => this.applyFilter());
    }).catch(api.fail);
  },

  applyFilter() {
    const keyword = String(this.data.keyword || "").trim().toLowerCase();
    const all = (this.data.accounts || []).filter((item) => item.role === "coach").map((item) => {
      const coachName = item.coachName || item.fullName || item.account;
      return Object.assign({}, item, {
        coachName,
        initial: coachName.slice(0, 1),
        bindingText: item.wechatBound ? "微信已绑定" : "待首次登录"
      });
    });
    const filterStats = {
      all: all.length,
      active: all.filter((item) => item.status !== "disabled").length,
      pending: all.filter((item) => item.status !== "disabled" && !item.wechatBound).length,
      disabled: all.filter((item) => item.status === "disabled").length
    };
    const coaches = all.filter((item) => {
      if (this.data.filter === "active" && item.status === "disabled") return false;
      if (this.data.filter === "pending" && (item.status === "disabled" || item.wechatBound)) return false;
      if (this.data.filter === "disabled" && item.status !== "disabled") return false;
      if (!keyword) return true;
      return [item.coachName, item.fullName, item.phone, item.account]
        .some((value) => String(value || "").toLowerCase().indexOf(keyword) >= 0);
    });
    this.setData({ coaches, filterStats });
  },

  search(event) {
    this.setData({ keyword: event.detail.value }, () => this.applyFilter());
  },

  setFilter(event) {
    this.setData({ filter: event.currentTarget.dataset.filter || "all" }, () => this.applyFilter());
  },

  openCreate() {
    this.setData({
      viewMode: "form",
      form: emptyForm(nextCoachAccount(this.data.accounts))
    });
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },

  editCoach(event) {
    const coach = (this.data.accounts || []).find((item) => item.id === event.currentTarget.dataset.id);
    if (!coach) return;
    this.setData({
      viewMode: "form",
      form: {
        id: coach.id,
        account: coach.account || "",
        fullName: coach.fullName || coach.coachName || "",
        phone: coach.phone || "",
        campus: "",
        coachName: coach.coachName || coach.fullName || "",
        status: coach.status || "active"
      }
    });
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },

  closeForm() {
    this.setData({ viewMode: "list", form: emptyForm(nextCoachAccount(this.data.accounts)) });
  },

  input(event) {
    const field = event.currentTarget.dataset.field;
    const value = event.detail.value;
    const patch = { ["form." + field]: value };
    if (field === "fullName") patch["form.coachName"] = value;
    this.setData(patch);
  },

  selectStatus(event) {
    this.setData({ "form.status": event.currentTarget.dataset.value });
  },

  saveCoach() {
    if (this.data.saving) return;
    const form = this.data.form;
    if (!String(form.fullName || "").trim()) return api.toast("请填写教练姓名");
    if (!rules.isChinaMobile(form.phone)) return api.toast("请填写 11 位教练手机号");
    this.setData({ saving: true });
    api.syncing("正在保存教练");
    api.call("saveAccount", { account: form }).then((result) => {
      api.done(result.message);
      this.setData({ viewMode: "list" });
      this.load();
    }).catch(api.fail).finally(() => this.setData({ saving: false }));
  },

  toggleCoach(event) {
    const coach = (this.data.accounts || []).find((item) => item.id === event.currentTarget.dataset.id);
    if (!coach) return;
    const disabling = coach.status !== "disabled";
    wx.showModal({
      title: disabling ? "停用教练" : "重新启用教练",
      content: disabling ? "停用后教练不能继续登录，历史课程不会删除。" : "启用后教练可继续用登记手机号登录。",
      confirmText: disabling ? "确认停用" : "确认启用",
      success: (modal) => {
        if (!modal.confirm) return;
        api.syncing("正在更新");
        api.call("saveAccount", { account: Object.assign({}, coach, { status: disabling ? "disabled" : "active" }) })
          .then((result) => { api.done(result.message); this.load(); })
          .catch(api.fail);
      }
    });
  },

  unbindWechat(event) {
    const coach = (this.data.accounts || []).find((item) => item.id === event.currentTarget.dataset.id);
    if (!coach) return;
    wx.showModal({
      title: "解除微信绑定",
      content: "解除 " + (coach.coachName || coach.fullName || coach.account) + " 的旧微信绑定？之后需用登记手机号重新验证。",
      confirmText: "确认解除",
      success: (modal) => {
        if (!modal.confirm) return;
        api.syncing("正在解除");
        api.call("unbindAccountWechat", { id: coach.id }).then((result) => {
          api.done(result.message);
          this.load();
        }).catch(api.fail);
      }
    });
  }
});
