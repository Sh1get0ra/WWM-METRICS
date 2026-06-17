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
    // MAX 算出 (maxRi + slotMaxLoo) = インポート直後 初回のみ実行 (兄貴指示 2026-06-17、 計算重い iter 反復のため)
    if (!WWMState.opt.locked) {
      // 装備品質 % 用: max ri snapshot + 各 slot MAX LOO 算出
      WWMState.opt.maxRi = JSON.parse(JSON.stringify(working));
      // 空 base 起点 OPT (兄貴指示 2026-06-17): 全 affix 空 + 弓 suffix 0 化から greedy で各 slot 各 idx に
      // 理論最良 affix を詰め直す。 真の組合せ最適に近づける (現状起点 OPT の局所最適制約超え)。
      // 副産物: ユーザー視点で「現状方向性が真の最適と乖離してないか」 のチェックにもなる。
      try {
        const _affixUtil = window.WWMSidebar.affix;
        const trueMaxRi = JSON.parse(JSON.stringify(working));
        // 0. 元 working の affix ID を memo (= _getAffixOptions の seed 用、 prefix 制約 keep)
        const origAffixMemo = {};
        for (const sl of Object.keys(trueMaxRi.wearEquipsDetailed || {})) {
          origAffixMemo[sl] = {};
          const ba = working.wearEquipsDetailed[sl]?.exVo?.baseAffixes || [];
          for (let i = 0; i < ba.length; i++) {
            const det = ba[i]?.equipmentDetails;
            if (det && det[0] != null) origAffixMemo[sl][i] = det[0];
          }
        }
        // 1. 95% fix base 作成 (兄貴指示 2026-06-17): 全 affix value を max × TARGET_RATIO に統一
        // = 兄貴の現状 affix value の差を「統一基準」 で評価可能化 (95% 超え/未満どちらも公平)
        // 弓ペア (slot 21/9) = affix touch しない + suffix 0 化 (= bow swap で改めて選定)
        const BOW_PAIR = new Set(['21', '9']);
        for (const sl of Object.keys(trueMaxRi.wearEquipsDetailed || {})) {
          const ba = trueMaxRi.wearEquipsDetailed[sl]?.exVo?.baseAffixes || [];
          if (BOW_PAIR.has(sl)) {
            if (trueMaxRi.wearEquipsDetailed[sl]?.exVo) {
              trueMaxRi.wearEquipsDetailed[sl].exVo.suffix = 0;
            }
            continue;
          }
          for (let i = 0; i < ba.length; i++) {
            const det = ba[i]?.equipmentDetails;
            if (!det) continue;
            const sk = window.WWM_AFFIX?.[det[0]]?.statKey;
            const mv = sk ? _affixUtil.getAffixMax(sk, charLv) : null;
            if (mv != null) {
              const target = mv * TARGET_RATIO;
              // 95% 超えのみ target に下げる、 95% 未満は兄貴の現状値 keep (= OPT loop で value 上げ提案対象に) (兄貴指示 2026-06-17)
              if (det[1] > target) {
                det[1] = target;
                det[2] = TARGET_RATIO;
              }
            }
          }
        }
        const maxStatePre = JSON.parse(JSON.stringify(state || {}));
        if (!maxStatePre.xinfaTiers) maxStatePre.xinfaTiers = {};
        for (let i = 0; i < 4; i++) { maxStatePre.xinfaTiers[i] = 6; maxStatePre.xinfaTiers[String(i)] = 6; }
        // 2. iter 反復 = 既存 OPT 機能を value 0 起点で走らせた挙動 (兄貴指示 2026-06-17)
        // 各 idx で「同 statKey value 更新 (0 → max × 0.95)」 + 「他 statKey swap」 両方評価 → 最大 delta 採用 → 反復
        const MAX_ITER = 80; // 全 affix 詰める = slot 10 × idx 6 = 60 step + 局所最適脱出 余裕
        for (let iter = 0; iter < MAX_ITER; iter++) {
          let bestStep = null;
          for (const slot of Object.keys(trueMaxRi.wearEquipsDetailed || {})) {
            // 弓ペア (slot 21/9) = affix touch しない (兄貴指示 2026-06-17、 弓武器に affix ない仕様)
            if (BOW_PAIR.has(slot)) continue;
            const eq = trueMaxRi.wearEquipsDetailed[slot];
            const ba = eq?.exVo?.baseAffixes || [];
            for (let idx = 0; idx < ba.length; idx++) {
              // 元 working で affix 持ってない idx (= ba[idx] 元 null or equipmentDetails 元 null) → ゲーム上「この idx に affix 乗らない」 ため skip
              if (origAffixMemo[slot]?.[idx] == null) continue;
              const curDet = ba[idx]?.equipmentDetails;
              const curStatKey = curDet ? window.WWM_AFFIX?.[curDet[0]]?.statKey : null;
              // seedId = 元 working の affix ID で固定 = 当該 slot/idx の prefix 制約 keep
              // (iter 反復で curDet[0] が変動 → 別 statKey の prefix で候補絞り込み → 選択不可 affix 採用される旧バグ修正)
              const seedId = origAffixMemo[slot][idx];
              const opts = _affixUtil.getAffixOptions(seedId, slot, idx, ba);
              let baseScore = 0;
              try {
                const p = await window.WWMStats.buildStatParams(trueMaxRi, maxStatePre);
                window.computeExpected(p);
                baseScore = _scoreWithBonus(trueMaxRi);
              } catch (_) {}
              // 評価対象: 「同 statKey value 0→max × ratio」 + 「他 statKey swap」 両方
              const candidates = [];
              // 同 statKey value 更新 (current value 0 の時のみ意味あり、 既に詰まってる時は skip)
              if (curStatKey && curDet && (curDet[1] || 0) < 1e-9) {
                candidates.push({ id: curDet[0], statKey: curStatKey });
              }
              // 他 statKey swap
              for (const o of opts) {
                if (!o.statKey || o.statKey === '__pvp__') continue;
                if (o.statKey === curStatKey) continue;
                candidates.push({ id: parseInt(o.id, 10), statKey: o.statKey });
              }
              for (const c of candidates) {
                const mv = _affixUtil.getAffixMax(c.statKey, charLv);
                if (mv == null) continue;
                const sBak = ba[idx]?.equipmentDetails?.slice();
                if (!ba[idx]) ba[idx] = {};
                ba[idx].equipmentDetails = [c.id, mv * TARGET_RATIO, TARGET_RATIO, 2];
                try {
                  const p = await window.WWMStats.buildStatParams(trueMaxRi, maxStatePre);
                  window.computeExpected(p);
                  const sc = _scoreWithBonus(trueMaxRi);
                  const delta = sc - baseScore;
                  if (delta > 0 && (!bestStep || delta > bestStep.delta)) {
                    bestStep = { slot, idx, det: ba[idx].equipmentDetails.slice(), delta };
                  }
                } catch (_) {}
                ba[idx].equipmentDetails = sBak;
              }
            }
          }
          if (!bestStep) break;
          const ba = trueMaxRi.wearEquipsDetailed[bestStep.slot].exVo.baseAffixes;
          if (!ba[bestStep.idx]) ba[bestStep.idx] = {};
          ba[bestStep.idx].equipmentDetails = bestStep.det;
        }
        // 3. 弓 suffix swap 評価
        const bowSets = window.WWM_SETS?.bowSets;
        if (bowSets && trueMaxRi.wearEquipsDetailed['21']?.exVo && trueMaxRi.wearEquipsDetailed['9']?.exVo) {
          let baseScore = 0;
          try {
            const p = await window.WWMStats.buildStatParams(trueMaxRi, maxStatePre);
            window.computeExpected(p);
            baseScore = _scoreWithBonus(trueMaxRi);
          } catch (_) {}
          let bestSfx = 0, bestDelta = 0;
          for (const sfx of Object.keys(bowSets)) {
            const sfxInt = parseInt(sfx, 10);
            trueMaxRi.wearEquipsDetailed['21'].exVo.suffix = sfxInt;
            trueMaxRi.wearEquipsDetailed['9'].exVo.suffix = sfxInt;
            try {
              const p = await window.WWMStats.buildStatParams(trueMaxRi, maxStatePre);
              window.computeExpected(p);
              const sc = _scoreWithBonus(trueMaxRi);
              const delta = sc - baseScore;
              if (delta > bestDelta) { bestSfx = sfxInt; bestDelta = delta; }
            } catch (_) {}
          }
          trueMaxRi.wearEquipsDetailed['21'].exVo.suffix = bestSfx;
          trueMaxRi.wearEquipsDetailed['9'].exVo.suffix = bestSfx;
        }
        WWMState.opt.maxRi = trueMaxRi;
      } catch (e) { console.error('[opt 空base起点 MAX]', e); }
      try {
        const slotMaxLoo = {};
        const maxRi = WWMState.opt.maxRi;
        // 心法/武庫 も MAX 状態 (xinfaTiers 全 6 + arsenal max) で計算
        const maxState = JSON.parse(JSON.stringify(state || {}));
        if (!maxState.xinfaTiers) maxState.xinfaTiers = {};
        for (let i = 0; i < 4; i++) { maxState.xinfaTiers[i] = 6; maxState.xinfaTiers[String(i)] = 6; }
        // 武庫: 全 tier max 想定 (現 state.arsenal の構造 keep、 ただし peaked = true 想定で max value 採用)
        const baseParams = await window.WWMStats.buildStatParams(maxRi, maxState);
        window.computeExpected(baseParams);
        const maxTotal = _scoreWithBonus(maxRi);
        // 装備 slot MAX LOO: MAX state での marginal LOO 方式 (兄貴指示 2026-06-17 再確認)
        // 機械が考えた最強装備 (= maxRi) に対する当該 slot の他装備込み寄与を測る
        const eqDet = maxRi?.wearEquipsDetailed || {};
        const gearSlots = ['1','2','3','4','21','10','11','5','8','9'].filter(s => eqDet[s]);
        const bowPairMax = ['21', '9'];
        const hasBowPairMax = bowPairMax.every(s => gearSlots.includes(s));
        for (const slot of gearSlots) {
          if (hasBowPairMax && bowPairMax.includes(slot)) continue;
          const ri = JSON.parse(JSON.stringify(maxRi));
          delete ri.wearEquipsDetailed[slot];
          const p = await window.WWMStats.buildStatParams(ri, maxState);
          window.computeExpected(p);
          const noSlot = _scoreWithBonus(ri);
          slotMaxLoo['gear:' + slot] = Math.round(maxTotal - noSlot);
        }
        // 弓ペア = pair 同時抜き → total LOO half 配分
        if (hasBowPairMax) {
          const ri = JSON.parse(JSON.stringify(maxRi));
          for (const ps of bowPairMax) delete ri.wearEquipsDetailed[ps];
          const pNoPair = await window.WWMStats.buildStatParams(ri, maxState);
          window.computeExpected(pNoPair);
          const noPair = _scoreWithBonus(ri);
          const pairLoo = maxTotal - noPair;
          const half = Math.round(pairLoo / 2);
          for (const ps of bowPairMax) slotMaxLoo['gear:' + ps] = half;
        }
        // 心法 slot MAX LOO (各 slot tier 0 化との差)
        for (let i = 0; i < 4; i++) {
          const altSt = JSON.parse(JSON.stringify(maxState));
          altSt.xinfaTiers[i] = 0;
          altSt.xinfaTiers[String(i)] = 0;
          const p = await window.WWMStats.buildStatParams(maxRi, altSt);
          window.computeExpected(p);
          const noXinfa = _scoreWithBonus(maxRi);
          slotMaxLoo['xinfa:' + i] = Math.round(maxTotal - noXinfa);
        }
        // 武庫 MAX LOO (arsenal 抜きとの差)
        const noArsSt = JSON.parse(JSON.stringify(maxState));
        if (noArsSt.arsenal) noArsSt.arsenal = { path: noArsSt.arsenal.path, tiers: {} };
        const pNoArs = await window.WWMStats.buildStatParams(maxRi, noArsSt);
        window.computeExpected(pNoArs);
        const noArsScore = _scoreWithBonus(maxRi);
        slotMaxLoo['arsenal'] = Math.round(maxTotal - noArsScore);
        WWMState.opt.slotMaxLoo = slotMaxLoo;
        // localStorage 保存 (ハードリロード復元用、 opt.best と同じ scoreVer ルール)
        try {
          localStorage.setItem('wwm_opt_slot_max_loo_v1', JSON.stringify({
            slotMaxLoo, scoreVer: window.WWM_SCORE_VERSION || 1, ts: Date.now()
          }));
        } catch (_) {}
        // 復元 (元 roleInfo + state)
        const finParams = await window.WWMStats.buildStatParams(roleInfo, state);
        window.computeExpected(finParams);
        // slotMaxLoo 反映後 各 sidebar の card 再描画 (品質 % 表示有効化)
        try {
          window.WWMSidebar?.gear?.render?.(roleInfo);
          window.WWMSidebar?.xinfa?.computeCardScores?.(roleInfo);
          window.WWMSidebar?.xinfa?.computeArsenalCardScore?.(roleInfo);
        } catch (_) {}
      } catch (e) { console.error('[opt maxRi/slotMaxLoo]', e); }
    }
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
