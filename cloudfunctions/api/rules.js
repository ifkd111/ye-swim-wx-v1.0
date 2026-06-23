function normalizeAccount(value) {
  return String(value || "").trim().toLowerCase();
}

function roleFromAccount(account) {
  const normalized = normalizeAccount(account);
  if (normalized === "yeats") return "admin";
  if (normalized.indexOf("jl") === 0) return "coach";
  if (normalized.indexOf("xy") === 0) return "student";
  return null;
}

function shanghaiNow(now) {
  const source = now ? new Date(now) : new Date();
  return new Date(source.toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
}

function formatDateChina(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

function toDate(value) {
  return new Date(String(value || "") + "T00:00:00");
}

function daysFromToday(value, now) {
  const today = toDate(formatDateChina(shanghaiNow(now)));
  return Math.floor((toDate(value) - today) / 86400000);
}

function dayLabel(value, now) {
  const diff = daysFromToday(value, now);
  if (diff === 0) return "今天";
  if (diff === 1) return "明天";
  if (diff === 2) return "后天";
  if (diff === -1) return "昨天";
  const week = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return String(value || "") + " " + week[toDate(value).getDay()];
}

function sortByDateTime(a, b, dateField, timeField) {
  const dateKey = dateField || "lessonDate";
  const timeKey = timeField || "lessonTime";
  return (String(a[dateKey] || "") + String(a[timeKey] || "")).localeCompare(String(b[dateKey] || "") + String(b[timeKey] || ""));
}

function minStudentBookingDate(now) {
  const current = shanghaiNow(now);
  const min = new Date(current);
  min.setDate(min.getDate() + (current.getHours() >= 20 ? 2 : 1));
  return formatDateChina(min);
}

function isBookableForStudent(slotDate, now) {
  return String(slotDate || "") >= minStudentBookingDate(now);
}

function lessonDeduction(productType) {
  return productType === "monthly" || productType === "camp" || productType === "vip" ? 0 : 1;
}

function normalizeVerificationCode(value) {
  const raw = String(value || "").trim().toUpperCase();
  const markerIndex = raw.indexOf("YS:");
  const code = markerIndex >= 0 ? raw.slice(markerIndex + 3) : raw;
  return code.replace(/[^0-9A-Z]/g, "").slice(0, 16);
}

function stableCode(value) {
  const source = String(value || "YE-SWIM");
  let hash = 5381;
  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash * 33) ^ source.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36).toUpperCase().padStart(8, "0").slice(-8);
}

function verificationCodeForSchedule(schedule) {
  if (schedule && schedule.verificationCode) return normalizeVerificationCode(schedule.verificationCode);
  const seed = [
    schedule && (schedule._id || schedule.id || schedule.businessId),
    schedule && schedule.lessonDate,
    schedule && schedule.lessonTime,
    schedule && schedule.memberId,
    schedule && schedule.memberName
  ].join("|");
  return stableCode(seed);
}

function verificationPayload(code) {
  return "YS:" + normalizeVerificationCode(code);
}

function verificationExpiresAt(lessonDate) {
  const date = toDate(lessonDate);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + 7);
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
}

function verificationStatus(schedule, now) {
  if (!schedule) return "missing";
  if (schedule.verifiedAt || schedule.lessonStatus === "completed") return "verified";
  const expiresAt = schedule.verificationExpiresAt || verificationExpiresAt(schedule.lessonDate);
  if (expiresAt && new Date(expiresAt).getTime() < shanghaiNow(now).getTime()) return "expired";
  return "active";
}

function memberStatus(member, usedLessons) {
  const total = Number(member.totalLessons || 0);
  const productType = member.productType || "class_pack";
  const remaining = productType === "monthly" || productType === "camp" || productType === "vip"
    ? total
    : total - Number(usedLessons || 0);

  if (productType === "monthly" || productType === "camp" || productType === "vip") return { remaining, status: "正常" };
  if (remaining < 0) return { remaining, status: "欠课" };
  if (remaining === 0) return { remaining, status: "已完成" };
  if (remaining <= 5) return { remaining, status: "即将用完" };
  return { remaining, status: "正常" };
}

module.exports = {
  normalizeAccount,
  roleFromAccount,
  shanghaiNow,
  formatDateChina,
  toDate,
  daysFromToday,
  dayLabel,
  sortByDateTime,
  minStudentBookingDate,
  isBookableForStudent,
  lessonDeduction,
  normalizeVerificationCode,
  verificationCodeForSchedule,
  verificationPayload,
  verificationExpiresAt,
  verificationStatus,
  memberStatus
};
