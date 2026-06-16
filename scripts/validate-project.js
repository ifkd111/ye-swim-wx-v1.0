const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const appJsonPath = path.join(root, "miniprogram", "app.json");
const projectConfigPath = path.join(root, "project.config.json");
const cloudApiPath = path.join(root, "cloudfunctions", "api", "index.js");
const envPath = path.join(root, "miniprogram", "env.js");
const loginWxmlPath = path.join(root, "miniprogram", "pages", "login", "login.wxml");
const packageJsonPath = path.join(root, "package.json");

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
  assert(exists(envPath), "缺少 miniprogram/env.js");
  assert(exists(loginWxmlPath), "缺少登录页 WXML");

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

  const pkg = readJson(packageJsonPath);
  const envSource = fs.readFileSync(envPath, "utf8");
  const versionMatch = envSource.match(/version:\s*["']([^"']+)["']/);
  assert(versionMatch && versionMatch[1] === pkg.version, "miniprogram/env.js 版本号应与 package.json 一致");

  const useMockMatch = envSource.match(/useMock:\s*(true|false)/);
  const loginSource = fs.readFileSync(loginWxmlPath, "utf8");
  if (useMockMatch && useMockMatch[1] === "false") {
    ["1324", "1234", "yeats", "jl001", "xy001"].forEach((hint) => {
      assert(!loginSource.includes(hint), "正式环境登录页不应展示默认账号或密码：" + hint);
    });
  }

  const apiSource = fs.readFileSync(cloudApiPath, "utf8");
  [
    "login",
    "getHomeData",
    "saveMember",
    "bulkImportMembers",
    "saveAccount",
    "resetAccountPassword",
    "changeMyPassword",
    "createBookingRequest",
    "approveBookingRequest",
    "rejectBookingRequest",
    "cancelBookingRequest",
    "markAttendance",
    "cancelSchedule",
    "approveCourseApplication",
    "rejectCourseApplication",
    "createAvailabilitySlot",
    "createAvailabilitySlots",
    "publishAvailabilitySlot",
    "createManualSchedule",
    "createCourseApplication"
  ].forEach((action) => {
    assert(apiSource.includes(action), "云函数缺少 action：" + action);
  });

  console.log("Project validation passed");
}

main();
