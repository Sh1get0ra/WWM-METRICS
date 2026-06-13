/* assets/sidebar/qishu.js — 奇術 grid render (2026-06-13 v2)
   roleInfo._qishuIds (最大8枠 id) を #wwmQishuGrid の ひし形 plank に配置。
   id → window.WWM_QISHU_ICONS[id].pic_url で公式 CDN URL 解決 (data-store.js eager load 済)。
   DOM順 ①..⑧ → 右 cluster (①左/②上/③右/④下) + 左 cluster (⑤左/⑥上/⑦右/⑧下)。
   export.js _qishuRow / _QISHU_POS と同構造。 アイコン filter は workspace.css の
   .wwm-ws-paper .plank-icon-wrap img rule (装備/心法 と共通 muted 茶色) が自動適用。
   旧 _qishuIconsBase64 (bookmarklet base64 直貼り) = 廃止 (v2)。 旧 stored data は qishu 欠落許容。 */
(function(){
  if (!window.WWMSidebar) window.WWMSidebar = {};
  // [cluster index (0=左DOM, 1=右DOM, ただし表示は左→右), 'left'|'top'|'right'|'bottom']
  // export.js _QISHU_POS と完全同期。 DOM順 ①..⑧ → cluster 1 (= 表示の 右側) ①..④ +
  // cluster 0 (= 表示の 左側) ⑤..⑧
  const _QISHU_POS = [
    [1, 'left'], [1, 'top'], [1, 'right'], [1, 'bottom'],
    [0, 'left'], [0, 'top'], [0, 'right'], [0, 'bottom']
  ];
  function render(ri) {
    const grid = document.getElementById('wwmQishuGrid');
    if (!grid) return;
    const ids = (ri && ri._qishuIds) || [];
    const master = window.WWM_QISHU_ICONS || {};
    const clusters = grid.querySelectorAll('.wwm-qishu-cluster');
    if (clusters.length < 2) return;
    // 全 plank-icon-wrap クリア (再 render 対応) — textContent で safe な空文字化
    grid.querySelectorAll('.wwm-qishu-slot .plank-icon-wrap').forEach(w => { w.textContent = ''; });
    // DOM順 で各 id を master 解決して slot へ配置 — createElement + setAttribute で XSS 回避
    ids.forEach((id, i) => {
      if (!id) return;
      const m = master[id];
      if (!m || !m.pic_url) return;
      const pos = _QISHU_POS[i];
      if (!pos) return;
      const cluster = clusters[pos[0]];
      if (!cluster) return;
      const slot = cluster.querySelector('.wwm-qishu-slot.q-' + pos[1]);
      if (!slot) return;
      const wrap = slot.querySelector('.plank-icon-wrap');
      if (!wrap) return;
      const img = document.createElement('img');
      img.src = m.pic_url;
      img.alt = m.name || '';
      wrap.appendChild(img);
    });
  }
  window.WWMSidebar.qishu = { render: render };
})();
