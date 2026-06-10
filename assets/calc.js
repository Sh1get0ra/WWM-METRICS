// ── 計算バージョン ──────────────────────────────────────────────
// スコア計算に影響する変更 (xinfa/kongfu 付与量, calc/stats の式, equip_base 等) を入れた時だけ +1。
// UI/色/i18n/レイアウト変更では上げない。baseline の鮮度判定に使う (古い→再import 促しバナー)。
window.WWM_SCORE_VERSION = 9;

// 表示ラベル/calcKey (stat_display.json 等) の cache buster。 SCORE_VERSION と独立。
// スコア計算を変えずラベル/表示参照だけ変えた時に +1 → baseline 無効化(再import促し)を起こさず反映。
window.WWM_DISPLAY_VERSION = 21;

// ── 共通計算層 ────────────────────────────────────────────────
// params object から innerPhys/outerBoost/各確率を計算。
// 新effects key 追加時はここ1箇所に追加すれば両経路反映。
function _computeCoreLayer(p) {
  const physPenDiff  = (p.outerPen || 0) - (p.physRes || 0);
  // 穿透 ≥ 抗性: overflow は /200 (半減)、< の場合: 不足分は /100 (フル軽減)
  const physPenZone  = physPenDiff >= 0 ? physPenDiff / 200 : physPenDiff / 100;
  const elemPenDiff  = (p.elemPen || 0) - (p.elemRes || 0);
  const elemPenZone  = elemPenDiff >= 0 ? elemPenDiff / 200 : elemPenDiff / 100;
  // 増伤レイヤー分離: 内側(外功/属性別の伤害加成) と 外側(全体増伤、加算合計)
  // physDmgBoost (心法経由) を innerPhys に合流
  const innerPhys    = 1 + (p.weaponBonus || 0) + (p.physDmgBoost || 0);
  const innerElem    = 1 + (p.elemAtkBoost || 0);
  // 奇術ダメは重み 0.1 で寄与 (発動頻度想定30%未満)
  const mysticContrib = ((p.stMysticDmg || 0) + (p.areaMysticDmg || 0)) * 0.1;
  const outerBoost   = 1 + (p.allMartialBoost || 0) + (p.specMartialBoost || 0)
                     + (p.bossBoost || 0) + (p.playerBoost || 0) + mysticContrib
                     + (p.enemyDebuff || 0) + (p.globalDmgBoost || 0);
  const reductionZone= (1 - (p.dmgReduce1 || 0)) * (1 - (p.dmgReduce2 || 0));

  const judgeRes = p.judgeRes || 0;
  const sympathyRateAdj = judgeRes === 0 ? (p.sympathyRate || 0) : (p.sympathyRate || 0) / judgeRes;
  const critRateAdj     = judgeRes === 0 ? (p.critRate || 0)     : (p.critRate || 0)     / judgeRes;
  // 付加会心率/共鳴率は基本値の上限(40%/80%)を突破可能。会心+共鳴の100%制限は維持。
  // appliedSympathy が1超過するケースに備え 0..1 にclamp。appliedCrit も負値防止。
  // bonusCritRate (新): kongfu synergyEffects 経由 (断魂×嵐雷 等)。 judgeRes 不影響、 critRate と加算後 cap内 (80%)。 addCritRate は cap突破可で 別レイヤー維持。
  const appliedSympathy = Math.min(1, Math.min(0.4, sympathyRateAdj) + (p.addSympathyRate || 0));
  const critRateBoosted = Math.min(0.8, critRateAdj + (p.bonusCritRate || 0));
  const appliedCrit     = Math.max(0, Math.min(1 - appliedSympathy, critRateBoosted + (p.addCritRate || 0)));
  // appliedHit 下限 0 clamp: judgeRes < 1 (manual モード極端設定) で hitRate < 0.65 のとき
  // 0.65 + (負) / judgeRes が負値化 → (1-appliedHit) > 1 で pGraze 破綻するのを防止。
  const appliedHit      = judgeRes === 0 ? Math.max(0, Math.min(1, p.hitRate || 0)) : Math.max(0, Math.min(1, 0.65 + ((p.hitRate || 0) - 0.65) / judgeRes));
  // B案: 会意優先順位モデル
  //   会意 (精確不問・全体枠) → appliedCrit は 1-pSym 上限clamp済み
  //   会心 = 精確命中時のみ発生  → pHit × appliedCrit
  //   擦り傷 = 非精確命中 かつ 非会意
  const pSympathy = appliedSympathy;
  const pCrit     = appliedHit * appliedCrit;
  const pGraze    = (1 - appliedHit) * (1 - pSympathy);
  const pNormal   = Math.max(0, 1 - pCrit - pSympathy - pGraze);

  return { physPenZone, elemPenZone, innerPhys, innerElem, outerBoost, reductionZone,
           pSympathy, pCrit, pGraze, pNormal, critRateAdj, sympathyRateAdj, critRateBoosted };
}
window._computeCoreLayer = _computeCoreLayer;

// ── 純粋関数：期待ダメージ ────────────────────────────────────────
function computeExpected(pIn) {
  // 裏加算 merge (xinfa T0/T1/T3/T4/T6 等、ステ表示反映せず計算寄与のみ)
  const p = (pIn && pIn._hiddenAdditive) ? Object.assign({}, pIn) : pIn;
  if (pIn && pIn._hiddenAdditive) {
    for (const [k, v] of Object.entries(pIn._hiddenAdditive)) {
      if (typeof v !== 'number') continue;
      p[k] = (p[k] || 0) + v;
    }
  }
  const hiddenBonus  = p.worldLv + p.martialLv + 1;
  const core = _computeCoreLayer(p);
  const { physPenZone, elemPenZone, innerPhys, innerElem, outerBoost, reductionZone,
          pSympathy, pCrit, pGraze, pNormal } = core;

  function physPart(atk) { return Math.max(0, atk - p.physDef) * p.outerCoeff + p.outerAdd; }
  function elemPart(m, s) {
    return (m + hiddenBonus) * p.elemBoostMain * p.statusCoeff
         + (s + hiddenBonus) * p.elemBoostSub  * p.statusCoeff;
  }
  function dmg(pa, em, es, mul) {
    mul = mul || 1;
    const pp = physPart(pa) * (1 + physPenZone) * innerPhys;
    const ee = elemPart(em, es) * (1 + elemPenZone) * innerElem;
    return (pp + ee) * outerBoost * reductionZone * mul;
  }
  // 物理/属性 内訳分離 (外周リング arc 用、pp+ee は dmg と一致)
  function dmgParts(pa, em, es, mul) {
    mul = mul || 1;
    const pp = physPart(pa) * (1 + physPenZone) * innerPhys * outerBoost * reductionZone * mul;
    const ee = elemPart(em, es) * (1 + elemPenZone) * innerElem * outerBoost * reductionZone * mul;
    return { pp, ee };
  }

  const avgPhys = (p.minPhysATK + p.maxPhysATK) / 2;
  const avgMain = (p.minElemMain + p.maxElemMain) / 2;
  const avgSub  = (p.minElemSub  + p.maxElemSub)  / 2;

  const expectedTotal =
         dmg(avgPhys, avgMain, avgSub)          * pNormal
       + dmg(avgPhys, avgMain, avgSub, 1 + p.critBoost) * pCrit
       + dmg(p.maxPhysATK, p.maxElemMain, p.maxElemSub, 1 + p.sympathyBoost) * pSympathy
       + dmg(p.minPhysATK, p.minElemMain, p.minElemSub) * pGraze;

  // 物理/属性 期待値 (各シナリオの pp/ee を確率加重で集計)
  const _pNorm = dmgParts(avgPhys, avgMain, avgSub);
  const _pCritP = dmgParts(avgPhys, avgMain, avgSub, 1 + p.critBoost);
  const _pSymp = dmgParts(p.maxPhysATK, p.maxElemMain, p.maxElemSub, 1 + p.sympathyBoost);
  const _pGraz = dmgParts(p.minPhysATK, p.minElemMain, p.minElemSub);
  const physExp = _pNorm.pp*pNormal + _pCritP.pp*pCrit + _pSymp.pp*pSympathy + _pGraz.pp*pGraze;
  const elemExp = _pNorm.ee*pNormal + _pCritP.ee*pCrit + _pSymp.ee*pSympathy + _pGraz.ee*pGraze;
  const _ptot = physExp + elemExp;
  const physRatio = _ptot > 0 ? physExp / _ptot : 0;
  const elemRatio = _ptot > 0 ? elemExp / _ptot : 0;

  // ── STATUS SCORE (固定 SCORE_FIXED 係数で再計算) ─────────────
  const sc = SCORE_FIXED;
  function sPhys(atk) { return Math.max(0, atk - p.physDef) * sc.outerCoeff + sc.outerAdd; }
  function sElem(m, s) {
    return (m + hiddenBonus) * p.elemBoostMain * sc.statusCoeff
         + (s + hiddenBonus) * p.elemBoostSub  * sc.statusCoeff;
  }
  function sDmg(pa, em, es, mul) {
    mul = mul || 1;
    const pp = sPhys(pa) * (1 + physPenZone) * innerPhys;
    const ee = sElem(em, es) * (1 + elemPenZone) * innerElem;
    return (pp + ee) * outerBoost * reductionZone * mul;
  }
  const statusScoreRaw =
        sDmg(avgPhys, avgMain, avgSub) * pNormal
      + sDmg(avgPhys, avgMain, avgSub, 1 + p.critBoost) * pCrit
      + sDmg(p.maxPhysATK, p.maxElemMain, p.maxElemSub, 1 + p.sympathyBoost) * pSympathy
      + sDmg(p.minPhysATK, p.minElemMain, p.minElemSub) * pGraze;
  const statusScore = statusScoreRaw + (p._fixedScoreBonus || 0);

  // tier 判定
  const worldLv = p.worldLv || 1;
  const ssThr = 6700 * Math.pow(0.8, 14 - worldLv);
  let tier;
  if      (statusScore >= ssThr)        tier = 'SS';
  else if (statusScore >= ssThr * 0.9)  tier = 'S';
  else if (statusScore >= ssThr * 0.8)  tier = 'A';
  else if (statusScore >= ssThr * 0.6)  tier = 'B';
  else                                  tier = 'C';

  const result = { expected: expectedTotal, statusScore: statusScore, tier: tier, physRatio: physRatio, elemRatio: elemRatio };
  WWMState.lastResult = result;

  // ── donut / 寄与率 DOM 更新 (debounce 16ms化、 連続computeExpected呼出時 最後の値のみ反映)
  // import前 (__WWM_ROLEINFO 未存在) は更新 skip → '—' のまま保持
  try {
    if (!WWMState.roleInfo) throw 'NO_IMPORT';
    const normT = dmg(avgPhys, avgMain, avgSub);
    const critT = dmg(avgPhys, avgMain, avgSub, 1 + p.critBoost);
    const sympT = dmg(p.maxPhysATK, p.maxElemMain, p.maxElemSub, 1 + p.sympathyBoost);
    const grazT = dmg(p.minPhysATK, p.minElemMain, p.minElemSub);
    const cCrit = critT * pCrit, cSymp = sympT * pSympathy, cGraz = grazT * pGraze, cNorm = normT * pNormal;
    const cTotal = cCrit + cSymp + cGraz + cNorm;
    if (cTotal > 0) {
      const dCrit = cCrit / cTotal, dSymp = cSymp / cTotal, dGraz = cGraz / cTotal, dNorm = cNorm / cTotal;
      // donut 反映: 表示更新(updateHero)時のみ許可。
      // computeExpected は装備カードスコア試算/最適化/プレビュー等から多数呼ばれ、
      // 以前は それら全てが donut DOM を上書きしてちらつき発生。__WWM_ALLOW_DONUT で
      // 唯一の表示経路(updateHero)に書込みをゲートする。
      if (WWMState.allowDonut) {
        if (typeof updateDonut === 'function') updateDonut(dCrit, dSymp, dGraz, dNorm, 'donutDmgSeg');
        // 外周リング arc (物理/属性 比率)
        if (typeof updateLuopanArc === 'function') updateLuopanArc(physRatio, elemRatio);
        const pctStr = n => (n * 100).toFixed(2) + '%';
        const setT = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        setT('dmgCritVal', pctStr(dCrit));
        setT('dmgSympathyVal', pctStr(dSymp));
        setT('dmgGrazeVal', pctStr(dGraz));
        setT('dmgNormalVal', pctStr(dNorm));
        setT('dmgPhysVal', pctStr(physRatio));
        setT('dmgElemVal', pctStr(elemRatio));
      }
    }
  } catch(e) {}

  return result;
}

// ── STATUS SCORE 固定スキルパラメータ ────────────────────────────
const SCORE_FIXED = { outerCoeff: 1.5, statusCoeff: 1.5, outerAdd: 230 };

// ── (旧UI) SET_EFFECTS / XINFA_EFFECTS は import経路移行で削除済 ──
// セット/心法効果は data/sets.json / data/xinfa.json + stats.js buildStatParams 経由で適用
window.computeExpected = computeExpected;
