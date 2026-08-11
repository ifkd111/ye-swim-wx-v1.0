const env = require("../env");

function request(keys) {
  const templates = env.subscriptionTemplates || {};
  const tmplIds = (keys || []).map((key) => templates[key]).filter(Boolean);
  if (!tmplIds.length || !wx.requestSubscribeMessage) return Promise.resolve({});
  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds,
      success: resolve,
      fail: resolve
    });
  });
}

module.exports = {
  request
};
