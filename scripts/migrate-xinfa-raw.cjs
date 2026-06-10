// xinfa.json raw → rawI18n.ja 移行 (P0 Phase 3: 重複除去、 2026-06-10)。
// 前提 = inject-xinfa-raw-i18n.cjs で en/zh/ko 充填済 + vi 既存。
// 結果 = rawI18n {ja,en,zh,ko,vi} 5 言語完備、 raw フィールド消滅。
const fs = require('fs');
const path = require('path');

const XINFA = path.join(__dirname, '..', 'data', 'xinfa.json');
const x = JSON.parse(fs.readFileSync(XINFA, 'utf8'));

const LANGS = ['ja', 'en', 'zh', 'ko', 'vi'];
let migrated = 0;
const errors = [];
for (const id of Object.keys(x)) {
  if (id === '_example') continue;
  const ab = x[id].attributeBuff || {};
  for (const tk of Object.keys(ab)) {
    if (!/^tier\d$/.test(tk)) continue;
    const t = ab[tk];
    if (typeof t.raw !== 'string' || !t.raw.trim()) continue;
    if (!t.rawI18n) t.rawI18n = {};
    // ja を先頭に並べ直し (可読性のみ、 機能差なし)
    const merged = { ja: t.raw, en: t.rawI18n.en, zh: t.rawI18n.zh, ko: t.rawI18n.ko, vi: t.rawI18n.vi };
    for (const lang of LANGS) {
      if (typeof merged[lang] !== 'string' || !merged[lang].trim()) errors.push(id + '/' + tk + ' missing ' + lang);
    }
    t.rawI18n = merged;
    delete t.raw;
    migrated++;
  }
}

if (errors.length) { console.error('INCOMPLETE rawI18n:\n' + errors.join('\n')); process.exit(1); }
fs.writeFileSync(XINFA, JSON.stringify(x, null, 2) + '\n', 'utf8');
console.log('migrated raw → rawI18n.ja:', migrated, 'entries, all 5 langs verified');
