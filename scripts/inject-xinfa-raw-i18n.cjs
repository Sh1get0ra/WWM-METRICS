// xinfa.json rawI18n に en/zh/ko 翻訳注入 (P0: Tier 効果 全言語死亡対策、 2026-06-10)。
// 入力 = tmp-xinfa-i18n/batch-*.json ({ "id/tierN": { en, zh, ko } })。
// 既存 rawI18n.vi は保持。 全 336 entry 充填後に raw → rawI18n.ja 移行は migrate-xinfa-raw.cjs で別途。
const fs = require('fs');
const path = require('path');

const XINFA = path.join(__dirname, '..', 'data', 'xinfa.json');
const BATCH_DIR = path.join(__dirname, '..', 'tmp-xinfa-i18n');

const x = JSON.parse(fs.readFileSync(XINFA, 'utf8'));
const batches = fs.readdirSync(BATCH_DIR).filter(f => /^batch-.*\.json$/.test(f)).sort();
if (!batches.length) { console.error('no batch files'); process.exit(1); }

const map = {};
for (const f of batches) {
  const b = JSON.parse(fs.readFileSync(path.join(BATCH_DIR, f), 'utf8'));
  for (const [k, v] of Object.entries(b)) {
    if (map[k]) { console.error('DUP key across batches: ' + k); process.exit(1); }
    map[k] = v;
  }
}

let injected = 0, missing = [];
for (const id of Object.keys(x)) {
  if (id === '_example') continue;
  const ab = x[id].attributeBuff || {};
  for (const tk of Object.keys(ab)) {
    if (!/^tier\d$/.test(tk)) continue;
    const t = ab[tk];
    if (typeof t.raw !== 'string' || !t.raw.trim()) continue;
    const key = id + '/' + tk;
    const tr = map[key];
    if (!tr) { missing.push(key); continue; }
    for (const lang of ['en', 'zh', 'ko']) {
      if (typeof tr[lang] !== 'string' || !tr[lang].trim()) { console.error('EMPTY ' + lang + ' for ' + key); process.exit(1); }
    }
    if (!t.rawI18n) t.rawI18n = {};
    t.rawI18n.en = tr.en;
    t.rawI18n.zh = tr.zh;
    t.rawI18n.ko = tr.ko;
    injected++;
    delete map[key];
  }
}

const orphans = Object.keys(map);
console.log('injected:', injected, '| missing (xinfa has raw, batch none):', missing.length, '| orphans (batch key not in xinfa):', orphans.length);
if (missing.length) console.log('missing:', missing.join(', '));
if (orphans.length) console.log('orphans:', orphans.join(', '));
if (orphans.length) process.exit(1);

fs.writeFileSync(XINFA, JSON.stringify(x, null, 2) + '\n', 'utf8');
console.log('written:', XINFA);
