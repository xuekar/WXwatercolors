Page({
  data: {
    items: [],
    total: 0,
    swatchDrawerVisible: false,
    swatchDrawerColor: '',
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
    if (item && item.swatch) {
      this.setData({
        swatchDrawerVisible: true,
        swatchDrawerColor: item.swatch,
      });
    }
  },

  onSwatchDrawerClose() {
    this.setData({ swatchDrawerVisible: false });
  },

  onShareAppMessage() {
    return {
      title: `${this.data.total} 个颜料对比`,
      path: '/pages/brand-list/index',
    };
  },

  onShareTimeline() {
    return {
      title: `${this.data.total} 个颜料对比`,
      query: '',
    };
  },
});
