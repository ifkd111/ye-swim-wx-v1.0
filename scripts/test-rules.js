const assert = require("assert");
const rules = require("../shared/rules");

function testRole() {
  assert.strictEqual(rules.roleFromAccount("yeats"), "admin");
  assert.strictEqual(rules.roleFromAccount("admin"), null);
  assert.strictEqual(rules.roleFromAccount("JL001"), "coach");
  assert.strictEqual(rules.roleFromAccount("xy001"), "student");
  assert.strictEqual(rules.roleFromAccount("abc"), null);
}

function testBookingDate() {
  assert.strictEqual(rules.minStudentBookingDate("2026-05-25T11:59:00+08:00"), "2026-05-26");
  assert.strictEqual(rules.minStudentBookingDate("2026-05-25T20:00:00+08:00"), "2026-05-27");
  assert.strictEqual(rules.isBookableForStudent("2026-05-25", "2026-05-25T11:59:00+08:00"), false);
  assert.strictEqual(rules.isBookableForStudent("2026-05-26", "2026-05-25T11:59:00+08:00"), true);
  assert.strictEqual(rules.isBookableForStudent("2026-05-26", "2026-05-25T20:00:00+08:00"), false);
  assert.strictEqual(rules.isBookableForStudent("2026-05-27", "2026-05-25T20:00:00+08:00"), true);
}

function testDeduction() {
  assert.strictEqual(rules.lessonDeduction("class_pack"), 1);
  assert.strictEqual(rules.lessonDeduction("monthly"), 0);
  assert.strictEqual(rules.lessonDeduction("camp"), 0);
  assert.strictEqual(rules.lessonDeduction("vip"), 0);
}

function testStatus() {
  assert.deepStrictEqual(rules.memberStatus({ productType: "class_pack", totalLessons: 20 }, 20), {
    remaining: 0,
    status: "已完成"
  });
  assert.deepStrictEqual(rules.memberStatus({ productType: "class_pack", totalLessons: 20 }, 21), {
    remaining: -1,
    status: "欠课"
  });
  assert.deepStrictEqual(rules.memberStatus({ productType: "class_pack", totalLessons: 20 }, 16), {
    remaining: 4,
    status: "即将用完"
  });
  assert.deepStrictEqual(rules.memberStatus({ productType: "monthly", totalLessons: 0 }, 99), {
    remaining: 0,
    status: "正常"
  });
}

function testVerification() {
  const schedule = {
    id: "schedule-test",
    lessonDate: "2026-05-26",
    lessonTime: "17:00-18:00",
    memberId: "member-001",
    memberName: "测试学员"
  };
  const code = rules.verificationCodeForSchedule(schedule);
  assert(code.length >= 8, "核销码应稳定生成");
  assert.strictEqual(rules.normalizeVerificationCode("YS:" + code), code);
  assert.strictEqual(rules.verificationPayload(code), "YS:" + code);
  assert.strictEqual(rules.verificationStatus(schedule, "2026-05-27T10:00:00+08:00"), "active");
  assert.strictEqual(rules.verificationStatus(schedule, "2026-06-04T10:00:00+08:00"), "expired");
  assert.strictEqual(rules.verificationStatus(Object.assign({}, schedule, { lessonStatus: "completed" })), "verified");
}

function main() {
  testRole();
  testBookingDate();
  testDeduction();
  testStatus();
  testVerification();
  console.log("Rule tests passed");
}

main();
