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

    toastVisible: false,
    toastText: '',
  },

  onLoad() {
    this.refresh();
  },

  onShow() {
    if (this._loaded) {
      this.refresh();
      if (this.data.activeTab === 'library') {
        this._reloadLibraryDataIfNeeded();
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
    if (activeTab === 'library') return;
    let list = brandList.slice();
    if (activeTab === 'unowned') list = list.filter(b => !b.owned || b.ownedCount < b.totalCount);
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
        this._buildLibraryFilterOptions();
        this.setData({
          libLoading: false,
          brandsMeta,
        }, () => this._applyLibraryFilterAndSort());
      }).catch(err => {
        console.error('色彩库加载失败', err);
        this.setData({ libLoading: false });
      });
    } else {
      this._applyLibraryFilterAndSort();
    }
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
    const emptyMap = { owned: '还没有已拥有的颜料', wishlist: '还没有加入心愿单的颜料', unowned: '没有未拥有的颜料' };
    this.setData({
      libFilteredTotal: list.length,
      libEmptyText: emptyMap[librarySubTab] || '暂无颜料',
    }, () => this._libAppendNextPage());
    this._updateLibActiveFilters();
  },

  _libAppendNextPage() {
    const all = this._libFilteredFull || [];
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

  // 行点击 → 跳转所属品牌详情页
  onLibRowTap(e) {
    const { gid } = e.currentTarget.dataset;
    const item = (this._allPigments || []).find(p => p._gid === gid);
    if (item) {
      wx.navigateTo({ url: `/pages/brand-detail/index?id=${item.brandId}` });
    }
  },

  // 一键加入心愿单
  onLibQuickWishlist(e) {
    const { gid } = e.currentTarget.dataset;
    const item = (this._allPigments || []).find(p => p._gid === gid);
    if (!item || item.owned) return;
    pigmentStore.getPigmentsAsync(item.brandId).then(list => {
      const updated = list.map(p =>
        p.id === item.id ? { ...p, wishlist: !p.wishlist } : p
      );
      pigmentStore.savePigments(item.brandId, updated);
      const newWish = !item.wishlist;
      this._allPigments.forEach(p => {
        if (p._gid === gid) {
          p.wishlist = newWish;
          p.markedAt = newWish ? Date.now() : p.markedAt;
        }
      });
      const stat = dataStore.getGlobalStat();
      this.setData({ stat });
      this._applyLibraryFilterAndSort();
      this.showToast(newWish ? '已加入心愿单' : '已移出心愿单');
    });
  },

  // ===== 筛选弹层 =====
  onLibFilterTap() { this.setData({ libFilterMainVisible: true }); },
  onLibFilterMainClose() { this.setData({ libFilterMainVisible: false }); },

  onLibOpenBrandFilter() {
    this.setData({ libBrandPanelVisible: true, libBrandTemp: this.data.libFilterBrand });
  },
  onLibBrandPanelClose() { this.setData({ libBrandPanelVisible: false }); },
  onLibBrandOptionTap(e) {
    const id = Number(e.currentTarget.dataset.id);
    this.setData({ libBrandTemp: this.data.libBrandTemp === id ? 0 : id });
  },
  onLibBrandClear() { this.setData({ libBrandTemp: 0 }); },
  onLibBrandConfirm() {
    const id = this.data.libBrandTemp;
    const b = (this.data.brandsMeta || []).find(x => x.id === id);
    this.setData({
      libFilterBrand: id,
      libFilterBrandCn: b ? b.nameCn : '',
      libBrandPanelVisible: false,
    });
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
  onLibPigmentOptionTap(e) {
    const { code } = e.currentTarget.dataset;
    this.setData({ libPigmentTemp: code === this.data.libPigmentTemp ? '' : code });
  },
  onLibPigmentClear() { this.setData({ libPigmentTemp: '' }); },
  onLibPigmentConfirm() {
    this.setData({ libFilterPigment: this.data.libPigmentTemp, libPigmentPanelVisible: false });
  },

  onLibOpenTransFilter() {
    this.setData({ libTransPanelVisible: true, libTransTemp: this.data.libFilterTrans });
  },
  onLibTransPanelClose() { this.setData({ libTransPanelVisible: false }); },
  onLibTransOptionTap(e) {
    const { value } = e.currentTarget.dataset;
    this.setData({ libTransTemp: this.data.libTransTemp === value ? '' : value });
  },
  onLibTransClear() { this.setData({ libTransTemp: '' }); },
  onLibTransConfirm() {
    const v = this.data.libTransTemp;
    const cn = v ? ((TRANSPARENCY_COLOR[v] || {}).cn || v) : '未选';
    this.setData({ libFilterTrans: v, libFilterTransLabel: cn, libTransPanelVisible: false });
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

  noop() {},
});
