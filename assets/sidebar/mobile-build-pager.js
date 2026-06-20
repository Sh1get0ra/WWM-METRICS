// ── WWM-METRICS Sidebar / Mobile 武備 ページャー化 (2026-06-20) ──
// mobile-mode (≤600px) のみで動作。 PC では完全 no-op。
// 22 slot 縦積み → 2軸 scroll-snap ページャー (装備3p / 心法1p / 奇術2p)。
// 設計 = docs/superpowers/specs/2026-06-20-mobile-build-pager-design.md
// 罠予防 = [[mobile-css-isolation-policy]] / 既存 slot DOM appendChild move (innerHTML 書換禁止)。
(function () {
  'use strict';
  const NS = (window.WWMSidebar = window.WWMSidebar || {});

  let enabled = false;
  let vscrollEl = null;
  let hdotsEl = null;
  let vcatEl = null;
  let catNameEl = null;
  let pageNameEl = null;
  let originalHosts = null; // teardown 用、 host 元位置記録

  // gear.js _GEAR_SLOT_ORDER = ['1','2','3','4','21','10','11','5','8','9']
  // gear.js _stamp() 分類: 武=1,2,10,11 / 装=3,4,5,8 / 弓=9,21
  const GEAR_PAGE_MAP = {
    '1': 'weapon', '2': 'weapon', '10': 'weapon', '11': 'weapon',
    '3': 'armor', '4': 'armor', '5': 'armor', '8': 'armor',
    '9': 'bow', '21': 'bow',
  };

  const TEMPLATE = `
<div class="wwm-mb-pager">
  <div class="wwm-mb-head">
    <span class="wwm-mb-cat"></span>
    <span class="wwm-mb-pname"></span>
    <span class="wwm-mb-sp"></span>
    <span class="wwm-mb-hdots"></span>
  </div>
  <div class="wwm-mb-vcat"></div>
  <div class="wwm-mb-vscroll">
    <section class="wwm-mb-cat-sec" data-cat="gear">
      <div class="wwm-mb-hscroll">
        <div class="wwm-mb-page" data-page="weapon"><div class="wwm-mb-grid"></div></div>
        <div class="wwm-mb-page" data-page="armor"><div class="wwm-mb-grid"></div></div>
        <div class="wwm-mb-page" data-page="bow"><div class="wwm-mb-grid"></div></div>
      </div>
    </section>
    <section class="wwm-mb-cat-sec" data-cat="xinfa">
      <div class="wwm-mb-hscroll">
        <div class="wwm-mb-page" data-page="xinfa"><div class="wwm-mb-grid"></div></div>
      </div>
    </section>
    <section class="wwm-mb-cat-sec" data-cat="qishu">
      <div class="wwm-mb-hscroll">
        <div class="wwm-mb-page" data-page="qishu-1"><div class="wwm-mb-grid wwm-mb-grid-1col"></div></div>
        <div class="wwm-mb-page" data-page="qishu-2"><div class="wwm-mb-grid wwm-mb-grid-1col"></div></div>
      </div>
    </section>
  </div>
</div>`;

  function buildPagerDOM() {
    const ws = document.getElementById('wsBuild');
    if (!ws) return null;
    const gearHost = document.getElementById('wwmGearGrid');
    const xinfaHost = document.getElementById('wwmXinfaGrid');
    const qishuHost = document.getElementById('wwmQishuGrid');
    if (!gearHost || !xinfaHost || !qishuHost) {
      console.warn('[mobileBuildPager] host not found', { gearHost: !!gearHost, xinfaHost: !!xinfaHost, qishuHost: !!qishuHost });
      return null;
    }
    originalHosts = {
      gear:  { el: gearHost,  parent: gearHost.parentNode,  next: gearHost.nextSibling  },
      xinfa: { el: xinfaHost, parent: xinfaHost.parentNode, next: xinfaHost.nextSibling },
      qishu: { el: qishuHost, parent: qishuHost.parentNode, next: qishuHost.nextSibling },
    };
    const wrap = document.createElement('div');
    wrap.className = 'wwm-mb-pager-root';
    wrap.innerHTML = TEMPLATE;
    ws.appendChild(wrap);
    return wrap;
  }

  function enable() {
    if (enabled) return;
    enabled = true;
    const root = buildPagerDOM();
    if (!root) { enabled = false; return; }
    vscrollEl  = root.querySelector('.wwm-mb-vscroll');
    hdotsEl    = root.querySelector('.wwm-mb-hdots');
    vcatEl     = root.querySelector('.wwm-mb-vcat');
    catNameEl  = root.querySelector('.wwm-mb-cat');
    pageNameEl = root.querySelector('.wwm-mb-pname');
    reflow();
    attachScrollListeners();
  }

  function disable() {
    if (!enabled) return;
    enabled = false;
    teardown();
  }

  function teardown() {
    if (originalHosts) {
      for (const k of ['gear','xinfa','qishu']) {
        const h = originalHosts[k];
        if (h && h.el && h.parent) {
          if (h.next && h.next.parentNode === h.parent) h.parent.insertBefore(h.el, h.next);
          else h.parent.appendChild(h.el);
        }
      }
      originalHosts = null;
    }
    const root = document.querySelector('#wsBuild .wwm-mb-pager-root');
    if (root) root.remove();
    vscrollEl = hdotsEl = vcatEl = catNameEl = pageNameEl = null;
  }

  function reflow() {
    if (!enabled) return;
    const root = document.querySelector('.wwm-mb-pager-root');
    if (!root) return;

    // ── 装備 ──
    const gearHost = originalHosts?.gear?.el;
    if (gearHost) {
      const slots = [...gearHost.querySelectorAll(':scope > [data-slot]')];
      const grids = {
        weapon: root.querySelector('[data-cat="gear"] [data-page="weapon"] .wwm-mb-grid'),
        armor:  root.querySelector('[data-cat="gear"] [data-page="armor"] .wwm-mb-grid'),
        bow:    root.querySelector('[data-cat="gear"] [data-page="bow"] .wwm-mb-grid'),
      };
      for (const k in grids) { if (grids[k]) grids[k].textContent = ''; }
      for (const s of slots) {
        const page = GEAR_PAGE_MAP[s.dataset.slot];
        if (page && grids[page]) grids[page].appendChild(s);
      }
    }

    // ── 心法 + 武庫 ──
    // xinfa-grid 子 = 心法 slot 4 + wwm-arsenal-slot 1 (武庫)。 武庫は bow page へ移送、 残りを xinfa page へ。
    const xinfaHost = originalHosts?.xinfa?.el;
    if (xinfaHost) {
      const allChildren = [...xinfaHost.children];
      const xinfaGrid = root.querySelector('[data-cat="xinfa"] [data-page="xinfa"] .wwm-mb-grid');
      const bowGrid = root.querySelector('[data-cat="gear"] [data-page="bow"] .wwm-mb-grid');
      if (xinfaGrid) xinfaGrid.textContent = '';
      for (const s of allChildren) {
        if (s.classList.contains('wwm-arsenal-slot')) {
          if (bowGrid) bowGrid.appendChild(s);
        } else {
          if (xinfaGrid) xinfaGrid.appendChild(s);
        }
      }
    }

    // ── 奇術 ──
    // wwm-qishu-cluster 2 個 = それぞれ 4 slot を含む。 cluster 単位で 2 page に振り分け。
    const qishuHost = originalHosts?.qishu?.el;
    if (qishuHost) {
      const clusters = [...qishuHost.querySelectorAll(':scope > .wwm-qishu-cluster')];
      const g1 = root.querySelector('[data-cat="qishu"] [data-page="qishu-1"] .wwm-mb-grid');
      const g2 = root.querySelector('[data-cat="qishu"] [data-page="qishu-2"] .wwm-mb-grid');
      if (g1) g1.textContent = '';
      if (g2) g2.textContent = '';
      if (clusters[0] && g1) g1.appendChild(clusters[0]);
      if (clusters[1] && g2) g2.appendChild(clusters[1]);
    }

    syncIndicators();
  }

  function attachScrollListeners() {
    // Task 6 で実装
  }

  function syncIndicators() {
    // Task 6 で実装
  }

  NS.mobileBuildPager = { enable, disable, reflow, syncIndicators };
})();
