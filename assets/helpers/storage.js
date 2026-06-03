// WWM-METRICS localStorage helpers
// Phase 1.2.2: localStorage の try-catch + JSON parse散在 (70箇所) を統一。
// SHARE Build mode の localStorage monkey patch とも共存 (getItem/setItem経由)。

(function () {
  'use strict';

  const storage = {
    /**
     * localStorage から JSON parse して返す。 失敗時 defaultValue。
     * @param {string} key
     * @param {*} [defaultValue=null]
     * @returns {*}
     */
    loadJSON(key, defaultValue = null) {
      try {
        const raw = localStorage.getItem(key);
        if (raw === null) return defaultValue;
        const parsed = JSON.parse(raw);
        return parsed === null ? defaultValue : parsed;
      } catch (_) {
        return defaultValue;
      }
    },

    /**
     * value を JSON.stringify して localStorage に保存。 失敗時 false返却。
     * SHARE Build mode で block される場合あり (monkey patch経由)。
     * @returns {boolean} 成功時 true
     */
    saveJSON(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (_) {
        return false;
      }
    },

    /**
     * 文字列値の取得。 null時 defaultValue。
     */
    loadStr(key, defaultValue = null) {
      try {
        const v = localStorage.getItem(key);
        return v === null ? defaultValue : v;
      } catch (_) {
        return defaultValue;
      }
    },

    /**
     * 文字列値 保存。
     */
    saveStr(key, value) {
      try {
        localStorage.setItem(key, String(value));
        return true;
      } catch (_) {
        return false;
      }
    },

    /**
     * key削除。
     */
    remove(key) {
      try {
        localStorage.removeItem(key);
        return true;
      } catch (_) {
        return false;
      }
    },

    /**
     * 全 key を array で返却。 失敗時 空 array。
     */
    keys() {
      try {
        return Object.keys(localStorage);
      } catch (_) {
        return [];
      }
    },

    /**
     * prefix一致 全 key を削除。 例: clearByPrefix('wwm_opt_') で wwm_opt_*削除
     */
    clearByPrefix(prefix) {
      try {
        const keys = Object.keys(localStorage).filter(k => k.startsWith(prefix));
        keys.forEach(k => localStorage.removeItem(k));
        return keys.length;
      } catch (_) {
        return 0;
      }
    }
  };

  window.WWMHelpers = window.WWMHelpers || {};
  window.WWMHelpers.storage = storage;
})();
