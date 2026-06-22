// ── WWMetrics Workspace Engine (Phase 1, 2026-06-11) ──
// 4 workspace tab 切替 / rail 開閉 / preset popover / hero mode 連携 / mobile bottom nav
// (2026-06-12: 装備+心法 → 武備 'build' に統合。旧 localStorage 値 gear/xinfa は
//  PANELS miss → default fallback で自然 migration)
(function () {
  'use strict';
  var WS_KEY = 'wwm_workspace_v1';
  var RAIL_KEY = 'wwm_rail_collapsed_v1';
  // 格析 = popout 単一表現化 (2026-06-14)、 PANELS から anlz 削除。 #wsAnlz は DOM 戻し host のみ
  var PANELS = { build: 'wsBuild', enbu: 'wsEnbu', hist: 'wsHist' };

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
    // tab 切替で scroll 位置を top reset (panel 共通 .wwm-ws-body 1 scroll = 同期問題回避)
    var wsBody = document.querySelector('.wwm-ws-body');
    if (wsBody) wsBody.scrollTop = 0;
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
  // 旧 'anlz' saved 値 = popout 化で消滅 → build に migrate
  if (saved === 'anlz') saved = 'build';
  var initialWs = (saved && PANELS[saved]) ? saved : 'build';
  activate(initialWs);
  // workspace.js は hero.js より前に読込 (index.html L960 vs L979) → 上の activate 内
  // setMode 呼出は WWMSidebar.hero 未定義で空振る。DOMContentLoaded (全 inline script
  // 完了後) で hero mode を再同期 = restore 時 enbu タブで hero が武格指数のまま固定バグ修正。
  document.addEventListener('DOMContentLoaded', function () {
    if (window.WWMSidebar && window.WWMSidebar.hero && window.WWMSidebar.hero.setMode) {
      window.WWMSidebar.hero.setMode(initialWs === 'enbu' ? 'dps' : 'score');
    }
  });

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

  // ── mobile rail overlay (rail collapse 46px の click で 290px 展開、 兄貴指示 2026-06-19) ──
  var rail = document.querySelector('.wwm-ws-rail');
  // backdrop div を .wwm-app 内 append (2026-06-19 修正): .wwm-app は isolation:isolate + position:relative
  // で stacking context root。 body 直下 append だと backdrop z:55 vs .wwm-app(z:auto) で backdrop が
  // app 全体を覆い、 rail z:60 を含む全 app 内容が backdrop の下になる ([[mobile-rail-overlay-stacking]])。
  // app 内 append + descendant selector で rail z:60 > backdrop z:55 が正しく painting される
  var railBackdrop = document.createElement('div');
  railBackdrop.className = 'wwm-rail-backdrop';
  if (app) app.appendChild(railBackdrop);
  else document.body.appendChild(railBackdrop);
  railBackdrop.addEventListener('click', function () { closeMobileRail(); });
  function isMobile() { return window.matchMedia('(max-width: 600px)').matches; }
  function openMobileRail() {
    if (!app) return;
    app.dataset.railMobile = 'open';
  }
  function closeMobileRail() {
    if (!app) return;
    // 即時 close (open でない or rail 未取得) = grid 戻し
    if (app.dataset.railMobile !== 'open' || !rail) {
      delete app.dataset.railMobile;
      return;
    }
    // 対称アニメ (2026-06-21 兄貴指示): closing 中間 state で position:fixed 維持 + width 290→46 transit、
    // transitionend で grid relative 戻し → 右端固定で右にコンパクト化する綺麗な動き
    app.dataset.railMobile = 'closing';
    function onEnd(ev) {
      if (ev.propertyName !== 'width') return;
      rail.removeEventListener('transitionend', onEnd);
      delete app.dataset.railMobile;
    }
    rail.addEventListener('transitionend', onEnd);
    // fallback timer (transitionend 漏れ保険、 0.25s + buffer)
    setTimeout(function () {
      rail.removeEventListener('transitionend', onEnd);
      if (app.dataset.railMobile === 'closing') delete app.dataset.railMobile;
    }, 400);
  }
  if (rail) {
    rail.addEventListener('click', function (ev) {
      if (!isMobile()) return;
      if (ev.target.closest('#wwmRailClose')) { closeMobileRail(); return; }
      if (app && app.dataset.railMobile === 'open') return;
      openMobileRail();
    });
  }
  document.addEventListener('click', function (ev) {
    if (!isMobile()) return;
    if (!app || app.dataset.railMobile !== 'open') return;
    if (ev.target.closest('.wwm-ws-rail')) return;
    if (ev.target.closest('.wwm-rail-backdrop')) { closeMobileRail(); return; }
    closeMobileRail();
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && app && app.dataset.railMobile === 'open') closeMobileRail();
  });

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
    /* mobile = popup を body 直下 DOM 移動 (2026-06-19 兄貴指摘「裏にいる」)。
       .wwm-app は isolation:isolate で stacking context root = popup が app 内に閉じ込められて
       hero/avatar 等と z 競合、 z-index どれだけ上げても app 外には出ない。 body 直下移動で
       isolation 抜けて viewport stacking で表示。 PC は anchor 親 (.wwm-lang-dd) に戻す。 */
    var langPopOrigParent = langPop.parentElement;
    function relocateLangPop() {
      var mobile = window.matchMedia('(max-width: 600px)').matches;
      if (mobile && langPop.parentElement !== document.body) {
        document.body.appendChild(langPop);
      } else if (!mobile && langPopOrigParent && langPop.parentElement !== langPopOrigParent) {
        langPopOrigParent.appendChild(langPop);
      }
    }
    relocateLangPop();
    window.addEventListener('resize', relocateLangPop);

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
    var lang = window.currentLang || 'ja';
    // brand 玉ねぎ縦書き対象言語 = ja/en/vi (zh/ko は実機表記「燕云计」/「연운계」 を textContent 表示)
    var BRAND_KAISHO_LANGS = ['ja', 'en', 'vi'];
    document.querySelectorAll('[data-kaisho]').forEach(function (el) {
      var key = el.dataset.kaisho;
      var entry = dict[key];
      if (!entry) return;
      // brandVert 専用 = lang 別分岐 (data-kaisho-fixed の単純全言語 svg を上書き)
      if (key === 'brandVert') {
        if (BRAND_KAISHO_LANGS.indexOf(lang) >= 0) {
          // ja/en/vi = 玉ねぎ 1 文字 svg 縦積み + 親 writing-mode horizontal-tb 化
          el.setAttribute('aria-label', entry.text);
          el.setAttribute('role', 'img');
          el.classList.add('kaisho-vert-mode');
          var keys = ['brandV1', 'brandV2', 'brandV3'];
          el.innerHTML = keys.map(function (k) {
            var sub = dict[k]; if (!sub) return '';
            return '<span class="kaisho-vchar"><svg class="kaisho-svg" viewBox="' + sub.vb +
              '" aria-hidden="true"><path fill="currentColor" d="' + sub.d + '"/></svg></span>';
          }).join('');
        } else {
          // zh/ko = applyI18n が textContent (燕云计/연운계) を書込み済、 svg/class 解除
          el.classList.remove('kaisho-vert-mode');
          el.removeAttribute('role');
          el.removeAttribute('aria-label');
        }
        return;
      }
      // data-kaisho-fixed = 全言語共通表示 (hero 題字 武格指数/戦律指数 — 兄貴指定 2026-06-12)
      if (ja || el.hasAttribute('data-kaisho-fixed')) {
        el.setAttribute('aria-label', entry.text);
        el.setAttribute('role', 'img');
        // hero 題字のみ 金属金 gradient (兄貴指示 2026-06-15「ただの黄色 → 金属の金」)。
        // brand 縦書きや他 data-kaisho 要素は currentColor 継続 = 影響範囲限定
        var isHeroGold = (key === 'heroSeatScore' || key === 'heroSeatDps' || key === 'donutDmgCenter');
        var gradId = 'wwm-kaisho-gold-' + key;
        var defs = isHeroGold
          ? '<defs><linearGradient id="' + gradId + '" x1="0" y1="0" x2="0" y2="1">' +
              '<stop offset="0%" stop-color="#fff4cf"/>' +
              '<stop offset="42%" stop-color="#f0d28a"/>' +
              '<stop offset="60%" stop-color="#c9a45a"/>' +
              '<stop offset="100%" stop-color="#8a6a20"/>' +
            '</linearGradient></defs>'
          : '';
        var fillAttr = isHeroGold ? 'url(#' + gradId + ')' : 'currentColor';
        var svgCls = 'kaisho-svg' + (isHeroGold ? ' kaisho-svg-gold' : '');
        el.innerHTML = '<svg class="' + svgCls + '" viewBox="' + entry.vb +
          '" aria-hidden="true">' + defs + '<path fill="' + fillAttr + '" d="' + entry.d + '"/></svg>';
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

  // ── modal 動的生成への自動 apply (2026-06-15 modal title 玉ねぎ化 sprint) ──
  //    各 modal の callsite に個別 apply() 呼出を追加する代わりに、 body 直下に
  //    wwm-modal-backdrop が append されたら自動で kaishoApply() を発火させる。
  //    新規 modal 追加時のメンテ不要 = data-kaisho 属性付けるだけで自動展開
  (function () {
    if (!window.MutationObserver) return;
    var obs = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var added = mutations[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (n.nodeType !== 1) continue;
          if (n.classList && n.classList.contains('wwm-modal-backdrop')
              && n.querySelector('[data-kaisho]')) {
            kaishoApply();
            return; // 1 回呼べば全走査 = 早抜け
          }
        }
      }
    });
    obs.observe(document.body, { childList: true });
  })();

  // ── 紙面 背景 layer = wwm-ws-main に div 挿入 (兄貴案 2026-06-15 — grid 同 cell 重ね)
  //    paper-bg (z:0) が紙色/bg-icon を担い、 body (z:1) は内容のみ = flow 分離で不要 scroll 根治
  (function () {
    var main = document.querySelector('.wwm-ws-main');
    if (!main || main.querySelector('.wwm-ws-paper-bg')) return;
    var layer = document.createElement('div');
    layer.className = 'wwm-ws-paper-bg';
    // grid 配置で順序無関係だが、 DOM 順は body の前 = tabs の直後 が自然
    var body = main.querySelector('.wwm-ws-body');
    if (body) main.insertBefore(layer, body);
    else main.appendChild(layer);
  })();

  window.WWMWorkspace = { activate: activate, setRail: setRail };
  window.WWMKaisho = { apply: kaishoApply };
})();
