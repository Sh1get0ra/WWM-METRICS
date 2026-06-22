// ── WWMetrics Sidebar / 装備最適化 (Phase 3.4 切出) ────────
// Greedy 全体最適化: renderOptimization / _renderOptimizationInner /
// _OPT_resortRows / _exportOptSteps / _applyOptSteps
(function () {
  'use strict';

  // ── 他 module alias ─────────────────────────────────────
  const _fmtAffixVal       = window.WWMSidebar.affix.fmtAffixVal;
  const _getAffixOptions   = window.WWMSidebar.affix.getAffixOptions;
  const _getAffixMax       = window.WWMSidebar.affix.getAffixMax;
  const _SLOT6_ARMOR       = window.WWMSidebar.affix.SLOT6_ARMOR;
  const _affixDisplayName  = window.WWMSidebar.affix.affixDisplayNameSplit;
  const _loadEquipMax      = window.WWMSidebar.affix.loadEquipMax;
  const _slotLabelI18n     = window.WWMSidebar.icons.slotLabelI18n;
  const _curLang           = window.WWMSidebar.anlz.curLang;
  // sidebar.js 内 関数 (call時 lookup)
  const _scoreWithBonus      = (ri) => window.__WWM_SCORE_WITH_BONUS(ri);
  const _startTierRoulette   = () => { if (typeof window._startTierRoulette === 'function') window._startTierRoulette(); };
  const _stopTierRoulette    = () => { if (typeof window._stopTierRoulette === 'function') window._stopTierRoulette(); };
  const _refreshAll          = () => { if (typeof window._refreshAll === 'function') window._refreshAll(); };

  // ── 内部 state ───────────────────────────────────────────
  let _OPT_LAST_STEPS = null;
  let _OPT_LAST_SCORES = null;
  // 装備部位 sort用 order map (renderOptimization + _OPT_resortRows 共通)
  const _OPT_SLOT_ORDER = { '1':0,'2':1,'3':2,'4':3,'5':4,'8':5,'10':6,'11':7,'9,21':99,'9':99,'21':99 };

  // sort切替時 再計算なしで rows DOM だけ即時並び替え (checked状態保持)
  function _OPT_resortRows(sortBy) {
    if (!_OPT_LAST_STEPS || !_OPT_LAST_STEPS.length) return;
    const body = document.querySelector('.wwm-opt-body');
    if (!body) return;
    // checked状態 snapshot (sort後も保持)
    const checkedIdxs = new Set(
      Array.from(body.querySelectorAll('.wwm-opt-check'))
        .filter(cb => cb.checked)
        .map(cb => parseInt(cb.dataset.optStep, 10))
    );
    // _OPT_LAST_STEPS に _origIdx 付与 + sort適用
    const indexed = _OPT_LAST_STEPS.map((s, i) => ({ ...s, _origIdx: i }));
    let view = indexed;
    if (sortBy === 'slot') {
      view = [...indexed].sort((a, b) => {
        const sa = _OPT_SLOT_ORDER[String(a.slot)] ?? 50;
        const sb = _OPT_SLOT_ORDER[String(b.slot)] ?? 50;
        if (sa !== sb) return sa - sb;
        return (a.idx || 0) - (b.idx || 0);
      });
    }
    // rows再描画 (renderOptimization内 行構築と同形式)
    const T = window.T || {};
    const _fmtFromTo = (name, val, ratio, key) => {
      const v = _fmtAffixVal(val, key);
      const pct = ratio != null ? `(${Math.round(ratio*100)}%)` : '';
      return `${name} ${v}${pct}`;
    };
    body.innerHTML = view.map((s) => {
      const isBow = s.kind === 'bowSet';
      const slotCol = isBow ? s.slotLabel : `${s.slotLabel}#${s.idx+1}`;
      const changeCol = isBow
        ? `<span class="wwm-opt-from">${s.fromName||'(未装着)'}</span><span class="wwm-opt-to">▶ ${s.toName}</span>`
        : `<span class="wwm-opt-from">${_fmtFromTo(s.fromName, s.fromVal, s.fromRatio, s.fromKey)}</span><span class="wwm-opt-to">▶ ${_fmtFromTo(s.toName, s.toVal, s.toRatio, s.toKey)}</span>`;
      const isChecked = checkedIdxs.size ? checkedIdxs.has(s._origIdx) : true;
      return `
      <div class="wwm-opt-row">
        <span class="wwm-opt-pos">${s._origIdx+1}</span>
        <span class="wwm-opt-slot">${slotCol}</span>
        <span class="wwm-opt-change">${changeCol}</span>
        <span class="wwm-opt-delta">+${Math.round(s.delta).toLocaleString()}</span>
        ${s.tierUp ? `<span class="wwm-opt-tierup">★ ${s.tierUp}</span>` : '<span></span>'}
        <label class="wwm-opt-check-wrap" title="${T.optSelectOne||'選択'}"><input type="checkbox" class="wwm-opt-check" data-opt-step="${s._origIdx}" ${isChecked?'checked':''}></label>
      </div>
    `;}).join('');
  }

  async function renderOptimization(roleInfo, params, opts) {
    // popout 中は popout window 内 root を優先 (2026-06-16 — 親 document の getElementById は null 返す)
    const root = (window.WWMAnlzPopout?.findEl?.('wwmOptimization')) || document.getElementById('wwmOptimization');
    if (!root || !roleInfo || !window.WWMStats?.buildStatParams) return;
    opts = opts || {};
    // SHARE Build mode: 最適化計算 skip (panel = SHARE payload の opt_best表示のみ、 自データ書込み回避)
    if (WWMState.isShared) {
      root.innerHTML = `<div class="wwm-analysis-card wwm-modal-square"><div class="wwm-opt-loading" style="text-align:center;padding:24px;color:var(--sumi-fg-dim)">${(window.T?.sharedBuildOptDisabled) ?? '閲覧モード中: 装備最適化は無効化されています'}</div></div>`;
      return;
    }
    // 最適化中 donut/score の中間更新を suppress
    WWMState.opt.running = true;
    const tokenBefore = window._OPT_TOKEN || 0;
    try {
      return await _renderOptimizationInner(roleInfo, params, opts, root);
    } finally {
      WWMState.opt.running = false;
      // abort後 (新optimization が起動し token が進んだ) → donut/hero 操作スキップ (フリッカー防止)
      const wasAborted = (window._OPT_TOKEN || 0) !== (tokenBefore + 1);
      if (!wasAborted) {
        try {
          if (window.WWMSidebar?.hero) window.WWMSidebar.hero.update(WWMState.params || params);
        } catch(_) {}
      }
    }
  }

  async function _renderOptimizationInner(roleInfo, params, opts, root) {
    // abort token: 新しい render 開始時、前回 loop を打切
    const myToken = (window._OPT_TOKEN = (window._OPT_TOKEN || 0) + 1);
    const _aborted = () => window._OPT_TOKEN !== myToken;
    // opt 中は Tier badge ルーレット (静的 tier 確定までの演出)
    _startTierRoulette();
    // ★ 重い最適化ループの前に 1 paint を確実に挟む (rAF→setTimeout)。
    //   どの呼出経路 (import/_refreshAll/auto-load) でも、import直後の mini-hero/score/sidebar を
    //   最適化(数秒)が starve する前に描画させる。継続が paint後のmacrotaskで走るのが肝。
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
    if (_aborted()) return;
    // 保存された ratio (slider 値) 取得
    const savedRatio = parseFloat(localStorage.getItem('wwm_opt_target_ratio_v1')) || 0.94;
    // best 確定中 (LOCKED未) は ratio=0.94 強制 (= 承音システムの全OP育成 max値、 現実的な装備上限)。
    // ratio=1.0 (= OP 100%×6種) は ゲーム仕様上 ほぼ不可能 → best基準厳しすぎる。
    // ユーザーが ratio=0.9 設定後 再import すると best が低い値で固定され、 Tier判定が緩くなるバグ防止。
    const TARGET_RATIO = WWMState.opt.locked ? (opts.ratio ?? savedRatio) : 0.95;
    // MAX_ITER = ①②③ 統一 80 (2026-06-18 TODO 6 共通化、 自然収束時の保険上限)
    // 微改善打切 (Δ閾値 break) = 廃止 (個人設定で Tier 揺らぐ問題 + delta>0 で自然収束)
    const MAX_ITER = 80;
    // header controls
    const T_ = window.T || {};
    const savedSort = opts.sortBy ?? (localStorage.getItem('wwm_opt_sort_v1') || 'default');
    const headerHtml = `
      <div class="wwm-analysis-header">
        <h3>${T_.optimizationTitle||'装備最適化提案'}</h3>
        <div class="wwm-opt-controls">
          <span class="wwm-opt-sort-group" id="wwmOptSort" data-sort="${savedSort}">
            <button type="button" class="wwm-opt-sort-btn ${savedSort==='default'?'active':''}" data-sort-val="default">${T_.optSortDefault||'改善順'}</button>
            <button type="button" class="wwm-opt-sort-btn ${savedSort==='slot'?'active':''}" data-sort-val="slot">${T_.optSortBySlot||'部位順'}</button>
          </span>
          <label class="wwm-opt-ratio-label">${T_.optTargetRatio||'目標'} <span id="wwmOptRatioVal">${Math.round(TARGET_RATIO*100)}%</span>
            <input type="range" id="wwmOptRatio" min="90" max="100" step="1" value="${Math.round(TARGET_RATIO*100)}">
          </label>
          <button type="button" class="wwm-opt-btn" id="wwmOptToggleAll" title="${T_.optToggleAllTip||'全選択/全解除 切替'}">☑</button>
          <button type="button" class="wwm-opt-btn wwm-opt-btn-apply" id="wwmOptApplyAll">${T_.optApplySelected||'選択適用'}</button>
          <button type="button" class="wwm-opt-btn" id="wwmOptRerun" title="${T_.optRerunTip||'再計算'}">↻</button>
        </div>
      </div>
      <div class="wwm-opt-progress" id="wwmOptProgress"></div>
    `;
    function _bindControls() {
      const rEl = root.querySelector('#wwmOptRatio');
      const rVal = root.querySelector('#wwmOptRatioVal');
      if (rEl) {
        rEl.addEventListener('input', () => { rVal.textContent = rEl.value + '%'; });
        rEl.addEventListener('change', () => {
          const v = parseInt(rEl.value, 10) / 100;
          localStorage.setItem('wwm_opt_target_ratio_v1', String(v));
          renderOptimization(roleInfo, params, { ratio: v });
        });
      }
      const apEl = root.querySelector('#wwmOptApplyAll');
      if (apEl) apEl.addEventListener('click', () => {
        const checkedIdxs = Array.from(root.querySelectorAll('.wwm-opt-check:checked'))
          .map(cb => parseInt(cb.dataset.optStep, 10))
          .filter(i => !isNaN(i));
        const sel = (_OPT_LAST_STEPS || []).filter((_, i) => checkedIdxs.includes(i));
        _applyOptSteps(sel);
      });
      // 再計算 button = 兄貴 2026-06-18: 目標値変更後 baseline 不整合等で「改善なし」 出た時の手動 trigger
      const rrEl = root.querySelector('#wwmOptRerun');
      if (rrEl) rrEl.addEventListener('click', () => renderOptimization(roleInfo, params));
      const sortEl = root.querySelector('#wwmOptSort');
      if (sortEl) sortEl.querySelectorAll('.wwm-opt-sort-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const v = btn.dataset.sortVal;
          if (!v || v === sortEl.dataset.sort) return;
          localStorage.setItem('wwm_opt_sort_v1', v);
          sortEl.dataset.sort = v;
          sortEl.querySelectorAll('.wwm-opt-sort-btn').forEach(b => b.classList.toggle('active', b.dataset.sortVal === v));
          // 再計算なしで rows DOM だけ即時並び替え (checked状態保持)
          _OPT_resortRows(v);
        });
      });
      const tgEl = root.querySelector('#wwmOptToggleAll');
      if (tgEl) tgEl.addEventListener('click', () => {
        const cbs = root.querySelectorAll('.wwm-opt-check');
        const anyUnchecked = Array.from(cbs).some(cb => !cb.checked);
        cbs.forEach(cb => { cb.checked = anyUnchecked; });
        tgEl.textContent = anyUnchecked ? '☐' : '☑';
      });
    }
    // 計算中表示
    root.innerHTML = `<div class="wwm-analysis-card wwm-modal-square"><div class="wwm-modal-bg-icon" style="background-image:url('https://www.wherewindsmeetgame.com/pc/qt/20251203102905/data/base_school/images/673325b3eed7ba50118c397aMSc1Axt605.png');"></div>${headerHtml}<div class="wwm-opt-loading">${(window.T?.optComputing) || '計算中...'}</div></div>`;
    _bindControls();
    // 計算中: ヘッダ入力 (目標ratio / minDelta / slotFilter / 再計算) を一時 disable
    // → 中間状態で別ratio入力 → 結果startScoreがズレる/baseline壊れる バグ防止
    ['#wwmOptRatio', '#wwmOptApplyAll', '#wwmOptToggleAll', '#wwmOptRerun'].forEach(sel => {
      const el = root.querySelector(sel);
      if (el) { el.disabled = true; el.classList.add('wwm-opt-busy'); }
    });
    // sort buttons (group span 内の各btn) も disable
    root.querySelectorAll('#wwmOptSort .wwm-opt-sort-btn').forEach(btn => { btn.disabled = true; btn.classList.add('wwm-opt-busy'); });
    // progress表示は .wwm-opt-loading に一本化 (#wwmOptProgress は使わず二重回避)
    const setProgress = (label) => {
      const el = root.querySelector('.wwm-opt-loading');
      if (el) el.textContent = label || (window.T?.optComputing) || '計算中...';
    };
    setProgress();
    const state = WWMHelpers.storage.loadJSON('wwm_last_state_v1');
    await _loadEquipMax();
    // tier 表示用 SS閾値 (worldLv 由来)
    const wl = params?.worldLv || 15;
    const ssThr = 6700 * Math.pow(0.8, 14 - wl);
    // 共通最適化エンジン runOptimizer 経由 (2026-06-18 TODO 6 共通化)
    const optResult = await runOptimizer(roleInfo, state, {
      ratio: TARGET_RATIO,
      MAX_ITER,
      bowMode: 'inline',
      collectSteps: true,
      abortCheck: _aborted,
      onProgress: (iter) => {
        setProgress(((window.T?.optComputingIter) || '計算中... ({0}回目)').replace('{0}', iter));
        if (window.WWMImportGate) window.WWMImportGate.tick(iter);
      },
    });
    if (_aborted() || optResult.aborted) return;
    const startScore = optResult.startScore;
    const curScore = optResult.endScore;
    const steps = optResult.steps;
    // tier 達成判定 (各 step で prev→cur tier 移行記録)
    const TIER_LIST = [['SS', 1.0], ['S', 0.9], ['A', 0.8], ['B', 0.6]];
    let prevTierScore = startScore;
    for (const step of steps) {
      let prevTier = 'C', curTier = 'C';
      for (const [name, mult] of TIER_LIST) {
        if (prevTierScore >= ssThr * mult && prevTier === 'C') prevTier = name;
        if (step.newScore >= ssThr * mult && curTier === 'C') curTier = name;
      }
      if (prevTier !== curTier) step.tierUp = `${prevTier} ▶ ${curTier}`;
      prevTierScore = step.newScore;
    }
    // 復元 (元 roleInfo + state で __WWM_LAST_RESULT 再計算)
    try {
      const fin = await window.WWMStats.buildStatParams(roleInfo, state);
      window.computeExpected(fin);
    } catch (e) {}
    const totalDelta = Math.round(curScore - startScore);
    const summary = `${Math.round(startScore).toLocaleString()} ▶ ${Math.round(curScore).toLocaleString()} <span class="wwm-opt-totaldelta">+${totalDelta.toLocaleString()}</span>`;
    const _fmtFromTo = (name, val, ratio, key) => {
      const v = _fmtAffixVal(val, key);
      const pct = ratio != null ? `(${Math.round(ratio*100)}%)` : '';
      return `${name} ${v}${pct}`;
    };
    // sort: default (= greedy iter順=最大Δ優先) / slot (装備部位順、 弓セットは最後)
    // ※ 内部index (i+1) は元の改善順を保持表示するため、 sort前に原index 付与
    // ※ _OPT_SLOT_ORDER は module-level (_OPT_resortRows と共有)
    const stepsIndexed = steps.map((s, i) => ({ ...s, _origIdx: i }));
    let stepsView = stepsIndexed;
    if (savedSort === 'slot') {
      stepsView = [...stepsIndexed].sort((a, b) => {
        const sa = _OPT_SLOT_ORDER[String(a.slot)] ?? 50;
        const sb = _OPT_SLOT_ORDER[String(b.slot)] ?? 50;
        if (sa !== sb) return sa - sb;
        return (a.idx || 0) - (b.idx || 0);
      });
    }
    const rows = stepsView.length ? stepsView.map((s) => {
      const isBow = s.kind === 'bowSet';
      const slotCol = isBow ? s.slotLabel : `${s.slotLabel}#${s.idx+1}`;
      const changeCol = isBow
        ? `<span class="wwm-opt-from">${s.fromName||'(未装着)'}</span><span class="wwm-opt-to">▶ ${s.toName}</span>`
        : `<span class="wwm-opt-from">${_fmtFromTo(s.fromName, s.fromVal, s.fromRatio, s.fromKey)}</span><span class="wwm-opt-to">▶ ${_fmtFromTo(s.toName, s.toVal, s.toRatio, s.toKey)}</span>`;
      return `
      <div class="wwm-opt-row">
        <span class="wwm-opt-pos">${s._origIdx+1}</span>
        <span class="wwm-opt-slot">${slotCol}</span>
        <span class="wwm-opt-change">${changeCol}</span>
        <span class="wwm-opt-delta">+${Math.round(s.delta).toLocaleString()}</span>
        ${s.tierUp ? `<span class="wwm-opt-tierup">★ ${s.tierUp}</span>` : '<span></span>'}
        <label class="wwm-opt-check-wrap" title="${(window.T&&T.optSelectOne)||'選択'}"><input type="checkbox" class="wwm-opt-check" data-opt-step="${s._origIdx}" checked></label>
      </div>
    `;}).join('') : `<div class="wwm-opt-empty">${(window.T&&window.T.optNoImprovement)||'改善余地なし'}</div>`;
    // 結果 cache (export 用)
    _OPT_LAST_STEPS = steps;
    _OPT_LAST_SCORES = { start: Math.round(startScore), end: Math.round(curScore), delta: totalDelta, ratio: TARGET_RATIO };
    // Tier 基準: 最適化最大スコア (= curScore) は import 時に1回だけ確定保存。以降の opt 再計算では値を更新しない。
    // ※ applyImport で localStorage 削除 + LOCKED 解除 → 再 import で再確定する。
    if (!WWMState.opt.locked) {
      const ver = window.WWM_SCORE_VERSION || 1;
      WWMState.opt.best = { end: Math.round(curScore), ts: Date.now(), scoreVer: ver };
    }
    // MAX 算出 (maxRi + slotMaxLoo) は廃止 (兄貴指示 2026-06-18): 火力品質 % → 武備指数 (LOO 生値) 表示移行
    if (!WWMState.opt.locked) {
      WWMState.opt.locked = true;
      try { localStorage.setItem('wwm_opt_best_v1', JSON.stringify(WWMState.opt.best)); } catch(_) {}
    }
    // ルーレット停止 + 静的 tier 描画
    _stopTierRoulette();
    if (window.WWMSidebar?.hero && WWMState.params) { try { window.WWMSidebar.hero.update(WWMState.params); } catch(_) {} }
    root.innerHTML = `
      <div class="wwm-analysis-card wwm-modal-square">
        <div class="wwm-modal-bg-icon" style="background-image:url('https://www.wherewindsmeetgame.com/pc/qt/20251203102905/data/base_school/images/673325b3eed7ba50118c397aMSc1Axt605.png');"></div>
        ${headerHtml.replace('<div class="wwm-opt-progress" id="wwmOptProgress"></div>', '')}
        <div class="wwm-opt-summary">${summary}</div>
        <div class="wwm-opt-body">${rows}</div>
      </div>
    `;
    _bindControls();
  }

  function _exportOptSteps() {
    if (!_OPT_LAST_STEPS || !_OPT_LAST_SCORES) { alert('まず計算してください'); return; }
    const s = _OPT_LAST_SCORES;
    const lines = [
      `WWMetrics 装備最適化提案 (目標 ${Math.round(s.ratio*100)}%)`,
      `現状: ${s.start.toLocaleString()} → 最適化後: ${s.end.toLocaleString()} (Δ+${s.delta.toLocaleString()})`,
      '',
      ..._OPT_LAST_STEPS.map((step, i) => {
        const f = step.fromVal != null ? ` ${_fmtAffixVal(step.fromVal, step.fromKey)}(${Math.round(step.fromRatio*100)}%)` : '';
        const t = step.toVal != null ? ` ${_fmtAffixVal(step.toVal, step.toKey)}(${Math.round(step.toRatio*100)}%)` : '';
        return `${i+1}. ${step.slotLabel}#${step.idx+1}: ${step.fromName}${f} ▶ ${step.toName}${t}  +${Math.round(step.delta).toLocaleString()}`;
      })
    ];
    const text = lines.join('\n');
    navigator.clipboard.writeText(text).then(
      () => alert('コピー完了'),
      () => {
        const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta);
        ta.select(); document.execCommand('copy'); ta.remove();
        alert('コピー完了');
      }
    );
  }

  function _applyOptSteps(stepsToApply) {
    if (!stepsToApply || !stepsToApply.length) { alert('適用する swap なし'); return; }
    const origRi = WWMState.roleInfo;
    if (!origRi) return;
    if (!WWMState.virtual.gear) WWMState.virtual.gear = {};
    for (const step of stepsToApply) {
      if (step.kind === 'bowSet') {
        // 弓セット suffix 変更 (slot 9 + 21)
        ['9','21'].forEach(s => {
          let vEq = WWMState.virtual.gear[s];
          if (!vEq) {
            const orig = origRi.wearEquipsDetailed?.[s];
            if (!orig) return;
            vEq = JSON.parse(JSON.stringify(orig));
            WWMState.virtual.gear[s] = vEq;
          }
          if (vEq.exVo) vEq.exVo.suffix = step.toSuffix;
        });
        continue;
      }
      const slot = step.slot;
      // 既存 virtual or original の clone を取得/初期化
      let vEq = WWMState.virtual.gear[slot];
      if (!vEq) {
        const orig = origRi.wearEquipsDetailed?.[slot];
        if (!orig) continue;
        vEq = JSON.parse(JSON.stringify(orig));
        WWMState.virtual.gear[slot] = vEq;
      }
      const d = vEq.exVo?.baseAffixes?.[step.idx]?.equipmentDetails;
      if (!d) continue;
      d[0] = step.toId;
      d[1] = step.toVal;
      d[2] = step.toRatio;
      d[3] = 2;
      d[4] = true;
    }
    _refreshAll();
  }

  // ── 共通最適化エンジン runOptimizer (2026-06-18 TODO 6 共通化) ─────────
  // ①② (装備最適化提案 / import Tier判定 = _renderOptimizationInner) + ③ (ゼロベース比較
  // = runZerobaseCompare) が共有する iter loop 本体。 全 caller の差分は opts で外出し。
  //
  // 引数:
  //   roleInfo : 現状 roleInfo (内部 clone するので原型 mutated されない)
  //   state    : WWMState (xinfaTiers 等)
  //   opts:
  //     zeroBase      : bool   全 affix value=0 化 (③ ゼロベース)
  //     overrideIdx5  : 'voidPen'|'physPen'|null  武器系 idx5 を強制差替 + iter で touch しない
  //     stateXinfaMax : bool   xinfaTiers 全 6 上書き (③ MAX state)
  //     ratio         : 0.95   TARGET_RATIO (①② locked時 slider値 / ③ 1.0)
  //     MAX_ITER      : 80     反復上限 (= 自然収束時の保険)
  //     bowMode       : 'inline'|'prepost'  弓 suffix swap 評価タイミング
  //                      inline  = iter loop 内 候補評価 (①② = iter=0 弓のみ評価先行)
  //                      prepost = iter loop 前後で 1 回ずつ最良 suffix 採用 (③)
  //     collectSteps  : bool   採用step を steps[] に push (② が rows 表示用)
  //     abortCheck    : ()=>bool  true 返したら即 abort (②の _OPT_TOKEN 用)
  //     onProgress    : (iter)=>void  iter 開始時 callback (②の progress 表示用)
  //
  // 戻り値: { ri, startScore, endScore, steps, aborted }
  //
  // 微改善打切 (Δ閾値 break) = 廃止 (2026-06-18 兄貴指示 — 個人設定で Tier 揺らぐ問題 + delta>0
  // 続く限り自然収束、 計算速度ある今は実害なし)。 MAX_ITER 80 = ①②③ 統一。
  async function runOptimizer(roleInfo, state, opts) {
    opts = opts || {};
    const zeroBase      = !!opts.zeroBase;
    const overrideIdx5  = opts.overrideIdx5 || null;
    const stateXinfaMax = !!opts.stateXinfaMax;
    const TARGET_RATIO  = (opts.ratio != null) ? opts.ratio : 0.95;
    const MAX_ITER      = (opts.MAX_ITER != null) ? opts.MAX_ITER : 80;
    const bowMode       = opts.bowMode || 'inline';
    const collectSteps  = !!opts.collectSteps;
    const abortCheck    = opts.abortCheck || (() => false);
    const onProgress    = opts.onProgress || null;
    const _SLOT6_WEAPON_LIKE = window.WWMSidebar.affix.SLOT6_WEAPON_LIKE;
    const charLv = roleInfo?.level || 95;

    // working clone (原 roleInfo 不可変)
    const working = JSON.parse(JSON.stringify(roleInfo));

    // state 上書き (③ xinfa MAX)
    let effectiveState = state;
    if (stateXinfaMax) {
      effectiveState = JSON.parse(JSON.stringify(state || {}));
      if (!effectiveState.xinfaTiers) effectiveState.xinfaTiers = {};
      for (let i = 0; i < 4; i++) { effectiveState.xinfaTiers[i] = 6; effectiveState.xinfaTiers[String(i)] = 6; }
    }

    // origAffixMemo (③ override idx5 用 prefix seed + zeroBase 起点 skip 判定)
    const origAffixMemo = {};
    for (const sl of Object.keys(working.wearEquipsDetailed || {})) {
      origAffixMemo[sl] = {};
      const ba = working.wearEquipsDetailed[sl]?.exVo?.baseAffixes || [];
      for (let i = 0; i < ba.length; i++) {
        const det = ba[i]?.equipmentDetails;
        if (det && det[0] != null) origAffixMemo[sl][i] = det[0];
      }
    }

    const BOW_PAIR = new Set(['9', '21']);

    // zeroBase: 全 affix value=0 + 弓 suffix=0
    if (zeroBase) {
      for (const sl of Object.keys(working.wearEquipsDetailed || {})) {
        const ba = working.wearEquipsDetailed[sl]?.exVo?.baseAffixes || [];
        if (BOW_PAIR.has(sl)) {
          if (working.wearEquipsDetailed[sl]?.exVo) working.wearEquipsDetailed[sl].exVo.suffix = 0;
          continue;
        }
        for (let i = 0; i < ba.length; i++) {
          const det = ba[i]?.equipmentDetails;
          if (!det) continue;
          det[1] = 0;
          det[2] = 0;
        }
      }
    }

    // overrideIdx5: 武器系 idx5 を voidPen / physPen 強制差替 (③ 専用)
    // 防具 idx5 = 元 working 武学固有 ID を seed として _getAffixOptions の prefix 制約で keep
    if (overrideIdx5) {
      for (const slot of Object.keys(working.wearEquipsDetailed || {})) {
        if (!_SLOT6_WEAPON_LIKE.has(slot)) continue;
        const ba = working.wearEquipsDetailed[slot]?.exVo?.baseAffixes || [];
        const idx = 5;
        const seedId = origAffixMemo[slot]?.[idx];
        if (seedId == null) continue;
        const opts2 = _getAffixOptions(seedId, slot, idx, ba);
        const targetOpt = opts2.find(o => o.statKey === overrideIdx5);
        if (!targetOpt) continue;
        const mv = _getAffixMax(overrideIdx5, charLv);
        if (mv == null) continue;
        if (!ba[idx]) ba[idx] = {};
        ba[idx].equipmentDetails = [parseInt(targetOpt.id, 10), mv * TARGET_RATIO, TARGET_RATIO, 2, 1];
      }
    }

    // 初期 baseline
    let startScore = 0;
    try {
      await window.WWMStats.buildStatParams(working, effectiveState);
      startScore = _scoreWithBonus(working);
    } catch (e) { return { ri: working, startScore: 0, endScore: 0, steps: [], aborted: false }; }
    let curScore = startScore;
    const steps = [];

    // perf 基盤 (clone レス + 同期 buildStatParams + slice yield)
    const SLICE_MS = 8;
    const _macroYield = () => new Promise(res => {
      if (typeof scheduler !== 'undefined' && scheduler.yield) { scheduler.yield().then(res, res); return; }
      const ch = new MessageChannel();
      ch.port1.onmessage = () => res();
      ch.port2.postMessage(null);
    });
    let _sliceDeadline = performance.now() + SLICE_MS;
    const _alive = window.WWMStats.buildAffixAliveJudge
      ? window.WWMStats.buildAffixAliveJudge(working)
      : (() => true);
    const _optionsCache = new Map();
    const _buildSync = window.WWMStats.buildStatParamsSync || null;
    const _buildParams = () => _buildSync
      ? _buildSync(working, effectiveState)
      : window.WWMStats.buildStatParams(working, effectiveState);

    // 弓 suffix swap (最良採用 = prepost mode + iter loop 前後で実行)
    const bowSets = window.WWM_SETS?.bowSets;
    async function _bowSuffixSwapBest() {
      if (!bowSets) return;
      const bow21 = working.wearEquipsDetailed['21']?.exVo;
      const bow9 = working.wearEquipsDetailed['9']?.exVo;
      if (!bow21 || !bow9) return;
      let baseScore = 0;
      try {
        const p = await _buildParams();
        window.computeExpected(p);
        baseScore = _scoreWithBonus(working);
      } catch (_) {}
      let bestSfx = bow21.suffix, bestDelta = 0;
      for (const sfx of Object.keys(bowSets)) {
        const sfxInt = parseInt(sfx, 10);
        bow21.suffix = sfxInt;
        bow9.suffix = sfxInt;
        try {
          const p = await _buildParams();
          window.computeExpected(p);
          const sc = _scoreWithBonus(working);
          const delta = sc - baseScore;
          if (delta > bestDelta) { bestSfx = sfxInt; bestDelta = delta; }
        } catch (_) {}
      }
      bow21.suffix = bestSfx;
      bow9.suffix = bestSfx;
    }
    if (bowMode === 'prepost') {
      await _bowSuffixSwapBest();
      try {
        const p = await _buildParams();
        window.computeExpected(p);
        curScore = _scoreWithBonus(working);
      } catch (_) {}
    }

    const slotsAllowed = new Set(['1','2','3','4','5','8','10','11']);

    // iter loop
    for (let iter = 0; iter < MAX_ITER; iter++) {
      if (abortCheck()) return { ri: working, startScore, endScore: curScore, steps, aborted: true };
      if (onProgress) onProgress(iter + 1);
      const eqDet = working.wearEquipsDetailed || {};
      const slots = Object.keys(eqDet).filter(s => slotsAllowed.has(s));
      let best = null;
      // inline mode かつ iter=0 = 弓セットだけ評価 (affix skip)
      const skipAffix = (bowMode === 'inline' && iter === 0);
      for (const slot of (skipAffix ? [] : slots)) {
        const eq = eqDet[slot];
        const affixes = eq?.exVo?.baseAffixes || [];
        for (let idx = 0; idx < affixes.length; idx++) {
          const cur = affixes[idx]?.equipmentDetails;
          if (!cur) continue;
          // zeroBase mode: 元 working に affix 無い枠 skip (= 空 slot に新規 affix 生やさない)
          if (zeroBase && origAffixMemo[slot]?.[idx] == null) continue;
          const curStatKey = window.WWM_AFFIX?.[cur[0]]?.statKey;
          const isArmorIdx5 = (idx === 5 && _SLOT6_ARMOR.has(slot));
          // overrideIdx5 + 武器系 idx=5 = 固定 = value 上げ + swap 評価 共に skip
          if (overrideIdx5 && _SLOT6_WEAPON_LIKE.has(slot) && idx === 5) continue;
          // 同 statKey value 上げ評価 (全 idx)
          if (curStatKey) {
            const _maxValSame = _getAffixMax(curStatKey, charLv);
            if (_maxValSame != null && cur[1] < _maxValSame * TARGET_RATIO - 1e-6) {
              const _s0 = cur[0], _s1 = cur[1], _s2 = cur[2], _s3 = cur[3];
              try {
                cur[1] = _maxValSame * TARGET_RATIO;
                cur[2] = TARGET_RATIO;
                cur[3] = 2;
                const _p = await _buildParams();
                window.computeExpected(_p);
                const _newScore = _scoreWithBonus(working);
                const _delta = _newScore - curScore;
                if (_delta > 0 && (!best || _delta > best.delta)) {
                  best = {
                    slot, slotLabel: _slotLabelI18n(slot), idx,
                    fromKey: curStatKey, fromName: _affixDisplayName(_s0),
                    fromVal: _s1, fromRatio: _s2,
                    toName: _affixDisplayName(_s0), toId: _s0,
                    toKey: curStatKey, toVal: _maxValSame * TARGET_RATIO, toRatio: TARGET_RATIO,
                    delta: _delta, newScore: _newScore
                  };
                }
              } catch (e) {} finally {
                cur[0] = _s0; cur[1] = _s1; cur[2] = _s2; cur[3] = _s3;
              }
            }
          }
          // 防具 idx5 = 武学固有 = swap 探索外 (value 上げのみ評価済)
          if (isArmorIdx5) continue;
          const _sig = slot + '|' + idx + '|' + affixes.map(a => a?.equipmentDetails?.[0] ?? '-').join(',');
          let options = _optionsCache.get(_sig);
          if (!options) { options = _getAffixOptions(cur[0], slot, idx, affixes); _optionsCache.set(_sig, options); }
          for (const opt of options) {
            if (!opt.statKey || opt.statKey === '__pvp__') continue;
            if (opt.statKey === curStatKey) continue;
            if (!_alive(opt.statKey)) continue;
            const maxVal = _getAffixMax(opt.statKey, charLv);
            if (maxVal == null) continue;
            if (performance.now() > _sliceDeadline) {
              await _macroYield();
              if (abortCheck()) return { ri: working, startScore, endScore: curScore, steps, aborted: true };
              _sliceDeadline = performance.now() + SLICE_MS;
            }
            const s0 = cur[0], s1 = cur[1], s2 = cur[2], s3 = cur[3];
            try {
              cur[0] = parseInt(opt.id, 10);
              cur[1] = maxVal * TARGET_RATIO;
              cur[2] = TARGET_RATIO;
              cur[3] = 2;
              const p = await _buildParams();
              window.computeExpected(p);
              const newScore = _scoreWithBonus(working);
              const delta = newScore - curScore;
              if (delta > 0 && (!best || delta > best.delta)) {
                best = {
                  slot, slotLabel: _slotLabelI18n(slot), idx,
                  fromKey: curStatKey, fromName: _affixDisplayName(s0),
                  fromVal: s1, fromRatio: s2,
                  toName: opt.name, toId: parseInt(opt.id, 10),
                  toKey: opt.statKey, toVal: maxVal * TARGET_RATIO, toRatio: TARGET_RATIO,
                  delta, newScore
                };
              }
            } catch (e) {} finally {
              cur[0] = s0; cur[1] = s1; cur[2] = s2; cur[3] = s3;
            }
          }
        }
      }
      // inline mode: 弓セット suffix swap 評価 (slot 9 + 21)
      if (bowMode === 'inline') {
        const bowEq9 = eqDet['9'];
        const bowEq21 = eqDet['21'];
        if (bowEq9 && bowEq21 && bowSets) {
          const curBowSuffix = bowEq9.exVo?.suffix;
          const bowSuffixOptions = Object.keys(bowSets);
          for (const newSfx of bowSuffixOptions) {
            const sfxInt = parseInt(newSfx, 10);
            if (sfxInt === curBowSuffix) continue;
            if (performance.now() > _sliceDeadline) {
              await _macroYield();
              if (abortCheck()) return { ri: working, startScore, endScore: curScore, steps, aborted: true };
              _sliceDeadline = performance.now() + SLICE_MS;
            }
            const sv9 = bowEq9.exVo.suffix, sv21 = bowEq21.exVo ? bowEq21.exVo.suffix : undefined;
            try {
              bowEq9.exVo.suffix = sfxInt;
              if (bowEq21.exVo) bowEq21.exVo.suffix = sfxInt;
              const p = await _buildParams();
              window.computeExpected(p);
              const newScore = _scoreWithBonus(working);
              const delta = newScore - curScore;
              if (delta > 0 && (!best || delta > best.delta)) {
                const lang = _curLang();
                const _setN = (sfx) => {
                  if (!sfx || !window.WWM_DS) return '';
                  const n = window.WWM_DS.name('sets', sfx, lang);
                  return n.indexOf('[sets:') === 0 ? '' : n;
                };
                const oldName = _setN(curBowSuffix);
                const newName = _setN(sfxInt);
                best = {
                  kind: 'bowSet',
                  slot: '9,21', slotLabel: _slotLabelI18n('21') + '/' + _slotLabelI18n('9'),
                  fromName: oldName, fromSuffix: curBowSuffix,
                  toName: newName, toSuffix: sfxInt,
                  delta, newScore
                };
              }
            } catch(e) {} finally {
              bowEq9.exVo.suffix = sv9;
              if (bowEq21.exVo) bowEq21.exVo.suffix = sv21;
            }
          }
        }
      }
      if (!best) {
        // inline mode + iter=0 (弓のみ評価) で改善なし → affix 最適化に進む
        if (bowMode === 'inline' && iter === 0) continue;
        break;
      }
      // 採用 = working state 更新
      if (best.kind === 'bowSet') {
        working.wearEquipsDetailed['9'].exVo.suffix = best.toSuffix;
        working.wearEquipsDetailed['21'].exVo.suffix = best.toSuffix;
      } else {
        const tgt = working.wearEquipsDetailed[best.slot].exVo.baseAffixes[best.idx].equipmentDetails;
        const tgtMax = _getAffixMax(window.WWM_AFFIX?.[best.toId]?.statKey, charLv);
        tgt[0] = best.toId;
        tgt[1] = tgtMax * TARGET_RATIO;
        tgt[2] = TARGET_RATIO;
        tgt[3] = 2;
      }
      if (collectSteps) steps.push(best);
      curScore = best.newScore;
    }
    // prepost mode: iter loop 後 弓 suffix 再評価 + 最終 score recompute
    if (bowMode === 'prepost') {
      await _bowSuffixSwapBest();
      try {
        const p = await _buildParams();
        window.computeExpected(p);
        curScore = _scoreWithBonus(working);
      } catch (_) {}
    }
    return { ri: working, startScore, endScore: curScore, steps, aborted: false };
  }

  // ── ゼロベース比較 OPT (格析 機能、 2026-06-18 兄貴指示 TODO 1) ─────────
  // runOptimizer の薄い wrapper (zeroBase + overrideIdx5 + stateXinfaMax + bowMode='prepost')
  //
  // 引数: roleInfo / state / overrideIdx5 = 'voidPen' or 'physPen' (武器系 idx5 強制 statKey)
  // 戻り値: { ri: 最適 roleInfo, score: 武格指数 (statusScore) }
  async function runZerobaseCompare(roleInfo, state, overrideIdx5) {
    if (!roleInfo || !window.WWMStats?.buildStatParams) return null;
    const result = await runOptimizer(roleInfo, state, {
      zeroBase: true,
      overrideIdx5,
      stateXinfaMax: true,
      ratio: 1.0,
      MAX_ITER: 80,
      bowMode: 'prepost',
    });
    return { ri: result.ri, score: Math.round(result.endScore) };
  }

  // ── ゼロベース比較 panel (anlz subtab zb、 2026-06-18 兄貴指示 TODO 1) ──
  // 計算重い (ゼロ起点 + 2 パターン並列) ので auto 計算でなく「測定開始」 button 経由 (兄貴指示 2026-06-18)。
  // 一度計算済 + roleInfo 不変なら cache 結果即表示、 再計算は button 押下で新規実行。
  let _zbLastRoleInfoSig = null;
  let _zbCacheHtml = null; // cache 描画用 (panel innerHTML 全体)
  function renderZerobasePanel(roleInfo) {
    const root = document.getElementById('wwmZerobase');
    if (!root) return;
    if (!roleInfo) return;
    const T_ = window.T || {};
    const sig = JSON.stringify(roleInfo?.wearEquipsDetailed || {}) + '|' + (roleInfo?.kongfuMain ?? '') + '|' + (roleInfo?.kongfuSub ?? '');
    // cache 有効 (= roleInfo 不変) + 既計算済 = cache 結果即表示 (= ロード時間ゼロ)
    if (_zbLastRoleInfoSig === sig && _zbCacheHtml) {
      root.innerHTML = _zbCacheHtml;
      _zbBindCachedHandlers(root, roleInfo);
      return;
    }
    // 初期 = 測定開始 button + 説明
    root.innerHTML = `
      <div class="wwm-zb-start">
        <div class="wwm-zb-start-desc">${T_.optZerobaseStartDesc || 'ゼロベースで装備 affix の最適配置を 2 パターン (属性特化 / 外功特化) 並列計算します。計算に十秒〜数十秒かかります。'}</div>
        <button class="wwm-btn-primary wwm-zb-start-btn" id="wwmZbStartBtn">${T_.optZerobaseStart || '測定開始'}</button>
      </div>
    `;
    root.querySelector('#wwmZbStartBtn').addEventListener('click', () => _runZerobasePanel(roleInfo, sig));
  }

  function _zbBindCachedHandlers(root, roleInfo) {
    // 採用 button 再 bind (cache html 復元時)
    const vBtn = root.querySelector('#wwmZbApplyVoid');
    const pBtn = root.querySelector('#wwmZbApplyPhys');
    const rBtn = root.querySelector('#wwmZbRerunBtn');
    if (vBtn && _zbVoidRes) { vBtn.disabled = false; vBtn.addEventListener('click', () => _applyZbResult(_zbVoidRes)); }
    if (pBtn && _zbPhysRes) { pBtn.disabled = false; pBtn.addEventListener('click', () => _applyZbResult(_zbPhysRes)); }
    if (rBtn) rBtn.addEventListener('click', () => { _zbCacheHtml = null; _zbLastRoleInfoSig = null; renderZerobasePanel(roleInfo); });
    // scrollbar 強制適用
    root.querySelectorAll('.wwm-zb-body').forEach(el => {
      el.style.scrollbarWidth = 'thin';
      el.style.scrollbarColor = '#8a6f30 transparent';
    });
  }
  // cache 用 res 保持
  let _zbVoidRes = null, _zbPhysRes = null;

  async function _runZerobasePanel(roleInfo, sig) {
    const root = document.getElementById('wwmZerobase');
    if (!root) return;
    const T_ = window.T || {};
    const state = WWMHelpers.storage.loadJSON('wwm_last_state_v1') || {};
    const curScore = Math.round(WWMState.baseline?.statusScore ?? 0);
    root.innerHTML = `
      <div class="wwm-zb-panel wwm-analysis-card">
        <div class="wwm-zb-grid">
          <div class="wwm-zb-col">
            <h3 class="wwm-zb-col-title">
              <span class="wwm-zb-col-title-text">${T_.optZerobaseVoid||'属性特化ビルド'}</span>
              <span class="wwm-zb-col-score" id="wwmZbScoreVoid">—</span>
              <button class="wwm-zb-apply-btn" id="wwmZbApplyVoid" disabled>${T_.cmpApply||'採用'}</button>
            </h3>
            <div class="wwm-zb-body" id="wwmZbVoidBody"><div class="wwm-opt-loading">${T_.optZerobaseCalc||'計算中…'}</div></div>
          </div>
          <div class="wwm-zb-divider"></div>
          <div class="wwm-zb-col">
            <h3 class="wwm-zb-col-title">
              <span class="wwm-zb-col-title-text">${T_.optZerobasePhys||'外功特化ビルド'}</span>
              <span class="wwm-zb-col-score" id="wwmZbScorePhys">—</span>
              <button class="wwm-zb-apply-btn" id="wwmZbApplyPhys" disabled>${T_.cmpApply||'採用'}</button>
            </h3>
            <div class="wwm-zb-body" id="wwmZbPhysBody"><div class="wwm-opt-loading">${T_.optZerobaseCalc||'計算中…'}</div></div>
          </div>
        </div>
        <div class="wwm-zb-rerun-row">
          <button class="wwm-btn-secondary wwm-zb-rerun-btn" id="wwmZbRerunBtn">${T_.optZerobaseRerun||'再計算'}</button>
        </div>
      </div>
    `;

    // scrollbar 強制適用 (inline style = max specificity、 CSS cascade 競合回避)
    root.querySelectorAll('.wwm-zb-body').forEach(el => {
      el.style.scrollbarWidth = 'thin';
      el.style.scrollbarColor = '#8a6f30 transparent';
    });

    let voidRes = null, physRes = null;
    try {
      [voidRes, physRes] = await Promise.all([
        runZerobaseCompare(roleInfo, state, 'voidPen'),
        runZerobaseCompare(roleInfo, state, 'physPen')
      ]);
    } catch (e) { console.error('[ZbPanel]', e); }

    root.querySelector('#wwmZbVoidBody').innerHTML = _renderZbResult(voidRes, curScore);
    root.querySelector('#wwmZbPhysBody').innerHTML = _renderZbResult(physRes, curScore);

    const _fmtScore = (res) => {
      if (!res) return '—';
      const d = res.score - curScore;
      const sign = d >= 0 ? '+' : '';
      const dCls = d >= 0 ? 'pos' : 'neg';
      return `${res.score.toLocaleString()} <span class="wwm-zb-delta ${dCls}">Δ${sign}${d.toLocaleString()}</span>`;
    };
    const sv = root.querySelector('#wwmZbScoreVoid');
    const sp = root.querySelector('#wwmZbScorePhys');
    if (sv) sv.innerHTML = _fmtScore(voidRes);
    if (sp) sp.innerHTML = _fmtScore(physRes);

    const vBtn = root.querySelector('#wwmZbApplyVoid');
    const pBtn = root.querySelector('#wwmZbApplyPhys');
    if (voidRes) { vBtn.disabled = false; vBtn.addEventListener('click', () => _applyZbResult(voidRes)); }
    if (physRes) { pBtn.disabled = false; pBtn.addEventListener('click', () => _applyZbResult(physRes)); }
    const rBtn = root.querySelector('#wwmZbRerunBtn');
    if (rBtn) rBtn.addEventListener('click', () => { _zbCacheHtml = null; _zbLastRoleInfoSig = null; renderZerobasePanel(roleInfo); });
    // cache 保存 (= 同 sig で次回 click 時に即表示)
    _zbVoidRes = voidRes; _zbPhysRes = physRes; _zbLastRoleInfoSig = sig;
    _zbCacheHtml = root.innerHTML;
  }
  // roleInfo 変更時 (採用/復元/再 import 等) は次回タブ click で再計算させる
  function _invalidateZerobaseCache() { _zbLastRoleInfoSig = null; }

  function _renderZbResult(res, curScore) {
    const T_ = window.T || {};
    if (!res) return `<div class="wwm-opt-loading">${T_.optZerobaseFailed||'計算失敗'}</div>`;
    const delta = res.score - curScore;
    const sign = delta >= 0 ? '+' : '';
    const slots = ['1','2','10','11','3','4','5','8'];
    const eqDet = res.ri?.wearEquipsDetailed || {};
    const _affixUtil = window.WWMSidebar.affix;
    const slotsHtml = slots.filter(s => eqDet[s]).map(slot => {
      const ba = eqDet[slot]?.exVo?.baseAffixes || [];
      const slotLabel = window.WWMSidebar?.icons?.slotLabelI18n?.(slot) || ('slot ' + slot);
      const affixHtml = ba.map((a, idx) => {
        const d = a?.equipmentDetails;
        if (!d || d[0] == null) return '';
        const sk = window.WWM_AFFIX?.[d[0]]?.statKey;
        const name = _affixUtil.affixDisplayNameSplit(d[0], idx);
        const isPct = sk ? _affixUtil.isPctStat(sk) : false;
        const needsMul = sk ? _affixUtil.pctNeedsMul(sk) : false;
        const v = (typeof d[1] === 'number')
          ? (isPct ? (needsMul ? (d[1]*100).toFixed(1)+'%' : d[1].toFixed(1)+'%') : d[1].toFixed(1))
          : '-';
        return `<div class="wwm-zb-affix"><span class="wwm-zb-affix-name">${name}</span><span class="wwm-zb-affix-val">${v}</span></div>`;
      }).join('');
      return `<div class="wwm-zb-slot"><div class="wwm-zb-slot-name">${slotLabel}</div>${affixHtml}</div>`;
    }).join('');
    return `<div class="wwm-zb-slots">${slotsHtml}</div>`;
  }

  function _applyZbResult(res) {
    const T_ = window.T || {};
    const msg = T_.optZerobaseConfirm || 'この構成を採用しますか？\n現在の affix が全 slot で上書きされます (装備本体は keep)。';
    if (!confirm(msg)) return;
    const eqDet = res.ri?.wearEquipsDetailed || {};
    if (!WWMState.virtual.gear) WWMState.virtual.gear = {};
    for (const slot of Object.keys(eqDet)) {
      const baseEq = WWMState.roleInfo?.wearEquipsDetailed?.[slot];
      if (!baseEq) continue;
      const cur = WWMState.virtual.gear[slot]
        ? JSON.parse(JSON.stringify(WWMState.virtual.gear[slot]))
        : JSON.parse(JSON.stringify(baseEq));
      cur.exVo = cur.exVo || {};
      cur.exVo.baseAffixes = JSON.parse(JSON.stringify(eqDet[slot]?.exVo?.baseAffixes || []));
      if (eqDet[slot]?.exVo?.suffix !== undefined) cur.exVo.suffix = eqDet[slot].exVo.suffix;
      WWMState.virtual.gear[slot] = cur;
    }
    if (typeof window._saveVirtuals === 'function') window._saveVirtuals();
    if (window.showToast) window.showToast(T_.optZerobaseApplied || 'ゼロベース構成を採用しました');
    _invalidateZerobaseCache();
    if (typeof window._refreshAll === 'function') window._refreshAll();
  }

  // ── expose ───────────────────────────────────────────────
  window.WWMSidebar = window.WWMSidebar || {};
  window.WWMSidebar.opt = {
    render: renderOptimization,
    exportSteps: _exportOptSteps,
    applySteps: _applyOptSteps,
    resortRows: _OPT_resortRows,
    runZerobaseCompare,
    runOptimizer,
    renderZerobase: renderZerobasePanel,
    invalidateZerobase: _invalidateZerobaseCache,
  };
})();

// vite移行 P2: ESM 副作用 module 化 (window expose は IIFE 内 keep)
export {};
