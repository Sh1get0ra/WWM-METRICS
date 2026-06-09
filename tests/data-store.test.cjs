// DataStore (assets/data-store.js) 単体テスト。
// node 環境で window stub に expose されるか + ready() 冪等を確認。
// Task 4/5 で name()/t() のテストを追記する。
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

(async () => {
  // window stub
  const window = {};
  global.window = window;
  // fetch stub (Phase A は空 cat なので呼ばれない想定)
  global.fetch = async () => ({ ok: true, json: async () => ({}) });

  const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'data-store.js'), 'utf8');
  // eslint-disable-next-line no-eval -- test harness 専用。 自プロジェクト管理下の static asset を node 環境に流し込み、
  // ブラウザ IIFE が window stub に expose する挙動を検証。 外部入力/動的式は一切評価しない。
  eval(src);

  assert.ok(window.WWM_DS, 'WWM_DS exposed');
  assert.equal(typeof window.WWM_DS.ready, 'function', 'ready() exists');
  const p = window.WWM_DS.ready();
  assert.ok(p && typeof p.then === 'function', 'ready() returns Promise');
  await p;
  // 冪等 (2度目以降は同 Promise 返す)
  assert.strictEqual(window.WWM_DS.ready(), window.WWM_DS.ready(), 'ready() idempotent');

  console.log('PASS: data-store skeleton');
})().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
