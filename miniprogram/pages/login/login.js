const api = require("../../utils/api");
const env = require("../../env");
const runtime = require("../../utils/runtime");
const rules = require("../../utils/rules");

const developerMock = runtime.developerMockEnabled();
const useMock = runtime.useMock();
const testLogin = developerMock
  ? { enabled: true, phone: env.developerMock.phone, developerOnly: true }
  : env.testLogin || {};

Page({
  data: {
    mode: "phone",
    account: "",
    password: useMock ? "1324" : "",
    phone: testLogin.phone || (useMock ? "13333330002" : ""),
    useMock,
    testLogin,
    loading: false,
    fieldError: "",
    helpVisible: false
  },

  onLoad() {
    const session = api.currentSession();
    if (session && session.role) {
      this.routeAfterLogin(session);
      return;
    }
    // 所有身份统一从微信手机号入口进入；扫码场景会在识别为家长后继续本次消课。
    if (wx.getStorageSync("pendingCheckinScene")) this.setData({ mode: "phone" });
  },

  routeAfterLogin(session) {
    const scene = wx.getStorageSync("pendingCheckinScene");
    if (scene && session.role === "student") {
      wx.reLaunch({ url: "/pages/checkin/checkin?scene=" + encodeURIComponent(scene) });
      return;
    }
    wx.reLaunch({ url: api.homePath(session.role) });
  },

  onAccountInput(event) {
    this.setData({ account: String(event.detail.value || "").trim(), fieldError: "" });
  },

  onPasswordInput(event) {
    this.setData({ password: event.detail.value, fieldError: "" });
  },

  onPhoneInput(event) {
    this.setData({ phone: event.detail.value });
  },

  setMode(event) {
    this.setData({ mode: event.currentTarget.dataset.mode, fieldError: "" });
  },

  showHelp() { this.setData({ helpVisible: true }); },
  closeHelp() { this.setData({ helpVisible: false }); },
  openAccountLogin() { this.setData({ helpVisible: false, mode: "password", account: "", password: "", fieldError: "" }); },
  closeAccountLogin() { this.setData({ mode: "phone", account: "", password: "", fieldError: "" }); },
  noop() {},

  login() {
    if (this.data.loading) return;
    const account = String(this.data.account || "").trim();
    const password = String(this.data.password || "");
    if (!rules.isChinaMobile(account) && account.toLowerCase() !== "yeats") {
      this.setData({ fieldError: "账号或手机号不正确" });
      return;
    }
    if (!password) {
      this.setData({ fieldError: "请输入老板密码" });
      return;
    }
    this.setData({ loading: true });
    api
      .call("login", {
        account,
        password
      })
      .then((result) => {
        api.saveSession(result.session);
        this.routeAfterLogin(result.session);
      })
      .catch(api.fail)
      .finally(() => this.setData({ loading: false }));
  },

  phoneLogin(event) {
    if (this.data.loading) return;
    const phone = rules.normalizePhone(this.data.phone);
    if (this.data.useMock && !rules.isChinaMobile(phone)) {
      api.toast("请输入老板登记的 11 位手机号");
      return;
    }
    const phoneCode = event && event.detail && event.detail.code;
    if (!this.data.useMock && !phoneCode) {
      api.toast("需要授权手机号后才能登录");
      return;
    }
    this.setData({ loading: true });
    api
      .call("loginByPhone", {
        phoneCode,
        phone: this.data.useMock ? phone : "",
        openid: "mock-phone-" + phone
      })
      .then((result) => {
        api.saveSession(result.session);
        this.routeAfterLogin(result.session);
      })
      .catch((error) => {
        this.setData({ fieldError: error && error.message ? error.message : "登录失败，请重试" });
      })
      .finally(() => this.setData({ loading: false }));
  },

  testLogin(event) {
    if (this.data.loading) return;
    const role = event.currentTarget.dataset.role;
    this.setData({ loading: true });
    api
      .call("loginForTest", {
        phone: this.data.phone,
        role
      })
      .then((result) => {
        api.saveSession(result.session);
        this.routeAfterLogin(result.session);
      })
      .catch(api.fail)
      .finally(() => this.setData({ loading: false }));
  }
});
