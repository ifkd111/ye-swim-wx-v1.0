const api = require("../../utils/api");
const rules = require("../../utils/rules");

const WEEKLY_TEMPLATE_KEY = "admin-availability-weekly-template-v1";
const WEEKDAYS = [
  { value: 1, label: "周一" },
  { value: 2, label: "周二" },
  { value: 3, label: "周三" },
  { value: 4, label: "周四" },
  { value: 5, label: "周五" },
  { value: 6, label: "周六" },
  { value: 0, label: "周日" }
];

function dateAfter(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return rules.formatDateChina(date);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function nextMonday() {
  const today = new Date();
  const day = today.getDay();
  const distance = day === 0 ? 1 : 8 - day;
  return addDays(today, distance);
}

function weekdayDate(monday, weekday) {
  return addDays(monday, weekday === 0 ? 6 : weekday - 1);
}

function templateKey(item) {
  return [item.weekday, item.slotTime, item.campus, item.coach].join("|");
}

function slotKey(item) {
  return [item.slotDate, item.slotTime, item.campus, item.coach].join("|");
}

function uniqueSlots(slots) {
  const seen = {};
  return (slots || []).filter((item) => {
    const key = slotKey(item);
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function normalizeTemplates(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && item.slotTime && item.campus && item.coach).map((item, index) => {
    const weekday = Number(item.weekday);
    const weekdayItem = WEEKDAYS.find((option) => option.value === weekday) || WEEKDAYS[0];
    return {
      id: item.id || "weekly-" + index,
      weekday: weekdayItem.value,
      weekdayLabel: weekdayItem.label,
      slotTime: String(item.slotTime),
      campus: String(item.campus),
      coach: String(item.coach),
      capacity: Math.max(1, Number(item.capacity || 1))
    };
  });
}

Page({
  data: {
    slots: [],
    sourceSlots: [],
    previewSlots: [],
    weeklyTemplates: [],
    weekdayOptions: WEEKDAYS,
    weekdayLabels: WEEKDAYS.map((item) => item.label),
    dateOptions: [
      { label: "明天", value: dateAfter(1) },
      { label: "后天", value: dateAfter(2) },
      { label: "三天后", value: dateAfter(3) }
    ],
    timeOptions: ["08:00-09:00", "09:00-10:00", "10:00-11:00", "14:00-15:00", "15:00-16:00", "16:00-17:00", "17:00-18:00", "18:00-19:00", "19:00-20:00"],
    campuses: ["绿洲"],
    coaches: ["绿洲教练"],
    weeklyForm: {
      weekday: 1,
      weekdayLabel: "周一",
      slotTime: "17:00-18:00",
      campus: "绿洲",
      coach: "绿洲教练",
      capacity: 1
    },
    form: {
      slotDate: dateAfter(1),
      slotTime: "17:00-18:00",
      campus: "绿洲",
      coach: "绿洲教练",
      capacity: 1,
      status: "published"
    }
  },

  onShow() {
    if (!api.requireSession("admin")) return;
    this.load();
  },

  load() {
    api.call("getHomeData").then((data) => {
      const members = data.members || [];
      const campuses = members.map((item) => item.campus).filter((value, index, list) => value && list.indexOf(value) === index);
      const coaches = (data.accounts || []).filter((item) => item.role === "coach").map((item) => item.coachName || item.fullName)
        .concat(members.map((item) => item.coach))
        .filter((value, index, list) => value && list.indexOf(value) === index);
      const nextCampuses = campuses.length ? campuses : this.data.campuses;
      const nextCoaches = coaches.length ? coaches : this.data.coaches;
      const sourceSlots = (data.availabilitySlots || [])
        .map((item) => Object.assign({}, item, {
          dayLabel: rules.dayLabel(item.slotDate),
          statusLabel: item.status === "published" ? (Number(item.left) === 0 ? "已满" : "可预约") : item.status === "closed" ? "已关闭" : "草稿"
        }))
        .sort((a, b) => (a.slotDate + a.slotTime).localeCompare(b.slotDate + b.slotTime));
      const slots = sourceSlots.filter((item) => rules.daysFromToday(item.slotDate) >= 0).slice(0, 40);
      const cloudTemplate = data.weeklyAvailabilityTemplate || { configured: false, rows: [] };
      const localTemplates = normalizeTemplates(wx.getStorageSync(WEEKLY_TEMPLATE_KEY));
      const weeklyTemplates = normalizeTemplates(cloudTemplate.configured ? cloudTemplate.rows : localTemplates);
      this.setData({
        slots,
        sourceSlots,
        weeklyTemplates,
        campuses: nextCampuses,
        coaches: nextCoaches,
        "form.campus": nextCampuses.indexOf(this.data.form.campus) >= 0 ? this.data.form.campus : nextCampuses[0],
        "form.coach": nextCoaches.indexOf(this.data.form.coach) >= 0 ? this.data.form.coach : nextCoaches[0],
        "weeklyForm.campus": nextCampuses.indexOf(this.data.weeklyForm.campus) >= 0 ? this.data.weeklyForm.campus : nextCampuses[0],
        "weeklyForm.coach": nextCoaches.indexOf(this.data.weeklyForm.coach) >= 0 ? this.data.weeklyForm.coach : nextCoaches[0]
      });
      wx.setStorageSync(WEEKLY_TEMPLATE_KEY, weeklyTemplates);
      if (!cloudTemplate.configured && localTemplates.length) {
        api.call("saveWeeklyAvailabilityTemplate", { rows: localTemplates }).catch(api.fail);
      }
    }).catch(api.fail);
  },

  saveWeeklyTemplates(weeklyTemplates) {
    wx.setStorageSync(WEEKLY_TEMPLATE_KEY, weeklyTemplates);
    this.setData({ weeklyTemplates });
    api.call("saveWeeklyAvailabilityTemplate", { rows: weeklyTemplates }).catch(api.fail);
  },

  input(event) {
    this.setData({ ["form." + event.currentTarget.dataset.field]: event.detail.value });
  },

  pickDate(event) {
    this.setData({ "form.slotDate": event.currentTarget.dataset.value });
  },

  pickTime(event) {
    this.setData({ "form.slotTime": event.currentTarget.dataset.value });
  },

  pickCampus(event) {
    this.setData({ "form.campus": this.data.campuses[Number(event.detail.value || 0)] || "" });
  },

  pickCoach(event) {
    this.setData({ "form.coach": this.data.coaches[Number(event.detail.value || 0)] || "" });
  },

  capacity(event) {
    const delta = Number(event.currentTarget.dataset.delta || 0);
    this.setData({ "form.capacity": Math.max(1, Number(this.data.form.capacity || 1) + delta) });
  },

  weeklyWeekday(event) {
    const option = WEEKDAYS[Number(event.detail.value || 0)] || WEEKDAYS[0];
    this.setData({ "weeklyForm.weekday": option.value, "weeklyForm.weekdayLabel": option.label });
  },

  weeklyWeekdayBlock(event) {
    const value = Number(event.currentTarget.dataset.value);
    const option = WEEKDAYS.find((item) => item.value === value) || WEEKDAYS[0];
    this.setData({ "weeklyForm.weekday": option.value, "weeklyForm.weekdayLabel": option.label });
  },

  weeklyTime(event) {
    this.setData({ "weeklyForm.slotTime": this.data.timeOptions[Number(event.detail.value || 0)] || this.data.timeOptions[0] });
  },

  weeklyTimeBlock(event) {
    this.setData({ "weeklyForm.slotTime": event.currentTarget.dataset.value });
  },

  weeklyCampus(event) {
    this.setData({ "weeklyForm.campus": this.data.campuses[Number(event.detail.value || 0)] || "" });
  },

  weeklyCampusBlock(event) {
    this.setData({ "weeklyForm.campus": event.currentTarget.dataset.value });
  },

  weeklyCoach(event) {
    this.setData({ "weeklyForm.coach": this.data.coaches[Number(event.detail.value || 0)] || "" });
  },

  weeklyCoachBlock(event) {
    this.setData({ "weeklyForm.coach": event.currentTarget.dataset.value });
  },

  pickCampusBlock(event) {
    this.setData({ "form.campus": event.currentTarget.dataset.value });
  },

  pickCoachBlock(event) {
    this.setData({ "form.coach": event.currentTarget.dataset.value });
  },

  weeklyCapacity(event) {
    const delta = Number(event.currentTarget.dataset.delta || 0);
    this.setData({ "weeklyForm.capacity": Math.max(1, Number(this.data.weeklyForm.capacity || 1) + delta) });
  },

  addWeeklyTemplate() {
    const row = Object.assign({ id: "weekly-" + Date.now() }, this.data.weeklyForm);
    if (!row.slotTime || !row.campus || !row.coach) {
      api.toast("请补全时间、校区和教练");
      return;
    }
    if (this.data.weeklyTemplates.some((item) => templateKey(item) === templateKey(row))) {
      api.toast("这条每周安排已存在");
      return;
    }
    const weeklyTemplates = this.data.weeklyTemplates.concat([row]).sort((a, b) => Number(a.weekday || 7) - Number(b.weekday || 7) || a.slotTime.localeCompare(b.slotTime));
    this.saveWeeklyTemplates(weeklyTemplates);
    api.toast("已加入每周模板");
  },

  removeWeeklyTemplate(event) {
    const id = event.currentTarget.dataset.id;
    const weeklyTemplates = this.data.weeklyTemplates.filter((item) => item.id !== id);
    this.saveWeeklyTemplates(weeklyTemplates);
  },

  generateNextWeek() {
    if (!this.data.weeklyTemplates.length) {
      api.toast("先添加至少一条每周安排");
      return;
    }
    const monday = nextMonday();
    const existing = {};
    this.data.sourceSlots.filter((item) => item.status !== "closed").forEach((item) => { existing[slotKey(item)] = true; });
    const generated = this.data.weeklyTemplates.map((item) => ({
      slotDate: rules.formatDateChina(weekdayDate(monday, item.weekday)),
      slotTime: item.slotTime,
      campus: item.campus,
      coach: item.coach,
      capacity: item.capacity,
      status: "published",
      notes: "老板每周模板"
    })).filter((item) => !existing[slotKey(item)]);
    this.setData({ previewSlots: uniqueSlots(this.data.previewSlots.concat(generated)) });
    api.toast(generated.length ? "已生成下周预览" : "下周课程已经发布过了");
  },

  copyThisWeek() {
    const today = new Date();
    const start = addDays(today, -(today.getDay() === 0 ? 6 : today.getDay() - 1));
    start.setHours(0, 0, 0, 0);
    const end = addDays(start, 7);
    const current = this.data.sourceSlots.filter((item) => {
      const date = new Date(item.slotDate + "T00:00:00");
      return item.status === "published" && date >= start && date < end;
    });
    if (!current.length) {
      api.toast("本周没有可复制的课程");
      return;
    }
    const existing = {};
    this.data.sourceSlots.filter((item) => item.status !== "closed").forEach((item) => { existing[slotKey(item)] = true; });
    const generated = current.map((item) => ({
      slotDate: rules.formatDateChina(addDays(new Date(item.slotDate + "T00:00:00"), 7)),
      slotTime: item.slotTime,
      campus: item.campus,
      coach: item.coach,
      capacity: item.capacity,
      status: "published",
      notes: "复制本周"
    })).filter((item) => !existing[slotKey(item)]);
    this.setData({ previewSlots: uniqueSlots(this.data.previewSlots.concat(generated)) });
    api.toast(generated.length ? "已复制到预览" : "下周课程已经发布过了");
  },

  removePreview(event) {
    const index = Number(event.currentTarget.dataset.index);
    const previewSlots = this.data.previewSlots.slice();
    previewSlots.splice(index, 1);
    this.setData({ previewSlots });
  },

  clearPreview() {
    this.setData({ previewSlots: [] });
  },

  publishPreview() {
    if (!this.data.previewSlots.length) return;
    api.syncing("正在批量发布");
    api.call("createAvailabilitySlots", { slots: this.data.previewSlots }).then((result) => {
      api.done(result.message);
      this.clearPreview();
      this.load();
    }).catch(api.fail);
  },

  create() {
    api.syncing("正在发布");
    api.call("createAvailabilitySlot", this.data.form).then((result) => {
      api.done(result.message);
      this.load();
    }).catch(api.fail);
  },

  close(event) {
    const slotId = event.currentTarget.dataset.id;
    const slot = this.data.slots.find((item) => item.id === slotId) || {};
    wx.showModal({
      title: "停止继续预约",
      content: (slot.dayLabel || slot.slotDate || "该时间") + " " + (slot.slotTime || "") + "\n已有学员课程不会取消，只是不再接受新预约。",
      confirmText: "确认关闭",
      success: (res) => {
        if (!res.confirm) return;
        api.syncing("正在关闭");
        api.call("closeAvailabilitySlot", { slotId }).then((result) => {
          api.done(result.message);
          this.load();
        }).catch(api.fail);
      }
    });
  }
});
