const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const adminJs = read("miniprogram/pages/admin/admin.js");
const adminWxml = read("miniprogram/pages/admin/admin.wxml");
const coachJs = read("miniprogram/pages/coach/coach.js");
const coachWxml = read("miniprogram/pages/coach/coach.wxml");
const studentJs = read("miniprogram/pages/student/student.js");
const studentWxml = read("miniprogram/pages/student/student.wxml");
const appWxss = read("miniprogram/app.wxss");

assert(adminJs.includes("unselectedMatches.slice(0, 24)"), "老板补录名单必须限制首屏渲染数量");
assert(adminJs.includes("manualSearch(event)"), "老板补录名单必须支持即时搜索");
assert(adminWxml.includes('wx:for="{{manualVisibleMembers}}"'), "补录弹窗不应直接渲染全部学员");
assert(adminWxml.includes("manualSelectedCount"), "补录弹窗必须反馈已选人数");

assert(coachJs.includes("loadError") && coachJs.includes("retryLoad()"), "教练首页必须提供持久错误和重试");
assert(coachWxml.includes('role="alert"') && coachWxml.includes('bindtap="retryLoad"'), "教练错误状态必须可感知、可恢复");
assert(studentJs.includes("loadError") && studentJs.includes("retryLoad()"), "家长首页必须提供持久错误和重试");
assert(studentWxml.includes('role="alert"') && studentWxml.includes('bindtap="retryLoad"'), "家长错误状态必须可感知、可恢复");

const scanTip = studentWxml.match(/<view class="scan-tip"[\s\S]*?<\/view>\s*<view class="member-card"/);
assert(scanTip, "家长首页必须保留微信扫码说明");
assert(!/bindtap=/.test(scanTip[0]), "非按钮扫码说明不应绑定点击事件");
assert(!/scan-arrow/.test(scanTip[0]), "非按钮扫码说明不应使用跳转箭头");
assert(/微信扫码/.test(scanTip[0]), "扫码说明应明确使用微信扫一扫");

assert(/button\s*\{[\s\S]*?min-height:\s*88rpx/.test(appWxss), "全局按钮点击高度不得低于 88rpx");
assert(/button\.mini\s*\{[\s\S]*?min-height:\s*88rpx/.test(appWxss), "小按钮点击高度不得低于 88rpx");
assert(/\.chip\s*\{[\s\S]*?min-height:\s*88rpx/.test(appWxss), "选择标签点击高度不得低于 88rpx");
assert(/input,[\s\S]*?textarea\s*\{[\s\S]*?min-height:\s*88rpx/.test(appWxss), "输入框高度不得低于 88rpx");

console.log("三角色体验规则通过：长名单限流搜索、异常可恢复、无虚假点击、核心控件 44px 触控区。");
