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
  console.log("Auth security tests passed");
}

main();
