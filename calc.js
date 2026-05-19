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

function v(id)  { return parseFloat(document.getElementById(id).value) || 0; }
function vp(id) { return (parseFloat(document.getElementById(id).value) || 0) / 100; }

// ── 純粋関数：期待ダメージ ────────────────────────────────────────
function computeExpected(p) {
  const hiddenBonus  = p.worldLv + p.martialLv + 1;
  const physPenDiff  = p.outerPen - p.physRes;
  const physPenZone  = physPenDiff > 0 ? physPenDiff / 100 : physPenDiff / 200;
  const elemPenDiff  = p.elemPen - p.elemRes;
  const elemPenZone  = elemPenDiff > 0 ? elemPenDiff / 100 : elemPenDiff / 200;
  const physDmgBonus = 1 + p.allMartialBoost + p.specMartialBoost + p.weaponBonus + p.bossBoost + p.enemyDebuff;
  const elemDmgBonus = physDmgBonus + p.elemAtkBoost;
  const reductionZone= (1 - p.dmgReduce1) * (1 - p.dmgReduce2);

  const sympathyRateAdj = p.judgeRes === 0 ? p.sympathyRate : p.sympathyRate / p.judgeRes;
  const critRateAdj     = p.judgeRes === 0 ? p.critRate     : p.critRate     / p.judgeRes;
  const appliedSympathy = Math.min(0.4, sympathyRateAdj + p.addSympathyRate);
  const appliedCrit     = Math.min(0.8, 1 - appliedSympathy, critRateAdj + p.addCritRate);
  const appliedHit      = p.judgeRes === 0 ? Math.min(1, p.hitRate) : Math.min(1, 0.65 + (p.hitRate - 0.65) / p.judgeRes);
  const pCrit     = Math.min(appliedHit, appliedCrit);
  const pSympathy = appliedSympathy;
  const pGraze    = (1 - appliedHit) * (1 - sympathyRateAdj);
  const pNormal   = 1 - pCrit - pSympathy - pGraze;

  function physPart(atk) { return Math.max(0, atk - p.physDef) * p.outerCoeff + p.outerAdd; }
  function elemPart(m, s) {
    return (m + hiddenBonus) * p.elemBoostMain * p.statusCoeff
         + (s + hiddenBonus) * p.elemBoostSub  * p.statusCoeff;
  }
  function dmg(pa, em, es, mul) {
    mul = mul || 1;
    return physPart(pa) * (1 + physPenZone) * physDmgBonus * reductionZone * mul
         + elemPart(em, es) * (1 + elemPenZone) * elemDmgBonus * reductionZone * mul;
  }

  const avgPhys = (p.minPhysATK + p.maxPhysATK) / 2;
  const avgMain = (p.minElemMain + p.maxElemMain) / 2;
  const avgSub  = (p.minElemSub  + p.maxElemSub)  / 2;

  return dmg(avgPhys, avgMain, avgSub)          * pNormal
       + dmg(avgPhys, avgMain, avgSub, 1 + p.critBoost) * pCrit
       + dmg(p.maxPhysATK, p.maxElemMain, p.maxElemSub, 1 + p.sympathyBoost) * pSympathy
       + dmg(p.minPhysATK, p.minElemMain, p.minElemSub) * pGraze;
}

// ── STATUS SCORE 固定スキルパラメータ ────────────────────────────
const SCORE_FIXED = { outerCoeff: 1.0, statusCoeff: 1.5, outerAdd: 230 };

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
    if (Array.isArray(saved) && saved.length === EFF_ROWS.length) {
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
    const maxInput = '<input type="number" class="eff-max-input"'
      + ' data-idx="' + idx + '" data-ispct="' + row.isPct + '"'
      + ' value="' + dispVal + '" step="' + step + '" min="0"'
      + (row.isPct ? ' title="%"' : '') + '>';

    let badgeClass, badgeText, scoreColor;
    if      (score >= 250) { badgeClass = 'badge-fire'; badgeText = T.effRateFire; scoreColor = 'var(--vermilion-bright)'; }
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
  const minPhysATK = v('minPhysATK'), maxPhysATK = v('maxPhysATK');
  const minElemMain = v('minElemMain'), maxElemMain = v('maxElemMain');
  const minElemSub  = v('minElemSub'),  maxElemSub  = v('maxElemSub');
  const outerCoeff  = vp('outerCoeff'), statusCoeff = vp('statusCoeff');
  const outerAdd    = v('outerAdd'),    enemyDebuff = vp('enemyDebuff');
  const hitRate     = vp('hitRate'),    critRate    = vp('critRate');
  const sympathyRate= vp('sympathyRate'), addCritRate = vp('addCritRate');
  const addSympathyRate = vp('addSympathyRate');
  const worldLv     = v('worldLv'),     martialLv   = v('martialLv');
  const elemBoostMain = v('elemBoostMain'), elemBoostSub = v('elemBoostSub');
  const critBoost       = vp('critBoost'),   allMartialBoost = vp('allMartialBoost');
  const sympathyBoost   = vp('sympathyBoost'), specMartialBoost = vp('specMartialBoost');
  const outerPen        = v('outerPen'),     bossBoost       = vp('bossBoost');
  const elemPen         = v('elemPen'),      elemAtkBoost    = vp('elemAtkBoost');
  const dmgReduce1      = vp('dmgReduce1'),  dmgReduce2      = vp('dmgReduce2');
  const weaponBonus     = vp('weaponBonus');

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
  const physPenZone   = physPenDiff > 0 ? physPenDiff / 100 : physPenDiff / 200;
  const elemPenDiff   = elemPen - elemRes;
  const elemPenZone   = elemPenDiff > 0 ? elemPenDiff / 100 : elemPenDiff / 200;
  const physDmgBonus  = 1 + allMartialBoost + specMartialBoost + weaponBonus + bossBoost + enemyDebuff;
  const elemDmgBonus  = physDmgBonus + elemAtkBoost;
  const reductionZone = (1 - dmgReduce1) * (1 - dmgReduce2);

  const sympathyRateAdj = judgeRes === 0 ? sympathyRate : sympathyRate / judgeRes;
  const critRateAdj     = judgeRes === 0 ? critRate     : critRate     / judgeRes;
  const appliedSympathy = Math.min(0.4, sympathyRateAdj + addSympathyRate);
  const appliedCrit     = Math.min(0.8, 1 - appliedSympathy, critRateAdj + addCritRate);
  const appliedHit      = judgeRes === 0 ? Math.min(1, hitRate) : Math.min(1, 0.65 + (hitRate - 0.65) / judgeRes);
  const pCrit     = Math.min(appliedHit, appliedCrit);
  const pSympathy = appliedSympathy;
  const pGraze    = (1 - appliedHit) * (1 - sympathyRateAdj);
  const pNormal   = 1 - pCrit - pSympathy - pGraze;

  document.getElementById('dispHitRate').textContent      = (appliedHit      * 100).toFixed(2) + '%';
  document.getElementById('dispCritRate').textContent     = (appliedCrit     * 100).toFixed(2) + '%';
  document.getElementById('dispSympathyRate').textContent = (appliedSympathy * 100).toFixed(2) + '%';

  function physPart(atk) { return Math.max(0, atk - physDef) * outerCoeff + outerAdd; }
  function elemPart(m, s) {
    return (m + hiddenBonus) * elemBoostMain * statusCoeff
         + (s + hiddenBonus) * elemBoostSub  * statusCoeff;
  }
  function dmg(pa, em, es, mul = 1) {
    const p = physPart(pa) * (1 + physPenZone) * physDmgBonus * reductionZone * mul;
    const e = elemPart(em, es) * (1 + elemPenZone) * elemDmgBonus * reductionZone * mul;
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

  // ── STATUS SCORE（固定スキル係数で計算） ─────────────────────
  const scoreExpected = computeExpected({...effParams, ...SCORE_FIXED});
  countUp('heroScore', scoreExpected, 0);

  // ── ヒーロー：期待値カウントアップ＆内訳 ──────────────────────
  countUp('heroExpected', expected.total, 0);
  countUp('hbExp',  expected.total, 0);
  countUp('hbPhys', expected.phys, 0);
  countUp('hbElem', expected.elem, 0);

  // ── 確率分布：ドーナツ＋凡例 ─────────────────────────────────
  updateDonut(pCrit, pSympathy, pGraze, pNormal);
  document.getElementById('probCritVal').textContent     = pctStr(pCrit);
  document.getElementById('probSympathyVal').textContent = pctStr(pSympathy);
  document.getElementById('probGrazeVal').textContent    = pctStr(pGraze);
  document.getElementById('probNormalVal').textContent   = pctStr(pNormal);

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
  buildEfficiencyTable(effParams, expected.total);
}
