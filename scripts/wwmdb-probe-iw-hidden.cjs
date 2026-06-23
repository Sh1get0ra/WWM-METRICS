#!/usr/bin/env node
// 心法 inner-ways/{id} の Tier 別 hidden DIV から WorldLv 別 stat 値抽出可能か確認
// Mountain's Might (id=101) で probe
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ locale: 'en-US' });
  const page = await ctx.newPage();

  await page.goto('https://wwmdb.vlt.fyi/inner-ways/101', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // hidden DIV 全件 (Tier 毎) の text 全長取得
  const dump = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('div').forEach(el => {
      const cs = getComputedStyle(el);
      if (cs.display !== 'none' && cs.visibility !== 'hidden') return;
      const t = el.innerText || el.textContent || '';
      if (!/Attributes:/.test(t)) return;
      // 親 hierarchy で Tier 判別 (= Tier ボタン text 紐付け)
      out.push({ len: t.length, text: t });
    });
    return out;
  });

  console.log(`hidden divs with Attributes: ${dump.length}`);
  for (let i = 0; i < dump.length; i++) {
    const t = dump[i].text;
    // 「Tier N」 markup 探す (hidden DIV 自身に Tier 番号がどこかにあるか)
    // 試し: 「Cost: ... x M」 = M = Tier 別コスト数 = Tier 識別子 (T1=0/T2=10/T3=20/T4=30/T5=40/T6=50?)
    const costM = t.match(/x\s*(\d+)World level:/);
    const tier = costM ? (Number(costM[1]) / 10 + 1) : null;
    // Attributes: section parse
    const attrM = t.match(/Attributes:([\s\S]+?)(?:copyright|$)/);
    const attrs = attrM ? attrM[1] : '';
    // 全 stat × WL 抽出
    const reAll = /([A-Z][A-Za-z\s]+?)\s*\(world level:\s*(\d+)\):([\d.]+)/g;
    const byStat = {};
    let m;
    while ((m = reAll.exec(attrs)) !== null) {
      const stat = m[1].trim();
      const wl = Number(m[2]);
      const v = parseFloat(m[3]);
      (byStat[stat] = byStat[stat] || {})[wl] = v;
    }
    console.log(`\n--- DIV ${i} (len=${dump[i].len}, tier_guess=${tier}) ---`);
    for (const [stat, vals] of Object.entries(byStat)) {
      const wls = Object.keys(vals).sort((a,b)=>+a-+b);
      const sample = wls.slice(0, 8).map(wl => `WL${wl}=${vals[wl]}`).join(' ');
      console.log(`  ${stat}: ${wls.length} WLs (${sample}...)`);
    }
  }
  await browser.close();
})();
