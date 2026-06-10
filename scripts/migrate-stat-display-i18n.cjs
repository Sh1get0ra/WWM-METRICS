// stat_display.json から label object を平坦化して data/i18n/stat_display.json に外出し。
// stat_display.json は label_key (string 参照) のみ残す。 callsite は DataStore.t() 経由化。
// key 命名: header.title = 'stDisp.header.title' / sections[N] (key=K) .title = 'stDisp.section.<K>.title'
//          items (key=I) .label = 'stDisp.<K>.<I>' / subItems (key=S) .label = 'stDisp.<K>.<I>.<S>'
const fs = require('fs');

const SRC = 'data/stat_display.json';
const I18N_OUT = 'data/i18n/stat_display.json';

const sd = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const i18n = {};

function record(key, labelObj) {
  if (i18n[key]) throw new Error('key collision: ' + key);
  i18n[key] = labelObj;
}

// header.title
if (sd.header?.title) {
  record('stDisp.header.title', sd.header.title);
  sd.header.label_key = 'stDisp.header.title';
  delete sd.header.title;
}

for (const sec of (sd.sections || [])) {
  const K = sec.key;
  if (sec.title) {
    const tk = 'stDisp.section.' + K + '.title';
    record(tk, sec.title);
    sec.label_key_title = tk;
    delete sec.title;
  }
  for (const it of (sec.items || [])) {
    const I = it.key;
    if (it.label) {
      const tk = 'stDisp.' + K + '.' + I;
      record(tk, it.label);
      it.label_key = tk;
      delete it.label;
    }
    for (const sub of (it.subItems || [])) {
      const S = sub.key;
      if (sub.label) {
        const tk = 'stDisp.' + K + '.' + I + '.' + S;
        record(tk, sub.label);
        sub.label_key = tk;
        delete sub.label;
      }
    }
  }
}

fs.writeFileSync(I18N_OUT, JSON.stringify(i18n, null, 2) + '\n');
fs.writeFileSync(SRC, JSON.stringify(sd, null, 2) + '\n');
console.log('migrated:', Object.keys(i18n).length, 'labels →', I18N_OUT);
