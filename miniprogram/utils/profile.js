const api = require("./api");
const runtime = require("./runtime");

function uploadAvatar(tempPath, account) {
  const value = String(tempPath || "");
  if (!value || /^cloud:\/\//.test(value) || runtime.useMock()) return Promise.resolve(value);
  const suffix = (/\.([a-z0-9]+)(?:\?|$)/i.exec(value) || [])[1] || "jpg";
  const cloudPath = "profiles/" + String(account || "user").replace(/[^a-z0-9_-]/gi, "") + "/" + Date.now() + "." + suffix;
  return wx.cloud.uploadFile({ cloudPath, filePath: value }).then((result) => result.fileID);
}

function save(page) {
  if (page.data.profileSaving) return;
  const nickname = String(page.data.profileNickname || "").trim();
  if (!nickname) return api.toast("请填写微信昵称");
  page.setData({ profileSaving: true });
  api.syncing("正在保存资料");
  uploadAvatar(page.data.profileAvatar, page.data.viewer.account).then((avatarFileId) => {
    return api.call("saveMyProfile", { nickname, avatarFileId });
  }).then((result) => {
    api.saveSession(result.session);
    page.setData({ viewer: result.session, profileVisible: false, profileSaving: false });
    api.done(result.message);
  }).catch((error) => {
    page.setData({ profileSaving: false });
    api.fail(error);
  });
}

function open(page) {
  const viewer = page.data.viewer || {};
  page.setData({
    profileVisible: true,
    profileNickname: viewer.nickname || viewer.fullName || "",
    profileAvatar: viewer.avatarFileId || ""
  });
}

function chooseAvatar(page, event) {
  const avatarUrl = event && event.detail && event.detail.avatarUrl;
  if (avatarUrl) page.setData({ profileAvatar: avatarUrl });
}

module.exports = { save, open, chooseAvatar };
