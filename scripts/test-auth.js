const assert = require("assert");
const auth = require("../cloudfunctions/api/auth");

function main() {
  assert.strictEqual(auth.envFlag({ FLAG: "true" }, "FLAG"), true);
  assert.strictEqual(auth.envFlag({ FLAG: "TRUE" }, "FLAG"), false);
  assert.strictEqual(auth.isWechatSessionBound({ openid: "wx-a" }, { OPENID: "wx-a" }), true);
  assert.strictEqual(auth.isWechatSessionBound({ openid: "wx-a" }, { OPENID: "wx-b" }), false);
  assert.strictEqual(auth.isWechatSessionBound({ openid: "" }, { OPENID: "wx-a" }), false, "未绑定账号不能仅凭账号名通过会话鉴权");
  assert.strictEqual(auth.canBindWechat({ openid: "" }, { OPENID: "wx-a" }, false), true);
  assert.strictEqual(auth.canBindWechat({ openid: "wx-a" }, { OPENID: "wx-b" }, false), false, "默认不能抢绑老板账号");
  assert.strictEqual(auth.canBindWechat({ openid: "wx-a" }, { OPENID: "wx-b" }, true), true, "显式应急开关可允许换绑");
  assert.strictEqual(auth.safeEqual("secret-a", "secret-a"), true);
  assert.strictEqual(auth.safeEqual("secret-a", "secret-b"), false);
  const token = "admin-session-token";
  const account = {
    role: "admin",
    passwordSessions: [{ tokenHash: auth.hashSessionToken(token), expiresAt: "2030-01-01T00:00:00.000Z" }]
  };
  assert.strictEqual(auth.isPasswordSessionValid(account, token, new Date("2029-01-01")), true);
  assert.strictEqual(auth.isPasswordSessionValid(account, "wrong-token", new Date("2029-01-01")), false);
  assert.strictEqual(auth.isPasswordSessionValid(account, token, new Date("2031-01-01")), false);
  assert.strictEqual(auth.verifiedPhoneMatches("13800138000", "13800138000"), true);
  assert.strictEqual(auth.verifiedPhoneMatches("13800138000", "13900139000"), false, "输入号码必须与微信验证号码一致");
  assert.strictEqual(auth.verifiedPhoneMatches("123", "123"), false, "无效号码不能通过验证");
  console.log("Auth security tests passed");
}

main();
