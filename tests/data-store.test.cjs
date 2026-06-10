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
  const DATA_ROOT = path.join(__dirname, '..', 'data');
  global.fetch = async (url) => {
    // i18n + 計算 dict (ensureCalcData、 P4-mini 供給一元化) 両対応
    const m = url.match(/data\/i18n\/(\w+)\.json/);
    const mc = m ? null : url.match(/data\/(\w+)\.json/);
    if (!m && !mc) throw new Error('unexpected fetch ' + url);
    const file = m ? path.join(DATA, m[1] + '.json') : path.join(DATA_ROOT, mc[1] + '.json');
    if (!fs.existsSync(file)) return { ok: false, status: 404 };
    return { ok: true, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) };
  };
  // window 新規にして再 eval (新 IIFE が新 closure で WWM_DS 再代入)
  global.window = {};
  global.window.WWM_KONGFU = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'kongfu.json'), 'utf8'));
  evalDataStore();
  const DS = global.window.WWM_DS;
  await DS.ready();

  // ── P4-mini: 計算 dict 供給 (ready() が window.WWM_* を充填) ──
  assert.ok(global.window.WWM_AFFIX && Object.keys(global.window.WWM_AFFIX).length > 0, 'WWM_AFFIX supplied by DataStore');
  assert.ok(global.window.WWM_SETS && global.window.WWM_SETS.weaponSets, 'WWM_SETS supplied by DataStore');
  assert.ok(global.window.WWM_KONGFU['10101'], 'WWM_KONGFU preloaded stub respected');
  assert.strictEqual(DS.ensureCalcData(), DS.ensureCalcData(), 'ensureCalcData idempotent');
  console.log('PASS: data-store calc dict supply');

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

  // (e) martial-affix 合成不能 key → bracket miss (TODO 25: stat fallback 死路撤去後の挙動)
  assert.equal(DS.name('martial-affix', 'notAMartialKey', 'ja'), '[martial-affix:notAMartialKey]', 'martial-affix miss → bracket');

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
  assert.equal(DS.t('slotHelm'), '冠', 't() game_lexicon slot ja');
  DS.setLang('en');
  assert.equal(DS.t('slotHelm'), 'Helm', 't() game_lexicon slot en');
  // stat.json 経由 (chain 3段目): xinfa.js tkey 'minPhys'/'maxPhys' = 新表記 (最小/最大外功攻撃)
  DS.setLang('ja');
  assert.equal(DS.t('minPhys'), '最小外功攻撃', 't() stat chain minPhys ja');
  assert.equal(DS.t('maxPhys'), '最大外功攻撃', 't() stat chain maxPhys ja');
  // 心法効果ラベル 統合 (game_lex 11 件 stat 化、 2026-06-10)
  assert.equal(DS.t('crit'),         '会心率', 't() stat crit ja (←旧 critRate)');
  assert.equal(DS.t('affinity'),     '会意率', 't() stat affinity ja (←旧 sympathyRate)');
  assert.equal(DS.t('physPen'),      '外功貫通', 't() stat physPen ja (←旧 penPhys/outerPen)');
  assert.equal(DS.t('bossDmg'),      'BOSSダメージ', 't() stat bossDmg ja (←旧 bossBoost)');
  assert.equal(DS.t('maxHp'),        '気血最大値', 't() stat maxHp ja (←旧 stMaxHp)');
  assert.equal(DS.t('physDef'),      '外功防御', 't() stat physDef ja (←旧 stPhysDef)');
  assert.equal(DS.t('allWeaponDmg'), '全武学/PvP/BOSSダメ', 't() stat allWeaponDmg ja (←旧 allMartialBoost)');
  // path 合成統合 (旧 game_lex.penVoid → pathPenVoid)
  assert.equal(DS.t('pathPenVoid'),  '無相貫通', 't() path合成 pathPenVoid ja (←旧 penVoid)');
  // 2026-06-10 stat 移管 (game_lex → stat、 名 不変 で callsite 不変):
  assert.equal(DS.t('critBoost'),       '会心攻撃強化',     't() stat critBoost ja (移管後)');
  assert.equal(DS.t('sympathyBoost'),   '会意攻撃強化',     't() stat sympathyBoost ja (移管後)');
  assert.equal(DS.t('elemAtkBoost'),    '属性攻撃強化',     't() stat elemAtkBoost ja (移管後)');
  assert.equal(DS.t('addCritRate'),     '付加会心率',       't() stat addCritRate ja (移管後)');
  assert.equal(DS.t('addSympathyRate'), '付加会意率',       't() stat addSympathyRate ja (移管後)');
  assert.equal(DS.t('specMartialBoost'),'指定武術効果強化', 't() stat specMartialBoost ja (移管後)');
  // 短縮表記統合 (2026-06-10): stat.phys 新設 / penVoidShort → pathVoid
  assert.equal(DS.t('phys'),     '外功', 't() stat phys 短縮 (←旧 penPhysShort)');
  assert.equal(DS.t('pathVoid'), '無相', 't() path合成 pathVoid 短縮 (←旧 penVoidShort)');
  // 短縮ステ + path.affix 合成 (stat.physPen 撤去 → stat.phys + affix.pen 動的合成)
  assert.equal(DS.t('physPen'),  '外功貫通', 't() 短縮合成 physPen ja (←撤去 stat.physPen)');
  DS.setLang('en'); assert.equal(DS.t('physPen'),  'Phys Pen', 't() physPen en');
  DS.setLang('ja');
  // vi 退化なし (2026-06-10: stat.json に bossDmg/allWeaponDmg vi 追記)
  DS.setLang('vi');
  assert.equal(DS.t('bossDmg'),      'Tăng sát thương đối với đơn vị thủ lĩnh', 't() bossDmg vi');
  assert.equal(DS.t('allWeaponDmg'), 'Tăng hiệu quả toàn bộ võ học', 't() allWeaponDmg vi');
  DS.setLang('ja');
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
  // nonPathBase 合成: elemSub (path に属さない副属性 ATK ラベル、 旧 game_lex.minElemSub/maxElemSub 置換)
  assert.equal(DS.t('minElemSub'),    '最小副属性攻撃', 'nonPathBase elemSub ja');
  assert.equal(DS.t('maxElemSub'),    '最大副属性攻撃', 'nonPathBase elemSub max ja');
  DS.setLang('en');
  assert.equal(DS.t('minElemSub'),    'Min Sub Elem', 'nonPathBase elemSub en');
  DS.setLang('zh');
  assert.equal(DS.t('minElemSub'),    '最小副属性攻击', 'nonPathBase elemSub zh');
  DS.setLang('ko');
  assert.equal(DS.t('minElemSub'),    '최소 부속성 공격', 'nonPathBase elemSub ko');
  DS.setLang('ja');
  DS.setLang('en');
  assert.equal(DS.t('pathAtkBellstrike'), 'Bellstrike', 'pathAtk<Path> en (affix.atk en = "")');
  // vi 語順反転 (affix 前置 + base 後置)。 採取記録方針 = memory vi-i18n-composition-bug
  DS.setLang('vi');
  assert.equal(DS.t('pathBellstrike'),    'Minh Kim',                       'path<Path> vi (base のみ)');
  assert.equal(DS.t('pathAtkBellstrike'), 'Tấn công Minh Kim',              'pathAtk<Path> vi (語順反転)');
  assert.equal(DS.t('pathPenVoid'),       'Xuyên thấu Vô Tướng',            'pathPen<Path> vi (語順反転)');
  assert.equal(DS.t('pathDmgBamboocut'),  'Gia tăng Sát thương Phá Trúc',   'pathDmg<Path> vi (語順反転)');
  assert.equal(DS.t('minBamboocut'),      'tối thiểu Tấn công Phá Trúc',    'min<Path> vi (語順反転)');
  assert.equal(DS.t('maxVoid'),           'tối đa Tấn công Vô Tướng',       'max<Path> vi (語順反転)');
  assert.equal(DS.t('minElemSub'),        'tối thiểu Tấn công Thuộc tính phụ', 'nonPathBase elemSub vi (語順反転)');
  assert.equal(DS.t('physPen'),           'Xuyên thấu Ngoại công',          'short stat physPen vi (語順反転)');
  DS.setLang('ja');
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
