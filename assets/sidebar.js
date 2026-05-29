// ── WWM-DMGCALC Sidebar ─────────────────────────────────────────
let _STAT_CONFIG = null;
let _CURRENT_PARAMS = null;

// ratio (0-1) → CSS変数色 (styles.css --ratio-* に対応)
function _ratioColor(r) {
  if (r == null) return 'var(--paper-mute)';
  if (r >= 0.9)  return 'var(--ratio-excellent)';
  if (r >= 0.75) return 'var(--ratio-good)';
  if (r >= 0.6)  return 'var(--ratio-ok)';
  if (r >= 0.4)  return 'var(--ratio-warn)';
  return 'var(--ratio-bad)';
}

// ── Esc キーで最前面 modal 閉じる ────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const backdrops = document.querySelectorAll('.wwm-modal-backdrop');
  if (!backdrops.length) return;
  const top = backdrops[backdrops.length - 1];
  top.remove();
  e.stopPropagation();
});

// ── modal a11y自動付与 + focus trap (MutationObserver経由、既存呼出無改変) ─
function _setupModalA11y(modal) {
  if (modal._a11ySetup) return;
  modal._a11ySetup = true;
  if (!modal.getAttribute('role')) modal.setAttribute('role', 'dialog');
  if (!modal.getAttribute('aria-modal')) modal.setAttribute('aria-modal', 'true');
  // 開いた時に最初のfocusable要素へfocus
  const _focusSel = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  // 最後にフォーカスされていた要素を覚えて、close時に戻す
  modal._prevFocus = document.activeElement;
  setTimeout(() => {
    const focusable = modal.querySelectorAll(_focusSel);
    const closeBtn = modal.querySelector('.wwm-modal-close');
    const target = closeBtn || focusable[0];
    if (target) try { target.focus(); } catch(_) {}
  }, 0);
  // Tab循環 (focus trap)
  modal.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const focusable = modal.querySelectorAll(_focusSel);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  });
}
const _modalObserver = new MutationObserver((mutations) => {
  for (const mut of mutations) {
    for (const node of mut.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (node.classList?.contains('wwm-modal-backdrop')) _setupModalA11y(node);
    }
    for (const node of mut.removedNodes) {
      if (node.nodeType !== 1) continue;
      if (node.classList?.contains('wwm-modal-backdrop') && node._prevFocus) {
        try { node._prevFocus.focus(); } catch(_) {}
      }
    }
  }
});
_modalObserver.observe(document.body, { childList: true });

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
    // 初回起動 (seen無し): modal出さず current版を保存 → 以降差分のみ
    if (!seen) {
      localStorage.setItem(_CHANGELOG_KEY, cl.current);
      return;
    }
    if (_semver(seen, cl.current) >= 0) return;
    // 差分: seen より新しい entries
    const entries = (cl.entries || []).filter(e => _semver(e.version, seen) > 0);
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
    <div class="wwm-modal wwm-modal-wide wwm-modal-square">
      <div class="wwm-modal-bg-icon" style="background-image:url('assets/icons/book-cover.svg');"></div>
      <div class="wwm-modal-header">
        <h2>${manual ? ((window.T&&T.changelogTitle)||'変更履歴') : '更新内容 (v' + currentVer + ')'}</h2>
        <button class="wwm-modal-close" aria-label="Close">×</button>
      </div>
      <div class="wwm-modal-body">
        <div class="wwm-cl-notice">${(window.T&&T.changelogLangNotice)||'※ Changelog: Japanese only / 日本語のみ / 일본어 한정'}</div>
        ${body}
        <div class="wwm-btn-row" style="margin-top:16px;">
          <button class="wwm-btn-primary" id="wwmClClose">${(window.T&&T.close)||'閉じる'}</button>
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
        <h2>武格指数 計算式</h2>
        <button class="wwm-modal-close" aria-label="Close">×</button>
      </div>
      <div class="wwm-modal-body wwm-help-body">
        <div class="wwm-cl-notice">${(window.T&&T.changelogLangNotice)||'※ Japanese only / 日本語のみ / 일본어 한정'}</div>
        <h3>概要</h3>
        <p>武格指数 は装備/心法/武学/セットを総合してダメージ期待値を <b>固定係数</b> で算出した指標。装備変更や心法 swap の影響を一元的に比較可。</p>

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
          <li>装備 オプション (副ステ)</li>
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
          <button class="wwm-btn-primary" id="wwmHelpClose">${(window.T&&T.close)||'閉じる'}</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.querySelector('.wwm-modal-close').addEventListener('click', close);
  m.querySelector('#wwmHelpClose').addEventListener('click', close);
}
function _resetAllVirtuals() {
  const hasV = (window.__WWM_VIRTUAL && Object.keys(window.__WWM_VIRTUAL).length)
            || (window.__WWM_VIRTUAL_KONGFU && Object.keys(window.__WWM_VIRTUAL_KONGFU).length)
            || (window.__WWM_VIRTUAL_XINFA && ((window.__WWM_VIRTUAL_XINFA.passive&&window.__WWM_VIRTUAL_XINFA.passive.length) || Object.keys(window.__WWM_VIRTUAL_XINFA.tiers||{}).length))
            || window.__WWM_VIRTUAL_ARSENAL;
  if (!hasV) { alert('リセット対象なし'); return; }
  if (!confirm('新装備/心法/武術/武庫 全てを現装備値に戻す。よろしい?')) return;
  window.__WWM_VIRTUAL = {};
  window.__WWM_VIRTUAL_KONGFU = {};
  window.__WWM_VIRTUAL_XINFA = null;
  delete window.__WWM_VIRTUAL_ARSENAL;
  try { localStorage.removeItem('wwm_virtual_v1'); } catch(_) {}
  if (typeof window._refreshAll === 'function') window._refreshAll();
}
window.WWMHelp = { showScoreFormula: _showScoreFormula, resetAllVirtuals: _resetAllVirtuals };

// ── 弱点指摘 / Diagnostics ──────────────────────────────────────
// i18n: affix 表記 (ja=オプション / en=affix 等)
function _optionTerm() {
  const lang = _curLang();
  return lang === 'ja' ? 'オプション' : 'affix';
}
// {n} placeholder 置換 helper (i18n template)
function _tpl(tpl, ...args) {
  return (tpl || '').replace(/\{(\d+)\}/g, (_, i) => args[i] != null ? args[i] : '');
}
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
  // 会心率過多
  const critAdj = params.critRate / jr;
  const critOverPct = (critAdj - 0.8) * 100;
  if (critOverPct >= 3) {
    out.push({ type: 'warn', text: _tpl(T_.diagCritOver || '会心率過多 (適用 {0}% / cap 80% / 超過 +{1}%)', (critAdj*100).toFixed(1), critOverPct.toFixed(1)) });
  }
  // 会意率過多
  const symAdj = params.sympathyRate / jr;
  const symOverPct = (symAdj - 0.4) * 100;
  if (symOverPct >= 3) {
    out.push({ type: 'warn', text: _tpl(T_.diagSymOver || '会意率過多 (適用 {0}% / cap 40% / 超過 +{1}%)', (symAdj*100).toFixed(1), symOverPct.toFixed(1)) });
  }
  // 会心率不足
  const appliedCritFinal = Math.min(0.8, critAdj) + (params.addCritRate || 0);
  const appliedSymFinal = Math.min(0.4, symAdj) + (params.addSympathyRate || 0);
  if (critAdj <= 0.70 && (appliedCritFinal + appliedSymFinal) < 1.0) {
    out.push({ type: 'warn', text: _tpl(T_.diagCritUnder || '会心率不足 (適用 {0}% / 最終会心+会意 {1}%)', (critAdj*100).toFixed(1), ((appliedCritFinal+appliedSymFinal)*100).toFixed(1)) });
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
    <div class="wwm-modal wwm-modal-square wwm-diag-modal">
      <div class="wwm-modal-bg-icon" style="background-image:url('assets/icons/cracked-shield.svg');"></div>
      <div class="wwm-modal-header">
        <h2>${(window.T&&T.diagTitle)||'弱点指摘 / Diagnostics'}</h2>
        <button class="wwm-modal-close" aria-label="Close">×</button>
      </div>
      <div class="wwm-modal-body">
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
      const _Pp=T_.penPhysShort||'外功', _Vv=T_.penVoidShort||'無相', _Ot=T_.penOther||'他';
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
window.WWMDiag = { render: renderDiagnostics, openPopup: _openDiagPopup };

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
    { key: '_momentum',  delta: maxTbl.stat5, label: `${SL.momentum||'力'} +${maxTbl.stat5?.toFixed(1)}`, statKey: 'momentum' },
    { key: '_agility',   delta: maxTbl.stat5, label: `${SL.agility||'速'} +${maxTbl.stat5?.toFixed(1)}`, statKey: 'agility' },
    { key: '_power',     delta: maxTbl.stat5, label: `${SL.power||'会'} +${maxTbl.stat5?.toFixed(1)}`, statKey: 'power' },
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
      const newScore = (window.__WWM_LAST_RESULT?.statusScore || 0) + _set4Bonus(roleInfo);
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
    '_momentum':        { lbl: SL.momentum || '力',           pct: false, step: '1' },
    '_agility':         { lbl: SL.agility || '速',            pct: false, step: '1' },
    '_power':           { lbl: SL.power || '会',              pct: false, step: '1' },
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
          const newScore = (window.__WWM_LAST_RESULT?.statusScore || 0) + _set4Bonus(roleInfo);
          const dEl = root.querySelector(`[data-delta-for="${k}"]`);
          if (dEl) dEl.textContent = `+${(newScore - baseScore).toFixed(1)}`;
          // 復元 (base params で 1回再計算 → DOM正常化)
          window._SILENT_COMPUTE = false;
          if (window.__WWM_PARAMS) window.computeExpected(window.__WWM_PARAMS);
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
let _OPT_LAST_STEPS = null;
let _OPT_LAST_SCORES = null;
async function renderOptimization(roleInfo, params, opts) {
  const root = document.getElementById('wwmOptimization');
  if (!root || !roleInfo || !window.WWMStats?.buildStatParams) return;
  opts = opts || {};
  // 最適化中 donut/score の中間更新を suppress
  window.__WWM_OPT_RUNNING = true;
  try {
    return await _renderOptimizationInner(roleInfo, params, opts, root);
  } finally {
    window.__WWM_OPT_RUNNING = false;
    // 最終 donut/score を確実に反映 (suppress中アニメ途中で凍結対策)
    try {
      // donut transition 一旦無効化 → reflow → 再有効化 で transition cancel + target即時反映
      const dsegs = ['Crit','Sympathy','Graze','Normal']
        .map(k => document.getElementById('donutDmgSeg'+k)).filter(Boolean);
      dsegs.forEach(el => { el.style.transition = 'none'; });
      if (window.WWMHero) window.WWMHero.update(params);
      // reflow
      dsegs.forEach(el => { void el.getBoundingClientRect().width; });
      dsegs.forEach(el => { el.style.transition = ''; });
    } catch(_) {}
  }
}
async function _renderOptimizationInner(roleInfo, params, opts, root) {
  // abort token: 新しい render 開始時、前回 loop を打切
  const myToken = (window._OPT_TOKEN = (window._OPT_TOKEN || 0) + 1);
  const _aborted = () => window._OPT_TOKEN !== myToken;
  // 保存された ratio (slider 値) 取得
  const savedRatio = parseFloat(localStorage.getItem('wwm_opt_target_ratio_v1')) || 0.94;
  const TARGET_RATIO = opts.ratio ?? savedRatio;
  const MAX_ITER = 20; // best=null で自動停止、上限保険
  // 微改善打切閾値 (localStorage 永続化、UI で変更可)
  if (typeof window._OPT_MIN_DELTA === 'undefined' || window._OPT_MIN_DELTA == null) {
    try { window._OPT_MIN_DELTA = parseInt(localStorage.getItem('wwm_opt_min_delta_v1'), 10) || 5; } catch(_) { window._OPT_MIN_DELTA = 5; }
  }
  // header controls
  const savedSlot = opts.slotFilter ?? (localStorage.getItem('wwm_opt_slot_filter_v1') || 'all');
  const T_ = window.T || {};
  const SLOT_FILTERS = {
    all: T_.optSlotAll || '全装備',
    weapon: T_.optSlotWeapon || '主/副武器',
    accessory: T_.optSlotAccessory || '環/佩び物',
    armor: T_.optSlotArmor || '防具'
  };
  const headerHtml = `
    <div class="wwm-analysis-header">
      <h3>${T_.optimizationTitle||'装備最適化提案'}</h3>
      <div class="wwm-opt-controls">
        <select class="wwm-opt-select" id="wwmOptSlot" title="対象 slot">
          ${Object.entries(SLOT_FILTERS).map(([k,v]) => `<option value="${k}" ${k===savedSlot?'selected':''}>${v}</option>`).join('')}
        </select>
        <label class="wwm-opt-ratio-label">${T_.optTargetRatio||'目標'} <span id="wwmOptRatioVal">${Math.round(TARGET_RATIO*100)}%</span>
          <input type="range" id="wwmOptRatio" min="90" max="100" step="1" value="${Math.round(TARGET_RATIO*100)}">
        </label>
        <button type="button" class="wwm-opt-btn" id="wwmOptRecalc" title="${T_.optRecalc||'再計算'}">↻</button>
        <label class="wwm-opt-ratio-label" title="${T_.optMinDeltaTip||'これ未満のΔで打切'}">Δ<input type="number" id="wwmOptMinDelta" min="2" max="50" step="1" value="${window._OPT_MIN_DELTA}" style="width:40px;background:var(--surf-shade);color:var(--paper);border:1px solid var(--ink-2);border-radius:3px;padding:2px 4px;font-family:var(--f-mono);"></label>
        <button type="button" class="wwm-opt-btn wwm-opt-btn-apply" id="wwmOptApplyAll">${T_.optApplyAll||'全適用'}</button>
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
    if (apEl) apEl.addEventListener('click', () => _applyOptSteps(_OPT_LAST_STEPS || []));
    const slEl = root.querySelector('#wwmOptSlot');
    if (slEl) slEl.addEventListener('change', () => {
      localStorage.setItem('wwm_opt_slot_filter_v1', slEl.value);
      renderOptimization(roleInfo, params, { slotFilter: slEl.value });
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
  root.innerHTML = `<div class="wwm-analysis-card wwm-modal-square"><div class="wwm-modal-bg-icon" style="background-image:url('assets/icons/anvil-impact.svg');"></div>${headerHtml}<div class="wwm-opt-loading">計算中...</div></div>`;
  _bindControls();
  // progress表示は .wwm-opt-loading に一本化 (#wwmOptProgress は使わず二重回避)
  const setProgress = (label) => {
    const el = root.querySelector('.wwm-opt-loading');
    if (el) el.textContent = label || '計算中...';
  };
  setProgress('計算中...');
  const state = (() => { try { return JSON.parse(localStorage.getItem('wwm_last_state_v1') || 'null'); } catch(_) { return null; } })();
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
  const wl = params?.worldLv || 14;
  const ssThr = 6700 * Math.pow(0.8, 14 - wl);
  let stopReason = null;
  let lastBestNull = false;
  // iter=0 は弓セット swap のみ評価 (他affixより先に確定)
  // iter>=1 は affix swap (弓セットも再評価)
  for (let iter = 0; iter < MAX_ITER; iter++) {
    if (_aborted()) return;
    await new Promise(r => setTimeout(r, 0)); // UI応答性確保
    if (_aborted()) return;
    setProgress(`計算中... (${iter + 1}回目)`);
    const eqDet = working.wearEquipsDetailed || {};
    const slots = ['1','2','3','4','5','8','10','11'].filter(s => eqDet[s] && slotsAllowed.has(s));
    let best = null;
    // iter=0 は弓セットだけ評価 (affix skip)
    const skipAffix = (iter === 0);
    for (const slot of skipAffix ? [] : slots) {
      if (_aborted()) return;
      await new Promise(r => setTimeout(r, 0)); // UI応答性確保
      if (_aborted()) return;
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
    // 弓セット (slot 9 + 21) suffix swap 評価
    const bowEq9 = eqDet['9'];
    const bowEq21 = eqDet['21'];
    if (bowEq9 && bowEq21 && window.WWM_SETS?.bowSets) {
      const curBowSuffix = bowEq9.exVo?.suffix;
      const bowSuffixOptions = Object.keys(window.WWM_SETS.bowSets);
      for (const newSfx of bowSuffixOptions) {
        const sfxInt = parseInt(newSfx, 10);
        if (sfxInt === curBowSuffix) continue;
        try {
          const ri = JSON.parse(JSON.stringify(working));
          ri.wearEquipsDetailed['9'].exVo.suffix = sfxInt;
          ri.wearEquipsDetailed['21'].exVo.suffix = sfxInt;
          const p = await window.WWMStats.buildStatParams(ri, state);
          window.computeExpected(p);
          const newScore = _scoreWithBonus(ri);
          const delta = newScore - curScore;
          if (delta > 0 && (!best || delta > best.delta)) {
            const lang = _curLang();
            const oldName = window.WWM_SETS.bowSets[curBowSuffix]?.names?.[lang] || window.WWM_SETS.bowSets[curBowSuffix]?.names?.ja || '';
            const newName = window.WWM_SETS.bowSets[sfxInt]?.names?.[lang] || window.WWM_SETS.bowSets[sfxInt]?.names?.ja || '';
            best = {
              kind: 'bowSet',
              slot: '9,21', slotLabel: '弓矢/射玦',
              fromName: oldName, fromSuffix: curBowSuffix,
              toName: newName, toSuffix: sfxInt,
              delta, newScore
            };
          }
        } catch(e) {}
      }
    }
    if (!best) {
      // iter=0 (弓セット評価) で改善なし → affix最適化に進む (continue)
      if (iter === 0) continue;
      stopReason = `${iter}回 改善後、追加改善なし`;
      break;
    }
    // 微改善で早期収束 (Δ<閾値) — push せずに break
    if (best.delta < window._OPT_MIN_DELTA && iter > 0) {
      stopReason = `${iter}回で収束 (微改善Δ<${window._OPT_MIN_DELTA} で打切)`;
      break;
    }
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
    await new Promise(r => setTimeout(r, 0)); // UI yield
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
  const rows = steps.length ? steps.map((s, i) => {
    const isBow = s.kind === 'bowSet';
    const slotCol = isBow ? s.slotLabel : `${s.slotLabel}#${s.idx+1}`;
    const changeCol = isBow
      ? `<span class="wwm-opt-from">${s.fromName||'(未装着)'}</span> ▶ <span class="wwm-opt-to">${s.toName}</span>`
      : `<span class="wwm-opt-from">${_fmtFromTo(s.fromName, s.fromVal, s.fromRatio, s.fromKey)}</span> ▶ <span class="wwm-opt-to">${_fmtFromTo(s.toName, s.toVal, s.toRatio, s.toKey)}</span>`;
    return `
    <div class="wwm-opt-row">
      <span class="wwm-opt-pos">${i+1}</span>
      <span class="wwm-opt-slot">${slotCol}</span>
      <span class="wwm-opt-change">${changeCol}</span>
      <span class="wwm-opt-delta">+${Math.round(s.delta).toLocaleString()}</span>
      ${s.tierUp ? `<span class="wwm-opt-tierup">★ ${s.tierUp}</span>` : '<span></span>'}
      <button type="button" class="wwm-opt-btn wwm-opt-btn-step" data-opt-step="${i}" title="この swap だけ適用">${(window.T&&T.optApplyOne)||'適用'}</button>
    </div>
  `;}).join('') : `<div class="wwm-opt-empty">${stopReason || '改善余地なし'}</div>`;
  const reasonHtml = stopReason && steps.length ? `<div class="wwm-opt-reason">${stopReason}</div>` : '';
  // 結果 cache (export 用)
  _OPT_LAST_STEPS = steps;
  _OPT_LAST_SCORES = { start: Math.round(startScore), end: Math.round(curScore), delta: totalDelta, ratio: TARGET_RATIO };
  root.innerHTML = `
    <div class="wwm-analysis-card wwm-modal-square">
      <div class="wwm-modal-bg-icon" style="background-image:url('assets/icons/anvil-impact.svg');"></div>
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
    if (step.kind === 'bowSet') {
      // 弓セット suffix 変更 (slot 9 + 21)
      ['9','21'].forEach(s => {
        let vEq = window.__WWM_VIRTUAL[s];
        if (!vEq) {
          const orig = origRi.wearEquipsDetailed?.[s];
          if (!orig) return;
          vEq = JSON.parse(JSON.stringify(orig));
          window.__WWM_VIRTUAL[s] = vEq;
        }
        if (vEq.exVo) vEq.exVo.suffix = step.toSuffix;
      });
      continue;
    }
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
  let url, b64;
  try {
    const json = JSON.stringify(payload);
    b64 = btoa(unescape(encodeURIComponent(json))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    url = location.origin + location.pathname + '#build=' + b64;
  } catch (e) { alert('URL 生成失敗: ' + e.message); return; }
  // OBS URL は 透明度+背景色+文字色+ラベル背景 込みで動的生成
  const buildObsUrl = (opPct, bgHex, t1Hex, t2Hex, acHex, lbgHex) => {
    const bg = (bgHex || '#0a0a0a').replace('#','');
    const t1 = (t1Hex || '#e8d9b8').replace('#','');
    const t2 = (t2Hex || '#f0d28a').replace('#','');
    const ac = (acHex || '#c9a45a').replace('#','');
    const lbg = (lbgHex || '#d4af37').replace('#','');
    return location.origin + location.pathname + '?view=sidebar&op=' + opPct + '&bg=' + bg + '&t1=' + t1 + '&t2=' + t2 + '&ac=' + ac + '&lbg=' + lbg + '#build=' + b64;
  };
  // 過去の overlay 設定 復元
  const OVL_KEY = 'wwm_overlay_settings_v1';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(OVL_KEY) || '{}'); } catch(_) {}
  const initOp = Number.isFinite(saved.op) ? saved.op : 0;
  const initBg = saved.bg || '#0a0a0a';
  const initT1 = saved.t1 || '#e8d9b8';
  const initT2 = saved.t2 || '#f0d28a';
  const initAc = saved.ac || '#c9a45a';
  const initLbg = saved.lbg || '#d4af37';
  let obsUrl = buildObsUrl(initOp, initBg, initT1, initT2, initAc, initLbg);
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
        <p style="font-size:12px;color:var(--paper-mute);margin:0 0 12px;">この URL を共有すると、相手の WWM-METRICS で同じ build が表示される。</p>
        <div style="font-size:11px;color:var(--gold-bright);font-weight:700;letter-spacing:0.1em;margin-bottom:4px;">通常 URL</div>
        <textarea class="wwm-share-url" id="wwmShareUrlNormal" readonly>${url}</textarea>
        <div class="wwm-btn-row" style="margin-top:6px;">
          <button class="wwm-btn-secondary" id="wwmShareCopyNormal">通常 URL コピー</button>
        </div>
        <div style="font-size:11px;color:var(--gold-bright);font-weight:700;letter-spacing:0.1em;margin:18px 0 4px;">OBS Browser Source URL</div>
        <p style="font-size:11px;color:var(--paper-mute);margin:0 0 6px;">OBS の Browser Source に貼り付け。Build変更時は再度コピー&Source URL更新で反映。</p>
        <div style="display:flex;align-items:center;gap:12px;font-size:11px;color:var(--paper-mute);margin-bottom:8px;flex-wrap:wrap;">
          <label style="display:flex;align-items:center;gap:6px;">
            背景色
            <input type="color" id="wwmObsBg" value="${initBg}" style="width:32px;height:24px;border:1px solid var(--ink-2);background:transparent;cursor:pointer;">
          </label>
          <label style="display:flex;align-items:center;gap:6px;">
            不透明度
            <input type="range" id="wwmObsOpacity" min="0" max="100" step="1" value="${initOp}" style="width:130px;accent-color:var(--gold);">
            <span id="wwmObsOpacityVal" style="font-family:var(--f-mono);color:var(--gold-bright);min-width:36px;">${initOp}%</span>
          </label>
        </div>
        <div style="display:flex;align-items:center;gap:12px;font-size:11px;color:var(--paper-mute);margin-bottom:8px;flex-wrap:wrap;">
          <label style="display:flex;align-items:center;gap:6px;">文字色1
            <input type="color" id="wwmObsT1" value="${initT1}" style="width:32px;height:24px;border:1px solid var(--ink-2);background:transparent;cursor:pointer;">
          </label>
          <label style="display:flex;align-items:center;gap:6px;">文字色2
            <input type="color" id="wwmObsT2" value="${initT2}" style="width:32px;height:24px;border:1px solid var(--ink-2);background:transparent;cursor:pointer;">
          </label>
          <label style="display:flex;align-items:center;gap:6px;">ラベル文字
            <input type="color" id="wwmObsAc" value="${initAc}" style="width:32px;height:24px;border:1px solid var(--ink-2);background:transparent;cursor:pointer;">
          </label>
          <label style="display:flex;align-items:center;gap:6px;">ラベル背景
            <input type="color" id="wwmObsLbg" value="${initLbg}" style="width:32px;height:24px;border:1px solid var(--ink-2);background:transparent;cursor:pointer;">
          </label>
        </div>
        <textarea class="wwm-share-url" id="wwmShareUrlObs" readonly>${obsUrl}</textarea>
        <div class="wwm-btn-row" style="margin-top:6px;">
          <button class="wwm-btn-primary" id="wwmShareCopyObs">OBS URL コピー</button>
          <button class="wwm-btn-secondary" id="wwmShareTogglePreview">プレビュー表示</button>
          <button class="wwm-btn-secondary" id="wwmShareClose">閉じる</button>
        </div>
        <div id="wwmSharePreviewWrap" style="display:none;margin-top:12px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
            <div style="font-size:11px;color:var(--gold-bright);font-weight:700;letter-spacing:0.1em;">プレビュー (内部 640×900 を縮小表示)</div>
            <label style="font-size:11px;color:var(--paper-mute);display:flex;align-items:center;gap:6px;">縮尺
              <input type="range" id="wwmSharePreviewScale" min="30" max="100" step="5" value="50" style="width:120px;accent-color:var(--gold);">
              <span id="wwmSharePreviewScaleVal" style="font-family:var(--f-mono);color:var(--gold-bright);min-width:36px;">50%</span>
            </label>
          </div>
          <div style="background:repeating-conic-gradient(#1a1a1a 0% 25%, #2a2a2a 0% 50%) 50% / 16px 16px;border:1px solid var(--ink-2);border-radius:3px;padding:8px;display:flex;justify-content:center;overflow:auto;">
            <div id="wwmSharePreviewClip" style="width:320px;height:450px;overflow:hidden;position:relative;">
              <iframe id="wwmSharePreviewFrame" src="" style="width:640px;height:900px;border:none;background:transparent;transform:scale(0.5);transform-origin:0 0;" sandbox="allow-scripts allow-same-origin"></iframe>
            </div>
          </div>
        </div>
        <div id="wwmShareMsg" style="margin-top:8px;font-size:12px;color:var(--jade-bright);"></div>
      </div>
    </div>
  `;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.querySelector('.wwm-modal-close').addEventListener('click', close);
  m.querySelector('#wwmShareClose').addEventListener('click', close);
  const copyTo = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      m.querySelector('#wwmShareMsg').textContent = `✓ ${label} コピー完了`;
    } catch (e) {
      m.querySelector('#wwmShareMsg').textContent = '手動でコピーしてください';
    }
  };
  m.querySelector('#wwmShareCopyNormal').addEventListener('click', () => copyTo(url, '通常URL'));
  m.querySelector('#wwmShareCopyObs').addEventListener('click', () => copyTo(obsUrl, 'OBS URL'));
  const opSlider = m.querySelector('#wwmObsOpacity');
  const opVal = m.querySelector('#wwmObsOpacityVal');
  const bgPicker = m.querySelector('#wwmObsBg');
  const t1Picker = m.querySelector('#wwmObsT1');
  const t2Picker = m.querySelector('#wwmObsT2');
  const acPicker = m.querySelector('#wwmObsAc');
  const lbgPicker = m.querySelector('#wwmObsLbg');
  const obsTa = m.querySelector('#wwmShareUrlObs');
  const previewWrap = m.querySelector('#wwmSharePreviewWrap');
  const previewFrame = m.querySelector('#wwmSharePreviewFrame');
  const togglePreviewBtn = m.querySelector('#wwmShareTogglePreview');
  let previewOn = false;
  let previewDebounce = null;
  const refreshPreviewSrc = () => {
    if (!previewOn) return;
    if (previewDebounce) clearTimeout(previewDebounce);
    previewDebounce = setTimeout(() => { previewFrame.src = obsUrl; }, 250);
  };
  const refreshObs = () => {
    const pct = parseInt(opSlider.value, 10);
    opVal.textContent = pct + '%';
    obsUrl = buildObsUrl(pct, bgPicker.value, t1Picker.value, t2Picker.value, acPicker.value, lbgPicker.value);
    obsTa.value = obsUrl;
    try { localStorage.setItem(OVL_KEY, JSON.stringify({ op: pct, bg: bgPicker.value, t1: t1Picker.value, t2: t2Picker.value, ac: acPicker.value, lbg: lbgPicker.value })); } catch(_) {}
    refreshPreviewSrc();
  };
  togglePreviewBtn.addEventListener('click', () => {
    previewOn = !previewOn;
    previewWrap.style.display = previewOn ? 'block' : 'none';
    togglePreviewBtn.textContent = previewOn ? 'プレビュー閉じる' : 'プレビュー表示';
    if (previewOn) previewFrame.src = obsUrl;
    else previewFrame.src = 'about:blank';
  });
  const scaleSlider = m.querySelector('#wwmSharePreviewScale');
  const scaleVal = m.querySelector('#wwmSharePreviewScaleVal');
  const scaleClip = m.querySelector('#wwmSharePreviewClip');
  const INNER_W = 640, INNER_H = 900;
  scaleSlider.addEventListener('input', () => {
    const pct = parseInt(scaleSlider.value, 10);
    const s = pct / 100;
    scaleVal.textContent = pct + '%';
    previewFrame.style.transform = `scale(${s})`;
    scaleClip.style.width = (INNER_W * s) + 'px';
    scaleClip.style.height = (INNER_H * s) + 'px';
  });
  opSlider.addEventListener('input', refreshObs);
  bgPicker.addEventListener('input', refreshObs);
  t1Picker.addEventListener('input', refreshObs);
  t2Picker.addEventListener('input', refreshObs);
  acPicker.addEventListener('input', refreshObs);
  lbgPicker.addEventListener('input', refreshObs);
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
if (!document.documentElement.classList.contains('wwm-view-sidebar')) {
  setTimeout(_checkChangelog, 500);
}

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
// (OBS Share view = wwm-view-sidebar 時は baseline (現在装備) のみ表示)
function _fmtItem(item, params, baseParams) {
  const cur = _fmtItemValue(item, params);
  if (!baseParams || baseParams === params) return cur;
  const base = _fmtItemValue(item, baseParams);
  if (base === cur) return cur;
  if (document.documentElement.classList.contains('wwm-view-sidebar')) {
    return base; // OBS view: 現在装備の値だけ
  }
  return `<span class="wwm-sb-baseline">${base}</span> <span class="wwm-sb-arrow">▶</span> ${cur}`;
}

function _renderItem(item, params, depth, baseParams) {
  depth = depth || 0;
  const cls = depth > 0 ? ' wwm-sb-sub' : '';
  // cap未到達 / 無駄属性ATK 警告
  const cw = params?._capWarnings?.[item.key];
  const ww = params?._wasteWarnings?.[item.key];
  let warnIcon = '';
  if (cw) warnIcon = ` <span class="wwm-sb-warn" title="cap未到達: ${cw.current}/${cw.threshold}">⚠</span>`;
  else if (ww != null) {
    const wTitle = typeof ww === 'string' ? ww : `active path以外の属性ATK (合計 ${ww})`;
    warnIcon = ` <span class="wwm-sb-warn" title="${wTitle}">⚠</span>`;
  }
  let html = `
    <div class="wwm-sb-row${cls}" data-item-key="${item.key}">
      <span class="wwm-sb-label">${_label(item.label, item.key)}${warnIcon}</span>
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
  const _avSrc = ri?._avatarBase64 || ri?._avatarUrl || '';
  const avatar = _avSrc ? `<img class="wwm-sb-avatar" src="${_avSrc}" alt="avatar">` : '';
  const charName = ri?.roleName ? `${ri.roleName} <span class="wwm-muted">Lv${ri.level||'?'}</span>` : '';
  const importBtnLabel = (window.T && window.T.importBtn) || 'IMPORT';
  const powerLabel = _label(cfg.header?.title, '総合武力');
  const header = `
    <div class="wwm-sb-mini-hero-card">
      <span class="wwm-sb-l-bl"></span><span class="wwm-sb-l-br"></span>
      <div class="wwm-sb-mini-hero-ink"></div>
      <div class="wwm-sb-top">
        ${avatar}
        <div class="wwm-sb-info">
          ${charName ? `<div class="wwm-sb-charname">${charName}</div>` : ''}
          <div class="wwm-sb-power"><span class="wwm-muted">${powerLabel}</span> <b>${totalPower}</b></div>
          <div class="wwm-sb-martial"><span class="wwm-muted">${(window.T&&T.martialIndex)||'武格指数'}</span> <b id="wwmSbMartialScore">-</b> <span class="wwm-sb-tier-badge" id="wwmSbTierBadge"></span></div>
        </div>
      </div>
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
           ${(window.T?.sbEmptyTitle) || 'まだインポートデータがありません。'}<br>
           ${(window.T?.sbEmptyHint) || '上部「IMPORT」ボタンから取り込みできます。'}
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
  root.innerHTML = header + `<div class="wwm-sb-rest">${sections}${noticeHtml}</div>`;
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
const _GEAR_SLOT_LABELS_JA = {
  '1': '主武器', '2': '副武器', '3': '冠甲', '4': '胸甲', '21': '弓箭',
  '10': '環', '11': '佩', '5': '膝甲', '8': '腕甲', '9': '射玦'
};
const _GEAR_SLOT_I18N_KEY = {
  '1': 'slotMain', '2': 'slotSub', '3': 'slotHelm', '4': 'slotChest', '21': 'slotBow',
  '10': 'slotRing', '11': 'slotPendant', '5': 'slotLegs', '8': 'slotHands', '9': 'slotDisc'
};
const _GEAR_SLOT_LABELS = new Proxy({}, {
  get: (_, slot) => {
    // 装備カードラベルは全言語 ja固定 (ユーザー指定)
    return _GEAR_SLOT_LABELS_JA[slot];
  }
});
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
    const setName = setsCat?.[suffix]?.names?.[lang] || setsCat?.[suffix]?.names?.ja || setsCat?.[suffix]?.names?.en || '';
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
      const isObs = document.documentElement.classList.contains('wwm-view-sidebar');
      if (isObs) {
        el.innerHTML = `<b>${origContrib[slot].toLocaleString()}</b>`;
      } else {
        const delta = curScore - origContrib[slot];
        const sign = delta > 0 ? '+' : '';
        const cls = delta > 0 ? 'wwm-equip-delta-pos' : 'wwm-equip-delta-neg';
        el.innerHTML = `<b>${origContrib[slot].toLocaleString()}</b> <span class="wwm-equip-delta ${cls}">${sign}${delta.toLocaleString()}</span>`;
      }
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
  const state = (typeof _getEffectiveState === 'function') ? _getEffectiveState() : (() => { try { return JSON.parse(localStorage.getItem('wwm_last_state_v1') || 'null'); } catch(_) { return null; } })();
  const tiers = state?.xinfaTiers || {};
  const xinfaIconsRaw = window.__WWM_ROLEINFO?._xinfaIcons || roleInfo?._xinfaIcons || [];
  const xinfaIconsB64 = window.__WWM_ROLEINFO?._xinfaIconsBase64 || roleInfo?._xinfaIconsBase64 || [];
  const xinfaIcons = xinfaIconsRaw.map((u, i) => xinfaIconsB64[i] || u);
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
          <div class="wwm-xinfa-header"><b>${name}</b></div>
        </div>
        <span class="wwm-xinfa-card-score" data-xinfa-score="${i}"><b>...</b></span>
      </div>
    `;
  }).join('');
  // 武庫カード (5枚目) — virtual反映
  const effState = (typeof _getEffectiveState === 'function') ? _getEffectiveState() : state;
  const arsenalState = effState?.arsenal || state?.arsenal || null;
  const pathKey = arsenalState?.path || 'phys';
  const pathLabelMap = { phys: 'pathPhys', bellstrike: 'pathBellstrike', stonesplit: 'pathStonesplit', silkbind: 'pathSilkbind', bamboocut: 'pathBamboocut' };
  const pathName = (window.T && window.T[pathLabelMap[pathKey]]) || pathKey;
  const arsenalCard = `
    <div class="wwm-xinfa-slot wwm-arsenal-slot" data-arsenal-slot onclick="WWMXinfa.openArsenalEdit()">
      <div class="wwm-xinfa-rail"><span class="wwm-xinfa-rail-text">武庫</span></div>
      <img class="wwm-xinfa-icon" src="assets/icons/open-treasure-chest.svg" alt="">
      <div class="wwm-xinfa-inner">
        <div class="wwm-xinfa-header"><b>${pathName}</b></div>
      </div>
      <span class="wwm-xinfa-card-score" data-arsenal-score><b>...</b></span>
    </div>
  `;
  root.innerHTML = cards + arsenalCard;
  _computeXinfaCardScores(roleInfo);
  _computeArsenalCardScore(roleInfo);
}

async function _computeArsenalCardScore(roleInfo) {
  if (!window.WWMStats?.buildStatParams || typeof window.computeExpected !== 'function') return;
  const state = (typeof _getEffectiveState === 'function') ? _getEffectiveState() : (() => { try { return JSON.parse(localStorage.getItem('wwm_last_state_v1') || 'null'); } catch(_) { return null; } })();
  try {
    // base = 武庫込
    const baseParams = await window.WWMStats.buildStatParams(roleInfo, state);
    window.computeExpected(baseParams);
    const baseScore = _scoreWithBonus(roleInfo);
    // 武庫無 = state.arsenal を空に
    const stateNoArs = JSON.parse(JSON.stringify(state || {}));
    if (stateNoArs.arsenal) stateNoArs.arsenal = { path: stateNoArs.arsenal.path, tiers: {} };
    const noArsParams = await window.WWMStats.buildStatParams(roleInfo, stateNoArs);
    window.computeExpected(noArsParams);
    const noArsScore = _scoreWithBonus(roleInfo);
    const contrib = Math.round(baseScore - noArsScore);
    const el = document.querySelector('[data-arsenal-score] b');
    if (el) el.textContent = contrib.toLocaleString();
    // base 復元
    window.computeExpected(baseParams);
  } catch(e) {}
}

async function _computeXinfaCardScores(roleInfo) {
  if (!window.WWMStats?.buildStatParams || typeof window.computeExpected !== 'function') return;
  // virtual passive (心法ID差替) も反映するため、roleInfo は effectiveRoleInfo で上書き保証
  const ri = (typeof _getEffectiveRoleInfo === 'function')
    ? (_getEffectiveRoleInfo() || roleInfo)
    : roleInfo;
  // virtual xinfa tiers (Edit modal適用結果) を反映するため _getEffectiveState() 使用
  const state = (typeof _getEffectiveState === 'function')
    ? _getEffectiveState()
    : (() => { try { return JSON.parse(localStorage.getItem('wwm_last_state_v1') || 'null'); } catch(_) { return null; } })();
  // base score
  let baseScore = 0;
  try {
    const baseParams = await window.WWMStats.buildStatParams(ri, state);
    window.computeExpected(baseParams);
    baseScore = _scoreWithBonus(ri);
  } catch (e) { return; }
  // 各 xinfa slot → tier 0 で再算出 = その心法寄与
  for (let i = 0; i < 4; i++) {
    try {
      const altState = JSON.parse(JSON.stringify(state || {}));
      if (!altState.xinfaTiers) altState.xinfaTiers = {};
      altState.xinfaTiers[i] = 0;
      altState.xinfaTiers[String(i)] = 0;
      const p = await window.WWMStats.buildStatParams(ri, altState);
      window.computeExpected(p);
      const noXinfa = _scoreWithBonus(ri);
      const delta = Math.round(baseScore - noXinfa);
      const el = document.querySelector(`[data-xinfa-score="${i}"]`);
      if (el) el.innerHTML = `<b>${delta.toLocaleString()}</b>`;
    } catch (e) {}
  }
  // 復元
  try {
    const finalParams = await window.WWMStats.buildStatParams(ri, state);
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
  // xinfa effects key → i18n key + 表示形式
  const _XINFA_EFFECT_LABEL = {
    allMartialBoost: { tkey: 'allMartialBoost', pct: true },
    globalDmgBoost:  { tkey: 'globalDmgBoost',  pct: true },
    critRateAdj:     { tkey: 'critRate',        pct: true },
    critRate:        { tkey: 'critRate',        pct: true },
    crit:            { tkey: 'critRate',        pct: true },
    critBoost:       { tkey: 'critBoost',       pct: true },
    sympathyRate:    { tkey: 'sympathyRate',    pct: true },
    affinity:        { tkey: 'sympathyRate',    pct: true },
    sympathyBoost:   { tkey: 'sympathyBoost',   pct: true },
    affinityDmgBonus:{ tkey: 'sympathyBoost',   pct: true },
    elemAtkBoost:    { tkey: 'elemAtkBoost',    pct: true },
    attrDmgBonus:    { tkey: 'elemAtkBoost',    pct: true },
    weaponBonus:     { tkey: 'weaponBonus',     pct: true },
    physDmgBonus:    { tkey: 'weaponBonus',     pct: true },
    physDmgBoost:    { tkey: 'weaponBonus',     pct: true },
    outerPen:        { tkey: 'penPhys',         pct: false },
    outerPenAdd:     { tkey: 'penPhys',         pct: false },
    physPen:         { tkey: 'penPhys',         pct: false },
    elemPen:         { tkey: 'penVoid',         pct: false },
    attrPen:         { tkey: 'penVoid',         pct: false },
    bossBoost:       { tkey: 'bossDmg',         pct: true },
    bossDmg:         { tkey: 'bossDmg',         pct: true },
    minPhys:         { tkey: 'minPhysATK',      pct: false },
    maxPhys:         { tkey: 'maxPhysATK',      pct: false },
    minPhysATK:      { tkey: 'minPhysATK',      pct: false },
    maxPhysATK:      { tkey: 'maxPhysATK',      pct: false },
    minPhysATKAdd:   { tkey: 'minPhysATK',      pct: false },
    maxPhysATKAdd:   { tkey: 'maxPhysATK',      pct: false },
    addCritRate:     { tkey: 'addCritRate',     pct: true },
    directCrit:      { tkey: 'addCritRate',     pct: true },
    addSympathyRate: { tkey: 'addSympathyRate', pct: true },
    directAffinity:  { tkey: 'addSympathyRate', pct: true },
    fixedScoreBonus: { tkey: 'martialIndex',    pct: false, scoreCustom: true }
  };
  function _xinfaFmtEffect(k, v) {
    const T = window.T || {};
    const def = _XINFA_EFFECT_LABEL[k];
    const label = (def && T[def.tkey]) || k;
    if (def?.scoreCustom) {
      if (!v) return `${label} +? (${T.effectUnset || '未代入'})`;
      return `${label} +${v}`;
    }
    const isPct = def?.pct;
    let valStr;
    if (isPct) {
      const pctVal = (Math.abs(v) < 1 ? v * 100 : v);
      valStr = `${pctVal.toFixed(1)}%`;
    } else {
      valStr = String(v);
    }
    return `${label} +${valStr}`;
  }
  function _effectsText(id, tier) {
    if (!id) return '';
    const x = xinfaMap[id];
    if (!x?.attributeBuff) return '';
    const effRi = (typeof _getEffectiveRoleInfo === 'function') ? _getEffectiveRoleInfo() : (window.__WWM_ROLEINFO || {});
    const myKfs = [effRi?.kongfuMain, effRi?.kongfuSub].filter(Boolean).map(v => String(v));
    const lines = [];
    for (let t = 0; t <= 6; t++) {
      const def = x.attributeBuff[`tier${t}`];
      const isActive = t <= tier;
      if (!def) {
        lines.push(`<div class="wwm-cmp-tier-line wwm-tier-empty">T${t}: <span class="wwm-tier-dash">—</span></div>`);
        continue;
      }
      const isTwoFive = (t === 2 || t === 5);
      const needsKf = !isTwoFive && Array.isArray(def.kongfuRequired) && def.kongfuRequired.length;
      const kfOk = !needsKf || def.kongfuRequired.some(k => myKfs.includes(String(k)));
      const effects = def.effects || {};
      const hasEff = Object.keys(effects).length > 0;
      // labelOverride: tier毎に effects key → 表示label の上書き (i18n対応)
      const lang = (typeof _curLang === 'function') ? _curLang() : 'ja';
      const labelOv = def.labelOverride || null;
      // T2/T5 = effects key+値表示 (ゲーム ステ画面準拠、 fixedScoreBonus 単独時は raw)
      // 他Tier = raw のみ表示 (ゲーム原文説明、 effects/fixedScoreBonus ラベル非表示、 裏で計算反映)
      let effStr;
      if (isTwoFive) {
        // fixedScoreBonus 以外の effects のみ表示
        const visibleEntries = Object.entries(effects).filter(([k]) => k !== 'fixedScoreBonus');
        effStr = visibleEntries.length > 0
          ? visibleEntries.map(([k,v]) => {
              if (labelOv && labelOv[k]) {
                const ovLabel = labelOv[k][lang] || labelOv[k].ja || labelOv[k].en || k;
                const _def = (typeof _XINFA_EFFECT_LABEL !== 'undefined') ? _XINFA_EFFECT_LABEL[k] : null;
                if (_def?.scoreCustom) return `${ovLabel} +${v || '?'}`;
                const isPct = _def?.pct;
                const valStr = isPct ? `${(Math.abs(v) < 1 ? v*100 : v).toFixed(1)}%` : String(v);
                return `${ovLabel} +${valStr}`;
              }
              return _xinfaFmtEffect(k, v);
            }).join(', ')
          : (def.raw || '-');
      } else {
        effStr = def.raw || '-';
      }
      let cls = 'wwm-tier-active';
      let warn = '';
      if (!isActive) { cls = 'wwm-tier-unrel'; warn = ' <span class="wwm-tier-warn" title="未解放">⏳</span>'; }
      else if (needsKf && !kfOk) { cls = 'wwm-tier-kfmiss'; warn = ' <span class="wwm-tier-warn" title="武器条件未満">⚠</span>'; }
      lines.push(`<div class="wwm-cmp-tier-line ${cls}">T${t}${warn}: ${effStr}</div>`);
    }
    return lines.join('');
  }
  const origName = _xName(origPassive[slotIdx]);
  const m = document.createElement('div');
  m.className = 'wwm-modal-backdrop';
  m.innerHTML = `
    <div class="wwm-modal wwm-modal-square">
      <div class="wwm-modal-header">
        <h2>${(window.T&&T.xinfaCompareTitle)||'心法比較 / COMPARISON'}</h2>
        <button class="wwm-modal-close" aria-label="Close">×</button>
      </div>
      <div class="wwm-modal-body">
        <div class="wwm-cmp-grid">
          <div class="wwm-cmp-col wwm-cmp-current">
            ${(() => { const _ic = origRi?._xinfaIconsBase64?.[slotIdx] || origRi?._xinfaIcons?.[slotIdx]; return _ic ? `<div class="wwm-cmp-bg-icon" style="background-image: url('${_ic}');"></div>` : ''; })()}
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
    if (eff) eff.innerHTML = _effectsText(newXinfaId, newTier);
    _schedule();
  });
  const tSel = m.querySelector('#wwmCmpXinfaTierSel');
  tSel.addEventListener('change', () => {
    newTier = parseInt(tSel.value, 10);
    const eff = m.querySelector('#wwmCmpXinfaEffect');
    if (eff) eff.innerHTML = _effectsText(newXinfaId, newTier);
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
  const vxi = window.__WWM_VIRTUAL_XINFA;
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
  const base = (() => { try { return JSON.parse(localStorage.getItem('wwm_last_state_v1') || 'null'); } catch(_) { return null; } })();
  const vxi = window.__WWM_VIRTUAL_XINFA;
  const vAr = window.__WWM_VIRTUAL_ARSENAL;
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
      gear:    window.__WWM_VIRTUAL || null,
      kongfu:  window.__WWM_VIRTUAL_KONGFU || null,
      xinfa:   window.__WWM_VIRTUAL_XINFA || null,
      arsenal: window.__WWM_VIRTUAL_ARSENAL || null
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
    if (d.gear)    window.__WWM_VIRTUAL = d.gear;
    if (d.kongfu)  window.__WWM_VIRTUAL_KONGFU = d.kongfu;
    if (d.xinfa)   window.__WWM_VIRTUAL_XINFA = d.xinfa;
    if (d.arsenal) window.__WWM_VIRTUAL_ARSENAL = d.arsenal;
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
      window.__WWM_PARAMS = params;
      await window.WWMSidebar.render(params);
      // donut/hero を最適化前に先行反映 (opt前なので通常更新)
      if (window.WWMHero) window.WWMHero.update(params);
      window.WWMGear.render(ri);
      if (window.WWMXinfa) window.WWMXinfa.render(ri);
      if (window.WWMDiag) window.WWMDiag.render(ri, params);
      if (window.WWMRanking) window.WWMRanking.render(ri, params);
      // 1tick 譲ってブラウザに paint 機会を与えてから重い最適化
      await new Promise(r => requestAnimationFrame(() => r()));
      // flag/donut snap は renderOptimization 内で一元管理 (await して flag衝突回避)
      if (window.WWMOpt) await window.WWMOpt.render(ri, params);
      _autoFitText();
      _saveVirtuals();
    }).catch(e => console.error('[WWM] refresh failed:', e));
  }
}

// ── Affix 統計 ラベル取得 (import.js の _STAT_LABELS 利用) ────
function _affixDisplayName(id) {
  const info = window.WWM_AFFIX?.[id];
  const key = info?.statKey;
  if (!key) return 'オプション#' + id;
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
  'lightAtkDmg', 'heavyAtkDmg', 'airborneLightAtkDmg', 'jumpStrikeDmg',
  'dualWeaponSkillDmg', 'executionDmg', 'dashDmg',
  'swordDmg', 'spearDmg', 'fanDmg', 'umbrellaDmg',
  'hengBladeDmg', 'moBladeDmg', 'dualBladesDmg', 'ropeDartDmg',
  'fanHealingBoost', 'umbrellaHealingBoost',
  'sympathyRate', 'addCritRate', 'addSympathyRate',
  // 武器固有 強化系 (全 ratio保存)
  'bleed', 'moBladeShield', 'panaceaFanHealing',
  'swordQ', 'swordCharged', 'swordSpecial',
  'namelessSwordQ', 'namelessSwordCharged', 'namelessSwordSpecial',
  'spearQ', 'spearCharged', 'spearSpecial',
  'namelessSpearQ', 'namelessSpearCharged', 'namelessSpearSpecial',
  'stormbreakerQ', 'stormbreakerCharged', 'stormbreakerSpecial',
  'fanQ', 'fanCharged', 'fanSpecial',
  'panaceaFanQ', 'panaceaFanSpecial',
  'moBladeCharged', 'moBladeSpecial',
  'phalanxbaneQ', 'phalanxbaneCharged',
  'snowpartingQ', 'snowpartingCharged', 'snowpartingVariedCombo',
  'infernalTwinbladesQ', 'infernalTwinbladesSpecial', 'infernalTwinbladesLight',
  'umbQ', 'umbCharged', 'umbDrone',
  'soulshadeUmbQ', 'soulshadeUmbCharged', 'soulshadeUmbSpecial',
  'everspringUmbQ', 'everspringUmbCharged', 'everspringUmbSpecial',
  'mortalRopeDartQ', 'mortalRopeDartCharged', 'mortalRopeDartRodent',
  'unfetteredRopeDartQ', 'unfetteredRopeDartCharged', 'unfetteredRopeDartSpecial'
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
  // 武学固有 affix (xxxQ, xxxCharged, xxxSpecial, bleed 等) → attunement (武器固有 max = 0.05@tier91)
  if (!mapKey && /Q$|Charged$|Special$|Drone$|Light$|Healing$|Shield$|Rodent$|VariedCombo$|^bleed$/.test(statKey)) {
    mapKey = 'attunement';
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
  // 編集中 kongfu state (新パネル用) — virtual あれば virtual優先
  const virtKongfu = slot === '1' ? window.__WWM_VIRTUAL_KONGFU?.kongfuMain
                   : slot === '2' ? window.__WWM_VIRTUAL_KONGFU?.kongfuSub : null;
  let newKongfuId = virtKongfu ?? origKongfuId;
  const kongfuLabel = origKongfuId ? _kfName(origKongfuId) : '';
  const kongfuHtml = kongfuLabel ? `<span class="wwm-cmp-kongfu">${kongfuLabel}</span>` : '';
  // セット系 slot: 武器/環/佩び物 = weaponSets / 弓矢/射玦 = bowSets
  const isWeaponSetSlot = ['1','2','10','11'].includes(String(slot));
  const isBowSetSlot = ['9','21'].includes(String(slot));
  const isSetEditable = isWeaponSetSlot || isBowSetSlot;
  const origSuffix = origEq.exVo?.suffix;
  // virtual あれば virtual優先
  let newSuffix = window.__WWM_VIRTUAL?.[slot]?.exVo?.suffix ?? origSuffix;
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
      const pct = (ratio != null) ? (ratio * 100).toFixed(0) : null;
      const pctColor = _ratioColor(ratio);
      const pctHtml = pct != null ? `<span class="wwm-cmp-ratio" style="color:${pctColor};font-size:11px;font-family:var(--f-mono);margin-left:6px;">${pct}%</span>` : '';
      return `
        <div class="wwm-cmp-row">
          <span class="wwm-cmp-name wwm-rank-${rkCls}" title="ID:${id}">${name}${usefulAuto?' 👍':''}</span>
          <span class="wwm-cmp-val">${_fmtAffixVal(val, sk)}${pctHtml}</span>
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
      // max 値算出: 装備個別Lv基準 → equip_max.json (Lv → tier) ベース。fallback: orig val/ratio (sameStat時)
      const _eqLv = (window.__WWM_VIRTUAL?.[slot]?.exVo?._inferredLv) ?? origEq?.exVo?._inferredLv ?? charLv;
      let maxInternal = _getAffixMax(sk, _eqLv);
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
      // 初期 ratio 計算 (val / maxInternal)
      const initRatio = (maxInternal != null && maxInternal > 0 && typeof val === 'number')
        ? Math.min(1, val / maxInternal) : null;
      const initPct = initRatio != null ? (initRatio * 100).toFixed(0) : '';
      const initColor = _ratioColor(initRatio);
      return `
        <div class="wwm-cmp-row wwm-cmp-edit-row" data-affix-idx="${idx}" data-max-internal="${maxInternal||''}">
          <select class="wwm-cmp-stat-select wwm-rank-${rkCls}" data-field="stat" data-stat-el>${optsHtml}</select>
          <div class="wwm-cmp-useful-mark" data-useful-el>${useful?'👍':''}</div>
          <div class="wwm-cmp-val-wrap">
            <input type="number" class="wwm-num-input wwm-cmp-val-input" step="${step}" min="0" ${maxAttr} value="${displayVal}" data-field="val" data-pct="${isPct?1:0}" data-pctmul="${needsMul?1:0}">
            <span class="wwm-cmp-unit" data-unit-el>${isPct?'%':''}</span>
            <span class="wwm-cmp-ratio" data-ratio-el style="color:${initColor};font-size:11px;font-family:var(--f-mono);margin-left:4px;min-width:32px;text-align:right;">${initPct?initPct+'%':''}</span>
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
    <div class="wwm-modal wwm-modal-square wwm-cmp-modal-a">
      <span class="wwm-cmp-l-bracket-tl"></span><span class="wwm-cmp-l-bracket-tr"></span>
      <span class="wwm-cmp-l-bracket-bl"></span><span class="wwm-cmp-l-bracket-br"></span>
      <div class="wwm-modal-header">
        <h2><span class="wwm-cmp-title-ja">${(window.T&&T.cmpTitleJa)||'武具対照'}</span><span class="wwm-cmp-title-en">${(window.T&&T.cmpTitleEn)||'COMPARISON'}</span><span class="wwm-cmp-seal">比</span></h2>
        <button class="wwm-modal-close" aria-label="Close">×</button>
      </div>
      <div class="wwm-modal-body">
        <div class="wwm-cmp-grid">
          <div class="wwm-cmp-col wwm-cmp-current${isBowSetSlot?' wwm-cmp-bow':''}">
            ${bgIconHtml}
            <h3 class="wwm-cmp-title">${(window.T&&T.cmpCurrent)||'現有'}${origEq?.exVo?._inferredLv ? ` <span class="wwm-cmp-lv">Lv${origEq.exVo._inferredLv}</span>` : ''}</h3>
            ${curKongfuHeader}
            ${curSetHeader}
            ${isAffixEditable ? `<div class="wwm-cmp-rows">${renderCurrentRows()}</div>` : ''}
          </div>
          <div class="wwm-cmp-divider"></div>
          <div class="wwm-cmp-col wwm-cmp-new${isBowSetSlot?' wwm-cmp-bow':''}" id="wwmCmpNewCol">
            ${bgIconHtml}
            <h3 class="wwm-cmp-title">${(window.T&&T.cmpNew)||'新置'}${(() => {
              const _curLv = window.__WWM_VIRTUAL?.[slot]?.exVo?._inferredLv ?? origEq?.exVo?._inferredLv;
              const _lvList = window.WWM_EQUIP_BASE_BY_LV?._lvList || [91, 86, 81, 71];
              const _hasTbl = !!window.WWM_EQUIP_BASE_BY_LV?.slots?.[String(slot)];
              if (!_curLv || !_hasTbl) return _curLv ? ` <span class="wwm-cmp-lv">Lv${_curLv}</span>` : '';
              const _opts = _lvList.map(lv => `<option value="${lv}" ${lv===_curLv?'selected':''}>Lv${lv}</option>`).join('');
              return ` <select id="wwmCmpNewLvSel" class="wwm-cmp-lv-select">${_opts}</select>`;
            })()}</h3>
            ${newKongfuHeader}
            ${newSetHeader}
            ${isAffixEditable ? `<div class="wwm-cmp-rows" id="wwmCmpNewRows">${renderNewRows()}</div>` : ''}
          </div>
        </div>
        <div class="wwm-cmp-footer-a">
          <div class="wwm-cmp-delta-block">
            <span class="wwm-cmp-delta-label">${(window.T&&T.cmpDeltaLabel)||'武格変動'}</span>
            <span class="wwm-cmp-preview-value" id="wwmCmpPreviewDelta">+0</span>
            <span class="wwm-cmp-delta-base" id="wwmCmpPreviewBase">—</span>
          </div>
          <div class="wwm-btn-row wwm-cmp-btn-row">
            <button class="wwm-btn-primary" id="wwmEditApply">${(window.T&&T.cmpApply)||'採用'}</button>
            <button class="wwm-btn-secondary" id="wwmEditReset">${(window.T&&T.cmpReset)||'復元'}</button>
            <button class="wwm-btn-secondary" id="wwmEditCancel">${(window.T&&T.cmpCancel)||'離脱'}</button>
          </div>
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
      // virtual装備 (Lv変更で baseAttrs 更新済) 優先、 fallback origEq
      const vEq = JSON.parse(JSON.stringify(window.__WWM_VIRTUAL?.[slot] || origEq));
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
      el.textContent = `${sign}${delta.toLocaleString()}`;
      el.className = 'wwm-cmp-preview-value ' + (delta > 0 ? 'pos' : delta < 0 ? 'neg' : 'zero');
      const baseEl = m.querySelector('#wwmCmpPreviewBase');
      if (baseEl) baseEl.textContent = `${Math.round(baseScore).toLocaleString()} → ${Math.round(vScore).toLocaleString()}`;
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
  // 新装備 Lv 変更 → base値 + affix値 (新Lv MAX×0.94) 自動更新
  const lvSel = m.querySelector('#wwmCmpNewLvSel');
  if (lvSel) {
    lvSel.addEventListener('change', async () => {
      const newLv = parseInt(lvSel.value, 10);
      await _loadEquipMax();
      // virtual eq 作成 (origEq deep clone)
      if (!window.__WWM_VIRTUAL) window.__WWM_VIRTUAL = {};
      const vEq = JSON.parse(JSON.stringify(window.__WWM_VIRTUAL[slot] || origEq));
      if (!vEq.exVo) vEq.exVo = {};
      // base値 (baseAttrs) 新Lv
      const refBase = window.WWM_EQUIP_BASE_BY_LV?.slots?.[String(slot)]?.[String(newLv)];
      if (refBase) {
        if (!vEq.exVo.baseAttrs) vEq.exVo.baseAttrs = {};
        for (const [k, v] of Object.entries(refBase)) vEq.exVo.baseAttrs[k] = v;
      }
      vEq.exVo._inferredLv = newLv;
      // 各affix 値 新Lv MAX × 0.94
      const tier = _lvToTier(newLv);
      const maxTbl = _EQUIP_MAX?.tiers?.[tier] || {};
      if (Array.isArray(vEq.exVo.baseAffixes)) {
        for (const aff of vEq.exVo.baseAffixes) {
          const d = aff.equipmentDetails;
          if (!Array.isArray(d) || d.length < 2) continue;
          const info = window.WWM_AFFIX?.[d[0]];
          const sk = info?.statKey;
          const maxKey = _STAT_TO_MAX_KEY[sk] || sk;
          const maxVal = maxTbl[maxKey];
          if (maxVal != null) {
            d[1] = +(maxVal * 0.94).toFixed(4);
            d[2] = 0.94;
          }
        }
      }
      window.__WWM_VIRTUAL[slot] = vEq;
      if (typeof window._saveVirtuals === 'function') window._saveVirtuals();
      // newAffixes (modal display source) を in-place 上書き
      const newAffixData = JSON.parse(JSON.stringify(vEq.exVo?.baseAffixes || []));
      newAffixes.length = 0;
      for (const a of newAffixData) newAffixes.push(a);
      // affix row 部分再描画
      const rowsEl = m.querySelector('#wwmCmpNewRows');
      if (rowsEl) rowsEl.innerHTML = renderNewRows();
      _bindRowEvents();
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
      row.dataset.maxInternal = maxInt != null ? maxInt : '';
    }
    const unitEl = row.querySelector('[data-unit-el]');
    if (unitEl) unitEl.textContent = isPct ? '%' : '';
    _updateRatioEl(row);
  }
  function _updateRatioEl(row) {
    const el = row.querySelector('[data-ratio-el]');
    if (!el) return;
    const inp = row.querySelector('.wwm-cmp-val-input');
    const maxInt = parseFloat(row.dataset.maxInternal);
    if (!inp || !maxInt || maxInt <= 0) { el.textContent = ''; return; }
    let v = parseFloat(inp.value);
    if (isNaN(v)) { el.textContent = ''; return; }
    if (inp.dataset.pctmul === '1') v = v / 100;
    const ratio = Math.min(1, Math.max(0, v / maxInt));
    const pct = (ratio * 100).toFixed(0);
    el.textContent = pct + '%';
    el.style.color = _ratioColor(ratio);
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
        _updateRatioEl(row);
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
    if (isWeaponSlot) {
      if (newKongfuId && newKongfuId !== origKongfuId) {
        if (slot === '1') window.__WWM_VIRTUAL_KONGFU.kongfuMain = newKongfuId;
        else if (slot === '2') window.__WWM_VIRTUAL_KONGFU.kongfuSub = newKongfuId;
      } else {
        // 元に戻す: virtual から削除
        if (slot === '1') delete window.__WWM_VIRTUAL_KONGFU.kongfuMain;
        else if (slot === '2') delete window.__WWM_VIRTUAL_KONGFU.kongfuSub;
      }
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
  // hero-current = 現在装備 (仮想装備なし時は最新 statusScore で baseline を同期、 state変更追従)
  const _hasVirtual = (window.__WWM_VIRTUAL && Object.keys(window.__WWM_VIRTUAL).length) ||
                      (window.__WWM_VIRTUAL_KONGFU && Object.keys(window.__WWM_VIRTUAL_KONGFU).length) ||
                      (window.__WWM_VIRTUAL_XINFA && (
                        (window.__WWM_VIRTUAL_XINFA.passive && window.__WWM_VIRTUAL_XINFA.passive.length) ||
                        (window.__WWM_VIRTUAL_XINFA.tiers && Object.keys(window.__WWM_VIRTUAL_XINFA.tiers).length)
                      ));
  const _baseline = window.__WWM_BASELINE;
  let currentScore;
  if (!_hasVirtual) {
    // 仮想装備なし: 最新 statusScore を baseline として再同期 (state変更で乖離防止)
    currentScore = statusScore;
    if (_baseline) {
      _baseline.statusScore = statusScore;
      _baseline.expected = total;
      try { localStorage.setItem('wwm_baseline_score_v1', JSON.stringify(_baseline)); } catch(_) {}
    }
  } else {
    currentScore = (_baseline && typeof _baseline.statusScore === 'number')
      ? Math.round(_baseline.statusScore)
      : statusScore;
  }
  if (typeof window.countUp === 'function') {
    window.countUp('heroScore', currentScore, 0);
    window.countUp('heroCompactScore', currentScore, 0);
  } else {
    setText('heroScore', currentScore.toLocaleString());
    setText('heroCompactScore', currentScore.toLocaleString());
  }
  // current tier badge — 現在装備 (baseline) 基準
  const wl2 = effRi?.worldLv || 14;
  const thr2 = 6700 * Math.pow(0.8, 14 - wl2);
  const curTier = currentScore >= thr2 ? 'SS'
                : currentScore >= thr2*0.9 ? 'S'
                : currentScore >= thr2*0.8 ? 'A'
                : currentScore >= thr2*0.6 ? 'B' : 'C';
  const tbCur = document.getElementById('heroTierBadge');
  if (tbCur) { tbCur.textContent = curTier; tbCur.className = 'hero-tier tier-badge tier-' + curTier; }
  // sidebar 武格指数行 tier badge + score — 現在の装備 (baseline) 基準
  const sbTb = document.getElementById('wwmSbTierBadge');
  const sbMs = document.getElementById('wwmSbMartialScore');
  if (sbTb) {
    const baselineTier = window.__WWM_BASELINE?.tier || curTier;
    sbTb.textContent = baselineTier;
    sbTb.className = 'wwm-sb-tier-badge tier-' + baselineTier;
  }
  if (sbMs) {
    const baselineScore = window.__WWM_BASELINE?.statusScore;
    sbMs.textContent = (typeof baselineScore === 'number') ? Math.round(baselineScore).toLocaleString() : Math.round(statusScore).toLocaleString();
  }
  // tier に応じたスコア色 (theme別)
  const _isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const TIER_COLOR = _isLight
    ? { SS: '#b8860b', S: '#c83c2b', A: '#2d5a3a', B: '#7a5a20', C: '#5a4226' }
    : { SS: '#ffd970', S: '#ff6b50', A: '#a8d4b4', B: '#c9b88a', C: 'rgba(232,215,180,0.55)' };
  const TIER_SHADOW = _isLight
    ? {
        SS: '0 0 8px rgba(184,134,11,0.6), 0 0 18px rgba(184,134,11,0.35)',
        S:  '0 0 8px rgba(200,60,43,0.5), 0 0 16px rgba(200,60,43,0.25)',
        A:  '0 0 8px rgba(45,90,58,0.5), 0 0 16px rgba(45,90,58,0.25)',
        B:  '0 0 6px rgba(122,90,32,0.4)',
        C:  '0 0 4px rgba(90,66,38,0.3)'
      }
    : {
        SS: '0 0 12px rgba(255,217,112,0.95), 0 0 28px rgba(255,180,40,0.7), 0 0 60px rgba(255,100,20,0.55), 0 0 100px rgba(200,60,43,0.4)',
        S:  '0 0 18px rgba(255,107,80,0.55), 0 0 36px rgba(255,107,80,0.28)',
        A:  '0 0 18px rgba(168,212,180,0.45), 0 0 36px rgba(168,212,180,0.25)',
        B:  '0 0 14px rgba(201,184,138,0.45), 0 0 28px rgba(201,184,138,0.22)',
        C:  '0 0 10px rgba(232,215,180,0.18)'
      };
  // heroScore Tier別変色 廃止 (paper固定)
  const numEl = document.getElementById('heroScore');
  if (numEl) {
    numEl.style.color = '';
    numEl.style.textShadow = '';
  }
  // compact tier badge: 廃止 (heroCompactTierBadge hidden)
  setText('heroCompactDmg', Math.round(total).toLocaleString());
  setText('heroCompactExp', Math.round(total).toLocaleString());
  // NEXT 側 = 仮想装備込みの statusScore (新装備プレビュー、countUp で変動アニメ)
  const baseline = window.__WWM_BASELINE;
  const baseEl = document.getElementById('heroScoreBaseline');
  if (baseline && typeof baseline.statusScore === 'number') {
    const baseScore = statusScore; // NEXT = 仮想装備込み
    if (typeof window.countUp === 'function') {
      window.countUp('heroScoreBaseline', baseScore, 0);
    } else if (baseEl) {
      baseEl.textContent = baseScore.toLocaleString();
    }
    // baseline tier badge (tier 未保存 baseline 用 fallback)
    const blTb = document.getElementById('heroBaselineTierBadge');
    if (blTb) {
      // NEXT 横の baseline tier badge は表示しない
      blTb.hidden = true;
      blTb.textContent = '';
      let bTier = baseline.tier;
      if (!bTier) {
        const wl = window.__WWM_ROLEINFO?.worldLv || 14;
        const thr = 6700 * Math.pow(0.8, 14 - wl);
        bTier = baseScore >= thr ? 'SS'
              : baseScore >= thr * 0.9 ? 'S'
              : baseScore >= thr * 0.8 ? 'A'
              : baseScore >= thr * 0.6 ? 'B' : 'C';
      }
      const TIER_COLOR_B = _isLight
        ? { SS: '#b8860b', S: '#c83c2b', A: '#2d5a3a', B: '#7a5a20', C: '#5a4226' }
        : { SS: '#ffd970', S: '#ff6b50', A: '#a8d4b4', B: '#c9b88a', C: 'rgba(232,215,180,0.55)' };
      const TIER_SHADOW_B = _isLight
        ? { SS:'0 0 8px rgba(184,134,11,0.5)', S:'0 0 8px rgba(200,60,43,0.4)', A:'0 0 8px rgba(45,90,58,0.4)', B:'0 0 6px rgba(122,90,32,0.3)', C:'0 0 4px rgba(90,66,38,0.25)' }
        : {
            SS: '0 0 12px rgba(255,217,112,0.95), 0 0 28px rgba(255,180,40,0.7), 0 0 60px rgba(255,100,20,0.55), 0 0 100px rgba(200,60,43,0.4)',
            S:  '0 0 18px rgba(255,107,80,0.55), 0 0 36px rgba(255,107,80,0.28)',
            A:  '0 0 18px rgba(168,212,180,0.45), 0 0 36px rgba(168,212,180,0.25)',
            B:  '0 0 14px rgba(201,184,138,0.45), 0 0 28px rgba(201,184,138,0.22)',
            C:  '0 0 10px rgba(232,215,180,0.18)'
          };
      // hero-next-val Tier別変色 廃止
      if (baseEl) {
        baseEl.style.color = '';
        baseEl.style.opacity = '';
        baseEl.style.textShadow = '';
      }
    }
  } else {
    if (typeof window.countUp === 'function') window.countUp('heroScoreBaseline', currentScore, 0);
    else if (baseEl) baseEl.textContent = currentScore.toLocaleString();
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
  openEdit: openXinfaEdit,
  openArsenalEdit: () => openArsenalEdit()
};
function openArsenalEdit() {
  const T_ = window.T || {};
  const state = (() => { try { return JSON.parse(localStorage.getItem('wwm_last_state_v1') || 'null'); } catch(_) { return null; } })();
  const origArsenal = state?.arsenal || { path: 'phys', tiers: {} };
  const virtArsenal = window.__WWM_VIRTUAL_ARSENAL;
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
      return `<div class="wwm-cmp-row" style="grid-template-columns:50px 1fr;"><span style="font-family:var(--f-mono);font-weight:700;">Lv${lv}</span><span>${valTxt}</span></div>`;
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
        ? `<span style="color:var(--gold-bright);font-size:11px;">${sL.min}+${minV} ${sL.max}+${maxV}</span>`
        : `<span style="display:inline-flex;gap:6px;font-size:11px;color:var(--gold-bright);align-items:center;">
             <span>${sL.min}</span><input type="number" class="wwm-num-input" data-tier-min="${lv}" min="0" max="${preset.min}" step="1" value="${minV}" style="width:50px;">
             <span>${sL.max}</span><input type="number" class="wwm-num-input" data-tier-max="${lv}" min="0" max="${preset.max}" step="1" value="${maxV}" style="width:50px;">
           </span>`;
      return `<div class="wwm-cmp-row" style="grid-template-columns:50px 1fr;align-items:center;"><span style="font-family:var(--f-mono);font-weight:700;">Lv${lv}</span>
        <span style="display:flex;flex-direction:column;gap:2px;">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="checkbox" data-tier="${lv}" ${peaked?'checked':''}> <span>頂点</span></label>
          ${inputArea}
        </span>
      </div>`;
    }).join('');
  }
  function _pathRadios(curKey) {
    return PATHS.map(p => `<label class="wwm-radio-label" style="display:inline-flex;align-items:center;gap:4px;margin-right:8px;cursor:pointer;"><input type="radio" name="wwmArsenalEditPath" value="${p.key}" ${p.key===curKey?'checked':''}>${pathLabel(p.key)}</label>`).join('');
  }
  m.innerHTML = `
    <div class="wwm-modal wwm-modal-wide wwm-modal-square">
      <div class="wwm-modal-bg-icon" style="background-image:url('assets/icons/open-treasure-chest.svg');"></div>
      <div class="wwm-modal-header">
        <h2>武庫編集 / ARSENAL</h2>
        <button class="wwm-modal-close" aria-label="Close">×</button>
      </div>
      <div class="wwm-modal-body">
        <div class="wwm-cmp-grid">
          <div class="wwm-cmp-col wwm-cmp-current">
            <div class="wwm-cmp-title">現在の武庫</div>
            <div class="wwm-cmp-kongfu-header" style="margin-bottom:8px;">${pathLabel(origArsenal.path)}</div>
            <div class="wwm-cmp-rows">${_curRows(origArsenal)}</div>
          </div>
          <div class="wwm-cmp-col wwm-cmp-new">
            <div class="wwm-cmp-title">新しい武庫</div>
            <div style="margin-bottom:8px;flex-wrap:wrap;display:flex;" id="wwmArsenalEditPaths">${_pathRadios(newArsenal.path)}</div>
            <div class="wwm-cmp-rows" id="wwmArsenalEditRows">${_newRows(newArsenal)}</div>
          </div>
        </div>
        <div class="wwm-cmp-delta-row" id="wwmArsenalEditDelta" style="margin-top:12px;"></div>
        <div class="wwm-btn-row" style="margin-top:16px;">
          <button class="wwm-btn-primary" id="wwmArsenalEditApply">適用 (sidebar反映)</button>
          <button class="wwm-btn-secondary" id="wwmArsenalEditReset">元に戻す</button>
          <button class="wwm-btn-secondary" id="wwmArsenalEditCancel">キャンセル</button>
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
    const ri = (typeof _getEffectiveRoleInfo === 'function') ? _getEffectiveRoleInfo() : window.__WWM_ROLEINFO;
    if (!ri || !window.WWMStats?.buildStatParams) return;
    const baseState = (typeof _getEffectiveState === 'function') ? _getEffectiveState() : (() => { try { return JSON.parse(localStorage.getItem('wwm_last_state_v1') || 'null'); } catch(_) { return null; } })();
    try {
      // 現 (virtual_arsenal 無視 = 元 arsenal)
      const baseStateNoVirtArs = JSON.parse(JSON.stringify(baseState || {}));
      const origState = (() => { try { return JSON.parse(localStorage.getItem('wwm_last_state_v1') || 'null'); } catch(_) { return null; } })();
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
        const sign = delta >= 0 ? '+' : '';
        const color = delta > 0 ? 'var(--jade-bright,#a8d4b4)' : delta < 0 ? 'var(--vermilion-bright,#e8513a)' : 'var(--paper-mute)';
        deltaEl.innerHTML = `<span style="font-size:12px;color:var(--paper-mute);">Δ Score: </span><span style="font-family:var(--f-mono);font-weight:700;color:${color};">${sign}${delta.toLocaleString()}</span> <span style="color:var(--paper-mute);">(${Math.round(newScore).toLocaleString()})</span>`;
      }
      // 復元
      window.computeExpected(p1);
    } catch(e) {}
  }
  _schedulePreview();
  m.querySelector('#wwmArsenalEditApply').addEventListener('click', () => {
    window.__WWM_VIRTUAL_ARSENAL = newArsenal;
    if (typeof window._saveVirtuals === 'function') window._saveVirtuals();
    close();
    if (typeof window._refreshAll === 'function') window._refreshAll();
  });
  m.querySelector('#wwmArsenalEditReset').addEventListener('click', () => {
    delete window.__WWM_VIRTUAL_ARSENAL;
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
  try { return JSON.parse(localStorage.getItem(_HIST_KEY) || '[]'); } catch(_) { return []; }
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
  const ri = window.__WWM_ROLEINFO;
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
      const useful = d.useful ? ' 👍' : '';
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
