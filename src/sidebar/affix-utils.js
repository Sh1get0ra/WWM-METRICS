// WWMetrics Sidebar - affix utility helpers
// Phase 3.1: sidebar.js から affix 関連 helper / lookup table 切出。
//   - 表示: _affixDisplayName / _fmtAffixVal / _isPctStat / _pctNeedsMul
//   - 判定: _isUsefulAffix / _matchKongfuSpecific
//   - 装備Lv → tier: _lvToTier / _getAffixMax / _loadEquipMax (+ data/equip_max.json cache)
//   - slot/idx ルール: _isAffixAllowedInSlot / _isAffixAllowedAtIdx0 / _isWeaponDmgMatch / _getAffixOptions
//
// 依存: window.WWM_AFFIX / window.WWM_KONGFU / window._AFFIX_DISPLAY_LABELS / window.T /
//       window.WWM_SCORE_VERSION / WWMState.roleInfo
// 公開: window.WWMSidebar.affix.* (関数辞書)
//       window.WWMSidebar.affix.PVP_AFFIX_SENTINEL (定数公開 = caller で `=== _PVP_AFFIX_SENTINEL` 判定用)

(function () {
  'use strict';

  // ── Affix 統計 ラベル取得 (import.js の _STAT_LABELS 利用) ────
  function _affixDisplayName(id, idx) {
    const info = window.WWM_AFFIX?.[id];
    const key = info?.statKey;
    if (!key) {
      // pvp_attune_table.json hit = ARENA ATTUNE 発動効果系 = PvP専用定音 (全 slot 共通)
      if (window.WWM_PVP_ATTUNE && window.WWM_PVP_ATTUNE[id]) return (window.T && window.T.pvpExclusiveAffix) || 'PvP専用定音';
      // affix6 (idx===5) の未登録 ID = PvP専用定音 legacy fallback (sentinel 含む)
      if (idx === 5) return (window.T && window.T.pvpExclusiveAffix) || 'PvP専用定音';
      return 'オプション#' + id;
    }
    return (window._AFFIX_DISPLAY_LABELS?.[key]) || key;
  }
  // 武具対照 / 格析 panel 用 = allWeaponDmg のみ stat.json 集約形 (「全武学/PvP/BOSSダメ」) なので、
  // stat_display.json の単独正名「全武術効果増加」 に差替えて表示。 bossDmg / playerUnitDmg は
  // stat.json で元から単独形なので _affixDisplayName と同じ経路で OK。 ranking.js (調律/定音番付) は
  // _affixDisplayName 使用 = 集約形 keep。
  function _affixDisplayNameSplit(id, idx) {
    const info = window.WWM_AFFIX?.[id];
    const key = info?.statKey;
    if (!key) {
      if (window.WWM_PVP_ATTUNE && window.WWM_PVP_ATTUNE[id]) return (window.T && window.T.pvpExclusiveAffix) || 'PvP専用定音';
      if (idx === 5) return (window.T && window.T.pvpExclusiveAffix) || 'PvP専用定音';
      return 'オプション#' + id;
    }
    if (key === 'allWeaponDmg') {
      // vi 時は _AFFIX_DISPLAY_LABELS 経由 (Proxy で stat_short 優先) で短縮表記引く。
      // 他言語は stat_display.json の単独正名「全武術効果増加」 系を使う。
      const L = window.currentLang || 'ja';
      if (L === 'vi') {
        const v = window._AFFIX_DISPLAY_LABELS?.[key];
        if (v) return v;
      }
      const T = window.T || {};
      return T['stDisp.dmgBoost.allMartialBoost'] || '全武術効果増加';
    }
    return (window._AFFIX_DISPLAY_LABELS?.[key]) || key;
  }

  // 自動判定: 火力寄与statKey true、 防御系 false
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
    'agility', 'momentum', 'power'
  ]);
  // 会意率 useful 対象 kongfu (九変の剣/無銘の剣/蛇神の槍/無銘の槍)
  const _AFFINITY_USEFUL_KONGFU = new Set([10101, 10102, 10201, 10202, '10101', '10102', '10201', '10202']);

  // 武学固有強化 affix statKey prefix → 対応 kongfu IDs
  // その武学装備中のみ useful
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
    if (typeof val === 'number') return val.toFixed(1);
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
    try { _EQUIP_MAX = await fetch('data/equip_max.json?v=' + (window.WWM_SCORE_VERSION || 7)).then(r=>r.json()); } catch(e){}
    return _EQUIP_MAX;
  }
  function _getCachedEquipMax() { return _EQUIP_MAX; }

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
    // 5行 (body/defense/agility/momentum/power)
    body: 'stat5', defense: 'stat5', agility: 'stat5', momentum: 'stat5', power: 'stat5',
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
    ropeDartDmg: 'atkTypeDmg', hengBladeDmg: 'atkTypeDmg', gauntletDmg: 'atkTypeDmg',
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
    if (!mapKey && /Q$|Charged$|Special$|Drone$|Light$|Heavy$|Healing$|Shield$|Rodent$|VariedCombo$|^bleed$/.test(statKey)) {
      mapKey = 'attunement';
    }
    if (!mapKey) return null;
    const v = t[mapKey];
    if (typeof v === 'number') return v;
    return v?.max ?? null;
  }
  // {min, max} ペア取得 (Lv 別 min-max マスタ移行、 2026-06-23)
  function _getAffixMinMax(statKey, lv) {
    if (!_EQUIP_MAX || !statKey) return null;
    const tier = _lvToTier(lv);
    const t = _EQUIP_MAX.tiers?.[tier];
    if (!t) return null;
    let mapKey = _STAT_TO_MAX_KEY[statKey];
    if (!mapKey && /Q$|Charged$|Special$|Drone$|Light$|Heavy$|Healing$|Shield$|Rodent$|VariedCombo$|^bleed$/.test(statKey)) mapKey = 'attunement';
    if (!mapKey) return null;
    const v = t[mapKey];
    if (typeof v === 'number') return { min: v / 2, max: v };
    if (v && typeof v === 'object' && v.max != null) return { min: v.min, max: v.max };
    return null;
  }

  // slot 別 affix 出現ルール (ゲーム仕様)
  const _WEAPON_DMG_KEYS = new Set(['swordDmg','spearDmg','fanDmg','umbrellaDmg','moBladeDmg','dualBladesDmg','ropeDartDmg','hengBladeDmg','gauntletDmg']);
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
  // kongfuIdOverride: 武具対照 modal で「新装備の武術」 を渡すと、 roleInfo より優先される
  // (装備差替シミュ中に新装備の武器種で affix 候補を絞り込む)。
  function _isWeaponDmgMatch(statKey, slot, roleInfo, kongfuIdOverride) {
    if (!_WEAPON_DMG_KEYS.has(statKey)) return true;
    const kid = kongfuIdOverride || (String(slot) === '1' ? roleInfo?.kongfuMain : roleInfo?.kongfuSub);
    const wt = window.WWM_KONGFU?.[kid]?.weaponType;
    if (!wt) return true;
    const camelize = s => s.replace(/_([a-z])/g, (_,c)=>c.toUpperCase());
    const expected = camelize(wt) + 'Dmg';
    return statKey === expected;
  }

  // INITIAL (affix#1) 候補 master (wwmdb 由来 = data/affix_candidates_initial.json) 経由 filter
  // slot 別 装備カテゴリ判定 (防具+装飾品 = 直 mapping。 武器/弓 slot は master 経由 filter 無効 = 旧経路 keep)
  // ツール slot ↔ wdb category 対応 (静的):
  //   '3'/'4'/'5'/'8' = 防具 4 種 / '10' = 環 (wdb Disc) / '11' = 佩 (wdb Pendant)
  //   '9' (射玦) / '21' (弓矢) = 火力寄与なし = ツール選択不可 = master 対象外
  //   '1' (主武器) / '2' (副武器) = 動的 (= 装備中 kongfu の weaponType 経由)
  const _SLOT_TO_WDB_CAT = {
    '3': 'Helmet', '4': 'Chestpiece', '5': 'Greaves', '8': 'Bracer',
    '10': 'Disc', '11': 'Pendant',
  };
  const _RANK_TO_TIER = { gold: '5', purple: '4', blue: '3' };
  // 装備中武器 → wdb weapon category (Disc/Pendant 等の path 別 stat restrict filter 用 + 武器 slot 自体の解決用)
  function _activeWeaponWdbCat(roleInfo, kongfuIdOverride) {
    const kid = kongfuIdOverride || roleInfo?.kongfuMain;
    const wt = window.WWM_KONGFU?.[kid]?.weaponType;
    if (!wt) return null;
    const M = {
      sword: 'Weapon-Sword', spear: 'Weapon-Spear', mo_blade: 'Weapon-Mo Blade',
      dual_blades: 'Weapon-Dual Blades', rope_dart: 'Weapon-Rope Dart',
      fan: 'Weapon-Fan', umbrella: 'Weapon-Umbrella',
      heng_blade: 'Weapon-Heng Blade', gauntlet: 'Weapon-Gauntlets',
    };
    return M[wt] || null;
  }
  // slot → wdb category 解決 (武器 slot 1/2 は装備武器経由で動的)
  function _slotToWdbCategory(slot, roleInfo, kongfuIdOverride) {
    const s = String(slot);
    if (s === '1' || s === '2') {
      // slot 2 は副武器 = 兄貴指示なきため slot 1 = 主武器と同じ kongfu 由来でいい想定 (= 副武器も同武術系統)
      const kid = kongfuIdOverride || (s === '1' ? roleInfo?.kongfuMain : roleInfo?.kongfuSub);
      const wt = window.WWM_KONGFU?.[kid]?.weaponType;
      if (!wt) return null;
      const M = {
        sword: 'Weapon-Sword', spear: 'Weapon-Spear', mo_blade: 'Weapon-Mo Blade',
        dual_blades: 'Weapon-Dual Blades', rope_dart: 'Weapon-Rope Dart',
        fan: 'Weapon-Fan', umbrella: 'Weapon-Umbrella',
        heng_blade: 'Weapon-Heng Blade', gauntlet: 'Weapon-Gauntlets',
      };
      return M[wt] || null;
    }
    return _SLOT_TO_WDB_CAT[s] || null;
  }
  // wdb master 経由 statKey set 統一 helper (INITIAL/TUNING 共通)
  //   restrict = 自装備 wdbCat 照合のみ (兄貴確認: restrict は「その stat が candidate になる装備 slot list」)
  //   master 無/未対応 slot = null (= 旧経路 fallback)
  function _wdbAllowedStatKeys(masterRoot, slot, equipLv, equipRank, roleInfo, kongfuIdOverride) {
    const wdbCat = _slotToWdbCategory(slot, roleInfo, kongfuIdOverride);
    if (!wdbCat) return null;
    const master = masterRoot?.data;
    if (!master) return null;
    const tier = _RANK_TO_TIER[equipRank] || '5';
    const lv = equipLv || 91;
    const candList = master[wdbCat]?.[String(lv)]?.[tier];
    if (!candList) return null;
    const allKeys = new Set();
    const affixMaster = window.WWM_AFFIX || {};
    for (const c of candList) {
      if (c.chance === 0) continue;
      if (c.restrict && !c.restrict.includes(wdbCat)) continue;
      const sk = affixMaster[c.id]?.statKey;
      if (sk) allKeys.add(sk);
    }
    return allKeys;
  }

  // affix 種別変更 option list: 現 affix と同じ prefix2 のもの → statKey で dedup
  // slot/idx 指定で 6番目限定処理 + idx 1-4 重複不可 (affix0 のみ重複可)
  // PvP専用定音 sentinel ID (WWM_AFFIX に存在しない固定値、計算寄与ゼロ、表示は affix6 fallback で「PvP専用定音」)
  const _PVP_AFFIX_SENTINEL = 999999;
  function _getAffixOptions(currentAffixId, slot, idx, allAffixes, kongfuIdOverride, equipLv, equipRank) {
    const all = window.WWM_AFFIX || {};
    // affix6 + 現在 ID が未登録 (PvP定音) → 変更不可、PvP option のみ返す (全スロット共通)
    if (idx === 5 && !all[currentAffixId]) {
      const pvpName = (window.T && window.T.pvpExclusiveAffix) || 'PvP専用定音';
      return [{ id: _PVP_AFFIX_SENTINEL, statKey: '__pvp__', name: pvpName }];
    }
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
    // wdb master 経由 statKey filter (idx 0 = INITIAL、 idx 1-4 = TUNING、 idx 5 = 既存 logic keep)
    //   master 未対応 slot (= 武器以外で _SLOT_TO_WDB_CAT 未登録) = null = 旧経路 fallback
    let wdbAllowed = null;
    if (idx === 0) {
      wdbAllowed = _wdbAllowedStatKeys(window.WWM_AFFIX_INIT, slot, equipLv, equipRank, WWMState.roleInfo, kongfuIdOverride);
    } else if (idx >= 1 && idx <= 4) {
      wdbAllowed = _wdbAllowedStatKeys(window.WWM_AFFIX_TUNING, slot, equipLv, equipRank, WWMState.roleInfo, kongfuIdOverride);
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
      if (wdbAllowed && !wdbAllowed.has(sk)) continue;
      // slot 別 出現ルール
      if (!_isAffixAllowedInSlot(sk, slot)) continue;
      if (!_isWeaponDmgMatch(sk, slot, WWMState.roleInfo, kongfuIdOverride)) continue;
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
      opts.push({ id, statKey: sk, name: _affixDisplayNameSplit(id, idx) });
    }
    opts.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    // PvE→PvP切替は不可 (上の早期return で逆方向 PvP→PvE も不可。PvE装備と PvP装備の壁を維持)
    return opts;
  }

  // ── global expose ────────────────────────────────────────────────
  window.WWMSidebar = window.WWMSidebar || {};
  window.WWMSidebar.affix = {
    affixDisplayName: _affixDisplayName,
    affixDisplayNameSplit: _affixDisplayNameSplit,
    matchKongfuSpecific: _matchKongfuSpecific,
    isUsefulAffix: _isUsefulAffix,
    isPctStat: _isPctStat,
    pctNeedsMul: _pctNeedsMul,
    fmtAffixVal: _fmtAffixVal,
    lvToTier: _lvToTier,
    loadEquipMax: _loadEquipMax,
    getCachedEquipMax: _getCachedEquipMax,
    getAffixMax: _getAffixMax,
    getAffixMinMax: _getAffixMinMax,
    isAffixAllowedInSlot: _isAffixAllowedInSlot,
    isAffixAllowedAtIdx0: _isAffixAllowedAtIdx0,
    isWeaponDmgMatch: _isWeaponDmgMatch,
    getAffixOptions: _getAffixOptions,
    PVP_AFFIX_SENTINEL: _PVP_AFFIX_SENTINEL,
    // 公開 const (sidebar.js 内 直接 lookup 用)
    SLOT6_ARMOR: _SLOT6_ARMOR,
    SLOT6_WEAPON_LIKE: _SLOT6_WEAPON_LIKE,
    SLOT6_PEN_STATS: _SLOT6_PEN_STATS,
    STAT_TO_MAX_KEY: _STAT_TO_MAX_KEY,
  };
})();

// vite移行 P2: ESM 副作用 module 化 (window expose は IIFE 内 keep)
export {};
