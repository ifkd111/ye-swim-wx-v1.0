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
  delete result.passwordHash;
  delete result.passwordSalt;
  return result;
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
  return Boolean(expected && payload && payload.seedSecret === expected);
}

function assertSeedSecret(payload) {
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
  const currentPasswordMatches = existing && existing.passwordSalt
    ? hashPassword("1324", existing.passwordSalt) === existing.passwordHash
    : false;
  const passwordSalt = currentPasswordMatches ? existing.passwordSalt : crypto.randomBytes(16).toString("hex");
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
  if (existing) {
    const needsPasswordReset = !currentPasswordMatches;
    if (existing.role !== "admin" || existing.status === "disabled" || needsPasswordReset) {
      await db.collection("accounts").doc(docKey(existing)).update({ data: adminPatch });
    }
    return;
  }
  await db.collection("accounts").add({ data: Object.assign({}, adminPatch, { openid: null, createdAt: nowIso() }) });
}

async function login(payload, wxContext) {
  const accountName = rules.normalizeAccount(payload.account);
  await ensureAdminAccount(accountName, payload.password);
  let account = await getAccountByName(accountName).catch(async (error) => {
    if (!isMissingCollectionError(error)) throw error;
    return null;
  });
  if (!account) throw new Error("账号或密码错误");

  const hashed = hashPassword(payload.password || "", account.passwordSalt);
  if (hashed !== account.passwordHash) throw new Error("账号或密码错误");

  const role = rules.roleFromAccount(accountName);
  if (!role || role !== account.role) throw new Error("账号角色配置不正确");
  if (account.openid && account.openid !== wxContext.OPENID && account.role !== "admin") throw new Error("该账号已经绑定其他微信");

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
  let members;
  let memberKeys = [];
  if (viewer.role === "student") {
    const member = await findOneByAnyId("members", viewer.memberId);
    members = member ? [member] : [];
    memberKeys = rawDocKeys(member, viewer.memberId);
  }

  const [loadedMembers, attendanceLogs] = await Promise.all([
    members ? Promise.resolve(members) : list("members", memberQuery, 1500),
    list("attendanceLogs", viewer.role === "student" ? anyFieldQuery("memberId", memberKeys) : {}, 1500)
  ]);
  const usedByMember = {};
  attendanceLogs.forEach((log) => {
    usedByMember[log.memberId] = (usedByMember[log.memberId] || 0) + Number(log.lessonsDeducted || 0);
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
    const member = await findOneByAnyId("members", viewer.memberId);
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
  const studentMember = viewer.role === "student" ? await findOneByAnyId("members", viewer.memberId) : null;
  const studentMemberKeys = rawDocKeys(studentMember, viewer.memberId);
  const [members, schedules, attendanceLogs, availabilitySlots, bookingRequests, courseApplications, courseProducts, accounts] =
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
      list("courseApplications", viewer.role === "student" ? anyFieldQuery("memberId", studentMemberKeys) : {}, 1000),
      list("courseProducts", {}, 200),
      viewer.role === "admin" ? list("accounts", {}, 1000) : []
    ]);

  let visibleAvailabilitySlots = availabilitySlots;
  if (viewer.role === "student" && availabilitySlots.length) {
    const slotKeyValues = [];
    availabilitySlots.forEach((slot) => {
      rawDocKeys(slot).forEach((key) => slotKeyValues.push(key));
    });
    const slotKeys = uniqueValues(slotKeyValues);
    const activeBookings = await list(
      "bookingRequests",
      Object.assign(anyFieldQuery("slotId", slotKeys), { status: _.in(["pending", "approved"]) }),
      1500
    );
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
    accounts: accounts.map(safeAccount)
  };
}

async function createBookingRequest(viewer, payload) {
  assertRole(viewer, ["student"]);
  const slot = await findOneByAnyId("availabilitySlots", payload.slotId);
  if (!slot || slot.status !== "published") throw new Error("该时间暂不可预约");
  if (!rules.isBookableForStudent(slot.slotDate)) throw new Error("该时间不符合提前预约规则");

  const member = await findOneByAnyId("members", viewer.memberId);
  if (!member) throw new Error("找不到绑定学员");
  if (member.coach && member.coach !== slot.coach) throw new Error("该时间不属于你的绑定教练");

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
  const current = id ? await findOneByAnyId("members", id) : null;
  const member = await memberPayload(raw, current);
  if (!member.chineseName) throw new Error("学员姓名不能为空");

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
  if (current && current.account !== accountName) {
    throw new Error("已创建账号不能修改账号名，请新建账号");
  }
  const duplicates = await list("accounts", { account: accountName }, 10);
  if (duplicates.some((item) => !sameKey(docKey(item), id))) throw new Error("账号已存在");

  let memberId = raw.memberId || current && current.memberId || "";
  if (role === "student") {
    const memberName = String(raw.memberName || raw.fullName || "").trim();
    const members = memberId ? await findByAnyId("members", memberId, 10) : await list("members", { chineseName: memberName }, 10);
    const member = members[0];
    if (!member) throw new Error("学员账号需要填写已存在的学员姓名");
    memberId = docKey(member);
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
    account.passwordHash = hashPassword(String(raw.password || defaultPasswordForRole(role)), account.passwordSalt);
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
  const passwordSalt = crypto.randomBytes(16).toString("hex");
  const plainPassword = defaultPasswordForRole(account.role);
  await db.collection("accounts").doc(account._id).update({
    data: {
      passwordSalt,
      passwordHash: hashPassword(plainPassword, passwordSalt),
      updatedAt: nowIso()
    }
  });
  return { message: "密码已重置为系统默认密码", account: safeAccount(account) };
}

async function changeMyPassword(viewer, payload) {
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
      updatedAt: nowIso()
    }
  });
  return { message: "密码已修改，请使用新密码登录" };
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
    attended: false,
    lessonStatus: "pending",
    source: "student_booking",
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
  if (schedule.lessonStatus === "completed") return { message: "该课程已经确认过出勤", schedule };

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

async function createAvailabilitySlots(viewer, payload) {
  assertRole(viewer, ["admin", "coach"]);
  const rows = Array.isArray(payload.slots) ? payload.slots : [];
  const created = [];
  for (const row of rows) {
    const result = await createAvailabilitySlot(viewer, row);
    created.push(result.slot);
  }
  if (!created.length) throw new Error("没有可提交的空余时间");
  return { message: "已提交 " + created.length + " 个空余时间", slots: created };
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

exports.main = async (event) => {
  try {
    const wxContext = cloud.getWXContext();
    const action = event.action;
    const payload = event.payload || {};

    if (action === "login") return ok(await login(payload, wxContext));
    if (action === "seedClearCollection") return ok(await seedClearCollection(payload));
    if (action === "seedImportBatch") return ok(await seedImportBatch(payload));
    if (action === "seedFinalize") return ok(await seedFinalize(payload));

    const viewer = await getAccountBySession(payload.session, wxContext);
    if (!viewer) throw new Error("登录已过期，请重新登录");

    const actions = {
      getHomeData,
      saveMember,
      bulkImportMembers,
      saveAccount,
      resetAccountPassword,
      changeMyPassword,
      createBookingRequest,
      approveBookingRequest,
      rejectBookingRequest,
      cancelBookingRequest,
      markAttendance,
      verifyScheduleQr,
      cancelSchedule,
      approveCourseApplication,
      rejectCourseApplication,
      createAvailabilitySlot,
      createAvailabilitySlots,
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
