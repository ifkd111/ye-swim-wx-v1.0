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
    account: useMock ? "yeats" : "",
    password: useMock ? "1324" : "",
    phone: testLogin.phone || (useMock ? "13333330002" : ""),
    useMock,
    testLogin,
    loading: false
  },

  onLoad() {
    const session = api.currentSession();
    if (session && session.role) {
      this.routeAfterLogin(session);
    }
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
    this.setData({ account: event.detail.value });
  },

  onPasswordInput(event) {
    this.setData({ password: event.detail.value });
  },

  onPhoneInput(event) {
    this.setData({ phone: event.detail.value });
  },

  setMode(event) {
    this.setData({ mode: event.currentTarget.dataset.mode });
  },

  login() {
    if (this.data.loading) return;
    const account = String(this.data.account || "").trim();
    const password = String(this.data.password || "");
    if (!account) {
      api.toast("请输入老板手机号");
      return;
    }
    if (!password) {
      api.toast("请输入老板密码");
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
      .catch(api.fail)
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
