# 水彩品牌色卡管理 — 微信小程序 Demo

基于原生微信小程序框架开发的可体验 Demo。**不依赖任何第三方组件库**，可在微信开发者工具直接打开运行（游客模式即可）。

## 📁 项目结构

```
watercolor-miniprogram/
├── app.js                       全局逻辑
├── app.json                     全局配置（页面注册、窗口样式）
├── app.wxss                     全局样式
├── sitemap.json                 sitemap 配置
├── project.config.json          项目配置
├── project.private.config.json  开发者私有配置
├── utils/
│   └── data.js                  Mock 数据中心（品牌 + 颜料 + 保存接口）
└── pages/
    ├── brand-list/              品牌列表页
    │   ├── index.js / .json / .wxml / .wxss
    └── brand-detail/            品牌详情页（颜料列表）
        └── index.js / .json / .wxml / .wxss
```

## 🚀 如何运行

### 方法一：微信开发者工具（推荐）
1. 下载并安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 打开开发者工具，点击「项目 → 导入项目」
3. 项目目录选择本目录 `watercolor-miniprogram`
4. AppID 选择「**测试号**」（游客模式，无需注册）
5. 点击「导入」即可看到效果

### 方法二：真机预览
在开发者工具中点击右上角「预览」，扫码即可在微信中体验。

## 🎯 功能特性

### 品牌列表页（`pages/brand-list/index`）
- 顶部 3 个 Tab：全部品牌 / 已拥有 / 未拥有
- 排序：按名称 / 按色号（底部弹层选择）
- 列表项：占位 ICON（CSS 渐变 + 品牌缩写）、中英文名、拥有状态图标
- 内置 8 个品牌：温莎牛顿、丹尼尔史密斯、史明克、荷尔拜因、麦克哈丁、M.Graham、Sennelier、吴竹

### 品牌详情页（`pages/brand-detail/index?id={id}`）
- 品牌头部：占位 ICON + 中英文名 + 颜料统计
- 操作栏：排序 / 标注（标注模式下切换为：取消 / 全选）
- 5 列表格：色号 / 英文名 / 中文名 / 色卡 / 拥有
- 颜料列表使用 `scroll-view` 实现纵向滚动，可承载数百行
- **标注模式**：
  - 点击「标注」进入，右侧 ICON 切换为方形勾选框
  - 已拥有项默认勾选，未拥有默认空框
  - 点击行切换勾选；底部出现「保存」按钮
  - 保存后将选中状态持久化（写回全局 dataStore），并 Toast 提示

## 🎨 设计还原说明

| 设计元素 | 实现方式 |
|---|---|
| 主色 #0052D9 | 全局统一使用，按钮、激活态、勾选 |
| 占位 ICON | `linear-gradient` + 品牌缩写文字，避免依赖图片 |
| 圆角卡片 | `border-radius: 16rpx` + 浅阴影 |
| 状态图标 | 圆形 ✓（已拥有蓝底白勾） / + （未拥有灰描边） |
| 标注勾选框 | 方形（区分圆形拥有图标） |
| 排序弹层 | 底部 Popup + 单选项 + 蒙层 |
| Toast | 居中蓝色对勾 + 文字提示 |

## 📝 数据流

- 列表页 / 详情页都从 `utils/data.js` 读取数据
- 详情页保存时调用 `dataStore.savePigments()` 写回内存
- 列表页 `onShow` 自动刷新，已拥有数会立刻同步
- 真实场景：把 `utils/data.js` 中的 mock 实现换成 `wx.request` 即可

## ⚙️ 兼容性

- 微信小程序基础库 ≥ 2.10.0
- 已开启 `enhanced` scroll-view 增强模式（如需兼容低版本，可移除 `enhanced` 属性）
- 使用 `env(safe-area-inset-bottom)` 适配 iPhone 全面屏

## 🌱 下一步可拓展

- 颜料详情弹窗（透明度 / 染色性 / 耐光性 / 颜料成分）
- 收藏色卡组合
- 品牌横向对比（同色号跨品牌比较）
- 接入云开发持久化用户色卡
