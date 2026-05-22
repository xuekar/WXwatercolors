// utils/data.js — 主包数据中心
// 仅持有品牌元数据 + 从 globalData 读取 owned 统计
// 颜料原始数据在子包 subpkg-detail/data/ 中，详情页通过 pigment-store.js 访问

const BRANDS = [
  { id: 1, nameCn: '温莎牛顿',     nameEn: 'Winsor & Newton',     iconText: 'W&N', color: 'linear-gradient(135deg, #B22234, #7A1521)', colorNo: 1 },
  { id: 2, nameCn: '丹尼尔史密斯', nameEn: 'Daniel Smith',         iconText: 'DS',  color: 'linear-gradient(135deg, #2E5C8A, #1A3A5C)', colorNo: 2 },
  { id: 3, nameCn: '史明克',       nameEn: 'Schmincke Horadam',    iconText: 'SCH', color: 'linear-gradient(135deg, #D4A017, #A37C0F)', colorNo: 3 },
  { id: 4, nameCn: '荷尔拜因',     nameEn: 'Holbein',              iconText: 'HBN', color: 'linear-gradient(135deg, #4A7C59, #2F5238)', colorNo: 4 },
  { id: 5, nameCn: '麦克哈丁',     nameEn: 'Michael Harding',      iconText: 'MH',  color: 'linear-gradient(135deg, #C9573B, #8E3A26)', colorNo: 5 },
  { id: 6, nameCn: 'M. Graham',    nameEn: 'M. Graham & Co.',      iconText: 'MG',  color: 'linear-gradient(135deg, #6A4C93, #432B6A)', colorNo: 6 },
];

// 各品牌总颜料数（与 subpkg-detail/data/*.js 中的实际条数保持一致）
const BRAND_TOTAL = { 1: 116, 2: 188, 3: 190, 4: 181, 5: 135, 6: 72 };

function _getOwnedCount(brandId) {
  const app = getApp();
  if (!app || !app.globalData || !app.globalData.ownedCounts) return 0;
  return app.globalData.ownedCounts[brandId] || 0;
}

module.exports = {
  // 获取所有品牌（统计实时从 globalData.ownedCounts 读取）
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
  // 获取某品牌元数据 + 统计
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
};
