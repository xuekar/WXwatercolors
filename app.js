// app.js
const _now = () => Date.now();
console.log('[app] script loaded', _now());

const STORAGE_KEY = 'wc_user_states_v1';

App({
  onLaunch() {
    console.log('[app] onLaunch', _now());

    // 初始化云开发（用于 msgSecCheck 内容安全检测）
    // 若未开通云开发，会自动降级（_msgSecCheck 中已做容错）
    if (wx.cloud) {
      try {
        wx.cloud.init({ env: 'shuicaigongfang-d8feu0h5c1a027bd', traceUser: true });
        this.globalData.cloudInited = true;
        console.log('[app] wx.cloud 初始化成功');
      } catch (err) {
        console.warn('[app] wx.cloud 初始化失败，msgSecCheck 将本地降级', err);
        this.globalData.cloudInited = false;
      }
    } else {
      console.warn('[app] 当前基础库不支持 wx.cloud');
      this.globalData.cloudInited = false;
    }

    // 分享缩略图：上传到云存储并获取 HTTPS 公网链接（分享卡片需要公网可访问的 URL）
    this._ensureShareImage();

    // 启动时预热：从本地存储读取用户标记状态，按品牌算出 owned/wishlist 计数
    // 写入 globalData，让品牌列表页第一帧就能拿到正确的拥有数（无需等颜料数据加载）
    if (!this.globalData.ownedCounts) this.globalData.ownedCounts = {};
    if (!this.globalData.wishlistCounts) this.globalData.wishlistCounts = {};
    try {
      const states = wx.getStorageSync(STORAGE_KEY) || {};
      Object.keys(states).forEach(brandId => {
        const brandStates = states[brandId] || {};
        let owned = 0, wish = 0;
        Object.keys(brandStates).forEach(pigmentId => {
          const s = brandStates[pigmentId];
          if (s.owned) owned++;
          if (s.wishlist) wish++;
        });
        this.globalData.ownedCounts[brandId] = owned;
        this.globalData.wishlistCounts[brandId] = wish;
      });
      console.log('[app] 已恢复用户标记统计', this.globalData.ownedCounts);
    } catch (err) {
      console.error('[app] 读取本地状态失败', err);
    }

    // 异步从云端拉取并合并状态（覆盖本地缓存清理或跨设备场景）
    console.log('[app] cloudInited =', this.globalData.cloudInited);
    if (this.globalData.cloudInited) {
      try {
        const pigmentStore = require('./utils/pigment-store.js');
        console.log('[app] 调用 pigmentStore.pullFromCloud');
        pigmentStore.pullFromCloud().then(res => {
          console.log('[app] pullFromCloud 返回', res);
          if (res && res.success) {
            console.log('[app] 云端用户状态拉取成功');
          }
        }).catch(err => {
          console.warn('[app] 云端拉取失败（已用本地数据）', err);
        });
      } catch (err) {
        console.warn('[app] 云端拉取调用异常', err);
      }
    } else {
      console.warn('[app] cloudInited=false，跳过云端拉取');
    }
  },
  onShow() {
    console.log('[app] onShow', _now());
    // 每次回到前台都强制拉取云端最新状态（force=true 跳过节流）
    if (this.globalData.cloudInited) {
      try {
        const pigmentStore = require('./utils/pigment-store.js');
        pigmentStore.pullFromCloud(true).then(res => {
          if (res && res.success && !res.skipped) {
            console.log('[app] onShow 云端用户状态拉取成功');
          }
        }).catch(err => {
          console.warn('[app] onShow 云端拉取失败', err);
        });
      } catch (err) {
        console.warn('[app] onShow 云端拉取调用异常', err);
      }
    }
  },
  onError(err) {
    console.error('[app] onError', _now(), err);
  },
  /**
   * 确保分享缩略图已上传到云存储，并获取 HTTPS 公网链接
   * 微信分享卡片的 imageUrl 必须是公网可访问的 HTTPS 链接
   * cloud:// fileID 和本地路径在接收方不可见
   */
  _ensureShareImage() {
    const CLOUD_PATH = 'share-thumb.jpg';
    const LOCAL_PATH = '/images/share-thumb.jpg';
    const CACHE_KEY = 'wc_share_image_https';
    const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 小时后重新获取（私有读链接有效期 24h）

    // 优先使用缓存的 HTTPS 链接（未过期）
    try {
      const cacheStr = wx.getStorageSync(CACHE_KEY);
      if (cacheStr) {
        const cache = JSON.parse(cacheStr);
        if (cache.url && cache.url.startsWith('https://') && (Date.now() - cache.ts < CACHE_TTL)) {
          this.globalData.shareImageUrl = cache.url;
          console.log('[app] 分享缩略图 HTTPS 链接已缓存');
          return;
        }
      }
    } catch (e) { /* ignore */ }

    // 默认降级到本地路径（发送者本人可见）
    this.globalData.shareImageUrl = LOCAL_PATH;

    // 异步上传到云存储并获取 HTTPS 链接
    if (!this.globalData.cloudInited) return;

    const fs = wx.getFileSystemManager();
    const tempPath = `${wx.env.USER_DATA_PATH}/_share_tmp.jpg`;
    try {
      const data = fs.readFileSync(LOCAL_PATH);
      fs.writeFileSync(tempPath, data);
    } catch (err) {
      console.warn('[app] 复制分享图到临时目录失败，使用本地路径', err);
      return;
    }

    wx.cloud.uploadFile({
      cloudPath: CLOUD_PATH,
      filePath: tempPath,
      success: (res) => {
        console.log('[app] 分享缩略图已上传云存储', res.fileID);
        // 清理临时文件
        try { fs.unlinkSync(tempPath); } catch (e) {}
        // 通过 getTempFileURL 获取 HTTPS 公网链接
        wx.cloud.getTempFileURL({
          fileList: [res.fileID],
          success: (urlRes) => {
            if (urlRes.fileList && urlRes.fileList[0] && urlRes.fileList[0].tempFileURL) {
              const httpsUrl = urlRes.fileList[0].tempFileURL;
              this.globalData.shareImageUrl = httpsUrl;
              try {
                wx.setStorageSync(CACHE_KEY, JSON.stringify({ url: httpsUrl, ts: Date.now() }));
              } catch (e) {}
              console.log('[app] 分享缩略图 HTTPS 链接', httpsUrl);
            }
          },
          fail: (err) => {
            console.warn('[app] getTempFileURL 失败', err);
          }
        });
      },
      fail: (err) => {
        console.warn('[app] 分享缩略图上传云存储失败，使用本地路径', err);
        try { fs.unlinkSync(tempPath); } catch (e) {}
      }
    });
  },
  onPageNotFound(res) {
    console.error('[app] onPageNotFound', _now(), res);
  },
  globalData: {
    userId: 'demo',
    ownedCounts: {},
    wishlistCounts: {},
    cloudInited: false,
    shareImageUrl: '/images/share-thumb.jpg',  // 分享缩略图（云存储 HTTPS 公网链接 或降级本地路径）
  }
});
