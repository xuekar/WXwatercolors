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
