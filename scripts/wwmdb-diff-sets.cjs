#!/usr/bin/env node
// sets diff: ツール sets.json (Lv91 hardcode) ↔ wwmdb sets.json (Lv 別 table)
const fs = require('fs');
const path = require('path');
const tool = require(path.join(__dirname, '..', 'data', 'sets.json'));
const wdb = require(path.join(__dirname, '..', '.claude', 'research', 'wwmdb', 'sets.json'));

const wdbMap = Object.fromEntries(wdb.sets.map(s => [String(s.id), s]));
const cats = ['weaponSets', 'bowSets', 'defensiveSets'];
const rows = [];

for (const cat of cats) {
  for (const [id, s] of Object.entries(tool[cat] || {})) {
    const w = wdbMap[id];
    const tp2 = s.pieces2?.effects || {};
    const tp2v = Object.values(tp2)[0];
    const tp2k = Object.keys(tp2)[0];
    const wp2lv91 = w?.twoPiece?.levels?.['91'];
    const wp2stat = w?.twoPiece?.statName;
    const wp2lv96 = w?.twoPiece?.levels?.['96'];
    const wp2lv100 = w?.twoPiece?.levels?.['100'];
    const wp2lv105 = w?.twoPiece?.levels?.['105'];
    rows.push({
      cat, id,
      tool_name: s.pieces2?.raw?.slice(0, 30) || '?',
      wdb_name: w?.name || 'MISSING',
      tool_2pc_key: tp2k,
      tool_2pc_val: tp2v,
      wdb_2pc_stat: wp2stat,
      wdb_lv91: wp2lv91,
      wdb_lv96: wp2lv96,
      wdb_lv100: wp2lv100,
      wdb_lv105: wp2lv105,
      diff_pct: (tp2v && wp2lv91) ? `${((tp2v - wp2lv91) / wp2lv91 * 100).toFixed(1)}%` : '?',
      tool_4pc: s.pieces4?.raw?.slice(0, 60) || '',
      wdb_4pc: w?.fourPiece?.text?.replace(/\n/g, ' ').slice(0, 120) || '',
      pending: !!s.pieces4?.pendingImplementation,
    });
  }
}

console.log(`\n=== sets diff: tool=${rows.length} / wdb=${wdb.sets.length} ===\n`);
console.log('cat\tid\twdb_name\ttool_2pc_val\twdb_lv91\tdiff\twdb_lv96\twdb_lv100\twdb_lv105');
rows.forEach(r => {
  console.log(`${r.cat}\t${r.id}\t${r.wdb_name}\t${r.tool_2pc_val ?? '-'}\t${r.wdb_lv91 ?? '-'}\t${r.diff_pct}\t${r.wdb_lv96 ?? '-'}\t${r.wdb_lv100 ?? '-'}\t${r.wdb_lv105 ?? '-'}`);
});

console.log('\n=== 4pc 数値差候補 (raw 比較) ===');
rows.forEach(r => {
  console.log(`[${r.id}] ${r.wdb_name}${r.pending ? ' (pending)' : ''}`);
  console.log(`  tool: ${r.tool_4pc}`);
  console.log(`  wdb : ${r.wdb_4pc}`);
});

// 未使用 wdb set (recipe等)
const usedIds = new Set(rows.map(r => r.id));
const unused = wdb.sets.filter(s => !usedIds.has(String(s.id))).map(s => `${s.id}:${s.name}(${s.type})`);
console.log(`\n=== wdb 未使用 sets (${unused.length}) ===`);
console.log(unused.join('\n'));
