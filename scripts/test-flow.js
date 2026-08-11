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

function login(account, password, openid) {
  return mock.call("login", { account, password, openid: openid || "flow-" + account }).session;
}

function loginByPhone(phone, openid) {
  return mock.call("loginByPhone", { phone, openid }).session;
}

function testLogin(phone, role) {
  return mock.call("loginForTest", { phone, role }).session;
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

  const adminOpenid = "flow-owner";
  const admin = login("yeats", "1324", adminOpenid);
  assert.throws(() => login("jl001", "1234"), /手机号验证登录/, "教练不能用账号密码绕过手机号验证");
  assert.throws(() => login("xy001", "1234"), /手机号验证登录/, "学员不能用账号密码绕过手机号验证");
  const coach = loginByPhone("13333330001", "flow-jl001");
  const student = loginByPhone("13333330002", "flow-xy001");
  assert.strictEqual(admin.role, "admin");
  assert.strictEqual(admin.wechatBound, false, "老板密码登录不应绑定当前微信");
  assert.strictEqual(admin.authMethod, "password", "老板应使用独立密码会话");
  assert.strictEqual(coach.role, "coach");
  assert.strictEqual(student.role, "student");
  const anotherAdminSession = login("yeats", "1324", "another-wechat");
  assert.strictEqual(anotherAdminSession.wechatBound, false, "更换微信登录老板账号仍不应产生微信绑定");
  assert.strictEqual(call(admin, "getHomeData").viewer.phone, "", "老板密码会话应允许多端同时使用");
  assert.strictEqual(testLogin("13818793977", "admin").role, "admin", "测试手机号应能进入老板角色");
  assert.strictEqual(testLogin("13818793977", "coach").role, "coach", "测试手机号应能进入教练角色");
  assert.strictEqual(testLogin("13818793977", "student").role, "student", "测试手机号应能进入学员角色");
  const coachByPhone = loginByPhone("13333330001", "flow-jl001");
  assert.strictEqual(coachByPhone.account, "jl001", "教练应能用老板绑定手机号登录");
  assert.throws(
    () => loginByPhone("13333330001", "another-openid"),
    /已经绑定其他微信/,
    "已绑定手机号账号不能换微信登录"
  );
  assert.throws(
    () => loginByPhone("133", "bad-phone"),
    /11 位手机号/,
    "手机号格式应校验"
  );
  const adminWithPhone = call(admin, "saveAccount", {
    account: {
      id: admin.id,
      account: "yeats",
      fullName: "管理员",
      phone: "13333330000",
      password: "1324"
    }
  }).account;
  assert.strictEqual(adminWithPhone.phone, "13333330000", "老板账号应能绑定手机号");
  assert.throws(
    () => loginByPhone("13333330000", "mistaken-owner-wechat"),
    /老板账号不能使用微信手机号登录/,
    "老板误点微信手机号入口时必须被拒绝"
  );
  const storedAdminAfterMistake = mock.loadState().accounts.find((item) => item.account === "yeats");
  assert.strictEqual(storedAdminAfterMistake.openid, null, "老板误点微信手机号入口后仍不能产生微信绑定");
  const adminByPhone = login("13333330000", "1324", adminOpenid);
  assert.strictEqual(adminByPhone.role, "admin", "老板应能用手机号加密码登录");
  call(admin, "saveAccount", {
    account: {
      id: admin.id,
      account: "yeats",
      fullName: "管理员",
      phone: "",
      password: "1324"
    }
  });
  const autoBoundAdmin = login("13333330003", "1324", adminOpenid);
  assert.strictEqual(autoBoundAdmin.phone, "13333330003", "老板首次手机号登录应自动绑定手机号");
  assert.throws(
    () => login("13333330002", "1234"),
    /手机号验证登录/,
    "教练和学员不能走手机号加密码入口"
  );

  const adminHome = call(admin, "getHomeData");
  assert(adminHome.members.length >= 3, "管理员应看到学员");
  assert(adminHome.accounts.length >= 3, "管理员应看到账号");
  const managedCoach = call(admin, "saveAccount", {
    account: {
      account: "jl998",
      fullName: "流程测试教练",
      coachName: "流程测试教练",
      phone: "13333330998",
      campus: "古北",
      status: "active"
    }
  }).account;
  assert.strictEqual(managedCoach.role, "coach", "老板新增教练时应创建教练账号");
  assert.strictEqual(loginByPhone("13333330998", "flow-jl998").coachName, "流程测试教练", "新增教练应能用手机号登录");
  call(admin, "saveAccount", { account: Object.assign({}, managedCoach, { status: "disabled" }) });
  assert.throws(() => loginByPhone("13333330998", "flow-jl998-disabled"), /未开通/, "停用教练后不应继续登录");
  call(admin, "saveAccount", { account: Object.assign({}, managedCoach, { status: "active" }) });
  call(admin, "saveWeeklyAvailabilityTemplate", { rows: [{ id: "weekly-1", weekday: 1, weekdayLabel: "周一", slotTime: "17:00-18:00", campus: "绿洲", coach: "绿洲教练", capacity: 2 }] });
  assert.strictEqual(call(admin, "getHomeData").weeklyAvailabilityTemplate.rows.length, 1, "老板每周模板应同步保存");
  assert.throws(() => call(student, "saveWeeklyAvailabilityTemplate", { rows: [] }), /没有权限/, "学员不能修改老板每周模板");
  const todaySchedule = call(coach, "getHomeData").schedules.find((item) => item.memberId === "member-001" && item.lessonStatus === "pending");
  assert(todaySchedule, "测试数据应有一节待确认课程");
  call(coach, "markAttendance", { scheduleId: todaySchedule.id });

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
      phone: "13333330999",
      campus: "绿洲"
    }
  }).account;
  assert.strictEqual(newAccount.role, "student");
  const newPhoneSession = loginByPhone("13333330999", "flow-xy999");
  assert.strictEqual(newPhoneSession.account, "xy999", "新学员应能用手机号验证登录");
  assert.throws(
    () => call(admin, "resetAccountPassword", { id: newAccount.id }),
    /无需重置密码/,
    "手机号账号不应暴露无效密码重置流程"
  );
  call(admin, "unbindAccountWechat", { id: newAccount.id });
  const reboundStudent = loginByPhone("13333330999", "flow-xy999-new");
  assert.strictEqual(reboundStudent.account, "xy999", "老板解除绑定后应允许新微信重新验证");

  const availability = call(admin, "createAvailabilitySlot", {
    slotDate: futureDate(1),
    slotTime: "20:00-21:00",
    campus: "绿洲",
    coach: "绿洲教练",
    capacity: 2
  }).slot;
  assert.strictEqual(availability.status, "published", "老板发布后应立即可预约");

  const refreshedStudentHome = call(student, "getHomeData");
  const slot = refreshedStudentHome.availabilitySlots.find((item) => item.id === availability.id);
  assert(slot, "学员应看到已发布可约时间");
  assert.strictEqual(slot.capacity, 2, "可约时间应保留容量");
  assert.strictEqual(slot.bookedCount, 0, "未预约前已约人数应为 0");
  assert.strictEqual(slot.left, 2, "未预约前剩余名额应等于容量");
  assert(slot.dayLabel, "可约时间应有面向用户的日期标签");

  const bookingResult = call(student, "createBookingRequest", { slotId: slot.id, productName: "自由泳课" });
  const booking = bookingResult.request;
  assert.strictEqual(booking.status, "pending", "学员选课应生成待发布草稿");
  assert.strictEqual(booking.productName, "自由泳课", "课程草稿应保存所选课程");
  assert(!bookingResult.schedule, "老板发布前不应生成正式排课");
  const alternateSlot = call(admin, "createAvailabilitySlot", {
    slotDate: availability.slotDate,
    slotTime: "19:00-20:00",
    campus: "古北",
    coach: "古北教练",
    capacity: 1
  }).slot;
  const adjusted = call(admin, "updateBookingRequestMatch", { requestId: booking.id, slotId: alternateSlot.id }).request;
  assert.strictEqual(adjusted.coach, "古北教练", "老板应能在发布前调整课程草稿");
  call(admin, "updateBookingRequestMatch", { requestId: booking.id, slotId: slot.id });
  const approved = call(admin, "approveBookingRequest", { requestId: booking.id }).schedule;
  assert(approved.id, "老板发布后应生成排课");
  assert(approved.verificationCode, "生成排课后应生成核销码");
  assert.strictEqual(rules.normalizeVerificationCode(approved.verificationPayload), approved.verificationCode, "核销 payload 应能解析回核销码");
  const afterBookingHome = call(student, "getHomeData");
  const bookedSlot = afterBookingHome.availabilitySlots.find((item) => item.id === availability.id);
  assert.strictEqual(bookedSlot.bookedCount, 1, "提交预约后已约人数应增加");
  assert.strictEqual(bookedSlot.left, 1, "提交预约后剩余名额应减少");

  const ownerSlot = call(admin, "getHomeData").availabilitySlots.find((item) => item.id === availability.id);
  assert.strictEqual(ownerSlot.bookedCount, 1, "老板应看到真实已约人数");
  call(admin, "closeAvailabilitySlot", { slotId: availability.id });
  const afterCloseHome = call(student, "getHomeData");
  assert(!afterCloseHome.availabilitySlots.some((item) => item.id === availability.id), "关闭后学员不应继续看到该时间");

  const batchDate = futureDate(8);
  const weeklyBatch = call(admin, "createAvailabilitySlots", {
    slots: [
      { slotDate: batchDate, slotTime: "09:00-10:00", campus: "绿洲", coach: "绿洲教练", capacity: 2 },
      { slotDate: batchDate, slotTime: "09:00-10:00", campus: "绿洲", coach: "绿洲教练", capacity: 2 }
    ]
  });
  assert.strictEqual(weeklyBatch.slots.length, 1, "批量发布应只创建一条重复时间");
  assert.strictEqual(weeklyBatch.skipped, 1, "批量发布应报告跳过的重复时间");

  const coachHome = call(coach, "getHomeData");
  assert(coachHome.members.length >= 1, "教练应看到自己学员");
  const pendingSchedule = coachHome.schedules.find((item) => item.id === approved.id);
  assert(pendingSchedule, "教练应看到学员选课生成的排课");
  assert.strictEqual(pendingSchedule.verificationStatus, "active", "待上课排课应可核销");
  assert.throws(
    () => call(coach, "verifyScheduleQr", { code: pendingSchedule.verificationPayload }),
    /课程还未开始/,
    "教练不能提前核销未来课程"
  );

  const todayQrSchedule = call(admin, "createManualSchedule", {
    lessonDate: rules.formatDateChina(new Date()),
    lessonTime: "20:00-21:00",
    memberName: "白卓可",
    campus: "绿洲",
    coach: "绿洲教练"
  }).schedule;

  const verifyResult = call(coach, "verifyScheduleQr", { code: todayQrSchedule.verificationPayload });
  assert(verifyResult.message.indexOf("确认出勤") >= 0, "教练扫码核销失败");
  assert.strictEqual(verifyResult.log.source, "qr_verify", "扫码核销应记录来源");
  const feedback = call(coach, "submitLessonFeedback", {
    scheduleId: verifyResult.log.sourceScheduleId,
    tags: ["状态好", "动作进步"],
    note: "流程测试反馈"
  }).feedback;
  assert.strictEqual(feedback.memberName, "白卓可", "课后反馈应绑定学员");
  assert.throws(
    () => call(coach, "verifyScheduleQr", { code: todayQrSchedule.verificationPayload }),
    /已经核销/,
    "已核销课程不可重复核销"
  );

  const application = call(student, "createCourseApplication", {
    productId: refreshedStudentHome.courseProducts[0].id,
    note: "流程测试续课"
  }).application;
  assert.strictEqual(application.status, "pending", "学员课程申请失败");
  assert.throws(
    () => call(student, "createCourseApplication", { productId: refreshedStudentHome.courseProducts[0].id }),
    /请勿重复提交/,
    "已有续课申请时不应重复创建"
  );
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

  const leaveSchedule = call(admin, "createManualSchedule", {
    lessonDate: futureDate(5),
    lessonTime: "19:00-20:00",
    campus: "绿洲",
    coach: "绿洲教练",
    memberName: "白卓可"
  }).schedule;
  const leaveRequest = call(student, "createLeaveRequest", {
    scheduleId: leaveSchedule.id,
    reason: "流程测试请假"
  }).request;
  assert.strictEqual(leaveRequest.status, "pending", "学员请假应进入待审批");
  const credit = call(admin, "approveLeaveRequest", { requestId: leaveRequest.id }).credit;
  assert.strictEqual(credit.status, "available", "通过请假应生成补课额度");
  const makeup = call(admin, "createMakeupSchedule", {
    creditId: credit.id,
    lessonDate: futureDate(6),
    lessonTime: "16:00-17:00",
    campus: "绿洲",
    coach: "绿洲教练"
  }).schedule;
  assert.strictEqual(makeup.source, "makeup_credit", "补课额度应能生成补课排课");

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
  assert(studentRecords.lessonFeedbacks.length >= 1, "学员应看到成长反馈");
  assert(studentRecords.leaveRequests.length >= 1, "学员应看到请假记录");
  const dashboard = call(admin, "getHomeData").dashboard;
  assert(dashboard.completedLessons >= 1, "老板看板应统计完成课程");
  assert(Array.isArray(dashboard.coachRanking), "老板看板应返回教练排行");
  const pagedSchedules = call(admin, "listPagedData", { collection: "schedules", page: 1, pageSize: 5 });
  assert(pagedSchedules.items.length <= 5 && pagedSchedules.total >= pagedSchedules.items.length, "分页接口应返回总数和当前页");

  console.log("Flow tests passed");
}

main();
