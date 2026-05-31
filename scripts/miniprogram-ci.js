const fs = require("fs");
const path = require("path");
const ci = require("miniprogram-ci");

const root = path.resolve(__dirname, "..");
const defaultPrivateKeyPath = path.join(root, "private.key");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getArg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  if (!found) return fallback;
  return found.slice(prefix.length);
}

function getAnyArg(names, fallback) {
  for (const name of names) {
    const value = getArg(name);
    if (value) return value;
  }
  return fallback;
}

function getPositionArg(index, fallback) {
  const values = process.argv.slice(3).filter((arg) => !arg.startsWith("--"));
  return values[index] || fallback;
}

function requireValue(value, message) {
  if (!value) {
    throw new Error(message);
  }
  return value;
}

function createProject() {
  const config = readJson(path.join(root, "project.config.json"));
  const appid = getArg("appid", process.env.WX_APPID || config.appid);
  const privateKeyPath = getArg("key", process.env.WX_PRIVATE_KEY_PATH || defaultPrivateKeyPath);

  requireValue(appid, "缺少 AppID，请设置 WX_APPID 或 project.config.json appid");
  if (!fs.existsSync(privateKeyPath)) {
    throw new Error(
      `找不到代码上传密钥：${privateKeyPath}\n` +
        "请在微信公众平台「开发管理/开发设置」下载代码上传密钥，保存为项目根目录 private.key。"
    );
  }

  return new ci.Project({
    appid,
    type: "miniProgram",
    projectPath: root,
    privateKeyPath,
    ignores: ["node_modules/**/*", "cloudbase.seed.json", "dist/**/*", "*.log"]
  });
}

function getVersion() {
  const pkg = readJson(path.join(root, "package.json"));
  return getAnyArg(["uv", "upload-version"], getPositionArg(0, process.env.WX_UPLOAD_VERSION || pkg.version));
}

function getDesc() {
  return getAnyArg(["ud", "upload-desc", "desc"], getPositionArg(1, process.env.WX_UPLOAD_DESC || `叶小程序 ${getVersion()}`));
}

function getSetting() {
  return {
    useProjectConfig: true,
    es6: true,
    es7: true,
    minify: true,
    minifyJS: true,
    minifyWXML: true,
    minifyWXSS: true
  };
}

async function preview() {
  const result = await ci.preview({
    project: createProject(),
    version: getVersion(),
    desc: getDesc(),
    setting: getSetting(),
    robot: Number(getArg("robot", process.env.WX_CI_ROBOT || 1)),
    qrcodeFormat: "image",
    qrcodeOutputDest: path.join(root, "preview-qrcode.jpg"),
    onProgressUpdate: console.log
  });

  console.log("Preview generated:", result);
  console.log("QR code:", path.join(root, "preview-qrcode.jpg"));
}

async function upload() {
  const result = await ci.upload({
    project: createProject(),
    version: getVersion(),
    desc: getDesc(),
    setting: getSetting(),
    robot: Number(getArg("robot", process.env.WX_CI_ROBOT || 1)),
    onProgressUpdate: console.log
  });

  console.log("Upload completed:", result);
}

async function uploadFunction() {
  const env = requireValue(
    getArg("env", process.env.WX_CLOUD_ENV),
    "缺少云环境 ID，请用 --env=你的环境ID 或设置 WX_CLOUD_ENV"
  );
  const name = getArg("name", "api");
  const functionPath = getArg("path", path.join(root, "cloudfunctions", name));

  const result = await ci.cloud.uploadFunction({
    project: createProject(),
    env,
    name,
    path: functionPath,
    remoteNpmInstall: true
  });

  console.log("Cloud function uploaded:", result);
}

async function quality() {
  const reportPath = path.join(root, "ci-quality-report.json");
  const result = await ci.checkCodeQuality(createProject());
  fs.writeFileSync(reportPath, JSON.stringify(result, null, 2));
  console.log("Quality report:", reportPath);
}

const commands = {
  preview,
  upload,
  "upload-function": uploadFunction,
  quality
};

const command = process.argv[2];

if (!commands[command]) {
  console.log("Usage:");
  console.log("  npm run ci:preview");
  console.log("  npm run ci:upload -- 1.0.5 说明");
  console.log("  npm run ci:upload -- --uv=1.0.5 --ud=说明");
  console.log("  npm run ci:upload-function -- --env=你的云环境ID");
  console.log("  npm run ci:quality");
  process.exit(command ? 1 : 0);
}

commands[command]().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
