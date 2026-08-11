const assert = require("assert");
const scanner = require("../miniprogram/utils/scanner");

async function testAuthorizedScan() {
  const runtime = {
    getSetting: ({ success }) => success({ authSetting: { "scope.camera": true } }),
    authorize: () => {},
    scanCode: (options) => {
      assert.strictEqual(options.onlyFromCamera, true);
      assert.deepStrictEqual(options.scanType, ["qrCode"]);
      options.success({ result: "YS:TESTCODE" });
    }
  };
  assert.strictEqual(await scanner.scanQr(runtime), "YS:TESTCODE");
}

async function testPermissionRecovery() {
  let opened = false;
  const runtime = {
    getSetting: ({ success }) => success({ authSetting: { "scope.camera": false } }),
    authorize: () => {},
    showModal: ({ success }) => success({ confirm: true }),
    openSetting: ({ success }) => {
      opened = true;
      success({ authSetting: { "scope.camera": true } });
    },
    scanCode: ({ success }) => success({ result: "YS:RECOVERED" })
  };
  assert.strictEqual(await scanner.scanQr(runtime), "YS:RECOVERED");
  assert.strictEqual(opened, true, "拒绝相机权限后应引导打开设置");
}

async function testCancel() {
  const runtime = {
    getSetting: ({ success }) => success({ authSetting: { "scope.camera": true } }),
    authorize: () => {},
    scanCode: ({ fail }) => fail({ errMsg: "scanCode:fail cancel" })
  };
  await assert.rejects(() => scanner.scanQr(runtime), (error) => scanner.isCancelled(error));
}

async function main() {
  await testAuthorizedScan();
  await testPermissionRecovery();
  await testCancel();
  console.log("Scanner permission tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
