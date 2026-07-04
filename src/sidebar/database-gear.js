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
    if (detailEl) detailEl.innerHTML = `<div class="wwm-db-gear-placeholder">slot ${_esc(slot)} detail (次タスクで実装)</div>`;
  }

  window.WWMSidebar = window.WWMSidebar || {};
  window.WWMSidebar.databaseGear = { render, selectSlot };
})();

export {};
