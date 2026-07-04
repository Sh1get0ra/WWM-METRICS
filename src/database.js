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

  function open() {
    var app = document.getElementById('wwmApp');
    if (!app) return;
    app.setAttribute('data-mode', 'database');
    var dbRoot = document.getElementById('wwmDatabase');
    if (dbRoot) dbRoot.hidden = false;
    isOpen = true;
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
    try { localStorage.setItem(MODE_KEY, '0'); } catch (e) {}
  }

  var PANELS = { gear: 'dbGear', xinfa: 'dbXinfa' };
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
  }

  document.querySelectorAll('[data-db-tab]').forEach(function (t) {
    t.addEventListener('click', function () { activateTab(t.dataset.dbTab); });
  });

  window.WWMSidebar = window.WWMSidebar || {};
  window.WWMSidebar.database = { toggle: toggle, open: open, close: close, isOpen: function () { return isOpen; } };
})();

export {};
