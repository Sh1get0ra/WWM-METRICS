// ── エネミーデータ（プリセット） ────────────────────────────────
const ENEMY_PRESET = {
  Lv16:  { physDef: 10,  judgeRes: 1.0,  physRes: 0, elemRes: 0 },
  Lv51:  { physDef: 29,  judgeRes: 1.0,  physRes: 0, elemRes: 0 },
  Lv81:  { physDef: 270, judgeRes: 1.15, physRes: 0, elemRes: 0 },
  Lv86:  { physDef: 307, judgeRes: 1.3,  physRes: 0, elemRes: 0 },
  Lv91:  { physDef: 350, judgeRes: 1.45, physRes: 0, elemRes: 0 },
  Lv96:  { physDef: 405, judgeRes: 1.65, physRes: 0, elemRes: 0 },
  Lv100: { physDef: 498, judgeRes: 1.85, physRes: 0, elemRes: 0 },
};

function v(id)  { const el = document.getElementById(id); return el ? (parseFloat(el.value) || 0) : 0; }
function vp(id) { const el = document.getElementById(id); return el ? ((parseFloat(el.value) || 0) / 100) : 0; }

// ── 共通計算層 (両経路共有) ────────────────────────────────────
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
  const appliedSympathy = Math.min(1, Math.min(0.4, sympathyRateAdj) + (p.addSympathyRate || 0));
  const appliedCrit     = Math.max(0, Math.min(1 - appliedSympathy, Math.min(0.8, critRateAdj) + (p.addCritRate || 0)));
  const appliedHit      = judgeRes === 0 ? Math.min(1, p.hitRate || 0) : Math.min(1, 0.65 + ((p.hitRate || 0) - 0.65) / judgeRes);
  // B案: 会意優先順位モデル
  //   会意 (精確不問・全体枠) → appliedCrit は 1-pSym 上限clamp済み
  //   会心 = 精確命中時のみ発生  → pHit × appliedCrit
  //   擦り傷 = 非精確命中 かつ 非会意
  const pSympathy = appliedSympathy;
  const pCrit     = appliedHit * appliedCrit;
  const pGraze    = (1 - appliedHit) * (1 - pSympathy);
  const pNormal   = Math.max(0, 1 - pCrit - pSympathy - pGraze);

  return { physPenZone, elemPenZone, innerPhys, innerElem, outerBoost, reductionZone,
           pSympathy, pCrit, pGraze, pNormal, critRateAdj, sympathyRateAdj };
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
  window.__WWM_LAST_RESULT = result;

  // ── donut / 寄与率 DOM 更新 (debounce 16ms化、 連続computeExpected呼出時 最後の値のみ反映)
  // import前 (__WWM_ROLEINFO 未存在) は更新 skip → '—' のまま保持
  try {
    if (!window.__WWM_ROLEINFO) throw 'NO_IMPORT';
    const normT = dmg(avgPhys, avgMain, avgSub);
    const critT = dmg(avgPhys, avgMain, avgSub, 1 + p.critBoost);
    const sympT = dmg(p.maxPhysATK, p.maxElemMain, p.maxElemSub, 1 + p.sympathyBoost);
    const grazT = dmg(p.minPhysATK, p.minElemMain, p.minElemSub);
    const cCrit = critT * pCrit, cSymp = sympT * pSympathy, cGraz = grazT * pGraze, cNorm = normT * pNormal;
    const cTotal = cCrit + cSymp + cGraz + cNorm;
    if (cTotal > 0) {
      const dCrit = cCrit / cTotal, dSymp = cSymp / cTotal, dGraz = cGraz / cTotal, dNorm = cNorm / cTotal;
      // donut 反映 (最適化計算中はsuppress、 ちらつき抑止)
      if (!window.__WWM_OPT_RUNNING) {
        if (typeof updateDonut === 'function') updateDonut(dCrit, dSymp, dGraz, dNorm, 'donutDmgSeg');
        // 外周リング arc (物理/属性 比率)
        if (typeof updateLuopanArc === 'function') updateLuopanArc(physRatio, elemRatio);
        const pctStr = n => (n * 100).toFixed(2) + '%';
        const setT = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        setT('dmgCritVal', pctStr(dCrit));
        setT('dmgSympathyVal', pctStr(dSymp));
        setT('dmgGrazeVal', pctStr(dGraz));
        setT('dmgNormalVal', pctStr(dNorm));
      }
    }
  } catch(e) {}

  return result;
}

// ── STATUS SCORE 固定スキルパラメータ ────────────────────────────
const SCORE_FIXED = { outerCoeff: 1.5, statusCoeff: 1.5, outerAdd: 230 };

// ── (旧UI) SET_EFFECTS / XINFA_EFFECTS は import経路移行で削除済 ──
// セット/心法効果は data/sets.json / data/xinfa.json + stats.js buildStatParams 経由で適用

// ── 効率分析：各ステータス行の定義 ───────────────────────────────
const EFF_ROWS = [
  { key:'effMinPhysATK',  maxVal:64,    isPct:false, mod:(p,x)=>({...p, minPhysATK:p.minPhysATK+x}) },
  { key:'effMaxPhysATK',  maxVal:64,    isPct:false, mod:(p,x)=>({...p, maxPhysATK:p.maxPhysATK+x}) },
  { key:'effMinElemATK',  maxVal:34,    isPct:false, mod:(p,x)=>({...p, minElemMain:p.minElemMain+x}) },
  { key:'effMaxElemATK',  maxVal:34,    isPct:false, mod:(p,x)=>({...p, maxElemMain:p.maxElemMain+x}) },
  { key:'effCritRate',    maxVal:0.07,  isPct:true,  mod:(p,x)=>({...p, critRate:p.critRate+x}) },
  { key:'effSympathy',    maxVal:0.034, isPct:true,  mod:(p,x)=>({...p, sympathyRate:p.sympathyRate+x}) },
  { key:'effHitRate',     maxVal:0.06,  isPct:true,  mod:(p,x)=>({...p, hitRate:p.hitRate+x}) },
  { key:'effAgility',     maxVal:40,    isPct:false, mod:(p,x)=>({...p, minPhysATK:p.minPhysATK+x*0.9, critRate:p.critRate+x*0.00076}) },
  { key:'effPower',       maxVal:40,    isPct:false, mod:(p,x)=>({...p, maxPhysATK:p.maxPhysATK+x*0.9, sympathyRate:p.sympathyRate+x*0.00038}) },
  { key:'effStrength',    maxVal:40,    isPct:false, mod:(p,x)=>({...p, minPhysATK:p.minPhysATK+x*0.225, maxPhysATK:p.maxPhysATK+x*1.36}) },
  { key:'effBossBoost',   maxVal:0.025, isPct:true,  mod:(p,x)=>({...p, bossBoost:p.bossBoost+x}) },
  { key:'effPhysPen',     maxVal:9,     isPct:false, mod:(p,x)=>({...p, outerPen:p.outerPen+x}) },
  { key:'effElemPen',     maxVal:10.4,  isPct:false, mod:(p,x)=>({...p, elemPen:p.elemPen+x}) },
];

let effMaxVals = null;
let _lastEffParams = null;
let _lastBaseExpected = 0;
const EFF_MAX_STORAGE = 'wwm_eff_max_v1';

function initEffMaxVals() {
  try {
    const saved = JSON.parse(localStorage.getItem(EFF_MAX_STORAGE));
    // 型検証: 全要素が有限数値であること (NaN/string/null 混入時はdefault復帰)
    if (Array.isArray(saved) && saved.length === EFF_ROWS.length
        && saved.every(v => typeof v === 'number' && Number.isFinite(v))) {
      effMaxVals = saved; return;
    }
  } catch(e) {}
  effMaxVals = EFF_ROWS.map(function(r) { return r.maxVal; });
}
function saveEffMaxVals() {
  try { localStorage.setItem(EFF_MAX_STORAGE, JSON.stringify(effMaxVals)); } catch(e) {}
}

// ── 効率分析テーブル ──────────────────────────────────────────────
function buildEfficiencyTable(p, baseExpected) {
  const refDelta = computeExpected(EFF_ROWS[0].mod(p, effMaxVals[0])) - baseExpected;
  function fmt(n) { return Math.round(n).toLocaleString(T.locale); }
  function fmtD(n, d) { return n.toFixed(d !== undefined ? d : 2); }

  const rows = EFF_ROWS.map(function(row, idx) {
    const curMax   = effMaxVals[idx];
    const afterExp = computeExpected(row.mod(p, curMax));
    const delta    = afterExp - baseExpected;
    const per1     = row.isPct ? delta / (curMax * 100) : delta / curMax;
    const score    = refDelta > 0 ? delta / refDelta * 100 : 0;
    const statName = T[row.key] || row.key;

    const dispVal = row.isPct ? +(curMax * 100).toFixed(4) : curMax;
    const step    = row.isPct ? '0.1' : (row.maxVal % 1 === 0 ? '1' : '0.1');
    const maxInput = '<input type="text" inputmode="decimal" class="eff-max-input"'
      + ' data-idx="' + idx + '" data-ispct="' + row.isPct + '"'
      + ' value="' + dispVal + '" step="' + step + '" min="0"'
      + (row.isPct ? ' title="%"' : '') + '>';

    let badgeClass, badgeText, scoreColor;
    if      (score >= 200) { badgeClass = 'badge-fire'; badgeText = T.effRateFire; scoreColor = 'var(--vermilion-bright)'; }
    else if (score >= 100) { badgeClass = 'badge-star'; badgeText = T.effRateStar; scoreColor = 'var(--gold-bright)'; }
    else if (score >= 50)  { badgeClass = 'badge-good'; badgeText = T.effRateGood; scoreColor = 'var(--jade-bright)'; }
    else                   { badgeClass = 'badge-low';  badgeText = T.effRateLow;  scoreColor = 'var(--paper-mute)'; }
    const scoreWidth = Math.min(100, score / 5).toFixed(1);

    return '<tr>'
      + '<td>' + statName + '</td>'
      + '<td style="text-align:center;padding:3px 8px;"><div class="eff-max-wrap">' + maxInput + '<span class="eff-max-unit">' + (row.isPct ? '%' : '') + '</span></div></td>'
      + '<td>' + fmt(baseExpected) + '</td>'
      + '<td>' + fmt(afterExp) + '</td>'
      + '<td style="color:var(--gold-bright);">+' + fmt(delta) + '</td>'
      + '<td>' + fmtD(per1) + '</td>'
      + '<td><div class="score-bar-wrap">'
        + '<div class="score-bar"><div class="score-fill" style="width:' + scoreWidth + '%;background:' + scoreColor + ';color:' + scoreColor + ';"></div></div>'
        + '<span style="font-weight:700;color:' + scoreColor + ';min-width:38px;text-align:right;font-size:12px;">' + fmtD(score, 1) + '</span>'
      + '</div></td>'
      + '<td style="text-align:center;"><span class="badge ' + badgeClass + '">' + badgeText + '</span></td>'
      + '</tr>';
  });
  document.getElementById('effTbody').innerHTML = rows.join('');
}

// ── メイン計算 ────────────────────────────────────────────────────
function calculate() {
  let minPhysATK = v('minPhysATK'), maxPhysATK = v('maxPhysATK');
  const minElemMain = v('minElemMain'), maxElemMain = v('maxElemMain');
  const minElemSub  = v('minElemSub'),  maxElemSub  = v('maxElemSub');
  const outerCoeff  = vp('outerCoeff'), statusCoeff = vp('statusCoeff');
  const outerAdd    = v('outerAdd'),    enemyDebuff = vp('enemyDebuff');
  const hitRate     = vp('hitRate');
  let critRate      = vp('critRate');
  const sympathyRate= vp('sympathyRate'), addCritRate = vp('addCritRate');
  let addSympathyRate = vp('addSympathyRate');
  const worldLv     = v('worldLv'),     martialLv   = v('martialLv');
  const elemBoostMain = v('elemBoostMain'), elemBoostSub = v('elemBoostSub');
  let critBoost         = vp('critBoost');
  let allMartialBoost   = vp('allMartialBoost');
  let globalDmgBoost    = vp('globalDmgBoost');
  let sympathyBoost     = vp('sympathyBoost');
  let specMartialBoost  = vp('specMartialBoost');
  let outerPen          = v('outerPen');
  const bossBoost       = vp('bossBoost');
  const elemPen         = v('elemPen');
  let elemAtkBoost      = vp('elemAtkBoost');
  const dmgReduce1      = vp('dmgReduce1'),  dmgReduce2      = vp('dmgReduce2');
  const weaponBonus     = vp('weaponBonus');

  // (旧UI) set/xinfa DOM 適用ロジック削除済 — import経路で stats.js が処理
  const sel = document.getElementById('enemyLevel').value;
  let physDef, judgeRes, physRes, elemRes;
  if (sel === 'manual') {
    physDef = v('manPhysDef'); judgeRes = v('manJudgeRes');
    physRes = v('manPhysRes'); elemRes  = v('manElemRes');
  } else {
    const e = ENEMY_PRESET[sel];
    physDef = e.physDef; judgeRes = e.judgeRes; physRes = e.physRes; elemRes = e.elemRes;
    document.getElementById('dispPhysDef').textContent  = physDef;
    document.getElementById('dispJudgeRes').textContent = judgeRes;
    document.getElementById('dispPhysRes').textContent  = physRes;
    document.getElementById('dispElemRes').textContent  = elemRes;
  }

  const hiddenBonus   = worldLv + martialLv + 1;
  const physPenDiff   = outerPen - physRes;
  // 穿透 ≥ 抗性: overflow は /200 (半減)、< の場合: 不足分は /100 (フル軽減)
  const physPenZone   = physPenDiff >= 0 ? physPenDiff / 200 : physPenDiff / 100;
  const elemPenDiff   = elemPen - elemRes;
  const elemPenZone   = elemPenDiff >= 0 ? elemPenDiff / 200 : elemPenDiff / 100;
  // 増伤レイヤー分離: 内側(外功/属性別の伤害加成) と 外側(全体増伤、加算合計)
  // physDmgBoost (心法経由) を innerPhys に合流
  const innerPhys     = 1 + weaponBonus + (vp('physDmgBoost') || 0);
  const innerElem     = 1 + elemAtkBoost;
  const outerBoost    = 1 + allMartialBoost + specMartialBoost + bossBoost + enemyDebuff + globalDmgBoost;
  const reductionZone = (1 - dmgReduce1) * (1 - dmgReduce2);

  const sympathyRateAdj = judgeRes === 0 ? sympathyRate : sympathyRate / judgeRes;
  const critRateAdj     = judgeRes === 0 ? critRate     : critRate     / judgeRes;
  // 付加会心率/共鳴率は基本値の上限(40%/80%)を突破可能。会心+共鳴の100%制限は維持。
  const appliedSympathy = Math.min(0.4, sympathyRateAdj) + addSympathyRate;
  const appliedCrit     = Math.min(1 - appliedSympathy, Math.min(0.8, critRateAdj) + addCritRate);
  const appliedHit      = judgeRes === 0 ? Math.min(1, hitRate) : Math.min(1, 0.65 + (hitRate - 0.65) / judgeRes);
  // B案: 会意優先順位モデル (会心=精確命中時のみ, 擦り傷=非精確かつ非会意)
  const pSympathy = appliedSympathy;
  const pCrit     = appliedHit * appliedCrit;
  const pGraze    = (1 - appliedHit) * (1 - pSympathy);
  const pNormal   = Math.max(0, 1 - pCrit - pSympathy - pGraze);

  document.getElementById('dispHitRate').textContent      = (appliedHit      * 100).toFixed(2) + '%';
  document.getElementById('dispCritRate').textContent     = (appliedCrit     * 100).toFixed(2) + '%';
  document.getElementById('dispSympathyRate').textContent = (appliedSympathy * 100).toFixed(2) + '%';

  function physPart(atk) { return Math.max(0, atk - physDef) * outerCoeff + outerAdd; }
  function elemPart(m, s) {
    return (m + hiddenBonus) * elemBoostMain * statusCoeff
         + (s + hiddenBonus) * elemBoostSub  * statusCoeff;
  }
  function dmg(pa, em, es, mul = 1) {
    const pp = physPart(pa) * (1 + physPenZone) * innerPhys;
    const ee = elemPart(em, es) * (1 + elemPenZone) * innerElem;
    const factor = outerBoost * reductionZone * mul;
    const p = pp * factor;
    const e = ee * factor;
    return { total: p + e, phys: p, elem: e };
  }

  const avgPhys = (minPhysATK + maxPhysATK) / 2;
  const avgMain = (minElemMain + maxElemMain) / 2;
  const avgSub  = (minElemSub  + maxElemSub)  / 2;

  const normalAvg = dmg(avgPhys, avgMain, avgSub);
  const normalMin = dmg(minPhysATK, minElemMain, minElemSub);
  const normalMax = dmg(maxPhysATK, maxElemMain, maxElemSub);
  const critAvg   = dmg(avgPhys, avgMain, avgSub, 1 + critBoost);
  const critMin   = dmg(minPhysATK, minElemMain, minElemSub, 1 + critBoost);
  const critMax   = dmg(maxPhysATK, maxElemMain, maxElemSub, 1 + critBoost);
  const sympathyDmg = dmg(maxPhysATK, maxElemMain, maxElemSub, 1 + sympathyBoost);
  const grazeDmg    = dmg(minPhysATK, minElemMain, minElemSub);
  const expected = {
    total: normalAvg.total*pNormal + critAvg.total*pCrit + sympathyDmg.total*pSympathy + grazeDmg.total*pGraze,
    phys:  normalAvg.phys *pNormal + critAvg.phys *pCrit + sympathyDmg.phys *pSympathy + grazeDmg.phys *pGraze,
    elem:  normalAvg.elem *pNormal + critAvg.elem *pCrit + sympathyDmg.elem *pSympathy + grazeDmg.elem *pGraze,
  };

  // ── ヒーロー：期待値カウントアップ＆内訳 ──────────────────────
  countUp('heroExpected', expected.total, 0);
  countUp('hbExp',  expected.total, 0);
  countUp('hbPhys', expected.phys, 0);
  countUp('hbElem', expected.elem, 0);
  // コンパクトバー内訳同期
  var fmt0 = function(n){ return Math.round(n).toLocaleString(T.locale); };
  var _cp = document.getElementById('heroCompactPhys');
  var _ce = document.getElementById('heroCompactElem');
  var _cx = document.getElementById('heroCompactExp');
  if (_cp) _cp.textContent = fmt0(expected.phys);
  if (_ce) _ce.textContent = fmt0(expected.elem);
  if (_cx) _cx.textContent = fmt0(expected.total);

  // 物理/属性割合の同期（フル + コンパクト）
  var physPct = expected.total > 0 ? (expected.phys / expected.total * 100).toFixed(1) + '%' : '—';
  var elemPct = expected.total > 0 ? (expected.elem / expected.total * 100).toFixed(1) + '%' : '—';
  var _pp  = document.getElementById('hbPhysPct');
  var _ep  = document.getElementById('hbElemPct');
  var _cpp = document.getElementById('heroCompactPhysPct');
  var _cep = document.getElementById('heroCompactElemPct');
  if (_pp)  _pp.textContent  = physPct;
  if (_ep)  _ep.textContent  = elemPct;
  if (_cpp) _cpp.textContent = physPct;
  if (_cep) _cep.textContent = elemPct;

  // ── ダメ寄与率：ドーナツ＋凡例 ───────────────────────────────
  var contribCrit  = critAvg.total     * pCrit;
  var contribSymp  = sympathyDmg.total * pSympathy;
  var contribGraze = grazeDmg.total    * pGraze;
  var contribNorm  = normalAvg.total   * pNormal;
  var contribTotal = contribCrit + contribSymp + contribGraze + contribNorm;
  var dCrit  = contribTotal > 0 ? contribCrit  / contribTotal : 0;
  var dSymp  = contribTotal > 0 ? contribSymp  / contribTotal : 0;
  var dGraze = contribTotal > 0 ? contribGraze / contribTotal : 0;
  var dNorm  = contribTotal > 0 ? contribNorm  / contribTotal : 0;
  // (旧UI) DOM経路 donut/dmgVal更新 削除済 — import経路の computeExpected が更新する

  // ── 詳細テーブル ──────────────────────────────────────────────
  function fmt(n) { return Math.round(n).toLocaleString(T.locale); }
  function pctStr(n) { return (n * 100).toFixed(2) + '%'; }
  function ppct(d) { return d.total > 0 ? pctStr(d.phys / d.total) : '—'; }
  function epct(d) { return d.total > 0 ? pctStr(d.elem / d.total) : '—'; }
  function row(label, avg, mn, mx, cls) {
    const na = '<td class="na" colspan="3">—</td>';
    return '<tr class="' + (cls||'') + '">'
      + '<td class="lbl">' + label + '</td>'
      + '<td>' + fmt(avg.total) + '</td><td>' + fmt(avg.phys) + '</td><td>' + fmt(avg.elem) + '</td>'
      + (mn ? '<td>' + fmt(mn.total) + '</td><td>' + fmt(mn.phys) + '</td><td>' + fmt(mn.elem) + '</td>' : na)
      + (mx ? '<td>' + fmt(mx.total) + '</td><td>' + fmt(mx.phys) + '</td><td>' + fmt(mx.elem) + '</td>' : na)
      + '<td style="text-align:center;">' + ppct(avg) + '</td>'
      + '<td style="text-align:center;">' + epct(avg) + '</td>'
      + '</tr>';
  }
  const sympathyLabel = T.rowSympathy + '<small>' + T.rowSympathySub + '</small>';
  const grazeLabel    = T.rowGraze    + '<small>' + T.rowGrazeSub    + '</small>';
  document.getElementById('tbodyResults').innerHTML =
      row(T.rowNormal,   normalAvg, normalMin, normalMax)
    + row(T.rowCrit,     critAvg,   critMin,   critMax)
    + row(sympathyLabel, sympathyDmg, null, null)
    + row(grazeLabel,    grazeDmg,    null, null)
    + row(T.rowExpected, expected,    null, null, 'expected');

  // ── 効率分析 ──────────────────────────────────────────────────
  const effParams = {
    minPhysATK, maxPhysATK, minElemMain, maxElemMain, minElemSub, maxElemSub,
    outerCoeff, statusCoeff, outerAdd, enemyDebuff,
    hitRate, critRate, sympathyRate, addCritRate, addSympathyRate,
    worldLv, martialLv, elemBoostMain, elemBoostSub,
    critBoost, allMartialBoost, sympathyBoost, specMartialBoost,
    outerPen, bossBoost, elemPen, elemAtkBoost,
    dmgReduce1, dmgReduce2, weaponBonus,
    physDef, judgeRes, physRes, elemRes
  };
  _lastEffParams = effParams;
  _lastBaseExpected = expected.total;

  // (旧UI) STATUS SCORE 再計算block 削除済 — import経路では computeExpected line124 で
  // __WWM_LAST_RESULT セット済。DOM経路時のheroScore等表示は廃止。
  buildEfficiencyTable(effParams, expected.total);
  return window.__WWM_LAST_RESULT;
}

// 新 import flow から呼出のため window 公開
window.computeExpected = computeExpected;
