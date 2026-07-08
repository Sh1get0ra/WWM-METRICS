// ── WWMetrics データベース画面 - 武術タブ (2026-07-08 初版) ──
// 左: 18武学一覧 (名前検索)。右: 選択武学の詳細
// (path/weaponType バッジ + description + slot縦積み S1→S3→S2→S5→S4→S6)。
// キャラ非依存の閲覧専用、心法タブと同型パターン。
// Task 5 = 骨格のみ (プレースホルダ表示)。本描画は Task 6-9 で実装。
(function () {
  'use strict';
  const _ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => _ESC_MAP[c]); }
  function _curLang() { return (window.currentLang) || 'ja'; }

  let _searchQuery = '';
  let _selectedId = null;

  function _kongfuMap() { return window.WWM_KONGFU || {}; }
  function _passivesMap() { return window.WWM_KONGFU_PASSIVES || {}; }
  function _ladders() { return window.WWM_KONGFU_LADDERS || {}; }
  function _allIds() { return Object.keys(_kongfuMap()).filter(k => /^\d+$/.test(k)); }

  function _kfName(id, lang) {
    const n = window.WWM_DS.name('kongfu', id, lang);
    return n.indexOf('[kongfu:') === 0 ? `ID ${id}` : n;
  }

  function render() {
    const root = document.getElementById('dbKongfu');
    if (!root) return;
    // 骨格のみ、次タスクで本実装
    root.innerHTML = `<div class="wwm-db-kongfu-placeholder">武術タブ (実装中)</div>`;
  }

  window.WWMSidebar = window.WWMSidebar || {};
  window.WWMSidebar.databaseKongfu = { render };
})();

export {};
