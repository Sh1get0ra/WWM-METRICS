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

// mode --pairs <plan.json>: pair group token swap
//   plan: [{ token, dark, light, decls:[{lightFile,lightLine,prop, baseFile,baseLine}] }]
//   操作: tokens.css :root へ dark default 追加 / light token block へ light 値追加
//        / base decl 値 → var(token) / light decl 削除
//   light 値が var(--token) 単独参照 (Phase 5.3 light-only token) なら light block 追加 skip

const DRY = process.argv.includes('--dry');
const MODE_SAME = process.argv.includes('--same-value');
const pairsIdx = process.argv.indexOf('--pairs');
const MODE_PAIRS = pairsIdx !== -1;
if (!MODE_SAME && !MODE_PAIRS) { console.error('mode 指定必須: --same-value | --pairs <plan.json>'); process.exit(1); }

const { M } = JSON.parse(fs.readFileSync('scripts/.theme-swap.json', 'utf8'));

if (MODE_PAIRS) {
  const plan = JSON.parse(fs.readFileSync(process.argv[pairsIdx + 1], 'utf8'));
  // file → line edits (line 番号は 1-based、 削除と置換は line 内容書換えで実施 → 行番号不変)
  const fileLines = new Map();
  const load = (f) => {
    if (!fileLines.has(f)) fileLines.set(f, fs.readFileSync(f, 'utf8').split('\n'));
    return fileLines.get(f);
  };
  const declRe = (prop) => new RegExp(`(^|;|\\{)(\\s*)(${prop.replace(/[-]/g, '\\-')})\\s*:\\s*([^;{}]*?)(;|(?=\\s*\\}))`);

  const tokenDefsRoot = [];   // tokens.css :root 追加分
  const tokenDefsLight = [];  // light.css token block 追加分

  for (const g of plan) {
    // tokens: [{name, dark, light?}] — light 省略 = light block 既定義 (Phase 5.3 light-only token)
    for (const t of (g.tokens || [{ name: g.token, dark: g.dark, light: g.light }])) {
      const selfRef = t.light && new RegExp(`^var\\(\\s*${t.name.replace(/[-]/g, '\\-')}\\s*\\)$`).test(t.light.trim());
      tokenDefsRoot.push(`  ${t.name}: ${t.dark};${g.note ? `  /* ${g.note} */` : ''}`);
      if (t.light && !selfRef) tokenDefsLight.push(`  ${t.name}: ${t.light};${g.note ? `  /* ${g.note} */` : ''}`);
    }
    const baseValue = g.baseValue || `var(${g.token})`;

    for (const d of g.decls) {
      // base 置換
      const bl = load(d.baseFile);
      const bre = declRe(d.prop);
      if (!bre.test(bl[d.baseLine - 1])) { console.warn(`[SKIP] base ${d.baseFile}:${d.baseLine} ${d.prop} 不一致`); continue; }
      bl[d.baseLine - 1] = bl[d.baseLine - 1].replace(bre, (m, pre, ws, p) => `${pre}${ws}${p}: ${baseValue};`);
      // light 削除
      const ll = load(d.lightFile);
      const lre = declRe(d.prop);
      if (!lre.test(ll[d.lightLine - 1])) { console.warn(`[SKIP] light ${d.lightFile}:${d.lightLine} ${d.prop} 不一致`); continue; }
      ll[d.lightLine - 1] = ll[d.lightLine - 1].replace(lre, (m, pre, ws) => pre + ws).replace(/[ \t]+(\r?)$/, '$1');
      if (DRY) console.log(`[DRY] ${g.token || g.tokens[0].name}: base ${d.baseFile}:${d.baseLine} → ${baseValue} / light ${d.lightFile}:${d.lightLine} 削除`);
    }
  }

  // tokens.css :root 末尾 (--safe-top 行の手前の「Safe Area」 コメント前) に挿入
  const tl = load('assets/styles-tokens.css');
  const anchorIdx = tl.findIndex(l => l.includes('Safe Area inset utility'));
  if (anchorIdx === -1) { console.error('tokens.css anchor 不在'); process.exit(1); }
  const eol = tl[anchorIdx].endsWith('\r') ? '\r' : '';
  const rootBlock = [
    `  /* ─── @layer Step 2-b: theme-swap pair tokens (dark default) ─── */${eol}`,
    ...tokenDefsRoot.map(l => l + eol), '' + eol,
  ];
  tl.splice(anchorIdx, 0, ...rootBlock);

  // light.css token block: 「misc text + glow (B13)」 cluster 末尾 = --c-sb-top-bg 行の後に挿入
  const ll2 = load('assets/styles-light.css');
  const lightAnchor = ll2.findIndex(l => l.includes('--c-sb-top-bg'));
  if (lightAnchor === -1) { console.error('light.css anchor 不在'); process.exit(1); }
  const eol2 = ll2[lightAnchor].endsWith('\r') ? '\r' : '';
  ll2.splice(lightAnchor + 1, 0, `${eol2}`, `  /* ─── @layer Step 2-b: theme-swap pair tokens (light 値) ─── */${eol2}`, ...tokenDefsLight.map(l => l + eol2));

  if (!DRY) {
    for (const [f, lines] of fileLines) {
      let src = lines.join('\n');
      if (f.endsWith('styles-light.css')) {
        // 空 rule 削除 — multi-line selector (カンマ終端の前行) も一括 (selector 浮き事故防止)
        src = src.replace(/(?:^[ \t]*[^@{}\/\r\n][^{}\r\n]*,[ \t]*\r?\n)*^[ \t]*[^@{}\/\r\n][^{}\r\n]*\{\s*\}[ \t]*\r?\n?/gm, '');
        src = src.replace(/(\r?\n)(?:[ \t]*\r?\n){2,}/g, '$1$1');
      }
      fs.writeFileSync(f, src);
    }
  }
  console.log(`pairs: ${plan.length} token / root +${tokenDefsRoot.length} / light +${tokenDefsLight.length}`);
  process.exit(0);
}

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
    // 空 rule 削除: selector { } (空 body or 空白のみ) — CRLF 維持。
    // multi-line selector (カンマ終端の前行) も一括削除 (selector 浮き事故防止)
    src = src.replace(/(?:^[ \t]*[^@{}\/\r\n][^{}\r\n]*,[ \t]*\r?\n)*^[ \t]*[^@{}\/\r\n][^{}\r\n]*\{\s*\}[ \t]*\r?\n?/gm, '');
    // 編集行が空行化した分の 3 連続空行縮約 (CRLF/ LF 両対応)
    src = src.replace(/(\r?\n)(?:[ \t]*\r?\n){2,}/g, '$1$1');
    fs.writeFileSync(file, src);
  }
  console.log(`${file}: ${removed} decl removed`);
}
