#!/usr/bin/env node
// Lv96 紫装備 anchor verify: 兄貴 SS 2 件と wdb 値一致確認
// 韓通宿血残兜 (冠 slot 3 / Lv96 紫: HP_MAX 5196 / W_DEF 20)
// 京娘恩仇の結 (佩 slot 11 / Lv96 紫: MAX_W_ATK 116)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ locale: 'en-US' });
  const page = await ctx.newPage();

  // tier=3, 4, 5 で Lv96 全件 list 取得 → name に Han Tong / Jingniang / Mourning / Bloodlust 等含むもの絞り
  for (const tier of [3, 4, 5]) {
    console.log(`\n=== Lv96 tier=${tier} ===`);
    await page.goto(`https://wwmdb.vlt.fyi/equip-items?level=96&tier=${tier}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const items = await page.evaluate(() => {
      const t = document.querySelector('table'); if (!t) return [];
      return [...t.rows].slice(1).map(r => {
        const cells = [...r.cells].map(c => c.textContent.trim());
        const link = r.cells[1]?.querySelector('a')?.getAttribute('href') || '';
        return { id: cells[0], name: cells[1], level: cells[2], href: link };
      });
    });
    // 兄貴 SS 候補 = 武器系 (Weapon/佩) + 防具系 (Helmet/冠)
    // 韓通 = Han Tong / 宿血 = Bloodlust|Soulblood|Bloodlast 等
    // 京娘 = Jingniang / 恩仇 = Vengeance|Vendetta|Grudge 等
    const matches = items.filter(it => /Han|Jing|Bloodl|Vendet|Vengea|Grudg|Mourn|Soulbl|Tang|Niang/i.test(it.name));
    console.log(`total=${items.length}, candidates=${matches.length}`);
    for (const m of matches.slice(0, 20)) console.log(`  ${m.id}\t${m.name}`);
  }

  // 全 Lv96 tier=4 (紫仮説) item 詳細 fetch → slot/base stat 抽出 (全件 = 67 で時間かかる) → 後段判断
  // 先に list 全件出して兄貴に名前 review してもらう
  console.log('\n=== Lv96 tier=4 全件 list (紫仮説) ===');
  await page.goto('https://wwmdb.vlt.fyi/equip-items?level=96&tier=4', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const allT4 = await page.evaluate(() => {
    const t = document.querySelector('table'); if (!t) return [];
    return [...t.rows].slice(1).map(r => {
      const cells = [...r.cells].map(c => c.textContent.trim());
      const link = r.cells[1]?.querySelector('a')?.getAttribute('href') || '';
      return { id: cells[0], name: cells[1], href: link };
    });
  });
  for (const it of allT4) console.log(`  ${it.id}\t${it.name}`);

  // detail fetch sample = tier=4 の slot=11 (Disc 系) 1 件選んで構造確認
  const sample = allT4.find(it => /Disc|Plaque|Pendant|Talisman/i.test(it.name));
  if (sample) {
    console.log(`\n=== Sample detail: ${sample.id} ${sample.name} ===`);
    await page.goto(`https://wwmdb.vlt.fyi/equip-items/${sample.id}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const detail = await page.evaluate(() => document.body.innerText.slice(0, 2000));
    console.log(detail);
  }

  await browser.close();
})();
