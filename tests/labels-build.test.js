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

// build-labels.js を eval load (vanilla window グローバル script を node で取り出す)
function loadBuildLabels() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'assets', 'build-labels.js'), 'utf8');
  const win = {};
  globalThis.window = win;
  (0, eval)(code);
  delete globalThis.window;
  return win.WWMBuildLabels;
}
const buildLabels = loadBuildLabels();

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

test('buildLabels: path系 import dict 形式を全 path × 全言語で生成', () => {
  const out = buildLabels({ lexicon });
  assert.equal(out.ja.minBellstrike, '最小鋼鳴攻撃');
  assert.equal(out.ja.maxBellstrike, '最大鋼鳴攻撃');
  assert.equal(out.ja.bellstrikePen, '鋼鳴貫通');
  assert.equal(out.zh.minBellstrike, '最小鸣金攻击');
  assert.equal(out.ko.bellstrikePen, '명금 관통');
  assert.equal(out.en.maxVoid, 'Max Void ATK');
});

test('buildLabels: i18n T() 形式 (path<Path> / pathAtk* / pathPen* / pathDmg*)', () => {
  const out = buildLabels({ lexicon });
  assert.equal(out.ja._i18n.pathBellstrike, '鋼鳴');
  assert.equal(out.ja._i18n.pathAtkBellstrike, '鋼鳴攻撃');
  assert.equal(out.ja._i18n.pathPenBellstrike, '鋼鳴貫通');
  assert.equal(out.ja._i18n.pathDmgBellstrike, '鋼鳴ダメージ強化');
});

test('buildLabels: stat_display 形式 (語尾「力」)', () => {
  const out = buildLabels({ lexicon });
  assert.equal(out.ja._statDisplay.bellstrike, '鋼鳴攻撃力');
  assert.equal(out.ko._statDisplay.bellstrike, '명금 공격');
});
