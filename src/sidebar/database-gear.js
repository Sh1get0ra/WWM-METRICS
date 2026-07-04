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
  }

  window.WWMSidebar = window.WWMSidebar || {};
  window.WWMSidebar.databaseGear = { render, selectSlot };
})();

export {};
