const fs = require("fs");
const path = require("path");
const automator = require("miniprogram-automator");

const root = path.resolve(__dirname, "..");
const cliPath = process.env.WECHAT_DEVTOOLS_CLI || "C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat";
const phone = String(process.env.OWNER_AUDIT_PHONE || "").trim();
const password = String(process.env.OWNER_AUDIT_PASSWORD || "");
const version = String(process.env.REVIEW_VERSION || require(path.join(root, "package.json")).version);
const outputDir = path.join(root, "artifacts", "review-" + version);
const captureScreenshots = process.env.CAPTURE_AUTOMATOR_SCREENSHOTS === "true";

function requireSecret(value, name) {
  if (!value) throw new Error("缺少环境变量 " + name);
  return value;
}

async function screenshot(miniProgram, name) {
  const file = path.join(outputDir, name + ".png");
  if (!captureScreenshots) return "";
  await Promise.race([
    miniProgram.screenshot({ path: file }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("自动化截图超时：" + name)), 10000))
  ]);
  return file;
}

async function reLaunchStable(miniProgram, url, expectedPath) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await miniProgram.reLaunch(url);
    } catch (error) {
      if (!/timeout/i.test(String(error && error.message || error))) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1800));
    const page = await miniProgram.currentPage();
    if (page && page.path === expectedPath) return page;
  }
  return waitForPath(miniProgram, expectedPath, 20000);
}

async function waitForPath(miniProgram, expected, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const page = await miniProgram.currentPage();
    if (page && page.path === expected) return page;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  const page = await miniProgram.currentPage();
  throw new Error("页面跳转失败，当前页面：" + (page && page.path || "未知"));
}

async function waitForData(page, predicate, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const data = await page.data();
    if (predicate(data)) return data;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  const data = await page.data();
  throw new Error("页面数据加载超时：" + page.path + (data.loadError || data.codeError ? "；" + (data.loadError || data.codeError) : ""));
}

async function main() {
  requireSecret(phone, "OWNER_AUDIT_PHONE");
  requireSecret(password, "OWNER_AUDIT_PASSWORD");
  fs.mkdirSync(outputDir, { recursive: true });

  console.log("[1/6] 连接微信开发者工具");
  const miniProgram = process.env.AUTOMATOR_WS_ENDPOINT
    ? await automator.connect({ wsEndpoint: process.env.AUTOMATOR_WS_ENDPOINT })
    : await automator.launch({ projectPath: root, cliPath, trustProject: true, timeout: 60000 });
  const errors = [];
  miniProgram.on("exception", (error) => errors.push(String(error && error.message || error)));

  try {
    console.log("[2/6] 清理本地会话并打开登录页");
    await miniProgram.callWxMethod("clearStorageSync");
    let page = await reLaunchStable(miniProgram, "/pages/login/login", "pages/login/login");
    await page.waitFor(900);
    await page.setData({ mode: "password", account: phone, password });
    await screenshot(miniProgram, "01-owner-login");
    console.log("[3/6] 使用真实云环境验证老板密码");
    await page.callMethod("login");

    page = await waitForPath(miniProgram, "pages/admin/admin", 15000);
    const home = await waitForData(page, (data) => Boolean(data.viewer && data.viewer.role === "admin" && !data.loading && !data.codeLoading), 20000);
    if (home.viewer.phone !== phone) throw new Error("登录成功但老板手机号不匹配");
    if (!home.code || !home.code.fileId) throw new Error("老板首页未生成今日教练码：" + (home.codeError || "未知原因"));
    await screenshot(miniProgram, "02-owner-home");
    console.log("[4/6] 老板首页与今日教练码通过");

    await page.callMethod("goRegistration");
    page = await waitForPath(miniProgram, "pages/admin-registration/admin-registration", 10000);
    const registration = await waitForData(page, (data) => !data.loading && Array.isArray(data.invites), 20000);
    if (registration.loadError) throw new Error("自助登记页读取失败：" + registration.loadError);
    const codeA = registration.invites.find((item) => item.inviteType === "coach");
    const codeB = registration.invites.find((item) => item.inviteType === "student");
    if (!codeA || !codeA.fileId) throw new Error("教练登记码 A 未生成");
    if (!codeB || !codeB.fileId) throw new Error("学员登记码 B 未生成");
    await screenshot(miniProgram, "03-registration-codes-ab");
    console.log("[5/6] 教练登记码 A 与学员登记码 B 通过");
    if (captureScreenshots) {
      await miniProgram.pageScrollTo(520);
      await page.waitFor(300);
      await screenshot(miniProgram, "04-pending-registration");
    }
    console.log("[6/6] 待审核人员页面通过");

    if (errors.length) throw new Error("开发者工具捕获异常：" + errors.join("；"));
    console.log(JSON.stringify({ ok: true, version, pages: ["老板登录", "老板首页", "今日教练码", "登记码 A/B", "待审核人员"], outputDir }, null, 2));
  } finally {
    miniProgram.disconnect();
  }
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
