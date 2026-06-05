#!/usr/bin/env node
// !important strip apply (v2 audit 結果の A category のみ)
//
// 安全策:
//   - audit は selector 単位 split = 同 declaration (file,line,prop) が
//     A と C/K 両方に判定され得る → 全 selector A の declaration のみ strip
//   - line 内の該当 prop の !important だけ正確に除去
//
// 使い方:
//   node scripts/important-audit-v2.cjs   # 先に audit
//   node scripts/important-apply-v2.cjs --dry   # 対象一覧のみ
//   node scripts/important-apply-v2.cjs         # 実 strip

const fs = require('fs');

const DRY = process.argv.includes('--dry');
const catArg = (process.argv.find(a => a.startsWith('--cat=')) || '--cat=A,B').slice(6);
const cats = new Set(catArg.split(','));
const { A, B = [], K, C } = JSON.parse(fs.readFileSync('scripts/.important-v2.json', 'utf8'));

const keyOf = (d) => `${d.file}|${d.line}|${d.prop}`;

// C/K に同 declaration が居る = strip 不可
const blocked = new Set([...K, ...C].map(keyOf));

// 対象 category の declaration 単位 unique 化 + blocked 除外
const pool = [...(cats.has('A') ? A : []), ...(cats.has('B') ? B : [])];
const targets = new Map();
for (const d of pool) {
  const key = keyOf(d);
  if (blocked.has(key)) continue;
  targets.set(key, d);
}

console.log(`cat=${[...cats].join(',')} pool: ${pool.length} / blocked (C/K 混在): ${pool.filter(d => blocked.has(keyOf(d))).length} / strip 対象 decl: ${targets.size}`);

// file ごとに line 編集
const byFile = new Map();
for (const d of targets.values()) {
  if (!byFile.has(d.file)) byFile.set(d.file, []);
  byFile.get(d.file).push(d);
}

let total = 0;
for (const [file, list] of byFile) {
  const src = fs.readFileSync(file, 'utf8');
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  const lines = src.split(/\r?\n/);
  let count = 0;
  for (const d of list) {
    const idx = d.line - 1;
    if (idx < 0 || idx >= lines.length) { console.warn(`[WARN] ${file}:${d.line} 範囲外`); continue; }
    const line = lines[idx];
    // prop: ... !important を厳密 match (line 内 該当 prop のみ)
    const re = new RegExp(`(${d.prop}\\s*:[^;{}]*?)\\s*!\\s*important`, 'i');
    if (!re.test(line)) { console.warn(`[WARN] ${file}:${d.line} "${d.prop}" !important 不在 (line ずれ?)`); continue; }
    lines[idx] = line.replace(re, '$1');
    count++;
    if (DRY) console.log(`  ${file}:${d.line} ${d.prop} | ${d.selector}`);
  }
  if (!DRY && count > 0) fs.writeFileSync(file, lines.join(eol));
  console.log(`${DRY ? '[dry] ' : ''}${file}: ${count} stripped`);
  total += count;
}
console.log(`\n${DRY ? '[dry] ' : ''}total: ${total} !important stripped`);
