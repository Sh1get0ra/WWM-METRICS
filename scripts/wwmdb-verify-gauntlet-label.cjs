#!/usr/bin/env node
// gauntletDmg label 解決確認 (dev server localhost:8000)
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  await page.goto('http://localhost:8000/?cb=' + Date.now(), { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const r = await page.evaluate(async () => {
    if (window.WWM_DS && window.WWM_DS.ready) await window.WWM_DS.ready();
    const out = {};
    if (window.WWM_DS) {
      out.ja  = window.WWM_DS.name('stat', 'gauntletDmg', 'ja');
      out.en  = window.WWM_DS.name('stat', 'gauntletDmg', 'en');
      out.zh  = window.WWM_DS.name('stat', 'gauntletDmg', 'zh');
      out.ko  = window.WWM_DS.name('stat', 'gauntletDmg', 'ko');
      out.vi  = window.WWM_DS.name('stat', 'gauntletDmg', 'vi');
    }
    out.swordDmg_ja = window.WWM_DS?.name('stat', 'swordDmg', 'ja');
    return out;
  });
  console.log('gauntletDmg label per lang:', JSON.stringify(r, null, 2));
  await browser.close();
})();
