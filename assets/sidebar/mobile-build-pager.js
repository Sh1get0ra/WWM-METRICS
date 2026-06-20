// ── WWM-METRICS Sidebar / Mobile 武備 ページャー化 (2026-06-20) ──
// mobile-mode (≤600px) のみで動作。 PC では完全 no-op。
// 22 slot 縦積み → 2軸 scroll-snap ページャー (装備3p / 心法1p / 奇術2p)。
// 設計 = docs/superpowers/specs/2026-06-20-mobile-build-pager-design.md
// 罠予防 = [[mobile-css-isolation-policy]] / 既存 slot DOM appendChild move (innerHTML 書換禁止)。
(function () {
  'use strict';
  const NS = (window.WWMSidebar = window.WWMSidebar || {});

  let enabled = false;
  let vscrollEl = null;
  let hdotsEl = null;
  let vcatEl = null;
  let catNameEl = null;
  let pageNameEl = null;

  function enable() {
    if (enabled) return;
    enabled = true;
    reflow();
  }

  function disable() {
    if (!enabled) return;
    enabled = false;
    teardown();
  }

  function reflow() {
    if (!enabled) return;
    // Task 2 以降で実装
  }

  function teardown() {
    // Task 2 以降で実装
  }

  function syncIndicators() {
    // Task 6 で実装
  }

  NS.mobileBuildPager = { enable, disable, reflow, syncIndicators };
})();
