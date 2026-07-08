// ── WWMetrics データベース画面 - 武術タブ (2026-07-08 初版) ──
// 左: 18武学一覧 (名前検索)。右: 選択武学の詳細
// (path/weaponType バッジ + description + slot縦積み S1→S3→S2→S5→S4→S6)。
// キャラ非依存の閲覧専用、心法タブと同型パターン。
// Task 5 = 骨格のみ (プレースホルダ表示)。Task 6 = 左一覧 (検索 + icon list) 実装。
// Task 7 = 右詳細 見出し+description枠(常に空、Task4判定)+S1才能表(17段) 実装。
// Task 8 = S3才能表 (path上昇、15段、三重解放) 実装。S2/S5/S4/S6 は Task 9。
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
      const iconUrl = window.WWM_KONGFU_ICONS && window.WWM_KONGFU_ICONS[id] && window.WWM_KONGFU_ICONS[id].pic_url;
      const iconHtml = iconUrl
        ? `<img class="wwm-db-kongfu-item-icon" data-path="${_esc(kf && kf.path || '')}" src="${iconUrl}" alt="" loading="lazy">`
        : '<span class="wwm-db-kongfu-item-icon wwm-db-kongfu-item-icon-empty"></span>';
      return `<button type="button" class="wwm-db-kongfu-item" data-db-kongfu-id="${_esc(id)}" aria-selected="${sel}">${iconHtml}<span class="wwm-db-kongfu-item-name">${_esc(_kfName(id, lang))}</span></button>`;
    }).join('');
  }

  // ── path 表示名 (data/i18n/game.json の path cat は pathBase 経由の nested 構造 = WWM_DS.name('path', id) 直引き不可。
  // src/core/data-store.js _injectPathI18nKeys() が 'path'+大文字化 keyで ui cat に合成注入済 (例: pathBellstrike「鋼鳴」)、
  // 既存 callsite (import.js:227 / arsenal.js:22 / xinfa.js:58) と同じ経路で参照する ([[i18n-source-policy]] 実装確認済) ──
  function _capFirst(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function _pathLabel(path) {
    if (!path) return '';
    const key = 'path' + _capFirst(path);
    const label = window.WWM_DS.t(key);
    return (label && label !== key) ? label : path;
  }

  // ── stat key 表示名 (data/i18n/game.json の 'stat' cat は WWM_DS.t(key) 経由で直引き可、
  // 'stat.'+key 形式の合成キーは存在しない。appliesTo の一部 (critRate/sympathyRate/min|maxPhysATK) は
  // 'stat' cat の実キー名と直接一致しないため alias table 経由 (crit/affinity/physAtkLabel、
  // data/stat_display.json:130,147,54 の label_key 突合で確認済)。maxHp は affix_stat cat 直下に
  // 存在 (data/i18n/game.json:831) = WWM_DS.t() の T_CHAIN 経由でそのまま解決可。
  // fromStatKey が "max(body,power)" 等の合成式文字列の場合 (例: 20103) は英数字のみでないため
  // lookup せず生文字列のまま fallback 表示する ──
  // Task 8 (S3) 追加分: kongfu_passive_skills.json の s3.appliesTo 実値を grep 突合した結果、
  // bellstrikePen/stonesplitPen/silkbindPen/elemAtkBoost は data/i18n/game.json 'stat' cat に
  // 同名キーで実在 (grep 確認: game.json:1391,1405,1419,199) = alias 不要、直引きで解決可。
  // 'elemPen' のみ 'stat' cat に同名キー無し (grep 0件) だが、data/kongfu.json 側で
  // elemPen を appliesTo に持つ全3件 (20501/20603/20703) は "path":"bamboocut" +
  // "weaponSpecific":"bamboocut" (game.json 側の実データ = 瞬嵐固有貫通) と確認済 →
  // 'bamboocutPen' (game.json:1433「瞬嵐貫通」) へ alias。bamboocutPen 自体を appliesTo に
  // 持つ passive は現状0件 (elemPen が実質の内部表記)。
  const _APPLIES_TO_ALIAS = { critRate: 'crit', sympathyRate: 'affinity', maxPhysATK: 'physAtkLabel', minPhysATK: 'physAtkLabel', elemPen: 'bamboocutPen' };
  function _appliesToLabel(key) {
    if (!key) return '';
    const alias = _APPLIES_TO_ALIAS[key] || key;
    const label = window.WWM_DS.t(alias);
    return (label && label !== alias) ? label : key;
  }
  function _fromStatLabel(key) {
    if (!key) return '';
    if (/^[A-Za-z]+$/.test(key)) {
      const label = window.WWM_DS.t(key);
      if (label && label !== key) return label;
    }
    return key; // 合成式文字列 (例: "max(body,power)") = i18n無、生表示
  }

  function _renderHeader(id, kf, lang) {
    const iconUrl = window.WWM_KONGFU_ICONS && window.WWM_KONGFU_ICONS[id] && window.WWM_KONGFU_ICONS[id].pic_url;
    const path = kf.path || '';
    const weapon = kf.weaponType || '';
    const pathLabel = _pathLabel(path);
    const weaponLabel = weapon ? window.WWM_DS.name('weapontype', weapon, lang) : '';
    const pathBadge = path ? `<span class="wwm-db-kongfu-badge" data-path="${_esc(path)}">${_esc(pathLabel)}</span>` : '';
    const weaponBadge = weapon ? `<span class="wwm-db-kongfu-badge wwm-db-kongfu-badge-weapon">${_esc(weaponLabel)}</span>` : '';
    return `
      <div class="wwm-db-kongfu-header">
        ${iconUrl ? `<img class="wwm-db-kongfu-icon" data-path="${_esc(path)}" src="${iconUrl}" alt="">` : ''}
        <h3 class="wwm-db-kongfu-name">${_esc(_kfName(id, lang))}</h3>
        ${pathBadge}${weaponBadge}
      </div>
    `;
  }

  // ── description 枠: Phase A3 判定 = 公式説明文 client mining 不採用 (常に非表示 fallback)。
  // 詳細: docs/superpowers/plans/2026-07-08-database-kongfu.md Task4、kongfu.json.description は内部メモのみ、UI参照禁止 ──
  function _renderDescription(_id, _lang) {
    return '';
  }

  function _formatCap(v, isPct) {
    if (v == null) return '-';
    const abs = Math.abs(v);
    if (isPct) {
      // s1Caps は 0.068 = 6.8% 表記。値<1 なら %化、>=1 ならそのまま (maxHp等の生数値は isPct=false で来る)
      return abs < 1 ? `${(v * 100).toFixed(1)}%` : String(v);
    }
    return String(v);
  }

  const _STAGE_JA = ['一重', '二重', '三重', '四重', '五重', '六重', '七重', '八重', '九重', '十重', '十一重', '十二重', '十三重', '十四重', '十五重', '十六重', '十七重'];
  function _stageLabel(stage) {
    const key = `dbKongfuStage${stage}`;
    return (window.T && window.T[key]) || _STAGE_JA[stage - 1] || `${stage}重`;
  }

  function _renderSlotS1(id, kf, lang) {
    const passives = _passivesMap()[id];
    const s1 = passives && passives.s1;
    if (!s1) return '';
    const L = _ladders();
    const thresholds = L.s1Thresholds || [];
    const lvCaps = L.lvCaps || [];
    const caps = (L.s1Caps && L.s1Caps[s1.appliesTo]) || [];
    const applyLabel = _appliesToLabel(s1.appliesTo);
    const fromLabel = _fromStatLabel(s1.fromStatKey);
    const isPctAppliesTo = ['sympathyRate', 'critRate'].indexOf(s1.appliesTo) !== -1;
    const rows = thresholds.map((th, i) => {
      const stage = i + 1; // 一重 = index0
      const lvCap = lvCaps[i] != null ? lvCaps[i] : '-';
      const cap = caps[i];
      const isCurrent = stage === 12; // Lv95 = 十二重 (kongfu_talent_ladders.json lvCaps[11]=95相当帯)
      const capText = cap == null ? '-' : `+${_formatCap(cap, isPctAppliesTo)}`;
      const currentBadge = isCurrent ? `<span class="wwm-db-kongfu-current-badge">${_esc((window.T && window.T.dbKongfuCurrentCap) || '現行キャップ')}</span>` : '';
      return `<tr class="${isCurrent ? 'wwm-db-kongfu-current-cap-row' : ''}">
        <th scope="row">${_esc(_stageLabel(stage))}</th>
        <td>${_esc(String(lvCap))}</td>
        <td>${_esc(String(th))}</td>
        <td>${_esc(capText)}${currentBadge}</td>
      </tr>`;
    }).join('');
    return `
      <section class="wwm-db-kongfu-slot-section">
        <h4 class="wwm-db-kongfu-slot-title">S1: ${_esc((window.T && window.T.dbKongfuSlotS1) || '5行ステータス才能')}
          <span class="wwm-db-kongfu-slot-detail">(${_esc(fromLabel)} → ${_esc(applyLabel)})</span>
        </h4>
        <table class="wwm-db-kongfu-table">
          <thead><tr>
            <th>${_esc((window.T && window.T.dbKongfuColStage) || '突破段階')}</th>
            <th>${_esc((window.T && window.T.dbKongfuColLvCap) || 'Lv上限')}</th>
            <th>${_esc((window.T && window.T.dbKongfuColThreshold) || '閾値')}</th>
            <th>${_esc((window.T && window.T.dbKongfuColCap) || '上昇量')}</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>
    `;
  }

  // ── S3 = path上昇才能 (15段、三重解放から開始)。pathVariant('normal'|'bellstrike') で
  // 閾値ladderが切替わる (data/kongfu_talent_ladders.json:41-76)。capKind='dmg' のみ %表示、
  // 'pen' 系は生数値 (data/kongfu_talent_ladders.json:236-271、s3Caps.dmg は0.02〜0.148=2.0〜14.8%
  // 表記、s3Caps.pen は4〜29.6の生数値表記で確認済) ──
  function _renderSlotS3(id, kf, lang) {
    const passives = _passivesMap()[id];
    const s3 = passives && passives.s3;
    if (!s3) return '';
    const L = _ladders();
    const pathVariant = s3.pathVariant; // 'normal' | 'bellstrike'
    const thresholds = (L.s3Thresholds && L.s3Thresholds[pathVariant]) || [];
    const fixedAdd = L.s3FixedAdd || [];
    const caps = (L.s3Caps && L.s3Caps[s3.capKind]) || [];
    const lvCaps = L.lvCaps || [];
    const unlockStage = s3.unlockStage || 3;
    const applyLabel = _appliesToLabel(s3.appliesTo);
    const capIsPct = s3.capKind === 'dmg'; // dmg = %表示、 pen = 生数値
    const rows = thresholds.map((th, i) => {
      const stage = unlockStage + i; // 三重解放 = index0 → stage3
      const lvCap = lvCaps[stage - 1] != null ? lvCaps[stage - 1] : '-';
      const cap = caps[i];
      const fa = fixedAdd[i] || [null, null];
      const isCurrent = stage === 12; // Lv95 = 十二重 (kongfu_talent_ladders.json lvCaps[11]=95相当帯)
      const capText = cap == null ? '-' : `+${_formatCap(cap, capIsPct)}`;
      const faText = (fa[0] == null || fa[1] == null) ? '-' : `+${fa[0]}~${fa[1]}`;
      const currentBadge = isCurrent ? `<span class="wwm-db-kongfu-current-badge">${_esc((window.T && window.T.dbKongfuCurrentCap) || '現行キャップ')}</span>` : '';
      return `<tr class="${isCurrent ? 'wwm-db-kongfu-current-cap-row' : ''}">
        <th scope="row">${_esc(_stageLabel(stage))}</th>
        <td>${_esc(String(lvCap))}</td>
        <td>${_esc(String(th))}</td>
        <td>${_esc(faText)}</td>
        <td>${_esc(capText)}${currentBadge}</td>
      </tr>`;
    }).join('');
    return `
      <section class="wwm-db-kongfu-slot-section">
        <h4 class="wwm-db-kongfu-slot-title">S3: ${_esc((window.T && window.T.dbKongfuSlotS3) || '属性上昇才能')}
          <span class="wwm-db-kongfu-slot-detail">(→ ${_esc(applyLabel)})</span>
        </h4>
        <table class="wwm-db-kongfu-table">
          <thead><tr>
            <th>${_esc((window.T && window.T.dbKongfuColStage) || '突破段階')}</th>
            <th>${_esc((window.T && window.T.dbKongfuColLvCap) || 'Lv上限')}</th>
            <th>${_esc((window.T && window.T.dbKongfuColThreshold) || '閾値')}</th>
            <th>${_esc((window.T && window.T.dbKongfuColFixedAdd) || '固定加算')}</th>
            <th>${_esc((window.T && window.T.dbKongfuColCap) || '上昇量')}</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>
    `;
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
    if (bodyEl) bodyEl.innerHTML = _renderDetail(id);
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
    const lang = _curLang();
    const kf = _kongfuMap()[id];
    if (!kf) return `<p class="wwm-db-empty">${_esc((window.T && window.T.dbKongfuEmpty) || '武術が見つかりません')}</p>`;
    return _renderHeader(id, kf, lang) +
           _renderDescription(id, lang) +
           _renderSlotS1(id, kf, lang) +
           _renderSlotS3(id, kf, lang);
    // S2/S5/S4/S6 は Task 9 で追加
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
