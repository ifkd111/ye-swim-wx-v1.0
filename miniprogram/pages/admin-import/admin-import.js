const api = require("../../utils/api");

function splitLine(line) {
  const normalized = String(line || "").replace(/，/g, ",").replace(/\t/g, ",");
  if (normalized.indexOf(",") >= 0) {
    return normalized.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return normalized.trim().split(/\s+/).filter(Boolean);
}

function looksLikePhone(value) {
  return /^1\d{10}$/.test(String(value || ""));
}

Page({
  data: {
    defaults: {
      campus: "绿洲",
      coach: "绿洲教练",
      productName: "20次卡",
      productType: "class_pack",
      totalLessons: 20
    },
    rawText: "",
    rows: []
  },

  onShow() {
    api.requireSession("admin");
  },

  inputDefault(event) {
    this.setData({ ["defaults." + event.currentTarget.dataset.field]: event.detail.value });
  },

  inputRaw(event) {
    this.setData({ rawText: event.detail.value });
  },

  parseRows() {
    const defaults = this.data.defaults;
    return String(this.data.rawText || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = splitLine(line);
        const name = parts[0] || "";
        if (/^(姓名|学员|学员姓名|名称)$/.test(name)) return null;
        let phone = "";
        let index = 1;
        if (looksLikePhone(parts[1])) {
          phone = parts[1];
          index = 2;
        }
        const campus = parts[index] || defaults.campus;
        const coach = parts[index + 1] || defaults.coach;
        const parsedLessons = Number(parts[index + 2] || defaults.totalLessons || 20);
        const totalLessons = Number.isFinite(parsedLessons) ? parsedLessons : Number(defaults.totalLessons || 20);
        return {
          chineseName: name,
          phone,
          campus,
          coach,
          productName: defaults.productName,
          productType: defaults.productType,
          totalLessons,
          notes: "批量导入"
        };
      })
      .filter((row) => row && row.chineseName);
  },

  preview() {
    const rows = this.parseRows();
    if (!rows.length) {
      api.toast("先粘贴名单");
      return;
    }
    this.setData({ rows });
  },

  importRows() {
    const rows = this.data.rows.length ? this.data.rows : this.parseRows();
    if (!rows.length) {
      api.toast("先预览名单");
      return;
    }
    api.syncing("正在导入");
    api
      .call("bulkImportMembers", { rows })
      .then((result) => {
        api.done(result.message);
        this.setData({ rows: [], rawText: "" });
      })
      .catch(api.fail);
  },

  fillSample() {
    this.setData({
      rawText: "白卓可 13800000000 绿洲 绿洲教练 26\n白卓冉\n饼饼 古北 古北教练 20"
    });
  },

  clear() {
    this.setData({ rawText: "", rows: [] });
  }
});
