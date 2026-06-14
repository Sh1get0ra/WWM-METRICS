// ── WWM-METRICS Sidebar / 心法 panel + 編集 modal (Phase 3.7 切出) ─
// renderXinfaGrid / _computeArsenalCardScore / _computeXinfaCardScores /
// openXinfaEdit / window.WWMXinfa
(function () {
  'use strict';

  // ── 他 module alias ─────────────────────────────────────
  const _curLang             = window.WWMSidebar.anlz.curLang;
  const _arsenalLiupaiResolve = window.WWMSidebar.icons.arsenalLiupaiResolve;
  const _liupaiPinyinFromUrl = window.WWMSidebar.icons.liupaiPinyinFromUrl;
  // sidebar.js / gear.js 内 (call時 lookup)
  const _scoreWithBonus       = (ri) => window.__WWM_SCORE_WITH_BONUS(ri);
  const _getEffectiveRoleInfo = () => (typeof window._getEffectiveRoleInfo === 'function' ? window._getEffectiveRoleInfo() : null);
  const _getEffectiveState    = () => (typeof window._getEffectiveState === 'function' ? window._getEffectiveState() : null);
  const _refreshAll           = () => { if (typeof window._refreshAll === 'function') window._refreshAll(); };

  // ── Xinfa Grid (心法パネル) ─────────────────────────────────
  function renderXinfaGrid(roleInfo) {
    const root = document.getElementById('wwmXinfaGrid');
    if (!root) return;
    const passive = roleInfo?.passiveSlots || [];
    const lang = _curLang();
    const xinfaMap = window.WWM_XINFA || {};
    const state = _getEffectiveState() || WWMHelpers.storage.loadJSON('wwm_last_state_v1');
    const tiers = state?.xinfaTiers || {};
    const xinfaIconsRaw = WWMState.roleInfo?._xinfaIcons || roleInfo?._xinfaIcons || [];
    const xinfaIconsB64 = WWMState.roleInfo?._xinfaIconsBase64 || roleInfo?._xinfaIconsBase64 || [];
    const xinfaIcons = xinfaIconsRaw.map((u, i) => xinfaIconsB64[i] || u);
    const origPassive = WWMState.roleInfo?.passiveSlots || [];
    const cards = [0,1,2,3].map(i => {
      const xid = passive[i];
      // icon: 元と同じ xid なら base64/URL、 swap 後 or 配列が空(SHARE mode等) は dict から URL fallback
      const iconUrl = (xid === origPassive[i] && xinfaIcons[i]) ? xinfaIcons[i] : (window.WWM_XINFA_ICONS?.[xid]?.icon_url || null);
      const iconHtml = iconUrl ? `<img src="${iconUrl}" alt="">` : '';
      // 流派 = 公式画像 (兄貴指示 2026-06-13)
      const liupaiUrl = xid ? (window.WWM_XINFA_ICONS?.[xid]?.liupai_pic_url || null) : null;
      const liupaiPinyin = _liupaiPinyinFromUrl(liupaiUrl);
      const liupaiHtml = liupaiUrl ? `<img class="plank-liupai" src="${liupaiUrl}" alt="" loading="lazy">` : '';
      // レアリティ (gold/purple/blue) — 公式 bg を plank-paint::after に当てるため (2026-06-14 兄貴指示)
      const rank = xid ? (xinfaMap[xid]?.rank || null) : null;
      const rankAttr = rank ? ` data-rank="${rank}"` : '';
      return `
        <div class="wwm-xinfa-slot" data-xinfa-slot="${i}"${liupaiPinyin ? ` data-liupai-pinyin="${liupaiPinyin}"` : ''}${rankAttr} onclick="WWMSidebar.xinfa.openEdit(${i})">
          <div class="plank-hole"></div>
          <div class="plank-stamp">心</div>
          <div class="plank-paint"></div>
          ${iconHtml ? `<div class="plank-icon-wrap">${iconHtml}</div>` : ''}
          ${liupaiHtml}
          <div class="plank-score-paint"></div>
          <span class="wwm-xinfa-card-score" data-xinfa-score="${i}"><span class="plank-score-main">…</span></span>
        </div>
      `;
    }).join('');
    // 武庫カード (5枚目) — virtual反映
    const effState = _getEffectiveState() || state;
    const arsenalState = effState?.arsenal || state?.arsenal || null;
    const pathKey = arsenalState?.path || 'phys';
    const pathLabelMap = { phys: 'pathPhys', bellstrike: 'pathBellstrike', stonesplit: 'pathStonesplit', silkbind: 'pathSilkbind', bamboocut: 'pathBamboocut' };
    const pathName = (window.T && window.T[pathLabelMap[pathKey]]) || pathKey;
    // 武庫流派バッジ: 主武器path と 武庫path 一致 → 主武器の variant、 不一致 → variant 1
    const arsenalLiupaiUrl = _arsenalLiupaiResolve(roleInfo, pathKey);
    const arsenalLiupaiHtml = arsenalLiupaiUrl ? `<img class="wwm-xinfa-liupai-badge" src="${arsenalLiupaiUrl}" alt="" loading="lazy">` : '';
    const arsenalLiupaiPinyin = _liupaiPinyinFromUrl(arsenalLiupaiUrl);
    const arsenalLiupaiSplat = arsenalLiupaiUrl ? `<img class="plank-liupai" src="${arsenalLiupaiUrl}" alt="" loading="lazy">` : '';
    const arsenalCard = `
      <div class="wwm-xinfa-slot wwm-arsenal-slot" data-arsenal-slot${arsenalLiupaiPinyin ? ` data-liupai-pinyin="${arsenalLiupaiPinyin}"` : ''} onclick="WWMSidebar.arsenal.openEdit()">
        <div class="plank-hole"></div>
        <div class="plank-stamp">庫</div>
        <div class="plank-paint"></div>
        <div class="plank-icon-wrap"><img src="https://www.wherewindsmeetgame.com/pc/qt/20251203102905/data/kongfu/images/673361fe92bef95db34510429KLQLykS05.png" alt=""></div>
        ${arsenalLiupaiSplat}
        <div class="plank-score-paint"></div>
        <span class="wwm-xinfa-card-score" data-arsenal-score><span class="plank-score-main">…</span></span>
      </div>
    `;
    root.innerHTML = cards + arsenalCard;
    _computeXinfaCardScores(roleInfo);
    _computeArsenalCardScore(roleInfo);
  }

  async function _computeArsenalCardScore(roleInfo) {
    if (!window.WWMStats?.buildStatParams || typeof window.computeExpected !== 'function') return;
    const state = _getEffectiveState() || WWMHelpers.storage.loadJSON('wwm_last_state_v1');
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
      const el = document.querySelector('[data-arsenal-score] .plank-score-main');
      if (el) el.textContent = contrib.toLocaleString();
      // base 復元
      window.computeExpected(baseParams);
    } catch(e) {}
  }

  async function _computeXinfaCardScores(roleInfo) {
    if (!window.WWMStats?.buildStatParams || typeof window.computeExpected !== 'function') return;
    // virtual passive (心法ID差替) も反映するため、roleInfo は effectiveRoleInfo で上書き保証
    const ri = _getEffectiveRoleInfo() || roleInfo;
    // virtual xinfa tiers (Edit modal適用結果) を反映するため _getEffectiveState() 使用
    const state = _getEffectiveState() || WWMHelpers.storage.loadJSON('wwm_last_state_v1');
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
        const el = document.querySelector(`[data-xinfa-score="${i}"] .plank-score-main`);
        if (el) el.textContent = delta.toLocaleString();
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
    const origRi = WWMState.roleInfo;
    if (!origRi) return;
    const lang = _curLang();
    const xinfaMap = window.WWM_XINFA || {};
    const passive = (WWMState.virtual.xinfa?.passive) || origRi.passiveSlots || [];
    const origPassive = origRi.passiveSlots || [];
    const state = WWMHelpers.storage.loadJSON('wwm_last_state_v1');
    const origTier = (state?.xinfaTiers?.[slotIdx] ?? state?.xinfaTiers?.[String(slotIdx)] ?? 6);
    const virtTier = WWMState.virtual.xinfa?.tiers?.[slotIdx] ?? origTier;
    let newXinfaId = passive[slotIdx] || origPassive[slotIdx];
    let newTier = virtTier;
    const _xName = (id) => {
      if (!id) return '(空)';
      const n = window.WWM_DS.name('xinfa', id, lang);
      return n.indexOf('[xinfa:') === 0 ? `心法ID ${id}` : n;
    };
    function _xinfaOptions(selectedId) {
      return Object.entries(xinfaMap)
        .filter(([k]) => /^\d+$/.test(k))
        .map(([id]) => {
          const n = window.WWM_DS.name('xinfa', id, lang);
          const label = n.indexOf('[xinfa:') === 0 ? id : n;
          return `<option value="${id}" ${String(id)===String(selectedId)?'selected':''}>${label}</option>`;
        })
        .join('');
    }
    // xinfa effects key → i18n key + 表示形式
    const _XINFA_EFFECT_LABEL = {
      allMartialBoost: { tkey: 'allWeaponDmg',    pct: true },
      globalDmgBoost:  { tkey: 'globalDmgBoost',  pct: true },
      critRateAdj:     { tkey: 'crit',            pct: true },
      critRate:        { tkey: 'crit',            pct: true },
      crit:            { tkey: 'crit',            pct: true },
      critBoost:       { tkey: 'critBoost',       pct: true },
      sympathyRate:    { tkey: 'affinity',        pct: true },
      affinity:        { tkey: 'affinity',        pct: true },
      sympathyBoost:   { tkey: 'sympathyBoost',   pct: true },
      affinityDmgBonus:{ tkey: 'sympathyBoost',   pct: true },
      elemAtkBoost:    { tkey: 'elemAtkBoost',    pct: true },
      attrDmgBonus:    { tkey: 'elemAtkBoost',    pct: true },
      weaponBonus:     { tkey: 'weaponBonus',     pct: true },
      physDmgBonus:    { tkey: 'weaponBonus',     pct: true },
      physDmgBoost:    { tkey: 'weaponBonus',     pct: true },
      outerPen:        { tkey: 'physPen',         pct: false },
      outerPenAdd:     { tkey: 'physPen',         pct: false },
      physPen:         { tkey: 'physPen',         pct: false },
      elemPen:         { tkey: 'pathPenVoid',     pct: false },
      attrPen:         { tkey: 'pathPenVoid',     pct: false },
      bossBoost:       { tkey: 'bossDmg',         pct: true },
      bossDmg:         { tkey: 'bossDmg',         pct: true },
      minPhys:         { tkey: 'minPhys',         pct: false },
      maxPhys:         { tkey: 'maxPhys',         pct: false },
      minPhysATK:      { tkey: 'minPhys',         pct: false },
      maxPhysATK:      { tkey: 'maxPhys',         pct: false },
      minPhysATKAdd:   { tkey: 'minPhys',         pct: false },
      maxPhysATKAdd:   { tkey: 'maxPhys',         pct: false },
      addCritRate:     { tkey: 'addCritRate',     pct: true },
      directCrit:      { tkey: 'addCritRate',     pct: true },
      addSympathyRate: { tkey: 'addSympathyRate', pct: true },
      directAffinity:  { tkey: 'addSympathyRate', pct: true },
      fixedScoreBonus: { tkey: 'martialIndex',    pct: false, scoreCustom: true },
      // path別 攻撃 (min/max 共通ラベル、 値で区別)
      minBellstrike:   { tkey: 'pathAtkBellstrike', pct: false },
      maxBellstrike:   { tkey: 'pathAtkBellstrike', pct: false },
      minStonesplit:   { tkey: 'pathAtkStonesplit', pct: false },
      maxStonesplit:   { tkey: 'pathAtkStonesplit', pct: false },
      minSilkbind:     { tkey: 'pathAtkSilkbind',   pct: false },
      maxSilkbind:     { tkey: 'pathAtkSilkbind',   pct: false },
      minBamboocut:    { tkey: 'pathAtkBamboocut',  pct: false },
      maxBamboocut:    { tkey: 'pathAtkBamboocut',  pct: false },
      minVoid:         { tkey: 'pathAtkVoid',       pct: false },
      maxVoid:         { tkey: 'pathAtkVoid',       pct: false },
      // path別 貫通
      bellstrikePen:   { tkey: 'pathPenBellstrike', pct: false },
      stonesplitPen:   { tkey: 'pathPenStonesplit', pct: false },
      silkbindPen:     { tkey: 'pathPenSilkbind',   pct: false },
      bamboocutPen:    { tkey: 'pathPenBamboocut',  pct: false },
      voidPen:         { tkey: 'pathPenVoid',       pct: false },
      // path別 ダメージ強化
      bellstrikeDmgBoost: { tkey: 'pathDmgBellstrike', pct: true },
      stonesplitDmgBoost: { tkey: 'pathDmgStonesplit', pct: true },
      silkbindDmgBoost:   { tkey: 'pathDmgSilkbind',   pct: true },
      bamboocutDmgBoost:  { tkey: 'pathDmgBamboocut',  pct: true },
      voidDmgBoost:       { tkey: 'pathDmgVoid',       pct: true }
    };
    // ダメージ計算に関与しない statType (effects空、 ゲームはステ表示するが計算外) → localized名 + (計算外)
    const _XINFA_STATTYPE_LABEL = {
      'Max HP': 'maxHp',
      'Physical Defense': 'physDef',
      'Critical Healing Bonus': 'stCritHeal',
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
      const effRi = _getEffectiveRoleInfo() || (WWMState.roleInfo || {});
      const myKfs = [effRi?.kongfuMain, effRi?.kongfuSub].filter(Boolean).map(v => String(v));
      const lines = [];
      for (let t = 0; t <= 6; t++) {
        const def = x.attributeBuff[`tier${t}`];
        const isActive = t <= tier;
        if (!def) {
          lines.push(`<div class="wwm-cmp-tier-row wwm-tier-empty"><span class="wwm-cmp-tier-num">T${t}</span><span class="wwm-cmp-tier-eff wwm-tier-dash">—</span></div>`);
          continue;
        }
        const isTwoFive = (t === 2 || t === 5);
        const needsKf = !isTwoFive && Array.isArray(def.kongfuRequired) && def.kongfuRequired.length;
        const kfOk = !needsKf || def.kongfuRequired.some(k => myKfs.includes(String(k)));
        const effects = def.effects || {};
        const hasEff = Object.keys(effects).length > 0;
        // labelOverride: tier毎に effects key → 表示label の上書き (i18n対応)
        const lang = _curLang();
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
                  const _def = _XINFA_EFFECT_LABEL[k];
                  if (_def?.scoreCustom) return `${ovLabel} +${v || '?'}`;
                  const isPct = _def?.pct;
                  const valStr = isPct ? `${(Math.abs(v) < 1 ? v*100 : v).toFixed(1)}%` : String(v);
                  return `${ovLabel} +${valStr}`;
                }
                return _xinfaFmtEffect(k, v);
              }).join(', ')
            : (() => {
                const stKey = def.statType && _XINFA_STATTYPE_LABEL[def.statType];
                if (stKey) return (window.T && window.T[stKey]) || def.statType;
                return (def.rawI18n?.[lang]) || def.rawI18n?.en || def.rawI18n?.ja || '-';
              })();
        } else {
          effStr = (def.rawI18n?.[lang]) || def.rawI18n?.en || def.rawI18n?.ja || '-';
        }
        let cls = 'wwm-tier-active';
        let warn = '';
        if (!isActive) { cls = 'wwm-tier-unrel'; warn = ` <span class="wwm-tier-warn" title="${(window.T&&window.T.tipTierUnreleased)||'未解放'}">⏳</span>`; }
        else if (needsKf && !kfOk) { cls = 'wwm-tier-kfmiss'; warn = ` <span class="wwm-tier-warn" title="${(window.T&&window.T.tipTierKfMissing)||'武器条件未満'}">⚠</span>`; }
        lines.push(`<div class="wwm-cmp-tier-row ${cls}"><span class="wwm-cmp-tier-num">T${t}</span><span class="wwm-cmp-tier-eff">${effStr}${warn}</span></div>`);
      }
      return lines.join('');
    }
    const origName = _xName(origPassive[slotIdx]);
    const m = document.createElement('div');
    m.className = 'wwm-modal-backdrop';
    const _T = window.T || {};
    // virtual swap 反映: panel 再open時に最新心法 icon 表示
    const effXidForBg = WWMState.virtual.xinfa?.passive?.[slotIdx] ?? origPassive[slotIdx];
    const _bgIc = (effXidForBg === origPassive[slotIdx])
      ? (origRi?._xinfaIconsBase64?.[slotIdx] || origRi?._xinfaIcons?.[slotIdx] || window.WWM_XINFA_ICONS?.[effXidForBg]?.icon_url || null)
      : (window.WWM_XINFA_ICONS?.[effXidForBg]?.icon_url || null);
    const _bgIconHtml = _bgIc ? `<div class="wwm-cmp-modal-bg-icon" style="background-image: url('${_bgIc}');"></div>` : '';
    m.innerHTML = `
      <div class="wwm-modal wwm-modal-square wwm-cmp-modal-a">
        <span class="wwm-cmp-l-bracket-tl"></span><span class="wwm-cmp-l-bracket-tr"></span>
        <span class="wwm-cmp-l-bracket-bl"></span><span class="wwm-cmp-l-bracket-br"></span>
        <div class="wwm-modal-header">
          <h2><span class="wwm-cmp-title-ja">${_T.xinfaTitleJa||'心法対照'}</span><span class="wwm-cmp-title-en">${_T.cmpTitleEn||'COMPARISON'}</span><span class="wwm-cmp-seal">心</span></h2>
          <button class="wwm-modal-close" aria-label="Close">×</button>
        </div>
        <div class="wwm-modal-body wwm-ws-paper">
          ${_bgIconHtml}
          <div class="wwm-cmp-grid">
            <div class="wwm-cmp-col wwm-cmp-current">
              <h3 class="wwm-cmp-title" data-seal="${_T.cmpCurrent||'現有'}"><span class="wwm-cmp-title-text">${_T.cmpCurrent||'現有'}</span></h3>
              <div class="wwm-cmp-kongfu-header">${origName}</div>
              <div class="wwm-cmp-set-header">Tier ${origTier}</div>
              <div class="wwm-cmp-rows wwm-cmp-xinfa-rows">${_effectsText(origPassive[slotIdx], origTier)}</div>
            </div>
            <div class="wwm-cmp-divider"></div>
            <div class="wwm-cmp-col wwm-cmp-new" id="wwmCmpXinfaNewCol">
              <h3 class="wwm-cmp-title" data-seal="${_T.cmpNew||'新置'}"><span class="wwm-cmp-title-text">${_T.cmpNew||'新置'}</span></h3>
              <select class="wwm-cmp-kongfu-select" id="wwmCmpXinfaSel">${_xinfaOptions(newXinfaId)}</select>
              <select class="wwm-cmp-set-select" id="wwmCmpXinfaTierSel">${[0,1,2,3,4,5,6].map(t => `<option value="${t}" ${t===newTier?'selected':''}>Tier ${t}</option>`).join('')}</select>
              <div class="wwm-cmp-rows wwm-cmp-xinfa-rows" id="wwmCmpXinfaEffect">${_effectsText(newXinfaId, newTier)}</div>
            </div>
          </div>
        </div>
        <!-- footer = body (紙) の外 = 墨帯 (modal 二層化 2026-06-12) -->
        <div class="wwm-cmp-footer-a">
          <div class="wwm-cmp-delta-block">
            <span class="wwm-cmp-delta-label">${_T.cmpDeltaLabel||'武格変動'}</span>
            <span class="wwm-cmp-preview-value" id="wwmCmpXinfaPreviewDelta">+0</span>
            <span class="wwm-cmp-delta-base" id="wwmCmpXinfaPreviewBase">—</span>
          </div>
          <div class="wwm-btn-row wwm-cmp-btn-row">
            <button class="wwm-btn-primary" id="wwmXinfaApply">${_T.cmpApply||'採用'}</button>
            <button class="wwm-btn-secondary" id="wwmXinfaReset">${_T.cmpReset||'復元'}</button>
            <button class="wwm-btn-secondary" id="wwmXinfaCancel">${_T.cmpCancel||'離脱'}</button>
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
      const el = m.querySelector('#wwmCmpXinfaPreviewDelta');
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
        el.textContent = `${sign}${delta.toLocaleString()}`;
        el.className = 'wwm-cmp-preview-value ' + (delta > 0 ? 'pos' : delta < 0 ? 'neg' : 'zero');
        const baseEl = m.querySelector('#wwmCmpXinfaPreviewBase');
        if (baseEl) baseEl.textContent = `${Math.round(baseScore).toLocaleString()} → ${Math.round(vScore).toLocaleString()}`;
      } catch (e) { el.textContent = 'error'; }
    }

    const xSel = m.querySelector('#wwmCmpXinfaSel');
    xSel.addEventListener('change', () => {
      newXinfaId = parseInt(xSel.value, 10);
      const eff = m.querySelector('#wwmCmpXinfaEffect');
      if (eff) eff.innerHTML = _effectsText(newXinfaId, newTier);
      // 武具対照と同仕様: 新置 心法 select 変更で modal 背景アイコンを動的切替
      const newIconUrl = window.WWM_XINFA_ICONS?.[newXinfaId]?.icon_url;
      const bgEl = m.querySelector('.wwm-cmp-modal-bg-icon');
      if (bgEl && newIconUrl) bgEl.style.backgroundImage = `url('${newIconUrl}')`;
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
      if (!WWMState.virtual.xinfa) WWMState.virtual.xinfa = { passive: [...origPassive], tiers: {} };
      if (!WWMState.virtual.xinfa.passive) WWMState.virtual.xinfa.passive = [...origPassive];
      if (!WWMState.virtual.xinfa.tiers) WWMState.virtual.xinfa.tiers = {};
      WWMState.virtual.xinfa.passive[slotIdx] = parseInt(newXinfaId, 10);
      WWMState.virtual.xinfa.tiers[slotIdx] = newTier;
      m.remove();
      _refreshAll();
    });
    m.querySelector('#wwmXinfaReset').addEventListener('click', () => {
      if (WWMState.virtual.xinfa?.passive) WWMState.virtual.xinfa.passive[slotIdx] = origPassive[slotIdx];
      if (WWMState.virtual.xinfa?.tiers) delete WWMState.virtual.xinfa.tiers[slotIdx];
      m.remove();
      _refreshAll();
    });
  }

  // ── expose ───────────────────────────────────────────────
  window.WWMSidebar = window.WWMSidebar || {};
  window.WWMSidebar.xinfa = {
    render: renderXinfaGrid,
    openEdit: openXinfaEdit,
    computeCardScores: _computeXinfaCardScores,
    computeArsenalCardScore: _computeArsenalCardScore,
  };
})();
