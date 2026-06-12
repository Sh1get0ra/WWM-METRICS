// ── WWM-METRICS Workspace Engine (Phase 1, 2026-06-11) ──
// 4 workspace tab 切替 / rail 開閉 / preset popover / hero mode 連携 / mobile bottom nav
// (2026-06-12: 装備+心法 → 武備 'build' に統合。旧 localStorage 値 gear/xinfa は
//  PANELS miss → default fallback で自然 migration)
(function () {
  'use strict';
  var WS_KEY = 'wwm_workspace_v1';
  var RAIL_KEY = 'wwm_rail_collapsed_v1';
  var PANELS = { build: 'wsBuild', anlz: 'wsAnlz', enbu: 'wsEnbu', hist: 'wsHist' };

  function activate(ws) {
    if (!PANELS[ws]) return;
    Object.entries(PANELS).forEach(function (kv) {
      var el = document.getElementById(kv[1]);
      if (el) el.classList.toggle('active', kv[0] === ws);
    });
    document.querySelectorAll('[data-ws]').forEach(function (t) {
      t.setAttribute('aria-selected', String(t.dataset.ws === ws));
    });
    // 公式背景 BG 切替の継承: data-active-workspace を app root へ (anlz の data-active-tab 機構と同型)
    var app = document.getElementById('wwmApp');
    if (app) app.setAttribute('data-active-workspace', ws);
    // hero 主役席: 演武 = DPS 主役 / 他 = 武格指数 主役 (setMode は Task 6 実装 — guard 必須)
    if (window.WWMSidebar && window.WWMSidebar.hero && window.WWMSidebar.hero.setMode) {
      window.WWMSidebar.hero.setMode(ws === 'enbu' ? 'dps' : 'score');
    }
    // 履歴 graph は表示時 render (hidden 中 canvas 描画バグ回避 — 既存 history tab pattern 継承)
    if (ws === 'hist' && window.WWMSidebar && window.WWMSidebar.history) {
      window.WWMSidebar.history.render();
    }
    try { localStorage.setItem(WS_KEY, ws); } catch (e) {}
  }

  document.querySelectorAll('[data-ws]').forEach(function (t) {
    t.addEventListener('click', function () { activate(t.dataset.ws); });
  });
  // arrow key 移動 (PC tabs のみ)
  var pcTabs = Array.prototype.slice.call(document.querySelectorAll('.wwm-ws-tabs .wwm-ws-tab'));
  pcTabs.forEach(function (t, i) {
    t.addEventListener('keydown', function (ev) {
      var d = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      ev.preventDefault();
      var next = pcTabs[(i + d + pcTabs.length) % pcTabs.length];
      next.focus(); activate(next.dataset.ws);
    });
  });
  // 復元
  var saved = null;
  try { saved = localStorage.getItem(WS_KEY); } catch (e) {}
  activate(saved && PANELS[saved] ? saved : 'build');

  // ── rail 開閉 ──
  var app = document.getElementById('wwmApp');
  function setRail(min) {
    if (!app) return;
    app.dataset.rail = min ? 'min' : 'full';
    var c = document.getElementById('wwmRailClose'), o = document.getElementById('wwmRailOpen');
    if (c) c.setAttribute('aria-expanded', String(!min));
    if (o) o.setAttribute('aria-expanded', String(!min));
    try { localStorage.setItem(RAIL_KEY, min ? '1' : '0'); } catch (e) {}
  }
  var rc = document.getElementById('wwmRailClose'), ro = document.getElementById('wwmRailOpen');
  if (rc) rc.addEventListener('click', function () { setRail(true); });
  if (ro) ro.addEventListener('click', function () { setRail(false); });
  try { if (localStorage.getItem(RAIL_KEY) === '1') setRail(true); } catch (e) {}

  // ── preset popover ──
  var chip = document.getElementById('wwmPresetChip');
  var pop = document.getElementById('wwmPresetPop');
  if (chip && pop) {
    chip.addEventListener('click', function (ev) {
      ev.stopPropagation();
      var open = pop.classList.toggle('open');
      chip.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', function (ev) {
      if (!pop.contains(ev.target) && ev.target !== chip) {
        pop.classList.remove('open');
        chip.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // ── 言語 dropdown (topbar 再編 2026-06-12 — preset popover と同パターン) ──
  var langBtn = document.getElementById('wwmLangDdBtn');
  var langPop = document.getElementById('wwmLangDdPop');
  if (langBtn && langPop) {
    langBtn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      var open = langPop.classList.toggle('open');
      langBtn.setAttribute('aria-expanded', String(open));
    });
    // 言語選択 (setLang は各 btn の onclick 既存) → pop を閉じる
    langPop.addEventListener('click', function () {
      langPop.classList.remove('open');
      langBtn.setAttribute('aria-expanded', 'false');
    });
    document.addEventListener('click', function (ev) {
      if (!langPop.contains(ev.target) && !langBtn.contains(ev.target)) {
        langPop.classList.remove('open');
        langBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // ── 楷書 SVG 適用 (玉ねぎ楷書「激」— 2026-06-12) ──
  // webfont 配信 = 規約グレー → 使用文字のみの SVG path 化 (「画像化」明示許可範囲)。
  // data-kaisho 要素を ja 表示時のみ inline <svg><path> に差し替え。
  // 言語切替時は applyI18n が textContent を書き戻す → setLang 末尾の apply() 再呼出しで
  // ja なら再 SVG 化 / 他言語ならテキストのまま。paths = assets/kaisho-paths.js (生成物)
  function kaishoApply() {
    var dict = window.WWM_KAISHO;
    if (!dict) return;
    var ja = (window.currentLang || 'ja') === 'ja';
    document.querySelectorAll('[data-kaisho]').forEach(function (el) {
      var entry = dict[el.dataset.kaisho];
      if (!entry) return;
      if (ja) {
        el.setAttribute('aria-label', entry.text);
        el.setAttribute('role', 'img');
        el.innerHTML = '<svg class="kaisho-svg" viewBox="' + entry.vb +
          '" aria-hidden="true"><path fill="currentColor" d="' + entry.d + '"/></svg>';
      } else if (!el.hasAttribute('data-i18n')) {
        // i18n 外 literal (奇術): 手でテキスト復元。data-i18n 持ちは applyI18n が復元済
        el.removeAttribute('role');
        el.textContent = entry.text;
      } else {
        el.removeAttribute('role');
        el.removeAttribute('aria-label');
      }
    });
  }
  kaishoApply(); // 初期 (ja default)。?lang= / saved lang は app.js init の setLang 経由で再適用

  window.WWMWorkspace = { activate: activate, setRail: setRail };
  window.WWMKaisho = { apply: kaishoApply };
})();
