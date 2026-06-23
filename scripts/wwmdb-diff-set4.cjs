#!/usr/bin/env node
// wwmdb 4set 効果 cross-check (TODO #29 Phase 2D)
// ツール data/sets.json pieces4.raw ↔ wdb sets.json fourPiece.text の数値抽出比較
// 出力 = 全 set 並べて数値 + 名前 を目視判定可能な表形式

const tool = require('../data/sets.json');
const wdb = require('../.claude/research/wwmdb/sets.json');

const wdbById = new Map();
for (const s of wdb.sets || []) wdbById.set(String(s.id), s);

// 数値 % / 秒 / 整数 抽出 (符号 normalize + ソート で 真ズレのみ検出)
function extractNums(text) {
  if (!text) return [];
  const re = /[+\-]?\d+(?:\.\d+)?\s*%?/g;
  return (text.match(re) || [])
    .map(s => s.trim().replace(/^[+\-]/, '').replace(/\s+/g, ''))
    .filter(s => s !== '0');
}

// setdiff = 片方にしかない数値 = 真の修正対象候補
function setdiff(a, b) {
  const bag = b.slice();
  const out = [];
  for (const x of a) {
    const i = bag.indexOf(x);
    if (i < 0) out.push(x);
    else bag.splice(i, 1);
  }
  return out;
}

function rows(category, catObj) {
  const out = [];
  for (const [id, t] of Object.entries(catObj || {})) {
    const wdbSet = wdbById.get(id);
    const tRaw = (t.pieces4 || {}).raw || '';
    const wText = wdbSet?.fourPiece?.text || '';
    const tNumsArr = extractNums(tRaw);
    const wNumsArr = extractNums(wText);
    const onlyT = setdiff(tNumsArr, wNumsArr);
    const onlyW = setdiff(wNumsArr, tNumsArr);
    out.push({
      cat: category,
      id,
      name: wdbSet?.name || '?',
      tNums: tNumsArr.sort().join(' '),
      wNums: wNumsArr.sort().join(' '),
      onlyT: onlyT.join(' '),
      onlyW: onlyW.join(' '),
      mismatch: onlyT.length + onlyW.length > 0,
      tRaw: tRaw.slice(0, 120),
      wText: wText.replace(/\s+/g, ' ').slice(0, 180),
    });
  }
  return out;
}

const all = [
  ...rows('weapon', tool.weaponSets),
  ...rows('bow', tool.bowSets || {}),
  ...rows('def', tool.defensiveSets || {}),
];

console.log(`\n=== 4set 数値 setdiff (全 ${all.length} 件、 符号 normalize + 多重集合 diff) ===\n`);
for (const r of all) {
  if (!r.mismatch) continue;
  console.log(`🚨 [${r.cat}#${r.id}] ${r.name}`);
  console.log(`   onlyTool: ${r.onlyT || '(なし)'}`);
  console.log(`   onlyWdb : ${r.onlyW || '(なし)'}`);
  console.log(`   tool raw: ${r.tRaw}`);
  console.log(`   wdb text: ${r.wText}`);
  console.log('');
}

const m = all.filter(r => r.mismatch).length;
console.log(`\n=== SUMMARY === total=${all.length} mismatch=${m} match=${all.length - m}`);
console.log('注: onlyTool/onlyWdb 両方空でも mismatch なら順序/数値ラベル の何か。 onlyWdb に数値あれば兄貴判断 = 真ズレ候補');
