// ── WWMetrics データベース画面 - 心法タブ (2026-07-06 初版) ──
// 左: 52心法一覧 (名前検索 + T2/T5効果種別フィルタ)。右: 選択心法の詳細
// (tier0-6効果テキスト、T2はworldLv別数値を全部一覧表示、T5は効果値をそのまま表示)。
// キャラ非依存の閲覧専用のため、既存openXinfaEdit内の_effectsText(現在キャラのkongfu/tier進行度で
// warn iconを出し分ける)はそのまま流用せず、xinfa.js module scopeへ切り出した純粋な
// tierLabel/effectLabelTable/statTypeLabelTable/fmtEffect/normalizeTextのみ再利用する。
(function () {
  'use strict';
  const _ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => _ESC_MAP[c]); }
  function _curLang() { return (window.currentLang) || 'ja'; }

  const _RANK_LABEL_KEY = { gold: 'dbRankGold', purple: 'dbRankPurple', blue: 'dbRankBlue' };
  const _RANK_LABEL_JA = { gold: '金', purple: '紫', blue: '青' };
  function _rankLabel(rank) {
    const key = _RANK_LABEL_KEY[rank];
    return (key && window.T && window.T[key]) || _RANK_LABEL_JA[rank] || rank || '';
  }

  let _searchQuery = '';
  let _filterTag = 'all';
  let _selectedId = null;

  function _xinfaMap() { return window.WWM_XINFA || {}; }
  function _allIds() { return Object.keys(_xinfaMap()).filter(k => /^\d+$/.test(k)); }

  function _xName(id, lang) {
    const n = window.WWM_DS.name('xinfa', id, lang);
    return n.indexOf('[xinfa:') === 0 ? `ID ${id}` : n;
  }

  // ── フィルタタグ収集 (T2/T5の効果種別、xinfa.jsのeffectLabelTable/statTypeLabelTableを流用) ──
  function _tagsForId(id) {
    const xinfaNs = window.WWMSidebar.xinfa;
    const x = _xinfaMap()[id];
    const tags = new Set();
    if (!x || !x.attributeBuff || !xinfaNs) return tags;
    [2, 5].forEach(t => {
      const def = x.attributeBuff[`tier${t}`];
      if (!def) return;
      const effects = def.effects || {};
      const visible = Object.keys(effects).filter(k => k !== 'fixedScoreBonus');
      if (visible.length) {
        visible.forEach(k => {
          const eDef = xinfaNs.effectLabelTable[k];
          if (eDef && eDef.tkey) tags.add(eDef.tkey);
        });
      } else if (def.statType) {
        const stKey = xinfaNs.statTypeLabelTable[def.statType];
        if (stKey) tags.add(stKey);
      }
    });
    return tags;
  }

  function _tagLabel(tkey) { return (window.T && window.T[tkey]) || tkey; }

  function _collectAllTags() {
    const map = new Map();
    _allIds().forEach(id => {
      _tagsForId(id).forEach(tkey => { if (!map.has(tkey)) map.set(tkey, _tagLabel(tkey)); });
    });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }

  function _matchesFilter(id) {
    if (_filterTag === 'all') return true;
    return _tagsForId(id).has(_filterTag);
  }
  function _matchesSearch(id, lang) {
    if (!_searchQuery) return true;
    return _xName(id, lang).toLowerCase().indexOf(_searchQuery.toLowerCase()) !== -1;
  }

  function _renderList() {
    const lang = _curLang();
    const ids = _allIds().filter(id => _matchesSearch(id, lang) && _matchesFilter(id));
    if (!ids.length) {
      return `<p class="wwm-db-empty">${_esc((window.T && window.T.dbXinfaEmpty) || '該当する心法がありません')}</p>`;
    }
    return ids.map(id => {
      const sel = id === _selectedId ? 'true' : 'false';
      const x = _xinfaMap()[id];
      const iconUrl = window.WWM_XINFA_ICONS && window.WWM_XINFA_ICONS[id] && window.WWM_XINFA_ICONS[id].icon_url;
      const iconHtml = iconUrl
        ? `<img class="wwm-db-xinfa-item-icon" data-rank="${_esc(x && x.rank || '')}" src="${iconUrl}" alt="" loading="lazy">`
        : '<span class="wwm-db-xinfa-item-icon wwm-db-xinfa-item-icon-empty"></span>';
      return `<button type="button" class="wwm-db-xinfa-item" data-db-xinfa-id="${_esc(id)}" aria-selected="${sel}">${iconHtml}<span class="wwm-db-xinfa-item-name">${_esc(_xName(id, lang))}</span></button>`;
    }).join('');
  }

  // ── T2 worldLv別テーブル (data/xinfa_effects.json、effectId経由) ──
  function _renderWorldLvTable(effectId) {
    const master = window.WWM_XINFA_EFFECTS && window.WWM_XINFA_EFFECTS.effects && window.WWM_XINFA_EFFECTS.effects[effectId];
    const stats = master && master.stats;
    if (!stats) return '';
    const xinfaNs = window.WWMSidebar.xinfa;
    const wlSet = new Set();
    Object.values(stats).forEach(wlMap => Object.keys(wlMap).forEach(wl => wlSet.add(Number(wl))));
    const wlList = [...wlSet].sort((a, b) => a - b);
    const rows = Object.entries(stats).map(([sk, wlMap]) => {
      const eDef = xinfaNs.effectLabelTable[sk];
      const label = (eDef && window.T && window.T[eDef.tkey]) || sk;
      const isPct = eDef && eDef.pct;
      const cells = wlList.map(wl => {
        const v = wlMap[String(wl)];
        if (v == null) return '<td>-</td>';
        const txt = isPct ? `${(Math.abs(v) < 1 ? v * 100 : v).toFixed(1)}%` : String(v);
        return `<td>${_esc(txt)}</td>`;
      }).join('');
      return `<tr><th scope="row">${_esc(label)}</th>${cells}</tr>`;
    }).join('');
    const headCells = wlList.map(wl => `<th scope="col">${wl}</th>`).join('');
    return `
      <div class="wwm-db-xinfa-worldlv-wrap">
        <table class="wwm-db-xinfa-worldlv-table">
          <thead><tr><th scope="col">${_esc((window.T && window.T.dbXinfaWorldLvHead) || 'WorldLv')}</th>${headCells}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function _kongfuBadge(kfIds, lang) {
    if (!kfIds || !kfIds.length) return '';
    const names = kfIds.map(kfid => {
      const n = window.WWM_DS.name('kongfu', kfid, lang);
      return n.indexOf('[kongfu:') === 0 ? String(kfid) : n;
    }).join('、');
    const label = (window.T && window.T.dbXinfaKongfuRequired) || '要武術:';
    return `<span class="wwm-db-xinfa-kfreq">${_esc(label)} ${_esc(names)}</span>`;
  }

  function _renderTierRow(x, id, t, lang) {
    const xinfaNs = window.WWMSidebar.xinfa;
    const def = x.attributeBuff && x.attributeBuff[`tier${t}`];
    if (!def) {
      return `<div class="wwm-db-xinfa-tier-row wwm-tier-empty"><span class="wwm-cmp-tier-num">T${t}</span><span class="wwm-cmp-tier-eff wwm-tier-dash">—</span></div>`;
    }
    const isTwoFive = (t === 2 || t === 5);
    const effects = def.effects || {};
    const visibleEntries = Object.entries(effects).filter(([k]) => k !== 'fixedScoreBonus');
    const labelOv = def.labelOverride || null;
    let effStr;
    if (isTwoFive && visibleEntries.length) {
      effStr = visibleEntries.map(([k, v]) => {
        if (labelOv && labelOv[k]) {
          const ovLabel = labelOv[k][lang] || labelOv[k].ja || labelOv[k].en || k;
          const _def = xinfaNs.effectLabelTable[k];
          if (_def && _def.scoreCustom) return `${ovLabel} +${v || '?'}`;
          const isPct = _def && _def.pct;
          const valStr = isPct ? `${(Math.abs(v) < 1 ? v * 100 : v).toFixed(1)}%` : String(v);
          return `${ovLabel} +${valStr}`;
        }
        return xinfaNs.fmtEffect(k, v);
      }).join(', ');
    } else if (isTwoFive) {
      const stKey = def.statType && xinfaNs.statTypeLabelTable[def.statType];
      effStr = stKey ? ((window.T && window.T[stKey]) || def.statType) : xinfaNs.tierLabel(id, t, lang, def);
    } else {
      effStr = xinfaNs.tierLabel(id, t, lang, def);
    }
    const kfBadge = _kongfuBadge(def.kongfuRequired, lang);
    const wlTable = (t === 2 && def.effectId) ? _renderWorldLvTable(def.effectId) : '';
    return `
      <div class="wwm-db-xinfa-tier-row">
        <span class="wwm-cmp-tier-num">T${t}</span>
        <span class="wwm-cmp-tier-eff">${_esc(effStr)}</span>
        ${kfBadge}
      </div>
      ${wlTable}
    `;
  }

  function _renderDetail(id) {
    const lang = _curLang();
    const x = _xinfaMap()[id];
    if (!x) return `<p class="wwm-db-empty">${_esc((window.T && window.T.dbXinfaEmpty) || '心法が見つかりません')}</p>`;
    const iconUrl = window.WWM_XINFA_ICONS && window.WWM_XINFA_ICONS[id] && window.WWM_XINFA_ICONS[id].icon_url;
    const rank = x.rank;
    const rows = [0, 1, 2, 3, 4, 5, 6].map(t => _renderTierRow(x, id, t, lang)).join('');
    return `
      <div class="wwm-db-xinfa-header">
        ${iconUrl ? `<img class="wwm-db-xinfa-icon" src="${iconUrl}" alt="">` : ''}
        <h3 class="wwm-db-xinfa-name">${_esc(_xName(id, lang))}</h3>
        ${rank ? `<span class="wwm-db-xinfa-rank" data-rank="${_esc(rank)}">${_esc(_rankLabel(rank))}</span>` : ''}
      </div>
      <div class="wwm-db-xinfa-tiers">${rows}</div>
    `;
  }

  function _isMobile() { return window.matchMedia && window.matchMedia('(max-width: 600px)').matches; }

  function _refreshList() {
    const root = document.getElementById('dbXinfa');
    if (!root) return;
    const listEl = root.querySelector('[data-db-xinfa-list]');
    if (!listEl) return;
    listEl.innerHTML = _renderList();
    listEl.querySelectorAll('[data-db-xinfa-id]').forEach(btn => {
      btn.addEventListener('click', () => selectId(btn.dataset.dbXinfaId));
    });
  }

  function selectId(id) {
    _selectedId = id;
    const root = document.getElementById('dbXinfa');
    if (!root) return;
    root.querySelectorAll('[data-db-xinfa-id]').forEach(btn => {
      btn.setAttribute('aria-selected', String(btn.dataset.dbXinfaId === id));
    });
    const bodyEl = root.querySelector('[data-db-xinfa-detail-body]');
    if (bodyEl) bodyEl.innerHTML = _renderDetail(id);
    if (_isMobile()) {
      const r = root.querySelector('[data-db-xinfa-root]');
      if (r) r.setAttribute('data-mobile-view', 'detail');
    }
  }

  function _attachControls(root) {
    const searchEl = root.querySelector('[data-db-xinfa-search]');
    const filterEl = root.querySelector('[data-db-xinfa-filter]');
    if (searchEl) searchEl.addEventListener('input', () => { _searchQuery = searchEl.value; _refreshList(); });
    if (filterEl) filterEl.addEventListener('change', () => { _filterTag = filterEl.value; _refreshList(); });
    const backBtn = root.querySelector('[data-db-xinfa-back]');
    if (backBtn) backBtn.addEventListener('click', () => {
      const r = root.querySelector('[data-db-xinfa-root]');
      if (r) r.removeAttribute('data-mobile-view');
    });
  }

  function render() {
    const root = document.getElementById('dbXinfa');
    if (!root) return;
    const tagOpts = _collectAllTags().map(([tkey, label]) =>
      `<option value="${_esc(tkey)}" ${_filterTag === tkey ? 'selected' : ''}>${_esc(label)}</option>`
    ).join('');
    root.innerHTML = `
      <div class="wwm-db-xinfa" data-db-xinfa-root>
        <div class="wwm-db-xinfa-list-pane">
          <div class="wwm-db-xinfa-controls">
            <input type="text" class="wwm-db-xinfa-search" data-db-xinfa-search value="${_esc(_searchQuery)}"
              placeholder="${_esc((window.T && window.T.dbXinfaSearchPlaceholder) || '名前で検索')}"
              aria-label="${_esc((window.T && window.T.dbXinfaSearchPlaceholder) || '名前で検索')}">
            <select class="wwm-db-xinfa-filter" data-db-xinfa-filter aria-label="${_esc((window.T && window.T.dbXinfaFilterLabel) || '効果で絞込')}">
              <option value="all" ${_filterTag === 'all' ? 'selected' : ''}>${_esc((window.T && window.T.dbXinfaFilterAll) || 'すべて')}</option>
              ${tagOpts}
            </select>
          </div>
          <div class="wwm-db-xinfa-list-inner" data-db-xinfa-list></div>
        </div>
        <div class="wwm-db-xinfa-detail" data-db-xinfa-detail>
          <button type="button" class="wwm-db-xinfa-back" data-db-xinfa-back>${_esc((window.T && window.T.dbBackToList) || '← 一覧へ戻る')}</button>
          <div data-db-xinfa-detail-body></div>
        </div>
      </div>
    `;
    _attachControls(root);
    _refreshList();
    const ids = _allIds();
    if (!_selectedId || ids.indexOf(_selectedId) === -1) _selectedId = ids[0] || null;
    if (_selectedId) selectId(_selectedId);
    const rootEl = root.querySelector('[data-db-xinfa-root]');
    if (rootEl) rootEl.removeAttribute('data-mobile-view');
  }

  window.WWMSidebar = window.WWMSidebar || {};
  window.WWMSidebar.databaseXinfa = { render, selectId };
})();

export {};
