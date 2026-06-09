// data/{kongfu,xinfa,sets}.json から names フィールドを {id: {ja,en,zh,ko}} 形に抽出。
// 元 file は不変 (P3 で剥離予定)。 出力 = data/i18n/{kongfu,xinfa,sets}.json
// 実装 plan: docs/superpowers/plans/2026-06-09-i18n-unification.md Task 2
const fs = require('node:fs');
const path = require('node:path');

const DATA = path.join(__dirname, '..', 'data');
const OUT = path.join(DATA, 'i18n');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

function extract(srcFile, outFile) {
  const src = JSON.parse(fs.readFileSync(path.join(DATA, srcFile), 'utf8'));
  const out = {};
  for (const [id, def] of Object.entries(src)) {
    if (id.startsWith('_')) continue; // _schema 等 skip
    if (!def || typeof def !== 'object' || !def.names) continue;
    out[id] = def.names;
  }
  fs.writeFileSync(path.join(OUT, outFile), JSON.stringify(out, null, 2) + '\n');
  console.log(srcFile + ' -> i18n/' + outFile + ' (' + Object.keys(out).length + ' entries)');
}

// sets.json は 2 階層 (weaponSets / bowSets / defensiveSets → id → names)。
// DataStore.name('sets', id) で引けるよう全カテゴリ統合。 id 衝突は abort (新規追加時の安全弁)。
function extractSets() {
  const src = JSON.parse(fs.readFileSync(path.join(DATA, 'sets.json'), 'utf8'));
  const out = {};
  for (const [cat, group] of Object.entries(src)) {
    if (cat.startsWith('_')) continue;
    if (!group || typeof group !== 'object') continue;
    for (const [id, def] of Object.entries(group)) {
      if (!def || !def.names) continue;
      if (out[id]) throw new Error('sets.json id collision: ' + id + ' (cat=' + cat + ')');
      out[id] = def.names;
    }
  }
  fs.writeFileSync(path.join(OUT, 'sets.json'), JSON.stringify(out, null, 2) + '\n');
  console.log('sets.json -> i18n/sets.json (' + Object.keys(out).length + ' entries, merged from weaponSets/bowSets/defensiveSets)');
}

// stat: stat_labels.json の ja/en/zh/ko ステ列 → {key: {ja,en,zh,ko}} 転置
function extractStat() {
  const src = JSON.parse(fs.readFileSync(path.join(DATA, 'stat_labels.json'), 'utf8'));
  const langs = ['ja', 'en', 'zh', 'ko'];
  const out = {};
  for (const lang of langs) {
    const dict = src[lang] || {};
    for (const [key, val] of Object.entries(dict)) {
      if (!out[key]) out[key] = {};
      out[key][lang] = val;
    }
  }
  fs.writeFileSync(path.join(OUT, 'stat.json'), JSON.stringify(out, null, 2) + '\n');
  console.log('stat_labels.json -> i18n/stat.json (' + Object.keys(out).length + ' entries)');
}

// path: lexicon.json から pathBase + affix を統合形で出力
function extractPath() {
  const src = JSON.parse(fs.readFileSync(path.join(DATA, 'lexicon.json'), 'utf8'));
  const out = {
    pathBase: src.pathBase || {},
    affix: src.affix || {}
  };
  fs.writeFileSync(path.join(OUT, 'path.json'), JSON.stringify(out, null, 2) + '\n');
  console.log('lexicon.json -> i18n/path.json (pathBase=' + Object.keys(out.pathBase).length + ', affix=' + Object.keys(out.affix).length + ')');
}

// skilltype + weapontype: stash@{0} の lexicon 追加分を直書き (元 stash と一致)
function writeSkillType() {
  const skillType = {
    martial:     { ja: '武術技', en: 'Q', zh: '武学技', ko: '무술 스킬' },
    charged:     { ja: '溜め技', en: 'Ch', zh: '蓄力技', ko: '차지 스킬' },
    special:     { ja: '特殊技', en: 'Sp', zh: '特殊技', ko: '특수 스킬' },
    drone:       { ja: '特殊技', en: 'Drone', zh: '特殊技', ko: '특수 스킬' },
    light:       { ja: '軽撃', en: 'LA', zh: '强效轻击', ko: '강력한 약 공격' },
    rodent:      { ja: '鼠', en: 'Rodent', zh: '鼠鼠', ko: '쥐 기술' },
    shield:      { ja: 'シールド効果', en: 'Shield', zh: '护盾增效', ko: '보호막 효과' },
    healing:     { ja: '重撃回復量', en: 'Heal', zh: '重击回复', ko: '중격 회복' },
    bleed:       { ja: '流血', en: 'Bleed', zh: '流血', ko: '출혈' },
    variedCombo: { ja: '軽重撃派生', en: 'LA/HC', zh: '轻重击派生', ko: '경중격 파생' }
  };
  fs.writeFileSync(path.join(OUT, 'skilltype.json'), JSON.stringify(skillType, null, 2) + '\n');
  console.log('hardcoded -> i18n/skilltype.json (' + Object.keys(skillType).length + ' entries)');
}

function writeWeaponType() {
  const weaponType = {
    sword:       { ja: '剣', en: 'Sword', zh: '剑', ko: '검' },
    spear:       { ja: '槍', en: 'Spear', zh: '枪', ko: '창' },
    fan:         { ja: '扇', en: 'Fan', zh: '扇', ko: '부채' },
    umbrella:    { ja: '傘', en: 'Umbrella', zh: '伞', ko: '우산' },
    mo_blade:    { ja: '刀', en: 'Blade', zh: '刀', ko: '도' },
    dual_blades: { ja: '双刃', en: 'Twinblades', zh: '双刃', ko: '쌍검' },
    new_blade:   { ja: '刀', en: 'Blade', zh: '刀', ko: '도' },
    rope_dart:   { ja: '縄鏢', en: 'Rope Dart', zh: '绳镖', ko: '승표' },
    gauntlet:    { ja: '手甲', en: 'Gauntlet', zh: '拳套', ko: '권갑' }
  };
  fs.writeFileSync(path.join(OUT, 'weapontype.json'), JSON.stringify(weaponType, null, 2) + '\n');
  console.log('hardcoded -> i18n/weapontype.json (' + Object.keys(weaponType).length + ' entries)');
}

// ui: i18n.js TRANSLATIONS 抽出 (静的 parse 不可 → eval で抜く)
// eslint-disable-next-line no-eval -- 自プロジェクト管理下の static asset から TRANSLATIONS 定数を抽出するための限定 eval。 外部入力は一切受けない。
function extractUI() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'i18n.js'), 'utf8');
  // 'const TRANSLATIONS = {...};' 区間を抽出。 巨大 object → greedy match で末尾の }; まで取る。
  const m = src.match(/const TRANSLATIONS\s*=\s*(\{[\s\S]+?\n\});/);
  if (!m) throw new Error('TRANSLATIONS not found in i18n.js');
  // eslint-disable-next-line no-eval -- 上記コメント参照。
  const TRANSLATIONS = eval('(' + m[1] + ')');
  const langs = ['ja', 'en', 'zh', 'ko'];
  const out = {};
  for (const lang of langs) {
    for (const [key, val] of Object.entries(TRANSLATIONS[lang] || {})) {
      if (!out[key]) out[key] = {};
      out[key][lang] = val;
    }
  }
  fs.writeFileSync(path.join(OUT, 'ui.json'), JSON.stringify(out, null, 2) + '\n');
  console.log('i18n.js TRANSLATIONS -> i18n/ui.json (' + Object.keys(out).length + ' keys x 4 lang)');
}

extract('kongfu.json', 'kongfu.json');
extract('xinfa.json', 'xinfa.json');
extractSets();
extractStat();
extractPath();
writeSkillType();
writeWeaponType();
extractUI();
