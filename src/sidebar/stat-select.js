// WWMetrics - stat-select 共通 component (2026-07-04)
// affix stat 選択肢に出現確率(%) を添えるための custom dropdown。native <select> だと
// 選択中 option のテキストがそのまま閉状態表示になるため「開いたリストにだけ%を出し、
// 閉状態(trigger)には出さない」が実現できない制約を icon-select.js 同型の設計で回避。
// popup 行の表示テキスト(=%付き)と trigger 同期テキスト(=%無し、data-name 属性) を分離する点が
// icon-select.js との違い (あちらは trigger/popup 同一テキストが前提)。
//
// API:
//   WWMSidebar.statSelect.render(opts) -> HTML 文字列
//     opts = {
//       id: string (root の id)、 className: string (root 追加 class、 rank色分け等),
//       selectedValue: string|number,
//       disabled: boolean,
//       options: [{ value, statKey, name, chance: number|null }],
//     }
//   WWMSidebar.statSelect.attach(rootEl, { onChange(value) })
//   WWMSidebar.statSelect.getValue(rootEl) -> string
//   WWMSidebar.statSelect.setClassName(rootEl, className) -> rank色分け等の再適用 (native select 互換)
(function () {
  'use strict';
  window.WWMSidebar = window.WWMSidebar || {};

  let _docListenerAttached = false;
  function _closeSelect(s) {
    s.setAttribute('aria-expanded', 'false');
    if (s._wwmPopup) s._wwmPopup.classList.remove('is-open');
  }
  function _attachDocListener() {
    if (_docListenerAttached) return;
    _docListenerAttached = true;
    document.addEventListener('click', (e) => {
      // popup は portal化(document.body直下)済のため rootEl.contains だけでは popup 内クリックを
      // 誤って「外側クリック」判定してしまう。 rootEl 自身の popup 参照も contains 判定に含める
      document.querySelectorAll('.wwm-stat-select[aria-expanded="true"]').forEach(s => {
        const inside = s.contains(e.target) || (s._wwmPopup && s._wwmPopup.contains(e.target));
        if (!inside) _closeSelect(s);
      });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.wwm-stat-select[aria-expanded="true"]').forEach(_closeSelect);
      }
    });
  }

  function _esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function render(opts) {
    const id = opts.id ? ` id="${_esc(opts.id)}"` : '';
    const cls = opts.className ? ' ' + _esc(opts.className) : '';
    // extraAttrs = { 'data-field': 'stat', 'data-stat-el': '' } 形式 (root div への追加属性、
    // native <select> 互換の callsite marker 用)
    const extra = opts.extraAttrs
      ? ' ' + Object.entries(opts.extraAttrs).map(([k, v]) => v === '' ? k : `${k}="${_esc(v)}"`).join(' ')
      : '';
    const options = opts.options || [];
    // selected 判定: option.selected (statKey等の複合一致、dedup後の代表idと実idが不一致な場合用に
    // caller側で判定済) を優先、無ければ selectedValue と value の単純一致 (icon-select.js 互換)
    const selV = opts.selectedValue != null ? String(opts.selectedValue) : null;
    const selOpt = options.find(o => o.selected) || options.find(o => String(o.value) === selV)
      || options[0] || { name: '', value: '' };
    const disabledAttr = opts.disabled ? ' aria-disabled="true"' : '';
    const popupItems = options.map(o => {
      const sel = o === selOpt ? 'true' : 'false';
      const chancePrefix = o.chance != null ? `[${o.chance}%] ` : '';
      return `<div class="wwm-stat-select-opt" role="option" aria-selected="${sel}" data-value="${_esc(o.value)}" data-stat="${_esc(o.statKey)}" data-name="${_esc(o.name)}">${chancePrefix}${_esc(o.name)}</div>`;
    }).join('');
    return `
      <div class="wwm-stat-select${cls}"${id}${extra} aria-expanded="false" data-value="${_esc(selOpt.value)}" data-stat="${_esc(selOpt.statKey || '')}"${disabledAttr}>
        <button class="wwm-stat-select-trigger" type="button" data-toggle${opts.disabled ? ' disabled' : ''}>
          <span class="wwm-stat-select-name">${_esc(selOpt.name || '')}</span>
        </button>
        <div class="wwm-stat-select-popup" role="listbox" data-popup>${popupItems}</div>
      </div>
    `;
  }

  function getValue(rootEl) {
    return rootEl ? rootEl.dataset.value : null;
  }

  // native <select> 互換: className 総入替 (rank色分け更新用、 wwm-stat-select 自体は保持)
  function setClassName(rootEl, className) {
    if (!rootEl) return;
    rootEl.className = 'wwm-stat-select ' + className;
  }

  function setValue(rootEl, value, opts) {
    if (!rootEl) return;
    const v = String(value);
    // popup は portal化(document.body直下)済のため rootEl 経由ではなく _wwmPopup 参照から探す
    const popupRoot = rootEl._wwmPopup || rootEl;
    const target = popupRoot.querySelector(`.wwm-stat-select-opt[data-value="${CSS.escape(v)}"]`);
    if (!target) return;
    popupRoot.querySelectorAll('.wwm-stat-select-opt').forEach(o => o.setAttribute('aria-selected', 'false'));
    target.setAttribute('aria-selected', 'true');
    rootEl.dataset.value = v;
    rootEl.dataset.stat = target.dataset.stat || '';
    const nameEl = rootEl.querySelector('.wwm-stat-select-name');
    if (nameEl) nameEl.textContent = target.dataset.name || '';
    if (opts && opts.silent) return;
    rootEl.dispatchEvent(new CustomEvent('wwm-stat-change', { detail: { value: v, statKey: rootEl.dataset.stat } }));
  }

  // popup を document.body へ portal化 (2026-07-04 実機確認): 対照 modal の
  // .wwm-cmp-modal-a .wwm-modal-body は背景icon containment用に overflow:hidden 固定
  // (既存の意図的な設計、変更不可)。affix行が modal 下部にある時 popup が overflow で
  // 物理的にクリップされ footer 手前で見切れる罠を、popup を body直下へ移動+position:fixed化
  // することで回避 (どのモーダルscroll/overflow設定からも独立)。
  function _positionPopup(rootEl, popupEl) {
    const trig = rootEl.querySelector('[data-toggle]');
    if (!trig) return;
    const r = trig.getBoundingClientRect();
    popupEl.style.position = 'fixed';
    popupEl.style.left = r.left + 'px';
    // trigger 幅は狭い (grid列制約) が option 文字列は長い (「[12.34%] 会心率強化」等) ため
    // width 固定は横スクロール/文字見切れの罠 (2026-07-04 実機発覚)。min-width = trigger幅、
    // 実体幅は内容依存 (CSS width:max-content) にし、右端はみ出しのみ事後補正
    popupEl.style.width = '';
    popupEl.style.minWidth = r.width + 'px';
    popupEl.style.right = 'auto';
    // 下スペース不足時は上開きに切替 (viewport 基準、 max-height 220px 前提)
    const maxH = 220;
    const spaceBelow = window.innerHeight - r.bottom;
    if (spaceBelow < maxH + 10 && r.top > maxH + 10) {
      popupEl.style.top = 'auto';
      popupEl.style.bottom = (window.innerHeight - r.top + 3) + 'px';
    } else {
      popupEl.style.top = (r.bottom + 3) + 'px';
      popupEl.style.bottom = 'auto';
    }
    // 内容依存幅で右端が viewport をはみ出す場合のみ左へ補正 (画面外にはみ出さない範囲で)
    const rect = popupEl.getBoundingClientRect();
    const overflowRight = rect.right - window.innerWidth + 8;
    if (overflowRight > 0) {
      const newLeft = Math.max(4, r.left - overflowRight);
      popupEl.style.left = newLeft + 'px';
    }
  }

  // renderNewRows() 等で行 innerHTML が丸ごと再生成される callsite では、旧 rootEl は DOM から
  // 切り離されるが portal化済 popup は document.body に残ったまま孤立する (2026-07-04 実装時発覚)。
  // 所有者 rootEl が document から切断済の popup を毎 attach() 時に一掃する
  function _sweepOrphanPopups() {
    document.querySelectorAll('.wwm-stat-select-popup').forEach(p => {
      if (p._wwmOwner && !document.contains(p._wwmOwner)) p.remove();
    });
  }

  function attach(rootEl, handlers) {
    if (!rootEl) return;
    _attachDocListener();
    _sweepOrphanPopups();
    const onChange = handlers && handlers.onChange;
    const trig = rootEl.querySelector('[data-toggle]');
    const popup = rootEl.querySelector('.wwm-stat-select-popup');
    // portal化: popup を body 直下へ移動 (rootEl 側には placeholder 不要、
    // getValue/setValue は rootEl.dataset 経由で popup の位置に依存しないため安全)
    if (popup && popup.parentElement !== document.body) {
      document.body.appendChild(popup);
      popup._wwmOwner = rootEl; // 孤立判定用 (rootEl が document から切断されたら sweep 対象)
      rootEl._wwmPopup = popup; // click-outside 判定 / 再取得用に保持
    }
    if (trig) {
      trig.addEventListener('click', (e) => {
        e.stopPropagation();
        if (rootEl.getAttribute('aria-disabled') === 'true') return;
        const opened = rootEl.getAttribute('aria-expanded') === 'true';
        document.querySelectorAll('.wwm-stat-select[aria-expanded="true"]').forEach(s => {
          if (s !== rootEl) { s.setAttribute('aria-expanded', 'false'); if (s._wwmPopup) s._wwmPopup.classList.remove('is-open'); }
        });
        const next = !opened;
        rootEl.setAttribute('aria-expanded', next ? 'true' : 'false');
        if (popup) {
          popup.classList.toggle('is-open', next);
          if (next) _positionPopup(rootEl, popup);
        }
      });
    }
    (popup || rootEl).querySelectorAll('.wwm-stat-select-opt').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const v = opt.dataset.value;
        // 🚨 silent:true にしていたため wwm-stat-change イベントが発火せず、gear.js 側の
        // [data-field] change-listener が一切発動しない = 選択した affix が newAffixes に
        // 反映されない致命バグだった (2026-07-04 実機発覚、affix#1-6 全滅の原因)。
        // ユーザー操作由来のクリックは必ずイベント発火させる (silent は使わない)
        setValue(rootEl, v);
        rootEl.setAttribute('aria-expanded', 'false');
        if (popup) popup.classList.remove('is-open');
        if (onChange) onChange(v);
      });
    });
  }

  window.WWMSidebar.statSelect = { render, attach, getValue, setValue, setClassName };
})();

// vite移行 P2: ESM 副作用 module 化 (window expose は IIFE 内 keep)
export {};
