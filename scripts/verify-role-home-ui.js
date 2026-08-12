const assert = require("assert");
const automator = require("miniprogram-automator");
const path = require("path");

const endpoint = process.env.AUTOMATOR_WS_ENDPOINT || "ws://127.0.0.1:9421";
const root = path.resolve(__dirname, "..");
const cliPath = process.env.WECHAT_DEVTOOLS_CLI || "C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForPath(miniProgram, expected, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const page = await miniProgram.currentPage();
    if (page && page.path === expected) return page;
    await sleep(250);
  }
  throw new Error(`页面未进入 ${expected}`);
}

async function waitLoaded(page) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10000) {
    const data = await page.data();
    if (!data.loading && data.viewer && data.viewer.role) return data;
    await sleep(250);
  }
  throw new Error(`页面数据未加载：${page.path}`);
}

async function tapRole(page, role, miniProgram, expected) {
  await page.callMethod("testLogin", { currentTarget: { dataset: { role } } });
  const target = await waitForPath(miniProgram, expected);
  return { page: target, data: await waitLoaded(target) };
}

async function main() {
  let miniProgram;
  try {
    miniProgram = await automator.connect({ wsEndpoint: endpoint });
  } catch (error) {
    miniProgram = await automator.launch({ projectPath: root, cliPath, port: Number(new URL(endpoint).port), trustProject: true, timeout: 60000 });
  }
  const errors = [];
  miniProgram.on("exception", (error) => errors.push(String(error && error.message || error)));
  try {
    await miniProgram.callWxMethod("clearStorageSync");
    await miniProgram.callWxMethod("setStorageSync", "__yeLocalRolePreview", true);
    try { await miniProgram.reLaunch("/pages/login/login"); } catch (error) {}
    let page = await waitForPath(miniProgram, "pages/login/login");
    let result = await tapRole(page, "admin", miniProgram, "pages/admin/admin");
    page = result.page;
    assert.strictEqual(result.data.viewer.role, "admin");
    assert.strictEqual((await page.$$(".quick-actions>view")).length, 4, "老板首页应有四个核心入口");
    assert((await page.$(".owner-code-card")) || (await page.$(".code-error")), "老板本人教练码必须有明确状态");
    const syntheticMembers = Array.from({ length: 50 }, (_, index) => ({ id: `synthetic-${index}`, chineseName: `模拟学员${String(index).padStart(2, "0")}`, phone: "", notes: "", selected: false }));
    await page.setData({ manualMembers: syntheticMembers, manualKeyword: "" });
    await page.callMethod("refreshManualMembers");
    let ownerData = await page.data();
    assert.strictEqual(ownerData.manualVisibleMembers.length, 24, "补录弹窗首次最多渲染 24 名学员");
    assert.strictEqual(ownerData.manualHasMore, true, "长名单应提示继续搜索");
    await page.setData({ manualKeyword: "49" });
    await page.callMethod("refreshManualMembers");
    ownerData = await page.data();
    assert.strictEqual(ownerData.manualVisibleMembers.length, 1, "补录搜索应即时缩小学员范围");
    await page.callMethod("logout");

    page = await waitForPath(miniProgram, "pages/login/login");
    result = await tapRole(page, "coach", miniProgram, "pages/coach/coach");
    page = result.page;
    assert.strictEqual(result.data.viewer.role, "coach");
    assert(result.data.code && result.data.code.token, "教练首页必须拿到当天固定码信息");
    assert(await page.$(".profile-strip"), "教练资料入口缺失");
    await page.callMethod("logout");

    page = await waitForPath(miniProgram, "pages/login/login");
    result = await tapRole(page, "student", miniProgram, "pages/student/student");
    page = result.page;
    assert.strictEqual(result.data.viewer.role, "student");
    assert(result.data.members.length >= 2, "家长首页应支持一个手机号展示多名孩子");
    assert.strictEqual((await page.$$(".member-card")).length, result.data.members.length, "每名孩子应独立展示课时");
    const scanTip = await page.$(".scan-tip");
    assert(scanTip, "家长首页缺少扫码说明");
    const scanWxml = await scanTip.outerWxml();
    assert(!/bindtap=/.test(scanWxml), "扫码说明当前不是按钮，不应伪装成可点击入口");
    assert(!/scan-arrow/.test(scanWxml), "不可点击的扫码说明不应显示跳转箭头");

    if (errors.length) throw new Error(`开发者工具异常：${errors.join("；")}`);
    console.log(JSON.stringify({ ok: true, roles: ["老板", "教练", "家长"], ownerActions: 4, familyMembers: result.data.members.length }, null, 2));
  } finally {
    await miniProgram.callWxMethod("clearStorageSync");
    miniProgram.disconnect();
  }
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
