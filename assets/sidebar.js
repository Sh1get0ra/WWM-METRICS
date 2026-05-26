// ── WWM-DMGCALC Sidebar ─────────────────────────────────────────
let _STAT_CONFIG = null;
let _CURRENT_PARAMS = null;

// ── Esc キーで最前面 modal 閉じる ────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const backdrops = document.querySelectorAll('.wwm-modal-backdrop');
  if (!backdrops.length) return;
  const top = backdrops[backdrops.length - 1];
  top.remove();
  e.stopPropagation();
});

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
    const cl = await fetch('data/changelog.json').then(r => r.json());
    if (!cl?.current) return;
    const seen = localStorage.getItem(_CHANGELOG_KEY);
    if (seen && _semver(seen, cl.current) >= 0) return;
    // 差分: seen より新しい entries
    const entries = (cl.entries || []).filter(e => !seen || _semver(e.version, seen) > 0);
    if (!entries.length) {
      localStorage.setItem(_CHANGELOG_KEY, cl.current);
      return;
    }
    _showChangelogModal(entries, cl.current, false);
  } catch (e) {}
}
function _showChangelogModal(entries, currentVer, manual) {
  const m = document.createElement('div');
  m.className = 'wwm-modal-backdrop';
  const body = entries.map(e => `
    <div class="wwm-cl-entry">
      <div class="wwm-cl-ver">v${e.version}<span class="wwm-cl-date">${e.date || ''}</span></div>
      <ul class="wwm-cl-items">
        ${(e.items||[]).map(it => `<li>${it}</li>`).join('')}
      </ul>
    </div>
  `).join('');
  m.innerHTML = `
    <div class="wwm-modal wwm-modal-wide">
      <div class="wwm-modal-header">
        <h2>${manual ? '変更履歴' : '更新内容 (v' + currentVer + ')'}</h2>
        <button class="wwm-modal-close" aria-label="Close">×</button>
      </div>
      <div class="wwm-modal-body">
        ${body}
        <div class="wwm-btn-row" style="margin-top:16px;">
          <button class="wwm-btn-primary" id="wwmClClose">閉じる</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(m);
  const close = () => {
    if (!manual) localStorage.setItem(_CHANGELOG_KEY, currentVer);
    m.remove();
  };
  m.querySelector('.wwm-modal-close').addEventListener('click', close);
  m.querySelector('#wwmClClose').addEventListener('click', close);
}
async function _showAllChangelogs() {
  try {
    const cl = await fetch('data/changelog.json').then(r => r.json());
    _showChangelogModal(cl.entries || [], cl.current, true);
  } catch (e) {}
}
window.WWMChangelog = { check: _checkChangelog, showAll: _showAllChangelogs };

// ── Help / Score Formula 説明 ─────────────────────────────────
function _showScoreFormula() {
  const m = document.createElement('div');
  m.className = 'wwm-modal-backdrop';
  m.innerHTML = `
    <div class="wwm-modal wwm-modal-wide">
      <div class="wwm-modal-header">
        <h2>STATUS SCORE 計算式</h2>
        <button class="wwm-modal-close" aria-label="Close">×</button>
      </div>
      <div class="wwm-modal-body wwm-help-body">
        <h3>概要</h3>
        <p>STATUS SCORE は装備/心法/武学/セットを総合してダメージ期待値を <b>固定係数</b> で算出した指標。装備変更や心法 swap の影響を一元的に比較可。</p>

        <h3>固定係数 (全プレイヤー共通)</h3>
        <ul>
          <li><b>外功攻撃係数:</b> 1.0 (100%)</li>
          <li><b>ステータス攻撃係数:</b> 1.5 (150%)</li>
          <li><b>付加外功:</b> +230</li>
          <li><b>属性強化 (主):</b> ×1.5 (主属性のみ)</li>
          <li><b>属性強化 (副):</b> ×1.0</li>
          <li><b>大世界等級:</b> 14 固定</li>
          <li><b>武学等級:</b> キャラクター Lv と同一</li>
        </ul>

        <h3>敵パラメータ (キャラ Lv 自動連動)</h3>
        <ul>
          <li>Lv 95: 敵 Lv 91 (DEF 350 / 審判耐性 1.45)</li>
          <li>Lv 96-100: 敵 Lv 96 (DEF 405 / 審判耐性 1.65)</li>
          <li>物理耐性/属性耐性/軽減/デバフ: 0</li>
        </ul>

        <h3>反映される効果</h3>
        <ul>
          <li>装備 base stat (外功攻撃/属性攻撃 等)</li>
          <li>装備 affix (副ステ)</li>
          <li>武学 effects + derived (会心率上限 +Δ 等)</li>
          <li>心法 Tier 効果 (Tier ≥ 2 で Tier2 効果、Tier ≥ 5 で Tier5 効果)</li>
          <li>セット効果 pieces2 (2 個装備で発動)</li>
          <li>セット効果 pieces4 (4 個装備で +100 score 固定ボーナス、各装備に均等配賦)</li>
          <li>5行ステ (体/力/防/速/会) → derived (会心率 / 会意率 等)</li>
          <li>武器固有 derived (主武器/副武器 weaponType 連動)</li>
        </ul>

        <h3>反映されない効果</h3>
        <ul>
          <li>セット効果 pieces4 の条件付効果 (気血/真気/受流/重撃 トリガー等) — 一律 +100 固定</li>
          <li>観音 (game stat 非影響と判明)</li>
        </ul>

        <h3>Tier 判定</h3>
        <ul>
          <li><b>SS:</b> 6700 以上</li>
          <li><b>S:</b> 6030 以上 (SS閾値の 90%)</li>
          <li><b>A:</b> 5360 以上 (80%)</li>
          <li><b>B:</b> 4020 以上 (60%)</li>
          <li><b>C:</b> それ未満</li>
        </ul>

        <h3>計算式 (要約)</h3>
        <pre class="wwm-help-pre">expected = normalAvg × pNormal
         + critAvg × pCrit
         + sympathyDmg × pSympathy
         + grazeDmg × pGraze

各 dmg = (物理 + 属性) × 全武術ダメ × 外功増伤 × ...
statusScore = expected (固定係数で再計算)
finalScore = statusScore + 4-set bonus (該当時)</pre>

        <div class="wwm-btn-row" style="margin-top:16px;">
          <button class="wwm-btn-primary" id="wwmHelpClose">閉じる</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.querySelector('.wwm-modal-close').addEventListener('click', close);
  m.querySelector('#wwmHelpClose').addEventListener('click', close);
}
window.WWMHelp = { showScoreFormula: _showScoreFormula };

// ── 弱点指摘 / Diagnostics ──────────────────────────────────────
// i18n: affix 表記 (ja=オプション / en=affix 等)
function _optionTerm() {
  const lang = _curLang();
  return lang === 'ja' ? 'オプション' : 'affix';
}
function _diagnose(roleInfo, params) {
  const out = [];
  if (!params) return out;
  const opt = _optionTerm();
  const jr = params.judgeRes || 1.45;
  // 命中率過多 (超過 ≥3% で通知)
  const hitCapThreshold = 0.35 * jr + 0.65;
  const hitOverPct = (params.hitRate - hitCapThreshold) * 100;
  if (hitOverPct >= 3) {
    out.push({ type: 'warn', text: `命中率過多 (現 ${(params.hitRate*100).toFixed(1)}% / cap ${(hitCapThreshold*100).toFixed(1)}% / 超過 +${hitOverPct.toFixed(1)}%)` });
  } else if (params.hitRate < hitCapThreshold * 0.95) {
    const need = ((hitCapThreshold - params.hitRate) * 100).toFixed(1);
    out.push({ type: 'info', text: `命中率不足 (現 ${(params.hitRate*100).toFixed(1)}% / cap ${(hitCapThreshold*100).toFixed(1)}% / 残 ${need}%)` });
  }
  // 会心率過多
  const critAdj = params.critRate / jr;
  const critOverPct = (critAdj - 0.8) * 100;
  if (critOverPct >= 3) {
    out.push({ type: 'warn', text: `会心率過多 (適用 ${(critAdj*100).toFixed(1)}% / cap 80% / 超過 +${critOverPct.toFixed(1)}%)` });
  }
  // 会意率過多
  const symAdj = params.sympathyRate / jr;
  const symOverPct = (symAdj - 0.4) * 100;
  if (symOverPct >= 3) {
    out.push({ type: 'warn', text: `会意率過多 (適用 ${(symAdj*100).toFixed(1)}% / cap 40% / 超過 +${symOverPct.toFixed(1)}%)` });
  }
  // 会心率不足: jr 適用後 ≤70% かつ 最終会心+最終会意 <100%
  const appliedCritFinal = Math.min(0.8, critAdj) + (params.addCritRate || 0);
  const appliedSymFinal = Math.min(0.4, symAdj) + (params.addSympathyRate || 0);
  if (critAdj <= 0.70 && (appliedCritFinal + appliedSymFinal) < 1.0) {
    out.push({ type: 'warn', text: `会心率不足 (適用 ${(critAdj*100).toFixed(1)}% / 最終会心+会意 ${((appliedCritFinal+appliedSymFinal)*100).toFixed(1)}%)` });
  }
  // 外功貫通/属性貫通 +1あたり期待値 判定: 後段 async で simulate 追記
  // 良好メッセ
  if (!out.filter(x => x.type==='warn').length) {
    out.push({ type: 'good', text: '主要ステータス は概ね良好' });
  }
  return out;
}
// 外功貫通/属性貫通 +1 あたり Δscore 取得 (固定閾値判定 + mismatchは max比正規化)
async function _evalPenSpecialization(roleInfo) {
  if (!window.WWMStats?.buildStatParams || typeof window.computeExpected !== 'function') return null;
  const state = (() => { try { return JSON.parse(localStorage.getItem('wwm_last_state_v1') || 'null'); } catch(_) { return null; } })();
  await _loadEquipMax();
  const charLv = roleInfo?.level || 95;
  const tier = _lvToTier(charLv);
  const maxTbl = _EQUIP_MAX?.tiers?.[tier] || {};
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
    return { dPhysPer1, dElemPer1, maxPhysPen, maxElemPen };
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
  if (allPhys && dElem > dPhys) return { type:'mismatch', current:'外功貫通', better:'無相貫通', cur:dPhys, btr:dElem };
  if (allVoid && dPhys > dElem) return { type:'mismatch', current:'無相貫通', better:'外功貫通', cur:dElem, btr:dPhys };
  if (!allPhys && !allVoid) {
    const better = dPhys >= dElem ? '外功貫通' : '無相貫通';
    const counts = { physPen:0, voidPen:0, other:0 };
    stats.forEach(k => { counts[k === 'physPen' ? 'physPen' : k === 'voidPen' ? 'voidPen' : 'other']++; });
    return { type:'mixed', better, counts };
  }
  return null;
}
async function _findWastedAffixes(roleInfo) {
  if (!window.WWMStats?.buildStatParams || typeof window.computeExpected !== 'function') return [];
  const state = (() => { try { return JSON.parse(localStorage.getItem('wwm_last_state_v1') || 'null'); } catch(_) { return null; } })();
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
    const slotLabel = _GEAR_SLOT_LABELS[slot] || slot;
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
async function renderDiagnostics(roleInfo, params) {
  const root = document.getElementById('wwmDiagnostics');
  if (!root) return;
  const items = _diagnose(roleInfo, params);
  // 初回 sync 表示
  function _draw(list) {
    // 6 項目上限 (warn 優先)
    const sorted = list.slice().sort((a,b) => {
      const order = { warn: 0, info: 1, good: 2 };
      return (order[a.type]||3) - (order[b.type]||3);
    });
    const limited = sorted.slice(0, 4);
    root.innerHTML = `
      <div class="wwm-diag-header">
        <span class="wwm-diag-rail">弱点</span>
        <h3 class="wwm-diag-title">弱点指摘 / Diagnostics</h3>
      </div>
      <div class="wwm-diag-body">
        ${limited.map(it => `<div class="wwm-diag-item wwm-diag-${it.type}"><span class="wwm-diag-icon">${it.type==='warn'?'⚠':it.type==='good'?'✓':'ℹ'}</span><span class="wwm-diag-text">${it.text}</span></div>`).join('')}
      </div>
    `;
  }
  _draw(items);
  // async wasted + 貫通特化判定
  const [wasted, penEval] = await Promise.all([
    _findWastedAffixes(roleInfo),
    _evalPenSpecialization(roleInfo)
  ]);
  let merged = items.slice();
  if (penEval && penEval.dPhysPer1 < 22 && penEval.dElemPer1 < 18) {
    merged = merged.filter(it => it.type !== 'good').concat([{
      type: 'warn',
      text: `外功/属性 どちらにも特化なし → 片方に特化推奨 (外功貫通+1=${penEval.dPhysPer1.toFixed(2)} / 属性貫通+1=${penEval.dElemPer1.toFixed(2)} / 推奨 外功≥22 or 属性≥18)`
    }]);
  }
  if (penEval) {
    // mismatch/mixed比較: max比 n で正規化 → +1あたり × max値 (=装備1個Δ) 同士で比較
    const physScaled = penEval.dPhysPer1 * penEval.maxPhysPen;
    const elemScaled = penEval.dElemPer1 * penEval.maxElemPen;
    const m = _checkAffix6PenMismatch(roleInfo, physScaled, elemScaled);
    if (m?.type === 'mismatch') {
      merged = merged.filter(it => it.type !== 'good').concat([{
        type: 'warn',
        text: `武器系affix6 全4スロット ${m.current} だが ${m.better} の方が期待値高 (外功貫通+1=${penEval.dPhysPer1.toFixed(2)} / 属性貫通+1=${penEval.dElemPer1.toFixed(2)})`
      }]);
    } else if (m?.type === 'mixed') {
      const breakdown = `外功${m.counts.physPen}/無相${m.counts.voidPen}${m.counts.other?`/他${m.counts.other}`:''}`;
      merged = merged.filter(it => it.type !== 'good').concat([{
        type: 'warn',
        text: `武器系affix6 混在 (${breakdown}) → ${m.better} 4スロット統一推奨 (外功貫通+1=${penEval.dPhysPer1.toFixed(2)} / 属性貫通+1=${penEval.dElemPer1.toFixed(2)})`
      }]);
    }
  }
  if (wasted.length) {
    const opt = _optionTerm();
    merged = merged.filter(it => it.type !== 'good').concat([
      { type: 'warn', text: `無駄${opt} (${wasted.length}件): ${wasted.slice(0,5).join(' / ')}${wasted.length>5?` 他${wasted.length-5}件`:''}` }
    ]);
  }
  if (merged !== items) _draw(merged);
}
window.WWMDiag = { render: renderDiagnostics };

// ── Tier ladder ────────────────────────────────────────────────
function renderTierLadder(roleInfo, params) {
  const root = document.getElementById('wwmTierLadder');
  if (!root || !params) return;
  const wl = params.worldLv || roleInfo?.worldLv || 14;
  const thr = 6700 * Math.pow(0.8, 14 - wl);
  const tiers = [
    { name: 'SS', val: thr },
    { name: 'S',  val: thr * 0.9 },
    { name: 'A',  val: thr * 0.8 },
    { name: 'B',  val: thr * 0.6 },
    { name: 'C',  val: 0 }
  ];
  const cur = (window.__WWM_LAST_RESULT?.statusScore || 0) + _set4Bonus(_getEffectiveRoleInfo() || roleInfo);
  const curScore = Math.round(cur);
  let curTier = 'C';
  for (const t of tiers) if (curScore >= t.val) { curTier = t.name; break; }
  // 次 tier 残 Δ
  let nextTier = null, nextNeed = 0;
  for (let i = tiers.length - 1; i >= 0; i--) {
    if (curScore < tiers[i].val) { nextTier = tiers[i].name; nextNeed = Math.ceil(tiers[i].val - curScore); break; }
  }
  // 表示順: SS top → C bottom
  const rows = tiers.map(t => {
    const reached = curScore >= t.val;
    const isCurrent = t.name === curTier;
    return `<div class="wwm-ladder-row${reached?' reached':''}${isCurrent?' current':''}">
      <span class="wwm-ladder-tier tier-${t.name}">${t.name}</span>
      <span class="wwm-ladder-val">${Math.round(t.val).toLocaleString()}</span>
      ${isCurrent ? `<span class="wwm-ladder-marker">◀ 現在 (${curScore.toLocaleString()})</span>` : ''}
    </div>`;
  }).join('');
  const nextLabel = nextTier
    ? `<div class="wwm-ladder-next">次 ${nextTier} まで <b>+${nextNeed.toLocaleString()}</b></div>`
    : `<div class="wwm-ladder-next">最高 tier 到達</div>`;
  root.innerHTML = `
    <div class="wwm-analysis-card">
      <div class="wwm-analysis-header"><span class="wwm-analysis-rail">階級</span><h3>Tier Ladder</h3></div>
      <div class="wwm-ladder-body">${rows}</div>
      ${nextLabel}
    </div>
  `;
}
window.WWMTierLadder = { render: renderTierLadder };

// ── Affix 期待値ランキング (各 stat の score 寄与 Top) ────────────
async function renderAffixRanking(roleInfo, params) {
  const root = document.getElementById('wwmAffixRanking');
  if (!root || !roleInfo || !window.WWMStats?.buildStatParams) return;
  const state = (() => { try { return JSON.parse(localStorage.getItem('wwm_last_state_v1') || 'null'); } catch(_) { return null; } })();
  // baseline score
  let baseScore = 0;
  try {
    const p = await window.WWMStats.buildStatParams(roleInfo, state);
    window.computeExpected(p);
    baseScore = _scoreWithBonus(roleInfo);
  } catch (e) { return; }
  // equip_max.json から tier max 取得 → 装備1オプション分の Δ で評価
  await _loadEquipMax();
  const charLv = roleInfo?.level || 95;
  const tier = _lvToTier(charLv);
  const maxTbl = _EQUIP_MAX?.tiers?.[tier] || {};
  const PATH_PEN = { bellstrike:'bellstrikePen', stonesplit:'stonesplitPen', silkbind:'silkbindPen', bamboocut:'bamboocutPen', voidPath:'voidPen' };
  const path = window.WWM_KONGFU?.[roleInfo?.kongfuMain]?.path;
  const PATH_NAME = { bellstrike:'鋼鳴', stonesplit:'砕岩', silkbind:'糸操', bamboocut:'瞬嵐', voidPath:'無相' };
  const pathLabel = PATH_NAME[path] || '';
  const PATH_MAP = { bellstrike:['minBellstrike','maxBellstrike'], stonesplit:['minStonesplit','maxStonesplit'],
                     silkbind:['minSilkbind','maxSilkbind'], bamboocut:['minBamboocut','maxBamboocut'],
                     voidPath:['minVoid','maxVoid'] };
  const pathKeys = PATH_MAP[path] || [];
  const activePathPen = PATH_PEN[path];
  // 装備オプションに出るもののみ評価対象 (compute が読む key にマップ)
  const targets = [
    { key: 'minPhysATK', delta: maxTbl.maxPhys, label: `最小外功攻撃 +${maxTbl.maxPhys?.toFixed(1)}` },
    { key: 'maxPhysATK', delta: maxTbl.maxPhys, label: `最大外功攻撃 +${maxTbl.maxPhys?.toFixed(1)}` },
    pathKeys[0] && { key: 'minElemMain', delta: maxTbl.pathSingle, label: `最小${pathLabel}攻撃 +${maxTbl.pathSingle?.toFixed(1)}` },
    pathKeys[1] && { key: 'maxElemMain', delta: maxTbl.pathSingle, label: `最大${pathLabel}攻撃 +${maxTbl.pathSingle?.toFixed(1)}` },
    { key: 'critRate',     delta: maxTbl.crit,     label: `会心率 +${((maxTbl.crit||0)*100).toFixed(1)}%` },
    { key: 'sympathyRate', delta: maxTbl.affinity, label: `会意率 +${((maxTbl.affinity||0)*100).toFixed(1)}%` },
    { key: 'hitRate',      delta: maxTbl.precision, label: `命中率 +${((maxTbl.precision||0)*100).toFixed(1)}%` },
    { key: 'outerPen',     delta: maxTbl.outerPen, label: `外功貫通 +${maxTbl.outerPen}` },
    { key: 'elemPen',      delta: maxTbl.attrPen,  label: `無相貫通 +${maxTbl.attrPen}` },
    { key: 'stMysticDmg',  delta: maxTbl.mysticDmg, label: `奇術ダメ +${((maxTbl.mysticDmg||0)*100).toFixed(1)}%` },
    { key: 'allMartialBoost', delta: maxTbl.allWeaponDmg, label: `全武学効果/ダメージブースト +${((maxTbl.allWeaponDmg||0)*100).toFixed(1)}%` }
  ].filter(t => t && t.delta != null && t.delta > 0);
  // 並列で全 simulate
  const results = [];
  for (const t of targets) {
    try {
      const p2 = await window.WWMStats.buildStatParams(roleInfo, state);
      // +delta 適用後 再 compute (params改変 で済む)
      p2[t.key] = (p2[t.key] || 0) + t.delta;
      window.computeExpected(p2);
      const newScore = (window.__WWM_LAST_RESULT?.statusScore || 0) + _set4Bonus(roleInfo);
      results.push({ label: t.label, delta: newScore - baseScore });
    } catch (e) {}
  }
  results.sort((a, b) => b.delta - a.delta);
  const top = results;
  const rows = top.map((r, i) => `
    <div class="wwm-rank-row">
      <span class="wwm-rank-pos">${i+1}</span>
      <span class="wwm-rank-label">${r.label}</span>
      <span class="wwm-rank-delta">+${r.delta.toFixed(1)}</span>
    </div>
  `).join('');
  root.innerHTML = `
    <div class="wwm-analysis-card">
      <div class="wwm-analysis-header"><span class="wwm-analysis-rail">期待値</span><h3>Affix 期待値ランキング</h3></div>
      <div class="wwm-rank-body">${rows}</div>
    </div>
  `;
  // 復元
  try {
    const p3 = await window.WWMStats.buildStatParams(roleInfo, state);
    window.computeExpected(p3);
  } catch (e) {}
}
window.WWMRanking = { render: renderAffixRanking };

// ── 装備最適化提案 (Greedy 全体最適化) ────────────────────────
let _OPT_LAST_STEPS = null;
let _OPT_LAST_SCORES = null;
async function renderOptimization(roleInfo, params, opts) {
  const root = document.getElementById('wwmOptimization');
  if (!root || !roleInfo || !window.WWMStats?.buildStatParams) return;
  opts = opts || {};
  // 保存された ratio (slider 値) 取得
  const savedRatio = parseFloat(localStorage.getItem('wwm_opt_target_ratio_v1')) || 0.94;
  const TARGET_RATIO = opts.ratio ?? savedRatio;
  const MAX_ITER = 15;
  // header controls
  const savedSlot = opts.slotFilter ?? (localStorage.getItem('wwm_opt_slot_filter_v1') || 'all');
  const savedTier = opts.targetTier ?? (localStorage.getItem('wwm_opt_target_tier_v1') || 'none');
  const SLOT_FILTERS = { all: '全装備', weapon: '主/副武器', accessory: '環/佩び物', armor: '防具' };
  const TIER_OPTIONS = { none: '制限なし', SS: 'SSまで', S: 'Sまで', A: 'Aまで' };
  const headerHtml = `
    <div class="wwm-analysis-header">
      <span class="wwm-analysis-rail">最適</span>
      <h3>装備最適化提案</h3>
      <div class="wwm-opt-controls">
        <select class="wwm-opt-select" id="wwmOptSlot" title="対象 slot">
          ${Object.entries(SLOT_FILTERS).map(([k,v]) => `<option value="${k}" ${k===savedSlot?'selected':''}>${v}</option>`).join('')}
        </select>
        <select class="wwm-opt-select" id="wwmOptTier" title="目標 tier">
          ${Object.entries(TIER_OPTIONS).map(([k,v]) => `<option value="${k}" ${k===savedTier?'selected':''}>${v}</option>`).join('')}
        </select>
        <label class="wwm-opt-ratio-label">目標 <span id="wwmOptRatioVal">${Math.round(TARGET_RATIO*100)}%</span>
          <input type="range" id="wwmOptRatio" min="90" max="100" step="1" value="${Math.round(TARGET_RATIO*100)}">
        </label>
        <button type="button" class="wwm-opt-btn" id="wwmOptRecalc" title="再計算">↻</button>
        <button type="button" class="wwm-opt-btn" id="wwmOptExport" title="手順をテキストでコピー">📋</button>
        <button type="button" class="wwm-opt-btn wwm-opt-btn-apply" id="wwmOptApplyAll" title="全 swap を sidebar 反映">全適用</button>
      </div>
    </div>
    <div class="wwm-opt-progress" id="wwmOptProgress"></div>
  `;
  // 対象 slot filter mapping
  const SLOT_GROUPS = {
    all: ['1','2','3','4','5','8','10','11'],
    weapon: ['1','2'],
    accessory: ['10','11'],
    armor: ['3','4','5','8']
  };
  const slotsAllowed = new Set(SLOT_GROUPS[savedSlot] || SLOT_GROUPS.all);
  // 目標 tier 閾値
  const TIER_THRESHOLDS = { SS: 1.0, S: 0.9, A: 0.8, B: 0.6 };
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
    const reEl = root.querySelector('#wwmOptRecalc');
    if (reEl) reEl.addEventListener('click', () => renderOptimization(roleInfo, params));
    const exEl = root.querySelector('#wwmOptExport');
    if (exEl) exEl.addEventListener('click', _exportOptSteps);
    const apEl = root.querySelector('#wwmOptApplyAll');
    if (apEl) apEl.addEventListener('click', () => _applyOptSteps(_OPT_LAST_STEPS || []));
    const slEl = root.querySelector('#wwmOptSlot');
    if (slEl) slEl.addEventListener('change', () => {
      localStorage.setItem('wwm_opt_slot_filter_v1', slEl.value);
      renderOptimization(roleInfo, params, { slotFilter: slEl.value, targetTier: savedTier });
    });
    const tiEl = root.querySelector('#wwmOptTier');
    if (tiEl) tiEl.addEventListener('change', () => {
      localStorage.setItem('wwm_opt_target_tier_v1', tiEl.value);
      renderOptimization(roleInfo, params, { slotFilter: savedSlot, targetTier: tiEl.value });
    });
    root.querySelectorAll('[data-opt-step]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.optStep, 10);
        const step = _OPT_LAST_STEPS?.[i];
        if (step) _applyOptSteps([step]);
      });
    });
  }
  // 計算中表示
  root.innerHTML = `<div class="wwm-analysis-card">${headerHtml}<div class="wwm-opt-loading">計算中...</div></div>`;
  _bindControls();
  const setProgress = (iter, max) => {
    const el = root.querySelector('#wwmOptProgress');
    if (el) el.textContent = `計算中 ${iter}/${max}...`;
  };
  const state = (() => { try { return JSON.parse(localStorage.getItem('wwm_last_state_v1') || 'null'); } catch(_) { return null; } })();
  await _loadEquipMax();
  const charLv = roleInfo?.level || 95;
  // 作業用 roleInfo clone
  let working = JSON.parse(JSON.stringify(roleInfo));
  // 初期 baseline
  let startScore = 0;
  try {
    const p = await window.WWMStats.buildStatParams(working, state);
    window.computeExpected(p);
    startScore = _scoreWithBonus(working);
  } catch (e) { return; }
  const steps = [];
  let curScore = startScore;
  // 目標 score 閾値 (worldLv 由来)
  const wl = params?.worldLv || 14;
  const ssThr = 6700 * Math.pow(0.8, 14 - wl);
  const targetThr = savedTier !== 'none' && TIER_THRESHOLDS[savedTier]
    ? ssThr * TIER_THRESHOLDS[savedTier] : null;
  let stopReason = null;
  let lastBestNull = false;
  for (let iter = 0; iter < MAX_ITER; iter++) {
    setProgress(iter + 1, MAX_ITER);
    // 目標 tier 到達で早期終了
    if (targetThr != null && curScore >= targetThr) { stopReason = `目標 ${savedTier} 到達`; break; }
    const eqDet = working.wearEquipsDetailed || {};
    const slots = ['1','2','3','4','5','8','10','11'].filter(s => eqDet[s] && slotsAllowed.has(s));
    let best = null;
    for (const slot of slots) {
      const eq = eqDet[slot];
      const affixes = eq?.exVo?.baseAffixes || [];
      for (let idx = 0; idx < affixes.length; idx++) {
        // 防具 idx5 (武学固有) のみ最適化対象外。武器系 idx5 (貫通系) は対象に含める
        if (idx === 5 && _SLOT6_ARMOR.has(slot)) continue;
        const cur = affixes[idx]?.equipmentDetails;
        if (!cur) continue;
        const curStatKey = window.WWM_AFFIX?.[cur[0]]?.statKey;
        const options = _getAffixOptions(cur[0], slot, idx, affixes);
        for (const opt of options) {
          if (opt.statKey === curStatKey) continue;
          const maxVal = _getAffixMax(opt.statKey, charLv);
          if (maxVal == null) continue;
          try {
            const ri = JSON.parse(JSON.stringify(working));
            const newAffix = ri.wearEquipsDetailed[slot].exVo.baseAffixes[idx].equipmentDetails;
            newAffix[0] = parseInt(opt.id, 10);
            newAffix[1] = maxVal * TARGET_RATIO;
            newAffix[2] = TARGET_RATIO;
            newAffix[3] = 2;
            const p = await window.WWMStats.buildStatParams(ri, state);
            window.computeExpected(p);
            const newScore = _scoreWithBonus(ri);
            const delta = newScore - curScore;
            if (delta > 0 && (!best || delta > best.delta)) {
              best = {
                slot, slotLabel: _GEAR_SLOT_LABELS[slot] || slot, idx,
                fromKey: curStatKey, fromName: _affixDisplayName(cur[0]),
                fromVal: cur[1], fromRatio: cur[2],
                toName: opt.name, toId: parseInt(opt.id, 10),
                toKey: opt.statKey, toVal: maxVal * TARGET_RATIO, toRatio: TARGET_RATIO,
                delta, newScore
              };
            }
          } catch (e) {}
        }
      }
    }
    if (!best) {
      stopReason = iter === 0 ? '改善余地なし (現状最適 or 全 affix max)' : `${iter}回 改善後、追加改善なし`;
      break;
    }
    // 採用: working state 更新
    const tgt = working.wearEquipsDetailed[best.slot].exVo.baseAffixes[best.idx].equipmentDetails;
    const tgtMax = _getAffixMax(window.WWM_AFFIX?.[best.toId]?.statKey, charLv);
    tgt[0] = best.toId;
    tgt[1] = tgtMax * TARGET_RATIO;
    tgt[2] = TARGET_RATIO;
    tgt[3] = 2;
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
    // UI yield
    await new Promise(r => setTimeout(r, 0));
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
  const rows = steps.length ? steps.map((s, i) => `
    <div class="wwm-opt-row">
      <span class="wwm-opt-pos">${i+1}</span>
      <span class="wwm-opt-slot">${s.slotLabel}#${s.idx+1}</span>
      <span class="wwm-opt-change"><span class="wwm-opt-from">${_fmtFromTo(s.fromName, s.fromVal, s.fromRatio, s.fromKey)}</span> ▶ <span class="wwm-opt-to">${_fmtFromTo(s.toName, s.toVal, s.toRatio, s.toKey)}</span></span>
      <span class="wwm-opt-delta">+${Math.round(s.delta).toLocaleString()}</span>
      ${s.tierUp ? `<span class="wwm-opt-tierup">★ ${s.tierUp}</span>` : '<span></span>'}
      <button type="button" class="wwm-opt-btn wwm-opt-btn-step" data-opt-step="${i}" title="この swap だけ適用">適用</button>
    </div>
  `).join('') : `<div class="wwm-opt-empty">${stopReason || '改善余地なし'}</div>`;
  const reasonHtml = stopReason && steps.length ? `<div class="wwm-opt-reason">${stopReason}</div>` : '';
  // 結果 cache (export 用)
  _OPT_LAST_STEPS = steps;
  _OPT_LAST_SCORES = { start: Math.round(startScore), end: Math.round(curScore), delta: totalDelta, ratio: TARGET_RATIO };
  root.innerHTML = `
    <div class="wwm-analysis-card">
      ${headerHtml.replace('<div class="wwm-opt-progress" id="wwmOptProgress"></div>', '')}
      <div class="wwm-opt-summary">${summary}</div>
      <div class="wwm-opt-body">${rows}</div>
      ${reasonHtml}
    </div>
  `;
  _bindControls();
}
function _exportOptSteps() {
  if (!_OPT_LAST_STEPS || !_OPT_LAST_SCORES) { alert('まず計算してください'); return; }
  const s = _OPT_LAST_SCORES;
  const lines = [
    `WWM-DMGCALC 装備最適化提案 (目標 ${Math.round(s.ratio*100)}%)`,
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
  const origRi = window.__WWM_ROLEINFO;
  if (!origRi) return;
  if (!window.__WWM_VIRTUAL) window.__WWM_VIRTUAL = {};
  for (const step of stepsToApply) {
    const slot = step.slot;
    // 既存 virtual or original の clone を取得/初期化
    let vEq = window.__WWM_VIRTUAL[slot];
    if (!vEq) {
      const orig = origRi.wearEquipsDetailed?.[slot];
      if (!orig) continue;
      vEq = JSON.parse(JSON.stringify(orig));
      window.__WWM_VIRTUAL[slot] = vEq;
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
window.WWMOpt = { render: renderOptimization };

// ── Build Sharing URL ──────────────────────────────────────────
function _shareBuildUrl() {
  const ri = window.__WWM_ROLEINFO;
  if (!ri) { alert('build データなし。先に import してください。'); return; }
  const state = (() => { try { return JSON.parse(localStorage.getItem('wwm_last_state_v1') || 'null'); } catch(_) { return null; } })();
  const payload = { v: 1, data: ri, state: state || null };
  let url;
  try {
    const json = JSON.stringify(payload);
    const b64 = btoa(unescape(encodeURIComponent(json))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    url = location.origin + location.pathname + '#build=' + b64;
  } catch (e) { alert('URL 生成失敗: ' + e.message); return; }
  // modal で表示 + clipboard コピー
  const m = document.createElement('div');
  m.className = 'wwm-modal-backdrop';
  m.innerHTML = `
    <div class="wwm-modal wwm-modal-wide">
      <div class="wwm-modal-header">
        <h2>Build 共有 URL</h2>
        <button class="wwm-modal-close" aria-label="Close">×</button>
      </div>
      <div class="wwm-modal-body">
        <p style="font-size:12px;color:var(--paper-mute);margin:0 0 8px;">この URL を共有すると、相手の WWM-DMGCALC で同じ build が表示される。</p>
        <textarea class="wwm-share-url" readonly>${url}</textarea>
        <div class="wwm-btn-row" style="margin-top:12px;">
          <button class="wwm-btn-primary" id="wwmShareCopy">クリップボードにコピー</button>
          <button class="wwm-btn-secondary" id="wwmShareClose">閉じる</button>
        </div>
        <div id="wwmShareMsg" style="margin-top:8px;font-size:12px;color:var(--jade-bright);"></div>
      </div>
    </div>
  `;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.querySelector('.wwm-modal-close').addEventListener('click', close);
  m.querySelector('#wwmShareClose').addEventListener('click', close);
  m.querySelector('#wwmShareCopy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
      m.querySelector('#wwmShareMsg').textContent = '✓ コピー完了';
    } catch (e) {
      m.querySelector('.wwm-share-url').select();
      m.querySelector('#wwmShareMsg').textContent = '手動でコピーしてください';
    }
  });
}
// hash で build 受信時 復元
function _loadSharedBuild() {
  const hash = location.hash || '';
  const m = hash.match(/#build=([^&]+)/);
  if (!m) return false;
  try {
    const b64 = m[1].replace(/-/g,'+').replace(/_/g,'/');
    const json = decodeURIComponent(escape(atob(b64)));
    const payload = JSON.parse(json);
    if (payload?.data) {
      localStorage.setItem('wwm_last_import_v1', JSON.stringify({ ts: Date.now(), data: payload.data }));
      if (payload.state) localStorage.setItem('wwm_last_state_v1', JSON.stringify(payload.state));
      history.replaceState(null, '', location.pathname);
      return true;
    }
  } catch (e) { console.error('[ShareBuild] 復元失敗:', e); }
  return false;
}
// 起動時 hash チェック
if (_loadSharedBuild()) {
  // localStorage 更新済 → 通常 auto-load フロー で反映
}
window.WWMShare = { shareUrl: _shareBuildUrl };
// 起動時 1回 checks
setTimeout(_checkChangelog, 500);

async function _loadConfig() {
  if (_STAT_CONFIG) return _STAT_CONFIG;
  try { _STAT_CONFIG = await fetch('data/stat_display.json').then(r=>r.json()); } catch(e){}
  return _STAT_CONFIG;
}

function _curLang() { return (window.currentLang) || 'ja'; }
function _label(labelObj, fallback) {
  if (!labelObj) return fallback || '';
  const lang = _curLang();
  return labelObj[lang] || labelObj.ja || labelObj.en || fallback || '';
}

function _fmt(val, format) {
  if (val == null || isNaN(val)) return '-';
  if (format === 'pct')   return (val * 100).toFixed(1) + '%';
  if (format === 'float') return val.toFixed(1);
  return Math.round(val).toLocaleString();
}

function _fmtItemValue(item, params) {
  if (!params) return '-';
  if (item.format === 'range') {
    const keys = Array.isArray(item.calcKey) ? item.calcKey : [item.calcKey];
    const minV = params[keys[0]] || 0;
    const maxV = params[keys[1] || keys[0]] || 0;
    return `${Math.round(minV).toLocaleString()}-${Math.round(maxV).toLocaleString()}`;
  }
  if (item.format === 'rateApplied') {
    const raw = params[item.calcKey];
    const applied = params[item.appliedCalcKey];
    const rawStr = _fmt(raw, 'pct');
    const appStr = applied != null ? `(${_fmt(applied, 'pct')})` : '';
    return `${rawStr} <span class="wwm-sb-applied">${appStr}</span>`;
  }
  return _fmt(params[item.calcKey], item.format);
}
// baseline と current で値違えば "baseline ▶ current" 表示
function _fmtItem(item, params, baseParams) {
  const cur = _fmtItemValue(item, params);
  if (!baseParams || baseParams === params) return cur;
  const base = _fmtItemValue(item, baseParams);
  if (base === cur) return cur;
  return `<span class="wwm-sb-baseline">${base}</span> <span class="wwm-sb-arrow">▶</span> ${cur}`;
}

function _renderItem(item, params, depth, baseParams) {
  depth = depth || 0;
  const cls = depth > 0 ? ' wwm-sb-sub' : '';
  let html = `
    <div class="wwm-sb-row${cls}" data-item-key="${item.key}">
      <span class="wwm-sb-label">${_label(item.label, item.key)}</span>
      <span class="wwm-sb-value">${_fmtItem(item, params, baseParams)}</span>
    </div>
  `;
  if (item.expandable && item.subItems) {
    html += `<div class="wwm-sb-sub-group wwm-sb-collapsed" data-parent="${item.key}">`;
    for (const sub of item.subItems) html += _renderItem(sub, params, depth + 1, baseParams);
    html += `</div>`;
  }
  return html;
}

const _COLLAPSE_KEY = 'wwm_sidebar_collapsed_v1';
function _getCollapsedSet() {
  try { return new Set(JSON.parse(localStorage.getItem(_COLLAPSE_KEY) || '[]')); }
  catch(e) { return new Set(); }
}
function _saveCollapsed(set) {
  try { localStorage.setItem(_COLLAPSE_KEY, JSON.stringify([...set])); } catch(e) {}
}

function _renderSection(section, params, collapsedSet, baseParams) {
  const items = section.items.map(it => _renderItem(it, params, 0, baseParams)).join('');
  const isCollapsed = collapsedSet.has(section.key);
  return `
    <section class="wwm-sb-section${isCollapsed ? ' wwm-sb-collapsed-sec' : ''}" data-section-key="${section.key}">
      <h3 class="wwm-sb-section-title" data-toggle-section="${section.key}">
        <span class="wwm-sb-sec-arrow">${isCollapsed ? '▶' : '▼'}</span>
        ${_label(section.title, section.key)}
      </h3>
      <div class="wwm-sb-items">${items}</div>
    </section>
  `;
}

async function renderSidebar(params) {
  const cfg = await _loadConfig();
  if (!cfg) return;
  const root = document.getElementById('wwmSidebar');
  if (!root) return;
  _CURRENT_PARAMS = params;
  // 総合武力 = roleInfo.xiuWeiKungFu (現在値)
  let totalPower = '-';
  const ri = window.__WWM_ROLEINFO;
  if (ri?.xiuWeiKungFu) totalPower = ri.xiuWeiKungFu.toLocaleString();
  else if (ri?.maxXiuWeiKungFu) totalPower = ri.maxXiuWeiKungFu.toLocaleString();
  const avatar = ri?._avatarUrl ? `<img class="wwm-sb-avatar" src="${ri._avatarUrl}" alt="avatar">` : '';
  const charName = ri?.roleName ? `${ri.roleName} <span class="wwm-muted">Lv${ri.level||'?'}</span>` : '';
  const importBtnLabel = (window.T && window.T.importBtn) || 'IMPORT';
  const powerLabel = _label(cfg.header?.title, '総合武力');
  const header = `
    <div class="wwm-sb-top">
      ${avatar}
      <div class="wwm-sb-info">
        ${charName ? `<div class="wwm-sb-charname">${charName}</div>` : ''}
        <div class="wwm-sb-power"><span class="wwm-muted">${powerLabel}</span> <b>${totalPower}</b></div>
      </div>
      <button type="button" class="wwm-sb-import-btn" onclick="importData()" data-i18n="importBtn">${importBtnLabel}</button>
    </div>
  `;
  const collapsedSet = _getCollapsedSet();
  // baseline params (original roleInfo) — virtual ある時のみ算出
  const hasVirtual = (window.__WWM_VIRTUAL && Object.keys(window.__WWM_VIRTUAL).length) ||
                     (window.__WWM_VIRTUAL_KONGFU && Object.keys(window.__WWM_VIRTUAL_KONGFU).length);
  let baseParams = null;
  if (hasVirtual && ri && window.WWMStats?.buildStatParams) {
    try {
      const state = (() => { try { return JSON.parse(localStorage.getItem('wwm_last_state_v1') || 'null'); } catch(_) { return null; } })();
      baseParams = await window.WWMStats.buildStatParams(ri, state);
    } catch (e) {}
  }
  const sections = params
    ? (cfg.sections || []).map(s => _renderSection(s, params, collapsedSet, baseParams)).join('')
    : `<div class="wwm-sb-empty">
         <p class="wwm-muted" style="text-align:center;padding:24px 12px;">
           まだインポートデータがありません。<br>
           上部「IMPORT」ボタンから取り込みできます。
         </p>
       </div>`;
  // 未対応データ notice
  let noticeHtml = '';
  if (ri) {
    const u = _detectUnknown(ri);
    const total = u.kongfu.length + u.xinfa.length + u.affix.length;
    if (total) {
      noticeHtml = `
        <div class="wwm-sb-notice" onclick="WWMSidebar.openUnknownReport()">
          ⚠ 未対応データ ${total}件 (click 報告)
        </div>
      `;
    }
  }
  root.innerHTML = header + sections + noticeHtml;
  // section title click で折りたたみ toggle
  root.querySelectorAll('[data-toggle-section]').forEach(el => {
    el.addEventListener('click', () => {
      const key = el.dataset.toggleSection;
      const set = _getCollapsedSet();
      if (set.has(key)) set.delete(key);
      else set.add(key);
      _saveCollapsed(set);
      const sec = el.closest('.wwm-sb-section');
      const arrow = el.querySelector('.wwm-sb-sec-arrow');
      if (sec.classList.toggle('wwm-sb-collapsed-sec')) {
        if (arrow) arrow.textContent = '▶';
      } else {
        if (arrow) arrow.textContent = '▼';
      }
    });
  });
  // expandable click
  root.querySelectorAll('.wwm-sb-row[data-item-key]').forEach(el => {
    const key = el.dataset.itemKey;
    const group = root.querySelector(`.wwm-sb-sub-group[data-parent="${key}"]`);
    if (group) {
      el.classList.add('wwm-sb-expandable');
      el.addEventListener('click', () => group.classList.toggle('wwm-sb-collapsed'));
    }
  });
}

// ── Gear Grid (main 下部) ───────────────────────────────────────
const _GEAR_SLOT_ORDER = ['1', '2', '3', '4', '21', '10', '11', '5', '8', '9'];
const _GEAR_SLOT_LABELS = {
  '1': '主武器', '2': '副武器', '3': '冠', '4': '胸当て', '21': '弓矢',
  '10': '環', '11': '佩び物', '5': '膝鎧', '8': '小手', '9': '射玦'
};
// rail 縦書き専用 中国語表記 (武侠雰囲気)
const _GEAR_RAIL_ZH = {
  '1': '主武器', '2': '副武器',
  '3': '冠胄', '4': '胸甲', '5': '膝甲', '8': '腕甲',
  '10': '環', '11': '佩',
  '21': '弓箭', '9': '射玦'
};
// slot/weaponType → アイコンファイル名 (assets/icons/<name>.svg)
const _GEAR_SLOT_ICON = {
  '3': 'helmet', '4': 'chest', '5': 'legs', '8': 'hands',
  '10': 'ring', '11': 'pendant',
  '21': 'bow', '9': 'archer-disc'
};
const _WEAPON_TYPE_ICON = {
  sword: 'sword', spear: 'spear', fan: 'fan', umbrella: 'umbrella',
  moBlade: 'glaive', dualBlades: 'dual-blades', ropeDart: 'rope-dart',
  hengBlade: 'katana',
  // raw kongfu.json weaponType (snake)
  mo_blade: 'glaive', dual_blades: 'dual-blades', rope_dart: 'rope-dart',
  heng_blade: 'katana'
};
function _gearIcon(slot, roleInfo) {
  if (slot === '1' || slot === '2') {
    const kid = slot === '1' ? roleInfo?.kongfuMain : roleInfo?.kongfuSub;
    const kf = window.WWM_KONGFU?.[kid];
    const wt = kf?.weaponType;
    if (wt) {
      // normalize: dual_blades or dualBlades
      return _WEAPON_TYPE_ICON[wt] || _WEAPON_TYPE_ICON[wt.replace(/_([a-z])/g, (_,c)=>c.toUpperCase())] || 'sword';
    }
    return 'sword';
  }
  return _GEAR_SLOT_ICON[slot] || null;
}

function renderGearGrid(roleInfo) {
  const root = document.getElementById('wwmGearGrid');
  if (!root) return;
  const eqDet = roleInfo?.wearEquipsDetailed || {};
  const sets = window.WWM_SETS || {};
  const kongfu = window.WWM_KONGFU || {};
  const lang = (window.currentLang) || 'ja';
  const kfName = (id) => kongfu[id]?.names?.[lang] || kongfu[id]?.names?.ja || '';

  // 装備カード Score = affix ratio 平均 × 100
  function calcCardScore(eq) {
    const affs = eq?.exVo?.baseAffixes || [];
    if (!affs.length) return 0;
    let sum = 0, n = 0;
    for (const a of affs) {
      const d = a?.equipmentDetails;
      if (!d) continue;
      const ratio = d[2];
      if (typeof ratio === 'number') { sum += ratio; n++; }
    }
    return n ? Math.round(sum / n * 100) : 0;
  }

  const cards = _GEAR_SLOT_ORDER.map(slot => {
    const eq = eqDet[slot];
    const label = _GEAR_SLOT_LABELS[slot] || slot;
    if (!eq) return `<div class="wwm-equip-slot wwm-equip-empty" data-slot="${slot}"><div class="wwm-equip-slot-header"><b>${label}</b><span class="wwm-muted">未装備</span></div></div>`;
    const suffix = eq.exVo?.suffix;
    const isBow = slot === '9' || slot === '21';
    const isArmor = ['3','4','5','8'].includes(slot);
    const setsCat = isBow ? sets.bowSets : (isArmor ? sets.defensiveSets : sets.weaponSets);
    const setName = setsCat?.[suffix]?.names?.ja || setsCat?.[suffix]?.names?.en || '';
    const score = calcCardScore(eq);
    let kongfuLine = '';
    if (slot === '1' && roleInfo?.kongfuMain) {
      const n = kfName(roleInfo.kongfuMain);
      if (n) kongfuLine = `<span class="wwm-equip-kongfu">${n}</span>`;
    } else if (slot === '2' && roleInfo?.kongfuSub) {
      const n = kfName(roleInfo.kongfuSub);
      if (n) kongfuLine = `<span class="wwm-equip-kongfu">${n}</span>`;
    }
    const iconName = _gearIcon(slot, roleInfo);
    const iconHtml = iconName ? `<img class="wwm-equip-icon" src="assets/icons/${iconName}.svg" alt="">` : '';
    const railLabel = _GEAR_RAIL_ZH[slot] || label;
    return `
      <div class="wwm-equip-slot" data-slot="${slot}" onclick="WWMGear.openEdit('${slot}')">
        <div class="wwm-equip-rail"><span class="wwm-equip-rail-text">${railLabel}</span></div>
        ${iconHtml}
        <div class="wwm-equip-slot-inner">
          <div class="wwm-equip-slot-header">${setName ? `<span class="wwm-equip-setname">${setName}</span>` : ''}</div>
          <div class="wwm-equip-slot-body">
            ${kongfuLine}
            <span class="wwm-equip-card-score" data-card-score="${slot}"><b>...</b></span>
          </div>
        </div>
      </div>
    `;
  }).join('');
  root.innerHTML = cards;
  // Phase 3: slot 寄与差分を 非同期計算 → カード更新
  _computeGearCardScores(roleInfo);
}

// 4-set 固定ボーナス (防具セット 除外 — damage 非影響)
const _SET4_BONUS = 100;
function _isOffensiveSet(sfx) {
  const sets = window.WWM_SETS || {};
  return !!(sets.weaponSets?.[sfx] || sets.bowSets?.[sfx]);
}
function _set4Bonus(roleInfo) {
  const eqDet = roleInfo?.wearEquipsDetailed || {};
  const counts = {};
  for (const eq of Object.values(eqDet)) {
    const sfx = eq?.exVo?.suffix;
    if (sfx !== undefined) counts[sfx] = (counts[sfx]||0)+1;
  }
  let bonus = 0;
  for (const [sfx, c] of Object.entries(counts)) {
    if (c >= 4 && _isOffensiveSet(sfx)) bonus += _SET4_BONUS;
  }
  return bonus;
}
// 共通: compute + 4-set bonus
function _scoreWithBonus(roleInfo) {
  const base = window.__WWM_LAST_RESULT?.statusScore || 0;
  return base + _set4Bonus(roleInfo);
}
window.__WWM_SET4_BONUS_OF = _set4Bonus;

// 装備カード Score = (現状 全装備) - (該当 slot 外し) + セット効果均等分配
async function _computeSlotContributions(roleInfo, slots, suffixSlots, set4Map) {
  if (!window.WWMStats?.buildStatParams || typeof window.computeExpected !== 'function') return null;
  const state = (() => { try { return JSON.parse(localStorage.getItem('wwm_last_state_v1') || 'null'); } catch(_) { return null; } })();
  // base
  let baseScore = 0;
  try {
    const baseParams = await window.WWMStats.buildStatParams(roleInfo, state);
    window.computeExpected(baseParams);
    baseScore = _scoreWithBonus(roleInfo);
  } catch (e) { return null; }
  // set 2pc share map
  const setShare = {};
  for (const [sfx, members] of Object.entries(suffixSlots)) {
    if (members.length < 2) continue;
    try {
      const ri = JSON.parse(JSON.stringify(roleInfo));
      for (const s of members) {
        if (ri.wearEquipsDetailed[s]?.exVo) ri.wearEquipsDetailed[s].exVo.suffix = -999;
      }
      const p = await window.WWMStats.buildStatParams(ri, state);
      window.computeExpected(p);
      const noSet = _scoreWithBonus(ri);
      const eff = baseScore - noSet;
      const share = eff * (members.length - 1) / members.length;
      for (const s of members) setShare[s] = share;
    } catch (e) {}
  }
  // 各 slot 寄与
  const result = {};
  for (const slot of slots) {
    try {
      const ri = JSON.parse(JSON.stringify(roleInfo));
      delete ri.wearEquipsDetailed[slot];
      const p = await window.WWMStats.buildStatParams(ri, state);
      window.computeExpected(p);
      const noSlot = _scoreWithBonus(ri);
      let delta = baseScore - noSlot;
      if (setShare[slot]) delta -= setShare[slot];
      if (set4Map[slot]) delta -= set4Map[slot];
      result[slot] = Math.round(delta);
    } catch (e) { result[slot] = 0; }
  }
  return result;
}

async function _computeGearCardScores(roleInfo) {
  if (!window.WWMStats?.buildStatParams || typeof window.computeExpected !== 'function') return;
  const state = (() => { try { return JSON.parse(localStorage.getItem('wwm_last_state_v1') || 'null'); } catch(_) { return null; } })();
  const origRi = window.__WWM_ROLEINFO;
  const effRi = roleInfo;  // 既に effective が渡される想定 (renderGearGrid から呼ばれる)
  const eqDet = effRi?.wearEquipsDetailed || {};
  const slots = _GEAR_SLOT_ORDER.filter(s => eqDet[s]);
  // effective 用 suffix map + set4 map
  const suffixSlots = {};
  for (const s of slots) {
    const sfx = eqDet[s]?.exVo?.suffix;
    if (sfx !== undefined) {
      if (!suffixSlots[sfx]) suffixSlots[sfx] = [];
      suffixSlots[sfx].push(s);
    }
  }
  const set4Map = {};
  for (const [sfx, members] of Object.entries(suffixSlots)) {
    if (members.length < 4 || !_isOffensiveSet(sfx)) continue;
    const share = _SET4_BONUS * (members.length - 1) / members.length;
    for (const s of members) set4Map[s] = share;
  }
  // effective 寄与算出
  const effContrib = await _computeSlotContributions(effRi, slots, suffixSlots, set4Map) || {};
  // baseline (origRi) 寄与算出 (slot に virtual ある場合のみ表示用)
  let origContrib = {};
  const hasVirtual = (window.__WWM_VIRTUAL && Object.keys(window.__WWM_VIRTUAL).length) ||
                     (window.__WWM_VIRTUAL_KONGFU && Object.keys(window.__WWM_VIRTUAL_KONGFU).length);
  if (hasVirtual && origRi && origRi !== effRi) {
    const origEqDet = origRi.wearEquipsDetailed || {};
    const origSlots = _GEAR_SLOT_ORDER.filter(s => origEqDet[s]);
    const origSuffixSlots = {};
    for (const s of origSlots) {
      const sfx = origEqDet[s]?.exVo?.suffix;
      if (sfx !== undefined) {
        if (!origSuffixSlots[sfx]) origSuffixSlots[sfx] = [];
        origSuffixSlots[sfx].push(s);
      }
    }
    const origSet4Map = {};
    for (const [sfx, members] of Object.entries(origSuffixSlots)) {
      if (members.length < 4 || !_isOffensiveSet(sfx)) continue;
      const share = _SET4_BONUS * (members.length - 1) / members.length;
      for (const s of members) origSet4Map[s] = share;
    }
    origContrib = await _computeSlotContributions(origRi, origSlots, origSuffixSlots, origSet4Map) || {};
  }
  // 描画
  for (const slot of slots) {
    const el = document.querySelector(`[data-card-score="${slot}"]`);
    if (!el) continue;
    const curScore = effContrib[slot] || 0;
    const isModified = hasVirtual && (
      window.__WWM_VIRTUAL?.[slot] ||
      (slot === '1' && window.__WWM_VIRTUAL_KONGFU?.kongfuMain) ||
      (slot === '2' && window.__WWM_VIRTUAL_KONGFU?.kongfuSub)
    );
    if (isModified && origContrib[slot] != null && origContrib[slot] !== curScore) {
      el.innerHTML = `<b>${origContrib[slot].toLocaleString()}</b><span class="wwm-equip-arrow">▶</span><b>${curScore.toLocaleString()}</b>`;
    } else {
      el.innerHTML = `<b>${curScore.toLocaleString()}</b>`;
    }
  }
  // DOM 状態復元
  try {
    const finalParams = await window.WWMStats.buildStatParams(effRi, state);
    window.computeExpected(finalParams);
  } catch (e) {}
}

// ── Xinfa Grid (心法パネル) ─────────────────────────────────
function renderXinfaGrid(roleInfo) {
  const root = document.getElementById('wwmXinfaGrid');
  if (!root) return;
  const passive = roleInfo?.passiveSlots || [];
  const lang = _curLang();
  const xinfaMap = window.WWM_XINFA || {};
  const state = (() => { try { return JSON.parse(localStorage.getItem('wwm_last_state_v1') || 'null'); } catch(_) { return null; } })();
  const tiers = state?.xinfaTiers || {};
  const xinfaIcons = window.__WWM_ROLEINFO?._xinfaIcons || roleInfo?._xinfaIcons || [];
  const origPassive = window.__WWM_ROLEINFO?.passiveSlots || [];
  const cards = [0,1,2,3].map(i => {
    const xid = passive[i];
    const xinfa = xid ? xinfaMap[xid] : null;
    const name = xinfa ? (xinfa.names?.[lang] || xinfa.names?.ja || `心法ID ${xid}`) : '(空)';
    const tier = tiers[i] ?? tiers[String(i)] ?? 6;
    // icon: swap されてない (元と同じ xid) 場合のみ表示
    const iconUrl = (xid === origPassive[i]) ? xinfaIcons[i] : null;
    const iconHtml = iconUrl ? `<img class="wwm-xinfa-icon" src="${iconUrl}" alt="">` : '';
    return `
      <div class="wwm-xinfa-slot" data-xinfa-slot="${i}" onclick="WWMXinfa.openEdit(${i})">
        <div class="wwm-xinfa-rail"><span class="wwm-xinfa-rail-text">心法${['一','二','三','四'][i]}</span></div>
        ${iconHtml}
        <div class="wwm-xinfa-inner">
          <div class="wwm-xinfa-header"><b>${name}</b><span class="wwm-xinfa-tier">Tier ${tier}</span></div>
        </div>
        <span class="wwm-xinfa-card-score" data-xinfa-score="${i}"><b>...</b></span>
      </div>
    `;
  }).join('');
  root.innerHTML = cards;
  _computeXinfaCardScores(roleInfo);
}

async function _computeXinfaCardScores(roleInfo) {
  if (!window.WWMStats?.buildStatParams || typeof window.computeExpected !== 'function') return;
  const state = (() => { try { return JSON.parse(localStorage.getItem('wwm_last_state_v1') || 'null'); } catch(_) { return null; } })();
  // base score
  let baseScore = 0;
  try {
    const baseParams = await window.WWMStats.buildStatParams(roleInfo, state);
    window.computeExpected(baseParams);
    baseScore = _scoreWithBonus(roleInfo);
  } catch (e) { return; }
  // 各 xinfa slot → tier 0 で再算出 = その心法寄与
  for (let i = 0; i < 4; i++) {
    try {
      const altState = JSON.parse(JSON.stringify(state || {}));
      if (!altState.xinfaTiers) altState.xinfaTiers = {};
      altState.xinfaTiers[i] = 0;
      altState.xinfaTiers[String(i)] = 0;
      const p = await window.WWMStats.buildStatParams(roleInfo, altState);
      window.computeExpected(p);
      const noXinfa = _scoreWithBonus(roleInfo);
      const delta = Math.round(baseScore - noXinfa);
      const el = document.querySelector(`[data-xinfa-score="${i}"]`);
      if (el) el.innerHTML = `<b>${delta.toLocaleString()}</b>`;
    } catch (e) {}
  }
  // 復元
  try {
    const finalParams = await window.WWMStats.buildStatParams(roleInfo, state);
    window.computeExpected(finalParams);
  } catch (e) {}
}

// ── Xinfa Edit modal ───────────────────────────────────────────
function openXinfaEdit(slotIdx) {
  const origRi = window.__WWM_ROLEINFO;
  if (!origRi) return;
  const lang = _curLang();
  const xinfaMap = window.WWM_XINFA || {};
  const passive = (window.__WWM_VIRTUAL_XINFA?.passive) || origRi.passiveSlots || [];
  const origPassive = origRi.passiveSlots || [];
  const state = (() => { try { return JSON.parse(localStorage.getItem('wwm_last_state_v1') || 'null'); } catch(_) { return null; } })();
  const origTier = (state?.xinfaTiers?.[slotIdx] ?? state?.xinfaTiers?.[String(slotIdx)] ?? 6);
  const virtTier = window.__WWM_VIRTUAL_XINFA?.tiers?.[slotIdx] ?? origTier;
  let newXinfaId = passive[slotIdx] || origPassive[slotIdx];
  let newTier = virtTier;
  const _xName = (id) => id ? (xinfaMap[id]?.names?.[lang] || xinfaMap[id]?.names?.ja || `心法ID ${id}`) : '(空)';
  function _xinfaOptions(selectedId) {
    return Object.entries(xinfaMap)
      .filter(([k]) => /^\d+$/.test(k))
      .map(([id, x]) => `<option value="${id}" ${String(id)===String(selectedId)?'selected':''}>${x.names?.[lang]||x.names?.ja||id}</option>`)
      .join('');
  }
  function _effectsText(id, tier) {
    if (!id) return '';
    const x = xinfaMap[id];
    if (!x?.attributeBuff) return '';
    if (typeof window._xinfaEffectsText === 'function') return window._xinfaEffectsText(x, tier);
    const parts = [];
    if (tier >= 2 && x.attributeBuff.tier2?.effects) parts.push('T2: ' + Object.entries(x.attributeBuff.tier2.effects).map(([k,v])=>`${k}+${v}`).join(', '));
    if (tier >= 5 && x.attributeBuff.tier5?.effects) parts.push('T5: ' + Object.entries(x.attributeBuff.tier5.effects).map(([k,v])=>`${k}+${v}`).join(', '));
    return parts.join(' / ');
  }
  const origName = _xName(origPassive[slotIdx]);
  const m = document.createElement('div');
  m.className = 'wwm-modal-backdrop';
  m.innerHTML = `
    <div class="wwm-modal wwm-modal-wide wwm-modal-square">
      <div class="wwm-modal-header">
        <h2>心法比較パネル</h2>
        <button class="wwm-modal-close" aria-label="Close">×</button>
      </div>
      <div class="wwm-modal-body">
        <div class="wwm-cmp-grid">
          <div class="wwm-cmp-col wwm-cmp-current">
            ${origRi?._xinfaIcons?.[slotIdx] ? `<div class="wwm-cmp-bg-icon" style="background-image: url('${origRi._xinfaIcons[slotIdx]}');"></div>` : ''}
            <h3 class="wwm-cmp-title">現在の心法</h3>
            <div class="wwm-cmp-kongfu-header">${origName}</div>
            <div class="wwm-cmp-set-header">Tier ${origTier}<div class="wwm-cmp-set-effect">${_effectsText(origPassive[slotIdx], origTier)}</div></div>
          </div>
          <div class="wwm-cmp-col wwm-cmp-new" id="wwmCmpXinfaNewCol">
            <h3 class="wwm-cmp-title">新しい心法</h3>
            <select class="wwm-cmp-kongfu-select" id="wwmCmpXinfaSel">${_xinfaOptions(newXinfaId)}</select>
            <select class="wwm-cmp-set-select" id="wwmCmpXinfaTierSel">${[0,1,2,3,4,5,6].map(t => `<option value="${t}" ${t===newTier?'selected':''}>Tier ${t}</option>`).join('')}</select>
            <div class="wwm-cmp-set-effect" id="wwmCmpXinfaEffect">${_effectsText(newXinfaId, newTier)}</div>
          </div>
        </div>
        <div class="wwm-cmp-preview" id="wwmCmpPreview">
          <span class="wwm-cmp-preview-label">Δ Score:</span>
          <span class="wwm-cmp-preview-value" id="wwmCmpPreviewDelta">計算中...</span>
        </div>
        <div class="wwm-btn-row" style="margin-top:12px;">
          <button class="wwm-btn-primary" id="wwmXinfaApply">適用 (sidebar反映)</button>
          <button class="wwm-btn-secondary" id="wwmXinfaReset">元に戻す</button>
          <button class="wwm-btn-secondary" id="wwmXinfaCancel">キャンセル</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(m);
  m.querySelector('.wwm-modal-close').addEventListener('click', () => m.remove());
  m.querySelector('#wwmXinfaCancel').addEventListener('click', () => m.remove());

  let _t = null;
  function _schedule() { if (_t) clearTimeout(_t); _t = setTimeout(_runPreview, 250); }
  async function _runPreview() {
    const el = m.querySelector('#wwmCmpPreviewDelta');
    if (!el) return;
    try {
      // baseline = effective (現状適用済)
      const baseRi = _getEffectiveRoleInfo() || origRi;
      const baseState = JSON.parse(JSON.stringify(state || {}));
      if (!baseState.xinfaTiers) baseState.xinfaTiers = {};
      const baseParams = await window.WWMStats.buildStatParams(baseRi, baseState);
      window.computeExpected(baseParams);
      const baseScore = _scoreWithBonus(baseRi);
      // virtual ri + state
      const vRi = JSON.parse(JSON.stringify(baseRi));
      if (!vRi.passiveSlots) vRi.passiveSlots = [];
      vRi.passiveSlots[slotIdx] = parseInt(newXinfaId, 10);
      const vState = JSON.parse(JSON.stringify(baseState));
      vState.xinfaTiers[slotIdx] = newTier;
      vState.xinfaTiers[String(slotIdx)] = newTier;
      const vParams = await window.WWMStats.buildStatParams(vRi, vState);
      window.computeExpected(vParams);
      const vScore = _scoreWithBonus(vRi);
      const delta = Math.round(vScore - baseScore);
      const sign = delta > 0 ? '+' : '';
      el.textContent = `${sign}${delta.toLocaleString()} (${Math.round(vScore).toLocaleString()})`;
      el.className = 'wwm-cmp-preview-value ' + (delta > 0 ? 'pos' : delta < 0 ? 'neg' : 'zero');
    } catch (e) { el.textContent = 'error'; }
  }

  const xSel = m.querySelector('#wwmCmpXinfaSel');
  xSel.addEventListener('change', () => {
    newXinfaId = parseInt(xSel.value, 10);
    const eff = m.querySelector('#wwmCmpXinfaEffect');
    if (eff) eff.textContent = _effectsText(newXinfaId, newTier);
    _schedule();
  });
  const tSel = m.querySelector('#wwmCmpXinfaTierSel');
  tSel.addEventListener('change', () => {
    newTier = parseInt(tSel.value, 10);
    const eff = m.querySelector('#wwmCmpXinfaEffect');
    if (eff) eff.textContent = _effectsText(newXinfaId, newTier);
    _schedule();
  });
  _schedule();

  m.querySelector('#wwmXinfaApply').addEventListener('click', () => {
    if (!window.__WWM_VIRTUAL_XINFA) window.__WWM_VIRTUAL_XINFA = { passive: [...origPassive], tiers: {} };
    if (!window.__WWM_VIRTUAL_XINFA.passive) window.__WWM_VIRTUAL_XINFA.passive = [...origPassive];
    if (!window.__WWM_VIRTUAL_XINFA.tiers) window.__WWM_VIRTUAL_XINFA.tiers = {};
    window.__WWM_VIRTUAL_XINFA.passive[slotIdx] = parseInt(newXinfaId, 10);
    window.__WWM_VIRTUAL_XINFA.tiers[slotIdx] = newTier;
    m.remove();
    _refreshAll();
  });
  m.querySelector('#wwmXinfaReset').addEventListener('click', () => {
    if (window.__WWM_VIRTUAL_XINFA?.passive) window.__WWM_VIRTUAL_XINFA.passive[slotIdx] = origPassive[slotIdx];
    if (window.__WWM_VIRTUAL_XINFA?.tiers) delete window.__WWM_VIRTUAL_XINFA.tiers[slotIdx];
    m.remove();
    _refreshAll();
  });
}

// ── Virtual gear state (Edit modal適用結果) ─────────────────────
function _getEffectiveRoleInfo() {
  const orig = window.__WWM_ROLEINFO;
  if (!orig) return null;
  const vmap = window.__WWM_VIRTUAL || {};
  const vkf = window.__WWM_VIRTUAL_KONGFU || {};
  if (!Object.keys(vmap).length && !Object.keys(vkf).length) return orig;
  const merged = { ...orig, wearEquipsDetailed: { ...(orig.wearEquipsDetailed || {}) } };
  for (const [slot, vEq] of Object.entries(vmap)) {
    if (vEq) merged.wearEquipsDetailed[slot] = vEq;
  }
  if (vkf.kongfuMain) merged.kongfuMain = vkf.kongfuMain;
  if (vkf.kongfuSub) merged.kongfuSub = vkf.kongfuSub;
  // xinfa virtual
  const vxi = window.__WWM_VIRTUAL_XINFA;
  if (vxi?.passive) merged.passiveSlots = [...vxi.passive];
  return merged;
}
// effective state (xinfa tier virtual 込み)
function _getEffectiveState() {
  const base = (() => { try { return JSON.parse(localStorage.getItem('wwm_last_state_v1') || 'null'); } catch(_) { return null; } })();
  const vxi = window.__WWM_VIRTUAL_XINFA;
  if (!vxi?.tiers || !Object.keys(vxi.tiers).length) return base;
  const merged = JSON.parse(JSON.stringify(base || {}));
  if (!merged.xinfaTiers) merged.xinfaTiers = {};
  for (const [k, v] of Object.entries(vxi.tiers)) {
    merged.xinfaTiers[k] = v;
    merged.xinfaTiers[String(k)] = v;
  }
  return merged;
}
window.__WWM_GET_EFFECTIVE_ROLEINFO = _getEffectiveRoleInfo;

function _refreshAll() {
  const ri = _getEffectiveRoleInfo();
  if (!ri) return;
  const state = _getEffectiveState();
  if (window.WWMStats) {
    window.WWMStats.buildStatParams(ri, state).then(params => {
      window.__WWM_PARAMS = params;
      window.WWMSidebar.render(params);
      window.WWMGear.render(ri);
      if (window.WWMXinfa) window.WWMXinfa.render(ri);
      if (window.WWMDiag) window.WWMDiag.render(ri, params);
      if (window.WWMTierLadder) window.WWMTierLadder.render(ri, params);
      if (window.WWMRanking) window.WWMRanking.render(ri, params);
      if (window.WWMOpt) window.WWMOpt.render(ri, params);
      if (window.WWMHero) window.WWMHero.update(params);
    }).catch(e => console.error('[WWM] refresh failed:', e));
  }
}

// ── Affix 統計 ラベル取得 (import.js の _STAT_LABELS 利用) ────
function _affixDisplayName(id) {
  const info = window.WWM_AFFIX?.[id];
  const key = info?.statKey;
  if (!key) return 'affix#' + id;
  // _STAT_LABELS は import.js 内 const、 fallback で key そのまま
  return (window._AFFIX_DISPLAY_LABELS?.[key]) || key;
}

// 👍 自動判定: 火力寄与statKey true、 防御系 false
// 会心率 (crit) = 全武器 useful
// 会意率 (affinity) = 指定 kongfu のみ useful (九変/無銘の剣/蛇神/無銘の槍)
// 指定武術効果強化 (swordDmg等) + 武術攻撃強化系 (lightAtkDmg等) = その装備に出現したら確定 useful
const _USEFUL_KEYS = new Set([
  'crit', 'precision', 'directCrit', 'directAffinity',
  'minPhys', 'maxPhys', 'physPen', 'physDmgBonus',
  'minBellstrike', 'maxBellstrike', 'bellstrikePen',
  'minStonesplit', 'maxStonesplit', 'stonesplitPen',
  'minSilkbind', 'maxSilkbind', 'silkbindPen',
  'minBamboocut', 'maxBamboocut', 'bamboocutPen',
  'minVoid', 'maxVoid', 'voidPen',
  'attrDmgBonus', 'attrPen', 'critDmgBonus', 'affinityDmgBonus',
  'allWeaponDmg', 'bossDmg', 'playerUnitDmg',
  'stMysticDmg', 'stBurstMysticDmg', 'stControlMysticDmg',
  'areaMysticDmg', 'areaDmgMysticDmg', 'areaDebuffMysticDmg',
  // 指定武術効果強化 (装備限定 → 出れば確定 useful)
  'swordDmg', 'spearDmg', 'fanDmg', 'umbrellaDmg',
  'hengBladeDmg', 'moBladeDmg', 'dualBladesDmg', 'ropeDartDmg',
  // 武術攻撃強化系 (装備限定 → 出れば確定 useful)
  'lightAtkDmg', 'heavyAtkDmg', 'executionDmg',
  'airborneLightAtkDmg', 'jumpStrikeDmg', 'dualWeaponSkillDmg', 'dashDmg',
  'agility', 'power', 'momentum'
]);
// 会意率 useful 対象 kongfu (九変の剣/無銘の剣/蛇神の槍/無銘の槍)
const _AFFINITY_USEFUL_KONGFU = new Set([10101, 10102, 10201, 10202, '10101', '10102', '10201', '10202']);

// 武学固有強化 affix statKey prefix → 対応 kongfu IDs
// その武学装備中のみ 👍
const _KONGFU_SPECIFIC_AFFIX = [
  { prefix: 'namelessSword',       kongfus: [10102] },  // 無銘の剣
  { prefix: 'namelessSpear',       kongfus: [10202] },  // 無銘の槍
  { prefix: 'sword',               kongfus: [10101] },  // 九変の剣
  { prefix: 'spear',               kongfus: [10201] },  // 蛇神の槍
  { prefix: 'bleed',               kongfus: [10101] },  // 九変の剣 (出血)
  { prefix: 'panaceaFan',          kongfus: [10301] },  // 薬川の扇
  { prefix: 'fan',                 kongfus: [10302] },  // 墨筆の扇
  { prefix: 'stormbreaker',        kongfus: [20103] },  // 嵐雷の槍
  { prefix: 'phalanxbane',         kongfus: [20402] },  // 破陣の刀
  { prefix: 'moBlade',             kongfus: [20401] },  // 断魂の刀
  { prefix: 'infernalTwinblades',  kongfus: [20501] },  // 獄炎の双剣
  { prefix: 'everspringUmb',       kongfus: [20603] },  // 醉夢の傘 (Everspring Umbrella)
  { prefix: 'soulshadeUmb',        kongfus: [20602] },  // 誘魂の傘
  { prefix: 'umb',                 kongfus: [20601] },  // 千紅の傘 (Vernal Umbrella)
  { prefix: 'mortalRopeDart',      kongfus: [20701] },  // 浮塵の縄
  { prefix: 'unfetteredRopeDart',  kongfus: [20702] },  // 浮雲の縄
  { prefix: 'snowparting',         kongfus: [20801] }   // 斬雪の刀
];
function _matchKongfuSpecific(statKey) {
  // 長い prefix 優先 (例: namelessSword > sword)
  const sorted = [..._KONGFU_SPECIFIC_AFFIX].sort((a,b) => b.prefix.length - a.prefix.length);
  for (const r of sorted) {
    if (statKey.startsWith(r.prefix)) return r.kongfus;
  }
  return null;
}
function _isUsefulAffix(id, roleInfo) {
  const info = window.WWM_AFFIX?.[id];
  if (!info?.statKey) return false;
  const sk = info.statKey;
  const k = window.WWM_KONGFU?.[roleInfo?.kongfuMain];
  const path = k?.path;
  // 会意率 特例: 指定 kongfu のみ useful
  if (sk === 'affinity') return _AFFINITY_USEFUL_KONGFU.has(roleInfo?.kongfuMain);
  // 武学固有強化: 該当武学(Main/Sub)装備中のみ useful
  const kfSpecific = _matchKongfuSpecific(sk);
  if (kfSpecific) {
    const km = parseInt(roleInfo?.kongfuMain, 10);
    const ks = parseInt(roleInfo?.kongfuSub, 10);
    return kfSpecific.includes(km) || kfSpecific.includes(ks);
  }
  if (!_USEFUL_KEYS.has(sk)) return false;
  // 無相貫通 確定 useful (path 制限外)
  if (sk === 'voidPen') return true;
  // 5path stat は active path のみ useful
  for (const p of ['Bellstrike','Stonesplit','Silkbind','Bamboocut','Void']) {
    const lower = p.charAt(0).toLowerCase() + p.slice(1);
    if (sk === 'min'+p || sk === 'max'+p || sk === lower+'Pen') {
      if (!path) return true;
      const myPrefix = path === 'voidPath' ? 'Void' : (path.charAt(0).toUpperCase() + path.slice(1));
      return p === myPrefix;
    }
  }
  return true;
}

// %表示 statKey list (ratio→pct)
// ratio 保存 (0.05=5%) → *100 で % 表示
const _PCT_RATIO_STATKEYS = new Set([
  'crit', 'affinity', 'precision', 'directCrit', 'directAffinity',
  'physDmgBonus', 'attrDmgBonus', 'critDmgBonus', 'affinityDmgBonus',
  'allWeaponDmg', 'bossDmg', 'playerUnitDmg',
  'stMysticDmg', 'stBurstMysticDmg', 'stControlMysticDmg',
  'areaMysticDmg', 'areaDmgMysticDmg', 'areaDebuffMysticDmg',
  'lightAtkDmg', 'heavyAtkDmg', 'executionDmg',
  'swordDmg', 'spearDmg', 'fanDmg', 'umbrellaDmg',
  'hengBladeDmg', 'moBladeDmg', 'dualBladesDmg', 'ropeDartDmg',
  'sympathyRate', 'addCritRate', 'addSympathyRate'
]);
// すでに % 単位で保存 (例: 9.4=9.4%) → *100 不要。現状空 (Pen系はゲーム内 非%表記)
const _PCT_DIRECT_STATKEYS = new Set([]);
function _isPctStat(statKey) { return _PCT_RATIO_STATKEYS.has(statKey) || _PCT_DIRECT_STATKEYS.has(statKey); }
function _pctNeedsMul(statKey) { return _PCT_RATIO_STATKEYS.has(statKey); }
function _fmtAffixVal(val, statKey) {
  if (val == null || isNaN(val)) return '-';
  if (_PCT_RATIO_STATKEYS.has(statKey)) return (val * 100).toFixed(1) + '%';
  if (_PCT_DIRECT_STATKEYS.has(statKey)) return val.toFixed(1) + '%';
  if (typeof val === 'number') return val.toFixed(2).replace(/\.00$/, '');
  return val;
}

// 6番目 affix 限定 ルール
// 武器/環/佩び物 (1/2/10/11): 3択のみ (physPen/voidPen/physResist)
// 防具 (3/4/5/8): 上記3つを除外
const _SLOT6_WEAPON_LIKE = new Set(['1', '2', '10', '11']);
const _SLOT6_ARMOR = new Set(['3', '4', '5', '8']);
const _SLOT6_PEN_STATS = ['physPen', 'voidPen', 'physResist'];

// equip_max.json 読込 + max 取得
let _EQUIP_MAX = null;
async function _loadEquipMax() {
  if (_EQUIP_MAX) return _EQUIP_MAX;
  try { _EQUIP_MAX = await fetch('data/equip_max.json').then(r=>r.json()); } catch(e){}
  return _EQUIP_MAX;
}
// 装備Lv → tier 関数 (equip_max.json _schema 由来)
function _lvToTier(lv) {
  lv = lv || 95;
  if (lv < 71) return '61';
  if (lv < 81) return '71';
  if (lv < 86) return '81';
  if (lv < 91) return '86';
  if (lv < 96) return '91';
  return '96';
}
// statKey → equip_max table key
const _STAT_TO_MAX_KEY = {
  // 外功
  minPhys: 'maxPhys', maxPhys: 'maxPhys',
  // 5path 系 (min/max 共通 cap)
  minBellstrike: 'pathSingle', maxBellstrike: 'pathSingle',
  minStonesplit: 'pathSingle', maxStonesplit: 'pathSingle',
  minSilkbind: 'pathSingle', maxSilkbind: 'pathSingle',
  minBamboocut: 'pathSingle', maxBamboocut: 'pathSingle',
  minVoid: 'pathSingle', maxVoid: 'pathSingle',
  // 確率系
  precision: 'precision', crit: 'crit', affinity: 'affinity',
  // 5行 (body/defense/agility/power/momentum)
  body: 'stat5', defense: 'stat5', agility: 'stat5', power: 'stat5', momentum: 'stat5',
  // 貫通: 外功貫通 = outerPen / 無相+5path貫通 = attrPen
  physPen: 'outerPen',
  bellstrikePen: 'attrPen', stonesplitPen: 'attrPen',
  silkbindPen: 'attrPen', bamboocutPen: 'attrPen',
  voidPen: 'attrPen', attrPen: 'attrPen',
  // 防具
  maxHp: 'maxHp', physDef: 'physDef', physResist: 'physDef',
  // ダメ強化
  physDmgBonus: 'physDmgBoost', attrDmgBonus: 'physDmgBoost',
  critDmgBonus: 'physDmgBoost', affinityDmgBonus: 'physDmgBoost',
  allWeaponDmg: 'allWeaponDmg', bossDmg: 'bossDmg', playerUnitDmg: 'bossDmg',
  // 武学ダメ (atkType)
  swordDmg: 'atkTypeDmg', spearDmg: 'atkTypeDmg', fanDmg: 'atkTypeDmg',
  moBladeDmg: 'atkTypeDmg', dualBladesDmg: 'atkTypeDmg', umbrellaDmg: 'atkTypeDmg',
  ropeDartDmg: 'atkTypeDmg', hengBladeDmg: 'atkTypeDmg',
  lightAtkDmg: 'atkTypeDmg', heavyAtkDmg: 'atkTypeDmg', executionDmg: 'atkTypeDmg',
  airborneLightAtkDmg: 'atkTypeDmg', jumpStrikeDmg: 'atkTypeDmg',
  dualWeaponSkillDmg: 'atkTypeDmg', dashDmg: 'atkTypeDmg',
  // 奇術ダメ + 武学固有
  stMysticDmg: 'mysticDmg', stBurstMysticDmg: 'mysticDmg', stControlMysticDmg: 'mysticDmg',
  areaMysticDmg: 'mysticDmg', areaDmgMysticDmg: 'mysticDmg', areaDebuffMysticDmg: 'mysticDmg',
  // 武学固有 (default → mysticDmg)
  directCrit: 'attunement', directAffinity: 'attunement'
};
function _getAffixMax(statKey, lv) {
  if (!_EQUIP_MAX || !statKey) return null;
  const tier = _lvToTier(lv);
  const t = _EQUIP_MAX.tiers?.[tier];
  if (!t) return null;
  let mapKey = _STAT_TO_MAX_KEY[statKey];
  // 武学固有 affix (xxxQ, xxxCharged, xxxSpecial, bleed 等) → mysticDmg
  if (!mapKey && /Q$|Charged$|Special$|Drone$|Light$|Healing$|Shield$|Rodent$|VariedCombo$|^bleed$/.test(statKey)) {
    mapKey = 'mysticDmg';
  }
  if (!mapKey) return null;
  const v = t[mapKey];
  return (typeof v === 'number') ? v : null;
}

// slot 別 affix 出現ルール (ゲーム仕様)
const _WEAPON_DMG_KEYS = new Set(['swordDmg','spearDmg','fanDmg','umbrellaDmg','moBladeDmg','dualBladesDmg','ropeDartDmg','hengBladeDmg']);
const _MYSTIC_DMG_KEYS = new Set(['stMysticDmg','stBurstMysticDmg','stControlMysticDmg','areaMysticDmg','areaDmgMysticDmg','areaDebuffMysticDmg']);
const _PVP_BOSS_KEYS = new Set(['bossDmg','playerUnitDmg']);
const _ALL_WEAPON_KEYS = new Set(['allWeaponDmg']);
// statKey が指定 slot で出現可能か判定
function _isAffixAllowedInSlot(statKey, slot) {
  const s = String(slot);
  if (_WEAPON_DMG_KEYS.has(statKey)) return ['1','2'].includes(s);
  if (_ALL_WEAPON_KEYS.has(statKey)) return ['10','11'].includes(s);
  if (_MYSTIC_DMG_KEYS.has(statKey)) return ['3','4'].includes(s);
  if (_PVP_BOSS_KEYS.has(statKey)) return ['5','8'].includes(s);
  return true;
}
// idx 0 (affix1) は ダメージ増加系 + 武学固有 出現不可
const _IDX0_FORBIDDEN_PREFIXES = ['namelessSword','namelessSpear','sword','spear','bleed','panaceaFan','fan','stormbreaker','phalanxbane','moBlade','infernalTwinblades','everspringUmb','soulshadeUmb','umb','mortalRopeDart','unfetteredRopeDart','snowparting','lightAtkDmg','heavyAtkDmg','executionDmg','airborneLightAtkDmg','jumpStrikeDmg','dualWeaponSkillDmg','dashDmg'];
function _isAffixAllowedAtIdx0(statKey) {
  if (_WEAPON_DMG_KEYS.has(statKey)) return false;
  if (_ALL_WEAPON_KEYS.has(statKey)) return false;
  if (_MYSTIC_DMG_KEYS.has(statKey)) return false;
  if (_PVP_BOSS_KEYS.has(statKey)) return false;
  // 武学固有 (xxxQ/Charged/Special/Light/Drone/Healing/Rodent/Shield/VariedCombo/bleed)
  for (const p of _IDX0_FORBIDDEN_PREFIXES) {
    if (statKey.startsWith(p)) return false;
  }
  return true;
}
// 主武器/副武器 で 武器ダメ系 → active 該当 weaponType のみ
function _isWeaponDmgMatch(statKey, slot, roleInfo) {
  if (!_WEAPON_DMG_KEYS.has(statKey)) return true;
  const kid = String(slot) === '1' ? roleInfo?.kongfuMain : roleInfo?.kongfuSub;
  const wt = window.WWM_KONGFU?.[kid]?.weaponType;
  if (!wt) return true;
  const camelize = s => s.replace(/_([a-z])/g, (_,c)=>c.toUpperCase());
  const expected = camelize(wt) + 'Dmg';
  return statKey === expected;
}

// affix 種別変更 option list: 現 affix と同じ prefix2 のもの → statKey で dedup
// slot/idx 指定で 6番目限定処理 + idx 1-4 重複不可 (affix0 のみ重複可)
function _getAffixOptions(currentAffixId, slot, idx, allAffixes) {
  const all = window.WWM_AFFIX || {};
  const cur = String(currentAffixId);
  const prefix = cur.substring(0, 2);
  const slotS = String(slot);
  const isIdx6 = idx === 5;
  const isWeaponLike6 = isIdx6 && _SLOT6_WEAPON_LIKE.has(slotS);
  const isArmor6 = isIdx6 && _SLOT6_ARMOR.has(slotS);
  // 重複禁止 set: idx 1-4 の場合、他 idx 1-4 で使用中の statKey を除外
  // (idx 0 / idx 5 は対象外)
  const blockedKeys = new Set();
  if (allAffixes && idx >= 1 && idx <= 4) {
    for (let i = 1; i <= 4; i++) {
      if (i === idx) continue;
      const otherId = allAffixes[i]?.equipmentDetails?.[0];
      const otherInfo = otherId != null ? all[otherId] : null;
      if (otherInfo?.statKey) blockedKeys.add(otherInfo.statKey);
    }
  }
  const seen = new Set();
  const opts = [];
  for (const [id, info] of Object.entries(all)) {
    if (!id.startsWith(prefix)) continue;
    const sk = info.statKey;
    if (!sk || seen.has(sk)) continue;
    if (isWeaponLike6 && !_SLOT6_PEN_STATS.includes(sk)) continue;
    if (isArmor6 && _SLOT6_PEN_STATS.includes(sk)) continue;
    if (blockedKeys.has(sk)) continue;
    // slot 別 出現ルール
    if (!_isAffixAllowedInSlot(sk, slot)) continue;
    if (!_isWeaponDmgMatch(sk, slot, window.__WWM_ROLEINFO)) continue;
    // idx 0 はダメ増加系/武学固有 出現不可
    if (idx === 0 && !_isAffixAllowedAtIdx0(sk)) continue;
    // 防具 idx 0 は外功攻撃 / 各属性攻撃 出現不可
    if (idx === 0 && _SLOT6_ARMOR.has(slotS) && /^(minPhys|maxPhys|min(Bellstrike|Stonesplit|Silkbind|Bamboocut|Void)|max(Bellstrike|Stonesplit|Silkbind|Bamboocut|Void))$/.test(sk)) continue;
    // 武器セット idx 0 は 会心率/会意率/命中率 出現不可
    if (idx === 0 && _SLOT6_WEAPON_LIKE.has(slotS) && (sk === 'crit' || sk === 'affinity' || sk === 'precision')) continue;
    // BOSSダメ + PvPダメ は同装備内 排他 (どちらか1種のみ)
    if (allAffixes && (sk === 'bossDmg' || sk === 'playerUnitDmg')) {
      const conflict = sk === 'bossDmg' ? 'playerUnitDmg' : 'bossDmg';
      const hasConflict = allAffixes.some((a, ai) => {
        if (ai === idx) return false;
        const otherId = a?.equipmentDetails?.[0];
        return otherId != null && all[otherId]?.statKey === conflict;
      });
      if (hasConflict) continue;
    }
    seen.add(sk);
    opts.push({ id, statKey: sk, name: (window._AFFIX_DISPLAY_LABELS?.[sk]) || sk });
  }
  opts.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  return opts;
}

function openGearEdit(slot) {
  const origRi = window.__WWM_ROLEINFO;
  const origEq = origRi?.wearEquipsDetailed?.[slot];
  if (!origEq) { alert('装備データなし: slot ' + slot); return; }
  const label = _GEAR_SLOT_LABELS[slot] || slot;
  // equip_max.json 確実 load (await不要、初回 null fallback)
  _loadEquipMax();
  const charLv = origRi?.level || 95;
  // 背景アイコン (slot/武器type に対応)
  const bgIconName = _gearIcon(slot, origRi);
  const bgIconUrl = bgIconName ? `url('assets/icons/${bgIconName}.svg')` : 'none';
  // kongfu 名称 (主武器/副武器)
  const lang = _curLang();
  const kfMap = window.WWM_KONGFU || {};
  const _kfName = (id) => kfMap[id]?.names?.[lang] || kfMap[id]?.names?.ja || '';
  const isWeaponSlot = slot === '1' || slot === '2';
  const origKongfuId = slot === '1' ? origRi?.kongfuMain : (slot === '2' ? origRi?.kongfuSub : null);
  // 編集中 kongfu state (新パネル用)
  let newKongfuId = origKongfuId;
  const kongfuLabel = origKongfuId ? _kfName(origKongfuId) : '';
  const kongfuHtml = kongfuLabel ? `<span class="wwm-cmp-kongfu">${kongfuLabel}</span>` : '';
  // セット系 slot: 武器/環/佩び物 = weaponSets / 弓矢/射玦 = bowSets
  const isWeaponSetSlot = ['1','2','10','11'].includes(String(slot));
  const isBowSetSlot = ['9','21'].includes(String(slot));
  const isSetEditable = isWeaponSetSlot || isBowSetSlot;
  const origSuffix = origEq.exVo?.suffix;
  let newSuffix = origSuffix;
  const setsMap = isBowSetSlot
    ? (window.WWM_SETS?.bowSets || {})
    : (window.WWM_SETS?.weaponSets || {});
  const _setName = (s) => setsMap[s]?.names?.[lang] || setsMap[s]?.names?.ja || (s ? `Set ${s}` : '');
  const _setRaw = (s) => setsMap[s]?.pieces2?.raw || '';
  function _setOptions(selectedId) {
    return Object.entries(setsMap)
      .map(([id, s]) => `<option value="${id}" ${String(id)===String(selectedId)?'selected':''}>${s.names?.[lang]||s.names?.ja||id}</option>`)
      .join('');
  }
  // slot 9/21: affix 編集不可
  const isAffixEditable = !isBowSetSlot;
  // 全 kongfu option list (slot1/2 編集用)
  function _kongfuOptions(selectedId) {
    return Object.entries(kfMap)
      .filter(([k]) => /^\d+$/.test(k))
      .map(([id, kf]) => `<option value="${id}" ${String(id)===String(selectedId)?'selected':''}>${kf.names?.[lang]||kf.names?.ja||id}</option>`)
      .join('');
  }
  // 仮想 roleInfo (newKongfu を反映した useful 判定用)
  function _virtRi(kid) {
    if (!isWeaponSlot) return origRi;
    const r = { ...origRi };
    if (slot === '1') r.kongfuMain = parseInt(kid, 10);
    else if (slot === '2') r.kongfuSub = parseInt(kid, 10);
    return r;
  }
  // 新装備 = virtual あれば virtual、なければ original コピー
  const virtualEq = window.__WWM_VIRTUAL?.[slot];
  const newAffixes = JSON.parse(JSON.stringify((virtualEq || origEq).exVo?.baseAffixes || []));
  // 👍 自動判定で d[4] 上書き (newKongfu 基準)
  function _recalcUseful() {
    const ri = _virtRi(newKongfuId);
    for (const a of newAffixes) {
      const d = a.equipmentDetails;
      if (d) d[4] = _isUsefulAffix(d[0], ri);
    }
  }
  _recalcUseful();

  function renderCurrentRows() {
    const affs = origEq.exVo?.baseAffixes || [];
    return affs.map(a => {
      const d = a.equipmentDetails || [];
      const [id, val, ratio, rank, useful] = d;
      const info = window.WWM_AFFIX?.[id];
      const sk = info?.statKey;
      const name = _affixDisplayName(id);
      const rkCls = rank===3?'gold':rank===2?'purple':'blue';
      const usefulAuto = _isUsefulAffix(id, origRi);
      return `
        <div class="wwm-cmp-row">
          <span class="wwm-cmp-name wwm-rank-${rkCls}" title="ID:${id}">${name}${usefulAuto?' 👍':''}</span>
          <span class="wwm-cmp-val">${_fmtAffixVal(val, sk)}</span>
        </div>
      `;
    }).join('');
  }

  // rank auto-derive: ratio から (>0.85 金 / >0.7 紫 / else 青)
  function _deriveRank(ratio) {
    if (ratio > 0.85) return 3;
    if (ratio > 0.70) return 2;
    return 1;
  }

  function renderNewRows() {
    return newAffixes.map((a, idx) => {
      const d = a.equipmentDetails || [];
      const [id, val, ratio, rank, useful] = d;
      const info = window.WWM_AFFIX?.[id];
      const sk = info?.statKey;
      const r = _deriveRank(ratio);
      const rkCls = r===3?'gold':r===2?'purple':'blue';
      const opts = _getAffixOptions(id, slot, idx, newAffixes);
      // selected は statKey 一致で判定 (実 ID と代表 ID 異なる可能性)
      const optsHtml = opts.map(o => `<option value="${o.id}" data-stat="${o.statKey}" ${o.statKey===sk?'selected':''}>${o.name}</option>`).join('');
      const isPct = _isPctStat(sk);
      const needsMul = _pctNeedsMul(sk);
      const displayVal = isPct
        ? (needsMul ? (val*100).toFixed(1) : val.toFixed(1))
        : (typeof val === 'number' ? val.toFixed(2).replace(/\.00$/,'') : val);
      const step = isPct ? '0.1' : '0.01';
      // max 値算出: equip_max.json (Lv → tier) ベース。fallback: orig val/ratio (sameStat時)
      let maxInternal = _getAffixMax(sk, charLv);
      if (maxInternal == null) {
        const origDet = origEq.exVo?.baseAffixes?.[idx]?.equipmentDetails;
        const origInfo = origDet?.[0] != null ? window.WWM_AFFIX?.[origDet[0]] : null;
        if (origInfo?.statKey === sk && origDet?.[1] != null && origDet?.[2] > 0) {
          maxInternal = origDet[1] / origDet[2];
        }
      }
      const maxAttr = maxInternal != null
        ? `max="${isPct ? (needsMul ? (maxInternal*100).toFixed(1) : maxInternal.toFixed(1)) : maxInternal.toFixed(2)}"`
        : '';
      return `
        <div class="wwm-cmp-row wwm-cmp-edit-row" data-affix-idx="${idx}">
          <select class="wwm-cmp-stat-select wwm-rank-${rkCls}" data-field="stat" data-stat-el>${optsHtml}</select>
          <div class="wwm-cmp-useful-mark" data-useful-el>${useful?'👍':''}</div>
          <div class="wwm-cmp-val-wrap">
            <input type="number" class="wwm-num-input wwm-cmp-val-input" step="${step}" min="0" ${maxAttr} value="${displayVal}" data-field="val" data-pct="${isPct?1:0}" data-pctmul="${needsMul?1:0}">
            <span class="wwm-cmp-unit" data-unit-el>${isPct?'%':''}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  const m = document.createElement('div');
  m.className = 'wwm-modal-backdrop';
  const bgIconHtml = bgIconName ? `<div class="wwm-cmp-bg-icon" style="background-image: url('assets/icons/${bgIconName}.svg');"></div>` : '';
  // panel 内 kongfu header HTML
  const curKongfuHeader = isWeaponSlot && origKongfuId
    ? `<div class="wwm-cmp-kongfu-header">${_kfName(origKongfuId)}</div>` : '';
  const newKongfuHeader = isWeaponSlot
    ? `<select class="wwm-cmp-kongfu-select" id="wwmCmpKongfuSel">${_kongfuOptions(newKongfuId)}</select>`
    : '';
  // panel 内 set header HTML
  const curSetHeader = isSetEditable && origSuffix
    ? `<div class="wwm-cmp-set-header" title="${_setRaw(origSuffix)}">${_setName(origSuffix)}<div class="wwm-cmp-set-effect">${_setRaw(origSuffix)}</div></div>` : '';
  const newSetHeader = isSetEditable
    ? `<select class="wwm-cmp-set-select" id="wwmCmpSetSel">${_setOptions(newSuffix)}</select><div class="wwm-cmp-set-effect" id="wwmCmpSetEffect">${_setRaw(newSuffix)}</div>` : '';
  m.innerHTML = `
    <div class="wwm-modal wwm-modal-wide wwm-modal-square">
      <div class="wwm-modal-header">
        <h2>装備比較パネル</h2>
        <button class="wwm-modal-close" aria-label="Close">×</button>
      </div>
      <div class="wwm-modal-body">
        <div class="wwm-cmp-grid">
          <div class="wwm-cmp-col wwm-cmp-current${isBowSetSlot?' wwm-cmp-bow':''}">
            ${bgIconHtml}
            <h3 class="wwm-cmp-title">現在の装備</h3>
            ${curKongfuHeader}
            ${curSetHeader}
            ${isAffixEditable ? `<div class="wwm-cmp-rows">${renderCurrentRows()}</div>` : ''}
          </div>
          <div class="wwm-cmp-col wwm-cmp-new${isBowSetSlot?' wwm-cmp-bow':''}" id="wwmCmpNewCol">
            ${bgIconHtml}
            <h3 class="wwm-cmp-title">新しい装備</h3>
            ${newKongfuHeader}
            ${newSetHeader}
            ${isAffixEditable ? `<div class="wwm-cmp-rows" id="wwmCmpNewRows">${renderNewRows()}</div>` : ''}
          </div>
        </div>
        <div class="wwm-cmp-preview" id="wwmCmpPreview">
          <span class="wwm-cmp-preview-label">Δ Score:</span>
          <span class="wwm-cmp-preview-value" id="wwmCmpPreviewDelta">計算中...</span>
        </div>
        <div class="wwm-btn-row" style="margin-top:12px;">
          <button class="wwm-btn-primary" id="wwmEditApply">適用 (sidebar反映)</button>
          <button class="wwm-btn-secondary" id="wwmEditReset">元に戻す</button>
          <button class="wwm-btn-secondary" id="wwmEditCancel">キャンセル</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(m);
  m.querySelector('.wwm-modal-close').addEventListener('click', () => m.remove());
  // backdrop クリック閉じ 抑止 (×/キャンセルボタンのみ閉じ)
  m.querySelector('#wwmEditCancel').addEventListener('click', () => m.remove());

  // ── Phase 2: preview Δ Score (debounced) ─────────────────
  let _previewTimer = null;
  function _schedulePreview() {
    if (_previewTimer) clearTimeout(_previewTimer);
    _previewTimer = setTimeout(_runPreview, 250);
  }
  async function _runPreview() {
    const el = m.querySelector('#wwmCmpPreviewDelta');
    if (!el) return;
    if (!window.WWMStats?.buildStatParams || typeof window.computeExpected !== 'function') {
      el.textContent = 'N/A'; return;
    }
    try {
      // 仮想 roleInfo 構築: 他 slot の適用済 virtual を含む effective base から
      const baseRi = _getEffectiveRoleInfo() || origRi;
      const vRi = JSON.parse(JSON.stringify(baseRi));
      if (!vRi.wearEquipsDetailed) vRi.wearEquipsDetailed = {};
      const vEq = JSON.parse(JSON.stringify(origEq));
      vEq.exVo.baseAffixes = newAffixes;
      if (isSetEditable && newSuffix != null) vEq.exVo.suffix = parseInt(newSuffix, 10);
      vRi.wearEquipsDetailed[slot] = vEq;
      if (isWeaponSlot && newKongfuId) {
        if (slot === '1') vRi.kongfuMain = parseInt(newKongfuId, 10);
        else if (slot === '2') vRi.kongfuSub = parseInt(newKongfuId, 10);
      }
      const state = (() => { try { return JSON.parse(localStorage.getItem('wwm_last_state_v1') || 'null'); } catch(_) { return null; } })();
      // virtual compute
      const vParams = await window.WWMStats.buildStatParams(vRi, state);
      window.computeExpected(vParams);
      const vScore = (window.__WWM_LAST_RESULT?.statusScore || 0) + _set4Bonus(vRi);
      // baseline 取得 (現状 effective roleInfo)
      const origParams = window.__WWM_PARAMS;
      const effBaseRi = _getEffectiveRoleInfo() || origRi;
      let baseScore = 0;
      if (origParams) {
        window.computeExpected(origParams);
        baseScore = (window.__WWM_LAST_RESULT?.statusScore || 0) + _set4Bonus(effBaseRi);
      }
      const delta = Math.round(vScore - baseScore);
      const sign = delta > 0 ? '+' : '';
      el.textContent = `${sign}${delta.toLocaleString()} (${Math.round(vScore).toLocaleString()})`;
      el.className = 'wwm-cmp-preview-value ' + (delta > 0 ? 'pos' : delta < 0 ? 'neg' : 'zero');
    } catch (e) {
      console.error('[Preview]', e);
      el.textContent = 'error';
    }
  }

  // セット変更 (新パネル)
  const setSel = m.querySelector('#wwmCmpSetSel');
  if (setSel) {
    setSel.addEventListener('change', () => {
      newSuffix = parseInt(setSel.value, 10);
      const eff = m.querySelector('#wwmCmpSetEffect');
      if (eff) eff.textContent = _setRaw(newSuffix);
      _schedulePreview();
    });
  }

  // kongfu 変更 (新パネル)
  const kfSel = m.querySelector('#wwmCmpKongfuSel');
  if (kfSel) {
    kfSel.addEventListener('change', () => {
      newKongfuId = parseInt(kfSel.value, 10);
      _recalcUseful();
      const rowsEl = m.querySelector('#wwmCmpNewRows');
      if (rowsEl) rowsEl.innerHTML = renderNewRows();
      _bindRowEvents();
      // 新パネル bg icon 更新
      const newIcon = _gearIcon(slot, _virtRi(newKongfuId));
      const bgEl = m.querySelector('#wwmCmpNewCol > .wwm-cmp-bg-icon');
      if (bgEl && newIcon) bgEl.style.backgroundImage = `url('assets/icons/${newIcon}.svg')`;
      _schedulePreview();
    });
  }
  // 初回 preview
  _schedulePreview();

  // 新装備 入力 change
  function _refreshRowUI(row, idx) {
    const d = newAffixes[idx].equipmentDetails;
    const info = window.WWM_AFFIX?.[d[0]];
    const sk = info?.statKey;
    const isPct = _isPctStat(sk);
    const rk = d[3];
    const cls = rk===3?'gold':rk===2?'purple':'blue';
    const sel = row.querySelector('[data-stat-el]');
    if (sel) sel.className = 'wwm-cmp-stat-select wwm-rank-' + cls;
    const usefulEl = row.querySelector('[data-useful-el]');
    if (usefulEl) usefulEl.textContent = d[4] ? '👍' : '';
    const valInp = row.querySelector('.wwm-cmp-val-input');
    if (valInp) {
      valInp.dataset.pct = isPct ? '1' : '0';
      valInp.dataset.pctmul = _pctNeedsMul(sk) ? '1' : '0';
      valInp.step = isPct ? '0.1' : '0.01';
      // max 属性 更新 (equip_max table 優先 / fallback orig val/ratio)
      let maxInt = _getAffixMax(sk, (origRi?.level || 95));
      if (maxInt == null) {
        const origDet2 = origEq.exVo?.baseAffixes?.[idx]?.equipmentDetails;
        const origInfo2 = origDet2?.[0] != null ? window.WWM_AFFIX?.[origDet2[0]] : null;
        if (origInfo2?.statKey === sk && origDet2?.[1] != null && origDet2?.[2] > 0) {
          maxInt = origDet2[1] / origDet2[2];
        }
      }
      const needsMul2 = _pctNeedsMul(sk);
      if (maxInt != null) {
        valInp.max = isPct ? (needsMul2 ? (maxInt*100).toFixed(1) : maxInt.toFixed(1)) : maxInt.toFixed(2);
      } else {
        valInp.removeAttribute('max');
      }
    }
    const unitEl = row.querySelector('[data-unit-el]');
    if (unitEl) unitEl.textContent = isPct ? '%' : '';
  }

  function _bindRowEvents() {
  m.querySelectorAll('.wwm-cmp-edit-row').forEach(row => {
    const idx = parseInt(row.dataset.affixIdx, 10);
    row.querySelectorAll('[data-field]').forEach(el => {
      const evt = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(evt, () => {
        const f = el.dataset.field;
        const d = newAffixes[idx].equipmentDetails;
        if (f === 'stat') {
          const newId = parseInt(el.value, 10);
          d[0] = newId;
          // useful 再判定 (newKongfu 基準)
          d[4] = _isUsefulAffix(newId, _virtRi(newKongfuId));
          // 初期値 = MAX × 0.9 (新 stat の max から)
          const newInfo = window.WWM_AFFIX?.[newId];
          const newSk = newInfo?.statKey;
          const newMax = _getAffixMax(newSk, charLv);
          if (newMax != null) {
            d[1] = newMax * 0.9;
            d[2] = 0.9;
            d[3] = _deriveRank(0.9);
          }
          // 重複ルール反映で全行 再render
          if (idx >= 1 && idx <= 4) {
            const rowsEl = m.querySelector('#wwmCmpNewRows');
            if (rowsEl) {
              rowsEl.innerHTML = renderNewRows();
              _bindRowEvents();
              return;
            }
          }
          _refreshRowUI(row, idx);
          // 値表示単位 切替に伴い input value 再表示
          const newPct = _isPctStat(newSk);
          const newMul = _pctNeedsMul(newSk);
          const inp = row.querySelector('.wwm-cmp-val-input');
          if (inp) inp.value = newPct
            ? (newMul ? (d[1]*100).toFixed(1) : d[1].toFixed(1))
            : (typeof d[1]==='number' ? d[1].toFixed(2).replace(/\.00$/,'') : d[1]);
        } else if (f === 'val') {
          const isPct = el.dataset.pct === '1';
          const needsMul = el.dataset.pctmul === '1';
          const raw = parseFloat(el.value) || 0;
          let internal = (isPct && needsMul) ? raw / 100 : raw;
          const curSk = window.WWM_AFFIX?.[d[0]]?.statKey;
          let max = _getAffixMax(curSk, charLv);
          if (max == null) {
            const origDet = origEq.exVo?.baseAffixes?.[idx]?.equipmentDetails;
            const origInfoVal = origDet?.[0] != null ? window.WWM_AFFIX?.[origDet[0]] : null;
            if (origInfoVal?.statKey === curSk && origDet?.[1] != null && origDet?.[2] > 0) {
              max = origDet[1] / origDet[2];
            }
          }
          // 最大値クランプ (max既知時のみ)
          if (max && max > 0 && internal > max) {
            internal = max;
            const displayMax = (isPct && needsMul) ? (max*100).toFixed(1)
              : (isPct ? max.toFixed(1) : max.toFixed(2).replace(/\.00$/,''));
            el.value = displayMax;
          }
          d[1] = internal;
          if (max && max > 0) {
            d[2] = d[1] / max;
            d[3] = _deriveRank(d[2]);
            _refreshRowUI(row, idx);
          }
        }
        _schedulePreview();
      });
    });
  });
  }
  _bindRowEvents();

  m.querySelector('#wwmEditApply').addEventListener('click', () => {
    if (!window.__WWM_VIRTUAL) window.__WWM_VIRTUAL = {};
    if (!window.__WWM_VIRTUAL_KONGFU) window.__WWM_VIRTUAL_KONGFU = {};
    const vEq = JSON.parse(JSON.stringify(origEq));
    vEq.exVo.baseAffixes = newAffixes;
    if (isSetEditable && newSuffix != null) vEq.exVo.suffix = parseInt(newSuffix, 10);
    window.__WWM_VIRTUAL[slot] = vEq;
    if (isWeaponSlot && newKongfuId && newKongfuId !== origKongfuId) {
      if (slot === '1') window.__WWM_VIRTUAL_KONGFU.kongfuMain = newKongfuId;
      else if (slot === '2') window.__WWM_VIRTUAL_KONGFU.kongfuSub = newKongfuId;
    }
    m.remove();
    _refreshAll();
  });

  m.querySelector('#wwmEditReset').addEventListener('click', () => {
    if (window.__WWM_VIRTUAL) delete window.__WWM_VIRTUAL[slot];
    if (window.__WWM_VIRTUAL_KONGFU) {
      if (slot === '1') delete window.__WWM_VIRTUAL_KONGFU.kongfuMain;
      else if (slot === '2') delete window.__WWM_VIRTUAL_KONGFU.kongfuSub;
    }
    m.remove();
    _refreshAll();
  });
}

// ── Hero block 更新 ────────────────────────────────────────────
function updateHero(params) {
  if (!params || typeof window.computeExpected !== 'function') return;
  const result = window.computeExpected(params) || window.__WWM_LAST_RESULT || {};
  const total = result.expected || 0;
  const effRi = _getEffectiveRoleInfo();
  const statusScore = Math.round((result.statusScore || 0) + _set4Bonus(effRi));
  const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setText('heroExpected', Math.round(total).toLocaleString());
  setText('hbExp', Math.round(total).toLocaleString());
  // countUp 経由 (calc.js calculate() の countUp 上書き 上書し直し)
  if (typeof window.countUp === 'function') {
    window.countUp('heroScore', statusScore, 0);
    window.countUp('heroCompactScore', statusScore, 0);
  } else {
    setText('heroScore', statusScore.toLocaleString());
    setText('heroCompactScore', statusScore.toLocaleString());
  }
  // current tier badge (compute 由来 tier 反映 — calc.js DOM 由来上書き 修正)
  const wl2 = effRi?.worldLv || 14;
  const thr2 = 6700 * Math.pow(0.8, 14 - wl2);
  const curTier = statusScore >= thr2 ? 'SS'
                : statusScore >= thr2*0.9 ? 'S'
                : statusScore >= thr2*0.8 ? 'A'
                : statusScore >= thr2*0.6 ? 'B' : 'C';
  const tbCur = document.getElementById('heroTierBadge');
  if (tbCur) { tbCur.textContent = curTier; tbCur.className = 'tier-badge tier-' + curTier; }
  // tier に応じたスコア色
  const TIER_COLOR = { SS: '#ffd970', S: '#ff6b50', A: '#a8d4b4', B: '#c9b88a', C: 'rgba(232,215,180,0.55)' };
  const TIER_SHADOW = {
    SS: '0 0 12px rgba(255,217,112,0.95), 0 0 28px rgba(255,180,40,0.7), 0 0 60px rgba(255,100,20,0.55), 0 0 100px rgba(200,60,43,0.4)',
    S:  '0 0 18px rgba(255,107,80,0.55), 0 0 36px rgba(255,107,80,0.28)',
    A:  '0 0 18px rgba(168,212,180,0.45), 0 0 36px rgba(168,212,180,0.25)',
    B:  '0 0 14px rgba(201,184,138,0.45), 0 0 28px rgba(201,184,138,0.22)',
    C:  '0 0 10px rgba(232,215,180,0.18)'
  };
  const numEl = document.getElementById('heroScore');
  if (numEl && TIER_COLOR[curTier]) {
    numEl.style.color = TIER_COLOR[curTier];
    numEl.style.textShadow = TIER_SHADOW[curTier];
  }
  // compact tier badge: 廃止 (heroCompactTierBadge hidden)
  setText('heroCompactDmg', Math.round(total).toLocaleString());
  setText('heroCompactExp', Math.round(total).toLocaleString());
  // baseline 表示 (Δ は廃止、baseline ▶ current で視覚化)
  const baseline = window.__WWM_BASELINE;
  const baseEl = document.getElementById('heroScoreBaseline');
  if (baseline && typeof baseline.statusScore === 'number') {
    const baseScore = Math.round(baseline.statusScore);
    if (baseEl) baseEl.textContent = baseScore.toLocaleString();
    // baseline tier badge (tier 未保存 baseline 用 fallback)
    const blTb = document.getElementById('heroBaselineTierBadge');
    if (blTb) {
      let bTier = baseline.tier;
      if (!bTier) {
        const wl = window.__WWM_ROLEINFO?.worldLv || 14;
        const thr = 6700 * Math.pow(0.8, 14 - wl);
        bTier = baseScore >= thr ? 'SS'
              : baseScore >= thr * 0.9 ? 'S'
              : baseScore >= thr * 0.8 ? 'A'
              : baseScore >= thr * 0.6 ? 'B' : 'C';
      }
      blTb.textContent = bTier;
      blTb.className = 'tier-badge tier-badge-baseline tier-' + bTier;
      const TIER_COLOR_B = { SS: '#ffd970', S: '#ff6b50', A: '#a8d4b4', B: '#c9b88a', C: 'rgba(232,215,180,0.55)' };
      const TIER_SHADOW_B = {
        SS: '0 0 12px rgba(255,217,112,0.95), 0 0 28px rgba(255,180,40,0.7), 0 0 60px rgba(255,100,20,0.55), 0 0 100px rgba(200,60,43,0.4)',
        S:  '0 0 18px rgba(255,107,80,0.55), 0 0 36px rgba(255,107,80,0.28)',
        A:  '0 0 18px rgba(168,212,180,0.45), 0 0 36px rgba(168,212,180,0.25)',
        B:  '0 0 14px rgba(201,184,138,0.45), 0 0 28px rgba(201,184,138,0.22)',
        C:  '0 0 10px rgba(232,215,180,0.18)'
      };
      if (baseEl && TIER_COLOR_B[bTier]) {
        baseEl.style.color = TIER_COLOR_B[bTier];
        baseEl.style.opacity = '1';
        baseEl.style.textShadow = TIER_SHADOW_B[bTier];
      }
    }
  } else {
    if (baseEl) baseEl.textContent = statusScore.toLocaleString();
  }
}

// Header/Footer 実高さ → CSS 変数で sidebar top/bottom 動的調整
function _syncLayoutVars() {
  const header = document.querySelector('.sticky-header');
  const footer = document.querySelector('.wwm-footer');
  if (header) document.documentElement.style.setProperty('--wwm-header-h', header.offsetHeight + 'px');
  if (footer) document.documentElement.style.setProperty('--wwm-footer-h', footer.offsetHeight + 'px');
  // sidebar height = footer top - hero top (上下スペース 完全一致)
  const hero = document.querySelector('section.hero');
  const sidebar = document.querySelector('.wwm-sidebar-test');
  if (hero && footer && sidebar) {
    const heroTop = hero.getBoundingClientRect().top;
    const footerTop = footer.getBoundingClientRect().top;
    const padBottom = parseFloat(getComputedStyle(document.querySelector('.wwm-app-body') || sidebar.parentElement).paddingBottom) || 0;
    const height = footerTop - heroTop - padBottom;
    if (height > 100) {
      sidebar.style.height = height + 'px';
      sidebar.style.maxHeight = height + 'px';
    }
  }
}
window.addEventListener('resize', _syncLayoutVars);
window.addEventListener('DOMContentLoaded', _syncLayoutVars);
window.addEventListener('load', _syncLayoutVars);
setTimeout(_syncLayoutVars, 100);
setTimeout(_syncLayoutVars, 500);
// ResizeObserver は loop の原因になるので無効化 (sidebar は固定 calc 値で対応)

// ── 未対応データ検知 + 報告 ─────────────────────────────────
function _detectUnknown(roleInfo) {
  const unknown = { kongfu: [], xinfa: [], affix: [] };
  if (!roleInfo) return unknown;
  for (const kid of [roleInfo.kongfuMain, roleInfo.kongfuSub]) {
    if (kid && !window.WWM_KONGFU?.[kid]) unknown.kongfu.push(kid);
  }
  for (const xid of (roleInfo.passiveSlots || [])) {
    if (xid && !window.WWM_XINFA?.[xid]) unknown.xinfa.push(xid);
  }
  const seen = new Set();
  for (const eq of Object.values(roleInfo.wearEquipsDetailed || {})) {
    for (const aff of (eq?.exVo?.baseAffixes || [])) {
      const id = aff?.equipmentDetails?.[0];
      if (id && !seen.has(id)) {
        seen.add(id);
        if (!window.WWM_AFFIX?.[id]) unknown.affix.push(id);
      }
    }
  }
  return unknown;
}

function openUnknownReport() {
  const ri = window.__WWM_ROLEINFO;
  if (!ri) return;
  const u = _detectUnknown(ri);
  const total = u.kongfu.length + u.xinfa.length + u.affix.length;
  if (!total) { alert('未対応データなし'); return; }
  // 報告用 snippet 生成
  const lines = ['## 未対応 ID 報告', ''];
  if (u.kongfu.length) {
    lines.push('### 武術 (kongfu) ' + u.kongfu.length + '件');
    for (const id of u.kongfu) {
      const slot = ri.kongfuMain === id ? '主' : (ri.kongfuSub === id ? '副' : '');
      lines.push(`- ID: ${id} (${slot})`);
    }
    lines.push('');
  }
  if (u.xinfa.length) {
    lines.push('### 心法 (xinfa) ' + u.xinfa.length + '件');
    for (const id of u.xinfa) lines.push(`- ID: ${id}`);
    lines.push('');
  }
  if (u.affix.length) {
    lines.push('### 装備 affix ' + u.affix.length + '件');
    const valSample = {};
    for (const eq of Object.values(ri.wearEquipsDetailed || {})) {
      for (const aff of (eq?.exVo?.baseAffixes || [])) {
        const d = aff?.equipmentDetails;
        if (d && u.affix.includes(d[0]) && !valSample[d[0]]) valSample[d[0]] = d;
      }
    }
    for (const id of u.affix) {
      const v = valSample[id];
      lines.push(`- ID: ${id}` + (v ? ` (val=${v[1]}, rank=${v[3]})` : ''));
    }
    lines.push('');
  }
  lines.push('### キャラ情報');
  lines.push(`- Lv: ${ri.level}, school: ${ri.school}, kongfuMain: ${ri.kongfuMain}, kongfuSub: ${ri.kongfuSub}`);
  lines.push('');
  lines.push('### 補足情報 (画像/詳細などあれば追記)');
  lines.push('');
  const body = lines.join('\n');
  const githubUrl = 'https://github.com/Sh1get0ra/WWM-DMGCALC/issues/new?title=' +
    encodeURIComponent('[Data] 未対応ID報告 (kongfu/xinfa/affix)') +
    '&body=' + encodeURIComponent(body);

  // Modal表示
  const m = document.createElement('div');
  m.className = 'wwm-modal-backdrop';
  m.innerHTML = `
    <div class="wwm-modal">
      <div class="wwm-modal-header">
        <h2>未対応データ報告 (${total}件)</h2>
        <button class="wwm-modal-close" aria-label="Close">×</button>
      </div>
      <div class="wwm-modal-body">
        <p>以下の内容をクリップボードコピー or GitHub Issue で報告してください。</p>
        <textarea class="wwm-bm-code" readonly style="min-height:200px;">${body.replace(/</g,'&lt;')}</textarea>
        <div class="wwm-btn-row" style="margin-top:12px;">
          <button class="wwm-btn-primary" id="wwmCopyReport">クリップボードにコピー</button>
          <a class="wwm-btn-secondary" href="${githubUrl}" target="_blank" rel="noopener">GitHub Issue を開く</a>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(m);
  m.querySelector('.wwm-modal-close').addEventListener('click', () => m.remove());
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });
  m.querySelector('#wwmCopyReport').addEventListener('click', (e) => {
    const ta = m.querySelector('textarea');
    ta.select(); ta.setSelectionRange(0, 99999);
    let ok = false; try { ok = document.execCommand('copy'); } catch(_){}
    if (navigator.clipboard) navigator.clipboard.writeText(body).then(() => { e.target.textContent = 'コピー完了 ✓'; }).catch(()=>{});
    else if (ok) { e.target.textContent = 'コピー完了 ✓'; }
  });
}

window.WWMSidebar = {
  render: renderSidebar,
  refresh: () => _CURRENT_PARAMS && renderSidebar(_CURRENT_PARAMS),
  syncLayout: _syncLayoutVars,
  openUnknownReport
};
window.WWMGear = {
  render: renderGearGrid,
  openEdit: openGearEdit
};
window.WWMXinfa = {
  render: renderXinfaGrid,
  openEdit: openXinfaEdit
};
window.WWMHero = {
  update: updateHero
};
