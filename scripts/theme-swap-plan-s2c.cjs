#!/usr/bin/env node
// @layer Step 2-c plan generator: M safe 1-of-1 → 個別 semantic token (機械命名)
// 兄貴承認 2026-06-05: 全 token 化 (rule 退場の構造価値 > token 増)
// node scripts/theme-swap-audit.cjs 後に実行

const fs = require('fs');
const { M } = JSON.parse(fs.readFileSync('scripts/.theme-swap.json', 'utf8'));
const norm = (s) => s.replace(/\s+/g, ' ').trim();

// S2-b で処理済みの pair (NAMES 済) は audit 再実行後は M から消えてる前提 (light decl 削除済)

// 物理 decl gate (S2-b と同一)
const physAll = new Map();
for (const d of M) {
  const k = `${d.file}|${d.line}|${d.prop}`;
  if (!physAll.has(k)) physAll.set(k, []);
  physAll.get(k).push(d);
}
const pairKeyOf = (d) => d.pair.value + ' || ' + d.value;
const physOk = (d) => {
  const splits = physAll.get(`${d.file}|${d.line}|${d.prop}`);
  const key = pairKeyOf(d);
  return splits.every(s => s.safe && !s.sameValue && pairKeyOf(s) === key);
};

const PROP_SLUG = {
  'color': 'fg', 'background': 'bg', 'background-color': 'bg',
  'border-color': 'border', 'border-top-color': 'border-top', 'border-bottom-color': 'border-bot',
  'border-left-color': 'border-left', 'border-right-color': 'border-right',
  'border-left': 'border-left', 'border-bottom': 'border-bot', 'border': 'border',
  'box-shadow': 'shadow', 'text-shadow': 'text-shadow', 'opacity': 'opacity',
  'accent-color': 'accent', 'outline-color': 'outline', 'stroke': 'stroke', 'fill': 'fill',
  'border-bottom-color': 'border-bot', 'font-weight': 'fw', 'background-image': 'bg',
};

function selSlug(sel) {
  // 最後の compound の class/element 群 → slug
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
  // 文脈 (親 compound の主要 class) — modal-a 等の文脈は識別上重要
  const ctx = [];
  for (let i = 0; i < parts.length - 1; i++) {
    const c = (parts[i].match(/\.[\w-]+/g) || []).map(x => x.slice(1).replace(/^wwm-/, ''));
    if (c.length) ctx.push(c[0]);
  }
  // 文脈は直近 1 つだけ、 core と重複したら省略
  const near = ctx[ctx.length - 1];
  if (near && !core.startsWith(near) && !near.startsWith(core)) core = `${near}--${core}`;
  return (core + pseudo).replace(/-{3,}/g, '--');
}

// 命名手動補正 (機械 slug → semantic、 2026-06-05 レビュー)
const RENAME = {
  '--c-shared-build-mode--shared-build-banner-bg': '--c-shared-banner-bg',
  '--c-shared-build-mode--shared-build-banner-fg': '--c-shared-banner-fg',
  '--c-title-block--accent-fg': '--c-h1-accent-fg',
  '--c-title-block--p-fg': '--c-h1-sub-fg',
  '--c-cmp-modal-a--cmp-title-en-fg': '--c-cmp-title-en-fg',
  '--c-cmp-modal-a--cmp-set-header-text-shadow': '--c-cmp-set-header-text-shadow',
  '--c-cmp-modal-a--cmp-preview-value-zero-fg': '--c-cmp-preview-zero-fg',
  '--c-hero-wuxia--hero-number-text-shadow': '--c-hero-number-text-shadow',
  '--c-hero-wuxia--hero-next-val-fg': '--c-hero-next-val-fg',
  '--c-hero-wuxia--luopan-center-label-fg': '--c-luopan-center-label-fg',
  '--c-hero-wuxia--judge-name-fg': '--c-judge-name-fg',
  '--c-hero-wuxia--judge-name-fw': '--c-judge-name-fw',
  '--c-hero-wuxia--judge-val-fw': '--c-judge-val-fw',
  '--c-hero-wuxia--judge-dot-phys-shadow': '--c-judge-dot-phys-shadow',
  '--c-hero-wuxia--judge-dot-elem-shadow': '--c-judge-dot-elem-shadow',
  '--c-hero-wuxia--hero-tier-tier-A-shadow': '--c-tier-a-hero-shadow',
  '--c-hero-wuxia--hero-tier-tier-B-shadow': '--c-tier-b-hero-shadow',
  '--c-hero-wuxia--hero-tier-tier-C-shadow': '--c-tier-c-hero-shadow',
  '--c-hero-wuxia--ink-stroke-opacity': '--c-ink-stroke-opacity',
  '--c-layout-active--mobile-stat-fab-bg': '--c-mobile-fab-bg',
  '--c-layout-active--mobile-stat-fab-shadow': '--c-mobile-fab-shadow',
  '--c-note-cl-items--note-cl-featured-bg': '--c-note-cl-featured-bg',
};
// 除外: light bg 3 層構造 (S) の付随 longhand — S 処理時に一緒に動かす
const SKIP_SLUGS = new Set([
  '--c-gear-grid--equip-slot-background-position',
  '--c-gear-grid--equip-slot-background-size',
  '--c-gear-grid--equip-slot-background-repeat',
]);

const cands = M.filter(d => d.file === 'assets/styles-light.css' && d.safe && !d.sameValue && physOk(d));

// 物理 decl unique 化 (multi-selector split は代表 1 件 — gate で同 pairKey 保証済)
const seen = new Set();
const groups = [];
const nameCount = new Map();
for (const d of cands) {
  const pk = `${d.file}|${d.line}|${d.prop}`;
  if (seen.has(pk)) continue;
  seen.add(pk);
  const propSlug = PROP_SLUG[d.prop] || d.prop;
  let token = `--c-${selSlug(d.baseSel)}-${propSlug}`;
  if (SKIP_SLUGS.has(token)) continue;
  token = RENAME[token] || token;
  const n = (nameCount.get(token) || 0) + 1;
  nameCount.set(token, n);
  if (n > 1) token = `${token}-${n}`;
  groups.push({
    token,
    dark: norm(d.pair.value),   // multi-line 宣言 → 1 行化 (tokens.css 行整合)
    light: norm(d.value),
    decls: [{
      lightFile: d.file, lightLine: d.line, prop: d.prop,
      baseFile: d.pair.file, baseLine: d.pair.line, baseSel: d.baseSel,
    }],
  });
}

fs.writeFileSync('scripts/.theme-swap-plan-s2c.json', JSON.stringify(groups, null, 1));
console.log(`plan: ${groups.length} token → scripts/.theme-swap-plan-s2c.json`);
for (const g of groups) console.log(`${g.token}\n    dark : ${g.dark}\n    light: ${g.light}    (${g.decls[0].baseSel} { ${g.decls[0].prop} })`);
