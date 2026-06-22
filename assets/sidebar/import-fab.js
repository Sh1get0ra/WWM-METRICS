// ── WWMetrics Sidebar / IMPORT FAB (2026-06-22) ──
// PC 専用 (≤600px mobile では CSS で hide)。
// 常時表示、 自由 drag、 viewport 比率保存、 × dismiss 永久 hide。
// 設計経緯: HANDOFF / changelog v2.2.0 起票時に兄貴フィードバック「import ボタン分かりにくい」 が起点。
// 上部 nav `#importBtn` は keep (慣れたユーザー用)、 FAB は別経路で常時 CTA を提供。
(function () {
  'use strict';
  const NS = (window.WWMSidebar = window.WWMSidebar || {});

  const POS_KEY = 'wwm_import_fab_pos_v1';
  const FAB_SIZE = 60;
  const MARGIN = 16;
  const SNAP_DIST = 30;
  const DRAG_THRESHOLD = 5;

  let fab = null;
  let dragState = null;
  let resizeRAF = null;

  function _loadPos() {
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (typeof o?.cxPct !== 'number' || typeof o?.cyPct !== 'number') return null;
      return { cxPct: o.cxPct, cyPct: o.cyPct };
    } catch (e) { return null; }
  }
  function _savePos(cxPct, cyPct) {
    try { localStorage.setItem(POS_KEY, JSON.stringify({ cxPct, cyPct })); } catch (e) {}
  }

  // container = .wwm-app (max-width 1500px 中央寄せ) 基準 + 比率保存。
  // 兄貴指示 2026-06-22 = 「ツール中身に対する相対位置」 を完全 keep。
  // wide で container 内 53% 位置 → narrow に container が縮んでも 53% 位置追従。
  function _getContainer() {
    return document.querySelector('.wwm-app');
  }
  function _resolvePos(pos) {
    const c = _getContainer();
    if (!c) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    // cxPct/cyPct = container 内 0..1 → 絶対座標へ
    const usableW = Math.max(0, r.width  - FAB_SIZE);
    const usableH = Math.max(0, r.height - FAB_SIZE);
    let cx = pos.cxPct * usableW;
    let cy = pos.cyPct * usableH;
    // 念のため MARGIN 内 clamp (極狭 container 時の保険)
    const maxCx = Math.max(MARGIN, r.width  - FAB_SIZE - MARGIN);
    const maxCy = Math.max(MARGIN, r.height - FAB_SIZE - MARGIN);
    cx = Math.max(MARGIN, Math.min(maxCx, cx));
    cy = Math.max(MARGIN, Math.min(maxCy, cy));
    return { x: Math.round(r.left + cx), y: Math.round(r.top + cy) };
  }

  function _applyPos(x, y) {
    if (!fab) return;
    fab.style.left = x + 'px';
    fab.style.top  = y + 'px';
  }

  function _refresh() {
    if (!fab) return;
    const saved = _loadPos();
    let pos;
    // default = container 右下寄り 比率 (0.98, 0.90)
    pos = saved || { cxPct: 0.98, cyPct: 0.90 };
    const { x, y } = _resolvePos(pos);
    _applyPos(x, y);
  }

  function _onMouseDown(e) {
    if (e.button !== 0) return;
    const rect = fab.getBoundingClientRect();
    dragState = {
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', _onMouseMove);
    document.addEventListener('mouseup', _onMouseUp);
    e.preventDefault();
  }
  function _onMouseMove(e) {
    if (!dragState) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    if (!dragState.moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
    dragState.moved = true;
    fab.classList.add('dragging');
    // mouse 絶対 → container 内 cx,cy → clamp → 絶対座標へ戻して描画
    const c = _getContainer();
    const r = c ? c.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    let cx = (e.clientX - dragState.offsetX) - r.left;
    let cy = (e.clientY - dragState.offsetY) - r.top;
    const maxCx = Math.max(MARGIN, r.width  - FAB_SIZE - MARGIN);
    const maxCy = Math.max(MARGIN, r.height - FAB_SIZE - MARGIN);
    cx = Math.max(MARGIN, Math.min(maxCx, cx));
    cy = Math.max(MARGIN, Math.min(maxCy, cy));
    _applyPos(Math.round(r.left + cx), Math.round(r.top + cy));
  }
  function _onMouseUp(e) {
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', _onMouseMove);
    document.removeEventListener('mouseup', _onMouseUp);
    if (!dragState) return;
    const wasDragging = dragState.moved;
    dragState = null;
    fab.classList.remove('dragging');
    if (!wasDragging) {
      _trigger();
      return;
    }
    // drag end = container 内 cx,cy → 4 辺 snap → 比率に変換して保存
    const c = _getContainer();
    const r = c ? c.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    let absX = parseFloat(fab.style.left);
    let absY = parseFloat(fab.style.top);
    let cx = absX - r.left;
    let cy = absY - r.top;
    const maxCx = Math.max(MARGIN, r.width  - FAB_SIZE - MARGIN);
    const maxCy = Math.max(MARGIN, r.height - FAB_SIZE - MARGIN);
    if (cx < MARGIN + SNAP_DIST) cx = MARGIN;
    else if (cx > maxCx - SNAP_DIST) cx = maxCx;
    if (cy < MARGIN + SNAP_DIST) cy = MARGIN;
    else if (cy > maxCy - SNAP_DIST) cy = maxCy;
    _applyPos(Math.round(r.left + cx), Math.round(r.top + cy));
    const usableW = Math.max(1, r.width  - FAB_SIZE);
    const usableH = Math.max(1, r.height - FAB_SIZE);
    _savePos(cx / usableW, cy / usableH);
  }

  function _onResize() {
    if (resizeRAF) cancelAnimationFrame(resizeRAF);
    resizeRAF = requestAnimationFrame(() => {
      resizeRAF = null;
      _refresh();
    });
  }

  function _trigger() {
    if (typeof window.importData === 'function') window.importData();
  }

  function _build() {
    const el = document.createElement('div');
    el.id = 'wwmImportFab';
    el.className = 'wwm-import-fab';
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', 'IMPORT');
    el.setAttribute('tabindex', '0');
    el.title = (window.T && window.T.importBtn) || 'IMPORT';
    el.innerHTML = `<svg class="wwm-import-fab-ic" aria-hidden="true"><use href="assets/icons/import.svg#import"/></svg>`;
    el.addEventListener('mousedown', _onMouseDown);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _trigger(); }
    });
    return el;
  }

  function show() {
    if (fab) return;
    fab = _build();
    document.body.appendChild(fab);
    _refresh();
    window.addEventListener('resize', _onResize);
  }
  function hide() {
    if (!fab) return;
    window.removeEventListener('resize', _onResize);
    fab.remove();
    fab = null;
  }

  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', show, { once: true });
    } else {
      show();
    }
  }

  NS.importFab = { show, hide, init };
  init();
})();
