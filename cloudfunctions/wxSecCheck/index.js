// 云函数 wxSecCheck
// 调用微信开放接口 security.msgSecCheck 进行内容安全检测
// 返回字段：
//   pass: true/false        是否通过（前端只需看这个）
//   risky: true/false       是否明确命中违规（与 pass 互斥）
//   errcode/errmsg          原始返回（用于调试）
//   detail/result           v2 接口返回的详细信息
//   version: 1 | 2          实际使用的接口版本

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 工具：判断 v2 接口返回是否命中违规
function isV2Risky(res) {
  if (!res) return false;
  // 顶层 result.suggest
  if (res.result && (res.result.suggest === 'risky' || res.result.suggest === 'review')) {
    return true;
  }
  // detail 数组：任一项命中就视为违规
  if (Array.isArray(res.detail)) {
    return res.detail.some(d => {
      if (!d) return false;
      if (d.suggest === 'risky' || d.suggest === 'review') return true;
      if (d.errcode && d.errcode !== 0) return true;
      // label = 100 是正常分类，其他都表示命中违规分类
      if (d.label != null && Number(d.label) !== 100) return true;
      return false;
    });
  }
  // 也兼容 detail 为对象的情形
  if (res.detail && typeof res.detail === 'object' && !Array.isArray(res.detail)) {
    if (res.detail.suggest === 'risky' || res.detail.suggest === 'review') return true;
  }
  return false;
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  const content = (event.content || '').toString().trim();
  if (!content) return { pass: false, risky: false, errcode: -1, errmsg: '内容不能为空' };
  if (content.length > 500) return { pass: false, risky: false, errcode: -2, errmsg: '内容过长' };

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
      console.log('[wxSecCheck] v2 返回', JSON.stringify(res));
      const risky = isV2Risky(res);
      const errcode = res.errCode === undefined ? 0 : res.errCode;
      // v2 通常 errCode === 0；只要识别到 risky 就视为违规
      return {
        pass: !risky && (errcode === 0),
        risky,
        errcode,
        errmsg: res.errMsg || 'ok',
        detail: res.detail,
        result: res.result,
        version: 2,
      };
    } catch (err) {
      console.warn('[wxSecCheck] v2 调用失败', err && err.errCode, err && err.errMsg);
      // v2 抛异常时 errCode 87014 表示违规
      if (err && err.errCode === 87014) {
        return {
          pass: false,
          risky: true,
          errcode: 87014,
          errmsg: err.errMsg || '内容含敏感词',
          version: 2,
        };
      }
      // 其他异常：回退到 v1
    }
  }

  // 回退方案：v1（无需 openid）
  try {
    const res = await cloud.openapi.security.msgSecCheck({ content });
    console.log('[wxSecCheck] v1 返回', JSON.stringify(res));
    const errcode = res.errCode === undefined ? 0 : res.errCode;
    return {
      pass: errcode === 0,
      risky: false,
      errcode,
      errmsg: res.errMsg || 'ok',
      version: 1,
    };
  } catch (err) {
    console.warn('[wxSecCheck] v1 调用失败', err && err.errCode, err && err.errMsg);
    // 87014 表示命中违规
    if (err && err.errCode === 87014) {
      return {
        pass: false,
        risky: true,
        errcode: 87014,
        errmsg: err.errMsg || '内容含敏感词',
        version: 1,
      };
    }
    // 其他错误：返回 errcode 让前端走 fallback 路径
    return {
      pass: false,
      risky: false,
      errcode: (err && err.errCode) || -99,
      errmsg: (err && err.errMsg) || String(err),
      version: 1,
    };
  }
};
