#!/usr/bin/env node
// OBS view (?view=sidebar) 赤アクセントライン調査 probe
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = process.env.VRT_URL || 'http://localhost:8000/';

(async () => {
  const fixture = fs.existsSync('.vrt/fixture.json') ? JSON.parse(fs.readFileSync('.vrt/fixture.json', 'utf8')) : null;
  const browser = await chromium.launch();
  for (const theme of ['dark', 'light']) {
    const ctx = await browser.newContext({ viewport: { width: 480, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(BASE + '?view=sidebar', { waitUntil: 'load' });
    await page.evaluate((args) => {
      if (args.fixture) for (const [k, v] of Object.entries(args.fixture)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
      localStorage.setItem('wwm_theme', args.theme);
    }, { fixture, theme });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `.vrt/obs-probe-${theme}.png` });

    // 左縁 element 特定: x=0..6px 帯の elementFromPoint + 赤系 border/bg/outline を持つ element 列挙
    const info = await page.evaluate(() => {
      const out = { dataTheme: document.documentElement.getAttribute('data-theme'), htmlCls: document.documentElement.className, hits: [] };
      const els = document.querySelectorAll('*');
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const cs = getComputedStyle(el);
        const reds = [];
        const isRed = (v) => /rgba?\((1[6-9]\d|2\d\d),\s*([0-9]|[1-9]\d),\s*([0-9]|[1-9]\d)/.test(v) || /rgba?\(1[2-9]\d,\s*[0-6]?\d,\s*[0-6]?\d/.test(v);
        for (const p of ['border-left-color', 'border-left-width', 'outline-color', 'box-shadow', 'background-image', 'background-color']) {
          const v = cs.getPropertyValue(p);
          if (p === 'border-left-width' && parseFloat(v) > 0 && isRed(cs.getPropertyValue('border-left-color'))) reds.push('border-left ' + v + ' ' + cs.getPropertyValue('border-left-color'));
          else if (p !== 'border-left-width' && p !== 'border-left-color' && isRed(v)) reds.push(p + ': ' + v.slice(0, 80));
        }
        if (reds.length && r.left < 12) {
          out.hits.push({ tag: el.tagName, cls: String(el.className).slice(0, 60), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), reds });
        }
      }
      return out;
    });
    console.log(`=== ${theme}`, JSON.stringify(info, null, 1).slice(0, 3000));
    await ctx.close();
  }
  await browser.close();
})();
