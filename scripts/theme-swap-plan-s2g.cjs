#!/usr/bin/env node
// @layer Step 2-g plan generator: N (no-base) rule co-locate
//   Mode T: 新 base rule (baseSel 群 + prop: var(--tok) | literal) を target file 末尾へ + theme decl 削除
//   Mode B: imp decl を theme prefix selector のまま target file へ sibling rule として移動 (K-type co-locate)
//   merge: 反対 theme rule (mergeInto) の decl は light 側 rule に統合 (token 両 theme 実値)
// node scripts/theme-swap-audit.cjs 後に実行

const fs = require('fs');
const data = JSON.parse(fs.readFileSync('scripts/.theme-swap.json', 'utf8'));
const { NRULES } = data;
const norm = (s) => s.replace(/\s+/g, ' ').trim();

const PROP_SLUG = {
  'color': 'fg', 'background': 'bg', 'background-color': 'bg',
  'border-color': 'border', 'border-top-color': 'border-top', 'border-bottom-color': 'border-bot',
  'border-left-color': 'border-left', 'border-right-color': 'border-right',
  'border-left': 'border-left', 'border-bottom': 'border-bot', 'border-top': 'border-top', 'border': 'border',
  'box-shadow': 'shadow', 'text-shadow': 'text-shadow', 'opacity': 'opacity',
  'accent-color': 'accent', 'outline-color': 'outline', 'stroke': 'stroke', 'fill': 'fill',
  'font-weight': 'fw', 'background-image': 'bg', 'padding': 'pad', 'padding-left': 'pad-left',
  'padding-bottom': 'pad-bot', 'pointer-events': 'pe', 'z-index': 'z',
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

// 既存 token 名 (衝突回避): tokens.css + light/dark.css の定義
const existingTokens = new Set();
const { pathOf } = require('./css-files.cjs');
for (const f of [pathOf('tokens'), pathOf('light'), pathOf('dark')]) {
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/^\s*(--[\w-]+)\s*:/gm)) existingTokens.add(m[1]);
}
const nameCount = new Map();
function tokenName(baseSel, prop) {
  const slug = PROP_SLUG[prop] || prop;
  let t = `--c-${selSlug(baseSel)}-${slug}`;
  let n = (nameCount.get(t) || 0) + 1;
  nameCount.set(t, n);
  if (n > 1) t = `${t}-${n}`;
  for (let i = 2; existingTokens.has(t); i++) t = `--c-${selSlug(baseSel)}-${slug}-n${i}`;
  return t;
}

const movers = NRULES.filter(r => r.ok && r.entries.some(e => e.nBatch));
if (!movers.length) { console.log('N 移設対象 0 — plan 不要'); process.exit(0); }

// merge 消費: mergeInto 付き rule の entries は light 側 rule 処理で統合
const mergedFrom = new Map(); // light ruleKey → dark rule
for (const r of movers) if (r.mergeInto) mergedFrom.set(r.mergeInto, r);

const plan = [];
const newRules = []; // { file, vLine, header, selectors, decls } — apply で vLine 順 append
const seenDel = new Set();
const deletes = [];
const addDelete = (file, line, prop, label) => {
  const pk = `${file}|${line}|${prop}`;
  if (seenDel.has(pk)) return;
  seenDel.add(pk);
  deletes.push({ file, line, prop, label });
};

for (const r of movers) {
  if (r.mergeInto) continue; // light 側で統合処理
  const merged = mergedFrom.get(r.key) || null;
  const srcLabel = `${r.key.replace('assets/styles-', '').replace('.css', '')} L${r.ruleStart}`;

  // ── Mode T rule ──
  const tEnts = r.entries.filter(e => e.nMode === 'T' && e.nBatch);
  if (tEnts.length) {
    for (const e of tEnts) addDelete(r.file, e.line, e.prop, `${e.ctx} ${e.baseSel}`);
    // S2-h: selector ごとの decl signature (line|prop|value|other|literal|opp) で group 化。
    // rescue (nOtherVal) が selector 別に異なる場合は rule/token を分離
    // (#45 kongfu-header vs set-header — 同 phys decl でも other theme 再現値が別)。
    // signature 同一の selector は 1 rule に統合 (旧挙動保存)
    const bySel = new Map();
    for (const e of tEnts) {
      if (!bySel.has(e.baseSel)) bySel.set(e.baseSel, []);
      bySel.get(e.baseSel).push(e);
    }
    const sigOf = (ents) => ents.map(e =>
      `${e.line}|${e.prop}|${norm(e.value)}|${e.nOtherVal ? norm(e.nOtherVal) : ''}|${e.nLiteralOk ? 1 : 0}|${e.nOppKey || ''}`
    ).sort().join(' ;; ');
    const sigGroups = new Map();
    for (const [sel, ents] of bySel) {
      const sig = sigOf(ents);
      if (!sigGroups.has(sig)) sigGroups.set(sig, { sels: [], ents: [...ents].sort((a, b) => a.line - b.line) });
      sigGroups.get(sig).sels.push(sel);
    }
    for (const [, grp] of sigGroups) {
      const tokens = [];
      const decls = [];
      for (const e of grp.ents) {
        const v = norm(e.value);
        // opp merge: 反対 theme 値
        let oppVal;
        if (e.nOppKey && merged) {
          const oppE = merged.entries.find(x => `${merged.file}|${x.line}|${x.selector}|${x.prop}` === e.nOppKey && x.nBatch);
          if (oppE) {
            oppVal = norm(oppE.value);
            addDelete(merged.file, oppE.line, oppE.prop, `${oppE.ctx} ${oppE.baseSel} (merge)`);
          }
        }
        if (e.nLiteralOk && !oppVal) {
          decls.push({ prop: e.prop, value: v, imp: false }); // light-only token 参照 = other 側 IACVT 保証 → literal
          continue;
        }
        const other = oppVal ?? (e.nOtherVal ? norm(e.nOtherVal) : 'initial');
        const dark = e.ctx === 'light' ? other : v;
        const light = e.ctx === 'light' ? v : other;
        const name = tokenName(grp.sels[0], e.prop);
        tokens.push({ name, dark, light: light === dark ? undefined : light });
        decls.push({ prop: e.prop, value: `var(${name})`, imp: false });
      }
      newRules.push({
        file: r.target, vLine: r.vLine,
        header: `/* S2-g co-locate (T): ${srcLabel}${merged ? ' + ' + merged.key.replace('assets/styles-', '').replace('.css', '') : ''} */`,
        selectors: grp.sels, decls,
      });
      if (tokens.length) plan.push({ tokens, note: `S2-g ${selSlug(grp.sels[0])}`, decls: [] });
    }
  }

  // ── Mode B sibling rule (imp / svg 降格 → theme prefix 維持 K-type) ──
  const bEnts = r.entries.filter(e => e.nMode === 'B' && e.nBatch);
  if (bEnts.length) {
    const selectors = [...new Set(bEnts.map(e => e.selector))];
    const byPhys = new Map();
    for (const e of bEnts) {
      const k = `${e.line}|${e.prop}`;
      if (!byPhys.has(k)) byPhys.set(k, e);
      addDelete(r.file, e.line, e.prop, `${e.ctx} ${e.baseSel} (B)`);
    }
    if (bEnts.length !== selectors.length * byPhys.size) {
      console.error(`[FAIL] B rule ${r.key}: sel×prop 不均一 (${bEnts.length} ≠ ${selectors.length}×${byPhys.size})`);
      process.exit(1);
    }
    const hasImp = [...byPhys.values()].some(e => e.important);
    const hasSvg = [...byPhys.values()].some(e => !e.important);
    const why = [hasImp ? 'imp は inline/競合 対抗 keep' : '', hasSvg ? 'svg presentation attr 保護 (token unset 不可)' : ''].filter(Boolean).join(' / ');
    newRules.push({
      file: r.target, vLine: r.vLine + 0.5,
      header: `/* S2-g co-locate (B / K-type): ${srcLabel} — theme gate 維持で other theme 影響ゼロ。 ${why} */`,
      selectors, decls: [...byPhys.values()].map(e => ({ prop: e.prop, value: norm(e.value), imp: !!e.important })),
    });
  }
}

for (const del of deletes) {
  plan.push({
    deleteOnly: true,
    decls: [{ lightFile: del.file, lightLine: del.line, prop: del.prop, baseFile: null, baseLine: null, baseSel: del.label }],
  });
}
// newRules は file ごと vLine 昇順 (元 light.css 内 順序保存)
newRules.sort((a, b) => a.file === b.file ? a.vLine - b.vLine : a.file.localeCompare(b.file));
plan.push({ newRules: true, rules: newRules, decls: [] });

fs.writeFileSync('scripts/.theme-swap-plan-s2g.json', JSON.stringify(plan, null, 1));
const tokGroups = plan.filter(g => g.tokens);
const tokN = tokGroups.reduce((a, g) => a + g.tokens.length, 0);
console.log(`plan: newRule ${newRules.length} (T ${newRules.filter(x => !x.decls.some(d => d.imp)).length} / B ${newRules.filter(x => x.decls.some(d => d.imp)).length}) / token ${tokN} / delete ${deletes.length} → scripts/.theme-swap-plan-s2g.json`);
for (const nr of newRules) {
  console.log(`[RULE→${nr.file.replace('assets/styles-', '').replace('.css', '')} @${nr.vLine}] ${nr.selectors[0].slice(0, 60)}${nr.selectors.length > 1 ? ` +${nr.selectors.length - 1}sel` : ''}`);
  for (const d of nr.decls) console.log(`    ${d.prop}: ${d.value.slice(0, 70)}${d.imp ? ' !important' : ''};`);
}
for (const g of tokGroups) for (const t of g.tokens) console.log(`TOKEN ${t.name}\n    dark : ${t.dark.slice(0, 70)}\n    light: ${(t.light ?? '(= dark)').slice(0, 70)}`);
