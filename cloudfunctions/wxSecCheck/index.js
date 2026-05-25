// 云函数 wxSecCheck
// 调用微信开放接口 security.msgSecCheck 进行内容安全检测
// 部署步骤：
// 1. 微信开发者工具中右键 cloudfunctions/wxSecCheck → 在终端中打开 → npm install
// 2. 右键云函数 → 上传并部署：云端安装依赖
// 3. 确保已开通云开发并配置了云环境 ID
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * @param {Object} event
 * @param {string} event.content - 待检测文本（1~500 字）
 * @param {number} [event.scene=2] - 场景值：1资料 2评论 3论坛 4社交日志
 * @param {string} [event.openid] - 用户 openid（必填）；不传时从 context 取
 * @returns {Object} { errcode: 0 通过 / 87014 违规 / ... , errmsg }
 */
exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  const content = (event.content || '').toString().trim();
  if (!content) return { errcode: -1, errmsg: '内容不能为空' };
  if (content.length > 500) return { errcode: -2, errmsg: '内容过长' };

  try {
    const res = await cloud.openapi.security.msgSecCheck({
      version: 2,
      scene: event.scene || 2,
      openid: event.openid || wxContext.OPENID,
      content,
    });
    // 文档：errcode 为 0 即通过
    return {
      errcode: res.errCode === undefined ? 0 : res.errCode,
      errmsg: res.errMsg || 'ok',
      detail: res.detail,
      result: res.result,
    };
  } catch (err) {
    // 87014 表示命中违规；其他视为接口异常
    return {
      errcode: err.errCode || -99,
      errmsg: err.errMsg || String(err),
    };
  }
};
