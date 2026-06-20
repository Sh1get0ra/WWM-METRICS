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

  // indicator label 表 (lang 切替対応は P2)
  const CAT_LABELS = {
    gear:  { name: '装備', pages: { weapon: '武器', armor: '防具', bow: '弓・武庫' } },
    xinfa: { name: '心法', pages: { xinfa: '心法' } },
    qishu: { name: '奇術', pages: { 'qishu-1': '奇術 I', 'qishu-2': '奇術 II' } },
  };
  const CAT_ORDER = ['gear', 'xinfa', 'qishu'];

  let curCatIdx = -1;
  let curHscroll = null;
  let curPageKeys = [];

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
      // 1. pager 内の slot を [data-mb-origin] マーク経由で元 host へ全部戻す。
      //    HTML hardcode placeholder slot を直接 move してるため、 _refreshAll では
      //    再生成されない (import 無し時 _refreshAll は early return)。
      const root = document.querySelector('#wsBuild .wwm-mb-pager-root');
      if (root) {
        root.querySelectorAll('[data-mb-origin]').forEach(el => {
          const origin = el.dataset.mbOrigin;
          delete el.dataset.mbOrigin;
          const host = originalHosts[origin]?.el;
          if (host) host.appendChild(el);
        });
      }
      // 2. 元 host を pager と同階層 (wsBuild 直下、 元位置) に復帰
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
    curCatIdx = -1;
    curHscroll = null;
    curPageKeys = [];
  }

  function reflow() {
    if (!enabled) return;
    const root = document.querySelector('.wwm-mb-pager-root');
    if (!root) return;

    // ── 装備 ──
    // origin マーク: teardown で逆 reflow して元 host へ戻す手がかり
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
        if (page && grids[page]) { s.dataset.mbOrigin = 'gear'; grids[page].appendChild(s); }
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
        s.dataset.mbOrigin = 'xinfa';
        if (s.classList.contains('wwm-arsenal-slot')) {
          if (bowGrid) bowGrid.appendChild(s);
        } else {
          if (xinfaGrid) xinfaGrid.appendChild(s);
        }
      }
    }

    // ── 奇術 ──
    const qishuHost = originalHosts?.qishu?.el;
    if (qishuHost) {
      const clusters = [...qishuHost.querySelectorAll(':scope > .wwm-qishu-cluster')];
      const g1 = root.querySelector('[data-cat="qishu"] [data-page="qishu-1"] .wwm-mb-grid');
      const g2 = root.querySelector('[data-cat="qishu"] [data-page="qishu-2"] .wwm-mb-grid');
      if (g1) g1.textContent = '';
      if (g2) g2.textContent = '';
      if (clusters[0] && g1) { clusters[0].dataset.mbOrigin = 'qishu'; g1.appendChild(clusters[0]); }
      if (clusters[1] && g2) { clusters[1].dataset.mbOrigin = 'qishu'; g2.appendChild(clusters[1]); }
    }

    syncIndicators();
  }

  function attachScrollListeners() {
    if (!vscrollEl) return;
    vscrollEl.addEventListener('scroll', () => {
      requestAnimationFrame(syncIndicators);
    });
  }

  function attachHscrollListener(sec, meta) {
    const hs = sec.querySelector('.wwm-mb-hscroll');
    if (!hs) return;
    if (curHscroll && curHscroll !== hs) curHscroll.onscroll = null;
    curHscroll = hs;
    hs.onscroll = () => {
      const i = Math.round(hs.scrollLeft / hs.clientWidth);
      [...hdotsEl.children].forEach((e, idx) => e.classList.toggle('on', idx === i));
      pageNameEl.textContent = meta.pages[curPageKeys[i]] || '';
    };
  }

  function syncIndicators() {
    if (!vscrollEl || !vcatEl || !catNameEl || !hdotsEl || !pageNameEl) return;
    // 縦カテゴリ dot 構築 (初回 + reflow 後)
    if (vcatEl.children.length !== CAT_ORDER.length) {
      vcatEl.textContent = '';
      for (let i = 0; i < CAT_ORDER.length; i++) vcatEl.appendChild(document.createElement('i'));
    }
    // 現カテゴリ idx
    const catIdx = Math.max(0, Math.min(CAT_ORDER.length - 1,
      Math.round(vscrollEl.scrollTop / Math.max(1, vscrollEl.clientHeight))));
    if (catIdx !== curCatIdx) {
      curCatIdx = catIdx;
      const cat = CAT_ORDER[catIdx];
      const meta = CAT_LABELS[cat];
      catNameEl.textContent = meta.name;
      curPageKeys = Object.keys(meta.pages);
      hdotsEl.textContent = '';
      for (let i = 0; i < curPageKeys.length; i++) {
        const dot = document.createElement('i');
        if (i === 0) dot.classList.add('on');
        hdotsEl.appendChild(dot);
      }
      pageNameEl.textContent = meta.pages[curPageKeys[0]];
      [...vcatEl.children].forEach((e, i) => e.classList.toggle('on', i === catIdx));
      // 現カテゴリの hscroll listener 再アタッチ
      const sec = vscrollEl.querySelector(`[data-cat="${cat}"]`);
      if (sec) attachHscrollListener(sec, meta);
    }
  }

  NS.mobileBuildPager = { enable, disable, reflow, syncIndicators };
})();
