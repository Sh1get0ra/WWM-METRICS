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
        <div class="wwm-mb-page" data-page="weapon"></div>
        <div class="wwm-mb-page" data-page="armor"></div>
        <div class="wwm-mb-page" data-page="bow"></div>
      </div>
    </section>
    <section class="wwm-mb-cat-sec" data-cat="xinfa">
      <div class="wwm-mb-hscroll">
        <div class="wwm-mb-page" data-page="xinfa"></div>
      </div>
    </section>
    <section class="wwm-mb-cat-sec" data-cat="qishu">
      <div class="wwm-mb-hscroll">
        <div class="wwm-mb-page" data-page="qishu-1"></div>
        <div class="wwm-mb-page" data-page="qishu-2"></div>
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
    // Task 3-4 で実装
  }

  function attachScrollListeners() {
    // Task 6 で実装
  }

  function syncIndicators() {
    // Task 6 で実装
  }

  NS.mobileBuildPager = { enable, disable, reflow, syncIndicators };
})();
