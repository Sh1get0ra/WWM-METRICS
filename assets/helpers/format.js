// WWM-METRICS format helpers
// Phase 1.2.3: 数値format / base64 / clamp 等の重複 logic を統一。

(function () {
  'use strict';

  const format = {
    /**
     * 数値を桁区切りで表示。 decimals指定で小数桁丸め。
     * @param {number} n
     * @param {number} [decimals=0]
     * @param {string|undefined} [locale]
     * @returns {string}
     */
    num(n, decimals = 0, locale) {
      if (typeof n !== 'number' || !isFinite(n)) return '-';
      if (decimals > 0) return n.toFixed(decimals);
      return Math.round(n).toLocaleString(locale);
    },

    /**
     * 0-1 範囲の数値を パーセント表示。
     * @param {number} n - 例: 0.78 → "78.0%"
     * @param {number} [decimals=1]
     */
    pct(n, decimals = 1) {
      if (typeof n !== 'number' || !isFinite(n)) return '-';
      return (n * 100).toFixed(decimals) + '%';
    },

    /**
     * 符号付き表示 (+/-)。
     * @param {number} n
     * @param {number} [decimals=0]
     */
    signed(n, decimals = 0) {
      if (typeof n !== 'number' || !isFinite(n)) return '-';
      const sign = n >= 0 ? '+' : '';
      return sign + (decimals > 0 ? n.toFixed(decimals) : Math.round(n).toLocaleString());
    },

    /**
     * JSON を base64url-safe 文字列に encode (URL-safe、 = padding削除)。
     */
    base64UrlEncode(obj) {
      try {
        const json = typeof obj === 'string' ? obj : JSON.stringify(obj);
        return btoa(unescape(encodeURIComponent(json)))
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      } catch (_) {
        return '';
      }
    },

    /**
     * base64url-safe 文字列を decode して JSON object返却。 失敗時 null。
     */
    base64UrlDecode(s) {
      try {
        const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
        const json = decodeURIComponent(escape(atob(b64)));
        return JSON.parse(json);
      } catch (_) {
        return null;
      }
    },

    /**
     * 安全に number 変換。 NaN/Infinity時 defaultValue。
     */
    safeNumber(v, defaultValue = 0) {
      const n = typeof v === 'number' ? v : parseFloat(v);
      return isFinite(n) ? n : defaultValue;
    },

    /**
     * 値を min-max 範囲に制限。
     */
    clamp(n, min, max) {
      return Math.max(min, Math.min(max, n));
    },

    /**
     * 指定小数桁で四捨五入。
     */
    round(n, decimals = 0) {
      const k = Math.pow(10, decimals);
      return Math.round(n * k) / k;
    }
  };

  window.WWMHelpers = window.WWMHelpers || {};
  window.WWMHelpers.format = format;
})();
