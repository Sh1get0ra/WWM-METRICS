#!/usr/bin/env node
// @layer Step 2-f plan generator: P (prop-add) pBatch → base rule へ var(--tok) 挿入 + theme decl 削除
//   group = 挿入物理 decl 単位 (insert.file | insert.ruleStart | prop)
//   token = { dark: dark 側値 ?? pOtherVal ?? 'initial', light: light 側値 ?? pOtherVal ?? 'initial' }
//   'initial' = guaranteed-invalid → var() 参照が IACVT → unset = 当該 theme で「未指定相当」
//   削除 = theme 物理 decl 単位 (global dedupe、 deleteOnly group)
// node scripts/theme-swap-audit.cjs 後に実行

const fs = require('fs');
const { P } = JSON.parse(fs.readFileSync('scripts/.theme-swap.json', 'utf8'));
const norm = (s) => s.replace(/\s+/g, ' ').trim();

const PROP_SLUG = {
  'color': 'fg', 'background': 'bg', 'background-color': 'bg',
  'border-color': 'border', 'border-top-color': 'border-top', 'border-bottom-color': 'border-bot',
  'border-left-color': 'border-left', 'border-right-color': 'border-right',
  'border-left': 'border-left', 'border-bottom': 'border-bot', 'border': 'border',
  'box-shadow': 'shadow', 'text-shadow': 'text-shadow', 'opacity': 'opacity',
  'accent-color': 'accent', 'outline-color': 'outline', 'stroke': 'stroke', 'fill': 'fill',
  'font-weight': 'fw', 'background-image': 'bg', 'padding': 'pad', 'padding-left': 'pad-left',
};

function selSlug(sel) {
  const safe = sel.replace(/\[[^\]]*\]/g, '');
  const parts = safe.split(/\s*[>+~]\s*|\s+/).filter(Boolean);
  const last = parts[parts.length - 1] || safe;
  let pseudo = '';
  if (/::?before/.test(last)) pseudo = '-before';
  else if (/::?after/.test(last)) pseudo = '-after';
  else if (/:hover/.test(last)) pseudo = '-hover';
  else if (/:focus/.test(last)) pseudo = '-focus';
  else if (/:checked/.test(last)) pseudo = '-checked';
  const classes = (last.match(/\.[\w-]+/g) || []).map(c => c.slice(1).replace(/^wwm-/, ''));
  let core = classes.join('-') || last.replace(/[:#().]/g, '').trim();
  const ctx = [];
  for (let i = 0; i < parts.length - 1; i++) {
    const c = (parts[i].match(/\.[\w-]+/g) || []).map(x => x.slice(1).replace(/^wwm-/, ''));
    if (c.length) ctx.push(c[0]);
  }
  const near = ctx[ctx.length - 1];
  if (near && !core.startsWith(near) && !near.startsWith(core)) core = `${near}--${core}`;
  return (core + pseudo).replace(/-{3,}/g, '--');
}

// 命名手動補正 (機械 slug → semantic)
const RENAME = {
  '--c-wherebutton-outline': '--c-focus-ring',
  '--c-focus-visible-focus-outline': '--c-focus-ring',
  '--c-hero-hero-wuxia-border': '--c-hero-wuxia-border',
};

const cands = P.filter(d => d.pBatch);
if (!cands.length) { console.log('pBatch 0 — plan 不要'); process.exit(0); }

// 挿入物理 decl 単位 group
const groups = new Map(); // insert.file|insert.ruleStart|prop → { insert, prop, light?, dark?, baseSels:[] }
for (const e of cands) {
  const k = `${e.insert.file}|${e.insert.ruleStart}|${e.prop}`;
  if (!groups.has(k)) groups.set(k, { insert: { file: e.insert.file, ruleStart: e.insert.ruleStart, prop: e.prop }, prop: e.prop, baseSels: [], otherVals: new Set() });
  const g = groups.get(k);
  g.baseSels.push(e.baseSel);
  const v = norm(e.value);
  if (e.ctx === 'light') {
    if (g.light !== undefined && g.light !== v) { console.error(`[CONFLICT] light 値不一致 ${k}: ${g.light} vs ${v}`); process.exit(1); }
    g.light = v;
  } else {
    if (g.dark !== undefined && g.dark !== v) { console.error(`[CONFLICT] dark 値不一致 ${k}: ${g.dark} vs ${v}`); process.exit(1); }
    g.dark = v;
  }
  if (e.pOtherVal) g.otherVals.add(norm(e.pOtherVal));
}

// 削除 (theme 物理 decl 単位 global dedupe)
const seenPhys = new Set();
const deletes = [];
for (const e of cands) {
  const pk = `${e.file}|${e.line}|${e.prop}`;
  if (seenPhys.has(pk)) continue;
  seenPhys.add(pk);
  deletes.push({ file: e.file, line: e.line, prop: e.prop, label: `${e.ctx} ${e.baseSel}` });
}

const plan = [];
const nameCount = new Map();
for (const [k, g] of groups) {
  if (g.otherVals.size > 1) { console.error(`[CONFLICT] pOtherVal 不一致 ${k}`); process.exit(1); }
  const rescue = g.otherVals.size === 1 ? [...g.otherVals][0] : undefined;
  const dark = g.dark !== undefined ? g.dark : (g.light !== undefined ? (rescue ?? 'initial') : 'initial');
  const light = g.light !== undefined ? g.light : (rescue ?? 'initial');
  const propSlug = PROP_SLUG[g.prop] || g.prop;
  let token = `--c-${selSlug(g.baseSels[0])}-${propSlug}`;
  token = RENAME[token] || token;
  const n = (nameCount.get(token) || 0) + 1;
  nameCount.set(token, n);
  if (n > 1) token = `${token}-${n}`;
  token = RENAME[token] || token;
  plan.push({
    token, dark,
    light: light === dark ? undefined : light,
    insert: g.insert,
    decls: [],
  });
}
for (const del of deletes) {
  plan.push({
    deleteOnly: true,
    decls: [{ lightFile: del.file, lightLine: del.line, prop: del.prop, baseFile: null, baseLine: null, baseSel: del.label }],
  });
}

fs.writeFileSync('scripts/.theme-swap-plan-s2f.json', JSON.stringify(plan, null, 1));
const tok = plan.filter(g => !g.deleteOnly);
console.log(`plan: token/insert ${tok.length} / delete ${plan.length - tok.length} → scripts/.theme-swap-plan-s2f.json`);
for (const g of plan) {
  if (g.deleteOnly) console.log(`[DEL] ${g.decls[0].baseSel} { ${g.decls[0].prop} } @${g.decls[0].lightFile.replace('assets/styles-', '')}:${g.decls[0].lightLine}`);
  else console.log(`${g.token}\n    dark : ${g.dark}\n    light: ${g.light ?? '(= dark)'}\n    insert: ${g.insert.file.replace('assets/styles-', '')}:${g.insert.ruleStart} { ${g.insert.prop} }`);
}
