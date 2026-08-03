// ── WWMetrics Stat Aggregator ─────────────────────────────────
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

// 観音強化 (鍛音) max 想定 加算ヘルパー。 currentMaxLv (data/guanyin_levels.json) 想定で
// 全 slot 強化済として min/max phys に加算。 武器 (主+副) + 環 + 佩 の 4 slot のみ
// (弓 = 観音なし / 防具 = 外功防御のみ で min/max 影響なし)。 = キャラ才能 max 振り想定と同思想。
function _applyGuanyinMax(r) {
  const gy = window.WWM_GUANYIN_LEVELS;
  if (!gy || !gy.tables || gy.currentMaxLv == null) return;
  const lv = String(gy.currentMaxLv);
  const wpn = gy.tables.weapon?.[lv];
  const rs = gy.tables.ringSash?.[lv];
  if (wpn) {
    if (wpn.minPhys) _acc(r, 'minPhys', wpn.minPhys * 2); // 主+副
    if (wpn.maxPhys) _acc(r, 'maxPhys', wpn.maxPhys * 2);
  }
  if (rs && rs.maxPhys) _acc(r, 'maxPhys', rs.maxPhys * 2); // 環+佩
}

async function _ensureDicts() {
  // dictMap 唯一源 = data-store.js CALC_DICTS (P4-mini 供給一元化 2026-06-10)
  await window.WWM_DS.ensureCalcData();
}

// kongfu 才能 突破段階 (重) をキャラLvから決定 (2026-07-07 兄貴仕様: 武術Lvはキャラ
// Lvを超えられない前提で、Lv95→十二重/Lv96→十三重 のように lvCaps で最小の重を選ぶ)。
// ⚠️ 十三重(lvCaps idx12)以降の解放トリガーは WorldLv+キャラLv 相互考慮に変わる可能性
// あり (兄貴)。変更時は data/kongfu_talent_ladders.json の lvCaps とこの関数のみ修正。
// ladders 未load 時 fallback = 12 (十二重/Lv95 現行キャップ)。
function _kongfuTalentStage(charLv) {
  const L = window.WWM_KONGFU_LADDERS;
  if (!L || !Array.isArray(L.lvCaps)) return 12;
  // null/undefined = 未指定 → 95 (max想定、観音と同思想)。 0/負値 = 1 (最低段階) にclamp
  const lv = charLv == null ? 95 : Math.max(1, charLv);
  for (let i = 0; i < L.lvCaps.length; i++) {
    if (L.lvCaps[i] >= lv) return i + 1;
  }
  return L.lvCaps.length;
}

// kongfu derived entry の {thr, cap} を突破段階から解決 (v2 slot schema、
// data/kongfu_talent_ladders.json 参照)。旧schema (thresholdValue/maxBoost 直値) は
// そのまま返す互換。S3 (pathステータス上昇) は三重解放 = rung = stage-2、未解放は null。
function _resolveDerivedRung(d, stage) {
  if (d.thresholdValue != null) return { thr: d.thresholdValue, cap: d.maxBoost }; // 旧schema互換
  const L = window.WWM_KONGFU_LADDERS;
  // fetch失敗時 ensureCalcData は {} で続行する仕様 → 構造check必須 (throw防止、寄与0で degrade)
  if (!L || !Array.isArray(L.s1Thresholds) || !L.s3Thresholds || !L.s1Caps || !L.s3Caps) return null;
  if (d.slot === 's1') {
    const i = Math.min(stage, L.s1Thresholds.length) - 1;
    const caps = L.s1Caps?.[d.appliesTo];
    if (!caps) return null;
    return { thr: L.s1Thresholds[i], cap: caps[i] };
  }
  if (d.slot === 's3') {
    const rung = stage - 2;
    if (rung < 1) return null;
    const table = d.weaponSpecific === 'bellstrike' ? L.s3Thresholds.bellstrike : L.s3Thresholds.normal;
    const i = Math.min(rung, table.length) - 1;
    const caps = /Pen$/.test(d.appliesTo) ? L.s3Caps?.pen : L.s3Caps?.dmg;
    if (!caps) return null;
    return { thr: table[i], cap: caps[i] };
  }
  return null;
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

// 装備 slot + baseAttrs から 装備個別Lv 逆引き (2026-06-23 新 schema: 全 Lv × 全 tier (金/紫/青) 走査)
function _inferEquipLv(slot, eq) {
  if (!eq?.exVo?.baseAttrs) return null;
  const slotTbl = window.WWM_EQUIP_BASE_BY_LV?.slots?.[String(slot)];
  if (!slotTbl?.table) return null;
  const lvList = window.WWM_EQUIP_BASE_BY_LV?._lvList || [96, 91, 86, 81, 71];
  for (const lv of lvList) {
    const tierTbl = slotTbl.table[String(lv)];
    if (!tierTbl) continue;
    for (const tier of ['5','4','3']) {  // 金 → 紫 → 青 順 (最頻度装備優先)
      const ref = tierTbl[tier];
      if (!ref) continue;
      const match = Object.entries(ref).every(([k, v]) => eq.exVo.baseAttrs[k] === v);
      if (match) return lv;
    }
  }
  return null;
}

// weapon class generic ダメ (集約 §9 + buildAffixAliveJudge 共有)
const WEAPON_CLASS_MAP = {
  sword:        ['swordDmg'],
  spear:        ['spearDmg'],
  fan:          ['fanDmg'],
  moBlade:      ['moBladeDmg'],
  dualBlades:   ['dualBladesDmg'],
  umbrella:     ['umbrellaDmg'],
  ropeDart:     ['ropeDartDmg'],
  hengBlade:    ['hengBladeDmg'],
  gauntlet:     ['gauntletDmg']    // 手甲 (天志拳系、 2026年7月武器実装予定)。 affix internal 未割当=値は武器実装後 scout、 現状 表示枠のみ
};
const _WEAPON_CLASS_DMG_KEYS = new Set(Object.values(WEAPON_CLASS_MAP).flat());
// 武学固有 affix prefix → 対応 kongfu (集約 §9.5 + buildAffixAliveJudge 共有)
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
  { prefix: 'snowparting',   kongfus: [20801] },
  { prefix: 'heavenwillGauntlets', kongfus: [20901] },
  { prefix: 'skygraspRopeDart',    kongfus: [20703] }
];

// ── 装備最適化用: affix statKey 生死判定 (score 到達性) ──────────
// 返す judge(statKey) が false = その key は現 roleInfo 構成で computeExpected 入力に
// 恒等的に到達しない (寄与 0) = swap しても Δ≤0 = greedy で絶対採用されない → 評価 skip 可。
// 判定根拠 (buildStatParamsSync の集約経路と 1:1 対応、変更時は同期必須):
//   - derived.from (max(a,b) 分解込み) に登場 → 生 (kongfu derived 入力)
//   - maxHp/physDef = 敵値で上書き (L603)・physResist = 参照ゼロ → 死
//   - body/defense = 5行 derived の行き先が maxHp/physDef のみ → 死 (derivedFrom 該当時を除く)
//   - path 別 min/max/Pen = active path のみ elemMain/elemPen 到達 (voidPen は常時加算 = default 生)
//   - weaponClass ダメ (xxxDmg) = 装備武器種のみ specMartialBoost (prefix 判定より先、fan 系誤 skip 防止)
//   - 武学固有 prefix = 装備武術のみ specMartialBoost
//   - 未知 / calc 直行系 = 生 (保守的に評価)
function buildAffixAliveJudge(roleInfo) {
  const activePath = _resolvePath(roleInfo?.kongfuMain);
  const activeKongfus = new Set([roleInfo?.kongfuMain, roleInfo?.kongfuSub].filter(Boolean).map(Number));
  const camelize = s => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  const activeClassDmgKeys = new Set();
  for (const kid of [roleInfo?.kongfuMain, roleInfo?.kongfuSub]) {
    const wt = window.WWM_KONGFU?.[kid]?.weaponType;
    if (wt) for (const k of (WEAPON_CLASS_MAP[camelize(wt)] || [])) activeClassDmgKeys.add(k);
  }
  const derivedFrom = new Set();
  for (const kid of [roleInfo?.kongfuMain, roleInfo?.kongfuSub]) {
    for (const d of (window.WWM_KONGFU?.[kid]?.derived || [])) {
      const m = /^max\(([^,]+),([^)]+)\)$/.exec(d.from || '');
      if (m) { derivedFrom.add(m[1].trim()); derivedFrom.add(m[2].trim()); }
      else if (d.from) derivedFrom.add(d.from);
    }
  }
  // synergy effectsByStage の HP線形 scaling (断魂×嵐雷 bonusCritRate 等、2026-07-07) が
  // ペア成立で有効な構成では maxHp → bonusCritRate → score の寄与経路が生まれる
  // → maxHp と body (5行derived 経由で maxHp に流れる) を生扱いにする (cap 到達判定は
  // state 無しでは不能のため保守的に常時生 = 誤skipゼロ優先)
  let synergyHpScaling = false;
  for (const kid of [roleInfo?.kongfuMain, roleInfo?.kongfuSub]) {
    for (const se of (window.WWM_KONGFU?.[kid]?.synergyEffects || [])) {
      if (!se?.effectsByStage || !Array.isArray(se.with)) continue;
      if (!se.with.every(w => activeKongfus.has(Number(w)))) continue;
      for (const stageEff of Object.values(se.effectsByStage)) {
        for (const v of Object.values(stageEff)) {
          if (v && typeof v === 'object' && v.hpThreshold) synergyHpScaling = true;
        }
      }
    }
  }
  const PATH_MINMAX = {
    minBellstrike: 'bellstrike', maxBellstrike: 'bellstrike',
    minStonesplit: 'stonesplit', maxStonesplit: 'stonesplit',
    minSilkbind:   'silkbind',   maxSilkbind:   'silkbind',
    minBamboocut:  'bamboocut',  maxBamboocut:  'bamboocut',
    minVoid:       'voidPath',   maxVoid:       'voidPath'
  };
  const PATH_PEN = { bellstrikePen: 'bellstrike', stonesplitPen: 'stonesplit', silkbindPen: 'silkbind', bamboocutPen: 'bamboocut' };
  const DEAD_ALWAYS = new Set(['maxHp', 'physDef', 'physResist']);
  const sortedPrefixes = [...KONGFU_SPECIFIC_PREFIXES].sort((a, b) => b.prefix.length - a.prefix.length);
  return function isAlive(sk) {
    if (!sk) return false;
    if (derivedFrom.has(sk)) return true;
    // maxHp/body/defense = HP連動synergy 時のみ生 (maxHp = dBody×60 + dDefense×17 の
    // 5行derived 経由で bonusCritRate 経路に到達。stats.js L486 参照)
    if (sk === 'maxHp' || sk === 'body' || sk === 'defense') return synergyHpScaling || false;
    if (DEAD_ALWAYS.has(sk)) return false;
    if (sk in PATH_MINMAX) return PATH_MINMAX[sk] === activePath;
    if (sk in PATH_PEN) return PATH_PEN[sk] === activePath;
    if (_WEAPON_CLASS_DMG_KEYS.has(sk)) return activeClassDmgKeys.has(sk);
    for (const def of sortedPrefixes) {
      if (sk.startsWith(def.prefix)) return def.kongfus.some(id => activeKongfus.has(id));
    }
    return true;
  };
}

async function buildStatParams(roleInfo, state) {
  await _ensureDicts();
  return buildStatParamsSync(roleInfo, state);
}

// 同期版: dict ロード済 (WWM_DS.ready() / ensureCalcData() 済) 前提。
// 装備最適化 loop 等 大量呼出で promise/microtask 往復を避ける高速経路。
function buildStatParamsSync(roleInfo, state) {
  const base = window.WWM_LV95_BASE?.stats || {};
  const r = Object.assign({}, base);
  // roleInfo の 5行ステ override (ranking 力/速/会 シミュ用)
  // 内部 key (ja意味基準): momentum=会、 power=力 (8199224 全swap後の命名)
  // 直接マッピング (API key名 = 内部key名 一致前提)
  // ※ swap版 (0732bfd) も入替報告あり、 確実診断のため直接マッピング戻し
  for (const k of ['body','defense','agility','momentum','power']) {
    if (typeof roleInfo?.[k] === 'number') r[k] = roleInfo[k];
  }

  // 0.5. 観音強化 max 想定 加算 (キャラ才能 max 振り想定と同思想、 currentMaxLv = data/guanyin_levels.json)
  _applyGuanyinMax(r);

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
    // NOTE: ba.ARCHER_DAMAGE / ARCHER_WEAKPOINT_DAMAGE は装備Lv推定 (_inferEquipLv) で baseAttrs 直接読みで使用。 ここでの累積は read 0件で死コードのため削除済 (2026-06-01)。
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
  // NOTE: r._arsMinSum / r._arsMaxSum / r._arsPath は read 0件で死コードのため削除済 (2026-06-01)。 武庫合計値が必要な L289-290 (副属性枠) は local 変数 `_arsMinSum`/`_arsMaxSum` を直接使用、 state.arsenal.path 必要時は state から直接読む。

  // 4.5 武術 (kongfu) 固有 path攻撃 固定Add: 突破段階(重) 依存 (S3=三重解放、rung=stage-2)
  //     v2 = data/kongfu_talent_ladders.json s3FixedAdd[rung] (例 十二重=[80,160])。
  //     旧schema (effects 内 static min/max*Add) は fallback として温存 (二重加算防止付き)
  const _talentStage = _kongfuTalentStage(roleInfo?.level);
  for (const kid of [roleInfo?.kongfuMain, roleInfo?.kongfuSub]) {
    const kf = window.WWM_KONGFU?.[kid];
    if (!kf) continue;
    const kPath = kf.path;
    const kKeys = _PATH_KEY_MAP[kPath] || _PATH_KEY_MAP.bamboocut;
    const ef = kf.effects || {};
    const minAddKey = kKeys.min + 'Add';
    const maxAddKey = kKeys.max + 'Add';
    // 旧schema fallback (static 値が残ってる場合のみ)
    if (ef.minElemMainAdd) _acc(r, kKeys.min, ef.minElemMainAdd);
    if (ef.maxElemMainAdd) _acc(r, kKeys.max, ef.maxElemMainAdd);
    if (ef[minAddKey]) _acc(r, kKeys.min, ef[minAddKey]);
    if (ef[maxAddKey]) _acc(r, kKeys.max, ef[maxAddKey]);
    // v2: S3 持ち武学のみ、static key が無い時だけ ladder 値を加算 (二重加算防止)
    const _hasStatic = ef.minElemMainAdd || ef[minAddKey];
    const _hasS3 = (kf.derived || []).some((d) => d.slot === 's3');
    const _rung = _talentStage - 2;
    const L = window.WWM_KONGFU_LADDERS;
    if (_hasS3 && !_hasStatic && _rung >= 1 && Array.isArray(L?.s3FixedAdd)) {
      const fp = L.s3FixedAdd[Math.min(_rung, L.s3FixedAdd.length) - 1];
      if (fp) { _acc(r, kKeys.min, fp[0]); _acc(r, kKeys.max, fp[1]); }
    }
  }

  // 4.6 武術 (kongfu) synergyEffects: 主×副 ペア成立時のみ発動する effects (順序不問)
  // 例: 断魂(20401)×嵐雷(20103) → bonusCritRate +0.24 (judgeRes不影響/cap内、 心法のsynergyMultiplierとは別系統)
  // 重複発火防止: 同一 synergyEffect entry を 主・副ループ両方で読まないよう Set 管理
  {
    const equippedKfSet = new Set(
      [roleInfo?.kongfuMain, roleInfo?.kongfuSub].filter(Boolean).map(String)
    );
    const seenSynergyKeys = new Set();
    for (const kid of [roleInfo?.kongfuMain, roleInfo?.kongfuSub]) {
      const kf = window.WWM_KONGFU?.[kid];
      if (!kf || !Array.isArray(kf.synergyEffects)) continue;
      for (let i = 0; i < kf.synergyEffects.length; i++) {
        const synEntry = kf.synergyEffects[i];
        if (!synEntry || !Array.isArray(synEntry.with)) continue;
        if (!synEntry.effects && !synEntry.effectsByStage) continue;
        // 重複発火防止 key (kid+index、 主・副ループで同一 entry再読防止)
        const dedupKey = String(kid) + '#' + i;
        if (seenSynergyKeys.has(dedupKey)) continue;
        // with配列全要素が装備中 kongfu set に含まれるか check (順序不問)
        const allMet = synEntry.with.every(w =>
          equippedKfSet.has(String(w)) || equippedKfSet.has(String(Number(w)))
        );
        if (!allMet) continue;
        seenSynergyKeys.add(dedupKey);
        // v2 (2026-07-07): effectsByStage = 突破段階(重) 連動 (例: 断魂 溜め会心強化
        // rank1@二重/rank2@六重/rank3@八重、kongfu_up_rank per-stage 抽出値)。
        // 適用rank = _talentStage 以下の最大 stage キー。値が {fixed,hpCap,hpThreshold}
        // 形式なら maxHp 線形 scaling 込み → maxHp 確定後に解決 (r._synergyStagedHp へ遅延)
        if (synEntry.effectsByStage) {
          let bestStage = -1;
          for (const sk of Object.keys(synEntry.effectsByStage)) {
            const sn = Number(sk);
            if (sn <= _talentStage && sn > bestStage) bestStage = sn;
          }
          if (bestStage >= 0) {
            for (const [k, v] of Object.entries(synEntry.effectsByStage[String(bestStage)])) {
              if (typeof v === 'number') _acc(r, k, v);
              else if (v && typeof v === 'object') {
                (r._synergyStagedHp = r._synergyStagedHp || []).push({ key: k, ...v });
              }
            }
          }
        } else if (synEntry.effects) {
          for (const [k, v] of Object.entries(synEntry.effects)) {
            if (typeof v === 'number') _acc(r, k, v);
          }
        }
      }
    }
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
      let eff = def.effects || {};
      // T2 effectId 経路 (2026-06-23 心法 effects master 化): master `xinfa_effects.json` から WorldLv 別値取得
      //   バランス調整時 1 箇所更新で全心法反映。 master miss/未 load 時 = effects (= WorldLv 15 hardcode) fallback
      if (tk === 'tier2' && def.effectId) {
        const masterStats = window.WWM_XINFA_EFFECTS?.effects?.[def.effectId]?.stats;
        if (masterStats) {
          const wl = String(state?.worldLv || roleInfo?.worldLv || 16);
          const lookup = {};
          for (const [sk, wlMap] of Object.entries(masterStats)) {
            if (wlMap[wl] != null) lookup[sk] = wlMap[wl];
          }
          if (Object.keys(lookup).length) eff = lookup;
        }
      }
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
  // Lv 連動 (effectsByLv): 同 suffix 装備の**最大** _inferredLv → 該当 Lv 以下の最大 lookup
  //   fallback = pieces2.effects (= Lv91 hardcode、 wdb 未取得セット用)
  // 2026-07-23 バグ修正: 旧実装は「平均」を使っていたが、兄貴実機確認(4装備中1つのみLv96に
  // 更新、他3つはLv91のまま)で「セット効果はLv96側の値(+78)が適用される」と判明。
  // 平均(91+91+91+96)/4=92.25→floor92 では旧ロジックはLv91枠(+64)を選んでしまい実機と不一致。
  // 装備群の最大Lvを使うロジックに訂正(1つでも高Lv装備があれば、セット全体がそのLvの効果を得る仕様)。
  const suffixCount = {};
  const suffixLvMax = {};
  for (const eq of Object.values(eqDet)) {
    const sfx = eq?.exVo?.suffix;
    if (sfx === undefined) continue;
    suffixCount[sfx] = (suffixCount[sfx]||0) + 1;
    const lv = eq?.exVo?._inferredLv;
    if (typeof lv === 'number') suffixLvMax[sfx] = Math.max(suffixLvMax[sfx] ?? 0, lv);
  }
  for (const [sfx, cnt] of Object.entries(suffixCount)) {
    if (cnt < 2) continue;
    const sets = window.WWM_SETS || {};
    const setDef = sets.weaponSets?.[sfx] || sets.bowSets?.[sfx] || sets.defensiveSets?.[sfx];
    if (!setDef?.pieces2) continue;
    let effects = setDef.pieces2.effects;
    const byLv = setDef.pieces2.effectsByLv;
    if (byLv) {
      const maxLv = suffixLvMax[sfx] != null ? suffixLvMax[sfx] : 91;
      const lvKeys = Object.keys(byLv).map(Number).sort((a,b) => a - b);
      let pickLv = lvKeys[0];
      for (const lk of lvKeys) { if (lk <= maxLv) pickLv = lk; else break; }
      effects = byLv[String(pickLv)] || effects;
    }
    if (!effects) continue;
    for (const [k, v] of Object.entries(effects)) {
      if (typeof v === 'number') _accMapped(r, k, v);
    }
  }

  // 7. 5行 derived (装備で増えた分のみ補正)
  const baseFive = { body: 153, defense: 153, agility: 153, momentum: 153, power: 153 };
  const dBody     = (r.body     || 0) - baseFive.body;
  const dDefense  = (r.defense  || 0) - baseFive.defense;
  const dAgility  = (r.agility  || 0) - baseFive.agility;
  const dMomentum = (r.momentum || 0) - baseFive.momentum;  // 会の増加分 (8199224 全swap後: 内部 momentum=会)
  const dPower    = (r.power    || 0) - baseFive.power;     // 力の増加分 (8199224 全swap後: 内部 power=力)

  // 気血最大値 正式集計 (装備 maxHp affix / 心法 buff 込み合算) 未実装のため、
  // 断魂×嵐雷 synergy の hpThreshold cap 判定 (L727 付近) 用に仮固定値 +50000 を基礎ステータスへ上乗せ (2026-07-15 兄貴指示、暫定措置)
  // 2026-07-23: formula_player.ft `attr_first_level_trans` テーブル(config()呼び出し9件)発見時、
  // 一旦 physDef 0.5→0.57 / minPhys力側 0.225→0.22 に変更したが、実際に MIN_W_ATK/MAX_W_ATK の
  // formula chain を辿って参照有無を検証した結果、このテーブルは外功攻撃力の計算に一切使われて
  // いないと判明(別 formula 専用の係数、偶然名前が近いだけ)。誤った適用だったため旧値に revert。
  _acc(r, 'maxHp',    dBody*60 + dDefense*17 + 50000);
  _acc(r, 'physDef',  dDefense*0.5);
  _acc(r, 'minPhys',  dAgility*0.9 + dPower*0.225);          // 速*0.9 + 力*0.225
  _acc(r, 'maxPhys',  dMomentum*0.9 + dPower*1.36);          // 会*0.9 + 力*1.36
  _acc(r, 'crit',     dAgility*0.00076);   // 速 → 会心率 only
  _acc(r, 'affinity', dMomentum*0.00038);  // 会 → 会意率 only

  // 7.5 Lv96+ 動的成長加算 (2026-07-23 兄貴合意)
  // lv95_base.json は Lv95 固定値。avatar_base_attrs (client 側 Lv成長テーブル) は
  // MANIFEST chunk 位置未解明で直接取得不可のため、Lv96 以降は実測ベース近似値で動的加算する暫定対応。
  // 成長率 min+6.5/lv, max+13/lv は Lv96→97 実測差分1点のみからの推定値 (推測、Lv98以降の線形継続は未検証)。
  // 才能/観音(鍛音)/五音太平楽は変更なし、既存ロジックのままカンスト前提。
  const charLv = roleInfo?.level || 95;
  if (charLv > 95) {
    const lvGrowth = charLv - 95;
    _acc(r, 'minPhys', lvGrowth * 6.5);
    _acc(r, 'maxPhys', lvGrowth * 13);
  }

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
      // d.from 解析: 'power'/'body'/単純key or 'max(a,b)' 形式
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
      // v2: 閾値/cap は突破段階(重) から解決 (_talentStage は §4.5 で算出済み)。
      // null = S3未解放 (三重未満) or ladders 未load → 寄与なし
      const _rc = _resolveDerivedRung(d, _talentStage);
      if (!_rc) continue;
      if (fromVal >= (_rc.thr || 0)) {
        _acc(r, finalKey, _rc.cap);
      } else {
        const ratio = fromVal / (_rc.thr || 1);
        // 20703(千機の縄)才能S3実測: 閾値未達成でも実機は満額表示 (327/328でも22.0、線形按分21.93でなく
        // 切り上げ相当)。原因未確定(推測: ゲーム側は閾値未達成分をceil、または表示精度と内部精度の差)、
        // 兄貴GO済みでこの才能のみ暫定的にceil適用 (2026-07-25)。他talentへの拡大は未検証。
        const raw = _rc.cap * ratio;
        _acc(r, finalKey, d.roundUp ? Math.ceil(raw * 10) / 10 : raw);
      }
      derivedSeen.add(wwmKey);
    }
  }

  // 8.6 cap警告 (5行ステ derived cap未到達)
  r._capWarnings = {};
  const _fiveKeys = new Set(['body','power','defense','agility','momentum']);
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
      const _rcw = _resolveDerivedRung(d, _talentStage);
      const thr = _rcw ? (_rcw.thr || 0) : 0;
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
  // (WEAPON_CLASS_MAP は module スコープ — buildAffixAliveJudge と共有)
  // 指定武術ダメ各 key を 0 初期化 (subItems 表示で未装備武器種が "-" になるのを防ぎ "0.00%" 統一)。
  Object.values(WEAPON_CLASS_MAP).flat().forEach(k => { r[k] = r[k] || 0; });
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
  //     (KONGFU_SPECIFIC_PREFIXES は module スコープ — buildAffixAliveJudge と共有)
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
      // weapon-class generic dmg (swordDmg/spearDmg/fanDmg/moBladeDmg/umbrellaDmg 等) は §9 perClassMax で処理済
      // ここで再加算すると prefix (sword/spear/fan/moBlade/umb) と startsWith hit → 2倍 bug
      if (_WEAPON_CLASS_DMG_KEYS.has(sk)) continue;
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

  // 11.5 敵Lv 自動: charLv 95→91, 96-100→96 (アップデートに追加可)
  // 2026-07-23 バグ修正: 元々 12 適用値セクションより後 (maxPhysATK 付近) にあったため、
  // r.judgeRes 確定前に appliedHit/appliedCrit/appliedSympathy が computed され、常に
  // fallback 1.45 (敵Lv91相当) を使ってしまってた。r.judgeRes 依存の計算より前に移動。
  // 敵Lv 解放条件 = キャラLv条件 AND 現在大世界Lv条件 (2026-08-03、兄貴指示
  // 「charLv+worldLv分岐になるよ。これは前に装備modalのセレクターでやってる」)。
  // 装備 tier 側の同型実装 = `src/sidebar/opt.js` の `_worldLvCapTier` / `_TIER_WORLDLV_REQ`。
  // 🚨 **敵Lv105-120 は特殊コンテンツ専用** (兄貴 2026-08-03)。通常の cap 対象ではないので
  //    自動選択の候補に入れない。`data/enemy_table.json` には client にある全段 (1..120) が
  //    入っているが、ここで引くのは 91 / 96 / 100 だけ。
  //    105 以上を出すなら別 UI で明示的に選ばせる形にする (未実装)。
  //    一度 105 を通常段として扱い、装備 tier 側の仮値 (大世界Lv20) をコピーしていたが誤り。
  // 値の真実源 = `data/enemy_table.json` (2026-08-03 ファイル化、兄貴指示)。
  // `data-store.js` の `CALC_DICTS.WWM_ENEMY_TABLE` 経由で `window.WWM_ENEMY_TABLE` に入る。
  // 生成/突合 = `scripts/mining/monthly/build_enemy_table.py` (client の monster_attrs 由来)。
  // 🚨 fetch 前に呼ばれた時のために内蔵 fallback を残す。使われたら warn を出す
  //    (黙って古い値で計算されるのを防ぐ)。
  const _EJ = (typeof window !== 'undefined' && window.WWM_ENEMY_TABLE) || null;
  if (!_EJ || !_EJ.byEnemyLv) {
    console.warn('[stats] data/enemy_table.json 未ロード → 内蔵 fallback で計算');
  }
  const ENEMY_WORLDLV_REQ = (_EJ && _EJ.worldLvReq) || { 100: 18 };
  let enemyLv;
  {
    const wl = window.WWM_CURRENT_WORLD_LV || 16;
    // キャラLv からの理論上限 (装備 tier の _lvToTier と同じ刻み、105 以上は対象外)
    let theoretical;
    if (charLv < 96) theoretical = 91;
    else if (charLv < 100) theoretical = 96;
    else theoretical = 100;
    enemyLv = theoretical;
    for (const t of [100, 96, 91]) {
      if (theoretical < t) continue;
      const req = ENEMY_WORLDLV_REQ[t];
      if (req == null || wl >= req) { enemyLv = t; break; }
    }
  }
  // 敵Lv テーブル (DEF / 審判耐性)。真実源 = data/enemy_table.json (敵Lv 1..120 の全段)。
  //   def = client `monster_attrs` の W_DEF 列 / jr = JUDGE_ATTR_CORRECT_PARA 列 + 1
  //   🚨 敵Lv100 だけ **world level で値が変わる** (client key = 10000 + world level)。
  //      素の Lv100 と同値でない wLv だけが `lv100ByWorldLv` に入っている
  //   🚨 **下の fallback に全段を書かない。**json と二重管理になり、片方だけ古くなる。
  //      ここは fetch 前に呼ばれた時に計算が死なないための最小限 (warn 済み)。
  //      値は敵Lv91 = 現行の既定段のみ
  const ENEMY_TABLE = (_EJ && _EJ.byEnemyLv) || { 91: { def: 351, jr: 1.45 } };
  const ENEMY_LV100_BY_WLV = (_EJ && _EJ.lv100ByWorldLv) || {};
  // 敵Lv100 だけ大世界Lv で値が変わる (client key = 10000 + wLv)。
  // ENEMY_TABLE[100] は wLv17 以下の値なので、wLv18 以上は上書きする
  let eRow = ENEMY_TABLE[enemyLv] || ENEMY_TABLE[91];
  if (enemyLv === 100) {
    eRow = ENEMY_LV100_BY_WLV[window.WWM_CURRENT_WORLD_LV || 16] || eRow;
  }
  r.enemyLv    = enemyLv;   // どの段を引いたか (regression #13 の突合対象)
  r.physDef    = eRow.def;
  r.judgeRes   = eRow.jr;
  r.physRes    = 0;
  r.enemyDebuff= 0;

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
  // 12.5 synergy 段階連動効果の HP scaling 部解決 (§4.6 で遅延した分。maxHp 確定後の
  // この位置で 値 = fixed + hpCap × min(maxHp/hpThreshold, 1) を加算。例: 断魂 溜め会心
  // rank3 = 9% + 15%×min(maxHp/90000,1) = HP90000到達で計24%)
  if (Array.isArray(r._synergyStagedHp)) {
    for (const sp of r._synergyStagedHp) {
      const ratio = sp.hpThreshold > 0 ? Math.min((r.maxHp || 0) / sp.hpThreshold, 1) : 1;
      _acc(r, sp.key, (sp.fixed || 0) + (sp.hpCap || 0) * ratio);
    }
    delete r._synergyStagedHp;
  }

  // appliedCrit: ゲーム実機の会心率表記用 (bonusCritRate 抜き、 judgeRes割込み + cap 80%)。 サイドパネル「会心率」 行の (applied) はこの値。
  // critRateBoosted: 実効会心率 (bonusCritRate 込み、 cap 80%)。 hiddenStat 表示用 + 後段 finalCrit / 期待値ダメージ計算で参照。
  // 2026-07-23 バグ修正: judgeResApplied (718行目、固定1.45) を使っていたため敵Lv依存の
  // r.judgeRes (91=1.45/96=1.65/100=1.85) が反映されず、キャラLv96到達後も判定耐性が
  // 変わらないように見えてた (全ユーザーLv95固定だった間は敵Lv91固定=judgeResAppliedと
  // 常に一致してたため表面化しなかった、兄貴指摘で発覚)。appliedHit と同じ r.judgeRes||1.45 に統一。
  const _judgeResEff = r.judgeRes || judgeResApplied;
  r.appliedCrit      = Math.min(0.8, (r.crit || 0) / _judgeResEff);
  r.critRateBoosted  = Math.min(0.8, r.appliedCrit + (r.bonusCritRate || 0));
  r.appliedSympathy  = Math.min(0.4, (r.affinity || 0) / _judgeResEff);

  // 13. 最終会心率/会意率 (calc.js _computeCoreLayer式準拠: cap内 + directCrit/Affinity 加算、 0..1 clamp)
  // finalCrit は critRateBoosted (bonusCritRate込み) 参照 → 実ダメージ (期待値) と一致。 appliedCrit (bonus抜き、 ゲーム実機表記) ではない。
  r.finalSympathy = Math.min(1, r.appliedSympathy + (r.directAffinity || 0));
  r.finalCrit     = Math.max(0, Math.min(1 - r.finalSympathy, r.critRateBoosted + (r.directCrit || 0)));
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
  r.allMartialBoost  = r.allWeaponDmg  || 0;
  r.specMartialBoost = r._specMartialBoostScore || 0;
  r.bossBoost       = r.bossDmg        || 0;
  r.playerBoost     = r.playerUnitDmg  || 0;
  // 表示内訳の 0 埋め: 未定義の細分は sidebar で "-" 表記 → "0.0%" 統一 (areaDebuff/areaDmg は lv95_base 未定義だった)。
  ['stControlMysticDmg','stBurstMysticDmg','areaDebuffMysticDmg','areaDmgMysticDmg'].forEach(k => { r[k] = r[k] || 0; });
  // 奇術ダメ集約。 スコア用 (r.stMysticDmg/areaMysticDmg) = 全細分+汎用の SUM (calc.js mysticContrib 係数0.1、 据え置き)。
  // 表示用 (*Disp) = 汎用 + MAX(細分2) = ゲーム実機ヘッダー一致 (属攻伤害加成 elemAtkBoostDisp と同じ MAX 表示原則)。
  // 汎用 (stMysticDmg=internal412 / areaMysticDmg=internal411) は現状 UI ドロップダウン未対応 (冠/胸限定) = 実質0、 式には含め将来安全側。
  const _genStMystic   = r.stMysticDmg   || 0;  // 汎用412 入力 (集約で上書き前に退避)
  const _genAreaMystic = r.areaMysticDmg || 0;  // 汎用411 入力
  r.stMysticDmgDisp   = _genStMystic   + Math.max(r.stControlMysticDmg||0, r.stBurstMysticDmg||0);
  r.areaMysticDmgDisp = _genAreaMystic + Math.max(r.areaDebuffMysticDmg||0, r.areaDmgMysticDmg||0);
  r.stMysticDmg     = (r.stControlMysticDmg||0) + (r.stBurstMysticDmg||0) + _genStMystic;
  r.areaMysticDmg   = (r.areaDebuffMysticDmg||0) + (r.areaDmgMysticDmg||0) + _genAreaMystic;

  r.maxPhysATK = r.maxPhys;
  r.minPhysATK = r.minPhys;
  r.worldLv    = window.WWM_CURRENT_WORLD_LV || 16;
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

window.WWMStats = { buildStatParams, buildStatParamsSync, buildAffixAliveJudge };

// vite移行 P2: ESM 副作用 module 化 (window expose は IIFE 内 keep)
export {};
