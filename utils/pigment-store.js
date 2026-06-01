// utils/pigment-store.js — 颜料数据中心
// 通过 setTimeout 把 require + map 拆到 onLoad 之外的下一帧
// 用户的 owned / wishlist / markedAt 状态持久化到 wx.storage（即时响应）
// 同时异步同步到云数据库 user_states 集合（跨设备/缓存清理后恢复）

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
const SYNCED_AT_KEY = 'wc_user_states_synced_at_v1'; // 上次成功同步云端的时间戳

let _userStates = null;  // 内存中的用户状态副本（首次访问时从 storage 读取）
let _cloudPullStarted = false;
let _cloudPullPromise = null;
let _pushTimer = null;

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

// ============ 云端同步 ============
function _isCloudReady() {
  // 注意：app.onLaunch 中调用此函数时 getApp() 可能还未完成 cloudInited 写入
  // 因此直接判断 wx.cloud 是否可用即可（onLaunch 里 wx.cloud.init 是同步成功的）
  return !!wx.cloud;
}

// 拉取云端状态并合并到本地（首次启动时调用）
function pullFromCloud() {
  console.log('[pigment-store] pullFromCloud 入口');
  if (_cloudPullPromise) {
    console.log('[pigment-store] 已有进行中的 pullPromise，复用');
    return _cloudPullPromise;
  }
  if (!_isCloudReady()) {
    console.warn('[pigment-store] 云开发未就绪，跳过云端拉取');
    return Promise.resolve({ success: false, reason: 'cloud not ready' });
  }
  console.log('[pigment-store] 调用 syncUserStates 云函数 action=pull');
  _cloudPullStarted = true;
  _cloudPullPromise = wx.cloud.callFunction({
    name: 'syncUserStates',
    data: { action: 'pull' },
  }).then(res => {
    console.log('[pigment-store] syncUserStates pull 返回', res && res.result);
    const r = res && res.result;
    if (r && r.success) {
      const cloudStates = r.states || {};
      // 合并：云端 + 本地，按 markedAt 取较新
      const local = _loadStatesFromStorage();
      const merged = _mergeTwoStates(local, cloudStates);
      _userStates = merged;
      _saveStatesToStorage();
      try { wx.setStorageSync(SYNCED_AT_KEY, Date.now()); } catch (e) {}
      // 重置颜料缓存，让下次 _loadAsync 用新合并后的 states
      Object.keys(_pigmentsCache).forEach(k => delete _pigmentsCache[k]);
      // 同步重算各品牌 owned/wishlist 计数到 globalData
      _recalcAllCounts();
      console.log('[pigment-store] 云端拉取并合并完成');
      // 触发全局事件通知页面刷新
      const app = getApp();
      if (app) {
        app.globalData.userStatesSyncedAt = Date.now();
      }
      return { success: true };
    }
    console.warn('[pigment-store] 云端拉取失败', r);
    return { success: false, reason: (r && r.error) || 'unknown' };
  }).catch(err => {
    console.error('[pigment-store] 拉取云端异常', err);
    return { success: false, reason: String(err && err.message || err) };
  });
  return _cloudPullPromise;
}

// 推送到云端（写本地后异步调用，带防抖）
function _schedulePushToCloud() {
  if (!_isCloudReady()) return;
  if (_pushTimer) clearTimeout(_pushTimer);
  _pushTimer = setTimeout(() => {
    _pushTimer = null;
    const states = _userStates || {};
    wx.cloud.callFunction({
      name: 'syncUserStates',
      data: { action: 'push', states },
    }).then(res => {
      const r = res && res.result;
      if (r && r.success) {
        try { wx.setStorageSync(SYNCED_AT_KEY, Date.now()); } catch (e) {}
        console.log('[pigment-store] 云端推送成功');
      } else {
        console.warn('[pigment-store] 云端推送失败', r);
      }
    }).catch(err => {
      console.warn('[pigment-store] 云端推送异常（已保留本地）', err);
    });
  }, 800); // 800ms 防抖，避免连续点击产生过多调用
}

// 合并两份 states，按 markedAt 取较新；缺失字段补默认值
function _mergeTwoStates(a, b) {
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
  // 异步推送到云端
  _schedulePushToCloud();
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

// 全量重算 owned/wishlist 计数（云端拉取合并后调用）
function _recalcAllCounts() {
  const states = _userStates || {};
  const app = getApp();
  if (!app) return;
  if (!app.globalData) app.globalData = {};
  if (!app.globalData.ownedCounts) app.globalData.ownedCounts = {};
  if (!app.globalData.wishlistCounts) app.globalData.wishlistCounts = {};
  Object.keys(states).forEach(bid => {
    let owned = 0, wish = 0;
    Object.values(states[bid] || {}).forEach(s => {
      if (s.owned) owned++;
      if (s.wishlist) wish++;
    });
    app.globalData.ownedCounts[bid] = owned;
    app.globalData.wishlistCounts[bid] = wish;
  });
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
    // 持久化到 wx.storage + 异步推送云端
    _persistBrandStates(id, _pigmentsCache[id]);
  },

  // 调试用：清空所有用户标记状态（同时清云端）
  clearAllUserStates() {
    _userStates = {};
    try {
      wx.removeStorageSync(STORAGE_KEY);
      wx.removeStorageSync(SYNCED_AT_KEY);
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
    // 推送空状态到云端
    _schedulePushToCloud();
  },

  // 启动时由 app.onLaunch 调用，触发云端拉取与合并
  pullFromCloud,
};

