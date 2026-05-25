// utils/data.js — 主包数据中心
// 仅持有品牌元数据 + 从 globalData 读取 owned 统计
// 颜料原始数据在 utils/data/ 中，详情页通过 utils/pigment-store.js 访问

const BRANDS = [
  { id: 1, nameCn: '温莎牛顿',     nameEn: 'Winsor & Newton',     iconText: 'W&N', color: 'linear-gradient(135deg, #B22234, #7A1521)', colorNo: 1 },
  { id: 2, nameCn: '丹尼尔史密斯', nameEn: 'Daniel Smith',         iconText: 'DS',  color: 'linear-gradient(135deg, #2E5C8A, #1A3A5C)', colorNo: 2 },
  { id: 3, nameCn: '史明克',       nameEn: 'Schmincke Horadam',    iconText: 'SCH', color: 'linear-gradient(135deg, #D4A017, #A37C0F)', colorNo: 3 },
  { id: 4, nameCn: '荷尔拜因',     nameEn: 'Holbein',              iconText: 'HBN', color: 'linear-gradient(135deg, #4A7C59, #2F5238)', colorNo: 4 },
  { id: 5, nameCn: '麦克哈丁',     nameEn: 'Michael Harding',      iconText: 'MH',  color: 'linear-gradient(135deg, #C9573B, #8E3A26)', colorNo: 5 },
  { id: 6, nameCn: 'M. Graham',    nameEn: 'M. Graham & Co.',      iconText: 'MG',  color: 'linear-gradient(135deg, #6A4C93, #432B6A)', colorNo: 6 },
];

const BRAND_TOTAL = { 1: 116, 2: 188, 3: 190, 4: 181, 5: 135, 6: 72 };
const TOTAL_PIGMENTS = Object.values(BRAND_TOTAL).reduce((s, n) => s + n, 0);

function _getOwnedCount(brandId) {
  const app = getApp();
  if (!app || !app.globalData || !app.globalData.ownedCounts) return 0;
  return app.globalData.ownedCounts[brandId] || 0;
}
function _getWishlistCount(brandId) {
  const app = getApp();
  if (!app || !app.globalData || !app.globalData.wishlistCounts) return 0;
  return app.globalData.wishlistCounts[brandId] || 0;
}

module.exports = {
  getBrands() {
    return BRANDS.map(b => {
      const ownedCount = _getOwnedCount(b.id);
      return {
        ...b,
        ownedCount,
        totalCount: BRAND_TOTAL[b.id] || 0,
        owned: ownedCount > 0,
      };
    });
  },
  getBrand(id) {
    const b = BRANDS.find(x => x.id === Number(id));
    if (!b) return null;
    const ownedCount = _getOwnedCount(b.id);
    return {
      ...b,
      ownedCount,
      totalCount: BRAND_TOTAL[b.id] || 0,
      owned: ownedCount > 0,
    };
  },
  // 跨品牌全局统计：用于色彩库子 Tab 计数
  getGlobalStat() {
    let owned = 0, wish = 0;
    BRANDS.forEach(b => {
      owned += _getOwnedCount(b.id);
      wish += _getWishlistCount(b.id);
    });
    return {
      ownedCount: owned,
      wishlistCount: wish,
      unownedCount: TOTAL_PIGMENTS - owned,
      totalCount: TOTAL_PIGMENTS,
    };
  },
  // 品牌元数据（不带统计），用于色彩库筛选弹层快速读取
  getBrandsMeta() {
    return BRANDS.map(b => ({
      id: b.id,
      nameCn: b.nameCn,
      nameEn: b.nameEn,
      iconText: b.iconText,
      color: b.color,
      totalCount: BRAND_TOTAL[b.id] || 0,
    }));
  },
};
