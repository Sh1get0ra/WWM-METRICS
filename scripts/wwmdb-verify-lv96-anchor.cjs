#!/usr/bin/env node
// Lv96 紫装備 anchor verify (確定):
//   1110032 Bloodworn Helm = 韓通宿血残兜 (冠 slot 3、 兄貴 SS: HP_MAX 5196 / W_DEF 20)
//   1110033 Feud Knot     = 京娘恩仇結  (佩 slot 11、 兄貴 SS: MAX_W_ATK 116)
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ locale: 'en-US' });
  const page = await ctx.newPage();

  for (const [id, expect] of [
    ['1110032', { slot: '3 冠', HP_MAX: 5196, W_DEF: 20 }],
    ['1110033', { slot: '11 佩', MAX_W_ATK: 116 }],
  ]) {
    await page.goto(`https://wwmdb.vlt.fyi/equip-items/${id}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const detail = await page.evaluate(() => {
      const txt = document.body.innerText;
      // Attributes: section の text 抽出
      const m = txt.match(/Attributes:\s*([\s\S]*?)(?:SETS|AFFIXES|$)/);
      return { text: txt.slice(0, 2000), attrs: m?.[1]?.trim() || '' };
    });
    console.log(`\n=== ${id} (${expect.slot}) ===`);
    console.log('expect:', JSON.stringify(expect));
    console.log('wdb attributes:');
    console.log(detail.attrs);
  }

  await browser.close();
})();
