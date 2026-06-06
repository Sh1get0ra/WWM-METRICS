#!/usr/bin/env node
// S2-g VRT fail 原因 probe: anlz title/subtitle + bamboo + seal の computed style dump
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const URL = process.env.VRT_URL || 'http://localhost:8000/';
const THEME = process.argv[2] || 'light';
const FIXTURE_PATH = path.join(process.cwd(), '.vrt', 'fixture.json');
const fixture = fs.existsSync(FIXTURE_PATH) ? JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8')) : null;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'load' });
  await page.evaluate((args) => {
    if (args.fixture) for (const [k, v] of Object.entries(args.fixture)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    localStorage.setItem('wwm_theme', args.theme);
  }, { fixture, theme: THEME });
  await page.reload({ waitUntil: 'load' });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);

  const out = await page.evaluate(() => {
    const res = {};
    const probe = (label, sel, props) => {
      const el = document.querySelector(sel);
      if (!el) { res[label] = 'NOT FOUND'; return; }
      const cs = getComputedStyle(el);
      res[label] = Object.fromEntries(props.map(p => [p, cs.getPropertyValue(p)]));
    };
    probe('anlz-title', '.wwm-anlz .wwm-anlz-title', ['color', 'text-shadow', 'font-size']);
    probe('anlz-subtitle', '.wwm-anlz .wwm-anlz-subtitle', ['color', 'opacity']);
    probe('bamboo-path', '.wwm-anlz-bamboo svg path', ['fill']);
    probe('seal', '.seal', ['box-shadow']);
    probe('ink-stroke', '.hero-wuxia .ink-stroke path', ['stroke']);
    probe('luopan-tick', '.hero-wuxia .luopan-ticks line', ['stroke', 'stroke-opacity']);
    const root = getComputedStyle(document.documentElement);
    for (const t of ['--c-anlz-subtitle-fg', '--c-anlz-subtitle-opacity', '--c-anlz-title-fg-n2', '--brown-5', '--gold-deep']) {
      res['token ' + t] = root.getPropertyValue(t) || '(empty)';
    }
    return res;
  });
  console.log(`=== theme: ${THEME}`);
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();
