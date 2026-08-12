const assert = require("assert");
const fs = require("fs");
const path = require("path");
const automator = require("miniprogram-automator");

const endpoint = process.env.AUTOMATOR_WS_ENDPOINT || "ws://127.0.0.1:9421";
const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "artifacts", "review-2.1.8");
const captureScreenshots = process.env.CAPTURE_AUTOMATOR_SCREENSHOTS === "true";

async function capture(miniProgram, name) {
  if (!captureScreenshots) return "";
  const file = path.join(outputDir, `${name}.png`);
  await Promise.race([
    miniProgram.screenshot({ path: file }),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`截图超时：${name}`)), 12000))
  ]);
  return file;
}

async function waitForPath(miniProgram, expected, timeoutMs = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const page = await miniProgram.currentPage();
    if (page && page.path === expected) return page;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return miniProgram.currentPage();
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const miniProgram = await automator.connect({ wsEndpoint: endpoint });
  const exceptions = [];
  miniProgram.on("exception", (error) => exceptions.push(String(error && error.message || error)));

  try {
    await miniProgram.callWxMethod("clearStorageSync");
    try {
      await miniProgram.reLaunch("/pages/demo/demo");
    } catch (error) {
      if (!/timeout/i.test(String(error && error.message || error))) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
    let page = await miniProgram.currentPage();
    assert.strictEqual(page.path, "pages/demo/demo", "首次打开应停留在免登录体验首页");
    let data = await page.data();
    assert.strictEqual(data.mode, "family", "默认应展示家长消课体验");
    assert.strictEqual(data.selectedCount, 2, "家长体验应提供可直接操作的示例学员");
    await capture(miniProgram, "01-guest-family");

    await page.callMethod("chooseLessons", { currentTarget: { dataset: { id: "demo-1", value: 2 } } });
    await page.callMethod("confirmDemo");
    data = await page.data();
    assert.strictEqual(data.receipt, true, "模拟确认后应展示成功回执");
    assert.strictEqual(data.members[0].remainingLessons, 14, "每名学员的模拟课时应独立计算");
    await capture(miniProgram, "02-guest-receipt");

    await page.callMethod("switchMode", { currentTarget: { dataset: { mode: "coach" } } });
    data = await page.data();
    assert.strictEqual(data.mode, "coach", "应能免登录查看教练每日码体验");
    await capture(miniProgram, "03-guest-coach");

    await page.callMethod("switchMode", { currentTarget: { dataset: { mode: "owner" } } });
    data = await page.data();
    assert.strictEqual(data.mode, "owner", "应能免登录查看老板今日记录体验");
    await capture(miniProgram, "04-guest-owner");

    await page.callMethod("goLogin");
    page = await waitForPath(miniProgram, "pages/login/login");
    assert.strictEqual(page.path, "pages/login/login", "只有用户主动点击后才进入手机号登录页");
    await capture(miniProgram, "05-voluntary-login");
    const guestReturn = await page.$(".guest-return");
    assert(guestReturn, "登录页必须显示拒绝登录并返回体验的按钮");
    const guestReturnWxml = await guestReturn.outerWxml();
    assert.strictEqual(guestReturn.tagName, "navigator", "拒绝登录入口应使用微信原生导航组件");
    assert(/open-type="reLaunch"/.test(guestReturnWxml) && /url="\/pages\/demo\/demo"/.test(guestReturnWxml), "拒绝登录入口必须稳定返回免登录首页");

    if (exceptions.length) throw new Error(`开发者工具捕获异常：${exceptions.join("；")}`);
    console.log(JSON.stringify({ ok: true, firstPage: "pages/demo/demo", voluntaryLoginPage: page.path, nativeReturnTarget: "/pages/demo/demo", screenshots: outputDir }, null, 2));
  } finally {
    miniProgram.disconnect();
  }
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
