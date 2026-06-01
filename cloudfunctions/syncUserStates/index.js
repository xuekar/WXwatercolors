// 云函数 syncUserStates
// 用户颜料标记（owned/wishlist）的云端同步
// 集合 user_states 结构：
//   _id: auto / _openid: 用户唯一标识（主键）
//   states: { [brandId]: { [pigmentId]: { owned, wishlist, markedAt } } }
//   updatedAt: Number 最后更新时间戳
//
// action:
//   "pull"   拉取当前用户的 states（首次进入或冷启动用）
//   "push"   覆盖式上传 states（用户主动标记后调用）
//   "merge"  增量合并 states（保留对端最新版本，按 markedAt 取较大）

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const COLL = 'user_states';

// 工具：浅合并两份 states，按 markedAt 取较新
function mergeStates(a, b) {
  const result = {};
  const brandIds = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  brandIds.forEach(bid => {
    const aBrand = (a && a[bid]) || {};
    const bBrand = (b && b[bid]) || {};
    const merged = {};
    const pigIds = new Set([...Object.keys(aBrand), ...Object.keys(bBrand)]);
    pigIds.forEach(pid => {
      const aP = aBrand[pid];
      const bP = bBrand[pid];
      if (aP && !bP) merged[pid] = aP;
      else if (!aP && bP) merged[pid] = bP;
      else if (aP && bP) {
        merged[pid] = (aP.markedAt || 0) >= (bP.markedAt || 0) ? aP : bP;
      }
    });
    if (Object.keys(merged).length > 0) result[bid] = merged;
  });
  return result;
}

// 工具：判断错误是否为"集合不存在"
function isCollectionNotExist(err) {
  const msg = String(err && (err.errMsg || err.message || err) || '');
  return msg.indexOf('-502005') !== -1 ||
         msg.indexOf('Db or Table not exist') !== -1 ||
         msg.indexOf('database collection not exists') !== -1;
}

// 工具：尝试创建集合（幂等，已存在不会报错）
async function ensureCollection() {
  try {
    await db.createCollection(COLL);
    console.log('[syncUserStates] 集合 user_states 已创建');
  } catch (err) {
    // ResourceAlreadyExists / -501001 表示集合已存在，可忽略
    const msg = String(err && (err.errMsg || err.message || err) || '');
    if (msg.indexOf('already exist') === -1 && msg.indexOf('-501001') === -1) {
      console.warn('[syncUserStates] createCollection 警告：', msg);
    }
  }
}

// 安全 get：失败且为"集合不存在"时自动创建
async function safeGet(openid) {
  try {
    return await db.collection(COLL).where({ _openid: openid }).get();
  } catch (err) {
    if (isCollectionNotExist(err)) {
      await ensureCollection();
      return { data: [] }; // 新建后必然为空
    }
    throw err;
  }
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  console.log('[syncUserStates] 当前 OPENID:', OPENID, ' action:', event.action);
  if (!OPENID) return { success: false, error: 'no openid' };

  const action = event.action || 'pull';
  const incoming = event.states || {};

  try {
    if (action === 'pull') {
      const res = await safeGet(OPENID);
      const doc = res.data && res.data[0];
      console.log('[syncUserStates] pull 命中文档数:', res.data ? res.data.length : 0);
      return {
        success: true,
        openid: OPENID,
        states: doc ? doc.states || {} : {},
        updatedAt: doc ? doc.updatedAt || 0 : 0,
      };
    }

    if (action === 'push') {
      const now = Date.now();
      const res = await safeGet(OPENID);
      if (res.data && res.data.length > 0) {
        await db.collection(COLL).doc(res.data[0]._id).update({
          data: { states: incoming, updatedAt: now },
        });
      } else {
        // 关键：云函数中 add 必须手动写入 _openid，否则查询不到
        await db.collection(COLL).add({
          data: { _openid: OPENID, states: incoming, updatedAt: now },
        });
      }
      return { success: true, updatedAt: now };
    }

    if (action === 'merge') {
      const now = Date.now();
      const res = await safeGet(OPENID);
      const doc = res.data && res.data[0];
      const oldStates = doc ? doc.states || {} : {};
      const merged = mergeStates(oldStates, incoming);
      if (doc) {
        await db.collection(COLL).doc(doc._id).update({
          data: { states: merged, updatedAt: now },
        });
      } else {
        await db.collection(COLL).add({
          data: { _openid: OPENID, states: merged, updatedAt: now },
        });
      }
      return { success: true, states: merged, updatedAt: now };
    }

    return { success: false, error: 'unknown action: ' + action };
  } catch (err) {
    console.error('[syncUserStates] error', err);
    return { success: false, error: String(err && err.message || err) };
  }
};
