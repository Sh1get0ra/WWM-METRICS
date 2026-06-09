// ── WWM-METRICS Sidebar / Gear Grid + 装備編集 modal (Phase 3.6 切出) ─
// _GEAR_SLOT_ORDER / renderGearGrid / _SET4_BONUS / _isOffensiveSet /
// _set4Bonus / _scoreWithBonus / _computeSlotContributions /
// _computeGearCardScores / openGearEdit / window.WWMGear
(function () {
  'use strict';

  // ── 他 module alias ─────────────────────────────────────
  // affix-utils
  const _isUsefulAffix       = window.WWMSidebar.affix.isUsefulAffix;
  const _affixDisplayName    = window.WWMSidebar.affix.affixDisplayName;
  const _isPctStat           = window.WWMSidebar.affix.isPctStat;
  const _pctNeedsMul         = window.WWMSidebar.affix.pctNeedsMul;
  const _fmtAffixVal         = window.WWMSidebar.affix.fmtAffixVal;
  const _getAffixOptions     = window.WWMSidebar.affix.getAffixOptions;
  const _getAffixMax         = window.WWMSidebar.affix.getAffixMax;
  const _lvToTier            = window.WWMSidebar.affix.lvToTier;
  const _loadEquipMax        = window.WWMSidebar.affix.loadEquipMax;
  const _getCachedEquipMax   = window.WWMSidebar.affix.getCachedEquipMax;
  const _STAT_TO_MAX_KEY     = window.WWMSidebar.affix.STAT_TO_MAX_KEY;
  const _PVP_AFFIX_SENTINEL  = window.WWMSidebar.affix.PVP_AFFIX_SENTINEL;
  // icon-resolvers
  const _gearIconResolve     = window.WWMSidebar.icons.gearIconResolve;
  const _kongfuLiupaiResolve = window.WWMSidebar.icons.kongfuLiupaiResolve;
  const _setLiupaiResolve    = window.WWMSidebar.icons.setLiupaiResolve;
  const _liupaiPinyinFromUrl = window.WWMSidebar.icons.liupaiPinyinFromUrl;
  const _GEAR_SLOT_LABELS    = window.WWMSidebar.icons.GEAR_SLOT_LABELS;
  const _GEAR_RAIL_ZH        = window.WWMSidebar.icons.GEAR_RAIL_ZH;
  // anlz
  const _curLang             = window.WWMSidebar.anlz.curLang;
  // sidebar.js 内 (call時 lookup、 module load 順 非依存)
  const _ratioColor             = (...args) => window._ratioColor ? window._ratioColor(...args) : 'var(--paper-mute)';
  const _getEffectiveRoleInfo   = () => (typeof window._getEffectiveRoleInfo === 'function' ? window._getEffectiveRoleInfo() : null);
  const _refreshAll             = () => { if (typeof window._refreshAll === 'function') window._refreshAll(); };

  // ── Gear Grid (main 下部) ───────────────────────────────────────
  const _GEAR_SLOT_ORDER = ['1', '2', '3', '4', '21', '10', '11', '5', '8', '9'];

  function renderGearGrid(roleInfo) {
    const root = document.getElementById('wwmGearGrid');
    if (!root) return;
    const eqDet = roleInfo?.wearEquipsDetailed || {};
    const sets = window.WWM_SETS || {};
    const kongfu = window.WWM_KONGFU || {};
    const lang = (window.currentLang) || 'ja';
    const kfName = (id) => {
      const n = window.WWM_DS.name('kongfu', id, lang);
      return n.indexOf('[kongfu:') === 0 ? '' : n;
    };

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
      let setName = (window.WWM_DS && suffix) ? window.WWM_DS.name('sets', suffix, lang) : (setsCat?.[suffix]?.names?.[lang] || setsCat?.[suffix]?.names?.ja || setsCat?.[suffix]?.names?.en || '');
      if (setName && setName.indexOf('[sets:') === 0) setName = '';
      if (lang === 'en' && setName) setName = setName.replace(/\s+Set$/i, '');
      const score = calcCardScore(eq);
      const shortKf = (n) => {
        if (!n || lang !== 'en') return n;
        // 武器種類サフィックス (Sword/Spear/Blade/Twinblades/Umbrella/Fan/Rope Dart) を完全削除。
        // 前詞 (Stormbreaker / Thundercry 等) で ユーザーは武術判別可能、 武器種類は装備カードの slot label (主武器/副武器) で示唆済のため冗長。
        return n
          .replace(/\s+Rope Dart$/i, '')
          .replace(/\s+Twinblades$/i, '')
          .replace(/\s+Sword$/i, '')
          .replace(/\s+Spear$/i, '')
          .replace(/\s+Blade$/i, '')
          .replace(/\s+Umbrella$/i, '')
          .replace(/\s+Fan$/i, '');
      };
      let kongfuLine = '';
      if (slot === '1' && roleInfo?.kongfuMain) {
        const n = shortKf(kfName(roleInfo.kongfuMain));
        if (n) kongfuLine = `<span class="wwm-equip-kongfu">${n}</span>`;
      } else if (slot === '2' && roleInfo?.kongfuSub) {
        const n = shortKf(kfName(roleInfo.kongfuSub));
        if (n) kongfuLine = `<span class="wwm-equip-kongfu">${n}</span>`;
      }
      const iconUrl = _gearIconResolve(slot, roleInfo);
      const isWeaponSlotIcon = (slot === '1' || slot === '2');
      const iconCls = 'wwm-equip-icon' + (isWeaponSlotIcon ? ' wwm-equip-icon-weapon' : '');
      const iconHtml = iconUrl ? `<img class="${iconCls}" src="${iconUrl}" alt="">` : '';
      // 流派バッジ overlay: 武器 slot は kongfu経由、 非武器 slot は セット (sets.liupaiId) 経由
      const liupaiUrl = ((slot === '1' || slot === '2')
        ? _kongfuLiupaiResolve(slot, roleInfo)
        : _setLiupaiResolve(slot, eq, sets));
      const liupaiHtml = liupaiUrl ? `<img class="wwm-equip-liupai-badge" src="${liupaiUrl}" alt="" loading="lazy">` : '';
      const liupaiPinyin = _liupaiPinyinFromUrl(liupaiUrl);
      const railLabel = _GEAR_RAIL_ZH[slot] || label;
      return `
        <div class="wwm-equip-slot" data-slot="${slot}"${liupaiPinyin ? ` data-liupai-pinyin="${liupaiPinyin}"` : ''} onclick="WWMSidebar.gear.openEdit('${slot}')">
          ${liupaiHtml}
          <div class="wwm-equip-rail"><span class="wwm-equip-rail-text">${railLabel}</span></div>
          ${iconHtml ? `<div class="wwm-equip-icon-wrap">${iconHtml}</div>` : ''}
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
    const base = WWMState.lastResult?.statusScore || 0;
    return base + _set4Bonus(roleInfo);
  }

  // 装備カード Score = (現状 全装備) - (該当 slot 外し) + セット効果均等分配
  async function _computeSlotContributions(roleInfo, slots, suffixSlots, set4Map) {
    if (!window.WWMStats?.buildStatParams || typeof window.computeExpected !== 'function') return null;
    const state = WWMHelpers.storage.loadJSON('wwm_last_state_v1');
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
    const state = WWMHelpers.storage.loadJSON('wwm_last_state_v1');
    const origRi = WWMState.roleInfo;
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
    const hasVirtual = (WWMState.virtual.gear && Object.keys(WWMState.virtual.gear).length) ||
                       (WWMState.virtual.kongfu && Object.keys(WWMState.virtual.kongfu).length);
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
        WWMState.virtual.gear?.[slot] ||
        (slot === '1' && WWMState.virtual.kongfu?.kongfuMain) ||
        (slot === '2' && WWMState.virtual.kongfu?.kongfuSub)
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

  // ── 装備編集 modal ────────────────────────────────────────
  function openGearEdit(slot) {
    const origRi = WWMState.roleInfo;
    const origEq = origRi?.wearEquipsDetailed?.[slot];
    if (!origEq) { alert('装備データなし: slot ' + slot); return; }
    // virtual snapshot: 採用/復元を経ない close (離脱/誤操作) で巻き戻す。
    // _applyNewLv (Lv select / OCR) が preview 用に virtual へ直書き + 保存するため、
    // 破棄離脱でもスコア変動が残留していた (2026-06-08 兄貴報告 OCR -33 バグの根治)
    const _virtSnapStr = JSON.stringify(WWMState.virtual.gear?.[slot] ?? null);
    let _committed = false;
    const label = _GEAR_SLOT_LABELS[slot] || slot;
    // equip_max.json 確実 load (await不要、初回 null fallback)
    _loadEquipMax();
    const charLv = origRi?.level || 95;
    // 背景アイコン (slot/武器type に対応): kongfu→slot_icon→SVG 3段階fallback
    // virtual swap 反映 (panel 再open時に最新 kongfu icon 表示)
    const effRiForBg = _getEffectiveRoleInfo() || origRi;
    const bgIconResolvedUrl = _gearIconResolve(slot, effRiForBg);
    const bgIconUrl = bgIconResolvedUrl ? `url('${bgIconResolvedUrl}')` : 'none';
    // kongfu 名称 (主武器/副武器)
    const lang = _curLang();
    const kfMap = window.WWM_KONGFU || {};
    const _kfName = (id) => {
      const n = window.WWM_DS.name('kongfu', id, lang);
      return n.indexOf('[kongfu:') === 0 ? '' : n;
    };
    const isWeaponSlot = slot === '1' || slot === '2';
    const origKongfuId = slot === '1' ? origRi?.kongfuMain : (slot === '2' ? origRi?.kongfuSub : null);
    // 編集中 kongfu state (新パネル用) — virtual あれば virtual優先
    const virtKongfu = slot === '1' ? WWMState.virtual.kongfu?.kongfuMain
                     : slot === '2' ? WWMState.virtual.kongfu?.kongfuSub : null;
    let newKongfuId = virtKongfu ?? origKongfuId;
    const kongfuLabel = origKongfuId ? _kfName(origKongfuId) : '';
    const kongfuHtml = kongfuLabel ? `<span class="wwm-cmp-kongfu">${kongfuLabel}</span>` : '';
    // セット系 slot: 武器/環/佩び物 = weaponSets / 弓矢/射玦 = bowSets
    const isWeaponSetSlot = ['1','2','10','11'].includes(String(slot));
    const isBowSetSlot = ['9','21'].includes(String(slot));
    const isSetEditable = isWeaponSetSlot || isBowSetSlot;
    const origSuffix = origEq.exVo?.suffix;
    // virtual あれば virtual優先
    let newSuffix = WWMState.virtual.gear?.[slot]?.exVo?.suffix ?? origSuffix;
    const setsMap = isBowSetSlot
      ? (window.WWM_SETS?.bowSets || {})
      : (window.WWM_SETS?.weaponSets || {});
    const _setName = (s) => {
      if (!s) return '';
      const n = window.WWM_DS.name('sets', s, lang);
      return (n.indexOf('[sets:') === 0) ? `Set ${s}` : n;
    };
    const _setRaw = (s) => setsMap[s]?.pieces2?.raw || '';
    function _setOptions(selectedId) {
      return Object.entries(setsMap)
        .map(([id]) => {
          const n = window.WWM_DS.name('sets', id, lang);
          const label = (n.indexOf('[sets:') === 0) ? id : n;
          return `<option value="${id}" ${String(id)===String(selectedId)?'selected':''}>${label}</option>`;
        })
        .join('');
    }
    // slot 9/21: affix 編集不可
    const isAffixEditable = !isBowSetSlot;
    // 全 kongfu option list (slot1/2 編集用)
    function _kongfuOptions(selectedId) {
      return Object.entries(kfMap)
        .filter(([k]) => /^\d+$/.test(k))
        .map(([id]) => {
          const n = window.WWM_DS.name('kongfu', id, lang);
          const label = (n.indexOf('[kongfu:') === 0) ? id : n;
          return `<option value="${id}" ${String(id)===String(selectedId)?'selected':''}>${label}</option>`;
        })
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
    const virtualEq = WWMState.virtual.gear?.[slot];
    const newAffixes = JSON.parse(JSON.stringify((virtualEq || origEq).exVo?.baseAffixes || []));
    // <span class="wwm-good-icon"><svg viewBox="0 0 24 24"><path d="M2 21h4V9H2v12zm20-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L13.17 1 7.59 6.59C7.22 6.95 7 7.45 7 8v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-1z"/></svg></span> 自動判定で d[4] 上書き (newKongfu 基準)
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
      return affs.map((a, idx) => {
        const d = a.equipmentDetails || [];
        const [id, val, ratio, rank, useful] = d;
        const info = window.WWM_AFFIX?.[id];
        const sk = info?.statKey;
        const name = _affixDisplayName(id, idx);
        const rkCls = rank===3?'gold':rank===2?'purple':'blue';
        const usefulAuto = _isUsefulAffix(id, origRi);
        const pct = (ratio != null) ? (ratio * 100).toFixed(0) : null;
        const pctColor = _ratioColor(ratio);
        const pctRankCls = ratio != null ? (ratio >= 0.999 ? ' rank-max' : ratio > 0.85 ? ' rank-gold' : ratio > 0.70 ? ' rank-purple' : ' rank-blue') : '';
        const pctHtml = pct != null ? `<span class="wwm-cmp-ratio${pctRankCls}" style="color:${pctColor};">${pct}%</span>` : '';
        return `
          <div class="wwm-cmp-row">
            <span class="wwm-cmp-name wwm-rank-${rkCls}" title="ID:${id}">${name}${usefulAuto?' <span class="wwm-good-icon"><svg viewBox="0 0 24 24"><path d="M2 21h4V9H2v12zm20-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L13.17 1 7.59 6.59C7.22 6.95 7 7.45 7 8v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-1z"/></svg></span>':''}</span>
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
        // selected: 通常は statKey 一致、affix6 で未登録ID(PvP定音含む) なら __pvp__ option
        const isPvpSlot6 = (idx === 5) && !info;
        const optsHtml = opts.map(o => {
          const sel = isPvpSlot6 ? (o.statKey === '__pvp__') : (o.statKey === sk);
          return `<option value="${o.id}" data-stat="${o.statKey}" ${sel?'selected':''}>${o.name}</option>`;
        }).join('');
        const isPct = _isPctStat(sk);
        const needsMul = _pctNeedsMul(sk);
        const displayVal = isPct
          ? (needsMul ? (val*100).toFixed(1) : val.toFixed(1))
          : (typeof val === 'number' ? val.toFixed(1) : val);
        const step = '0.1';
        // max 値算出: 装備個別Lv基準 → equip_max.json (Lv → tier) ベース。fallback: orig val/ratio (sameStat時)
        const _eqLv = (WWMState.virtual.gear?.[slot]?.exVo?._inferredLv) ?? origEq?.exVo?._inferredLv ?? charLv;
        let maxInternal = _getAffixMax(sk, _eqLv);
        if (maxInternal == null) {
          const origDet = origEq.exVo?.baseAffixes?.[idx]?.equipmentDetails;
          const origInfo = origDet?.[0] != null ? window.WWM_AFFIX?.[origDet[0]] : null;
          if (origInfo?.statKey === sk && origDet?.[1] != null && origDet?.[2] > 0) {
            maxInternal = origDet[1] / origDet[2];
          }
        }
        const maxAttr = maxInternal != null
          ? `max="${isPct ? (needsMul ? (maxInternal*100).toFixed(1) : maxInternal.toFixed(1)) : maxInternal.toFixed(1)}"`
          : '';
        // 初期 ratio 計算 (val / maxInternal)
        const initRatio = (maxInternal != null && maxInternal > 0 && typeof val === 'number')
          ? Math.min(1, val / maxInternal) : null;
        const initPct = initRatio != null ? (initRatio * 100).toFixed(0) : '';
        const initColor = _ratioColor(initRatio);
        // PvP定音 (idx=5 + 未登録): wwm-cmp-pvp-locked クラスで val/unit/ratio を visibility:hidden (編集不可)
        return `
          <div class="wwm-cmp-row wwm-cmp-edit-row${isPvpSlot6?' wwm-cmp-pvp-locked':''}" data-affix-idx="${idx}" data-max-internal="${maxInternal||''}">
            <select class="wwm-cmp-stat-select wwm-rank-${rkCls}" data-field="stat" data-stat-el>${optsHtml}</select>
            <div class="wwm-cmp-useful-mark" data-useful-el>${useful?'<span class="wwm-good-icon"><svg viewBox="0 0 24 24"><path d="M2 21h4V9H2v12zm20-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L13.17 1 7.59 6.59C7.22 6.95 7 7.45 7 8v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-1z"/></svg></span>':''}</div>
            <div class="wwm-cmp-val-wrap">
              <input type="number" class="wwm-num-input wwm-cmp-val-input" step="${step}" min="0" ${maxAttr} value="${displayVal}" data-field="val" data-pct="${isPct?1:0}" data-pctmul="${needsMul?1:0}">
              <span class="wwm-cmp-unit" data-unit-el>${isPct?'%':''}</span>
              <span class="wwm-cmp-ratio${initRatio != null ? (initRatio >= 0.999 ? ' rank-max' : initRatio > 0.85 ? ' rank-gold' : initRatio > 0.70 ? ' rank-purple' : ' rank-blue') : ''}" data-ratio-el style="color:${initColor};">${initPct?initPct+'%':''}</span>
            </div>
          </div>
        `;
      }).join('');
    }

    const m = document.createElement('div');
    m.className = 'wwm-modal-backdrop';
    const bgIconHtml = bgIconResolvedUrl ? `<div class="wwm-cmp-bg-icon" style="background-image: url('${bgIconResolvedUrl}');"></div>` : '';
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
          ${bgIconHtml ? bgIconHtml.replace('class="wwm-cmp-bg-icon"', 'class="wwm-cmp-modal-bg-icon wwm-cmp-modal-bg-icon-gear' + ((slot === '9' || slot === '21') ? ' wwm-cmp-modal-bg-icon-gear-small' : (slot === '1' || slot === '2') ? ' wwm-cmp-modal-bg-icon-gear-weapon' : ' wwm-cmp-modal-bg-icon-gear-armor') + '"') : ''}
          <div class="wwm-cmp-grid">
            <div class="wwm-cmp-col wwm-cmp-current${isBowSetSlot?' wwm-cmp-bow':''}">
              <h3 class="wwm-cmp-title" data-seal="${(window.T&&T.cmpCurrent)||'現有'}"><span class="wwm-cmp-title-text">${(window.T&&T.cmpCurrent)||'現有'}</span>${origEq?.exVo?._inferredLv ? `<span class="wwm-cmp-lv">Lv${origEq.exVo._inferredLv}</span>` : ''}</h3>
              ${curKongfuHeader}
              ${curSetHeader}
              ${isAffixEditable ? `<div class="wwm-cmp-rows">${renderCurrentRows()}</div>` : ''}
            </div>
            <div class="wwm-cmp-divider"></div>
            <div class="wwm-cmp-col wwm-cmp-new${isBowSetSlot?' wwm-cmp-bow':''}" id="wwmCmpNewCol">
              <h3 class="wwm-cmp-title" data-seal="${(window.T&&T.cmpNew)||'新置'}"><span class="wwm-cmp-title-text">${(window.T&&T.cmpNew)||'新置'}</span>${(() => {
                const _curLv = WWMState.virtual.gear?.[slot]?.exVo?._inferredLv ?? origEq?.exVo?._inferredLv;
                // 装備レベルは charLv (import時のキャラレベル) 以下のみ選択可。未所持の高Lv装備での皮算用を防ぐ。
                const _lvList = (window.WWM_EQUIP_BASE_BY_LV?._lvList || [91, 86, 81, 71]).filter(lv => lv <= charLv);
                const _hasTbl = !!window.WWM_EQUIP_BASE_BY_LV?.slots?.[String(slot)];
                // OCR 取込ボタン: Lv select の右隣 (適用先 = 新置の明示)。slot 9/21 (affix 編集不可) は非表示
                const _ocrHtml = isAffixEditable
                  ? `<button type="button" id="wwmCmpOcrBtn" class="wwm-ocr-btn" title="${(window.T&&T.ocrBtnTitle)||'スクショ取込 (OCR)'}" aria-label="${(window.T&&T.ocrBtnTitle)||'スクショ取込 (OCR)'}">📷</button><button type="button" id="wwmCmpOcrHelpBtn" class="wwm-ocr-btn wwm-ocr-help-btn" title="${(window.T&&T.ocrHelpTitle)||'スクショ取込ガイド'}" aria-label="${(window.T&&T.ocrHelpTitle)||'スクショ取込ガイド'}">?</button><span id="wwmCmpOcrStatus" class="wwm-ocr-status" aria-live="polite"></span>`
                  : '';
                if (!_curLv || !_hasTbl) return (_curLv ? ` <span class="wwm-cmp-lv">Lv${_curLv}</span>` : '') + _ocrHtml;
                const _opts = _lvList.map(lv => `<option value="${lv}" ${lv===_curLv?'selected':''}>Lv${lv}</option>`).join('');
                return ` <select id="wwmCmpNewLvSel" class="wwm-cmp-lv-select">${_opts}</select>` + _ocrHtml;
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
    // modal 消滅監視: 採用/復元なしの close → virtual snapshot 復元 (差分時のみ refresh)
    const moVirt = new MutationObserver(() => {
      if (document.body.contains(m)) return;
      moVirt.disconnect();
      if (_committed) return;
      const curStr = JSON.stringify(WWMState.virtual.gear?.[slot] ?? null);
      if (curStr === _virtSnapStr) return;
      const snap = JSON.parse(_virtSnapStr);
      if (snap === null) { if (WWMState.virtual.gear) delete WWMState.virtual.gear[slot]; }
      else { if (!WWMState.virtual.gear) WWMState.virtual.gear = {}; WWMState.virtual.gear[slot] = snap; }
      if (typeof window._saveVirtuals === 'function') window._saveVirtuals();
      if (typeof window._refreshAll === 'function') window._refreshAll();
    });
    moVirt.observe(document.body, { childList: true });
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
        const vEq = JSON.parse(JSON.stringify(WWMState.virtual.gear?.[slot] || origEq));
        vEq.exVo.baseAffixes = newAffixes;
        if (isSetEditable && newSuffix != null) vEq.exVo.suffix = parseInt(newSuffix, 10);
        vRi.wearEquipsDetailed[slot] = vEq;
        if (isWeaponSlot && newKongfuId) {
          if (slot === '1') vRi.kongfuMain = parseInt(newKongfuId, 10);
          else if (slot === '2') vRi.kongfuSub = parseInt(newKongfuId, 10);
        }
        const state = WWMHelpers.storage.loadJSON('wwm_last_state_v1');
        // virtual compute
        const vParams = await window.WWMStats.buildStatParams(vRi, state);
        window.computeExpected(vParams);
        const vScore = (WWMState.lastResult?.statusScore || 0) + _set4Bonus(vRi);
        // baseline 取得 (現状 effective roleInfo)
        const origParams = WWMState.params;
        const effBaseRi = _getEffectiveRoleInfo() || origRi;
        let baseScore = 0;
        if (origParams) {
          window.computeExpected(origParams);
          baseScore = (WWMState.lastResult?.statusScore || 0) + _set4Bonus(effBaseRi);
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
        // 新パネル bg icon 更新 (kongfu icon dict 優先 → fallback)
        const newIconUrl = _gearIconResolve(slot, _virtRi(newKongfuId));
        const bgEl = m.querySelector('.wwm-cmp-modal-bg-icon');
        if (bgEl && newIconUrl) bgEl.style.backgroundImage = `url('${newIconUrl}')`;
        _schedulePreview();
      });
    }
    // 新装備 Lv 変更 → base値 + affix値 (新Lv MAX×0.94) 自動更新
    // OCR 取込からも呼ぶため関数化 (await 可能に)
    const lvSel = m.querySelector('#wwmCmpNewLvSel');
    async function _applyNewLv(newLv) {
      await _loadEquipMax();
      // virtual eq 作成 (origEq deep clone)
      if (!WWMState.virtual.gear) WWMState.virtual.gear = {};
      const vEq = JSON.parse(JSON.stringify(WWMState.virtual.gear[slot] || origEq));
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
      const maxTbl = _getCachedEquipMax()?.tiers?.[tier] || {};
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
      WWMState.virtual.gear[slot] = vEq;
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
    }
    if (lvSel) {
      lvSel.addEventListener('change', () => _applyNewLv(parseInt(lvSel.value, 10)));
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
      // PvP定音 (idx=5 + 未登録/sentinel): wwm-cmp-pvp-locked クラスで val/unit/ratio を visibility:hidden
      const isPvp = idx === 5 && !info;
      row.classList.toggle('wwm-cmp-pvp-locked', isPvp);
      const usefulEl = row.querySelector('[data-useful-el]');
      if (usefulEl) usefulEl.innerHTML = d[4] ? '<span class="wwm-good-icon"><svg viewBox="0 0 24 24"><path d="M2 21h4V9H2v12zm20-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L13.17 1 7.59 6.59C7.22 6.95 7 7.45 7 8v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-1z"/></svg></span>' : '';
      const valInp = row.querySelector('.wwm-cmp-val-input');
      if (valInp) {
        valInp.dataset.pct = isPct ? '1' : '0';
        valInp.dataset.pctmul = _pctNeedsMul(sk) ? '1' : '0';
        valInp.step = '0.1';
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
          valInp.max = isPct ? (needsMul2 ? (maxInt*100).toFixed(1) : maxInt.toFixed(1)) : maxInt.toFixed(1);
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
      el.classList.remove('rank-max', 'rank-gold', 'rank-purple', 'rank-blue');
      el.classList.add(ratio >= 0.999 ? 'rank-max' : ratio > 0.85 ? 'rank-gold' : ratio > 0.70 ? 'rank-purple' : 'rank-blue');
    }

    function _bindRowEvents() {
    m.querySelectorAll('.wwm-cmp-edit-row').forEach(row => {
      const idx = parseInt(row.dataset.affixIdx, 10);
      // val input: 矢印操作後 / blur / 値確定時 第1位丸め
      const valEl = row.querySelector('.wwm-cmp-val-input');
      if (valEl) {
        const normalize = () => {
          const f = parseFloat(valEl.value);
          if (isNaN(f)) return;
          valEl.value = (Math.round(f * 10) / 10).toFixed(1);
        };
        // 矢印キー: ブラウザ default step を完全bypass、 自前 +0.1/-0.1 で浮動誤差ゼロ
        valEl.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const cur = parseFloat(valEl.value) || 0;
            const dir = e.key === 'ArrowUp' ? 1 : -1;
            // 整数演算で浮動誤差排除: cur*10 round + dir → /10
            const next = (Math.round(cur * 10) + dir) / 10;
            const maxV = parseFloat(valEl.getAttribute('max'));
            const minV = parseFloat(valEl.getAttribute('min')) || 0;
            const clamped = Math.max(minV, isNaN(maxV) ? next : Math.min(maxV, next));
            valEl.value = clamped.toFixed(1);
            valEl.dispatchEvent(new Event('input'));
          }
        });
        // change (Enter押下 / blur)
        valEl.addEventListener('change', () => { normalize(); valEl.dispatchEvent(new Event('input')); });
        // blur 確実化
        valEl.addEventListener('blur', () => { normalize(); valEl.dispatchEvent(new Event('input')); });
      }
      row.querySelectorAll('[data-field]').forEach(el => {
        const evt = el.tagName === 'SELECT' ? 'change' : 'input';
        el.addEventListener(evt, () => {
          const f = el.dataset.field;
          const d = newAffixes[idx].equipmentDetails;
          if (f === 'stat') {
            const newId = parseInt(el.value, 10);
            d[0] = newId;
            // PvP専用定音 sentinel: val=1/ratio=1.0/rank=3/useful=0 固定 (計算寄与ゼロ、編集不可)
            if (newId === _PVP_AFFIX_SENTINEL) {
              d[1] = 1; d[2] = 1.0; d[3] = 3; d[4] = 0;
              // input 値も明示書込 (前 affix の val が残らないように)
              const inpPvp = row.querySelector('.wwm-cmp-val-input');
              if (inpPvp) { inpPvp.value = '1.0'; inpPvp.removeAttribute('max'); inpPvp.dataset.pct = '0'; inpPvp.dataset.pctmul = '0'; }
              _refreshRowUI(row, idx);
              _schedulePreview();
              return;
            }
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
              : (typeof d[1]==='number' ? d[1].toFixed(1) : d[1]);
          } else if (f === 'val') {
            const isPct = el.dataset.pct === '1';
            const needsMul = el.dataset.pctmul === '1';
            // 入力中は丸めず raw値で計算 (矢印キー操作 / 第2位 中間入力可)
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
              const displayMax = (isPct && needsMul) ? (max*100).toFixed(1) : max.toFixed(1);
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

    // ── OCR スクショ取込 (TODO #16): 📷 / Ctrl+V / drop → 新置列へ直接投入 ──
    const ocrBtn = m.querySelector('#wwmCmpOcrBtn');
    if (ocrBtn && window.WWMSidebar.ocr) {
      const ocrStatus = m.querySelector('#wwmCmpOcrStatus');
      const _setStatus = (t) => { if (ocrStatus) ocrStatus.textContent = t || ''; };
      let _lastImg = null;          // 言語 fallback の再実行用
      let _ocrBusy = false;

      const _applyOcr = async (imgSrc, langOverride) => {
        if (_ocrBusy) return;
        _ocrBusy = true;
        _lastImg = imgSrc;
        ocrBtn.disabled = true;
        const _watchdog = setTimeout(() => { _ocrBusy = false; ocrBtn.disabled = false; _setStatus(''); }, 20000);
        try {
          const res = await window.WWMSidebar.ocr.run(imgSrc, {
            lang: langOverride || (window.currentLang || 'ja'),
            // allAffixes=null = idx1-4 の使用中 statKey dedupe を無効化 (「全行ブランク」相当の素 pool)。
            // 現装備の構成がスクショ affix の自然な枠を塞ぎ、並びがスクショ順にならない問題の根治
            // (2026-06-08 兄貴提案)。書込後の表示 select は通常 dedupe pool で再構築 = 整合
            getOptions: (idx) => _getAffixOptions(newAffixes[idx]?.equipmentDetails?.[0], slot, idx, null),
            onProgress: (stage, pct) => _setStatus(
              stage === 'lang'
                ? ((window.T&&T.ocrLangLoading)||'辞書取得中…') + ' ' + Math.round(pct*100) + '%'
                : ((window.T&&T.ocrRecognizing)||'解析中…'))
          });
          // match 全滅 → 言語/部位違いの可能性 toast + 言語選択表示
          if (!res.rows.length) {
            window.showToast?.((window.T&&T.ocrNoMatch)||'読取できませんでした — スクショの言語/装備部位を確認してください', { error: true });
            const ls = m.querySelector('#wwmCmpOcrLang');
            if (ls) ls.hidden = false;
            return;
          }
          // Lv 反映 (選択肢に存在する時のみ。_applyNewLv が MAX×0.94 で affix を上書きするため必ず先)
          const lvSelEl = m.querySelector('#wwmCmpNewLvSel');
          if (res.lv && lvSelEl && [...lvSelEl.options].some(o => +o.value === res.lv)) {
            lvSelEl.value = String(res.lv);
            await _applyNewLv(res.lv);
          }
          // affix 投入 (newAffixes 直接更新 → 一括再 render)
          const warnIdx = [];
          for (const r of res.rows) {
            const d = newAffixes[r.idx]?.equipmentDetails;
            if (!d) continue;
            // PvP定音 row (idx5 + 未登録 ID) は編集不可 → skip
            if (r.idx === 5 && !window.WWM_AFFIX?.[d[0]]) continue;
            d[0] = parseInt(r.affixId, 10);
            const sk = window.WWM_AFFIX?.[d[0]]?.statKey;
            let internal = r.value;
            if (_isPctStat(sk) && _pctNeedsMul(sk)) internal = r.value / 100;
            const mx = _getAffixMax(sk, charLv);
            const overMax = (mx != null && internal > mx);   // 論理検証: MAX 超過 = 誤読確定 (clamp せず朱枠で人に渡す)
            d[1] = internal;
            d[2] = (mx && mx > 0) ? Math.min(1, internal / mx) : 0.9;
            d[3] = _deriveRank(d[2]);
            d[4] = _isUsefulAffix(d[0], _virtRi(newKongfuId));
            if (r.confidence < 0.7 || overMax) warnIdx.push(r.idx);   // 閾値 0.7 (PoC 較正値で更新可)
          }
          // OCR が埋められなかった行 (match 不能でスキップ) — _applyNewLv の MAX×0.94 値が
          // 無言で残ると「正常に見える誤データ」になる (2026-06-07 兄貴実スクショ 力→カカ関 で実測)
          // → idx 0-4 は値ブランク化 + 朱枠 (兄貴指定: 読めなかった行は空欄が分かりやすい)。
          //   idx5 (定音) は枠特殊のため朱枠のみ
          const filledIdx = new Set(res.rows.map(r => r.idx));
          const blankIdx = [];
          for (let i = 0; i < 6; i++) {
            if (filledIdx.has(i)) continue;
            const d = newAffixes[i]?.equipmentDetails;
            if (!d) continue;
            if (i === 5 && !window.WWM_AFFIX?.[d[0]]) continue;   // PvP定音 row は対象外
            if (i < 5) {
              d[1] = 0; d[2] = 0; d[3] = 1;
              blankIdx.push(i);
            }
            warnIdx.push(i);
          }
          const rowsEl = m.querySelector('#wwmCmpNewRows');
          if (rowsEl) { rowsEl.innerHTML = renderNewRows(); _bindRowEvents(); }
          // ブランク行: 値 input を空欄表示 (内部 d[1]=0 — 編集で通常入力に復帰)
          blankIdx.forEach(i => {
            const inp = m.querySelector(`.wwm-cmp-edit-row[data-affix-idx="${i}"] .wwm-cmp-val-input`);
            if (inp) inp.value = '';
          });
          // 低確信行 = 朱枠。編集 (input/change) で解除
          warnIdx.forEach(i => {
            const row = m.querySelector(`.wwm-cmp-edit-row[data-affix-idx="${i}"]`);
            if (!row) return;
            row.classList.add('wwm-ocr-warn');
            row.querySelectorAll('select,input').forEach(el => {
              const ev = el.tagName === 'SELECT' ? 'change' : 'input';
              el.addEventListener(ev, () => row.classList.remove('wwm-ocr-warn'), { once: true });
            });
          });
          _schedulePreview();
          window.showToast?.(warnIdx.length
            ? ((window.T&&T.ocrAppliedWarn)||'読取完了 — 朱枠の行を確認してください')
            : ((window.T&&T.ocrApplied)||'読取完了'));
        } catch (err) {
          console.error('[ocr]', err);
          window.showToast?.((window.T&&T.ocrErrEngine)||'OCR エンジン取得失敗 (オフライン?)', { error: true });
        } finally {
          clearTimeout(_watchdog);
          _ocrBusy = false;
          ocrBtn.disabled = false;
          _setStatus('');
        }
      };

      // 📷 click → file picker
      ocrBtn.addEventListener('click', () => {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*';
        inp.addEventListener('change', () => { if (inp.files[0]) _applyOcr(inp.files[0]); });
        inp.click();
      });
      // ? click → 取込ガイド (撮影例 mock = ゲーム画像再配布回避の HTML 再現 + 手順 4 step)
      const helpBtn = m.querySelector('#wwmCmpOcrHelpBtn');
      if (helpBtn) helpBtn.addEventListener('click', () => {
        const T_ = window.T || {};
        // OCR mock label = DataStore.name('stat', key) 経由 (旧 _STAT_LABELS_I18N_ALL[lang] dict 廃止、 2026-06-09 i18n 一本化)
        const _lang = window.currentLang || 'ja';
        const L = new Proxy({}, {
          get(_, k) {
            if (typeof k !== 'string' || !window.WWM_DS) return undefined;
            const v = window.WWM_DS.name('stat', k, _lang);
            return (v && v.indexOf('[stat:') !== 0) ? v : undefined;
          }
        });
        // mock = ゲーム装備詳細画面の再現 (2026-06-07 兄貴実スクショ準拠: 大数字/装備レベル Lv.91/
        //  外功攻撃 53~124/・点 + 👍badge + 値右端オレンジ/末尾定音 = ❖)
        const _bdg = '<i class="wwm-ocr-mock-badge">👍</i>';
        const mockRows = [
          ['・', L.maxPhys || '最大外功攻撃', _bdg, '53.4'],
          ['・', L.affinity || '会意率', '', '3.3%'],
          ['・', L.maxBamboocut || '最大瞬嵐攻撃', _bdg, '36.2'],
          ['・', L.power || '力', _bdg, '39.6'],
          ['・', L.crit || '会心率', _bdg, '7.0%'],
          ['❖', L.physPen || '外功貫通', _bdg, '8.4']
        ];
        const g = document.createElement('div');
        g.className = 'wwm-modal-backdrop';
        g.innerHTML = `
          <div class="wwm-modal wwm-ocr-guide">
            <div class="wwm-modal-header">
              <h2>${T_.ocrHelpTitle || 'スクショ取込ガイド'}</h2>
              <button class="wwm-modal-close" aria-label="Close">×</button>
            </div>
            <div class="wwm-modal-body">
              <p class="wwm-ocr-guide-cap">${T_.ocrHelpExample || '撮影例: 装備詳細画面 (値が右端に並ぶ画面)'}</p>
              <div class="wwm-ocr-mock" aria-hidden="true">
                <div class="wwm-ocr-mock-big">811</div>
                <div class="wwm-ocr-mock-row wwm-ocr-mock-head"><span>${T_.ocrHelpMockLv || '装備レベル'}</span><b>Lv.91</b></div>
                <div class="wwm-ocr-mock-row wwm-ocr-mock-head"><span>${T_.ocrHelpMockAtk || '外功攻撃'}</span><span class="wwm-ocr-mock-plain">53~124</span></div>
                <div class="wwm-ocr-mock-gap"></div>
                ${mockRows.map(r => `<div class="wwm-ocr-mock-row"><span><em class="wwm-ocr-mock-dot">${r[0]}</em> ${r[1]} ${r[2]}</span><b>${r[3]}</b></div>`).join('')}
              </div>
              <ol class="wwm-ocr-guide-steps">
                <li>${T_.ocrHelpStep1 || ''}</li>
                <li>${T_.ocrHelpStep2 || ''}</li>
                <li>${T_.ocrHelpStep3 || ''}</li>
                <li>${T_.ocrHelpStep4 || ''}</li>
              </ol>
              <p class="wwm-ocr-guide-note">${T_.ocrHelpLangNote || ''}</p>
            </div>
          </div>`;
        document.body.appendChild(g);
        g.querySelector('.wwm-modal-close').addEventListener('click', () => g.remove());
        g.addEventListener('click', e => { if (e.target === g) g.remove(); });
      });
      // 言語 fallback select (match 全滅時に表示)
      const langSel = document.createElement('select');
      langSel.id = 'wwmCmpOcrLang';
      langSel.className = 'wwm-ocr-lang-sel';
      langSel.hidden = true;
      langSel.innerHTML = ['ja','en','zh','ko'].map(l => `<option value="${l}">${l}</option>`).join('');
      langSel.value = window.currentLang || 'ja';
      ocrBtn.insertAdjacentElement('afterend', langSel);
      langSel.addEventListener('change', () => { if (_lastImg) _applyOcr(_lastImg, langSel.value); });
      // Ctrl+V paste (modal 表示中。export.js と同 cleanup pattern)
      const onPaste = (e) => {
        const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
        if (item) { e.preventDefault(); _applyOcr(item.getAsFile()); }
      };
      window.addEventListener('paste', onPaste);
      const moOcr = new MutationObserver(() => {
        if (!document.body.contains(m)) { window.removeEventListener('paste', onPaste); moOcr.disconnect(); }
      });
      moOcr.observe(document.body, { childList: true });
      // drag & drop (新置列)
      const newCol = m.querySelector('#wwmCmpNewCol');
      if (newCol) {
        newCol.addEventListener('dragover', e => { e.preventDefault(); newCol.classList.add('wwm-ocr-dropping'); });
        newCol.addEventListener('dragleave', () => newCol.classList.remove('wwm-ocr-dropping'));
        newCol.addEventListener('drop', e => {
          e.preventDefault(); newCol.classList.remove('wwm-ocr-dropping');
          const f = [...(e.dataTransfer?.files || [])].find(x => x.type.startsWith('image/'));
          if (f) _applyOcr(f);
        });
      }
    }

    m.querySelector('#wwmEditApply').addEventListener('click', () => {
      _committed = true;
      if (!WWMState.virtual.gear) WWMState.virtual.gear = {};
      if (!WWMState.virtual.kongfu) WWMState.virtual.kongfu = {};
      // 起点 = 編集中 virtual 優先 (_applyNewLv の Lv 変更 baseAttrs/_inferredLv を保持)。
      // origEq 固定だと Lv select / OCR の Lv 反映が採用時に消える既存バグがあった (2026-06-08)
      const vEq = JSON.parse(JSON.stringify(WWMState.virtual.gear[slot] || origEq));
      vEq.exVo.baseAffixes = newAffixes;
      if (isSetEditable && newSuffix != null) vEq.exVo.suffix = parseInt(newSuffix, 10);
      WWMState.virtual.gear[slot] = vEq;
      if (isWeaponSlot) {
        if (newKongfuId && newKongfuId !== origKongfuId) {
          if (slot === '1') WWMState.virtual.kongfu.kongfuMain = newKongfuId;
          else if (slot === '2') WWMState.virtual.kongfu.kongfuSub = newKongfuId;
        } else {
          // 元に戻す: virtual から削除
          if (slot === '1') delete WWMState.virtual.kongfu.kongfuMain;
          else if (slot === '2') delete WWMState.virtual.kongfu.kongfuSub;
        }
      }
      m.remove();
      _refreshAll();
    });

    m.querySelector('#wwmEditReset').addEventListener('click', () => {
      _committed = true;
      if (WWMState.virtual.gear) delete WWMState.virtual.gear[slot];
      if (WWMState.virtual.kongfu) {
        if (slot === '1') delete WWMState.virtual.kongfu.kongfuMain;
        else if (slot === '2') delete WWMState.virtual.kongfu.kongfuSub;
      }
      m.remove();
      _refreshAll();
    });
  }

  // ── expose ───────────────────────────────────────────────
  window.WWMSidebar = window.WWMSidebar || {};
  window.WWMSidebar.gear = {
    render: renderGearGrid,
    openEdit: openGearEdit,
    set4Bonus: _set4Bonus,
    scoreWithBonus: _scoreWithBonus,
    isOffensiveSet: _isOffensiveSet,
    GEAR_SLOT_ORDER: _GEAR_SLOT_ORDER,
    SET4_BONUS: _SET4_BONUS,
  };
  // 他 module への source of truth expose (calc 連携用、 backward compat ではない)
  window.__WWM_SET4_BONUS_OF = _set4Bonus;
  window.__WWM_SCORE_WITH_BONUS = _scoreWithBonus;
})();
