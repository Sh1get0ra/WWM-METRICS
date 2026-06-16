// ── WWM-METRICS 格析 Popout Engine (2026-06-14) ──
// 兄貴決定: 格析 = popout 単一表現化 (元 #wsAnlz workspace tab 廃止、 DOM 戻し host のみ)
// Default = Document Picture-in-Picture (Chrome/Edge 116+)
// Fallback = floating div (Firefox/Safari/iOS/mobile chrome)
// Mobile (≤600px) = floating が CSS @media で viewport 全占有 modal 化
// state: localStorage 'wwm_anlz_popout_v1' = { mode, x, y, w, h, opacity }
(function () {
  'use strict';
  var KEY = 'wwm_anlz_popout_v1';
  var DEFAULTS = { mode: 'closed', x: null, y: 100, w: 540, h: 620 };
  var pipWin = null;
  var floatEl = null;
  var dragState = null;
  var anlzNode = null; // popout に居る .wwm-anlz ノード (null = 元位置)

  function loadState() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return Object.assign({}, DEFAULTS);
      return Object.assign({}, DEFAULTS, JSON.parse(raw));
    } catch (e) { return Object.assign({}, DEFAULTS); }
  }
  function saveState(patch) {
    var next = Object.assign({}, loadState(), patch);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) {}
  }

  // i18n 値 (ui.json 由来 = 信頼源) の HTML escape — robust 化
  var _ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return _ESC_MAP[c]; }); }

  function buildShell() {
    var T = window.T || {};
    var tipC = _esc(T.anlzPopoutCloseTip || '閉じる');
    var tipP = _esc(T.anlzPopoutPinTip || '最前面化 (OS 級) ↔ 通常表示 切替');
    var labelRank = _esc(T.anlzTabRank || '期待値');
    var labelOpt = _esc(T.anlzTabOpt || '最適化');
    return ''
      + '<span class="l-bracket tl"></span><span class="l-bracket tr"></span>'
      + '<span class="l-bracket bl"></span><span class="l-bracket br"></span>'
      + '<header class="wwm-anlz-floating-header" data-anlz-drag>'
      +   '<div class="wwm-anlz-floating-title">'
      +     '<span class="ja">格析</span><span class="en">ANALYSIS</span><span class="seal">析</span>'
      +   '</div>'
      +   '<div class="wwm-anlz-floating-controls">'
      +     '<button type="button" data-act="pin" title="' + tipP + '">📌</button>'
      +     '<button type="button" data-act="close" title="' + tipC + '">×</button>'
      +   '</div>'
      + '</header>'
      + '<nav class="wwm-anlz-floating-subheader">'
      +   '<button type="button" class="anlz-subtab" data-anlz="rank">' + labelRank + '</button>'
      +   '<button type="button" class="anlz-subtab" data-anlz="opt">' + labelOpt + '</button>'
      + '</nav>'
      + '<div class="wwm-anlz-floating-body" data-anlz-body></div>'
      + '<footer class="wwm-anlz-floating-footer">'
      +   '<span class="pos" data-anlz-pos>540 × 620</span>'
      +   '<span data-anlz-hint></span>'
      + '</footer>';
  }

  function detachAnlz() {
    anlzNode = document.querySelector('#wsAnlz .wwm-anlz');
    return anlzNode;
  }
  function reattachAnlz() {
    var host = document.getElementById('wsAnlz');
    if (anlzNode && host && !host.contains(anlzNode)) host.appendChild(anlzNode);
    anlzNode = null;
  }

  // popout root 内で subtab 切替完結 (PiP child window では parent document.getElementById で
  // popout 内子要素が取れないため、 anlz inline script に頼らず popout root context で直接 toggle)。
  // state は localStorage 'wwm_analysis_tab_v1' (anlz inline script と互換) に保存 → close 後の
  // 再 open 時に復元、 anlz inline script も同 key を読むので双方向で整合
  var SUBTAB_KEY = 'wwm_analysis_tab_v1';
  var SUBTAB_MAP = { rank: 'wwmAffixRanking', opt: 'wwmOptimization' };

  function activateSubtab(root, key) {
    if (!SUBTAB_MAP[key]) return;
    root.querySelectorAll('.anlz-subtab').forEach(function (b) {
      b.classList.toggle('active', b.dataset.anlz === key);
    });
    Object.entries(SUBTAB_MAP).forEach(function (kv) {
      var el = root.querySelector('#' + kv[1]);
      if (el) el.hidden = (kv[0] !== key);
    });
    // 元 .wwm-anlz の data-active-tab に反映 (bgicon 切替、 popout 内でも継承される)
    var anlzEl = root.querySelector('.wwm-anlz');
    if (anlzEl) anlzEl.setAttribute('data-active-tab', key);
    try { localStorage.setItem(SUBTAB_KEY, key); } catch (e) {}
  }

  function bindSubtabs(root) {
    var saved = null;
    try { saved = localStorage.getItem(SUBTAB_KEY); } catch (e) {}
    var initKey = (saved && SUBTAB_MAP[saved]) ? saved : 'opt';
    activateSubtab(root, initKey);
    root.querySelectorAll('.anlz-subtab').forEach(function (b) {
      b.addEventListener('click', function () { activateSubtab(root, b.dataset.anlz); });
    });
  }

  function bindControls(root) {
    root.querySelectorAll('[data-act="close"]').forEach(function (b) {
      b.addEventListener('click', function () { close(); });
    });
    // 最前面化 / 通常 切替 (= PiP モード ↔ floating モード 切替)。 ブラウザ仕様で
    // PiP window は OS 級常時最前面固定、 floating は HTML div 内 (= ブラウザ tab 内のみ)。
    // PiP の always-on-top を JS から動的 OFF にする手段なし、 唯一の切替手段はモード再 mount
    root.querySelectorAll('[data-act="pin"]').forEach(function (b) {
      b.addEventListener('click', function () { togglePin(); });
    });
  }

  async function togglePin() {
    var st = loadState();
    if (pipWin) {
      // PiP → floating
      // ★ pipWin.close() より先にノード救出 (close 後だと PiP document destroy で .wwm-anlz も消滅)。
      //   adoptNode で親 document に取り込み → host append で再装着
      if (anlzNode) {
        try { document.adoptNode(anlzNode); } catch (e) {}
        var host = document.getElementById('wsAnlz');
        if (host) host.appendChild(anlzNode);
        anlzNode = null;
      }
      try { pipWin.close(); } catch (e) {}
      pipWin = null;
      document.body.removeAttribute('data-anlz-popout');
      saveState({ mode: 'closed' });
      mountFloating();
    } else if (floatEl) {
      // floating → PiP (Document PiP 利用可なら)
      if (!('documentPictureInPicture' in window)) return;
      // floating からノード救出 (一旦 host に戻す → PiP mount 内 detachAnlz で再取得)
      reattachAnlz();
      document.body.removeAttribute('data-anlz-popout');
      if (floatEl) { floatEl.remove(); floatEl = null; }
      saveState({ mode: 'closed' });
      try {
        var win = await documentPictureInPicture.requestWindow({ width: st.w || 540, height: st.h || 620 });
        mountPip(win);
      } catch (e) {
        // PiP 失敗 → floating で復帰
        mountFloating();
      }
    }
  }

  function bindFloatingDrag(root, host) {
    var handle = root.querySelector('[data-anlz-drag]');
    if (!handle) return;
    handle.addEventListener('mousedown', function (e) {
      if (e.target.closest('button')) return;
      var rect = host.getBoundingClientRect();
      dragState = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
      host.style.right = 'auto';
      document.body.style.userSelect = 'none';
    });
    document.addEventListener('mousemove', function (e) {
      if (!dragState) return;
      host.style.left = (e.clientX - dragState.dx) + 'px';
      host.style.top = (e.clientY - dragState.dy) + 'px';
    });
    document.addEventListener('mouseup', function () {
      if (!dragState) return;
      dragState = null;
      document.body.style.userSelect = '';
      var rect = host.getBoundingClientRect();
      // viewport 外 救出 (2026-06-16): header (drag handle) が viewport 内に居るか基準。
      // header 高 ≒ 40px。 上方向 飛ばし (rect.top < 0) も確実 rescue
      var vw = window.innerWidth;
      var vh = window.innerHeight;
      var headerVisible = rect.top >= 0 && rect.top <= vh - 40
                       && rect.left + rect.width > 100 && rect.left < vw - 100;
      if (!headerVisible) {
        host.style.transition = 'left 0.3s ease, top 0.3s ease, right 0.3s ease';
        host.style.left = 'auto';
        host.style.right = '30px';
        host.style.top = '100px';
        setTimeout(function () {
          host.style.transition = '';
          var r2 = host.getBoundingClientRect();
          saveState({ x: r2.left, y: r2.top, w: r2.width, h: r2.height });
          updatePosLabel(root, r2);
        }, 320);
      } else {
        saveState({ x: rect.left, y: rect.top, w: rect.width, h: rect.height });
        updatePosLabel(root, rect);
      }
    });
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () {
        var rect = host.getBoundingClientRect();
        saveState({ w: rect.width, h: rect.height });
        updatePosLabel(root, rect);
      });
      ro.observe(host);
    }
  }
  function updatePosLabel(root, rect) {
    var posEl = root.querySelector('[data-anlz-pos]');
    if (posEl) posEl.textContent = Math.round(rect.width) + ' × ' + Math.round(rect.height);
  }

  function mountFloating() {
    if (floatEl) return;
    var st = loadState();
    floatEl = document.createElement('div');
    floatEl.className = 'wwm-anlz-floating';
    floatEl.id = 'wwmAnlzFloating';
    floatEl.style.width = (st.w || 540) + 'px';
    floatEl.style.height = (st.h || 620) + 'px';
    if (st.x !== null && st.x !== undefined) {
      // viewport 外 救出不能 防止 (2026-06-16): 復元位置の最低 50px が画面内に残らないなら
      // CSS default (top:100 right:30) で fallback
      var vw = window.innerWidth;
      var vh = window.innerHeight;
      var w = st.w || 540;
      var h = st.h || 620;
      var y = (st.y == null) ? 100 : st.y;
      var visible = (st.x + w > 50) && (st.x < vw - 50) && (y + h > 50) && (y < vh - 50);
      if (visible) {
        floatEl.style.left = st.x + 'px';
        floatEl.style.right = 'auto';
        floatEl.style.top = y + 'px';
      }
    }
    floatEl.innerHTML = buildShell();
    document.body.appendChild(floatEl);
    document.body.setAttribute('data-anlz-popout', '1');
    var body = floatEl.querySelector('[data-anlz-body]');
    var node = detachAnlz();
    if (node) body.appendChild(node);
    bindSubtabs(floatEl);
    bindControls(floatEl);
    bindFloatingDrag(floatEl, floatEl);
    updatePosLabel(floatEl, floatEl.getBoundingClientRect());
    saveState({ mode: 'floating' });
  }

  function mountPip(win) {
    pipWin = win;
    // OS タイトルバーの文字列 = i18n button label 由来。 ※ Brave では URL 強制表示
    // の仕様で document.title が反映されない (Brave privacy 機構)、 Chrome では効く想定
    var T = window.T || {};
    var titleStr = (T.anlzPopoutBtn || '格析') + ' — WWM-METRICS';
    win.document.title = titleStr;
    var titleEl = win.document.querySelector('title') || win.document.createElement('title');
    titleEl.textContent = titleStr;
    if (!titleEl.parentNode) win.document.head.appendChild(titleEl);
    // 親 document の link/style を全コピー (Document PiP は CSS 継承しない仕様)
    Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).forEach(function (n) {
      win.document.head.appendChild(n.cloneNode(true));
    });
    win.document.body.style.margin = '0';
    win.document.body.innerHTML = '<div class="wwm-anlz-floating wwm-anlz-floating--pip">' + buildShell() + '</div>';
    var root = win.document.body.firstElementChild;
    var body = root.querySelector('[data-anlz-body]');
    var node = detachAnlz();
    if (node) body.appendChild(node);
    document.body.setAttribute('data-anlz-popout', '1');
    bindSubtabs(root); // 親 document の button を経由 = state 共有
    bindControls(root);
    win.addEventListener('pagehide', function () {
      // togglePin (PiP → floating) で pipWin.close() 由来の pagehide 時、 floatEl 既に作成済
      // = 親 tab の floating UI を維持するため close() スキップ (2026-06-16)
      if (floatEl) return;
      close();
    });
    // size 復元観測 (OS resize → save)
    if (win.ResizeObserver) {
      var ro = new win.ResizeObserver(function () {
        saveState({ w: win.innerWidth, h: win.innerHeight });
      });
      ro.observe(win.document.body);
    }
    saveState({ mode: 'pip' });
  }

  async function open() {
    if (document.body.getAttribute('data-anlz-popout') === '1') { close(); return; }
    if ('documentPictureInPicture' in window) {
      try {
        var st = loadState();
        var win = await documentPictureInPicture.requestWindow({ width: st.w || 540, height: st.h || 620 });
        mountPip(win);
        return;
      } catch (e) { /* fall through */ }
    }
    mountFloating();
  }

  function close() {
    document.body.removeAttribute('data-anlz-popout');
    if (pipWin) {
      try { pipWin.close(); } catch (e) {}
      pipWin = null;
    }
    reattachAnlz();
    if (floatEl) { floatEl.remove(); floatEl = null; }
    saveState({ mode: 'closed' });
  }

  function init() {
    // PC button + mobile bottom nav 「格析」 を共通 trigger 化
    document.querySelectorAll('[data-anlz-popout-trigger]').forEach(function (b) {
      b.addEventListener('click', function () { open(); });
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  // popout 中の DOM 要素検出 helper (2026-06-16 兄貴指摘 — popout 中 ranking/opt の root が
  // 親 document で null になり render silent return = リアルタイム連携途絶 を解消)。
  // 優先順: pipWin > floatEl > parent document
  function findEl(id) {
    if (pipWin) {
      try { const el = pipWin.document.getElementById(id); if (el) return el; } catch (e) {}
    }
    if (floatEl) {
      const el = floatEl.querySelector('#' + id);
      if (el) return el;
    }
    return document.getElementById(id);
  }
  window.WWMAnlzPopout = { open: open, close: close, findEl: findEl };
})();
