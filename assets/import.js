// ── WWM-DMGCALC Import Module ─────────────────────────────────────
// 公式ツール bookmarklet からの roleInfo データ受取 + Preview + Apply

const IMPORT_STORAGE_KEY = 'wwm_last_import_v1';
const IMPORT_STATE_KEY = 'wwm_last_state_v1';
const IMPORT_HASH_PREFIX = '#import=';

// ── base64url decode ────────────────────────────────────────────
function _b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return decodeURIComponent(escape(atob(s)));
}

// ── Modal helpers ───────────────────────────────────────────────
function _createModal(id, titleKey, contentHtml) {
  let m = document.getElementById(id);
  if (m) { m.remove(); }
  m = document.createElement('div');
  m.id = id;
  m.className = 'wwm-modal-backdrop';
  m.innerHTML = `
    <div class="wwm-modal">
      <div class="wwm-modal-header">
        <h2 data-i18n="${titleKey}">${(window.T && T[titleKey]) || titleKey}</h2>
        <button class="wwm-modal-close" aria-label="Close">×</button>
      </div>
      <div class="wwm-modal-body">${contentHtml}</div>
    </div>`;
  document.body.appendChild(m);
  m.querySelector('.wwm-modal-close').addEventListener('click', () => m.remove());
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });
  return m;
}

// ── Setup Modal (Import button → このmodal) ─────────────────────
function openSetupModal() {
  const setupUrl = (location.pathname.replace(/[^/]*$/, '') + 'setup.html');
  const last = getLastImportSummary();
  const lastHtml = last
    ? `<div class="wwm-last-import">
         <strong data-i18n="importLastLabel">${(window.T && T.importLastLabel) || '直前のインポート'}:</strong>
         <div>${last.roleName} (Lv ${last.level}) — ${last.importedAt}</div>
         <button class="wwm-btn-secondary" id="wwmReapplyBtn" data-i18n="importReapply">${(window.T && T.importReapply) || '再適用'}</button>
       </div>`
    : `<p class="wwm-muted" data-i18n="importNoHistory">${(window.T && T.importNoHistory) || '直前のインポートはありません'}</p>`;
  const officialUrl = 'https://www.wherewindsmeetgame.com/m/2025h5sjgj/jp/';
  const html = `
    <p data-i18n="importSetupIntro">${(window.T && T.importSetupIntro) || '公式データツールのデータをこの計算ツールに取り込むには、ブックマークレットの設定が必要です。'}</p>
    <div class="wwm-btn-row">
      <button type="button" class="wwm-btn-primary" id="wwmOpenOfficialBtn" data-i18n="importOpenOfficial">${(window.T && T.importOpenOfficial) || '公式データツールを開く'}</button>
      <a href="${setupUrl}" target="wwm-setup" rel="noopener" class="wwm-btn-secondary" data-i18n="importOpenSetup">${(window.T && T.importOpenSetup) || 'セットアップページを開く'}</a>
    </div>
    <hr>
    <p class="wwm-muted" data-i18n="importUsageHint">${(window.T && T.importUsageHint) || '設定完了後: 公式ツールを開いてブックマークレットをクリックしてください。'}</p>
    ${lastHtml}
  `;
  const m = _createModal('wwmSetupModal', 'importSetupTitle', html);
  const reBtn = m.querySelector('#wwmReapplyBtn');
  if (reBtn) reBtn.addEventListener('click', () => {
    const stored = _loadStored();
    if (stored) { m.remove(); openPreviewModal(stored.data, stored.importedAt, stored.state); }
  });
  const offBtn = m.querySelector('#wwmOpenOfficialBtn');
  if (offBtn) offBtn.addEventListener('click', () => {
    // window.open() で開く → bookmarklet 実行後の自己 close を許可するため
    window.open(officialUrl, 'wwm-official');
  });
}

// ── Preview Modal (2-step: card1=preview, card2=enhance/arsenal) ─
async function openPreviewModal(data, importedAt, savedState) {
  importedAt = importedAt || new Date().toISOString();
  await _loadDicts();
  const summary = summarizeRoleInfo(data);
  // ステップ間で状態維持。優先度: 引数 savedState > localStorage(IMPORT_STATE_KEY) > default
  const defaultState = {
    enhance: { 1: 50, 2: 50, 10: 50, 11: 50 },
    arsenal: {
      path: 'bamboocut',
      tiers: {
        41: { peaked: true, min: 12, max: 25 },
        51: { peaked: true, min: 17, max: 34 },
        56: { peaked: true, min: 17, max: 34 },
        61: { peaked: true, min: 17, max: 34 },
        71: { peaked: true, min: 17, max: 34 },
        81: { peaked: true, min: 17, max: 34 },
        86: { peaked: true, min: 17, max: 34 }
      }
    }
  };
  let stateSrc = savedState;
  if (!stateSrc) {
    try {
      const s = localStorage.getItem(IMPORT_STATE_KEY);
      if (s) stateSrc = JSON.parse(s);
    } catch(e) {}
  }
  const state = stateSrc ? JSON.parse(JSON.stringify(stateSrc)) : defaultState;
  const m = _createModal('wwmPreviewModal', 'importPreviewTitle', '<div id="wwmCardBody"></div>');
  m.querySelector('.wwm-modal').classList.add('wwm-modal-wide');
  const body = m.querySelector('#wwmCardBody');

  function renderStep1() {
    const detailHtml = renderPreviewDetail(summary, data);
    body.innerHTML = `
      <div class="wwm-preview-summary">${detailHtml}</div>
      <div class="wwm-btn-row" style="margin-top:16px;">
        <button class="wwm-btn-primary" id="wwmNextBtn">${(window.T && T.importNextBtn) || '次へ'}</button>
        <button class="wwm-btn-secondary" id="wwmCancelBtn">${(window.T && T.importCancelBtn) || 'キャンセル'}</button>
      </div>
    `;
    body.querySelector('#wwmCancelBtn').addEventListener('click', () => m.remove());
    body.querySelector('#wwmNextBtn').addEventListener('click', renderStep2);
  }

  function renderStep2() {
    body.innerHTML = renderEnhanceArsenalForm(state);
    _attachEnhanceArsenalEvents(body, state);
    body.querySelector('#wwmBackBtn').addEventListener('click', renderStep1);
    body.querySelector('#wwmCancelBtn').addEventListener('click', () => m.remove());
    body.querySelector('#wwmApplyBtn').addEventListener('click', () => {
      const msg = (window.T && T.importConfirmMsg) || '現在設定されている数値がインポートデータに差し変わりますがよろしいですか？';
      if (!confirm(msg)) return;
      applyImport(data, importedAt, state);
      m.remove();
      if (window.showToast) showToast((window.T && T.importDone) || 'インポート完了');
    });
    body.addEventListener('wwm-rerender-step2', renderStep2);
  }
  renderStep1();
}

// ── Step2 form (観音 + 武庫) ────────────────────────────────────
const _ARSENAL_TIERS = [86, 81, 71, 61, 56, 51, 41];
const _ARSENAL_TIER_PRESET = { 41: { min: 12, max: 25 }, default: { min: 17, max: 34 } };
const _ARSENAL_PATHS = [
  { key: 'phys',       ja: '汎用', minStat: 'minPhys',       maxStat: 'maxPhys'       },
  { key: 'bellstrike', ja: '鋼鳴', minStat: 'minBellstrike', maxStat: 'maxBellstrike' },
  { key: 'stonesplit', ja: '砕岩', minStat: 'minStonesplit', maxStat: 'maxStonesplit' },
  { key: 'silkbind',   ja: '糸操', minStat: 'minSilkbind',   maxStat: 'maxSilkbind'   },
  { key: 'bamboocut',  ja: '瞬嵐', minStat: 'minBamboocut',  maxStat: 'maxBamboocut'  }
];
function _arsenalStatLabels(pathKey) {
  const p = _ARSENAL_PATHS.find(x => x.key === pathKey) || _ARSENAL_PATHS[0];
  return {
    min: _STAT_LABELS[p.minStat] || p.minStat,
    max: _STAT_LABELS[p.maxStat] || p.maxStat
  };
}
function _tierLabel(lv) {
  const lang = _curLang();
  if (lang === 'en') return `Tier ${lv} Arsenal`;
  if (lang === 'zh') return `Lv.${lv}武库`;
  if (lang === 'ko') return `Lv.${lv} 무고`;
  return `Lv${lv}武庫`;
}
// インポートカード装備順 (上段: 主武器/副武器、下段: 環/佩び物)
const _ENHANCE_SLOTS = [
  { id: '1',  label: '主武器' },
  { id: '2',  label: '副武器' },
  { id: '10', label: '環'    },
  { id: '11', label: '佩び物' }
];

function renderEnhanceArsenalForm(state) {
  const T0 = window.T || {};
  const enhanceRows = _ENHANCE_SLOTS.map(s => `
    <div class="wwm-enhance-cell">
      <span class="wwm-enhance-label">${s.label}</span>
      <input type="number" min="0" max="50" value="${state.enhance[s.id]}"
             class="wwm-num-input" data-enhance-slot="${s.id}">
    </div>
  `).join('');
  const pathRadios = _ARSENAL_PATHS.map(p => `
    <label class="wwm-radio-label">
      <input type="radio" name="wwmArsenalPath" value="${p.key}" ${state.arsenal.path === p.key ? 'checked' : ''}>
      ${p.ja}
    </label>
  `).join('');
  const statLabels = _arsenalStatLabels(state.arsenal.path);
  const tierRows = _ARSENAL_TIERS.map(lv => {
    const t = state.arsenal.tiers[lv];
    const preset = lv === 41 ? _ARSENAL_TIER_PRESET[41] : _ARSENAL_TIER_PRESET.default;
    return `
      <div class="wwm-arsenal-tier" data-tier="${lv}">
        <span class="wwm-arsenal-lv">${_tierLabel(lv)}</span>
        <label class="wwm-arsenal-peaked-label">
          <input type="checkbox" class="wwm-arsenal-peaked" data-tier="${lv}" ${t.peaked ? 'checked' : ''}>
          ${T0.importArsenalPeaked || '頂点'}
        </label>
        <span class="wwm-arsenal-preset" style="${t.peaked ? '' : 'display:none'}">
          <span class="wwm-stat-label">${statLabels.min}</span> +${preset.min}
          <span class="wwm-stat-label">${statLabels.max}</span> +${preset.max}
        </span>
        <span class="wwm-arsenal-custom" style="${t.peaked ? 'display:none' : ''}">
          <span class="wwm-stat-label">${statLabels.min}</span>
          <input type="number" min="0" value="${t.min}" class="wwm-num-input" data-tier-min="${lv}">
          <span class="wwm-stat-label">${statLabels.max}</span>
          <input type="number" min="0" value="${t.max}" class="wwm-num-input" data-tier-max="${lv}">
        </span>
      </div>
    `;
  }).join('');
  return `
    <div class="wwm-step2">
      <h3 class="wwm-step2-section-title">${T0.importEnhanceTitle || '観音 (Enhance)'}</h3>
      <p class="wwm-muted" style="font-size:12px;margin:4px 0 8px;">各スロットの強化レベル (0-50)</p>
      <div class="wwm-enhance-grid">${enhanceRows}</div>

      <h3 class="wwm-step2-section-title" style="margin-top:16px;">${T0.importArsenalTitle || '武庫 (Arsenal)'}</h3>
      <div class="wwm-arsenal-paths">
        <span class="wwm-info-label">${T0.importArsenalPath || '武庫種別'}:</span>
        ${pathRadios}
      </div>
      <div class="wwm-arsenal-tiers">${tierRows}</div>
    </div>
    <div class="wwm-btn-row" style="margin-top:16px;">
      <button class="wwm-btn-secondary" id="wwmBackBtn">${T0.importBackBtn || '戻る'}</button>
      <button class="wwm-btn-primary" id="wwmApplyBtn">${T0.importApplyBtn || 'インポート実行'}</button>
      <button class="wwm-btn-secondary" id="wwmCancelBtn">${T0.importCancelBtn || 'キャンセル'}</button>
    </div>
  `;
}

function _attachEnhanceArsenalEvents(root, state) {
  // 観音 Lv変更
  root.querySelectorAll('[data-enhance-slot]').forEach(inp => {
    inp.addEventListener('input', e => {
      const v = Math.max(0, Math.min(50, parseInt(e.target.value || '0', 10)));
      state.enhance[e.target.dataset.enhanceSlot] = v;
    });
  });
  // 武庫 path 変更 → tier rows 再描画 (stat label 更新)
  root.querySelectorAll('input[name="wwmArsenalPath"]').forEach(r => {
    r.addEventListener('change', e => {
      state.arsenal.path = e.target.value;
      // 再描画は呼び出し元 (renderStep2) が必要 → ここでは event発火で対応
      root.dispatchEvent(new CustomEvent('wwm-rerender-step2', { bubbles: true }));
    });
  });
  // 武庫 頂点 toggle
  root.querySelectorAll('.wwm-arsenal-peaked').forEach(cb => {
    cb.addEventListener('change', e => {
      const lv = e.target.dataset.tier;
      const peaked = e.target.checked;
      const t = state.arsenal.tiers[lv];
      t.peaked = peaked;
      if (peaked) {
        const preset = lv === '41' ? _ARSENAL_TIER_PRESET[41] : _ARSENAL_TIER_PRESET.default;
        t.min = preset.min; t.max = preset.max;
      }
      const tierEl = root.querySelector(`.wwm-arsenal-tier[data-tier="${lv}"]`);
      tierEl.querySelector('.wwm-arsenal-preset').style.display = peaked ? '' : 'none';
      tierEl.querySelector('.wwm-arsenal-custom').style.display = peaked ? 'none' : '';
    });
  });
  // 武庫 Min/Max カスタム入力
  root.querySelectorAll('[data-tier-min]').forEach(inp => {
    inp.addEventListener('input', e => {
      const lv = e.target.dataset.tierMin;
      state.arsenal.tiers[lv].min = parseInt(e.target.value || '0', 10);
    });
  });
  root.querySelectorAll('[data-tier-max]').forEach(inp => {
    inp.addEventListener('input', e => {
      const lv = e.target.dataset.tierMax;
      state.arsenal.tiers[lv].max = parseInt(e.target.value || '0', 10);
    });
  });
}

// ── Summary / preview detail ───────────────────────────────────
function summarizeRoleInfo(d) {
  return {
    uid: d.uid || d.userId || d.roleId || d.playerId || d.id || d.roleID || d.userID || '',
    roleName: d.roleName || '?',
    level: d.level || 0,
    school: d.school,
    crDay: d.crDay,
    scoreTotal: (d.scores58 || 0) + (d.scores59 || 0) + (d.scores60 || 0),
    xiuWeiKungFu: d.xiuWeiKungFu,
    maxXiuWeiKungFu: d.maxXiuWeiKungFu,
    kongfuMain: d.kongfuMain,
    kongfuSub: d.kongfuSub,
    passiveSlots: d.passiveSlots || [],
    wearEquipCount: d.wearEquips ? Object.keys(d.wearEquips).length : 0,
    wearEquipsDetailed: d.wearEquipsDetailed || null
  };
}

function _renderEquipSlot(slot, eq) {
  if (!eq || !eq.exVo) return '';
  const ex = eq.exVo;
  const setName = _setName(ex.suffix, slot);
  const baseAttrsHtml = Object.entries(ex.baseAttrs || {}).map(([k,v]) =>
    `<li><span class="wwm-stat-name">${_BASE_ATTR_LABELS[k] || k}</span><span class="wwm-stat-val">${v}</span></li>`
  ).join('');
  const affixHtml = (ex.baseAffixes || []).map(a => {
    const d = a.equipmentDetails || [];
    const [id, val, ratio, rank, useful] = d;
    const rclass = _RANK_CLASSES[rank] || '';
    const pct = ratio !== undefined ? `<span class="wwm-stat-pct"> (${(ratio*100).toFixed(0)}%)</span>` : '';
    const star = useful ? ' <span class="wwm-affix-useful" title="ゲーム内 👍 マーク (火力寄与)">👍</span>' : '';
    return `<li class="${rclass}"><span class="wwm-stat-name">${_affixName(id)}${star}</span><span class="wwm-stat-val">${_fmtAffixVal(val)}${pct}</span></li>`;
  }).join('');
  const slotLabel = _SLOT_LABELS[slot] || ('slot ' + slot);
  return `
    <div class="wwm-equip-slot" data-slot="${slot}">
      <div class="wwm-equip-slot-header"><b>${slotLabel}</b>${setName ? ` <span class="wwm-muted">- ${setName}</span>` : ''}</div>
      ${baseAttrsHtml ? `<div class="wwm-equip-base"><b>基本ステータス</b><ul class="wwm-list">${baseAttrsHtml}</ul></div>` : ''}
      ${affixHtml ? `<div class="wwm-equip-affix"><b>副ステータス</b><ul class="wwm-list">${affixHtml}</ul></div>` : ''}
    </div>
  `;
}

function _curLang() {
  return (window.currentLang) || (document.documentElement.lang) || 'ja';
}
function _pickName(names, fallback) {
  if (!names) return fallback;
  const lang = _curLang();
  return names[lang] || names.ja || names.en || fallback;
}
function _kongfuName(id) {
  if (id === undefined || id === null || id === 0) return '—';
  try {
    const k = window.WWM_KONGFU;
    if (k && k[id]) return _pickName(k[id].names, '武術ID ' + id);
  } catch(e) {}
  return '武術ID ' + id;
}
function _xinfaName(id) {
  if (id === undefined || id === null || id === 0) return '—';
  try {
    const x = window.WWM_XINFA;
    if (x && x[id]) return _pickName(x[id].names, '心法ID ' + id);
  } catch(e) {}
  return '心法ID ' + id;
}
async function _loadDicts() {
  if (window.WWM_KONGFU && window.WWM_XINFA && window.WWM_SETS && window.WWM_AFFIX) return;
  try {
    const [kr, xr, sr, ar] = await Promise.all([
      window.WWM_KONGFU ? Promise.resolve(window.WWM_KONGFU) : fetch('data/kongfu.json').then(r => r.json()),
      window.WWM_XINFA  ? Promise.resolve(window.WWM_XINFA)  : fetch('data/xinfa.json').then(r => r.json()),
      window.WWM_SETS   ? Promise.resolve(window.WWM_SETS)   : fetch('data/sets.json').then(r => r.json()),
      window.WWM_AFFIX  ? Promise.resolve(window.WWM_AFFIX)  : fetch('data/affix.json').then(r => r.json())
    ]);
    window.WWM_KONGFU = kr;
    window.WWM_XINFA = xr;
    window.WWM_SETS = sr;
    window.WWM_AFFIX = ar;
  } catch(e) { console.warn('[WWM Import] dict load failed:', e); }
}

// statKey → 日本語名 (WW Math 由来 statKey)
const _STAT_LABELS = {
  body: '体', power: '会', agility: '速', momentum: '力', defense: '防御',
  maxHp: '気血最大値', minPhys: '最小外功攻撃', maxPhys: '最大外功攻撃',
  physDef: '外功防御', physPen: '外功貫通', physResist: '外功耐性',
  minBellstrike: '最小鋼鳴攻撃', maxBellstrike: '最大鋼鳴攻撃', bellstrikePen: '鋼鳴貫通',
  minStonesplit: '最小砕岩攻撃', maxStonesplit: '最大砕岩攻撃', stonesplitPen: '砕岩貫通',
  minSilkbind: '最小糸操攻撃', maxSilkbind: '最大糸操攻撃', silkbindPen: '糸操貫通',
  minBamboocut: '最小瞬嵐攻撃', maxBamboocut: '最大瞬嵐攻撃', bamboocutPen: '瞬嵐貫通',
  minVoid: '最小無相攻撃', maxVoid: '最大無相攻撃',
  precision: '命中率', crit: '会心率', affinity: '会意率',
  allWeaponDmg: '全武学ダメ',
  swordDmg: '剣ダメ強化', spearDmg: '槍ダメ強化', moBladeDmg: '墨刀ダメ強化',
  dualBladesDmg: '双剣ダメ強化', fanDmg: '扇ダメ強化', umbrellaDmg: '傘ダメ強化',
  hengBladeDmg: '横刀ダメ', ropeDartDmg: '縄鏢ダメ',
  fanHealingBoost: '扇治癒強化', umbrellaHealingBoost: '傘治癒強化',
  lightAtkDmg: '軽撃ダメ強化', heavyAtkDmg: '重撃ダメ強化',
  airborneLightAtkDmg: '空中軽撃ダメ強化', jumpStrikeDmg: '跳躍撃ダメ強化',
  dualWeaponSkillDmg: '双武器技ダメ強化', executionDmg: '処刑ダメ強化', dashDmg: '突進ダメ強化',
  bossDmg: 'BOSSダメージ', playerUnitDmg: 'PvPダメージ',
  stMysticDmg: '単体奇術ダメ', stBurstMysticDmg: '単体爆発奇術ダメ',
  stControlMysticDmg: '単体制御奇術ダメ強化', areaMysticDmg: '範囲奇術ダメ強化',
  areaDmgMysticDmg: '範囲ダメ奇術強化', areaDebuffMysticDmg: '範囲弱体奇術強化',
  bleed: '出血ダメ強化', moBladeShield: '墨刀盾',
  panaceaFanHealing: '薬扇治癒',
  // 武学固有 (各種Q/Charged/Special)
  swordQ: '剣Q強化', swordCharged: '剣チャージ強化', swordSpecial: '剣特殊強化',
  namelessSwordQ: '無銘剣Q強化', namelessSwordCharged: '無銘剣チャージ強化', namelessSwordSpecial: '無銘剣特殊強化',
  spearQ: '槍Q強化', spearCharged: '槍チャージ強化', spearSpecial: '槍特殊強化',
  namelessSpearQ: '無銘槍Q強化', namelessSpearCharged: '無銘槍チャージ強化', namelessSpearSpecial: '無銘槍特殊強化',
  fanQ: '扇Q強化', fanCharged: '扇チャージ強化', fanSpecial: '扇特殊強化',
  panaceaFanQ: '薬扇Q強化', panaceaFanSpecial: '薬扇特殊強化',
  moBladeCharged: '墨刀チャージ強化', moBladeSpecial: '墨刀特殊強化',
  stormbreakerQ: '嵐雷Q強化', stormbreakerCharged: '嵐雷チャージ強化', stormbreakerSpecial: '嵐雷特殊強化',
  phalanxbaneQ: '破陣Q強化', phalanxbaneCharged: '破陣チャージ強化',
  infernalTwinbladesQ: '獄炎双剣Q強化', infernalTwinbladesSpecial: '獄炎双剣特殊強化', infernalTwinbladesLight: '獄炎双剣軽撃強化',
  umbQ: '傘Q強化', umbCharged: '傘チャージ強化', umbDrone: '傘ドローン強化',
  soulshadeUmbQ: '誘魂傘Q強化', soulshadeUmbCharged: '誘魂傘チャージ強化', soulshadeUmbSpecial: '誘魂傘特殊強化',
  everspringUmbQ: '千紅傘Q強化', everspringUmbCharged: '千紅傘チャージ強化', everspringUmbSpecial: '千紅傘特殊強化',
  mortalRopeDartQ: '浮塵縄Q強化', mortalRopeDartCharged: '浮塵縄チャージ強化', mortalRopeDartRodent: '浮塵縄・鼠強化',
  unfetteredRopeDartQ: '飛縄Q強化', unfetteredRopeDartCharged: '飛縄チャージ強化', unfetteredRopeDartSpecial: '飛縄特殊強化',
  snowpartingQ: '斬雪Q強化', snowpartingCharged: '斬雪チャージ強化', snowpartingVariedCombo: '斬雪コンボ強化'
};

// 弓系 internal ID → 日本語名 (Zb() null返却分の補完)
const _BOW_INTERNAL_LABELS = {
  290: '弓矢基礎ダメ', 291: '弱点ダメ',
  293: '明鏡止水消費減', 294: '明鏡止水時間+',
  296: '空中降下低下', 298: '最大飛行時間+'
};

// ── スロット / ステ名 解決 ───────────────────────────────────────
const _SLOT_LABELS = {
  '1': '主武器', '2': '副武器',
  '3': '冠', '4': '胸当て', '5': '膝鎧', '8': '小手',
  '9': '射玦', '10': '環', '11': '佩び物', '21': '弓矢'
};
const _SLOT_ORDER = ['1', '2', '10', '11', '3', '4', '5', '8', '21', '9'];
const _BASE_ATTR_LABELS = {
  MIN_W_ATK: '最小外功攻撃', MAX_W_ATK: '最大外功攻撃',
  W_DEF: '外功防御', HP_MAX: '気血最大値',
  ARCHER_DAMAGE: '弓矢基礎ダメ', ARCHER_WEAKPOINT_DAMAGE: '弓矢弱点ダメ'
};
// 推測 affix ID → name (equip_max Tier91 値との一致から推測)
const _AFFIX_LABELS = {
  // 武器 main affix
  '9213011': '速',
  // 装飾品 main affix
  '9233001': '最小外功攻撃強化',
  '9233002': '最大外功攻撃強化',
  // 共通 sub
  '9293004': '速',
  '9293007': '最小外功攻撃強化',  '9293008': '最大外功攻撃強化',
  // 9293016/9293017 ハードコード削除 → affix.json 由来の path-specific (最大瞬嵐攻撃力等) に自動解決
  '9293018': '命中率強化',         '9293019': '会心率強化',
  '9293020': '会意率強化',
  '9293025': '武器種武学ダメ増加',
  '9293028': '全武学効果増加',
  '9293032': '単体爆発奇術ダメ',
  '9293033': 'BOSSダメージ',
  // 防具 main affix
  '9243003': '命中率強化',
  '9243005': '会意率強化',
  '9253004': '会心率強化',
  '9253005': '会意率強化',
  // 弓 main affix
  '9273001': '弓矢基礎ダメ',
  '9273004': '最大飛行時間+',
  // 弓 sub affix
  '9283002': '弓矢基礎ダメ',
  '9283003': '弱点ダメージ強化',
  '9283004': '明鏡止水消費減',
  '9283005': '明鏡止水時間+',
  '9283007': '空中降下低下',
  // セット効果 affix
  '270701': '外功貫通強化',    // 帰燕
  '270703': '無相貫通',         // 帰燕
  '270502': '獄炎双剣・軽撃', // 江凝
  '270505': '浮塵縄・鼠'      // 江凝
};
const _RANK_LABELS = { 1: '青', 2: '紫', 3: '金' };
const _RANK_CLASSES = { 1: 'wwm-rank-blue', 2: 'wwm-rank-purple', 3: 'wwm-rank-gold' };
function _affixName(id) {
  // 1) ハードコード優先 (旧 _AFFIX_LABELS で覆ったもの — 微調整用)
  if (_AFFIX_LABELS[id]) return _AFFIX_LABELS[id];
  // 2) WWM_AFFIX (data/affix.json) から statKey 解決
  const a = window.WWM_AFFIX && window.WWM_AFFIX[id];
  if (a) {
    if (a.statKey && _STAT_LABELS[a.statKey]) return _STAT_LABELS[a.statKey];
    if (a.statKey) return a.statKey;  // 未訳 statKey
    if (a.internal && _BOW_INTERNAL_LABELS[a.internal]) return _BOW_INTERNAL_LABELS[a.internal];
    if (a.internal) return 'internal#' + a.internal;
  }
  return 'affix#' + id;
}
function _setName(suffix, slot) {
  const s = window.WWM_SETS;
  if (!s) return '';
  const key = String(suffix);
  // 武器 (slot 1,2,10,11) → weaponSets、弓 (slot 9,21) → bowSets、防具 (slot 3,4,5,8) → defensiveSets
  const isBow = (slot === '9' || slot === '21');
  const isArmor = (slot === '3' || slot === '4' || slot === '5' || slot === '8');
  const sets = isBow ? (s.bowSets || {}) : (isArmor ? (s.defensiveSets || {}) : (s.weaponSets || {}));
  if (sets[key]) return _pickName(sets[key].names, '');
  // fallback: 全カテゴリ探索
  for (const cat of ['weaponSets', 'bowSets', 'defensiveSets']) {
    if (s[cat] && s[cat][key]) return _pickName(s[cat][key].names, '');
  }
  return '';
}
function _fmtAffixVal(v) {
  // 0-1 range → %、それ以外 → 小数1桁
  if (typeof v !== 'number') return String(v);
  if (v > 0 && v < 1) return (v * 100).toFixed(1) + '%';
  return v.toFixed(1);
}

function renderPreviewDetail(s, d) {
  const xin = s.passiveSlots || [];
  return `
    <div class="wwm-info-grid">
      <div class="wwm-info-col">
        ${s.uid ? `<div class="wwm-info-row"><span class="wwm-info-label">UID</span><span class="wwm-info-val">${s.uid}</span></div>` : ''}
        <div class="wwm-info-row"><span class="wwm-info-label">キャラ名</span><span class="wwm-info-val">${s.roleName} (Lv ${s.level})</span></div>
        <div class="wwm-info-row"><span class="wwm-info-label">主武術</span><span class="wwm-info-val">${_kongfuName(s.kongfuMain)}</span></div>
        <div class="wwm-info-row"><span class="wwm-info-label">副武術</span><span class="wwm-info-val">${_kongfuName(s.kongfuSub)}</span></div>
      </div>
      <div class="wwm-info-col">
        <div class="wwm-info-row"><span class="wwm-info-label">心法 1</span><span class="wwm-info-val">${_xinfaName(xin[0])}</span></div>
        <div class="wwm-info-row"><span class="wwm-info-label">心法 2</span><span class="wwm-info-val">${_xinfaName(xin[1])}</span></div>
        <div class="wwm-info-row"><span class="wwm-info-label">心法 3</span><span class="wwm-info-val">${_xinfaName(xin[2])}</span></div>
        <div class="wwm-info-row"><span class="wwm-info-label">心法 4</span><span class="wwm-info-val">${_xinfaName(xin[3])}</span></div>
      </div>
      <div class="wwm-info-col">
        <div class="wwm-info-row"><span class="wwm-info-label">武術進度</span><span class="wwm-info-val">${s.xiuWeiKungFu} / ${s.maxXiuWeiKungFu}</span></div>
      </div>
    </div>
    ${s.wearEquipsDetailed ? `
      <div class="wwm-equip-section">
        <h3 style="margin:12px 0 6px 0;font-size:14px;">装備詳細</h3>
        ${_SLOT_ORDER.filter(slot => s.wearEquipsDetailed[slot]).map(slot => _renderEquipSlot(slot, s.wearEquipsDetailed[slot])).join('')}
      </div>
    ` : ''}
    <details class="wwm-raw-details">
      <summary>生 JSON データ表示</summary>
      <pre class="wwm-pre">${JSON.stringify(d, null, 2)}</pre>
    </details>
  `;
}

// ── localStorage 永続化 ─────────────────────────────────────────
function _saveStored(data, importedAt, state) {
  try {
    localStorage.setItem(IMPORT_STORAGE_KEY, JSON.stringify({ data, importedAt, state }));
  } catch(e) { console.warn('import storage failed:', e); }
}
function _loadStored() {
  try {
    const s = localStorage.getItem(IMPORT_STORAGE_KEY);
    if (!s) return null;
    return JSON.parse(s);
  } catch(e) { return null; }
}
function getLastImportSummary() {
  const s = _loadStored();
  if (!s) return null;
  const sum = summarizeRoleInfo(s.data);
  return {
    roleName: sum.roleName,
    level: sum.level,
    importedAt: new Date(s.importedAt).toLocaleString()
  };
}

// ── Apply: data + 観音/武庫 state を localStorage 保存 + 計算ツール 反映 ─
function applyImport(data, importedAt, state) {
  _saveStored(data, importedAt, state);
  try { localStorage.setItem(IMPORT_STATE_KEY, JSON.stringify(state)); } catch(e) {}
  console.log('[WWM Import] applied:', { data, state });
  // stat params 構築 + sidebar 描画
  if (window.WWMStats && window.WWMSidebar) {
    window.WWMStats.buildStatParams(data, state).then(params => {
      window.__WWM_PARAMS = params;
      window.__WWM_ROLEINFO = data;
      window.WWMSidebar.render(params);
      if (window.WWMGear) window.WWMGear.render(data);
      if (window.WWMHero) window.WWMHero.update(params);
    }).catch(e => console.error('[WWM] stats build failed:', e));
  }
  if (typeof window.calculate === 'function') window.calculate();
}

// ── BroadcastChannel リレー ─────────────────────────────────────
// 公式tool タブが bookmarklet で計算ツールに置換された場合、既存の計算ツールタブが
// あればそちらにデータを渡してこのタブを自己破棄、無ければそのまま Preview表示。
let _bc = null;
try { _bc = new BroadcastChannel('wwm-import'); } catch(e) {}

if (_bc) {
  _bc.onmessage = (e) => {
    if (!e.data) return;
    if (e.data.type === 'import-relay' && e.data.payload) {
      // 他タブからのリレー受信 → ack送信 + Preview表示
      try { _bc.postMessage({ type: 'import-ack', id: e.data.id }); } catch(_) {}
      openPreviewModal(e.data.payload);
      try { window.focus(); } catch(_) {}
    }
  };
}

// ── Hash 検知 (page load 時自動実行) ────────────────────────────
function handleHashOnLoad() {
  const h = location.hash || '';
  if (!h.startsWith(IMPORT_HASH_PREFIX)) return;
  const b64 = h.slice(IMPORT_HASH_PREFIX.length);
  try {
    const json = _b64urlDecode(b64);
    const data = JSON.parse(json);
    history.replaceState(null, '', location.pathname + location.search);
    // 他の計算ツールタブが存在するか BroadcastChannel で ping
    _relayOrShow(data);
  } catch(e) {
    console.error('[WWM Import] hash decode failed:', e);
    if (window.showToast) showToast('インポートデータ解析失敗: ' + e.message);
  }
}

function _relayOrShow(data) {
  if (!_bc) { openPreviewModal(data); return; }
  const id = Math.random().toString(36).slice(2);
  let acked = false;
  const ackHandler = (e) => {
    if (e.data && e.data.type === 'import-ack' && e.data.id === id) acked = true;
  };
  _bc.addEventListener('message', ackHandler);
  try { _bc.postMessage({ type: 'import-relay', id, payload: data }); } catch(_) {}
  setTimeout(() => {
    _bc.removeEventListener('message', ackHandler);
    if (acked) {
      // 他タブが Preview処理済 → このタブ (新規スクリプト生成タブ) を閉じる
      try { window.close(); } catch(_) {}
    } else {
      // 他タブなし → 自分で表示
      openPreviewModal(data);
    }
  }, 250);
}

// ── Public exports ──────────────────────────────────────────────
window.WWMImport = {
  openSetup: openSetupModal,
  openPreview: openPreviewModal,
  handleHashOnLoad: handleHashOnLoad,
  getLastImport: getLastImportSummary
};

// page load 時: hash がなければ最後の import を localStorage から auto-load。
// データ無い場合も sidebar は placeholder で描画。
function _autoLoadLastImport() {
  if ((location.hash || '').startsWith(IMPORT_HASH_PREFIX)) return;  // hash flow が処理
  const stored = _loadStored();
  if (!stored?.data) {
    // データ無 → sidebar placeholder のみ描画
    if (window.WWMSidebar) window.WWMSidebar.render(null);
    return;
  }
  if (window.WWMStats && window.WWMSidebar) {
    window.WWMStats.buildStatParams(stored.data, stored.state).then(params => {
      window.__WWM_PARAMS = params;
      window.__WWM_ROLEINFO = stored.data;
      window.WWMSidebar.render(params);
      if (window.WWMGear) window.WWMGear.render(stored.data);
      if (window.WWMHero) window.WWMHero.update(params);
    }).catch(e => console.error('[WWM] auto-load failed:', e));
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    handleHashOnLoad();
    _autoLoadLastImport();
  });
} else {
  handleHashOnLoad();
  _autoLoadLastImport();
}
// 既存タブ再利用時 (タブ名 wwm-dmgcalc で window.open される) は full reload せず
// hash のみ変更されるため hashchange でも検知する
window.addEventListener('hashchange', () => {
  if ((location.hash || '').startsWith(IMPORT_HASH_PREFIX)) {
    handleHashOnLoad();
    try { window.focus(); } catch(e) {}
  }
});
