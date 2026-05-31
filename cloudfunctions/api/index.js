const cloud = require("wx-server-sdk");
const crypto = require("crypto");
const rules = require("./rules");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

function ok(data) {
  return { ok: true, data };
}

function fail(error) {
  return { ok: false, message: error && error.message ? error.message : "操作失败" };
}

function nowIso() {
  return new Date().toISOString();
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(String(password), salt, 120000, 32, "sha256").toString("hex");
}

function withId(doc) {
  if (!doc) return doc;
  const result = Object.assign({}, doc);
  if (!result.id && result._id) result.id = result._id;
  return result;
}

function safeAccount(account) {
  const result = withId(account);
  delete result.passwordHash;
  delete result.passwordSalt;
  return result;
}

async function getAccountByName(accountName) {
  const result = await db.collection("accounts").where({
    account: rules.normalizeAccount(accountName),
    status: _.neq("disabled")
  }).limit(1).get();
  return result.data[0] || null;
}

async function getAccountBySession(session, wxContext) {
  if (!session || !session.account) return null;
  const account = await getAccountByName(session.account);
  if (!account) return null;
  if (account.openid && account.openid !== wxContext.OPENID) return null;
  return account;
}

function assertRole(viewer, roles) {
  if (!viewer || roles.indexOf(viewer.role) === -1) {
    throw new Error("没有权限执行该操作");
  }
}

async function list(collection, query, limit) {
  const result = await db.collection(collection).where(query || {}).limit(limit || 1000).get();
  return result.data || [];
}

async function login(payload, wxContext) {
  const accountName = rules.normalizeAccount(payload.account);
  const account = await getAccountByName(accountName);
  if (!account) throw new Error("账号或密码错误");

  const hashed = hashPassword(payload.password || "", account.passwordSalt);
  if (hashed !== account.passwordHash) throw new Error("账号或密码错误");

  const role = rules.roleFromAccount(accountName);
  if (!role || role !== account.role) throw new Error("账号角色配置不正确");
  if (account.openid && account.openid !== wxContext.OPENID) throw new Error("该账号已经绑定其他微信");

  await db.collection("accounts").doc(account._id).update({
    data: {
      openid: wxContext.OPENID,
      lastLoginAt: nowIso(),
      updatedAt: nowIso()
    }
  });

  return {
    session: safeAccount(Object.assign({}, account, { openid: wxContext.OPENID })),
    message: "登录成功，已绑定当前微信"
  };
}

async function memberViews(viewer) {
  let memberQuery = {};
  if (viewer.role === "coach") memberQuery = { coach: viewer.coachName };
  if (viewer.role === "student") memberQuery = { _id: viewer.memberId };

  const [members, attendanceLogs] = await Promise.all([
    list("members", memberQuery, 1500),
    list("attendanceLogs", viewer.role === "student" ? { memberId: viewer.memberId } : {}, 1500)
  ]);
  const usedByMember = {};
  attendanceLogs.forEach((log) => {
    usedByMember[log.memberId] = (usedByMember[log.memberId] || 0) + Number(log.lessonsDeducted || 0);
  });

  return members.map((member) => {
    const balance = rules.memberStatus(member, usedByMember[member._id] || 0);
    return Object.assign({}, member, {
      id: member._id,
      usedLessons: usedByMember[member._id] || 0,
      remainingLessons: balance.remaining,
      status: balance.status
    });
  });
}

async function schedulesFor(viewer) {
  let query = {};
  if (viewer.role === "coach") query = { coach: viewer.coachName };
  if (viewer.role === "student") query = { memberId: viewer.memberId };
  const schedules = await list("schedules", query, 1500);
  return schedules.map(withId);
}

async function availabilityFor(viewer) {
  let query = {};
  if (viewer.role === "coach") query = { coach: viewer.coachName };
  if (viewer.role === "student") {
    const member = (await list("members", { _id: viewer.memberId }, 1))[0];
    query = {
      status: "published",
      slotDate: _.gte(rules.minStudentBookingDate())
    };
    if (member && member.coach) query.coach = member.coach;
  }
  const slots = await list("availabilitySlots", query, 1000);
  return slots.map(withId);
}

async function getHomeData(viewer) {
  const [members, schedules, attendanceLogs, availabilitySlots, bookingRequests, courseApplications, courseProducts, accounts] =
    await Promise.all([
      memberViews(viewer),
      schedulesFor(viewer),
      list("attendanceLogs", viewer.role === "student" ? { memberId: viewer.memberId } : viewer.role === "coach" ? { coach: viewer.coachName } : {}, 1500),
      availabilityFor(viewer),
      list("bookingRequests", viewer.role === "student" ? { memberId: viewer.memberId } : viewer.role === "coach" ? { coach: viewer.coachName } : {}, 1000),
      list("courseApplications", viewer.role === "student" ? { memberId: viewer.memberId } : {}, 1000),
      list("courseProducts", {}, 200),
      viewer.role === "admin" ? list("accounts", {}, 1000) : []
    ]);

  return {
    viewer: safeAccount(viewer),
    members,
    schedules,
    attendanceLogs: attendanceLogs.map(withId),
    availabilitySlots,
    bookingRequests: bookingRequests.map(withId),
    courseApplications: courseApplications.map(withId),
    courseProducts: courseProducts.map(withId),
    accounts: accounts.map(safeAccount)
  };
}

async function createBookingRequest(viewer, payload) {
  assertRole(viewer, ["student"]);
  const slot = (await list("availabilitySlots", { _id: payload.slotId }, 1))[0];
  if (!slot || slot.status !== "published") throw new Error("该时间暂不可预约");
  if (!rules.isBookableForStudent(slot.slotDate)) throw new Error("该时间不符合提前预约规则");

  const member = (await list("members", { _id: viewer.memberId }, 1))[0];
  if (!member) throw new Error("找不到绑定学员");
  if (member.coach && member.coach !== slot.coach) throw new Error("该时间不属于你的绑定教练");

  const active = await list("bookingRequests", { slotId: slot._id, status: _.in(["pending", "approved"]) }, 100);
  if (active.length >= Number(slot.capacity || 1)) throw new Error("该时间名额已满");
  if (active.some((item) => item.memberId === viewer.memberId)) throw new Error("你已经提交过该时间的预约");

  const request = {
    slotId: slot._id,
    memberId: member._id,
    memberName: member.chineseName,
    slotDate: slot.slotDate,
    slotTime: slot.slotTime,
    campus: slot.campus,
    coach: slot.coach,
    status: "pending",
    note: String(payload.note || "").trim(),
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  const result = await db.collection("bookingRequests").add({ data: request });
  return { message: "预约申请已提交，等待管理员审批", request: Object.assign({ id: result._id }, request) };
}

async function maxMemberNo() {
  const members = await list("members", {}, 2000);
  return members.reduce((max, member) => Math.max(max, Number(member.memberNo || 0)), 0);
}

async function productDefaults(payload, current) {
  const productName = String(payload.productName || current && current.productName || "20次卡").trim();
  const lessons = Number(payload.totalLessons || current && current.totalLessons || 20);
  const products = await list("courseProducts", {}, 200);
  const product =
    products.find((item) => item.name === productName) ||
    products.find((item) => item.type === payload.productType) ||
    products[0] ||
    {};
  return {
    productId: payload.productId || current && current.productId || product._id || "product-class-pack",
    productName: productName || product.name || "20次卡",
    productType: payload.productType || current && current.productType || product.type || "class_pack",
    totalLessons: Number.isFinite(lessons) ? lessons : Number(product.totalLessons || 20)
  };
}

async function memberPayload(payload, current) {
  const raw = payload.member || payload;
  const product = await productDefaults(raw, current);
  return Object.assign({}, current || {}, product, {
    chineseName: String(raw.chineseName || current && current.chineseName || "").trim(),
    phone: String(raw.phone || "").trim(),
    wechat: String(raw.wechat || current && current.wechat || "").trim(),
    campus: String(raw.campus || current && current.campus || "").trim(),
    coach: String(raw.coach || current && current.coach || "").trim(),
    cardExpireDate: String(raw.cardExpireDate || current && current.cardExpireDate || "").trim(),
    notes: String(raw.notes || "").trim(),
    updatedAt: nowIso()
  });
}

async function saveMember(viewer, payload) {
  assertRole(viewer, ["admin"]);
  const raw = payload.member || payload;
  const id = String(raw.id || raw._id || "").trim();
  const current = id ? (await list("members", { _id: id }, 1))[0] : null;
  const member = await memberPayload(raw, current);
  if (!member.chineseName) throw new Error("学员姓名不能为空");

  if (current) {
    delete member._id;
    await db.collection("members").doc(id).update({ data: member });
    return { message: "学员已保存", member: withId(Object.assign({}, current, member)) };
  }

  member.memberNo = (await maxMemberNo()) + 1;
  member.createdAt = nowIso();
  const result = await db.collection("members").add({ data: member });
  return { message: "学员已新增", member: Object.assign({ id: result._id }, member) };
}

async function bulkImportMembers(viewer, payload) {
  assertRole(viewer, ["admin"]);
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  let nextNo = (await maxMemberNo()) + 1;
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const name = String(row.chineseName || "").trim();
    if (!name) {
      skipped += 1;
      continue;
    }
    const existing = await list("members", { chineseName: name }, 10);
    const current = existing.find((member) => !row.phone || member.phone === row.phone) || null;
    const member = await memberPayload(row, current);
    if (current) {
      delete member._id;
      await db.collection("members").doc(current._id).update({ data: member });
      updated += 1;
      continue;
    }
    member.memberNo = nextNo;
    nextNo += 1;
    member.createdAt = nowIso();
    await db.collection("members").add({ data: member });
    created += 1;
  }

  return { message: "已导入：新增 " + created + "，更新 " + updated + "，跳过 " + skipped, created, updated, skipped };
}

async function saveAccount(viewer, payload) {
  assertRole(viewer, ["admin"]);
  const raw = payload.account || payload;
  const accountName = rules.normalizeAccount(raw.account);
  const role = rules.roleFromAccount(accountName);
  if (!role) throw new Error("账号必须是 admin、jl 开头或 xy 开头");

  const id = String(raw.id || raw._id || "").trim();
  const current = id ? (await list("accounts", { _id: id }, 1))[0] || null : null;
  const duplicates = await list("accounts", { account: accountName }, 10);
  if (duplicates.some((item) => item._id !== id)) throw new Error("账号已存在");

  let memberId = raw.memberId || current && current.memberId || "";
  if (role === "student") {
    const memberName = String(raw.memberName || raw.fullName || "").trim();
    const members = await list("members", memberId ? { _id: memberId } : { chineseName: memberName }, 10);
    const member = members[0];
    if (!member) throw new Error("学员账号需要填写已存在的学员姓名");
    memberId = member._id;
  }

  const account = {
    account: accountName,
    role,
    fullName: String(raw.fullName || raw.memberName || raw.coachName || accountName).trim(),
    campus: String(raw.campus || current && current.campus || "").trim(),
    coachName: role === "coach" ? String(raw.coachName || raw.fullName || "").trim() : "",
    memberId: role === "student" ? memberId : "",
    status: raw.status || current && current.status || "active",
    updatedAt: nowIso()
  };
  if (role === "coach" && !account.coachName) throw new Error("教练账号需要填写教练名");

  if (!current || raw.password) {
    account.passwordSalt = crypto.randomBytes(16).toString("hex");
    account.passwordHash = hashPassword(String(raw.password || "1324"), account.passwordSalt);
  }

  if (current) {
    await db.collection("accounts").doc(current._id).update({ data: account });
    return { message: "账号已保存", account: safeAccount(Object.assign({}, current, account)) };
  }

  account.openid = null;
  account.createdAt = nowIso();
  const result = await db.collection("accounts").add({ data: account });
  return { message: "账号已新增", account: safeAccount(Object.assign({ _id: result._id }, account)) };
}

async function approveBookingRequest(viewer, payload) {
  assertRole(viewer, ["admin"]);
  const request = (await list("bookingRequests", { _id: payload.requestId }, 1))[0];
  if (!request || request.status !== "pending") throw new Error("该预约无法审批");
  const slot = (await list("availabilitySlots", { _id: request.slotId }, 1))[0];
  if (!slot) throw new Error("空余时间不存在");

  const schedule = {
    lessonDate: slot.slotDate,
    lessonTime: slot.slotTime,
    campus: slot.campus,
    coach: slot.coach,
    memberId: request.memberId,
    memberName: request.memberName,
    attended: false,
    lessonStatus: "pending",
    source: "student_booking",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  const result = await db.collection("schedules").add({ data: schedule });
  await db.collection("bookingRequests").doc(request._id).update({
    data: {
      status: "approved",
      reviewedAt: nowIso(),
      reviewedBy: viewer.account,
      createdScheduleId: result._id,
      updatedAt: nowIso()
    }
  });
  return { message: "已通过预约并生成排课", schedule: Object.assign({ id: result._id }, schedule) };
}

async function rejectBookingRequest(viewer, payload) {
  assertRole(viewer, ["admin"]);
  await db.collection("bookingRequests").doc(payload.requestId).update({
    data: {
      status: "rejected",
      reviewedAt: nowIso(),
      reviewedBy: viewer.account,
      updatedAt: nowIso()
    }
  });
  return { message: "已拒绝预约" };
}

async function markAttendance(viewer, payload) {
  assertRole(viewer, ["admin", "coach"]);
  const schedule = (await list("schedules", { _id: payload.scheduleId }, 1))[0];
  if (!schedule) throw new Error("排课不存在");
  if (viewer.role === "coach" && schedule.coach !== viewer.coachName) throw new Error("只能确认自己的课程");
  if (schedule.lessonStatus === "completed") return { message: "该课程已经确认过出勤", schedule };

  const existing = await list("attendanceLogs", { sourceScheduleId: schedule._id }, 1);
  if (existing.length) {
    await db.collection("schedules").doc(schedule._id).update({ data: { attended: true, lessonStatus: "completed", updatedAt: nowIso() } });
    return { message: "该课程已经有消课记录，已同步为完成" };
  }

  const member = (await list("members", { _id: schedule.memberId }, 1))[0];
  if (!member) throw new Error("学员不存在");
  const log = {
    attendanceDate: schedule.lessonDate,
    memberId: member._id,
    memberName: member.chineseName,
    coach: schedule.coach,
    campus: schedule.campus,
    lessonsDeducted: rules.lessonDeduction(member.productType),
    sourceScheduleId: schedule._id,
    source: "coach_checkin",
    sourceNote: "小程序确认出勤",
    createdAt: nowIso()
  };
  await db.collection("attendanceLogs").add({ data: log });
  await db.collection("schedules").doc(schedule._id).update({ data: { attended: true, lessonStatus: "completed", updatedAt: nowIso() } });
  return { message: log.lessonsDeducted ? "已确认出勤并扣 1 课时" : "已确认出勤，该课程类型不扣课时", log };
}

async function createAvailabilitySlot(viewer, payload) {
  assertRole(viewer, ["admin", "coach"]);
  const slot = {
    slotDate: String(payload.slotDate || "").trim(),
    slotTime: String(payload.slotTime || "").trim(),
    campus: String(payload.campus || viewer.campus || "").trim(),
    coach: viewer.role === "coach" ? viewer.coachName : String(payload.coach || "").trim(),
    capacity: Math.max(1, Number(payload.capacity || 1)),
    status: viewer.role === "admin" ? String(payload.status || "published") : "draft",
    publishOrder: Number(payload.publishOrder || 100),
    notes: String(payload.notes || "").trim(),
    createdBy: viewer.account,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  if (!slot.slotDate || !slot.slotTime || !slot.campus || !slot.coach) throw new Error("日期、时间、校区、教练不能为空");
  const result = await db.collection("availabilitySlots").add({ data: slot });
  return { message: viewer.role === "admin" ? "可预约时间已发布" : "空余时间已提交，等待管理员发布", slot: Object.assign({ id: result._id }, slot) };
}

async function publishAvailabilitySlot(viewer, payload) {
  assertRole(viewer, ["admin"]);
  await db.collection("availabilitySlots").doc(payload.slotId).update({
    data: {
      status: "published",
      publishOrder: Number(payload.publishOrder || 100),
      updatedAt: nowIso()
    }
  });
  return { message: "已发布可预约时间" };
}

async function createManualSchedule(viewer, payload) {
  assertRole(viewer, ["admin"]);
  const memberName = String(payload.memberName || "").trim();
  const members = await list("members", payload.memberId ? { _id: payload.memberId } : { chineseName: memberName }, 1);
  const member = members[0];
  if (!member) throw new Error("找不到学员，请检查姓名");
  const schedule = {
    lessonDate: String(payload.lessonDate || "").trim(),
    lessonTime: String(payload.lessonTime || "").trim(),
    campus: String(payload.campus || member.campus || "").trim(),
    coach: String(payload.coach || member.coach || "").trim(),
    memberId: member._id,
    memberName: member.chineseName,
    attended: false,
    lessonStatus: "pending",
    source: "manual_admin",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  if (!schedule.lessonDate || !schedule.lessonTime || !schedule.campus || !schedule.coach) throw new Error("日期、时间、校区、教练不能为空");
  const result = await db.collection("schedules").add({ data: schedule });
  return { message: "管理员手动排课已创建", schedule: Object.assign({ id: result._id }, schedule) };
}

async function createCourseApplication(viewer, payload) {
  assertRole(viewer, ["student"]);
  const [member, product] = await Promise.all([
    list("members", { _id: viewer.memberId }, 1),
    list("courseProducts", { _id: payload.productId }, 1)
  ]);
  if (!member[0] || !product[0]) throw new Error("申请信息不完整");
  const application = {
    memberId: member[0]._id,
    memberName: member[0].chineseName,
    productId: product[0]._id,
    productName: product[0].name,
    status: "pending",
    note: String(payload.note || "").trim(),
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  await db.collection("courseApplications").add({ data: application });
  return { message: "课程申请已提交，等待管理员处理", application };
}

exports.main = async (event) => {
  try {
    const wxContext = cloud.getWXContext();
    const action = event.action;
    const payload = event.payload || {};

    if (action === "login") return ok(await login(payload, wxContext));

    const viewer = await getAccountBySession(payload.session, wxContext);
    if (!viewer) throw new Error("登录已过期，请重新登录");

    const actions = {
      getHomeData,
      saveMember,
      bulkImportMembers,
      saveAccount,
      createBookingRequest,
      approveBookingRequest,
      rejectBookingRequest,
      markAttendance,
      createAvailabilitySlot,
      publishAvailabilitySlot,
      createManualSchedule,
      createCourseApplication
    };

    if (!actions[action]) throw new Error("未知操作：" + action);
    return ok(await actions[action](viewer, payload));
  } catch (error) {
    return fail(error);
  }
};
