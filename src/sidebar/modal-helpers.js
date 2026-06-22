// WWMetrics Sidebar - modal helpers
// Phase 3.1: sidebar.js から modal a11y / 巻物NOTE / changelog 系 切出。
//   - _setupModalA11y + MutationObserver + Esc key listener
//   - _CHANGELOG_KEY + _semver + _checkChangelog + _showAllChangelogs (+ WWMChangelog global)
//   - _ghIssueUrl + _specHtml + _changelogHtml + _showNoteModal
//   - _showScoreFormula (+ WWMHelp.showScoreFormula global)
//   - _tpl + _optionTerm (i18n template helpers、 diag.js で使用)
//
// 依存: window.T (i18n)、 window.WWM_SCORE_VERSION、 window.currentLang
// 公開: window.WWMSidebar.modalHelpers + window.WWMChangelog + window.WWMHelp

(function () {
  'use strict';

  // ── Esc キーで最前面 modal 閉じる ────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const backdrops = document.querySelectorAll('.wwm-modal-backdrop');
    if (!backdrops.length) return;
    const top = backdrops[backdrops.length - 1];
    top.remove();
    e.stopPropagation();
  });

  // ── modal a11y自動付与 + focus trap (MutationObserver経由、既存呼出無改変) ─
  function _setupModalA11y(modal) {
    if (modal._a11ySetup) return;
    modal._a11ySetup = true;
    if (!modal.getAttribute('role')) modal.setAttribute('role', 'dialog');
    if (!modal.getAttribute('aria-modal')) modal.setAttribute('aria-modal', 'true');
    const _focusSel = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    modal._prevFocus = document.activeElement;
    setTimeout(() => {
      const focusable = modal.querySelectorAll(_focusSel);
      const closeBtn = modal.querySelector('.wwm-modal-close');
      const target = closeBtn || focusable[0];
      if (target) try { target.focus(); } catch(_) {}
    }, 0);
    modal.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const focusable = modal.querySelectorAll(_focusSel);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    });
  }
  // ── 巻物展開 close アニメ proxy (2026-06-21 兄貴指示): backdrop.remove() を wrap、
  //    is-closing class 付与 → animationend で実 remove。 既存 close 呼出 (Esc/× button/outside click) 無改変
  function _wrapBackdropCloseAnim(node) {
    if (node._closeAnimWrapped) return;
    node._closeAnimWrapped = true;
    const origRemove = node.remove.bind(node);
    node.remove = function () {
      if (node.classList.contains('is-closing')) { origRemove(); return; }
      node.classList.add('is-closing');
      let done = false;
      const finish = () => { if (done) return; done = true; origRemove(); };
      node.addEventListener('animationend', finish, { once: true });
      setTimeout(finish, 500); // fallback (animation 0.4s + buffer)
    };
  }
  const _modalObserver = new MutationObserver((mutations) => {
    for (const mut of mutations) {
      for (const node of mut.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.classList?.contains('wwm-modal-backdrop')) {
          _setupModalA11y(node);
          _wrapBackdropCloseAnim(node);
        }
      }
      for (const node of mut.removedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.classList?.contains('wwm-modal-backdrop') && node._prevFocus) {
          try { node._prevFocus.focus(); } catch(_) {}
        }
      }
    }
  });
  _modalObserver.observe(document.body, { childList: true });

  // ── Changelog ポップアップ ───────────────────────────────────────
  const _CHANGELOG_KEY = 'wwm_last_seen_version_v1';
  function _semver(a, b) {
    const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if ((pa[i]||0) > (pb[i]||0)) return 1;
      if ((pa[i]||0) < (pb[i]||0)) return -1;
    }
    return 0;
  }
  async function _checkChangelog() {
    try {
      const cl = await fetch('data/changelog.json?v=' + (window.WWM_DISPLAY_VERSION || 42)).then(r => r.json());
      if (!cl?.current) return;
      const seen = localStorage.getItem(_CHANGELOG_KEY);
      if (!seen) {
        localStorage.setItem(_CHANGELOG_KEY, cl.current);
        return;
      }
      if (_semver(seen, cl.current) >= 0) return;
      const entries = (cl.entries || []).filter(e => _semver(e.version, seen) > 0);
      if (!entries.length) {
        localStorage.setItem(_CHANGELOG_KEY, cl.current);
        return;
      }
      _showNoteModal({ defaultTab: 'changelog', entries, persistVer: cl.current });
    } catch (e) {}
  }

  // ── NOTE modal (巻物 UI、 仕様 + 更新履歴 タブ統合) ──────────
  function _ghIssueUrl(kind) {
    const base = 'https://github.com/Sh1get0ra/WWM-METRICS/issues/new?';
    if (kind === 'bug') {
      return base + 'labels=bug&title=' + encodeURIComponent('[bug] ')
        + '&body=' + encodeURIComponent('## 現象\n\n## 再現手順\n\n## 期待動作\n\n## 環境 (OS / ブラウザ / 言語)\n');
    }
    return base + 'labels=enhancement&title=' + encodeURIComponent('[request] ')
      + '&body=' + encodeURIComponent('## 要望内容\n\n## 理由 / ユースケース\n');
  }
  function _specHtml() {
    return (window.T && window.T.noteSpec) || '';
  }
  function _changelogHtml(entries) {
    const lang = (window.currentLang) || 'ja';
    const _itemHtml = (it) => {
      if (typeof it === 'string') return `<li>${it}</li>`;
      const txt = it[lang] || it.en || it.ja || '';
      if (it.featured) return `<li class="wwm-note-cl-featured">${txt}</li>`;
      return `<li>${txt}</li>`;
    };
    return entries.map(e => `
      <div class="wwm-note-cl-entry">
        <div><span class="wwm-note-cl-ver">v${e.version}</span><span class="wwm-note-cl-date">${e.date || ''}</span></div>
        <ul class="wwm-note-cl-items">${(e.items||[]).map(_itemHtml).join('')}</ul>
      </div>
    `).join('');
  }
  function _showNoteModal(opts) {
    opts = opts || {};
    const defaultTab = opts.defaultTab || 'spec';
    const entries    = opts.entries || [];
    const persistVer = opts.persistVer || null;
    const T_ = window.T || {};
    const titleJa = T_.noteTitleJa || '筆記';
    const seal    = T_.noteSeal    || '記';
    const tabSpec = T_.noteTabSpec || '仕様';
    const tabCl   = T_.noteTabChangelog || '更新履歴';
    const btnBug  = T_.noteBugReport || 'バグ報告';
    const btnReq  = T_.noteFeatureRequest || '追加要望';
    const btnTour = T_.noteTutorialBtn || 'ツアーを見る';
    const btnClose = T_.close || '閉じる';
    const ghSvg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.36-3.87-1.36-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.78 0c2.21-1.49 3.18-1.18 3.18-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.43-2.7 5.41-5.27 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.66.8.55C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z"/></svg>';
    const m = document.createElement('div');
    m.className = 'wwm-modal-backdrop';
    m.innerHTML = `
      <div class="wwm-modal wwm-tool-modal wwm-note-modal-b">
        <span class="wwm-tool-bracket wwm-tool-bracket-tl"></span><span class="wwm-tool-bracket wwm-tool-bracket-tr"></span>
        <span class="wwm-tool-bracket wwm-tool-bracket-bl"></span><span class="wwm-tool-bracket wwm-tool-bracket-br"></span>
        <div class="wwm-modal-header">
          <h2><span class="wwm-tool-title-ja" data-i18n="noteTitleJa" data-kaisho="noteTitleJa">${titleJa}</span><span class="wwm-tool-title-en">NOTE</span><span class="wwm-tool-seal">${seal}</span></h2>
          <button class="wwm-modal-close" id="wwmNoteClose" aria-label="${btnClose}">×</button>
        </div>
        <div class="wwm-tool-tabs">
          <button class="wwm-tool-tab ${defaultTab==='spec'?'active':''}" data-tab="spec">${tabSpec}</button>
          <button class="wwm-tool-tab ${defaultTab==='changelog'?'active':''}" data-tab="changelog">${tabCl}</button>
        </div>
        <div class="wwm-modal-body wwm-ws-paper" id="wwmNoteTabSpec" style="display:${defaultTab==='spec'?'block':'none'};">${_specHtml()}</div>
        <div class="wwm-modal-body wwm-ws-paper" id="wwmNoteTabChangelog" style="display:${defaultTab==='changelog'?'block':'none'};">${_changelogHtml(entries)}</div>
        <div class="wwm-tool-modal-footer">
          <button type="button" class="wwm-btn-secondary" id="wwmNoteTourBtn">${btnTour}</button>
          <a class="wwm-btn-secondary" target="_blank" rel="noopener" href="${_ghIssueUrl('bug')}">${ghSvg}${btnBug}</a>
          <a class="wwm-btn-secondary" target="_blank" rel="noopener" href="${_ghIssueUrl('req')}">${ghSvg}${btnReq}</a>
        </div>
      </div>
    `;
    document.body.appendChild(m);
    const close = () => {
      if (persistVer) { try { localStorage.setItem(_CHANGELOG_KEY, persistVer); } catch(_) {} }
      m.remove();
    };
    m.querySelector('#wwmNoteClose').addEventListener('click', close);
    m.addEventListener('click', e => { if (e.target === m) close(); });
    const tourBtn = m.querySelector('#wwmNoteTourBtn');
    if (tourBtn) tourBtn.addEventListener('click', () => {
      close();
      if (window.WWMTutorial && typeof window.WWMTutorial.start === 'function') {
        window.WWMTutorial.start(true);
      }
    });
    m.querySelectorAll('.wwm-tool-tab').forEach(t => {
      t.addEventListener('click', () => {
        m.querySelectorAll('.wwm-tool-tab').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        const tab = t.dataset.tab;
        m.querySelector('#wwmNoteTabSpec').style.display      = tab==='spec'     ? 'block' : 'none';
        m.querySelector('#wwmNoteTabChangelog').style.display = tab==='changelog'? 'block' : 'none';
      });
    });
  }
  async function _showAllChangelogs() {
    try {
      const cl = await fetch('data/changelog.json?v=' + (window.WWM_DISPLAY_VERSION || 42)).then(r => r.json());
      _showNoteModal({ defaultTab: 'spec', entries: cl.entries || [] });
    } catch (e) {
      _showNoteModal({ defaultTab: 'spec', entries: [] });
    }
  }

  // ── Help / Score Formula 説明 ────────────────────────────────────
  function _showScoreFormula() {
    _showAllChangelogs();
  }

  // ── i18n template helpers (diag.js 等で使用) ─────────────────────
  function _optionTerm() {
    const lang = (window.currentLang) || 'ja';
    return lang === 'ja' ? 'オプション' : 'affix';
  }
  function _tpl(tpl, ...args) {
    return (tpl || '').replace(/\{(\d+)\}/g, (_, i) => args[i] != null ? args[i] : '');
  }

  // ── global expose ────────────────────────────────────────────────
  window.WWMSidebar = window.WWMSidebar || {};
  window.WWMSidebar.modalHelpers = {
    setupModalA11y: _setupModalA11y,
    semver: _semver,
    ghIssueUrl: _ghIssueUrl,
    specHtml: _specHtml,
    changelogHtml: _changelogHtml,
    showNoteModal: _showNoteModal,
    showAllChangelogs: _showAllChangelogs,
    showScoreFormula: _showScoreFormula,
    optionTerm: _optionTerm,
    tpl: _tpl,
    CHANGELOG_KEY: _CHANGELOG_KEY,
  };
  window.WWMChangelog = { check: _checkChangelog, showAll: _showAllChangelogs };
  window.WWMHelp = window.WWMHelp || {};
  window.WWMHelp.showScoreFormula = _showScoreFormula;
})();
