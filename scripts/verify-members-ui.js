const assert = require("assert");
const automator = require("miniprogram-automator");

const endpoint = process.env.AUTOMATOR_WS_ENDPOINT || "ws://127.0.0.1:9420";

async function waitForData(page, predicate, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const data = await page.data();
    if (predicate(data)) return data;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error("学员页数据加载超时");
}

async function main() {
  const miniProgram = await automator.connect({ wsEndpoint: endpoint });
  const errors = [];
  miniProgram.on("exception", (error) => errors.push(String(error && error.message || error)));
  try {
    await miniProgram.reLaunch("/pages/admin-members/admin-members");
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const page = await miniProgram.currentPage();
    assert.strictEqual(page.path, "pages/admin-members/admin-members", "应打开学员管理页");
    let data = await waitForData(page, (value) => value.activeCount > 0 && value.pageMembers.length > 0, 20000);
    assert.strictEqual(data.pageSize, 20, "学员名单应每页显示 20 人");
    assert.strictEqual(data.pageMembers.length, Math.min(20, data.listTotal), "首屏分页数量不正确");
    assert(data.pageMembers.every((item) => item.initial && item.phoneText), "名单行应包含拼音首字母和手机号状态");
    assert(data.pageMembers.every((item) => item.phoneText === "未绑定手机" || /^1\d{2}\*{4}\d{4}$/.test(item.phoneText)), "名单不应直接展示完整手机号");

    await page.callMethod("setQuickFilter", { currentTarget: { dataset: { value: "unbound" } } });
    data = await waitForData(page, (value) => value.quickFilter === "unbound", 3000);
    assert(data.pageMembers.every((item) => item.phoneText === "未绑定手机"), "未绑手机筛选结果不正确");

    await page.callMethod("toggleBatch");
    data = await page.data();
    assert.strictEqual(data.batchMode, true, "批量管理模式未开启");
    assert.strictEqual(data.selectedCount, 0, "批量管理不应默认选中学员");
    if (errors.length) throw new Error("开发者工具捕获异常：" + errors.join("；"));
    console.log(JSON.stringify({
      ok: true,
      activeCount: data.activeCount,
      archivedCount: data.archivedCount,
      pageSize: data.pageSize,
      firstPageRows: data.pageMembers.length,
      firstNames: data.pageMembers.slice(0, 5).map((item) => item.initial + "·" + item.chineseName),
      batchMode: data.batchMode
    }, null, 2));
  } finally {
    miniProgram.disconnect();
  }
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
