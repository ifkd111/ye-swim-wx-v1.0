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
  if (envVersion() !== "develop") return false;
  let localEnabled = false;
  try { localEnabled = wx.getStorageSync("__yeLocalRolePreview") === true; } catch (error) { localEnabled = false; }
  return Boolean(env.developerMock && env.developerMock.enabled || localEnabled);
}

function useMock() {
  return Boolean(env.useMock || developerMockEnabled());
}

module.exports = {
  envVersion,
  developerMockEnabled,
  useMock
};
