// xinfa.json rawI18n.vi に手訳 vi 注入。
// 入力 = tmp-vi-batch.json: { "<心法id>": { "tierN": "<vi 訳>" } }
// 注入規則 = 値が空でない場合のみ rawI18n.vi に書込。 既存 vi 上書き許可 (兄貴手訳が必ず最新)。
const fs = require('fs');
const PATH = 'data/xinfa.json';
const BATCH = process.argv[2] || 'tmp-vi-batch.json';
const x = JSON.parse(fs.readFileSync(PATH, 'utf8'));
const batch = JSON.parse(fs.readFileSync(BATCH, 'utf8'));

let updated = 0, skipped = 0, missing = [];
for (const [id, tiers] of Object.entries(batch)) {
  const e = x[id];
  if (!e?.attributeBuff) { missing.push(id + ' (no attributeBuff)'); continue; }
  for (const [tk, vi] of Object.entries(tiers)) {
    const t = e.attributeBuff[tk];
    if (!t) { missing.push(id + '.' + tk + ' (no tier)'); continue; }
    if (typeof t.raw !== 'string' || !t.raw.trim()) { skipped++; continue; }
    if (typeof vi !== 'string' || !vi.trim()) { skipped++; continue; }
    if (!t.rawI18n) t.rawI18n = {};
    t.rawI18n.vi = vi;
    updated++;
  }
}

fs.writeFileSync(PATH, JSON.stringify(x, null, 2) + '\n');
console.log(`vi handcraft inject: updated=${updated}, skipped=${skipped}, missing=${missing.length}`);
if (missing.length) console.log('  MISSING:', missing.join(', '));
