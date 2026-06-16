// WWM-METRICS Sidebar - modal helpers
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
  const _modalObserver = new MutationObserver((mutations) => {
    for (const mut of mutations) {
      for (const node of mut.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.classList?.contains('wwm-modal-backdrop')) _setupModalA11y(node);
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
    if (window.T && window.T.noteSpec) return window.T.noteSpec;
    return `
      <div class="wwm-note-section">
        <h3 class="wwm-note-h3">ツール概要</h3>
        <p class="wwm-note-p">風燕伝 (Where Winds Meet) 装備強度の比較・最適化ツール。<b>武格指数</b> を中心に、装備/調律・定音オプション/武術/心法/装備一式効果を統合してダメージ期待値を算出し、装備改善方針を提示する。</p>
      </div>
      <div class="wwm-note-section">
        <h3 class="wwm-note-h3">データ取得 (前提)</h3>
        <p class="wwm-note-p">本ツールは <b>公式データツール拡張</b> からインポートしたデータを元に動作する。インポートするまで装備情報・スコアは表示されない。インポートデータはブラウザの localStorage に保存され、再起動後も保持される。</p>
      </div>
      <div class="wwm-note-section">
        <h3 class="wwm-note-h3">武格指数 (Martial Index) とは</h3>
        <p class="wwm-note-p">装備/調律・定音オプション/武術/心法/装備一式効果を全て込みで、<b>全プレイヤー共通の固定係数</b> でダメージ期待値を算出した指標。世界等級や敵側パラメータの個人差を排除しているため、装備の絶対強度を比較できる。</p>
      </div>
      <div class="wwm-note-section">
        <h3 class="wwm-note-h3">Tier 判定基準</h3>
        <p class="wwm-note-p"><b>装備最適化提案を全て適用した時の最大スコア</b> を 100% として、現在の武格指数の比率で判定。インポート時に基準確定、再インポートで更新。</p>
        <ul class="wwm-note-list">
          <li><b>SS:</b> 最大の 95% 以上</li>
          <li><b>S:</b> 90% 以上</li>
          <li><b>A:</b> 80% 以上</li>
          <li><b>B:</b> 65% 以上</li>
          <li><b>C:</b> 未満</li>
        </ul>
      </div>
      <div class="wwm-note-section">
        <h3 class="wwm-note-h3">計算に反映される効果</h3>
        <ul class="wwm-note-list">
          <li>装備 基本ステータス (外功攻撃力/属性攻撃力 等)</li>
          <li>調律/定音オプション (調律1〜5、 定音1〜5)</li>
          <li>武術才能効果 (会心率上限 +Δ、 path 別 攻撃/貫通/属性ダメ 強化 等)</li>
          <li>心法 Tier 効果 (Tier2/5 表示反映 + Tier0/1/3/4/6 裏加算)</li>
          <li>装備二点一式効果 (2点装備で発動する加算系)</li>
          <li>装備四点一式効果 (4点装備で +100 固定ボーナス、 各装備に均等配賦)</li>
          <li>基礎値 (体/力/防/速/会) → 派生 (基本ステータス・判定確率)</li>
        </ul>
      </div>
      <div class="wwm-note-section">
        <h3 class="wwm-note-h3">計算に反映されない効果</h3>
        <ul class="wwm-note-list">
          <li>装備四点一式効果の条件付効果 (気血/真気/受流/重撃 トリガー等) — 一律 +100 固定で代替</li>
          <li>観音 (ゲーム内ステータス非影響と判明、 ステ画面に反映されないため計算対象外)</li>
          <li>PvP 専用定音 (定音6枠) — 表示のみ、 計算寄与なし</li>
        </ul>
      </div>
      <div class="wwm-note-section">
        <h3 class="wwm-note-h3">計算前提値 (固定)</h3>
        <ul class="wwm-note-list">
          <li><b>外功攻撃係数:</b> ×1.5</li>
          <li><b>ステータス攻撃係数:</b> ×1.5</li>
          <li><b>付加外功:</b> +230</li>
          <li><b>属性強化 (主):</b> ×1.5</li>
          <li><b>属性強化 (副):</b> ×1.0</li>
          <li><b>大世界等級:</b> 現在のアップデート状況に応じた上限値 (グローバル基準)</li>
          <li><b>武術等級:</b> キャラクター Lv と同一</li>
          <li><b>敵パラメータ:</b> charLv ≥ 96 → 敵Lv96 (DEF 405 / 審判耐性 1.65)、 未満 → 敵Lv91 (DEF 350 / 審判耐性 1.45)</li>
          <li><b>キャラクター基本ステータス:</b> キャラクター才能/シングルプレイレベル ボーナス/五音太平楽 を含むステータス加算値を <b>振り切れているもの</b> として算出</li>
        </ul>
      </div>
      <div class="wwm-note-section">
        <h3 class="wwm-note-h3">データバージョン管理</h3>
        <p class="wwm-note-p">ゲーム側のバランス調整などでツール側の計算式が更新された際、既存の武格指数 (baseline) は破棄され、最上部に <b>再インポート促しバナー</b> が表示される。再インポート後、新しい計算式で武格指数が再算出される。</p>
      </div>
      <div class="wwm-note-section">
        <h3 class="wwm-note-h3">主要機能</h3>
        <ul class="wwm-note-list">
          <li><b>武具対照:</b> 現在装備と新規装備の affix 差分シミュレーション。スコア変動を即時プレビュー</li>
          <li><b>心法対照:</b> 心法の差替えシミュレーション。Tier 別効果と発動条件を比較</li>
          <li><b>装備最適化提案:</b> affix の理想配分を逆算し、 現在からの改善ステップを順に提示</li>
          <li><b>プリセット保存:</b> 試行中の装備構成を保存・呼出し可能</li>
          <li><b>OBS Share:</b> サイドバーのみ表示する配信用 URL を生成 (透明背景・色調カスタム対応)</li>
          <li><b>4言語対応 (日/英/中/韓) + ライト/ダーク切替</b></li>
        </ul>
      </div>
      <div class="wwm-note-section">
        <h3 class="wwm-note-h3">計算式 (要約)</h3>
        <pre class="wwm-note-pre">expected = normalAvg × pNormal
           + critAvg × pCrit
           + sympathyDmg × pSympathy
           + grazeDmg × pGraze

各 dmg = (物理 + 属性) × 全武術ダメ × 外功増伤 × 軽減
statusScore = expected を固定係数で再計算したもの
finalScore  = statusScore + 4-set bonus (4個セット発動時)</pre>
      </div>
    `;
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
