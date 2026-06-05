#!/usr/bin/env node
// @layer Step 2-b plan generator: 頻出 pair group (2+) → semantic token 命名
// audit JSON から decls を引いて plan.json 出力
// node scripts/theme-swap-audit.cjs 後に実行

const fs = require('fs');
const { M } = JSON.parse(fs.readFileSync('scripts/.theme-swap.json', 'utf8'));

// pairKey → token 定義 (命名 = 手動 semantic、 2026-06-05 Step 2-b)
// skip: equip/xinfa slot の background-position/size/repeat 3 group (light bg 3層構造の付随 → S 系で扱う)
const NAMES = {
  'var(--gold-bright) || var(--vermilion)': {
    token: '--c-fg-accent', note: 'アクセント前景 (dark 明金 / light 朱)' },
  'var(--gold) || var(--gold-bright)': {
    token: '--c-fg-gold-label', note: '金ラベル前景 (light は暗金)' },
  'var(--vermilion-bright) || var(--vermilion-deep)': {
    token: '--c-fg-vermilion-strong', note: '朱前景 強調 (light は深朱)' },
  '0 0 0 4px rgba(240,210,138,0.18) || 0 0 0 4px var(--vermilion-bright-soft)': {
    token: '--c-focus-ring-shadow', note: 'focus-visible ring (dark 金 / light 朱)' },
  '#7a93b0 || #3d5266': {
    token: '--c-fg-hidden-stat', note: '隠しステ行 青灰' },
  'var(--paper) || var(--brown-1)': {
    token: '--c-modal-a-fg', note: 'compare modal A 主文字色' },
  'var(--gold-bright) || var(--vermilion-deep)': {
    token: '--c-fg-emphasis', note: '見出し強調 (hero label ja / cmp-val-input)' },
  '0.15 || 0.22': {
    token: '--c-icon-dim-opacity', note: 'equip/xinfa icon 背景透かし opacity' },
  '0 8px 22px var(--overlay-soft-2) || 0 6px 18px var(--c-anlz-shadow-orange)': {
    token: '--c-anlz-shadow', note: 'anlz header/body 浮き shadow' },
  'linear-gradient(180deg, rgba(20,15,12,0.98), rgba(10,8,9,0.98)) || linear-gradient(180deg, var(--c-mobile-overlay-top), var(--c-mobile-overlay-bot))': {
    tokens: [
      { name: '--c-mobile-overlay-top', dark: 'rgba(20,15,12,0.98)' },   // light 既定義 (Phase 5.3 B17)
      { name: '--c-mobile-overlay-bot', dark: 'rgba(10,8,9,0.98)' },
    ],
    baseValue: 'linear-gradient(180deg, var(--c-mobile-overlay-top), var(--c-mobile-overlay-bot))',
    note: 'mobile overlay bg (dark default 追加で base を token 参照化)' },
  'linear-gradient(180deg, rgba(26,20,16,0.95), rgba(15,12,14,0.92)) || var(--c-mobile-overlay-header-bg)': {
    tokens: [
      { name: '--c-mobile-overlay-header-bg', dark: 'linear-gradient(180deg, rgba(26,20,16,0.95), rgba(15,12,14,0.92))' },
    ],
    baseValue: 'var(--c-mobile-overlay-header-bg)',
    note: 'mobile overlay header bg (dark default 追加)' },
};

// 物理 decl gate: apply は (file,line,prop) 行から decl を物理削除する。
// 同 物理 decl の全 split (multi-selector) が safe ∧ 同 pairKey でなければ、
// unsafe 側 selector の override を道連れ削除する事故になる (S2-b 初回 .wwm-cmp-val regression)
const physAll = new Map();
for (const d of M) {
  const k = `${d.file}|${d.line}|${d.prop}`;
  if (!physAll.has(k)) physAll.set(k, []);
  physAll.get(k).push(d);
}
const physOk = (d) => {
  const splits = physAll.get(`${d.file}|${d.line}|${d.prop}`);
  const key = d.pair.value + ' || ' + d.value;
  return splits.every(s => s.safe && !s.sameValue && (s.pair.value + ' || ' + s.value) === key);
};

const safe = M.filter(d => d.safe && !d.sameValue && physOk(d));
const groups = new Map();
for (const d of safe) {
  const key = d.pair.value + ' || ' + d.value;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(d);
}

const plan = [];
for (const [key, ds] of groups) {
  const def = NAMES[key];
  if (!def) continue;
  const [dark, light] = key.split(' || ');
  plan.push({
    ...(def.token ? { token: def.token, dark, light } : {}),
    ...(def.tokens ? { tokens: def.tokens } : {}),
    ...(def.baseValue ? { baseValue: def.baseValue } : {}),
    note: def.note,
    decls: ds.map(d => ({
      lightFile: d.file, lightLine: d.line, prop: d.prop,
      baseFile: d.pair.file, baseLine: d.pair.line,
      baseSel: d.baseSel,
    })),
  });
}

fs.writeFileSync('scripts/.theme-swap-plan.json', JSON.stringify(plan, null, 1));
console.log(`plan: ${plan.length} group / ${plan.reduce((n, g) => n + g.decls.length, 0)} decl → scripts/.theme-swap-plan.json`);
