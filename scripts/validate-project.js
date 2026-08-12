const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const appJsonPath = path.join(root, "miniprogram", "app.json");
const projectConfigPath = path.join(root, "project.config.json");
const cloudApiPath = path.join(root, "cloudfunctions", "api", "index.js");
const cloudConfigPath = path.join(root, "cloudfunctions", "api", "config.json");
const envPath = path.join(root, "miniprogram", "env.js");
const loginWxmlPath = path.join(root, "miniprogram", "pages", "login", "login.wxml");
const packageJsonPath = path.join(root, "package.json");
const packageLockPath = path.join(root, "package-lock.json");
const qrCodePath = path.join(root, "miniprogram", "utils", "qrcode.js");

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
  assert(exists(cloudConfigPath), "缺少 cloudfunctions/api/config.json");
  assert(exists(envPath), "缺少 miniprogram/env.js");
  assert(exists(loginWxmlPath), "缺少登录页 WXML");
  assert(exists(qrCodePath), "缺少二维码绘制工具");

  const appJson = readJson(appJsonPath);
  assert(Array.isArray(appJson.pages) && appJson.pages.length === 10, "V2.1 应保留 10 个必要页面");

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
  const lock = readJson(packageLockPath);
  assert(lock.version === pkg.version && lock.packages && lock.packages[""] && lock.packages[""].version === pkg.version, "package-lock.json 版本号应与 package.json 一致");
  const envSource = fs.readFileSync(envPath, "utf8");
  const versionMatch = envSource.match(/version:\s*["']([^"']+)["']/);
  assert(versionMatch && versionMatch[1] === pkg.version, "miniprogram/env.js 版本号应与 package.json 一致");

  const useMockMatch = envSource.match(/useMock:\s*(true|false)/);
  const envConfig = require(envPath);
  const loginSource = fs.readFileSync(loginWxmlPath, "utf8");
  if (useMockMatch && useMockMatch[1] === "false") {
    assert(!envConfig.testLogin || !envConfig.testLogin.enabled, "正式环境不应开启测试登录入口");
    assert(!envConfig.testLogin || !envConfig.testLogin.phone, "正式环境不应内置测试手机号");
    ["1324", "1234", "yeats", "jl001", "xy001"].forEach((hint) => {
      assert(!loginSource.includes(hint), "正式环境登录页不应展示默认账号或密码：" + hint);
    });
  }

  const apiSource = fs.readFileSync(cloudApiPath, "utf8");
  const cloudConfig = readJson(cloudConfigPath);
  const openapiPermissions = cloudConfig.permissions && cloudConfig.permissions.openapi || [];
  assert(openapiPermissions.includes("phonenumber.getPhoneNumber"), "云函数缺少微信手机号接口权限");
  assert(openapiPermissions.includes("wxacode.getUnlimited"), "云函数缺少小程序码生成接口权限");
  const qr = require(qrCodePath);
  const qrMatrix = qr.createMatrix("YS:ABC12345");
  assert(qrMatrix.length === 21 && qrMatrix[0].length === 21, "二维码矩阵尺寸异常");
  assert(qrMatrix.reduce((sum, row) => sum + row.filter(Boolean).length, 0) > 100, "二维码矩阵内容异常");
  assert(JSON.stringify(qr.reedSolomonGenerator(7)) === JSON.stringify([127, 122, 154, 164, 11, 68, 117]), "二维码纠错多项式异常");

  [
    "login",
    "loginByPhone",
    "loginForTest",
    "getHomeData",
    "consumptionHomeData",
    "dailyCoachCode",
    "registrationContext",
    "submitRegistration",
    "registrationAdminData",
    "rotateRegistrationInvite",
    "reviewRegistration",
    "checkinContext",
    "confirmDailyCheckin",
    "bindMemberGuardian",
    "reverseConsumption",
    "adjustConsumption",
    "manualConsumption",
    "addMemberLessons",
    "bulkUpdateMemberStatus",
    "listPagedData",
    "saveMember",
    "bulkImportMembers",
    "saveAccount",
    "resetAccountPassword",
    "changeMyPassword",
    "unbindAccountWechat",
    "saveWeeklyAvailabilityTemplate",
    "createBookingRequest",
    "approveBookingRequest",
    "rejectBookingRequest",
    "cancelBookingRequest",
    "markAttendance",
    "verifyScheduleQr",
    "submitLessonFeedback",
    "createLeaveRequest",
    "approveLeaveRequest",
    "rejectLeaveRequest",
    "createMakeupSchedule",
    "cancelSchedule",
    "approveCourseApplication",
    "rejectCourseApplication",
    "createAvailabilitySlot",
    "createAvailabilitySlots",
    "publishAvailabilitySlot",
    "closeAvailabilitySlot",
    "createManualSchedule",
    "createCourseApplication"
  ].forEach((action) => {
    assert(apiSource.includes(action), "云函数缺少 action：" + action);
  });

  console.log("Project validation passed");
}

main();
