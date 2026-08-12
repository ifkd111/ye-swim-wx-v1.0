const api = require("../../utils/api");

function extension(name) {
  const match = /\.([^.]+)$/.exec(String(name || "").toLowerCase());
  return match ? match[1] : "";
}

function cloudPath(name) {
  const ext = extension(name) || "xlsx";
  return "people-imports/" + Date.now() + "-" + Math.random().toString(36).slice(2, 9) + "." + ext;
}

Page({
  data: {
    phase: "empty",
    fileName: "",
    fileId: "",
    uploadProgress: 0,
    plan: null,
    error: "",
    confirming: false,
    readOnly: false
  },

  onShow() { const session = api.requireSession("admin"); if (session) this.setData({ readOnly: Boolean(session.developerReadOnly) }); },

  chooseFile() {
    if (this.data.readOnly) return api.toast("开发者视角为只读");
    if (this.data.phase === "uploading" || this.data.confirming) return;
    wx.chooseMessageFile({
      count: 1,
      type: "file",
      extension: ["xlsx", "xls", "et"],
      success: (result) => {
        const file = result.tempFiles && result.tempFiles[0];
        if (!file) return;
        if (["xlsx", "xls", "et"].indexOf(extension(file.name)) < 0) return api.toast("请选择 XLSX、XLS 或 ET 表格");
        if (Number(file.size || 0) > 10 * 1024 * 1024) return api.toast("表格不能超过 10MB");
        this.uploadAndPreview(file);
      }
    });
  },

  uploadAndPreview(file) {
    const previous = this.data.fileId;
    if (previous) wx.cloud.deleteFile({ fileList: [previous] }).catch(() => null);
    this.setData({ phase: "uploading", fileName: file.name, fileId: "", uploadProgress: 0, plan: null, error: "" });
    const task = wx.cloud.uploadFile({ cloudPath: cloudPath(file.name), filePath: file.path });
    if (task && task.onProgressUpdate) task.onProgressUpdate((event) => this.setData({ uploadProgress: Number(event.progress || 0) }));
    task.then((uploaded) => {
      this.setData({ fileId: uploaded.fileID, uploadProgress: 100 });
      return api.call("previewPeopleImport", { fileId: uploaded.fileID, fileName: file.name });
    }).then((plan) => {
      this.setData({ phase: "preview", plan, error: "" });
    }).catch((error) => {
      this.setData({ phase: "error", error: error && error.message ? error.message : "表格读取失败" });
    });
  },

  confirmImport() {
    const plan = this.data.plan;
    if (!plan || this.data.confirming) return;
    if (plan.summary && plan.summary.errorCount) return api.toast("请先修正表格错误");
    wx.showModal({
      title: "确认写入人员名单？",
      content: "将新增或更新 " + Number(plan.summary.coachTotal || 0) + " 位教练、" + Number(plan.summary.studentTotal || 0) + " 名学员。相同手机号和姓名会更新，不会重复新建。",
      confirmText: "确认导入",
      success: (res) => {
        if (!res.confirm) return;
        this.setData({ confirming: true });
        api.syncing("正在导入");
        api.call("confirmPeopleImport", { fileId: this.data.fileId, fileName: this.data.fileName }).then((result) => {
          api.done(result.message);
          this.setData({ phase: "done", plan: null, fileId: "", confirming: false });
        }).catch((error) => {
          this.setData({ confirming: false });
          api.fail(error);
        });
      }
    });
  },

  reset() {
    const fileId = this.data.fileId;
    if (fileId) wx.cloud.deleteFile({ fileList: [fileId] }).catch(() => null);
    this.setData({ phase: "empty", fileName: "", fileId: "", uploadProgress: 0, plan: null, error: "", confirming: false });
  },

  goCoaches() { wx.redirectTo({ url: "/pages/admin-coaches/admin-coaches" }); },
  goMembers() { wx.redirectTo({ url: "/pages/admin-members/admin-members" }); }
});
