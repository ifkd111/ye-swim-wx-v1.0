const api = require("../../utils/api");
const runtime = require("../../utils/runtime");

function newChild(index) {
  return { clientId: "child-" + Date.now().toString(36) + "-" + index, name: "", remainingLessons: "" };
}

Page({
  data: {
    scene: "",
    loading: true,
    error: "",
    context: null,
    children: [newChild(1)],
    mockMode: false,
    mockPhone: "13800000000",
    submitting: false,
    submitted: false,
    formError: ""
  },
  onLoad(options) {
    let scene = "";
    try { scene = decodeURIComponent(options && options.scene || ""); } catch (error) { scene = String(options && options.scene || ""); }
    this.setData({ scene, mockMode: runtime.useMock() });
    if (!scene) return this.setData({ loading: false, error: "没有识别到登记码，请重新扫码" });
    api.call("registrationContext", { scene }).then((context) => {
      wx.setNavigationBarTitle({ title: context.title || "扫码登记" });
      this.setData({ context, loading: false });
    }).catch((error) => this.setData({ loading: false, error: error.message || "登记码读取失败" }));
  },
  inputMockPhone(event) { this.setData({ mockPhone: event.detail.value }); },
  childInput(event) {
    const index = Number(event.currentTarget.dataset.index);
    const field = event.currentTarget.dataset.field;
    const children = this.data.children.slice();
    children[index] = Object.assign({}, children[index], { [field]: event.detail.value });
    this.setData({ children, formError: "" });
  },
  addChild() {
    if (this.data.children.length >= 6) return api.toast("一次最多登记 6 名孩子");
    this.setData({ children: this.data.children.concat(newChild(this.data.children.length + 1)) });
  },
  removeChild(event) {
    if (this.data.children.length === 1) return api.toast("至少保留一名孩子");
    const index = Number(event.currentTarget.dataset.index);
    this.setData({ children: this.data.children.filter((item, childIndex) => childIndex !== index) });
  },
  validatedChildren() {
    return this.data.children.map((item, index) => {
      const name = String(item.name || "").trim();
      const remainingLessons = Number(item.remainingLessons);
      if (!name) throw new Error("请填写第 " + (index + 1) + " 名孩子的姓名");
      if (item.remainingLessons === "" || !Number.isInteger(remainingLessons) || remainingLessons < -999 || remainingLessons > 99999) throw new Error("请填写第 " + (index + 1) + " 名孩子的整数剩余课时");
      return { clientId: item.clientId, name, remainingLessons };
    });
  },
  authorizePhone(event) {
    if (this.data.submitting) return;
    let children = [];
    try {
      if (this.data.context.inviteType === "student") children = this.validatedChildren();
    } catch (error) {
      this.setData({ formError: error.message });
      return api.toast(error.message);
    }
    const phoneCode = event && event.detail && event.detail.code || "";
    if (!this.data.mockMode && !phoneCode) { this.setData({ formError: "需要授权手机号才能提交登记" }); return api.toast("需要授权手机号才能提交登记"); }
    this.setData({ submitting: true, formError: "" });
    api.syncing("正在提交");
    api.call("submitRegistration", { scene: this.data.scene, phoneCode, phone: this.data.mockMode ? this.data.mockPhone : "", children }).then((result) => {
      api.done("已提交");
      this.setData({ submitted: true, submitting: false, result });
    }).catch((error) => { this.setData({ submitting: false, formError: error.message || "提交失败，请重试" }); api.fail(error); });
  },
  goLogin() { wx.reLaunch({ url: "/pages/login/login" }); }
});
