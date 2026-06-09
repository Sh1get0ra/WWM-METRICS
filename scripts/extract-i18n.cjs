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

extract('kongfu.json', 'kongfu.json');
extract('xinfa.json', 'xinfa.json');
extractSets();
