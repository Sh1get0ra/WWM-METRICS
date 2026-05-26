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
  critRateAdj:     'crit',
  sympathyRate:    'affinity',
  hitRate:         'precision',
  minPhysATKAdd:   'minPhys',
  maxPhysATKAdd:   'maxPhys',
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

async function buildStatParams(roleInfo, state) {
  await _ensureDicts();
  const base = window.WWM_LV95_BASE?.stats || {};
  const r = Object.assign({}, base);

  // 1. 装備 baseAttrs
  const eqDet = roleInfo?.wearEquipsDetailed || {};
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

  // 4. 武庫
  if (state?.arsenal?.path) {
    const keys = _PATH_KEY_MAP[state.arsenal.path] || _PATH_KEY_MAP.phys;
    for (const tier of Object.values(state.arsenal.tiers || {})) {
      if (tier.min) _acc(r, keys.min, tier.min);
      if (tier.max) _acc(r, keys.max, tier.max);
    }
  }

  // 4.5 武術 (kongfu) effects: 主+副 の minElemMainAdd/maxElemMainAdd → path-specific min/max のみ
  for (const kid of [roleInfo?.kongfuMain, roleInfo?.kongfuSub]) {
    const kf = window.WWM_KONGFU?.[kid];
    if (!kf) continue;
    const kPath = kf.path;
    const kKeys = _PATH_KEY_MAP[kPath] || _PATH_KEY_MAP.bamboocut;
    const ef = kf.effects || {};
    if (ef.minElemMainAdd) _acc(r, kKeys.min, ef.minElemMainAdd);
    if (ef.maxElemMainAdd) _acc(r, kKeys.max, ef.maxElemMainAdd);
  }

  // 5. 心法 (state.xinfaTiers の Tier値で適用、Tier>=2 で tier2、Tier>=5 で tier5)
  const tiers = state?.xinfaTiers || { 0:5, 1:5, 2:5, 3:5 };
  const passive = roleInfo?.passiveSlots || [];
  for (let i = 0; i < passive.length; i++) {
    const xinfaId = passive[i];
    const x = window.WWM_XINFA?.[xinfaId];
    if (!x?.attributeBuff) continue;
    const tier = tiers[i] ?? tiers[String(i)] ?? 5;
    const apply = (tk) => {
      const eff = x.attributeBuff[tk]?.effects || {};
      for (const [k, v] of Object.entries(eff)) {
        if (typeof v === 'number') _accMapped(r, k, v);
      }
    };
    if (tier >= 2) apply('tier2');
    if (tier >= 5) apply('tier5');
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
  r.minElemSub  = 0;
  r.maxElemSub  = 0;
  r._activePath = activePath;

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
      const fromVal = (d.from === 'minElemMain') ? r.minElemMain
                    : (d.from === 'maxElemMain') ? r.maxElemMain
                    : (r[d.from] || 0);
      // elemPen 系は active path 別の pen key に
      let applyKey = d.appliesTo;
      if (applyKey === 'elemPen') {
        const penMap = { bellstrike:'bellstrikePen', stonesplit:'stonesplitPen', silkbind:'silkbindPen', bamboocut:'bamboocutPen', voidPath:'voidPen' };
        applyKey = penMap[activePath] || 'bamboocutPen';
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
  let specBoost = 0;
  for (const cls of activeClassKeys) {
    for (const k of (WEAPON_CLASS_MAP[cls] || [])) {
      const v = r[k];
      if (typeof v === 'number') specBoost = Math.max(specBoost, v);
    }
  }
  r._specMartialBoostMax = specBoost;

  // 10. 属性増強 = 全 5path 貫通の合計 (sidebar表示用、calc.js elemBoostMain と別key)
  r.attrBoostSum = (r.bellstrikePen||0) + (r.stonesplitPen||0) + (r.silkbindPen||0) + (r.bamboocutPen||0) + (r.voidPen||0);

  // 11. 固定値
  r.maxQi = 100;
  r.grazeConvert = 0;

  // 12. 適用値 (game UI 表示準拠: 命中率 = capped、会心/会意 = raw/1.45)
  const judgeResApplied = 1.45;
  r.appliedHit       = Math.min(1, r.precision || 0);
  r.appliedCrit      = (r.crit || 0) / judgeResApplied;
  r.appliedSympathy  = (r.affinity || 0) / judgeResApplied;

  // 13. 最終会心率/会意率 (calc.js式準拠: cap内 + directCrit/Affinity 加算)
  r.finalSympathy = Math.min(0.4, r.appliedSympathy) + (r.directAffinity || 0);
  r.finalCrit     = Math.min(1 - r.finalSympathy, Math.min(0.8, r.appliedCrit) + (r.directCrit || 0));

  // 9. calc.js param 名 マッピング
  r.hitRate         = r.precision      || 0;
  r.critRate        = r.crit           || 0;
  r.sympathyRate    = r.affinity       || 0;
  r.addCritRate     = r.directCrit     || 0;
  r.addSympathyRate = r.directAffinity || 0;
  r.critBoost       = r.critDmgBonus     || 0;
  r.sympathyBoost   = r.affinityDmgBonus || 0;
  r.outerPen        = r.physPen        || 0;
  r.elemPen         = r.attrPen        || 0;
  r.weaponBonus     = r.physDmgBonus   || 0;
  r.elemBoostMain   = 1;
  r.elemBoostSub    = 1;
  r.elemAtkBoost    = r.attrDmgBonus   || 0;
  r.allMartialBoost  = r.allWeaponDmg  || 0;
  r.specMartialBoost = r._specMartialBoostMax || 0;
  r.bossBoost       = r.bossDmg        || 0;
  r.playerBoost     = r.playerUnitDmg  || 0;
  r.stMysticDmg     = (r.stControlMysticDmg||0) + (r.stBurstMysticDmg||0) + (r.stMysticDmg||0);
  r.areaMysticDmg   = (r.areaDebuffMysticDmg||0) + (r.areaDmgMysticDmg||0) + (r.areaMysticDmg||0);

  r.maxPhysATK = r.maxPhys;
  r.minPhysATK = r.minPhys;
  r.judgeRes   = 1;
  r.physRes    = 0;
  r.elemRes    = 0;
  r.enemyDebuff= 0;
  r.dmgReduce1 = 0;
  r.dmgReduce2 = 0;
  r.worldLv    = 14;
  r.martialLv  = 5;
  r.outerCoeff = 1.0;
  r.statusCoeff= 1.5;
  r.outerAdd   = 230;

  return r;
}

window.WWMStats = { buildStatParams };
