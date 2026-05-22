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

function _syncOwnedCount(brandId, list) {
  const app = getApp();
  if (!app) return;
  if (!app.globalData) app.globalData = {};
  if (!app.globalData.ownedCounts) app.globalData.ownedCounts = {};
  let owned = 0;
  for (const p of list) if (p.owned) owned++;
  app.globalData.ownedCounts[brandId] = owned;
}

function _loadAsync(brandId) {
  return new Promise((resolve, reject) => {
    console.log('[pigment-store] schedule', brandId, Date.now());
    setTimeout(() => {
      console.log('[pigment-store] tick fired', brandId, Date.now());
      try {
        if (!_pigmentsCache[brandId]) {
          console.log('[pigment-store] require start', Date.now());
          const loader = PIGMENT_LOADERS[brandId];
          const src = loader ? loader() : [];
          console.log('[pigment-store] require done len=', src.length, Date.now());
          _pigmentsCache[brandId] = src.map(p => ({ ...p }));
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
    _pigmentsCache[id] = list.map(p => ({ ...p }));
    _syncOwnedCount(id, _pigmentsCache[id]);
  },
};
