const fs = require("fs");
const path = require("path");
const ci = require("miniprogram-ci");
const cloudAPI = require("miniprogram-ci/dist/common/cloud-api");
const { initCloudAPI, get3rdCloudCodeSecret, boundTransactRequest } = require("miniprogram-ci/dist/ci/cloud/cloudapi");

const root = path.resolve(__dirname, "..");

function getArg(name, fallback) {
  const prefix = "--" + name + "=";
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

async function main() {
  const config = JSON.parse(fs.readFileSync(path.join(root, "project.config.json"), "utf8"));
  const env = getArg("env", process.env.WX_CLOUD_ENV || require("../miniprogram/env").envId);
  const name = getArg("name", "api");
  const privateKeyPath = getArg("key", process.env.WX_PRIVATE_KEY_PATH || path.join(root, "private.key"));
  if (!env) throw new Error("缺少云环境 ID");
  if (!fs.existsSync(privateKeyPath)) throw new Error("找不到代码上传密钥：" + privateKeyPath);

  const project = new ci.Project({
    appid: config.appid,
    type: "miniProgram",
    projectPath: root,
    privateKeyPath
  });
  const appid = (await project.getExtAppid()) || project.appid;
  initCloudAPI(appid);
  const opts = {
    request: boundTransactRequest(project),
    transactType: cloudAPI.TransactType.IDE
  };
  const { envList } = await cloudAPI.tcbGetEnvironments({}, opts);
  const target = (envList || []).find((item) => item.envId === env);
  if (!target) throw new Error("找不到云环境：" + env);
  const region = target.functions && target.functions[0] && target.functions[0].region || "ap-shanghai";
  const codeSecret = await get3rdCloudCodeSecret(project);
  const info = await cloudAPI.scfGetFunctionInfo({ namespace: env, region, functionName: name, codeSecret }, opts);
  console.log(JSON.stringify({ env, name, region, status: info.status, statusDesc: info.statusDesc || "" }, null, 2));
}

main().catch((error) => {
  console.error(error && (error.stack || error.message) ? error.stack || error.message : error);
  process.exit(1);
});
