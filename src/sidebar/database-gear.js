// ── WWMetrics データベース画面 - 装備タブ (2026-07-04) ──
// 左: 10スロット一覧 / 右: 選択スロットの詳細 (基本ステ表 + affix範囲、次タスクで追記)
(function () {
  'use strict';
  const _ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => _ESC_MAP[c]); }

  const _SLOT_ORDER = ['1', '2', '3', '4', '21', '10', '11', '5', '8', '9'];
  let _selectedSlot = '1';

  function _slotList() {
    const tbl = window.WWM_EQUIP_BASE_BY_LV;
    if (!tbl || !tbl.slots) return [];
    return _SLOT_ORDER.filter(s => tbl.slots[s]);
  }

  function _renderSlotList() {
    const slots = _slotList();
    return slots.map(s => {
      const label = (window.WWMSidebar.icons && window.WWMSidebar.icons.slotLabelI18n(s)) || s;
      const sel = s === _selectedSlot ? 'true' : 'false';
      return `<button type="button" class="wwm-db-slot-item" data-db-slot="${_esc(s)}" aria-selected="${sel}">${_esc(label)}</button>`;
    }).join('');
  }

  // MIN_W_ATK 等の base attr key → statKey 変換 (src/import.js:585-588 と同一内容、
  // import.js側がprivateのためこちらにも複製する)
  const _BASE_ATTR_LABEL_KEYS = {
    MIN_W_ATK: 'minPhys', MAX_W_ATK: 'maxPhys', W_DEF: 'physDef', HP_MAX: 'maxHp',
    ARCHER_DAMAGE: 'archerDamage', ARCHER_WEAKPOINT_DAMAGE: 'archerWeakpointDamage'
  };
  const _BASE_ATTR_LABELS_JA = {
    MIN_W_ATK: '最小外功攻撃', MAX_W_ATK: '最大外功攻撃',
    W_DEF: '外功防御', HP_MAX: '気血最大値'
  };
  function _baseAttrLabel(key) {
    const sk = _BASE_ATTR_LABEL_KEYS[key];
    if (sk && window._AFFIX_DISPLAY_LABELS) {
      const v = window._AFFIX_DISPLAY_LABELS[sk];
      if (v) return v;
    }
    return _BASE_ATTR_LABELS_JA[key] || key;
  }

  // 弓矢/射玦 (基礎ダメ系 key のみ) は基本ステ表を表示しない対象
  const _NO_BASE_TABLE_SLOTS = new Set(['9', '21']);

  // affix範囲セクションを「通常」表示するスロット (防具4種+環+佩)。
  // 主武器(1)/副武器(2)は武器種選択が必要 (Task 6)、弓矢(21)/射玦(9)はレシピ枠 (Task 7) のため対象外
  const _NORMAL_AFFIX_SLOTS = new Set(['3', '4', '5', '8', '10', '11']);
  const _RANK_ORDER = ['gold', 'purple', 'blue'];
  const _RANK_LABEL_JA = { gold: '金', purple: '紫', blue: '青' };

  function _renderBaseStatTable(slot) {
    if (_NO_BASE_TABLE_SLOTS.has(slot)) return '';
    const tbl = window.WWM_EQUIP_BASE_BY_LV;
    const slotData = tbl && tbl.slots && tbl.slots[slot];
    if (!slotData) return '';
    const keys = slotData._keys || [];
    const lvList = tbl._lvList || [];
    const tierList = tbl._tierList || [];
    const tierLabels = tbl._tierLabels || {};
    const headCols = tierList.map(t => keys.map(k => `${tierLabels[String(t)] || t} ${_esc(_baseAttrLabel(k))}`).join(' / ')).join(' | ');
    const rows = lvList.map(lv => {
      const cells = tierList.map(t => {
        const cell = slotData.table && slotData.table[String(lv)] && slotData.table[String(lv)][String(t)];
        if (!cell) return keys.map(() => '-').join(' / ');
        return keys.map(k => (cell[k] != null ? cell[k] : '-')).join(' / ');
      }).join(' | ');
      return `<tr><th scope="row">Lv${_esc(lv)}</th><td>${cells}</td></tr>`;
    }).join('');
    return `
      <table class="wwm-db-base-table">
        <caption>${(window.T && window.T.dbBaseStatCaption) || '基本ステータス (Lv × Tier)'}</caption>
        <thead><tr><th scope="col">Lv</th><th scope="col">${_esc(headCols)}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  let _affixLv = 91;
  let _affixRank = 'gold';

  function _renderAffixControls() {
    const tbl = window.WWM_EQUIP_BASE_BY_LV;
    const lvList = (tbl && tbl._lvList) || [71, 81, 86, 91, 96, 100, 105];
    const lvOpts = lvList.map(lv => `<option value="${lv}" ${lv === _affixLv ? 'selected' : ''}>Lv${lv}</option>`).join('');
    const rankOpts = _RANK_ORDER.map(r => `<option value="${r}" ${r === _affixRank ? 'selected' : ''}>${_RANK_LABEL_JA[r]}</option>`).join('');
    return `
      <div class="wwm-db-affix-controls">
        <label>Lv <select data-db-affix-lv>${lvOpts}</select></label>
        <label>Tier <select data-db-affix-rank>${rankOpts}</select></label>
      </div>
    `;
  }

  function _renderAffixRows(slot) {
    const affixNs = window.WWMSidebar.affix;
    if (!affixNs) return '';
    const seen = new Set();
    const rows = [];
    for (let idx = 0; idx <= 4; idx++) {
      const keys = affixNs.selectorAllowedStatKeys(slot, idx, _affixLv, _affixRank);
      const chance = affixNs.affixChanceMap(slot, idx, _affixLv, _affixRank) || {};
      if (!keys) continue;
      keys.forEach(sk => {
        if (seen.has(sk)) return;
        seen.add(sk);
        const minMax = affixNs.getAffixMinMax(sk, _affixLv);
        const label = (window._AFFIX_DISPLAY_LABELS && window._AFFIX_DISPLAY_LABELS[sk]) || sk;
        const pct = chance[sk] != null ? chance[sk].toFixed(2) + '%' : '-';
        const range = minMax ? `${minMax.min} 〜 ${minMax.max}` : '-';
        rows.push(`<tr><td>${_esc(label)}</td><td>${_esc(range)}</td><td>${_esc(pct)}</td></tr>`);
      });
    }
    if (!rows.length) return `<p class="wwm-db-affix-empty">${(window.T && window.T.dbAffixEmpty) || 'データなし'}</p>`;
    return `
      <table class="wwm-db-affix-table">
        <thead><tr>
          <th scope="col">${(window.T && window.T.dbAffixColName) || '効果'}</th>
          <th scope="col">${(window.T && window.T.dbAffixColRange) || '範囲'}</th>
          <th scope="col">${(window.T && window.T.dbAffixColChance) || '出現率'}</th>
        </tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>
    `;
  }

  function _renderAffixSection(slot) {
    if (!_NORMAL_AFFIX_SLOTS.has(slot)) return '';
    return `
      <h3>${(window.T && window.T.dbAffixTitle) || 'affix 出現範囲'}</h3>
      ${_renderAffixControls()}
      <div data-db-affix-rows>${_renderAffixRows(slot)}</div>
    `;
  }

  function _attachAffixControls(slot) {
    const root = document.getElementById('dbGear');
    if (!root) return;
    const lvSel = root.querySelector('[data-db-affix-lv]');
    const rankSel = root.querySelector('[data-db-affix-rank]');
    const rowsEl = root.querySelector('[data-db-affix-rows]');
    // getAffixMinMax は equip_max.json の遅延読込 (loadEquipMax) 完了前は常に null を返す
    // (通常フローは装備編集パネル open 時に gear.js が fire-and-forget で load するが、
    // データベース画面に直行した場合は未読込 = 範囲列が "-" 固定になる、ここで明示 load + 再描画)
    const affixNs = window.WWMSidebar.affix;
    if (affixNs && !affixNs.getCachedEquipMax()) {
      affixNs.loadEquipMax().then(() => {
        if (rowsEl) rowsEl.innerHTML = _renderAffixRows(slot);
      });
    }
    if (lvSel) lvSel.addEventListener('change', () => {
      _affixLv = parseInt(lvSel.value, 10);
      if (rowsEl) rowsEl.innerHTML = _renderAffixRows(slot);
    });
    if (rankSel) rankSel.addEventListener('change', () => {
      _affixRank = rankSel.value;
      if (rowsEl) rowsEl.innerHTML = _renderAffixRows(slot);
    });
  }

  function render() {
    const root = document.getElementById('dbGear');
    if (!root) return;
    root.innerHTML = `
      <div class="wwm-db-gear">
        <div class="wwm-db-gear-list" data-db-gear-list></div>
        <div class="wwm-db-gear-detail" data-db-gear-detail></div>
      </div>
    `;
    const listEl = root.querySelector('[data-db-gear-list]');
    listEl.innerHTML = _renderSlotList();
    listEl.querySelectorAll('[data-db-slot]').forEach(btn => {
      btn.addEventListener('click', () => selectSlot(btn.dataset.dbSlot));
    });
    selectSlot(_selectedSlot);
  }

  function selectSlot(slot) {
    _selectedSlot = slot;
    const root = document.getElementById('dbGear');
    if (!root) return;
    root.querySelectorAll('[data-db-slot]').forEach(btn => {
      btn.setAttribute('aria-selected', String(btn.dataset.dbSlot === slot));
    });
    const detailEl = root.querySelector('[data-db-gear-detail]');
    if (!detailEl) return;
    detailEl.innerHTML = `
      <div class="wwm-db-gear-basestat">${_renderBaseStatTable(slot)}</div>
      <div class="wwm-db-gear-affix" data-db-affix-section></div>
    `;
    const affixSectionEl = root.querySelector('[data-db-affix-section]');
    if (affixSectionEl) {
      affixSectionEl.innerHTML = _renderAffixSection(slot);
      _attachAffixControls(slot);
    }
  }

  window.WWMSidebar = window.WWMSidebar || {};
  window.WWMSidebar.databaseGear = { render, selectSlot };
})();

export {};
