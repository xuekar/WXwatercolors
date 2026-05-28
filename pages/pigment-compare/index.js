Page({
  data: {
    items: [],
    total: 0,
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
    // 预留：未来可拉起颜料详情抽屉
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
