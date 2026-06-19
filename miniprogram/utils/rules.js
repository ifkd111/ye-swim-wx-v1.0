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

function bookingRuleText(now) {
  return shanghaiNow(now).getHours() >= 20
    ? "20:00 后只能申请后天及之后课程"
    : "今天不能预约当天课程，最早可申请明天课程";
}

function lessonDeduction(productType) {
  return productType === "monthly" || productType === "camp" || productType === "vip" ? 0 : 1;
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
  bookingRuleText,
  lessonDeduction,
  memberStatus
};
