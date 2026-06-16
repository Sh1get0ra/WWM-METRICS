// ── WWM-METRICS Sidebar / Diagnostics 弱点指摘 (Phase 3.3 切出) ─
// _diagnose / _evalPenSpecialization / _checkAffix6PenMismatch /
// _findWastedAffixes / _updateDiagBadge / _openDiagPopup / renderDiagnostics
(function () {
  'use strict';

  // ── 他 module alias ─────────────────────────────────────
  const _tpl = window.WWMSidebar.modalHelpers.tpl;
  const _loadEquipMax       = window.WWMSidebar.affix.loadEquipMax;
  const _lvToTier           = window.WWMSidebar.affix.lvToTier;
  const _getCachedEquipMax  = window.WWMSidebar.affix.getCachedEquipMax;
  const _affixDisplayName   = window.WWMSidebar.affix.affixDisplayName;
  const _slotLabelI18n      = window.WWMSidebar.icons.slotLabelI18n;
  // _scoreWithBonus は sidebar.js 内 (gear 系) で定義、 後付け expose
  const _scoreWithBonus = (ri) => window.__WWM_SCORE_WITH_BONUS(ri);

  // ── 弱点指摘 / Diagnostics ────────────────────────────────
  function _diagnose(roleInfo, params) {
    const out = [];
    if (!params) return out;
    const T_ = window.T || {};
    const jr = params.judgeRes || 1.45;
    // 命中率過多 (超過 ≥3% で通知)
    const hitCapThreshold = 0.35 * jr + 0.65;
    const hitOverPct = (params.hitRate - hitCapThreshold) * 100;
    if (hitOverPct >= 3) {
      out.push({ type: 'warn', text: _tpl(T_.diagHitOver || '命中率過多 (現 {0}% / cap {1}% / 超過 +{2}%)', (params.hitRate*100).toFixed(1), (hitCapThreshold*100).toFixed(1), hitOverPct.toFixed(1)) });
    } else if (params.hitRate < hitCapThreshold * 0.95) {
      const need = ((hitCapThreshold - params.hitRate) * 100).toFixed(1);
      out.push({ type: 'info', text: _tpl(T_.diagHitUnder || '命中率不足 (現 {0}% / cap {1}% / 残 {2}%)', (params.hitRate*100).toFixed(1), (hitCapThreshold*100).toFixed(1), need) });
    }
    // 会心率: calc.js _computeCoreLayer と同式で 実効値計算
    //   critRateAdj      = critRate / judgeRes
    //   critRateBoosted  = min(0.8, critRateAdj + bonusCritRate)    ← bonusCritRate (心法 synergy) も cap内
    //   appliedCrit      = max(0, min(1 - appliedSympathy, critRateBoosted + addCritRate))  ← addCritRate は cap突破可
    const critAdj = params.critRate / jr;
    const bonusCrit = params.bonusCritRate || 0;
    const critRawSum = critAdj + bonusCrit;
    const critRateBoosted = Math.min(0.8, critRawSum);
    const addCrit = params.addCritRate || 0;
    // 会意率
    const symAdj = params.sympathyRate / jr;
    const appliedSym = Math.min(1, Math.min(0.4, symAdj) + (params.addSympathyRate || 0));
    // 実効会心率 (cap + addCrit + 会意による上限)
    const appliedCrit = Math.max(0, Math.min(1 - appliedSym, critRateBoosted + addCrit));
    // 会心率過多 (cap前 合計 > 80% = bonusCrit 含む)
    const critOverPct = (critRawSum - 0.8) * 100;
    if (critOverPct >= 3) {
      out.push({ type: 'warn', text: _tpl(T_.diagCritOver || '会心率過多 (適用 {0}% / cap 80% / 超過 +{1}%)', (critRawSum*100).toFixed(1), critOverPct.toFixed(1)) });
    }
    // 会意率過多 (cap前 > 40%)
    const symOverPct = (symAdj - 0.4) * 100;
    if (symOverPct >= 3) {
      out.push({ type: 'warn', text: _tpl(T_.diagSymOver || '会意率過多 (適用 {0}% / cap 40% / 超過 +{1}%)', (symAdj*100).toFixed(1), symOverPct.toFixed(1)) });
    }
    // 会心率不足: critRateBoosted < 0.68 かつ 最終会心+会意 < 100% の時のみ
    // (0.8 cap は (1-appliedSym) cap でさらに頭打ち、 実効 84% 程度で飽和。 0.68 = 当初設計値、 ratio系 まだ余地ある時のみ警告)
    if (critRateBoosted < 0.68 && (appliedCrit + appliedSym) < 1.0) {
      out.push({ type: 'warn', text: _tpl(T_.diagCritUnder || '会心率不足 (実効 {0}% / 最終会心+会意 {1}%)', (appliedCrit*100).toFixed(1), ((appliedCrit+appliedSym)*100).toFixed(1)) });
    }
    // 良好メッセ
    if (!out.filter(x => x.type==='warn').length) {
      out.push({ type: 'good', text: T_.diagGood || '主要ステータス は概ね良好' });
    }
    return out;
  }

  // 外功貫通/属性貫通 +1 あたり Δscore 取得 (固定閾値判定 + mismatchは max比正規化)
  async function _evalPenSpecialization(roleInfo) {
    if (!window.WWMStats?.buildStatParams || typeof window.computeExpected !== 'function') return null;
    const state = WWMHelpers.storage.loadJSON('wwm_last_state_v1');
    await _loadEquipMax();
    const charLv = roleInfo?.level || 95;
    const tier = _lvToTier(charLv);
    const maxTbl = _getCachedEquipMax()?.tiers?.[tier] || {};
    const maxPhysPen = maxTbl.outerPen || 9;
    const maxElemPen = maxTbl.attrPen  || 10.8;
    try {
      const baseP = await window.WWMStats.buildStatParams(roleInfo, state);
      window.computeExpected(baseP);
      const baseScore = _scoreWithBonus(roleInfo);
      const p1 = { ...baseP, outerPen: (baseP.outerPen || 0) + 1 };
      window.computeExpected(p1);
      const dPhysPer1 = _scoreWithBonus(roleInfo) - baseScore;
      const p2 = { ...baseP, elemPen: (baseP.elemPen || 0) + 1 };
      window.computeExpected(p2);
      const dElemPer1 = _scoreWithBonus(roleInfo) - baseScore;
      window.computeExpected(baseP);
      return { dPhysPer1, dElemPer1, maxPhysPen, maxElemPen, baseScore };
    } catch (e) { return null; }
  }

  // 武器系 (slot 1/2/10/11) affix6 判定:
  //  - 4スロット同種だが逆が期待値高 → mismatch
  //  - 4スロット混在 (同種でない) → mixed (特化推奨)
  //  - 4スロット同種で正しい方向 → null
  function _checkAffix6PenMismatch(roleInfo, dPhys, dElem) {
    const slots = ['1','2','10','11'];
    const eqDet = roleInfo?.wearEquipsDetailed || {};
    const stats = slots.map(s => {
      const a = eqDet[s]?.exVo?.baseAffixes?.[5]?.equipmentDetails;
      return a ? window.WWM_AFFIX?.[a[0]]?.statKey : null;
    });
    const allPhys = stats.every(k => k === 'physPen');
    const allVoid = stats.every(k => k === 'voidPen');
    const T_=window.T||{};
    const _PP=T_.penPhys||'外功貫通', _VP=T_.penVoid||'無相貫通';
    if (allPhys && dElem > dPhys) return { type:'mismatch', current:_PP, better:_VP, cur:dPhys, btr:dElem };
    if (allVoid && dPhys > dElem) return { type:'mismatch', current:_VP, better:_PP, cur:dElem, btr:dPhys };
    if (!allPhys && !allVoid) {
      const better = dPhys >= dElem ? _PP : _VP;
      const counts = { physPen:0, voidPen:0, other:0 };
      stats.forEach(k => { counts[k === 'physPen' ? 'physPen' : k === 'voidPen' ? 'voidPen' : 'other']++; });
      return { type:'mixed', better, counts };
    }
    return null;
  }

  async function _findWastedAffixes(roleInfo) {
    if (!window.WWMStats?.buildStatParams || typeof window.computeExpected !== 'function') return [];
    const state = WWMHelpers.storage.loadJSON('wwm_last_state_v1');
    // base score
    let baseScore = 0;
    try {
      const baseParams = await window.WWMStats.buildStatParams(roleInfo, state);
      window.computeExpected(baseParams);
      baseScore = _scoreWithBonus(roleInfo);
    } catch (e) { return []; }
    const wasted = [];
    const eqDet = roleInfo?.wearEquipsDetailed || {};
    for (const [slot, eq] of Object.entries(eqDet)) {
      if (['9', '21'].includes(String(slot))) continue;
      const slotLabel = _slotLabelI18n(slot);
      const affixes = eq?.exVo?.baseAffixes || [];
      for (let i = 0; i < affixes.length; i++) {
        const d = affixes[i]?.equipmentDetails;
        if (!d) continue;
        try {
          const ri = JSON.parse(JSON.stringify(roleInfo));
          ri.wearEquipsDetailed[slot].exVo.baseAffixes[i].equipmentDetails[1] = 0;
          const p = await window.WWMStats.buildStatParams(ri, state);
          window.computeExpected(p);
          const noAffixScore = _scoreWithBonus(ri);
          const delta = baseScore - noAffixScore;
          if (delta < 1) {
            wasted.push(`${slotLabel}: ${_affixDisplayName(d[0])}`);
          }
        } catch (e) {}
      }
    }
    // DOM 状態復元
    try {
      const finalParams = await window.WWMStats.buildStatParams(roleInfo, state);
      window.computeExpected(finalParams);
    } catch (e) {}
    return wasted;
  }

  // 弱点 items キャッシュ (popup表示用)
  let _DIAG_ITEMS_CACHE = [];
  function _updateDiagBadge(items) {
    const warns = items.filter(it => it.type === 'warn');
    const badge = document.getElementById('wwmDiagBadge');
    const cnt = document.getElementById('wwmDiagBadgeCount');
    if (!badge) return;
    if (warns.length > 0) {
      badge.hidden = false;
      badge.style.display = '';
      if (cnt) cnt.textContent = warns.length;
    } else {
      badge.hidden = true;
      badge.style.display = 'none';
      if (cnt) cnt.textContent = '';
    }
  }
  function _openDiagPopup() {
    const items = _DIAG_ITEMS_CACHE;
    const sorted = items.slice().sort((a,b) => {
      const order = { warn: 0, info: 1, good: 2 };
      return (order[a.type]||3) - (order[b.type]||3);
    });
    const existing = document.getElementById('wwmDiagPopup');
    if (existing) existing.remove();
    const popup = document.createElement('div');
    popup.id = 'wwmDiagPopup';
    popup.className = 'wwm-modal-backdrop';
    popup.innerHTML = `
      <div class="wwm-modal wwm-modal-square wwm-tool-modal wwm-diag-modal">
        <span class="wwm-tool-bracket wwm-tool-bracket-tl"></span><span class="wwm-tool-bracket wwm-tool-bracket-tr"></span>
        <span class="wwm-tool-bracket wwm-tool-bracket-bl"></span><span class="wwm-tool-bracket wwm-tool-bracket-br"></span>
        <div class="wwm-modal-header">
          <h2><span class="wwm-tool-title-ja" data-i18n="diagTitleJa" data-kaisho="diagTitleJa">${(window.T&&T.diagTitleJa)||'弱点指摘'}</span><span class="wwm-tool-title-en">DIAGNOSTICS</span><span class="wwm-tool-seal">診</span></h2>
          <button class="wwm-modal-close" aria-label="Close">×</button>
        </div>
        <div class="wwm-modal-body wwm-ws-paper">
          <div class="wwm-modal-bg-icon" style="background-image:url('https://www.wherewindsmeetgame.com/pc/qt/20251203102905/data/base_school/images/673325b56106c5e18b72fbbeyS0pjb5G05.png');"></div>
          ${sorted.length ? sorted.map(it => `<div class="wwm-diag-item wwm-diag-${it.type}"><span class="wwm-diag-icon">${it.type==='warn'?'⚠':it.type==='good'?'✓':'ℹ'}</span><span class="wwm-diag-text">${it.text}</span></div>`).join('') : '<div class="wwm-diag-item wwm-diag-good"><span class="wwm-diag-icon">✓</span><span class="wwm-diag-text">弱点なし</span></div>'}
        </div>
      </div>`;
    document.body.appendChild(popup);
    popup.querySelector('.wwm-modal-close').addEventListener('click', () => popup.remove());
    popup.addEventListener('click', (e) => { if (e.target === popup) popup.remove(); });
  }

  async function renderDiagnostics(roleInfo, params) {
    const items = _diagnose(roleInfo, params);
    function _draw(list) {
      _DIAG_ITEMS_CACHE = list;
      _updateDiagBadge(list);
    }
    _draw(items);
    // async wasted + 貫通特化判定
    const [wasted, penEval] = await Promise.all([
      _findWastedAffixes(roleInfo),
      _evalPenSpecialization(roleInfo)
    ]);
    const T_ = window.T || {};
    let merged = items.slice();
    // 閾値 baseScore比 動的化 (基準: 武格指数10945時 外功26/属性21 → 割合固定 → Lv強化で自動追従)
    const _penBase = penEval?.baseScore || 10945;
    const _physThr = _penBase * (26 / 10945);
    const _elemThr = _penBase * (21 / 10945);
    if (penEval && penEval.dPhysPer1 < _physThr && penEval.dElemPer1 < _elemThr) {
      merged = merged.filter(it => it.type !== 'good').concat([{
        type: 'warn',
        text: _tpl(T_.diagPenBoth || '外功/属性 どちらにも特化なし → 片方に特化推奨 (外功貫通+1={0} / 属性貫通+1={1} / 推奨 外功≥{2} or 属性≥{3})', penEval.dPhysPer1.toFixed(2), penEval.dElemPer1.toFixed(2), _physThr.toFixed(1), _elemThr.toFixed(1))
      }]);
    }
    if (penEval) {
      const physScaled = penEval.dPhysPer1 * penEval.maxPhysPen;
      const elemScaled = penEval.dElemPer1 * penEval.maxElemPen;
      const m = _checkAffix6PenMismatch(roleInfo, physScaled, elemScaled);
      if (m?.type === 'mismatch') {
        merged = merged.filter(it => it.type !== 'good').concat([{
          type: 'warn',
          text: _tpl(T_.diagAffix6Mismatch || '武器系定音オプション 全4スロット {0} だが {1} の方が期待値高 (外功貫通+1={2} / 属性貫通+1={3})', m.current, m.better, penEval.dPhysPer1.toFixed(2), penEval.dElemPer1.toFixed(2))
        }]);
      } else if (m?.type === 'mixed') {
        const _Pp=T_.phys||'外功', _Vv=T_.pathVoid||'無相', _Ot=T_.penOther||'他';
        const breakdown = `${_Pp}${m.counts.physPen}/${_Vv}${m.counts.voidPen}${m.counts.other?`/${_Ot}${m.counts.other}`:''}`;
        merged = merged.filter(it => it.type !== 'good').concat([{
          type: 'warn',
          text: _tpl(T_.diagAffix6Mixed || '武器系定音オプション 混在 ({0}) → {1} 4スロット統一推奨 (外功貫通+1={2} / 属性貫通+1={3})', breakdown, m.better, penEval.dPhysPer1.toFixed(2), penEval.dElemPer1.toFixed(2))
        }]);
      }
    }
    if (wasted.length) {
      const more = wasted.length > 5 ? _tpl(T_.diagWastedMore || ' 他{0}件', wasted.length - 5) : '';
      merged = merged.filter(it => it.type !== 'good').concat([
        { type: 'warn', text: _tpl(T_.diagWasted || '無駄オプション ({0}件): {1}{2}', wasted.length, wasted.slice(0,5).join(' / '), more) }
      ]);
    }
    if (merged !== items) _draw(merged);
  }

  // ── expose ───────────────────────────────────────────────
  window.WWMSidebar = window.WWMSidebar || {};
  window.WWMSidebar.diag = {
    render: renderDiagnostics,
    openPopup: _openDiagPopup,
    diagnose: _diagnose,
    updateBadge: _updateDiagBadge,
    findWasted: _findWastedAffixes,
    evalPen: _evalPenSpecialization,
    checkAffix6Mismatch: _checkAffix6PenMismatch,
  };
})();
