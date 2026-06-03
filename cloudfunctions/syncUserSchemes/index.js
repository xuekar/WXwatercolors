// 云函数 syncUserSchemes
// 用户色彩方案的云端同步
// 集合 user_schemes 结构：
//   _id: auto / _openid: 用户唯一标识（主键）
//   schemes: [{ id, name, pigments, createdAt, savedAt, ... }]
//   updatedAt: Number 最后更新时间戳
//
// action:
//   "pull"   拉取当前用户的 schemes
//   "push"   覆盖式上传 schemes（用户保存方案后调用）

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const COLL = 'user_schemes';

function isCollectionNotExist(err) {
  const msg = String(err && (err.errMsg || err.message || err) || '');
  return msg.indexOf('-502005') !== -1 ||
         msg.indexOf('Db or Table not exist') !== -1 ||
         msg.indexOf('database collection not exists') !== -1;
}

async function ensureCollection() {
  try {
    await db.createCollection(COLL);
    console.log('[syncUserSchemes] 集合 user_schemes 已创建');
  } catch (err) {
    const msg = String(err && (err.errMsg || err.message || err) || '');
    if (msg.indexOf('already exist') === -1 && msg.indexOf('-501001') === -1) {
      console.warn('[syncUserSchemes] createCollection 警告：', msg);
    }
  }
}

async function safeGet(openid) {
  try {
    return await db.collection(COLL).where({ _openid: openid }).get();
  } catch (err) {
    if (isCollectionNotExist(err)) {
      await ensureCollection();
      return { data: [] };
    }
    throw err;
  }
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  console.log('[syncUserSchemes] 当前 OPENID:', OPENID, ' action:', event.action);
  if (!OPENID) return { success: false, error: 'no openid' };

  const action = event.action || 'pull';
  const incoming = Array.isArray(event.schemes) ? event.schemes : [];

  try {
    if (action === 'pull') {
      const res = await safeGet(OPENID);
      const doc = res.data && res.data[0];
      console.log('[syncUserSchemes] pull 命中文档数:', res.data ? res.data.length : 0);
      return {
        success: true,
        openid: OPENID,
        schemes: doc ? doc.schemes || [] : [],
        updatedAt: doc ? doc.updatedAt || 0 : 0,
      };
    }

    if (action === 'push') {
      const now = Date.now();
      const res = await safeGet(OPENID);
      if (res.data && res.data.length > 0) {
        // 用 _.set() 强制替换整个 schemes 数组，避免数据库做合并操作
        await db.collection(COLL).doc(res.data[0]._id).update({
          data: {
            schemes: _.set(incoming),
            updatedAt: now,
          },
        });
      } else {
        // 关键：云函数中 add 必须手动写入 _openid，否则查询不到
        await db.collection(COLL).add({
          data: { _openid: OPENID, schemes: incoming, updatedAt: now },
        });
      }
      return { success: true, updatedAt: now };
    }

    return { success: false, error: 'unknown action: ' + action };
  } catch (err) {
    console.error('[syncUserSchemes] error', err);
    return { success: false, error: String(err && err.message || err) };
  }
};
