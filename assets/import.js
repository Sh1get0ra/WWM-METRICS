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
function _createModal(id, titleKey, contentHtml, bgIconUrl) {
  let m = document.getElementById(id);
  if (m) { m.remove(); }
  m = document.createElement('div');
  m.id = id;
  m.className = 'wwm-modal-backdrop';
  const iconHtml = bgIconUrl
    ? `<div class="wwm-modal-bg-icon" style="background-image:url('${bgIconUrl}');"></div>` : '';
  m.innerHTML = `
    <div class="wwm-modal wwm-modal-square">
      ${iconHtml}
      <div class="wwm-modal-header">
        <h2 data-i18n="${titleKey}">${(window.T && T[titleKey]) || titleKey}</h2>
        <button class="wwm-modal-close" aria-label="Close">×</button>
      </div>
      <div class="wwm-modal-body">${contentHtml}</div>
    </div>`;
  document.body.appendChild(m);
  m.querySelector('.wwm-modal-close').addEventListener('click', () => m.remove());
  return m;
}

// ── Setup Modal (Import button → このmodal、2-step inline) ───────
function openSetupModal() {
  const officialUrl = 'https://www.wherewindsmeetgame.com/m/2025h5sjgj/jp/';
  const m = _createModal('wwmSetupModal', 'importSetupTitle', '<div id="wwmSetupBody"></div>', 'assets/icons/scroll-quill.svg');
  const body = m.querySelector('#wwmSetupBody');

  function renderIntro() {
    const last = getLastImportSummary();
    const lastHtml = last
      ? `<div class="wwm-last-import">
           <strong data-i18n="importLastLabel">${(window.T && T.importLastLabel) || '直前のインポート'}:</strong>
           <div>${last.roleName} (Lv ${last.level}) — ${last.importedAt}</div>
           <div class="wwm-reapply-row">
             <button class="wwm-btn-secondary" id="wwmReapplyBtn" data-i18n="importReapply">${(window.T && T.importReapply) || '再適用'}</button>
             <span class="wwm-reapply-note">${(window.T && T.importReapplyNote) || '前回データをそのまま再インポート。<br>最新装備で取り込むには 公式データツール から再度ブックマークレット実行。'}</span>
           </div>
         </div>`
      : `<p class="wwm-muted" data-i18n="importNoHistory">${(window.T && T.importNoHistory) || '直前のインポートはありません'}</p>`;
    const calcUrl = location.origin + location.pathname.replace(/[^/]*$/, '');
    const bmSrc = "(async()=>{const C='" + calcUrl + "',H='www.wherewindsmeetgame.com',A='https://s2.easebar.com/78ae9d90792a3e9b/role/roleInfo',T=10000;if(location.host!==H){alert('公式ツール ('+H+') で実行してください');return;}const t=document.createElement('div');t.style.cssText='position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#000c;color:#fff;padding:12px 20px;border-radius:6px;z-index:99999;font:14px sans-serif';t.textContent='WWM-DMGCALC: 読込中...';document.body.appendChild(t);const i2b=async u=>{try{const r=await fetch(u);const bl=await r.blob();return await new Promise(rs=>{const f=new FileReader();f.onload=()=>rs(f.result);f.onerror=()=>rs('');f.readAsDataURL(bl);});}catch(_){return '';}};try{const k=(document.cookie.match(/(?:^|;\\s*)token=([^;]+)/)||[])[1];if(!k)throw new Error('未ログインです');const c=new AbortController,d=setTimeout(()=>c.abort(),T);const r=await fetch(A,{headers:{access_token:k},credentials:'include',signal:c.signal});clearTimeout(d);if(!r.ok)throw new Error('HTTP '+r.status);const j=await r.json();if(!j.data)throw new Error(j.msg||'API err');try{const av=document.querySelector('img[src*=\"head/images\"]')?.src;if(av){j.data._avatarUrl=av;t.textContent='アバター取得中...';const b64=await i2b(av);if(b64)j.data._avatarBase64=b64;}}catch(_){}try{const xi=[...document.querySelectorAll('.icon-item .icon img.icon')].map(i=>i.src).filter(s=>s&&s.includes('xinfa/images'));if(xi.length){j.data._xinfaIcons=xi;t.textContent='心法アイコン取得中...';j.data._xinfaIconsBase64=await Promise.all(xi.map(u=>i2b(u)));}}catch(_){}const s=JSON.stringify(j.data),b=btoa(unescape(encodeURIComponent(s))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');t.textContent='転送中...';window.open(C+'#import='+b,'_blank');t.textContent='完了';setTimeout(()=>{t.remove();try{window.close();}catch(_){}},800);}catch(e){t.textContent='エラー: '+e.message;t.style.background='#c00';setTimeout(()=>t.remove(),5000);}})();";
    const bmUrl = 'javascript:' + encodeURIComponent(bmSrc);
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    body.innerHTML = `
      <p data-i18n="importSetupIntro">${(window.T && T.importSetupIntro) || '公式データツールのデータをこの計算ツールに取り込むには、ブックマークレットの設定が必要です。'}</p>
      <p data-i18n="importUsageHint">${(window.T && T.importUsageHint) || '設定完了後: 公式ツールを開いてブックマークレットをクリックしてください。'}</p>
      <details class="wwm-setup-collapse">
        <summary>${(window.T && T.importStep1Title) || 'Step 1: ブックマークレット 初回セットアップ (未登録時のみ開く)'}</summary>
        <div class="wwm-setup-collapse-body">
          <div class="wwm-setup-tabs">
            <button type="button" class="wwm-setup-tab${isMobile?'':' active'}" data-tab="pc">${(window.T && T.importTabPC) || 'PC'}</button>
            <button type="button" class="wwm-setup-tab${isMobile?' active':''}" data-tab="mobile">${(window.T && T.importTabMobile) || 'モバイル'}</button>
          </div>
          <div class="wwm-setup-panel" data-panel="pc" ${isMobile?'hidden':''}>
            <ol class="wwm-setup-steps">
              <li>${(window.T && T.importPcStep1) || 'ブックマークバー表示 (Chrome/Edge: <code>Ctrl+Shift+B</code>)'}</li>
              <li>${(window.T && T.importPcStep2) || '下のボタンを<b>ドラッグ</b>してブックマークバーへ:'}<br><a class="wwm-bm-link" id="wwmBmLink" data-i18n="importBmLabel" href="${bmUrl}">${(window.T && T.importBmLabel) || '風燕計インポート'}</a></li>
              <li>${(window.T && T.importPcStep3) || '下の「公式データツールを開く」 → ログイン後、登録したブックマークをクリック'}</li>
            </ol>
          </div>
          <div class="wwm-setup-panel" data-panel="mobile" ${isMobile?'':'hidden'}>
            <ol class="wwm-setup-steps">
              <li>${(window.T && T.importMobStep1) || '下のコードをコピー:'}<br><textarea class="wwm-bm-code" id="wwmBmCode" readonly>${bmUrl}</textarea><br><button class="wwm-btn-secondary" id="wwmCopyBtn">${(window.T && T.importCopy) || 'コピー'}</button></li>
              <li>${(window.T && T.importMobStep2) || '公式ツールをブックマーク登録'}</li>
              <li>${(window.T && T.importMobStep3) || 'ブックマーク編集 → URL をコピーしたコードに置換 → 名前「WWM インポート」'}</li>
              <li>${(window.T && T.importMobStep4) || '公式ツール開いた状態で アドレスバーに「WWM」入力 → 候補タップ'}</li>
            </ol>
          </div>
        </div>
      </details>
      <div class="wwm-btn-row" style="margin-top:16px;margin-bottom:16px;">
        <button type="button" class="wwm-btn-primary" id="wwmOpenOfficialBtn" data-i18n="importOpenOfficial">${(window.T && T.importOpenOfficial) || '公式データツールを開く'}</button>
      </div>
      ${lastHtml}
    `;
    const re = body.querySelector('#wwmReapplyBtn');
    if (re) re.addEventListener('click', () => {
      const stored = _loadStored();
      if (stored) { m.remove(); openPreviewModal(stored.data, stored.importedAt, stored.state); }
    });
    body.querySelector('#wwmOpenOfficialBtn').addEventListener('click', () => window.open(officialUrl, 'wwm-official'));
    body.querySelectorAll('.wwm-setup-tab').forEach(t => {
      t.addEventListener('click', () => {
        const tab = t.dataset.tab;
        body.querySelectorAll('.wwm-setup-tab').forEach(x => x.classList.toggle('active', x.dataset.tab === tab));
        body.querySelectorAll('.wwm-setup-panel').forEach(p => p.hidden = (p.dataset.panel !== tab));
      });
    });
    const cp = body.querySelector('#wwmCopyBtn');
    if (cp) cp.addEventListener('click', () => {
      const ta = body.querySelector('#wwmBmCode');
      ta.select(); ta.setSelectionRange(0, 99999);
      let ok = false;
      try { ok = document.execCommand('copy'); } catch(e) {}
      const _C=(window.T&&T.importCopied)||'コピー完了 ✓', _C0=(window.T&&T.importCopy)||'コピー';
      if (navigator.clipboard) navigator.clipboard.writeText(ta.value).then(() => { cp.textContent = _C; setTimeout(() => cp.textContent = _C0, 2000); }).catch(()=>{});
      else if (ok) { cp.textContent = _C; setTimeout(() => cp.textContent = _C0, 2000); }
    });
  }

  renderIntro();
}

// ── Preview Modal (2-step: card1=preview, card2=enhance/arsenal) ─
async function openPreviewModal(data, importedAt, savedState) {
  importedAt = importedAt || new Date().toISOString();
  // setup modal が開いていれば閉じる (bookmarklet 経由 import後の残置 防止)
  const setupModal = document.getElementById('wwmSetupModal');
  if (setupModal) setupModal.remove();
  await _loadDicts();
  const summary = summarizeRoleInfo(data);
  // ステップ間で状態維持。優先度: 引数 savedState > localStorage(IMPORT_STATE_KEY) > default
  const defaultState = {
    enhance: { 1: 50, 2: 50, 10: 50, 11: 50 },
    xinfaTiers: { 0: 6, 1: 6, 2: 6, 3: 6 },
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
  const m = _createModal('wwmPreviewModal', 'importPreviewTitle', '<div id="wwmCardBody"></div>', 'assets/icons/scroll-quill.svg');
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
    body.innerHTML = renderEnhanceArsenalForm(state, data);
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
  { key: 'phys',       ja: '汎用', labelKey:'pathPhys',       minStat: 'minPhys',       maxStat: 'maxPhys'       },
  { key: 'bellstrike', ja: '鋼鳴', labelKey:'pathBellstrike', minStat: 'minBellstrike', maxStat: 'maxBellstrike' },
  { key: 'stonesplit', ja: '砕岩', labelKey:'pathStonesplit', minStat: 'minStonesplit', maxStat: 'maxStonesplit' },
  { key: 'silkbind',   ja: '糸操', labelKey:'pathSilkbind',   minStat: 'minSilkbind',   maxStat: 'maxSilkbind'   },
  { key: 'bamboocut',  ja: '瞬嵐', labelKey:'pathBamboocut',  minStat: 'minBamboocut',  maxStat: 'maxBamboocut'  }
];
function _arsenalPathLabel(p){ return (window.T && window.T[p.labelKey]) || p.ja; }
function _arsenalStatLabels(pathKey) {
  const p = _ARSENAL_PATHS.find(x => x.key === pathKey) || _ARSENAL_PATHS[0];
  return {
    min: _STAT_LABELS_PROXY[p.minStat] || p.minStat,
    max: _STAT_LABELS_PROXY[p.maxStat] || p.maxStat
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

// calc.js param名 → 日本語ラベル (game準拠)
const _XINFA_EFFECT_LABELS_JA = {
  critRate: '会心率', critRateAdj: '会心率', crit: '会心率',
  sympathyRate: '会意率', sympathyRateAdj: '会意率', affinity: '会意率',
  hitRate: '命中率', precision: '命中率',
  addCritRate: '付加会心率', addSympathyRate: '付加会意率',
  directCrit: '付加会心率', directAffinity: '付加会意率',
  critBoost: '会心攻撃強化', critDmgBonus: '会心攻撃強化',
  sympathyBoost: '会意攻撃強化', affinityDmgBonus: '会意攻撃強化',
  elemAtkBoost: '属性攻撃強化', attrDmgBonus: '属性攻撃強化',
  elemPenAdd: '属性貫通', attrPen: '属性貫通',
  minPhysATKAdd: '最小外功攻撃', maxPhysATKAdd: '最大外功攻撃',
  minPhys: '最小外功攻撃', maxPhys: '最大外功攻撃',
  outerPenAdd: '外功貫通', physPen: '外功貫通',
  physDmgBoost: '外功ダメージ強化', physDmgBonus: '外功ダメージ強化',
  allMartialBoost: '全武術効果増加', allWeaponDmg: '全武術効果増加',
  specMartialBoost: '指定武術効果強化',
  bossBoost: 'BOSSダメージ', bossDmg: 'BOSSダメージ',
  playerBoost: 'PvPダメージ', playerUnitDmg: 'PvPダメージ',
  enemyDebuff: '敵デバフ',
  // path別 min/max攻撃
  minBellstrike: '最小鋼鳴攻撃', maxBellstrike: '最大鋼鳴攻撃', bellstrikePen: '鋼鳴貫通',
  minStonesplit: '最小砕岩攻撃', maxStonesplit: '最大砕岩攻撃', stonesplitPen: '砕岩貫通',
  minSilkbind: '最小糸操攻撃', maxSilkbind: '最大糸操攻撃', silkbindPen: '糸操貫通',
  minBamboocut: '最小瞬嵐攻撃', maxBamboocut: '最大瞬嵐攻撃', bamboocutPen: '瞬嵐貫通',
  minVoid: '最小無相攻撃', maxVoid: '最大無相攻撃', voidPen: '無相貫通',
  // 防御系
  maxHp: '気血最大値', physDef: '外功防御',
  // 奇術
  stMysticDmg: '単体奇術ダメ', stBurstMysticDmg: '単体爆発奇術ダメ',
  stControlMysticDmg: '単体制御奇術ダメ', areaMysticDmg: '範囲奇術ダメ',
  areaDmgMysticDmg: '範囲ダメ奇術', areaDebuffMysticDmg: '範囲弱体奇術'
};
function _fmtXinfaVal(val) {
  if (typeof val !== 'number') return String(val);
  if (val > 0 && val < 1) return '+' + (val * 100).toFixed(1) + '%';
  return '+' + val.toFixed(1).replace(/\.0$/, '');
}
function _xinfaTierEffectsJa(eff) {
  if (!eff) return '';
  const parts = [];
  for (const [k, v] of Object.entries(eff)) {
    if (typeof v !== 'number') continue;
    const label = _XINFA_EFFECT_LABELS_JA[k] || k;
    parts.push(`${label} ${_fmtXinfaVal(v)}`);
  }
  return parts.join(', ');
}
function _xinfaEffectsText(xinfa, tier) {
  if (!xinfa?.attributeBuff || tier < 2) return '<span class="wwm-muted">効果なし</span>';
  const lang = _curLang();
  const parts = [];
  const t2eff = xinfa.attributeBuff.tier2?.effects;
  const t5eff = xinfa.attributeBuff.tier5?.effects;
  if (tier >= 2 && t2eff && Object.keys(t2eff).length) {
    if (lang === 'ja') parts.push('T2: ' + _xinfaTierEffectsJa(t2eff));
    else parts.push('T2: ' + (xinfa.attributeBuff.tier2.raw || ''));
  }
  if (tier >= 5 && t5eff && Object.keys(t5eff).length) {
    if (lang === 'ja') parts.push('T5: ' + _xinfaTierEffectsJa(t5eff));
    else parts.push('T5: ' + (xinfa.attributeBuff.tier5.raw || ''));
  }
  return parts.length ? parts.join('<br>') : '<span class="wwm-muted">効果なし</span>';
}

function renderEnhanceArsenalForm(state, roleInfo) {
  const T0 = window.T || {};
  // 心法 4スロット Tier 選択
  const passive = roleInfo?.passiveSlots || [];
  const xinfa = window.WWM_XINFA || {};
  const xinfaRows = [0,1,2,3].map(i => {
    const xid = passive[i];
    const xname = xid ? _pickName(xinfa[xid]?.names, `xinfa#${xid}`) : '—';
    const curTier = state.xinfaTiers?.[i] ?? 6;
    const opts = [0,1,2,3,4,5,6].map(t => `<option value="${t}"${t===curTier?' selected':''}>Tier ${t}</option>`).join('');
    const effText = xid ? _xinfaEffectsText(xinfa[xid], curTier) : '';
    return `
      <div class="wwm-xinfa-cell" data-xinfa-row="${i}">
        <span class="wwm-xinfa-label">${i+1}. ${xname}</span>
        <select class="wwm-xinfa-tier" data-xinfa-slot="${i}" ${xid?'':'disabled'}>${opts}</select>
        <span class="wwm-xinfa-effect">${effText}</span>
      </div>
    `;
  }).join('');
  const pathRadios = _ARSENAL_PATHS.map(p => `
    <label class="wwm-radio-label">
      <input type="radio" name="wwmArsenalPath" value="${p.key}" ${state.arsenal.path === p.key ? 'checked' : ''}>
      ${_arsenalPathLabel(p)}
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
      <h3 class="wwm-step2-section-title">${T0.importStep2XinfaTitle || '心法 Tier'}</h3>
      <p class="wwm-muted" style="font-size:12px;margin:4px 0 8px;">${T0.importStep2XinfaHint || '各心法の到達Tier (1-5)。Tier2 で Tier2効果、Tier5 で Tier5効果 加算。'}</p>
      <div class="wwm-xinfa-grid">${xinfaRows}</div>

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
  // 心法 Tier 変更
  if (!state.xinfaTiers) state.xinfaTiers = { 0: 6, 1: 6, 2: 6, 3: 6 };
  root.querySelectorAll('[data-xinfa-slot]').forEach(sel => {
    sel.addEventListener('change', e => {
      const slot = e.target.dataset.xinfaSlot;
      const v = parseInt(e.target.value, 10);
      state.xinfaTiers[slot] = isNaN(v) ? 6 : v;
      // 効果テキスト更新
      const row = e.target.closest('[data-xinfa-row]');
      const effEl = row?.querySelector('.wwm-xinfa-effect');
      if (effEl) {
        const passive = window.__WWM_ROLEINFO?.passiveSlots || [];
        const xid = passive[parseInt(slot,10)];
        const xinfa = window.WWM_XINFA?.[xid];
        effEl.innerHTML = xinfa ? _xinfaEffectsText(xinfa, state.xinfaTiers[slot]) : '';
      }
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
  const isBow = (slot === '9' || slot === '21');
  const baseAttrsHtml = isBow ? '' : Object.entries(ex.baseAttrs || {}).map(([k,v]) =>
    `<li><span class="wwm-stat-name">${_BASE_ATTR_LABELS[k] || k}</span><span class="wwm-stat-val">${v}</span></li>`
  ).join('');
  const affixHtml = isBow ? '' : (ex.baseAffixes || []).map((a, idx) => {
    const d = a.equipmentDetails || [];
    const [id, val, ratio, rank, useful] = d;
    const rclass = _RANK_CLASSES[rank] || '';
    const pct = ratio !== undefined ? `<span class="wwm-stat-pct"> (${(ratio*100).toFixed(0)}%)</span>` : '';
    const star = useful ? ' <span class="wwm-affix-useful" title="ゲーム内 👍 マーク (火力寄与)"><span class="wwm-good-icon"><svg viewBox="0 0 24 24"><path d="M2 21h4V9H2v12zm20-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L13.17 1 7.59 6.59C7.22 6.95 7 7.45 7 8v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-1z"/></svg></span></span>' : '';
    return `<li class="${rclass}"><span class="wwm-stat-name">${_affixName(id, idx)}${star}</span><span class="wwm-stat-val">${_fmtAffixVal(val)}${pct}</span></li>`;
  }).join('');
  const slotLabel = _SLOT_LABELS[slot] || ('slot ' + slot);
  return `
    <div class="wwm-equip-slot" data-slot="${slot}">
      <div class="wwm-equip-slot-header"><b>${slotLabel}</b>${setName ? ` <span class="wwm-muted">- ${setName}</span>` : ''}</div>
      ${baseAttrsHtml ? `<div class="wwm-equip-base"><b>${(window.T&&T.importBaseStats)||'基本ステータス'}</b><ul class="wwm-list">${baseAttrsHtml}</ul></div>` : ''}
      ${affixHtml ? `<div class="wwm-equip-affix"><b>${(window.T&&T.importSubStats)||'副ステータス'}</b><ul class="wwm-list">${affixHtml}</ul></div>` : ''}
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

// statKey → 4言語ラベル (WW Math 由来 statKey)
const _STAT_LABELS_I18N = {
  ja: {
    body: '体', power: '会', agility: '速', momentum: '力', defense: '防御',
    maxHp: '気血最大値', minPhys: '最小外功攻撃', maxPhys: '最大外功攻撃',
    physDef: '外功防御', physPen: '外功貫通', physResist: '外功耐性',
    minBellstrike: '最小鋼鳴攻撃', maxBellstrike: '最大鋼鳴攻撃', bellstrikePen: '鋼鳴貫通',
    minStonesplit: '最小砕岩攻撃', maxStonesplit: '最大砕岩攻撃', stonesplitPen: '砕岩貫通',
    minSilkbind: '最小糸操攻撃', maxSilkbind: '最大糸操攻撃', silkbindPen: '糸操貫通',
    minBamboocut: '最小瞬嵐攻撃', maxBamboocut: '最大瞬嵐攻撃', bamboocutPen: '瞬嵐貫通',
    minVoid: '最小無相攻撃', maxVoid: '最大無相攻撃', voidPen: '無相貫通',
    precision: '命中率', crit: '会心率', affinity: '会意率',
    allWeaponDmg: '全武学/PvP/BOSSダメ',
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
    bleed: '九変の剣 出血ダメ強化',
    moBladeShield: '断魂の刀 墨刀盾',
    panaceaFanHealing: '薬川の扇 治癒',
    swordQ: '九変の剣 Q強化', swordCharged: '九変の剣 チャージ強化', swordSpecial: '九変の剣 特殊強化',
    namelessSwordQ: '無銘の剣 Q強化', namelessSwordCharged: '無銘の剣 チャージ強化', namelessSwordSpecial: '無銘の剣 特殊強化',
    spearQ: '蛇神の槍 Q強化', spearCharged: '蛇神の槍 チャージ強化', spearSpecial: '蛇神の槍 特殊強化',
    namelessSpearQ: '無銘の槍 Q強化', namelessSpearCharged: '無銘の槍 チャージ強化', namelessSpearSpecial: '無銘の槍 特殊強化',
    stormbreakerQ: '嵐雷の槍 Q強化', stormbreakerCharged: '嵐雷の槍 チャージ強化', stormbreakerSpecial: '嵐雷の槍 特殊強化',
    fanQ: '墨筆の扇 Q強化', fanCharged: '墨筆の扇 チャージ強化', fanSpecial: '墨筆の扇 特殊強化',
    panaceaFanQ: '薬川の扇 Q強化', panaceaFanSpecial: '薬川の扇 特殊強化',
    moBladeCharged: '断魂の刀 チャージ強化', moBladeSpecial: '断魂の刀 特殊強化',
    phalanxbaneQ: '破陣の刀 Q強化', phalanxbaneCharged: '破陣の刀 チャージ強化',
    snowpartingQ: '斬雪の刀 Q強化', snowpartingCharged: '斬雪の刀 チャージ強化', snowpartingVariedCombo: '斬雪の刀 軽重撃コンボ強化',
    infernalTwinbladesQ: '獄炎の双剣 Q強化', infernalTwinbladesSpecial: '獄炎の双剣 特殊強化', infernalTwinbladesLight: '獄炎の双剣 軽撃強化',
    umbQ: '千紅の傘 Q強化', umbCharged: '千紅の傘 チャージ強化', umbDrone: '千紅の傘 ドローン強化',
    soulshadeUmbQ: '誘魂の傘 Q強化', soulshadeUmbCharged: '誘魂の傘 チャージ強化', soulshadeUmbSpecial: '誘魂の傘 特殊強化',
    everspringUmbQ: '醉夢の傘 Q強化', everspringUmbCharged: '醉夢の傘 チャージ強化', everspringUmbSpecial: '醉夢の傘 特殊強化',
    mortalRopeDartQ: '浮塵の縄 Q強化', mortalRopeDartCharged: '浮塵の縄 チャージ強化', mortalRopeDartRodent: '浮塵の縄 鼠強化',
    unfetteredRopeDartQ: '浮雲の縄 Q強化', unfetteredRopeDartCharged: '浮雲の縄 チャージ強化', unfetteredRopeDartSpecial: '浮雲の縄 特殊強化'
  },
  en: {
    body: 'Body', power: 'Power', agility: 'Agi', momentum: 'Mom', defense: 'Def',
    maxHp: 'HP Max', minPhys: 'Phys ATK Min', maxPhys: 'Phys ATK Max',
    physDef: 'Phys DEF', physPen: 'Phys Pen', physResist: 'Phys Res',
    minBellstrike: 'Bell ATK Min', maxBellstrike: 'Bell ATK Max', bellstrikePen: 'Bell Pen',
    minStonesplit: 'Stone ATK Min', maxStonesplit: 'Stone ATK Max', stonesplitPen: 'Stone Pen',
    minSilkbind: 'Silk ATK Min', maxSilkbind: 'Silk ATK Max', silkbindPen: 'Silk Pen',
    minBamboocut: 'Bam ATK Min', maxBamboocut: 'Bam ATK Max', bamboocutPen: 'Bam Pen',
    minVoid: 'Void ATK Min', maxVoid: 'Void ATK Max', voidPen: 'Void Pen',
    precision: 'Precision', crit: 'Crit', affinity: 'Affinity',
    allWeaponDmg: 'All Martial/PvP/BOSS DMG',
    swordDmg: 'Sword DMG', spearDmg: 'Spear DMG', moBladeDmg: 'Mo Blade DMG',
    dualBladesDmg: 'Twinblades DMG', fanDmg: 'Fan DMG', umbrellaDmg: 'Umbrella DMG',
    hengBladeDmg: 'Heng Blade DMG', ropeDartDmg: 'Rope Dart DMG',
    fanHealingBoost: 'Fan Heal+', umbrellaHealingBoost: 'Umb Heal+',
    lightAtkDmg: 'LA', heavyAtkDmg: 'HA',
    airborneLightAtkDmg: 'Air LA', jumpStrikeDmg: 'Jump Strike',
    dualWeaponSkillDmg: 'Dual Skill', executionDmg: 'Exec DMG', dashDmg: 'Dash DMG',
    bossDmg: 'BOSS DMG', playerUnitDmg: 'PvP DMG',
    stMysticDmg: 'ST Mystic', stBurstMysticDmg: 'ST Burst Mystic',
    stControlMysticDmg: 'ST Ctrl Mystic', areaMysticDmg: 'AOE Mystic',
    areaDmgMysticDmg: 'AOE DMG Mystic', areaDebuffMysticDmg: 'AOE Debuff Mystic',
    bleed: 'Strategic SD Bleed',
    moBladeShield: 'Soulrend MB Shield',
    panaceaFanHealing: 'Panacea FN Heal',
    swordQ: 'Strategic SD Q', swordCharged: 'Strategic SD Ch', swordSpecial: 'Strategic SD Sp',
    namelessSwordQ: 'Nameless SD Q', namelessSwordCharged: 'Nameless SD Ch', namelessSwordSpecial: 'Nameless SD Sp',
    spearQ: 'Heavenquaker SP Q', spearCharged: 'Heavenquaker SP Ch', spearSpecial: 'Heavenquaker SP Sp',
    namelessSpearQ: 'Nameless SP Q', namelessSpearCharged: 'Nameless SP Ch', namelessSpearSpecial: 'Nameless SP Sp',
    stormbreakerQ: 'Stormbreaker SP Q', stormbreakerCharged: 'Stormbreaker SP Ch', stormbreakerSpecial: 'Stormbreaker SP Sp',
    fanQ: 'Inkwell FN Q', fanCharged: 'Inkwell FN Ch', fanSpecial: 'Inkwell FN Sp',
    panaceaFanQ: 'Panacea FN Q', panaceaFanSpecial: 'Panacea FN Sp',
    moBladeCharged: 'Soulrend MB Ch', moBladeSpecial: 'Soulrend MB Sp',
    phalanxbaneQ: 'Phalanxbane MB Q', phalanxbaneCharged: 'Phalanxbane MB Ch',
    snowpartingQ: 'Snowparting HB Q', snowpartingCharged: 'Snowparting HB Ch', snowpartingVariedCombo: 'Snowparting HB LA/HC',
    infernalTwinbladesQ: 'Infernal TB Q', infernalTwinbladesSpecial: 'Infernal TB Sp', infernalTwinbladesLight: 'Infernal TB LA',
    umbQ: 'Crimson UM Q', umbCharged: 'Crimson UM Ch', umbDrone: 'Crimson UM Drone',
    soulshadeUmbQ: 'Soulbinding UM Q', soulshadeUmbCharged: 'Soulbinding UM Ch', soulshadeUmbSpecial: 'Soulbinding UM Sp',
    everspringUmbQ: 'Drunken Dream UM Q', everspringUmbCharged: 'Drunken Dream UM Ch', everspringUmbSpecial: 'Drunken Dream UM Sp',
    mortalRopeDartQ: 'Mortal RD Q', mortalRopeDartCharged: 'Mortal RD Ch', mortalRopeDartRodent: 'Mortal RD Rodent',
    unfetteredRopeDartQ: 'Cloudborne RD Q', unfetteredRopeDartCharged: 'Cloudborne RD Ch', unfetteredRopeDartSpecial: 'Cloudborne RD Sp'
  },
  zh: {
    body: '体', power: '会', agility: '速', momentum: '力', defense: '防御',
    maxHp: '气血最大值', minPhys: '最小外功攻击', maxPhys: '最大外功攻击',
    physDef: '外功防御', physPen: '外功穿透', physResist: '外功抗性',
    minBellstrike: '最小钢鸣攻击', maxBellstrike: '最大钢鸣攻击', bellstrikePen: '钢鸣穿透',
    minStonesplit: '最小碎岩攻击', maxStonesplit: '最大碎岩攻击', stonesplitPen: '碎岩穿透',
    minSilkbind: '最小丝操攻击', maxSilkbind: '最大丝操攻击', silkbindPen: '丝操穿透',
    minBamboocut: '最小瞬岚攻击', maxBamboocut: '最大瞬岚攻击', bamboocutPen: '瞬岚穿透',
    minVoid: '最小无相攻击', maxVoid: '最大无相攻击', voidPen: '无相穿透',
    precision: '命中率', crit: '会心率', affinity: '会意率',
    allWeaponDmg: '全武术/PvP/BOSS 伤害',
    swordDmg: '剑伤害强化', spearDmg: '枪伤害强化', moBladeDmg: '墨刀伤害强化',
    dualBladesDmg: '双剑伤害强化', fanDmg: '扇伤害强化', umbrellaDmg: '伞伤害强化',
    hengBladeDmg: '横刀伤害', ropeDartDmg: '绳镖伤害',
    fanHealingBoost: '扇治愈强化', umbrellaHealingBoost: '伞治愈强化',
    lightAtkDmg: '轻击伤害强化', heavyAtkDmg: '重击伤害强化',
    airborneLightAtkDmg: '空中轻击伤害强化', jumpStrikeDmg: '跃击伤害强化',
    dualWeaponSkillDmg: '双武器技伤害强化', executionDmg: '处决伤害强化', dashDmg: '冲刺伤害强化',
    bossDmg: 'BOSS伤害', playerUnitDmg: 'PvP伤害',
    stMysticDmg: '单体奇术伤害', stBurstMysticDmg: '单体爆发奇术伤害',
    stControlMysticDmg: '单体控制奇术伤害强化', areaMysticDmg: '范围奇术伤害强化',
    areaDmgMysticDmg: '范围伤害奇术强化', areaDebuffMysticDmg: '范围弱化奇术强化',
    bleed: '九变之剑 出血伤害强化',
    moBladeShield: '断魂刀 墨刀盾',
    panaceaFanHealing: '药川之扇 治愈',
    swordQ: '九变之剑 Q强化', swordCharged: '九变之剑 蓄力强化', swordSpecial: '九变之剑 特殊强化',
    namelessSwordQ: '无名剑 Q强化', namelessSwordCharged: '无名剑 蓄力强化', namelessSwordSpecial: '无名剑 特殊强化',
    spearQ: '蛇神之枪 Q强化', spearCharged: '蛇神之枪 蓄力强化', spearSpecial: '蛇神之枪 特殊强化',
    namelessSpearQ: '无名枪 Q强化', namelessSpearCharged: '无名枪 蓄力强化', namelessSpearSpecial: '无名枪 特殊强化',
    stormbreakerQ: '岚雷之枪 Q强化', stormbreakerCharged: '岚雷之枪 蓄力强化', stormbreakerSpecial: '岚雷之枪 特殊强化',
    fanQ: '墨笔之扇 Q强化', fanCharged: '墨笔之扇 蓄力强化', fanSpecial: '墨笔之扇 特殊强化',
    panaceaFanQ: '药川之扇 Q强化', panaceaFanSpecial: '药川之扇 特殊强化',
    moBladeCharged: '断魂刀 蓄力强化', moBladeSpecial: '断魂刀 特殊强化',
    phalanxbaneQ: '破阵刀 Q强化', phalanxbaneCharged: '破阵刀 蓄力强化',
    snowpartingQ: '斩雪刀 Q强化', snowpartingCharged: '斩雪刀 蓄力强化', snowpartingVariedCombo: '斩雪刀 轻重击连击强化',
    infernalTwinbladesQ: '狱炎双剑 Q强化', infernalTwinbladesSpecial: '狱炎双剑 特殊强化', infernalTwinbladesLight: '狱炎双剑 轻击强化',
    umbQ: '千红之伞 Q强化', umbCharged: '千红之伞 蓄力强化', umbDrone: '千红之伞 无人机强化',
    soulshadeUmbQ: '诱魂之伞 Q强化', soulshadeUmbCharged: '诱魂之伞 蓄力强化', soulshadeUmbSpecial: '诱魂之伞 特殊强化',
    everspringUmbQ: '醉梦之伞 Q强化', everspringUmbCharged: '醉梦之伞 蓄力强化', everspringUmbSpecial: '醉梦之伞 特殊强化',
    mortalRopeDartQ: '浮尘绳镖 Q强化', mortalRopeDartCharged: '浮尘绳镖 蓄力强化', mortalRopeDartRodent: '浮尘绳镖 鼠强化',
    unfetteredRopeDartQ: '浮云绳镖 Q强化', unfetteredRopeDartCharged: '浮云绳镖 蓄力强化', unfetteredRopeDartSpecial: '浮云绳镖 特殊强化'
  },
  ko: {
    body: '체력', power: '기세', agility: '민첩', momentum: '내공', defense: '방어',
    maxHp: '최대 체력', minPhys: '최소 외공 공격', maxPhys: '최대 외공 공격',
    physDef: '외공 방어', physPen: '외공 관통', physResist: '외공 저항',
    minBellstrike: '최소 명금 공격', maxBellstrike: '최대 명금 공격', bellstrikePen: '명금 관통',
    minStonesplit: '최소 열석 공격', maxStonesplit: '최대 열석 공격', stonesplitPen: '열석 관통',
    minSilkbind: '최소 견사 공격', maxSilkbind: '최대 견사 공격', silkbindPen: '견사 관통',
    minBamboocut: '최소 파죽 공격', maxBamboocut: '최대 파죽 공격', bamboocutPen: '파죽 관통',
    minVoid: '최소 무상 공격', maxVoid: '최대 무상 공격', voidPen: '무상 관통',
    precision: '정확도', crit: '치명타 확률', affinity: '각성 확률',
    allWeaponDmg: '모든 무술/PvP/BOSS 피해',
    swordDmg: '검 피해 강화', spearDmg: '창 피해 강화', moBladeDmg: '묵도 피해 강화',
    dualBladesDmg: '쌍검 피해 강화', fanDmg: '부채 피해 강화', umbrellaDmg: '우산 피해 강화',
    hengBladeDmg: '횡도 피해', ropeDartDmg: '승표 피해',
    fanHealingBoost: '부채 치유 강화', umbrellaHealingBoost: '우산 치유 강화',
    lightAtkDmg: '경격 피해 강화', heavyAtkDmg: '중격 피해 강화',
    airborneLightAtkDmg: '공중 경격 피해 강화', jumpStrikeDmg: '도약격 피해 강화',
    dualWeaponSkillDmg: '쌍무기 기술 피해 강화', executionDmg: '처형 피해 강화', dashDmg: '돌진 피해 강화',
    bossDmg: 'BOSS 피해', playerUnitDmg: 'PvP 피해',
    stMysticDmg: '단일 기술 피해', stBurstMysticDmg: '단일 폭발 기술 피해',
    stControlMysticDmg: '단일 제어 기술 피해 강화', areaMysticDmg: '범위 기술 피해 강화',
    areaDmgMysticDmg: '범위 피해 기술 강화', areaDebuffMysticDmg: '범위 약화 기술 강화',
    bleed: '구변검 출혈 피해 강화',
    moBladeShield: '단혼도 묵도 방패',
    panaceaFanHealing: '약천선 치유',
    swordQ: '구변검 Q 강화', swordCharged: '구변검 차지 강화', swordSpecial: '구변검 특수 강화',
    namelessSwordQ: '무명검 Q 강화', namelessSwordCharged: '무명검 차지 강화', namelessSwordSpecial: '무명검 특수 강화',
    spearQ: '사신창 Q 강화', spearCharged: '사신창 차지 강화', spearSpecial: '사신창 특수 강화',
    namelessSpearQ: '무명창 Q 강화', namelessSpearCharged: '무명창 차지 강화', namelessSpearSpecial: '무명창 특수 강화',
    stormbreakerQ: '람뢰창 Q 강화', stormbreakerCharged: '람뢰창 차지 강화', stormbreakerSpecial: '람뢰창 특수 강화',
    fanQ: '묵필선 Q 강화', fanCharged: '묵필선 차지 강화', fanSpecial: '묵필선 특수 강화',
    panaceaFanQ: '약천선 Q 강화', panaceaFanSpecial: '약천선 특수 강화',
    moBladeCharged: '단혼도 차지 강화', moBladeSpecial: '단혼도 특수 강화',
    phalanxbaneQ: '십방파진 Q 강화', phalanxbaneCharged: '십방파진 차지 강화',
    snowpartingQ: '만설의 참격 Q 강화', snowpartingCharged: '만설의 참격 차지 강화', snowpartingVariedCombo: '만설의 참격 경중격 콤보 강화',
    infernalTwinbladesQ: '옥염쌍검 Q 강화', infernalTwinbladesSpecial: '옥염쌍검 특수 강화', infernalTwinbladesLight: '옥염쌍검 경격 강화',
    umbQ: '봄의 선율 Q 강화', umbCharged: '봄의 선율 차지 강화', umbDrone: '봄의 선율 드론 강화',
    soulshadeUmbQ: '소생의 향 Q 강화', soulshadeUmbCharged: '소생의 향 차지 강화', soulshadeUmbSpecial: '소생의 향 특수 강화',
    everspringUmbQ: '일장춘몽 Q 강화', everspringUmbCharged: '일장춘몽 차지 강화', everspringUmbSpecial: '일장춘몽 특수 강화',
    mortalRopeDartQ: '운진의 궤적 Q 강화', mortalRopeDartCharged: '운진의 궤적 차지 강화', mortalRopeDartRodent: '운진의 궤적 쥐 강화',
    unfetteredRopeDartQ: '속세의 지혜 Q 강화', unfetteredRopeDartCharged: '속세의 지혜 차지 강화', unfetteredRopeDartSpecial: '속세의 지혜 특수 강화'
  }
};
const _STAT_LABELS = _STAT_LABELS_I18N.ja; // backward compat
const _STAT_LABELS_PROXY = new Proxy({}, {
  get(_, k) {
    const L = (typeof window !== 'undefined' && window.currentLang) || 'ja';
    return _STAT_LABELS_I18N[L]?.[k] || _STAT_LABELS_I18N.ja[k];
  }
});

// 弓系 internal ID → 日本語名 (Zb() null返却分の補完)
const _BOW_INTERNAL_LABELS = {
  290: '弓矢基礎ダメ', 291: '弱点ダメ',
  293: '明鏡止水消費減', 294: '明鏡止水時間+',
  296: '空中降下低下', 298: '最大飛行時間+'
};

// ── スロット / ステ名 解決 ───────────────────────────────────────
const _SLOT_LABEL_KEYS = {
  '1':'slotMain','2':'slotSub','3':'slotHelm','4':'slotChest','5':'slotLegs','8':'slotHands',
  '9':'slotDisc','10':'slotRing','11':'slotPendant','21':'slotBow'
};
const _SLOT_LABELS_JA = {
  '1':'主武器','2':'副武器','3':'冠','4':'胸当て','5':'膝鎧','8':'小手',
  '9':'射玦','10':'環','11':'佩び物','21':'弓矢'
};
const _SLOT_LABELS = new Proxy({}, {
  get(_,k){ return (window.T && window.T[_SLOT_LABEL_KEYS[k]]) || _SLOT_LABELS_JA[k] || ('slot '+k); }
});
const _SLOT_ORDER = ['1', '2', '10', '11', '3', '4', '5', '8', '21', '9'];
const _BASE_ATTR_LABEL_KEYS = {
  MIN_W_ATK:'minPhys', MAX_W_ATK:'maxPhys', W_DEF:'physDef', HP_MAX:'maxHp',
  ARCHER_DAMAGE:'archerDamage', ARCHER_WEAKPOINT_DAMAGE:'archerWeakpointDamage'
};
const _BASE_ATTR_LABELS_JA = {
  MIN_W_ATK: '最小外功攻撃', MAX_W_ATK: '最大外功攻撃',
  W_DEF: '外功防御', HP_MAX: '気血最大値',
  ARCHER_DAMAGE: '弓矢基礎ダメ', ARCHER_WEAKPOINT_DAMAGE: '弓矢弱点ダメ'
};
const _BASE_ATTR_LABELS = new Proxy({}, {
  get(_,k){
    const sk=_BASE_ATTR_LABEL_KEYS[k];
    return _STAT_LABELS_PROXY[sk] || _BASE_ATTR_LABELS_JA[k] || k;
  }
});
// affix ID → statKey (= _STAT_LABELS_I18N key 経由 多言語化)
// statKey 未登録は customKey (extraAffix*) で別途解決
const _AFFIX_LABELS_STATKEY = {
  '9213011':'agility',
  '9233001':'minPhys', '9233002':'maxPhys',
  '9293004':'agility',
  '9293007':'minPhys', '9293008':'maxPhys',
  '9293018':'precision', '9293019':'crit', '9293020':'affinity',
  '9293025':'allWeaponDmg',
  '9293028':'allMartialBoost',
  '9293032':'stBurstMysticDmg',
  '9293033':'bossDmg',
  '9243003':'precision', '9243005':'affinity',
  '9253004':'crit', '9253005':'affinity',
  '9273001':'archerBaseDmg', '9273004':'archerMaxFlightTime',
  '9283002':'archerBaseDmg', '9283003':'archerWeakpointDmg',
  '9283004':'mirrorMindCost', '9283005':'mirrorMindDuration', '9283007':'aerialFallReduce',
  '270701':'physPen', '270703':'voidPen',
  '270502':'infernalTwinbladesLight', '270505':'mortalRopeDartRodent'
};
const _AFFIX_LABELS_JA_FALLBACK = {
  '9213011':'速','9233001':'最小外功攻撃強化','9233002':'最大外功攻撃強化',
  '9293004':'速','9293007':'最小外功攻撃強化','9293008':'最大外功攻撃強化',
  '9293018':'命中率強化','9293019':'会心率強化','9293020':'会意率強化',
  '9293025':'武器種武学ダメ増加','9293028':'全武学効果増加','9293032':'単体爆発奇術ダメ','9293033':'BOSSダメージ',
  '9243003':'命中率強化','9243005':'会意率強化','9253004':'会心率強化','9253005':'会意率強化',
  '9273001':'弓矢基礎ダメ','9273004':'最大飛行時間+','9283002':'弓矢基礎ダメ','9283003':'弱点ダメージ強化',
  '9283004':'明鏡止水消費減','9283005':'明鏡止水時間+','9283007':'空中降下低下',
  '270701':'外功貫通強化','270703':'無相貫通','270502':'獄炎双剣・軽撃','270505':'浮塵縄・鼠'
};
const _AFFIX_LABELS = new Proxy({}, {
  get(_, id) {
    const sk = _AFFIX_LABELS_STATKEY[id];
    if (sk) {
      const L = (window.currentLang)||'ja';
      const v = _STAT_LABELS_I18N[L]?.[sk];
      if (v) return v;
    }
    return _AFFIX_LABELS_JA_FALLBACK[id];
  },
  has(_, id){ return id in _AFFIX_LABELS_JA_FALLBACK; }
});
const _RANK_LABELS = { 1: '青', 2: '紫', 3: '金' };
const _RANK_CLASSES = { 1: 'wwm-rank-blue', 2: 'wwm-rank-purple', 3: 'wwm-rank-gold' };
function _affixName(id, idx) {
  // 1) ハードコード優先 (旧 _AFFIX_LABELS で覆ったもの — 微調整用)
  if (_AFFIX_LABELS[id]) return _AFFIX_LABELS[id];
  // 2) WWM_AFFIX (data/affix.json) から statKey 解決
  const a = window.WWM_AFFIX && window.WWM_AFFIX[id];
  if (a) {
    if (a.statKey && _STAT_LABELS_PROXY[a.statKey]) return _STAT_LABELS_PROXY[a.statKey];
    if (a.statKey) return a.statKey;  // 未訳 statKey
    if (a.internal && _BOW_INTERNAL_LABELS[a.internal]) return _BOW_INTERNAL_LABELS[a.internal];
    if (a.internal) return 'internal#' + a.internal;
  }
  // 3) affix6 スロット (idx===5) の未登録 ID = PvP専用定音 (ユーザー仕様)。計算寄与は元々ゼロで安全弁にもなる。
  if (idx === 5) return (window.T && window.T.pvpExclusiveAffix) || 'PvP専用定音';
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
  const T_=window.T||{};
  const _xL=T_.importLabelXinfa||'心法';
  return `
    <div class="wwm-info-grid">
      <div class="wwm-info-col">
        ${s.uid ? `<div class="wwm-info-row"><span class="wwm-info-label">${T_.importLabelUID||'UID'}</span><span class="wwm-info-val">${s.uid}</span></div>` : ''}
        <div class="wwm-info-row"><span class="wwm-info-label">${T_.importLabelCharName||'キャラ名'}</span><span class="wwm-info-val">${s.roleName} (Lv ${s.level})</span></div>
        <div class="wwm-info-row"><span class="wwm-info-label">${T_.importLabelMainKf||'主武術'}</span><span class="wwm-info-val">${_kongfuName(s.kongfuMain)}</span></div>
        <div class="wwm-info-row"><span class="wwm-info-label">${T_.importLabelSubKf||'副武術'}</span><span class="wwm-info-val">${_kongfuName(s.kongfuSub)}</span></div>
      </div>
      <div class="wwm-info-col">
        <div class="wwm-info-row"><span class="wwm-info-label">${_xL} 1</span><span class="wwm-info-val">${_xinfaName(xin[0])}</span></div>
        <div class="wwm-info-row"><span class="wwm-info-label">${_xL} 2</span><span class="wwm-info-val">${_xinfaName(xin[1])}</span></div>
        <div class="wwm-info-row"><span class="wwm-info-label">${_xL} 3</span><span class="wwm-info-val">${_xinfaName(xin[2])}</span></div>
        <div class="wwm-info-row"><span class="wwm-info-label">${_xL} 4</span><span class="wwm-info-val">${_xinfaName(xin[3])}</span></div>
      </div>
      <div class="wwm-info-col">
        <div class="wwm-info-row"><span class="wwm-info-label">${T_.importLabelXiuwei||'武術進度'}</span><span class="wwm-info-val">${s.xiuWeiKungFu} / ${s.maxXiuWeiKungFu}</span></div>
      </div>
    </div>
    ${s.wearEquipsDetailed ? `
      <div class="wwm-equip-section">
        ${_SLOT_ORDER.filter(slot => s.wearEquipsDetailed[slot]).map(slot => _renderEquipSlot(slot, s.wearEquipsDetailed[slot])).join('')}
      </div>
    ` : ''}
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
  // Tier 基準値 (__WWM_OPT_BEST) を再 import 時にリセット → 直後の opt 完了で再確定。
  window.__WWM_OPT_BEST = null;
  window.__WWM_OPT_BEST_LOCKED = false;
  try { localStorage.removeItem('wwm_opt_best_v1'); } catch(_) {}
  // virtual に PvP sentinel (999999) 残骸があれば、その slot の affix6 のみ origEq の affix6 で復元 (他 affix は維持)。
  // 経緯: 前回 PvP装備で affix6 を sentinel にした virtual が PvE再import 後も残り「変更不可」になる事象を解消。
  try {
    const PVP_SENTINEL = 999999;
    const v = window.__WWM_VIRTUAL;
    if (v && typeof v === 'object') {
      let touched = false;
      for (const [slot, vEq] of Object.entries(v)) {
        const aff = vEq?.exVo?.baseAffixes?.[5]?.equipmentDetails;
        if (aff && aff[0] === PVP_SENTINEL) {
          const origAff = data?.wearEquipsDetailed?.[slot]?.exVo?.baseAffixes?.[5]?.equipmentDetails;
          if (origAff) {
            vEq.exVo.baseAffixes[5].equipmentDetails = JSON.parse(JSON.stringify(origAff));
            touched = true;
          }
        }
      }
      if (touched && typeof window._saveVirtuals === 'function') window._saveVirtuals();
    }
  } catch(_) {}
  // stat params 構築 + sidebar 描画
  if (window.WWMStats && window.WWMSidebar) {
    window.WWMStats.buildStatParams(data, state).then(params => {
      window.__WWM_PARAMS = params;
      window.__WWM_ROLEINFO = data;
      window.WWMSidebar.render(params);
      if (window.WWMGear) window.WWMGear.render(data);
      if (window.WWMXinfa) window.WWMXinfa.render(data);
      if (window.WWMDiag) window.WWMDiag.render(data, params);
      if (window.WWMRanking) window.WWMRanking.render(data, params);
      if (window.WWMHero) window.WWMHero.update(params);
      // calc.js の calculate() (DOM 由来) 先に実行 → donut DOM 上書きされる
      if (typeof window.calculate === 'function') window.calculate();
      // computeExpected 再実行で effective params で donut 上書き戻す
      if (window.WWMHero) window.WWMHero.update(params);
      // Phase 1: import 直後 baseline score 保存
      const res = window.__WWM_LAST_RESULT;
      if (res) {
        const bonus = (typeof window.__WWM_SET4_BONUS_OF === 'function')
          ? window.__WWM_SET4_BONUS_OF(data) : 0;
        window.__WWM_BASELINE = { expected: res.expected, statusScore: res.statusScore + bonus, tier: res.tier, ts: Date.now(), scoreVer: window.WWM_SCORE_VERSION || 1 };
        // 再import 成功 → 計算更新バナーがあれば消す
        if (typeof window._hideScoreBanner === 'function') window._hideScoreBanner();
        // OBS view (表示専用) では baseline を書き込まない (読込のみ)。スコアは変動しないので保存不要、汚染源を断つ。
        if (!document.documentElement.classList.contains('wwm-view-sidebar')) {
          if (window.WWMBaseline) window.WWMBaseline.save(window.__WWM_BASELINE);
          else { try { localStorage.setItem('wwm_baseline_score_v1', JSON.stringify(window.__WWM_BASELINE)); } catch(e) {} }
        }
        if (window.WWMHero) window.WWMHero.update(params);
        if (window.WWMHistory) window.WWMHistory.record(data, { statusScore: res.statusScore + bonus, expected: res.expected, tier: res.tier });
      }
      // 重い最適化(数秒)は 初期描画(mini-hero/score)を阻害しないよう await せず 2フレーム後に遅延起動。
      // (opt前に置くと opt の setTimeout(0) yield では paint が starve し score が opt完了まで見えない)
      if (window.WWMOpt) {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          window.WWMOpt.render(data, params).catch(e => console.error('[WWM] opt failed:', e));
        }));
      }
    }).catch(e => console.error('[WWM] stats build failed:', e));
  }
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
// sidebar.js (Edit modal) から statKey → 日本語ラベル参照用
window._AFFIX_DISPLAY_LABELS = _STAT_LABELS_PROXY;

// ── スコア計算更新バナー (baseline 鮮度切れ時に再import促し) ──
function _showScoreBanner() {
  if (document.documentElement.classList.contains('wwm-view-sidebar')) return; // OBS view は非表示
  const el = document.getElementById('wwmScoreUpdateBanner');
  if (el) el.style.display = 'flex';
}
function _hideScoreBanner() {
  const el = document.getElementById('wwmScoreUpdateBanner');
  if (el) el.style.display = 'none';
}
window._showScoreBanner = _showScoreBanner;
window._hideScoreBanner = _hideScoreBanner;

// page load 時: hash がなければ最後の import を localStorage から auto-load。
// データ無い場合も sidebar は placeholder で描画。
function _autoLoadLastImport() {
  if ((location.hash || '').startsWith(IMPORT_HASH_PREFIX)) return;  // hash flow が処理
  // baseline 復元 + 鮮度チェック (scoreVer)
  try {
    let bl = window.WWMBaseline
      ? window.WWMBaseline.load()
      : JSON.parse(localStorage.getItem('wwm_baseline_score_v1') || 'null');
    if (bl) {
      const curVer = window.WWM_SCORE_VERSION || 1;
      if (bl.scoreVer === curVer) {
        window.__WWM_BASELINE = bl;
      } else {
        // scoreVer 不一致 (無し=機能導入前 含む) → baseline 無効化 (再計算せず破棄=drift回避) + 再import促しバナー。
        // ※マイグレ(無し→現行付与)は廃止: baseline は未リリース(Alpha限定)で旧データ救済不要。loadPreset と挙動統一。
        window.__WWM_BASELINE = null;
        try { localStorage.removeItem('wwm_baseline_score_v1'); } catch(_) {}
        if (typeof window._showScoreBanner === 'function') window._showScoreBanner();
      }
    }
    // opt_best 復元 (baseline と同じ scoreVer ルール、不一致なら破棄して再 import 時の opt で再確定)
    try {
      const obRaw = localStorage.getItem('wwm_opt_best_v1');
      if (obRaw) {
        const ob = JSON.parse(obRaw);
        const curVer = window.WWM_SCORE_VERSION || 1;
        if (ob && ob.scoreVer === curVer && typeof ob.end === 'number') {
          window.__WWM_OPT_BEST = ob;
          window.__WWM_OPT_BEST_LOCKED = true;
        } else {
          localStorage.removeItem('wwm_opt_best_v1');
        }
      }
    } catch(_) {}
  } catch(e) {}
  const stored = _loadStored();
  if (!stored?.data) {
    // データ無 → sidebar placeholder のみ描画
    if (window.WWMSidebar) window.WWMSidebar.render(null);
    return;
  }
  if (window.WWMStats && window.WWMSidebar) {
    window.__WWM_ROLEINFO = stored.data;
    // virtual反映付き refresh (effective ri 使用)
    if (typeof window._refreshAll === 'function') {
      window._refreshAll();
    } else {
      window.WWMStats.buildStatParams(stored.data, stored.state).then(params => {
        window.__WWM_PARAMS = params;
        window.WWMSidebar.render(params);
        if (window.WWMGear) window.WWMGear.render(stored.data);
        if (window.WWMXinfa) window.WWMXinfa.render(stored.data);
        if (window.WWMDiag) window.WWMDiag.render(stored.data, params);
        if (window.WWMRanking) window.WWMRanking.render(stored.data, params);
        if (window.WWMOpt) window.WWMOpt.render(stored.data, params);
        if (window.WWMHero) window.WWMHero.update(params);
      }).catch(e => console.error('[WWM] auto-load failed:', e));
    }
    // baseline はlocalStorage値で固定 (page load後の自動再計算 撤回 = drift源排除)
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
