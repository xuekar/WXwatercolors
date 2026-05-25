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
    lotteryConfig: { dedupDays: 3, count: 3 },  // X 日不重复，Y 抽取数量
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
  },

  onLoad() {
    // 加载今日签配置
    try {
      const cfg = wx.getStorageSync('wc_lottery_config_v1');
      if (cfg && typeof cfg === 'object') {
        this.setData({ lotteryConfig: { dedupDays: cfg.dedupDays, count: cfg.count || 3 } });
      }
    } catch (e) {}
    this._updateLotteryMiniText();
    // 加载色彩方
    this._loadSchemes();
    this._refreshLotterySchemeProgress();
    this.refresh();
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
      pigmentStore.savePigments(cur.brandId, updated);
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
      pigmentStore.savePigments(cur.brandId, updated);
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
    this._msgSecCheck(name).then(pass => {
      if (!pass) {
        this.setData({ lotterySaveChecking: false });
        this.showToast('名称含违规内容，请修改');
        return;
      }
      this._persistLotteryAsScheme(name);
    }).catch(() => {
      this.setData({ lotterySaveChecking: false });
      this.showToast('检测失败，请稍后重试');
    });
  },

  // 把当前 lotteryDrawn 写入 schemes（与色彩方完全同结构）
  _persistLotteryAsScheme(name) {
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
      this._saveSchemes();
      this._refreshLotterySchemeProgress();
      this.showToast('已保存到色彩方');
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

  _loadSchemes() {
    try {
      const list = wx.getStorageSync(this._SCHEMES_KEY) || [];
      this.setData({ schemes: Array.isArray(list) ? list : [] });
    } catch (e) {
      this.setData({ schemes: [] });
    }
  },

  _saveSchemes() {
    try {
      wx.setStorageSync(this._SCHEMES_KEY, this.data.schemes);
    } catch (e) {
      console.error('保存色彩方失败', e);
    }
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
      this._saveSchemes();
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
      this._saveSchemes();
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
      this._saveSchemes();
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
    this._msgSecCheck(name).then(pass => {
      if (!pass) {
        this.setData({ schemeRenameChecking: false });
        this.showToast('名称含违规内容，请修改');
        return;
      }
      // 保存
      const id = this.data.activeSchemeId;
      const schemes = this.data.schemes.map(s =>
        s.id === id ? { ...s, name, updatedAt: Date.now() } : s
      );
      this.setData({
        schemes,
        schemeRenameVisible: false,
        schemeRenameChecking: false,
      }, () => {
        this._saveSchemes();
        this._refreshActiveScheme();
        this.showToast('已保存');
      });
    }).catch(() => {
      this.setData({ schemeRenameChecking: false });
      this.showToast('检测失败，请稍后重试');
    });
  },

  // 调用 msgSecCheck 云函数进行内容安全检测
  // 策略：调用失败/未部署时降级放行（不阻塞用户），仅在明确命中违规时返回 false
  // resolve(true) 表示通过；resolve(false) 表示违规
  _msgSecCheck(content) {
    // 基础前置过滤（特殊字符/转义）
    if (/[<>&"'\\\/]/.test(content)) {
      return Promise.resolve(false);
    }
    const app = getApp();
    const cloudReady = app && app.globalData && app.globalData.cloudInited && wx.cloud;
    if (!cloudReady) {
      console.warn('[msgSecCheck] 云开发未初始化，本地降级放行');
      return Promise.resolve(true);
    }
    return wx.cloud.callFunction({
      name: 'wxSecCheck',
      data: { content, scene: 2 },
    }).then((res) => {
      const r = res && res.result;
      console.log('[msgSecCheck] 云函数返回', r);
      if (!r) {
        console.warn('[msgSecCheck] 云函数无返回，降级放行');
        return true;
      }
      // 明确通过
      if (r.errcode === 0) {
        if (r.detail && r.detail.suggest && r.detail.suggest === 'risky') {
          console.log('[msgSecCheck] 命中违规 suggest=risky');
          return false;
        }
        return true;
      }
      // 明确违规
      if (r.errcode === 87014) {
        console.log('[msgSecCheck] 命中违规 errcode=87014');
        return false;
      }
      // 其他错误（接口异常/未部署）：降级放行，不阻塞用户
      console.warn('[msgSecCheck] 接口返回异常，降级放行', r);
      return true;
    }).catch((err) => {
      // 云函数未部署 / 网络异常 / openid 缺失 等：降级放行
      console.warn('[msgSecCheck] 云函数调用失败，降级放行', err);
      return true;
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
      this._saveSchemes();
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
      this._saveSchemes();
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
          this._saveSchemes();
          this._refreshActiveScheme();
          this.showToast('已删除');
        });
      },
    });
  },
});
