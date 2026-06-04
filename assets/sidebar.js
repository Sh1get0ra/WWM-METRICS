// ── WWM-METRICS Sidebar ─────────────────────────────────────────

// ── Phase 3.2 切出 alias: assets/sidebar/anlz.js ─
const {
  render: renderSidebar,
  getCurrentParams: _getCurrentParams,
  setCurrentParams: _setCurrentParams,
  curLang: _curLang,
  fmt: _fmt,
  label: _label,
  detectUnknown: _detectUnknown,
  loadConfig: _loadConfig,
} = window.WWMSidebar.anlz;

// ── Phase 3.1 切出 alias: assets/sidebar/modal-helpers.js ─
const {
  setupModalA11y: _setupModalA11y,
  showNoteModal: _showNoteModal,
  showScoreFormula: _showScoreFormula,
  showAllChangelogs: _showAllChangelogs,
  optionTerm: _optionTerm,
  tpl: _tpl,
} = window.WWMSidebar.modalHelpers;
const _checkChangelog = window.WWMChangelog.check;

// ── Phase 3.1b 切出 alias: assets/sidebar/affix-utils.js ─
const {
  affixDisplayName: _affixDisplayName,
  matchKongfuSpecific: _matchKongfuSpecific,
  isUsefulAffix: _isUsefulAffix,
  isPctStat: _isPctStat,
  pctNeedsMul: _pctNeedsMul,
  fmtAffixVal: _fmtAffixVal,
  lvToTier: _lvToTier,
  loadEquipMax: _loadEquipMax,
  getCachedEquipMax: _getCachedEquipMax,
  getAffixMax: _getAffixMax,
  isAffixAllowedInSlot: _isAffixAllowedInSlot,
  isAffixAllowedAtIdx0: _isAffixAllowedAtIdx0,
  isWeaponDmgMatch: _isWeaponDmgMatch,
  getAffixOptions: _getAffixOptions,
  PVP_AFFIX_SENTINEL: _PVP_AFFIX_SENTINEL,
  SLOT6_ARMOR: _SLOT6_ARMOR,
  SLOT6_WEAPON_LIKE: _SLOT6_WEAPON_LIKE,
  SLOT6_PEN_STATS: _SLOT6_PEN_STATS,
  STAT_TO_MAX_KEY: _STAT_TO_MAX_KEY,
} = window.WWMSidebar.affix;

// ── Phase 3.1c 切出 alias: assets/sidebar/icon-resolvers.js ─
const {
  slotLabelI18n: _slotLabelI18n,
  gearIconResolve: _gearIconResolve,
  kongfuLiupaiResolve: _kongfuLiupaiResolve,
  liupaiPinyinFromUrl: _liupaiPinyinFromUrl,
  liupaiUrlById: _liupaiUrlById,
  arsenalLiupaiResolve: _arsenalLiupaiResolve,
  setLiupaiResolve: _setLiupaiResolve,
  GEAR_SLOT_LABELS: _GEAR_SLOT_LABELS,
  GEAR_RAIL_ZH: _GEAR_RAIL_ZH,
} = window.WWMSidebar.icons;

// ── Phase 3.6 切出 alias: assets/sidebar/gear.js ─
// sidebar.js 残部 (ranking / xinfa / arsenal / share callback) からの参照用 arrow wrapper
const _scoreWithBonus = (ri) => window.__WWM_SCORE_WITH_BONUS(ri);
const _set4Bonus      = (ri) => window.__WWM_SET4_BONUS_OF(ri);

// ratio (0-1) → CSS変数色 (styles.css --ratio-* に対応)
function _ratioColor(r) {
  if (r == null) return 'var(--paper-mute)';
  if (r >= 0.9)  return 'var(--ratio-excellent)';
  if (r >= 0.75) return 'var(--ratio-good)';
  if (r >= 0.6)  return 'var(--ratio-ok)';
  if (r >= 0.4)  return 'var(--ratio-warn)';
  return 'var(--ratio-bad)';
}

// (Phase 3.1: modal a11y / changelog / NOTE modal は assets/sidebar/modal-helpers.js に切出)
function _resetAllVirtuals() {
  const hasV = (WWMState.virtual.gear && Object.keys(WWMState.virtual.gear).length)
            || (WWMState.virtual.kongfu && Object.keys(WWMState.virtual.kongfu).length)
            || (WWMState.virtual.xinfa && ((WWMState.virtual.xinfa.passive&&WWMState.virtual.xinfa.passive.length) || Object.keys(WWMState.virtual.xinfa.tiers||{}).length))
            || WWMState.virtual.arsenal;
  if (!hasV) { alert('リセット対象なし'); return; }
  if (!confirm('新装備/心法/武術/武庫 全てを現装備値に戻す。よろしい?')) return;
  WWMState.virtual.gear = {};
  WWMState.virtual.kongfu = {};
  WWMState.virtual.xinfa = null;
  WWMState.virtual.arsenal = null;
  try { localStorage.removeItem('wwm_virtual_v1'); } catch(_) {}
  if (typeof window._refreshAll === 'function') window._refreshAll();
}
window.WWMHelp = window.WWMHelp || {};
window.WWMHelp.resetAllVirtuals = _resetAllVirtuals;

// ── 弱点指摘 / Diagnostics ──────────────────────────────────────
// (Phase 3.3: assets/sidebar/diag.js に切出 — _diagnose / _evalPenSpecialization /
//             _checkAffix6PenMismatch / _findWastedAffixes / _updateDiagBadge /
//             _openDiagPopup / renderDiagnostics / window.WWMDiag)
// _scoreWithBonus は line ~1100 で定義、 直後で window.__WWM_SCORE_WITH_BONUS expose

// ── Affix 期待値ランキング (各 stat の score 寄与 Top) ────────────
async function renderAffixRanking(roleInfo, params) {
  const root = document.getElementById('wwmAffixRanking');
  if (!root || !roleInfo || !window.WWMStats?.buildStatParams) return;
  const state = WWMHelpers.storage.loadJSON('wwm_last_state_v1');
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
  const maxTbl = _getCachedEquipMax()?.tiers?.[tier] || {};
  const PATH_PEN = { bellstrike:'bellstrikePen', stonesplit:'stonesplitPen', silkbind:'silkbindPen', bamboocut:'bamboocutPen', voidPath:'voidPen' };
  const path = window.WWM_KONGFU?.[roleInfo?.kongfuMain]?.path;
  const PATH_MAP = { bellstrike:['minBellstrike','maxBellstrike'], stonesplit:['minStonesplit','maxStonesplit'],
                     silkbind:['minSilkbind','maxSilkbind'], bamboocut:['minBamboocut','maxBamboocut'],
                     voidPath:['minVoid','maxVoid'] };
  const pathKeys = PATH_MAP[path] || [];
  const activePathPen = PATH_PEN[path];
  const SL = window._AFFIX_DISPLAY_LABELS || {};
  // 装備オプションに出るもののみ評価対象 (compute が読む key にマップ)
  const targets = [
    { key: 'minPhysATK', delta: maxTbl.maxPhys, label: `${SL.minPhys||'最小外功攻撃'} +${maxTbl.maxPhys?.toFixed(1)}` },
    { key: 'maxPhysATK', delta: maxTbl.maxPhys, label: `${SL.maxPhys||'最大外功攻撃'} +${maxTbl.maxPhys?.toFixed(1)}` },
    pathKeys[0] && { key: 'minElemMain', delta: maxTbl.pathSingle, label: `${SL[pathKeys[0]]||pathKeys[0]} +${maxTbl.pathSingle?.toFixed(1)}` },
    pathKeys[1] && { key: 'maxElemMain', delta: maxTbl.pathSingle, label: `${SL[pathKeys[1]]||pathKeys[1]} +${maxTbl.pathSingle?.toFixed(1)}` },
    { key: 'minElemSub', delta: maxTbl.pathSingle, label: `${(window.T&&T.minElemSub)||'最小属性攻撃(副)'} +${maxTbl.pathSingle?.toFixed(1)}` },
    { key: 'maxElemSub', delta: maxTbl.pathSingle, label: `${(window.T&&T.maxElemSub)||'最大属性攻撃(副)'} +${maxTbl.pathSingle?.toFixed(1)}` },
    { key: 'critRate',     delta: maxTbl.crit,     label: `${SL.crit||'会心率'} +${((maxTbl.crit||0)*100).toFixed(1)}%` },
    { key: 'sympathyRate', delta: maxTbl.affinity, label: `${SL.affinity||'会意率'} +${((maxTbl.affinity||0)*100).toFixed(1)}%` },
    { key: 'hitRate',      delta: maxTbl.precision, label: `${SL.precision||'命中率'} +${((maxTbl.precision||0)*100).toFixed(1)}%` },
    { key: 'outerPen',     delta: maxTbl.outerPen, label: `${(window.T&&T.penPhys)||'外功貫通'} +${maxTbl.outerPen}` },
    { key: 'elemPen',      delta: maxTbl.attrPen,  label: `${(window.T&&T.penVoid)||'無相貫通'} +${maxTbl.attrPen}` },
    { key: '_power',  delta: maxTbl.stat5, label: `${SL.power||'力'} +${maxTbl.stat5?.toFixed(1)}`, statKey: 'power' },
    { key: '_agility',   delta: maxTbl.stat5, label: `${SL.agility||'速'} +${maxTbl.stat5?.toFixed(1)}`, statKey: 'agility' },
    { key: '_momentum',     delta: maxTbl.stat5, label: `${SL.momentum||'会'} +${maxTbl.stat5?.toFixed(1)}`, statKey: 'momentum' },
    { key: 'stMysticDmg',  delta: maxTbl.mysticDmg, label: `${SL.stMysticDmg||'奇術ダメ'} +${((maxTbl.mysticDmg||0)*100).toFixed(1)}%` },
    { key: 'allMartialBoost', delta: maxTbl.allWeaponDmg, label: `${SL.allWeaponDmg||'全武学効果'} +${((maxTbl.allWeaponDmg||0)*100).toFixed(1)}%` }
  ].filter(t => t && t.delta != null && t.delta > 0);
  // 並列で全 simulate (DOM更新 silent化 でチラつき抑制)
  window._SILENT_COMPUTE = true;
  const results = [];
  for (const t of targets) {
    try {
      let p2;
      if (t.statKey) {
        // 5行ステ → roleInfo override で buildStatParams再呼出 (武術 derived cap適用)
        const base5 = window.WWM_LV95_BASE?.stats?.[t.statKey] || 129;
        const riPatched = JSON.parse(JSON.stringify(roleInfo));
        riPatched[t.statKey] = (riPatched[t.statKey] || base5) + t.delta;
        p2 = await window.WWMStats.buildStatParams(riPatched, state);
      } else {
        p2 = await window.WWMStats.buildStatParams(roleInfo, state);
        p2[t.key] = (p2[t.key] || 0) + t.delta;
      }
      window.computeExpected(p2);
      const newScore = (WWMState.lastResult?.statusScore || 0) + _set4Bonus(roleInfo);
      results.push({ label: t.label, delta: newScore - baseScore });
    } catch (e) {}
  }
  window._SILENT_COMPUTE = false;
  results.sort((a, b) => b.delta - a.delta);
  const top = results;
  const rows = top.map((r, i) => `
    <div class="wwm-rank-row">
      <span class="wwm-rank-pos">${i+1}</span>
      <span class="wwm-rank-label">${r.label}</span>
      <span class="wwm-rank-delta">+${r.delta.toFixed(1)}</span>
    </div>
  `).join('');
  // 効率分析: 各 target を input可能化、 入力値から Δ即時再計算
  const _STAT_META = {
    'minPhysATK':       { lbl: SL.minPhys || '最小外功攻撃',        pct: false, step: '0.1' },
    'maxPhysATK':       { lbl: SL.maxPhys || '最大外功攻撃',        pct: false, step: '0.1' },
    'minElemMain':      { lbl: pathKeys[0] ? (SL[pathKeys[0]] || pathKeys[0]) : '最小属性ATK', pct: false, step: '0.1' },
    'maxElemMain':      { lbl: pathKeys[1] ? (SL[pathKeys[1]] || pathKeys[1]) : '最大属性ATK', pct: false, step: '0.1' },
    'minElemSub':       { lbl: (window.T && T.minElemSub) || '最小属性攻撃(副)', pct: false, step: '0.1' },
    'maxElemSub':       { lbl: (window.T && T.maxElemSub) || '最大属性攻撃(副)', pct: false, step: '0.1' },
    'critRate':         { lbl: SL.crit || '会心率',           pct: true,  step: '0.1' },
    'sympathyRate':     { lbl: SL.affinity || '会意率',       pct: true,  step: '0.1' },
    'hitRate':          { lbl: SL.precision || '命中率',      pct: true,  step: '0.1' },
    'outerPen':         { lbl: (window.T && T.penPhys) || '外功貫通',  pct: false, step: '0.1' },
    'elemPen':          { lbl: (window.T && T.penVoid) || '無相貫通',  pct: false, step: '0.1' },
    '_power':        { lbl: SL.power || '力',           pct: false, step: '1' },
    '_agility':         { lbl: SL.agility || '速',            pct: false, step: '1' },
    '_momentum':           { lbl: SL.momentum || '会',              pct: false, step: '1' },
    'stMysticDmg':      { lbl: SL.stMysticDmg || '奇術ダメ',  pct: true,  step: '0.1' },
    'allMartialBoost':  { lbl: SL.allWeaponDmg || '全武学効果', pct: true, step: '0.1' }
  };
  const effRows = targets.map(t => {
    const meta = _STAT_META[t.key] || { lbl: t.key, pct: false, step: '0.1' };
    const dispVal = meta.pct ? ((t.delta || 0) * 100).toFixed(1) : (t.delta || 0).toFixed(1);
    const r0 = results.find(r => r.label === t.label);
    return `
      <div class="wwm-eff-row" data-eff-key="${t.key}">
        <span class="wwm-eff-label">${meta.lbl}</span>
        <span class="wwm-eff-input-wrap">
          <input class="wwm-eff-input" type="number" step="${meta.step}" value="${dispVal}" data-key="${t.key}" data-pct="${meta.pct?'1':'0'}"${t.statKey?` data-statkey="${t.statKey}"`:''}>${meta.pct?'<span class="wwm-eff-pct">%</span>':''}
        </span>
        <span class="wwm-eff-delta" data-delta-for="${t.key}">+${(r0?.delta || 0).toFixed(1)}</span>
      </div>
    `;
  }).join('');
  root.innerHTML = `
    <div class="wwm-analysis-card wwm-modal-square wwm-rank-grid">
      <div class="wwm-modal-bg-icon" style="background-image:url('assets/icons/scales.svg');"></div>
      <div class="wwm-rank-col">
        <div class="wwm-analysis-header"><h3>${(window.T&&T.affixRankingTitle)||'調律/定音期待値ランキング'}</h3></div>
        <div class="wwm-rank-body">${rows}</div>
      </div>
      <div class="wwm-eff-col">
        <div class="wwm-analysis-header"><h3>${(window.T&&T.effAnalysisTitle)||'ステータス効率分析'}</h3></div>
        <div class="wwm-eff-body">${effRows}</div>
      </div>
    </div>
  `;
  // input change → 該当 stat patch → ΔScore更新 (debounce 250ms)
  const _effDebounce = {};
  root.querySelectorAll('.wwm-eff-input').forEach(inp => {
    inp.addEventListener('input', () => {
      const k = inp.dataset.key;
      if (_effDebounce[k]) clearTimeout(_effDebounce[k]);
      _effDebounce[k] = setTimeout(async () => {
        const raw = parseFloat(inp.value);
        if (isNaN(raw)) return;
        const isPct = inp.dataset.pct === '1';
        const delta = isPct ? raw / 100 : raw;
        const statKey = inp.dataset.statkey || null;
        try {
          window._SILENT_COMPUTE = true;
          let p2;
          if (statKey) {
            const base5 = window.WWM_LV95_BASE?.stats?.[statKey] || 129;
            const riPatched = JSON.parse(JSON.stringify(roleInfo));
            riPatched[statKey] = (riPatched[statKey] || base5) + delta;
            p2 = await window.WWMStats.buildStatParams(riPatched, state);
          } else {
            p2 = await window.WWMStats.buildStatParams(roleInfo, state);
            p2[k] = (p2[k] || 0) + delta;
          }
          window.computeExpected(p2);
          const newScore = (WWMState.lastResult?.statusScore || 0) + _set4Bonus(roleInfo);
          const dEl = root.querySelector(`[data-delta-for="${k}"]`);
          if (dEl) dEl.textContent = `+${(newScore - baseScore).toFixed(1)}`;
          // 復元 (base params で 1回再計算 → DOM正常化)
          window._SILENT_COMPUTE = false;
          if (WWMState.params) window.computeExpected(WWMState.params);
        } catch(e) { window._SILENT_COMPUTE = false; }
      }, 250);
    });
  });
  // 復元
  try {
    const p3 = await window.WWMStats.buildStatParams(roleInfo, state);
    window.computeExpected(p3);
  } catch (e) {}
}
window.WWMRanking = { render: renderAffixRanking };

// ── 装備最適化提案 (Greedy 全体最適化) ────────────────────────
// (Phase 3.4: assets/sidebar/opt.js に切出 — renderOptimization /
//             _renderOptimizationInner / _OPT_resortRows /
//             _exportOptSteps / _applyOptSteps / window.WWMOpt)
// (本体は assets/sidebar/opt.js)

// ── Build Sharing URL ──────────────────────────────────────────
// (Phase 3.5: assets/sidebar/share.js に切出 — _shareBuildUrl /
//             _loadSharedBuild / window.WWMShare)
// (本体は assets/sidebar/share.js)
// 起動時 1回 checks
if (!document.documentElement.classList.contains('wwm-view-sidebar')) {
  setTimeout(_checkChangelog, 500);
}

// (Phase 3.2: 分析タブ render は assets/sidebar/anlz.js に切出)

// ── Gear Grid (main 下部) ───────────────────────────────────────
// (Phase 3.6: assets/sidebar/gear.js に切出 — _GEAR_SLOT_ORDER /
//             renderGearGrid / _SET4_BONUS / _isOffensiveSet /
//             _set4Bonus / _scoreWithBonus / _computeSlotContributions /
//             _computeGearCardScores / openGearEdit / window.WWMGear)
// (本体は assets/sidebar/gear.js)

// ── Xinfa Grid (心法パネル) ─────────────────────────────────
// (Phase 3.7: assets/sidebar/xinfa.js に切出 — renderXinfaGrid /
//             _computeArsenalCardScore / _computeXinfaCardScores /
//             openXinfaEdit / window.WWMXinfa)
// (本体は assets/sidebar/xinfa.js)
// (本体は assets/sidebar/xinfa.js)

// ── Virtual gear state (Edit modal適用結果) ─────────────────────
function _getEffectiveRoleInfo() {
  const orig = WWMState.roleInfo;
  if (!orig) return null;
  const vmap = WWMState.virtual.gear || {};
  const vkf = WWMState.virtual.kongfu || {};
  const vxi = WWMState.virtual.xinfa;
  const hasVxiPassive = vxi?.passive && vxi.passive.length;
  if (!Object.keys(vmap).length && !Object.keys(vkf).length && !hasVxiPassive) return orig;
  const merged = { ...orig, wearEquipsDetailed: { ...(orig.wearEquipsDetailed || {}) } };
  for (const [slot, vEq] of Object.entries(vmap)) {
    if (vEq) merged.wearEquipsDetailed[slot] = vEq;
  }
  if (vkf.kongfuMain) merged.kongfuMain = vkf.kongfuMain;
  if (vkf.kongfuSub) merged.kongfuSub = vkf.kongfuSub;
  // xinfa virtual (vxi は上で取得済)
  if (vxi?.passive) merged.passiveSlots = [...vxi.passive];
  return merged;
}
// effective state (xinfa tier virtual + arsenal virtual 込み)
function _getEffectiveState() {
  const base = WWMHelpers.storage.loadJSON('wwm_last_state_v1');
  const vxi = WWMState.virtual.xinfa;
  const vAr = WWMState.virtual.arsenal;
  const hasVxi = vxi?.tiers && Object.keys(vxi.tiers).length;
  if (!hasVxi && !vAr) return base;
  const merged = JSON.parse(JSON.stringify(base || {}));
  if (hasVxi) {
    if (!merged.xinfaTiers) merged.xinfaTiers = {};
    for (const [k, v] of Object.entries(vxi.tiers)) {
      merged.xinfaTiers[k] = v;
      merged.xinfaTiers[String(k)] = v;
    }
  }
  if (vAr) merged.arsenal = JSON.parse(JSON.stringify(vAr));
  return merged;
}
window.__WWM_GET_EFFECTIVE_ROLEINFO = _getEffectiveRoleInfo;

function _autoFitText(root) {
  (root || document).querySelectorAll('.wwm-equip-setname, .wwm-equip-kongfu, .wwm-xinfa-header b').forEach(el => {
    const len = (el.textContent || '').trim().length;
    if (len > 22) el.style.fontSize = '0.7em';
    else if (len > 16) el.style.fontSize = '0.82em';
    else if (len > 12) el.style.fontSize = '0.92em';
    else el.style.fontSize = '';
  });
}
window._autoFitText = _autoFitText;

// ── virtual装備 永続化 (gear/kongfu/xinfa) ───────────────────
const _VIRTUAL_KEY = 'wwm_virtual_v1';
function _saveVirtuals() {
  try {
    const data = {
      gear:    WWMState.virtual.gear || null,
      kongfu:  WWMState.virtual.kongfu || null,
      xinfa:   WWMState.virtual.xinfa || null,
      arsenal: WWMState.virtual.arsenal || null
    };
    const empty = (!data.gear || !Object.keys(data.gear).length)
               && (!data.kongfu || !Object.keys(data.kongfu).length)
               && (!data.xinfa || (!(data.xinfa.passive&&data.xinfa.passive.length) && !Object.keys(data.xinfa.tiers||{}).length))
               && (!data.arsenal);
    if (empty) localStorage.removeItem(_VIRTUAL_KEY);
    else localStorage.setItem(_VIRTUAL_KEY, JSON.stringify(data));
  } catch(_) {}
}
function _loadVirtuals() {
  try {
    const raw = localStorage.getItem(_VIRTUAL_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (d.gear)    WWMState.virtual.gear = d.gear;
    if (d.kongfu)  WWMState.virtual.kongfu = d.kongfu;
    if (d.xinfa)   WWMState.virtual.xinfa = d.xinfa;
    if (d.arsenal) WWMState.virtual.arsenal = d.arsenal;
  } catch(_) {}
}
window._saveVirtuals = _saveVirtuals;
window._loadVirtuals = _loadVirtuals;
_loadVirtuals();

function _refreshAll() {
  const ri = _getEffectiveRoleInfo();
  if (!ri) return;
  const state = _getEffectiveState();
  if (window.WWMStats) {
    window.WWMStats.buildStatParams(ri, state).then(async params => {
      WWMState.params = params;
      await window.WWMSidebar.render(params);
      // donut/hero を最適化前に先行反映 (opt前なので通常更新)
      if (window.WWMHero) window.WWMHero.update(params);
      window.WWMGear.render(ri);
      if (window.WWMXinfa) window.WWMXinfa.render(ri);
      if (window.WWMDiag) window.WWMDiag.render(ri, params);
      if (window.WWMRanking) window.WWMRanking.render(ri, params);
      _autoFitText();
      _saveVirtuals();
      // 重い最適化(数秒)は await せず 2フレーム後に遅延起動 (初期描画を阻害しない)。
      if (window.WWMOpt) {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          window.WWMOpt.render(ri, params)
            .then(() => _autoFitText())
            .catch(e => console.error('[WWM] opt failed:', e));
        }));
      }
    }).catch(e => console.error('[WWM] refresh failed:', e));
  }
}

// (Phase 3.1b: affix helpers / lookup table は assets/sidebar/affix-utils.js に切出)
// (Phase 3.6: openGearEdit は assets/sidebar/gear.js に切出)
// (本体は assets/sidebar/gear.js)

// ── Tier badge ルーレット (opt中の演出、 sidebar mini-hero + heroパネル 両対応) ─────
let _tierRouletteIntv = null;
const _ROULETTE_GLYPHS = [
  'SS','S','A','B','C',
  '★','◆','◇','▲','▼','●','■',
  '%','&','*','#','@','?','+','×','⚡','✦','✧','♠','♣'
];
function _startTierRoulette() {
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
function _stopTierRoulette() {
  if (_tierRouletteIntv) { clearInterval(_tierRouletteIntv); _tierRouletteIntv = null; }
  const sbTb   = document.getElementById('wwmSbTierBadge');
  const heroTb = document.getElementById('heroTierBadge');
  if (sbTb)   sbTb.classList.remove('tier-rolling');
  if (heroTb) heroTb.classList.remove('tier-rolling');
}

// ── Hero block 更新 ────────────────────────────────────────────
function updateHero(params) {
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
// (Phase 3.2: _detectUnknown は assets/sidebar/anlz.js に切出)

function openUnknownReport() {
  const ri = WWMState.roleInfo;
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
  const githubUrl = 'https://github.com/Sh1get0ra/WWM-METRICS/issues/new?title=' +
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
  refresh: () => { const p = _getCurrentParams(); return p && renderSidebar(p); },
  syncLayout: _syncLayoutVars,
  openUnknownReport
};
// (Phase 3.6: window.WWMGear は assets/sidebar/gear.js 内で expose 済)
// (Phase 3.7: window.WWMXinfa は assets/sidebar/xinfa.js 内で expose 済)
function openArsenalEdit() {
  const T_ = window.T || {};
  const state = WWMHelpers.storage.loadJSON('wwm_last_state_v1');
  const origArsenal = state?.arsenal || { path: 'phys', tiers: {} };
  const virtArsenal = WWMState.virtual.arsenal;
  // 新側 初期値 = virtual あれば virtual、なければ orig コピー
  const newArsenal = virtArsenal
    ? JSON.parse(JSON.stringify(virtArsenal))
    : JSON.parse(JSON.stringify(origArsenal));
  const PATHS = [
    { key: 'phys',       labelKey: 'pathPhys',       minStat: 'minPhys',       maxStat: 'maxPhys' },
    { key: 'bellstrike', labelKey: 'pathBellstrike', minStat: 'minBellstrike', maxStat: 'maxBellstrike' },
    { key: 'stonesplit', labelKey: 'pathStonesplit', minStat: 'minStonesplit', maxStat: 'maxStonesplit' },
    { key: 'silkbind',   labelKey: 'pathSilkbind',   minStat: 'minSilkbind',   maxStat: 'maxSilkbind' },
    { key: 'bamboocut',  labelKey: 'pathBamboocut',  minStat: 'minBamboocut',  maxStat: 'maxBamboocut' }
  ];
  const TIERS = [86, 81, 71, 61, 56, 51, 41];
  const TIER_PRESET = { 41: { min: 12, max: 25 }, default: { min: 17, max: 34 } };
  const SL = window._AFFIX_DISPLAY_LABELS || {};
  const statLabels = (pk) => {
    const p = PATHS.find(x => x.key === pk) || PATHS[0];
    return { min: SL[p.minStat] || p.minStat, max: SL[p.maxStat] || p.maxStat };
  };
  const pathLabel = (k) => {
    const p = PATHS.find(x => x.key === k);
    return p ? ((window.T && window.T[p.labelKey]) || p.key) : k;
  };
  const m = document.createElement('div');
  m.className = 'wwm-modal-backdrop';
  function _curRows(ars) {
    const sL = statLabels(ars.path);
    return TIERS.map(lv => {
      const t = ars.tiers?.[lv];
      const peaked = !!t?.peaked;
      const preset = lv === 41 ? TIER_PRESET[41] : TIER_PRESET.default;
      const minV = t?.min ?? preset.min;
      const maxV = t?.max ?? preset.max;
      const valTxt = peaked
        ? `<span style="color:var(--gold-bright);">頂点 ✓</span> <span style="color:var(--gold-bright);font-size:11px;">${sL.min}+${minV} ${sL.max}+${maxV}</span>`
        : `<span style="color:var(--paper-mute);">未突破</span> <span style="color:var(--gold-bright);font-size:11px;">${sL.min}+${minV} ${sL.max}+${maxV}</span>`;
      return `<div class="wwm-cmp-row" style="grid-template-columns:50px 1fr;align-items:center;"><span style="font-family:var(--f-mono);font-weight:700;">Lv${lv}</span><span>${valTxt}</span></div>`;
    }).join('');
  }
  function _newRows(ars) {
    const sL = statLabels(ars.path);
    return TIERS.map(lv => {
      const t = ars.tiers?.[lv] || {};
      const peaked = !!t.peaked;
      const preset = lv === 41 ? TIER_PRESET[41] : TIER_PRESET.default;
      const minV = t.min ?? preset.min;
      const maxV = t.max ?? preset.max;
      const inputArea = peaked
        ? `<span style="color:var(--gold-bright);font-size:11px;white-space:nowrap;">${sL.min}+${minV} ${sL.max}+${maxV}</span>`
        : `<span style="display:inline-flex;gap:4px;font-size:11px;color:var(--gold-bright);align-items:center;flex-wrap:nowrap;white-space:nowrap;">
             <span>${sL.min}</span><input type="number" class="wwm-num-input" data-tier-min="${lv}" min="0" max="${preset.min}" step="1" value="${minV}" style="width:42px;height:20px;padding:0 4px;">
             <span>${sL.max}</span><input type="number" class="wwm-num-input" data-tier-max="${lv}" min="0" max="${preset.max}" step="1" value="${maxV}" style="width:42px;height:20px;padding:0 4px;">
           </span>`;
      return `<div class="wwm-cmp-row" style="grid-template-columns:50px 1fr;align-items:center;"><span style="font-family:var(--f-mono);font-weight:700;">Lv${lv}</span>
        <span style="display:flex;align-items:center;gap:10px;flex-wrap:nowrap;white-space:nowrap;">
          <label style="display:inline-flex;align-items:center;gap:4px;cursor:pointer;white-space:nowrap;"><span>頂点</span> <input type="checkbox" data-tier="${lv}" ${peaked?'checked':''}></label>
          ${inputArea}
        </span>
      </div>`;
    }).join('');
  }
  function _pathRadios(curKey) {
    const opts = PATHS.map(p => `<option value="${p.key}" ${p.key===curKey?'selected':''}>${pathLabel(p.key)}</option>`).join('');
    return `<select id="wwmArsenalEditPathSel" class="wwm-cmp-set-select" name="wwmArsenalEditPath">${opts}</select>`;
  }
  m.innerHTML = `
    <div class="wwm-modal wwm-modal-square wwm-cmp-modal-a wwm-arsenal-modal">
      <span class="wwm-cmp-l-bracket-tl"></span><span class="wwm-cmp-l-bracket-tr"></span>
      <span class="wwm-cmp-l-bracket-bl"></span><span class="wwm-cmp-l-bracket-br"></span>
      <div class="wwm-modal-header">
        <h2><span class="wwm-cmp-title-ja">武庫対照</span><span class="wwm-cmp-title-en">COMPARISON</span><span class="wwm-cmp-seal">庫</span></h2>
        <button class="wwm-modal-close" aria-label="Close">×</button>
      </div>
      <div class="wwm-modal-body">
        <div class="wwm-cmp-modal-bg-icon wwm-cmp-modal-bg-icon-gear wwm-cmp-modal-bg-icon-arsenal" style="background-image:url('https://www.wherewindsmeetgame.com/pc/qt/20251203102905/data/kongfu/images/673361fe92bef95db34510429KLQLykS05.png');"></div>
        <div class="wwm-cmp-grid">
          <div class="wwm-cmp-col wwm-cmp-current">
            <h3 class="wwm-cmp-title" data-seal="現有"><span class="wwm-cmp-title-text">現有</span></h3>
            <div class="wwm-cmp-kongfu-header">${pathLabel(origArsenal.path)}</div>
            <div class="wwm-cmp-rows">${_curRows(origArsenal)}</div>
          </div>
          <div class="wwm-cmp-divider"></div>
          <div class="wwm-cmp-col wwm-cmp-new">
            <h3 class="wwm-cmp-title" data-seal="新置"><span class="wwm-cmp-title-text">新置</span></h3>
            <div class="wwm-cmp-kongfu-header" id="wwmArsenalEditPaths" style="display:flex;flex-wrap:nowrap;gap:6px;justify-content:space-between;">${_pathRadios(newArsenal.path)}</div>
            <div class="wwm-cmp-rows" id="wwmArsenalEditRows">${_newRows(newArsenal)}</div>
          </div>
        </div>
        <div class="wwm-cmp-footer-a">
          <div class="wwm-cmp-delta-block">
            <span class="wwm-cmp-delta-label">武格変動</span>
            <span class="wwm-cmp-preview-value" id="wwmArsenalEditDelta">+0</span>
            <span class="wwm-cmp-delta-base" id="wwmArsenalEditBase">—</span>
          </div>
          <div class="wwm-btn-row wwm-cmp-btn-row">
            <button class="wwm-btn-primary" id="wwmArsenalEditApply">採用</button>
            <button class="wwm-btn-secondary" id="wwmArsenalEditReset">復元</button>
            <button class="wwm-btn-secondary" id="wwmArsenalEditCancel">離脱</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.querySelector('.wwm-modal-close').addEventListener('click', close);
  m.querySelector('#wwmArsenalEditCancel').addEventListener('click', close);
  function _rerenderNew() {
    const rowsEl = m.querySelector('#wwmArsenalEditRows');
    if (rowsEl) rowsEl.innerHTML = _newRows(newArsenal);
    bindRowEvents();
    _schedulePreview();
  }
  m.querySelectorAll('[name="wwmArsenalEditPath"]').forEach(r => {
    r.addEventListener('change', () => {
      newArsenal.path = r.value;
      _rerenderNew();
    });
  });
  function bindRowEvents() {
    m.querySelectorAll('#wwmArsenalEditRows input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const lv = parseInt(cb.dataset.tier, 10);
        if (!newArsenal.tiers) newArsenal.tiers = {};
        const preset = lv === 41 ? TIER_PRESET[41] : TIER_PRESET.default;
        if (!newArsenal.tiers[lv]) newArsenal.tiers[lv] = { peaked: false, min: preset.min, max: preset.max };
        newArsenal.tiers[lv].peaked = cb.checked;
        _rerenderNew();
      });
    });
    m.querySelectorAll('#wwmArsenalEditRows input[data-tier-min]').forEach(inp => {
      inp.addEventListener('input', () => {
        const lv = parseInt(inp.dataset.tierMin, 10);
        let v = parseInt(inp.value, 10);
        const preset = lv === 41 ? TIER_PRESET[41] : TIER_PRESET.default;
        if (isNaN(v)) v = 0;
        if (v > preset.min) { v = preset.min; inp.value = preset.min; }
        if (v < 0) { v = 0; inp.value = 0; }
        if (!newArsenal.tiers) newArsenal.tiers = {};
        if (!newArsenal.tiers[lv]) newArsenal.tiers[lv] = { peaked: false, min: 0, max: 0 };
        newArsenal.tiers[lv].min = v;
        _schedulePreview();
      });
    });
    m.querySelectorAll('#wwmArsenalEditRows input[data-tier-max]').forEach(inp => {
      inp.addEventListener('input', () => {
        const lv = parseInt(inp.dataset.tierMax, 10);
        let v = parseInt(inp.value, 10);
        const preset = lv === 41 ? TIER_PRESET[41] : TIER_PRESET.default;
        if (isNaN(v)) v = 0;
        if (v > preset.max) { v = preset.max; inp.value = preset.max; }
        if (v < 0) { v = 0; inp.value = 0; }
        if (!newArsenal.tiers) newArsenal.tiers = {};
        if (!newArsenal.tiers[lv]) newArsenal.tiers[lv] = { peaked: false, min: 0, max: 0 };
        newArsenal.tiers[lv].max = v;
        _schedulePreview();
      });
    });
  }
  bindRowEvents();
  let previewTimer = null;
  async function _schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(_runPreview, 150);
  }
  async function _runPreview() {
    const ri = (typeof _getEffectiveRoleInfo === 'function') ? _getEffectiveRoleInfo() : WWMState.roleInfo;
    if (!ri || !window.WWMStats?.buildStatParams) return;
    const baseState = (typeof _getEffectiveState === 'function') ? _getEffectiveState() : WWMHelpers.storage.loadJSON('wwm_last_state_v1');
    try {
      // 現 (virtual_arsenal 無視 = 元 arsenal)
      const baseStateNoVirtArs = JSON.parse(JSON.stringify(baseState || {}));
      const origState = WWMHelpers.storage.loadJSON('wwm_last_state_v1');
      if (origState?.arsenal) baseStateNoVirtArs.arsenal = origState.arsenal;
      const p1 = await window.WWMStats.buildStatParams(ri, baseStateNoVirtArs);
      window.computeExpected(p1);
      const baseScore = _scoreWithBonus(ri);
      // 新
      const newState = JSON.parse(JSON.stringify(baseState || {}));
      newState.arsenal = newArsenal;
      const p2 = await window.WWMStats.buildStatParams(ri, newState);
      window.computeExpected(p2);
      const newScore = _scoreWithBonus(ri);
      const delta = Math.round(newScore - baseScore);
      const deltaEl = m.querySelector('#wwmArsenalEditDelta');
      if (deltaEl) {
        const sign = delta > 0 ? '+' : '';
        deltaEl.textContent = `${sign}${delta.toLocaleString()}`;
        deltaEl.className = 'wwm-cmp-preview-value ' + (delta > 0 ? 'pos' : delta < 0 ? 'neg' : 'zero');
      }
      const baseEl = m.querySelector('#wwmArsenalEditBase');
      if (baseEl) baseEl.textContent = `${Math.round(baseScore).toLocaleString()} → ${Math.round(newScore).toLocaleString()}`;
      // 復元
      window.computeExpected(p1);
    } catch(e) {}
  }
  _schedulePreview();
  m.querySelector('#wwmArsenalEditApply').addEventListener('click', () => {
    WWMState.virtual.arsenal = newArsenal;
    if (typeof window._saveVirtuals === 'function') window._saveVirtuals();
    close();
    if (typeof window._refreshAll === 'function') window._refreshAll();
  });
  m.querySelector('#wwmArsenalEditReset').addEventListener('click', () => {
    WWMState.virtual.arsenal = null;
    if (typeof window._saveVirtuals === 'function') window._saveVirtuals();
    close();
    if (typeof window._refreshAll === 'function') window._refreshAll();
  });
}
window.WWMHero = {
  update: updateHero
};

// ── 武格履歴 (Martial Record) ─────────────────────────────────
const _HIST_KEY = 'wwm_score_history_v1';
const _HIST_MAX = 365;
const _HIST_COLORS = ['#c9a45a','#a8d4b4','#e8a87c','#7ec4cf','#d4a5d0','#f0d28a','#c8786b','#b8d09c'];
function _histLoad() {
  return WWMHelpers.storage.loadJSON(_HIST_KEY, []);
}
function _histSave(arr) {
  try { localStorage.setItem(_HIST_KEY, JSON.stringify(arr)); } catch(_) {}
}
function _histRecord(data, scoreInfo) {
  if (!data || !scoreInfo || typeof scoreInfo.statusScore !== 'number') return;
  const d = new Date();
  const date = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  const roleId = String(data.uid || data.roleId || data.roleName || '?') + '|' + String(data.roleName || '');
  const entry = {
    ts: Date.now(),
    date,
    roleId,
    roleName: data.roleName || '?',
    level: data.level || 0,
    kongfuMain: data.kongfuMain || 0,
    statusScore: Math.round(scoreInfo.statusScore),
    expected: Math.round(scoreInfo.expected || 0),
    tier: scoreInfo.tier || ''
  };
  let arr = _histLoad();
  // 同日同キャラあれば 高い方で上書き
  const existIdx = arr.findIndex(e => e.date === date && e.roleId === roleId);
  if (existIdx >= 0) {
    if (entry.statusScore > arr[existIdx].statusScore) arr[existIdx] = entry;
    else return; // 既存の方が高い → skip
  } else {
    arr.push(entry);
  }
  // 件数制限 (古い順 drop)
  arr.sort((a,b) => a.ts - b.ts);
  if (arr.length > _HIST_MAX) arr = arr.slice(arr.length - _HIST_MAX);
  _histSave(arr);
}
function _histRoleColor(roleId, roleList) {
  const idx = roleList.indexOf(roleId);
  return _HIST_COLORS[idx % _HIST_COLORS.length];
}
function _histRender() {
  const root = document.getElementById('wwmHistory');
  if (!root) return;
  const T_ = window.T || {};
  const arr = _histLoad();
  if (!arr.length) {
    root.innerHTML = `<div class="wwm-analysis-card wwm-modal-square">
      <div class="wwm-modal-bg-icon" style="background-image:url('assets/icons/mountain-road.svg');"></div>
      <div class="wwm-analysis-header"><h3>${T_.martialHistoryTab || '武格履歴'}</h3></div>
      <div style="padding:24px;text-align:center;color:var(--paper-mute);font-size:13px;">${T_.historyEmpty || 'まだ履歴がありません。インポート時に自動記録されます。'}</div>
    </div>`;
    return;
  }
  // キャラ別グルーピング
  const byRole = {};
  arr.forEach(e => { (byRole[e.roleId] = byRole[e.roleId] || []).push(e); });
  const roleList = Object.keys(byRole);
  // 日付範囲
  const minTs = Math.min(...arr.map(e => e.ts));
  const maxTs = Math.max(...arr.map(e => e.ts));
  const tsRange = Math.max(1, maxTs - minTs);
  // Score 範囲
  const minScore = Math.min(...arr.map(e => e.statusScore));
  const maxScore = Math.max(...arr.map(e => e.statusScore));
  // padding for y-axis
  const scoreMin = Math.floor(minScore * 0.92 / 100) * 100;
  const scoreMax = Math.ceil(maxScore * 1.05 / 100) * 100;
  const scoreRange = Math.max(1, scoreMax - scoreMin);
  // SVG dimensions
  const W = 600, H = 240, PL = 50, PR = 16, PT = 12, PB = 28;
  const innerW = W - PL - PR, innerH = H - PT - PB;
  const xOf = ts => PL + ((ts - minTs) / tsRange) * innerW;
  const yOf = sc => PT + (1 - (sc - scoreMin) / scoreRange) * innerH;
  // Tier 境界水平線
  const wl = 14;
  const ssThr = 6700 * Math.pow(0.8, 14 - wl);
  const tierLines = [
    { v: ssThr,        l: 'SS', c: '#f0d28a' },
    { v: ssThr * 0.9,  l: 'S',  c: '#c9a45a' },
    { v: ssThr * 0.8,  l: 'A',  c: '#a8d4b4' },
    { v: ssThr * 0.6,  l: 'B',  c: '#7ec4cf' }
  ].filter(t => t.v >= scoreMin && t.v <= scoreMax);
  const tierSvg = tierLines.map(t => {
    const y = yOf(t.v).toFixed(1);
    return `<line x1="${PL}" y1="${y}" x2="${W-PR}" y2="${y}" stroke="${t.c}" stroke-opacity="0.25" stroke-dasharray="3,3"/>` +
           `<text x="${W-PR-2}" y="${y}" dy="-2" text-anchor="end" font-size="9" fill="${t.c}" opacity="0.7">${t.l} ${Math.round(t.v)}</text>`;
  }).join('');
  // Y-axis labels (5 ticks)
  const yTicks = [];
  for (let i = 0; i <= 4; i++) {
    const v = scoreMin + (scoreRange * i / 4);
    const y = yOf(v).toFixed(1);
    yTicks.push(`<text x="${PL-6}" y="${y}" dy="3" text-anchor="end" font-size="9" fill="var(--paper-mute)">${Math.round(v)}</text>`);
    yTicks.push(`<line x1="${PL-3}" y1="${y}" x2="${PL}" y2="${y}" stroke="var(--ink-2)"/>`);
  }
  // X-axis labels (start/mid/end)
  const fmtDate = ts => { const d = new Date(ts); return (d.getMonth()+1)+'/'+d.getDate(); };
  const xLabels = [0, 0.5, 1].map(r => {
    const ts = minTs + tsRange * r;
    const x = (PL + r * innerW).toFixed(1);
    return `<text x="${x}" y="${H - PB + 14}" text-anchor="middle" font-size="10" fill="var(--paper-mute)">${fmtDate(ts)}</text>`;
  }).join('');
  // 各キャラの polyline + dots
  let lines = '';
  roleList.forEach(rid => {
    const pts = byRole[rid].sort((a,b) => a.ts - b.ts);
    const color = _histRoleColor(rid, roleList);
    const polyPts = pts.map(e => `${xOf(e.ts).toFixed(1)},${yOf(e.statusScore).toFixed(1)}`).join(' ');
    lines += `<polyline points="${polyPts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    pts.forEach(e => {
      const cx = xOf(e.ts).toFixed(1), cy = yOf(e.statusScore).toFixed(1);
      const tip = `${e.roleName} Lv${e.level} | ${e.statusScore} ${e.tier} | ${e.date}`;
      lines += `<circle cx="${cx}" cy="${cy}" r="3.5" fill="${color}" stroke="#000" stroke-width="0.5"><title>${tip}</title></circle>`;
    });
  });
  // 凡例
  const legend = roleList.map(rid => {
    const last = byRole[rid][byRole[rid].length - 1];
    const color = _histRoleColor(rid, roleList);
    return `<span style="display:inline-flex;align-items:center;gap:6px;margin-right:14px;font-size:11px;color:var(--paper);"><span style="width:10px;height:3px;background:${color};display:inline-block;border-radius:2px;"></span>${last.roleName} (Lv${last.level})</span>`;
  }).join('');
  root.innerHTML = `
    <div class="wwm-analysis-card wwm-modal-square">
      <div class="wwm-modal-bg-icon" style="background-image:url('assets/icons/mountain-road.svg');"></div>
      <div class="wwm-analysis-header"><h3>${T_.martialHistoryTab || '武格履歴'}</h3></div>
      <div style="padding:8px 12px;">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px;display:block;">
          <rect x="${PL}" y="${PT}" width="${innerW}" height="${innerH}" fill="rgba(0,0,0,0.15)" stroke="var(--ink-2)" stroke-width="0.5"/>
          ${tierSvg}
          ${yTicks.join('')}
          ${xLabels}
          ${lines}
        </svg>
        <div style="margin-top:8px;line-height:1.8;">${legend}</div>
      </div>
    </div>
  `;
}
window.WWMHistory = { record: _histRecord, render: _histRender };

// ── ロール品質 heatmap (装備別 平均ratio) ─────────────────────
const _QUAL_SLOT_ORDER = ['1','2','10','11','3','4','5','8'];
const _QUAL_SLOT_KEYS = {
  '1':'slotMain','2':'slotSub','3':'slotHelm','4':'slotChest','5':'slotLegs','8':'slotHands',
  '9':'slotDisc','10':'slotRing','11':'slotPendant','21':'slotBow'
};
function _qualSlotLabel(slot) {
  const k = _QUAL_SLOT_KEYS[slot];
  return (window.T && window.T[k]) || slot;
}
function _qualColor(r) {
  // ratio 0-1 → 赤(0)→黄(0.5)→緑(1)、CSS変数経由
  return _ratioColor(r);
}
function _qualRender() {
  const root = document.getElementById('wwmQuality');
  if (!root) return;
  const T_ = window.T || {};
  const ri = WWMState.roleInfo;
  if (!ri || !ri.wearEquipsDetailed) {
    root.innerHTML = '<div class="wwm-analysis-card wwm-modal-square">'
      + '<div class="wwm-analysis-header"><h3>'+(T_.qualityTab||'ロール品質')+'</h3></div>'
      + '<div style="padding:24px;text-align:center;color:var(--paper-mute);font-size:13px;">'+(T_.qualityEmpty||'インポート後 装備データから品質を表示します')+'</div>'
    + '</div>';
    return;
  }
  const rows = _QUAL_SLOT_ORDER.map(slot => {
    const eq = ri.wearEquipsDetailed[slot];
    const label = _qualSlotLabel(slot);
    if (!eq || !eq.exVo || !eq.exVo.baseAffixes || !eq.exVo.baseAffixes.length) {
      return { slot, label, avg: 0, count: 0, details: [] };
    }
    const details = eq.exVo.baseAffixes.map(a => {
      const d = a.equipmentDetails || [];
      return { id: d[0], val: d[1], ratio: d[2] || 0, rank: d[3], useful: d[4] };
    });
    const avg = details.reduce((s,d) => s + (d.ratio||0), 0) / details.length;
    return { slot, label, avg, count: details.length, details };
  });
  const rowHtml = rows.map(r => {
    const pct = (r.avg * 100).toFixed(0);
    const c = _qualColor(r.avg);
    const tip = r.details.map(d => {
      const nm = (window._AFFIX_DISPLAY_LABELS && d.id) ? (window._AFFIX_DISPLAY_LABELS[window.WWM_AFFIX?.[d.id]?.statKey] || ('affix#'+d.id)) : '';
      const useful = d.useful ? ' <span class="wwm-good-icon"><svg viewBox="0 0 24 24"><path d="M2 21h4V9H2v12zm20-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L13.17 1 7.59 6.59C7.22 6.95 7 7.45 7 8v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-1z"/></svg></span>' : '';
      return nm + ' ' + ((d.ratio||0)*100).toFixed(0) + '%' + useful;
    }).join('\n');
    return '<div class="wwm-qual-row" title="'+tip.replace(/"/g,'&quot;')+'" style="display:grid;grid-template-columns:80px 1fr 50px;gap:8px;align-items:center;padding:4px 6px;font-size:12px;background:var(--surf-shade);border-radius:3px;">'
      + '<span style="font-weight:700;color:var(--paper);">'+r.label+'</span>'
      + '<div style="background:var(--ink-2);height:14px;border-radius:7px;overflow:hidden;position:relative;">'
      +   '<div style="width:'+pct+'%;height:100%;background:linear-gradient(90deg,'+c+'88,'+c+');border-radius:7px;transition:width 0.3s;"></div>'
      + '</div>'
      + '<span style="text-align:right;font-family:var(--f-mono);font-weight:700;color:'+c+';">'+pct+'%</span>'
      + '</div>';
  }).join('');
  // 全体平均
  const allAvg = rows.filter(r => r.count).reduce((s,r) => s+r.avg, 0) / (rows.filter(r => r.count).length || 1);
  const allPct = (allAvg * 100).toFixed(1);
  const allC = _qualColor(allAvg);
  root.innerHTML = '<div class="wwm-analysis-card wwm-modal-square">'
    + '<div class="wwm-modal-bg-icon" style="background-image:url(\'assets/icons/scales.svg\');"></div>'
    + '<div class="wwm-analysis-header"><h3>'+(T_.qualityTab||'ロール品質')+' <span style="font-size:13px;color:'+allC+';margin-left:8px;font-family:var(--f-mono);">'+allPct+'%</span></h3></div>'
    + '<div style="padding:8px 12px;display:flex;flex-direction:column;gap:4px;">'+rowHtml+'</div>'
  + '</div>';
}
window.WWMQuality = { render: _qualRender };
