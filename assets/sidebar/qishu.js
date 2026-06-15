/* assets/sidebar/qishu.js — 奇術 grid render + 全画面エディタ (2026-06-13 v6 — Phase B v2)
   兄貴 2026-06-13: 公式 UI 風 1 画面化 — 左=設定済8枠 (縦十字×2) / 右=奇術一覧。
                    D&D で配置/入替/外す。 採用ボタンで確定。 復元で baseline (import値) へ初期化。
   WWMState.virtual.qishu (兄貴入替) 優先 / 無ければ roleInfo._qishuIds (import 値) fallback。
   最大8枠 id を #wwmQishuGrid の ひし形 plank に配置。
   id → window.WWM_QISHU_ICONS[id].pic_url で公式 CDN URL 解決 (data-store.js eager load 済)。
   DOM順 ①..⑧ → 右 cluster (①左/②上/③右/④下) + 左 cluster (⑤左/⑥上/⑦右/⑧下)。
   export.js _qishuRow / _QISHU_POS と同構造。 アイコン filter は workspace.css の
   .wwm-ws-paper .plank-icon-wrap img rule (装備/心法 と共通 muted 茶色) が自動適用。 */
(function(){
  if (!window.WWMSidebar) window.WWMSidebar = {};
  // [cluster index (0=左DOM, 1=右DOM, ただし表示は左→右), 'left'|'top'|'right'|'bottom']
  // export.js _QISHU_POS と完全同期。 DOM順 ①..⑧ → cluster 1 (= 表示の 右側) ①..④ +
  // cluster 0 (= 表示の 左側) ⑤..⑧
  const _QISHU_POS = [
    [1, 'left'], [1, 'top'], [1, 'right'], [1, 'bottom'],
    [0, 'left'], [0, 'top'], [0, 'right'], [0, 'bottom']
  ];
  // modal stage 用 配置 (縦 2 cluster、 上 cluster=DOM順 1-4 / 下 cluster=5-8)
  const _STAGE_POS = [
    'left', 'top', 'right', 'bottom',
    'left', 'top', 'right', 'bottom'
  ];

  function _curLang() {
    return (window.currentLang) || (document.documentElement.lang) || 'ja';
  }
  // ── XSS 防止 ───────────────────────────────────────────
  const _ESC_MAP = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' };
  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => _ESC_MAP[c]); }
  function _safeUrl(u) {
    if (typeof u !== 'string') return '';
    if (!/^https?:\/\//i.test(u)) return '';
    return u.replace(/[<>"'\\]/g, '');
  }
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

  function _effectiveIds() {
    const vq = window.WWMState?.virtual?.qishu;
    if (vq && vq.length) return vq.slice();
    const ri = window.WWMState?.roleInfo;
    return (ri && ri._qishuIds) ? ri._qishuIds.slice() : [];
  }
  function _baselineIds() {
    const ri = window.WWMState?.roleInfo;
    const base = (ri && ri._qishuIds) ? ri._qishuIds.slice() : [];
    while (base.length < 8) base.push(null);
    return base.slice(0, 8);
  }
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

  // ── grid render (sidebar 表示) ─────────────────────────
  function render(ri) {
    const grid = document.getElementById('wwmQishuGrid');
    if (!grid) return;
    const ids = _effectiveIds();
    const master = window.WWM_QISHU_ICONS || {};
    const clusters = grid.querySelectorAll('.wwm-qishu-cluster');
    if (clusters.length < 2) return;
    grid.querySelectorAll('.wwm-qishu-slot .plank-icon-wrap').forEach(w => { w.textContent = ''; });
    ids.forEach((id, i) => {
      const pos = _QISHU_POS[i];
      if (!pos) return;
      const cluster = clusters[pos[0]];
      if (!cluster) return;
      const slot = cluster.querySelector('.wwm-qishu-slot.q-' + pos[1]);
      if (!slot) return;
      slot.dataset.qishuSlot = String(i);
      slot.style.cursor = window.WWMState?.roleInfo ? 'pointer' : '';
      const nm = id ? _qishuName(id) : '';
      slot.setAttribute('title', nm || (window.T?.qishuPickerEmpty || '(空き)'));
      if (!id) return;
      const m = master[id];
      if (!m || !m.pic_url) return;
      const wrap = slot.querySelector('.plank-icon-wrap');
      if (!wrap) return;
      const img = document.createElement('img');
      img.src = m.pic_url;
      img.alt = nm;
      wrap.appendChild(img);
    });
  }

  // ── エディタ modal (全画面 1 枚) ───────────────────────
  let _working = null; // 8 entries 編集 buffer

  function openPicker(_ignoredSlotIdx) {
    const T_ = window.T || {};
    const master = window.WWM_QISHU_ICONS || {};
    const cats = window.WWM_QISHU_CATEGORIES;
    const PASSIVE_OVERRIDES = new Set([315]); // Moonleap Morph
    const allIds = Object.keys(master).filter(k => {
      if (!/^\d+$/.test(k)) return false;
      const m = master[k];
      if (!m || m.is_post !== 1) return false;
      if (PASSIVE_OVERRIDES.has(Number(k))) return false;
      return true;
    }).map(Number).sort((a,b)=>a-b);

    let sections;
    if (cats && cats.categories && cats.categories.length) {
      sections = cats.categories.map(cat => ({
        title: (cat.names && (cat.names[_curLang()] || cat.names.en || cat.names.ja)) || cat.key,
        ids: cat.ids.filter(id => master[id])
      }));
      const covered = new Set(sections.flatMap(s => s.ids));
      const orphan = allIds.filter(id => !covered.has(id));
      if (orphan.length) sections.push({ title: T_.qishuCategoryOther || 'その他', ids: orphan });
    } else {
      sections = [{ title: T_.qishuCategoryAll || '全奇術', ids: allIds }];
    }

    // 作業 buffer = 現 effective を 8 枠に詰めて開始
    _working = _effectiveIds();
    while (_working.length < 8) _working.push(null);
    _working = _working.slice(0, 8);

    const exist = document.getElementById('wwmQishuPickerModal');
    if (exist) exist.remove();

    const bgIconUrl = 'https://www.wherewindsmeetgame.com/pc/qt/20251203102905/data/base_school/images/673325b4abfa69339f37742bDCHcUAsd05.png';
    const m = document.createElement('div');
    m.id = 'wwmQishuPickerModal';
    m.className = 'wwm-modal-backdrop';
    const titleJa = T_.qishuPickerTitle || '奇術選択';
    const titleEn = 'QISHU';
    const seal = '選';

    m.innerHTML = `
      <div class="wwm-modal wwm-modal-square wwm-tool-modal wwm-modal-wide wwm-qishu-editor-modal">
        <span class="wwm-tool-bracket wwm-tool-bracket-tl"></span><span class="wwm-tool-bracket wwm-tool-bracket-tr"></span>
        <span class="wwm-tool-bracket wwm-tool-bracket-bl"></span><span class="wwm-tool-bracket wwm-tool-bracket-br"></span>
        <div class="wwm-modal-header">
          <h2>
            <span class="wwm-tool-title-ja" data-kaisho="qishuPickerTitle">${_esc(titleJa)}</span>
            <span class="wwm-tool-title-en">${_esc(titleEn)}</span>
            <span class="wwm-tool-seal">${_esc(seal)}</span>
          </h2>
          <button class="wwm-modal-close" aria-label="Close">×</button>
        </div>
        <div class="wwm-modal-body wwm-ws-paper">
          <div class="wwm-modal-bg-icon" style="background-image:url('${_esc(_safeUrl(bgIconUrl))}');"></div>
          <div class="wwm-qishu-editor">
            <aside class="wwm-qishu-editor-stage" data-droptarget="stage-pad">
              <h3 class="wwm-qishu-editor-col-title">${_esc(T_.qishuPickerStageTitle || '装備中')}</h3>
              <div class="wwm-qishu-editor-clusters">
                <div class="wwm-qishu-cluster" data-cluster="0"></div>
                <div class="wwm-qishu-cluster" data-cluster="1"></div>
              </div>
              <p class="wwm-qishu-editor-hint">${_esc(T_.qishuPickerHint || 'ドラッグで配置')}</p>
            </aside>
            <section class="wwm-qishu-editor-list" data-droptarget="list">
              <h3 class="wwm-qishu-editor-col-title">${_esc(T_.qishuPickerListTitle || '奇術一覧')}</h3>
              <div class="wwm-qishu-editor-list-scroll"></div>
            </section>
          </div>
        </div>
        <div class="wwm-tool-modal-footer">
          <button type="button" class="wwm-btn-secondary" id="wwmQishuRestoreBtn">${_esc(T_.qishuPickerRestore || '復元')}</button>
          <button type="button" class="wwm-btn-secondary" id="wwmQishuCancelBtn">${_esc(T_.qishuPickerCancel || 'キャンセル')}</button>
          <button type="button" class="wwm-btn-primary" id="wwmQishuApplyBtn">${_esc(T_.qishuPickerApply || '採用')}</button>
        </div>
      </div>`;
    document.body.appendChild(m);

    const stageEl = m.querySelector('.wwm-qishu-editor-stage');
    const listScrollEl = m.querySelector('.wwm-qishu-editor-list-scroll');

    // ── stage slot HTML build ──────────────────────────
    function _buildStage() {
      const clusters = stageEl.querySelectorAll('.wwm-qishu-cluster');
      [0,1].forEach(ci => {
        const cluster = clusters[ci];
        if (!cluster) return;
        cluster.innerHTML = '';
        for (let pi = 0; pi < 4; pi++) {
          const idx = ci * 4 + pi;
          const pos = _STAGE_POS[idx];
          const slot = document.createElement('div');
          slot.className = 'wwm-qishu-slot q-' + pos;
          slot.dataset.editorSlot = String(idx);
          slot.setAttribute('draggable', 'true');
          slot.setAttribute('data-droptarget', 'stage-slot');
          const paint = document.createElement('div');
          paint.className = 'plank-paint';
          const wrap = document.createElement('div');
          wrap.className = 'plank-icon-wrap';
          slot.appendChild(paint);
          slot.appendChild(wrap);
          cluster.appendChild(slot);
        }
      });
      _refreshStage();
    }
    function _refreshStage() {
      const slots = stageEl.querySelectorAll('.wwm-qishu-slot');
      slots.forEach(slot => {
        const idx = parseInt(slot.dataset.editorSlot, 10);
        const id = _working[idx];
        const wrap = slot.querySelector('.plank-icon-wrap');
        if (wrap) wrap.textContent = '';
        if (id) {
          const url = master[id]?.pic_url;
          const nm = _qishuName(id);
          slot.setAttribute('title', nm);
          slot.classList.remove('is-empty');
          if (url && wrap) {
            const img = document.createElement('img');
            img.src = url;
            img.alt = nm;
            img.setAttribute('draggable', 'false');
            wrap.appendChild(img);
          }
        } else {
          slot.setAttribute('title', T_.qishuPickerEmpty || '(空き)');
          slot.classList.add('is-empty');
        }
      });
    }

    // ── list HTML build ────────────────────────────────
    function _buildList() {
      const html = sections.map(sec => {
        const cells = sec.ids.map(id => {
          const url = _safeUrl(master[id]?.pic_url || '');
          const nm = _qishuName(id);
          const nmE = _esc(nm);
          return `<button type="button" class="wwm-qishu-picker-cell" data-id="${Number(id)}" draggable="true" title="${nmE}">
                    <span class="wwm-qishu-picker-diamond"><img src="${_esc(url)}" alt="" draggable="false"></span>
                    <span class="wwm-qishu-picker-name">${nmE}</span>
                    <span class="wwm-qishu-picker-equipped">${_esc(T_.qishuPickerEquipped || '装備中')}</span>
                  </button>`;
        }).join('');
        return `<section class="wwm-qishu-picker-sec">
                  <h4 class="wwm-qishu-picker-sec-title">${_esc(sec.title)}</h4>
                  <div class="wwm-qishu-picker-grid">${cells}</div>
                </section>`;
      }).join('');
      listScrollEl.innerHTML = html;
      _refreshList();
    }
    function _refreshList() {
      const equipped = new Set(_working.filter(Boolean));
      listScrollEl.querySelectorAll('.wwm-qishu-picker-cell').forEach(cell => {
        const id = parseInt(cell.dataset.id, 10);
        if (equipped.has(id)) {
          cell.classList.add('is-equipped');
          cell.setAttribute('draggable', 'false');
        } else {
          cell.classList.remove('is-equipped');
          cell.setAttribute('draggable', 'true');
        }
      });
    }

    _buildStage();
    _buildList();

    // ── D&D ───────────────────────────────────────────
    // payload: {kind:'list', id} or {kind:'stage', slot}
    let _dragPayload = null;
    function _onDragStart(e) {
      const cell = e.target.closest('.wwm-qishu-picker-cell');
      const slot = e.target.closest('.wwm-qishu-slot[data-editor-slot]');
      if (cell && !cell.classList.contains('is-equipped')) {
        _dragPayload = { kind: 'list', id: parseInt(cell.dataset.id, 10) };
        e.dataTransfer.effectAllowed = 'copy';
        try { e.dataTransfer.setData('text/plain', 'list:' + _dragPayload.id); } catch (_) {}
        cell.classList.add('is-dragging');
      } else if (slot) {
        const idx = parseInt(slot.dataset.editorSlot, 10);
        if (!_working[idx]) { e.preventDefault(); return; }
        _dragPayload = { kind: 'stage', slot: idx };
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', 'stage:' + idx); } catch (_) {}
        slot.classList.add('is-dragging');
      }
    }
    function _onDragEnd() {
      m.querySelectorAll('.is-dragging').forEach(el => el.classList.remove('is-dragging'));
      m.querySelectorAll('.is-drop-hover').forEach(el => el.classList.remove('is-drop-hover'));
      _dragPayload = null;
    }
    function _onDragOver(e) {
      if (!_dragPayload) return;
      const slot = e.target.closest('.wwm-qishu-slot[data-editor-slot]');
      const listArea = e.target.closest('[data-droptarget="list"]');
      if (slot) {
        e.preventDefault();
        e.dataTransfer.dropEffect = (_dragPayload.kind === 'stage') ? 'move' : 'copy';
        stageEl.querySelectorAll('.is-drop-hover').forEach(el => el.classList.remove('is-drop-hover'));
        slot.classList.add('is-drop-hover');
      } else if (listArea && _dragPayload.kind === 'stage') {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        listArea.classList.add('is-drop-hover');
      }
    }
    function _onDragLeaveList(e) {
      const listArea = e.currentTarget;
      if (!listArea.contains(e.relatedTarget)) listArea.classList.remove('is-drop-hover');
    }
    function _onDrop(e) {
      if (!_dragPayload) return;
      const slot = e.target.closest('.wwm-qishu-slot[data-editor-slot]');
      const listArea = e.target.closest('[data-droptarget="list"]');
      if (slot) {
        e.preventDefault();
        const targetIdx = parseInt(slot.dataset.editorSlot, 10);
        if (_dragPayload.kind === 'list') {
          const id = _dragPayload.id;
          // 重複防止 — 同 id が他枠にあれば swap (drop 先 ↔ 既存枠)
          const dupIdx = _working.indexOf(id);
          if (dupIdx >= 0 && dupIdx !== targetIdx) {
            _working[dupIdx] = _working[targetIdx]; // 既存枠に drop 先の旧値
          }
          _working[targetIdx] = id;
        } else if (_dragPayload.kind === 'stage') {
          const srcIdx = _dragPayload.slot;
          if (srcIdx !== targetIdx) {
            const tmp = _working[targetIdx];
            _working[targetIdx] = _working[srcIdx];
            _working[srcIdx] = tmp;
          }
        }
        _refreshStage();
        _refreshList();
      } else if (listArea && _dragPayload.kind === 'stage') {
        e.preventDefault();
        _working[_dragPayload.slot] = null;
        _refreshStage();
        _refreshList();
      }
      _onDragEnd();
    }

    m.addEventListener('dragstart', _onDragStart);
    m.addEventListener('dragend', _onDragEnd);
    m.addEventListener('dragover', _onDragOver);
    m.addEventListener('drop', _onDrop);
    const listArea = m.querySelector('[data-droptarget="list"]');
    if (listArea) listArea.addEventListener('dragleave', _onDragLeaveList);

    // ── action ───────────────────────────────────────
    function close() { m.remove(); _working = null; }
    function applyAndClose() {
      const vq = _ensureVirtual();
      if (!vq) { close(); return; }
      for (let i = 0; i < 8; i++) vq[i] = _working[i] || null;
      if (typeof window._saveVirtuals === 'function') window._saveVirtuals();
      render(window.WWMState?.roleInfo);
      close();
    }
    function restore() {
      _working = _baselineIds();
      _refreshStage();
      _refreshList();
    }

    m.querySelector('.wwm-modal-close').addEventListener('click', close);
    m.querySelector('#wwmQishuCancelBtn').addEventListener('click', close);
    m.querySelector('#wwmQishuApplyBtn').addEventListener('click', applyAndClose);
    m.querySelector('#wwmQishuRestoreBtn').addEventListener('click', restore);
    m.addEventListener('click', (e) => { if (e.target === m) close(); });
  }

  // ── grid plank クリック → エディタ open (どの枠でも同 modal) ─
  function _bindClicks() {
    const grid = document.getElementById('wwmQishuGrid');
    if (!grid || grid.dataset.qishuClickBound === '1') return;
    grid.dataset.qishuClickBound = '1';
    grid.addEventListener('click', (e) => {
      if (!window.WWMState?.roleInfo) return;
      const slot = e.target.closest('.wwm-qishu-slot');
      if (!slot || !grid.contains(slot)) return;
      if (window.WWMState?.blockIfShared?.(window.T?.sharedBuildShareBlocked)) return;
      openPicker();
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _bindClicks);
  } else {
    _bindClicks();
  }

  window.WWMSidebar.qishu = { render: render, openPicker: openPicker };
})();
