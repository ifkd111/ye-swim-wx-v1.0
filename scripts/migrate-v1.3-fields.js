const cloudbase = require("@cloudbase/node-sdk");
const rules = require("../shared/rules");

function getArg(name, fallback) {
  const prefix = "--" + name + "=";
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

async function main() {
  const env = getArg("env", process.env.WX_CLOUD_ENV);
  if (!env) throw new Error("缺少云环境 ID，请用 --env=你的环境ID");
  const app = cloudbase.init({ env });
  const db = app.database();
  const adminPhone = rules.normalizePhone(getArg("admin-phone", process.env.YE_SWIM_ADMIN_PHONE || ""));
  const onlyAdminPhone = getArg("only-admin-phone", "false") === "true";
  const result = await db.collection("accounts").limit(1000).get();
  const accounts = result.data || [];
  let updated = 0;
  for (const account of accounts) {
    const patch = {};
    if (!onlyAdminPhone && !account.loginMode) patch.loginMode = account.role === "admin" ? "password" : "phone";
    if (!onlyAdminPhone && account.role !== "admin" && !account.bindingStatus) patch.bindingStatus = account.openid ? "bound" : "pending";
    if (account.account === "yeats" && adminPhone) {
      if (!rules.isChinaMobile(adminPhone)) throw new Error("老板手机号格式不正确");
      patch.phone = adminPhone;
      patch.loginMode = "password";
    }
    if (Object.keys(patch).length) {
      patch.updatedAt = new Date().toISOString();
      await db.collection("accounts").doc(account._id).update(patch);
      updated += 1;
    }
  }
  console.log("v1.3 field migration completed:", updated);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
