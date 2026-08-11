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

function verifiedPhoneMatches(expectedPhone, verifiedPhone) {
  const expected = String(expectedPhone || "").replace(/\D/g, "").slice(0, 11);
  const verified = String(verifiedPhone || "").replace(/\D/g, "").slice(0, 11);
  return /^1[3-9]\d{9}$/.test(expected) && expected === verified;
}

module.exports = {
  envFlag,
  wxOpenid,
  isWechatSessionBound,
  canBindWechat,
  safeEqual,
  verifiedPhoneMatches
};
