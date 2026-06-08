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

// build-labels.js を fake window に load し WWMApplyPathLabels を実行 (注入挙動の検証用)。
// applyPathLabels は global window を参照するため、eval〜呼出の間 globalThis.window を維持する。
function loadAndApply(win) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'assets', 'build-labels.js'), 'utf8');
  globalThis.window = win;
  try {
    (0, eval)(code);
    win.WWMApplyPathLabels();
  } finally {
    delete globalThis.window;
  }
  return win;
}

test('lexicon.pathBase: 全 path × 全言語 が埋まっている', () => {
  for (const p of PATHS) {
    assert.ok(lexicon.pathBase[p], `pathBase.${p} 欠落`);
    for (const L of LANGS) {
      assert.ok(lexicon.pathBase[p][L], `pathBase.${p}.${L} 欠落`);
    }
  }
});

test('lexicon.affix: min/max/atk/atkStat/pen/dmgUp が全言語 定義済 (空文字も可)', () => {
  for (const k of ['min', 'max', 'atk', 'atkStat', 'pen', 'dmgUp']) {
    assert.ok(lexicon.affix[k], `affix.${k} 欠落`);
    for (const L of LANGS) {
      // 空文字 (例 atk.en="" = ATKサフィックス無し) は意図的 → 存在 (string型) のみ検証
      assert.equal(typeof lexicon.affix[k][L], 'string', `affix.${k}.${L} 未定義`);
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
  assert.equal(out.en.maxVoid, 'Max Void');
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

test('buildLabels: i18n path dmg が i18n.js 現状訳と一致 (zh伤害加成 / ko피해증가)', () => {
  const out = buildLabels({ lexicon });
  assert.equal(out.zh._i18n.pathDmgBellstrike, '鸣金伤害加成');
  assert.equal(out.ko._i18n.pathDmgBellstrike, '명금 피해 증가');
  assert.equal(out.en._i18n.pathDmgBellstrike, 'Bellstrike DMG');
});

// 回帰: 合成 import dict path系 == 変換前 import.js (ja/zh/ko 厳密、en は略記廃止=新仕様)
// fixtures/path-labels-baseline.json = 変換前 (lexicon 合成化以前) の凍結スナップショット。
// import.js から path系静的定義を削除済 → poc/labels.json 再生成では取れないため独立 fixture を正とする。
test('合成 path系 == 変換前 import dict (ja/zh/ko 厳密、en 新仕様 full・ATKなし)', () => {
  const cur = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'path-labels-baseline.json'), 'utf8'));
  const out = buildLabels({ lexicon });
  const keys = [];
  for (const p of PATHS) {
    const C = p.charAt(0).toUpperCase() + p.slice(1);
    keys.push('min' + C, 'max' + C, p + 'Pen');
  }
  for (const L of ['ja', 'zh', 'ko']) {
    for (const k of keys) assert.equal(out[L][k], cur[L][k], `${L}.${k} 不一致`);
  }
  // en は略記 (Bell/Stone/Bam) 廃止で full化、min/max攻撃は ATK サフィックス無し (兄貴決定 2026-06-08)
  assert.equal(out.en.minBellstrike, 'Min Bellstrike');
  assert.equal(out.en.maxBamboocut, 'Max Bamboocut');
  assert.equal(out.en.voidPen, 'Void Pen');
});

// 回帰: WWMApplyPathLabels が i18n + import dict 両方へ注入 (保存ビルド経路の生キー fallback 再発防止)。
// 生キー fallback (例 'maxBamboocut' がそのまま表示) は import dict 未注入が原因 → 両テーブル注入を必須化。
test('WWMApplyPathLabels: i18n テーブル + import dict 両方へ path系を注入', () => {
  const win = {
    WWM_LEXICON: lexicon,
    WWM_I18N: { ja: {}, en: {}, zh: {}, ko: {} },
    _STAT_LABELS_I18N_ALL: { ja: {}, en: {}, zh: {}, ko: {} }
  };
  loadAndApply(win);
  // import dict 形式 (arsenal/ranking affix ラベル源) — 生キーでなく合成ラベルが入る
  assert.equal(win._STAT_LABELS_I18N_ALL.en.maxBamboocut, 'Max Bamboocut');
  assert.equal(win._STAT_LABELS_I18N_ALL.ja.minBellstrike, '最小鋼鳴攻撃');
  assert.equal(win._STAT_LABELS_I18N_ALL.ko.voidPen, '무상 관통');
  // import dict にメタキー (_i18n/_statDisplay) は混入しない
  assert.equal(win._STAT_LABELS_I18N_ALL.ja._i18n, undefined);
  // i18n T() 形式
  assert.equal(win.WWM_I18N.ja.pathAtkBellstrike, '鋼鳴攻撃');
  assert.equal(win.WWM_I18N.en.pathBellstrike, 'Bellstrike');
});

// 回帰: import dict 未公開でも i18n だけは注入される (片方欠落で全滅しない)
test('WWMApplyPathLabels: _STAT_LABELS_I18N_ALL 欠落時も i18n は注入', () => {
  const win = { WWM_LEXICON: lexicon, WWM_I18N: { ja: {} } };
  loadAndApply(win);
  assert.equal(win.WWM_I18N.ja.pathBellstrike, '鋼鳴');
});
