#!/usr/bin/env node
// @layer Step 2-d plan generator: M batchSafe (fixpoint) → token swap / same-value 削除
// - batchSafe ∧ !sameValue → token group (s2c 同様 機械 slug)
// - batchSafe ∧ sameValue  → deleteOnly group (light decl 削除のみ、 token 不要)
// - pair 物理 decl 共有 (複数 light decl → 同 pair) は 1 group に merge
// - multi-split 異 pair decl は全 pair を decls に列挙 (apply が全て置換)
// node scripts/theme-swap-audit.cjs 後に実行

const fs = require('fs');
const { M } = JSON.parse(fs.readFileSync('scripts/.theme-swap.json', 'utf8'));
const norm = (s) => s.replace(/\s+/g, ' ').trim();

const PROP_SLUG = {
  'color': 'fg', 'background': 'bg', 'background-color': 'bg',
  'border-color': 'border', 'border-top-color': 'border-top', 'border-bottom-color': 'border-bot',
  'border-left-color': 'border-left', 'border-right-color': 'border-right',
  'border-left': 'border-left', 'border-bottom': 'border-bot', 'border': 'border',
  'box-shadow': 'shadow', 'text-shadow': 'text-shadow', 'opacity': 'opacity',
  'accent-color': 'accent', 'outline-color': 'outline', 'stroke': 'stroke', 'fill': 'fill',
  'font-weight': 'fw', 'background-image': 'bg',
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
  else if (/:nth-child\(odd\)/.test(last)) pseudo = '-odd';
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
// 注意: --c-tier-{ss,s,a,b,c}-{fg,border,grad-*} は B9 既存 (light-only、 hero/sb-badge 配色) → 衝突回避
//   裸 .tier-X chip = --c-tier-chip-*、 hero-tier = --c-tier-X-hero-* (s2c --c-tier-a-hero-shadow 系に整合)
const RENAME = {
  // chip (裸 .tier-X)
  '--c-tier-SS-fg': '--c-tier-chip-ss-fg', '--c-tier-SS-bg': '--c-tier-chip-ss-bg',
  '--c-tier-SS-border': '--c-tier-chip-ss-border', '--c-tier-SS-text-shadow': '--c-tier-chip-ss-text-shadow',
  '--c-tier-SS-shadow': '--c-tier-chip-ss-shadow', '--c-tier-SS-before-bg': '--c-tier-chip-ss-sheen',
  '--c-tier-S-fg': '--c-tier-chip-s-fg', '--c-tier-S-bg': '--c-tier-chip-s-bg',
  '--c-tier-S-border': '--c-tier-chip-s-border', '--c-tier-S-text-shadow': '--c-tier-chip-s-text-shadow',
  '--c-tier-S-shadow': '--c-tier-chip-s-shadow',
  '--c-tier-A-fg': '--c-tier-chip-a-fg', '--c-tier-A-bg': '--c-tier-chip-a-bg',
  '--c-tier-A-border': '--c-tier-chip-a-border', '--c-tier-A-text-shadow': '--c-tier-chip-a-text-shadow',
  '--c-tier-A-shadow': '--c-tier-chip-a-shadow',
  '--c-tier-B-fg': '--c-tier-chip-b-fg', '--c-tier-B-bg': '--c-tier-chip-b-bg',
  '--c-tier-B-border': '--c-tier-chip-b-border', '--c-tier-B-text-shadow': '--c-tier-chip-b-text-shadow',
  '--c-tier-B-shadow': '--c-tier-chip-b-shadow',
  '--c-tier-C-fg': '--c-tier-chip-c-fg', '--c-tier-C-bg': '--c-tier-chip-c-bg',
  '--c-tier-C-border': '--c-tier-chip-c-border', '--c-tier-C-text-shadow': '--c-tier-chip-c-text-shadow',
  '--c-tier-C-shadow': '--c-tier-chip-c-shadow',
  // hero-tier
  '--c-hero-wuxia--hero-tier-tier-badge-bg': '--c-tier-badge-hero-bg',
  '--c-hero-wuxia--hero-tier-tier-badge-fg': '--c-tier-badge-hero-fg',
  '--c-hero-wuxia--hero-tier-tier-badge-border': '--c-tier-badge-hero-border',
  '--c-hero-wuxia--hero-tier-tier-SS-bg': '--c-tier-ss-hero-bg',
  '--c-hero-wuxia--hero-tier-tier-SS-fg': '--c-tier-ss-hero-fg',
  '--c-hero-wuxia--hero-tier-tier-SS-border': '--c-tier-ss-hero-border',
  '--c-hero-wuxia--hero-tier-tier-S-bg': '--c-tier-s-hero-bg',
  '--c-hero-wuxia--hero-tier-tier-S-fg': '--c-tier-s-hero-fg',
  '--c-hero-wuxia--hero-tier-tier-S-border': '--c-tier-s-hero-border',
  '--c-hero-wuxia--hero-tier-tier-A-bg': '--c-tier-a-hero-bg',
  '--c-hero-wuxia--hero-tier-tier-A-fg': '--c-tier-a-hero-fg',
  '--c-hero-wuxia--hero-tier-tier-A-border': '--c-tier-a-hero-border',
  '--c-hero-wuxia--hero-tier-tier-B-bg': '--c-tier-b-hero-bg',
  '--c-hero-wuxia--hero-tier-tier-B-fg': '--c-tier-b-hero-fg',
  '--c-hero-wuxia--hero-tier-tier-B-border': '--c-tier-b-hero-border',
  '--c-hero-wuxia--hero-tier-tier-C-bg': '--c-tier-c-hero-bg',
  '--c-hero-wuxia--hero-tier-tier-C-fg': '--c-tier-c-hero-fg',
  '--c-hero-wuxia--hero-tier-tier-C-border': '--c-tier-c-hero-border',
  // modal-a (既存 --c-modal-a-option-* family)
  '--c-cmp-modal-a--option-fg': '--c-modal-a-option-fg',
  '--c-cmp-modal-a--cmp-kongfu-select-bg': '--c-modal-a-kongfu-select-bg',
  '--c-cmp-modal-a--cmp-set-select-bg': '--c-modal-a-set-select-bg',
  '--c-cmp-modal-a--cmp-stat-select-bg': '--c-modal-a-stat-select-bg',
  '--c-cmp-title--cmp-lv-fg': '--c-modal-a-lv-fg',
  '--c-cmp-btn-row--btn-secondary-bg': '--c-modal-a-btn-secondary-bg',
  // r3
  '--c-lang-btn-focus-shadow': '--c-focus-ring-shadow',
  '--c-cmp-modal-a--cmp-val-input-fg': '--c-modal-a-val-input-fg',
  '--c-cmp-title--cmp-lv-bg': '--c-modal-a-lv-bg',
  '--c-hero-wuxia--hero-next-arrow-fg': '--c-hero-next-arrow-fg',
  // misc
  '--c-strong-fg': '--c-footer-strong-fg',
  '--c-migration-msg--strong-fg': '--c-migration-strong-fg',
  '--c-anlz-tabs--analysis-tab-fg': '--c-anlz-tab-fg',
  '--c-anlz-tabs--analysis-tab-active-fg': '--c-anlz-tab-active-fg',
  '--c-gear-grid--equip-slot-border': '--c-slot-border',
};

const cands = M.filter(d => d.file === 'assets/styles-light.css' && d.batchSafe);

// 物理 light decl unique 化 (split 代表 1 件 — fixpoint gate で uniform 保証済)
const seen = new Set();
const byPairPhys = new Map(); // pair 物理 decl 共有の merge 用: pairFile|pairLine|prop → group
const groups = [];
const nameCount = new Map();
for (const d of cands) {
  const pk = `${d.file}|${d.line}|${d.prop}`;
  if (seen.has(pk)) continue;
  seen.add(pk);

  // 同 physical light decl の split が異 pair decl を持つ場合: 全 pair 列挙
  const splits = cands.filter(s => `${s.file}|${s.line}|${s.prop}` === pk);
  const pairPhysSet = new Map();
  for (const s of splits) pairPhysSet.set(`${s.pair.file}|${s.pair.line}`, s);

  const pairKey = `${[...pairPhysSet.keys()].sort().join(',')}|${d.prop}`;
  if (byPairPhys.has(pairKey)) {
    // pair 共有: 既存 group に light 削除だけ追加 (base 置換/token は済)
    const g0 = byPairPhys.get(pairKey);
    if (!g0.deleteOnly && g0.light !== norm(d.value)) {
      console.warn(`[WARN] pair 共有で light 値不一致 → skip: ${d.baseSel} { ${d.prop} } ${norm(d.value)} vs ${g0.light}`);
      continue;
    }
    g0.decls.push({ lightFile: d.file, lightLine: d.line, prop: d.prop, baseFile: null, baseLine: null });
    continue;
  }

  if (d.sameValue) {
    const g = {
      deleteOnly: true,
      note: `same-value (light 表示同値)`,
      decls: [{ lightFile: d.file, lightLine: d.line, prop: d.prop, baseFile: null, baseLine: null, baseSel: d.baseSel }],
    };
    byPairPhys.set(pairKey, g);
    groups.push(g);
    continue;
  }

  const propSlug = PROP_SLUG[d.prop] || d.prop;
  let token = `--c-${selSlug(d.baseSel)}-${propSlug}`;
  token = RENAME[token] || token;
  const n = (nameCount.get(token) || 0) + 1;
  nameCount.set(token, n);
  if (n > 1) token = `${token}-${n}`;
  const decls = [];
  let first = true;
  for (const [, s] of pairPhysSet) {
    decls.push({
      lightFile: first ? s.file : null, lightLine: first ? s.line : null, prop: s.prop,
      baseFile: s.pair.file, baseLine: s.pair.line, baseSel: s.baseSel,
    });
    first = false;
  }
  const g = {
    token,
    dark: norm(d.pair.value),
    light: norm(d.value),
    decls,
  };
  byPairPhys.set(pairKey, g);
  groups.push(g);
}

fs.writeFileSync('scripts/.theme-swap-plan-s2d.json', JSON.stringify(groups, null, 1));
const tok = groups.filter(g => !g.deleteOnly);
console.log(`plan: ${groups.length} group (token ${tok.length} / deleteOnly ${groups.length - tok.length}) → scripts/.theme-swap-plan-s2d.json`);
for (const g of groups) {
  if (g.deleteOnly) console.log(`[DEL] ${g.decls[0].baseSel} { ${g.decls[0].prop} }  light:${g.decls.map(d => d.lightLine).join(',')}`);
  else console.log(`${g.token}\n    dark : ${g.dark}\n    light: ${g.light}    (${g.decls[0].baseSel} { ${g.decls[0].prop} })`);
}
