const rules = require("./rules");

const STORAGE_KEY = "ye-swim-wx-v1.mock-state";
const DEFAULT_ADMIN_PASSWORD = "1324";
const DEFAULT_MEMBER_PASSWORD = "1234";

function defaultPasswordForRole(role) {
  return role === "admin" ? DEFAULT_ADMIN_PASSWORD : DEFAULT_MEMBER_PASSWORD;
}

function initialState() {
  return {
    accounts: [
      {
        id: "account-admin",
        account: "yeats",
        password: DEFAULT_ADMIN_PASSWORD,
        role: "admin",
        fullName: "管理员",
        openid: null,
        status: "active"
      },
      {
        id: "account-jl001",
        account: "jl001",
        password: DEFAULT_MEMBER_PASSWORD,
        role: "coach",
        fullName: "绿洲教练",
        coachName: "绿洲教练",
        campus: "绿洲",
        openid: null,
        status: "active"
      },
      {
        id: "account-xy001",
        account: "xy001",
        password: DEFAULT_MEMBER_PASSWORD,
        role: "student",
        fullName: "白卓可",
        memberId: "member-001",
        openid: null,
        status: "active"
      }
    ],
    courseProducts: [
      {
        id: "product-class-pack",
        name: "20次卡",
        type: "class_pack",
        totalLessons: 20,
        validDays: 365,
        price: 0,
        notes: "次卡出勤扣课"
      },
      {
        id: "product-monthly",
        name: "月卡",
        type: "monthly",
        totalLessons: 0,
        validDays: 31,
        price: 0,
        notes: "按有效期管理，不扣课时"
      }
    ],
    members: [
      {
        id: "member-001",
        memberNo: 1,
        chineseName: "白卓可",
        phone: "",
        wechat: "",
        campus: "绿洲",
        coach: "绿洲教练",
        productId: "product-class-pack",
        productName: "20次卡",
        productType: "class_pack",
        totalLessons: 26,
        cardExpireDate: "",
        notes: "mock 学员"
      },
      {
        id: "member-002",
        memberNo: 2,
        chineseName: "白卓冉",
        phone: "",
        wechat: "",
        campus: "绿洲",
        coach: "绿洲教练",
        productId: "product-class-pack",
        productName: "20次卡",
        productType: "class_pack",
        totalLessons: 26,
        cardExpireDate: "",
        notes: "mock 学员"
      },
      {
        id: "member-003",
        memberNo: 3,
        chineseName: "饼饼",
        phone: "",
        wechat: "",
        campus: "古北",
        coach: "古北教练",
        productId: "product-class-pack",
        productName: "20次卡",
        productType: "class_pack",
        totalLessons: 20,
        cardExpireDate: "",
        notes: "mock 学员"
      }
    ],
    availabilitySlots: [
      {
        id: "slot-001",
        slotDate: nextDate(1),
        slotTime: "17:00-18:00",
        campus: "绿洲",
        coach: "绿洲教练",
        capacity: 2,
        status: "published",
        publishOrder: 1,
        notes: "公开可约"
      },
      {
        id: "slot-002",
        slotDate: nextDate(2),
        slotTime: "18:00-19:00",
        campus: "绿洲",
        coach: "绿洲教练",
        capacity: 1,
        status: "published",
        publishOrder: 2,
        notes: "公开可约"
      }
    ],
    bookingRequests: [],
    schedules: [
      {
        id: "schedule-001",
        lessonDate: rules.formatDateChina(new Date()),
        lessonTime: "17:00-18:00",
        campus: "绿洲",
        coach: "绿洲教练",
        memberId: "member-001",
        memberName: "白卓可",
        attended: false,
        lessonStatus: "pending",
        source: "mock"
      }
    ],
    attendanceLogs: [],
    courseApplications: [],
    auditLogs: []
  };
}

function nextDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return rules.formatDateChina(date);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function migrateState(state) {
  if (!state || !Array.isArray(state.accounts)) return state;
  state.accounts.forEach((account) => {
    if (account.account === "admin") {
      account.account = "yeats";
      if (account.password === "1324" || !account.password) account.password = DEFAULT_ADMIN_PASSWORD;
    }
    if ((account.role === "coach" || account.role === "student") && account.password === "1324") {
      account.password = DEFAULT_MEMBER_PASSWORD;
    }
  });
  return state;
}

function loadState() {
  const saved = wx.getStorageSync(STORAGE_KEY);
  if (saved && saved.accounts && saved.members) {
    const migrated = migrateState(saved);
    wx.setStorageSync(STORAGE_KEY, migrated);
    return migrated;
  }
  const state = initialState();
  wx.setStorageSync(STORAGE_KEY, state);
  return state;
}

function saveState(state) {
  wx.setStorageSync(STORAGE_KEY, state);
}

function newId(prefix) {
  return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
}

function activeAccount(state, account) {
  const normalized = rules.normalizeAccount(account);
  return state.accounts.find((item) => item.account === normalized && item.status !== "disabled");
}

function accountBySession(state, session) {
  if (!session || !session.account) return null;
  return activeAccount(state, session.account);
}

function assertRole(viewer, roles) {
  if (!viewer || roles.indexOf(viewer.role) === -1) {
    throw new Error("没有权限执行该操作");
  }
}

function memberViews(state, viewer) {
  const usedByMember = {};
  state.attendanceLogs.forEach((log) => {
    usedByMember[log.memberId] = (usedByMember[log.memberId] || 0) + Number(log.lessonsDeducted || 0);
  });

  return state.members
    .filter((member) => {
      if (!viewer) return false;
      if (viewer.role === "admin") return true;
      if (viewer.role === "coach") return member.coach === viewer.coachName;
      if (viewer.role === "student") return member.id === viewer.memberId;
      return false;
    })
    .map((member) => {
      const usedLessons = usedByMember[member.id] || 0;
      const balance = rules.memberStatus(member, usedLessons);
      return Object.assign({}, member, {
        usedLessons,
        remainingLessons: balance.remaining,
        status: balance.status
      });
    });
}

function schedulesFor(state, viewer) {
  return state.schedules
    .filter((schedule) => {
      if (viewer.role === "admin") return true;
      if (viewer.role === "coach") return schedule.coach === viewer.coachName;
      if (viewer.role === "student") return schedule.memberId === viewer.memberId;
      return false;
    })
    .sort((a, b) => (a.lessonDate + a.lessonTime).localeCompare(b.lessonDate + b.lessonTime));
}

function bookingsFor(state, viewer) {
  return state.bookingRequests
    .filter((request) => {
      if (viewer.role === "admin") return true;
      if (viewer.role === "coach") return request.coach === viewer.coachName;
      if (viewer.role === "student") return request.memberId === viewer.memberId;
      return false;
    })
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

function availabilityFor(state, viewer) {
  return state.availabilitySlots
    .filter((slot) => {
      if (viewer.role === "admin") return true;
      if (viewer.role === "coach") return slot.coach === viewer.coachName;
      if (viewer.role === "student") {
        const member = state.members.find((item) => item.id === viewer.memberId);
        return (
          slot.status === "published" &&
          rules.isBookableForStudent(slot.slotDate) &&
          (!member || !member.coach || member.coach === slot.coach)
        );
      }
      return false;
    })
    .sort((a, b) => (a.slotDate + String(a.publishOrder).padStart(4, "0") + a.slotTime).localeCompare(b.slotDate + String(b.publishOrder).padStart(4, "0") + b.slotTime));
}

function homeData(state, viewer) {
  return {
    viewer: safeAccount(viewer),
    members: memberViews(state, viewer),
    schedules: schedulesFor(state, viewer),
    attendanceLogs: state.attendanceLogs.filter((log) => {
      if (viewer.role === "admin") return true;
      if (viewer.role === "coach") return log.coach === viewer.coachName;
      if (viewer.role === "student") return log.memberId === viewer.memberId;
      return false;
    }),
    availabilitySlots: availabilityFor(state, viewer),
    bookingRequests: bookingsFor(state, viewer),
    courseApplications: state.courseApplications.filter((item) => {
      if (viewer.role === "admin") return true;
      if (viewer.role === "student") return item.memberId === viewer.memberId;
      return false;
    }),
    courseProducts: state.courseProducts,
    accounts: viewer.role === "admin" ? state.accounts.map(safeAccount) : []
  };
}

function safeAccount(account) {
  const result = clone(account);
  delete result.password;
  return result;
}

function nextMemberNo(state) {
  return state.members.reduce((max, member) => Math.max(max, Number(member.memberNo || 0)), 0) + 1;
}

function productDefaults(state, payload, current) {
  const productName = String(payload.productName || current && current.productName || "20次卡").trim();
  const lessons = Number(payload.totalLessons || current && current.totalLessons || 20);
  const product =
    state.courseProducts.find((item) => item.name === productName) ||
    state.courseProducts.find((item) => item.type === payload.productType) ||
    state.courseProducts[0] ||
    {};
  return {
    productId: payload.productId || current && current.productId || product.id || "product-class-pack",
    productName: productName || product.name || "20次卡",
    productType: payload.productType || current && current.productType || product.type || "class_pack",
    totalLessons: Number.isFinite(lessons) ? lessons : Number(product.totalLessons || 20)
  };
}

function memberPayload(state, payload, current) {
  const member = payload.member || payload;
  const product = productDefaults(state, member, current);
  return Object.assign({}, current || {}, product, {
    chineseName: String(member.chineseName || current && current.chineseName || "").trim(),
    phone: String(member.phone || "").trim(),
    wechat: String(member.wechat || current && current.wechat || "").trim(),
    campus: String(member.campus || current && current.campus || "").trim(),
    coach: String(member.coach || current && current.coach || "").trim(),
    cardExpireDate: String(member.cardExpireDate || current && current.cardExpireDate || "").trim(),
    notes: String(member.notes || "").trim()
  });
}

function saveMember(state, viewer, payload) {
  assertRole(viewer, ["admin"]);
  const raw = payload.member || payload;
  const id = String(raw.id || "").trim();
  const current = id ? state.members.find((item) => item.id === id) : null;
  const member = memberPayload(state, raw, current);
  if (!member.chineseName) throw new Error("学员姓名不能为空");

  if (current) {
    Object.assign(current, member, { updatedAt: new Date().toISOString() });
    return { message: "学员已保存", member: current };
  }

  const created = Object.assign(member, {
    id: newId("member"),
    memberNo: nextMemberNo(state),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  state.members.push(created);
  return { message: "学员已新增", member: created };
}

function bulkImportMembers(state, viewer, payload) {
  assertRole(viewer, ["admin"]);
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  rows.forEach((row) => {
    const name = String(row.chineseName || "").trim();
    if (!name) {
      skipped += 1;
      return;
    }
    const current = state.members.find((member) => member.chineseName === name && (!row.phone || member.phone === row.phone));
    const member = memberPayload(state, row, current);
    if (current) {
      Object.assign(current, member, { updatedAt: new Date().toISOString() });
      updated += 1;
      return;
    }
    state.members.push(
      Object.assign(member, {
        id: newId("member"),
        memberNo: nextMemberNo(state),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
    );
    created += 1;
  });

  return { message: "已导入：新增 " + created + "，更新 " + updated + "，跳过 " + skipped, created, updated, skipped };
}

function saveAccount(state, viewer, payload) {
  assertRole(viewer, ["admin"]);
  const raw = payload.account || payload;
  const accountName = rules.normalizeAccount(raw.account);
  const role = rules.roleFromAccount(accountName);
  if (!role) throw new Error("账号必须是 yeats、jl 开头或 xy 开头");

  const id = String(raw.id || "").trim();
  const duplicate = state.accounts.find((item) => item.account === accountName && item.id !== id);
  if (duplicate) throw new Error("账号已存在");

  const current = id ? state.accounts.find((item) => item.id === id) : null;
  if (current && current.account !== accountName) {
    throw new Error("已创建账号不能修改账号名，请新建账号");
  }
  let memberId = raw.memberId || current && current.memberId || "";
  if (role === "student") {
    const memberName = String(raw.memberName || raw.fullName || "").trim();
    const member = state.members.find((item) => item.chineseName === memberName || item.id === memberId);
    if (!member) throw new Error("学员账号需要填写已存在的学员姓名");
    memberId = member.id;
  }

  const next = Object.assign({}, current || {}, {
    account: accountName,
    role,
    fullName: String(raw.fullName || raw.memberName || raw.coachName || accountName).trim(),
    campus: String(raw.campus || current && current.campus || "").trim(),
    coachName: role === "coach" ? String(raw.coachName || raw.fullName || "").trim() : "",
    memberId: role === "student" ? memberId : "",
    status: raw.status || current && current.status || "active",
    updatedAt: new Date().toISOString()
  });

  if (!current || raw.password) {
    next.password = String(raw.password || defaultPasswordForRole(role));
  }
  if (role === "coach" && !next.coachName) throw new Error("教练账号需要填写教练名");

  if (current) {
    Object.assign(current, next);
    return { message: "账号已保存", account: safeAccount(current) };
  }

  next.id = newId("account");
  next.createdAt = new Date().toISOString();
  state.accounts.push(next);
  return { message: "账号已新增", account: safeAccount(next) };
}

function resetAccountPassword(state, viewer, payload) {
  assertRole(viewer, ["admin"]);
  const id = String(payload.id || payload.accountId || "").trim();
  const accountName = rules.normalizeAccount(payload.account);
  const account = state.accounts.find((item) => item.id === id || item.account === accountName);
  if (!account) throw new Error("账号不存在");
  account.password = defaultPasswordForRole(account.role);
  account.updatedAt = new Date().toISOString();
  return { message: "密码已重置为 " + account.password, account: safeAccount(account) };
}

function changeMyPassword(state, viewer, payload) {
  const oldPassword = String(payload.oldPassword || "");
  const newPassword = String(payload.newPassword || "");
  if (!newPassword || newPassword.length < 4) throw new Error("新密码至少 4 位");
  if (oldPassword === newPassword) throw new Error("新旧密码不能一样");
  if (viewer.password !== oldPassword) throw new Error("原密码错误");
  viewer.password = newPassword;
  viewer.updatedAt = new Date().toISOString();
  return { message: "密码已修改，请使用新密码登录" };
}

function login(payload) {
  const state = loadState();
  const accountName = rules.normalizeAccount(payload.account);
  const account = activeAccount(state, accountName);
  if (!account || account.password !== String(payload.password || "")) {
    throw new Error("账号或密码错误");
  }

  const role = rules.roleFromAccount(accountName);
  if (!role || role !== account.role) {
    throw new Error("账号角色配置不正确");
  }

  const openid = payload.openid || "mock-openid";
  if (account.openid && account.openid !== openid && account.role !== "admin") {
    throw new Error("该账号已经绑定其他微信");
  }

  account.openid = openid;
  account.lastLoginAt = new Date().toISOString();
  saveState(state);

  return {
    session: safeAccount(account),
    message: "登录成功，已绑定当前微信"
  };
}

function createBookingRequest(state, viewer, payload) {
  assertRole(viewer, ["student"]);
  const slot = state.availabilitySlots.find((item) => item.id === payload.slotId);
  if (!slot || slot.status !== "published") throw new Error("该时间暂不可预约");
  if (!rules.isBookableForStudent(slot.slotDate)) throw new Error("该时间不符合提前预约规则");

  const member = state.members.find((item) => item.id === viewer.memberId);
  if (!member) throw new Error("找不到绑定学员");
  if (member.coach && member.coach !== slot.coach) throw new Error("该时间不属于你的绑定教练");

  const activeCount = state.bookingRequests.filter((item) => item.slotId === slot.id && ["pending", "approved"].indexOf(item.status) >= 0).length;
  if (activeCount >= Number(slot.capacity || 1)) throw new Error("该时间名额已满");

  const duplicate = state.bookingRequests.some((item) => item.slotId === slot.id && item.memberId === member.id && ["pending", "approved"].indexOf(item.status) >= 0);
  if (duplicate) throw new Error("你已经提交过该时间的预约");

  const request = {
    id: newId("booking"),
    slotId: slot.id,
    memberId: member.id,
    memberName: member.chineseName,
    slotDate: slot.slotDate,
    slotTime: slot.slotTime,
    campus: slot.campus,
    coach: slot.coach,
    status: "pending",
    note: String(payload.note || "").trim(),
    createdAt: new Date().toISOString()
  };
  state.bookingRequests.push(request);
  state.auditLogs.push({ id: newId("audit"), action: "createBookingRequest", account: viewer.account, createdAt: request.createdAt });
  return { message: "预约申请已提交，等待管理员审批", request };
}

function approveBookingRequest(state, viewer, payload) {
  assertRole(viewer, ["admin"]);
  const request = state.bookingRequests.find((item) => item.id === payload.requestId);
  if (!request || request.status !== "pending") throw new Error("该预约无法审批");
  const slot = state.availabilitySlots.find((item) => item.id === request.slotId);
  if (!slot) throw new Error("空余时间不存在");

  const activeCount = state.bookingRequests.filter((item) => item.slotId === slot.id && item.status === "approved").length;
  if (activeCount >= Number(slot.capacity || 1)) throw new Error("该时间名额已满");

  const schedule = {
    id: newId("schedule"),
    lessonDate: slot.slotDate,
    lessonTime: slot.slotTime,
    campus: slot.campus,
    coach: slot.coach,
    memberId: request.memberId,
    memberName: request.memberName,
    attended: false,
    lessonStatus: "pending",
    source: "student_booking"
  };
  state.schedules.push(schedule);
  request.status = "approved";
  request.reviewedAt = new Date().toISOString();
  request.createdScheduleId = schedule.id;
  return { message: "已通过预约并生成排课", schedule };
}

function rejectBookingRequest(state, viewer, payload) {
  assertRole(viewer, ["admin"]);
  const request = state.bookingRequests.find((item) => item.id === payload.requestId);
  if (!request || request.status !== "pending") throw new Error("该预约无法拒绝");
  request.status = "rejected";
  request.reviewedAt = new Date().toISOString();
  return { message: "已拒绝预约", request };
}

function markAttendance(state, viewer, payload) {
  assertRole(viewer, ["admin", "coach"]);
  const schedule = state.schedules.find((item) => item.id === payload.scheduleId);
  if (!schedule) throw new Error("排课不存在");
  if (viewer.role === "coach" && schedule.coach !== viewer.coachName) throw new Error("只能确认自己的课程");

  if (schedule.lessonStatus === "completed") {
    return { message: "该课程已经确认过出勤", schedule };
  }

  const member = state.members.find((item) => item.id === schedule.memberId);
  if (!member) throw new Error("学员不存在");
  const deducted = rules.lessonDeduction(member.productType);
  const log = {
    id: newId("attendance"),
    attendanceDate: schedule.lessonDate,
    memberId: member.id,
    memberName: member.chineseName,
    coach: schedule.coach,
    campus: schedule.campus,
    lessonsDeducted: deducted,
    sourceScheduleId: schedule.id,
    source: "coach_checkin",
    sourceNote: "小程序确认出勤"
  };
  state.attendanceLogs.push(log);
  schedule.attended = true;
  schedule.lessonStatus = "completed";
  return { message: deducted ? "已确认出勤并扣 1 课时" : "已确认出勤，该课程类型不扣课时", log };
}

function createAvailabilitySlot(state, viewer, payload) {
  assertRole(viewer, ["admin", "coach"]);
  const slot = {
    id: newId("slot"),
    slotDate: String(payload.slotDate || "").trim(),
    slotTime: String(payload.slotTime || "").trim(),
    campus: String(payload.campus || viewer.campus || "").trim(),
    coach: viewer.role === "coach" ? viewer.coachName : String(payload.coach || "").trim(),
    capacity: Math.max(1, Number(payload.capacity || 1)),
    status: viewer.role === "admin" ? String(payload.status || "published") : "draft",
    publishOrder: Number(payload.publishOrder || 100),
    notes: String(payload.notes || "").trim()
  };
  if (!slot.slotDate || !slot.slotTime || !slot.campus || !slot.coach) {
    throw new Error("日期、时间、校区、教练不能为空");
  }
  state.availabilitySlots.push(slot);
  return { message: viewer.role === "admin" ? "可预约时间已发布" : "空余时间已提交，等待管理员发布", slot };
}

function createAvailabilitySlots(state, viewer, payload) {
  assertRole(viewer, ["admin", "coach"]);
  const rows = Array.isArray(payload.slots) ? payload.slots : [];
  const created = [];
  rows.forEach((row) => {
    const result = createAvailabilitySlot(state, viewer, row);
    created.push(result.slot);
  });
  if (!created.length) throw new Error("没有可提交的空余时间");
  return { message: "已提交 " + created.length + " 个空余时间", slots: created };
}

function publishAvailabilitySlot(state, viewer, payload) {
  assertRole(viewer, ["admin"]);
  const slot = state.availabilitySlots.find((item) => item.id === payload.slotId);
  if (!slot) throw new Error("空余时间不存在");
  slot.status = "published";
  slot.publishOrder = Number(payload.publishOrder || slot.publishOrder || 100);
  return { message: "已发布可预约时间", slot };
}

function createManualSchedule(state, viewer, payload) {
  assertRole(viewer, ["admin"]);
  const memberName = String(payload.memberName || "").trim();
  const member = state.members.find((item) => item.chineseName === memberName || item.id === payload.memberId);
  if (!member) throw new Error("找不到学员，请检查姓名");
  const schedule = {
    id: newId("schedule"),
    lessonDate: String(payload.lessonDate || "").trim(),
    lessonTime: String(payload.lessonTime || "").trim(),
    campus: String(payload.campus || member.campus || "").trim(),
    coach: String(payload.coach || member.coach || "").trim(),
    memberId: member.id,
    memberName: member.chineseName,
    attended: false,
    lessonStatus: "pending",
    source: "manual_admin"
  };
  if (!schedule.lessonDate || !schedule.lessonTime || !schedule.campus || !schedule.coach) {
    throw new Error("日期、时间、校区、教练不能为空");
  }
  state.schedules.push(schedule);
  return { message: "管理员手动排课已创建", schedule };
}

function createCourseApplication(state, viewer, payload) {
  assertRole(viewer, ["student"]);
  const member = state.members.find((item) => item.id === viewer.memberId);
  const product = state.courseProducts.find((item) => item.id === payload.productId) || state.courseProducts[0];
  if (!member || !product) throw new Error("申请信息不完整");
  const application = {
    id: newId("course-app"),
    memberId: member.id,
    memberName: member.chineseName,
    productId: product.id,
    productName: product.name,
    status: "pending",
    note: String(payload.note || "").trim(),
    createdAt: new Date().toISOString()
  };
  state.courseApplications.push(application);
  return { message: "课程申请已提交，等待管理员处理", application };
}

function call(action, payload) {
  const state = loadState();

  if (action === "login") return login(payload || {});
  if (action === "resetMock") {
    const fresh = initialState();
    saveState(fresh);
    return { message: "mock 数据已重置" };
  }

  const viewer = accountBySession(state, payload && payload.session);
  if (!viewer) throw new Error("登录已过期，请重新登录");

  let result;
  if (action === "getHomeData") result = homeData(state, viewer);
  else if (action === "saveMember") result = saveMember(state, viewer, payload);
  else if (action === "bulkImportMembers") result = bulkImportMembers(state, viewer, payload);
  else if (action === "saveAccount") result = saveAccount(state, viewer, payload);
  else if (action === "resetAccountPassword") result = resetAccountPassword(state, viewer, payload);
  else if (action === "changeMyPassword") result = changeMyPassword(state, viewer, payload);
  else if (action === "createBookingRequest") result = createBookingRequest(state, viewer, payload);
  else if (action === "approveBookingRequest") result = approveBookingRequest(state, viewer, payload);
  else if (action === "rejectBookingRequest") result = rejectBookingRequest(state, viewer, payload);
  else if (action === "markAttendance") result = markAttendance(state, viewer, payload);
  else if (action === "createAvailabilitySlot") result = createAvailabilitySlot(state, viewer, payload);
  else if (action === "createAvailabilitySlots") result = createAvailabilitySlots(state, viewer, payload);
  else if (action === "publishAvailabilitySlot") result = publishAvailabilitySlot(state, viewer, payload);
  else if (action === "createManualSchedule") result = createManualSchedule(state, viewer, payload);
  else if (action === "createCourseApplication") result = createCourseApplication(state, viewer, payload);
  else throw new Error("未知操作：" + action);

  saveState(state);
  return clone(result);
}

module.exports = {
  call,
  loadState,
  initialState
};
