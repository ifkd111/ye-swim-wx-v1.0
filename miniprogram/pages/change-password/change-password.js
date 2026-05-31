const api = require("../../utils/api");

Page({
  data: {
    session: {},
    form: {
      oldPassword: "",
      newPassword: "",
      confirmPassword: ""
    },
    loading: false
  },

  onShow() {
    const session = api.currentSession();
    if (!session) {
      wx.reLaunch({ url: "/pages/login/login" });
      return;
    }
    this.setData({ session });
  },

  input(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ ["form." + field]: event.detail.value });
  },

  submit() {
    const form = this.data.form;
    if (!form.oldPassword || !form.newPassword) {
      api.toast("请填写原密码和新密码");
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      api.toast("两次新密码不一致");
      return;
    }
    if (form.newPassword.length < 4) {
      api.toast("新密码至少 4 位");
      return;
    }

    this.setData({ loading: true });
    api.syncing("正在修改");
    api
      .call("changeMyPassword", {
        oldPassword: form.oldPassword,
        newPassword: form.newPassword
      })
      .then((result) => {
        api.done(result.message);
        api.clearSession();
        setTimeout(() => wx.reLaunch({ url: "/pages/login/login" }), 900);
      })
      .catch(api.fail)
      .finally(() => this.setData({ loading: false }));
  }
});
