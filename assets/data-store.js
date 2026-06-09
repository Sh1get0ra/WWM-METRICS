// ── DataStore (取得層 単一入口) ────────────────────────────────────
// 全言語データを起動時 eager load。 表示層は name(cat, id) で同期取得。
// 詳細設計: docs/superpowers/specs/2026-06-09-data-architecture-redesign-materials.md
// 実装 plan : docs/superpowers/plans/2026-06-09-i18n-unification.md
(function () {
  'use strict';
  // Phase A = 空 cat。 Task 4 で 'kongfu','xinfa','sets','stat','path','skilltype','weapontype','ui' に拡張。
  const CATS = [];
  const VERSION = (typeof window !== 'undefined' && window.WWM_DISPLAY_VERSION) || 11;
  let currentLang = 'ja';
  const data = Object.create(null); // { kongfu: {...}, xinfa: {...}, ... }
  let readyPromise = null;

  function ready() {
    if (readyPromise) return readyPromise;
    readyPromise = Promise.all(CATS.map(async (cat) => {
      const res = await fetch('data/i18n/' + cat + '.json?v=' + VERSION);
      if (!res.ok) throw new Error('DataStore: failed to fetch ' + cat + '.json (' + res.status + ')');
      data[cat] = await res.json();
    })).then(() => undefined);
    return readyPromise;
  }

  function setLang(lang) {
    currentLang = lang;
  }

  function getLang() {
    return currentLang;
  }

  function _has(cat, id) {
    return !!(data[cat] && Object.prototype.hasOwnProperty.call(data[cat], String(id)));
  }

  // name() は Task 4 で本実装。 Phase A では stub。
  function name(cat, id) {
    return '[' + cat + ':' + id + ']';
  }

  // t() は Task 5 で本実装。 Phase A では stub (key そのまま返す)。
  function t(key) {
    return key;
  }

  const api = { ready: ready, setLang: setLang, getLang: getLang, name: name, t: t, has: _has };
  if (typeof window !== 'undefined') {
    window.WWM_DS = api;
    window.DataStore = api; // 兄貴可読性用 alias
  }
})();
