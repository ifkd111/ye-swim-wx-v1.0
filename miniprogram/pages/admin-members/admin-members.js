const api = require("../../utils/api");
const rules = require("../../utils/rules");

const PAGE_SIZE = 20;
const PINYIN_BOUNDARIES = [
  ["A", "阿"], ["B", "芭"], ["C", "擦"], ["D", "搭"], ["E", "蛾"], ["F", "发"],
  ["G", "噶"], ["H", "哈"], ["J", "击"], ["K", "喀"], ["L", "垃"], ["M", "妈"],
  ["N", "拿"], ["O", "哦"], ["P", "啪"], ["Q", "期"], ["R", "然"], ["S", "撒"],
  ["T", "塌"], ["W", "挖"], ["X", "昔"], ["Y", "压"], ["Z", "匝"]
];

function emptyForm() { return { id: "", chineseName: "", phone: "", totalLessons: 0, notes: "" }; }

function comparePinyin(left, right) {
  return String(left || "").localeCompare(String(right || ""), "zh-CN-u-co-pinyin", { numeric: true, sensitivity: "base" });
}

function pinyinInitial(name) {
  const first = String(name || "").trim().charAt(0);
  if (!first) return "#";
  if (/[a-z]/i.test(first)) return first.toUpperCase();
  let initial = "#";
  PINYIN_BOUNDARIES.forEach((item) => {
    if (comparePinyin(first, item[1]) >= 0) initial = item[0];
  });
  return initial;
}

function phoneText(phone) {
  const value = String(phone || "").trim();
  return rules.isChinaMobile(value) ? value.slice(0, 3) + "****" + value.slice(-4) : "未绑定手机";
}

Page({
  data: {
    viewMode: "list",
    allMembers: [],
    members: [],
    pageMembers: [],
    keyword: "",
    lifecycle: "active",
    quickFilter: "all",
    sortMode: "pinyin",
    page: 1,
    pageSize: PAGE_SIZE,
    totalPages: 1,
    listTotal: 0,
    activeCount: 0,
    archivedCount: 0,
    batchMode: false,
    selectedIds: [],
    selectedCount: 0,
    allPageSelected: false,
    form: emptyForm(),
    saving: false,
    batchSaving: false
  },

  onShow() { if (!api.requireSession("admin")) return; this.load(); },

  load() {
    api.call("consumptionHomeData", { includeArchived: true }).then((data) => {
      const allMembers = (data.members || []).map((item) => Object.assign({}, item, {
        initial: pinyinInitial(item.chineseName),
        phoneText: phoneText(item.phone)
      }));
      this.setData({ allMembers }, () => this.filter(true));
    }).catch(api.fail);
  },

  filter(resetPage) {
    const key = String(this.data.keyword || "").trim().toLowerCase();
    const lifecycle = this.data.lifecycle;
    const quickFilter = this.data.quickFilter;
    const sortMode = this.data.sortMode;
    const allMembers = this.data.allMembers || [];
    const activeCount = allMembers.filter((item) => !item.isArchived).length;
    const archivedCount = allMembers.length - activeCount;
    const members = allMembers.filter((item) => {
      if (lifecycle === "active" && item.isArchived) return false;
      if (lifecycle === "archived" && !item.isArchived) return false;
      if (quickFilter === "debt" && Number(item.remainingLessons || 0) >= 0) return false;
      if (quickFilter === "unbound" && rules.isChinaMobile(item.phone)) return false;
      return !key || [item.chineseName, item.phone, item.notes].some((value) => String(value || "").toLowerCase().indexOf(key) >= 0);
    }).sort((left, right) => {
      if (sortMode === "remainingAsc") return Number(left.remainingLessons || 0) - Number(right.remainingLessons || 0) || comparePinyin(left.chineseName, right.chineseName);
      if (sortMode === "remainingDesc") return Number(right.remainingLessons || 0) - Number(left.remainingLessons || 0) || comparePinyin(left.chineseName, right.chineseName);
      return comparePinyin(left.chineseName, right.chineseName);
    });
    const totalPages = Math.max(1, Math.ceil(members.length / PAGE_SIZE));
    const page = resetPage ? 1 : Math.min(this.data.page, totalPages);
    this.setData({ members, activeCount, archivedCount, listTotal: members.length, totalPages, page }, () => this.paginate());
  },

  paginate() {
    const start = (this.data.page - 1) * PAGE_SIZE;
    const selectedIds = this.data.selectedIds || [];
    const pageMembers = this.data.members.slice(start, start + PAGE_SIZE).map((item) => Object.assign({}, item, { selected: selectedIds.indexOf(item.id) >= 0 }));
    const allPageSelected = Boolean(pageMembers.length) && pageMembers.every((item) => item.selected);
    this.setData({ pageMembers, allPageSelected, selectedCount: selectedIds.length });
  },

  search(event) { this.setData({ keyword: event.detail.value }, () => this.filter(true)); },
  setLifecycle(event) { this.setData({ lifecycle: event.currentTarget.dataset.value, selectedIds: [], batchMode: false }, () => this.filter(true)); },
  setQuickFilter(event) { this.setData({ quickFilter: event.currentTarget.dataset.value, selectedIds: [] }, () => this.filter(true)); },
  setSort(event) { this.setData({ sortMode: event.currentTarget.dataset.value }, () => this.filter(true)); },
  previousPage() { if (this.data.page <= 1) return; this.setData({ page: this.data.page - 1 }, () => this.paginate()); },
  nextPage() { if (this.data.page >= this.data.totalPages) return; this.setData({ page: this.data.page + 1 }, () => this.paginate()); },

  toggleBatch() {
    this.setData({ batchMode: !this.data.batchMode, selectedIds: [] }, () => this.paginate());
  },

  toggleSelection(id) {
    const selectedIds = (this.data.selectedIds || []).slice();
    const index = selectedIds.indexOf(id);
    if (index >= 0) selectedIds.splice(index, 1); else selectedIds.push(id);
    this.setData({ selectedIds }, () => this.paginate());
  },

  rowTap(event) {
    const id = event.currentTarget.dataset.id;
    if (this.data.batchMode) return this.toggleSelection(id);
    this.editById(id);
  },

  togglePageSelection() {
    const selectedIds = (this.data.selectedIds || []).slice();
    const pageIds = this.data.pageMembers.map((item) => item.id);
    const next = this.data.allPageSelected
      ? selectedIds.filter((id) => pageIds.indexOf(id) < 0)
      : Array.from(new Set(selectedIds.concat(pageIds)));
    this.setData({ selectedIds: next }, () => this.paginate());
  },

  runBatch() {
    if (this.data.batchSaving) return;
    const ids = this.data.selectedIds || [];
    if (!ids.length) return api.toast("请先选择学员");
    const restoring = this.data.lifecycle === "archived";
    wx.showModal({
      title: restoring ? "恢复学员" : "归档学员",
      content: restoring ? "恢复后会重新出现在当前学员名单。" : "归档后不再出现在当前名单，历史课时和手机号绑定都会保留。",
      confirmText: restoring ? "确认恢复" : "确认归档",
      success: (res) => {
        if (!res.confirm) return;
        this.setData({ batchSaving: true });
        api.syncing(restoring ? "正在恢复" : "正在归档");
        api.call("bulkUpdateMemberStatus", { memberIds: ids, mode: restoring ? "restore" : "archive" })
          .then((result) => { api.done(result.message); this.setData({ selectedIds: [], batchMode: false }); this.load(); })
          .catch(api.fail)
          .finally(() => this.setData({ batchSaving: false }));
      }
    });
  },

  openCreate() { this.setData({ viewMode: "form", form: emptyForm() }); },
  editById(id) {
    const member = this.data.allMembers.find((item) => item.id === id);
    if (!member) return;
    this.setData({ viewMode: "form", form: {
      id: member.id,
      chineseName: member.chineseName || "",
      phone: member.phone || "",
      phoneLocked: Boolean(member.phoneLocked),
      totalLessons: Number(member.totalLessons || 0),
      notes: member.notes || ""
    } });
  },
  closeForm() { this.setData({ viewMode: "list", form: emptyForm() }); },
  input(event) { this.setData({ ["form." + event.currentTarget.dataset.field]: event.detail.value }); },

  save() {
    if (this.data.saving) return;
    const form = this.data.form;
    const phone = String(form.phone || "").trim();
    if (!String(form.chineseName || "").trim()) return api.toast("请填写学员姓名");
    if (!form.id && !rules.isChinaMobile(phone)) return api.toast("新增学员需填写家长的 11 位手机号");
    if (phone && !rules.isChinaMobile(phone)) return api.toast("手机号格式不正确");
    if (!form.id && Number(form.totalLessons) < 0) return api.toast("总课时不能小于 0");
    this.setData({ saving: true });
    api.syncing("正在保存");
    api.call("saveMember", { member: form }).then((result) => {
      if (!rules.isChinaMobile(phone)) return result;
      return api.call("bindMemberGuardian", { memberId: result.member.id, phone }).then((binding) => ({ message: binding.message || result.message }));
    }).then((result) => {
      api.done(result.message);
      this.setData({ viewMode: "list" });
      this.load();
    }).catch(api.fail).finally(() => this.setData({ saving: false }));
  },

  addLessons(event) {
    const id = event.currentTarget.dataset.id;
    const member = this.data.allMembers.find((item) => item.id === id);
    if (!member) return;
    wx.showModal({
      title: "给 " + member.chineseName + " 加课",
      editable: true,
      placeholderText: "输入增加课时，例如 10",
      confirmText: "确认加课",
      success: (res) => {
        if (!res.confirm) return;
        const amount = Number(res.content);
        if (!Number.isInteger(amount) || amount === 0) return api.toast("请输入非零整数");
        api.syncing("正在加课");
        api.call("addMemberLessons", { memberId: id, amount, reason: "老板加课" }).then((result) => { api.done(result.message); this.load(); }).catch(api.fail);
      }
    });
  }
});
