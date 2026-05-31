const env = require("../env");
const mock = require("./mock-store");

function currentSession() {
  return wx.getStorageSync("session") || null;
}

function saveSession(session) {
  wx.setStorageSync("session", session);
  getApp().globalData.session = session;
}

function clearSession() {
  wx.removeStorageSync("session");
  getApp().globalData.session = null;
}

function call(action, payload) {
  const data = Object.assign({}, payload || {}, {
    session: currentSession()
  });

  if (env.useMock) {
    return new Promise((resolve, reject) => {
      try {
        resolve(mock.call(action, data));
      } catch (error) {
        reject(error);
      }
    });
  }

  return wx.cloud
    .callFunction({
      name: "api",
      data: {
        action,
        payload: data
      }
    })
    .then((response) => {
      const result = response.result || {};
      if (!result.ok) {
        throw new Error(result.message || "操作失败");
      }
      return result.data;
    });
}

function toast(message, icon) {
  wx.showToast({
    title: message,
    icon: icon || "none",
    duration: 1800
  });
}

function syncing(title) {
  wx.showLoading({
    title: title || "正在同步",
    mask: true
  });
}

function done(message) {
  wx.hideLoading();
  toast(message || "已同步", "success");
}

function fail(error) {
  wx.hideLoading();
  toast(error && error.message ? error.message : "同步失败，请重试");
}

function homePath(role) {
  if (role === "admin") return "/pages/admin/admin";
  if (role === "coach") return "/pages/coach/coach";
  if (role === "student") return "/pages/student/student";
  return "/pages/login/login";
}

function requireSession(role) {
  const session = currentSession();
  if (!session || (role && session.role !== role)) {
    wx.reLaunch({ url: "/pages/login/login" });
    return null;
  }
  return session;
}

module.exports = {
  call,
  currentSession,
  saveSession,
  clearSession,
  toast,
  syncing,
  done,
  fail,
  homePath,
  requireSession
};
