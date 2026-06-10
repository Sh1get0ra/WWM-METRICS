// DataStore (assets/data-store.js) 単体テスト。
// node 環境で window stub に expose されるか + ready() 冪等を確認。
// Task 4/5 で name()/t() のテストを追記する。
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'assets', 'data-store.js'), 'utf8');

// eval スコープ汚染回避のため独立関数内で評価。 const window 等の宣言を呼出側に漏らさない。
function evalDataStore() {
  // eslint-disable-next-line no-eval -- test harness 専用。 自プロジェクト管理下の static asset を node 環境に流し込み、
  // ブラウザ IIFE が global.window stub に expose する挙動を検証。 外部入力/動的式は一切評価しない。
  eval(SRC);
}

(async () => {
  // ── Task 1: 骨格テスト ────────────────────────────────────
  global.window = {};
  global.fetch = async () => ({ ok: true, json: async () => ({}) });
  evalDataStore();

  assert.ok(global.window.WWM_DS, 'WWM_DS exposed');
  assert.equal(typeof global.window.WWM_DS.ready, 'function', 'ready() exists');
  const p = global.window.WWM_DS.ready();
  assert.ok(p && typeof p.then === 'function', 'ready() returns Promise');
  await p;
  // 冪等 (2度目以降は同 Promise 返す)
  assert.strictEqual(global.window.WWM_DS.ready(), global.window.WWM_DS.ready(), 'ready() idempotent');

  console.log('PASS: data-store skeleton');

  // ── Task 4: name() 実装テスト ───────────────────────────────
  // fetch stub を実 file 読みに切替 + WWM_KONGFU stub (weaponType lookup 用)
  const DATA = path.join(__dirname, '..', 'data', 'i18n');
  global.fetch = async (url) => {
    const m = url.match(/data\/i18n\/(\w+)\.json/);
    if (!m) throw new Error('unexpected fetch ' + url);
    const file = path.join(DATA, m[1] + '.json');
    if (!fs.existsSync(file)) return { ok: false, status: 404 };
    return { ok: true, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) };
  };
  // window 新規にして再 eval (新 IIFE が新 closure で WWM_DS 再代入)
  global.window = {};
  global.window.WWM_KONGFU = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'kongfu.json'), 'utf8'));
  evalDataStore();
  const DS = global.window.WWM_DS;
  await DS.ready();

  // (a) 単純取得 (kongfu 武術 本体名)
  assert.equal(DS.name('kongfu', 10101, 'ja'), '九変の剣', 'kongfu ja');
  assert.equal(DS.name('kongfu', 10101, 'en'), 'Strategic Sword', 'kongfu en');

  // (b) setLang 後 デフォルト lang 適用
  DS.setLang('zh');
  assert.equal(DS.name('kongfu', 10101), '积矩九剑', 'kongfu lang from setLang');

  // (c) fallback: 不在 id → [cat:id]
  assert.equal(DS.name('kongfu', 99999, 'ja'), '[kongfu:99999]', 'unknown id → bracket id');

  // (d) 武術名 affix 合成 (martial-affix cat, key=swordQ)
  DS.setLang('ja');
  assert.equal(DS.name('martial-affix', 'swordQ'), '九変の剣 武術技', 'martial-affix synth ja');
  DS.setLang('en');
  assert.equal(DS.name('martial-affix', 'swordQ'), 'Strategic Q', 'martial-affix synth en (weapon strip)');

  console.log('PASS: data-store name()');

  // ── Task 5: t() 委譲テスト ─────────────────────────────────
  DS.setLang('ja');
  assert.equal(DS.t('importBtn'), 'IMPORT', 't() ja');
  DS.setLang('en');
  assert.equal(DS.t('importBtn'), 'IMPORT', 't() en');
  DS.setLang('zh');
  const ui = JSON.parse(fs.readFileSync(path.join(DATA, 'ui.json'), 'utf8'));
  assert.equal(DS.t('importBtn'), ui.importBtn.zh, 't() zh');
  // 不在 key → key 文字列 そのまま (旧 i18n.js T() 互換)
  assert.equal(DS.t('NONEXISTENT_KEY'), 'NONEXISTENT_KEY', 't() unknown key passthrough');
  console.log('PASS: data-store t()');

  // ── game_lexicon fallback (2026-06-10: ui.json から純粋ゲーム用語を分離) ──
  DS.setLang('ja');
  assert.equal(DS.t('critRate'), '会心率', 't() game_lexicon ja (ui miss → game_lexicon)');
  assert.equal(DS.t('slotHelm'), '冠', 't() game_lexicon slot ja');
  DS.setLang('en');
  assert.equal(DS.t('critRate'), 'Critical Rate', 't() game_lexicon en');
  // stat.json 経由 (chain 3段目): xinfa.js tkey 'minPhys'/'maxPhys' = 新表記 (最小/最大外功攻撃)
  DS.setLang('ja');
  assert.equal(DS.t('minPhys'), '最小外功攻撃', 't() stat chain minPhys ja');
  assert.equal(DS.t('maxPhys'), '最大外功攻撃', 't() stat chain maxPhys ja');
  // ui優先: importBtn は ui.json 残置 → ui.json が勝つ
  assert.equal(DS.t('importBtn'), 'IMPORT', 't() ui優先 (ui.json に居る間は game_lexicon fallback 走らない)');
  console.log('PASS: data-store game_lexicon fallback');

  // ── Task 9-2: path系 i18n 合成 (旧 build-labels.js applyPathLabels(1) 役割) ──
  DS.setLang('ja');
  assert.equal(DS.t('pathBellstrike'), '鋼鳴', 'path<Path> ja');
  assert.equal(DS.t('pathAtkBellstrike'), '鋼鳴攻撃', 'pathAtk<Path> ja');
  assert.equal(DS.t('pathPenBellstrike'), '鋼鳴貫通', 'pathPen<Path> ja');
  // ranking.js 「調律/定音効率分析」 が引く形式 (min<Path> / max<Path>)
  assert.equal(DS.t('minBamboocut'), '最小瞬嵐攻撃', 'min<Path> ja');
  assert.equal(DS.t('maxBamboocut'), '最大瞬嵐攻撃', 'max<Path> ja');
  assert.equal(DS.t('minVoid'),       '最小無相攻撃', 'min<Path> void ja');
  DS.setLang('en');
  assert.equal(DS.t('pathAtkBellstrike'), 'Bellstrike', 'pathAtk<Path> en (affix.atk en = "")');
  console.log('PASS: data-store path i18n synth');

  // ── Task 9-4: path-statdisplay (旧 build-labels.js _statDisplay) ──
  DS.setLang('ja');
  assert.equal(DS.name('path-statdisplay', 'void', 'ja'), '無相攻撃力', 'path-statdisplay void ja');
  assert.equal(DS.name('path-statdisplay', 'bellstrike', 'ja'), '鋼鳴攻撃力', 'path-statdisplay bellstrike ja');
  assert.equal(DS.name('path-statdisplay', 'void', 'en'), 'Void ATK', 'path-statdisplay void en');
  assert.equal(DS.name('path-statdisplay', 'unknown', 'ja'), '[path-statdisplay:unknown]', 'path-statdisplay unknown');
  console.log('PASS: data-store path-statdisplay');
})().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
