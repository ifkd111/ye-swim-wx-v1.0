const assert = require("assert");

const storage = {};
global.wx = {
  getStorageSync(key) { return storage[key]; },
  setStorageSync(key, value) { storage[key] = value; },
  removeStorageSync(key) { delete storage[key]; }
};

const mock = require("../miniprogram/utils/mock-store");

const COACH_PHONE = "13900008881";
const FAMILY_PHONE = "13900008882";
const COACH_NAME = "临测教练八八一";
const CHILD_ONE = "临测甲宝";
const CHILD_TWO = "临测乙宝";

function call(session, action, payload) {
  return mock.call(action, Object.assign({}, payload || {}, { session }));
}

function main() {
  mock.call("resetMock");
  const owner = mock.call("login", { account: "yeats", password: "1324", openid: "role-test-owner" }).session;
  assert.strictEqual(owner.role, "admin");

  const coachAccount = call(owner, "saveAccount", { account: { account: "jl881", fullName: COACH_NAME, coachName: COACH_NAME, phone: COACH_PHONE, status: "active" } }).account;
  assert.strictEqual(coachAccount.role, "coach");

  const childOne = call(owner, "saveMember", { member: { chineseName: CHILD_ONE, phone: FAMILY_PHONE, totalLessons: 1, notes: "三角色测试" } }).member;
  call(owner, "bindMemberGuardian", { memberId: childOne.id, phone: FAMILY_PHONE });
  const childTwo = call(owner, "saveMember", { member: { chineseName: CHILD_TWO, phone: FAMILY_PHONE, totalLessons: 0, notes: "三角色测试" } }).member;
  call(owner, "bindMemberGuardian", { memberId: childTwo.id, phone: FAMILY_PHONE });

  const coach = mock.call("loginByPhone", { phone: COACH_PHONE, openid: "role-test-coach" }).session;
  assert.strictEqual(coach.role, "coach");
  const code = call(coach, "dailyCoachCode", { envVersion: "develop" });
  const codeAgain = call(coach, "dailyCoachCode", { envVersion: "develop" });
  assert.strictEqual(code.id, codeAgain.id, "同一教练当天二维码必须固定不变");
  assert.throws(() => call(coach, "saveMember", { member: { chineseName: "越权学员" } }), /没有权限/, "教练不能修改学员档案");

  const family = mock.call("loginByPhone", { phone: FAMILY_PHONE, openid: "role-test-family" }).session;
  assert.strictEqual(family.role, "student");
  const familyHome = call(family, "consumptionHomeData");
  assert.deepStrictEqual(familyHome.members.map((item) => item.chineseName).sort(), [CHILD_ONE, CHILD_TWO].sort(), "一个手机号应只看到自己绑定的多名孩子");
  assert.throws(() => call(family, "saveAccount", { account: coachAccount }), /没有权限/, "家长不能修改教练账号");
  assert.throws(() => call(family, "checkinContext", { scene: "invalid-scene" }), /教练码无效/);

  const context = call(family, "checkinContext", { scene: code.token });
  assert.strictEqual(context.members.length, 2);
  const requestId = "three-role-request";
  const result = call(family, "confirmDailyCheckin", {
    scene: code.token,
    requestId,
    memberLessons: [
      { memberId: childOne.id, lessons: 2 },
      { memberId: childTwo.id, lessons: 1 }
    ]
  });
  assert.strictEqual(result.logs.length, 2);
  assert.strictEqual(result.members.find((item) => item.id === childOne.id).remainingLessons, -1, "允许欠课时余额应为负数");
  assert.strictEqual(result.members.find((item) => item.id === childTwo.id).remainingLessons, -1, "零课时学员也允许正常消课");
  const idempotent = call(family, "confirmDailyCheckin", {
    scene: code.token,
    requestId,
    memberLessons: [{ memberId: childOne.id, lessons: 2 }]
  });
  assert.strictEqual(idempotent.idempotent, true, "重复提交同一 requestId 不得重复扣课");
  assert.throws(() => call(family, "confirmDailyCheckin", {
    scene: code.token,
    requestId: "another-request",
    memberLessons: [{ memberId: childOne.id, lessons: 1 }]
  }), /今天已在该教练处消课/, "同日同教练再次扫码应阻止重复扣课");

  let ownerHome = call(owner, "consumptionHomeData");
  const testLogs = ownerHome.todayLogs.filter((item) => [CHILD_ONE, CHILD_TWO].includes(item.memberName));
  assert.strictEqual(testLogs.length, 2);
  assert.strictEqual(testLogs.reduce((sum, item) => sum + item.lessonsDeducted, 0), 3);
  assert(ownerHome.accounts.some((item) => item.phone === COACH_PHONE), "老板应看到新增教练");

  const firstLog = testLogs.find((item) => item.memberId === childOne.id);
  const secondLog = testLogs.find((item) => item.memberId === childTwo.id);
  call(owner, "adjustConsumption", { logId: firstLog.id, lessons: 3, reason: "老板测试调整" });
  call(owner, "reverseConsumption", { logId: secondLog.id, reason: "老板测试撤销" });
  call(owner, "manualConsumption", { coachAccount: coach.account, memberIds: [childTwo.id], lessons: 2, reason: "老板测试补录" });
  call(owner, "addMemberLessons", { memberId: childTwo.id, amount: 5, reason: "老板测试加课" });
  ownerHome = call(owner, "consumptionHomeData", { includeArchived: true });
  assert.strictEqual(ownerHome.stats.todayLessons, 5, "调整、撤销、补录后的今日课时统计错误");
  assert.strictEqual(ownerHome.members.find((item) => item.id === childTwo.id).remainingLessons, 3, "加课后余额未同步");

  call(owner, "bulkUpdateMemberStatus", { memberIds: [childTwo.id], mode: "archive" });
  assert(!call(family, "consumptionHomeData").members.some((item) => item.id === childTwo.id), "归档学员不应继续显示在家长当前名单");
  call(owner, "bulkUpdateMemberStatus", { memberIds: [childTwo.id], mode: "restore" });
  assert(call(family, "consumptionHomeData").members.some((item) => item.id === childTwo.id), "恢复学员后应重新显示");

  const coachHome = call(coach, "consumptionHomeData");
  assert.strictEqual(coachHome.todayLogs.filter((item) => [CHILD_ONE, CHILD_TWO].includes(item.memberName)).reduce((sum, item) => sum + item.lessonsDeducted, 0), 5, "教练端今日流水未同步老板纠错结果");
  const finalFamilyHome = call(family, "consumptionHomeData");
  assert(finalFamilyHome.logs.some((item) => item.memberName === CHILD_TWO && item.status === "reversed"), "家长端应保留已撤销记录");

  mock.call("resetMock");
  const cleaned = mock.loadState();
  assert(!cleaned.accounts.some((item) => [COACH_PHONE, FAMILY_PHONE].includes(item.phone)), "测试账号未清理干净");
  assert(!cleaned.members.some((item) => [CHILD_ONE, CHILD_TWO].includes(item.chineseName)), "测试学员未清理干净");

  console.log("三角色闭环测试通过：建档、登录、固定教练码、双孩不同课时、欠课、幂等、重复阻止、老板纠错、三端同步、权限隔离、清理。");
}

try { main(); } catch (error) {
  try { mock.call("resetMock"); } catch (cleanupError) {}
  throw error;
}
