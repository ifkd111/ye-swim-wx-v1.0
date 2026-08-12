const XLSX = require("xlsx");

const HEADER_ALIASES = {
  coachName: ["教练姓名", "姓名", "教练"],
  studentName: ["学员姓名", "学生姓名", "孩子姓名", "姓名", "学员"],
  phone: ["手机号", "手机号码", "联系电话", "家长手机号", "教练手机号", "登录手机号"],
  status: ["状态", "账号状态"],
  totalLessons: ["总课时", "总课时数", "购买课时"],
  usedLessons: ["已上课时", "已用课时", "已消课时", "已上"],
  remainingLessons: ["剩余课时（自动）", "剩余课时(自动)", "剩余课时", "余课"],
  notes: ["备注", "说明"]
};

function clean(value) {
  return String(value === undefined || value === null ? "" : value).replace(/^\uFEFF/, "").trim();
}

function normalizeHeader(value) {
  return clean(value).replace(/[\s_\-—*＊]/g, "").replace(/[（]/g, "(").replace(/[）]/g, ")").toLowerCase();
}

function normalizedAliases(field) {
  return (HEADER_ALIASES[field] || []).map(normalizeHeader);
}

function fieldIndex(header, field) {
  const aliases = normalizedAliases(field);
  return header.findIndex((value) => aliases.indexOf(normalizeHeader(value)) >= 0);
}

function findHeader(rows, type) {
  const nameField = type === "coach" ? "coachName" : "studentName";
  for (let index = 0; index < Math.min(rows.length, 25); index += 1) {
    const row = rows[index] || [];
    if (fieldIndex(row, nameField) >= 0 && fieldIndex(row, "phone") >= 0) {
      return { rowIndex: index, row };
    }
  }
  return null;
}

function sheetRows(workbook, type) {
  const names = workbook.SheetNames || [];
  const keyword = type === "coach" ? "教练" : "学员";
  let name = names.find((item) => clean(item).indexOf(keyword) >= 0);
  if (!name) name = names[type === "coach" ? 0 : 1];
  if (!name || !workbook.Sheets[name]) return { sheetName: "", rows: [] };
  return {
    sheetName: name,
    rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: "", raw: false, blankrows: false })
  };
}

function parseInteger(value) {
  const text = clean(value).replace(/,/g, "");
  if (text === "") return null;
  const number = Number(text);
  return Number.isInteger(number) ? number : NaN;
}

function normalizePhone(value) {
  return clean(value).replace(/\D/g, "");
}

function phoneValid(phone) {
  return /^1\d{10}$/.test(phone);
}

function statusValue(value) {
  const text = clean(value).toLowerCase();
  if (!text || ["启用", "正常", "active", "在职"].indexOf(text) >= 0) return "active";
  if (["停用", "禁用", "disabled", "离职"].indexOf(text) >= 0) return "disabled";
  return "";
}

function parseCoachRows(rows, headerInfo) {
  const header = headerInfo.row;
  const indexes = {
    name: fieldIndex(header, "coachName"),
    phone: fieldIndex(header, "phone"),
    status: fieldIndex(header, "status"),
    notes: fieldIndex(header, "notes")
  };
  return rows.slice(headerInfo.rowIndex + 1).map((row, offset) => ({
    kind: "coach",
    rowNumber: headerInfo.rowIndex + offset + 2,
    name: clean(row[indexes.name]),
    phone: normalizePhone(row[indexes.phone]),
    status: indexes.status >= 0 ? statusValue(row[indexes.status]) : "active",
    rawStatus: indexes.status >= 0 ? clean(row[indexes.status]) : "",
    notes: indexes.notes >= 0 ? clean(row[indexes.notes]) : ""
  })).filter((row) => row.name || row.phone || row.rawStatus || row.notes);
}

function parseStudentRows(rows, headerInfo) {
  const header = headerInfo.row;
  const indexes = {
    name: fieldIndex(header, "studentName"),
    phone: fieldIndex(header, "phone"),
    total: fieldIndex(header, "totalLessons"),
    used: fieldIndex(header, "usedLessons"),
    remaining: fieldIndex(header, "remainingLessons"),
    notes: fieldIndex(header, "notes")
  };
  return rows.slice(headerInfo.rowIndex + 1).map((row, offset) => ({
    kind: "student",
    rowNumber: headerInfo.rowIndex + offset + 2,
    name: clean(row[indexes.name]),
    phone: normalizePhone(row[indexes.phone]),
    totalLessons: indexes.total >= 0 ? parseInteger(row[indexes.total]) : null,
    usedLessons: indexes.used >= 0 ? parseInteger(row[indexes.used]) : null,
    remainingLessons: indexes.remaining >= 0 ? parseInteger(row[indexes.remaining]) : null,
    notes: indexes.notes >= 0 ? clean(row[indexes.notes]) : ""
  })).filter((row) => row.name || row.phone || row.totalLessons !== null || row.usedLessons !== null || row.notes);
}

function issue(kind, row, message) {
  return { kind, rowNumber: row.rowNumber, name: row.name || "未填写姓名", message };
}

function validate(coaches, students) {
  const errors = [];
  const warnings = [];
  const coachPhones = {};
  const studentKeys = {};
  const studentPhones = {};

  coaches.forEach((row) => {
    if (!row.name) errors.push(issue("coach", row, "教练姓名不能为空"));
    if (!phoneValid(row.phone)) errors.push(issue("coach", row, "手机号必须是 11 位大陆手机号"));
    if (!row.status) errors.push(issue("coach", row, "状态仅支持启用或停用"));
    if (row.phone && coachPhones[row.phone]) errors.push(issue("coach", row, "教练手机号与第 " + coachPhones[row.phone] + " 行重复"));
    if (row.phone) coachPhones[row.phone] = row.rowNumber;
  });

  students.forEach((row) => {
    if (!row.name) errors.push(issue("student", row, "学员姓名不能为空"));
    if (!phoneValid(row.phone)) errors.push(issue("student", row, "家长手机号必须是 11 位大陆手机号"));
    if (!Number.isInteger(row.totalLessons) || row.totalLessons < 0 || row.totalLessons > 99999) errors.push(issue("student", row, "总课时需为 0 至 99999 的整数"));
    if (!Number.isInteger(row.usedLessons) || row.usedLessons < 0 || row.usedLessons > 99999) errors.push(issue("student", row, "已上课时需为 0 至 99999 的整数"));
    if (Number.isInteger(row.remainingLessons) && Number.isInteger(row.totalLessons) && Number.isInteger(row.usedLessons) && row.remainingLessons !== row.totalLessons - row.usedLessons) {
      warnings.push(issue("student", row, "剩余课时将按“总课时－已上课时”重新计算"));
    }
    const key = row.phone + "|" + row.name;
    if (row.phone && row.name && studentKeys[key]) errors.push(issue("student", row, "同名学员与第 " + studentKeys[key] + " 行重复"));
    if (row.phone && row.name) studentKeys[key] = row.rowNumber;
    if (row.phone) studentPhones[row.phone] = true;
  });

  Object.keys(coachPhones).forEach((phone) => {
    if (studentPhones[phone]) errors.push({ kind: "file", rowNumber: 0, name: phone, message: "同一手机号不能同时作为教练和家长账号" });
  });
  return { errors, warnings };
}

function readWorkbook(buffer, fileName) {
  try {
    return XLSX.read(buffer, { type: "buffer", cellDates: false, raw: false });
  } catch (error) {
    const suffix = /\.et$/i.test(clean(fileName)) ? "；当前 ET 文件无法识别，请在 WPS 中另存为 XLSX 后重试" : "";
    throw new Error("表格文件无法解析" + suffix);
  }
}

function parseWorkbook(buffer, fileName) {
  const workbook = readWorkbook(buffer, fileName);
  const coachSheet = sheetRows(workbook, "coach");
  const studentSheet = sheetRows(workbook, "student");
  const coachHeader = findHeader(coachSheet.rows, "coach");
  const studentHeader = findHeader(studentSheet.rows, "student");
  if (!coachHeader) throw new Error("教练工作表缺少“教练姓名、手机号”标题");
  if (!studentHeader) throw new Error("学员工作表缺少“学员姓名、家长手机号”标题");
  const coaches = parseCoachRows(coachSheet.rows, coachHeader);
  const students = parseStudentRows(studentSheet.rows, studentHeader);
  if (!coaches.length && !students.length) throw new Error("表格中没有可导入的教练或学员");
  if (coaches.length + students.length > 1500) throw new Error("单次导入最多 1500 人，请拆分表格后重试");
  const checked = validate(coaches, students);
  return {
    fileName: clean(fileName),
    sheets: { coaches: coachSheet.sheetName, students: studentSheet.sheetName },
    coaches,
    students,
    errors: checked.errors,
    warnings: checked.warnings
  };
}

module.exports = { parseWorkbook, normalizeHeader };
