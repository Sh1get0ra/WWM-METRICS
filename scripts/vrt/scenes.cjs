// VRT scene 定義
// viewport × theme × scene の組合せ で全 snapshot 撮影。
//
// scene 構造:
//   name          — file 名 prefix
//   setup(page, ctx) — ctx = { viewport, theme, isMobile }
//   fullPage      — true: 全 page (default) / false: viewport のみ (overlay 系)
//   skip(ctx)     — true 返すと撮影 skip (viewport 限定 scene 用)
//
// mobile 注意: anlz tabs は #wwmMobileAnlzOverlay 内 (hidden 初期) =
//             #wwmMobileAnlzBtn click で開いてから tab 切替

const VIEWPORTS = [
  { name: 'desktop',  width: 1920, height: 1080 },
  // tablet (768) は本番未考慮 = TODO #14 Mobile responsive breakpoint 統一 (640/768/1024) 着手時 復活
  { name: 'mobile',    width: 380, height: 800 },
  { name: 'mobile-xs', width: 320, height: 700 }
];

const THEMES = ['dark', 'light'];

// mobile anlz overlay 開く (開済なら何もしない)
async function openMobileAnlz(page) {
  const overlay = page.locator('#wwmMobileAnlzOverlay');
  if (await overlay.isVisible().catch(() => false)) return;
  await page.click('#wwmMobileAnlzBtn');
  await page.waitForSelector('#wwmMobileAnlzOverlay:not([hidden])', { timeout: 5000 });
  await page.waitForTimeout(400);
}

// mobile anlz overlay 閉じる (modal scene 前の cleanup)
async function closeMobileAnlz(page) {
  const close = page.locator('#wwmMobileAnlzOverlayClose');
  if (await close.isVisible().catch(() => false)) {
    await close.click();
    await page.waitForTimeout(300);
  }
}

// anlz tab 切替 (desktop = 直接 / mobile = overlay 開いてから)
async function gotoAnlzTab(page, ctx, tab) {
  if (ctx.isMobile) await openMobileAnlz(page);
  await page.click(`[data-analysis-tab="${tab}"]`);
  await page.waitForTimeout(300);
}

// modal scene 前の cleanup: 開いてる modal/overlay 全部閉じる
async function resetModals(page, ctx) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  if (ctx.isMobile) await closeMobileAnlz(page);
}

const SCENES = [
  {
    // mobile 専用: top page (overlay 閉) — hero/gear/xinfa layout
    name: 'main-top',
    skip: (ctx) => !ctx.isMobile,  // desktop は anlz-opt が全 page 撮影で兼ねる
    setup: async () => {}
  },
  {
    // hero close-up — donut % / 武格指数 等 小領域の色/文字変化は fullPage の
    // diff threshold (0.1%) に埋もれる (実例: #dmgPhysVal light色 regression 見逃し
    // 2026-06-05) → element 限定撮影で感度確保
    name: 'hero-closeup',
    element: '.hero-wuxia',
    setup: async (page, ctx) => {
      await resetModals(page, ctx);
    }
  },
  {
    name: 'anlz-opt',
    // mobile overlay = position:fixed = fullPage 撮影と相性悪 → viewport のみ
    fullPage: (ctx) => !ctx.isMobile,
    setup: async (page, ctx) => {
      await gotoAnlzTab(page, ctx, 'opt');
    }
  },
  {
    name: 'anlz-rank',
    fullPage: (ctx) => !ctx.isMobile,
    setup: async (page, ctx) => {
      await gotoAnlzTab(page, ctx, 'rank');
    }
  },
  {
    name: 'anlz-history',
    fullPage: (ctx) => !ctx.isMobile,
    setup: async (page, ctx) => {
      await gotoAnlzTab(page, ctx, 'history');
    }
  },

  // ── modal 系 (styles-modals.css 206 !important = Tier 1 主戦場) ──
  // modal = fixed/center = viewport 撮影で十分 → fullPage: false 統一
  {
    name: 'modal-gear-edit',   // 武具対照 (装備 slot 1 = 武器)
    fullPage: false,
    setup: async (page, ctx) => {
      await resetModals(page, ctx);
      await page.click('.wwm-equip-slot[data-slot="1"]');
      await page.waitForTimeout(500);
    }
  },
  {
    name: 'modal-xinfa-edit',  // 心法対照 (slot 0)
    fullPage: false,
    setup: async (page, ctx) => {
      await resetModals(page, ctx);
      await page.click('.wwm-xinfa-slot[data-xinfa-slot="0"]');
      await page.waitForTimeout(500);
    }
  },
  {
    name: 'modal-arsenal-edit', // 武庫対照
    fullPage: false,
    setup: async (page, ctx) => {
      await resetModals(page, ctx);
      await page.click('[data-arsenal-slot]');
      await page.waitForTimeout(500);
    }
  },
  {
    name: 'modal-note',        // NOTE (仕様 + changelog)
    fullPage: false,
    setup: async (page, ctx) => {
      await resetModals(page, ctx);
      await page.evaluate(() => window.WWMChangelog?.showAll?.());
      await page.waitForTimeout(500);
    }
  },
  {
    name: 'modal-import-setup', // IMPORT setup wizard
    fullPage: false,
    setup: async (page, ctx) => {
      await resetModals(page, ctx);
      await page.evaluate(() => window.WWMImport?.openSetup?.());
      await page.waitForTimeout(500);
    }
  }
];

module.exports = { VIEWPORTS, THEMES, SCENES };
