const api = require("../../utils/api");
const rules = require("../../utils/rules");

const SETTINGS_KEY = "coach-availability-settings";
const TEMPLATE_KEY = "coach-availability-templates";
const DEFAULT_TEMPLATES = [
  { id: "tpl-tomorrow-afternoon", label: "明天下午", phrase: "明天下午有空" },
  { id: "tpl-tomorrow-all", label: "明天全天", phrase: "明天全天有空" },
  { id: "tpl-next-week-afternoon", label: "下周下午", phrase: "下周每天下午有空" },
  { id: "tpl-after-tomorrow-evening", label: "后天晚上", phrase: "后天晚上有空" }
];

function dateAfter(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function nextWeekday(day) {
  const today = new Date();
  const distance = (day - today.getDay() + 7) % 7 || 7;
  return addDays(today, distance);
}

function format(date) {
  return rules.formatDateChina(date);
}

function timeSlots(period, settings) {
  if (period === "morning") return ["08:00-09:00", "09:00-10:00", "10:00-11:00"];
  if (period === "evening") return ["18:00-19:00", "19:00-20:00"];
  if (period === "all") return ["08:00-09:00", "09:00-10:00", "10:00-11:00", "14:00-15:00", "15:00-16:00", "16:00-17:00"];
  if (/^\d{1,2}点到\d{1,2}点$/.test(period)) {
    const parts = period.match(/(\d{1,2})点到(\d{1,2})点/);
    return [String(parts[1]).padStart(2, "0") + ":00-" + String(parts[2]).padStart(2, "0") + ":00"];
  }
  return settings.afternoonSlots || ["14:00-15:00", "15:00-16:00", "16:00-17:00"];
}

function periodFromText(text) {
  const exact = text.match(/(\d{1,2})点到(\d{1,2})点/);
  if (exact) return exact[1] + "点到" + exact[2] + "点";

  const range = text.match(/(\d{1,2})[-~到](\d{1,2})点/);
  if (range) return range[1] + "点到" + range[2] + "点";

  if (text.indexOf("全天") >= 0) return "all";
  if (text.indexOf("上午") >= 0) return "morning";
  if (text.indexOf("晚上") >= 0 || text.indexOf("傍晚") >= 0) return "evening";

  return "afternoon";
}

function makeSlots(dates, period, settings) {
  const slots = [];
  dates.forEach((date) => {
    timeSlots(period, settings).forEach((slotTime) => {
      slots.push({
        slotDate: format(date),
        slotTime,
        campus: settings.campus,
        capacity: Number(settings.capacity || 1),
        notes: "空余助手生成"
      });
    });
  });
  return slots;
}

function uniqueSlots(slots) {
  const seen = {};
  return slots.filter((slot) => {
    const key = slot.slotDate + "|" + slot.slotTime + "|" + slot.campus;
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function normalizeTemplates(value) {
  if (!Array.isArray(value) || !value.length) return DEFAULT_TEMPLATES.slice();
  return value
    .filter((item) => item && (item.label || item.phrase))
    .map((item, index) => ({
      id: item.id || "tpl-custom-" + index,
      label: String(item.label || "常用模板").slice(0, 10),
      phrase: String(item.phrase || "")
    }));
}

Page({
  data: {
    phrase: "",
    slots: [],
    previewSlots: [],
    templates: DEFAULT_TEMPLATES,
    templateEditing: false,
    newTemplate: {
      label: "",
      phrase: ""
    },
    settings: {
      campus: "绿洲",
      capacity: 1,
      lessonMinutes: 60,
      repeatWeeks: 4,
      afternoonSlots: ["14:00-15:00", "15:00-16:00", "16:00-17:00"]
    },
    form: {
      slotDate: "",
      slotTime: "17:00-18:00",
      campus: "绿洲",
      capacity: 1
    }
  },

  onShow() {
    if (!api.requireSession("coach")) return;
    const saved = wx.getStorageSync(SETTINGS_KEY);
    const templates = normalizeTemplates(wx.getStorageSync(TEMPLATE_KEY));
    if (saved && saved.campus) {
      this.setData({
        settings: Object.assign({}, this.data.settings, saved),
        "form.campus": saved.campus,
        "form.capacity": saved.capacity || 1,
        templates
      });
    } else {
      this.setData({ templates });
    }
    this.load();
  },

  load() {
    api.call("getHomeData").then((data) => {
      this.setData({ slots: data.availabilitySlots || [] });
    });
  },

  input(event) {
    this.setData({ ["form." + event.currentTarget.dataset.field]: event.detail.value });
  },

  settingInput(event) {
    const field = event.currentTarget.dataset.field;
    const value = event.detail.value;
    const next = Object.assign({}, this.data.settings, { [field]: value });
    wx.setStorageSync(SETTINGS_KEY, next);
    this.setData({
      settings: next,
      "form.campus": next.campus,
      "form.capacity": next.capacity
    });
  },

  phraseInput(event) {
    this.setData({ phrase: event.detail.value });
  },

  addPreview(slots) {
    this.setData({ previewSlots: uniqueSlots(this.data.previewSlots.concat(slots)) });
  },

  parseTextToSlots(rawText) {
    const text = String(rawText || "").replace(/\s/g, "");
    if (!text) throw new Error("先输入一句话");

    const period = periodFromText(text);
    if (text.indexOf("明天") >= 0) return makeSlots([dateAfter(1)], period, this.data.settings);
    if (text.indexOf("后天") >= 0) return makeSlots([dateAfter(2)], period, this.data.settings);

    if (text.indexOf("下周") >= 0 && (text.indexOf("每天") >= 0 || text.indexOf("工作日") >= 0 || text.indexOf("都") >= 0)) {
      const monday = nextWeekday(1);
      return makeSlots([0, 1, 2, 3, 4].map((day) => addDays(monday, day)), period, this.data.settings);
    }

    const weekdayMatch = text.match(/每周([一二三四五六日天])/);
    const weekdayMap = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
    if (weekdayMatch) {
      const weeks = Math.max(1, Number(this.data.settings.repeatWeeks || 4));
      const first = nextWeekday(weekdayMap[weekdayMatch[1]]);
      const dates = Array.from({ length: weeks }, (_, index) => addDays(first, index * 7));
      return makeSlots(dates, period, this.data.settings);
    }

    throw new Error("没看懂，试试：明天下午有空");
  },

  addWeekly(weekday, period) {
    const weeks = Math.max(1, Number(this.data.settings.repeatWeeks || 4));
    const first = nextWeekday(weekday);
    const dates = Array.from({ length: weeks }, (_, index) => addDays(first, index * 7));
    this.addPreview(makeSlots(dates, period, this.data.settings));
  },

  parsePhrase() {
    try {
      this.addPreview(this.parseTextToSlots(this.data.phrase));
    } catch (error) {
      api.toast(error.message);
    }
  },

  applyTemplate(event) {
    const index = Number(event.currentTarget.dataset.index);
    const template = this.data.templates[index];
    if (!template) return;
    try {
      this.addPreview(this.parseTextToSlots(template.phrase));
    } catch (error) {
      api.toast(error.message);
    }
  },

  toggleTemplateEdit() {
    this.setData({ templateEditing: !this.data.templateEditing });
  },

  templateInput(event) {
    const index = Number(event.currentTarget.dataset.index);
    const field = event.currentTarget.dataset.field;
    const templates = this.data.templates.slice();
    if (!templates[index]) return;
    templates[index] = Object.assign({}, templates[index], { [field]: event.detail.value });
    wx.setStorageSync(TEMPLATE_KEY, templates);
    this.setData({ templates });
  },

  newTemplateInput(event) {
    this.setData({ ["newTemplate." + event.currentTarget.dataset.field]: event.detail.value });
  },

  addTemplate() {
    const label = String(this.data.newTemplate.label || "").trim();
    const phrase = String(this.data.newTemplate.phrase || "").trim();
    if (!label || !phrase) {
      api.toast("模板名和一句话都要填");
      return;
    }
    const templates = this.data.templates.concat([{ id: "tpl-" + Date.now(), label, phrase }]);
    wx.setStorageSync(TEMPLATE_KEY, templates);
    this.setData({
      templates,
      newTemplate: { label: "", phrase: "" }
    });
  },

  removeTemplate(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (this.data.templates.length <= 1) {
      api.toast("至少保留一个模板");
      return;
    }
    const templates = this.data.templates.slice();
    templates.splice(index, 1);
    wx.setStorageSync(TEMPLATE_KEY, templates);
    this.setData({ templates });
  },

  copyWeek() {
    const today = new Date();
    const current = this.data.slots.filter((slot) => {
      const date = new Date(slot.slotDate + "T00:00:00");
      const diff = Math.floor((date - new Date(today.toDateString())) / 86400000);
      return diff >= 0 && diff < 7;
    });
    if (!current.length) {
      api.toast("本周没有可复制的空余");
      return;
    }
    this.addPreview(
      current.map((slot) => ({
        slotDate: format(addDays(new Date(slot.slotDate + "T00:00:00"), 7)),
        slotTime: slot.slotTime,
        campus: slot.campus,
        capacity: slot.capacity,
        notes: "复制本周"
      }))
    );
  },

  removePreview(event) {
    const index = Number(event.currentTarget.dataset.index);
    const next = this.data.previewSlots.slice();
    next.splice(index, 1);
    this.setData({ previewSlots: next });
  },

  clearPreview() {
    this.setData({ previewSlots: [], phrase: "" });
  },

  submitPreview() {
    if (!this.data.previewSlots.length) return;
    api.syncing("正在提交");
    api
      .call("createAvailabilitySlots", { slots: this.data.previewSlots })
      .then((result) => {
        api.done(result.message);
        this.clearPreview();
        this.load();
      })
      .catch(api.fail);
  },

  create() {
    api.syncing("正在提交");
    api
      .call("createAvailabilitySlot", this.data.form)
      .then((result) => {
        api.done(result.message);
        this.load();
      })
      .catch(api.fail);
  }
});
