const assert = require("assert");

const storage = {};
global.wx = {
  getStorageSync(key) {
    return storage[key];
  },
  setStorageSync(key, value) {
    storage[key] = value;
  },
  removeStorageSync(key) {
    delete storage[key];
  }
};

const mock = require("../miniprogram/utils/mock-store");
const rules = require("../miniprogram/utils/rules");

function login(account, password) {
  return mock.call("login", { account, password, openid: "flow-" + account }).session;
}

function call(session, action, payload) {
  return mock.call(action, Object.assign({}, payload || {}, { session }));
}

function futureDate(extraDays) {
  const parts = rules.minStudentBookingDate().split("-").map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  date.setDate(date.getDate() + extraDays);
  return rules.formatDateChina(date);
}

function main() {
  mock.call("resetMock");

  const admin = login("yeats", "1324");
  const coach = login("jl001", "1234");
  const student = login("xy001", "1234");
  assert.strictEqual(admin.role, "admin");
  assert.strictEqual(coach.role, "coach");
  assert.strictEqual(student.role, "student");

  const adminHome = call(admin, "getHomeData");
  assert(adminHome.members.length >= 3, "管理员应看到学员");
  assert(adminHome.accounts.length >= 3, "管理员应看到账号");

  const newMember = call(admin, "saveMember", {
    member: {
      chineseName: "流程测试学员",
      campus: "绿洲",
      coach: "绿洲教练",
      productName: "20次卡",
      productType: "class_pack",
      totalLessons: 20,
      notes: "自动流程测试"
    }
  }).member;
  assert(newMember.id, "管理员新增学员失败");

  const newAccount = call(admin, "saveAccount", {
    account: {
      account: "xy999",
      password: "1234",
      fullName: "流程测试学员",
      memberName: "流程测试学员",
      campus: "绿洲"
    }
  }).account;
  assert.strictEqual(newAccount.role, "student");
  call(admin, "resetAccountPassword", { id: newAccount.id });

  const availability = call(coach, "createAvailabilitySlot", {
    slotDate: futureDate(1),
    slotTime: "17:00-18:00",
    campus: "绿洲",
    capacity: 2
  }).slot;
  assert.strictEqual(availability.status, "draft", "教练提交空余应为草稿");
  call(admin, "publishAvailabilitySlot", { slotId: availability.id });

  const refreshedStudentHome = call(student, "getHomeData");
  const slot = refreshedStudentHome.availabilitySlots.find((item) => item.id === availability.id);
  assert(slot, "学员应看到已发布可约时间");
  assert.strictEqual(slot.capacity, 2, "可约时间应保留容量");
  assert.strictEqual(slot.bookedCount, 0, "未预约前已约人数应为 0");
  assert.strictEqual(slot.left, 2, "未预约前剩余名额应等于容量");
  assert(slot.dayLabel, "可约时间应有面向用户的日期标签");

  const booking = call(student, "createBookingRequest", { slotId: slot.id }).request;
  assert.strictEqual(booking.status, "pending", "学员预约应进入待审批");
  const afterBookingHome = call(student, "getHomeData");
  const bookedSlot = afterBookingHome.availabilitySlots.find((item) => item.id === availability.id);
  assert.strictEqual(bookedSlot.bookedCount, 1, "提交预约后已约人数应增加");
  assert.strictEqual(bookedSlot.left, 1, "提交预约后剩余名额应减少");
  assert(afterBookingHome.dashboard.pendingBookings.length >= 1, "学员首页应有预约待办数据");

  const approved = call(admin, "approveBookingRequest", { requestId: booking.id }).schedule;
  assert(approved.id, "管理员审批应生成排课");
  assert(approved.verificationCode, "审批生成排课后应生成核销码");
  assert.strictEqual(rules.normalizeVerificationCode(approved.verificationPayload), approved.verificationCode, "核销 payload 应能解析回核销码");

  const coachHome = call(coach, "getHomeData");
  assert(coachHome.members.length >= 1, "教练应看到自己学员");
  const pendingSchedule = coachHome.schedules.find((item) => item.id === approved.id);
  assert(pendingSchedule, "教练应看到管理员审批生成的排课");
  assert.strictEqual(pendingSchedule.verificationStatus, "active", "待上课排课应可核销");

  const verifyResult = call(coach, "verifyScheduleQr", { code: pendingSchedule.verificationPayload });
  assert(verifyResult.message.indexOf("确认出勤") >= 0, "教练扫码核销失败");
  assert.strictEqual(verifyResult.log.source, "qr_verify", "扫码核销应记录来源");
  assert.throws(
    () => call(coach, "verifyScheduleQr", { code: pendingSchedule.verificationPayload }),
    /已经核销/,
    "已核销课程不可重复核销"
  );

  const application = call(student, "createCourseApplication", {
    productId: refreshedStudentHome.courseProducts[0].id,
    note: "流程测试续课"
  }).application;
  assert.strictEqual(application.status, "pending", "学员课程申请失败");
  const approvedApplication = call(admin, "approveCourseApplication", {
    applicationId: application.id,
    totalLessons: 30
  }).application;
  assert.strictEqual(approvedApplication.status, "approved", "老板应能通过课程申请");
  assert.strictEqual(
    call(student, "getHomeData").members[0].totalLessons,
    30,
    "课程申请通过后应更新学员课时"
  );

  const cancelSlot = call(coach, "createAvailabilitySlot", {
    slotDate: futureDate(2),
    slotTime: "18:00-19:00",
    campus: "绿洲",
    capacity: 1
  }).slot;
  call(admin, "publishAvailabilitySlot", { slotId: cancelSlot.id });
  const cancelBooking = call(student, "createBookingRequest", { slotId: cancelSlot.id }).request;
  const cancelledBooking = call(student, "cancelBookingRequest", { requestId: cancelBooking.id, reason: "点错时间" }).request;
  assert.strictEqual(cancelledBooking.status, "cancelled_by_student", "学员应能取消待审批预约");

  const manual = call(admin, "createManualSchedule", {
    lessonDate: futureDate(3),
    lessonTime: "17:00-18:00",
    campus: "绿洲",
    coach: "绿洲教练",
    memberName: "白卓可"
  }).schedule;
  assert(manual.verificationCode, "手动排课也应生成核销码");
  const cancelledSchedule = call(admin, "cancelSchedule", { scheduleId: manual.id, reason: "测试取消" }).schedule;
  assert.strictEqual(cancelledSchedule.lessonStatus, "cancelled", "老板应能取消未完成排课");

  const adminVerifySchedule = call(admin, "createManualSchedule", {
    lessonDate: futureDate(4),
    lessonTime: "18:00-19:00",
    campus: "古北",
    coach: "古北教练",
    memberName: "饼饼"
  }).schedule;
  assert.throws(
    () => call(coach, "verifyScheduleQr", { code: adminVerifySchedule.verificationCode }),
    /只能核销自己的课程/,
    "教练不能核销其他教练课程"
  );
  const adminVerify = call(admin, "verifyScheduleQr", { code: adminVerifySchedule.verificationCode });
  assert.strictEqual(adminVerify.log.source, "qr_verify", "老板应能跨教练扫码核销");

  const studentRecords = call(student, "getHomeData");
  assert(studentRecords.bookingRequests.length >= 1, "学员应看到预约记录");
  assert(studentRecords.courseApplications.length >= 1, "学员应看到课程申请");

  console.log("Flow tests passed");
}

main();
