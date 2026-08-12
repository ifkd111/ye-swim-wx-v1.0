const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const app = JSON.parse(read("miniprogram/app.json"));
const demoJs = read("miniprogram/pages/demo/demo.js");
const demoWxml = read("miniprogram/pages/demo/demo.wxml");
const loginWxml = read("miniprogram/pages/login/login.wxml");

assert.strictEqual(app.pages[0], "pages/demo/demo", "小程序首屏必须是免登录功能体验页");
assert(!/getPhoneNumber|chooseAvatar|getUserProfile/.test(demoWxml), "免登录体验页不得请求手机号、头像或昵称授权");
assert(!/\.call\s*\(|wx\.cloud|setStorageSync/.test(demoJs), "免登录体验页不得调用云端或写入用户数据");
const demoSource = `${demoJs}\n${demoWxml}`;
assert(/家长扫码消课/.test(demoSource) && /教练上课码/.test(demoSource) && /老板今日记录/.test(demoSource), "免登录体验页应覆盖三种核心功能");
assert(/暂不登录，继续体验功能/.test(loginWxml), "手机号授权页必须允许用户拒绝并返回体验");
assert(/url="\/pages\/demo\/demo" open-type="reLaunch"/.test(loginWxml), "拒绝登录入口必须使用明确且稳定的首页重启导航");
assert(/登录我的账号/.test(demoWxml), "体验后应由用户自主选择登录");

console.log("审核合规体验测试通过：首屏免登录、无个人信息授权、可体验核心功能、可拒绝登录。");
