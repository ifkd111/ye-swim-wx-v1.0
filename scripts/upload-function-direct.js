const fs = require("fs");
const path = require("path");
const ci = require("miniprogram-ci");
const cloudAPI = require("miniprogram-ci/dist/common/cloud-api");
const { initCloudAPI, get3rdCloudCodeSecret, boundTransactRequest } = require("miniprogram-ci/dist/ci/cloud/cloudapi");
const { zipFile, zipToBuffer } = require("miniprogram-ci/dist/ci/cloud/utils");

const root = path.resolve(__dirname, "..");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getArg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function requireValue(value, message) {
  if (!value) throw new Error(message);
  return value;
}

function createProject() {
  const config = readJson(path.join(root, "project.config.json"));
  const appid = getArg("appid", process.env.WX_APPID || config.appid);
  const privateKeyPath = getArg("key", process.env.WX_PRIVATE_KEY_PATH || path.join(root, "private.key"));
  requireValue(appid, "缺少 AppID");
  if (!fs.existsSync(privateKeyPath)) throw new Error("找不到代码上传密钥：" + privateKeyPath);
  return new ci.Project({
    appid,
    type: "miniProgram",
    projectPath: root,
    privateKeyPath,
    ignores: ["node_modules/**/*", "cloudbase.seed.json", "dist/**/*", "*.log"]
  });
}

async function getFunctionRegion(project, env) {
  const opts = {
    request: boundTransactRequest(project),
    transactType: cloudAPI.TransactType.IDE
  };
  const { envList } = await cloudAPI.tcbGetEnvironments({}, opts);
  const target = (envList || []).find((item) => item.envId === env);
  if (!target) throw new Error("找不到云环境：" + env);
  return target.functions && target.functions[0] && target.functions[0].region ? target.functions[0].region : "ap-shanghai";
}

async function main() {
  const env = requireValue(getArg("env", process.env.WX_CLOUD_ENV), "缺少 --env=云环境ID");
  const name = getArg("name", "api");
  const functionPath = getArg("path", path.join(root, "cloudfunctions", name));
  const project = createProject();
  const appid = (await project.getExtAppid()) || project.appid;
  initCloudAPI(appid);

  const opts = {
    request: boundTransactRequest(project),
    transactType: cloudAPI.TransactType.IDE
  };
  const region = await getFunctionRegion(project, env);
  const codeSecret = await get3rdCloudCodeSecret(project);

  let existing = null;
  try {
    existing = await cloudAPI.scfGetFunctionInfo({ namespace: env, region, functionName: name, codeSecret }, opts);
  } catch (error) {
    if (error.code !== "ResourceNotFound.Function") throw error;
  }

  if (!existing) {
    await cloudAPI.scfCreateFunction(
      {
        functionName: name,
        code: { zipFile: "UEsDBAoAAAAAAI1+dV4AAAAAAAAAAAAAAAAIABwAaW5kZXguanNVVAkAA2c1aGe0NWhndXgLAAEE6AMAAAToAwAAUEsBAh4DCgAAAAAAjX51XgAAAAAAAAAAAAAAAAgAGAAAAAAAAAAAAKSBAAAAAGluZGV4LmpzVVQFAANnNWhndXgLAAEE6AMAAAToAwAAUEsFBgAAAAABAAEATgAAAEIAAAAAAA==" },
        handler: "index.main",
        description: "",
        memorySize: 256,
        timeout: 10,
        environment: { variables: [] },
        role: "TCB_QcsRole",
        runtime: "Nodejs16.13",
        namespace: env,
        region,
        stamp: "MINI_QCBASE",
        installDependency: false,
        codeSecret
      },
      opts
    );
  }

  const zipped = zipFile(functionPath);
  const buffer = await zipToBuffer(zipped);
  await cloudAPI.scfUpdateFunction(
    {
      functionName: name,
      namespace: env,
      region,
      handler: "index.main",
      installDependency: false,
      fileData: buffer.toString("base64"),
      codeSecret
    },
    opts
  );

  console.log(
    JSON.stringify(
      {
        env,
        name,
        region,
        filesCount: Object.keys(zipped.files).length,
        packSize: buffer.byteLength,
        message: "云函数代码已提交更新"
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error && (error.stack || error.message) ? error.stack || error.message : error);
  process.exit(1);
});
