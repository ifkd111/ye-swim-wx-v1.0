const api = require("../../utils/api");
const rules = require("../../utils/rules");

function emptyForm() { return { id: "", chineseName: "", phone: "", totalLessons: 0, notes: "" }; }

Page({
  data: { viewMode: "list", allMembers: [], members: [], keyword: "", form: emptyForm(), saving: false },
  onShow() { if (!api.requireSession("admin")) return; this.load(); },
  load() { api.call("consumptionHomeData").then((data) => { this.setData({ allMembers: data.members || [] }, () => this.filter()); }).catch(api.fail); },
  filter() { const key = String(this.data.keyword || "").trim().toLowerCase(); this.setData({ members: this.data.allMembers.filter((item) => !key || [item.chineseName, item.phone, item.notes].some((value) => String(value || "").toLowerCase().indexOf(key) >= 0)) }); },
  search(event) { this.setData({ keyword: event.detail.value }, () => this.filter()); },
  openCreate() { this.setData({ viewMode: "form", form: emptyForm() }); },
  edit(event) { const member = this.data.allMembers.find((item) => item.id === event.currentTarget.dataset.id); if (!member) return; this.setData({ viewMode: "form", form: { id: member.id, chineseName: member.chineseName || "", phone: member.phone || "", phoneLocked: Boolean(member.phoneLocked), totalLessons: Number(member.totalLessons || 0), notes: member.notes || "" } }); },
  closeForm() { this.setData({ viewMode: "list", form: emptyForm() }); },
  input(event) { this.setData({ ["form." + event.currentTarget.dataset.field]: event.detail.value }); },
  save() {
    if (this.data.saving) return;
    const form = this.data.form;
    if (!String(form.chineseName || "").trim()) return api.toast("请填写学员姓名");
    if (!rules.isChinaMobile(form.phone)) return api.toast("请填写家长的 11 位手机号");
    if (!form.id && Number(form.totalLessons) < 0) return api.toast("总课时不能小于 0");
    this.setData({ saving: true }); api.syncing("正在保存");
    api.call("saveMember", { member: form }).then((result) => api.call("bindMemberGuardian", { memberId: result.member.id, phone: form.phone })).then((result) => { api.done(result.message); this.setData({ viewMode: "list" }); this.load(); }).catch(api.fail).finally(() => this.setData({ saving: false }));
  },
  addLessons(event) {
    const id = event.currentTarget.dataset.id;
    const member = this.data.allMembers.find((item) => item.id === id);
    if (!member) return;
    wx.showModal({ title: "给 " + member.chineseName + " 加课", editable: true, placeholderText: "输入增加课时，例如 10", confirmText: "确认加课", success: (res) => { if (!res.confirm) return; const amount = Number(res.content); if (!Number.isInteger(amount) || amount === 0) return api.toast("请输入非零整数"); api.syncing("正在加课"); api.call("addMemberLessons", { memberId: id, amount, reason: "老板加课" }).then((result) => { api.done(result.message); this.load(); }).catch(api.fail); } });
  }
});
