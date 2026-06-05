#!/usr/bin/env node
// @layer Step 2: theme-swap apply
//
// mode --same-value: M ∧ safe ∧ sameValue の light decl を物理削除 (redundant 退場)
//   - 物理 decl (file,line,prop) 単位: 同 line 複数 selector split は全 split が safe の時のみ
//   - rule body が空になったら rule ごと削除
//
// 使い方:
//   node scripts/theme-swap-audit.cjs            # 先に audit
//   node scripts/theme-swap-apply.cjs --same-value --dry
//   node scripts/theme-swap-apply.cjs --same-value

const fs = require('fs');

const DRY = process.argv.includes('--dry');
const MODE_SAME = process.argv.includes('--same-value');
if (!MODE_SAME) { console.error('mode 指定必須: --same-value'); process.exit(1); }

const { M } = JSON.parse(fs.readFileSync('scripts/.theme-swap.json', 'utf8'));

// 物理 decl key → splits
const phys = new Map();
for (const d of M) {
  const k = `${d.file}|${d.line}|${d.prop}`;
  if (!phys.has(k)) phys.set(k, []);
  phys.get(k).push(d);
}

// 全 split が safe ∧ sameValue の物理 decl のみ
const targets = [];
for (const [k, splits] of phys) {
  if (splits.every(s => s.safe && s.sameValue)) targets.push(splits[0]);
}
console.log(`same-value 削除対象 (物理 decl): ${targets.length}`);

const byFile = new Map();
for (const d of targets) {
  if (!byFile.has(d.file)) byFile.set(d.file, []);
  byFile.get(d.file).push(d);
}

for (const [file, ds] of byFile) {
  // CRLF 保護: \n split で行末 \r を維持し、 行末 strip は [ \t] のみ (\r 触るな)
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  let removed = 0;
  for (const d of ds) {
    const idx = d.line - 1;
    const re = new RegExp(`(^|;|\\{)(\\s*)${d.prop.replace(/[-]/g, '\\-')}\\s*:[^;{}]*?(;|(?=\\s*\\}))`);
    const before = lines[idx];
    if (!re.test(before)) { console.warn(`[SKIP] ${file}:${d.line} ${d.prop} — line 不一致`); continue; }
    lines[idx] = before.replace(re, (m, pre, ws) => pre + ws).replace(/[ \t]+(\r?)$/, '$1');
    removed++;
    if (DRY) console.log(`[DRY] ${file}:${d.line} ${d.prop}\n  - ${before.trim()}\n  + ${lines[idx].trim()}`);
  }
  if (!DRY) {
    let src = lines.join('\n');
    // 空 rule 削除: selector { } (空 body or 空白のみ) — CRLF 維持
    src = src.replace(/^[^@{}\/\r\n][^{}\r\n]*\{[ \t]*(\r?\n)?[ \t]*\}[ \t]*\r?\n?/gm, '');
    // 編集行が空行化した分の 3 連続空行縮約 (CRLF/ LF 両対応)
    src = src.replace(/(\r?\n)(?:[ \t]*\r?\n){2,}/g, '$1$1');
    fs.writeFileSync(file, src);
  }
  console.log(`${file}: ${removed} decl removed`);
}
