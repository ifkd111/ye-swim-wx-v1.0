const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const XLSX = require("xlsx");
const rules = require("../shared/rules");

const root = path.resolve(__dirname, "..");
const sourcePath =
  process.env.ATTENDANCE_XLSX ||
  path.resolve(root, "..", "ye-swim-private-backup", "出勤测试(2).xlsx");
const privateDir = path.join(root, "private-output");
const outputPath = path.join(root, "cloudbase.seed.json");
const outputDir = path.join(root, "dist", "cloudbase-seed");
const accountCsvPath = path.join(privateDir, "ye-swim-wx-accounts.csv");
const accountJsonPath = path.join(privateDir, "ye-swim-wx-accounts.json");

const adminPassword = process.env.ADMIN_PASSWORD || "1324";
const memberPassword = process.env.DEFAULT_PASSWORD || "1234";
const year = Number(process.env.ATTENDANCE_YEAR || 2026);
const campusCoach = {};

function hashPassword(password, passwordSalt) {
  return crypto.pbkdf2Sync(String(password), passwordSalt, 120000, 32, "sha256").toString("hex");
}

function salt() {
  return crypto.randomBytes(16).toString("hex");
}

function accountDoc(account, role, attrs) {
  const passwordSalt = salt();
  return Object.assign(
    {
      account,
      role,
      status: "active",
      passwordSalt,
      passwordHash: hashPassword(role === "admin" ? adminPassword : memberPassword, passwordSalt),
      openid: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    attrs || {}
  );
}

function cleanText(value) {
  return String(value === undefined || value === null ? "" : value).replace(/\s+/g, " ").trim();
}

function normalizeCampus(value) {
  const campus = cleanText(value);
  if (campus === "金地国际") return "国际金地";
  return campus;
}

function isNumberLike(value) {
  return typeof value === "number" || /^\d+(\.\d+)?$/.test(cleanText(value));
}

function normalizeName(value) {
  let name = cleanText(value);
  if (!name) return "";
  if (/^\d+(\.\d+)?$/.test(name)) return "";
  if (/^(门票|签到|日期|时间|校点|表示|临时|有问题|私教|白底|姓名|性别|会员|支付)/.test(name)) return "";
  name = name.replace(/新人做新/g, "新人").replace(/生日/g, "");
  return name.trim();
}

function stableId(prefix, value) {
  const hash = crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 12);
  return prefix + "-" + hash;
}

function pad(value, length) {
  return String(value).padStart(length, "0");
}

function comparePinyin(a, b) {
  return cleanText(a).localeCompare(cleanText(b), "zh-CN-u-co-pinyin", {
    numeric: true,
    sensitivity: "base"
  });
}

function parseMonthDay(value) {
  if (value === undefined || value === null || value === "") return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return rules.formatDateChina(value);
  if (typeof value === "number") {
    const month = Math.floor(value);
    const day = Math.round((value - month) * 100);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return year + "-" + pad(month, 2) + "-" + pad(day, 2);
    return "";
  }
  const text = cleanText(value).replace(/[年月]/g, ".").replace(/[日号]/g, "");
  let match = text.match(/(20\d{2})[./-](\d{1,2})[./-](\d{1,2})/);
  if (match) return match[1] + "-" + pad(match[2], 2) + "-" + pad(match[3], 2);
  match = text.match(/(\d{1,2})[./-](\d{1,2})/);
  if (match) return year + "-" + pad(match[1], 2) + "-" + pad(match[2], 2);
  return "";
}

function parseTime(value) {
  if (value === undefined || value === null || value === "") return "";
  const raw = cleanText(value).replace("：", ":");
  let hour = 0;
  let minute = 0;
  if (/^\d{1,2}:\d{2}$/.test(raw)) {
    const parts = raw.split(":");
    hour = Number(parts[0]);
    minute = Number(parts[1]);
  } else if (/^\d{3,4}$/.test(raw)) {
    const padded = raw.padStart(4, "0");
    hour = Number(padded.slice(0, 2));
    minute = Number(padded.slice(2));
  } else if (/^\d{1,2}点/.test(raw)) {
    hour = Number(raw.match(/^(\d{1,2})/)[1]);
  } else if (typeof value === "number" && value < 24) {
    hour = Math.floor(value);
    minute = Math.round((value - hour) * 60);
  } else {
    return "";
  }
  if (hour > 0 && hour < 8) hour += 12;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
  const start = pad(hour, 2) + ":" + pad(minute, 2);
  let endHour = hour + 1;
  let endMinute = minute;
  if (endHour > 23) {
    endHour = 23;
    endMinute = 59;
  }
  return start + "-" + pad(endHour, 2) + ":" + pad(endMinute, 2);
}

function inferProduct(payment) {
  const text = cleanText(payment);
  const match = text.match(/(\d+)\s*次/);
  const total = match ? Number(match[1]) : text.indexOf("50") >= 0 ? 50 : text.indexOf("10") >= 0 ? 10 : 20;
  return {
    productId: "product-class-pack-" + total,
    productName: total + "次卡",
    productType: "class_pack",
    totalLessons: total,
    paymentNote: text
  };
}

function collectChargeSheet(sheet, memberMap) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  let lastCampus = "";
  let lastName = "";
  rows.slice(1).forEach((row) => {
    const campus = normalizeCampus(row[0]) || lastCampus;
    const name = normalizeName(row[2]) || lastName;
    if (campus) lastCampus = campus;
    if (name) lastName = name;
    if (!name || !campus) return;
    const member = memberMap.get(name) || { name, campuses: new Set(), attendance: [], chargeDates: [] };
    member.campuses.add(campus);
    member.gender = cleanText(row[3]) || member.gender || "";
    member.cardExpireDate = parseMonthDay(row[4]) || member.cardExpireDate || "";
    const product = inferProduct(row[5]);
    member.productId = product.productId;
    member.productName = product.productName;
    member.productType = product.productType;
    member.totalLessons = Math.max(Number(member.totalLessons || 0), product.totalLessons);
    member.notes = [member.notes, product.paymentNote].filter(Boolean).join("；");
    for (let col = 6; col < row.length; col += 1) {
      const date = parseMonthDay(row[col]);
      if (date) member.chargeDates.push(date);
    }
    memberMap.set(name, member);
  });
}

function collectAttendanceSheet(sheet, memberMap, schedules) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  let currentDate = "";
  let currentCampus = "";
  rows.slice(1).forEach((row, rowIndex) => {
    const date = parseMonthDay(row[0]) || currentDate;
    const campus = normalizeCampus(row[1]) || currentCampus;
    if (parseMonthDay(row[0])) currentDate = date;
    if (cleanText(row[1])) currentCampus = campus;
    if (!date || !campus) return;
    const lessonTime = parseTime(row[2]);
    const names = [];
    for (let col = 3; col < Math.min(row.length, 19); col += 1) {
      const name = normalizeName(row[col]);
      if (name) names.push(name);
    }
    if (!names.length) return;
    const coach = campusCoach[campus] || campus + "教练";
    names.forEach((name) => {
      const member = memberMap.get(name) || { name, campuses: new Set(), attendance: [], chargeDates: [] };
      member.campuses.add(campus);
      member.attendance.push({ date, campus, lessonTime, coach });
      if (!member.coach) member.coach = coach;
      memberMap.set(name, member);
    });
    if (lessonTime) {
      schedules.push({
        id: stableId("schedule", [date, campus, lessonTime, names.join("|")].join("|")),
        lessonDate: date,
        lessonTime,
        campus,
        coach,
        memberNames: names,
        sourceRow: rowIndex + 2
      });
    }
  });
}

function buildOutput(memberMap, rawSchedules) {
  const campuses = Array.from(
    new Set(
      Array.from(memberMap.values()).flatMap((member) => Array.from(member.campuses || []))
    )
  ).sort(comparePinyin);
  campuses.forEach((campus) => {
    campusCoach[campus] = campusCoach[campus] || campus + "教练";
  });
  const coaches = campuses.map((campus, index) => ({
    account: "jl" + pad(index + 1, 3),
    coachName: campusCoach[campus],
    campus
  }));

  const members = Array.from(memberMap.values()).sort((a, b) => comparePinyin(a.name, b.name));
  const memberIdByName = {};
  const memberDocs = members.map((member, index) => {
    const campus = Array.from(member.campuses || [])[0] || "";
    const coach = member.coach || campusCoach[campus] || "";
    const attendanceCount = Math.max(member.attendance.length, member.chargeDates.length);
    const totalLessons = Math.max(Number(member.totalLessons || 0), attendanceCount + 5, 20);
    const id = stableId("member", member.name);
    memberIdByName[member.name] = id;
    return {
      _id: id,
      memberNo: index + 1,
      chineseName: member.name,
      englishName: "",
      gender: member.gender || "",
      phone: "",
      wechat: "",
      campus,
      coach,
      productId: member.productId || "product-class-pack-20",
      productName: member.productName || "20次卡",
      productType: member.productType || "class_pack",
      totalLessons,
      cardStartDate: "",
      cardExpireDate: member.cardExpireDate || "",
      campStartDate: "",
      campEndDate: "",
      notes: member.notes || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  });

  const accounts = [
    accountDoc("yeats", "admin", { fullName: "管理员" }),
    ...coaches.map((coach) =>
      accountDoc(coach.account, "coach", {
        fullName: coach.coachName,
        coachName: coach.coachName,
        campus: coach.campus
      })
    ),
    ...memberDocs.map((member, index) =>
      accountDoc("xy" + pad(index + 1, 3), "student", {
        fullName: member.chineseName,
        memberId: member._id,
        campus: member.campus
      })
    )
  ];

  const scheduleDocs = [];
  rawSchedules.forEach((schedule) => {
    schedule.memberNames.forEach((memberName) => {
      const memberId = memberIdByName[memberName];
      if (!memberId) return;
      scheduleDocs.push({
        _id: stableId("schedule", [schedule.id, memberId].join("|")),
        lessonDate: schedule.lessonDate,
        lessonTime: schedule.lessonTime,
        weekday: "",
        campus: schedule.campus,
        coach: schedule.coach,
        memberId,
        memberName,
        attended: true,
        lessonStatus: "completed",
        source: "attendance_xlsx",
        sourceRow: schedule.sourceRow,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    });
  });

  const attendanceLogs = scheduleDocs.map((schedule) => ({
    _id: stableId("attendance", schedule._id),
    attendanceDate: schedule.lessonDate,
    memberId: schedule.memberId,
    memberName: schedule.memberName,
    coach: schedule.coach,
    campus: schedule.campus,
    lessonsDeducted: 1,
    sourceScheduleId: schedule._id,
    source: "attendance_xlsx",
    sourceNote: "出勤测试(2).xlsx 导入",
    createdAt: new Date().toISOString()
  }));

  const today = new Date();
  today.setDate(today.getDate() + 2);
  const bookableDate = rules.formatDateChina(today);
  const availabilitySlots = coaches.slice(0, 6).map((coach, index) => ({
    _id: stableId("slot", [coach.coachName, bookableDate, index].join("|")),
    slotDate: bookableDate,
    slotTime: (17 + (index % 2)) + ":00-" + (18 + (index % 2)) + ":00",
    campus: coach.campus,
    coach: coach.coachName,
    capacity: 4,
    status: "published",
    publishOrder: index + 1,
    notes: "上线测试可预约",
    createdBy: "yeats",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));

  const courseProducts = [
    { _id: "product-class-pack-10", name: "10次卡", type: "class_pack", totalLessons: 10, validDays: 365, price: 0, notes: "次卡出勤扣课", createdAt: new Date().toISOString() },
    { _id: "product-class-pack-20", name: "20次卡", type: "class_pack", totalLessons: 20, validDays: 365, price: 0, notes: "次卡出勤扣课", createdAt: new Date().toISOString() },
    { _id: "product-class-pack-50", name: "50次卡", type: "class_pack", totalLessons: 50, validDays: 365, price: 0, notes: "次卡出勤扣课", createdAt: new Date().toISOString() },
    { _id: "product-monthly", name: "月卡", type: "monthly", totalLessons: 0, validDays: 31, price: 0, notes: "按有效期管理，不扣课时", createdAt: new Date().toISOString() },
    { _id: "product-vip", name: "VIP", type: "vip", totalLessons: 0, validDays: 365, price: 0, notes: "不按次扣课", createdAt: new Date().toISOString() }
  ];

  const accountRows = accounts.map((account) => ({
    account: account.account,
    role: account.role === "admin" ? "管理员" : account.role === "coach" ? "教练" : "学员",
    name: account.fullName || account.coachName || "",
    campus: account.campus || "",
    defaultPassword: account.role === "admin" ? adminPassword : memberPassword
  }));

  return {
    seed: {
      seedVersion: "attendance-xlsx-v1.0.7",
      exportedAt: new Date().toISOString(),
      source: sourcePath,
      collections: {
        accounts,
        courseProducts,
        members: memberDocs,
        schedules: scheduleDocs,
        attendanceLogs,
        availabilitySlots,
        bookingRequests: [],
        courseApplications: [],
        auditLogs: []
      },
      stats: {
        accounts: accounts.length,
        coaches: coaches.length,
        students: memberDocs.length,
        members: memberDocs.length,
        schedules: scheduleDocs.length,
        attendanceLogs: attendanceLogs.length,
        availabilitySlots: availabilitySlots.length
      },
      defaults: {
        adminPassword,
        memberPassword,
        accountRule: "yeats / jl001... / xy001..."
      }
    },
    accountRows
  };
}

function csvEscape(value) {
  const text = cleanText(value);
  return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function main() {
  if (!fs.existsSync(sourcePath)) throw new Error("找不到 Excel：" + sourcePath);
  const workbook = XLSX.readFile(sourcePath, { cellDates: true });
  const memberMap = new Map();
  const rawSchedules = [];
  collectAttendanceSheet(workbook.Sheets["出勤名单"], memberMap, rawSchedules);
  collectChargeSheet(workbook.Sheets["部分收费扣课信息"], memberMap);
  const { seed, accountRows } = buildOutput(memberMap, rawSchedules);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(privateDir, { recursive: true });
  Object.entries(seed.collections).forEach(([collection, rows]) => {
    fs.writeFileSync(path.join(outputDir, collection + ".json"), JSON.stringify(rows, null, 2), "utf8");
  });
  fs.writeFileSync(outputPath, JSON.stringify(seed, null, 2), "utf8");
  fs.writeFileSync(path.join(root, "cloudfunctions", "api", "seed-data.json"), JSON.stringify(seed, null, 2), "utf8");
  fs.writeFileSync(accountJsonPath, JSON.stringify(accountRows, null, 2), "utf8");
  fs.writeFileSync(
    accountCsvPath,
    ["账号,角色,姓名,校区,默认密码"]
      .concat(accountRows.map((row) => [row.account, row.role, row.name, row.campus, row.defaultPassword].map(csvEscape).join(",")))
      .join("\n"),
    "utf8"
  );

  console.log("Attendance Excel seed exported");
  console.log(seed.stats);
  console.log("accounts:", accountCsvPath);
  console.log("seed:", outputPath);
}

main();
