const env = require("../env");

function envVersion() {
  try {
    const info = wx.getAccountInfoSync();
    return info && info.miniProgram ? String(info.miniProgram.envVersion || "") : "";
  } catch (error) {
    return "";
  }
}

function developerMockEnabled() {
  return Boolean(env.developerMock && env.developerMock.enabled && envVersion() === "develop");
}

function useMock() {
  return Boolean(env.useMock || developerMockEnabled());
}

module.exports = {
  envVersion,
  developerMockEnabled,
  useMock
};
