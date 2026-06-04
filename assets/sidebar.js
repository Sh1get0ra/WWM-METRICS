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
// (Phase 3.9d: assets/sidebar/ranking.js に切出 — renderAffixRanking /
//             _STAT_META / window.WWMRanking / window.WWMSidebar.ranking)
// (本体は assets/sidebar/ranking.js)

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

// ── Tier badge ルーレット + Hero block 更新 ─────────────────────
// (Phase 3.9e: assets/sidebar/hero.js に切出 — startRoulette / stopRoulette /
//             update (旧 updateHero) / _ROULETTE_GLYPHS / _tierRouletteIntv /
//             window.WWMHero / window.WWMSidebar.hero / window._startTierRoulette / window._stopTierRoulette)
// (本体は assets/sidebar/hero.js)

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
// (Phase 3.9a: openUnknownReport は assets/sidebar/unknown.js に切出 — window.WWMSidebar.unknown.openReport)
const openUnknownReport = window.WWMSidebar.unknown.openReport;

window.WWMSidebar = {
  render: renderSidebar,
  refresh: () => { const p = _getCurrentParams(); return p && renderSidebar(p); },
  syncLayout: _syncLayoutVars,
  openUnknownReport
};
// (Phase 3.6: window.WWMGear は assets/sidebar/gear.js 内で expose 済)
// (Phase 3.7: window.WWMXinfa は assets/sidebar/xinfa.js 内で expose 済)
// (Phase 3.8: openArsenalEdit は assets/sidebar/arsenal.js に切出 — window.WWMArsenal expose)
// (Phase 3.9e: window.WWMHero は assets/sidebar/hero.js 内で expose 済)

// ── 武格履歴 (Martial Record) ─────────────────────────────────
// (Phase 3.9c: assets/sidebar/history.js に切出 — _histLoad/Save/Record/Render /
//             _HIST_KEY / _HIST_MAX / _HIST_COLORS / _histRoleColor /
//             window.WWMHistory / window.WWMSidebar.history)
// (本体は assets/sidebar/history.js)

// ── ロール品質 heatmap (装備別 平均ratio) ─────────────────────
// (Phase 3.9b: 廃止。 #wwmQuality DOM/呼出 共に消滅、 機能は装備編集 modal に移植済)
// (旧 _qualSlotLabel / _qualColor / _qualRender / WWMQuality は削除済 — styles.css の残骸も別途整理予定)
