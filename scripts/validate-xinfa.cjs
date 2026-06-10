#!/usr/bin/env node
// xinfa.json validator
// 検証項目:
//  - rank: gold/purple/blue のいずれか
//  - T0/T1/T3/T4/T6 effects.globalDmgBoost: rank別固定値 (gold=0.013/purple=0.01/blue=0.0065)
//  - hidden経路 (_hiddenAdditive merge) の effects key が calc.js で実際に消費されるか
//  - T2/T5 visible経路への WWM display key 混入
//  - kongfuRequired/synergyKongfu: kongfu_derived.json存在チェック
//  - i18n coverage: data/i18n/xinfa.json に 4言語 (ja/en/zh/ko) 完備か
//
// statKey 真実源 (二重管理しない、 ハードコピー禁止 — 2026-06-10 癒着解消):
//  - calc.js 消費 key = assets/calc.js source の `p.<key>` 参照を機械抽出
//  - WWM display key = assets/stats.js source の `_CALCJS_TO_WWM` dict literal を機械抽出
//  calc.js / stats.js を変更すれば validator は自動追従する。
// 使用: node scripts/validate-xinfa.cjs

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const xinfaPath = path.join(ROOT, 'data', 'xinfa.json');
const kongfuPath = path.join(ROOT, 'data', 'kongfu_derived.json');
const xinfaNamesPath = path.join(ROOT, 'data', 'i18n', 'xinfa.json');
const calcPath = path.join(ROOT, 'assets', 'calc.js');
const statsPath = path.join(ROOT, 'assets', 'stats.js');

const xinfa = JSON.parse(fs.readFileSync(xinfaPath, 'utf8'));
const kongfu = JSON.parse(fs.readFileSync(kongfuPath, 'utf8'));
// 名前は i18n が唯一源 (xinfa.json 本体の names は P3 で剥離済)
const xinfaNames = JSON.parse(fs.readFileSync(xinfaNamesPath, 'utf8'));

// ── calc.js 消費 key 抽出 (`p.<ident>` 参照 = _hiddenAdditive merge 後に効く key) ──
function extractCalcConsumedKeys() {
  let src = fs.readFileSync(calcPath, 'utf8');
  // コメント除去 (コメント内の p.xxx 例示を誤検出しない)
  src = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const keys = new Set();
  for (const m of src.matchAll(/\bp\.([A-Za-z_$][\w$]*)/g)) keys.add(m[1]);
  keys.delete('_hiddenAdditive'); // merge 機構自体
  if (keys.size < 20) throw new Error(`calc.js 消費key抽出が ${keys.size} 件のみ — calc.js の構造変化を疑え (p.<key> パターン崩れ)`);
  return keys;
}

// ── stats.js _CALCJS_TO_WWM dict 抽出 (calc内部key → WWM display key) ──
function extractCalcjsToWwm() {
  const src = fs.readFileSync(statsPath, 'utf8');
  const m = src.match(/const _CALCJS_TO_WWM = \{([\s\S]*?)\};/);
  if (!m) throw new Error('stats.js から _CALCJS_TO_WWM dict を抽出できない — stats.js の構造変化を疑え');
  const dict = {};
  for (const e of m[1].matchAll(/([A-Za-z_$][\w$]*)\s*:\s*'([^']+)'/g)) dict[e[1]] = e[2];
  if (Object.keys(dict).length < 10) throw new Error(`_CALCJS_TO_WWM 抽出が ${Object.keys(dict).length} 件のみ — dict literal 形式変化を疑え`);
  return dict;
}

const CALC_CONSUMED = extractCalcConsumedKeys();
const CALCJS_TO_WWM = extractCalcjsToWwm();
const WWM_DISPLAY_KEYS = new Set(Object.values(CALCJS_TO_WWM));
const VISIBLE_MAPPED_KEYS = new Set(Object.keys(CALCJS_TO_WWM)); // visible経路で WWM key へ変換される入力 key

const validKongfuIds = new Set(
  Object.values(kongfu.kongfuMap || {}).map(v => Number(v.kongfuId))
);

const RANK_GLOBAL = { gold: 0.013, purple: 0.01, blue: 0.0065 };
const HIDDEN_TIERS = ['tier0', 'tier1', 'tier3', 'tier4', 'tier6'];
const LANGS = ['ja', 'en', 'zh', 'ko'];

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

  // i18n coverage (4言語 完備)
  if (!xinfaNames[id]) {
    err(id, ja, `data/i18n/xinfa.json に entry 無し`);
  } else {
    const missing = LANGS.filter(L => !xinfaNames[id][L]);
    if (missing.length) warn(id, ja, `i18n 欠落言語: ${missing.join(',')}`);
  }

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

    // hidden経路: calc.js が読まない key = 計算反映0
    for (const k of Object.keys(b.effects)) {
      if (k === 'fixedScoreBonus') continue; // stats.js 専用処理 (calc.js では p._fixedScoreBonus)
      if (CALC_CONSUMED.has(k)) continue;
      if (WWM_DISPLAY_KEYS.has(k)) {
        err(id, ja, `${t} WWM表示キー "${k}" → calc.js内部キー (${Object.keys(CALCJS_TO_WWM).find(c => CALCJS_TO_WWM[c] === k) || '?'}) に書き換え必要 (hidden経路で無視)`);
      } else if (VISIBLE_MAPPED_KEYS.has(k)) {
        err(id, ja, `${t} visible専用キー "${k}" → hidden経路では calc.js 未参照、計算反映0`);
      } else {
        err(id, ja, `${t} calc.js 未参照キー "${k}" → 計算反映0 (typo? 新keyなら calc.js 側実装が先)`);
      }
    }
  }

  // T2/T5 visible 経路: WWM display key 混入チェック (_accMapped は calc内部key 前提)
  for (const t of ['tier2', 'tier5']) {
    const b = e.attributeBuff[t];
    if (!b || !b.effects) continue;
    for (const k of Object.keys(b.effects)) {
      if (WWM_DISPLAY_KEYS.has(k)) {
        warn(id, ja, `${t} visible経路で WWM表示キー "${k}" 直接使用 → calc.js内部キー推奨`);
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

// i18n 側の孤児 entry (本体に無い id)
for (const id of Object.keys(xinfaNames)) {
  if (id.startsWith('_')) continue;
  if (!xinfa[id]) warn(id, xinfaNames[id]?.ja || '?', `i18n/xinfa.json のみに存在 (本体 xinfa.json に無い孤児 entry)`);
}

console.log(`\n=== xinfa.json validation ===`);
console.log(`総心法数: ${total}`);
console.log(`calc.js 消費key (機械抽出): ${CALC_CONSUMED.size} 件 / WWM表示key: ${WWM_DISPLAY_KEYS.size} 件`);
console.log(`Errors: ${errors.length}, Warnings: ${warnings.length}\n`);
errors.forEach(e => console.log(e));
warnings.forEach(w => console.log(w));
console.log('');

process.exit(errors.length > 0 ? 1 : 0);
