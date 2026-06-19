const api = require("../../utils/api");

const emptyForm = {
  lessonDate: "",
  lessonTime: "17:00-18:00",
  campus: "",
  coach: "",
  memberName: ""
};

function unique(values) {
  return values.filter((value, index) => value && values.indexOf(value) === index);
}

Page({
  data: {
    schedules: [],
    members: [],
    memberNames: [],
    campuses: [],
    coaches: [],
    form: Object.assign({}, emptyForm)
  },

  onShow() {
    if (!api.requireSession("admin")) return;
    this.load();
  },

  load() {
    api.call("getHomeData").then((data) => {
      const members = data.members || [];
      this.setData({
        schedules: (data.schedules || []).slice(0, 50),
        members,
        memberNames: members.map((item) => item.chineseName),
        campuses: unique(members.map((item) => item.campus)),
        coaches: unique(members.map((item) => item.coach))
      });
    });
  },

  input(event) { this.setData({ ["form." + event.currentTarget.dataset.field]: event.detail.value }); },

  pickMember(event) {
    const member = this.data.members[Number(event.detail.value || 0)];
    if (!member) return;
    this.setData({ form: Object.assign({}, this.data.form, { memberName: member.chineseName, campus: member.campus, coach: member.coach }) });
  },

  pickCampus(event) {
    this.setData({ "form.campus": this.data.campuses[Number(event.detail.value || 0)] || "" });
  },

  pickCoach(event) {
    this.setData({ "form.coach": this.data.coaches[Number(event.detail.value || 0)] || "" });
  },

  create() {
    const form = this.data.form;
    if (!form.lessonDate || !form.lessonTime || !form.campus || !form.coach || !form.memberName) {
      api.toast("请补全日期、时间、校区、教练和学员");
      return;
    }
    api.syncing("正在创建");
    api.call("createManualSchedule", form).then((result) => {
      api.done(result.message);
      this.setData({ form: Object.assign({}, emptyForm) });
      this.load();
    }).catch(api.fail);
  },

  cancel(event) {
    const scheduleId = event.currentTarget.dataset.id;
    wx.showModal({
      title: "取消排课",
      editable: true,
      placeholderText: "填写取消原因",
      confirmText: "确认取消",
      success: (res) => {
        if (!res.confirm) return;
        api.syncing("正在取消");
        api.call("cancelSchedule", { scheduleId, reason: res.content || "" }).then((result) => {
          api.done(result.message);
          this.load();
        }).catch(api.fail);
      }
    });
  }
});
