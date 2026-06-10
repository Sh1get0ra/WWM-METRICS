#!/usr/bin/env node
// xinfa.json validator
// 検証項目:
//  - rank: gold/purple/blue のいずれか
//  - T2/T5 effects: 既知ステ系キー or 空 (defensive/healing/pending) or physDmgBoost のみ
//  - T0/T1/T3/T4/T6 effects.globalDmgBoost: rank別固定値 (gold=0.013/purple=0.01/blue=0.0065)
//  - kongfuRequired/synergyKongfu: kongfu_derived.json存在チェック
//  - hidden経路で計算反映0になるkey使用検出
// 使用: node scripts/validate-xinfa.cjs

const fs = require('fs');
const path = require('path');

const xinfaPath = path.join(__dirname, '..', 'data', 'xinfa.json');
const kongfuPath = path.join(__dirname, '..', 'data', 'kongfu_derived.json');
const xinfaNamesPath = path.join(__dirname, '..', 'data', 'i18n', 'xinfa.json');

const xinfa = JSON.parse(fs.readFileSync(xinfaPath, 'utf8'));
const kongfu = JSON.parse(fs.readFileSync(kongfuPath, 'utf8'));
// 名前は i18n が唯一源 (xinfa.json 本体の names は P3 で剥離済)
let xinfaNames = {};
try { xinfaNames = JSON.parse(fs.readFileSync(xinfaNamesPath, 'utf8')); } catch (e) {}

const validKongfuIds = new Set(
  Object.values(kongfu.kongfuMap || {}).map(v => Number(v.kongfuId))
);

const RANK_GLOBAL = { gold: 0.013, purple: 0.01, blue: 0.0065 };
const VISIBLE_KEYS = new Set([
  'minPhysATKAdd', 'maxPhysATKAdd', 'minPhysATK', 'maxPhysATK',
  'minBamboocut', 'maxBamboocut', 'minBellstrike', 'maxBellstrike',
  'minStonesplit', 'maxStonesplit', 'minSilkbind', 'maxSilkbind',
  'critRate', 'critRateAdj', 'sympathyRate', 'hitRate',
  'critBoost', 'addCritRate', 'addSympathyRate',
  'physDmgBoost', 'elemAtkBoost',
  'outerPenAdd', 'elemPenAdd', 'bamboocutPen', 'bellstrikePen',
  'stonesplitPen', 'silkbindPen',
]);
// hidden経路 (_hiddenAdditive merge) で calc.js が直接参照するキー
const HIDDEN_OK_KEYS = new Set([
  'globalDmgBoost', 'addSympathyRate', 'addCritRate',
  'outerPen', 'critBoost', 'physDmgBoost', 'elemAtkBoost',
  'sympathyBoost', 'allMartialBoost', 'specMartialBoost', 'bossBoost',
]);
// WWMキー (sidebar表示用) — hidden経路では calc.js が無視するため effects に書くべきでない
const FORBIDDEN_WWM_KEYS = new Set([
  'crit', 'affinity', 'precision', 'physDmgBonus', 'attrDmgBonus',
  'critDmgBonus', 'affinityDmgBonus', 'directCrit', 'directAffinity',
  'allWeaponDmg', 'bossDmg', 'playerUnitDmg', 'physPen', 'attrPen',
  'minPhys', 'maxPhys',
]);
const HIDDEN_TIERS = ['tier0', 'tier1', 'tier3', 'tier4', 'tier6'];

const errors = [];
const warnings = [];

function err(id, name, msg) { errors.push(`[ERR]  ${id} ${name}: ${msg}`); }
function warn(id, name, msg) { warnings.push(`[WARN] ${id} ${name}: ${msg}`); }

let total = 0;

for (const [id, e] of Object.entries(xinfa)) {
  if (id.startsWith('_') || !e || typeof e !== 'object') continue;
  if (!e.attributeBuff) continue;
  total++;
  const ja = xinfaNames[id]?.ja || '?';

  // rank
  if (!['gold', 'purple', 'blue'].includes(e.rank)) {
    err(id, ja, `rank "${e.rank}" 不正`);
    continue;
  }
  const expectedGlobal = RANK_GLOBAL[e.rank];

  // hidden tiers
  for (const t of HIDDEN_TIERS) {
    const b = e.attributeBuff[t];
    if (!b || !b.effects) continue;

    // globalDmgBoost rank整合
    if (typeof b.effects.globalDmgBoost === 'number') {
      const g = b.effects.globalDmgBoost;
      if (Math.abs(g - expectedGlobal) > 1e-9) {
        if (g < expectedGlobal) warn(id, ja, `${t} globalDmgBoost ${g} (rank ${e.rank} 標準 ${expectedGlobal}、意図的減量?)`);
        else err(id, ja, `${t} globalDmgBoost ${g} (rank ${e.rank} 標準 ${expectedGlobal} 超過)`);
      }
    }

    // hidden経路で実害ありkey検出
    for (const k of Object.keys(b.effects)) {
      if (HIDDEN_OK_KEYS.has(k)) continue;
      // visible系キーがhiddenに紛れ込んでいる → 計算反映0
      if (VISIBLE_KEYS.has(k)) {
        err(id, ja, `${t} hidden経路で "${k}" 使用 → calc.js未合流、計算反映0`);
      }
      // WWMキー (sidebar表示用) 混入 → hidden経路では無視される
      if (FORBIDDEN_WWM_KEYS.has(k)) {
        err(id, ja, `${t} WWMキー "${k}" 使用 → calc.js内部キーに書き換え必要 (hidden経路で無視)`);
      }
    }
  }

  // T2/T5 visible 経路: WWMキー混入チェック (こちらは _accMapped で変換されるが念のため警告)
  for (const t of ['tier2', 'tier5']) {
    const b = e.attributeBuff[t];
    if (!b || !b.effects) continue;
    for (const k of Object.keys(b.effects)) {
      if (FORBIDDEN_WWM_KEYS.has(k)) {
        warn(id, ja, `${t} visible経路で WWMキー "${k}" 直接使用 → calc.js内部キー推奨`);
      }
    }
  }

  // kongfuRequired/synergyKongfu ID存在
  for (const [t, b] of Object.entries(e.attributeBuff)) {
    if (!b) continue;
    const kfReq = Array.isArray(b.kongfuRequired) ? b.kongfuRequired : [];
    const synKf = Array.isArray(b.synergyKongfu) ? b.synergyKongfu : [];
    for (const k of [...kfReq, ...synKf]) {
      if (!validKongfuIds.has(Number(k))) {
        warn(id, ja, `${t} kongfu ID ${k} が kongfu_derived.json に未定義`);
      }
    }
  }
}

console.log(`\n=== xinfa.json validation ===`);
console.log(`総心法数: ${total}`);
console.log(`Errors: ${errors.length}, Warnings: ${warnings.length}\n`);
errors.forEach(e => console.log(e));
warnings.forEach(w => console.log(w));
console.log('');

process.exit(errors.length > 0 ? 1 : 0);
