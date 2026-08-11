const assert = require("assert");

const storage = {};
global.wx = {
  getStorageSync(key) { return storage[key]; },
  setStorageSync(key, value) { storage[key] = value; },
  removeStorageSync(key) { delete storage[key]; }
};

const mock = require("../miniprogram/utils/mock-store");

function call(session, action, payload) {
  return mock.call(action, Object.assign({}, payload || {}, session ? { session } : {}));
}

function main() {
  mock.call("resetMock");
  const admin = mock.call("login", { account: "yeats", password: "1324" }).session;

  const adminData = call(admin, "registrationAdminData", { envVersion: "develop" });
  const coachInvite = adminData.invites.find((item) => item.inviteType === "coach");
  const studentInvite = adminData.invites.find((item) => item.inviteType === "student");
  assert(coachInvite && studentInvite, "老板应同时获得 A、B 两个长期登记码");

  assert.strictEqual(call(null, "registrationContext", { scene: "i=" + coachInvite.token }).inviteType, "coach");
  call(null, "submitRegistration", { scene: "i=" + coachInvite.token, phone: "13900000001" });
  assert.throws(() => mock.call("loginByPhone", { phone: "13900000001", openid: "before-approve" }), /未开通/, "未审核申请不能登录");
  let requests = call(admin, "registrationAdminData", { envVersion: "develop" }).requests;
  const coachRequest = requests.find((item) => item.phone === "13900000001");
  call(admin, "reviewRegistration", { requestId: coachRequest.id, decision: "approve", displayName: "周教练" });
  const coachSession = mock.call("loginByPhone", { phone: "13900000001", openid: "coach-wechat" }).session;
  assert.strictEqual(coachSession.role, "coach");
  assert.strictEqual(coachSession.coachName, "周教练", "老板修正的教练姓名应成为系统姓名");

  call(null, "submitRegistration", {
    scene: "i=" + studentInvite.token,
    phone: "13900000002",
    children: [
      { clientId: "twin-a", name: "微信填的姐姐", remainingLessons: 8 },
      { clientId: "twin-b", name: "微信填的妹妹", remainingLessons: 6 }
    ]
  });
  assert.throws(() => mock.call("loginByPhone", { phone: "13900000002", openid: "family-before" }), /未开通/, "家长申请也必须等待老板确认");
  requests = call(admin, "registrationAdminData", { envVersion: "develop" }).requests;
  const familyRequest = requests.find((item) => item.phone === "13900000002");
  call(admin, "reviewRegistration", {
    requestId: familyRequest.id,
    decision: "approve",
    children: [
      { clientId: "twin-a", name: "林安安", remainingLessons: 9 },
      { clientId: "twin-b", name: "林乐乐", remainingLessons: -1 }
    ]
  });
  const familySession = mock.call("loginByPhone", { phone: "13900000002", openid: "family-wechat" }).session;
  const familyHome = call(familySession, "consumptionHomeData");
  assert.deepStrictEqual(familyHome.members.map((item) => item.chineseName), ["林安安", "林乐乐"], "一个手机号应同时绑定老板修正后的两个孩子");
  assert.deepStrictEqual(familyHome.members.map((item) => item.remainingLessons), [9, -1], "老板修正后的剩余课时应写入正式档案");
  assert.throws(() => call(admin, "saveMember", { member: Object.assign({}, familyHome.members[0], { phone: "13900000999" }) }), /不能修改/, "微信验证手机号在学员档案中必须锁定");
  const coachAccount = mock.loadState().accounts.find((item) => item.phone === "13900000001");
  assert.throws(() => call(admin, "saveAccount", { account: Object.assign({}, coachAccount, { phone: "13900000999" }) }), /不能修改/, "微信验证手机号在教练账号中必须锁定");

  const rotated = call(admin, "rotateRegistrationInvite", { inviteType: "coach", envVersion: "develop" });
  assert.notStrictEqual(rotated.invite.token, coachInvite.token, "换码必须产生新 token");
  assert.throws(() => call(null, "registrationContext", { scene: "i=" + coachInvite.token }), /已失效/, "换码后旧码必须立即失效");
  assert.strictEqual(call(null, "registrationContext", { scene: "i=" + rotated.invite.token }).inviteType, "coach");

  console.log("Self-registration V2.1 flow passed");
}

main();
