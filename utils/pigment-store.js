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
let _cloudPullPromise = null;  // 进行中的 pull promise（仅 in-flight 期间有值，完成后会清空）
let _pushTimer = null;
let _lastPushAt = 0;  // 最近一次 push 完成时间戳（用于和 pull 回调判断时序，避免竞态覆盖）
let _lastPullAt = 0;  // 最近一次 pull 完成时间戳（用于冷却节流）

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

// 拉取云端状态并合并到本地
// force=true 强制重新拉取（用于 onShow 等需要最新状态的场景）
function pullFromCloud(force) {
  console.log('[pigment-store] pullFromCloud 入口 force=', !!force);
  // in-flight 复用：仅当当前已有进行中的 pull 时复用
  if (_cloudPullPromise) {
    console.log('[pigment-store] 已有进行中的 pullPromise，复用');
    return _cloudPullPromise;
  }
  // 非 force 模式下，10 秒内不重复拉取（节流，避免短时间内频繁调用）
  if (!force && _lastPullAt > 0 && Date.now() - _lastPullAt < 10000) {
    console.log('[pigment-store] 距上次 pull 不足 10s，跳过');
    return Promise.resolve({ success: true, skipped: true, reason: 'throttled' });
  }
  if (!_isCloudReady()) {
    console.warn('[pigment-store] 云开发未就绪，跳过云端拉取');
    return Promise.resolve({ success: false, reason: 'cloud not ready' });
  }
  console.log('[pigment-store] 调用 syncUserStates 云函数 action=pull');
  _cloudPullStarted = true;
  const pullStartedAt = Date.now();
  _cloudPullPromise = wx.cloud.callFunction({
    name: 'syncUserStates',
    data: { action: 'pull' },
  }).then(res => {
    console.log('[pigment-store] syncUserStates pull 返回', res && res.result);
    const r = res && res.result;
    if (r && r.success) {
      // 关键：如果 push 在 pull 之后发生，本次 pull 拿到的是旧数据，必须丢弃
      if (_lastPushAt > pullStartedAt) {
        console.log('[pigment-store] pull 发起后用户已 push，丢弃本次 pull 结果（避免覆盖最新本地状态）');
        return { success: true, skipped: true };
      }
      const cloudStates = r.states || {};
      const cloudUpdatedAt = r.updatedAt || 0;
      // 读本地上次同步时间戳
      let localSyncedAt = 0;
      try { localSyncedAt = Number(wx.getStorageSync(SYNCED_AT_KEY) || 0); } catch (e) {}

      let finalStates;
      if (cloudUpdatedAt > 0 && cloudUpdatedAt >= localSyncedAt) {
        // 云端记录的最后更新时间 ≥ 本地上次同步时间 → 云端是权威，直接采用
        // 这种场景包括：用户在另一台设备上做了删除操作（合并算法无法识别"已删除"）
        finalStates = cloudStates;
        console.log('[pigment-store] 云端时间戳较新，直接采用云端状态');
      } else {
        // 本地有云端不知道的更新（比如离线时操作）→ 走合并
        const local = _loadStatesFromStorage();
        finalStates = _mergeTwoStates(local, cloudStates);
        console.log('[pigment-store] 本地有未同步的更新，按 markedAt 合并');
      }
      _userStates = finalStates;
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
  }).then(result => {
    // 无论成功失败，都清空 _cloudPullPromise 让下次能再拉取，并记录时间用于节流
    _cloudPullPromise = null;
    _lastPullAt = Date.now();
    return result;
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
        _lastPushAt = Date.now();  // 记录 push 完成时间
        try { wx.setStorageSync(SYNCED_AT_KEY, Date.now()); } catch (e) {}
        console.log('[pigment-store] 云端推送成功');
      } else {
        console.warn('[pigment-store] 云端推送失败', r);
      }
    }).catch(err => {
      console.warn('[pigment-store] 云端推送异常（已保留本地）', err);
    });
  }, 800);
}

// 立即推送到云端（用于关键操作，不防抖）
function _pushToCloudNow() {
  console.log('[pigment-store] _pushToCloudNow 被调用');
  if (!_isCloudReady()) {
    console.warn('[pigment-store] 云开发未就绪，跳过 push');
    return;
  }
  if (_pushTimer) {
    clearTimeout(_pushTimer);
    _pushTimer = null;
  }
  const states = _userStates || {};
  // 诊断：打印每个品牌的 owned/wishlist 数量，便于排查
  const brandSummary = {};
  Object.keys(states).forEach(bid => {
    let o = 0, w = 0;
    Object.values(states[bid] || {}).forEach(s => { if (s.owned) o++; if (s.wishlist) w++; });
    brandSummary[bid] = { owned: o, wishlist: w };
  });
  console.log('[pigment-store] 即将推送到云端 states 概要', JSON.stringify(brandSummary));
  wx.cloud.callFunction({
    name: 'syncUserStates',
    data: { action: 'push', states },
  }).then(res => {
    const r = res && res.result;
    console.log('[pigment-store] push 云函数返回', JSON.stringify(r));
    if (r && r.success) {
      _lastPushAt = Date.now();  // 记录 push 完成时间，让进行中的 pull 知道丢弃
      try { wx.setStorageSync(SYNCED_AT_KEY, Date.now()); } catch (e) {}
      console.log('[pigment-store] 云端推送成功（立即），updatedAt =', r.updatedAt);
    } else {
      console.warn('[pigment-store] 云端推送失败', r);
    }
  }).catch(err => {
    console.warn('[pigment-store] 云端推送异常（已保留本地）', err);
  });
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
function _persistBrandStates(brandId, list, immediate) {
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
  // 推送到云端：immediate=true 立即推送（关键操作），否则 800ms 防抖
  if (immediate) {
    _pushToCloudNow();
  } else {
    _schedulePushToCloud();
  }
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

// ============ 色系计算 ============
// 色系分类定义（与 UI 筛选、抽屉 tag 共用）
// cn 名称以 Excel 数据源为准
const COLOR_FAMILIES = {
  red:            { cn: '红色系',   color: '#E74C3C' },
  yellowOrange:   { cn: '黄橙色系', color: '#F39C12' },
  bluePurple:     { cn: '蓝紫系',   color: '#5B6ABF' },
  green:          { cn: '绿色系',   color: '#27AE60' },
  earth:          { cn: '土色系',   color: '#A0845C' },
  granulating:    { cn: '沉淀系',   color: '#88929E' },
  pearlescent:    { cn: '珠光系',   color: '#DAC06E' },
  neutral:        { cn: '黑白色系', color: '#5D6D7E' },
};

// Excel 中文名 → 内部 key 映射
const EXCEL_NAME_TO_KEY = {
  '红色系': 'red',
  '黄橙色系': 'yellowOrange',
  '蓝紫系': 'bluePurple',
  '绿色系': 'green',
  '土色系': 'earth',
  '沉淀系': 'granulating',
  '珠光系': 'pearlescent',
  '黑白色系': 'neutral',
};

// 色系权重优先级的顺序（沉淀/珠光在颜色计算之前判断）
const FAMILY_ORDER = ['granulating', 'pearlescent', 'earth', 'red', 'yellowOrange', 'bluePurple', 'green', 'neutral'];

// Excel 色系映射（外部数据源，按 brandId → colorNo → colorFamily 索引）
// 在 _loadAsync 惰性加载
let _excelColorFamilyMap = null;
function _loadExcelColorFamilyMap() {
  if (_excelColorFamilyMap) return _excelColorFamilyMap;
  try {
    _excelColorFamilyMap = require('./data/color-family-mapping.js');
  } catch (e) {
    console.warn('[pigment-store] 无法加载 Excel 色系映射文件', e);
    _excelColorFamilyMap = {};
  }
  return _excelColorFamilyMap;
}

// 已知沉淀类色料代码（天然矿物 / 沉淀效果）
const GRANULATING_PIGMENTS = new Set([
  'PB29', 'PB28', 'PB36', 'PBk11', 'PBk6', 'PR101', 'PR102',
  'PR233', 'PG18', 'PG23', 'PY43', 'PBr7', 'PBr33',
]);

// 已知珠光类关键词
const PEARL_KEYWORDS = ['pearl', 'mica', 'iridescent', 'interference', 'duochrome', 'shimmer', 'pearlescent', '珠光', '珍珠', '云母', '闪光', '幻彩'];

function _colorFamilyFor(pigment, brandId) {
  const { nameEn, nameCn, pigment: pigCode, swatch, series, colorNo } = pigment || {};

  // === 0. 优先使用 Excel 色系数据（权威来源）===
  if (brandId && colorNo) {
    const map = _loadExcelColorFamilyMap();
    const brandMap = map[String(brandId)];
    if (brandMap) {
      const excelFamily = brandMap[String(colorNo)];
      if (excelFamily && EXCEL_NAME_TO_KEY[excelFamily]) {
        return EXCEL_NAME_TO_KEY[excelFamily];
      }
    }
  }

  const nameLower = ((nameEn || '') + ' ' + (nameCn || '')).toLowerCase();

  // 1. 品牌标注的特殊系列
  if (series === 'Primatek') return 'granulating';

  // 2. 名称含珠光关键词 → 珠光系
  for (const kw of PEARL_KEYWORDS) {
    if (nameLower.includes(kw)) return 'pearlescent';
  }

  // 3. 色料代码匹配沉淀系
  if (pigCode) {
    const codes = String(pigCode).split(/[,，\s]+/).map(s => s.trim().toUpperCase());
    for (const c of codes) {
      if (GRANULATING_PIGMENTS.has(c)) return 'granulating';
    }
  }

  // 4. 色料代码匹配土色系（PBr 系列 + 部分天然土色）
  if (pigCode) {
    const codes = String(pigCode).split(/[,，\s]+/).map(s => s.trim().toUpperCase());
    for (const c of codes) {
      if (/^PBr/i.test(c) || c === 'PY43' || c === 'PR102' || c === 'PBk11') return 'earth';
    }
  }

  // 5. 根据色卡 hex 计算 hue
  if (swatch && typeof swatch === 'string' && swatch.startsWith('#')) {
    const hex = swatch.replace('#', '');
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;
      const d = max - min;
      const s = l > 0.5 ? (d / (2 - max - min)) : (d / (max + min));

      // 黑白系：低饱和度或极端明度
      if (s < 0.12 || l < 0.05 || l > 0.95) return 'neutral';

      // 计算 hue (0-360)
      let hue = 0;
      if (d > 0) {
        if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) * 60;
        else if (max === g) hue = ((b - r) / d + 2) * 60;
        else hue = ((r - g) / d + 4) * 60;
      }

      if (hue >= 0 && hue < 20 || hue >= 340) return 'red';
      if (hue >= 20 && hue < 55) return 'yellowOrange';
      if (hue >= 55 && hue < 190) return 'green';
      if (hue >= 190 && hue < 290) return 'bluePurple';
      // fallback
      if (hue >= 290 && hue < 340) return 'red';
    }
  }

  // 6. 中英文名称关键字兜底
  if (/红|洋红|茜|朱|猩红|深红|crimson|magenta|red|scarlet|rose|pink/i.test(nameLower)) return 'red';
  if (/黄|橙|金| lemon|yellow|orange|gold|cadmium\s*yellow/i.test(nameLower)) return 'yellowOrange';
  if (/蓝|青|紫|群青|靛|blue|cyan|purple|violet|ultramarine|indigo|cerulean/i.test(nameLower)) return 'bluePurple';
  if (/绿|green|viridian|sap|emerald|olive|hooker/i.test(nameLower)) return 'green';
  if (/棕|褐|赭|土|umber|sienna|ochre|earth|brown|sepia|burnt|raw/i.test(nameLower)) return 'earth';
  if (/黑|灰|白|black|white|grey|gray|ivory|titanium|zinc/i.test(nameLower)) return 'neutral';

  return 'neutral';
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
          let src = loader ? loader() : [];
          // 史明克（brandId=3）色号默认显示去掉前缀 14 后的后三位
          if (Number(brandId) === 3) {
            src = src.map(p => ({
              ...p,
              displayColorNo: (p.colorNo && p.colorNo.startsWith('14') && p.colorNo.length > 3)
                ? p.colorNo.slice(2)
                : p.colorNo,
            }));
          } else {
            src = src.map(p => ({ ...p, displayColorNo: p.displayColorNo || p.colorNo }));
          }
          // 计算色系（动态，不修改原始 data 文件—优先 Excel 数据源）
          src = src.map(p => ({ ...p, colorFamily: _colorFamilyFor(p, brandId) }));
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

  savePigments(brandId, list, immediate) {
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
    // 持久化到 wx.storage + 推送云端（immediate=true 立即推送）
    _persistBrandStates(id, _pigmentsCache[id], immediate);
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

  // 色系配置（供页面引用）
  COLOR_FAMILIES,
  FAMILY_ORDER,
};

