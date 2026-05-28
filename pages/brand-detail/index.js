// 品牌详情页
const dataStore = require('../../utils/data.js');
const pigmentStore = require('../../utils/pigment-store.js');

// ==== 颜色排序工具 ====
function hexToHsl(hex) {
  if (!hex || typeof hex !== 'string') return { h: 0, s: 0, l: 0 };
  let s = hex.replace('#', '').trim();
  if (s.length === 3) s = s.split('').map(c => c + c).join('');
  if (s.length !== 6) return { h: 0, s: 0, l: 0 };
  const r = parseInt(s.slice(0, 2), 16) / 255;
  const g = parseInt(s.slice(2, 4), 16) / 255;
  const b = parseInt(s.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, sat = 0;
  if (max !== min) {
    const d = max - min;
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = ((b - r) / d + 2); break;
      case b: h = ((r - g) / d + 4); break;
    }
    h *= 60;
  }
  return { h, s: sat, l };
}

const TRANSPARENCY_COLOR = {
  'Opaque':           { dot: '#0A3E80', cn: '不透明'   },
  'Semi-Opaque':      { dot: '#2C5BA6', cn: '半不透明' },
  'Semi-Transparent': { dot: '#6792D6', cn: '半透明'   },
  'Transparent':      { dot: '#B5CDEC', cn: '透明'     },
};
const TRANSPARENCY_ORDER = ['Opaque', 'Semi-Opaque', 'Semi-Transparent', 'Transparent'];

function sortKey({ h, s, l }) {
  const isGray = s < 0.12 || l < 0.05 || l > 0.95;
  if (isGray) return { bucket: 1, hue: 0, l };
  return { bucket: 0, hue: Math.floor(h / 30), l };
}

// 解析 pigment 字段为 code 列表（如 "PR176, PR101" → ['PR176', 'PR101']）
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

Page({
  // 注意：pigments 不放在 data 中（避免 188 条 × 8 字段被序列化到渲染层导致 onLoad 超时）
  // 改用 this._pigments 实例属性持有全量数据；视图只渲染 this.data.filteredPigments
  data: {
    brandId: 1,
    brand: {},
    pigmentTotal: 0,
    filteredTotal: 0,           // 筛选后的总数（不等于已渲染数）
    filteredPigments: [],
    loading: true,             // 异步加载子包数据时显示骨架
    sortType: 'colorNo',
    sortLabel: '按色号',
    sortVisible: false,
    markMode: false,
    ownedCount: 0,
    checkedCount: 0,
    allSelected: false,
    // ==== 对比模式（V5 新增） ====
    compareMode: false,
    compareCount: 0,
    compareList: [],          // [{ _gid, colorNo, nameCn, swatch, _brandAbbr }]
    compareCartVisible: false,
    toastVisible: false,
    toastText: '',
    drawerVisible: false,
    drawerPigment: null,
    drawerTransCn: '',
    drawerTransDot: '#CCCCCC',
    // ==== 筛选状态 ====
    filterOwned: false,
    filterPigment: '',
    filterTransparency: '',
    activeFilterCount: 0,
    activeFilters: [],
    // ==== 弹层显隐 ====
    filterMainVisible: false,
    filterPigmentVisible: false,
    filterTransparencyVisible: false,
    // ==== 二级面板数据 ====
    pigmentOptions: [],
    pigmentOptionsFiltered: [],
    pigmentSearchKey: '',
    pigmentTempSelected: '',
    transparencyOptions: [],
    transparencyTempSelected: '',
  },

  onLoad(options) {
    const T = () => Date.now();
    console.log('[detail] onLoad start', T(), 'options=', options);
    const id = Number(options.id) || 1;
    this._brandId = id;
    const brand = dataStore.getBrand(id) || { nameCn: '未知品牌', nameEn: '', iconText: '?', color: '#888' };
    wx.setNavigationBarTitle({ title: brand.nameCn });
    // 启用右上角胶囊「转发」「分享到朋友圈」入口
    if (wx.showShareMenu) {
      wx.showShareMenu({
        withShareTicket: true,
        menus: ['shareAppMessage', 'shareTimeline'],
      });
    }
    console.log('[detail] onLoad after setNavTitle', T());

    // 第一帧：仅头部 + loading
    this.setData({
      brandId: id,
      brand,
      pigmentTotal: brand.totalCount || 0,
      ownedCount: brand.ownedCount || 0,
      filteredPigments: [],
      loading: true,
    }, () => {
      console.log('[detail] head setData callback', T());
    });

    // 异步加载颜料数据
    console.log('[detail] before getPigmentsAsync', T());
    pigmentStore.getPigmentsAsync(id).then(rawPigments => {
      console.log('[detail] data ready len=', rawPigments.length, T());
      const pigments = rawPigments.map(p => ({ ...p, checked: p.owned }));
      this._pigments = pigments;
      pigmentStore.savePigments(id, pigments);
      console.log('[detail] saved globalData', T());

      this._computeFiltered();
      this._renderedCount = 0;
      this._appendNextPage();
      console.log('[detail] first page rendered to data, count=', (this.data.filteredPigments || []).length, T());

      this.setData({
        pigmentTotal: pigments.length,
        ownedCount: pigments.filter(p => p.owned).length,
        loading: false,
      }, () => {
        console.log('[detail] final setData callback', T());
      });
    }).catch(err => {
      console.error('[detail] 加载颜料数据失败', err, T());
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败，请重试', icon: 'none' });
    });
    console.log('[detail] onLoad end (sync)', T());
  },

  onReady() {
    console.log('[detail] onReady', Date.now());
  },
  onShow() {
    console.log('[detail] onShow', Date.now());
  },
  onHide() {
    console.log('[detail] onHide', Date.now());
  },
  onUnload() {
    console.log('[detail] onUnload', Date.now());
  },

  // ==== 虚拟分页 ====
  // _filteredFull: 实例属性，全量过滤+排序后的列表（不进 setData）
  // _renderedCount: 当前已渲染数量
  // data.filteredPigments: 视图实际渲染的子集（最多 _renderedCount 条）
  _PAGE_SIZE: 30,

  _appendNextPage() {
    const all = this._filteredFull || [];
    const next = Math.min((this._renderedCount || 0) + this._PAGE_SIZE, all.length);
    if (next === (this._renderedCount || 0)) return;
    const prev = this._renderedCount || 0;
    this._renderedCount = next;
    console.log('[detail] _appendNextPage', prev, '→', next, '/', all.length, Date.now());
    // 注入对比模式选中标记
    const set = this._compareSet || new Set();
    const slice = all.slice(0, next).map(p => set.has(p.id) ? { ...p, _compareSelected: true } : p);
    this.setData({ filteredPigments: slice, filteredTotal: all.length });
  },

  // 触底加载下一页
  onListScrollToLower() {
    console.log('[detail] onListScrollToLower', Date.now());
    this._appendNextPage();
  },

  // 构建筛选选项（色料 + 透明度，带统计）
  _buildFilterOptions() {
    const pigments = this._pigments || [];
    const codeMap = {};
    pigments.forEach(p => {
      parsePigmentCodes(p.pigment).forEach(code => {
        codeMap[code] = (codeMap[code] || 0) + 1;
      });
    });
    const pigmentOptions = Object.keys(codeMap)
      .map(code => ({ code, count: codeMap[code] }))
      .sort((a, b) => {
        const m = (s) => {
          const r = String(s).match(/^([A-Za-z]*)(\d+)/);
          return r ? { p: r[1].toUpperCase(), n: parseInt(r[2], 10) } : { p: s, n: 0 };
        };
        const A = m(a.code), B = m(b.code);
        if (A.p !== B.p) return A.p.localeCompare(B.p);
        return A.n - B.n;
      });

    const transMap = {};
    pigments.forEach(p => {
      if (p.transparency) transMap[p.transparency] = (transMap[p.transparency] || 0) + 1;
    });
    const transparencyOptions = TRANSPARENCY_ORDER
      .filter(v => transMap[v])
      .map(v => ({
        value: v,
        cn: TRANSPARENCY_COLOR[v].cn,
        dot: TRANSPARENCY_COLOR[v].dot,
        count: transMap[v],
      }));

    this.setData({ pigmentOptions, pigmentOptionsFiltered: pigmentOptions, transparencyOptions });
  },

  // ==== 筛选 + 排序 ====
  // _computeFiltered：根据当前 filter/sort 计算全量结果，存到 this._filteredFull（不渲染）
  _computeFiltered() {
    const pigments = this._pigments;
    if (!pigments) { this._filteredFull = []; return; }
    const { sortType, filterOwned, filterPigment, filterTransparency } = this.data;
    let list = pigments.slice();

    if (filterOwned) list = list.filter(p => p.owned);
    if (filterPigment) {
      list = list.filter(p => parsePigmentCodes(p.pigment).indexOf(filterPigment) !== -1);
    }
    if (filterTransparency) {
      list = list.filter(p => p.transparency === filterTransparency);
    }

    if (sortType === 'name') {
      list.sort((a, b) => (a.nameCn || '').localeCompare(b.nameCn || '', 'zh-CN'));
    } else if (sortType === 'swatch') {
      list.sort((a, b) => {
        const ka = sortKey(hexToHsl(a.swatch));
        const kb = sortKey(hexToHsl(b.swatch));
        if (ka.bucket !== kb.bucket) return ka.bucket - kb.bucket;
        if (ka.hue !== kb.hue) return ka.hue - kb.hue;
        return kb.l - ka.l;
      });
    } else {
      const parse = (s) => {
        const m = String(s || '').match(/^([A-Za-z]*)(\d+)/);
        if (m) return { prefix: m[1].toUpperCase(), num: parseInt(m[2], 10) };
        return { prefix: String(s || '').toUpperCase(), num: 0 };
      };
      list.sort((a, b) => {
        const A = parse(a.colorNo), B = parse(b.colorNo);
        if (A.prefix !== B.prefix) return A.prefix.localeCompare(B.prefix);
        return A.num - B.num;
      });
    }
    this._filteredFull = list;
  },

  // applyFilterAndSort：重新计算 + 重置分页，渲染第一页
  applyFilterAndSort() {
    if (!this._pigments) return;
    this._computeFiltered();
    this._renderedCount = 0;
    this._appendNextPage();
    this._updateActiveFilters();
    this.refreshStat();
  },

  _updateActiveFilters() {
    const { filterOwned, filterPigment, filterTransparency } = this.data;
    const arr = [];
    if (filterOwned) arr.push({ key: 'owned', label: '已拥有' });
    if (filterPigment) arr.push({ key: 'pigment', label: filterPigment });
    if (filterTransparency) {
      const cn = (TRANSPARENCY_COLOR[filterTransparency] || {}).cn || filterTransparency;
      arr.push({ key: 'transparency', label: cn });
    }
    this.setData({ activeFilters: arr, activeFilterCount: arr.length });
  },

  // ==== 排序 ====
  onSortTap() { this.setData({ sortVisible: true }); },
  onSortClose() { this.setData({ sortVisible: false }); },
  onSortChange(e) {
    const { sort } = e.currentTarget.dataset;
    const labelMap = { name: '按名称', colorNo: '按色号', swatch: '按色卡' };
    this.setData({ sortType: sort, sortLabel: labelMap[sort] || '按色号' }, () => {
      this.applyFilterAndSort();
      setTimeout(() => this.setData({ sortVisible: false }), 150);
    });
  },

  // ==== 筛选主弹层 ====
  onFilterTap() {
    if (!this._filterOptionsBuilt) {
      this._buildFilterOptions();
      this._filterOptionsBuilt = true;
    }
    this.setData({ filterMainVisible: true });
  },
  onFilterMainClose() { this.setData({ filterMainVisible: false }); },
  onFilterOwnedToggle() {
    this.setData({ filterOwned: !this.data.filterOwned });
  },
  onOpenPigmentFilter() {
    this.setData({
      filterPigmentVisible: true,
      pigmentTempSelected: this.data.filterPigment,
      pigmentSearchKey: '',
      pigmentOptionsFiltered: this.data.pigmentOptions,
    });
  },
  onPigmentFilterClose() { this.setData({ filterPigmentVisible: false }); },
  onPigmentSearchInput(e) {
    const key = (e.detail.value || '').trim().toUpperCase();
    const list = this.data.pigmentOptions.filter(o => o.code.toUpperCase().includes(key));
    this.setData({ pigmentSearchKey: e.detail.value, pigmentOptionsFiltered: list });
  },
  onPigmentOptionTap(e) {
    const { code } = e.currentTarget.dataset;
    this.setData({ pigmentTempSelected: code === this.data.pigmentTempSelected ? '' : code });
  },
  onPigmentClear() {
    this.setData({ pigmentTempSelected: '' });
  },
  onPigmentConfirm() {
    this.setData({ filterPigment: this.data.pigmentTempSelected, filterPigmentVisible: false });
  },

  onOpenTransparencyFilter() {
    this.setData({
      filterTransparencyVisible: true,
      transparencyTempSelected: this.data.filterTransparency,
    });
  },
  onTransparencyFilterClose() { this.setData({ filterTransparencyVisible: false }); },
  onTransparencyOptionTap(e) {
    const { value } = e.currentTarget.dataset;
    this.setData({ transparencyTempSelected: value === this.data.transparencyTempSelected ? '' : value });
  },
  onTransparencyClear() { this.setData({ transparencyTempSelected: '' }); },
  onTransparencyConfirm() {
    this.setData({ filterTransparency: this.data.transparencyTempSelected, filterTransparencyVisible: false });
  },

  onFilterReset() {
    this.setData({
      filterOwned: false,
      filterPigment: '',
      filterTransparency: '',
    }, () => {
      this.applyFilterAndSort();
      this.setData({ filterMainVisible: false });
    });
  },
  onFilterApply() {
    this.setData({ filterMainVisible: false });
    this.applyFilterAndSort();
  },

  onRemoveFilterChip(e) {
    const { key } = e.currentTarget.dataset;
    const patch = {};
    if (key === 'owned') patch.filterOwned = false;
    if (key === 'pigment') patch.filterPigment = '';
    if (key === 'transparency') patch.filterTransparency = '';
    this.setData(patch, () => this.applyFilterAndSort());
  },

  // ==== 标注模式 ====
  onMarkTap() {
    if (!this._pigments) return;
    // 标注 / 对比 互斥：进标注前退出对比
    if (this.data.compareMode) this._exitCompareMode();
    this._pigments = this._pigments.map(p => ({ ...p, checked: p.owned }));
    this.setData({ markMode: true }, () => {
      this.applyFilterAndSort();
    });
  },
  onUnownedTap(e) {
    if (!this._pigments) return;
    const { id } = e.currentTarget.dataset;
    this._pigments = this._pigments.map(p => {
      if (p.id === id) return { ...p, checked: true };
      return { ...p, checked: p.owned };
    });
    this.setData({ markMode: true }, () => {
      this.applyFilterAndSort();
    });
  },
  onCancelMark() {
    this._pigments = this._pigments.map(p => ({ ...p, checked: p.owned }));
    this.setData({ markMode: false }, () => {
      this.applyFilterAndSort();
    });
  },
  onRowTap(e) {
    const { id } = e.currentTarget.dataset;
    if (this.data.compareMode) {
      // 对比模式：toggle 加入/移除购物车
      this._toggleCompare(id);
      return;
    }
    if (this.data.markMode) {
      this._pigments = this._pigments.map(p =>
        p.id === id ? { ...p, checked: !p.checked } : p
      );
      this.applyFilterAndSort();
    } else {
      const pigment = this._pigments.find(p => p.id === id);
      if (pigment) this.openDrawer(pigment);
    }
  },
  openDrawer(pigment) {
    const trans = TRANSPARENCY_COLOR[pigment.transparency] || { dot: '#CCCCCC', cn: pigment.transparency || '—' };
    this.setData({
      drawerVisible: true,
      drawerPigment: pigment,
      drawerTransCn: trans.cn,
      drawerTransDot: trans.dot,
    });
  },
  closeDrawer() { this.setData({ drawerVisible: false }); },
  onDrawerToggleOwned() {
    const cur = this.data.drawerPigment;
    if (!cur) return;
    const nextOwned = !cur.owned;
    this._pigments = this._pigments.map(p =>
      p.id === cur.id
        ? { ...p, owned: nextOwned, checked: nextOwned, wishlist: nextOwned ? false : p.wishlist }
        : p
    );
    pigmentStore.savePigments(this.data.brandId, this._pigments);
    const updated = this._pigments.find(p => p.id === cur.id);
    this.setData({ drawerPigment: updated }, () => {
      this.applyFilterAndSort();
      this.showToast(nextOwned ? '已添加到拥有' : '已取消拥有');
    });
  },

  // 切换心愿单（仅未拥有时可用，互斥规则在保存层兜底）
  onDrawerToggleWishlist() {
    const cur = this.data.drawerPigment;
    if (!cur || cur.owned) return;
    const nextWish = !cur.wishlist;
    this._pigments = this._pigments.map(p =>
      p.id === cur.id ? { ...p, wishlist: nextWish } : p
    );
    pigmentStore.savePigments(this.data.brandId, this._pigments);
    const updated = this._pigments.find(p => p.id === cur.id);
    this.setData({ drawerPigment: updated }, () => {
      this.showToast(nextWish ? '已加入心愿单' : '已移出心愿单');
    });
  },
  onToggleAll() {
    const target = !this.data.allSelected;
    this._pigments = this._pigments.map(p => ({ ...p, checked: target }));
    this.applyFilterAndSort();
  },
  onSave() {
    this._pigments = this._pigments.map(p => ({
      ...p,
      owned: p.checked,
      wishlist: p.checked ? false : p.wishlist,  // 已拥有时强制清空心愿单
    }));
    pigmentStore.savePigments(this.data.brandId, this._pigments);
    const ownedCount = this._pigments.filter(p => p.owned).length;
    this.setData({ markMode: false }, () => {
      this.applyFilterAndSort();
      this.showToast(`已保存（${ownedCount} 个已拥有）`);
    });
  },
  refreshStat() {
    const pigments = this._pigments || [];
    const ownedCount = pigments.filter(p => p.owned).length;
    const checkedCount = pigments.filter(p => p.checked).length;
    const allSelected = pigments.length > 0 && checkedCount === pigments.length;
    this.setData({ ownedCount, checkedCount, allSelected });
  },
  showToast(text) {
    this.setData({ toastVisible: true, toastText: text });
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this.setData({ toastVisible: false });
    }, 1600);
  },
  noop() {},

  // ============ 对比模式（V5 新增） ============
  // 进入对比模式
  onCompareTap() {
    if (!this._pigments) return;
    // 标注 / 对比 互斥：进对比前退出标注
    if (this.data.markMode) {
      this._pigments = this._pigments.map(p => ({ ...p, checked: p.owned }));
      this.setData({ markMode: false });
    }
    this._compareSet = new Set();
    this.setData({
      compareMode: true,
      compareCount: 0,
      compareList: [],
      compareCartVisible: false,
    }, () => {
      this.applyFilterAndSort();
    });
  },

  // 退出对比模式（保留 setData 让 wxml 立即响应）
  _exitCompareMode() {
    this._compareSet = null;
    this.setData({
      compareMode: false,
      compareCount: 0,
      compareList: [],
      compareCartVisible: false,
    }, () => {
      this.applyFilterAndSort();
    });
  },

  onCancelCompare() {
    this._exitCompareMode();
  },

  // 清空购物车（不退出对比模式）
  onClearCompare() {
    this._compareSet = new Set();
    this.setData({
      compareCount: 0,
      compareList: [],
      compareCartVisible: false,
    }, () => {
      this.applyFilterAndSort();
    });
  },

  // 行点击：toggle 加入/移除购物车
  _toggleCompare(id) {
    if (!this._compareSet) this._compareSet = new Set();
    const set = this._compareSet;
    const pigment = this._pigments.find(p => p.id === id);
    if (!pigment) return;
    if (set.has(id)) {
      set.delete(id);
    } else {
      set.add(id);
    }
    // 重新构建 compareList（按加入顺序：用 set 的 iteration order）
    const brand = this.data.brand || {};
    const abbr = brand.iconText || 'DS';
    const list = [];
    set.forEach(pid => {
      const p = this._pigments.find(x => x.id === pid);
      if (p) {
        list.push({
          _gid: `${this.data.brandId}_${p.id}`,
          id: p.id,
          colorNo: p.colorNo,
          nameCn: p.nameCn,
          nameEn: p.nameEn,
          pigment: p.pigment,
          transparency: p.transparency,
          swatch: p.swatch,
          _brandAbbr: abbr,
          _brandCn: brand.nameCn,
          _brandColor: brand.color,
          _brandId: this.data.brandId,
        });
      }
    });
    this.setData({
      compareCount: list.length,
      compareList: list,
    }, () => {
      this.applyFilterAndSort();
    });
  },

  // 横条左侧（购物车区域）点击 → 拉起清单
  onCompareCartTap() {
    if (this.data.compareCount === 0) {
      this.showToast('购物车为空');
      return;
    }
    this.setData({ compareCartVisible: true });
  },

  onCompareCartClose() {
    this.setData({ compareCartVisible: false });
  },

  // 清单中移除单个
  onCompareCartRemove(e) {
    const { gid } = e.currentTarget.dataset;
    const item = (this.data.compareList || []).find(x => x._gid === gid);
    if (!item) return;
    this._toggleCompare(item.id);
  },

  // 横条「确定」/ 清单「确定」→ 跳转对比页
  onCompareConfirm() {
    const list = this.data.compareList || [];
    if (list.length === 0) {
      this.showToast('请先加入颜料');
      return;
    }
    // 通过 EventChannel 把数据传给对比页
    wx.navigateTo({
      url: '/pages/pigment-compare/index',
      success: (res) => {
        res.eventChannel.emit('initCompare', { items: list });
        // 完成对比后清空购物车（用户期望：一次性流程）
        this._exitCompareMode();
      },
      fail: (err) => {
        console.error('[compare] navigateTo fail', err);
        this.showToast('打开对比页失败');
      },
    });
  },

  // 离开页面时自动清空（生命周期 onUnload 调用）
  _resetCompareOnLeave() {
    this._compareSet = null;
  },

  // ============ 分享 ============
  onShareAppMessage() {
    const brand = this.data.brand || {};
    const name = brand.nameCn || '水彩品牌';
    const total = this.data.pigmentTotal || 0;
    return {
      title: total > 0 ? `${name} · 共 ${total} 色` : name,
      path: `/pages/brand-detail/index?id=${this.data.brandId}`,
    };
  },

  onShareTimeline() {
    const brand = this.data.brand || {};
    const name = brand.nameCn || '水彩品牌';
    const total = this.data.pigmentTotal || 0;
    return {
      title: total > 0 ? `${name} · 共 ${total} 色` : name,
      query: `id=${this.data.brandId}`,
    };
  },
});
