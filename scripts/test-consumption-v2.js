const assert = require("assert");

const storage = {};
global.wx = {
  getStorageSync(key) { return storage[key]; },
  setStorageSync(key, value) { storage[key] = value; },
  removeStorageSync(key) { delete storage[key]; }
};

const mock = require("../miniprogram/utils/mock-store");

function login(account, password, openid) {
  return mock.call("login", { account, password, openid }).session;
}

function phone(phone, openid) {
  return mock.call("loginByPhone", { phone, openid }).session;
}

function call(session, action, payload) {
  return mock.call(action, Object.assign({}, payload || {}, { session }));
}

function main() {
  mock.call("resetMock");
  const admin = login("yeats", "1324", "v2-owner");
  const coach = phone("13333330001", "v2-coach");
  const family = phone("13333330002", "v2-family");

  const code = call(coach, "dailyCoachCode", { envVersion: "develop" });
  const secondCode = call(coach, "dailyCoachCode", { envVersion: "develop" });
  assert.strictEqual(code.token, secondCode.token, "同一教练当天的二维码必须固定不变");

  const context = call(family, "checkinContext", { scene: "t=" + code.token });
  assert.strictEqual(context.members.length, 2, "同一家长手机号应看到两个孩子");
  const ids = context.members.map((item) => item.id);
  const receipt = call(family, "confirmDailyCheckin", { scene: "t=" + code.token, memberIds: ids, lessons: 2, requestId: "v2-twins" });
  assert.strictEqual(receipt.logs.length, 2, "双胞胎同时到场应分别产生两条流水");
  assert(receipt.logs.every((item) => item.lessonsDeducted === 2), "每名到场学员都应扣两节");
  const retried = call(family, "confirmDailyCheckin", { scene: "t=" + code.token, memberIds: ids, lessons: 2, requestId: "v2-twins" });
  assert.strictEqual(retried.idempotent, true, "网络重试不应重复扣课或误报失败");
  assert.throws(() => call(family, "confirmDailyCheckin", { scene: "t=" + code.token, memberIds: [ids[0]], lessons: 1 }), /今天已在该教练处消课/, "同一学员同日同教练应阻止重复扫码");

  call(admin, "adjustConsumption", { logId: receipt.logs[0].id, lessons: 3, reason: "实际上了三节" });
  call(admin, "reverseConsumption", { logId: receipt.logs[1].id, reason: "孩子未到场" });
  let familyHome = call(family, "consumptionHomeData");
  const first = familyHome.members.find((item) => item.id === ids[0]);
  const second = familyHome.members.find((item) => item.id === ids[1]);
  assert.strictEqual(first.usedLessons, 3, "老板修改后学员课时应同步");
  assert.strictEqual(second.usedLessons, 0, "老板撤销后学员课时应返还");

  call(admin, "manualConsumption", { coachAccount: coach.account, memberIds: [ids[1]], lessons: 4, reason: "漏扫补录" });
  familyHome = call(family, "consumptionHomeData");
  assert.strictEqual(familyHome.members.find((item) => item.id === ids[1]).usedLessons, 4, "老板应能补录任意整数课时");

  const before = first.totalLessons;
  call(admin, "addMemberLessons", { memberId: ids[0], amount: 10, reason: "续费加课" });
  familyHome = call(family, "consumptionHomeData");
  assert.strictEqual(familyHome.members.find((item) => item.id === ids[0]).totalLessons, before + 10, "老板加课应更新总课时");
  assert.throws(() => call(coach, "reverseConsumption", { logId: receipt.logs[0].id }), /没有权限/, "教练不能篡改消课流水");

  const newMember = call(admin, "saveMember", { member: { chineseName: "家庭新增学员", phone: "13333330002", totalLessons: 5 } }).member;
  call(admin, "bindMemberGuardian", { memberId: newMember.id, phone: "13333330002" });
  const reboundFamily = phone("13333330002", "v2-family");
  assert.strictEqual(call(reboundFamily, "consumptionHomeData").members.length, 3, "老板应能把多个孩子绑定到同一家长手机号");

  const historyCount = call(admin, "consumptionHomeData").logs.length;
  call(admin, "bulkUpdateMemberStatus", { memberIds: [newMember.id], mode: "archive" });
  assert.strictEqual(call(reboundFamily, "consumptionHomeData").members.length, 2, "归档学员不应继续出现在家长当前名单");
  const archivedHome = call(admin, "consumptionHomeData", { includeArchived: true });
  const archivedMember = archivedHome.members.find((item) => item.id === newMember.id);
  assert(archivedMember && archivedMember.isArchived, "老板应能在归档名单中看到学员");
  assert.strictEqual(archivedHome.logs.length, historyCount, "归档不应删除历史消课流水");
  call(admin, "bulkUpdateMemberStatus", { memberIds: [newMember.id], mode: "restore" });
  assert.strictEqual(call(reboundFamily, "consumptionHomeData").members.length, 3, "恢复后学员应重新出现在家长当前名单");

  console.log("Pure consumption V2 flow passed");
}

main();
