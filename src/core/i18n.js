// ── i18n エントリ ────────────────────────────────────────────────
// 旧 TRANSLATIONS 定数 (915行 4言語ハードコード) は data/i18n/ui.json に外出し済 (Task 3, 2026-06-09)。
// 本 file は window.T を Proxy で公開し DataStore.t() 委譲 = 既存 callsite (window.T?.foo / T[key]) を無変更で DataStore 経由化。
// 言語追加 = data/i18n/<file>.json に lang キー1行足すだけ (i18n.js / app.js は触らない)。
// 詳細: docs/superpowers/plans/2026-06-09-i18n-unification.md Task 9

(function () {
  'use strict';
  // window.T = Proxy: window.T.foo / window.T['foo'] を DataStore.t('foo') に委譲。
  // DataStore 未ロード時は undefined 返却 (旧 fallback と互換)。
  // 'in' 演算子: data.ui に key 存在で true (Object.keys 列挙は対応しない = 既存 callsite で列挙してない確認済)。
  const TProxy = new Proxy({}, {
    get(_target, key) {
      if (typeof key !== 'string') return undefined;
      if (!window.WWM_DS) return undefined;
      const v = window.WWM_DS.t(key);
      // DataStore.t() = 不在時 key そのまま返す → undefined に変換 (旧 dict access 互換)
      return v === key ? undefined : v;
    },
    has(_target, key) {
      if (typeof key !== 'string') return false;
      if (!window.WWM_DS) return false;
      return window.WWM_DS.t(key) !== key;
    }
  });
  window.T = TProxy;
  // 旧 WWM_I18N (path系注入用 全言語テーブル) は build-labels.js 撤去 (段階9-3) で不要化、 本 file 撤去済。
  // currentLang は app.js setLang() が管理。 ここでは初期値のみ。
  if (typeof window.currentLang === 'undefined') window.currentLang = 'ja';
})();

// vite移行 P2: ESM 副作用 module 化 (window expose は IIFE 内 keep)
export {};
