const cloud = require("wx-server-sdk");
const crypto = require("crypto");
const rules = require("./rules");
const auth = require("./auth");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const TEST_LOGIN_ENABLED = process.env.YE_SWIM_ENABLE_TEST_LOGIN === "true";
const DEV_TEST_PHONE = rules.normalizePhone(process.env.YE_SWIM_TEST_PHONE || "");
const ALLOW_ADMIN_BOOTSTRAP = auth.envFlag(process.env, "YE_SWIM_ALLOW_ADMIN_BOOTSTRAP");
const SEED_IMPORT_ENABLED = auth.envFlag(process.env, "YE_SWIM_ENABLE_SEED_IMPORT");
const PASSWORD_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PASSWORD_SESSION_LIMIT = 5;

function ok(data) {
  return { ok: true, data };
}

function fail(error) {
  return { ok: false, message: error && error.message ? error.message : "操作失败" };
}

function nowIso() {
  return new Date().toISOString();
}

function verificationPatch(schedule) {
  const code = rules.verificationCodeForSchedule(schedule);
  return {
    verificationCode: code,
    verificationPayload: rules.verificationPayload(code),
    verificationExpiresAt: rules.verificationExpiresAt(schedule.lessonDate)
  };
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(String(password), salt, 120000, 32, "sha256").toString("hex");
}

function defaultPasswordForRole(role) {
  return role === "admin" ? "1324" : "1234";
}

function withId(doc) {
  if (!doc) return doc;
  const result = Object.assign({}, doc);
  if (result._id) {
    if (result.id && result.id !== result._id) result.businessId = result.id;
    result.id = result._id;
  }
  return result;
}

function decorateVerification(doc) {
  const schedule = withId(doc);
  const patch = verificationPatch(schedule);
  const status = rules.verificationStatus(Object.assign({}, schedule, patch));
  return Object.assign({}, schedule, patch, {
    verificationStatus: status,
    verificationStatusText: status === "verified" ? "已核销" : status === "expired" ? "已过期" : "待核销"
  });
}

function docKey(doc) {
  return doc && (doc._id || doc.id);
}

function sameKey(a, b) {
  return String(a || "") === String(b || "");
}

function uniqueValues(values) {
  const seen = {};
  return (values || [])
    .filter((value) => value !== undefined && value !== null && String(value).trim() !== "")
    .map((value) => String(value))
    .filter((value) => {
      if (seen[value]) return false;
      seen[value] = true;
      return true;
    });
}

function anyFieldQuery(field, values) {
  const ids = uniqueValues(values);
  if (!ids.length) return { [field]: "__never__" };
  if (ids.length === 1) return { [field]: ids[0] };
  return { [field]: _.in(ids) };
}

function rawDocKeys(doc, fallback) {
  if (!doc) return uniqueValues([fallback]);
  return uniqueValues([doc._id, doc.id, doc.businessId, fallback]);
}

function stripPrivateDocFields(doc) {
  const result = Object.assign({}, doc);
  delete result._id;
  delete result.id;
  delete result.businessId;
  return result;
}

async function findByAnyId(collection, id, limit) {
  const value = String(id || "").trim();
  if (!value) return [];
  const result = await list(collection, _.or([{ _id: value }, { id: value }]), limit || 1);
  return result;
}

async function findOneByAnyId(collection, id) {
  return (await findByAnyId(collection, id, 1))[0] || null;
}

function safeAccount(account) {
  const result = withId(account);
  result.wechatBound = result.role === "admin" ? false : Boolean(result.openid);
  delete result.passwordHash;
  delete result.passwordSalt;
  delete result.passwordSessions;
  delete result.openid;
  return result;
}

function createPasswordSession(account) {
  const token = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  const activeSessions = (Array.isArray(account.passwordSessions) ? account.passwordSessions : [])
    .filter((session) => Date.parse(session && session.expiresAt || "") > now)
    .slice(-(PASSWORD_SESSION_LIMIT - 1));
  activeSessions.push({
    tokenHash: auth.hashSessionToken(token),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + PASSWORD_SESSION_TTL_MS).toISOString()
  });
  return { token, sessions: activeSessions };
}

async function getAccountByName(accountName) {
  const result = await db.collection("accounts").where({
    account: rules.normalizeAccount(accountName),
    status: _.neq("disabled")
  }).limit(1).get();
  const account = result.data[0] || null;
  if (!account) return null;
  if (account.role === "student" && account.memberId) {
    const member = await findOneByAnyId("members", account.memberId).catch(() => null);
    if (member && member._id && account.memberId !== member._id) {
      account.businessMemberId = account.memberId;
      account.memberId = member._id;
    }
  }
  return account;
}

async function getPhoneNumberFromCode(code) {
  const value = String(code || "").trim();
  if (!value) return "";
  if (!cloud.openapi || !cloud.openapi.phonenumber || !cloud.openapi.phonenumber.getPhoneNumber) {
    throw new Error("当前云环境暂不支持微信手机号验证");
  }
  const result = await cloud.openapi.phonenumber.getPhoneNumber({ code: value });
  return rules.normalizePhone(result && result.phoneInfo && result.phoneInfo.phoneNumber);
}

async function getAccountByPhone(phone) {
  const normalizedPhone = rules.normalizePhone(phone);
  if (!rules.isChinaMobile(normalizedPhone)) throw new Error("请输入正确的 11 位手机号");
  const result = await db.collection("accounts").where({
    phone: normalizedPhone,
    status: _.neq("disabled")
  }).limit(2).get();
  const matches = result.data || [];
  if (matches.length > 1) throw new Error("该手机号绑定了多个账号，请联系老板处理");
  const account = matches[0] || null;
  if (!account) return null;
  if (account.role === "student" && account.memberId) {
    const member = await findOneByAnyId("members", account.memberId).catch(() => null);
    if (member && member._id && account.memberId !== member._id) {
      account.businessMemberId = account.memberId;
      account.memberId = member._id;
    }
  }
  return account;
}

async function getAccountBySession(session, wxContext) {
  if (!session || !session.account) return null;
  const account = await getAccountByName(session.account);
  if (!account) return null;
  if (TEST_LOGIN_ENABLED && DEV_TEST_PHONE && session.testLogin && session.testPhone === DEV_TEST_PHONE) return account;
  if (account.role === "admin") {
    return auth.isPasswordSessionValid(account, session.authToken) ? account : null;
  }
  return auth.isWechatSessionBound(account, wxContext) ? account : null;
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

function isMissingCollectionError(error) {
  const message = String(error && (error.errMsg || error.message || error));
  return /collection.*not.*exist|DATABASE_COLLECTION_NOT_EXIST|db\.collection|不存在/i.test(message);
}

async function createCollectionIfNeeded(collection) {
  if (typeof db.createCollection !== "function") return;
  try {
    await db.createCollection(collection);
  } catch (error) {
    if (!/exist|存在|already/i.test(String(error && (error.errMsg || error.message || error)))) {
      throw error;
    }
  }
}

async function addRows(collection, rows) {
  if (!rows || !rows.length) return;
  await createCollectionIfNeeded(collection);
  await Promise.all(rows.map((row) => {
    const docId = row._id || row.id;
    const data = stripPrivateDocFields(row);
    if (docId) {
      return db.collection(collection).doc(docId).set({ data });
    } else {
      return db.collection(collection).add({ data });
    }
  }));
}

const seedCollectionOrder = [
  "accounts",
  "courseProducts",
  "members",
  "schedules",
  "attendanceLogs",
  "availabilitySlots",
  "bookingRequests",
  "courseApplications",
  "leaveRequests",
  "makeupCredits",
  "lessonFeedbacks",
  "auditLogs"
];

async function repairStudentMemberLinks() {
  const studentAccounts = await list("accounts", { role: "student" }, 1500);
  for (const account of studentAccounts) {
    if (!account.memberId) continue;
    const linked = await findOneByAnyId("members", account.memberId);
    if (!linked || linked._id === account.memberId) continue;
    await db.collection("accounts").doc(docKey(account)).update({
      data: {
        memberId: docKey(linked),
        businessMemberId: account.memberId,
        updatedAt: nowIso()
      }
    });
  }
}

function seedSecretOk(payload) {
  const expected = process.env.YE_SWIM_SEED_SECRET;
  return Boolean(expected && payload && auth.safeEqual(payload.seedSecret, expected));
}

function assertSeedSecret(payload) {
  if (!SEED_IMPORT_ENABLED) throw new Error("种子数据导入未开启");
  if (!seedSecretOk(payload)) throw new Error("种子数据导入密钥不正确");
}

function assertSeedCollection(collection) {
  if (seedCollectionOrder.indexOf(collection) === -1) throw new Error("不允许导入该集合：" + collection);
}

async function seedClearCollection(payload) {
  assertSeedSecret(payload);
  const collection = String(payload.collection || "").trim();
  assertSeedCollection(collection);
  await createCollectionIfNeeded(collection);
  const limit = Math.min(Math.max(Number(payload.limit || 30), 1), 80);
  let removed = 0;
  for (;;) {
    const rows = await list(collection, {}, limit).catch((error) => {
      if (isMissingCollectionError(error)) return [];
      throw error;
    });
    if (!rows.length) break;
    await Promise.all(rows.map((row) => {
      const key = docKey(row);
      return key ? db.collection(collection).doc(key).remove() : Promise.resolve();
    }));
    removed += rows.length;
    if (!payload.all) break;
  }
  return { message: "已清理 " + collection + " " + removed + " 条", removed, collection };
}

async function seedImportBatch(payload) {
  assertSeedSecret(payload);
  const collection = String(payload.collection || "").trim();
  assertSeedCollection(collection);
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  if (!rows.length) return { message: collection + " 没有数据需要导入", imported: 0, collection };
  if (rows.length > 80) throw new Error("单批导入最多 80 条");
  await addRows(collection, rows);
  return { message: "已导入 " + collection + " " + rows.length + " 条", imported: rows.length, collection };
}

async function seedFinalize(payload) {
  assertSeedSecret(payload);
  await addRows("auditLogs", [
    {
      _id: "audit-seed-" + String(payload.seedVersion || "manual").replace(/[^a-zA-Z0-9_-]/g, "-"),
      action: "seed_applied",
      seedVersion: String(payload.seedVersion || "manual"),
      source: String(payload.source || "local-script"),
      stats: payload.stats || {},
      replaceExisting: true,
      createdAt: nowIso()
    }
  ]);
  return { message: "初始化数据已完成", seedVersion: payload.seedVersion || "manual" };
}

async function ensureAdminAccount(accountName, password) {
  if (accountName !== "yeats" || String(password || "") !== "1324") return;
  await createCollectionIfNeeded("accounts");
  const existing = (await list("accounts", { account: "yeats" }, 1).catch((error) => {
    if (isMissingCollectionError(error)) return [];
    throw error;
  }))[0];
  if (existing || !ALLOW_ADMIN_BOOTSTRAP) return;
  const passwordSalt = crypto.randomBytes(16).toString("hex");
  const adminPatch = {
    account: "yeats",
    role: "admin",
    fullName: "叶管理员",
    campus: "",
    coachName: "",
    memberId: "",
    status: "active",
    passwordSalt,
    passwordHash: hashPassword("1324", passwordSalt),
    updatedAt: nowIso()
  };
  await db.collection("accounts").add({ data: Object.assign({}, adminPatch, { openid: null, createdAt: nowIso() }) });
}

async function login(payload, wxContext) {
  const loginId = String(payload.account || "").trim();
  const accountName = rules.normalizeAccount(loginId);
  const isPhoneLoginId = rules.isChinaMobile(loginId);
  let adminPhoneToBind = "";
  if (!isPhoneLoginId) await ensureAdminAccount(accountName, payload.password);
  let account = await (isPhoneLoginId ? getAccountByPhone(loginId) : getAccountByName(accountName)).catch(async (error) => {
    if (!isMissingCollectionError(error)) throw error;
    return null;
  });
  if (!account && isPhoneLoginId) {
    await ensureAdminAccount("yeats", payload.password);
    const admin = await getAccountByName("yeats");
    if (!admin) throw new Error("账号或密码错误");
    const adminPasswordOk = hashPassword(payload.password || "", admin.passwordSalt) === admin.passwordHash;
    if (!adminPasswordOk) throw new Error("账号或密码错误");
    if (admin.phone && admin.phone !== rules.normalizePhone(loginId)) throw new Error("老板账号已绑定其他手机号");
    adminPhoneToBind = rules.normalizePhone(loginId);
    account = Object.assign({}, admin, { phone: adminPhoneToBind, loginMode: "password" });
  }
  if (!account) throw new Error("账号或密码错误");
  if (account.role !== "admin") throw new Error("教练和学员请使用手机号验证登录");

  const hashed = hashPassword(payload.password || "", account.passwordSalt);
  if (hashed !== account.passwordHash) throw new Error("账号或密码错误");

  const role = isPhoneLoginId ? account.role : rules.roleFromAccount(accountName);
  if (!role || role !== account.role) throw new Error("账号角色配置不正确");
  const passwordSession = createPasswordSession(account);
  const loginPatch = {
    openid: null,
    bindingStatus: "",
    passwordSessions: passwordSession.sessions,
    lastLoginAt: nowIso(),
    updatedAt: nowIso()
  };
  if (adminPhoneToBind) {
    loginPatch.phone = adminPhoneToBind;
    loginPatch.loginMode = "password";
  }
  await db.collection("accounts").doc(account._id).update({ data: loginPatch });

  const session = safeAccount(Object.assign({}, account, loginPatch));
  session.authMethod = "password";
  session.authToken = passwordSession.token;
  return {
    session,
    message: "登录成功"
  };
}

async function loginByPhone(payload, wxContext) {
  const currentOpenid = auth.wxOpenid(wxContext);
  if (!currentOpenid) throw new Error("无法识别当前微信，请退出后重试");
  const expectedPhone = rules.normalizePhone(payload.phone);
  const phone = await getPhoneNumberFromCode(payload.phoneCode || payload.code);
  if (!rules.isChinaMobile(phone)) throw new Error("微信没有返回有效手机号，请重新授权");
  if (expectedPhone && !auth.verifiedPhoneMatches(expectedPhone, phone)) {
    throw new Error("微信授权手机号与输入号码不一致，请使用老板登记的手机号");
  }
  const account = await getAccountByPhone(phone);
  if (!account) throw new Error("该手机号未开通账号，请联系老板绑定");
  if (account.openid && account.openid !== wxContext.OPENID) throw new Error("该手机号账号已经绑定其他微信");

  const patch = {
    openid: currentOpenid,
    phoneVerifiedAt: nowIso(),
    bindingStatus: "bound",
    loginMode: "phone",
    lastLoginAt: nowIso(),
    updatedAt: nowIso()
  };
  await db.collection("accounts").doc(account._id).update({ data: patch });

  return {
    session: safeAccount(Object.assign({}, account, patch)),
    message: "手机号验证成功，已绑定当前微信"
  };
}

async function loginForTest(payload) {
  if (!TEST_LOGIN_ENABLED || !DEV_TEST_PHONE) throw new Error("测试登录未开启");
  const phone = rules.normalizePhone(payload.phone);
  if (phone !== DEV_TEST_PHONE) throw new Error("测试手机号不正确");
  const role = String(payload.role || "").trim();
  const accountName = role === "admin" ? "yeats" : role === "coach" ? "jl001" : role === "student" ? "xy001" : "";
  if (!accountName) throw new Error("请选择测试角色");
  if (role === "admin") await ensureAdminAccount("yeats", "1324");
  const account = await getAccountByName(accountName);
  if (!account) throw new Error("测试账号不存在，请先初始化数据");
  return {
    session: Object.assign(safeAccount(account), {
      testLogin: true,
      testPhone: phone
    }),
    message: "测试登录成功"
  };
}

async function memberViews(viewer) {
  let memberQuery = {};
  let members;
  let memberKeys = [];
  if (viewer.role === "student") {
    const linkedIds = uniqueValues([].concat(viewer.memberIds || [], viewer.memberId || []));
    members = (await Promise.all(linkedIds.map((id) => findOneByAnyId("members", id)))).filter(Boolean);
    members.forEach((member) => rawDocKeys(member).forEach((key) => memberKeys.push(key)));
  }

  const [loadedMembers, attendanceLogs] = await Promise.all([
    members ? Promise.resolve(members) : list("members", memberQuery, 1500),
    list("attendanceLogs", viewer.role === "student" ? anyFieldQuery("memberId", memberKeys) : {}, 1500)
  ]);
  const usedByMember = {};
  attendanceLogs.forEach((log) => {
    if (log.status === "reversed" || log.reversedAt) return;
    const deducted = Number(log.lessonsDeducted);
    // V1 的月卡历史流水可能记录为 0；V2 统一按实际到课一节保留历史课时。
    const normalizedLessons = deducted > 0 ? deducted : 1;
    usedByMember[log.memberId] = (usedByMember[log.memberId] || 0) + normalizedLessons;
  });

  return loadedMembers.map((member) => {
    const key = docKey(member);
    const usedLessons = rawDocKeys(member).reduce((sum, id) => sum + Number(usedByMember[id] || 0), 0);
    const balance = rules.memberStatus(member, usedLessons);
    return Object.assign({}, member, {
      id: key,
      businessId: member.id && member._id && member.id !== member._id ? member.id : member.businessId,
      usedLessons,
      remainingLessons: balance.remaining,
      status: balance.status
    });
  });
}

async function schedulesFor(viewer) {
  let query = {};
  if (viewer.role === "coach") query = { coach: viewer.coachName };
  if (viewer.role === "student") {
    const member = await findOneByAnyId("members", viewer.memberId);
    query = anyFieldQuery("memberId", rawDocKeys(member, viewer.memberId));
  }
  const schedules = await list("schedules", query, 1500);
  return schedules.map(decorateVerification);
}

async function availabilityFor(viewer) {
  let query = {};
  if (viewer.role === "coach") query = { coach: viewer.coachName };
  if (viewer.role === "student") {
    query = {
      status: "published",
      slotDate: _.gte(rules.minStudentBookingDate())
    };
  }
  const slots = await list("availabilitySlots", query, 1000);
  return slots.map(withId);
}

function dateInLastDays(value, days) {
  const diff = rules.daysFromToday(value);
  return diff <= 0 && diff > -Number(days || 7);
}

function buildDashboard(viewer, data, days) {
  if (!viewer || viewer.role !== "admin") return {};
  const windowDays = Number(days || 7);
  const schedules = data.schedules || [];
  const attendanceLogs = data.attendanceLogs || [];
  const courseApplications = data.courseApplications || [];
  const leaveRequests = data.leaveRequests || [];
  const makeupCredits = data.makeupCredits || [];
  const completed = schedules.filter((item) => item.lessonStatus === "completed" && dateInLastDays(item.lessonDate, windowDays));
  const deducted = attendanceLogs.filter((item) => dateInLastDays(item.attendanceDate, windowDays));
  const byCoach = {};
  completed.forEach((item) => {
    const key = item.coach || "未分配";
    byCoach[key] = byCoach[key] || { coach: key, completed: 0, deducted: 0 };
    byCoach[key].completed += 1;
  });
  deducted.forEach((item) => {
    const key = item.coach || "未分配";
    byCoach[key] = byCoach[key] || { coach: key, completed: 0, deducted: 0 };
    byCoach[key].deducted += Number(item.lessonsDeducted || 0);
  });
  return {
    days: windowDays,
    completedLessons: completed.length,
    deductedLessons: deducted.reduce((sum, item) => sum + Number(item.lessonsDeducted || 0), 0),
    pendingApplications: courseApplications.filter((item) => item.status === "pending").length,
    pendingLeaves: leaveRequests.filter((item) => item.status === "pending").length,
    pendingMakeups: makeupCredits.filter((item) => item.status === "available").length,
    coachRanking: Object.keys(byCoach)
      .map((key) => byCoach[key])
      .sort((a, b) => b.completed - a.completed || b.deducted - a.deducted)
      .slice(0, 8)
  };
}

async function weeklyAvailabilityTemplateFor(viewer) {
  if (viewer.role !== "admin") return { configured: false, rows: [] };
  const rows = await list("settings", { key: "weeklyAvailabilityTemplate" }, 1).catch((error) => {
    if (isMissingCollectionError(error)) return [];
    throw error;
  });
  const setting = rows[0];
  return {
    configured: Boolean(setting),
    rows: setting && Array.isArray(setting.rows) ? setting.rows : []
  };
}

function normalizeWeeklyAvailabilityRows(rows) {
  if (!Array.isArray(rows)) throw new Error("每周模板格式不正确");
  if (rows.length > 100) throw new Error("每周模板最多 100 条");
  return rows.map((row, index) => {
    const weekday = Number(row.weekday);
    const slotTime = String(row.slotTime || "").trim();
    const campus = String(row.campus || "").trim();
    const coach = String(row.coach || "").trim();
    if ([0, 1, 2, 3, 4, 5, 6].indexOf(weekday) === -1 || !slotTime || !campus || !coach) {
      throw new Error("第 " + (index + 1) + " 条每周模板不完整");
    }
    return {
      id: String(row.id || "weekly-" + index),
      weekday,
      weekdayLabel: String(row.weekdayLabel || ""),
      slotTime,
      campus,
      coach,
      capacity: Math.max(1, Math.min(50, Number(row.capacity || 1)))
    };
  });
}

async function saveWeeklyAvailabilityTemplate(viewer, payload) {
  assertRole(viewer, ["admin"]);
  const rows = normalizeWeeklyAvailabilityRows(payload.rows || payload.templates || []);
  await createCollectionIfNeeded("settings");
  await db.collection("settings").doc("weekly-availability-template").set({
    data: {
      key: "weeklyAvailabilityTemplate",
      rows,
      updatedBy: viewer.account,
      updatedAt: nowIso()
    }
  });
  return { message: "每周模板已同步", rows };
}

async function getHomeData(viewer) {
  const studentMember = viewer.role === "student" ? await findOneByAnyId("members", viewer.memberId) : null;
  const studentMemberKeys = rawDocKeys(studentMember, viewer.memberId);
  const [members, schedules, attendanceLogs, availabilitySlots, bookingRequests, courseApplications, courseProducts, accounts, leaveRequests, makeupCredits, lessonFeedbacks, weeklyAvailabilityTemplate] =
    await Promise.all([
      memberViews(viewer),
      schedulesFor(viewer),
      list(
        "attendanceLogs",
        viewer.role === "student" ? anyFieldQuery("memberId", studentMemberKeys) : viewer.role === "coach" ? { coach: viewer.coachName } : {},
        1500
      ),
      availabilityFor(viewer),
      list(
        "bookingRequests",
        viewer.role === "student" ? anyFieldQuery("memberId", studentMemberKeys) : viewer.role === "coach" ? { coach: viewer.coachName } : {},
        1000
      ),
      viewer.role === "coach" ? [] : list("courseApplications", viewer.role === "student" ? anyFieldQuery("memberId", studentMemberKeys) : {}, 1000),
      list("courseProducts", {}, 200),
      viewer.role === "admin" ? list("accounts", {}, 1000) : [],
      list(
        "leaveRequests",
        viewer.role === "student" ? anyFieldQuery("memberId", studentMemberKeys) : viewer.role === "coach" ? { coach: viewer.coachName } : {},
        1000
      ).catch((error) => isMissingCollectionError(error) ? [] : Promise.reject(error)),
      list(
        "makeupCredits",
        viewer.role === "student" ? anyFieldQuery("memberId", studentMemberKeys) : viewer.role === "coach" ? { coach: viewer.coachName } : {},
        1000
      ).catch((error) => isMissingCollectionError(error) ? [] : Promise.reject(error)),
      list(
        "lessonFeedbacks",
        viewer.role === "student" ? anyFieldQuery("memberId", studentMemberKeys) : viewer.role === "coach" ? { coach: viewer.coachName } : {},
        1000
      ).catch((error) => isMissingCollectionError(error) ? [] : Promise.reject(error)),
      weeklyAvailabilityTemplateFor(viewer)
    ]);

  let visibleAvailabilitySlots = availabilitySlots;
  if (availabilitySlots.length) {
    const slotKeyValues = [];
    availabilitySlots.forEach((slot) => {
      rawDocKeys(slot).forEach((key) => slotKeyValues.push(key));
    });
    const slotKeys = uniqueValues(slotKeyValues);
    const activeBookings = viewer.role === "student" ? await list(
      "bookingRequests",
      Object.assign(anyFieldQuery("slotId", slotKeys), { status: _.in(["pending", "approved"]) }),
      1500
    ) : bookingRequests.filter((item) => ["pending", "approved"].indexOf(item.status) >= 0);
    const bookedBySlot = {};
    activeBookings.forEach((booking) => {
      bookedBySlot[booking.slotId] = (bookedBySlot[booking.slotId] || 0) + 1;
    });
    visibleAvailabilitySlots = availabilitySlots.map((slot) => {
      const bookedCount = rawDocKeys(slot).reduce((sum, key) => sum + Number(bookedBySlot[key] || 0), 0);
      const capacity = Number(slot.capacity || 1);
      return Object.assign({}, slot, {
        bookedCount,
        left: Math.max(0, capacity - bookedCount)
      });
    });
  }

  return {
    viewer: safeAccount(viewer),
    members,
    schedules,
    attendanceLogs: attendanceLogs.map(withId),
    availabilitySlots: visibleAvailabilitySlots,
    bookingRequests: bookingRequests.map(withId),
    courseApplications: courseApplications.map(withId),
    courseProducts: courseProducts.map(withId),
    leaveRequests: leaveRequests.map(withId),
    makeupCredits: makeupCredits.map(withId),
    lessonFeedbacks: lessonFeedbacks.map(withId),
    dashboard: buildDashboard(viewer, { schedules, attendanceLogs, courseApplications, leaveRequests, makeupCredits }, 7),
    dashboard30: buildDashboard(viewer, { schedules, attendanceLogs, courseApplications, leaveRequests, makeupCredits }, 30),
    weeklyAvailabilityTemplate,
    accounts: accounts.map(safeAccount)
  };
}

async function listPagedData(viewer, payload) {
  const collection = String(payload.collection || "").trim();
  const page = Math.max(1, Number(payload.page || 1));
  const pageSize = Math.min(80, Math.max(1, Number(payload.pageSize || 30)));
  const studentMember = viewer.role === "student" ? await findOneByAnyId("members", viewer.memberId) : null;
  const studentMemberKeys = rawDocKeys(studentMember, viewer.memberId);
  const allowed = ["members", "schedules", "attendanceLogs", "bookingRequests", "lessonFeedbacks"];
  if (allowed.indexOf(collection) === -1) throw new Error("不支持分页读取该集合");
  let query = {};
  if (collection === "members") {
    if (viewer.role === "coach") query = { coach: viewer.coachName };
    if (viewer.role === "student") query = anyFieldQuery("_id", studentMemberKeys);
  }
  if (collection === "schedules" || collection === "bookingRequests" || collection === "lessonFeedbacks") {
    if (viewer.role === "coach") query = { coach: viewer.coachName };
    if (viewer.role === "student") query = anyFieldQuery("memberId", studentMemberKeys);
  }
  if (collection === "attendanceLogs") {
    if (viewer.role === "coach") query = { coach: viewer.coachName };
    if (viewer.role === "student") query = anyFieldQuery("memberId", studentMemberKeys);
  }
  const rows = await list(collection, query, 2000).catch((error) => {
    if (isMissingCollectionError(error)) return [];
    throw error;
  });
  const decorated = collection === "schedules" ? rows.map(decorateVerification) : rows.map(withId);
  const offset = (page - 1) * pageSize;
  return {
    collection,
    page,
    pageSize,
    total: decorated.length,
    items: decorated.slice(offset, offset + pageSize)
  };
}

async function createBookingRequest(viewer, payload) {
  assertRole(viewer, ["student"]);
  const slot = await findOneByAnyId("availabilitySlots", payload.slotId);
  if (!slot || slot.status !== "published") throw new Error("该时间暂不可预约");
  if (!rules.isBookableSlot(slot.slotDate, slot.slotTime)) throw new Error("该时间已经不可预约");

  const member = await findOneByAnyId("members", viewer.memberId);
  if (!member) throw new Error("找不到绑定学员");

  const slotKeys = rawDocKeys(slot, payload.slotId);
  const memberKeys = rawDocKeys(member, viewer.memberId);
  const slotKey = docKey(slot);
  const memberKey = docKey(member);
  const active = await list("bookingRequests", Object.assign(anyFieldQuery("slotId", slotKeys), { status: _.in(["pending", "approved"]) }), 100);
  if (active.length >= Number(slot.capacity || 1)) throw new Error("该时间名额已满");
  if (active.some((item) => memberKeys.some((key) => sameKey(item.memberId, key)))) throw new Error("你已经提交过该时间的预约");

  const request = {
    slotId: slotKey,
    memberId: memberKey,
    memberName: member.chineseName,
    slotDate: slot.slotDate,
    slotTime: slot.slotTime,
    campus: slot.campus,
    coach: slot.coach,
    productId: String(payload.productId || member.productId || "").trim(),
    productName: String(payload.productName || member.productName || "").trim(),
    status: "pending",
    note: String(payload.note || "").trim(),
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  const result = await db.collection("bookingRequests").add({ data: request });
  return {
    message: "已生成课程草稿，等待老板发布",
    request: Object.assign({ id: result._id }, request)
  };
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
  const totalLessons = raw.totalLessons !== undefined && raw.totalLessons !== "" ? Number(raw.totalLessons) : current ? Number(current.totalLessons || 0) : 0;
  return Object.assign({}, current || {}, {
    productId: current && current.productId || "",
    productName: current && current.productName || "",
    productType: current && current.productType || "",
    totalLessons: Number.isFinite(totalLessons) ? totalLessons : 0,
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
  const current = id ? await findOneByAnyId("members", id) : null;
  if (current && current.phoneLocked && raw.phone !== undefined && rules.normalizePhone(raw.phone) !== rules.normalizePhone(current.phone)) {
    throw new Error("该手机号来自微信验证，不能修改");
  }
  const member = await memberPayload(raw, current);
  if (!member.chineseName) throw new Error("学员姓名不能为空");
  if (!Number.isFinite(Number(member.totalLessons)) || Number(member.totalLessons) < -999 || Number(member.totalLessons) > 99999) throw new Error("总课时应为 -999 至 99999");

  if (current) {
    delete member._id;
    await db.collection("members").doc(docKey(current)).update({ data: member });
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
  if (!role) throw new Error("账号必须是 yeats、jl 开头或 xy 开头");

  const id = String(raw.id || raw._id || "").trim();
  const current = id ? await findOneByAnyId("accounts", id) : null;
  if (current && current.phoneLocked && raw.phone !== undefined && rules.normalizePhone(raw.phone) !== rules.normalizePhone(current.phone)) {
    throw new Error("该手机号来自微信验证，不能修改");
  }
  if (current && current.account !== accountName) {
    throw new Error("已创建账号不能修改账号名，请新建账号");
  }
  const duplicates = await list("accounts", { account: accountName }, 10);
  if (duplicates.some((item) => !sameKey(docKey(item), id))) throw new Error("账号已存在");
  const phone = rules.normalizePhone(raw.phone || current && current.phone || "");
  if (phone && !rules.isChinaMobile(phone)) throw new Error("手机号必须是 11 位大陆手机号");
  if (role !== "admin" && !phone) throw new Error("教练和学员账号需要绑定手机号");
  if (phone) {
    const phoneDuplicates = await list("accounts", { phone }, 10);
    if (phoneDuplicates.some((item) => !sameKey(docKey(item), id))) throw new Error("手机号已绑定其他账号");
  }

  let memberId = raw.memberId || current && current.memberId || "";
  if (role === "student") {
    const memberName = String(raw.memberName || raw.fullName || "").trim();
    const members = memberId ? await findByAnyId("members", memberId, 10) : await list("members", { chineseName: memberName }, 10);
    const member = members[0];
    if (!member) throw new Error("学员账号需要填写已存在的学员姓名");
    memberId = docKey(member);
  }

  const phoneChanged = Boolean(current && role !== "admin" && phone !== String(current.phone || ""));
  const account = {
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
    updatedAt: nowIso()
  };
  if (phoneChanged) account.openid = null;
  if (role === "coach" && !account.coachName) throw new Error("教练账号需要填写教练名");

  const adminPasswordChanged = Boolean(
    current &&
    role === "admin" &&
    raw.password &&
    hashPassword(String(raw.password), current.passwordSalt) !== current.passwordHash
  );
  if (role === "admin" && (!current || adminPasswordChanged)) {
    account.passwordSalt = crypto.randomBytes(16).toString("hex");
    account.passwordHash = hashPassword(String(raw.password || defaultPasswordForRole(role)), account.passwordSalt);
    account.passwordSessions = [];
  }

  if (current) {
    await db.collection("accounts").doc(docKey(current)).update({ data: account });
    return { message: "账号已保存", account: safeAccount(Object.assign({}, current, account)) };
  }

  account.openid = null;
  account.createdAt = nowIso();
  const result = await db.collection("accounts").add({ data: account });
  return { message: "账号已新增", account: safeAccount(Object.assign({ _id: result._id }, account)) };
}

async function resetAccountPassword(viewer, payload) {
  assertRole(viewer, ["admin"]);
  const id = String(payload.id || payload.accountId || "").trim();
  const accountName = rules.normalizeAccount(payload.account);
  const account = id ? await findOneByAnyId("accounts", id) : (await list("accounts", { account: accountName }, 1))[0];
  if (!account) throw new Error("账号不存在");
  if (account.role !== "admin") throw new Error("教练和学员使用手机号验证，无需重置密码");
  const passwordSalt = crypto.randomBytes(16).toString("hex");
  const plainPassword = defaultPasswordForRole(account.role);
  await db.collection("accounts").doc(account._id).update({
    data: {
      passwordSalt,
      passwordHash: hashPassword(plainPassword, passwordSalt),
      passwordSessions: [],
      updatedAt: nowIso()
    }
  });
  return { message: "密码已重置为系统默认密码", account: safeAccount(account) };
}

async function changeMyPassword(viewer, payload) {
  assertRole(viewer, ["admin"]);
  const oldPassword = String(payload.oldPassword || "");
  const newPassword = String(payload.newPassword || "");
  if (!newPassword || newPassword.length < 4) throw new Error("新密码至少 4 位");
  if (oldPassword === newPassword) throw new Error("新旧密码不能一样");
  const hashed = hashPassword(oldPassword, viewer.passwordSalt);
  if (hashed !== viewer.passwordHash) throw new Error("原密码错误");
  const passwordSalt = crypto.randomBytes(16).toString("hex");
  await db.collection("accounts").doc(viewer._id).update({
    data: {
      passwordSalt,
      passwordHash: hashPassword(newPassword, passwordSalt),
      passwordSessions: [],
      updatedAt: nowIso()
    }
  });
  return { message: "密码已修改，请使用新密码登录" };
}

async function unbindAccountWechat(viewer, payload) {
  assertRole(viewer, ["admin"]);
  const account = await findOneByAnyId("accounts", payload.id || payload.accountId);
  if (!account) throw new Error("账号不存在");
  if (account.role === "admin") throw new Error("老板账号不能在小程序内解除绑定");
  await db.collection("accounts").doc(docKey(account)).update({
    data: {
      openid: null,
      bindingStatus: account.phone ? "pending" : "",
      updatedAt: nowIso()
    }
  });
  return { message: "已解除旧微信绑定，可用已登记手机号重新登录" };
}

async function approveBookingRequest(viewer, payload) {
  assertRole(viewer, ["admin"]);
  const request = await findOneByAnyId("bookingRequests", payload.requestId);
  if (!request || request.status !== "pending") throw new Error("该预约无法审批");
  const slot = await findOneByAnyId("availabilitySlots", request.slotId);
  if (!slot || slot.status !== "published") throw new Error("空余时间不存在或未发布");
  const slotKeys = rawDocKeys(slot, request.slotId);
  const approvedRequests = await list("bookingRequests", Object.assign(anyFieldQuery("slotId", slotKeys), { status: "approved" }), 200);
  if (approvedRequests.length >= Number(slot.capacity || 1)) throw new Error("该时间名额已满");
  const duplicateSchedules = await list("schedules", {
    lessonDate: slot.slotDate,
    lessonTime: slot.slotTime,
    memberId: request.memberId,
    lessonStatus: _.neq("cancelled")
  }, 10);
  if (duplicateSchedules.length) throw new Error("该学员该时间已有排课");

  const schedule = {
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
    bookingRequestId: docKey(request),
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  const result = await db.collection("schedules").add({ data: schedule });
  const patch = verificationPatch(Object.assign({ _id: result._id }, schedule));
  await db.collection("schedules").doc(result._id).update({ data: patch });
  await db.collection("bookingRequests").doc(docKey(request)).update({
    data: {
      status: "approved",
      reviewedAt: nowIso(),
      reviewedBy: viewer.account,
      createdScheduleId: result._id,
      updatedAt: nowIso()
    }
  });
  return { message: "已通过预约并生成排课", schedule: Object.assign({ id: result._id }, schedule, patch) };
}

async function updateBookingRequestMatch(viewer, payload) {
  assertRole(viewer, ["admin"]);
  const request = await findOneByAnyId("bookingRequests", payload.requestId);
  if (!request || request.status !== "pending") throw new Error("该课程草稿无法调整");
  const slot = await findOneByAnyId("availabilitySlots", payload.slotId);
  if (!slot || slot.status !== "published") throw new Error("所选时间暂未开放");
  const slotKeys = rawDocKeys(slot, payload.slotId);
  const active = await list("bookingRequests", Object.assign(anyFieldQuery("slotId", slotKeys), { status: _.in(["pending", "approved"]) }), 200);
  const otherActive = active.filter((item) => docKey(item) !== docKey(request));
  if (otherActive.length >= Number(slot.capacity || 1)) throw new Error("所选时间名额已满");
  const patch = {
    slotId: docKey(slot),
    slotDate: slot.slotDate,
    slotTime: slot.slotTime,
    campus: slot.campus,
    coach: slot.coach,
    matchedBy: viewer.account,
    updatedAt: nowIso()
  };
  await db.collection("bookingRequests").doc(docKey(request)).update({ data: patch });
  return { message: "课程草稿已调整", request: withId(Object.assign({}, request, patch)) };
}

async function rejectBookingRequest(viewer, payload) {
  assertRole(viewer, ["admin"]);
  const request = await findOneByAnyId("bookingRequests", payload.requestId);
  if (!request || request.status !== "pending") throw new Error("该预约无法拒绝");
  await db.collection("bookingRequests").doc(docKey(request)).update({
    data: {
      status: "rejected",
      reviewedAt: nowIso(),
      reviewedBy: viewer.account,
      rejectReason: String(payload.reason || "").trim(),
      updatedAt: nowIso()
    }
  });
  return { message: "已拒绝预约" };
}

async function cancelBookingRequest(viewer, payload) {
  const request = await findOneByAnyId("bookingRequests", payload.requestId);
  if (!request) throw new Error("预约不存在");
  if (viewer.role === "student") {
    const member = await findOneByAnyId("members", viewer.memberId);
    const memberKeys = rawDocKeys(member, viewer.memberId);
    if (!memberKeys.some((key) => sameKey(key, request.memberId))) throw new Error("只能取消自己的预约");
    if (request.status !== "pending") throw new Error("已通过的预约请联系老板取消");
    await db.collection("bookingRequests").doc(docKey(request)).update({
      data: {
        status: "cancelled_by_student",
        cancelReason: String(payload.reason || "").trim(),
        cancelledAt: nowIso(),
        updatedAt: nowIso()
      }
    });
    return { message: "已取消预约", request: withId(Object.assign({}, request, { status: "cancelled_by_student" })) };
  }
  assertRole(viewer, ["admin"]);
  if (request.status !== "pending") throw new Error("只能取消待审批预约");
  await db.collection("bookingRequests").doc(docKey(request)).update({
    data: {
      status: "cancelled_by_admin",
      cancelReason: String(payload.reason || "").trim(),
      cancelledAt: nowIso(),
      cancelledBy: viewer.account,
      updatedAt: nowIso()
    }
  });
  return { message: "已取消预约", request: withId(Object.assign({}, request, { status: "cancelled_by_admin" })) };
}

async function completeScheduleAttendance(viewer, schedule, sourceNote, verificationCode) {
  assertRole(viewer, ["admin", "coach"]);
  if (viewer.role === "coach" && schedule.coach !== viewer.coachName) throw new Error("只能确认自己的课程");
  if (viewer.role === "coach" && rules.daysFromToday(schedule.lessonDate) > 0) throw new Error("课程还未开始，暂不能确认出勤");
  if (schedule.lessonStatus === "completed") return { message: "该课程已经确认过出勤", schedule };
  if (schedule.lessonStatus === "leave_approved") throw new Error("该课程已请假，不可确认出勤");

  const scheduleKey = docKey(schedule);
  const existing = await list("attendanceLogs", anyFieldQuery("sourceScheduleId", rawDocKeys(schedule, scheduleKey)), 1);
  if (existing.length) {
    await db.collection("schedules").doc(scheduleKey).update({ data: { attended: true, lessonStatus: "completed", updatedAt: nowIso() } });
    return { message: "该课程已经有消课记录，已同步为完成" };
  }

  const member = await findOneByAnyId("members", schedule.memberId);
  if (!member) throw new Error("学员不存在");
  const log = {
    attendanceDate: schedule.lessonDate,
    memberId: docKey(member),
    memberName: member.chineseName,
    coach: schedule.coach,
    campus: schedule.campus,
    lessonsDeducted: rules.lessonDeduction(member.productType),
    sourceScheduleId: scheduleKey,
    source: verificationCode ? "qr_verify" : "coach_checkin",
    sourceNote: sourceNote || (verificationCode ? "扫码核销" : "小程序确认出勤"),
    verificationCode: verificationCode || schedule.verificationCode || "",
    createdAt: nowIso()
  };
  await db.collection("attendanceLogs").add({ data: log });
  const schedulePatch = {
    attended: true,
    lessonStatus: "completed",
    updatedAt: nowIso()
  };
  if (verificationCode) {
    schedulePatch.verifiedAt = nowIso();
    schedulePatch.verifiedBy = viewer.account;
    schedulePatch.verificationSource = "scan";
  }
  await db.collection("schedules").doc(scheduleKey).update({ data: schedulePatch });
  return { message: log.lessonsDeducted ? "已确认出勤并扣 1 课时" : "已确认出勤，该课程类型不扣课时", log };
}

async function markAttendance(viewer, payload) {
  const schedule = await findOneByAnyId("schedules", payload.scheduleId);
  if (!schedule) throw new Error("排课不存在");
  return completeScheduleAttendance(viewer, schedule, "小程序确认出勤", "");
}

async function findScheduleByVerificationCode(code) {
  const normalized = rules.normalizeVerificationCode(code);
  if (!normalized) return null;
  const direct = await list("schedules", { verificationCode: normalized }, 1);
  if (direct.length) return direct[0];
  const schedules = await list("schedules", { lessonStatus: _.neq("cancelled") }, 1500);
  return schedules.find((schedule) => rules.verificationCodeForSchedule(schedule) === normalized) || null;
}

async function verifyScheduleQr(viewer, payload) {
  assertRole(viewer, ["admin", "coach"]);
  const code = rules.normalizeVerificationCode(payload.code || payload.qr || payload.scene);
  if (!code) throw new Error("核销码不能为空");
  const schedule = await findScheduleByVerificationCode(code);
  if (!schedule) throw new Error("核销码无效");
  if (viewer.role === "coach" && schedule.coach !== viewer.coachName) throw new Error("只能核销自己的课程");
  const patch = verificationPatch(schedule);
  const status = rules.verificationStatus(Object.assign({}, schedule, patch));
  if (status === "verified") throw new Error("该课程已经核销");
  if (status === "expired") throw new Error("核销码已过期，请联系管理员处理");
  return completeScheduleAttendance(viewer, schedule, "扫码核销", code);
}

async function submitLessonFeedback(viewer, payload) {
  assertRole(viewer, ["admin", "coach"]);
  const schedule = await findOneByAnyId("schedules", payload.scheduleId);
  if (!schedule) throw new Error("排课不存在");
  if (viewer.role === "coach" && schedule.coach !== viewer.coachName) throw new Error("只能反馈自己的课程");
  if (schedule.lessonStatus !== "completed") throw new Error("完成出勤后才能填写课后反馈");
  const member = await findOneByAnyId("members", schedule.memberId);
  if (!member) throw new Error("学员不存在");
  const feedback = {
    scheduleId: docKey(schedule),
    memberId: docKey(member),
    memberName: member.chineseName,
    coach: schedule.coach,
    campus: schedule.campus,
    lessonDate: schedule.lessonDate,
    lessonTime: schedule.lessonTime,
    tags: Array.isArray(payload.tags) ? payload.tags.map((item) => String(item).trim()).filter(Boolean).slice(0, 6) : [],
    note: String(payload.note || "").trim(),
    createdBy: viewer.account,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  if (!feedback.tags.length && !feedback.note) throw new Error("请选择标签或填写反馈备注");
  const existing = await list("lessonFeedbacks", { scheduleId: docKey(schedule) }, 1).catch((error) => {
    if (isMissingCollectionError(error)) return [];
    throw error;
  });
  await createCollectionIfNeeded("lessonFeedbacks");
  if (existing.length) {
    await db.collection("lessonFeedbacks").doc(docKey(existing[0])).update({ data: feedback });
    return { message: "课后反馈已更新", feedback: withId(Object.assign({}, existing[0], feedback)) };
  }
  const result = await db.collection("lessonFeedbacks").add({ data: feedback });
  return { message: "课后反馈已保存", feedback: withId(Object.assign({ _id: result._id }, feedback)) };
}

async function createLeaveRequest(viewer, payload) {
  assertRole(viewer, ["student"]);
  const schedule = await findOneByAnyId("schedules", payload.scheduleId);
  if (!schedule) throw new Error("排课不存在");
  const member = await findOneByAnyId("members", viewer.memberId);
  const memberKeys = rawDocKeys(member, viewer.memberId);
  if (!memberKeys.some((key) => sameKey(key, schedule.memberId))) throw new Error("只能为自己的课程请假");
  if (schedule.lessonStatus !== "pending") throw new Error("该课程当前不能请假");
  if (rules.daysFromToday(schedule.lessonDate) < 0) throw new Error("已过期课程不能请假");
  const duplicate = await list("leaveRequests", { scheduleId: docKey(schedule), status: "pending" }, 1).catch((error) => {
    if (isMissingCollectionError(error)) return [];
    throw error;
  });
  if (duplicate.length) throw new Error("该课程已有待审批请假申请");
  await createCollectionIfNeeded("leaveRequests");
  const request = {
    scheduleId: docKey(schedule),
    memberId: docKey(member),
    memberName: member.chineseName,
    coach: schedule.coach,
    campus: schedule.campus,
    lessonDate: schedule.lessonDate,
    lessonTime: schedule.lessonTime,
    reason: String(payload.reason || "").trim(),
    status: "pending",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  const result = await db.collection("leaveRequests").add({ data: request });
  return { message: "请假申请已提交，等待老板审批", request: withId(Object.assign({ _id: result._id }, request)) };
}

async function approveLeaveRequest(viewer, payload) {
  assertRole(viewer, ["admin"]);
  const request = await findOneByAnyId("leaveRequests", payload.requestId);
  if (!request || request.status !== "pending") throw new Error("该请假申请无法处理");
  const schedule = await findOneByAnyId("schedules", request.scheduleId);
  if (!schedule) throw new Error("排课不存在");
  await createCollectionIfNeeded("makeupCredits");
  const credit = {
    leaveRequestId: docKey(request),
    sourceScheduleId: docKey(schedule),
    memberId: request.memberId,
    memberName: request.memberName,
    coach: request.coach,
    campus: request.campus,
    status: "available",
    reason: request.reason || "",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  const creditResult = await db.collection("makeupCredits").add({ data: credit });
  await db.collection("leaveRequests").doc(docKey(request)).update({
    data: {
      status: "approved",
      reviewedAt: nowIso(),
      reviewedBy: viewer.account,
      makeupCreditId: creditResult._id,
      updatedAt: nowIso()
    }
  });
  await db.collection("schedules").doc(docKey(schedule)).update({
    data: {
      lessonStatus: "leave_approved",
      leaveRequestId: docKey(request),
      updatedAt: nowIso()
    }
  });
  return { message: "已通过请假并生成补课额度", credit: withId(Object.assign({ _id: creditResult._id }, credit)) };
}

async function rejectLeaveRequest(viewer, payload) {
  assertRole(viewer, ["admin"]);
  const request = await findOneByAnyId("leaveRequests", payload.requestId);
  if (!request || request.status !== "pending") throw new Error("该请假申请无法处理");
  await db.collection("leaveRequests").doc(docKey(request)).update({
    data: {
      status: "rejected",
      rejectReason: String(payload.reason || "").trim(),
      reviewedAt: nowIso(),
      reviewedBy: viewer.account,
      updatedAt: nowIso()
    }
  });
  return { message: "已拒绝请假申请" };
}

async function createMakeupSchedule(viewer, payload) {
  assertRole(viewer, ["admin"]);
  const credit = await findOneByAnyId("makeupCredits", payload.creditId);
  if (!credit || credit.status !== "available") throw new Error("补课额度不可用");
  const member = await findOneByAnyId("members", credit.memberId);
  if (!member) throw new Error("学员不存在");
  const schedule = {
    lessonDate: String(payload.lessonDate || "").trim(),
    lessonTime: String(payload.lessonTime || "").trim(),
    campus: String(payload.campus || credit.campus || member.campus || "").trim(),
    coach: String(payload.coach || credit.coach || member.coach || "").trim(),
    memberId: docKey(member),
    memberName: member.chineseName,
    attended: false,
    lessonStatus: "pending",
    source: "makeup_credit",
    makeupCreditId: docKey(credit),
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  if (!schedule.lessonDate || !schedule.lessonTime || !schedule.campus || !schedule.coach) throw new Error("日期、时间、校区、教练不能为空");
  const result = await db.collection("schedules").add({ data: schedule });
  const patch = verificationPatch(Object.assign({ _id: result._id }, schedule));
  await db.collection("schedules").doc(result._id).update({ data: patch });
  await db.collection("makeupCredits").doc(docKey(credit)).update({
    data: {
      status: "scheduled",
      makeupScheduleId: result._id,
      scheduledAt: nowIso(),
      updatedAt: nowIso()
    }
  });
  return { message: "补课排课已创建", schedule: Object.assign({ id: result._id }, schedule, patch) };
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
  const duplicate = await list("availabilitySlots", {
    slotDate: slot.slotDate,
    slotTime: slot.slotTime,
    campus: slot.campus,
    coach: slot.coach,
    status: _.in(["draft", "published"])
  }, 1);
  if (duplicate.length) {
    return { message: "该教练同一时间已存在，无需重复发布", slot: withId(duplicate[0]), skipped: true };
  }
  const result = await db.collection("availabilitySlots").add({ data: slot });
  return { message: viewer.role === "admin" ? "可预约时间已发布" : "空余时间已提交，等待管理员发布", slot: Object.assign({ id: result._id }, slot) };
}

async function createAvailabilitySlots(viewer, payload) {
  assertRole(viewer, ["admin", "coach"]);
  const rows = Array.isArray(payload.slots) ? payload.slots : [];
  const created = [];
  let skipped = 0;
  for (const row of rows) {
    const result = await createAvailabilitySlot(viewer, row);
    if (result.skipped) skipped += 1;
    else created.push(result.slot);
  }
  if (!created.length && !skipped) throw new Error("没有可提交的空余时间");
  const actionText = viewer.role === "admin" ? "发布" : "提交";
  const skippedText = skipped ? "，跳过 " + skipped + " 个重复时间" : "";
  return { message: "已" + actionText + " " + created.length + " 个时间" + skippedText, slots: created, skipped };
}

async function publishAvailabilitySlot(viewer, payload) {
  assertRole(viewer, ["admin"]);
  const slot = await findOneByAnyId("availabilitySlots", payload.slotId);
  if (!slot) throw new Error("空余时间不存在");
  await db.collection("availabilitySlots").doc(docKey(slot)).update({
    data: {
      status: "published",
      publishOrder: Number(payload.publishOrder || 100),
      updatedAt: nowIso()
    }
  });
  return { message: "已发布可预约时间" };
}

async function closeAvailabilitySlot(viewer, payload) {
  assertRole(viewer, ["admin"]);
  const slot = await findOneByAnyId("availabilitySlots", payload.slotId);
  if (!slot) throw new Error("可预约时间不存在");
  if (slot.status === "closed") return { message: "该时间已经关闭" };
  await db.collection("availabilitySlots").doc(docKey(slot)).update({
    data: {
      status: "closed",
      closedAt: nowIso(),
      closedBy: viewer.account,
      updatedAt: nowIso()
    }
  });
  return { message: "已停止继续预约，已有学员课程不受影响" };
}

async function createManualSchedule(viewer, payload) {
  assertRole(viewer, ["admin"]);
  const memberName = String(payload.memberName || "").trim();
  const members = payload.memberId ? await findByAnyId("members", payload.memberId, 1) : await list("members", { chineseName: memberName }, 1);
  const member = members[0];
  if (!member) throw new Error("找不到学员，请检查姓名");
  const schedule = {
    lessonDate: String(payload.lessonDate || "").trim(),
    lessonTime: String(payload.lessonTime || "").trim(),
    campus: String(payload.campus || member.campus || "").trim(),
    coach: String(payload.coach || member.coach || "").trim(),
    memberId: docKey(member),
    memberName: member.chineseName,
    attended: false,
    lessonStatus: "pending",
    source: "manual_admin",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  if (!schedule.lessonDate || !schedule.lessonTime || !schedule.campus || !schedule.coach) throw new Error("日期、时间、校区、教练不能为空");
  const result = await db.collection("schedules").add({ data: schedule });
  const patch = verificationPatch(Object.assign({ _id: result._id }, schedule));
  await db.collection("schedules").doc(result._id).update({ data: patch });
  return { message: "管理员手动排课已创建", schedule: Object.assign({ id: result._id }, schedule, patch) };
}

async function cancelSchedule(viewer, payload) {
  assertRole(viewer, ["admin"]);
  const schedule = await findOneByAnyId("schedules", payload.scheduleId);
  if (!schedule) throw new Error("排课不存在");
  if (schedule.lessonStatus === "completed") throw new Error("已完成课程不能直接取消，请先走撤销消课");
  await db.collection("schedules").doc(docKey(schedule)).update({
    data: {
      lessonStatus: "cancelled",
      cancelReason: String(payload.reason || "").trim(),
      cancelledAt: nowIso(),
      cancelledBy: viewer.account,
      updatedAt: nowIso()
    }
  });
  return { message: "排课已取消", schedule: withId(Object.assign({}, schedule, { lessonStatus: "cancelled" })) };
}

async function createCourseApplication(viewer, payload) {
  assertRole(viewer, ["student"]);
  const member = await findOneByAnyId("members", viewer.memberId);
  if (!member) throw new Error("找不到绑定学员");
  const pending = await list("courseApplications", { memberId: docKey(member), status: "pending" }, 1);
  if (pending.length) throw new Error("已有续课申请等待老板处理，请勿重复提交");
  let product = payload.productId ? await findOneByAnyId("courseProducts", payload.productId) : null;
  if (!product && member.productId) product = await findOneByAnyId("courseProducts", member.productId);
  if (!product) product = (await list("courseProducts", {}, 1))[0] || null;
  const application = {
    memberId: docKey(member),
    memberName: member.chineseName,
    productId: product ? docKey(product) : member.productId || "",
    productName: product ? product.name : member.productName || "课程申请",
    status: "pending",
    note: String(payload.note || "").trim(),
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  await db.collection("courseApplications").add({ data: application });
  return { message: "课程申请已提交，等待管理员处理", application };
}

async function approveCourseApplication(viewer, payload) {
  assertRole(viewer, ["admin"]);
  const application = await findOneByAnyId("courseApplications", payload.applicationId);
  if (!application || application.status !== "pending") throw new Error("该课程申请无法处理");
  const member = await findOneByAnyId("members", application.memberId);
  if (!member) throw new Error("找不到申请学员");
  const product = application.productId ? await findOneByAnyId("courseProducts", application.productId) : null;
  const patchData = {
    productId: product ? docKey(product) : application.productId || member.productId || "",
    productName: product ? product.name : application.productName || member.productName || "课程",
    productType: product ? product.type : member.productType || "class_pack",
    totalLessons: Number(payload.totalLessons || product && product.totalLessons || member.totalLessons || 0),
    updatedAt: nowIso()
  };
  await db.collection("members").doc(docKey(member)).update({ data: patchData });
  await db.collection("courseApplications").doc(docKey(application)).update({
    data: {
      status: "approved",
      reviewedAt: nowIso(),
      reviewedBy: viewer.account,
      updatedAt: nowIso()
    }
  });
  return { message: "已通过课程申请并更新学员课程", application: withId(Object.assign({}, application, { status: "approved" })) };
}

async function rejectCourseApplication(viewer, payload) {
  assertRole(viewer, ["admin"]);
  const application = await findOneByAnyId("courseApplications", payload.applicationId);
  if (!application || application.status !== "pending") throw new Error("该课程申请无法处理");
  await db.collection("courseApplications").doc(docKey(application)).update({
    data: {
      status: "rejected",
      rejectReason: String(payload.reason || "").trim(),
      reviewedAt: nowIso(),
      reviewedBy: viewer.account,
      updatedAt: nowIso()
    }
  });
  return { message: "已拒绝课程申请", application: withId(Object.assign({}, application, { status: "rejected" })) };
}

function todayChina() {
  return rules.formatDateChina(rules.shanghaiNow());
}

function timeChina() {
  const now = rules.shanghaiNow();
  return String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
}

function linkedMemberIds(account) {
  return uniqueValues([].concat(account && account.memberIds || [], account && account.memberId || []));
}

async function nextStudentAccountName(accounts) {
  const rows = accounts || await list("accounts", {}, 1500);
  const max = rows.reduce((value, item) => {
    const match = /^xy(\d+)$/.exec(String(item.account || ""));
    return match ? Math.max(value, Number(match[1])) : value;
  }, 0);
  return "xy" + String(max + 1).padStart(3, "0");
}

async function nextCoachAccountName(accounts) {
  const rows = accounts || await list("accounts", {}, 1500);
  const max = rows.reduce((value, item) => {
    const match = /^jl(\d+)$/.exec(String(item.account || ""));
    return match ? Math.max(value, Number(match[1])) : value;
  }, 0);
  return "jl" + String(max + 1).padStart(3, "0");
}

async function bindMemberGuardian(viewer, payload) {
  assertRole(viewer, ["admin"]);
  const member = await findOneByAnyId("members", payload.memberId);
  if (!member) throw new Error("学员不存在");
  const phone = rules.normalizePhone(payload.phone || member.phone);
  if (!rules.isChinaMobile(phone)) throw new Error("请填写家长的 11 位手机号");
  if (member.phoneLocked && phone !== rules.normalizePhone(member.phone)) throw new Error("该手机号来自微信验证，不能修改");
  const accounts = await list("accounts", {}, 1500);
  const students = accounts.filter((item) => item.role === "student");
  const oldAccounts = students.filter((item) => linkedMemberIds(item).indexOf(docKey(member)) >= 0 || linkedMemberIds(item).indexOf(member.id) >= 0);
  let target = students.find((item) => item.phone === phone && item.status !== "disabled") || null;
  if (!target) {
    const account = {
      account: await nextStudentAccountName(accounts),
      role: "student",
      fullName: member.chineseName + "家长",
      phone,
      memberId: docKey(member),
      memberIds: [docKey(member)],
      loginMode: "phone",
      bindingStatus: "pending",
      status: "active",
      openid: null,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    const result = await db.collection("accounts").add({ data: account });
    target = Object.assign({ _id: result._id }, account);
  } else {
    const ids = uniqueValues(linkedMemberIds(target).concat(docKey(member)));
    await db.collection("accounts").doc(docKey(target)).update({ data: { memberId: ids[0], memberIds: ids, updatedAt: nowIso() } });
    target = Object.assign({}, target, { memberId: ids[0], memberIds: ids });
  }
  for (const old of oldAccounts) {
    if (docKey(old) === docKey(target)) continue;
    const ids = linkedMemberIds(old).filter((id) => id !== docKey(member) && id !== member.id);
    await db.collection("accounts").doc(docKey(old)).update({ data: {
      memberId: ids[0] || "",
      memberIds: ids,
      status: ids.length ? old.status || "active" : "disabled",
      updatedAt: nowIso()
    } });
  }
  await db.collection("members").doc(docKey(member)).update({ data: { phone, updatedAt: nowIso() } });
  return { message: "家长手机号已绑定", account: safeAccount(target) };
}

function coachIdentity(viewer) {
  return {
    coachAccount: viewer.account,
    coachName: viewer.coachName || viewer.fullName || (viewer.role === "admin" ? "老板" : viewer.account)
  };
}

function registrationInviteType(value) {
  const type = String(value || "").trim();
  if (["coach", "student"].indexOf(type) < 0) throw new Error("登记码类型无效");
  return type;
}

function registrationToken(scene) {
  const value = decodeURIComponent(String(scene || "").trim());
  return value.indexOf("i=") === 0 ? value.slice(2) : value;
}

async function findRegistrationInvite(scene) {
  const token = registrationToken(scene);
  if (!token) return null;
  return (await list("registrationInvites", { token, status: "active" }, 1))[0] || null;
}

async function registrationContext(payload) {
  const invite = await findRegistrationInvite(payload.scene || payload.token);
  if (!invite) throw new Error("这个登记码已失效，请向老板获取新二维码");
  return {
    inviteType: invite.inviteType,
    title: invite.inviteType === "coach" ? "教练登记" : "学员登记",
    token: invite.token
  };
}

function registrationChildren(rawChildren) {
  const rows = Array.isArray(rawChildren) ? rawChildren : [];
  if (!rows.length || rows.length > 6) throw new Error("一次可登记 1 至 6 名孩子");
  return rows.map((item, index) => {
    const name = String(item && (item.name || item.chineseName) || "").trim();
    const remainingLessons = Number(item && item.remainingLessons);
    if (!name) throw new Error("请填写第 " + (index + 1) + " 名孩子的姓名");
    if (name.length > 20) throw new Error("孩子姓名不能超过 20 个字");
    if (!Number.isInteger(remainingLessons) || remainingLessons < -999 || remainingLessons > 99999) {
      throw new Error("剩余课时应为 -999 至 99999 的整数");
    }
    return {
      clientId: String(item.clientId || "child-" + (index + 1)).slice(0, 40),
      proposedName: name,
      remainingLessons
    };
  });
}

async function submitRegistration(payload) {
  const invite = await findRegistrationInvite(payload.scene || payload.token);
  if (!invite) throw new Error("这个登记码已失效，请向老板获取新二维码");
  let phone = await getPhoneNumberFromCode(payload.phoneCode);
  if (!phone && TEST_LOGIN_ENABLED) phone = rules.normalizePhone(payload.phone);
  if (!rules.isChinaMobile(phone)) throw new Error("请授权微信绑定的大陆手机号");
  const activeAccount = await getAccountByPhone(phone);
  if (activeAccount) throw new Error("该手机号已有账号，请直接从登录页进入");

  await createCollectionIfNeeded("registrationRequests");
  const children = invite.inviteType === "student" ? registrationChildren(payload.children) : [];
  const pending = (await list("registrationRequests", { phone, requestType: invite.inviteType, status: "pending" }, 10))[0] || null;
  const submittedAt = nowIso();
  const request = {
    requestType: invite.inviteType,
    phone,
    status: "pending",
    children,
    inviteToken: invite.token,
    submittedAt: pending && pending.submittedAt || submittedAt,
    updatedAt: submittedAt
  };
  if (pending) {
    await db.collection("registrationRequests").doc(docKey(pending)).update({ data: request });
    return { message: "申请已更新，等待老板确认", requestId: docKey(pending), status: "pending" };
  }
  const result = await db.collection("registrationRequests").add({ data: request });
  return { message: "登记已提交，等待老板确认", requestId: result._id, status: "pending" };
}

function registrationEnvVersion(value) {
  return ["develop", "trial", "release"].indexOf(value) >= 0 ? value : "release";
}

async function registrationInviteQr(invite, envVersion) {
  const storedFiles = Object.assign({}, invite.fileIds || {});
  if (!storedFiles[envVersion]) {
    const image = await cloud.openapi.wxacode.getUnlimited({
      scene: "i=" + invite.token,
      page: "pages/register/register",
      checkPath: false,
      envVersion,
      width: 430
    });
    const upload = await cloud.uploadFile({
      cloudPath: "registration-invites/" + invite.inviteType + "/" + invite.token + "-" + envVersion + ".jpg",
      fileContent: image.buffer
    });
    storedFiles[envVersion] = upload.fileID;
    await db.collection("registrationInvites").doc(docKey(invite)).update({ data: { fileIds: storedFiles, updatedAt: nowIso() } });
  }
  return Object.assign({}, invite, { fileIds: storedFiles, fileId: storedFiles[envVersion], envVersion });
}

async function ensureRegistrationInvite(inviteType, envVersion, createdBy) {
  await createCollectionIfNeeded("registrationInvites");
  const current = (await list("registrationInvites", { inviteType, status: "active" }, 1))[0] || null;
  let invite = current;
  if (!invite) {
    invite = {
      inviteType,
      token: crypto.randomBytes(10).toString("hex"),
      status: "active",
      fileIds: {},
      createdBy,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    const result = await db.collection("registrationInvites").add({ data: invite });
    invite._id = result._id;
  }
  return registrationInviteQr(invite, envVersion);
}

function publicRegistrationRequest(item) {
  const row = withId(item);
  return {
    id: row.id,
    requestType: row.requestType,
    phone: row.phone,
    status: row.status,
    children: row.children || [],
    submittedAt: row.submittedAt,
    updatedAt: row.updatedAt
  };
}

async function registrationAdminData(viewer, payload) {
  assertRole(viewer, ["admin"]);
  const envVersion = registrationEnvVersion(payload.envVersion);
  const coachInvite = await ensureRegistrationInvite("coach", envVersion, viewer.account);
  const studentInvite = await ensureRegistrationInvite("student", envVersion, viewer.account);
  await createCollectionIfNeeded("registrationRequests");
  const requests = (await list("registrationRequests", { status: "pending" }, 500))
    .map(publicRegistrationRequest)
    .sort((a, b) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")));
  return {
    invites: [coachInvite, studentInvite].map((item) => ({
      id: docKey(item),
      inviteType: item.inviteType,
      token: item.token,
      fileId: item.fileId,
      envVersion: item.envVersion
    })),
    requests,
    pendingCount: requests.length
  };
}

async function rotateRegistrationInvite(viewer, payload) {
  assertRole(viewer, ["admin"]);
  const inviteType = registrationInviteType(payload.inviteType);
  const envVersion = registrationEnvVersion(payload.envVersion);
  await createCollectionIfNeeded("registrationInvites");
  const active = await list("registrationInvites", { inviteType, status: "active" }, 20);
  await Promise.all(active.map((item) => db.collection("registrationInvites").doc(docKey(item)).update({
    data: { status: "disabled", disabledAt: nowIso(), disabledBy: viewer.account, updatedAt: nowIso() }
  })));
  const invite = await ensureRegistrationInvite(inviteType, envVersion, viewer.account);
  return {
    message: (inviteType === "coach" ? "教练码 A" : "学员码 B") + " 已更换，旧码立即失效",
    invite: { id: docKey(invite), inviteType, token: invite.token, fileId: invite.fileId, envVersion }
  };
}

async function reviewRegistration(viewer, payload) {
  assertRole(viewer, ["admin"]);
  const request = await findOneByAnyId("registrationRequests", payload.requestId);
  if (!request || request.status !== "pending") throw new Error("该申请已处理或不存在");
  const decision = String(payload.decision || "");
  if (decision === "reject") {
    const patch = { status: "rejected", rejectReason: String(payload.reason || "老板拒绝").trim(), reviewedAt: nowIso(), reviewedBy: viewer.account, updatedAt: nowIso() };
    await db.collection("registrationRequests").doc(docKey(request)).update({ data: patch });
    return { message: "申请已拒绝", request: publicRegistrationRequest(Object.assign({}, request, patch)) };
  }
  if (decision !== "approve") throw new Error("请选择通过或拒绝");
  const existing = await getAccountByPhone(request.phone);
  if (existing) throw new Error("该手机号已有账号，不能重复通过");
  const accounts = await list("accounts", {}, 1500);
  const approvedAt = nowIso();
  let account;
  const createdMembers = [];
  if (request.requestType === "coach") {
    const displayName = String(payload.displayName || "").trim();
    if (!displayName) throw new Error("请填写教练姓名");
    account = {
      account: await nextCoachAccountName(accounts), role: "coach", fullName: displayName, coachName: displayName,
      campus: String(payload.campus || "").trim(), phone: request.phone, phoneLocked: true,
      registrationSource: "self_registration", loginMode: "phone", bindingStatus: "pending", openid: null,
      status: "active", createdAt: approvedAt, updatedAt: approvedAt
    };
  } else {
    const children = registrationChildren(payload.children || request.children);
    let memberNo = (await maxMemberNo()) + 1;
    for (const child of children) {
      const member = {
        memberNo, chineseName: child.proposedName, phone: request.phone, phoneLocked: true,
        registrationSource: "self_registration", productId: "product-class-pack", productName: "课时账户",
        productType: "class_pack", totalLessons: child.remainingLessons, wechat: "", campus: "", coach: "",
        cardExpireDate: "", notes: "扫码登记，老板已确认", createdAt: approvedAt, updatedAt: approvedAt
      };
      const result = await db.collection("members").add({ data: member });
      createdMembers.push(Object.assign({ id: result._id }, member));
      memberNo += 1;
    }
    const memberIds = createdMembers.map((item) => item.id);
    account = {
      account: await nextStudentAccountName(accounts), role: "student", fullName: createdMembers.map((item) => item.chineseName).join("、") + "家长",
      phone: request.phone, phoneLocked: true, registrationSource: "self_registration", memberId: memberIds[0], memberIds,
      loginMode: "phone", bindingStatus: "pending", openid: null, status: "active", createdAt: approvedAt, updatedAt: approvedAt
    };
  }
  const accountResult = await db.collection("accounts").add({ data: account });
  const approved = { status: "approved", reviewedAt: approvedAt, reviewedBy: viewer.account, approvedAccount: account.account, approvedChildren: createdMembers, updatedAt: approvedAt };
  await db.collection("registrationRequests").doc(docKey(request)).update({ data: approved });
  await createCollectionIfNeeded("auditLogs");
  await db.collection("auditLogs").add({ data: { action: "approve_registration", requestId: docKey(request), requestType: request.requestType, phone: request.phone, account: account.account, operator: viewer.account, createdAt: approvedAt } });
  return { message: request.requestType === "coach" ? "教练已通过，可用手机号登录" : "学员已建档，家长可用手机号登录", account: safeAccount(Object.assign({ _id: accountResult._id }, account)), members: createdMembers };
}

async function dailyCoachCode(viewer, payload) {
  assertRole(viewer, ["admin", "coach"]);
  const date = todayChina();
  const identity = coachIdentity(viewer);
  await createCollectionIfNeeded("dailyCoachCodes");
  let rows = await list("dailyCoachCodes", { coachAccount: identity.coachAccount, codeDate: date }, 1);
  let code = rows[0] || null;
  if (!code) {
    code = {
      token: crypto.randomBytes(10).toString("hex"),
      codeDate: date,
      coachAccount: identity.coachAccount,
      coachName: identity.coachName,
      status: "active",
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    const result = await db.collection("dailyCoachCodes").add({ data: code });
    code._id = result._id;
  }
  const envVersion = ["develop", "trial", "release"].indexOf(payload.envVersion) >= 0 ? payload.envVersion : "release";
  const storedFiles = Object.assign({}, code.fileIds || {});
  if (!storedFiles[envVersion]) {
    const image = await cloud.openapi.wxacode.getUnlimited({
      scene: "t=" + code.token,
      page: "pages/checkin/checkin",
      checkPath: false,
      envVersion,
      width: 430
    });
    const upload = await cloud.uploadFile({
      cloudPath: "daily-coach-codes/" + date + "/" + identity.coachAccount + "-" + envVersion + ".jpg",
      fileContent: image.buffer
    });
    storedFiles[envVersion] = upload.fileID;
    await db.collection("dailyCoachCodes").doc(docKey(code)).update({ data: { fileIds: storedFiles, updatedAt: nowIso() } });
  }
  return { codeDate: date, coachAccount: identity.coachAccount, coachName: identity.coachName, fileId: storedFiles[envVersion], envVersion };
}

async function findDailyCode(scene) {
  const value = String(scene || "").trim();
  const token = value.indexOf("t=") === 0 ? value.slice(2) : value;
  if (!token) return null;
  return (await list("dailyCoachCodes", { token, status: "active" }, 1))[0] || null;
}

async function checkinContext(viewer, payload) {
  assertRole(viewer, ["student"]);
  const code = await findDailyCode(payload.scene || payload.token);
  if (!code) throw new Error("教练码无效");
  if (code.codeDate !== todayChina()) throw new Error("该教练码已过期，请扫描今天的新码");
  const coach = await getAccountByName(code.coachAccount);
  if (!coach || ["admin", "coach"].indexOf(coach.role) < 0) throw new Error("该教练已停用");
  const ids = linkedMemberIds(viewer);
  const members = (await Promise.all(ids.map((id) => findOneByAnyId("members", id)))).filter(Boolean);
  if (!members.length) throw new Error("当前手机号没有绑定学员，请联系老板");
  const decorated = await memberViews(viewer);
  return {
    codeDate: code.codeDate,
    coachAccount: code.coachAccount,
    coachName: code.coachName,
    confirmTime: timeChina(),
    members: decorated
  };
}

async function consumptionLogsForMember(memberId) {
  return list("attendanceLogs", { memberId }, 1500);
}

async function confirmDailyCheckin(viewer, payload) {
  assertRole(viewer, ["student"]);
  const context = await checkinContext(viewer, payload);
  const lessons = Number(payload.lessons || 1);
  if ([1, 2, 3].indexOf(lessons) < 0) throw new Error("家长每次只能选择扣 1、2 或 3 节");
  const allowedIds = context.members.map((item) => item.id);
  const memberIds = uniqueValues(payload.memberIds || []).filter((id) => allowedIds.indexOf(id) >= 0);
  if (!memberIds.length) throw new Error("请至少选择一名到场学员");
  const requestId = String(payload.requestId || crypto.randomBytes(8).toString("hex")).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  const batchId = "scan-" + requestId;
  const previous = await list("attendanceLogs", { batchId }, 10);
  if (previous.length) {
    const refreshed = await memberViews(viewer);
    return { message: "消课成功", batchId, logs: previous.map(withId), members: refreshed, confirmedAt: previous[0].createdAt || nowIso(), idempotent: true };
  }
  const date = todayChina();
  const duplicateNames = [];
  for (const memberId of memberIds) {
    const logs = await consumptionLogsForMember(memberId);
    const duplicated = logs.some((log) => log.attendanceDate === date && log.coachAccount === context.coachAccount && log.source === "coach_daily_qr" && log.status !== "reversed" && !log.reversedAt);
    if (duplicated) duplicateNames.push((context.members.find((item) => item.id === memberId) || {}).chineseName || memberId);
  }
  if (duplicateNames.length) throw new Error(duplicateNames.join("、") + " 今天已在该教练处消课");
  const createdAt = nowIso();
  const results = [];
  for (const memberId of memberIds) {
    const member = context.members.find((item) => item.id === memberId);
    const logId = batchId + "-" + crypto.createHash("md5").update(memberId).digest("hex").slice(0, 8);
    const log = {
      batchId,
      attendanceDate: date,
      attendanceTime: timeChina(),
      memberId,
      memberName: member.chineseName,
      coachAccount: context.coachAccount,
      coach: context.coachName,
      lessonsDeducted: lessons,
      source: "coach_daily_qr",
      sourceNote: "家长扫码消课",
      status: "active",
      createdBy: viewer.account,
      createdAt,
      updatedAt: createdAt
    };
    await db.collection("attendanceLogs").doc(logId).set({ data: log });
    results.push(Object.assign({ id: logId }, log));
  }
  const refreshed = await memberViews(viewer);
  return { message: "消课成功", batchId, logs: results, members: refreshed, confirmedAt: createdAt };
}

async function consumptionHomeData(viewer) {
  const members = await memberViews(viewer);
  let logs = await list("attendanceLogs", {}, 2000);
  if (viewer.role === "coach") logs = logs.filter((item) => item.coachAccount === viewer.account || (!item.coachAccount && item.coach === viewer.coachName));
  if (viewer.role === "student") {
    const ids = members.map((item) => item.id);
    logs = logs.filter((item) => ids.indexOf(item.memberId) >= 0);
  }
  logs = logs.map((item) => {
    const row = withId(item);
    if (row.status !== "reversed" && !row.reversedAt && Number(row.lessonsDeducted) <= 0) row.lessonsDeducted = 1;
    return row;
  }).sort((a, b) => String(b.createdAt || b.attendanceDate || "").localeCompare(String(a.createdAt || a.attendanceDate || "")));
  const today = todayChina();
  const todayLogs = logs.filter((item) => item.attendanceDate === today && item.status !== "reversed" && !item.reversedAt);
  const accounts = viewer.role === "admin" ? (await list("accounts", {}, 1500)).map(safeAccount) : [];
  return {
    viewer: safeAccount(viewer),
    members,
    logs: logs.slice(0, viewer.role === "admin" ? 500 : 100),
    todayLogs,
    accounts,
    stats: {
      todayStudents: uniqueValues(todayLogs.map((item) => item.memberId)).length,
      todayLessons: todayLogs.reduce((sum, item) => sum + Number(item.lessonsDeducted || 0), 0),
      debtMembers: members.filter((item) => Number(item.remainingLessons) < 0).length
    }
  };
}

async function reverseConsumption(viewer, payload) {
  assertRole(viewer, ["admin"]);
  const log = await findOneByAnyId("attendanceLogs", payload.logId);
  if (!log) throw new Error("消课流水不存在");
  if (log.status === "reversed" || log.reversedAt) throw new Error("该流水已经撤销");
  const patch = { status: "reversed", reversedAt: nowIso(), reversedBy: viewer.account, reverseReason: String(payload.reason || "老板纠错").trim(), updatedAt: nowIso() };
  await db.collection("attendanceLogs").doc(docKey(log)).update({ data: patch });
  await db.collection("auditLogs").add({ data: { action: "reverse_consumption", logId: docKey(log), memberId: log.memberId, beforeLessons: Number(log.lessonsDeducted || 1), reason: patch.reverseReason, operator: viewer.account, createdAt: patch.reversedAt } });
  return { message: "已撤销并返还课时", log: withId(Object.assign({}, log, patch)) };
}

async function adjustConsumption(viewer, payload) {
  assertRole(viewer, ["admin"]);
  const log = await findOneByAnyId("attendanceLogs", payload.logId);
  if (!log) throw new Error("消课流水不存在");
  if (log.status === "reversed" || log.reversedAt) throw new Error("已撤销流水不能修改");
  const lessons = Math.floor(Number(payload.lessons));
  if (lessons < 1 || lessons > 99) throw new Error("课时应为 1 至 99 的整数");
  const patch = { lessonsDeducted: lessons, correctedFrom: Number(log.lessonsDeducted || 0), correctedAt: nowIso(), correctedBy: viewer.account, correctionReason: String(payload.reason || "老板调整").trim(), updatedAt: nowIso() };
  await db.collection("attendanceLogs").doc(docKey(log)).update({ data: patch });
  await db.collection("auditLogs").add({ data: { action: "adjust_consumption", logId: docKey(log), memberId: log.memberId, beforeLessons: patch.correctedFrom, afterLessons: lessons, reason: patch.correctionReason, operator: viewer.account, createdAt: patch.correctedAt } });
  return { message: "消课课时已调整", log: withId(Object.assign({}, log, patch)) };
}

async function manualConsumption(viewer, payload) {
  assertRole(viewer, ["admin"]);
  const lessons = Math.floor(Number(payload.lessons || 1));
  if (lessons < 1 || lessons > 99) throw new Error("课时应为 1 至 99 的整数");
  const memberIds = uniqueValues(payload.memberIds || []);
  if (!memberIds.length) throw new Error("请选择学员");
  const coachAccount = String(payload.coachAccount || viewer.account);
  const coach = await getAccountByName(coachAccount);
  if (!coach || ["admin", "coach"].indexOf(coach.role) < 0) throw new Error("教练不存在");
  const batchId = "manual-" + crypto.randomBytes(8).toString("hex");
  for (const memberId of memberIds) {
    const member = await findOneByAnyId("members", memberId);
    if (!member) throw new Error("学员不存在");
    await db.collection("attendanceLogs").add({ data: {
      batchId,
      attendanceDate: String(payload.attendanceDate || todayChina()),
      attendanceTime: String(payload.attendanceTime || timeChina()),
      memberId: docKey(member),
      memberName: member.chineseName,
      coachAccount,
      coach: coach.coachName || coach.fullName || coach.account,
      lessonsDeducted: lessons,
      source: "admin_manual",
      sourceNote: String(payload.reason || "老板补录").trim(),
      status: "active",
      createdBy: viewer.account,
      createdAt: nowIso(),
      updatedAt: nowIso()
    } });
  }
  await db.collection("auditLogs").add({ data: { action: "manual_consumption", batchId, memberIds, coachAccount, lessons, reason: String(payload.reason || "老板补录").trim(), operator: viewer.account, createdAt: nowIso() } });
  return { message: "补录消课成功", batchId };
}

async function addMemberLessons(viewer, payload) {
  assertRole(viewer, ["admin"]);
  const member = await findOneByAnyId("members", payload.memberId);
  if (!member) throw new Error("学员不存在");
  const amount = Math.floor(Number(payload.amount));
  if (!amount || Math.abs(amount) > 999) throw new Error("调整课时应为 -999 至 999 的非零整数");
  const before = Number(member.totalLessons || 0);
  const after = before + amount;
  if (after < 0) throw new Error("总课时不能小于 0");
  await db.collection("members").doc(docKey(member)).update({ data: { totalLessons: after, updatedAt: nowIso() } });
  await createCollectionIfNeeded("lessonAdjustments");
  await db.collection("lessonAdjustments").add({ data: { memberId: docKey(member), memberName: member.chineseName, before, amount, after, reason: String(payload.reason || "老板加课").trim(), operator: viewer.account, createdAt: nowIso() } });
  return { message: "学员总课时已更新", before, amount, after };
}

exports.main = async (event) => {
  try {
    const wxContext = cloud.getWXContext();
    const action = event.action;
    const payload = event.payload || {};

    if (action === "login") return ok(await login(payload, wxContext));
    if (action === "loginByPhone") return ok(await loginByPhone(payload, wxContext));
    if (action === "loginForTest") return ok(await loginForTest(payload));
    if (action === "registrationContext") return ok(await registrationContext(payload));
    if (action === "submitRegistration") return ok(await submitRegistration(payload));
    if (action === "seedClearCollection") return ok(await seedClearCollection(payload));
    if (action === "seedImportBatch") return ok(await seedImportBatch(payload));
    if (action === "seedFinalize") return ok(await seedFinalize(payload));

    const viewer = await getAccountBySession(payload.session, wxContext);
    if (!viewer) throw new Error("登录已过期，请重新登录");

    const actions = {
      getHomeData,
      consumptionHomeData,
      dailyCoachCode,
      registrationAdminData,
      rotateRegistrationInvite,
      reviewRegistration,
      checkinContext,
      confirmDailyCheckin,
      bindMemberGuardian,
      reverseConsumption,
      adjustConsumption,
      manualConsumption,
      addMemberLessons,
      listPagedData,
      saveMember,
      bulkImportMembers,
      saveAccount,
      resetAccountPassword,
      changeMyPassword,
      unbindAccountWechat,
      saveWeeklyAvailabilityTemplate,
      createBookingRequest,
      updateBookingRequestMatch,
      approveBookingRequest,
      rejectBookingRequest,
      cancelBookingRequest,
      markAttendance,
      verifyScheduleQr,
      submitLessonFeedback,
      createLeaveRequest,
      approveLeaveRequest,
      rejectLeaveRequest,
      createMakeupSchedule,
      cancelSchedule,
      approveCourseApplication,
      rejectCourseApplication,
      createAvailabilitySlot,
      createAvailabilitySlots,
      publishAvailabilitySlot,
      closeAvailabilitySlot,
      createManualSchedule,
      createCourseApplication
    };

    if (!actions[action]) throw new Error("未知操作：" + action);
    return ok(await actions[action](viewer, payload));
  } catch (error) {
    return fail(error);
  }
};
