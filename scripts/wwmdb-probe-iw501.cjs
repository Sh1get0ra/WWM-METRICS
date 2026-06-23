#!/usr/bin/env node
// wdb 心法 501 detail を Tier 1-6 取得 → ツール 501 と比較するため
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ locale: 'en-US' })).newPage();
  await page.goto('https://wwmdb.vlt.fyi/inner-ways/501', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const results = {};
  for (let t = 1; t <= 6; t++) {
    try {
      await page.locator(`button:has-text("Tier ${t}")`).first().click({ timeout: 3000 });
      await page.waitForTimeout(400);
      // Tier 内容 = "Passive skill:" の直前まで or "Cost:" / "World level:" 前 まで
      const text = await page.evaluate(() => document.body.innerText);
      // 「Tier N」 button 群末尾の後ろ、 「Passive skill:」 前
      const m = text.match(/Tier 6\s*\n([\s\S]*?)(?:Passive skill:|Cost:|World level:|copyright)/i);
      results[t] = m ? m[1].trim() : '(no match)';
    } catch (e) {
      results[t] = `ERR: ${e.message.slice(0, 80)}`;
    }
  }
  for (const [k, v] of Object.entries(results)) {
    console.log(`\n=== wdb Tier ${k} ===\n${v.slice(0, 500)}`);
  }
  await browser.close();
})();
