// ── WWMetrics データベース画面 - 武術タブ (2026-07-08 初版) ──
// 左: 18武学一覧 (名前検索)。右: 選択武学の詳細
// (path/weaponType バッジ + description + slot縦積み S1→S3→S2→S5→S4→S6)。
// キャラ非依存の閲覧専用、心法タブと同型パターン。
// Task 5 = 骨格のみ (プレースホルダ表示)。Task 6 = 左一覧 (検索 + icon list) 実装。右詳細は Task 7-9 で実装。
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

  function _matchesSearch(id, lang) {
    if (!_searchQuery) return true;
    return _kfName(id, lang).toLowerCase().indexOf(_searchQuery.toLowerCase()) !== -1;
  }

  function _renderList() {
    const lang = _curLang();
    const ids = _allIds().filter(id => _matchesSearch(id, lang));
    if (!ids.length) {
      return `<p class="wwm-db-empty">${_esc((window.T && window.T.dbKongfuEmpty) || '該当する武術がありません')}</p>`;
    }
    return ids.map(id => {
      const sel = id === _selectedId ? 'true' : 'false';
      const kf = _kongfuMap()[id];
      const iconUrl = window.WWM_KONGFU_ICONS && window.WWM_KONGFU_ICONS[id] && window.WWM_KONGFU_ICONS[id].icon_url;
      const iconHtml = iconUrl
        ? `<img class="wwm-db-kongfu-item-icon" data-path="${_esc(kf && kf.path || '')}" src="${iconUrl}" alt="" loading="lazy">`
        : '<span class="wwm-db-kongfu-item-icon wwm-db-kongfu-item-icon-empty"></span>';
      return `<button type="button" class="wwm-db-kongfu-item" data-db-kongfu-id="${_esc(id)}" aria-selected="${sel}">${iconHtml}<span class="wwm-db-kongfu-item-name">${_esc(_kfName(id, lang))}</span></button>`;
    }).join('');
  }

  function _isMobile() { return window.matchMedia && window.matchMedia('(max-width: 600px)').matches; }

  function _refreshList() {
    const root = document.getElementById('dbKongfu');
    if (!root) return;
    const listEl = root.querySelector('[data-db-kongfu-list]');
    if (!listEl) return;
    listEl.innerHTML = _renderList();
    listEl.querySelectorAll('[data-db-kongfu-id]').forEach(btn => {
      btn.addEventListener('click', () => selectId(btn.dataset.dbKongfuId));
    });
  }

  function selectId(id) {
    _selectedId = id;
    const root = document.getElementById('dbKongfu');
    if (!root) return;
    root.querySelectorAll('[data-db-kongfu-id]').forEach(btn => {
      btn.setAttribute('aria-selected', String(btn.dataset.dbKongfuId === id));
    });
    const bodyEl = root.querySelector('[data-db-kongfu-detail-body]');
    if (bodyEl) bodyEl.innerHTML = _renderDetail(id);  // Task 7 で本実装
    if (_isMobile()) {
      const r = root.querySelector('[data-db-kongfu-root]');
      if (r) r.setAttribute('data-mobile-view', 'detail');
    }
  }

  function _attachControls(root) {
    const searchEl = root.querySelector('[data-db-kongfu-search]');
    if (searchEl) searchEl.addEventListener('input', () => { _searchQuery = searchEl.value; _refreshList(); });
    const backBtn = root.querySelector('[data-db-kongfu-back]');
    if (backBtn) backBtn.addEventListener('click', () => {
      const r = root.querySelector('[data-db-kongfu-root]');
      if (r) r.removeAttribute('data-mobile-view');
    });
  }

  function _renderDetail(id) {
    // Task 7 で本実装、今は placeholder
    return `<div>${_esc(_kfName(id, _curLang()))} 詳細 (実装中)</div>`;
  }

  function render() {
    const root = document.getElementById('dbKongfu');
    if (!root) return;
    root.innerHTML = `
      <div class="wwm-db-kongfu" data-db-kongfu-root>
        <div class="wwm-db-kongfu-list-pane">
          <div class="wwm-db-kongfu-controls">
            <input type="text" class="wwm-db-kongfu-search" data-db-kongfu-search value="${_esc(_searchQuery)}"
              placeholder="${_esc((window.T && window.T.dbKongfuSearchPlaceholder) || '武学名で検索')}"
              aria-label="${_esc((window.T && window.T.dbKongfuSearchPlaceholder) || '武学名で検索')}">
          </div>
          <div class="wwm-db-kongfu-list-inner" data-db-kongfu-list></div>
        </div>
        <div class="wwm-db-kongfu-detail" data-db-kongfu-detail>
          <button type="button" class="wwm-db-kongfu-back" data-db-kongfu-back>${_esc((window.T && window.T.dbKongfuBackToList) || '← 一覧へ戻る')}</button>
          <div data-db-kongfu-detail-body></div>
        </div>
      </div>
    `;
    _attachControls(root);
    _refreshList();
    const ids = _allIds();
    if (!_selectedId || ids.indexOf(_selectedId) === -1) _selectedId = ids[0] || null;
    if (_selectedId) selectId(_selectedId);
    const rootEl = root.querySelector('[data-db-kongfu-root]');
    if (rootEl) rootEl.removeAttribute('data-mobile-view');
  }

  window.WWMSidebar = window.WWMSidebar || {};
  window.WWMSidebar.databaseKongfu = { render, selectId };
})();

export {};
