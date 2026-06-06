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
const { pathOf } = require('./css-files.cjs');
const LIGHT_CSS = pathOf('light'), TOKENS_CSS = pathOf('tokens');

// mode --pairs <plan.json>: pair group token swap
//   plan: [{ token, dark, light, decls:[{lightFile,lightLine,prop, baseFile,baseLine}] }]
//   操作: tokens.css :root へ dark default 追加 / light token block へ light 値追加
//        / base decl 値 → var(token) / light decl 削除
//   light 値が var(--token) 単独参照 (Phase 5.3 light-only token) なら light block 追加 skip

const DRY = process.argv.includes('--dry');
const MODE_SAME = process.argv.includes('--same-value');
const pairsIdx = process.argv.indexOf('--pairs');
const labelIdx = process.argv.indexOf('--label');
const LABEL = labelIdx !== -1 ? process.argv[labelIdx + 1] : 'Step 2-b';
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

  // multi-line 編集で空文字化した行 (file → Set<idx>)。 全編集後に filter 除去
  const blankedLines = new Map();
  const markBlank = (lines, idx) => {
    if (!blankedLines.has(lines)) blankedLines.set(lines, new Set());
    blankedLines.get(lines).add(idx);
  };

  // multi-line 宣言対応 decl 編集 (行数不変: 中間行は空文字化、 行番号 plan を保護)
  // mode: 'replace' = 値を newValue に / 'delete' = decl 除去。 成功 true
  const editDecl = (lines, line1, prop, mode, newValue) => {
    const idx = line1 - 1;
    const re = declRe(prop);
    if (re.test(lines[idx])) {
      lines[idx] = mode === 'replace'
        ? lines[idx].replace(re, (m, pre, ws, p) => `${pre}${ws}${p}: ${newValue};`)
        : lines[idx].replace(re, (m, pre, ws) => pre + ws).replace(/[ \t]+(\r?)$/, '$1');
      return true;
    }
    // multi-line: 開始行に `prop:` があり ';' '}' が無い → ';' 終端行まで走査
    const startRe = new RegExp(`(^|;|\\{)(\\s*)(${prop.replace(/[-]/g, '\\-')})\\s*:\\s*(.*?)\\r?$`);
    const m0 = lines[idx].match(startRe);
    if (!m0 || /[;}]/.test(m0[4])) return false;
    let end = -1;
    for (let j = idx + 1; j < Math.min(idx + 12, lines.length); j++) {
      if (/;/.test(lines[j])) { end = j; break; }
      if (/[{}]/.test(lines[j])) return false; // rule 境界 = 想定外
    }
    if (end === -1) return false;
    const eol = lines[idx].endsWith('\r') ? '\r' : '';
    const tail = lines[end].replace(/^[^;]*;/, ''); // 終端行の ; 後残り
    lines[idx] = mode === 'replace'
      ? lines[idx].replace(startRe, (m, pre, ws, p) => `${pre}${ws}${p}: ${newValue};`) + tail.replace(/\r?$/, '') + eol
      : (m0[1] === '{' ? lines[idx].slice(0, lines[idx].indexOf(m0[3])) + tail.replace(/\r?$/, '') + eol
                       : lines[idx].replace(startRe, (m, pre, ws) => pre + ws).replace(/[ \t]+$/, '') + tail.replace(/\r?$/, '') + eol);
    for (let j = idx + 1; j <= end; j++) { lines[j] = eol; markBlank(lines, j); }
    if (mode === 'delete' && /^[ \t]*\r?$/.test(lines[idx])) markBlank(lines, idx);
    return true;
  };

  const tokenDefsRoot = [];   // tokens.css :root 追加分
  const tokenDefsLight = [];  // light.css token block 追加分
  const inserts = [];         // S2-f: base rule 末尾 decl 挿入 { file, ruleStart, prop, value }
  const ruleInserts = [];     // S2-g: target file 末尾へ rule 丸ごと append { file, header, selectors, decls }

  for (const g of plan) {
    // S2-g newRules: component file 末尾 (end @layer 前) へ rule append
    if (g.newRules) { ruleInserts.push(...g.rules); continue; }
    // retokenLight (S2-h): 既存 token の light 値を light token block へ追加 — root / base 無変更。
    // rewrite = 既存 light 定義の値書換え (theme decl が唯一消費点を shadow していた stale 値の更新)
    if (g.retokenLight) {
      if (g.rewrite) {
        const ll = load(LIGHT_CSS);
        const idx = ll.findIndex(l => new RegExp(`^\\s*${g.retokenLight.replace(/[-]/g, '\\-')}\\s*:`).test(l));
        if (idx === -1) { console.error(`[FAIL] retokenLight ${g.retokenLight} light 定義 不在`); process.exit(1); }
        if (!editDecl(ll, idx + 1, g.retokenLight, 'replace', g.light)) { console.error(`[FAIL] retokenLight ${g.retokenLight} 書換え失敗`); process.exit(1); }
        if (DRY) console.log(`[DRY] retokenLight ${g.retokenLight} light → ${g.light}`);
      } else {
        tokenDefsLight.push(`  ${g.retokenLight}: ${g.light};${g.note ? `  /* ${g.note} */` : ''}`);
        if (DRY) console.log(`[DRY] retokenLight ${g.retokenLight} light += ${g.light}`);
      }
      continue;
    }
    // retoken: 既存 token の root default (tokens.css) を書換え — base / light block 無変更
    if (g.retoken) {
      const tl = load(TOKENS_CSS);
      const idx = tl.findIndex(l => new RegExp(`^\\s*${g.retoken.replace(/[-]/g, '\\-')}\\s*:`).test(l));
      if (idx === -1) { console.error(`[FAIL] retoken ${g.retoken} 定義 不在`); process.exit(1); }
      if (!editDecl(tl, idx + 1, g.retoken, 'replace', g.dark)) { console.error(`[FAIL] retoken ${g.retoken} 書換え失敗`); process.exit(1); }
      if (DRY) console.log(`[DRY] retoken ${g.retoken} → ${g.dark}`);
      continue;
    }
    // deleteOnly: same-value group — light decl 削除のみ (token / base 置換 不要)
    // existing: true = 既存 token 再利用 (定義追加 skip、 base 置換 + light 削除のみ)
    if (!g.existing && !g.deleteOnly)
    // tokens: [{name, dark, light?}] — light 省略 = light block 既定義 (Phase 5.3 light-only token)
    for (const t of (g.tokens || [{ name: g.token, dark: g.dark, light: g.light }])) {
      const selfRef = t.light && new RegExp(`^var\\(\\s*${t.name.replace(/[-]/g, '\\-')}\\s*\\)$`).test(t.light.trim());
      tokenDefsRoot.push(`  ${t.name}: ${t.dark};${g.note ? `  /* ${g.note} */` : ''}`);
      if (t.light && !selfRef) tokenDefsLight.push(`  ${t.name}: ${t.light};${g.note ? `  /* ${g.note} */` : ''}`);
    }
    const baseValue = g.baseValue || `var(${g.token})`;

    // S2-f insert op: base rule 末尾へ decl 追加 (splice は全 in-place 編集後に一括)
    if (g.insert) inserts.push({ file: g.insert.file, ruleStart: g.insert.ruleStart, prop: g.insert.prop, value: baseValue });

    for (const d of g.decls) {
      // base 置換 (baseFile null = light 削除のみの decl)
      if (d.baseFile && !g.deleteOnly) {
        const bl = load(d.baseFile);
        if (!editDecl(bl, d.baseLine, d.prop, 'replace', baseValue)) { console.warn(`[SKIP] base ${d.baseFile}:${d.baseLine} ${d.prop} 不一致`); continue; }
      }
      // light 削除 (lightFile null = base 置換のみの decl — multi-split 異 pair)
      if (d.lightFile) {
        const ll = load(d.lightFile);
        if (!editDecl(ll, d.lightLine, d.prop, 'delete')) { console.warn(`[SKIP] light ${d.lightFile}:${d.lightLine} ${d.prop} 不一致`); continue; }
      }
      if (DRY) console.log(`[DRY] ${g.deleteOnly ? 'DEL' : (g.token || g.tokens[0].name)}: ${d.baseFile ? `base ${d.baseFile}:${d.baseLine} → ${baseValue}` : ''} ${d.lightFile ? `/ light ${d.lightFile}:${d.lightLine} 削除` : ''}`);
    }
  }

  // multi-line 編集の空文字化行を除去 (全 decl 編集後 = 行番号参照終了後、 splice 挿入前)
  for (const [f, lines] of fileLines) {
    const marked = blankedLines.get(lines);
    if (!marked) continue;
    const kept = lines.filter((l, i) => !(marked.has(i) && /^[ \t]*\r?$/.test(l)));
    lines.length = 0;
    lines.push(...kept);
  }

  // S2-f insert: rule 末尾 (閉じ brace 直前) へ decl 挿入。
  // base file は in-place 編集のみ (行番号不変) なので元 ruleStart で位置特定可。
  // 同一 file 内は ruleStart 降順で splice (先行 splice が後続位置をずらさない)
  const byInsFile = new Map();
  for (const ins of inserts) {
    if (!byInsFile.has(ins.file)) byInsFile.set(ins.file, []);
    byInsFile.get(ins.file).push(ins);
  }
  for (const [f, list] of byInsFile) {
    const lines = load(f);
    list.sort((a, b) => b.ruleStart - a.ruleStart);
    for (const ins of list) {
      // ruleStart 行から '{' を探し、 対応する '}' まで depth 走査
      let i = ins.ruleStart - 1, depth = 0, opened = false, closeIdx = -1, closePos = -1;
      outer: for (; i < lines.length; i++) {
        for (let c = 0; c < lines[i].length; c++) {
          const ch = lines[i][c];
          if (ch === '{') { depth++; opened = true; }
          else if (ch === '}') {
            depth--;
            if (opened && depth === 0) { closeIdx = i; closePos = c; break outer; }
          }
        }
      }
      if (closeIdx === -1) { console.error(`[FAIL] insert ${f}:${ins.ruleStart} rule 終端 不在`); process.exit(1); }
      // rule 内に同 prop 既存なら異常 (audit P 前提崩れ)
      const ruleText = lines.slice(ins.ruleStart - 1, closeIdx + 1).join('\n');
      if (new RegExp(`(^|;|\\{)\\s*${ins.prop.replace(/[-]/g, '\\-')}\\s*:`, 'm').test(ruleText)) {
        console.error(`[FAIL] insert ${f}:${ins.ruleStart} ${ins.prop} 既存`); process.exit(1);
      }
      const eol = lines[closeIdx].endsWith('\r') ? '\r' : '';
      if (/^[ \t]*\}/.test(lines[closeIdx])) {
        // 閉じ brace 行 (先頭) → 直前に新行挿入
        lines.splice(closeIdx, 0, `  ${ins.prop}: ${ins.value};${eol}`);
      } else {
        // single-line rule 等 → '}' 直前に inline 挿入
        lines[closeIdx] = lines[closeIdx].slice(0, closePos) + `${ins.prop}: ${ins.value}; ` + lines[closeIdx].slice(closePos);
      }
      if (DRY) console.log(`[DRY] insert ${f}:${ins.ruleStart} + ${ins.prop}: ${ins.value}`);
    }
  }

  // S2-g newRule: target file 末尾 `} /* end @layer X */` 直前へ rule block 追加 (plan 順 = vLine 昇順)
  const byRuleFile = new Map();
  for (const nr of ruleInserts) {
    if (!byRuleFile.has(nr.file)) byRuleFile.set(nr.file, []);
    byRuleFile.get(nr.file).push(nr);
  }
  for (const [f, list] of byRuleFile) {
    const lines = load(f);
    let anchor = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (/^\s*\}\s*\/\*\s*end @layer/.test(lines[i])) { anchor = i; break; }
    }
    if (anchor === -1) { console.error(`[FAIL] newRule anchor (end @layer) 不在 ${f}`); process.exit(1); }
    const eol = lines[anchor].endsWith('\r') ? '\r' : '';
    const block = [];
    for (const nr of list) {
      block.push(eol);
      block.push(nr.header + eol);
      nr.selectors.forEach((s, i) => block.push(s + (i < nr.selectors.length - 1 ? ',' : ' {') + eol));
      for (const d of nr.decls) block.push(`  ${d.prop}: ${d.value}${d.imp ? ' !important' : ''};` + eol);
      block.push('}' + eol);
      if (DRY) console.log(`[DRY] newRule ${f} ← ${nr.selectors[0]} (${nr.decls.length} decls${nr.decls.some(d => d.imp) ? ', imp' : ''})`);
    }
    lines.splice(anchor, 0, ...block);
  }

  // tokens.css :root 末尾 (--safe-top 行の手前の「Safe Area」 コメント前) に挿入
  const tl = load(TOKENS_CSS);
  const anchorIdx = tl.findIndex(l => l.includes('Safe Area inset utility'));
  if (anchorIdx === -1) { console.error('tokens.css anchor 不在'); process.exit(1); }
  const eol = tl[anchorIdx].endsWith('\r') ? '\r' : '';
  const rootBlock = [
    `  /* ─── @layer ${LABEL}: theme-swap tokens (dark default) ─── */${eol}`,
    ...tokenDefsRoot.map(l => l + eol), '' + eol,
  ];
  tl.splice(anchorIdx, 0, ...rootBlock);

  // light.css token block: 「misc text + glow (B13)」 cluster 末尾 = --c-sb-top-bg 行の後に挿入
  const ll2 = load(LIGHT_CSS);
  const lightAnchor = ll2.findIndex(l => l.includes('--c-sb-top-bg'));
  if (lightAnchor === -1) { console.error('light.css anchor 不在'); process.exit(1); }
  const eol2 = ll2[lightAnchor].endsWith('\r') ? '\r' : '';
  ll2.splice(lightAnchor + 1, 0, `${eol2}`, `  /* ─── @layer ${LABEL}: theme-swap tokens (light 値) ─── */${eol2}`, ...tokenDefsLight.map(l => l + eol2));

  if (!DRY) {
    for (const [f, lines] of fileLines) {
      let src = lines.join('\n');
      if (f.endsWith('styles-light.css') || f.endsWith('styles-dark.css')) {
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
