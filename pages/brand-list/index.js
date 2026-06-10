// 品牌列表页 + 色彩库 Tab
const dataStore = require('../../utils/data.js');
const pigmentStore = require('../../utils/pigment-store.js');

const TRANSPARENCY_COLOR = {
  'Opaque':           { dot: '#0A3E80', cn: '不透明'   },
  'Semi-Opaque':      { dot: '#2C5BA6', cn: '半不透明' },
  'Semi-Transparent': { dot: '#6792D6', cn: '半透明'   },
  'Transparent':      { dot: '#B5CDEC', cn: '透明'     },
};
const TRANSPARENCY_ORDER = ['Opaque', 'Semi-Opaque', 'Semi-Transparent', 'Transparent'];

function parsePigmentCodes(s) {
  if (!s) return [];
  let str = String(s).trim();
  if (/^(N\s*\/\s*A|—|-)$/i.test(str)) return [];
  str = str.replace(/N\s*\/\s*A/gi, ' ');
  return str
    .split(/[,，;；、\s]+/)
    .map(x => x.trim().replace(/[()（）]/g, ''))
    .filter(x => {
      if (!x || x === '—' || x === '-' || /^N\/?A$/i.test(x)) return false;
      return /^[A-Za-z]+\d+/.test(x);
    });
}

function parseColorNo(s) {
  const m = String(s || '').match(/^([A-Za-z]*)(\d+)/);
  if (m) return { prefix: m[1].toUpperCase(), num: parseInt(m[2], 10) };
  return { prefix: String(s || '').toUpperCase(), num: 0 };
}

Page({
  data: {
    activeTab: 'all',
    sortType: 'name',
    sortLabel: '按名称',
    sortVisible: false,
    brandList: [],
    filteredList: [],

    librarySubTab: 'owned',
    stat: { ownedCount: 0, wishlistCount: 0, unownedCount: 0, totalCount: 0 },
    libLoading: false,
    libRendered: [],
    libFilteredTotal: 0,
    libEmptyText: '暂无颜料',
    libIsFilterEmpty: false,
    libEmptyDesc: '',

    libSortType: 'colorNo',
    libSortLabel: '按色号',
    libSortVisible: false,

    libFilterMainVisible: false,
    libBrandPanelVisible: false,
    libPigmentPanelVisible: false,
    libTransPanelVisible: false,

    libFilterBrand: 0,
    libFilterBrandCn: '',
    libFilterPigment: '',
    libFilterTrans: '',
    libFilterTransLabel: '未选',
    activeFilterCount: 0,
    libActiveFilters: [],

    libBrandTemp: 0,
    libPigmentTemp: '',
    libPigmentSearchKey: '',
    libPigmentOptions: [],
    libPigmentOptionsFiltered: [],
    libTransTemp: '',
    libTransOptions: [],

    brandsMeta: [],

    // ===== 颜料详情抽屉（V4，跨品牌复用） =====
    drawerVisible: false,
    drawerPigment: null,
    drawerBrand: { color: '#888', iconText: '?', nameCn: '' },
    drawerTransCn: '',
    drawerTransDot: '#CCCCCC',

    toastVisible: false,
    toastText: '',

    // ===== 今日签 =====
    lotteryConfig: { dedupDays: 3, count: 3, sameBrand: false },  // X 日不重复，Y 抽取数量，是否同品牌
    lotteryConfigExpanded: false,  // 默认折叠紧凑条；点击「调整」展开
    lotteryConfigMiniText: '3 日内不重复 · 抽取 3 个 · 总 0 个',  // 紧凑条预拼接文字
    lotteryDrawn: [],          // 当前抽中的颜料列表（含 _brandColor/_brandAbbr/_brandCn）
    lotteryHasResult: false,   // 是否已经抽过（决定显示初始态还是结果态）
    lotteryHistory: [],        // 抽签历史（最近 30 次）
    lotteryHistoryVisible: false,
    lotteryDrawnAt: 0,         // 本次抽取时间戳
    ownedPoolCount: 0,         // 当前已拥有数量（供初始态展示）
    lotteryAnimating: false,   // 抽签动画中
    lotteryEmpty: '',          // 边界提示（已拥有不足/去重过严）
    lotterySchemeCount: 0,     // 当前已保存方案数（用于今日签结果页进度条）
    lotterySchemeMax: 10,      // 方案上限
    lotterySchemeProgress: 0,  // 进度条宽度百分比 0-100
    lotterySaveDisabled: false, // 当前抽取结果是否已保存（保存后置灰禁用）

    // 「保存方案」命名 popup
    lotterySaveVisible: false,
    lotterySaveInput: '',
    lotterySaveChecking: false,

    // 「方案数量超限」提示 dialog
    lotterySaveLimitVisible: false,

    // ===== 色彩方 Color Scheme =====
    schemes: [],                // 全部方案数组
    activeSchemeId: 0,          // 当前选中方案 id
    activeScheme: null,         // 当前方案完整数据（含 pigments 详细字段）
    schemeAddBrandVisible: false,  // 添加流 Step 1 弹层
    schemeAddColorVisible: false,  // 添加流 Step 2 弹层
    schemeAddSelectedBrandId: 0,   // Step 2 当前品牌
    schemeAddSelectedBrandName: '',
    schemeAddBrandList: [],     // Step 1 品牌列表
    schemeAddColorList: [],     // Step 2 颜料列表（已注入状态）
    schemeAddColorSearch: '',   // Step 2 搜索 keyword
    schemeAddColorListFiltered: [],
    schemeRenameVisible: false,
    schemeRenameInput: '',
    schemeRenameChecking: false,

    // ===== 色彩库对比模式（V6 新增） =====
    libCompareMode: false,
    libCompareCount: 0,
    libCompareList: [],
    libCompareCartVisible: false,

    // 下拉刷新（scroll-view refresher）loading 状态
    refresherTriggered: false,
  },

  onLoad(options) {
    // 分享路径携带的 tab 参数
    if (options && options.tab && ['all', 'library', 'lottery', 'scheme'].indexOf(options.tab) !== -1) {
      this.setData({ activeTab: options.tab });
    }
    // 启用右上角胶囊「转发」「分享到朋友圈」入口
    if (wx.showShareMenu) {
      wx.showShareMenu({
        withShareTicket: true,
        menus: ['shareAppMessage', 'shareTimeline'],
      });
    }
    // 加载今日签配置
    try {
      const cfg = wx.getStorageSync('wc_lottery_config_v1');
      if (cfg && typeof cfg === 'object') {
        this.setData({ lotteryConfig: { dedupDays: cfg.dedupDays, count: cfg.count || 3, sameBrand: !!cfg.sameBrand } });
      }
    } catch (e) {}
    this._updateLotteryMiniText();
    // 加载色彩方
    this._loadSchemes();
    this._refreshLotterySchemeProgress();
    this.refresh();

    // 监听云端用户状态同步完成事件（cloud pull 异步完成后页面需要刷新）
    this._cloudSyncCheckTimer = setInterval(() => {
      const app = getApp();
      if (app && app.globalData && app.globalData.userStatesSyncedAt &&
          app.globalData.userStatesSyncedAt !== this._lastUserStatesSyncedAt) {
        this._lastUserStatesSyncedAt = app.globalData.userStatesSyncedAt;
        console.log('[brand-list] 云端状态同步完成，刷新页面');
        this._allPigments = null;
        this.refresh();
        if (this.data.activeTab === 'library') {
          this._reloadLibraryDataIfNeeded();
        } else if (this.data.activeTab === 'scheme') {
          this._enterScheme();
        }
        // 同步完成后停止检查
        clearInterval(this._cloudSyncCheckTimer);
        this._cloudSyncCheckTimer = null;
      }
    }, 500);
    // 10 秒后无论如何停止检查（避免泄漏）
    setTimeout(() => {
      if (this._cloudSyncCheckTimer) {
        clearInterval(this._cloudSyncCheckTimer);
        this._cloudSyncCheckTimer = null;
      }
    }, 10000);
  },

  onShow() {
    if (this._loaded) {
      this.refresh();
      if (this.data.activeTab === 'library') {
        this._reloadLibraryDataIfNeeded();
      } else if (this.data.activeTab === 'lottery') {
        this._enterLottery();
      } else if (this.data.activeTab === 'scheme') {
        this._enterScheme();
      }
    } else {
      this._loaded = true;
    }
    // 检查云端用户状态是否已同步（首次进入或冷启动时云端拉取可能晚于 onLoad）
    const app = getApp();
    if (app && app.globalData && app.globalData.userStatesSyncedAt &&
        app.globalData.userStatesSyncedAt !== this._lastUserStatesSyncedAt) {
      this._lastUserStatesSyncedAt = app.globalData.userStatesSyncedAt;
      console.log('[brand-list] 检测到云端状态已同步，刷新页面数据');
      // 重新读取颜料数据（缓存已被云端拉取清空）
      this.refresh();
      this._allPigments = null;
      if (this.data.activeTab === 'library') this._reloadLibraryDataIfNeeded();
    }

    // 主动触发云端拉取并等待结果（重要：仅靠 app.onShow 触发会因为时序问题无法刷新页面）
    if (app && app.globalData && app.globalData.cloudInited) {
      try {
        const pigmentStore = require('../../utils/pigment-store.js');
        pigmentStore.pullFromCloud().then(res => {
          if (res && res.success && !res.skipped) {
            // 拉取完成且确实有刷新（非节流跳过）→ 检查 userStatesSyncedAt 是否更新
            if (app.globalData.userStatesSyncedAt &&
                app.globalData.userStatesSyncedAt !== this._lastUserStatesSyncedAt) {
              this._lastUserStatesSyncedAt = app.globalData.userStatesSyncedAt;
              console.log('[brand-list] onShow 后云端状态已同步，刷新页面');
              this._allPigments = null;
              this.refresh();
              if (this.data.activeTab === 'library') this._reloadLibraryDataIfNeeded();
              else if (this.data.activeTab === 'scheme') this._enterScheme();
            }
          }
        });
      } catch (err) {
        console.warn('[brand-list] onShow 触发 pull 异常', err);
      }
    }
  },

  // 下拉刷新（scroll-view refresher 触发）：5 秒内只能拉取一次
  onPagePullRefresh() {
    const now = Date.now();
    if (this._lastPullDownAt && now - this._lastPullDownAt < 5000) {
      const wait = Math.ceil((5000 - (now - this._lastPullDownAt)) / 1000);
      this.setData({ refresherTriggered: false });
      this.showToast(`请 ${wait}s 后再试`);
      return;
    }
    this._lastPullDownAt = now;
    this.setData({ refresherTriggered: true });
    const app = getApp();
    if (!app || !app.globalData || !app.globalData.cloudInited) {
      this.setData({ refresherTriggered: false });
      this.showToast('云端未就绪');
      return;
    }
    const pigmentStore = require('../../utils/pigment-store.js');
    pigmentStore.pullFromCloud(true).then(res => {
      this.setData({ refresherTriggered: false });
      if (res && res.success && !res.skipped) {
        this._allPigments = null;
        this.refresh();
        if (this.data.activeTab === 'library') this._reloadLibraryDataIfNeeded();
        else if (this.data.activeTab === 'scheme') this._enterScheme();
        this.showToast('已同步最新');
      } else {
        this.showToast('已是最新');
      }
    }).catch(() => {
      this.setData({ refresherTriggered: false });
      this.showToast('刷新失败');
    });
  },

  // 兼容（小程序原生下拉刷新，目前未启用）
  onPullDownRefresh() {
    this.onPagePullRefresh();
    wx.stopPullDownRefresh();
  },

  refresh() {
    const brandList = dataStore.getBrands();
    const stat = dataStore.getGlobalStat();
    this.setData({ brandList, stat }, () => this.applyFilter());
  },

  // ============ 主 Tab ============
  onTabChange(e) {
    const { tab } = e.currentTarget.dataset;
    if (tab === this.data.activeTab) return;
    this.setData({ activeTab: tab }, () => {
      if (tab === 'library') {
        this._enterLibrary();
      } else if (tab === 'lottery') {
        this._enterLottery();
      } else if (tab === 'scheme') {
        this._enterScheme();
      } else {
        this.applyFilter();
      }
    });
  },

  // ============ 品牌视图（全部品牌 / 未拥有） ============
  onSortTap() { this.setData({ sortVisible: true }); },
  onSortClose() { this.setData({ sortVisible: false }); },
  onSortChange(e) {
    const { sort } = e.currentTarget.dataset;
    const sortLabel = sort === 'name' ? '按名称' : '按色号';
    this.setData({ sortType: sort, sortLabel }, () => {
      this.applyFilter();
      setTimeout(() => this.setData({ sortVisible: false }), 150);
    });
  },
  applyFilter() {
    const { activeTab, sortType, brandList } = this.data;
    if (activeTab !== 'all') return;
    let list = brandList.slice();
    if (sortType === 'name') {
      list.sort((a, b) => a.nameCn.localeCompare(b.nameCn, 'zh-CN'));
    } else {
      list.sort((a, b) => a.colorNo - b.colorNo);
    }
    this.setData({ filteredList: list });
  },
  onBrandTap(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/brand-detail/index?id=${id}` });
  },

  // ============ 色彩库 ============
  _enterLibrary() {
    // 即使已有 _allPigments 缓存，也必须重新从 pigment-store 读取最新数据，
    // 避免「全部品牌 → 详情页改心愿单 → 切到色彩库」时显示旧数据。
    // pigment-store 内部有 require 缓存，重建 _allPigments 开销很低。
    const isFirstLoad = !this._allPigments;
    if (isFirstLoad) this.setData({ libLoading: true });
    pigmentStore.getAllPigmentsAsync().then(all => {
      const brandsMeta = dataStore.getBrandsMeta();
      const brandMap = {};
      brandsMeta.forEach(b => { brandMap[b.id] = b; });
      all.forEach(p => {
        const b = brandMap[p.brandId];
        p._brandColor = b ? b.color : '#888';
        p._brandAbbr = b ? b.iconText : '';
        p._brandCn = b ? b.nameCn : '';
      });
      this._allPigments = all;
      this._buildLibraryFilterOptions();
      this.setData({
        libLoading: false,
        brandsMeta,
      }, () => this._applyLibraryFilterAndSort());
    }).catch(err => {
      console.error('色彩库加载失败', err);
      this.setData({ libLoading: false });
    });
  },

  _reloadLibraryDataIfNeeded() {
    if (!this._allPigments) return;
    pigmentStore.getAllPigmentsAsync().then(all => {
      const brandsMeta = dataStore.getBrandsMeta();
      const brandMap = {};
      brandsMeta.forEach(b => { brandMap[b.id] = b; });
      all.forEach(p => {
        const b = brandMap[p.brandId];
        p._brandColor = b ? b.color : '#888';
        p._brandAbbr = b ? b.iconText : '';
        p._brandCn = b ? b.nameCn : '';
      });
      this._allPigments = all;
      this._applyLibraryFilterAndSort();
    });
  },

  _buildLibraryFilterOptions() {
    const all = this._allPigments || [];
    const codeMap = {};
    all.forEach(p => {
      parsePigmentCodes(p.pigment).forEach(code => {
        codeMap[code] = (codeMap[code] || 0) + 1;
      });
    });
    const libPigmentOptions = Object.keys(codeMap)
      .map(code => ({ code, count: codeMap[code] }))
      .sort((a, b) => {
        const A = parseColorNo(a.code), B = parseColorNo(b.code);
        if (A.prefix !== B.prefix) return A.prefix.localeCompare(B.prefix);
        return A.num - B.num;
      });

    const transMap = {};
    all.forEach(p => {
      if (p.transparency) transMap[p.transparency] = (transMap[p.transparency] || 0) + 1;
    });
    const libTransOptions = TRANSPARENCY_ORDER
      .filter(v => transMap[v])
      .map(v => ({
        value: v,
        cn: TRANSPARENCY_COLOR[v].cn,
        dot: TRANSPARENCY_COLOR[v].dot,
        count: transMap[v],
      }));

    this.setData({
      libPigmentOptions,
      libPigmentOptionsFiltered: libPigmentOptions,
      libTransOptions,
    });
  },

  // 子 Tab 切换（保留筛选/排序）
  onLibrarySubTab(e) {
    const { sub } = e.currentTarget.dataset;
    if (sub === this.data.librarySubTab) return;
    this.setData({ librarySubTab: sub }, () => this._applyLibraryFilterAndSort());
  },

  _LIB_PAGE_SIZE: 30,

  _applyLibraryFilterAndSort() {
    const all = this._allPigments;
    if (!all) return;
    const { librarySubTab, libFilterBrand, libFilterPigment, libFilterTrans, libSortType } = this.data;

    let list = all.slice();
    if (librarySubTab === 'owned') list = list.filter(p => p.owned);
    else if (librarySubTab === 'wishlist') list = list.filter(p => !p.owned && p.wishlist);
    else list = list.filter(p => !p.owned);

    if (libFilterBrand) list = list.filter(p => p.brandId === libFilterBrand);
    if (libFilterPigment) list = list.filter(p => parsePigmentCodes(p.pigment).indexOf(libFilterPigment) !== -1);
    if (libFilterTrans) list = list.filter(p => p.transparency === libFilterTrans);

    if (libSortType === 'colorNo') {
      list.sort((a, b) => {
        const A = parseColorNo(a.colorNo), B = parseColorNo(b.colorNo);
        if (A.prefix !== B.prefix) return A.prefix.localeCompare(B.prefix);
        return A.num - B.num;
      });
    } else if (libSortType === 'brand') {
      list.sort((a, b) => {
        if (a.brandId !== b.brandId) return a.brandId - b.brandId;
        const A = parseColorNo(a.colorNo), B = parseColorNo(b.colorNo);
        if (A.prefix !== B.prefix) return A.prefix.localeCompare(B.prefix);
        return A.num - B.num;
      });
    } else if (libSortType === 'markedAt') {
      list.sort((a, b) => (b.markedAt || 0) - (a.markedAt || 0));
    }

    list.forEach(p => {
      const sub = [];
      if (p.pigment) sub.push(p.pigment);
      if (p.transparency) {
        const cn = (TRANSPARENCY_COLOR[p.transparency] || {}).cn || p.transparency;
        sub.push(cn);
      }
      p._metaSub = sub.join(' · ');
    });

    this._libFilteredFull = list;
    this._libRenderedCount = 0;
    const subLabelMap = { owned: '已拥有', wishlist: '心愿单', unowned: '未拥有' };
    const emptyMap = { owned: '还没有已拥有的颜料', wishlist: '还没有加入心愿单的颜料', unowned: '没有未拥有的颜料' };
    const hasFilter = !!(libFilterBrand || libFilterPigment || libFilterTrans);
    // 区分：筛选无命中 vs 子Tab本身就没数据
    const libIsFilterEmpty = list.length === 0 && hasFilter;
    let libEmptyDesc = '';
    if (libIsFilterEmpty) {
      const conds = [];
      if (libFilterBrand) {
        const b = (this.data.brandsMeta || []).find(x => x.id === libFilterBrand);
        if (b) conds.push(b.nameCn);
      }
      if (libFilterPigment) conds.push(libFilterPigment);
      if (libFilterTrans) {
        const cn = (TRANSPARENCY_COLOR[libFilterTrans] || {}).cn || libFilterTrans;
        conds.push(cn);
      }
      libEmptyDesc = `在「${subLabelMap[librarySubTab] || ''}」中没有匹配 ${conds.join(' · ')} 的颜料`;
    }
    this.setData({
      libFilteredTotal: list.length,
      libEmptyText: emptyMap[librarySubTab] || '暂无颜料',
      libIsFilterEmpty,
      libEmptyDesc,
      // 关键：先清空 libRendered，避免 list.length === 0 时 _libAppendNextPage 短路 return
      // 导致 libRendered 保留旧数据使空态判断失效
      libRendered: [],
    }, () => this._libAppendNextPage());
    this._updateLibActiveFilters();
  },

  _libAppendNextPage() {
    const all = this._libFilteredFull || [];
    if (all.length === 0) {
      // 没有任何数据时确保渲染列表也是空的（已在上游 setData，但兜底一次）
      this._libRenderedCount = 0;
      return;
    }
    const next = Math.min((this._libRenderedCount || 0) + this._LIB_PAGE_SIZE, all.length);
    if (next === (this._libRenderedCount || 0)) return;
    this._libRenderedCount = next;
    this.setData({ libRendered: all.slice(0, next) });
  },
  onLibScrollLower() { this._libAppendNextPage(); },

  _updateLibActiveFilters() {
    const { libFilterBrand, libFilterPigment, libFilterTrans } = this.data;
    const arr = [];
    if (libFilterBrand) {
      const b = (this.data.brandsMeta || []).find(x => x.id === libFilterBrand);
      arr.push({ key: 'brand', label: b ? b.nameCn : '品牌' });
    }
    if (libFilterPigment) arr.push({ key: 'pigment', label: libFilterPigment });
    if (libFilterTrans) {
      const cn = (TRANSPARENCY_COLOR[libFilterTrans] || {}).cn || libFilterTrans;
      arr.push({ key: 'trans', label: cn });
    }
    this.setData({ libActiveFilters: arr, activeFilterCount: arr.length });
  },

  // 行点击 → 在当前页拉起颜料详情抽屉（V4，与品牌详情页同款）
  onLibRowTap(e) {
    const { gid } = e.currentTarget.dataset;
    // 对比模式下：toggle 加入/移除
    if (this.data.libCompareMode) {
      this._libToggleCompare(gid);
      return;
    }
    const item = (this._allPigments || []).find(p => p._gid === gid);
    if (!item) return;
    const brandsMeta = this.data.brandsMeta || [];
    const brand = brandsMeta.find(b => b.id === item.brandId) || { color: '#888', iconText: '?', nameCn: '' };
    const trans = TRANSPARENCY_COLOR[item.transparency] || { dot: '#CCCCCC', cn: item.transparency || '—' };
    this.setData({
      drawerVisible: true,
      drawerPigment: { ...item },
      drawerBrand: brand,
      drawerTransCn: trans.cn,
      drawerTransDot: trans.dot,
    });
  },

  closeDrawer() { this.setData({ drawerVisible: false }); },

  // 抽屉中切换「已拥有」
  onDrawerToggleOwned() {
    const cur = this.data.drawerPigment;
    if (!cur) return;
    const nextOwned = !cur.owned;
    pigmentStore.getPigmentsAsync(cur.brandId).then(list => {
      const updated = list.map(p =>
        p.id === cur.id
          ? { ...p, owned: nextOwned, wishlist: nextOwned ? false : p.wishlist }
          : p
      );
      pigmentStore.savePigments(cur.brandId, updated, true);
      // 同步更新内存全量数据
      this._allPigments.forEach(p => {
        if (p._gid === cur._gid) {
          p.owned = nextOwned;
          if (nextOwned) {
            p.wishlist = false;
            p.markedAt = Date.now();
          }
        }
      });
      const newPigment = { ...cur, owned: nextOwned, wishlist: nextOwned ? false : cur.wishlist };
      const stat = dataStore.getGlobalStat();
      this.setData({ stat, drawerPigment: newPigment });
      this._applyLibraryFilterAndSort();
      this.showToast(nextOwned ? '已添加到拥有' : '已取消拥有');
    });
  },

  // 抽屉中切换「心愿单」
  onDrawerToggleWishlist() {
    const cur = this.data.drawerPigment;
    if (!cur || cur.owned) return;
    const nextWish = !cur.wishlist;
    pigmentStore.getPigmentsAsync(cur.brandId).then(list => {
      const updated = list.map(p =>
        p.id === cur.id ? { ...p, wishlist: nextWish } : p
      );
      pigmentStore.savePigments(cur.brandId, updated, true);
      this._allPigments.forEach(p => {
        if (p._gid === cur._gid) {
          p.wishlist = nextWish;
          if (nextWish) p.markedAt = Date.now();
        }
      });
      const newPigment = { ...cur, wishlist: nextWish };
      const stat = dataStore.getGlobalStat();
      this.setData({ stat, drawerPigment: newPigment });
      this._applyLibraryFilterAndSort();
      this.showToast(nextWish ? '已加入心愿单' : '已移出心愿单');
    });
  },

  // 一键加入心愿单（已废弃：状态点列已移除，所有状态切换统一在 V4 抽屉中操作）
  // onLibQuickWishlist 处理器已删除

  // ===== 色彩库对比模式（V6 新增） =====
  onLibCompareTap() {
    this._libCompareSet = new Set();
    this.setData({
      libCompareMode: true,
      libCompareCount: 0,
      libCompareList: [],
      libCompareCartVisible: false,
    });
  },

  onLibCancelCompare() {
    this._libCompareSet = null;
    this.setData({
      libCompareMode: false,
      libCompareCount: 0,
      libCompareList: [],
      libCompareCartVisible: false,
    });
  },

  onLibClearCompare() {
    this._libCompareSet = new Set();
    this.setData({
      libCompareCount: 0,
      libCompareList: [],
      libCompareCartVisible: false,
    });
  },

  // 行点击：对比模式下 toggle 加入/移除
  _libToggleCompare(gid) {
    if (!this._libCompareSet) this._libCompareSet = new Set();
    const set = this._libCompareSet;
    if (set.has(gid)) {
      set.delete(gid);
    } else {
      set.add(gid);
    }
    const brandsMeta = this.data.brandsMeta || [];
    const list = [];
    set.forEach(id => {
      const p = (this._allPigments || []).find(x => x._gid === id);
      if (p) {
        const brand = brandsMeta.find(b => b.id === p.brandId) || { color: '#888', iconText: '?', nameCn: '' };
        list.push({
          _gid: p._gid,
          colorNo: p.colorNo,
          displayColorNo: p.displayColorNo || p.colorNo,
          nameCn: p.nameCn,
          nameEn: p.nameEn,
          pigment: p.pigment,
          transparency: p.transparency,
          swatch: p.swatch,
          swatchImage: p.swatchImage || '',
          _brandAbbr: brand.iconText,
          _brandCn: brand.nameCn,
          _brandColor: brand.color,
          _brandId: p.brandId,
        });
      }
    });
    // 更新 libRendered 中的 _compareSelected 标记
    const rendered = this.data.libRendered.map(p => ({
      ...p,
      _compareSelected: set.has(p._gid),
    }));
    this.setData({
      libCompareCount: list.length,
      libCompareList: list,
      libRendered: rendered,
    });
  },

  onLibCompareCartTap() {
    if (this.data.libCompareCount === 0) {
      this.showToast('对比颜料为空');
      return;
    }
    this.setData({ libCompareCartVisible: true });
  },

  onLibCompareCartClose() {
    this.setData({ libCompareCartVisible: false });
  },

  onLibCompareCartRemove(e) {
    const { gid } = e.currentTarget.dataset;
    this._libToggleCompare(gid);
  },

  onLibCompareConfirm() {
    const list = this.data.libCompareList || [];
    if (list.length === 0) {
      this.showToast('请先加入颜料');
      return;
    }
    wx.navigateTo({
      url: '/pages/pigment-compare/index',
      success: (res) => {
        res.eventChannel.emit('initCompare', { items: list });
        this.onLibCancelCompare();
      },
      fail: () => {
        this.showToast('打开对比页失败');
      },
    });
  },

  // ===== 筛选弹层 =====
  onLibFilterTap() { this.setData({ libFilterMainVisible: true }); },
  onLibFilterMainClose() {
    // 关闭主筛选弹层时同步刷新一次列表，避免任何中间态导致筛选未应用
    this.setData({ libFilterMainVisible: false }, () => this._applyLibraryFilterAndSort());
  },

  onLibOpenBrandFilter() {
    this.setData({ libBrandPanelVisible: true, libBrandTemp: this.data.libFilterBrand });
  },
  onLibBrandPanelClose() { this.setData({ libBrandPanelVisible: false }); },
  // 点击品牌选项即时应用：写入 libFilterBrand + 关闭品牌面板&主筛选弹层 + 立即重排
  onLibBrandOptionTap(e) {
    const id = Number(e.currentTarget.dataset.id);
    const nextId = this.data.libFilterBrand === id ? 0 : id;
    const b = (this.data.brandsMeta || []).find(x => x.id === nextId);
    this.setData({
      libBrandTemp: nextId,
      libFilterBrand: nextId,
      libFilterBrandCn: b ? b.nameCn : '',
      libBrandPanelVisible: false,
      libFilterMainVisible: false,
    }, () => this._applyLibraryFilterAndSort());
  },
  // 「全部品牌」入口：清除并即时应用
  onLibBrandClear() {
    this.setData({
      libBrandTemp: 0,
      libFilterBrand: 0,
      libFilterBrandCn: '',
      libBrandPanelVisible: false,
      libFilterMainVisible: false,
    }, () => this._applyLibraryFilterAndSort());
  },
  onLibBrandConfirm() {
    const id = this.data.libBrandTemp;
    const b = (this.data.brandsMeta || []).find(x => x.id === id);
    this.setData({
      libFilterBrand: id,
      libFilterBrandCn: b ? b.nameCn : '',
      libBrandPanelVisible: false,
      libFilterMainVisible: false,
    }, () => this._applyLibraryFilterAndSort());
  },

  onLibOpenPigmentFilter() {
    this.setData({
      libPigmentPanelVisible: true,
      libPigmentTemp: this.data.libFilterPigment,
      libPigmentSearchKey: '',
      libPigmentOptionsFiltered: this.data.libPigmentOptions,
    });
  },
  onLibPigmentPanelClose() { this.setData({ libPigmentPanelVisible: false }); },
  onLibPigmentSearchInput(e) {
    const key = (e.detail.value || '').trim().toUpperCase();
    const list = this.data.libPigmentOptions.filter(o => o.code.toUpperCase().includes(key));
    this.setData({ libPigmentSearchKey: e.detail.value, libPigmentOptionsFiltered: list });
  },
  // 点击色料选项即时应用：写入 libFilterPigment + 关闭色料面板&主筛选弹层 + 立即重排
  onLibPigmentOptionTap(e) {
    const { code } = e.currentTarget.dataset;
    const nextCode = code === this.data.libFilterPigment ? '' : code;
    this.setData({
      libPigmentTemp: nextCode,
      libFilterPigment: nextCode,
      libPigmentPanelVisible: false,
      libFilterMainVisible: false,
    }, () => this._applyLibraryFilterAndSort());
  },
  // 「全部色料」入口：清除并即时应用
  onLibPigmentClear() {
    this.setData({
      libPigmentTemp: '',
      libFilterPigment: '',
      libPigmentPanelVisible: false,
      libFilterMainVisible: false,
    }, () => this._applyLibraryFilterAndSort());
  },
  onLibPigmentConfirm() {
    this.setData({
      libFilterPigment: this.data.libPigmentTemp,
      libPigmentPanelVisible: false,
      libFilterMainVisible: false,
    }, () => this._applyLibraryFilterAndSort());
  },

  onLibOpenTransFilter() {
    this.setData({ libTransPanelVisible: true, libTransTemp: this.data.libFilterTrans });
  },
  onLibTransPanelClose() { this.setData({ libTransPanelVisible: false }); },
  // 点击透明度选项即时应用：写入 libFilterTrans + 关闭透明度面板&主筛选弹层 + 立即重排
  onLibTransOptionTap(e) {
    const { value } = e.currentTarget.dataset;
    const nextValue = this.data.libFilterTrans === value ? '' : value;
    const cn = nextValue ? ((TRANSPARENCY_COLOR[nextValue] || {}).cn || nextValue) : '未选';
    this.setData({
      libTransTemp: nextValue,
      libFilterTrans: nextValue,
      libFilterTransLabel: cn,
      libTransPanelVisible: false,
      libFilterMainVisible: false,
    }, () => this._applyLibraryFilterAndSort());
  },
  // 「全部透明度」入口：清除并即时应用
  onLibTransClear() {
    this.setData({
      libTransTemp: '',
      libFilterTrans: '',
      libFilterTransLabel: '未选',
      libTransPanelVisible: false,
      libFilterMainVisible: false,
    }, () => this._applyLibraryFilterAndSort());
  },
  onLibTransConfirm() {
    const v = this.data.libTransTemp;
    const cn = v ? ((TRANSPARENCY_COLOR[v] || {}).cn || v) : '未选';
    this.setData({
      libFilterTrans: v,
      libFilterTransLabel: cn,
      libTransPanelVisible: false,
      libFilterMainVisible: false,
    }, () => this._applyLibraryFilterAndSort());
  },

  onLibFilterReset() {
    this.setData({
      libFilterBrand: 0,
      libFilterBrandCn: '',
      libFilterPigment: '',
      libFilterTrans: '',
      libFilterTransLabel: '未选',
      libFilterMainVisible: false,
    }, () => this._applyLibraryFilterAndSort());
  },
  // 空态-清除全部筛选（不关闭弹层场景，与上面共用 reset 逻辑）
  onLibClearAllFilters() {
    this.setData({
      libFilterBrand: 0,
      libFilterBrandCn: '',
      libFilterPigment: '',
      libFilterTrans: '',
      libFilterTransLabel: '未选',
    }, () => this._applyLibraryFilterAndSort());
  },
  onLibFilterApply() {
    this.setData({ libFilterMainVisible: false });
    this._applyLibraryFilterAndSort();
  },
  onLibRemoveChip(e) {
    const { key } = e.currentTarget.dataset;
    const patch = {};
    if (key === 'brand') { patch.libFilterBrand = 0; patch.libFilterBrandCn = ''; }
    if (key === 'pigment') patch.libFilterPigment = '';
    if (key === 'trans') { patch.libFilterTrans = ''; patch.libFilterTransLabel = '未选'; }
    this.setData(patch, () => this._applyLibraryFilterAndSort());
  },

  // ===== 排序弹层 =====
  onLibSortTap() { this.setData({ libSortVisible: true }); },
  onLibSortClose() { this.setData({ libSortVisible: false }); },
  onLibSortChange(e) {
    const { sort } = e.currentTarget.dataset;
    const labelMap = { colorNo: '按色号', brand: '按品牌', markedAt: '按加入时间' };
    this.setData({ libSortType: sort, libSortLabel: labelMap[sort] || '按色号' }, () => {
      this._applyLibraryFilterAndSort();
      setTimeout(() => this.setData({ libSortVisible: false }), 150);
    });
  },

  // ===== Toast =====
  showToast(text) {
    this.setData({ toastVisible: true, toastText: text });
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.setData({ toastVisible: false }), 1500);
  },

  // ============ 今日签 ============
  _LOTTERY_HISTORY_KEY: 'wc_lottery_history_v1',
  _LOTTERY_CONFIG_KEY: 'wc_lottery_config_v1',
  _LOTTERY_LAST_DRAWN_KEY: 'wc_lottery_last_drawn_v1',  // { pigmentGid: timestamp }
  _LOTTERY_CURRENT_KEY: 'wc_lottery_current_v1',  // 当前抽取结果（含 drawnAt + saved 状态）跨日清空

  _enterLottery() {
    // 即使已有缓存，也重新从 pigment-store 读取最新数据，
    // 避免「从详情页改了已拥有 → 切到今日签」时颜料池不更新。
    const isFirstLoad = !this._allPigments;
    if (isFirstLoad) this.setData({ libLoading: true });
    pigmentStore.getAllPigmentsAsync().then(all => {
      const brandsMeta = dataStore.getBrandsMeta();
      const brandMap = {};
      brandsMeta.forEach(b => { brandMap[b.id] = b; });
      all.forEach(p => {
        const b = brandMap[p.brandId];
        p._brandColor = b ? b.color : '#888';
        p._brandAbbr = b ? b.iconText : '';
        p._brandCn = b ? b.nameCn : '';
      });
      this._allPigments = all;
      this.setData({ libLoading: false, brandsMeta }, () => this._refreshLotteryPool());
    }).catch(err => {
      console.error('今日签加载失败', err);
      this.setData({ libLoading: false });
    });
  },

  _refreshLotteryPool() {
    const all = this._allPigments || [];
    const owned = all.filter(p => p.owned);
    this.setData({ ownedPoolCount: owned.length }, () => this._updateLotteryMiniText());
    // 加载历史
    let history = [];
    try {
      history = wx.getStorageSync(this._LOTTERY_HISTORY_KEY) || [];
    } catch (e) {}
    this.setData({ lotteryHistory: Array.isArray(history) ? history : [] });
    // 同步已保存方案数（用于结果页进度条）
    this._refreshLotterySchemeProgress();
    // 跨日恢复：仅当 drawnAt 是今天才显示结果
    this._restoreLotteryCurrentIfToday();
  },

  // 判断时间戳是否为本地"今天"
  _isSameLocalDay(ts) {
    if (!ts) return false;
    const a = new Date(ts);
    const b = new Date();
    return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
  },

  // 从 storage 读取当前抽取结果，跨日则清除
  _restoreLotteryCurrentIfToday() {
    let cur = null;
    try {
      cur = wx.getStorageSync(this._LOTTERY_CURRENT_KEY) || null;
    } catch (e) {}
    if (!cur || !cur.drawnAt || !this._isSameLocalDay(cur.drawnAt)) {
      // 跨日 / 无数据：清空当前显示，保留历史
      try { wx.removeStorageSync(this._LOTTERY_CURRENT_KEY); } catch (e) {}
      this.setData({
        lotteryDrawn: [],
        lotteryHasResult: false,
        lotteryDrawnAt: 0,
        lotterySaveDisabled: false,
        lotteryEmpty: '',
      });
      return;
    }
    // 今天的结果 → 用最新 _allPigments 重新拿色卡（防止详情页改了 swatch）
    const all = this._allPigments || [];
    const map = {};
    all.forEach(p => { map[p._gid] = p; });
    const drawn = (cur.gids || []).map(gid => map[gid]).filter(Boolean).map(p => ({ ...p }));
    if (drawn.length === 0) {
      try { wx.removeStorageSync(this._LOTTERY_CURRENT_KEY); } catch (e) {}
      this.setData({ lotteryDrawn: [], lotteryHasResult: false, lotteryDrawnAt: 0, lotterySaveDisabled: false });
      return;
    }
    this.setData({
      lotteryDrawn: drawn,
      lotteryHasResult: true,
      lotteryDrawnAt: cur.drawnAt,
      lotterySaveDisabled: !!cur.saved,
      lotteryEmpty: cur.empty || '',
    });
  },

  // 持久化当前抽取结果（用于跨编译/跨进入恢复，跨日自动失效）
  _saveLotteryCurrent(patch) {
    let cur = null;
    try {
      cur = wx.getStorageSync(this._LOTTERY_CURRENT_KEY) || null;
    } catch (e) {}
    const next = Object.assign({}, cur || {}, patch);
    try {
      wx.setStorageSync(this._LOTTERY_CURRENT_KEY, next);
    } catch (e) {}
  },

  // 刷新今日签结果页的「已保存 X / 10」进度条
  _refreshLotterySchemeProgress() {
    const schemes = this.data.schemes || [];
    const max = this._SCHEME_MAX_COUNT || 10;
    const count = schemes.length;
    const progress = Math.min(100, Math.round((count / max) * 100));
    this.setData({
      lotterySchemeCount: count,
      lotterySchemeMax: max,
      lotterySchemeProgress: progress,
    });
  },

  // 配置：展开/折叠
  onLotteryConfigToggle() {
    this.setData({ lotteryConfigExpanded: !this.data.lotteryConfigExpanded });
  },

  // 拼接紧凑条文字（避免 wxml 嵌套 text 导致换行）
  _updateLotteryMiniText() {
    const { dedupDays, count } = this.data.lotteryConfig;
    const ownedCount = this.data.ownedPoolCount || 0;
    const dedupPart = dedupDays > 0 ? `${dedupDays} 日内不重复` : '当天可重复';
    const text = `${dedupPart} · 抽取 ${count} 个 · 总 ${ownedCount} 个`;
    this.setData({ lotteryConfigMiniText: text });
  },

  // 配置：步进器 — X 日内不重复（0-7，0 表示当天可重复）
  onLotteryDedupChange(e) {
    const { delta } = e.currentTarget.dataset;
    const cur = this.data.lotteryConfig.dedupDays || 0;
    const next = Math.max(0, Math.min(7, cur + Number(delta)));
    const cfg = { ...this.data.lotteryConfig, dedupDays: next };
    this.setData({ lotteryConfig: cfg }, () => this._updateLotteryMiniText());
    this._saveLotteryConfig();
  },
  // 「不限」入口已移除（X=0 即等同不限）
  onLotteryDedupClear() {
    const cfg = { ...this.data.lotteryConfig, dedupDays: 0 };
    this.setData({ lotteryConfig: cfg }, () => this._updateLotteryMiniText());
    this._saveLotteryConfig();
  },
  onLotteryCountChange(e) {
    const { delta } = e.currentTarget.dataset;
    const cur = this.data.lotteryConfig.count || 3;
    const next = Math.max(1, Math.min(9, cur + Number(delta)));
    const cfg = { ...this.data.lotteryConfig, count: next };
    this.setData({ lotteryConfig: cfg }, () => this._updateLotteryMiniText());
    this._saveLotteryConfig();
  },
  // 同品牌开关
  onLotterySameBrandToggle() {
    const cfg = { ...this.data.lotteryConfig, sameBrand: !this.data.lotteryConfig.sameBrand };
    this.setData({ lotteryConfig: cfg }, () => this._updateLotteryMiniText());
    this._saveLotteryConfig();
  },
  _saveLotteryConfig() {
    try {
      wx.setStorageSync(this._LOTTERY_CONFIG_KEY, this.data.lotteryConfig);
    } catch (e) {}
  },

  // 抽签！
  onLotteryDraw() {
    if (this.data.lotteryAnimating) return;
    const all = this._allPigments || [];
    const owned = all.filter(p => p.owned);
    const Y = this.data.lotteryConfig.count || 3;
    const X = this.data.lotteryConfig.dedupDays;  // 0 或 null 表示不去重
    const sameBrand = !!this.data.lotteryConfig.sameBrand;

    if (owned.length === 0) {
      this.showToast('请先标记已拥有的颜料');
      return;
    }

    // 去重过滤
    let lastDrawnMap = {};
    try {
      lastDrawnMap = wx.getStorageSync(this._LOTTERY_LAST_DRAWN_KEY) || {};
    } catch (e) {}
    const now = Date.now();
    let pool = owned;
    if (X && X > 0) {
      const ms = X * 24 * 60 * 60 * 1000;
      pool = owned.filter(p => {
        const t = lastDrawnMap[p._gid] || 0;
        return now - t > ms;
      });
    }

    // 同品牌过滤：随机选一个有候选的品牌，仅在该品牌内抽取
    if (sameBrand && pool.length > 0) {
      const byBrand = {};
      pool.forEach(p => {
        if (!byBrand[p.brandId]) byBrand[p.brandId] = [];
        byBrand[p.brandId].push(p);
      });
      const brandIds = Object.keys(byBrand);
      if (brandIds.length === 0) {
        this.showToast('候选池为空');
        return;
      }
      // 优先在能抽满 Y 个的品牌中随机选；如果都不够，则在拥有最多颜料的品牌中选
      const enoughBrands = brandIds.filter(b => byBrand[b].length >= Y);
      let pickedBrand;
      if (enoughBrands.length > 0) {
        pickedBrand = enoughBrands[Math.floor(Math.random() * enoughBrands.length)];
      } else {
        // 没有能抽满的品牌，随机选一个
        pickedBrand = brandIds[Math.floor(Math.random() * brandIds.length)];
      }
      pool = byBrand[pickedBrand];
    }

    // 候选不足处理
    if (pool.length === 0) {
      this.showToast(`最近 ${X} 天已抽完所有已拥有，调整去重天数后再试`);
      return;
    }

    const drawCount = Math.min(Y, pool.length);

    // 抽签动画
    this.setData({ lotteryAnimating: true });
    setTimeout(() => {
      // 随机抽 drawCount 个（Fisher-Yates 洗牌）
      const arr = pool.slice();
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      const drawn = arr.slice(0, drawCount).map(p => ({ ...p }));

      // 写入 lastDrawn
      drawn.forEach(p => { lastDrawnMap[p._gid] = now; });
      try {
        wx.setStorageSync(this._LOTTERY_LAST_DRAWN_KEY, lastDrawnMap);
      } catch (e) {}

      // 写入历史
      const hist = (this.data.lotteryHistory || []).slice();
      const d = new Date(now);
      const pad = (n) => (n < 10 ? '0' + n : '' + n);
      const timeStr = `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      hist.unshift({
        time: timeStr,
        ts: now,
        count: drawn.length,
        gids: drawn.map(p => p._gid),
        names: drawn.map(p => p.nameCn).join(' · '),
      });
      const newHist = hist.slice(0, 30);
      try {
        wx.setStorageSync(this._LOTTERY_HISTORY_KEY, newHist);
      } catch (e) {}

      // 检查是否实际抽数 < Y（用于提示）
      let lotteryEmpty = '';
      if (drawCount < Y) {
        lotteryEmpty = `候选池仅有 ${drawCount} 个可抽，已为你抽出全部`;
      }

      this.setData({
        lotteryDrawn: drawn,
        lotteryHasResult: true,
        lotteryDrawnAt: now,
        lotteryHistory: newHist,
        lotteryAnimating: false,
        lotteryEmpty,
        lotterySaveDisabled: false,  // 新一次抽取，重新允许保存
      });
      // 持久化当前结果，跨日自动失效（仅保留 gid + 时间 + 提示）
      this._saveLotteryCurrent({
        drawnAt: now,
        gids: drawn.map(p => p._gid),
        empty: lotteryEmpty,
        saved: false,
      });
    }, 600);  // 0.6s 动画
  },

  // 重新抽签
  onLotteryRedraw() {
    this.onLotteryDraw();
  },

  // ===== 今日签 → 保存为色彩方案 =====
  // 入口：点击结果页「保存方案」按钮
  onLotterySaveTap() {
    if (this.data.lotterySaveDisabled) return;
    const drawn = this.data.lotteryDrawn || [];
    if (drawn.length === 0) return;
    // 数量上限拦截：≥10 直接弹超限提示，不进入命名步骤
    const schemes = this.data.schemes || [];
    if (schemes.length >= this._SCHEME_MAX_COUNT) {
      this.setData({ lotterySaveLimitVisible: true });
      return;
    }
    // 默认方案名：MMDD签（最多 5 字，例 "525签" / "1225签"）
    const ts = this.data.lotteryDrawnAt || Date.now();
    const d = new Date(ts);
    const defaultName = `${d.getMonth() + 1}${d.getDate()}签`.slice(0, 5);
    this.setData({
      lotterySaveVisible: true,
      lotterySaveInput: defaultName,
      lotterySaveChecking: false,
    });
  },

  onLotterySaveClose() {
    this.setData({ lotterySaveVisible: false, lotterySaveChecking: false });
  },

  onLotterySaveInput(e) {
    let v = e.detail.value || '';
    if (v.length > 5) v = v.slice(0, 5);
    this.setData({ lotterySaveInput: v });
  },

  onLotterySaveConfirm() {
    const name = (this.data.lotterySaveInput || '').trim();
    if (!name) {
      this.showToast('名称不能为空');
      return;
    }
    if (name.length > 5) {
      this.showToast('名称最长 5 个字');
      return;
    }
    if (this.data.lotterySaveChecking) return;
    // 二次拦截上限（防止两次抽签间手动新增方案）
    if ((this.data.schemes || []).length >= this._SCHEME_MAX_COUNT) {
      this.setData({ lotterySaveVisible: false, lotterySaveLimitVisible: true });
      return;
    }
    this.setData({ lotterySaveChecking: true });
    this._msgSecCheck(name).then(result => {
      if (result === 'risky') {
        this.setData({ lotterySaveChecking: false });
        this.showToast('名称含违规内容，请修改');
        return;
      }
      // 接口异常（error）则使用默认名 "方案X"，X=已保存方案数+1
      let finalName = name;
      let usedFallback = false;
      if (result === 'error') {
        const count = (this.data.schemes || []).length;
        finalName = `方案${count + 1}`;
        usedFallback = true;
      }
      this._persistLotteryAsScheme(finalName, usedFallback);
    }).catch(() => {
      // 极端兜底
      this.setData({ lotterySaveChecking: false });
      const count = (this.data.schemes || []).length;
      const finalName = `方案${count + 1}`;
      this._persistLotteryAsScheme(finalName, true);
    });
  },

  // 把当前 lotteryDrawn 写入 schemes（与色彩方完全同结构）
  _persistLotteryAsScheme(name, usedFallback) {
    const drawn = this.data.lotteryDrawn || [];
    const gids = drawn.map(p => p._gid).filter(Boolean);
    const now = Date.now();
    const newScheme = {
      id: now,
      name,
      pigments: gids,
      createdAt: now,
      updatedAt: now,
      savedAt: now,
    };
    const schemes = (this.data.schemes || []).concat([newScheme]);
    this.setData({
      schemes,
      lotterySaveVisible: false,
      lotterySaveChecking: false,
      lotterySaveDisabled: true,  // 本次抽取已保存，按钮置灰
    }, () => {
      this._saveSchemes(true);
      this._refreshLotterySchemeProgress();
      this._saveLotteryCurrent({ saved: true });  // 同步落盘 saved 状态（跨编译保留置灰态）
      this.showToast(usedFallback ? `检测异常，已使用默认名 ${name}` : '已保存到色彩方');
    });
  },

  // 超限提示：「我知道了」
  onLotterySaveLimitClose() {
    this.setData({ lotterySaveLimitVisible: false });
  },

  // 超限提示：「前往管理」→ 切到色彩方 TAB
  onLotterySaveLimitGoto() {
    this.setData({ lotterySaveLimitVisible: false, activeTab: 'scheme' }, () => {
      this._enterScheme();
    });
  },

  // 历史记录弹层
  onLotteryHistoryTap() {
    this.setData({ lotteryHistoryVisible: true });
  },
  onLotteryHistoryClose() {
    this.setData({ lotteryHistoryVisible: false });
  },

  // 点击色卡 → 拉起 V4 详情抽屉
  onLotteryCardTap(e) {
    const { gid } = e.currentTarget.dataset;
    const item = (this.data.lotteryDrawn || []).find(p => p._gid === gid);
    if (!item) return;
    const brandsMeta = this.data.brandsMeta || [];
    const brand = brandsMeta.find(b => b.id === item.brandId) || { color: '#888', iconText: '?', nameCn: '' };
    const trans = TRANSPARENCY_COLOR[item.transparency] || { dot: '#CCCCCC', cn: item.transparency || '—' };
    this.setData({
      drawerVisible: true,
      drawerPigment: { ...item },
      drawerBrand: brand,
      drawerTransCn: trans.cn,
      drawerTransDot: trans.dot,
    });
  },

  noop() {},

  // ============ 色彩方 Color Scheme ============
  _SCHEMES_KEY: 'wc_schemes_v1',
  _SCHEME_MAX_COUNT: 10,
  _SCHEME_PIGMENT_MAX: 48,
  _DEFAULT_SCHEME_NAMES: ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'],
  _schemesPushTimer: null,

  _loadSchemes() {
    try {
      const list = wx.getStorageSync(this._SCHEMES_KEY) || [];
      this.setData({ schemes: Array.isArray(list) ? list : [] });
    } catch (e) {
      this.setData({ schemes: [] });
    }
    // 异步从云端拉取并合并（按 savedAt/createdAt 取较新版本）
    this._pullSchemesFromCloud();
  },

  _saveSchemes(immediate) {
    try {
      wx.setStorageSync(this._SCHEMES_KEY, this.data.schemes);
    } catch (e) {
      console.error('保存色彩方失败', e);
    }
    // immediate=true 时立即推送（用于 saveScheme 等关键操作），否则 800ms 防抖
    if (immediate) {
      this._pushSchemesNow();
    } else {
      this._schedulePushSchemesToCloud();
    }
  },

  // 立即推送到云端（不防抖，保证关键操作不丢失）
  _pushSchemesNow() {
    const app = getApp();
    if (!app || !app.globalData || !app.globalData.cloudInited || !wx.cloud) return;
    if (this._schemesPushTimer) {
      clearTimeout(this._schemesPushTimer);
      this._schemesPushTimer = null;
    }
    const schemes = this.data.schemes || [];
    wx.cloud.callFunction({
      name: 'syncUserSchemes',
      data: { action: 'push', schemes },
    }).then(res => {
      const r = res && res.result;
      if (r && r.success) {
        console.log('[brand-list] 色彩方云端推送成功（立即）');
      } else {
        console.warn('[brand-list] 色彩方云端推送失败', r);
      }
    }).catch(err => {
      console.warn('[brand-list] 色彩方云端推送异常', err);
    });
  },

  // 启动时云端拉取（与本地按更新时间合并）
  _pullSchemesFromCloud() {
    const app = getApp();
    if (!app || !app.globalData || !app.globalData.cloudInited || !wx.cloud) return;
    wx.cloud.callFunction({
      name: 'syncUserSchemes',
      data: { action: 'pull' },
    }).then(res => {
      const r = res && res.result;
      if (!(r && r.success)) {
        console.warn('[brand-list] 色彩方云端拉取失败', r);
        return;
      }
      const cloudSchemes = Array.isArray(r.schemes) ? r.schemes : [];
      const localSchemes = this.data.schemes || [];
      // 合并：以 id 为 key，保留 savedAt/createdAt 较大的版本
      const mergedMap = {};
      [...localSchemes, ...cloudSchemes].forEach(s => {
        if (!s || !s.id) return;
        const ts = s.savedAt || s.createdAt || 0;
        if (!mergedMap[s.id] || ts > (mergedMap[s.id]._ts || 0)) {
          mergedMap[s.id] = { ...s, _ts: ts };
        }
      });
      const merged = Object.values(mergedMap)
        .map(s => { const c = { ...s }; delete c._ts; return c; })
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      // 写本地
      try { wx.setStorageSync(this._SCHEMES_KEY, merged); } catch (e) {}
      this.setData({ schemes: merged }, () => {
        this._refreshActiveScheme && this._refreshActiveScheme();
      });
      console.log('[brand-list] 色彩方云端合并完成，共', merged.length, '个');
    }).catch(err => {
      console.warn('[brand-list] 色彩方云端拉取异常（已用本地）', err);
    });
  },

  // 防抖式推送到云端
  _schedulePushSchemesToCloud() {
    const app = getApp();
    if (!app || !app.globalData || !app.globalData.cloudInited || !wx.cloud) return;
    if (this._schemesPushTimer) clearTimeout(this._schemesPushTimer);
    this._schemesPushTimer = setTimeout(() => {
      this._schemesPushTimer = null;
      const schemes = this.data.schemes || [];
      wx.cloud.callFunction({
        name: 'syncUserSchemes',
        data: { action: 'push', schemes },
      }).then(res => {
        const r = res && res.result;
        if (r && r.success) {
          console.log('[brand-list] 色彩方云端推送成功');
        } else {
          console.warn('[brand-list] 色彩方云端推送失败', r);
        }
      }).catch(err => {
        console.warn('[brand-list] 色彩方云端推送异常', err);
      });
    }, 800);
  },

  _enterScheme() {
    // 确保 _allPigments 已加载（共用色彩库的全量数据）
    if (!this._allPigments) {
      this.setData({ libLoading: true });
      pigmentStore.getAllPigmentsAsync().then(all => {
        const brandsMeta = dataStore.getBrandsMeta();
        const brandMap = {};
        brandsMeta.forEach(b => { brandMap[b.id] = b; });
        all.forEach(p => {
          const b = brandMap[p.brandId];
          p._brandColor = b ? b.color : '#888';
          p._brandAbbr = b ? b.iconText : '';
          p._brandCn = b ? b.nameCn : '';
        });
        this._allPigments = all;
        this.setData({ libLoading: false, brandsMeta }, () => this._refreshActiveScheme());
      });
    } else {
      // 已有缓存也重新读取一次（同步详情页改动）
      pigmentStore.getAllPigmentsAsync().then(all => {
        const brandsMeta = this.data.brandsMeta || dataStore.getBrandsMeta();
        const brandMap = {};
        brandsMeta.forEach(b => { brandMap[b.id] = b; });
        all.forEach(p => {
          const b = brandMap[p.brandId];
          p._brandColor = b ? b.color : '#888';
          p._brandAbbr = b ? b.iconText : '';
          p._brandCn = b ? b.nameCn : '';
        });
        this._allPigments = all;
        this._refreshActiveScheme();
      });
    }
  },

  // 根据当前 activeSchemeId 把存储里的颜料 _gid 映射成完整颜料数据
  _refreshActiveScheme() {
    const schemes = this.data.schemes || [];
    if (schemes.length === 0) {
      this.setData({ activeScheme: null, activeSchemeId: 0 });
      return;
    }
    let cur = schemes.find(s => s.id === this.data.activeSchemeId);
    if (!cur) cur = schemes[0];
    const all = this._allPigments || [];
    const pigmentMap = {};
    all.forEach(p => { pigmentMap[p._gid] = p; });
    const pigments = (cur.pigments || []).map(gid => pigmentMap[gid]).filter(Boolean);
    const ownedCount = pigments.filter(p => p.owned).length;
    const unownedCount = pigments.length - ownedCount;
    // 已保存判断：savedAt 存在 且 updatedAt <= savedAt
    const isSaved = !!cur.savedAt && (!(cur.updatedAt) || cur.updatedAt <= cur.savedAt);
    let savedAtStr = '';
    if (cur.savedAt) {
      const d = new Date(cur.savedAt);
      const pad = (n) => (n < 10 ? '0' + n : '' + n);
      savedAtStr = `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    this.setData({
      activeSchemeId: cur.id,
      activeScheme: {
        ...cur,
        pigmentsList: pigments,
        ownedCount,
        unownedCount,
        canAdd: pigments.length < this._SCHEME_PIGMENT_MAX,
        isSaved,
        isDirty: !isSaved,
        savedAtStr,
      },
    });
  },

  // 切换方案
  onSchemeTabTap(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (id === this.data.activeSchemeId) return;
    this.setData({ activeSchemeId: id }, () => this._refreshActiveScheme());
  },

  // 创建新方案
  onSchemeCreate() {
    const schemes = this.data.schemes || [];
    if (schemes.length >= this._SCHEME_MAX_COUNT) {
      this.showToast(`最多 ${this._SCHEME_MAX_COUNT} 个方案，删除一些后再创建`);
      return;
    }
    const idx = schemes.length;
    const cnNum = this._DEFAULT_SCHEME_NAMES[idx] || (idx + 1);
    const newScheme = {
      id: Date.now(),
      name: `配色方案${cnNum}`,
      pigments: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const newList = schemes.concat([newScheme]);
    this.setData({ schemes: newList, activeSchemeId: newScheme.id }, () => {
      this._saveSchemes(true);
      this._refreshActiveScheme();
    });
  },

  // ===== 保存方案：写入 savedAt，进入「已保存」只读态 =====
  onSchemeSave() {
    const id = this.data.activeSchemeId;
    if (!id) return;
    const now = Date.now();
    const schemes = this.data.schemes.map(s =>
      s.id === id ? { ...s, savedAt: now, updatedAt: now } : s
    );
    this.setData({ schemes }, () => {
      this._saveSchemes(true);
      this._refreshActiveScheme();
      this.showToast('已保存');
    });
  },

  // ===== 进入编辑态：仅切 UI，不改 storage（清除 savedAt 让 isSaved=false） =====
  onSchemeEnterEdit() {
    const id = this.data.activeSchemeId;
    if (!id) return;
    const schemes = this.data.schemes.map(s =>
      s.id === id ? { ...s, savedAt: null, updatedAt: Date.now() } : s
    );
    this.setData({ schemes }, () => {
      this._saveSchemes(true);
      this._refreshActiveScheme();
    });
  },

  // ===== 分享方案（占位：使用 wx.showShareMenu / showActionSheet）=====
  onSchemeShare() {
    const cur = this.data.activeScheme;
    if (!cur) return;
    const names = (cur.pigmentsList || []).map(p => `${p._brandAbbr} ${p.colorNo} ${p.nameCn}`).join('\n');
    wx.setClipboardData({
      data: `${cur.name}\n共 ${cur.pigmentsList.length} 个颜料\n\n${names}`,
      success: () => this.showToast('方案已复制到剪贴板'),
    });
  },

  // ===== 重命名 =====
  onSchemeRenameOpen() {
    const cur = this.data.activeScheme;
    if (!cur) return;
    this.setData({
      schemeRenameVisible: true,
      schemeRenameInput: cur.name,
      schemeRenameChecking: false,
    });
  },
  onSchemeRenameClose() {
    this.setData({ schemeRenameVisible: false, schemeRenameChecking: false });
  },
  onSchemeRenameInput(e) {
    let v = e.detail.value || '';
    if (v.length > 5) v = v.slice(0, 5);
    this.setData({ schemeRenameInput: v });
  },
  onSchemeRenameSave() {
    const name = (this.data.schemeRenameInput || '').trim();
    if (!name) {
      this.showToast('名称不能为空');
      return;
    }
    if (name.length > 5) {
      this.showToast('名称最长 5 个字符');
      return;
    }
    if (this.data.schemeRenameChecking) return;
    this.setData({ schemeRenameChecking: true });
    this._msgSecCheck(name).then(result => {
      if (result === 'risky') {
        this.setData({ schemeRenameChecking: false });
        this.showToast('名称含违规内容，请修改');
        return;
      }
      // 接口异常（error）则使用默认名 "方案X"，X=已保存方案数+1
      let finalName = name;
      let usedFallback = false;
      if (result === 'error') {
        const count = (this.data.schemes || []).length;
        finalName = `方案${count + 1}`;
        usedFallback = true;
      }
      // 保存
      const id = this.data.activeSchemeId;
      const schemes = this.data.schemes.map(s =>
        s.id === id ? { ...s, name: finalName, updatedAt: Date.now() } : s
      );
      this.setData({
        schemes,
        schemeRenameVisible: false,
        schemeRenameChecking: false,
      }, () => {
        this._saveSchemes(true);
        this._refreshActiveScheme();
        this.showToast(usedFallback ? `检测异常，已使用默认名 ${finalName}` : '已保存');
      });
    }).catch(() => {
      // 极端兜底：promise reject 也走 fallback
      this.setData({ schemeRenameChecking: false });
      const count = (this.data.schemes || []).length;
      const finalName = `方案${count + 1}`;
      const id = this.data.activeSchemeId;
      const schemes = this.data.schemes.map(s =>
        s.id === id ? { ...s, name: finalName, updatedAt: Date.now() } : s
      );
      this.setData({ schemes, schemeRenameVisible: false }, () => {
        this._saveSchemes(true);
        this._refreshActiveScheme();
        this.showToast(`检测异常，已使用默认名 ${finalName}`);
      });
    });
  },

  // 调用 msgSecCheck 云函数进行内容安全检测
  // 返回值：
  //   'pass'   通过
  //   'risky'  明确命中违规
  //   'error'  云函数未部署/网络异常/接口异常（前端可用默认名 fallback）
  // 兼容两种云函数返回格式：
  //   新版：{ pass: bool, risky: bool, ... }
  //   旧版：{ errcode, detail, result, ... } —— 直接解析微信原始返回
  _msgSecCheck(content) {
    // 基础前置过滤（特殊字符/转义）
    if (/[<>&"'\\\/]/.test(content)) {
      return Promise.resolve('risky');
    }
    const app = getApp();
    const cloudReady = app && app.globalData && app.globalData.cloudInited && wx.cloud;
    if (!cloudReady) {
      console.warn('[msgSecCheck] 云开发未初始化，按异常处理');
      return Promise.resolve('error');
    }
    return wx.cloud.callFunction({
      name: 'wxSecCheck',
      data: { content, scene: 2 },
    }).then((res) => {
      const r = res && res.result;
      console.log('[msgSecCheck] 云函数完整返回', JSON.stringify(r));
      if (!r) {
        console.warn('[msgSecCheck] 云函数无返回，按异常处理');
        return 'error';
      }

      // ====== 兼容新版云函数（含 pass/risky 字段） ======
      if (r.risky === true) {
        console.log('[msgSecCheck] [新版] 命中违规');
        return 'risky';
      }
      if (r.pass === true) {
        console.log('[msgSecCheck] [新版] 通过');
        return 'pass';
      }

      // ====== 兼容旧版云函数（直接解析微信原始返回） ======
      // 1. v1 错误码 87014
      if (r.errcode === 87014) {
        console.log('[msgSecCheck] [旧版] 命中违规 errcode=87014');
        return 'risky';
      }
      // 2. v2 顶层 result.suggest
      if (r.result && (r.result.suggest === 'risky' || r.result.suggest === 'review')) {
        console.log('[msgSecCheck] [旧版] 命中违规 result.suggest=', r.result.suggest);
        return 'risky';
      }
      // 3. v2 detail 数组
      if (Array.isArray(r.detail)) {
        const hit = r.detail.some(d => {
          if (!d) return false;
          if (d.suggest === 'risky' || d.suggest === 'review') return true;
          if (d.errcode && d.errcode !== 0) return true;
          if (d.label != null && Number(d.label) !== 100) return true;
          return false;
        });
        if (hit) {
          console.log('[msgSecCheck] [旧版] 命中违规 detail[]', JSON.stringify(r.detail));
          return 'risky';
        }
      }
      // 4. errcode === 0 视为通过（关键修复：之前漏掉这个分支）
      if (r.errcode === 0 || r.errcode === undefined) {
        console.log('[msgSecCheck] [旧版] 通过');
        return 'pass';
      }
      // 其他错误视为接口异常
      console.warn('[msgSecCheck] 接口返回异常', r);
      return 'error';
    }).catch((err) => {
      console.warn('[msgSecCheck] 云函数调用失败', err);
      return 'error';
    });
  },

  // ===== 添加颜料：Step 1 选品牌 =====
  onSchemeAddBrandOpen() {
    const cur = this.data.activeScheme;
    if (!cur) return;
    if (cur.pigmentsList.length >= this._SCHEME_PIGMENT_MAX) {
      this.showToast(`每方案最多 ${this._SCHEME_PIGMENT_MAX} 个颜料`);
      return;
    }
    const brandsMeta = this.data.brandsMeta || [];
    // 计算每个品牌的总数（已加载到 _allPigments 时按 brandId 统计）
    const brandList = brandsMeta.map(b => ({
      ...b,
      colorCount: (this._allPigments || []).filter(p => p.brandId === b.id).length,
    }));
    this.setData({
      schemeAddBrandVisible: true,
      schemeAddBrandList: brandList,
    });
  },
  onSchemeAddBrandClose() {
    this.setData({ schemeAddBrandVisible: false });
  },

  // ===== Step 2 选色号 =====
  onSchemeAddBrandTap(e) {
    const id = Number(e.currentTarget.dataset.id);
    const b = (this.data.schemeAddBrandList || []).find(x => x.id === id);
    if (!b) return;
    const all = this._allPigments || [];
    const cur = this.data.activeScheme;
    const existedGids = (cur.pigmentsList || []).map(p => p._gid);
    const colorList = all
      .filter(p => p.brandId === id)
      .map(p => ({
        _gid: p._gid,
        id: p.id,
        colorNo: p.colorNo,
        displayColorNo: p.displayColorNo || p.colorNo,
        nameCn: p.nameCn,
        nameEn: p.nameEn,
        swatch: p.swatch,
        owned: !!p.owned,
        added: existedGids.indexOf(p._gid) !== -1,
      }))
      .sort((a, b) => {
        const m = (s) => {
          const r = String(s).match(/^([A-Za-z]*)(\d+)/);
          return r ? { p: r[1].toUpperCase(), n: parseInt(r[2], 10) } : { p: s, n: 0 };
        };
        const A = m(a.colorNo), B = m(b.colorNo);
        if (A.p !== B.p) return A.p.localeCompare(B.p);
        return A.n - B.n;
      });
    this.setData({
      schemeAddBrandVisible: false,
      schemeAddColorVisible: true,
      schemeAddSelectedBrandId: id,
      schemeAddSelectedBrandName: b.nameCn,
      schemeAddColorList: colorList,
      schemeAddColorListFiltered: colorList,
      schemeAddColorSearch: '',
    });
  },
  onSchemeAddColorClose() {
    this.setData({ schemeAddColorVisible: false });
  },
  onSchemeAddColorBack() {
    this.setData({
      schemeAddColorVisible: false,
      schemeAddBrandVisible: true,
    });
  },
  onSchemeAddColorSearch(e) {
    const key = (e.detail.value || '').trim().toLowerCase();
    const all = this.data.schemeAddColorList || [];
    const filtered = key
      ? all.filter(p =>
          (p.colorNo || '').toLowerCase().includes(key) ||
          (p.nameCn || '').toLowerCase().includes(key) ||
          (p.nameEn || '').toLowerCase().includes(key)
        )
      : all;
    this.setData({ schemeAddColorSearch: e.detail.value, schemeAddColorListFiltered: filtered });
  },

  onSchemeAddColorTap(e) {
    const { gid } = e.currentTarget.dataset;
    const cur = this.data.activeScheme;
    if (!cur) return;
    if (cur.pigmentsList.length >= this._SCHEME_PIGMENT_MAX) {
      this.showToast(`每方案最多 ${this._SCHEME_PIGMENT_MAX} 个颜料`);
      return;
    }
    if ((cur.pigments || []).indexOf(gid) !== -1) {
      this.showToast('已添加，请勿重复');
      return;
    }
    const id = this.data.activeSchemeId;
    const schemes = this.data.schemes.map(s => {
      if (s.id !== id) return s;
      return {
        ...s,
        pigments: (s.pigments || []).concat([gid]),
        updatedAt: Date.now(),
      };
    });
    // 同步更新 schemeAddColorList 中该项的 added 状态
    const colorList = (this.data.schemeAddColorList || []).map(p =>
      p._gid === gid ? { ...p, added: true } : p
    );
    const colorListFiltered = (this.data.schemeAddColorListFiltered || []).map(p =>
      p._gid === gid ? { ...p, added: true } : p
    );
    this.setData({
      schemes,
      schemeAddColorList: colorList,
      schemeAddColorListFiltered: colorListFiltered,
    }, () => {
      this._saveSchemes(true);
      this._refreshActiveScheme();
      this.showToast('已添加');
    });
  },

  // 删除颜料
  onSchemeRemovePigment(e) {
    const { gid } = e.currentTarget.dataset;
    const id = this.data.activeSchemeId;
    const schemes = this.data.schemes.map(s => {
      if (s.id !== id) return s;
      return {
        ...s,
        pigments: (s.pigments || []).filter(g => g !== gid),
        updatedAt: Date.now(),
      };
    });
    this.setData({ schemes }, () => {
      this._saveSchemes(true);
      this._refreshActiveScheme();
    });
  },

  // 删除方案（长按 chip 触发，或编辑面板入口）
  onSchemeDeleteCurrent() {
    const cur = this.data.activeScheme;
    if (!cur) return;
    wx.showModal({
      title: '删除方案',
      content: `确定删除「${cur.name}」？删除后无法恢复`,
      confirmColor: '#FF4D4F',
      success: (res) => {
        if (!res.confirm) return;
        const id = this.data.activeSchemeId;
        const schemes = this.data.schemes.filter(s => s.id !== id);
        const nextActive = schemes.length > 0 ? schemes[0].id : 0;
        this.setData({ schemes, activeSchemeId: nextActive }, () => {
          this._saveSchemes(true);
          this._refreshActiveScheme();
          this.showToast('已删除');
        });
      },
    });
  },

  // ============ 分享给好友 / 朋友圈 ============
  // 统一文案「锻造你的色彩世界」，path 按当前 tab 区分
  _buildShareConfig() {
    const tab = this.data.activeTab;
    const TITLE = '锻造你的色彩世界';
    if (tab === 'lottery') {
      return { title: TITLE, path: '/pages/brand-list/index?tab=lottery' };
    }
    if (tab === 'scheme') {
      return { title: TITLE, path: '/pages/brand-list/index?tab=scheme' };
    }
    if (tab === 'library') {
      return { title: TITLE, path: '/pages/brand-list/index?tab=library' };
    }
    return { title: TITLE, path: '/pages/brand-list/index' };
  },

  onShareAppMessage() {
    const cfg = this._buildShareConfig();
    return {
      title: cfg.title,
      path: cfg.path,
      imageUrl: '/images/share-thumb.jpg',
    };
  },

  onShareTimeline() {
    const cfg = this._buildShareConfig();
    return {
      title: cfg.title,
      query: cfg.path.indexOf('?') >= 0 ? cfg.path.split('?')[1] : '',
    };
  },
});
