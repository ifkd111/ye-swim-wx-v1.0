const api = require("../../utils/api");
const rules = require("../../utils/rules");

const emptyForm = {
  id: "",
  account: "",
  password: "",
  fullName: "",
  campus: "绿洲",
  coachName: "",
  memberName: ""
};

Page({
  data: {
    accounts: [],
    members: [],
    form: Object.assign({}, emptyForm),
    formRoleText: "请先填写账号",
    roleText: {
      admin: "管理员",
      coach: "教练",
      student: "学员"
    }
  },

  onShow() {
    if (!api.requireSession("admin")) return;
    this.load();
  },

  load() {
    api.call("getHomeData").then((data) => {
      this.setData({
        accounts: (data.accounts || []).map((account) => {
          const member = (data.members || []).find((item) => item.id === account.memberId);
          return Object.assign({}, account, { memberName: member ? member.chineseName : "" });
        }),
        members: data.members || []
      });
    });
  },

  roleTextFor(accountName) {
    const role = rules.roleFromAccount(accountName);
    if (role === "admin") return "管理员";
    if (role === "coach") return "教练";
    if (role === "student") return "学员";
    return "账号必须是 admin、jl 开头或 xy 开头";
  },

  input(event) {
    const field = event.currentTarget.dataset.field;
    const value = event.detail.value;
    this.setData({ ["form." + field]: value });
    if (field === "account") this.setData({ formRoleText: this.roleTextFor(value) });
  },

  editAccount(event) {
    const id = event.currentTarget.dataset.id;
    const account = this.data.accounts.find((item) => item.id === id);
    if (!account) return;
    this.setData({
      form: {
        id: account.id,
        account: account.account || "",
        password: "",
        fullName: account.fullName || "",
        campus: account.campus || "",
        coachName: account.coachName || "",
        memberName: account.memberName || ""
      },
      formRoleText: this.roleTextFor(account.account)
    });
    wx.pageScrollTo({ scrollTop: 0, duration: 180 });
  },

  resetForm() {
    this.setData({
      form: Object.assign({}, emptyForm),
      formRoleText: "请先填写账号"
    });
  },

  saveAccount() {
    api.syncing("正在保存");
    api
      .call("saveAccount", { account: this.data.form })
      .then((result) => {
        api.done(result.message);
        this.resetForm();
        this.load();
      })
      .catch(api.fail);
  }
});
