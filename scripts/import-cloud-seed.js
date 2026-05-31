const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const seedPath = path.join(root, "cloudbase.seed.json");
const privateEnvPath = path.resolve(root, "..", "ye-swim-private-backup", ".env.local");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getArg(name, fallback) {
  const prefix = "--" + name + "=";
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function hasArg(name) {
  return process.argv.includes("--" + name);
}

function requireValue(value, message) {
  if (!value) throw new Error(message);
  return value;
}

function loadPrivateEnv() {
  if (!fs.existsSync(privateEnvPath)) return;
  const text = fs.readFileSync(privateEnvPath, "utf8");
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const index = trimmed.indexOf("=");
    if (index <= 0) return;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  });
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error("接口返回不是 JSON：" + text.slice(0, 200));
  }
  if (!response.ok) throw new Error("HTTP " + response.status + ": " + text.slice(0, 300));
  return data;
}

async function getAccessToken(appid, secret) {
  const params = new URLSearchParams({
    grant_type: "client_credential",
    appid,
    secret
  });
  const result = await requestJson("https://api.weixin.qq.com/cgi-bin/token?" + params.toString(), { method: "GET" });
  if (!result.access_token) throw new Error("获取 access_token 失败：" + JSON.stringify(result));
  return result.access_token;
}

async function invoke(accessToken, env, action, payload) {
  const params = new URLSearchParams({ access_token: accessToken, env, name: "api" });
  const result = await requestJson("https://api.weixin.qq.com/tcb/invokecloudfunction?" + params.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      payload: Object.assign({}, payload, {
        seedSecret: process.env.YE_SWIM_SEED_SECRET || "ye-swim-local-seed-v1"
      })
    })
  });
  if (result.errcode) throw new Error(action + " 调用失败：" + JSON.stringify(result));
  let cloudResult = result.resp_data;
  if (typeof cloudResult === "string") {
    try {
      cloudResult = JSON.parse(cloudResult);
    } catch (error) {
      throw new Error(action + " 返回无法解析：" + result.resp_data);
    }
  }
  if (cloudResult && cloudResult.ok === false) throw new Error(action + " 业务失败：" + cloudResult.message);
  return cloudResult && cloudResult.data ? cloudResult.data : cloudResult;
}

async function importCollection(accessToken, env, collection, rows, batchSize) {
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    await invoke(accessToken, env, "seedImportBatch", { collection, rows: batch });
    console.log(collection + ": " + Math.min(index + batch.length, rows.length) + "/" + rows.length);
  }
}

async function main() {
  loadPrivateEnv();
  const env = requireValue(getArg("env", process.env.WX_CLOUD_ENV), "缺少 --env=云环境ID");
  const appid = requireValue(getArg("appid", process.env.WECHAT_MINIPROGRAM_APPID || process.env.WX_APPID), "缺少 AppID");
  const secret = requireValue(getArg("secret", process.env.WECHAT_MINIPROGRAM_APPSECRET || process.env.WX_APPSECRET), "缺少 AppSecret");
  if (!fs.existsSync(seedPath)) throw new Error("找不到 seed 文件，请先运行 npm run seed:attendance");
  const seed = readJson(seedPath);
  const accessToken = await getAccessToken(appid, secret);
  const order = [
    "accounts",
    "courseProducts",
    "members",
    "schedules",
    "attendanceLogs",
    "availabilitySlots",
    "bookingRequests",
    "courseApplications",
    "auditLogs"
  ];
  const clearOrder = order.slice().reverse();
  if (!hasArg("skip-clear")) {
    for (const collection of clearOrder) {
      console.log("clear " + collection);
      for (;;) {
        const result = await invoke(accessToken, env, "seedClearCollection", { collection, limit: 80 });
        if (!result || !result.removed) break;
      }
    }
  }
  if (!hasArg("finalize-only")) {
    const batchSize = Number(getArg("batch", "50"));
    for (const collection of order) {
      await importCollection(accessToken, env, collection, seed.collections[collection] || [], batchSize);
    }
  }
  await invoke(accessToken, env, "seedFinalize", {
    seedVersion: seed.seedVersion,
    source: seed.source,
    stats: seed.stats
  });
  console.log("云端初始化数据导入完成：" + seed.seedVersion);
}

main().catch((error) => {
  console.error(error && (error.stack || error.message) ? error.stack || error.message : error);
  process.exit(1);
});
