// 品牌列表页
const dataStore = require('../../utils/data.js');

Page({
  data: {
    activeTab: 'all',
    sortType: 'name',
    sortLabel: '按名称',
    sortVisible: false,
    brandList: [],
    filteredList: [],
  },

  onLoad() {
    this.refresh();
  },

  onShow() {
    // 详情页保存后回到此页时也要刷新
    if (this._loaded) {
      this.refresh();
    } else {
      this._loaded = true;
    }
  },

  refresh() {
    const brandList = dataStore.getBrands();
    this.setData({ brandList }, () => this.applyFilter());
  },

  // Tab 切换
  onTabChange(e) {
    const { tab } = e.currentTarget.dataset;
    if (tab === this.data.activeTab) return;
    this.setData({ activeTab: tab }, () => this.applyFilter());
  },

  // 排序
  onSortTap() {
    this.setData({ sortVisible: true });
  },
  onSortClose() {
    this.setData({ sortVisible: false });
  },
  onSortChange(e) {
    const { sort } = e.currentTarget.dataset;
    const sortLabel = sort === 'name' ? '按名称' : '按色号';
    this.setData(
      { sortType: sort, sortLabel },
      () => {
        this.applyFilter();
        setTimeout(() => this.setData({ sortVisible: false }), 150);
      }
    );
  },

  // 筛选 + 排序
  applyFilter() {
    const { activeTab, sortType, brandList } = this.data;
    let list = brandList.slice();
    if (activeTab === 'owned') list = list.filter(b => b.owned);
    else if (activeTab === 'unowned') list = list.filter(b => !b.owned);

    if (sortType === 'name') {
      list.sort((a, b) => a.nameCn.localeCompare(b.nameCn, 'zh-CN'));
    } else {
      list.sort((a, b) => a.colorNo - b.colorNo);
    }
    this.setData({ filteredList: list });
  },

  // 跳转详情页
  onBrandTap(e) {
    const { id } = e.currentTarget.dataset;
    console.log('[list] onBrandTap navigate id=', id, Date.now());
    wx.navigateTo({
      url: `/pages/brand-detail/index?id=${id}`,
      success: () => console.log('[list] navigateTo success', Date.now()),
      fail: (err) => console.error('[list] navigateTo fail', err, Date.now()),
    });
  },

  noop() {},
});
