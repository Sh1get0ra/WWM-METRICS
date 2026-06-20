// ── WWM-METRICS / Sidebar / Hero (Phase 3.9e 切出) ──
// Hero block (武格指数 / NEXT / Tier badge) 更新 + opt中の tier badge ルーレット演出。
// 依存:
//   - WWMState.{baseline, opt, allowDonut, lastResult, params}
//   - window.computeExpected
//   - 旧 sidebar.js グローバル: _set4Bonus / _getEffectiveRoleInfo
//     → arrow wrapper で window.__WWM_SET4_BONUS_OF / __WWM_GET_EFFECTIVE_ROLEINFO 経由
//   - WWMHelpers.dom.setText / window.countUp
// 公開:
//   - window.WWMSidebar.hero = { update, setMode, startRoulette, stopRoulette }
//     setMode(mode) = 席 swap (workspace.js tab 切替が guard 経由で call、 Task 6)
//   - window._startTierRoulette / window._stopTierRoulette  (opt.js が call-time lookup)
(function () {
  'use strict';

  // call-time lookup
  const _set4Bonus            = (ri) => window.__WWM_SET4_BONUS_OF(ri);
  const _getEffectiveRoleInfo = () => (typeof window.__WWM_GET_EFFECTIVE_ROLEINFO === 'function' ? window.__WWM_GET_EFFECTIVE_ROLEINFO() : null);

  // ── Tier badge ルーレット (opt中の演出、 sidebar mini-hero + heroパネル 両対応) ─────
  let _tierRouletteIntv = null;
  const _ROULETTE_GLYPHS = [
    'SS', 'S', 'A', 'B', 'C',
    '★', '◆', '◇', '▲', '▼', '●', '■',
    '%', '&', '*', '#', '@', '?', '+', '×', '⚡', '✦', '✧', '♠', '♣'
  ];
  function startRoulette() {
    // best 既に確定済 (LOCKED=true、 reload復元含む) → tier 固定値が即出るので演出不要。スキップ。
    if (WWMState.opt.locked) return;
    const sbTb   = document.getElementById('wwmSbTierBadge');
    const heroTb = document.getElementById('heroTierBadge');
    if (!sbTb && !heroTb) return;
    if (_tierRouletteIntv) clearInterval(_tierRouletteIntv);
    if (sbTb)   sbTb.classList.add('tier-rolling');
    if (heroTb) heroTb.classList.add('tier-rolling');
    _tierRouletteIntv = setInterval(() => {
      const g = _ROULETTE_GLYPHS[Math.floor(Math.random() * _ROULETTE_GLYPHS.length)];
      if (sbTb)   { sbTb.textContent = g;   sbTb.className   = 'wwm-sb-tier-badge tier-rolling'; }
      if (heroTb) { heroTb.textContent = g; heroTb.className = 'hero-tier tier-badge tier-rolling'; }
    }, 55);
  }
  function stopRoulette() {
    if (_tierRouletteIntv) { clearInterval(_tierRouletteIntv); _tierRouletteIntv = null; }
    const sbTb   = document.getElementById('wwmSbTierBadge');
    const heroTb = document.getElementById('heroTierBadge');
    if (sbTb)   sbTb.classList.remove('tier-rolling');
    if (heroTb) heroTb.classList.remove('tier-rolling');
  }

  // ── 席 swap: 数値とタイトルだけ入替 (identity 固定)。node 移動方式 = ID/listener 無傷 ──
  let _heroMode = 'score';
  function setMode(mode) {
    const hero = document.getElementById('heroRoot');
    if (!hero || _heroMode === mode) return;
    _heroMode = mode;
    hero.classList.add('swapping');               // fade out 220ms quart (workspace.css .swap-anim)
    setTimeout(() => {
      const main = document.getElementById('heroSeatMain');
      const sub = document.getElementById('heroSeatSub');
      const score = document.getElementById('heroBlockScore');
      const dps = document.getElementById('heroBlockDps');
      if (main && sub && score && dps) {
        if (mode === 'dps') { main.appendChild(dps); sub.appendChild(score); }
        else { main.appendChild(score); sub.appendChild(dps); }
      }
      // NEXT chip は score mode のみ。visibility で場所保持 (donut 不動 — mock 教訓)
      _syncNextVisibility();
      hero.dataset.mode = mode;
      hero.classList.remove('swapping');           // fade in + 浮き上がり
    }, 230);
  }

  // ── identity (アバター/名前/Lv/総合武力) ──
  function _syncIdentity() {
    const ri = window.WWMState ? WWMState.roleInfo : null;
    if (!ri) return;
    const av = document.getElementById('heroAvatar');
    const src = ri._avatarBase64 || ri._avatarUrl || (ri.roleAvatar && window.WWM_AVATAR_ICONS && window.WWM_AVATAR_ICONS[ri.roleAvatar]) || '';
    if (av) {
      let img = av.querySelector('img');
      if (src && !img) { img = document.createElement('img'); img.alt = ''; img.loading = 'lazy'; av.appendChild(img); }
      if (img && src && img.src !== src) img.src = src;
    }
    const nm = document.getElementById('heroName'), lv = document.getElementById('heroLv'), pw = document.getElementById('heroPower');
    if (nm && nm.firstChild && nm.firstChild.nodeType === 3) nm.firstChild.textContent = ri.roleName || '—';
    if (lv) lv.textContent = ri.level ? ('Lv ' + ri.level) : '';
    const p = ri.xiuWeiKungFu || ri.maxXiuWeiKungFu || 0;  // export.js L233 と同源
    if (pw) pw.textContent = p ? Number(p).toLocaleString() : '—';
  }

  let _nextMeaningful = false;  // update() が計算した「NEXT を見せる意味があるか」
  function _syncNextVisibility() {
    const el = document.querySelector('.hero-next-inline');
    if (!el) return;
    // mode 制約撤廃 (2026-06-15 兄貴指示): sub 配置 (戦律 panel での武格指数) でも
    // 現値→仮想値 が変動していれば表示。 NEXT label は廃止、 現値 ▶ 仮想値 表記
    el.style.visibility = _nextMeaningful ? '' : 'hidden';
  }

  // ── Hero block 更新 ────────────────────────────────────────────
  function update(params) {
    if (!params || typeof window.computeExpected !== 'function') return;
    _syncIdentity();
    // donut/arc DOM 書込みは このcomputeExpected (表示更新) のみ許可。
    // 他経路 (スコア試算/最適化/プレビュー) の computeExpected は ALLOW=false で donut を触らない。
    WWMState.allowDonut = true;
    let result;
    try {
      result = window.computeExpected(params) || WWMState.lastResult || {};
    } finally {
      WWMState.allowDonut = false;
    }
    const total = result.expected || 0;
    const effRi = _getEffectiveRoleInfo();
    const statusScore = Math.round((result.statusScore || 0) + _set4Bonus(effRi));
    const setText = window.WWMHelpers?.dom?.setText || ((id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; });
    // hero-current = baseline (import時固定) または statusScore (baseline未取得時)
    const _baseline = WWMState.baseline;
    // baseline (import時固定) があればそれ。無効/未取得時は null → 武格指数 "-" (再import促し)。
    // ※現在 statusScore へフォールバックしない (古い基準と新計算の混在を避ける)。
    const _hasBaseline = _baseline && typeof _baseline.statusScore === 'number';
    const currentScore = _hasBaseline ? Math.round(_baseline.statusScore) : null;
    if (currentScore === null) {
      setText('heroScore', '-');
    } else if (typeof window.countUp === 'function') {
      window.countUp('heroScore', currentScore, 0);
    } else {
      setText('heroScore', currentScore.toLocaleString());
    }
    // Tier 判定: 最適化最大スコア (__WWM_OPT_BEST.end、 import時固定) に対する比率で判定。opt未完了/best 無い時は空。
    // 仮閾値: SS>=95% / S>=90% / A>=80% / B>=65% (確定までに調整予定)
    const _tierFromBest = (score) => {
      const best = WWMState.opt.best?.end;
      if (!best || score == null) return '';
      const r = score / best;
      if (r >= 0.95) return 'SS';
      if (r >= 0.90) return 'S';
      if (r >= 0.80) return 'A';
      if (r >= 0.65) return 'B';
      return 'C';
    };
    const curTier = _tierFromBest(currentScore);
    const tbCur = document.getElementById('heroTierBadge');
    // opt実行中はルーレット演出に任せ、updateHero は tier badge を上書きしない (両 badge 共通)
    if (tbCur && !WWMState.opt.running) {
      tbCur.textContent = curTier;
      tbCur.className = 'hero-tier tier-badge tier-' + curTier;
    }
    // sidebar 武格指数行 tier badge + score — baseline 値で再判定 (__WWM_OPT_BEST 基準)
    const sbTb = document.getElementById('wwmSbTierBadge');
    const sbMs = document.getElementById('wwmSbMartialScore');
    // opt実行中はルーレット演出に任せて、updateHero は tier を上書きしない。
    if (sbTb && !WWMState.opt.running) {
      const baselineScore = WWMState.baseline?.statusScore;
      const baselineTier = _tierFromBest(typeof baselineScore === 'number' ? baselineScore : null);
      sbTb.textContent = baselineTier;
      sbTb.className = 'wwm-sb-tier-badge tier-' + baselineTier;
    }
    if (sbMs) {
      const baselineScore = WWMState.baseline?.statusScore;
      sbMs.textContent = (typeof baselineScore === 'number') ? Math.round(baselineScore).toLocaleString() : '-';
    }
    // NEXT 側 = 仮想装備込みの statusScore (即時反映 + countUp再同期)
    const baseline = WWMState.baseline;
    const baseEl = document.getElementById('heroScoreBaseline');
    if (baseline && typeof baseline.statusScore === 'number') {
      const baseScore = statusScore; // NEXT = 仮想装備込み
      // textContent で即時反映 (rAF 遅延中も表示崩れ防止) + countUp でアニメ
      if (baseEl) baseEl.textContent = Math.round(baseScore).toLocaleString();
      if (typeof window.countUp === 'function') {
        window.countUp('heroScoreBaseline', baseScore, 0);
      }
    } else {
      if (typeof window.countUp === 'function') window.countUp('heroScoreBaseline', currentScore, 0);
      else if (baseEl) baseEl.textContent = currentScore.toLocaleString();
    }
    // NEXT 表示制御: 確定 (baseline) と 仮想計算 (statusScore) が 丸め後同値なら NEXT 非表示。
    // = 装備変更なし時の 「9,027 ▶ 9,027」 同値表示を排除、 装備対照/最適化で仮想変更時のみ NEXT 表示。
    // currentScore null (baseline 未取得) 時も 隠す (NEXT 意味なし)。判定条件は不変。
    // 表示は visibility 方式: 場所保持で donut 位置不動 (mock 教訓)。score mode 以外は常に隠す。
    if (currentScore === null) {
      _nextMeaningful = false;
    } else {
      const nextRounded = Math.round(statusScore);
      _nextMeaningful = (nextRounded !== currentScore);
    }
    _syncNextVisibility();
  }

  window.WWMSidebar = window.WWMSidebar || {};
  window.WWMSidebar.hero = { update, setMode, startRoulette, stopRoulette };
  // opt.js が call-time で参照 (call-time arrow wrapper 経由のため window 直接 expose 必要)
  window._startTierRoulette = startRoulette;
  window._stopTierRoulette  = stopRoulette;
})();

/* ============================================================
   donut 内訳 popup toggle (2026-06-19 兄貴指示)
   常時表示 → donut クリックで popup 開閉。 outside click / Esc / 再 click で close
   ============================================================ */
(() => {
  function init() {
    const trigger = document.getElementById('luopanTrigger');
    const pop = document.getElementById('heroBreakdownPop');
    if (!trigger || !pop) return;

    function isOpen() { return pop.classList.contains('is-open'); }
    function isMobile() { return window.matchMedia('(max-width: 600px)').matches; }
    function positionPop() {
      if (isMobile()) {
        // mobile: hero 直下中央寄せ (2026-06-21 兄貴指示、 旧 画面中央 → hero 直下)
        const hr = (document.getElementById('heroRoot') || trigger).getBoundingClientRect();
        pop.style.top = (hr.bottom + 8) + 'px';
        pop.style.left = '50%';
        pop.style.right = 'auto';
        pop.style.transform = 'translateX(-50%)';
        pop.style.maxWidth = 'calc(100vw - 24px)';
        return;
      }
      // PC: luopan rect 基準で popup 位置算出 (position:fixed = viewport 座標)
      const r = trigger.getBoundingClientRect();
      pop.style.top = (r.bottom + 12) + 'px';
      pop.style.right = (window.innerWidth - r.right) + 'px';
      pop.style.left = 'auto';
      pop.style.transform = '';
    }
    function open() {
      positionPop();
      pop.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      pop.setAttribute('aria-hidden', 'false');
    }
    function close() {
      pop.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
      pop.setAttribute('aria-hidden', 'true');
    }
    function toggle(ev) { ev.stopPropagation(); isOpen() ? close() : open(); }

    trigger.addEventListener('click', toggle);
    trigger.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(ev); }
    });
    pop.addEventListener('click', (ev) => ev.stopPropagation());
    document.addEventListener('click', () => { if (isOpen()) close(); });
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && isOpen()) close(); });
    // resize 中に popup 位置追随 (open 時のみ)
    window.addEventListener('resize', () => { if (isOpen()) positionPop(); });

    // mobile: hero 全体 tap で popup 開閉 (donut hidden のため、 2026-06-19 兄貴指示)
    const heroRoot = document.getElementById('heroRoot');
    heroRoot?.addEventListener('click', (ev) => {
      if (!isMobile()) return;
      if (ev.target.closest('button, input, select, textarea, a, label')) return;
      if (ev.target.closest('#heroBreakdownPop')) return;
      ev.stopPropagation();
      isOpen() ? close() : open();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
