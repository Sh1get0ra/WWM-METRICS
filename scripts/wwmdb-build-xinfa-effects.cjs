#!/usr/bin/env node
// 心法 effect master 生成 + 整合性確認
// effect key = path × statType (min/max/minmax) × rank
// wdb attrsByWl (全 96 心法 fetch 済) から ID 単位の値取得、 effect 単位で集約
const fs = require('fs');
const path = require('path');

const xinfa = require('../data/xinfa.json');
const wdb = require('../.claude/research/wwmdb/inner-ways-tiered.json');
const wdbById = new Map();
for (const iw of wdb.innerWays || []) wdbById.set(String(iw.id), iw);

// wdb stat name → ツール stat key
const STAT_NAME_TO_KEY = {
  'Min Physical Attack': 'minPhysATKAdd',
  'Max Physical Attack': 'maxPhysATKAdd',
  'Min Bellstrike Attack': 'minBellstrike',
  'Max Bellstrike Attack': 'maxBellstrike',
  'Min Stonesplit Attack': 'minStonesplit',
  'Max Stonesplit Attack': 'maxStonesplit',
  'Min Silkbind Attack': 'minSilkbind',
  'Max Silkbind Attack': 'maxSilkbind',
  'Min Bamboocut Attack': 'minBamboocut',
  'Max Bamboocut Attack': 'maxBamboocut',
  'Min Void Attack': 'minVoid',
  'Max Void Attack': 'maxVoid',
  'Precision Rate': 'hitRate',
  'Critical Rate': 'critRate',
  'Affinity Rate': 'sympathyRate',
  'Max HP': 'maxHp',
  'Physical Defense': 'physDef',
};

// 心法の effect key 算出
function classifyEffect(info) {
  const t2 = info?.attributeBuff?.tier2;
  if (!t2) return null;
  const rank = info?.rank || 'unknown';
  const path = t2.weaponSpecific || 'phys';
  // statType = effects keys 構成で判定
  const keys = Object.keys(t2.effects || {}).sort();
  // 「minXxx + maxXxx」 ペアあり = "minmax"、 単発 min = "min"、 単発 max = "max"、 確率系 = "rate"
  const hasMin = keys.some(k => /^min/i.test(k));
  const hasMax = keys.some(k => /^max/i.test(k));
  let type;
  if (hasMin && hasMax) type = 'minmax';
  else if (hasMin) type = 'min';
  else if (hasMax) type = 'max';
  else if (keys.some(k => /Rate$/.test(k))) type = 'rate_' + keys[0];  // hitRate/critRate/sympathyRate 等は単一 key で識別
  else type = 'other_' + keys.join('_');
  return { path, type, rank, keys, effectKey: `${path}_${type}_${rank}` };
}

// 心法 → wdb 値抽出 (= ツール stat key へ正規化)
function wdbStatsOf(id, classification) {
  const iw = wdbById.get(String(id));
  if (!iw?.attrsByWl) return null;
  const out = {};
  for (const wdbStat of Object.keys(iw.attrsByWl)) {
    const toolKey = STAT_NAME_TO_KEY[wdbStat];
    if (!toolKey) continue;
    // classification.keys 内のみ
    if (classification.keys && !classification.keys.includes(toolKey)) continue;
    out[toolKey] = iw.attrsByWl[wdbStat];
  }
  return out;
}

// effect 集約
const effects = {};  // effectKey → { members: [id...], stats: {statKey: {wl: val}}, conflicts: [] }
const xinfaUpdates = {};  // id → { effectId } 改修案
const warnings = [];

for (const [id, info] of Object.entries(xinfa)) {
  if (id.startsWith('_')) continue;
  const cls = classifyEffect(info);
  if (!cls) continue;
  const stats = wdbStatsOf(id, cls);
  if (!stats || !Object.keys(stats).length) {
    warnings.push(`no wdb data: ${id} ${info?.attributeBuff?.tier2?.statType || cls.effectKey}`);
    continue;
  }
  const eff = effects[cls.effectKey] = effects[cls.effectKey] || { members: [], stats: {}, path: cls.path, type: cls.type, rank: cls.rank };
  eff.members.push(id);
  // 集約 = 同 effect の wdb 値全件比較
  for (const [sk, wlVals] of Object.entries(stats)) {
    if (!eff.stats[sk]) {
      eff.stats[sk] = wlVals;
    } else {
      // 比較
      for (const [wl, v] of Object.entries(wlVals)) {
        if (eff.stats[sk][wl] !== v) {
          warnings.push(`conflict: ${cls.effectKey} ${sk} WL${wl}: existing=${eff.stats[sk][wl]} ${id}=${v}`);
        }
      }
    }
  }
  xinfaUpdates[id] = { effectId: cls.effectKey };
}

// summary
console.log('=== effect 集約結果 ===');
console.log(`effects: ${Object.keys(effects).length}, mapped 心法: ${Object.keys(xinfaUpdates).length}, warnings: ${warnings.length}`);
for (const w of warnings.slice(0, 40)) console.log('  WARN', w);

console.log('\n=== effect 内訳 ===');
const byMembers = Object.entries(effects).sort((a, b) => b[1].members.length - a[1].members.length);
for (const [key, eff] of byMembers) {
  console.log(`${key}: ${eff.members.length} 心法 (${eff.members.slice(0,5).join(',')}${eff.members.length>5?'...':''})`);
}

// master file 生成 試行
const out = {
  _schema: '心法 effect (path × statType × rank) 単位 master (T2 値 WorldLv 1-21 別精密値)。 wdb inner-ways/{id} hidden DOM 抽出。 心法 ID 別でなく effect 集約 = メンテ性 (バランス調整で値更新時 1 箇所)。',
  _source: 'wwmdb.vlt.fyi inner-ways/{id} F12 hidden DOM Attributes (Min/Max <path> Attack + Rate 系) 全 52 心法 fetch',
  _lastUpdated: new Date().toISOString().slice(0,10),
  effects: {},
};
for (const [key, eff] of Object.entries(effects)) {
  out.effects[key] = {
    path: eff.path,
    type: eff.type,
    rank: eff.rank,
    members: eff.members,
    stats: eff.stats,
  };
}

const OUT = path.join(__dirname, '..', 'data', 'xinfa_effects.json');
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`\nwrote ${OUT}`);
