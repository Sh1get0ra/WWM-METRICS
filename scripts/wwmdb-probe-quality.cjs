#!/usr/bin/env node
// wwmdb equip-items の品質 (gold/purple/blue) 軸 調査
// tier=1..5 各で row count + sample name 確認 → quality 軸特定
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ locale: 'en-US' });
  const page = await ctx.newPage();

  // Lv96 で tier=1..5 各で row 確認
  for (const tier of [1, 2, 3, 4, 5]) {
    const url = `https://wwmdb.vlt.fyi/equip-items?level=96&tier=${tier}`;
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const info = await page.evaluate(() => {
      const t = document.querySelector('table');
      if (!t) return { rows: 0, samples: [], headers: [] };
      const headers = [...(t.rows[0]?.cells || [])].map(c => c.textContent.trim());
      const rows = [...t.rows].slice(1, 6).map(r => [...r.cells].map(c => c.textContent.trim()));
      return { rows: t.rows.length - 1, samples: rows.slice(0, 3), headers };
    });
    console.log(`Lv96 tier=${tier}: rows=${info.rows}, headers=[${info.headers.join('|')}]`);
    for (const s of info.samples) console.log('  sample:', s.join(' / '));
  }

  // 別軸候補: quality=gold/purple/blue or color= ?
  for (const q of ['purple', 'blue', 'gold']) {
    const url = `https://wwmdb.vlt.fyi/equip-items?level=96&quality=${q}`;
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const info = await page.evaluate(() => {
      const t = document.querySelector('table');
      const rows = t ? t.rows.length - 1 : 0;
      const sample = t?.rows[1] ? [...t.rows[1].cells].map(c => c.textContent.trim()).join(' / ') : '';
      return { rows, sample };
    });
    console.log(`Lv96 quality=${q}: rows=${info.rows}, sample: ${info.sample}`);
  }

  // ページ全体の filter UI 調査 (Lv96 t5 page)
  await page.goto('https://wwmdb.vlt.fyi/equip-items?level=96&tier=5', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const filterUI = await page.evaluate(() => {
    const selects = [...document.querySelectorAll('select')].map(s => ({
      name: s.name || s.id || '?',
      options: [...s.options].map(o => `${o.value}=${o.textContent.trim()}`).slice(0, 10)
    }));
    const links = [...document.querySelectorAll('a')].filter(a => /tier|quality|level/.test(a.href || '')).slice(0, 10).map(a => a.href);
    return { selects, links };
  });
  console.log('\nfilter UI:', JSON.stringify(filterUI, null, 2));

  await browser.close();
})();
