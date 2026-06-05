#!/usr/bin/env node
// VRT snapshot 撮影 script
//
// 使い方:
//   1. 別 terminal で 'npm run dev' (vite, port 8000) 起動
//   2. .vrt/fixture.json 配置 (README 参照、 import 済 state localStorage dump)
//   3. npm run vrt:baseline  ← 基準 snapshot (Tier 1 着手前 等)
//   4. (Tier 1 改修)
//   5. npm run vrt:snap      ← current snapshot
//   6. npm run vrt:compare   ← baseline vs current diff
//
// env:
//   VRT_URL   = dev server URL (default http://localhost:8000/)
//   VRT_HOLD  = scene 切替後 wait ms (default 400)
//
// fixture.json:
//   { "wwm_last_import_v1": "...", "wwm_last_state_v1": "...", ... }
//   全 wwm_* localStorage key の string value map (DevTools で抽出)

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { VIEWPORTS, THEMES, SCENES } = require('./scenes.cjs');

const MODE = process.argv.includes('--baseline') ? 'baseline' : 'current';
const ROOT = path.join(process.cwd(), '.vrt', MODE);
const URL  = process.env.VRT_URL || 'http://localhost:8000/';
const HOLD = parseInt(process.env.VRT_HOLD || '400', 10);
const FIXTURE_PATH = path.join(process.cwd(), '.vrt', 'fixture.json');

let fixture = null;
if (fs.existsSync(FIXTURE_PATH)) {
  try {
    fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
    const keys = Object.keys(fixture);
    console.log(`[fixture] ${keys.length} key 読込: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? ', ...' : ''}`);
  } catch (e) {
    console.warn(`[WARN] fixture.json 読込失敗: ${e.message} — 空 state で撮影継続`);
    fixture = null;
  }
} else {
  console.warn(`[WARN] .vrt/fixture.json 未配置 — 空 state で撮影 (装備/心法 default)`);
  console.warn(`        実 build state で撮影するには README の fixture 抽出手順 参照`);
}

async function checkServer() {
  try {
    const res = await fetch(URL, { method: 'GET' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    console.error(`[ERROR] dev server 接続不可: ${URL}`);
    console.error(`        ${e.message}`);
    console.error(`        別 terminal で 'npm run dev' 起動後 再実行`);
    process.exit(1);
  }
}

(async () => {
  await checkServer();
  if (fs.existsSync(ROOT)) fs.rmSync(ROOT, { recursive: true });
  fs.mkdirSync(ROOT, { recursive: true });

  const browser = await chromium.launch();
  let total = 0;
  for (const vp of VIEWPORTS) {
    for (const theme of THEMES) {
      const c = { viewport: vp, theme, isMobile: vp.width < 768 };
      total += SCENES.filter(s => !(s.skip && s.skip(c))).length;
    }
  }
  let count = 0;
  const t0 = Date.now();

  for (const vp of VIEWPORTS) {
    for (const theme of THEMES) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
        reducedMotion: 'reduce'  // animation 揺らぎ抑制
      });
      const page = await ctx.newPage();

      // fixture + theme 事前 set → reload で反映
      await page.goto(URL, { waitUntil: 'load' });
      await page.evaluate((args) => {
        if (args.fixture) {
          for (const [k, v] of Object.entries(args.fixture)) {
            localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
          }
        }
        localStorage.setItem('wwm_theme', args.theme);
      }, { fixture, theme });
      await page.reload({ waitUntil: 'load' });
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

      // 装備最適化計算完了 wait (.wwm-opt-loading 消失 + WWMState.opt.best set)
      // 注: window.__WWM_OPT_BEST は Phase 2.7 で廃止済 = WWMState.opt.best が実体
      // 注: waitForFunction 第2引数 = arg、 第3引数 = options (timeout)
      const optTimeout = parseInt(process.env.VRT_OPT_TIMEOUT || '120000', 10);
      const t1 = Date.now();
      const optDone = await page.waitForFunction(() => {
        return !!(window.WWMState?.opt?.best) &&
               !document.querySelector('.wwm-opt-loading');
      }, null, { timeout: optTimeout }).then(() => true).catch(() => false);
      const optDt = ((Date.now() - t1) / 1000).toFixed(1);
      if (optDone) {
        console.log(`  [opt-wait] ${optDt}s ${vp.name}/${theme}`);
      } else {
        console.warn(`  [WARN] opt 計算未完了 (${optDt}s timeout) — 撮影継続`);
      }
      await page.waitForTimeout(HOLD * 2);

      const ctx2 = { viewport: vp, theme, isMobile: vp.width < 768 };
      for (const scene of SCENES) {
        if (scene.skip && scene.skip(ctx2)) continue;
        try {
          await scene.setup(page, ctx2);
        } catch (e) {
          console.warn(`[WARN] scene "${scene.name}" setup failed (${vp.name}/${theme}): ${e.message}`);
        }
        await page.waitForTimeout(HOLD);
        const fullPage = typeof scene.fullPage === 'function'
          ? scene.fullPage(ctx2)
          : (scene.fullPage !== false);
        const filename = `${scene.name}__${vp.name}__${theme}.png`;
        await page.screenshot({
          path: path.join(ROOT, filename),
          fullPage,
          animations: 'disabled'
        });
        count++;
        console.log(`[${String(count).padStart(2, ' ')}/${total}] ${filename}`);
      }

      await ctx.close();
    }
  }

  await browser.close();
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n[DONE] ${count} snapshots in ${dt}s → ${ROOT}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
