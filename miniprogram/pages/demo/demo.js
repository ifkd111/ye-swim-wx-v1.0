const api = require("../../utils/api");

function freshMembers() {
  return [
    { id: "demo-1", name: "示例学员一", totalLessons: 20, usedLessons: 4, remainingLessons: 16, selected: true, lessons: 1 },
    { id: "demo-2", name: "示例学员二", totalLessons: 16, usedLessons: 3, remainingLessons: 13, selected: true, lessons: 1 }
  ];
}

Page({
  data: {
    mode: "family",
    modes: [
      { id: "family", label: "家长扫码消课" },
      { id: "coach", label: "教练上课码" },
      { id: "owner", label: "老板今日记录" }
    ],
    lessonOptions: [1, 2, 3],
    members: freshMembers(),
    selectedCount: 2,
    totalLessons: 2,
    receipt: false
  },

  onLoad() {
    const session = api.currentSession();
    if (session && session.role) {
      wx.reLaunch({ url: api.homePath(session.role) });
      return;
    }
  },

  switchMode(event) {
    this.setData({ mode: event.currentTarget.dataset.mode });
  },

  updateMembers(members) {
    const selected = members.filter((item) => item.selected);
    this.setData({
      members,
      selectedCount: selected.length,
      totalLessons: selected.reduce((sum, item) => sum + Number(item.lessons || 1), 0)
    });
  },

  toggleMember(event) {
    const id = event.currentTarget.dataset.id;
    this.updateMembers(this.data.members.map((item) => item.id === id ? Object.assign({}, item, { selected: !item.selected }) : item));
  },

  chooseLessons(event) {
    const id = event.currentTarget.dataset.id;
    const lessons = Number(event.currentTarget.dataset.value || 1);
    if ([1, 2, 3].indexOf(lessons) < 0) return;
    this.updateMembers(this.data.members.map((item) => item.id === id ? Object.assign({}, item, { lessons }) : item));
  },

  confirmDemo() {
    if (!this.data.selectedCount) return;
    const members = this.data.members.map((item) => item.selected ? Object.assign({}, item, {
      usedLessons: item.usedLessons + item.lessons,
      remainingLessons: item.remainingLessons - item.lessons
    }) : item);
    this.setData({ members, receipt: true });
  },

  resetDemo() {
    this.setData({ members: freshMembers(), selectedCount: 2, totalLessons: 2, receipt: false });
  },

  goLogin() {
    wx.navigateTo({ url: "/pages/login/login" });
  }
});
