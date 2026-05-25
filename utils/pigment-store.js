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
          // 初始化时补 wishlist 字段（默认 false）
          _pigmentsCache[brandId] = src.map(p => ({
            ...p,
            wishlist: !!p.wishlist,
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

module.exports = {
  getPigmentsAsync(brandId) {
    return _loadAsync(Number(brandId));
  },
  savePigments(brandId, list) {
    const id = Number(brandId);
    // 强制：owned=true 时 wishlist 必为 false（互斥规则）
    _pigmentsCache[id] = list.map(p => ({
      ...p,
      wishlist: p.owned ? false : !!p.wishlist,
    }));
    _syncCounts(id, _pigmentsCache[id]);
  },
};
