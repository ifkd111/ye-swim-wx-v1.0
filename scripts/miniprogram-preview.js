const path = require("path");
const ci = require("miniprogram-ci");

const root = path.resolve(__dirname, "..");
const appid = process.env.WX_APPID || "touristappid";
const privateKeyPath = process.env.WX_PRIVATE_KEY_PATH || path.join(root, "private.key");

async function main() {
  if (appid.indexOf("placeholder") >= 0 || appid === "touristappid") {
    throw new Error("请先设置真实 WX_APPID，再运行 npm run ci:preview");
  }

  const project = new ci.Project({
    appid,
    type: "miniProgram",
    projectPath: root,
    privateKeyPath,
    ignores: ["node_modules/**/*", "cloudbase.seed.json"]
  });

  await ci.preview({
    project,
    desc: "ye-swim wx v1.0 preview",
    setting: {
      es6: true,
      minify: true
    },
    qrcodeFormat: "terminal",
    qrcodeOutputDest: path.join(root, "preview-qrcode.jpg")
  });

  console.log("Preview generated");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
