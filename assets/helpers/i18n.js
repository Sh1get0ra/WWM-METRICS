// WWM-METRICS i18n helpers
// Phase 1.2.4: 多言語 label 取得 logic を統一。
// 既存 patterns (window.T?.x || 'def' / _label / [lang] fallback) を集約。

(function () {
  'use strict';

  const i18n = {
    /**
     * 現言語 ('ja' | 'en' | 'zh' | 'ko')。 window.currentLang から取得、 fallback 'ja'。
     */
    getLang() {
      return (window.currentLang) || 'ja';
    },

    /**
     * DataStore.t() 経由で翻訳key取得。 不在時 fallback。
     * DataStore 未ロード時は window.T (旧 dict) を見る (race condition fallback、 Task 9 完了後は廃止)。
     * @param {string} key - 翻訳key
     * @param {string} [fallback=''] - 翻訳未定義時のテキスト
     */
    t(key, fallback = '') {
      if (window.WWM_DS) {
        const v = window.WWM_DS.t(key);
        if (v !== key) return v; // DataStore は不在時 key そのまま返す → fallback 判定可能
      }
      const T = window.T;
      if (T && T[key] !== undefined && T[key] !== null) return T[key];
      return fallback;
    },

    /**
     * {ja, en, zh, ko} 形式の名前 object から 現言語ラベル取得。
     * 現言語なし → ja fallback → 引数 fallback。
     * @param {object} names - 例: { ja: '主武器', en: 'Main Weapon', zh: '主武器', ko: '주무기' }
     * @param {string} [fallback='']
     */
    pickName(names, fallback = '') {
      if (!names || typeof names !== 'object') return fallback;
      const lang = (window.currentLang) || 'ja';
      return names[lang] || names.ja || fallback;
    },

    /**
     * template 文字列の {0}, {1}, ... を 引数で置換。
     * @example tpl('+{0} (Δ {1})', 5, 12.3) → '+5 (Δ 12.3)'
     */
    tpl(str, ...args) {
      if (typeof str !== 'string') return '';
      return str.replace(/\{(\d+)\}/g, (m, i) => {
        const v = args[Number(i)];
        return v !== undefined && v !== null ? String(v) : m;
      });
    },

    /**
     * t() + tpl() の合成。 翻訳取得 + 引数置換 を 1 callで。
     */
    tt(key, fallback, ...args) {
      const str = this.t(key, fallback);
      return this.tpl(str, ...args);
    }
  };

  window.WWMHelpers = window.WWMHelpers || {};
  window.WWMHelpers.i18n = i18n;
})();
