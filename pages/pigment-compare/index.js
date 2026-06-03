Page({
  data: {
    items: [],
    total: 0,
    swatchDrawerVisible: false,
    swatchDrawerColor: '',
    swatchDrawerImage: '',
  },

  onLoad() {
    const eventChannel = this.getOpenerEventChannel && this.getOpenerEventChannel();
    if (eventChannel && eventChannel.on) {
      eventChannel.on('initCompare', (data) => {
        const items = (data && data.items) || [];
        this.setData({
          items,
          total: items.length,
        });
        wx.setNavigationBarTitle({ title: `颜料对比 · 共 ${items.length} 个` });
      });
    }
    if (wx.showShareMenu) {
      wx.showShareMenu({
        withShareTicket: true,
        menus: ['shareAppMessage', 'shareTimeline'],
      });
    }
  },

  onCardTap(e) {
    const gid = e.currentTarget.dataset.gid;
    const item = this.data.items.find(i => i._gid === gid);
    if (item && (item.swatch || item.swatchImage)) {
      this.setData({
        swatchDrawerVisible: true,
        swatchDrawerColor: item.swatch || '',
        swatchDrawerImage: item.swatchImage || '',
      });
    }
  },

  onSwatchDrawerClose() {
    this.setData({ swatchDrawerVisible: false });
  },

  // 下拉刷新：5 秒内只能拉取一次，强制刷新云端数据
  onPullDownRefresh() {
    const now = Date.now();
    if (this._lastPullDownAt && now - this._lastPullDownAt < 5000) {
      const wait = Math.ceil((5000 - (now - this._lastPullDownAt)) / 1000);
      wx.stopPullDownRefresh();
      wx.showToast({ title: `请 ${wait}s 后再试`, icon: 'none', duration: 1500 });
      return;
    }
    this._lastPullDownAt = now;
    const app = getApp();
    if (!app || !app.globalData || !app.globalData.cloudInited) {
      wx.stopPullDownRefresh();
      wx.showToast({ title: '云端未就绪', icon: 'none', duration: 1500 });
      return;
    }
    const pigmentStore = require('../../utils/pigment-store.js');
    pigmentStore.pullFromCloud(true).then(res => {
      wx.stopPullDownRefresh();
      const ok = res && res.success && !res.skipped;
      wx.showToast({ title: ok ? '已同步最新' : '已是最新', icon: 'none', duration: 1500 });
    }).catch(() => {
      wx.stopPullDownRefresh();
      wx.showToast({ title: '刷新失败', icon: 'none', duration: 1500 });
    });
  },

  onShareAppMessage() {
    return {
      title: '锻造你的色彩世界',
      path: '/pages/brand-list/index',
    };
  },

  onShareTimeline() {
    return {
      title: '锻造你的色彩世界',
      query: '',
    };
  },
});
