/**
 * 批量上传 hbn-swatches 到云存储
 * 
 * 【推荐方式】在微信云开发控制台直接上传：
 *   1. 打开微信开发者工具 → 云开发控制台 → 存储
 *   2. 新建文件夹 "hbn-swatches"
 *   3. 进入该文件夹 → 上传文件 → 选择本地 images/hbn-swatches/ 下所有 188 个 jpeg 文件
 *   4. 等待上传完成即可（每个文件只有 1-2KB，很快）
 * 
 * 【备选方式】在微信开发者工具调试器控制台粘贴运行以下代码：
 *   前提：小程序已运行（云开发已初始化）
 */

// === 复制以下代码到微信开发者工具 Console 执行 ===

;(async function uploadHbnSwatches() {
  const fs = wx.getFileSystemManager();
  const cloudBase = 'hbn-swatches';

  // 文件列表（从 hbn-pigments.js 数据提取）
  const fileNames = [
    "W201_p001.jpeg","W203_p002.jpeg","W219_p003.jpeg","W370_p004.jpeg",
    "W211_p009.jpeg","W209_p007.jpeg","W210_p008.jpeg","W212_p010.jpeg",
    "W213_p011.jpeg","W214_p012.jpeg","W215_p013.jpeg","W216_p014.jpeg",
    "W217_p015.jpeg","W218_p016.jpeg","W221_p017.jpeg","W206_p018.jpeg",
    "W205_p019.jpeg","W207_p020.jpeg","W208_p021.jpeg","W220_p022.jpeg",
    "W222_p023.jpeg","W223_p024.jpeg","W224_p025.jpeg","W225_p026.jpeg",
    "W226_p027.jpeg","W227_p028.jpeg","W228_p029.jpeg","W229_p030.jpeg",
    "W230_p031.jpeg","W233_p032.jpeg","W234_p033.jpeg","W235_p034.jpeg",
    "W237_p035.jpeg","W239_p036.jpeg","W240_p037.jpeg","W241_p038.jpeg",
    "W242_p039.jpeg","W243_p040.jpeg","W244_p041.jpeg","W245_p042.jpeg",
    "W247_p043.jpeg","W248_p044.jpeg","W249_p045.jpeg","W250_p046.jpeg",
    "W251_p047.jpeg","W252_p048.jpeg","W254_p049.jpeg","W257_p050.jpeg",
    "W258_p051.jpeg","W261_p052.jpeg","W263_p053.jpeg","W264_p054.jpeg",
    "W265_p055.jpeg","W266_p056.jpeg","W267_p057.jpeg","W268_p058.jpeg",
    "W270_p059.jpeg","W271_p060.jpeg","W272_p061.jpeg","W273_p062.jpeg",
    "W274_p063.jpeg","W275_p064.jpeg","W276_p065.jpeg","W277_p066.jpeg",
    "W278_p067.jpeg","W279_p068.jpeg","W280_p069.jpeg","W281_p070.jpeg",
    "W282_p071.jpeg","W283_p072.jpeg","W284_p073.jpeg","W285_p074.jpeg",
    "W286_p075.jpeg","W287_p076.jpeg","W288_p077.jpeg","W289_p078.jpeg",
    "W291_p079.jpeg","W292_p080.jpeg","W293_p081.jpeg","W294_p082.jpeg",
    "W295_p083.jpeg","W296_p084.jpeg","W297_p085.jpeg","W298_p086.jpeg",
    "W299_p087.jpeg","W300_p088.jpeg","W301_p089.jpeg","W302_p090.jpeg",
    "W303_p091.jpeg","W304_p092.jpeg","W305_p093.jpeg","W306_p094.jpeg",
    "W307_p095.jpeg","W308_p096.jpeg","W309_p097.jpeg","W310_p098.jpeg",
    "W311_p099.jpeg","W312_p100.jpeg","W313_p101.jpeg","W314_p102.jpeg",
    "W315_p103.jpeg","W316_p104.jpeg","W317_p105.jpeg","W350_p106.jpeg",
    "W390_p107.jpeg","W391_p108.jpeg","W351_p109.jpeg","W352_p110.jpeg",
    "W353_p111.jpeg","W354_p112.jpeg","W355_p113.jpeg","W356_p114.jpeg",
    "W357_p115.jpeg","W358_p116.jpeg","W360_p117.jpeg","W361_p118.jpeg",
    "W362_p119.jpeg","W363_p120.jpeg","W364_p121.jpeg","W365_p122.jpeg",
    "W366_p123.jpeg","W367_p124.jpeg","W368_p125.jpeg","W369_p126.jpeg",
    "W371_p127.jpeg","W372_p128.jpeg","W373_p129.jpeg","W374_p130.jpeg",
    "W375_p131.jpeg","W848_p132.jpeg","W849_p133.jpeg","W850_p134.jpeg",
    "W851_p135.jpeg","W376_p136.jpeg","W377_p137.jpeg","W378_p138.jpeg",
    "W379_p139.jpeg","W380_p140.jpeg","W381_p141.jpeg","W382_p142.jpeg",
    "W383_p143.jpeg","W384_p144.jpeg","W385_p145.jpeg","W386_p146.jpeg",
    "W387_p147.jpeg","W388_p148.jpeg","W389_p149.jpeg","W782_p150.jpeg",
    "W783_p151.jpeg","W784_p152.jpeg","W785_p153.jpeg","W786_p154.jpeg",
    "W787_p155.jpeg","W788_p156.jpeg","W789_p157.jpeg","WG501_p158.jpeg",
    "WG502_p159.jpeg","WG503_p160.jpeg","WG504_p161.jpeg","WG505_p162.jpeg",
    "WG511_p163.jpeg","WG512_p164.jpeg","WG513_p165.jpeg","WG514_p166.jpeg",
    "WG515_p167.jpeg","WG524_p168.jpeg","WG531_p169.jpeg","WG532_p170.jpeg",
    "WG533_p171.jpeg","WG541_p172.jpeg","WG542_p173.jpeg","WG543_p174.jpeg",
    "WG551_p175.jpeg","WG561_p176.jpeg","WG562_p177.jpeg","WG563_p178.jpeg",
    "WG564_p179.jpeg","WG571_p180.jpeg","WG572_p181.jpeg",
    "W204_p182.jpeg","W231_p183.jpeg","W232_p184.jpeg","W236_p185.jpeg",
    "W238_p186.jpeg","W246_p187.jpeg","W253_p188.jpeg"
  ];

  console.log(`准备上传 ${fileNames.length} 个文件到云存储 ${cloudBase}/...`);
  
  let success = 0, fail = 0;
  const BATCH = 5; // 每批并发 5 个

  for (let i = 0; i < fileNames.length; i += BATCH) {
    const batch = fileNames.slice(i, i + BATCH);
    const promises = batch.map(fileName => {
      const localPath = `/images/hbn-swatches/${fileName}`;
      const cloudPath = `${cloudBase}/${fileName}`;

      return new Promise((resolve) => {
        // 代码包内文件需要先复制到用户目录才能上传
        const tempPath = `${wx.env.USER_DATA_PATH}/_hbn_${fileName}`;
        try {
          const data = fs.readFileSync(localPath);
          fs.writeFileSync(tempPath, data);
        } catch (err) {
          console.warn(`[skip] ${fileName}: ${err.message || err}`);
          fail++;
          resolve();
          return;
        }

        wx.cloud.uploadFile({
          cloudPath,
          filePath: tempPath,
          success: () => { success++; try{fs.unlinkSync(tempPath);}catch(e){} resolve(); },
          fail: (err) => { console.warn(`[fail] ${fileName}: ${err.errMsg}`); fail++; try{fs.unlinkSync(tempPath);}catch(e){} resolve(); }
        });
      });
    });

    await Promise.all(promises);
    if ((i + BATCH) % 20 === 0 || i + BATCH >= fileNames.length) {
      console.log(`进度: ${Math.min(i + BATCH, fileNames.length)}/${fileNames.length} ✓${success} ✗${fail}`);
    }
  }

  console.log(`\n=== 上传完成 ===\n成功: ${success}, 失败: ${fail}, 总计: ${fileNames.length}`);
})();
