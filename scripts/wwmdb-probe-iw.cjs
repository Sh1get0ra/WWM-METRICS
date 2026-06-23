#!/usr/bin/env node
// wdb 心法 detail page Tier 切替メカニズム探査 (601 例)
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ locale: 'en-US' });
  const page = await ctx.newPage();
  await page.goto('https://wwmdb.vlt.fyi/inner-ways/601', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const out = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('button, a, [role="tab"]')]
      .filter(el => /TIER\s*\d/i.test(el.textContent || ''))
      .map(el => ({ tag: el.tagName, role: el.getAttribute('role'), text: el.textContent.trim().slice(0, 40) }));
    return { tabs, textLen: document.body.innerText.length };
  });
  console.log('TABS found:', out.tabs.length);
  console.log(JSON.stringify(out.tabs, null, 2));

  const tierResults = {};
  for (let t = 1; t <= 6; t++) {
    try {
      const loc = page.locator(`button:has-text("TIER ${t}"), a:has-text("TIER ${t}")`).first();
      await loc.click({ timeout: 3000 });
      await page.waitForTimeout(500);
      const text = await page.evaluate(() => document.body.innerText);
      // Tier 内容 = ボタン群の下、 「Cost:」 / 「Passive skill:」 前
      const m = text.match(/TIER\s*6\n([\s\S]*?)(?=Passive skill:|Cost:|World level:|copyright)/i);
      tierResults[t] = m ? m[1].trim().slice(0, 400) : text.slice(text.search(/TIER 6\n/i), text.search(/Passive skill:/i)).slice(0, 400);
    } catch (e) {
      tierResults[t] = `ERR: ${e.message.slice(0, 80)}`;
    }
  }
  console.log('\n=== Per-Tier click result ===');
  for (const [k, v] of Object.entries(tierResults)) {
    console.log(`\n--- TIER ${k} ---\n${v}`);
  }

  await browser.close();
})();
