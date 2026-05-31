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
  minStudentBookingDate,
  isBookableForStudent,
  lessonDeduction,
  memberStatus
};
