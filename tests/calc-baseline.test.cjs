// computeExpected baseline回帰テスト
// 5パターンの固定params で結果を tests/baseline.json と照合
// 初回 or 意図的変更時: node tests/calc-baseline.test.js --update で更新
// 通常実行: node --test tests/calc-baseline.test.js

const fs = require('fs');
const path = require('path');
const { test } = require('node:test');
const assert = require('node:assert');

const { computeExpected } = require('./load-calc.cjs');

const baselinePath = path.join(__dirname, 'baseline.json');

// 共通base params (装備なし Lv95キャラ、敵Lv91想定)
const _basePar = () => ({
  minPhysATK: 200, maxPhysATK: 400,
  minElemMain: 100, maxElemMain: 200,
  minElemSub: 0, maxElemSub: 0,
  outerCoeff: 1.5, statusCoeff: 1.5, outerAdd: 230,
  enemyDebuff: 0, hitRate: 1.0,
  critRate: 0.3, sympathyRate: 0.2, addCritRate: 0, addSympathyRate: 0,
  worldLv: 14, martialLv: 95,
  elemBoostMain: 1.5, elemBoostSub: 1.0,
  critBoost: 0.5, sympathyBoost: 1.0,
  allMartialBoost: 0, globalDmgBoost: 0,
  specMartialBoost: 0, outerPen: 30,
  bossBoost: 0, elemPen: 30,
  elemAtkBoost: 0, dmgReduce1: 0, dmgReduce2: 0,
  weaponBonus: 0, playerBoost: 0,
  physRes: 30, judgeRes: 1.45, physDef: 350, elemRes: 30,
});

const cases = [
  { name: 'base_naked', params: _basePar() },
  { name: 'with_globalDmgBoost_purple_5tiers', params: Object.assign(_basePar(), { _hiddenAdditive: { globalDmgBoost: 0.05 } }) },
  { name: 'with_physDmgBoost_T5', params: Object.assign(_basePar(), { _hiddenAdditive: { physDmgBoost: 0.025 } }) },
  { name: 'with_outerPen_high', params: Object.assign(_basePar(), { outerPen: 80 }) },
  { name: 'with_outerPen_low', params: Object.assign(_basePar(), { outerPen: 10 }) },
];

const UPDATE = process.argv.includes('--update');

if (UPDATE) {
  const out = {};
  for (const c of cases) {
    const r = computeExpected(JSON.parse(JSON.stringify(c.params)));
    out[c.name] = { expected: r.expected, statusScore: r.statusScore, tier: r.tier };
  }
  fs.writeFileSync(baselinePath, JSON.stringify(out, null, 2));
  console.log(`baseline.json updated (${cases.length} cases)`);
  process.exit(0);
}

if (!fs.existsSync(baselinePath)) {
  console.error('baseline.json なし。初回は --update で生成して。');
  process.exit(1);
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

for (const c of cases) {
  test(`baseline: ${c.name}`, () => {
    const r = computeExpected(JSON.parse(JSON.stringify(c.params)));
    const b = baseline[c.name];
    assert.ok(b, `baseline entry missing for ${c.name}`);
    assert.ok(Math.abs(r.expected - b.expected) < 1, `expected mismatch: got ${r.expected}, baseline ${b.expected}`);
    assert.ok(Math.abs(r.statusScore - b.statusScore) < 1, `statusScore mismatch: got ${r.statusScore}, baseline ${b.statusScore}`);
    assert.strictEqual(r.tier, b.tier, `tier mismatch`);
  });
}
