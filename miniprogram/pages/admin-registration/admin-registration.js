const api = require("../../utils/api");

function envVersion() {
  try { return wx.getAccountInfoSync().miniProgram.envVersion || "release"; } catch (error) { return "release"; }
}

Page({
  data: { loading: true, loadError: "", invites: [], requests: [], pendingCount: 0, reviewVisible: false, review: null, saving: false },
  onShow() { if (!api.requireSession("admin")) return; this.load(); },
  onPullDownRefresh() { this.load(); },
  load() {
    this.setData({ loading: true, loadError: "" });
    api.call("registrationAdminData", { envVersion: envVersion() }).then((data) => {
      const invites = (data.invites || []).map((item) => Object.assign({}, item, {
        letter: item.inviteType === "coach" ? "A" : "B",
        title: item.inviteType === "coach" ? "教练登记码" : "学员登记码",
        note: item.inviteType === "coach" ? "教练扫码后只授权手机号" : "家长可一次登记多名孩子"
      }));
      this.setData({ invites, requests: data.requests || [], pendingCount: data.pendingCount || 0, loading: false });
      wx.stopPullDownRefresh();
    }).catch((error) => { this.setData({ loading: false, loadError: error && error.message ? error.message : "登记信息读取失败" }); wx.stopPullDownRefresh(); });
  },
  retryLoad() { this.load(); },
  previewInvite(event) {
    const invite = this.data.invites.find((item) => item.inviteType === event.currentTarget.dataset.type);
    if (invite && invite.fileId) wx.previewImage({ urls: [invite.fileId], current: invite.fileId });
  },
  rotateInvite(event) {
    const inviteType = event.currentTarget.dataset.type;
    const label = inviteType === "coach" ? "教练码 A" : "学员码 B";
    wx.showModal({ title: "更换" + label, content: "更换后，群里之前发过的旧码会立即失效。确定继续？", confirmText: "确认更换", confirmColor: "#a84b40", success: (res) => {
      if (!res.confirm) return;
      api.syncing("正在生成新码");
      api.call("rotateRegistrationInvite", { inviteType, envVersion: envVersion() }).then((result) => { api.done(result.message); this.load(); }).catch(api.fail);
    } });
  },
  openReview(event) {
    const request = this.data.requests.find((item) => item.id === event.currentTarget.dataset.id);
    if (!request) return;
    this.setData({ reviewVisible: true, review: {
      id: request.id,
      requestType: request.requestType,
      phone: request.phone,
      displayName: "",
      campus: "",
      submittedAt: request.submittedAt,
      children: (request.children || []).map((item) => ({ clientId: item.clientId, proposedName: item.proposedName, remainingLessons: String(item.remainingLessons) }))
    } });
  },
  closeReview() { if (!this.data.saving) this.setData({ reviewVisible: false, review: null }); },
  noop() {},
  reviewInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ ["review." + field]: event.detail.value });
  },
  childInput(event) {
    const index = Number(event.currentTarget.dataset.index);
    const field = event.currentTarget.dataset.field;
    this.setData({ ["review.children[" + index + "]." + field]: event.detail.value });
  },
  approve() {
    const review = this.data.review;
    if (!review || this.data.saving) return;
    const payload = { requestId: review.id, decision: "approve" };
    if (review.requestType === "coach") {
      payload.displayName = String(review.displayName || "").trim();
      payload.campus = String(review.campus || "").trim();
      if (!payload.displayName) return api.toast("请填写教练姓名");
    } else {
      try {
        payload.children = review.children.map((item, index) => {
          const proposedName = String(item.proposedName || "").trim();
          const remainingLessons = Number(item.remainingLessons);
          if (!proposedName) throw new Error("请填写第 " + (index + 1) + " 名孩子的姓名");
          if (item.remainingLessons === "" || !Number.isInteger(remainingLessons) || remainingLessons < -999 || remainingLessons > 99999) throw new Error("第 " + (index + 1) + " 名孩子的课时需为整数");
          return { clientId: item.clientId, name: proposedName, remainingLessons };
        });
      } catch (error) { return api.toast(error.message); }
    }
    this.setData({ saving: true }); api.syncing("正在开通账号");
    api.call("reviewRegistration", payload).then((result) => { api.done(result.message); this.setData({ saving: false, reviewVisible: false, review: null }); this.load(); }).catch((error) => { this.setData({ saving: false }); api.fail(error); });
  },
  reject() {
    const review = this.data.review;
    if (!review || this.data.saving) return;
    wx.showModal({ title: "拒绝这份申请？", content: "拒绝后不会创建账号，申请人可以重新扫码提交。", confirmText: "确认拒绝", confirmColor: "#a84b40", success: (res) => {
      if (!res.confirm) return;
      this.setData({ saving: true }); api.syncing("正在处理");
      api.call("reviewRegistration", { requestId: review.id, decision: "reject" }).then((result) => { api.done(result.message); this.setData({ saving: false, reviewVisible: false, review: null }); this.load(); }).catch((error) => { this.setData({ saving: false }); api.fail(error); });
    } });
  }
});
