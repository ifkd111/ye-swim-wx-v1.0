const assert = require("assert");
const XLSX = require("xlsx");
const peopleImport = require("../cloudfunctions/api/people-import");

function workbookBuffer(coaches, students) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(coaches), "教练");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(students), "学员");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function main() {
  const valid = peopleImport.parseWorkbook(workbookBuffer(
    [["说明"], ["教练姓名*", "手机号*", "状态", "备注"], ["陈教练", "13900000001", "启用", "主教练"]],
    [["说明"], ["学员姓名*", "家长手机号*", "总课时*", "已上课时", "剩余课时（自动）"], ["王大宝", "13900000002", 20, 5, 15], ["王二宝", "13900000002", 20, 7, 13]]
  ), "名单.xlsx");
  assert.strictEqual(valid.errors.length, 0);
  assert.strictEqual(valid.coaches.length, 1);
  assert.strictEqual(valid.students.length, 2);
  assert.strictEqual(valid.students[0].phone, valid.students[1].phone, "同一手机号必须允许绑定多名不同学员");

  const invalid = peopleImport.parseWorkbook(workbookBuffer(
    [["教练姓名", "手机号"], ["陈教练", "13900000003"]],
    [["学员姓名", "家长手机号", "总课时", "已上课时"], ["小雨", "13900000003", 10, 1], ["小雨", "13900000003", 10, 1]]
  ), "冲突.xlsx");
  assert(invalid.errors.some((item) => /同时作为教练和家长/.test(item.message)), "同一手机号跨角色必须报错");
  assert(invalid.errors.some((item) => /同名学员/.test(item.message)), "重复学员行必须报错");

  const warning = peopleImport.parseWorkbook(workbookBuffer(
    [["教练姓名", "手机号"]],
    [["学员姓名", "家长手机号", "总课时", "已上课时", "剩余课时"], ["豆苗", "13900000004", 20, 3, 99]]
  ), "提醒.xlsx");
  assert.strictEqual(warning.errors.length, 0);
  assert.strictEqual(warning.warnings.length, 1, "错误的剩余课时公式只提醒，系统仍按总减已上计算");
  console.log("V2.1.5 people import tests passed");
}

main();
