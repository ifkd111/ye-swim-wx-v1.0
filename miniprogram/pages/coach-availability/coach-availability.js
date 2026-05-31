const api = require("../../utils/api");
const rules = require("../../utils/rules");

const SETTINGS_KEY = "coach-availability-settings";

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

Page({
  data: {
    phrase: "",
    slots: [],
    previewSlots: [],
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
    if (saved && saved.campus) {
      this.setData({
        settings: Object.assign({}, this.data.settings, saved),
        "form.campus": saved.campus,
        "form.capacity": saved.capacity || 1
      });
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

  quick(event) {
    const mode = event.currentTarget.dataset.mode;
    const settings = this.data.settings;
    if (mode === "tomorrow-afternoon") this.addPreview(makeSlots([dateAfter(1)], "afternoon", settings));
    if (mode === "tomorrow-all") this.addPreview(makeSlots([dateAfter(1)], "all", settings));
    if (mode === "next-week-afternoon") {
      const monday = nextWeekday(1);
      this.addPreview(makeSlots([0, 1, 2, 3, 4].map((day) => addDays(monday, day)), "afternoon", settings));
    }
    if (mode === "weekly-wed-afternoon") this.addWeekly(3, "afternoon");
    if (mode === "weekly-thu-morning-8") this.addWeekly(4, "8点到9点");
  },

  addWeekly(weekday, period) {
    const weeks = Math.max(1, Number(this.data.settings.repeatWeeks || 4));
    const first = nextWeekday(weekday);
    const dates = Array.from({ length: weeks }, (_, index) => addDays(first, index * 7));
    this.addPreview(makeSlots(dates, period, this.data.settings));
  },

  parsePhrase() {
    const text = String(this.data.phrase || "").replace(/\s/g, "");
    if (!text) {
      api.toast("先输入一句话");
      return;
    }
    let period = text.indexOf("上午") >= 0 ? "morning" : text.indexOf("晚上") >= 0 ? "evening" : "afternoon";
    const exact = text.match(/(\d{1,2})点到(\d{1,2})点/);
    if (exact) period = exact[1] + "点到" + exact[2] + "点";

    if (text.indexOf("明天") >= 0) {
      this.addPreview(makeSlots([dateAfter(1)], text.indexOf("全天") >= 0 ? "all" : period, this.data.settings));
      return;
    }
    if (text.indexOf("后天") >= 0) {
      this.addPreview(makeSlots([dateAfter(2)], text.indexOf("全天") >= 0 ? "all" : period, this.data.settings));
      return;
    }
    if (text.indexOf("下周") >= 0 && text.indexOf("都") >= 0) {
      const monday = nextWeekday(1);
      this.addPreview(makeSlots([0, 1, 2, 3, 4].map((day) => addDays(monday, day)), text.indexOf("全天") >= 0 ? "all" : period, this.data.settings));
      return;
    }

    const weekdayMatch = text.match(/每周([一二三四五六日天])/);
    const weekdayMap = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
    if (weekdayMatch) {
      this.addWeekly(weekdayMap[weekdayMatch[1]], period);
      return;
    }

    api.toast("没看懂，试试：明天下午有空");
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
