const rules = require("./rules");

const STORAGE_KEY = "ye-swim-wx-v1.mock-state";
const DEFAULT_ADMIN_PASSWORD = "1324";
const DEFAULT_MEMBER_PASSWORD = "1234";
const DEV_TEST_PHONE = "13818793977";

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
        phone: "",
        loginMode: "password",
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
        phone: "13333330001",
        loginMode: "phone",
        bindingStatus: "pending",
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
        memberIds: ["member-001", "member-002"],
        phone: "13333330002",
        loginMode: "phone",
        bindingStatus: "pending",
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
    dailyCoachCodes: [],
    registrationInvites: [
      { id: "registration-invite-coach", inviteType: "coach", token: "mock-coach", status: "active", fileIds: {} },
      { id: "registration-invite-student", inviteType: "student", token: "mock-student", status: "active", fileIds: {} }
    ],
    registrationRequests: [],
    lessonAdjustments: [],
    courseApplications: [],
    leaveRequests: [],
    makeupCredits: [],
    lessonFeedbacks: [],
    weeklyAvailabilityTemplates: [],
    weeklyAvailabilityTemplateConfigured: false,
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
    if (!account.loginMode) account.loginMode = account.role === "admin" ? "password" : "phone";
    if (account.role !== "admin" && !account.bindingStatus) account.bindingStatus = account.openid ? "bound" : "pending";
  });
  state.leaveRequests = state.leaveRequests || [];
  state.makeupCredits = state.makeupCredits || [];
  state.lessonFeedbacks = state.lessonFeedbacks || [];
  state.weeklyAvailabilityTemplates = state.weeklyAvailabilityTemplates || [];
  state.dailyCoachCodes = state.dailyCoachCodes || [];
  state.registrationInvites = state.registrationInvites || [];
  state.registrationRequests = state.registrationRequests || [];
  state.lessonAdjustments = state.lessonAdjustments || [];
  state.accounts.forEach((account) => {
    if (account.role === "student" && !Array.isArray(account.memberIds)) account.memberIds = account.memberId ? [account.memberId] : [];
  });
  if (state.weeklyAvailabilityTemplateConfigured === undefined) state.weeklyAvailabilityTemplateConfigured = false;
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

function verificationPatch(schedule) {
  const code = rules.verificationCodeForSchedule(schedule);
  return {
    verificationCode: code,
    verificationPayload: rules.verificationPayload(code),
    verificationExpiresAt: rules.verificationExpiresAt(schedule.lessonDate)
  };
}

function decorateVerification(schedule) {
  const patch = verificationPatch(schedule);
  return Object.assign({}, schedule, patch, {
    verificationStatus: rules.verificationStatus(Object.assign({}, schedule, patch)),
    verificationStatusText: schedule.verifiedAt || schedule.lessonStatus === "completed" ? "已核销" : rules.verificationStatus(Object.assign({}, schedule, patch)) === "expired" ? "已过期" : "待核销"
  });
}

function activeAccount(state, account) {
  const normalized = rules.normalizeAccount(account);
  return state.accounts.find((item) => item.account === normalized && item.status !== "disabled");
}

function accountBySession(state, session) {
  if (!session || !session.account) return null;
  const account = activeAccount(state, session.account);
  if (!account) return null;
  if (session.testLogin) return account;
  if (account.role !== "admin") return account;
  return (account.passwordSessions || []).indexOf(session.authToken) >= 0 ? account : null;
}

function assertRole(viewer, roles) {
  if (!viewer || roles.indexOf(viewer.role) === -1) {
    throw new Error("没有权限执行该操作");
  }
}

function memberViews(state, viewer) {
  const usedByMember = {};
  state.attendanceLogs.forEach((log) => {
    if (log.status === "reversed" || log.reversedAt) return;
    const lessons = Number(log.lessonsDeducted);
    usedByMember[log.memberId] = (usedByMember[log.memberId] || 0) + (lessons > 0 ? lessons : 1);
  });

  return state.members
    .filter((member) => {
      if (!viewer) return false;
      if (viewer.role === "admin") return true;
      if (viewer.role === "coach") return member.coach === viewer.coachName;
      if (viewer.role === "student") return [].concat(viewer.memberIds || [], viewer.memberId || []).indexOf(member.id) >= 0;
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

function todayChina() {
  return rules.formatDateChina(new Date());
}

function timeChina() {
  const date = new Date();
  return String(date.getHours()).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0");
}

function consumptionHomeData(state, viewer) {
  const members = memberViews(state, viewer);
  const memberIds = members.map((item) => item.id);
  let logs = state.attendanceLogs.slice();
  if (viewer.role === "coach") logs = logs.filter((item) => item.coachAccount === viewer.account || (!item.coachAccount && item.coach === viewer.coachName));
  if (viewer.role === "student") logs = logs.filter((item) => memberIds.indexOf(item.memberId) >= 0);
  logs = logs.map((item) => Object.assign({}, item, { lessonsDeducted: item.status !== "reversed" && Number(item.lessonsDeducted) <= 0 ? 1 : Number(item.lessonsDeducted || 0) }))
    .sort((a, b) => String(b.createdAt || b.attendanceDate || "").localeCompare(String(a.createdAt || a.attendanceDate || "")));
  const todayLogs = logs.filter((item) => item.attendanceDate === todayChina() && item.status !== "reversed" && !item.reversedAt);
  return {
    viewer: Object.assign({}, viewer, { password: undefined }),
    members,
    logs: logs.slice(0, viewer.role === "admin" ? 500 : 100),
    todayLogs,
    accounts: viewer.role === "admin" ? state.accounts.map((item) => Object.assign({}, item, { password: undefined, wechatBound: Boolean(item.openid) })) : [],
    stats: {
      todayStudents: Array.from(new Set(todayLogs.map((item) => item.memberId))).length,
      todayLessons: todayLogs.reduce((sum, item) => sum + Number(item.lessonsDeducted || 0), 0),
      debtMembers: members.filter((item) => Number(item.remainingLessons) < 0).length
    }
  };
}

function dailyCoachCode(state, viewer, payload) {
  assertRole(viewer, ["admin", "coach"]);
  const date = todayChina();
  let code = state.dailyCoachCodes.find((item) => item.codeDate === date && item.coachAccount === viewer.account);
  if (!code) {
    code = { id: newId("daily-code"), token: newId("token"), codeDate: date, coachAccount: viewer.account, coachName: viewer.coachName || viewer.fullName || "老板", status: "active" };
    state.dailyCoachCodes.push(code);
  }
  return Object.assign({}, code, { envVersion: payload.envVersion || "develop", fileId: "" });
}

function registrationToken(scene) {
  return decodeURIComponent(String(scene || "").trim()).replace(/^i=/, "");
}

function registrationInvite(state, scene) {
  const token = registrationToken(scene);
  return state.registrationInvites.find((item) => item.token === token && item.status === "active");
}

function registrationContext(state, payload) {
  const invite = registrationInvite(state, payload.scene || payload.token);
  if (!invite) throw new Error("这个登记码已失效，请向老板获取新二维码");
  return { inviteType: invite.inviteType, title: invite.inviteType === "coach" ? "教练登记" : "学员登记", token: invite.token };
}

function registrationChildren(rawChildren) {
  const rows = Array.isArray(rawChildren) ? rawChildren : [];
  if (!rows.length || rows.length > 6) throw new Error("一次可登记 1 至 6 名孩子");
  return rows.map((item, index) => {
    const name = String(item && (item.name || item.chineseName) || "").trim();
    const remainingLessons = Number(item && item.remainingLessons);
    if (!name) throw new Error("请填写第 " + (index + 1) + " 名孩子的姓名");
    if (!Number.isInteger(remainingLessons) || remainingLessons < -999 || remainingLessons > 99999) throw new Error("剩余课时应为 -999 至 99999 的整数");
    return { clientId: String(item.clientId || "child-" + (index + 1)), proposedName: name, remainingLessons };
  });
}

function submitRegistration(state, payload) {
  const invite = registrationInvite(state, payload.scene || payload.token);
  if (!invite) throw new Error("这个登记码已失效，请向老板获取新二维码");
  const phone = rules.normalizePhone(payload.phone);
  if (!rules.isChinaMobile(phone)) throw new Error("请输入用于模拟微信授权的 11 位手机号");
  if (state.accounts.some((item) => item.phone === phone && item.status !== "disabled")) throw new Error("该手机号已有账号，请直接从登录页进入");
  const children = invite.inviteType === "student" ? registrationChildren(payload.children) : [];
  const current = state.registrationRequests.find((item) => item.phone === phone && item.requestType === invite.inviteType && item.status === "pending");
  const now = new Date().toISOString();
  const next = { requestType: invite.inviteType, phone, status: "pending", children, inviteToken: invite.token, submittedAt: current && current.submittedAt || now, updatedAt: now };
  if (current) {
    Object.assign(current, next);
    return { message: "申请已更新，等待老板确认", requestId: current.id, status: "pending" };
  }
  next.id = newId("registration-request");
  state.registrationRequests.push(next);
  return { message: "登记已提交，等待老板确认", requestId: next.id, status: "pending" };
}

function ensureRegistrationInvite(state, inviteType) {
  let invite = state.registrationInvites.find((item) => item.inviteType === inviteType && item.status === "active");
  if (!invite) {
    invite = { id: newId("registration-invite"), inviteType, token: newId("invite"), status: "active", fileIds: {}, createdAt: new Date().toISOString() };
    state.registrationInvites.push(invite);
  }
  return invite;
}

function registrationAdminData(state, viewer, payload) {
  assertRole(viewer, ["admin"]);
  const envVersion = payload.envVersion || "develop";
  const invites = [ensureRegistrationInvite(state, "coach"), ensureRegistrationInvite(state, "student")].map((item) => Object.assign({}, item, { fileId: "", envVersion }));
  const requests = state.registrationRequests.filter((item) => item.status === "pending").slice().sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
  return { invites, requests, pendingCount: requests.length };
}

function rotateRegistrationInvite(state, viewer, payload) {
  assertRole(viewer, ["admin"]);
  const inviteType = String(payload.inviteType || "");
  if (["coach", "student"].indexOf(inviteType) < 0) throw new Error("登记码类型无效");
  state.registrationInvites.filter((item) => item.inviteType === inviteType && item.status === "active").forEach((item) => { item.status = "disabled"; item.disabledAt = new Date().toISOString(); });
  const invite = ensureRegistrationInvite(state, inviteType);
  return { message: (inviteType === "coach" ? "教练码 A" : "学员码 B") + " 已更换，旧码立即失效", invite: Object.assign({}, invite, { fileId: "", envVersion: payload.envVersion || "develop" }) };
}

function nextRoleAccountName(state, prefix) {
  const max = state.accounts.reduce((value, item) => {
    const match = new RegExp("^" + prefix + "(\\d+)$").exec(String(item.account || ""));
    return match ? Math.max(value, Number(match[1])) : value;
  }, 0);
  return prefix + String(max + 1).padStart(3, "0");
}

function reviewRegistration(state, viewer, payload) {
  assertRole(viewer, ["admin"]);
  const request = state.registrationRequests.find((item) => item.id === payload.requestId);
  if (!request || request.status !== "pending") throw new Error("该申请已处理或不存在");
  if (payload.decision === "reject") {
    Object.assign(request, { status: "rejected", rejectReason: String(payload.reason || "老板拒绝"), reviewedAt: new Date().toISOString(), reviewedBy: viewer.account });
    return { message: "申请已拒绝", request };
  }
  if (payload.decision !== "approve") throw new Error("请选择通过或拒绝");
  if (state.accounts.some((item) => item.phone === request.phone && item.status !== "disabled")) throw new Error("该手机号已有账号，不能重复通过");
  const now = new Date().toISOString();
  const createdMembers = [];
  let account;
  if (request.requestType === "coach") {
    const displayName = String(payload.displayName || "").trim();
    if (!displayName) throw new Error("请填写教练姓名");
    account = { id: newId("account"), account: nextRoleAccountName(state, "jl"), role: "coach", fullName: displayName, coachName: displayName, campus: String(payload.campus || ""), phone: request.phone, phoneLocked: true, registrationSource: "self_registration", loginMode: "phone", bindingStatus: "pending", openid: null, status: "active", createdAt: now, updatedAt: now };
  } else {
    const children = registrationChildren(payload.children || request.children);
    children.forEach((child) => {
      const member = { id: newId("member"), memberNo: nextMemberNo(state), chineseName: child.proposedName, phone: request.phone, phoneLocked: true, registrationSource: "self_registration", productId: "product-class-pack", productName: "课时账户", productType: "class_pack", totalLessons: child.remainingLessons, wechat: "", campus: "", coach: "", notes: "扫码登记，老板已确认", createdAt: now, updatedAt: now };
      state.members.push(member);
      createdMembers.push(member);
    });
    const memberIds = createdMembers.map((item) => item.id);
    account = { id: newId("account"), account: nextRoleAccountName(state, "xy"), role: "student", fullName: createdMembers.map((item) => item.chineseName).join("、") + "家长", phone: request.phone, phoneLocked: true, registrationSource: "self_registration", memberId: memberIds[0], memberIds, loginMode: "phone", bindingStatus: "pending", openid: null, status: "active", createdAt: now, updatedAt: now };
  }
  state.accounts.push(account);
  Object.assign(request, { status: "approved", reviewedAt: now, reviewedBy: viewer.account, approvedAccount: account.account, approvedChildren: createdMembers, updatedAt: now });
  state.auditLogs.push({ id: newId("audit"), action: "approve_registration", requestId: request.id, requestType: request.requestType, phone: request.phone, account: account.account, operator: viewer.account, createdAt: now });
  return { message: request.requestType === "coach" ? "教练已通过，可用手机号登录" : "学员已建档，家长可用手机号登录", account: safeAccount(account), members: createdMembers };
}

function checkinContext(state, viewer, payload) {
  assertRole(viewer, ["student"]);
  const token = String(payload.scene || payload.token || "").replace(/^t=/, "");
  const code = state.dailyCoachCodes.find((item) => item.token === token && item.status === "active");
  if (!code) throw new Error("教练码无效");
  if (code.codeDate !== todayChina()) throw new Error("该教练码已过期，请扫描今天的新码");
  const members = memberViews(state, viewer);
  if (!members.length) throw new Error("当前手机号没有绑定学员，请联系老板");
  return { codeDate: code.codeDate, coachAccount: code.coachAccount, coachName: code.coachName, confirmTime: timeChina(), members };
}

function confirmDailyCheckin(state, viewer, payload) {
  const context = checkinContext(state, viewer, payload);
  const lessons = Number(payload.lessons || 1);
  if ([1, 2, 3].indexOf(lessons) < 0) throw new Error("家长每次只能选择扣 1、2 或 3 节");
  const allowed = context.members.map((item) => item.id);
  const memberIds = Array.from(new Set(payload.memberIds || [])).filter((id) => allowed.indexOf(id) >= 0);
  if (!memberIds.length) throw new Error("请至少选择一名到场学员");
  const batchId = "scan-" + String(payload.requestId || newId("request"));
  const previous = state.attendanceLogs.filter((item) => item.batchId === batchId);
  if (previous.length) return { message: "消课成功", batchId, logs: previous, members: memberViews(state, viewer), confirmedAt: previous[0].createdAt, idempotent: true };
  const duplicate = memberIds.find((memberId) => state.attendanceLogs.some((log) => log.memberId === memberId && log.attendanceDate === todayChina() && log.coachAccount === context.coachAccount && log.source === "coach_daily_qr" && log.status !== "reversed" && !log.reversedAt));
  if (duplicate) throw new Error((context.members.find((item) => item.id === duplicate) || {}).chineseName + " 今天已在该教练处消课");
  const createdAt = new Date().toISOString();
  const logs = memberIds.map((memberId) => {
    const member = context.members.find((item) => item.id === memberId);
    const log = { id: newId("attendance"), batchId, attendanceDate: todayChina(), attendanceTime: timeChina(), memberId, memberName: member.chineseName, coachAccount: context.coachAccount, coach: context.coachName, lessonsDeducted: lessons, source: "coach_daily_qr", sourceNote: "家长扫码消课", status: "active", createdBy: viewer.account, createdAt, updatedAt: createdAt };
    state.attendanceLogs.push(log);
    return log;
  });
  return { message: "消课成功", batchId, logs, members: memberViews(state, viewer), confirmedAt: createdAt };
}

function bindMemberGuardian(state, viewer, payload) {
  assertRole(viewer, ["admin"]);
  const member = state.members.find((item) => item.id === payload.memberId);
  const phone = rules.normalizePhone(payload.phone || member && member.phone);
  if (!member) throw new Error("学员不存在");
  if (!rules.isChinaMobile(phone)) throw new Error("请填写家长的 11 位手机号");
  if (member.phoneLocked && phone !== rules.normalizePhone(member.phone)) throw new Error("该手机号来自微信验证，不能修改");
  let target = state.accounts.find((item) => item.role === "student" && item.phone === phone && item.status !== "disabled");
  if (!target) {
    const count = state.accounts.filter((item) => item.role === "student").length + 1;
    target = { id: newId("account"), account: "xy" + String(count).padStart(3, "0"), role: "student", fullName: member.chineseName + "家长", phone, memberId: member.id, memberIds: [member.id], loginMode: "phone", bindingStatus: "pending", openid: null, status: "active" };
    state.accounts.push(target);
  } else {
    target.memberIds = Array.from(new Set([].concat(target.memberIds || [], target.memberId || [], member.id)));
    target.memberId = target.memberIds[0];
  }
  state.accounts.filter((item) => item.role === "student" && item.id !== target.id).forEach((item) => {
    item.memberIds = [].concat(item.memberIds || [], item.memberId || []).filter((id) => id && id !== member.id);
    item.memberId = item.memberIds[0] || "";
    if (!item.memberIds.length) item.status = "disabled";
  });
  member.phone = phone;
  return { message: "家长手机号已绑定", account: target };
}

function reverseConsumption(state, viewer, payload) {
  assertRole(viewer, ["admin"]);
  const log = state.attendanceLogs.find((item) => item.id === payload.logId);
  if (!log) throw new Error("消课流水不存在");
  if (log.status === "reversed" || log.reversedAt) throw new Error("该流水已经撤销");
  Object.assign(log, { status: "reversed", reversedAt: new Date().toISOString(), reversedBy: viewer.account, reverseReason: payload.reason || "老板纠错" });
  return { message: "已撤销并返还课时", log };
}

function adjustConsumption(state, viewer, payload) {
  assertRole(viewer, ["admin"]);
  const log = state.attendanceLogs.find((item) => item.id === payload.logId);
  const lessons = Number(payload.lessons);
  if (!log) throw new Error("消课流水不存在");
  if (!Number.isInteger(lessons) || lessons < 1 || lessons > 99) throw new Error("课时应为 1 至 99 的整数");
  log.correctedFrom = Number(log.lessonsDeducted || 1); log.lessonsDeducted = lessons; log.correctedAt = new Date().toISOString(); log.correctedBy = viewer.account;
  return { message: "消课课时已调整", log };
}

function manualConsumption(state, viewer, payload) {
  assertRole(viewer, ["admin"]);
  const lessons = Number(payload.lessons);
  if (!Number.isInteger(lessons) || lessons < 1 || lessons > 99) throw new Error("课时应为 1 至 99 的整数");
  const coach = state.accounts.find((item) => item.account === (payload.coachAccount || viewer.account));
  if (!coach || ["admin", "coach"].indexOf(coach.role) < 0) throw new Error("教练不存在");
  const memberIds = Array.from(new Set(payload.memberIds || []));
  if (!memberIds.length) throw new Error("请选择学员");
  const batchId = newId("manual");
  memberIds.forEach((memberId) => {
    const member = state.members.find((item) => item.id === memberId);
    if (!member) throw new Error("学员不存在");
    state.attendanceLogs.push({ id: newId("attendance"), batchId, attendanceDate: payload.attendanceDate || todayChina(), attendanceTime: payload.attendanceTime || timeChina(), memberId, memberName: member.chineseName, coachAccount: coach.account, coach: coach.coachName || coach.fullName, lessonsDeducted: lessons, source: "admin_manual", sourceNote: payload.reason || "老板补录", status: "active", createdBy: viewer.account, createdAt: new Date().toISOString() });
  });
  return { message: "补录消课成功", batchId };
}

function addMemberLessons(state, viewer, payload) {
  assertRole(viewer, ["admin"]);
  const member = state.members.find((item) => item.id === payload.memberId);
  const amount = Number(payload.amount);
  if (!member) throw new Error("学员不存在");
  if (!Number.isInteger(amount) || !amount || Math.abs(amount) > 999) throw new Error("调整课时应为 -999 至 999 的非零整数");
  const before = Number(member.totalLessons || 0); const after = before + amount;
  if (after < 0) throw new Error("总课时不能小于 0");
  member.totalLessons = after;
  state.lessonAdjustments.push({ id: newId("lesson-adjustment"), memberId: member.id, before, amount, after, reason: payload.reason || "老板加课", operator: viewer.account, createdAt: new Date().toISOString() });
  return { message: "学员总课时已更新", before, amount, after };
}

function schedulesFor(state, viewer) {
  return state.schedules
    .filter((schedule) => {
      if (viewer.role === "admin") return true;
      if (viewer.role === "coach") return schedule.coach === viewer.coachName;
      if (viewer.role === "student") return schedule.memberId === viewer.memberId;
      return false;
    })
    .map(decorateVerification)
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

function enrichAvailabilitySlots(state, slots) {
  const active = state.bookingRequests.filter((item) => item.status === "pending" || item.status === "approved");
  return slots.map((slot) => {
    const pendingCount = active.filter((item) => item.slotId === slot.id && item.status === "pending").length;
    const approvedCount = active.filter((item) => item.slotId === slot.id && item.status === "approved").length;
    const bookedCount = pendingCount + approvedCount;
    const capacity = Math.max(1, Number(slot.capacity || 1));
    const left = Math.max(0, capacity - bookedCount);
    const expired = rules.daysFromToday(slot.slotDate) < 0;
    return Object.assign({}, slot, {
      capacity,
      pendingCount,
      approvedCount,
      bookedCount,
      left,
      fillRate: Math.round(bookedCount * 100 / capacity),
      dayLabel: rules.dayLabel(slot.slotDate),
      statusLabel: expired ? "已过期" : slot.status === "published" ? left > 0 ? "可预约" : "已满" : "待发布"
    });
  });
}

function availabilityFor(state, viewer) {
  const slots = state.availabilitySlots
    .filter((slot) => {
      if (viewer.role === "admin") return true;
      if (viewer.role === "coach") return slot.coach === viewer.coachName;
      if (viewer.role === "student") {
        return (
          slot.status === "published" &&
          rules.isBookableSlot(slot.slotDate, slot.slotTime)
        );
      }
      return false;
    })
    .sort((a, b) => (a.slotDate + String(a.publishOrder).padStart(4, "0") + a.slotTime).localeCompare(b.slotDate + String(b.publishOrder).padStart(4, "0") + b.slotTime));
  return enrichAvailabilitySlots(state, slots);
}

function nextScheduleFor(state, viewer) {
  return schedulesFor(state, viewer)
    .filter((item) => rules.daysFromToday(item.lessonDate) >= 0 && item.lessonStatus !== "cancelled")
    .sort((a, b) => rules.sortByDateTime(a, b))[0] || null;
}

function dashboardInsights(state, viewer) {
  const members = memberViews(state, viewer);
  const schedules = schedulesFor(state, viewer);
  const bookings = bookingsFor(state, viewer);
  const applications = state.courseApplications.filter((item) => viewer.role === "admin" || item.memberId === viewer.memberId);
  const today = rules.formatDateChina(new Date());
  const lowBalanceMembers = members.filter((item) => item.status === "即将用完" || item.status === "欠课" || item.status === "已完成");
  const todaySchedules = schedules.filter((item) => item.lessonDate === today && item.lessonStatus !== "cancelled");
  const overdueCheckins = schedules.filter((item) => rules.daysFromToday(item.lessonDate) <= 0 && item.lessonStatus === "pending");
  return {
    lowBalanceMembers,
    todaySchedules,
    overdueCheckins,
    pendingBookings: bookings.filter((item) => item.status === "pending"),
    pendingApplications: applications.filter((item) => item.status === "pending"),
    pendingLeaves: state.leaveRequests.filter((item) => viewer.role === "admin" && item.status === "pending"),
    pendingMakeups: state.makeupCredits.filter((item) => viewer.role === "admin" && item.status === "available"),
    nextSchedule: nextScheduleFor(state, viewer)
  };
}

function performanceDashboard(state, days) {
  const windowDays = Number(days || 7);
  const inWindow = (value) => {
    const diff = rules.daysFromToday(value);
    return diff <= 0 && diff > -windowDays;
  };
  const completed = state.schedules.filter((item) => item.lessonStatus === "completed" && inWindow(item.lessonDate));
  const logs = state.attendanceLogs.filter((item) => inWindow(item.attendanceDate));
  const byCoach = {};
  completed.forEach((item) => {
    const key = item.coach || "未分配";
    byCoach[key] = byCoach[key] || { coach: key, completed: 0, deducted: 0 };
    byCoach[key].completed += 1;
  });
  logs.forEach((item) => {
    const key = item.coach || "未分配";
    byCoach[key] = byCoach[key] || { coach: key, completed: 0, deducted: 0 };
    byCoach[key].deducted += Number(item.lessonsDeducted || 0);
  });
  return {
    days: windowDays,
    completedLessons: completed.length,
    deductedLessons: logs.reduce((sum, item) => sum + Number(item.lessonsDeducted || 0), 0),
    pendingApplications: state.courseApplications.filter((item) => item.status === "pending").length,
    pendingLeaves: state.leaveRequests.filter((item) => item.status === "pending").length,
    pendingMakeups: state.makeupCredits.filter((item) => item.status === "available").length,
    coachRanking: Object.keys(byCoach).map((key) => byCoach[key]).sort((a, b) => b.completed - a.completed || b.deducted - a.deducted).slice(0, 8)
  };
}

function homeData(state, viewer) {
  const memberIds = memberViews(state, viewer).map((item) => item.id);
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
    leaveRequests: state.leaveRequests.filter((item) => {
      if (viewer.role === "admin") return true;
      if (viewer.role === "coach") return item.coach === viewer.coachName;
      if (viewer.role === "student") return item.memberId === viewer.memberId;
      return false;
    }),
    makeupCredits: state.makeupCredits.filter((item) => {
      if (viewer.role === "admin") return true;
      if (viewer.role === "coach") return item.coach === viewer.coachName;
      if (viewer.role === "student") return item.memberId === viewer.memberId;
      return false;
    }),
    lessonFeedbacks: state.lessonFeedbacks.filter((item) => {
      if (viewer.role === "admin") return true;
      if (viewer.role === "coach") return item.coach === viewer.coachName;
      if (viewer.role === "student") return memberIds.indexOf(item.memberId) >= 0;
      return false;
    }),
    courseProducts: state.courseProducts,
    dashboard: viewer.role === "admin" ? performanceDashboard(state, 7) : dashboardInsights(state, viewer),
    dashboard30: viewer.role === "admin" ? performanceDashboard(state, 30) : {},
    weeklyAvailabilityTemplate: viewer.role === "admin" ? {
      configured: Boolean(state.weeklyAvailabilityTemplateConfigured),
      rows: clone(state.weeklyAvailabilityTemplates)
    } : { configured: false, rows: [] },
    accounts: viewer.role === "admin" ? state.accounts.map(safeAccount) : []
  };
}

function listPagedData(state, viewer, payload) {
  const collection = String(payload.collection || "").trim();
  const allowed = ["members", "schedules", "attendanceLogs", "bookingRequests", "lessonFeedbacks"];
  if (allowed.indexOf(collection) === -1) throw new Error("不支持分页读取该集合");
  const page = Math.max(1, Number(payload.page || 1));
  const pageSize = Math.min(80, Math.max(1, Number(payload.pageSize || 30)));
  let items = [];
  if (collection === "members") items = memberViews(state, viewer);
  if (collection === "schedules") items = schedulesFor(state, viewer);
  if (collection === "attendanceLogs") {
    items = state.attendanceLogs.filter((log) => {
      if (viewer.role === "admin") return true;
      if (viewer.role === "coach") return log.coach === viewer.coachName;
      if (viewer.role === "student") return log.memberId === viewer.memberId;
      return false;
    });
  }
  if (collection === "bookingRequests") items = bookingsFor(state, viewer);
  if (collection === "lessonFeedbacks") {
    const memberIds = memberViews(state, viewer).map((item) => item.id);
    items = state.lessonFeedbacks.filter((item) => {
      if (viewer.role === "admin") return true;
      if (viewer.role === "coach") return item.coach === viewer.coachName;
      if (viewer.role === "student") return memberIds.indexOf(item.memberId) >= 0;
      return false;
    });
  }
  const offset = (page - 1) * pageSize;
  return { collection, page, pageSize, total: items.length, items: clone(items.slice(offset, offset + pageSize)) };
}

function safeAccount(account) {
  const result = clone(account);
  result.wechatBound = result.role === "admin" ? false : Boolean(result.openid);
  delete result.password;
  delete result.passwordSessions;
  delete result.openid;
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
  const totalLessons = member.totalLessons !== undefined && member.totalLessons !== "" ? Number(member.totalLessons) : current ? Number(current.totalLessons || 0) : 0;
  return Object.assign({}, current || {}, {
    productId: current && current.productId || "",
    productName: current && current.productName || "",
    productType: current && current.productType || "",
    totalLessons: Number.isFinite(totalLessons) ? totalLessons : 0,
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
  if (current && current.phoneLocked && raw.phone !== undefined && rules.normalizePhone(raw.phone) !== rules.normalizePhone(current.phone)) throw new Error("该手机号来自微信验证，不能修改");
  const member = memberPayload(state, raw, current);
  if (!member.chineseName) throw new Error("学员姓名不能为空");
  if (!Number.isFinite(Number(member.totalLessons)) || Number(member.totalLessons) < -999 || Number(member.totalLessons) > 99999) throw new Error("总课时应为 -999 至 99999");

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
  const phone = rules.normalizePhone(raw.phone || "");
  if (phone && !rules.isChinaMobile(phone)) throw new Error("手机号必须是 11 位大陆手机号");
  if (role !== "admin" && !phone) throw new Error("教练和学员账号需要绑定手机号");
  const duplicatePhone = phone && state.accounts.find((item) => item.phone === phone && item.id !== id);
  if (duplicatePhone) throw new Error("手机号已绑定其他账号");

  const current = id ? state.accounts.find((item) => item.id === id) : null;
  if (current && current.phoneLocked && raw.phone !== undefined && rules.normalizePhone(raw.phone) !== rules.normalizePhone(current.phone)) throw new Error("该手机号来自微信验证，不能修改");
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

  const phoneChanged = Boolean(current && role !== "admin" && phone !== String(current.phone || ""));
  const next = Object.assign({}, current || {}, {
    account: accountName,
    role,
    fullName: String(raw.fullName || raw.memberName || raw.coachName || accountName).trim(),
    campus: String(raw.campus || current && current.campus || "").trim(),
    coachName: role === "coach" ? String(raw.coachName || raw.fullName || "").trim() : "",
    memberId: role === "student" ? memberId : "",
    phone,
    loginMode: role === "admin" ? "password" : "phone",
    bindingStatus: current && current.openid && !phoneChanged ? "bound" : phone ? "pending" : "",
    status: raw.status || current && current.status || "active",
    phoneLocked: Boolean(current && current.phoneLocked),
    registrationSource: current && current.registrationSource || "",
    updatedAt: new Date().toISOString()
  });
  if (phoneChanged) next.openid = null;

  const adminPasswordChanged = Boolean(current && role === "admin" && raw.password && current.password !== String(raw.password));
  if (role === "admin" && (!current || adminPasswordChanged)) {
    next.password = String(raw.password || defaultPasswordForRole(role));
    next.passwordSessions = [];
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
  if (account.role !== "admin") throw new Error("教练和学员使用手机号验证，无需重置密码");
  account.password = defaultPasswordForRole(account.role);
  account.passwordSessions = [];
  account.updatedAt = new Date().toISOString();
  return { message: "密码已重置为系统默认密码", account: safeAccount(account) };
}

function changeMyPassword(state, viewer, payload) {
  assertRole(viewer, ["admin"]);
  const oldPassword = String(payload.oldPassword || "");
  const newPassword = String(payload.newPassword || "");
  if (!newPassword || newPassword.length < 4) throw new Error("新密码至少 4 位");
  if (oldPassword === newPassword) throw new Error("新旧密码不能一样");
  if (viewer.password !== oldPassword) throw new Error("原密码错误");
  viewer.password = newPassword;
  viewer.passwordSessions = [];
  viewer.updatedAt = new Date().toISOString();
  return { message: "密码已修改，请使用新密码登录" };
}

function saveWeeklyAvailabilityTemplate(state, viewer, payload) {
  assertRole(viewer, ["admin"]);
  const rows = Array.isArray(payload.rows || payload.templates) ? payload.rows || payload.templates : [];
  if (rows.length > 100) throw new Error("每周模板最多 100 条");
  state.weeklyAvailabilityTemplates = clone(rows);
  state.weeklyAvailabilityTemplateConfigured = true;
  return { message: "每周模板已同步", rows: clone(rows) };
}

function unbindAccountWechat(state, viewer, payload) {
  assertRole(viewer, ["admin"]);
  const account = state.accounts.find((item) => item.id === (payload.id || payload.accountId));
  if (!account) throw new Error("账号不存在");
  if (account.role === "admin") throw new Error("老板账号不能在小程序内解除绑定");
  account.openid = null;
  account.bindingStatus = account.phone ? "pending" : "";
  account.updatedAt = new Date().toISOString();
  return { message: "已解除旧微信绑定，可用已登记手机号重新登录" };
}

function login(payload) {
  const state = loadState();
  const loginId = String(payload.account || "").trim();
  const accountName = rules.normalizeAccount(loginId);
  const isPhoneLoginId = rules.isChinaMobile(loginId);
  const account = isPhoneLoginId
    ? state.accounts.find((item) => item.phone === rules.normalizePhone(loginId) && item.status !== "disabled")
    : activeAccount(state, accountName);
  let resolvedAccount = account;
  let adminPhoneToBind = "";
  if (!resolvedAccount && isPhoneLoginId) {
    const admin = activeAccount(state, "yeats");
    if (admin && admin.password === String(payload.password || "") && (!admin.phone || admin.phone === rules.normalizePhone(loginId))) {
      adminPhoneToBind = rules.normalizePhone(loginId);
      resolvedAccount = admin;
    }
  }
  if (!resolvedAccount || resolvedAccount.password !== String(payload.password || "")) {
    throw new Error("账号或密码错误");
  }
  if (resolvedAccount.role !== "admin") throw new Error("教练和学员请使用手机号验证登录");

  const role = isPhoneLoginId ? resolvedAccount.role : rules.roleFromAccount(accountName);
  if (!role || role !== resolvedAccount.role) {
    throw new Error("账号角色配置不正确");
  }

  if (adminPhoneToBind) {
    resolvedAccount.phone = adminPhoneToBind;
    resolvedAccount.loginMode = "password";
  }
  resolvedAccount.openid = null;
  resolvedAccount.bindingStatus = "";
  const authToken = "mock-admin-" + Date.now() + "-" + Math.random().toString(36).slice(2);
  resolvedAccount.passwordSessions = (resolvedAccount.passwordSessions || []).slice(-4).concat(authToken);
  resolvedAccount.lastLoginAt = new Date().toISOString();
  saveState(state);

  const session = safeAccount(resolvedAccount);
  session.authMethod = "password";
  session.authToken = authToken;
  return {
    session,
    message: "登录成功"
  };
}

function loginByPhone(payload) {
  const state = loadState();
  const phone = rules.normalizePhone(payload.phone);
  if (!rules.isChinaMobile(phone)) throw new Error("请输入正确的 11 位手机号");
  const matches = state.accounts.filter((item) => item.phone === phone && item.status !== "disabled");
  if (matches.length > 1) throw new Error("该手机号绑定了多个账号，请联系老板处理");
  const account = matches[0];
  if (!account) throw new Error("该手机号未开通账号，请联系老板绑定");
  if (account.role === "admin") {
    throw new Error("老板账号不能使用微信手机号登录，请切换到老板管理并使用手机号和密码");
  }

  const openid = payload.openid || "mock-phone-openid";
  if (account.openid && account.openid !== openid) {
    throw new Error("该手机号账号已经绑定其他微信");
  }
  account.openid = openid;
  account.phoneVerifiedAt = new Date().toISOString();
  account.bindingStatus = "bound";
  account.loginMode = "phone";
  account.lastLoginAt = new Date().toISOString();
  account.updatedAt = new Date().toISOString();
  saveState(state);
  return {
    session: safeAccount(account),
    message: "手机号验证成功，已绑定当前微信"
  };
}

function loginForTest(payload) {
  const phone = rules.normalizePhone(payload.phone);
  if (phone !== DEV_TEST_PHONE) throw new Error("测试手机号不正确");
  const role = String(payload.role || "").trim();
  const accountName = role === "admin" ? "yeats" : role === "coach" ? "jl001" : role === "student" ? "xy001" : "";
  if (!accountName) throw new Error("请选择测试角色");
  const state = loadState();
  const account = activeAccount(state, accountName);
  if (!account) throw new Error("测试账号不存在，请先初始化数据");
  return {
    session: Object.assign(safeAccount(account), {
      testLogin: true,
      testPhone: phone
    }),
    message: "测试登录成功"
  };
}

function createBookingRequest(state, viewer, payload) {
  assertRole(viewer, ["student"]);
  const slot = state.availabilitySlots.find((item) => item.id === payload.slotId);
  if (!slot || slot.status !== "published") throw new Error("该时间暂不可预约");
  if (!rules.isBookableSlot(slot.slotDate, slot.slotTime)) throw new Error("该时间已经不可预约");

  const member = state.members.find((item) => item.id === viewer.memberId);
  if (!member) throw new Error("找不到绑定学员");

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
    productId: String(payload.productId || member.productId || "").trim(),
    productName: String(payload.productName || member.productName || "").trim(),
    status: "pending",
    note: String(payload.note || "").trim(),
    createdAt: new Date().toISOString()
  };
  state.bookingRequests.push(request);
  state.auditLogs.push({ id: newId("audit"), action: "createBookingRequest", account: viewer.account, createdAt: request.createdAt });
  return { message: "已生成课程草稿，等待老板发布", request };
}

function approveBookingRequest(state, viewer, payload) {
  assertRole(viewer, ["admin"]);
  const request = state.bookingRequests.find((item) => item.id === payload.requestId);
  if (!request || request.status !== "pending") throw new Error("该预约无法审批");
  const slot = state.availabilitySlots.find((item) => item.id === request.slotId);
  if (!slot) throw new Error("空余时间不存在");

  const activeCount = state.bookingRequests.filter((item) => item.slotId === slot.id && item.status === "approved").length;
  if (activeCount >= Number(slot.capacity || 1)) throw new Error("该时间名额已满");
  const duplicated = state.schedules.some((item) => item.memberId === request.memberId && item.lessonDate === slot.slotDate && item.lessonTime === slot.slotTime && item.lessonStatus !== "cancelled");
  if (duplicated) throw new Error("该学员该时间已有排课");

  const schedule = {
    id: newId("schedule"),
    lessonDate: slot.slotDate,
    lessonTime: slot.slotTime,
    campus: slot.campus,
    coach: slot.coach,
    memberId: request.memberId,
    memberName: request.memberName,
    productId: request.productId || "",
    productName: request.productName || "",
    attended: false,
    lessonStatus: "pending",
    source: "student_booking",
    bookingRequestId: request.id
  };
  Object.assign(schedule, verificationPatch(schedule));
  state.schedules.push(schedule);
  request.status = "approved";
  request.reviewedAt = new Date().toISOString();
  request.createdScheduleId = schedule.id;
  return { message: "已通过预约并生成排课", schedule };
}

function updateBookingRequestMatch(state, viewer, payload) {
  assertRole(viewer, ["admin"]);
  const request = state.bookingRequests.find((item) => item.id === payload.requestId);
  if (!request || request.status !== "pending") throw new Error("该课程草稿无法调整");
  const slot = state.availabilitySlots.find((item) => item.id === payload.slotId);
  if (!slot || slot.status !== "published") throw new Error("所选时间暂未开放");
  const otherActive = state.bookingRequests.filter((item) => item.id !== request.id && item.slotId === slot.id && ["pending", "approved"].indexOf(item.status) >= 0);
  if (otherActive.length >= Number(slot.capacity || 1)) throw new Error("所选时间名额已满");
  Object.assign(request, {
    slotId: slot.id,
    slotDate: slot.slotDate,
    slotTime: slot.slotTime,
    campus: slot.campus,
    coach: slot.coach,
    matchedBy: viewer.account,
    updatedAt: new Date().toISOString()
  });
  return { message: "课程草稿已调整", request };
}

function rejectBookingRequest(state, viewer, payload) {
  assertRole(viewer, ["admin"]);
  const request = state.bookingRequests.find((item) => item.id === payload.requestId);
  if (!request || request.status !== "pending") throw new Error("该预约无法拒绝");
  request.status = "rejected";
  request.rejectReason = String(payload.reason || "").trim();
  request.reviewedAt = new Date().toISOString();
  return { message: "已拒绝预约", request };
}

function cancelBookingRequest(state, viewer, payload) {
  const request = state.bookingRequests.find((item) => item.id === payload.requestId);
  if (!request) throw new Error("预约不存在");
  if (viewer.role === "student") {
    if (request.memberId !== viewer.memberId) throw new Error("只能取消自己的预约");
    if (request.status !== "pending") throw new Error("已通过的预约请联系老板取消");
    request.status = "cancelled_by_student";
  } else {
    assertRole(viewer, ["admin"]);
    if (request.status !== "pending") throw new Error("只能取消待审批预约");
    request.status = "cancelled_by_admin";
    request.cancelledBy = viewer.account;
  }
  request.cancelReason = String(payload.reason || "").trim();
  request.cancelledAt = new Date().toISOString();
  return { message: "已取消预约", request };
}

function completeScheduleAttendance(state, viewer, schedule, sourceNote, verificationCode) {
  assertRole(viewer, ["admin", "coach"]);
  if (viewer.role === "coach" && schedule.coach !== viewer.coachName) throw new Error("只能确认自己的课程");
  if (viewer.role === "coach" && rules.daysFromToday(schedule.lessonDate) > 0) throw new Error("课程还未开始，暂不能确认出勤");

  if (schedule.lessonStatus === "completed") {
    return { message: "该课程已经确认过出勤", schedule };
  }
  if (schedule.lessonStatus === "leave_approved") throw new Error("该课程已请假，不可确认出勤");

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
    source: verificationCode ? "qr_verify" : "coach_checkin",
    sourceNote: sourceNote || (verificationCode ? "扫码核销" : "小程序确认出勤"),
    verificationCode: verificationCode || schedule.verificationCode || ""
  };
  state.attendanceLogs.push(log);
  schedule.attended = true;
  schedule.lessonStatus = "completed";
  if (verificationCode) {
    schedule.verifiedAt = new Date().toISOString();
    schedule.verifiedBy = viewer.account;
    schedule.verificationSource = "scan";
  }
  return { message: deducted ? "已确认出勤并扣 1 课时" : "已确认出勤，该课程类型不扣课时", log };
}

function markAttendance(state, viewer, payload) {
  const schedule = state.schedules.find((item) => item.id === payload.scheduleId);
  if (!schedule) throw new Error("排课不存在");
  return completeScheduleAttendance(state, viewer, schedule, "小程序确认出勤", "");
}

function verifyScheduleQr(state, viewer, payload) {
  assertRole(viewer, ["admin", "coach"]);
  const code = rules.normalizeVerificationCode(payload.code || payload.qr || payload.scene);
  if (!code) throw new Error("核销码不能为空");
  const schedule = state.schedules.find((item) => rules.verificationCodeForSchedule(item) === code);
  if (!schedule) throw new Error("核销码无效");
  if (viewer.role === "coach" && schedule.coach !== viewer.coachName) throw new Error("只能核销自己的课程");
  const status = rules.verificationStatus(Object.assign({}, schedule, verificationPatch(schedule)));
  if (status === "verified") throw new Error("该课程已经核销");
  if (status === "expired") throw new Error("核销码已过期，请联系管理员处理");
  return completeScheduleAttendance(state, viewer, schedule, "扫码核销", code);
}

function submitLessonFeedback(state, viewer, payload) {
  assertRole(viewer, ["admin", "coach"]);
  const schedule = state.schedules.find((item) => item.id === payload.scheduleId);
  if (!schedule) throw new Error("排课不存在");
  if (viewer.role === "coach" && schedule.coach !== viewer.coachName) throw new Error("只能反馈自己的课程");
  if (schedule.lessonStatus !== "completed") throw new Error("完成出勤后才能填写课后反馈");
  const member = state.members.find((item) => item.id === schedule.memberId);
  if (!member) throw new Error("学员不存在");
  const feedback = {
    id: "",
    scheduleId: schedule.id,
    memberId: member.id,
    memberName: member.chineseName,
    coach: schedule.coach,
    campus: schedule.campus,
    lessonDate: schedule.lessonDate,
    lessonTime: schedule.lessonTime,
    tags: Array.isArray(payload.tags) ? payload.tags.map((item) => String(item).trim()).filter(Boolean).slice(0, 6) : [],
    note: String(payload.note || "").trim(),
    createdBy: viewer.account,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (!feedback.tags.length && !feedback.note) throw new Error("请选择标签或填写反馈备注");
  const current = state.lessonFeedbacks.find((item) => item.scheduleId === schedule.id);
  if (current) {
    Object.assign(current, feedback, { id: current.id });
    return { message: "课后反馈已更新", feedback: current };
  }
  feedback.id = newId("feedback");
  state.lessonFeedbacks.push(feedback);
  return { message: "课后反馈已保存", feedback };
}

function createLeaveRequest(state, viewer, payload) {
  assertRole(viewer, ["student"]);
  const schedule = state.schedules.find((item) => item.id === payload.scheduleId);
  if (!schedule) throw new Error("排课不存在");
  if (schedule.memberId !== viewer.memberId) throw new Error("只能为自己的课程请假");
  if (schedule.lessonStatus !== "pending") throw new Error("该课程当前不能请假");
  if (rules.daysFromToday(schedule.lessonDate) < 0) throw new Error("已过期课程不能请假");
  if (state.leaveRequests.some((item) => item.scheduleId === schedule.id && item.status === "pending")) {
    throw new Error("该课程已有待审批请假申请");
  }
  const request = {
    id: newId("leave"),
    scheduleId: schedule.id,
    memberId: schedule.memberId,
    memberName: schedule.memberName,
    coach: schedule.coach,
    campus: schedule.campus,
    lessonDate: schedule.lessonDate,
    lessonTime: schedule.lessonTime,
    reason: String(payload.reason || "").trim(),
    status: "pending",
    createdAt: new Date().toISOString()
  };
  state.leaveRequests.push(request);
  return { message: "请假申请已提交，等待老板审批", request };
}

function approveLeaveRequest(state, viewer, payload) {
  assertRole(viewer, ["admin"]);
  const request = state.leaveRequests.find((item) => item.id === payload.requestId);
  if (!request || request.status !== "pending") throw new Error("该请假申请无法处理");
  const schedule = state.schedules.find((item) => item.id === request.scheduleId);
  if (!schedule) throw new Error("排课不存在");
  const credit = {
    id: newId("makeup"),
    leaveRequestId: request.id,
    sourceScheduleId: schedule.id,
    memberId: request.memberId,
    memberName: request.memberName,
    coach: request.coach,
    campus: request.campus,
    status: "available",
    reason: request.reason || "",
    createdAt: new Date().toISOString()
  };
  state.makeupCredits.push(credit);
  request.status = "approved";
  request.reviewedAt = new Date().toISOString();
  request.reviewedBy = viewer.account;
  request.makeupCreditId = credit.id;
  schedule.lessonStatus = "leave_approved";
  schedule.leaveRequestId = request.id;
  return { message: "已通过请假并生成补课额度", credit };
}

function rejectLeaveRequest(state, viewer, payload) {
  assertRole(viewer, ["admin"]);
  const request = state.leaveRequests.find((item) => item.id === payload.requestId);
  if (!request || request.status !== "pending") throw new Error("该请假申请无法处理");
  request.status = "rejected";
  request.rejectReason = String(payload.reason || "").trim();
  request.reviewedAt = new Date().toISOString();
  request.reviewedBy = viewer.account;
  return { message: "已拒绝请假申请", request };
}

function createMakeupSchedule(state, viewer, payload) {
  assertRole(viewer, ["admin"]);
  const credit = state.makeupCredits.find((item) => item.id === payload.creditId);
  if (!credit || credit.status !== "available") throw new Error("补课额度不可用");
  const member = state.members.find((item) => item.id === credit.memberId);
  if (!member) throw new Error("学员不存在");
  const schedule = {
    id: newId("schedule"),
    lessonDate: String(payload.lessonDate || "").trim(),
    lessonTime: String(payload.lessonTime || "").trim(),
    campus: String(payload.campus || credit.campus || member.campus || "").trim(),
    coach: String(payload.coach || credit.coach || member.coach || "").trim(),
    memberId: member.id,
    memberName: member.chineseName,
    attended: false,
    lessonStatus: "pending",
    source: "makeup_credit",
    makeupCreditId: credit.id
  };
  if (!schedule.lessonDate || !schedule.lessonTime || !schedule.campus || !schedule.coach) {
    throw new Error("日期、时间、校区、教练不能为空");
  }
  Object.assign(schedule, verificationPatch(schedule));
  state.schedules.push(schedule);
  credit.status = "scheduled";
  credit.makeupScheduleId = schedule.id;
  credit.scheduledAt = new Date().toISOString();
  return { message: "补课排课已创建", schedule };
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
  const duplicate = state.availabilitySlots.find((item) =>
    item.slotDate === slot.slotDate &&
    item.slotTime === slot.slotTime &&
    item.campus === slot.campus &&
    item.coach === slot.coach &&
    ["draft", "published"].indexOf(item.status) >= 0
  );
  if (duplicate) return { message: "该教练同一时间已存在，无需重复发布", slot: duplicate, skipped: true };
  state.availabilitySlots.push(slot);
  return { message: viewer.role === "admin" ? "可预约时间已发布" : "空余时间已提交，等待管理员发布", slot };
}

function createAvailabilitySlots(state, viewer, payload) {
  assertRole(viewer, ["admin", "coach"]);
  const rows = Array.isArray(payload.slots) ? payload.slots : [];
  const created = [];
  let skipped = 0;
  rows.forEach((row) => {
    const result = createAvailabilitySlot(state, viewer, row);
    if (result.skipped) skipped += 1;
    else created.push(result.slot);
  });
  if (!created.length && !skipped) throw new Error("没有可提交的空余时间");
  const actionText = viewer.role === "admin" ? "发布" : "提交";
  const skippedText = skipped ? "，跳过 " + skipped + " 个重复时间" : "";
  return { message: "已" + actionText + " " + created.length + " 个时间" + skippedText, slots: created, skipped };
}

function publishAvailabilitySlot(state, viewer, payload) {
  assertRole(viewer, ["admin"]);
  const slot = state.availabilitySlots.find((item) => item.id === payload.slotId);
  if (!slot) throw new Error("空余时间不存在");
  slot.status = "published";
  slot.publishOrder = Number(payload.publishOrder || slot.publishOrder || 100);
  return { message: "已发布可预约时间", slot };
}

function closeAvailabilitySlot(state, viewer, payload) {
  assertRole(viewer, ["admin"]);
  const slot = state.availabilitySlots.find((item) => item.id === payload.slotId);
  if (!slot) throw new Error("可预约时间不存在");
  if (slot.status === "closed") return { message: "该时间已经关闭", slot };
  slot.status = "closed";
  slot.closedAt = new Date().toISOString();
  slot.closedBy = viewer.account;
  return { message: "已停止继续预约，已有学员课程不受影响", slot };
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
  Object.assign(schedule, verificationPatch(schedule));
  state.schedules.push(schedule);
  return { message: "管理员手动排课已创建", schedule };
}

function cancelSchedule(state, viewer, payload) {
  assertRole(viewer, ["admin"]);
  const schedule = state.schedules.find((item) => item.id === payload.scheduleId);
  if (!schedule) throw new Error("排课不存在");
  if (schedule.lessonStatus === "completed") throw new Error("已完成课程不能直接取消，请先走撤销消课");
  schedule.lessonStatus = "cancelled";
  schedule.cancelReason = String(payload.reason || "").trim();
  schedule.cancelledAt = new Date().toISOString();
  schedule.cancelledBy = viewer.account;
  return { message: "排课已取消", schedule };
}

function createCourseApplication(state, viewer, payload) {
  assertRole(viewer, ["student"]);
  const member = state.members.find((item) => item.id === viewer.memberId);
  const product = state.courseProducts.find((item) => item.id === payload.productId) || state.courseProducts[0];
  if (!member || !product) throw new Error("申请信息不完整");
  if (state.courseApplications.some((item) => item.memberId === member.id && item.status === "pending")) {
    throw new Error("已有续课申请等待老板处理，请勿重复提交");
  }
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

function approveCourseApplication(state, viewer, payload) {
  assertRole(viewer, ["admin"]);
  const application = state.courseApplications.find((item) => item.id === payload.applicationId);
  if (!application || application.status !== "pending") throw new Error("该课程申请无法处理");
  const member = state.members.find((item) => item.id === application.memberId);
  if (!member) throw new Error("找不到申请学员");
  const product = state.courseProducts.find((item) => item.id === application.productId) || {};
  member.productId = product.id || application.productId || member.productId;
  member.productName = product.name || application.productName || member.productName;
  member.productType = product.type || member.productType || "class_pack";
  member.totalLessons = Number(payload.totalLessons || product.totalLessons || member.totalLessons || 0);
  member.updatedAt = new Date().toISOString();
  application.status = "approved";
  application.reviewedAt = new Date().toISOString();
  application.reviewedBy = viewer.account;
  return { message: "已通过课程申请并更新学员课程", application, member };
}

function rejectCourseApplication(state, viewer, payload) {
  assertRole(viewer, ["admin"]);
  const application = state.courseApplications.find((item) => item.id === payload.applicationId);
  if (!application || application.status !== "pending") throw new Error("该课程申请无法处理");
  application.status = "rejected";
  application.rejectReason = String(payload.reason || "").trim();
  application.reviewedAt = new Date().toISOString();
  application.reviewedBy = viewer.account;
  return { message: "已拒绝课程申请", application };
}

function call(action, payload) {
  const state = loadState();

  if (action === "login") return login(payload || {});
  if (action === "loginByPhone") return loginByPhone(payload || {});
  if (action === "loginForTest") return loginForTest(payload || {});
  if (action === "registrationContext") {
    const result = registrationContext(state, payload || {});
    saveState(state);
    return clone(result);
  }
  if (action === "submitRegistration") {
    const result = submitRegistration(state, payload || {});
    saveState(state);
    return clone(result);
  }
  if (action === "resetMock") {
    const fresh = initialState();
    saveState(fresh);
    return { message: "mock 数据已重置" };
  }

  const viewer = accountBySession(state, payload && payload.session);
  if (!viewer) throw new Error("登录已过期，请重新登录");

  let result;
  if (action === "getHomeData") result = homeData(state, viewer);
  else if (action === "consumptionHomeData") result = consumptionHomeData(state, viewer);
  else if (action === "dailyCoachCode") result = dailyCoachCode(state, viewer, payload);
  else if (action === "registrationAdminData") result = registrationAdminData(state, viewer, payload);
  else if (action === "rotateRegistrationInvite") result = rotateRegistrationInvite(state, viewer, payload);
  else if (action === "reviewRegistration") result = reviewRegistration(state, viewer, payload);
  else if (action === "checkinContext") result = checkinContext(state, viewer, payload);
  else if (action === "confirmDailyCheckin") result = confirmDailyCheckin(state, viewer, payload);
  else if (action === "bindMemberGuardian") result = bindMemberGuardian(state, viewer, payload);
  else if (action === "reverseConsumption") result = reverseConsumption(state, viewer, payload);
  else if (action === "adjustConsumption") result = adjustConsumption(state, viewer, payload);
  else if (action === "manualConsumption") result = manualConsumption(state, viewer, payload);
  else if (action === "addMemberLessons") result = addMemberLessons(state, viewer, payload);
  else if (action === "listPagedData") result = listPagedData(state, viewer, payload);
  else if (action === "saveMember") result = saveMember(state, viewer, payload);
  else if (action === "bulkImportMembers") result = bulkImportMembers(state, viewer, payload);
  else if (action === "saveAccount") result = saveAccount(state, viewer, payload);
  else if (action === "resetAccountPassword") result = resetAccountPassword(state, viewer, payload);
  else if (action === "changeMyPassword") result = changeMyPassword(state, viewer, payload);
  else if (action === "unbindAccountWechat") result = unbindAccountWechat(state, viewer, payload);
  else if (action === "saveWeeklyAvailabilityTemplate") result = saveWeeklyAvailabilityTemplate(state, viewer, payload);
  else if (action === "createBookingRequest") result = createBookingRequest(state, viewer, payload);
  else if (action === "updateBookingRequestMatch") result = updateBookingRequestMatch(state, viewer, payload);
  else if (action === "approveBookingRequest") result = approveBookingRequest(state, viewer, payload);
  else if (action === "rejectBookingRequest") result = rejectBookingRequest(state, viewer, payload);
  else if (action === "cancelBookingRequest") result = cancelBookingRequest(state, viewer, payload);
  else if (action === "markAttendance") result = markAttendance(state, viewer, payload);
  else if (action === "verifyScheduleQr") result = verifyScheduleQr(state, viewer, payload);
  else if (action === "submitLessonFeedback") result = submitLessonFeedback(state, viewer, payload);
  else if (action === "createLeaveRequest") result = createLeaveRequest(state, viewer, payload);
  else if (action === "approveLeaveRequest") result = approveLeaveRequest(state, viewer, payload);
  else if (action === "rejectLeaveRequest") result = rejectLeaveRequest(state, viewer, payload);
  else if (action === "createMakeupSchedule") result = createMakeupSchedule(state, viewer, payload);
  else if (action === "cancelSchedule") result = cancelSchedule(state, viewer, payload);
  else if (action === "approveCourseApplication") result = approveCourseApplication(state, viewer, payload);
  else if (action === "rejectCourseApplication") result = rejectCourseApplication(state, viewer, payload);
  else if (action === "createAvailabilitySlot") result = createAvailabilitySlot(state, viewer, payload);
  else if (action === "createAvailabilitySlots") result = createAvailabilitySlots(state, viewer, payload);
  else if (action === "publishAvailabilitySlot") result = publishAvailabilitySlot(state, viewer, payload);
  else if (action === "closeAvailabilitySlot") result = closeAvailabilitySlot(state, viewer, payload);
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
