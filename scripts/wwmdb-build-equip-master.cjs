#!/usr/bin/env node
// 全 Lv × 全 tier snapshot から equip_base_master.json 生成
// - mode (多数派) 採用で 特殊装備 (Nothing Plaque/Rock Solid Disc 等の例外品質 stat) 除外
// - slot mapping = wdb 末尾 token → ツール slot ID
// - 武器系 (Sword/Spear/...) = slot WEAPON 集約 (slot 1/2 同値)
const fs = require('fs');
const path = require('path');

const SNAP = path.join(__dirname, '..', '.claude', 'research', 'wwmdb');
const LVS = [71, 81, 86, 91, 96];
const TIERS = [3, 4, 5];

const SLOT_MAP = {
  Helmet:     { id: '3',  label: '冠',   keys: { 'Max HP': 'HP_MAX', 'Physical Defense': 'W_DEF' } },
  Chestpiece: { id: '4',  label: '胸当', keys: { 'Max HP': 'HP_MAX', 'Physical Defense': 'W_DEF' } },
  Greaves:    { id: '5',  label: '膝鎧', keys: { 'Max HP': 'HP_MAX', 'Physical Defense': 'W_DEF' } },
  Bracer:     { id: '8',  label: '小手', keys: { 'Max HP': 'HP_MAX', 'Physical Defense': 'W_DEF' } },
  Ring:       { id: '9',  label: '射玦', keys: { 'Bow Weakness Hit Damage': 'ARCHER_WEAKPOINT_DAMAGE' } },
  Disc:       { id: '10', label: '環',   keys: { 'Min Physical Attack': 'MIN_W_ATK' } },
  Pendant:    { id: '11', label: '佩',   keys: { 'Max Physical Attack': 'MAX_W_ATK' } },
  Bow:        { id: '21', label: '弓矢', keys: { 'Bow Base Damage': 'ARCHER_DAMAGE' } },
};
const WEAPON_SLOTS = ['Sword','Spear','Fan','Blade','Blades','Umbrella','Dart','Gauntlets'];

function loadSnap(lv, tier) {
  const f = path.join(SNAP, `equip-items-lv${lv}-t${tier}.json`);
  if (!fs.existsSync(f)) return null;
  return require(f).equipItems || [];
}

function modeOf(arr) {
  if (!arr.length) return null;
  const c = new Map();
  for (const v of arr) {
    const k = JSON.stringify(v);
    c.set(k, (c.get(k) || 0) + 1);
  }
  let best = null, bestCount = -1;
  for (const [k, cnt] of c) {
    if (cnt > bestCount) { best = k; bestCount = cnt; }
  }
  return { val: JSON.parse(best), count: bestCount, total: arr.length };
}

// slot ID → table[lv][tier] = mode-extracted attrs
const slotsOut = {};
for (const [wdbSlot, def] of Object.entries(SLOT_MAP)) {
  slotsOut[def.id] = {
    _label: def.label,
    _keys: Object.values(def.keys),
    table: {},
  };
}
// WEAPON は slot 1/2 で共用 = 1 entry
slotsOut['1'] = { _label: '主武器', _keys: ['MIN_W_ATK','MAX_W_ATK'], table: {} };
slotsOut['2'] = { _label: '副武器', _keys: ['MIN_W_ATK','MAX_W_ATK'], table: {} };

const warnings = [];

for (const lv of LVS) {
  for (const tier of TIERS) {
    const snap = loadSnap(lv, tier);
    if (!snap) { warnings.push(`missing snapshot lv${lv}-t${tier}`); continue; }
    // slot 別 attrs 多数派
    const bySlot = {};
    for (const it of snap) {
      const slotName = (it.slot || '').split(' ').pop();
      if (!slotName) continue;
      // SLOT_MAP 該当
      if (SLOT_MAP[slotName]) {
        const def = SLOT_MAP[slotName];
        const mapped = {};
        for (const [wKey, tKey] of Object.entries(def.keys)) {
          if (it.attributes?.[wKey] != null) mapped[tKey] = it.attributes[wKey];
        }
        if (Object.keys(mapped).length > 0) {
          (bySlot[def.id] = bySlot[def.id] || []).push(mapped);
        }
      } else if (WEAPON_SLOTS.includes(slotName)) {
        const mapped = {};
        if (it.attributes?.['Min Physical Attack'] != null) mapped.MIN_W_ATK = it.attributes['Min Physical Attack'];
        if (it.attributes?.['Max Physical Attack'] != null) mapped.MAX_W_ATK = it.attributes['Max Physical Attack'];
        if (Object.keys(mapped).length > 0) {
          (bySlot['WEAPON'] = bySlot['WEAPON'] || []).push(mapped);
        }
      }
    }
    // mode 抽出
    for (const [slotId, arr] of Object.entries(bySlot)) {
      const m = modeOf(arr);
      if (!m) continue;
      if (slotId === 'WEAPON') {
        slotsOut['1'].table[lv] = slotsOut['1'].table[lv] || {};
        slotsOut['1'].table[lv][tier] = m.val;
        slotsOut['2'].table[lv] = slotsOut['2'].table[lv] || {};
        slotsOut['2'].table[lv][tier] = m.val;
      } else {
        slotsOut[slotId].table[lv] = slotsOut[slotId].table[lv] || {};
        slotsOut[slotId].table[lv][tier] = m.val;
      }
      if (m.count < m.total * 0.5) {
        warnings.push(`mode weak: lv${lv} t${tier} slot${slotId} mode=${JSON.stringify(m.val)} ${m.count}/${m.total}`);
      }
    }
  }
}

// 欠損 cell 警告
for (const [slotId, slot] of Object.entries(slotsOut)) {
  for (const lv of LVS) {
    if (!slot.table[lv]) { warnings.push(`missing all tiers: slot${slotId} lv${lv}`); continue; }
    for (const tier of TIERS) {
      if (!slot.table[lv][tier]) warnings.push(`missing: slot${slotId} lv${lv} t${tier}`);
    }
  }
}

const master = {
  _schema: '全 Lv × 全 Tier × 全 slot base stat マスタ。 wdb 実値 mode 採用、 算式廃止 ([[equipment-quality-rank-formula]] 紫=round(金×0.9) は ±1 ズレ で wdb と不一致 = 廃止)。',
  _source: 'wwmdb.vlt.fyi equip-items snapshot 全 Lv × 全 tier (mode 採用で例外品質装備除外)',
  _lastUpdated: new Date().toISOString().slice(0,10),
  _lvList: LVS,
  _tierList: TIERS,
  _tierLabels: { '3': '青 (blue)', '4': '紫 (purple)', '5': '金 (gold)' },
  _rankToTier: { gold: 5, purple: 4, blue: 3 },
  slots: slotsOut,
};

const OUT = path.join(__dirname, '..', 'data', 'equip_base_master.json');
fs.writeFileSync(OUT, JSON.stringify(master, null, 2) + '\n');
console.log(`wrote ${OUT}`);
console.log(`warnings: ${warnings.length}`);
for (const w of warnings.slice(0, 40)) console.log('  ', w);

// 既 equip_base_by_lv.json と diff (Lv91 t5 = gold で互換確認)
const old = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'equip_base_by_lv.json'), 'utf8'));
console.log('\n=== 既 equip_base_by_lv.json Lv91 gold 比較 ===');
for (const [slotId, slot] of Object.entries(slotsOut)) {
  const newG = slot.table[91]?.[5];
  const oldG = old.slots?.[slotId]?.['91'];
  if (!newG || !oldG) continue;
  const match = JSON.stringify(newG) === JSON.stringify(oldG);
  console.log(`  slot${slotId} ${slot._label}: new=${JSON.stringify(newG)} old=${JSON.stringify(oldG)} ${match ? '✓' : '× DIFF'}`);
}
