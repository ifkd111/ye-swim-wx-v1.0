const crypto = require("crypto");

function envFlag(env, name) {
  return Boolean(env && env[name] === "true");
}

function wxOpenid(wxContext) {
  return String(wxContext && wxContext.OPENID || "").trim();
}

function isWechatSessionBound(account, wxContext) {
  const openid = wxOpenid(wxContext);
  return Boolean(account && account.openid && openid && account.openid === openid);
}

function canBindWechat(account, wxContext, allowRebind) {
  const openid = wxOpenid(wxContext);
  if (!openid) return false;
  if (!account || !account.openid) return true;
  return account.openid === openid || allowRebind === true;
}

function safeEqual(left, right) {
  const first = Buffer.from(String(left || ""));
  const second = Buffer.from(String(right || ""));
  return first.length === second.length && crypto.timingSafeEqual(first, second);
}

module.exports = {
  envFlag,
  wxOpenid,
  isWechatSessionBound,
  canBindWechat,
  safeEqual
};
