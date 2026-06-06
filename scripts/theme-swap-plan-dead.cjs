#!/usr/bin/env node
// @layer Step 2-h plan generator: DEAD (shadowed dead theme decl) → deleteOnly plan
//   audit の out.DEAD (同 theme file 内 covering rule が cascade 常勝 = どの element でも winner 不可)
//   を物理削除。 値不問 (表示に乗らない decl) → 表示不変。
// node scripts/theme-swap-audit.cjs 後に実行 → theme-swap-apply.cjs --pairs で適用

const fs = require('fs');
const { DEAD } = JSON.parse(fs.readFileSync('scripts/.theme-swap.json', 'utf8'));

if (!DEAD || !DEAD.length) { console.log('DEAD 0 — plan 不要'); process.exit(0); }

const plan = DEAD.map(d => ({
  deleteOnly: true,
  decls: [{ lightFile: d.file, lightLine: d.line, prop: d.prop, baseFile: null, baseLine: null,
    baseSel: `dead-shadowed ${d.selector} ← ${d.shadower}` }],
}));

fs.writeFileSync('scripts/.theme-swap-plan-dead.json', JSON.stringify(plan, null, 1));
console.log(`plan: delete ${plan.length} → scripts/.theme-swap-plan-dead.json`);
for (const g of plan) console.log(`[DEL dead] ${g.decls[0].baseSel.slice(0, 110)} { ${g.decls[0].prop} } @${g.decls[0].lightFile.replace('assets/styles-', '')}:${g.decls[0].lightLine}`);
