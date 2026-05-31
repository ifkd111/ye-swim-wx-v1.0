const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const appJsonPath = path.join(root, "miniprogram", "app.json");
const projectConfigPath = path.join(root, "project.config.json");
const cloudApiPath = path.join(root, "cloudfunctions", "api", "index.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function exists(file) {
  return fs.existsSync(file);
}

function main() {
  assert(exists(appJsonPath), "缺少 miniprogram/app.json");
  assert(exists(projectConfigPath), "缺少 project.config.json");
  assert(exists(cloudApiPath), "缺少 cloudfunctions/api/index.js");

  const appJson = readJson(appJsonPath);
  assert(Array.isArray(appJson.pages) && appJson.pages.length >= 10, "页面数量不足");

  appJson.pages.forEach((page) => {
    ["js", "json", "wxml", "wxss"].forEach((ext) => {
      const file = path.join(root, "miniprogram", page + "." + ext);
      assert(exists(file), "页面文件缺失：" + file);
    });
  });

  const config = readJson(projectConfigPath);
  assert(config.miniprogramRoot === "miniprogram/", "miniprogramRoot 应为 miniprogram/");
  assert(config.cloudfunctionRoot === "cloudfunctions/", "cloudfunctionRoot 应为 cloudfunctions/");

  const apiSource = fs.readFileSync(cloudApiPath, "utf8");
  [
    "login",
    "getHomeData",
    "saveMember",
    "bulkImportMembers",
    "saveAccount",
    "createBookingRequest",
    "approveBookingRequest",
    "rejectBookingRequest",
    "markAttendance",
    "createAvailabilitySlot",
    "publishAvailabilitySlot",
    "createManualSchedule",
    "createCourseApplication"
  ].forEach((action) => {
    assert(apiSource.includes(action), "云函数缺少 action：" + action);
  });

  console.log("Project validation passed");
}

main();
