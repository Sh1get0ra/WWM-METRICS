// WWMetrics 単一 entry (vite 移行 P5、 2026-06-22)
// index.html L867-908 の 32 script 列挙順 = 依存順を そのまま import 文で再現。
// 各 module は副作用 (window.WWM* expose) のみで連結、 named export は helpers のみ。
// 順序入替 = 起動破壊 = 絶対やらない。

// dev mode SW 残骸自動除去 (2026-06-25): 過去 build/preview で登録された SW が
// dev 中も intercept = 古い module cache 配信 = リロード→ranking.js:53 旧 stack クラッシュ
// (ハードリロードでのみ消える既知 [[sw-burnin-stale-after-vite-migration]] パターン)。
// 1 回走れば SW + 全 caches purge → reload で恒久解消。
if (import.meta.env.DEV && typeof navigator !== 'undefined') {
  (async () => {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        if (regs.length) {
          for (const r of regs) await r.unregister();
          if (window.caches) {
            const keys = await caches.keys();
            for (const k of keys) await caches.delete(k);
          }
          console.warn('[WWM dev] stale SW + caches purged → reloading once');
          location.reload();
        }
      }
    } catch(_) {}
  })();
}

// ── CSS (vite が hash 化 + bundle) ─────────────────────────────
import '../assets/styles/tokens.css';
import '../assets/styles/animations.css';
import '../assets/styles/base.css';
import '../assets/styles/share.css';
import '../assets/styles/hero.css';
import '../assets/styles/sidebar.css';
import '../assets/styles/layout.css';
import '../assets/styles/gear.css';
import '../assets/styles/xinfa.css';
import '../assets/styles/anlz.css';
import '../assets/styles/mobile.css';
import '../assets/styles/workspace.css';
import '../assets/styles/mobile-v2.css';
import '../assets/styles/modals.css';
import '../assets/styles/import-fab.css';
import '../assets/styles/responsive-globals.css';
import '../assets/styles/obs.css';
import '../assets/styles/tutorial.css';

// ── helpers (6 + i18n 後置 = 旧 index.html L867-875 順) ────────
import './helpers/dom.js';
import './helpers/storage.js';
import './helpers/format.js';
import './helpers/fetch.js';
import './helpers/constants.js';
import './helpers/state.js';

// ── core (data-store/i18n/helpers-i18n/calc/app/kaisho/export/stats) ─
import './core/data-store.js';
import './core/i18n.js';
import './helpers/i18n.js';
import './core/calc.js';
import './core/app.js';
import './core/kaisho-paths.js';
import './core/export.js';
import './core/stats.js';

// ── sidebar 群 (旧 L881-902 順、 anlz-popout が anlz の直後に挟まる) ─
import './sidebar/modal-helpers.js';
import './sidebar/affix-utils.js';
import './sidebar/ocr.js';
import './sidebar/icon-resolvers.js';
import './sidebar/anlz.js';
import './anlz-popout.js';
import './sidebar/diag.js';
import './sidebar/opt.js';
import './sidebar/share.js';
import './sidebar/icon-select.js';
import './sidebar/gear.js';
import './sidebar/xinfa.js';
import './sidebar/qishu.js';
import './sidebar/mobile-build-pager.js';
import './sidebar/import-fab.js';
import './sidebar/welcome-banner.js';
import './sidebar/arsenal.js';
import './sidebar/unknown.js';
import './sidebar/history.js';
import './sidebar/ranking.js';
import './sidebar/hero.js';
import './sidebar/virtual.js';

// ── 集約 sidebar.js (sidebar 群全件 init 後に来る必要あり) ───────
import './sidebar/index.js';

// ── workspace 系 (sidebar 群完了後、 hero.setMode 等参照 = workspace 必須順) ──
import './workspace.js';
import './tutorial.js';
import './import.js';
