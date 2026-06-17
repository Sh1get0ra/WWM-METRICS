// ── WWM-METRICS Sidebar / 装備最適化 (Phase 3.4 切出) ────────
// Greedy 全体最適化: renderOptimization / _renderOptimizationInner /
// _OPT_resortRows / _exportOptSteps / _applyOptSteps
(function () {
  'use strict';

  // ── 他 module alias ─────────────────────────────────────
  const _fmtAffixVal       = window.WWMSidebar.affix.fmtAffixVal;
  const _getAffixOptions   = window.WWMSidebar.affix.getAffixOptions;
  const _getAffixMax       = window.WWMSidebar.affix.getAffixMax;
  const _SLOT6_ARMOR       = window.WWMSidebar.affix.SLOT6_ARMOR;
  const _affixDisplayName  = window.WWMSidebar.affix.affixDisplayName;
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
        ? `<span class="wwm-opt-from">${s.fromName||'(未装着)'}</span> ▶ <span class="wwm-opt-to">${s.toName}</span>`
        : `<span class="wwm-opt-from">${_fmtFromTo(s.fromName, s.fromVal, s.fromRatio, s.fromKey)}</span> ▶ <span class="wwm-opt-to">${_fmtFromTo(s.toName, s.toVal, s.toRatio, s.toKey)}</span>`;
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
    const MAX_ITER = 20; // best=null で自動停止、上限保険
    // 微改善打切閾値 (localStorage 永続化、UI で変更可)
    if (typeof window._OPT_MIN_DELTA === 'undefined' || window._OPT_MIN_DELTA == null) {
      try { window._OPT_MIN_DELTA = parseInt(localStorage.getItem('wwm_opt_min_delta_v1'), 10) || 5; } catch(_) { window._OPT_MIN_DELTA = 5; }
    }
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
          <label class="wwm-opt-ratio-label" title="${T_.optMinDeltaTip||'これ未満のΔで打切'}">Δ<input type="number" id="wwmOptMinDelta" min="2" max="50" step="1" value="${window._OPT_MIN_DELTA}" style="width:40px;background:var(--shade-mid);color:var(--sumi-fg);border:1px solid var(--ink-2);border-radius:3px;padding:2px 4px;font-family:var(--f-latin);"></label>
          <button type="button" class="wwm-opt-btn" id="wwmOptToggleAll" title="${T_.optToggleAllTip||'全選択/全解除 切替'}">☑</button>
          <button type="button" class="wwm-opt-btn wwm-opt-btn-apply" id="wwmOptApplyAll">${T_.optApplySelected||'選択適用'}</button>
        </div>
      </div>
      <div class="wwm-opt-progress" id="wwmOptProgress"></div>
    `;
    const slotsAllowed = new Set(['1','2','3','4','5','8','10','11']);
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
      const mdEl = root.querySelector('#wwmOptMinDelta');
      if (mdEl) mdEl.addEventListener('change', () => {
        const v = parseInt(mdEl.value, 10);
        if (!isNaN(v) && v >= 2) {
          window._OPT_MIN_DELTA = v;
          try { localStorage.setItem('wwm_opt_min_delta_v1', String(v)); } catch(_) {}
          renderOptimization(roleInfo, params);
        }
      });
      const apEl = root.querySelector('#wwmOptApplyAll');
      if (apEl) apEl.addEventListener('click', () => {
        const checkedIdxs = Array.from(root.querySelectorAll('.wwm-opt-check:checked'))
          .map(cb => parseInt(cb.dataset.optStep, 10))
          .filter(i => !isNaN(i));
        const sel = (_OPT_LAST_STEPS || []).filter((_, i) => checkedIdxs.includes(i));
        _applyOptSteps(sel);
      });
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
    ['#wwmOptRatio', '#wwmOptMinDelta', '#wwmOptApplyAll', '#wwmOptToggleAll'].forEach(sel => {
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
    const charLv = roleInfo?.level || 95;
    // 作業用 roleInfo clone
    let working = JSON.parse(JSON.stringify(roleInfo));
    // 初期 baseline
    let startScore = 0;
    try {
      await window.WWMStats.buildStatParams(working, state);
      startScore = _scoreWithBonus(working);
    } catch (e) { return; }
    const steps = [];
    let curScore = startScore;
    // tier 表示用 SS閾値 (worldLv 由来)
    const wl = params?.worldLv || 15;
    const ssThr = 6700 * Math.pow(0.8, 14 - wl);
    let lastBestNull = false;
    // ── perf 基盤 (2026-06-10 Phase1: 候補評価を clone レス + 同期 + 刈り込みで高速化。結果は旧実装とバイナリ同一) ──
    // yield: per-slot setTimeout(0) (nesting clamp 4ms) を廃止 → 8ms 時間予算制。
    // long task を ~10ms 以下に抑え score アニメの FPS 低下も防ぐ (TODO 23)。
    const SLICE_MS = 8;
    const _macroYield = () => new Promise(res => {
      if (typeof scheduler !== 'undefined' && scheduler.yield) { scheduler.yield().then(res, res); return; }
      const ch = new MessageChannel();
      ch.port1.onmessage = () => res();
      ch.port2.postMessage(null);
    });
    let _sliceDeadline = performance.now() + SLICE_MS;
    // 死 statKey skip: 現 roleInfo 構成で score に到達しない key (寄与恒等0 = Δ≤0 = 絶対不採用) を評価前に刈る。
    // 判定は stats.js buildAffixAliveJudge (集約経路と 1:1、kongfu 不変なので run 中固定)。
    const _alive = window.WWMStats.buildAffixAliveJudge
      ? window.WWMStats.buildAffixAliveJudge(working)
      : (() => true);
    // _getAffixOptions cache: slot 内 affix 構成 (= blockedKeys 入力) が変わらない限り再利用
    const _optionsCache = new Map();
    // 同期 params 構築 (dict は上の buildStatParams 1 回で ensure 済)
    const _buildSync = window.WWMStats.buildStatParamsSync || null;
    // iter=0 は弓セット swap のみ評価 (他affixより先に確定)
    // iter>=1 は affix swap (弓セットも再評価)
    for (let iter = 0; iter < MAX_ITER; iter++) {
      if (_aborted()) return;
      setProgress(((window.T?.optComputingIter) || '計算中... ({0}回目)').replace('{0}', iter + 1));
      // import gate (Tier 判定中 modal) の擬似 % bar 前進 (gate 非表示時は no-op)
      if (window.WWMImportGate) window.WWMImportGate.tick(iter + 1);
      const eqDet = working.wearEquipsDetailed || {};
      const slots = ['1','2','3','4','5','8','10','11'].filter(s => eqDet[s] && slotsAllowed.has(s));
      let best = null;
      // iter=0 は弓セットだけ評価 (affix skip)
      const skipAffix = (iter === 0);
      for (const slot of skipAffix ? [] : slots) {
        const eq = eqDet[slot];
        const affixes = eq?.exVo?.baseAffixes || [];
        for (let idx = 0; idx < affixes.length; idx++) {
          const cur = affixes[idx]?.equipmentDetails;
          if (!cur) continue;
          const curStatKey = window.WWM_AFFIX?.[cur[0]]?.statKey;
          const isArmorIdx5 = (idx === 5 && _SLOT6_ARMOR.has(slot));
          // Phase 2 (兄貴指示 2026-06-17): 同 statKey value 上げ step 評価 (= 武器 idx=5 / 防具 idx=5 含む全 idx)
          // current value < max × TARGET_RATIO なら value 上げ提案、 OPT 提案受けたら ratio 100% 到達設計
          if (curStatKey) {
            const _maxValSame = _getAffixMax(curStatKey, charLv);
            if (_maxValSame != null && cur[1] < _maxValSame * TARGET_RATIO - 1e-6) {
              const _s0 = cur[0], _s1 = cur[1], _s2 = cur[2], _s3 = cur[3];
              try {
                cur[1] = _maxValSame * TARGET_RATIO;
                cur[2] = TARGET_RATIO;
                cur[3] = 2;
                const _p = _buildSync ? _buildSync(working, state) : await window.WWMStats.buildStatParams(working, state);
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
          // 防具 idx=5 = 武学固有、 statKey swap 探索外 (value 上げ step のみ既に評価済)
          if (isArmorIdx5) continue;
          const _sig = slot + '|' + idx + '|' + affixes.map(a => a?.equipmentDetails?.[0] ?? '-').join(',');
          let options = _optionsCache.get(_sig);
          if (!options) { options = _getAffixOptions(cur[0], slot, idx, affixes); _optionsCache.set(_sig, options); }
          for (const opt of options) {
            if (opt.statKey === curStatKey) continue;
            if (!_alive(opt.statKey)) continue; // 死 key = Δ≤0 確定 → 評価不要
            const maxVal = _getAffixMax(opt.statKey, charLv);
            if (maxVal == null) continue;
            if (performance.now() > _sliceDeadline) {
              await _macroYield();
              if (_aborted()) return;
              _sliceDeadline = performance.now() + SLICE_MS;
            }
            // in-place swap → 評価 → 復元 (clone 廃止)。finally 復元で working 汚染を遮断
            const s0 = cur[0], s1 = cur[1], s2 = cur[2], s3 = cur[3];
            try {
              cur[0] = parseInt(opt.id, 10);
              cur[1] = maxVal * TARGET_RATIO;
              cur[2] = TARGET_RATIO;
              cur[3] = 2;
              const p = _buildSync ? _buildSync(working, state) : await window.WWMStats.buildStatParams(working, state);
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
      // 弓セット (slot 9 + 21) suffix swap 評価
      const bowEq9 = eqDet['9'];
      const bowEq21 = eqDet['21'];
      if (bowEq9 && bowEq21 && window.WWM_SETS?.bowSets) {
        const curBowSuffix = bowEq9.exVo?.suffix;
        const bowSuffixOptions = Object.keys(window.WWM_SETS.bowSets);
        for (const newSfx of bowSuffixOptions) {
          const sfxInt = parseInt(newSfx, 10);
          if (sfxInt === curBowSuffix) continue;
          if (performance.now() > _sliceDeadline) {
            await _macroYield();
            if (_aborted()) return;
            _sliceDeadline = performance.now() + SLICE_MS;
          }
          // in-place suffix swap → 評価 → 復元 (clone 廃止)
          const sv9 = bowEq9.exVo.suffix, sv21 = bowEq21.exVo ? bowEq21.exVo.suffix : undefined;
          try {
            bowEq9.exVo.suffix = sfxInt;
            if (bowEq21.exVo) bowEq21.exVo.suffix = sfxInt;
            const p = _buildSync ? _buildSync(working, state) : await window.WWMStats.buildStatParams(working, state);
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
      if (!best) {
        // iter=0 (弓セット評価) で改善なし → affix最適化に進む (continue)
        if (iter === 0) continue;
        break;
      }
      // 微改善で早期収束 (Δ<閾値) — push せずに break
      if (best.delta < window._OPT_MIN_DELTA && iter > 0) break;
      // 採用: working state 更新
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
      // tier 達成判定
      const TIER_LIST = [['SS', 1.0], ['S', 0.9], ['A', 0.8], ['B', 0.6]];
      let prevTier = 'C', curTier = 'C';
      for (const [name, mult] of TIER_LIST) {
        if (curScore >= ssThr * mult && prevTier === 'C') prevTier = name;
        if (best.newScore >= ssThr * mult && curTier === 'C') curTier = name;
      }
      if (prevTier !== curTier) best.tierUp = `${prevTier} ▶ ${curTier}`;
      steps.push(best);
      curScore = best.newScore;
    }
    // 復元
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
        ? `<span class="wwm-opt-from">${s.fromName||'(未装着)'}</span> ▶ <span class="wwm-opt-to">${s.toName}</span>`
        : `<span class="wwm-opt-from">${_fmtFromTo(s.fromName, s.fromVal, s.fromRatio, s.fromKey)}</span> ▶ <span class="wwm-opt-to">${_fmtFromTo(s.toName, s.toVal, s.toRatio, s.toKey)}</span>`;
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
      `WWM-METRICS 装備最適化提案 (目標 ${Math.round(s.ratio*100)}%)`,
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

  // ── expose ───────────────────────────────────────────────
  window.WWMSidebar = window.WWMSidebar || {};
  window.WWMSidebar.opt = {
    render: renderOptimization,
    exportSteps: _exportOptSteps,
    applySteps: _applyOptSteps,
    resortRows: _OPT_resortRows,
  };
})();
