// utils/pigment-store.js — 颜料数据中心
// 通过 setTimeout 把 require + map 拆到 onLoad 之外的下一帧
// 用户的 owned / wishlist / markedAt 状态持久化到 wx.storage，跨编译/升级保留

const PIGMENT_LOADERS = {
  1: () => require('./data/wn-pigments.js'),
  2: () => require('./data/ds-pigments.js'),
  3: () => require('./data/sch-pigments.js'),
  4: () => require('./data/hbn-pigments.js'),
  5: () => require('./data/mh-pigments.js'),
  6: () => require('./data/mg-pigments.js'),
};

// ============ 持久化存储 ============
// storage 结构：{ [brandId]: { [pigmentId]: { owned, wishlist, markedAt } } }
// 只存"用户主动标记"的颜料（owned 或 wishlist 至少一个为 true），节省空间
// 带版本号便于未来迁移
const STORAGE_KEY = 'wc_user_states_v1';

let _userStates = null;  // 内存中的用户状态副本（首次访问时从 storage 读取）

function _loadStatesFromStorage() {
  if (_userStates) return _userStates;
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    _userStates = (raw && typeof raw === 'object') ? raw : {};
  } catch (err) {
    console.error('[pigment-store] 读取本地状态失败', err);
    _userStates = {};
  }
  return _userStates;
}

function _saveStatesToStorage() {
  if (!_userStates) return;
  try {
    wx.setStorageSync(STORAGE_KEY, _userStates);
  } catch (err) {
    console.error('[pigment-store] 写入本地状态失败', err);
  }
}

// 把整个品牌的最新数据回写到 _userStates，并落盘
function _persistBrandStates(brandId, list) {
  const states = _loadStatesFromStorage();
  const brandStates = {};
  list.forEach(p => {
    if (p.owned || p.wishlist) {
      brandStates[p.id] = {
        owned: !!p.owned,
        wishlist: !!p.wishlist,
        markedAt: p.markedAt || 0,
      };
    }
    // 既不 owned 也不 wishlist 的不存（节省空间，等同于"已删除"）
  });
  if (Object.keys(brandStates).length > 0) {
    states[brandId] = brandStates;
  } else {
    delete states[brandId];
  }
  _saveStatesToStorage();
}

// 把 storage 中的用户状态合并到原始 list（仅 owned/wishlist/markedAt 三字段）
function _mergeUserStates(brandId, list) {
  const states = _loadStatesFromStorage();
  const brandStates = states[brandId] || {};
  return list.map(p => {
    const s = brandStates[p.id];
    if (s) {
      return {
        ...p,
        owned: !!s.owned,
        wishlist: !!s.wishlist,
        markedAt: s.markedAt || 0,
      };
    }
    return {
      ...p,
      owned: !!p.owned,
      wishlist: !!p.wishlist,
      markedAt: p.markedAt || 0,
    };
  });
}

// ============ 内存缓存 ============
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
          // 关键：从原始数据出发，合并 storage 中的用户标记
          _pigmentsCache[brandId] = _mergeUserStates(brandId, src);
          // 同步一次统计数到 globalData（页面初次进来时品牌列表能立即拿到正确数字）
          _syncCounts(brandId, _pigmentsCache[brandId]);
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
    // 持久化到 wx.storage
    _persistBrandStates(id, _pigmentsCache[id]);
  },

  // 调试用：清空所有用户标记状态
  clearAllUserStates() {
    _userStates = {};
    try {
      wx.removeStorageSync(STORAGE_KEY);
    } catch (err) {
      console.error('[pigment-store] 清空状态失败', err);
    }
    // 同时清空内存缓存，强制下次重新加载
    Object.keys(_pigmentsCache).forEach(k => delete _pigmentsCache[k]);
    const app = getApp();
    if (app && app.globalData) {
      app.globalData.ownedCounts = {};
      app.globalData.wishlistCounts = {};
    }
  },
};
