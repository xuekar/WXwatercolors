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
 * @param {string} [event.openid] - 用户 openid（v2 必填）
 * @returns {Object} { errcode: 0 通过 / 87014 违规 / 其他=接口异常（前端会降级放行） }
 */
exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  const content = (event.content || '').toString().trim();
  if (!content) return { errcode: -1, errmsg: '内容不能为空' };
  if (content.length > 500) return { errcode: -2, errmsg: '内容过长' };

  const openid = event.openid || wxContext.OPENID || '';

  // 优先尝试 v2（功能更强，需要 openid）
  if (openid) {
    try {
      const res = await cloud.openapi.security.msgSecCheck({
        version: 2,
        scene: event.scene || 2,
        openid,
        content,
      });
      return {
        errcode: res.errCode === undefined ? 0 : res.errCode,
        errmsg: res.errMsg || 'ok',
        detail: res.detail,
        result: res.result,
        version: 2,
      };
    } catch (err) {
      console.warn('[wxSecCheck] v2 调用失败，回退 v1', err);
      // 回退到 v1
    }
  }

  // 回退方案：v1 简单关键词匹配（无需 openid）
  try {
    const res = await cloud.openapi.security.msgSecCheck({ content });
    return {
      errcode: res.errCode === undefined ? 0 : res.errCode,
      errmsg: res.errMsg || 'ok',
      version: 1,
    };
  } catch (err) {
    // 87014 表示命中违规；其他视为接口异常（前端降级放行）
    return {
      errcode: err.errCode || -99,
      errmsg: err.errMsg || String(err),
      version: 1,
    };
  }
};
