// ── WWM-METRICS Workspace Engine (Phase 1, 2026-06-11) ──
// 5 workspace tab 切替 / rail 開閉 / preset popover / hero mode 連携 / mobile bottom nav
(function () {
  'use strict';
  var WS_KEY = 'wwm_workspace_v1';
  var RAIL_KEY = 'wwm_rail_collapsed_v1';
  var PANELS = { gear: 'wsGear', xinfa: 'wsXinfa', anlz: 'wsAnlz', enbu: 'wsEnbu', hist: 'wsHist' };

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
  activate(saved && PANELS[saved] ? saved : 'gear');

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

  window.WWMWorkspace = { activate: activate, setRail: setRail };
})();
