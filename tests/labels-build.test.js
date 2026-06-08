// 名称ラベル合成 回帰テスト: node --test tests/labels-build.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const lexicon = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'lexicon.json'), 'utf8'));
const LANGS = ['ja', 'en', 'zh', 'ko'];
const PATHS = ['bellstrike', 'stonesplit', 'silkbind', 'bamboocut', 'void'];

test('lexicon.pathBase: 全 path × 全言語 が埋まっている', () => {
  for (const p of PATHS) {
    assert.ok(lexicon.pathBase[p], `pathBase.${p} 欠落`);
    for (const L of LANGS) {
      assert.ok(lexicon.pathBase[p][L], `pathBase.${p}.${L} 欠落`);
    }
  }
});

test('lexicon.affix: min/max/atk/atkStat/pen/dmgUp が全言語埋まっている', () => {
  for (const k of ['min', 'max', 'atk', 'atkStat', 'pen', 'dmgUp']) {
    assert.ok(lexicon.affix[k], `affix.${k} 欠落`);
    for (const L of LANGS) {
      assert.ok(lexicon.affix[k][L], `affix.${k}.${L} 欠落`);
    }
  }
});
