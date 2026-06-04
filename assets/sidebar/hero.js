// ── WWM-METRICS / Sidebar / Hero (Phase 3.9e 切出) ──
// Hero block (武格指数 / NEXT / Tier badge) 更新 + opt中の tier badge ルーレット演出。
// 依存:
//   - WWMState.{baseline, opt, allowDonut, lastResult, params}
//   - window.computeExpected
//   - 旧 sidebar.js グローバル: _set4Bonus / _getEffectiveRoleInfo
//     → arrow wrapper で window.__WWM_SET4_BONUS_OF / __WWM_GET_EFFECTIVE_ROLEINFO 経由
//   - WWMHelpers.dom.setText / window.countUp
// 公開:
//   - window.WWMSidebar.hero = { update, startRoulette, stopRoulette }
//   - 後方互換: window.WWMHero = { update }  (sidebar.js _refreshAll が参照)
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

  // ── Hero block 更新 ────────────────────────────────────────────
  function update(params) {
    if (!params || typeof window.computeExpected !== 'function') return;
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
    // NEXT 表示制御: 確定 (baseline) と 仮想計算 (statusScore) が 丸め後同値なら NEXT行 非表示。
    // = 装備変更なし時の 「9,027 ▶ 9,027」 同値表示を排除、 装備対照/最適化で仮想変更時のみ NEXT 表示。
    // currentScore null (baseline 未取得) 時も 隠す (NEXT 意味なし)。
    const heroNextEl = document.querySelector('.hero-next-inline');
    if (heroNextEl) {
      if (currentScore === null) {
        heroNextEl.hidden = true;
      } else {
        const nextRounded = Math.round(statusScore);
        heroNextEl.hidden = (nextRounded === currentScore);
      }
    }
  }

  window.WWMSidebar = window.WWMSidebar || {};
  window.WWMSidebar.hero = { update, startRoulette, stopRoulette };
  // opt.js が call-time で参照 (call-time arrow wrapper 経由のため window 直接 expose 必要)
  window._startTierRoulette = startRoulette;
  window._stopTierRoulette  = stopRoulette;
})();
