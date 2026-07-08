// ── WWMetrics データベース閲覧画面 (2026-07-04) ──
// 装備/心法マスタの閲覧専用画面。header以下 (.hero + workspace) を丸ごと非表示にし、
// DB専用rootを表示する「別モード」切替。既存workspace.jsのactivate(ws)と同型のパターン。
(function () {
  'use strict';
  var MODE_KEY = 'wwm_db_mode_v1';
  var TAB_KEY = 'wwm_db_tab_v1';
  var isOpen = false;

  function toggle() {
    if (isOpen) close(); else open();
  }

  // header内DBボタン = DB画面表示中は「計算機に戻る」ボタンへ見た目を切替 (2026-07-06 兄貴指摘: 同アイコンで開閉両方は紛らわしい)
  function _updateBtnState(dbMode) {
    var btn = document.getElementById('wwmDatabaseBtn');
    if (!btn) return;
    var use = btn.querySelector('svg use');
    var srOnly = btn.querySelector('.sr-only');
    var iconHref = dbMode ? 'assets/icons/calculator.svg#calculator' : 'assets/icons/database.svg#database';
    var titleKey = dbMode ? 'tipIconBackToCalc' : 'tipIconDatabase';
    var srKey = dbMode ? 'backToCalcBtn' : 'databaseBtn';
    if (use) use.setAttribute('href', iconHref);
    btn.setAttribute('data-i18n-title', titleKey);
    btn.setAttribute('data-i18n-aria', titleKey);
    var titleText = (window.T && window.T[titleKey] !== undefined) ? window.T[titleKey] : titleKey;
    btn.setAttribute('title', titleText);
    btn.setAttribute('aria-label', titleText);
    if (srOnly) {
      srOnly.setAttribute('data-i18n', srKey);
      srOnly.textContent = (window.T && window.T[srKey] !== undefined) ? window.T[srKey] : srKey;
    }
  }

  function open() {
    var app = document.getElementById('wwmApp');
    if (!app) return;
    app.setAttribute('data-mode', 'database');
    var dbRoot = document.getElementById('wwmDatabase');
    if (dbRoot) dbRoot.hidden = false;
    isOpen = true;
    _updateBtnState(true);
    try { localStorage.setItem(MODE_KEY, '1'); } catch (e) {}
    var saved = null;
    try { saved = localStorage.getItem(TAB_KEY); } catch (e) {}
    activateTab(saved === 'xinfa' ? 'xinfa' : 'gear');
  }

  function close() {
    var app = document.getElementById('wwmApp');
    if (!app) return;
    app.removeAttribute('data-mode');
    var dbRoot = document.getElementById('wwmDatabase');
    if (dbRoot) dbRoot.hidden = true;
    isOpen = false;
    _updateBtnState(false);
    try { localStorage.setItem(MODE_KEY, '0'); } catch (e) {}
  }

  var PANELS = { gear: 'dbGear', xinfa: 'dbXinfa', kongfu: 'dbKongfu' };
  function activateTab(tab) {
    if (!PANELS[tab]) return;
    Object.entries(PANELS).forEach(function (kv) {
      var el = document.getElementById(kv[1]);
      if (el) { el.hidden = kv[0] !== tab; el.classList.toggle('active', kv[0] === tab); }
    });
    document.querySelectorAll('[data-db-tab]').forEach(function (t) {
      t.setAttribute('aria-selected', String(t.dataset.dbTab === tab));
    });
    try { localStorage.setItem(TAB_KEY, tab); } catch (e) {}
    if (tab === 'gear' && window.WWMSidebar && window.WWMSidebar.databaseGear) {
      window.WWMSidebar.databaseGear.render();
    }
    if (tab === 'xinfa' && window.WWMSidebar && window.WWMSidebar.databaseXinfa) {
      window.WWMSidebar.databaseXinfa.render();
    }
    if (tab === 'kongfu' && window.WWMSidebar && window.WWMSidebar.databaseKongfu) {
      window.WWMSidebar.databaseKongfu.render();
    }
  }

  document.querySelectorAll('[data-db-tab]').forEach(function (t) {
    t.addEventListener('click', function () { activateTab(t.dataset.dbTab); });
  });

  window.WWMSidebar = window.WWMSidebar || {};
  window.WWMSidebar.database = { toggle: toggle, open: open, close: close, isOpen: function () { return isOpen; } };
})();

export {};
