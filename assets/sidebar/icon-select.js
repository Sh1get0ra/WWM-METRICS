// WWM-METRICS - icon-select 共通 component (2026-06-18 兄貴指示)
// 心法/武術/セット の select で icon + 名前 を視覚並列。 ネイティブ <select> は option に
// <img> 入れられないため custom dropdown 化。 a11y = aria-expanded/aria-selected + keyboard nav
//
// 仕様 (mock/icon-select.html 採用):
//   - 武術/心法 = 墨地 box + 白 icon (公式色維持で浮かす、 ic-chip--inkbox)
//   - セット (流派) = 直 icon、 色不変 ([[official-asset-color-immutable]]) (ic-chip--plain)
//   - active = 朱印 bg + 細金縁、 hover = 薄金 bg + 微浮き
//
// API:
//   WWMSidebar.iconSelect.render(opts) -> HTML 文字列
//     opts = {
//       id: string (root の id)、 className: string (root 追加 class),
//       selectedValue: string|number,
//       options: [{ value, name, iconUrl, iconType: 'inkbox'|'plain' }],
//     }
//   WWMSidebar.iconSelect.attach(rootEl, { onChange })
//   WWMSidebar.iconSelect.getValue(rootEl) -> string
//   WWMSidebar.iconSelect.setValue(rootEl, value)
//
// 公開: window.WWMSidebar.iconSelect
(function () {
  'use strict';
  window.WWMSidebar = window.WWMSidebar || {};

  // 全 ic-select 同時 open 抑制用の閉じる関数 (document click で一括 close)
  let _docListenerAttached = false;
  function _attachDocListener() {
    if (_docListenerAttached) return;
    _docListenerAttached = true;
    document.addEventListener('click', (e) => {
      document.querySelectorAll('.ic-select[aria-expanded="true"]').forEach(s => {
        if (!s.contains(e.target)) s.setAttribute('aria-expanded', 'false');
      });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.ic-select[aria-expanded="true"]').forEach(s => s.setAttribute('aria-expanded', 'false'));
      }
    });
  }

  function _esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function _renderChip(opt) {
    const cls = opt.iconType === 'plain' ? 'ic-chip ic-chip--plain' : 'ic-chip ic-chip--inkbox';
    if (opt.iconUrl) {
      return `<span class="${cls}"><img src="${_esc(opt.iconUrl)}" alt="" loading="lazy"></span>`;
    }
    return `<span class="${cls}"></span>`;   // icon 欠落時 空 chip (layout 維持)
  }

  function render(opts) {
    const id = opts.id ? ` id="${_esc(opts.id)}"` : '';
    const cls = opts.className ? ' ' + _esc(opts.className) : '';
    const options = opts.options || [];
    const selV = opts.selectedValue != null ? String(opts.selectedValue) : null;
    const selOpt = options.find(o => String(o.value) === selV) || options[0] || { name: '', value: '' };
    const triggerChip = _renderChip(selOpt);
    const triggerName = _esc(selOpt.name || '');
    const popupItems = options.map(o => {
      const sel = String(o.value) === selV ? 'true' : 'false';
      const disabled = o.disabled ? ' is-disabled' : '';
      const aDis = o.disabled ? ' aria-disabled="true"' : '';
      const title = o.disabledReason ? ` title="${_esc(o.disabledReason)}"` : '';
      return `<div class="ic-select-opt${disabled}" role="option" aria-selected="${sel}"${aDis} data-value="${_esc(o.value)}"${title}>${_renderChip(o)}<span class="ic-name">${_esc(o.name)}</span></div>`;
    }).join('');
    return `
      <div class="ic-select${cls}"${id} aria-expanded="false" data-value="${_esc(selOpt.value)}">
        <button class="ic-select-trigger" type="button" data-toggle>
          ${triggerChip}<span class="ic-name">${triggerName}</span>
        </button>
        <div class="ic-select-popup" role="listbox" data-popup>${popupItems}</div>
      </div>
    `;
  }

  function getValue(rootEl) {
    return rootEl ? rootEl.dataset.value : null;
  }

  function setValue(rootEl, value, opts) {
    if (!rootEl) return;
    const v = String(value);
    const target = rootEl.querySelector(`.ic-select-opt[data-value="${CSS.escape(v)}"]`);
    if (!target) return;
    rootEl.querySelectorAll('.ic-select-opt').forEach(o => o.setAttribute('aria-selected', 'false'));
    target.setAttribute('aria-selected', 'true');
    rootEl.dataset.value = v;
    // trigger の chip + name 更新
    const trig = rootEl.querySelector('.ic-select-trigger');
    if (trig) {
      const newChip = target.querySelector('.ic-chip').cloneNode(true);
      const newName = target.querySelector('.ic-name').textContent;
      const tChip = trig.querySelector('.ic-chip');
      const tName = trig.querySelector('.ic-name');
      if (tChip) tChip.replaceWith(newChip);
      if (tName) tName.textContent = newName;
    }
    if (opts && opts.silent) return;
    rootEl.dispatchEvent(new CustomEvent('ic-change', { detail: { value: v } }));
  }

  function attach(rootEl, handlers) {
    if (!rootEl) return;
    _attachDocListener();
    const onChange = handlers && handlers.onChange;
    const trig = rootEl.querySelector('[data-toggle]');
    if (trig) {
      trig.addEventListener('click', (e) => {
        e.stopPropagation();
        const opened = rootEl.getAttribute('aria-expanded') === 'true';
        // 他 ic-select 閉じる
        document.querySelectorAll('.ic-select[aria-expanded="true"]').forEach(s => { if (s !== rootEl) s.setAttribute('aria-expanded', 'false'); });
        rootEl.setAttribute('aria-expanded', opened ? 'false' : 'true');
      });
    }
    rootEl.querySelectorAll('.ic-select-opt').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        if (opt.classList.contains('is-disabled')) return;   // 他スロット使用中 等の理由で選択不可
        const v = opt.dataset.value;
        setValue(rootEl, v, { silent: true });
        rootEl.setAttribute('aria-expanded', 'false');
        if (onChange) onChange(v);
      });
    });
  }

  window.WWMSidebar.iconSelect = { render, attach, getValue, setValue };
})();
