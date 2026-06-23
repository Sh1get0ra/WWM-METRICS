#!/usr/bin/env node
// wdb equip-items snapshot の affix val 範囲 vs data/equip_max.json tier 91 cross-check
// Usage: node scripts/wwmdb-diff-equip-max.cjs
const path = require('path');

const wdb = require(path.join(__dirname, '..', '.claude', 'research', 'wwmdb', 'equip-items-lv91-t5.json'));
const affix = require(path.join(__dirname, '..', 'data', 'affix.json'));
const equipMax = require(path.join(__dirname, '..', 'data', 'equip_max.json'));

// equip_max.json key → wdb affix statKey mapping
// equip_max.json schema: tiers.91.{maxPhys/precision/crit/affinity/stat5/pathSingle/outerPen/attrPen/maxHp/physDef/physDmgBoost/allWeaponDmg/bossDmg/atkTypeDmg/mysticDmg/attunement}
// affix.json statKey: minPhys/maxPhys/precision/crit/affinity/body/power/defense/agility/momentum/...
//
// equip_max は **stat 種別** で集約。 wdb affix table は **individual affix ID** で別 statKey 持つ。
// 突合せ key:
//   equip_max.maxPhys     ↔ wdb Max Physical Attack (9293008/9243002)
//   equip_max.crit        ↔ wdb Critical Rate (9293019)
//   equip_max.affinity    ↔ wdb Affinity Rate (9293020)
//   equip_max.precision   ↔ wdb Precision Rate (9293018)
//   equip_max.pathSingle  ↔ wdb Max Bellstrike/Stonesplit/... Attack (9293011/013/015/017)
//   equip_max.stat5       ↔ wdb Body/Power/Defense/Agility/Momentum (9293001-005)
//   equip_max.outerPen    ↔ wdb 270701 Physical Penetration
//   equip_max.attrPen     ↔ wdb 270703 Formless Penetration ※ wdb は別の attune affix
//   equip_max.maxHp       ↔ wdb Max HP (9293006)
//   equip_max.physDef     ↔ wdb Physical Defense (9293009)
//   equip_max.physDmgBoost↔ wdb 9293033/034 Combat Boost (Greaves/Bracer) ※ 部位限定
//   equip_max.allWeaponDmg↔ wdb 9293028 All Martial Arts Boost (Disc/Pendant)
//   equip_max.bossDmg     ↔ wdb 9293033 Combat Boost Against Boss Units
//   equip_max.atkTypeDmg  ↔ wdb 9293021-027/035/036 各武器別 Art DMG Boost
//   equip_max.mysticDmg   ↔ wdb 9293029-032 Mystic Skill DMG Boost
//   equip_max.attunement  ↔ wdb 270702 Physical Resistance ?

const TIER91 = equipMax.tiers['91'];
console.log('== ツール equip_max.tiers.91 ==');
console.log(JSON.stringify(TIER91, null, 2));

// wdb affix table から affix ID 別 max 値抽出
const affixMax = {};
for (const item of wdb.equipItems) {
  if (!item.affixTables) continue;
  for (const tbl of item.affixTables) {
    if (!Array.isArray(tbl)) continue;
    for (const a of tbl) {
      if (!a.id || !a.value) continue;
      const m = String(a.value).match(/([\d.]+)\s*-\s*([\d.]+)/);
      if (!m) continue;
      const min = Number(m[1]), max = Number(m[2]);
      if (!affixMax[a.id] || affixMax[a.id].max < max) {
        affixMax[a.id] = { name: a.name, min, max };
      }
    }
  }
}

console.log('\n== wdb affix MAX 値抽出 (代表 ID のみ) ==');
const watchIds = ['9293008','9293019','9293020','9293018','9293011','9293001','9293006','9293009','9293028','9293021','9293022','9293023','9293024','9293025','9293026','9293027','9293035','9293036','9293029','9293033','9293034','270701','270702','270703'];
for (const id of watchIds) {
  if (affixMax[id]) {
    const sk = affix[id]?.statKey || '?';
    console.log(`  ${id} ${affixMax[id].name.slice(0,40)} max=${affixMax[id].max} (statKey=${sk})`);
  }
}

// 比較表
console.log('\n== diff (equip_max vs wdb max) ==');
const cmp = [
  ['maxPhys',     '9293008'],
  ['precision',   '9293018'],
  ['crit',        '9293019'],
  ['affinity',    '9293020'],
  ['pathSingle',  '9293011'],
  ['stat5',       '9293001'],
  ['maxHp',       '9293006'],
  ['physDef',     '9293009'],
  ['outerPen',    '270701'],
  ['attrPen',     '270703'],
  ['allWeaponDmg','9293028'],
  ['atkTypeDmg(sword)',    '9293021'],
  ['atkTypeDmg(spear)',    '9293022'],
  ['atkTypeDmg(moBlade)',  '9293023'],
  ['atkTypeDmg(dualBlades)','9293024'],
  ['atkTypeDmg(ropeDart)', '9293025'],
  ['atkTypeDmg(fan)',      '9293026'],
  ['atkTypeDmg(umbrella)', '9293027'],
  ['atkTypeDmg(hengBlade)','9293035'],
  ['atkTypeDmg(gauntlet)', '9293036'],
  ['mysticDmg(area-debuff)','9293029'],
  ['bossDmg',     '9293033'],
  ['playerDmg',   '9293034'],
];
const baseKey = (k) => k.replace(/\(.*\)$/, '').trim();
for (const [labelKey, wdbId] of cmp) {
  const toolVal = TIER91[baseKey(labelKey)];
  const wdbVal = affixMax[wdbId]?.max;
  let mark = '-';
  if (toolVal != null && wdbVal != null) {
    const diff = Math.abs(toolVal - wdbVal);
    if (diff < 0.001) mark = '✓ MATCH';
    else if (diff / Math.max(toolVal, wdbVal) < 0.02) mark = '≈ ~2%';
    else mark = `✗ DIFF (${(diff / Math.max(toolVal, wdbVal) * 100).toFixed(1)}%)`;
  } else if (toolVal == null && wdbVal != null) mark = '🆕 wdb 有 ツール null = 真値化候補';
  else if (toolVal != null && wdbVal == null) mark = '? wdb なし';
  console.log(`  ${labelKey.padEnd(28)} ツール=${String(toolVal).padEnd(10)} wdb=${String(wdbVal ?? '-').padEnd(10)} ${mark}`);
}
