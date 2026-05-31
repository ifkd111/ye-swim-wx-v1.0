const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const rules = require("../shared/rules");

const root = path.resolve(__dirname, "..");
const sourcePath = path.resolve(root, "..", "ye-swim", "src", "data", "seed.json");
const fallbackPath = path.resolve(root, "..", "ye-swim", "src", "data", "seed.example.json");
const outputPath = path.join(root, "cloudbase.seed.json");
const outputDir = path.join(root, "dist", "cloudbase-seed");
const adminPassword = process.env.ADMIN_PASSWORD || "1324";
const memberPassword = process.env.DEFAULT_PASSWORD || "1234";

function defaultPasswordForRole(role) {
  return role === "admin" ? adminPassword : memberPassword;
}

function readSeed() {
  const file = fs.existsSync(sourcePath) ? sourcePath : fallbackPath;
  if (!fs.existsSync(file)) {
    throw new Error("找不到 seed.json 或 seed.example.json");
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function salt() {
  return crypto.randomBytes(16).toString("hex");
}

function hashPassword(password, passwordSalt) {
  return crypto.pbkdf2Sync(String(password), passwordSalt, 120000, 32, "sha256").toString("hex");
}

function accountDoc(account, role, attrs) {
  const passwordSalt = salt();
  return Object.assign(
    {
      account,
      role,
      status: "active",
      passwordSalt,
      passwordHash: hashPassword(defaultPasswordForRole(role), passwordSalt),
      openid: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    attrs || {}
  );
}

function normalizeDate(value) {
  return value || "";
}

function uniqueCoaches(members, schedules) {
  const names = new Set();
  members.forEach((member) => {
    if (member.coach && member.coach !== "未分配") names.add(member.coach);
  });
  schedules.forEach((schedule) => {
    if (schedule.coach && schedule.coach !== "未分配") names.add(schedule.coach);
  });
  return Array.from(names).sort((a, b) => a.localeCompare(b, "zh-CN-u-co-pinyin"));
}

function memberDoc(member, index) {
  return {
    _id: member.id,
    memberNo: member.memberNo || index + 1,
    chineseName: member.chineseName,
    englishName: member.englishName || "",
    gender: member.gender || "",
    phone: member.phone || "",
    wechat: member.wechat || "",
    campus: member.campus || "",
    coach: member.coach || "",
    productId: member.productId || "",
    productName: member.productName || "",
    productType: member.productType || "class_pack",
    totalLessons: Number(member.totalLessons || 0),
    cardStartDate: normalizeDate(member.cardStartDate),
    cardExpireDate: normalizeDate(member.cardExpireDate),
    campStartDate: normalizeDate(member.campStartDate),
    campEndDate: normalizeDate(member.campEndDate),
    notes: member.notes || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function scheduleDoc(schedule) {
  return {
    _id: schedule.id,
    lessonDate: schedule.lessonDate,
    lessonTime: schedule.lessonTime,
    weekday: schedule.weekday || "",
    campus: schedule.campus || "",
    coach: schedule.coach || "未分配",
    memberId: schedule.memberId,
    memberName: schedule.memberName,
    attended: Boolean(schedule.attended),
    lessonStatus: schedule.lessonStatus || "pending",
    source: schedule.source || "seed",
    sourceRow: schedule.sourceRow || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function attendanceDoc(log) {
  return {
    _id: log.id,
    attendanceDate: log.attendanceDate,
    memberId: log.memberId,
    memberName: log.memberName,
    coach: log.coach || "",
    campus: log.campus || "",
    lessonsDeducted: Number(log.lessonsDeducted || 0),
    sourceScheduleId: log.sourceScheduleId || "",
    source: log.source || "seed",
    sourceNote: log.sourceNote || "",
    createdAt: new Date().toISOString()
  };
}

function main() {
  const seed = readSeed();
  const coaches = uniqueCoaches(seed.members || [], seed.schedules || []);
  const accounts = [
    accountDoc("yeats", "admin", {
      fullName: "管理员"
    })
  ];

  coaches.forEach((coachName, index) => {
    const account = "jl" + String(index + 1).padStart(3, "0");
    const sample = (seed.members || []).find((member) => member.coach === coachName) || {};
    accounts.push(
      accountDoc(account, "coach", {
        fullName: coachName,
        coachName,
        campus: sample.campus || ""
      })
    );
  });

  const sortedMembers = (seed.members || []).slice().sort((a, b) =>
    a.chineseName.localeCompare(b.chineseName, "zh-CN-u-co-pinyin", {
      numeric: true,
      sensitivity: "base"
    })
  );

  sortedMembers.forEach((member, index) => {
    const account = "xy" + String(index + 1).padStart(3, "0");
    accounts.push(
      accountDoc(account, "student", {
        fullName: member.chineseName,
        memberId: member.id,
        campus: member.campus || ""
      })
    );
  });

  const output = {
    exportedAt: new Date().toISOString(),
    collections: {
      accounts,
      courseProducts: (seed.products || []).map((product) => ({
        _id: product.id,
        name: product.name,
        type: product.type,
        totalLessons: Number(product.totalLessons || 0),
        validDays: product.validDays,
        price: Number(product.price || 0),
        notes: product.notes || "",
        createdAt: new Date().toISOString()
      })),
      members: (seed.members || []).map(memberDoc),
      schedules: (seed.schedules || []).map(scheduleDoc),
      attendanceLogs: (seed.attendanceLogs || []).map(attendanceDoc),
      availabilitySlots: [],
      bookingRequests: [],
      courseApplications: [],
      auditLogs: []
    },
    stats: {
      accounts: accounts.length,
      coaches: coaches.length,
      students: sortedMembers.length,
      members: (seed.members || []).length,
      schedules: (seed.schedules || []).length,
      attendanceLogs: (seed.attendanceLogs || []).length
    },
    defaults: {
      adminPassword,
      memberPassword,
      accountRule: "yeats / jl001... / xy001..."
    }
  };

  fs.mkdirSync(outputDir, { recursive: true });
  Object.entries(output.collections).forEach(([collection, rows]) => {
    fs.writeFileSync(path.join(outputDir, collection + ".json"), JSON.stringify(rows, null, 2), "utf8");
  });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf8");
  console.log("CloudBase seed exported");
  console.log(output.stats);
  console.log("output:", outputPath);
  console.log("collection files:", outputDir);
  console.log("admin password:", adminPassword);
  console.log("coach/student password:", memberPassword);
  console.log("booking min date now:", rules.minStudentBookingDate());
}

main();
