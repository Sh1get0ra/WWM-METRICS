/* assets/sidebar/qishu.js — 奇術 grid render + 入替ピッカー (2026-06-13 v4 — Phase B)
   WWMState.virtual.qishu (兄貴入替) 優先 / 無ければ roleInfo._qishuIds (import 値) fallback。
   最大8枠 id を #wwmQishuGrid の ひし形 plank に配置。
   id → window.WWM_QISHU_ICONS[id].pic_url で公式 CDN URL 解決 (data-store.js eager load 済)。
   DOM順 ①..⑧ → 右 cluster (①左/②上/③右/④下) + 左 cluster (⑤左/⑥上/⑦右/⑧下)。
   export.js _qishuRow / _QISHU_POS と同構造。 アイコン filter は workspace.css の
   .wwm-ws-paper .plank-icon-wrap img rule (装備/心法 と共通 muted 茶色) が自動適用。
   旧 _qishuIconsBase64 (bookmarklet base64 直貼り) = 廃止 (v2)。 旧 stored data は qishu 欠落許容。
   v4 (Phase B): 各 plank クリック → ピッカー modal で master 全 48 件から入替。
                 カテゴリ分割は qishu_categories.json (後追い投入) があれば自動 section 化、
                 無ければ「全て」1 カテゴリで全件 flat 表示。 */
(function(){
  if (!window.WWMSidebar) window.WWMSidebar = {};
  // [cluster index (0=左DOM, 1=右DOM, ただし表示は左→右), 'left'|'top'|'right'|'bottom']
  // export.js _QISHU_POS と完全同期。 DOM順 ①..⑧ → cluster 1 (= 表示の 右側) ①..④ +
  // cluster 0 (= 表示の 左側) ⑤..⑧
  const _QISHU_POS = [
    [1, 'left'], [1, 'top'], [1, 'right'], [1, 'bottom'],
    [0, 'left'], [0, 'top'], [0, 'right'], [0, 'bottom']
  ];

  function _curLang() {
    return (window.currentLang) || (document.documentElement.lang) || 'ja';
  }
  // ── XSS 防止: HTML attr/text escape + 公式 CDN URL prefix validation ───
  // master.name / i18n / カテゴリ名 = 信頼 source だが bookmarklet 経由 _qishuMaster 取込
  // 経路で 万一 injection があっても DOM 構築段で安全側に倒す (defense-in-depth)。
  const _ESC_MAP = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' };
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => _ESC_MAP[c]);
  }
  function _safeUrl(u) {
    if (typeof u !== 'string') return '';
    if (!/^https?:\/\//i.test(u)) return ''; // javascript: data: 等 reject
    return u.replace(/[<>"'\\]/g, ''); // 念のため delimiter 系除去
  }
  // i18n name (data/i18n/qishu.json) → en fallback (DataStore lookup chain で自動)。 master.name は最終 fallback
  function _qishuName(id) {
    if (!id) return '';
    const lang = _curLang();
    if (window.WWM_DS) {
      const n = window.WWM_DS.name('qishu', id, lang);
      if (n && n.indexOf('[qishu:') !== 0) return n;
    }
    const m = window.WWM_QISHU_ICONS?.[id];
    return m?.name || ('#' + id);
  }

  // 現在 effective ids ([virtual.qishu] || roleInfo._qishuIds)
  function _effectiveIds() {
    const vq = window.WWMState?.virtual?.qishu;
    if (vq && vq.length) return vq.slice();
    const ri = window.WWMState?.roleInfo;
    return (ri && ri._qishuIds) ? ri._qishuIds.slice() : [];
  }
  // virtual.qishu を 8 枠配列で初期化 (現 effective から copy)
  function _ensureVirtual() {
    if (!window.WWMState) return null;
    let vq = window.WWMState.virtual.qishu;
    if (!vq || !vq.length) {
      vq = _effectiveIds();
      while (vq.length < 8) vq.push(null);
      vq = vq.slice(0, 8);
      window.WWMState.virtual.qishu = vq;
    }
    return vq;
  }

  function render(ri) {
    const grid = document.getElementById('wwmQishuGrid');
    if (!grid) return;
    const ids = _effectiveIds();
    const master = window.WWM_QISHU_ICONS || {};
    const clusters = grid.querySelectorAll('.wwm-qishu-cluster');
    if (clusters.length < 2) return;
    // 全 plank-icon-wrap クリア (再 render 対応) — textContent で safe な空文字化
    grid.querySelectorAll('.wwm-qishu-slot .plank-icon-wrap').forEach(w => { w.textContent = ''; });
    // DOM順 で各 id を master 解決して slot へ配置 — createElement + setAttribute で XSS 回避
    ids.forEach((id, i) => {
      const pos = _QISHU_POS[i];
      if (!pos) return;
      const cluster = clusters[pos[0]];
      if (!cluster) return;
      const slot = cluster.querySelector('.wwm-qishu-slot.q-' + pos[1]);
      if (!slot) return;
      // slot にスロット index 付与 (click hook 用)。 i=0..7 = DOM順
      slot.dataset.qishuSlot = String(i);
      if (!id) return;
      const m = master[id];
      if (!m || !m.pic_url) return;
      const wrap = slot.querySelector('.plank-icon-wrap');
      if (!wrap) return;
      const img = document.createElement('img');
      img.src = m.pic_url;
      img.alt = _qishuName(id);
      wrap.appendChild(img);
    });
  }

  // ── ピッカー modal ─────────────────────────────────────
  // slotIdx (0..7) = 編集対象 plank の DOM順 index
  function openPicker(slotIdx) {
    const T_ = window.T || {};
    const master = window.WWM_QISHU_ICONS || {};
    const cats = window.WWM_QISHU_CATEGORIES; // 将来投入 (qishu_categories.json)。 無ければ全件 1 セクション
    // master 全 id (数値のみ、 _meta 除外)
    const allIds = Object.keys(master).filter(k => /^\d+$/.test(k)).map(Number).sort((a,b)=>a-b);
    // カテゴリ section build — categories 無ければ「全て」1 セクション
    let sections;
    if (cats && cats.categories && cats.categories.length) {
      sections = cats.categories.map(cat => ({
        title: (cat.names && (cat.names[_curLang()] || cat.names.en || cat.names.ja)) || cat.key,
        ids: cat.ids.filter(id => master[id])
      }));
      // categories に無い id を「その他」へ
      const covered = new Set(sections.flatMap(s => s.ids));
      const orphan = allIds.filter(id => !covered.has(id));
      if (orphan.length) sections.push({ title: T_.qishuCategoryOther || 'その他', ids: orphan });
    } else {
      sections = [{ title: T_.qishuCategoryAll || '全奇術', ids: allIds }];
    }

    // 既存 modal 撤去
    const exist = document.getElementById('wwmQishuPickerModal');
    if (exist) exist.remove();

    const bgIconUrl = 'https://www.wherewindsmeetgame.com/pc/qt/20251203102905/data/base_school/images/673325b5e3e9f9f38a72b8baeazshLYQ05.png';
    const m = document.createElement('div');
    m.id = 'wwmQishuPickerModal';
    m.className = 'wwm-modal-backdrop';
    const titleJa = T_.qishuPickerTitle || '奇術選択';
    const titleEn = 'QISHU';
    const seal = '選';

    const sectionsHtml = sections.map(sec => {
      const cellsHtml = sec.ids.map(id => {
        const url = _safeUrl(master[id]?.pic_url || '');
        const nm = _qishuName(id);
        const nmE = _esc(nm);
        return `<button type="button" class="wwm-qishu-picker-cell" data-id="${Number(id)}" title="${nmE}">
                  <span class="wwm-qishu-picker-diamond"><img src="${_esc(url)}" alt=""></span>
                  <span class="wwm-qishu-picker-name">${nmE}</span>
                </button>`;
      }).join('');
      return `<section class="wwm-qishu-picker-sec">
                <h3 class="wwm-qishu-picker-sec-title">${_esc(sec.title)}</h3>
                <div class="wwm-qishu-picker-grid">${cellsHtml}</div>
              </section>`;
    }).join('');

    const slotLabel = (T_.qishuPickerSlotLabel || 'スロット') + ' ' + (slotIdx + 1);
    m.innerHTML = `
      <div class="wwm-modal wwm-modal-square wwm-tool-modal wwm-modal-wide">
        <span class="wwm-tool-bracket wwm-tool-bracket-tl"></span><span class="wwm-tool-bracket wwm-tool-bracket-tr"></span>
        <span class="wwm-tool-bracket wwm-tool-bracket-bl"></span><span class="wwm-tool-bracket wwm-tool-bracket-br"></span>
        <div class="wwm-modal-header">
          <h2>
            <span class="wwm-tool-title-ja">${_esc(titleJa)}</span>
            <span class="wwm-tool-title-en">${_esc(titleEn)}</span>
            <span class="wwm-tool-seal">${_esc(seal)}</span>
          </h2>
          <button class="wwm-modal-close" aria-label="Close">×</button>
        </div>
        <div class="wwm-modal-body wwm-ws-paper">
          <div class="wwm-modal-bg-icon" style="background-image:url('${_esc(_safeUrl(bgIconUrl))}');"></div>
          <div class="wwm-qishu-picker-info">${_esc(slotLabel)}</div>
          ${sectionsHtml}
        </div>
        <div class="wwm-tool-modal-footer">
          <button type="button" class="wwm-btn-secondary" id="wwmQishuClearBtn">${_esc(T_.qishuPickerClear || 'このスロットをクリア')}</button>
          <button type="button" class="wwm-btn-secondary" id="wwmQishuResetBtn">${_esc(T_.qishuPickerReset || '全 8 枠を初期化')}</button>
          <button type="button" class="wwm-btn-secondary" id="wwmQishuCancelBtn">${_esc(T_.qishuPickerCancel || 'キャンセル')}</button>
        </div>
      </div>`;
    document.body.appendChild(m);

    function close() { m.remove(); }
    function applyAndClose() {
      // virtual.qishu 永続化 + grid 再 render
      if (typeof window._saveVirtuals === 'function') window._saveVirtuals();
      render(window.WWMState?.roleInfo);
      close();
    }

    m.querySelector('.wwm-modal-close').addEventListener('click', close);
    m.querySelector('#wwmQishuCancelBtn').addEventListener('click', close);

    // cell クリック = この slot に id 配置
    m.querySelectorAll('.wwm-qishu-picker-cell').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id, 10);
        if (!id) return;
        const vq = _ensureVirtual();
        if (!vq) return;
        vq[slotIdx] = id;
        applyAndClose();
      });
    });
    // この slot のみクリア
    m.querySelector('#wwmQishuClearBtn').addEventListener('click', () => {
      const vq = _ensureVirtual();
      if (!vq) return;
      vq[slotIdx] = null;
      applyAndClose();
    });
    // 全 8 枠を import 値 (roleInfo._qishuIds) へ戻す = virtual.qishu = null
    m.querySelector('#wwmQishuResetBtn').addEventListener('click', () => {
      if (window.WWMState) window.WWMState.virtual.qishu = null;
      if (typeof window._saveVirtuals === 'function') window._saveVirtuals();
      render(window.WWMState?.roleInfo);
      close();
    });
    // 背景クリック = キャンセル
    m.addEventListener('click', (e) => { if (e.target === m) close(); });
  }

  // ── 各 plank クリックで openPicker (event delegation) ─
  function _bindClicks() {
    const grid = document.getElementById('wwmQishuGrid');
    if (!grid || grid.dataset.qishuClickBound === '1') return;
    grid.dataset.qishuClickBound = '1';
    grid.addEventListener('click', (e) => {
      // import 前 = showImportToast (index.html inline) に委譲 = ここでは何もしない
      if (!window.WWMState?.roleInfo) return;
      const slot = e.target.closest('.wwm-qishu-slot');
      if (!slot || !grid.contains(slot)) return;
      const idx = parseInt(slot.dataset.qishuSlot, 10);
      if (Number.isNaN(idx) || idx < 0 || idx > 7) return;
      // SHARE mode で操作 block
      if (window.WWMState?.blockIfShared?.(window.T?.sharedBuildShareBlocked)) return;
      openPicker(idx);
    });
  }
  // DOM ready 後 bind (初回 render 前後問わず)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _bindClicks);
  } else {
    _bindClicks();
  }

  window.WWMSidebar.qishu = { render: render, openPicker: openPicker };
})();
