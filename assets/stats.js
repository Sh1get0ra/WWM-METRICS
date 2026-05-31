// ── WWM-DMGCALC Stat Aggregator ─────────────────────────────────
// roleInfo + state (観音/武庫) + Lv95 base + 心法 + セット → 全 stat 集約
// 出力: calc.js computeExpected param object + sidebar 表示用 extra stats

const _PATH_KEY_MAP = {
  bellstrike: { min: 'minBellstrike', max: 'maxBellstrike' },
  stonesplit: { min: 'minStonesplit', max: 'maxStonesplit' },
  silkbind:   { min: 'minSilkbind',   max: 'maxSilkbind'   },
  bamboocut:  { min: 'minBamboocut',  max: 'maxBamboocut'  },
  voidPath:   { min: 'minVoid',       max: 'maxVoid'       },
  phys:       { min: 'minPhys',       max: 'maxPhys'       }
};

// 観音 Lv50 値 (in-game observation): 主武/副武 Min+85/Max+57、環/佩び物 Max+113
// 線形近似 (本来非線形、Lv50 max値、補間)
const _ENHANCE_MAX = {
  '1':  { minPhys: 85, maxPhys: 57 },
  '2':  { minPhys: 85, maxPhys: 57 },
  '10': { maxPhys: 113 },
  '11': { maxPhys: 113 }
};

async function _ensureDicts() {
  const tasks = [];
  if (!window.WWM_LV95_BASE) tasks.push(fetch('data/lv95_base.json').then(r=>r.json()).then(d=>window.WWM_LV95_BASE=d).catch(()=>{}));
  if (!window.WWM_KONGFU)    tasks.push(fetch('data/kongfu.json').then(r=>r.json()).then(d=>window.WWM_KONGFU=d).catch(()=>{}));
  if (!window.WWM_XINFA)     tasks.push(fetch('data/xinfa.json').then(r=>r.json()).then(d=>window.WWM_XINFA=d).catch(()=>{}));
  if (!window.WWM_SETS)      tasks.push(fetch('data/sets.json').then(r=>r.json()).then(d=>window.WWM_SETS=d).catch(()=>{}));
  if (!window.WWM_AFFIX)     tasks.push(fetch('data/affix.json').then(r=>r.json()).then(d=>window.WWM_AFFIX=d).catch(()=>{}));
  if (!window.WWM_EQUIP_BASE_BY_LV) tasks.push(fetch('data/equip_base_by_lv.json').then(r=>r.json()).then(d=>window.WWM_EQUIP_BASE_BY_LV=d).catch(()=>{}));
  await Promise.all(tasks);
}

function _resolvePath(kongfuMain) {
  const k = window.WWM_KONGFU?.[kongfuMain];
  return k?.path || 'bamboocut';
}

function _acc(r, key, val) {
  if (key == null || val == null || isNaN(val)) return;
  if (r[key] === undefined) r[key] = 0;
  r[key] += val;
}

// calc.js / xinfa / sets が使う key → WWM display key 変換
const _CALCJS_TO_WWM = {
  critRate:        'crit',
  // critRateAdj は judgeRes適用後の中間値のため心法effects非対象 → マップ削除 (誤マップ防止)
  sympathyRate:    'affinity',
  hitRate:         'precision',
  minPhysATKAdd:   'minPhys',
  maxPhysATKAdd:   'maxPhys',
  minPhysATK:      'minPhys',
  maxPhysATK:      'maxPhys',
  outerPenAdd:     'physPen',
  elemPenAdd:      'attrPen',
  physDmgBoost:    'physDmgBonus',
  elemAtkBoost:    'attrDmgBonus',
  critBoost:       'critDmgBonus',
  addCritRate:     'directCrit',
  addSympathyRate: 'directAffinity',
  sympathyBoost:   'affinityDmgBonus',
  allMartialBoost: 'allWeaponDmg',
  bossBoost:       'bossDmg',
  playerBoost:     'playerUnitDmg'
};
function _accMapped(r, key, val) {
  _acc(r, _CALCJS_TO_WWM[key] || key, val);
}

// 装備 slot + baseAttrs から 装備個別Lv 逆引き
function _inferEquipLv(slot, eq) {
  if (!eq?.exVo?.baseAttrs) return null;
  const tbl = window.WWM_EQUIP_BASE_BY_LV?.slots?.[String(slot)];
  if (!tbl) return null;
  const lvList = window.WWM_EQUIP_BASE_BY_LV?._lvList || [91, 86, 81, 71];
  for (const lv of lvList) {
    const ref = tbl[String(lv)];
    if (!ref) continue;
    const match = Object.entries(ref).every(([k, v]) => eq.exVo.baseAttrs[k] === v);
    if (match) return lv;
  }
  return null;
}

async function buildStatParams(roleInfo, state) {
  await _ensureDicts();
  const base = window.WWM_LV95_BASE?.stats || {};
  const r = Object.assign({}, base);
  // roleInfo の 5行ステ override (ranking 力/速/会 シミュ用)
  for (const k of ['body','momentum','defense','agility','power']) {
    if (typeof roleInfo?.[k] === 'number') r[k] = roleInfo[k];
  }

  // 1. 装備 baseAttrs (+ 装備個別Lv 逆引き)
  const eqDet = roleInfo?.wearEquipsDetailed || {};
  for (const [slot, eq] of Object.entries(eqDet)) {
    if (eq?.exVo && eq.exVo._inferredLv == null) {
      eq.exVo._inferredLv = _inferEquipLv(slot, eq);
    }
  }
  for (const eq of Object.values(eqDet)) {
    const ba = eq?.exVo?.baseAttrs || {};
    if (ba.MIN_W_ATK) _acc(r, 'minPhys', ba.MIN_W_ATK);
    if (ba.MAX_W_ATK) _acc(r, 'maxPhys', ba.MAX_W_ATK);
    if (ba.W_DEF)     _acc(r, 'physDef', ba.W_DEF);
    if (ba.HP_MAX)    _acc(r, 'maxHp',   ba.HP_MAX);
    if (ba.ARCHER_DAMAGE)            _acc(r, '_archerDmg',     ba.ARCHER_DAMAGE);
    if (ba.ARCHER_WEAKPOINT_DAMAGE)  _acc(r, '_archerWeakDmg', ba.ARCHER_WEAKPOINT_DAMAGE);
  }

  // 2. 装備 affix
  for (const eq of Object.values(eqDet)) {
    for (const aff of (eq?.exVo?.baseAffixes || [])) {
      const d = aff?.equipmentDetails;
      if (!d) continue;
      const [id, val] = d;
      const info = window.WWM_AFFIX?.[id];
      if (info?.statKey) _acc(r, info.statKey, val);
    }
  }

  // 3. 観音 (Enhance) — 仕様検証中: game内ステ表示に影響しない可能性が高いため、
  //    現状 sidebar 加算を除外。隠し効果が判明したら再有効化。
  // (実装保留: 元 Lv 0-50 線形補間で minPhys/maxPhys に加算する想定だった)

  // 4. 武庫 (path key に加算 + 別途 sum 保持で副属性枠に使う)
  let _arsMinSum = 0, _arsMaxSum = 0;
  if (state?.arsenal?.path) {
    const keys = _PATH_KEY_MAP[state.arsenal.path] || _PATH_KEY_MAP.phys;
    for (const tier of Object.values(state.arsenal.tiers || {})) {
      if (tier.min) { _acc(r, keys.min, tier.min); _arsMinSum += tier.min; }
      if (tier.max) { _acc(r, keys.max, tier.max); _arsMaxSum += tier.max; }
    }
  }
  r._arsMinSum = _arsMinSum;
  r._arsMaxSum = _arsMaxSum;
  r._arsPath = state?.arsenal?.path || null;

  // 4.5 武術 (kongfu) effects: 主+副 の minElemMainAdd/maxElemMainAdd → path-specific min/max のみ
  for (const kid of [roleInfo?.kongfuMain, roleInfo?.kongfuSub]) {
    const kf = window.WWM_KONGFU?.[kid];
    if (!kf) continue;
    const kPath = kf.path;
    const kKeys = _PATH_KEY_MAP[kPath] || _PATH_KEY_MAP.bamboocut;
    const ef = kf.effects || {};
    if (ef.minElemMainAdd) _acc(r, kKeys.min, ef.minElemMainAdd);
    if (ef.maxElemMainAdd) _acc(r, kKeys.max, ef.maxElemMainAdd);
    // path特定 key (例: minStonesplitAdd / maxBamboocutAdd)
    const minAddKey = kKeys.min + 'Add';
    const maxAddKey = kKeys.max + 'Add';
    if (ef[minAddKey]) _acc(r, kKeys.min, ef[minAddKey]);
    if (ef[maxAddKey]) _acc(r, kKeys.max, ef[maxAddKey]);
  }

  // 5. 心法 (state.xinfaTiers の Tier値で適用、tier0-6 順次解放)
  //   T2/T5 = 武器条件なし常時、 他Tier = kongfuRequired あれば 主or副 一致必要
  const tiers = state?.xinfaTiers || { 0:6, 1:6, 2:6, 3:6 };
  const passive = roleInfo?.passiveSlots || [];
  const _myKfs = [roleInfo?.kongfuMain, roleInfo?.kongfuSub].filter(Boolean);
  const _TIER_KEYS = ['tier0','tier1','tier2','tier3','tier4','tier5','tier6'];
  for (let i = 0; i < passive.length; i++) {
    const xinfaId = passive[i];
    const x = window.WWM_XINFA?.[xinfaId];
    if (!x?.attributeBuff) continue;
    const tier = tiers[i] ?? tiers[String(i)] ?? 6;
    // 集計: visible(T2/T5,ステ反映) / hidden(他Tier,_hiddenAdditive)
    // 武器専用×0.5 ルール廃止 → 全 effects ×1.0
    // 武器条件 不一致時 effects 全 skip (fixedScoreBonus含む) ← 既存ロジック維持
    const visibleSums = {};
    const hiddenSums = {};
    let fixedScoreBonus = 0;
    for (let t = 0; t <= tier; t++) {
      const tk = _TIER_KEYS[t];
      const def = x.attributeBuff[tk];
      if (!def) continue;
      const isTwoFiveTier = (tk === 'tier2' || tk === 'tier5');
      // T2/T5 以外は kongfuRequired check (定義あれば)
      if (!isTwoFiveTier && Array.isArray(def.kongfuRequired) && def.kongfuRequired.length) {
        const ok = def.kongfuRequired.some(k => _myKfs.includes(k) || _myKfs.includes(String(k)) || _myKfs.includes(Number(k)));
        if (!ok) continue;
      }
      const eff = def.effects || {};
      // synergyKongfu: 指定武術 同時装備で 一致→synergyMultiplier倍 / 不一致→synergyMissingMultiplier倍
      const synKfs = Array.isArray(def.synergyKongfu) ? def.synergyKongfu : [];
      const synActive = synKfs.length > 0 && synKfs.some(k => _myKfs.includes(String(k)) || _myKfs.includes(Number(k)));
      const synMul = synKfs.length === 0 ? 1
                   : synActive ? (def.synergyMultiplier ?? 1)
                   : (def.synergyMissingMultiplier ?? 1);
      for (const [k, v] of Object.entries(eff)) {
        if (typeof v !== 'number') continue;
        const vAdj = v * synMul;
        if (k === 'fixedScoreBonus') {
          fixedScoreBonus += vAdj;
        } else if (isTwoFiveTier) {
          visibleSums[k] = (visibleSums[k] || 0) + vAdj;
        } else {
          hiddenSums[k] = (hiddenSums[k] || 0) + vAdj;
        }
      }
    }
    // 集計適用: 全 effects ×1.0 (武器専用ルール廃止)
    for (const [k, v] of Object.entries(visibleSums)) _accMapped(r, k, v);
    for (const [k, v] of Object.entries(hiddenSums)) {
      if (!r._hiddenAdditive) r._hiddenAdditive = {};
      r._hiddenAdditive[k] = (r._hiddenAdditive[k] || 0) + v;
    }
    r._fixedScoreBonus = (r._fixedScoreBonus || 0) + fixedScoreBonus;
  }

  // 6. セット pieces2 (suffix が 2個以上で発動)
  const suffixCount = {};
  for (const eq of Object.values(eqDet)) {
    const sfx = eq?.exVo?.suffix;
    if (sfx !== undefined) suffixCount[sfx] = (suffixCount[sfx]||0) + 1;
  }
  for (const [sfx, cnt] of Object.entries(suffixCount)) {
    if (cnt < 2) continue;
    const sets = window.WWM_SETS || {};
    const setDef = sets.weaponSets?.[sfx] || sets.bowSets?.[sfx] || sets.defensiveSets?.[sfx];
    if (!setDef?.pieces2?.effects) continue;
    for (const [k, v] of Object.entries(setDef.pieces2.effects)) {
      if (typeof v === 'number') _accMapped(r, k, v);
    }
  }

  // 7. 5行 derived (装備で増えた分のみ補正)
  const baseFive = { body: 129, defense: 129, agility: 129, power: 129, momentum: 129 };
  const dBody     = (r.body     || 0) - baseFive.body;
  const dDefense  = (r.defense  || 0) - baseFive.defense;
  const dAgility  = (r.agility  || 0) - baseFive.agility;
  const dPower    = (r.power    || 0) - baseFive.power;
  const dMomentum = (r.momentum || 0) - baseFive.momentum;

  _acc(r, 'maxHp',    dBody*60 + dDefense*17);
  _acc(r, 'physDef',  dDefense*0.5);
  _acc(r, 'minPhys',  dAgility*0.9 + dMomentum*0.225);
  _acc(r, 'maxPhys',  dPower*0.9   + dMomentum*1.36);
  _acc(r, 'crit',     dAgility*0.00076);  // 速 → 会心率 only
  _acc(r, 'affinity', dPower*0.00038);    // 会 → 会意率 only

  // 8. active path → minElemMain/maxElemMain
  const activePath = _resolvePath(roleInfo?.kongfuMain);
  const pathKeys = _PATH_KEY_MAP[activePath] || _PATH_KEY_MAP.bamboocut;
  r.minElemMain = r[pathKeys.min] || 0;
  r.maxElemMain = r[pathKeys.max] || 0;
  // 表示専用: 全path合計 (ゲーム「属性攻撃」表示準拠、計算には未使用)
  r.minElemDisp = (r.minBellstrike||0) + (r.minStonesplit||0) + (r.minSilkbind||0) + (r.minBamboocut||0) + (r.minVoid||0);
  r.maxElemDisp = (r.maxBellstrike||0) + (r.maxStonesplit||0) + (r.maxSilkbind||0) + (r.maxBamboocut||0) + (r.maxVoid||0);
  // 副属性枠 = 武庫加算分のみ (arsenal.path != activePath 時のみ)
  // 装備 path別 affix は 主path のみ計算反映 (それ以外は死に枠 = ゲーム仕様)
  const arsPath = state?.arsenal?.path;
  let subPath = null;
  // 汎用(phys)武庫 は minPhys/maxPhys に既加算済 → 副属性枠流入禁止 (二重カウント防止)
  if (arsPath && arsPath !== 'phys' && arsPath !== activePath) {
    subPath = arsPath;
    r.minElemSub = _arsMinSum;
    r.maxElemSub = _arsMaxSum;
  } else {
    r.minElemSub = 0;
    r.maxElemSub = 0;
  }
  r._activePath = activePath;
  r._subPath = subPath;

  // 8.1 path別 DMG boost は L515 で集計 (心法/武術の各path別 dmg → 計算=active path total / 表示=MAX(5path))。

  // 8.5 kongfu derived (主+副 両方 適用、ただし crit/affinity 系は 主のみ重複防止)
  const derivedDedupKeys = new Set(['crit','critRate','affinity','sympathyRate']);
  const derivedSeen = new Set();
  for (const kid of [roleInfo?.kongfuMain, roleInfo?.kongfuSub]) {
    const kf = window.WWM_KONGFU?.[kid];
    if (!kf?.derived) continue;
    for (const d of kf.derived) {
      const wwmKey = _CALCJS_TO_WWM[d.appliesTo] || d.appliesTo;
      // 重複防止 (例: 主・副 両方の agility→crit 重複)
      if (derivedDedupKeys.has(wwmKey) && derivedSeen.has(wwmKey)) continue;
      // d.from 解析: 'momentum'/'body'/単純key or 'max(a,b)' 形式
      const _parseFromVal = (from) => {
        if (from === 'minElemMain') return r.minElemMain || 0;
        if (from === 'maxElemMain') return r.maxElemMain || 0;
        const m = /^max\(([^,]+),([^)]+)\)$/.exec(from || '');
        if (m) return Math.max(r[m[1].trim()] || 0, r[m[2].trim()] || 0);
        return r[from] || 0;
      };
      const fromVal = _parseFromVal(d.from);
      // elemPen 系は active path 別の pen key に
      let applyKey = d.appliesTo;
      if (applyKey === 'elemPen') {
        const penMap = { bellstrike:'bellstrikePen', stonesplit:'stonesplitPen', silkbind:'silkbindPen', bamboocut:'bamboocutPen', voidPath:'voidPen' };
        applyKey = penMap[activePath] || 'bamboocutPen';
      }
      // 武術の属性ダメ強化 = その武術自身の path のみ (ユーザー仕様: 武術boostはその武術のpath属性のみ)
      if (applyKey === 'elemAtkBoost') {
        const dmgMap = { bellstrike:'bellstrikeDmgBoost', stonesplit:'stonesplitDmgBoost', silkbind:'silkbindDmgBoost', bamboocut:'bamboocutDmgBoost', voidPath:'voidDmgBoost' };
        applyKey = dmgMap[kf.path] || applyKey;
      }
      const finalKey = _CALCJS_TO_WWM[applyKey] || applyKey;
      if (fromVal >= (d.thresholdValue || 0)) {
        _acc(r, finalKey, d.maxBoost);
      } else {
        const ratio = fromVal / (d.thresholdValue || 1);
        _acc(r, finalKey, d.maxBoost * ratio);
      }
      derivedSeen.add(wwmKey);
    }
  }

  // 8.6 cap警告 (5行ステ derived cap未到達)
  r._capWarnings = {};
  const _fiveKeys = new Set(['body','momentum','defense','agility','power']);
  for (const kid of [roleInfo?.kongfuMain, roleInfo?.kongfuSub]) {
    const kf = window.WWM_KONGFU?.[kid];
    if (!kf?.derived) continue;
    for (const d of kf.derived) {
      // 5行ステ単独 or max(...,5行ステ) パターンを抽出
      const fromStr = d.from || '';
      let warnKeys = [];
      let curVal = 0;
      if (_fiveKeys.has(fromStr)) {
        warnKeys = [fromStr];
        curVal = r[fromStr] || 0;
      } else {
        const m = /^max\(([^,]+),([^)]+)\)$/.exec(fromStr);
        if (m) {
          const a = m[1].trim(), b = m[2].trim();
          const aVal = r[a] || 0, bVal = r[b] || 0;
          curVal = Math.max(aVal, bVal);
          // 5行ステ含むkey のみ警告対象 (cap到達側の stat 警告)
          if (_fiveKeys.has(a) && _fiveKeys.has(b)) {
            // 両方5行ステ → cap到達してない方を警告 (大きい方 < threshold なら大きい側key)
            warnKeys = [curVal === aVal ? a : b];
          } else if (_fiveKeys.has(a)) warnKeys = [a];
          else if (_fiveKeys.has(b)) warnKeys = [b];
        }
      }
      if (!warnKeys.length) continue;
      const thr = d.thresholdValue || 0;
      if (thr > 0 && curVal < thr) {
        for (const wk of warnKeys) {
          const prev = r._capWarnings[wk];
          if (!prev || thr > prev.threshold) {
            r._capWarnings[wk] = { current: Math.round(curVal), threshold: thr };
          }
        }
      }
    }
  }

  // 8.7 無駄属性ATK警告 (副path に有意な属性ATK)
  r._wasteWarnings = {};
  const _PATH_ATK_DISPLAY = {
    bellstrike: ['minBellstrike','maxBellstrike','bellstrike'],
    stonesplit: ['minStonesplit','maxStonesplit','stonesplit'],
    silkbind:   ['minSilkbind','maxSilkbind','silkbind'],
    bamboocut:  ['minBamboocut','maxBamboocut','bamboocut'],
    voidAtk:    ['minVoid','maxVoid','voidPath']
  };
  let _subPathTotal = 0;
  const _subPathLabels = [];
  const _PATH_LABEL_JA = { bellstrike:'鋼鳴', stonesplit:'砕岩', silkbind:'糸操', bamboocut:'瞬嵐', voidAtk:'無相' };
  for (const [displayKey, [mk, mxk, pathId]] of Object.entries(_PATH_ATK_DISPLAY)) {
    if (pathId === activePath) continue;
    const total = (r[mk] || 0) + (r[mxk] || 0);
    if (total > 50) {
      r._wasteWarnings[displayKey] = Math.round(total);
      _subPathTotal += total;
      _subPathLabels.push(`${_PATH_LABEL_JA[displayKey]}=${Math.round(total)}`);
    }
  }
  // 親 elemAtk 行に集約警告
  if (_subPathLabels.length > 0) {
    r._wasteWarnings.elemAtk = `副path属性ATK: ${_subPathLabels.join(', ')}`;
  }

  // 9. 9293025 (武器種武学ダメ ropeDartDmg等) は active weapon class なら specMartialBoost に統合
  // affix.json の statKey が weapon-class specific (swordDmg/spearDmg/ropeDartDmg/umbrellaDmg等) のものを集計
  // weapon-class generic dmg のみ (武術技毎のQ/Charged/Special/Light は move-specific で別カテゴリ)
  const WEAPON_CLASS_MAP = {
    sword:        ['swordDmg'],
    spear:        ['spearDmg'],
    fan:          ['fanDmg'],
    moBlade:      ['moBladeDmg'],
    dualBlades:   ['dualBladesDmg'],
    umbrella:     ['umbrellaDmg'],
    ropeDart:     ['ropeDartDmg'],
    hengBlade:    ['hengBladeDmg']
  };
  const mainKf = window.WWM_KONGFU?.[roleInfo?.kongfuMain];
  const subKf = window.WWM_KONGFU?.[roleInfo?.kongfuSub];
  const activeClasses = new Set();
  if (mainKf?.weaponType) activeClasses.add(mainKf.weaponType);
  if (subKf?.weaponType)  activeClasses.add(subKf.weaponType);
  // weaponType の表記: "dual_blades"等 → camelCase 変換
  const camelize = s => s.replace(/_([a-z])/g, (_,c)=>c.toUpperCase());
  const activeClassKeys = [...activeClasses].map(camelize);
  // weaponDmg 系 (指定武術効果強化、武器オプション)
  //  - 同 weapon class 内: 重複不可 → max
  //  - 異 weapon class (主/副 異種): 各 max を sum / 2 (2武器持ち、各50%発動想定)
  const perClassMax = [...activeClassKeys].map(cls => {
    let m = 0;
    for (const k of (WEAPON_CLASS_MAP[cls] || [])) {
      const v = r[k];
      if (typeof v === 'number') m = Math.max(m, v);
    }
    return m;
  });
  // score 計算用: 異 class なら平均 (N/2)
  const weaponClassEffScore = perClassMax.length > 1
    ? perClassMax.reduce((a,b) => a+b, 0) / 2
    : (perClassMax[0] || 0);
  // sidebar 表示用: max のみ (ゲーム画面準拠)
  const weaponClassEffDisplay = perClassMax.length ? Math.max(...perClassMax) : 0;
  let specBoost = weaponClassEffScore;
  let specBoostBaseDisplay = weaponClassEffDisplay;
  // 9.5 武学固有 affix (xxxQ/Charged/Special/Light/Rodent/Drone/Healing/Shield/bleed/VariedCombo)
  //     → active kongfuMain/Sub と一致時のみ specMartialBoost に統合 (max)
  const KONGFU_SPECIFIC_PREFIXES = [
    { prefix: 'namelessSword', kongfus: [10102] },
    { prefix: 'namelessSpear', kongfus: [10202] },
    { prefix: 'sword',         kongfus: [10101] },
    { prefix: 'spear',         kongfus: [10201] },
    { prefix: 'bleed',         kongfus: [10101] },
    { prefix: 'panaceaFan',    kongfus: [10301] },
    { prefix: 'fan',           kongfus: [10302] },
    { prefix: 'stormbreaker',  kongfus: [20103] },
    { prefix: 'phalanxbane',   kongfus: [20402] },
    { prefix: 'moBlade',       kongfus: [20401] },
    { prefix: 'infernalTwinblades', kongfus: [20501] },
    { prefix: 'everspringUmb', kongfus: [20603] },
    { prefix: 'soulshadeUmb',  kongfus: [20602] },
    { prefix: 'umb',           kongfus: [20601] },
    { prefix: 'mortalRopeDart',kongfus: [20701] },
    { prefix: 'unfetteredRopeDart', kongfus: [20702] },
    { prefix: 'snowparting',   kongfus: [20801] }
  ];
  const activeKongfus = new Set([roleInfo?.kongfuMain, roleInfo?.kongfuSub].filter(Boolean).map(Number));
  const sortedPrefixes = [...KONGFU_SPECIFIC_PREFIXES].sort((a,b) => b.prefix.length - a.prefix.length);
  // display版 = 防具 slot 3/4/5/8 idx 5 除外 (sidebar 表示用)
  // score版 = 全 affix 加算 (calc.js / damage 計算用)
  const ARMOR_SLOTS = new Set(['3','4','5','8']);
  let specBoostDisplay = specBoostBaseDisplay;
  let specBoostScore = specBoost;
  for (const [slot, eq] of Object.entries(eqDet)) {
    const affixes = eq?.exVo?.baseAffixes || [];
    for (let i = 0; i < affixes.length; i++) {
      const d = affixes[i]?.equipmentDetails;
      if (!d) continue;
      const info = window.WWM_AFFIX?.[d[0]];
      const sk = info?.statKey;
      if (!sk || typeof d[1] !== 'number') continue;
      for (const def of sortedPrefixes) {
        if (sk.startsWith(def.prefix)) {
          if (def.kongfus.some(id => activeKongfus.has(id))) {
            specBoostScore += d[1];
            if (!(ARMOR_SLOTS.has(String(slot)) && i === 5)) {
              specBoostDisplay += d[1];
            }
          }
          break;
        }
      }
    }
  }
  r._specMartialBoostMax = specBoostDisplay;  // sidebar 表示用 (防具 idx 5 除外)
  r._specMartialBoostScore = specBoostScore;  // calc.js / score 用 (全 加算)

  // 10. 属性増強 = 全 5path 貫通の合計 (sidebar表示用、calc.js elemBoostMain と別key)
  // 属性増強 (表示) = generic(attrPen) + MAX(各path貫通) + 無相貫通(全path共通)。 ゲーム仕様: 単純SUMでなく MAX+無相。
  r.attrBoostSum = (r.attrPen||0) + Math.max(r.bellstrikePen||0, r.stonesplitPen||0, r.silkbindPen||0, r.bamboocutPen||0) + (r.voidPen||0);

  // 11. 固定値
  r.maxQi = 100;
  r.grazeConvert = 0;

  // 12. 適用値 (game UI 表示準拠: 命中率 = capped、会心 = cap 80%、会意 = cap 40%)
  // ユーザー仕様: sidebar 適用値 (カッコ内) は最大 80%/40% で頭打ち表示。
  const judgeResApplied = 1.45;
  // 命中率 applied: judgeRes 経由式 (ゲーム画面表記準拠)
  // raw < 0.65 → そのまま、>= 0.65 → 0.65 + (raw-0.65)/judgeRes、0..1 clamp
  {
    const _raw = r.precision || 0;
    const _jr = r.judgeRes || 1.45;
    r.appliedHit = Math.max(0, Math.min(1, _raw < 0.65 ? _raw : 0.65 + (_raw - 0.65) / _jr));
  }
  r.appliedCrit      = Math.min(0.8, (r.crit || 0) / judgeResApplied);
  r.appliedSympathy  = Math.min(0.4, (r.affinity || 0) / judgeResApplied);

  // 13. 最終会心率/会意率 (calc.js _computeCoreLayer式準拠: cap内 + directCrit/Affinity 加算、 0..1 clamp)
  r.finalSympathy = Math.min(1, r.appliedSympathy + (r.directAffinity || 0));
  r.finalCrit     = Math.max(0, Math.min(1 - r.finalSympathy, r.appliedCrit + (r.directCrit || 0)));
  // 最終発動率 (calc.js pCrit/pSympathy/pGraze/pNormal 同等)
  r.pSympathy = r.finalSympathy;
  r.pCrit     = r.appliedHit * r.finalCrit;
  r.pGraze    = (1 - r.appliedHit) * (1 - r.pSympathy);
  r.pNormal   = Math.max(0, 1 - r.pCrit - r.pSympathy - r.pGraze);
  r.finalCritSym = r.pCrit + r.pSympathy;
  r.grazeConvert = 0;  // 軽傷転換率 (現状 affix なし、固定0)

  // 9. calc.js param 名 マッピング
  r.hitRate         = r.precision      || 0;
  r.critRate        = r.crit           || 0;
  r.sympathyRate    = r.affinity       || 0;
  r.addCritRate     = r.directCrit     || 0;
  r.addSympathyRate = r.directAffinity || 0;
  r.critBoost       = r.critDmgBonus     || 0;
  r.sympathyBoost   = r.affinityDmgBonus || 0;
  r.outerPen        = r.physPen        || 0;
  // elemPen = active path Pen + 無相貫通 + attrPen
  const _activePathPen = (() => {
    const m = { bellstrike:'bellstrikePen', stonesplit:'stonesplitPen', silkbind:'silkbindPen', bamboocut:'bamboocutPen', voidPath:'voidPen' };
    const k = m[activePath];
    return k ? (r[k] || 0) : 0;
  })();
  r.elemPen         = (r.attrPen || 0) + _activePathPen + (activePath !== 'voidPath' ? (r.voidPen || 0) : 0);
  r.weaponBonus     = r.physDmgBonus   || 0;
  // elemBoostMain/Sub は L549-550 で 1.5/1.0 に上書きされる (旧 1/1 dead代入削除)
  // 属性攻撃強化 = path別 (ゲーム仕様: 表示=MAX(5path)、計算=active path total)。generic(attrDmgBonus)は本来0。
  const _PDMG = { bellstrike:'bellstrikeDmgBoost', stonesplit:'stonesplitDmgBoost', silkbind:'silkbindDmgBoost', bamboocut:'bamboocutDmgBoost', voidPath:'voidDmgBoost' };
  ['bellstrikeDmgBoost','stonesplitDmgBoost','silkbindDmgBoost','bamboocutDmgBoost','voidDmgBoost'].forEach(k => { r[k] = r[k] || 0; });
  const _genElemDmg = r.attrDmgBonus || 0;
  const _pathDmgTotals = {
    bellstrike: _genElemDmg + r.bellstrikeDmgBoost,
    stonesplit: _genElemDmg + r.stonesplitDmgBoost,
    silkbind:   _genElemDmg + r.silkbindDmgBoost,
    bamboocut:  _genElemDmg + r.bamboocutDmgBoost,
    voidPath:   _genElemDmg + r.voidDmgBoost,
  };
  r._elemDmgByPath = _pathDmgTotals;                                    // 内訳表示用 (path→total)
  r.elemAtkBoost     = _pathDmgTotals[activePath] || _genElemDmg;       // 計算: active path total
  r.elemAtkBoostDisp = Math.max(0, ...Object.values(_pathDmgTotals));   // 表示: MAX(5path)
  // 内訳 (展開表示) 用 path別キー
  r.elemDmgBellstrike = _pathDmgTotals.bellstrike;
  r.elemDmgStonesplit = _pathDmgTotals.stonesplit;
  r.elemDmgSilkbind   = _pathDmgTotals.silkbind;
  r.elemDmgBamboocut  = _pathDmgTotals.bamboocut;
  r.elemDmgVoid       = _pathDmgTotals.voidPath;
  r.allMartialBoost  = r.allWeaponDmg  || 0;
  r.specMartialBoost = r._specMartialBoostScore || 0;
  r.bossBoost       = r.bossDmg        || 0;
  r.playerBoost     = r.playerUnitDmg  || 0;
  r.stMysticDmg     = (r.stControlMysticDmg||0) + (r.stBurstMysticDmg||0) + (r.stMysticDmg||0);
  r.areaMysticDmg   = (r.areaDebuffMysticDmg||0) + (r.areaDmgMysticDmg||0) + (r.areaMysticDmg||0);

  r.maxPhysATK = r.maxPhys;
  r.minPhysATK = r.minPhys;
  // 敵Lv 自動: charLv 95→91, 96-100→96 (アップデートに追加可)
  const charLv = roleInfo?.level || 95;
  let enemyLv;
  if (charLv >= 96) enemyLv = 96;
  else enemyLv = 91;
  // 敵Lv テーブル (DEF / 審判耐性)
  const ENEMY_TABLE = {
    16:  { def: 10,  jr: 1.0 },
    51:  { def: 29,  jr: 1.0 },
    81:  { def: 270, jr: 1.15 },
    86:  { def: 307, jr: 1.3 },
    91:  { def: 350, jr: 1.45 },
    96:  { def: 405, jr: 1.65 },
    100: { def: 498, jr: 1.85 }
  };
  const eRow = ENEMY_TABLE[enemyLv] || ENEMY_TABLE[91];
  r.physDef    = eRow.def;
  r.judgeRes   = eRow.jr;
  r.physRes    = 0;
  r.elemRes    = 0;
  r.enemyDebuff= 0;
  r.dmgReduce1 = 0;
  r.dmgReduce2 = 0;
  r.worldLv    = 14;
  r.martialLv  = charLv;  // キャラLvと同一
  r.outerCoeff = 1.5;
  r.statusCoeff= 1.5;
  r.outerAdd   = 230;
  // 属性強化 (主) = active path 適用 1.5、副 = 1.0
  r.elemBoostMain = 1.5;
  r.elemBoostSub  = 1.0;

  // 最小>最大 の場合 最大=最小 (ゲーム仕様)
  if (r.minPhys > r.maxPhys) r.maxPhys = r.minPhys;
  if (r.minPhysATK > r.maxPhysATK) r.maxPhysATK = r.minPhysATK;
  if (r.minElemMain > r.maxElemMain) r.maxElemMain = r.minElemMain;
  if (r.minElemSub > r.maxElemSub)   r.maxElemSub  = r.minElemSub;
  // 5path 各 attack も同様
  const _PATH_MIN_MAX = [
    ['minBellstrike','maxBellstrike'],
    ['minStonesplit','maxStonesplit'],
    ['minSilkbind','maxSilkbind'],
    ['minBamboocut','maxBamboocut'],
    ['minVoid','maxVoid']
  ];
  for (const [mk, mxk] of _PATH_MIN_MAX) {
    if ((r[mk] || 0) > (r[mxk] || 0)) r[mxk] = r[mk];
  }

  return r;
}

window.WWMStats = { buildStatParams };
