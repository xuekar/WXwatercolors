// utils/pigment-store.js — 颜料数据中心
// 通过 setTimeout 把 require + map 拆到 onLoad 之外的下一帧

const PIGMENT_LOADERS = {
  1: () => require('./data/wn-pigments.js'),
  2: () => require('./data/ds-pigments.js'),
  3: () => require('./data/sch-pigments.js'),
  4: () => require('./data/hbn-pigments.js'),
  5: () => require('./data/mh-pigments.js'),
  6: () => require('./data/mg-pigments.js'),
};

const _pigmentsCache = {};

function _syncCounts(brandId, list) {
  const app = getApp();
  if (!app) return;
  if (!app.globalData) app.globalData = {};
  if (!app.globalData.ownedCounts) app.globalData.ownedCounts = {};
  if (!app.globalData.wishlistCounts) app.globalData.wishlistCounts = {};
  let owned = 0, wish = 0;
  for (const p of list) {
    if (p.owned) owned++;
    if (p.wishlist) wish++;
  }
  app.globalData.ownedCounts[brandId] = owned;
  app.globalData.wishlistCounts[brandId] = wish;
}

function _loadAsync(brandId) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        if (!_pigmentsCache[brandId]) {
          const loader = PIGMENT_LOADERS[brandId];
          const src = loader ? loader() : [];
          _pigmentsCache[brandId] = src.map(p => ({
            ...p,
            wishlist: !!p.wishlist,
            markedAt: p.markedAt || 0,
          }));
        }
        resolve(_pigmentsCache[brandId].map(p => ({ ...p })));
      } catch (err) {
        console.error('[pigment-store] error', err);
        reject(err);
      }
    }, 0);
  });
}

// 跨品牌聚合：按 brandId 顺序串行加载，每个品牌一个 tick，避免一次性同步阻塞
function _loadAllAsync() {
  const ids = [1, 2, 3, 4, 5, 6];
  return ids.reduce((promise, id) => {
    return promise.then(acc => _loadAsync(id).then(list => {
      list.forEach(p => acc.push({ ...p, brandId: id, _gid: id + '-' + p.id }));
      return acc;
    }));
  }, Promise.resolve([]));
}

module.exports = {
  getPigmentsAsync(brandId) {
    return _loadAsync(Number(brandId));
  },

  // 跨品牌聚合所有颜料（每条带 brandId、_gid）
  // 调用方式：pigmentStore.getAllPigmentsAsync().then(all => ...)
  getAllPigmentsAsync() {
    return _loadAllAsync();
  },

  // 是否已在缓存中（用于判断是否需要异步加载）
  isCached(brandId) {
    return !!_pigmentsCache[Number(brandId)];
  },

  savePigments(brandId, list) {
    const id = Number(brandId);
    const now = Date.now();
    const oldList = _pigmentsCache[id] || [];
    const oldMap = {};
    oldList.forEach(p => { oldMap[p.id] = p; });

    _pigmentsCache[id] = list.map(p => {
      const old = oldMap[p.id] || {};
      const ownedChanged = !!p.owned !== !!old.owned;
      const wishChanged = !!p.wishlist !== !!old.wishlist;
      // 互斥：owned=true 时强制 wishlist=false
      const wishlist = p.owned ? false : !!p.wishlist;
      // 任一状态从 false→true 时刷新 markedAt（方案 A：单字段）
      const justMarked = (p.owned && !old.owned) || (wishlist && !old.wishlist);
      const markedAt = justMarked
        ? now
        : (ownedChanged || wishChanged ? old.markedAt || 0 : (p.markedAt || old.markedAt || 0));
      return {
        ...p,
        wishlist,
        markedAt,
      };
    });
    _syncCounts(id, _pigmentsCache[id]);
  },
};
