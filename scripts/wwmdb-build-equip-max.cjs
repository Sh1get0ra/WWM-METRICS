#!/usr/bin/env node
// 全 Lv snapshot から equip_max.json affix Lv 別 min-max マスタ生成
// - 数値 affix (value="A-B" or "A.B-C.D") のみ対象
// - wdb name → ツール statKey 集約 mapping (手動辞書)
// - 同 statKey の値 = mode 採用 (装備差で揺れる場合は警告)
const fs = require('fs');
const path = require('path');

const SNAP = path.join(__dirname, '..', '.claude', 'research', 'wwmdb');
const LVS = [71, 81, 86, 91, 96];

// wdb name → equip_max.json stat key
const NAME_TO_KEY = {
  // 外功 = min/max 集約 (現 _fieldMapping 既「Max Physical Attack (= Min同値)」)
  'Min Physical Attack': 'maxPhys',
  'Max Physical Attack': 'maxPhys',
  // 確率系
  'Precision Rate': 'precision',
  'Critical Rate': 'crit',
  'Affinity Rate': 'affinity',
  // 貫通
  'Physical Penetration': 'outerPen',
  'Bellstrike Penetration': 'attrPen',
  'Stonesplit Penetration': 'attrPen',
  'Silkbind Penetration': 'attrPen',
  'Bamboocut Penetration': 'attrPen',
  'Void Penetration': 'attrPen',
  // 防御
  'Max HP': 'maxHp',
  'Physical Defense': 'physDef',
  // 5行 (Body/Defense/Agility/Momentum/Power)
  'Body': 'stat5', 'Defense': 'stat5', 'Agility': 'stat5', 'Momentum': 'stat5', 'Power': 'stat5',
  // path single (Min/Max X)
  'Min Bellstrike': 'pathSingle', 'Max Bellstrike': 'pathSingle',
  'Min Stonesplit': 'pathSingle', 'Max Stonesplit': 'pathSingle',
  'Min Silkbind': 'pathSingle', 'Max Silkbind': 'pathSingle',
  'Min Bamboocut': 'pathSingle', 'Max Bamboocut': 'pathSingle',
  'Min Void': 'pathSingle', 'Max Void': 'pathSingle',
  // Lv81+ 系
  'Physical Damage Boost': 'physDmgBoost',
  'All Weapon Damage': 'allWeaponDmg',
  'All Martial Arts Boost': 'allWeaponDmg',
  'Boss Damage': 'bossDmg',
  'Mystic Damage': 'mysticDmg',
  'Mystic Skill DMG Boost': 'mysticDmg',
};

function parseRange(s) {
  if (typeof s === 'number') return { min: s, max: s };
  if (typeof s !== 'string') return null;
  const m = s.match(/^([\d.]+)\s*-\s*([\d.]+)$/);
  if (m) return { min: parseFloat(m[1]), max: parseFloat(m[2]) };
  return null;
}
function modeOf(arr) {
  if (!arr.length) return null;
  const c = new Map();
  for (const v of arr) {
    const k = JSON.stringify(v);
    c.set(k, (c.get(k) || 0) + 1);
  }
  let best = null, bestCount = -1;
  for (const [k, cnt] of c) if (cnt > bestCount) { best = k; bestCount = cnt; }
  return { val: JSON.parse(best), count: bestCount, total: arr.length };
}

const tierTbl = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'equip_max.json'), 'utf8'));
const newTiers = {};
// 既 tier (61 等 snapshot 不在) keep + number → {min, max} 1:2 比で min 補完
for (const [tk, t] of Object.entries(tierTbl.tiers || {})) {
  newTiers[tk] = {};
  for (const [k, v] of Object.entries(t)) {
    if (typeof v === 'number') newTiers[tk][k] = { min: +(v / 2).toFixed(4), max: v };
    else if (v && typeof v === 'object' && v.max != null) newTiers[tk][k] = { min: v.min, max: v.max };
    else newTiers[tk][k] = v;
  }
}

const warnings = [];
const unmappedNames = new Set();

for (const lv of LVS) {
  const snapPath = path.join(SNAP, `equip-items-lv${lv}-t5.json`);
  if (!fs.existsSync(snapPath)) { warnings.push(`missing snapshot lv${lv}-t5`); continue; }
  const items = require(path.resolve(snapPath)).equipItems || [];
  // 集約 key → values[]
  const buckets = {};
  for (const it of items) {
    for (const tbl of it.affixTables || []) {
      for (const aff of tbl) {
        const range = parseRange(aff.value);
        if (!range) continue;
        const key = NAME_TO_KEY[aff.name];
        if (!key) { unmappedNames.add(aff.name); continue; }
        (buckets[key] = buckets[key] || []).push(range);
      }
    }
  }
  const tierKey = String(lv);
  if (!newTiers[tierKey]) newTiers[tierKey] = {};
  for (const [maxKey, arr] of Object.entries(buckets)) {
    const m = modeOf(arr);
    if (!m) continue;
    newTiers[tierKey][maxKey] = m.val;
    if (m.count < m.total * 0.5) warnings.push(`mode weak: lv${lv} ${maxKey} mode=${JSON.stringify(m.val)} ${m.count}/${m.total}`);
  }
}

const out = {
  ...tierTbl,
  _schema: '装備Lv Tier別 affix MIN-MAX 値マスタ (2026-06-23 Lv 別精密化)。 wdb snapshot mode 抽出、 {min, max} ペア。 _getAffixMax(sk,lv) 後方互換 (number → object.max)。',
  _lastUpdated: new Date().toISOString().slice(0,10),
  _source: 'wwmdb.vlt.fyi equip-items snapshot (Lv71/81/86/91/96 各 tier=5 = 金) affixTables mode 採用',
  _note: (tierTbl._note || '') + ' / 2026-06-23: {min, max} ペア化、 旧 number は 1:2 比で min 補完 (tier 61 snapshot 未取得分)。',
  tiers: newTiers,
};

const OUT = path.join(__dirname, '..', 'data', 'equip_max.json');
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`wrote ${OUT}`);
console.log(`warnings: ${warnings.length}, unmapped wdb names: ${unmappedNames.size} (主要 stat 外で意図的 drop 可能性)`);
for (const w of warnings.slice(0, 20)) console.log('  ', w);
if (unmappedNames.size > 0 && unmappedNames.size < 40) {
  console.log('\nunmapped names (検討候補):');
  for (const n of [...unmappedNames].sort().slice(0, 40)) console.log('  ', n);
}

console.log('\n=== summary ===');
for (const tk of ['61','71','81','86','91','96']) {
  const t = newTiers[tk] || {};
  console.log(`tier ${tk}:`);
  for (const k of ['maxPhys','precision','crit','affinity','outerPen','attrPen','stat5','pathSingle','maxHp','physDef']) {
    if (t[k]) console.log(`  ${k}: ${JSON.stringify(t[k])}`);
  }
}
