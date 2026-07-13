// ── WWMetrics Sidebar / WELCOME BANNER (2026-06-22) ──
// 完全未 import (baseline 無 + import 履歴も無) 時のみ表示。
// 既存 IMPORT_STORAGE_KEY (wwm_last_import_v1) で履歴判定。
// 永久 dismiss = ユーザー × で閉じれば以降出ない (兄貴指示 2026-06-22)。
// 設計経緯: FAB 一択化に伴い「初回ユーザーへの FAB 認知」 を banner で担う。
(function () {
  'use strict';
  const NS = (window.WWMSidebar = window.WWMSidebar || {});

  const DISMISS_KEY = 'wwm_welcome_banner_dismissed_v1';
  const IMPORT_STORAGE_KEY = 'wwm_last_import_v1';

  function _isDismissed() {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch (e) { return false; }
  }
  function _setDismissed() {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch (e) {}
  }

  function _isFirstTime() {
    // baseline 無 + import 履歴 無 = 完全未 import
    const hasBaseline = !!(window.WWMState && window.WWMState.baseline);
    if (hasBaseline) return false;
    let hasHistory = false;
    try { hasHistory = !!localStorage.getItem(IMPORT_STORAGE_KEY); } catch (e) {}
    return !hasHistory;
  }

  // mobile: banner は absolute 配置でコンテンツ上に重ねているため (2026-07-13)、
  // panel 側 (padding-top) が banner の実高さぶん避ける必要がある。固定px値だと
  // banner 非表示時に無駄な空白が残ってしまう (兄貴指摘「上下の余白なに？」) ため、
  // 実測高さを CSS 変数で都度反映する
  function _syncBannerHeight() {
    const el = document.getElementById('wwmWelcomeBanner');
    const h = (el && el.style.display !== 'none') ? el.getBoundingClientRect().height : 0;
    document.documentElement.style.setProperty('--wwm-banner-h', h + 'px');
  }

  function show() {
    // OBS view (`?view=sidebar`) は表示専用 = banner 非表示 (配信邪魔回避)
    if (document.documentElement.classList.contains('wwm-view-sidebar')) return;
    const el = document.getElementById('wwmWelcomeBanner');
    if (!el) return;
    if (_isDismissed()) return;
    if (!_isFirstTime()) return;
    el.style.display = '';
    requestAnimationFrame(_syncBannerHeight);
    const close = el.querySelector('.wwm-welcome-banner-close');
    if (close && !close._wired) {
      close._wired = true;
      close.addEventListener('click', () => {
        _setDismissed();
        hide();
      });
    }
  }
  function hide() {
    const el = document.getElementById('wwmWelcomeBanner');
    if (el) el.style.display = 'none';
    _syncBannerHeight();
  }
  function init() {
    // WWMState.baseline / IMPORT_STORAGE_KEY は app.js / import.js 起動後でないと
    // 正しい状態にならないため、 起動 sequence 完了を待ってから show 発火 (簡素 setTimeout)
    const launch = () => setTimeout(show, 1500);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', launch, { once: true });
    } else {
      launch();
    }
  }

  NS.welcomeBanner = { show, hide, init };
  init();
})();

// vite移行 P2: ESM 副作用 module 化 (window expose は IIFE 内 keep)
export {};
