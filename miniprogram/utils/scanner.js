function errorText(error) {
  return String(error && (error.errMsg || error.message) || "").toLowerCase();
}

function cancelledError(message) {
  const error = new Error(message || "扫码已取消");
  error.cancelled = true;
  return error;
}

function isCancelled(error) {
  return Boolean(error && error.cancelled) || /cancel/.test(errorText(error));
}

function isPermissionError(error) {
  return /auth|authorize|permission|camera|deny|denied/.test(errorText(error));
}

function openCameraSettings(wxApi) {
  return new Promise((resolve, reject) => {
    wxApi.showModal({
      title: "需要相机权限",
      content: "扫码消课需要使用摄像头。请在设置中允许相机权限后继续。",
      confirmText: "去设置",
      cancelText: "暂不",
      success: (modal) => {
        if (!modal.confirm) {
          reject(cancelledError("未开启相机权限"));
          return;
        }
        wxApi.openSetting({
          success: (setting) => {
            if (setting.authSetting && setting.authSetting["scope.camera"]) resolve();
            else reject(new Error("相机权限仍未开启"));
          },
          fail: () => reject(new Error("无法打开权限设置，请稍后重试"))
        });
      },
      fail: () => reject(new Error("无法申请相机权限，请稍后重试"))
    });
  });
}

function ensureCameraPermission(wxApi) {
  return new Promise((resolve, reject) => {
    if (!wxApi.getSetting || !wxApi.authorize) {
      resolve();
      return;
    }
    wxApi.getSetting({
      success: (setting) => {
        const camera = setting.authSetting && setting.authSetting["scope.camera"];
        if (camera === true) {
          resolve();
          return;
        }
        if (camera === false) {
          openCameraSettings(wxApi).then(resolve).catch(reject);
          return;
        }
        wxApi.authorize({
          scope: "scope.camera",
          success: resolve,
          fail: () => openCameraSettings(wxApi).then(resolve).catch(reject)
        });
      },
      fail: resolve
    });
  });
}

function performScan(wxApi) {
  return new Promise((resolve, reject) => {
    wxApi.scanCode({
      onlyFromCamera: true,
      scanType: ["qrCode"],
      success: (result) => {
        const code = String(result.result || result.path || "").trim();
        if (code) resolve(code);
        else reject(new Error("没有识别到有效上课码"));
      },
      fail: (error) => reject(isCancelled(error) ? cancelledError() : error)
    });
  });
}

function scanQr(wxApi) {
  const runtime = wxApi || wx;
  return ensureCameraPermission(runtime).then(() => performScan(runtime).catch((error) => {
    if (isCancelled(error) || !isPermissionError(error)) throw error;
    return openCameraSettings(runtime).then(() => performScan(runtime));
  }));
}

module.exports = {
  scanQr,
  isCancelled,
  isPermissionError
};
