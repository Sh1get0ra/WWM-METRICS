// WWM-METRICS fetch helpers
// Phase 1.2.5: dict/JSON/SVG/image fetch の重複logic を統一。
// stats.js + import.js + export.js 各所で散在 fetch を集約予定。

(function () {
  'use strict';

  // SVG inline化 結果 cache (path → string)
  const _svgCache = new Map();

  const fetchH = {
    /**
     * data/{name}.json を fetch + JSON parse。 失敗時 default。
     * @param {string} name - 'kongfu' / 'xinfa' / 'sets' / 'affix' / etc
     * @param {object} [opts]
     * @param {*} [opts.default={}] - 失敗時返却値
     * @param {number} [opts.version] - cache buster (?v=N)
     */
    async loadDict(name, opts = {}) {
      const defaultValue = opts.default !== undefined ? opts.default : {};
      const version = opts.version != null ? opts.version : (window.WWM_SCORE_VERSION || 7);
      try {
        const r = await fetch(`data/${name}.json?v=${version}`);
        if (!r.ok) return defaultValue;
        return await r.json();
      } catch (_) {
        return defaultValue;
      }
    },

    /**
     * 任意 URL から JSON fetch。
     */
    async loadJSON(url, defaultValue = null) {
      try {
        const r = await fetch(url);
        if (!r.ok) return defaultValue;
        return await r.json();
      } catch (_) {
        return defaultValue;
      }
    },

    /**
     * SVG file を fetch + inline化 (cache付き)。 export.js重複の集約。
     * @param {string} path - 'assets/icons/foo.svg'
     */
    async loadSvg(path) {
      if (_svgCache.has(path)) return _svgCache.get(path);
      try {
        const r = await fetch(path);
        const text = r.ok ? await r.text() : '';
        _svgCache.set(path, text);
        return text;
      } catch (_) {
        _svgCache.set(path, '');
        return '';
      }
    },

    /**
     * 画像 URL を fetch → blob → dataURL 化 (CORS bypass試行)。
     * 失敗時 空文字。
     */
    async loadImgDataUrl(url) {
      try {
        const r = await fetch(url);
        if (!r.ok) return '';
        const bl = await r.blob();
        return await new Promise(rs => {
          const f = new FileReader();
          f.onload = () => rs(f.result);
          f.onerror = () => rs('');
          f.readAsDataURL(bl);
        });
      } catch (_) {
        return '';
      }
    },

    /**
     * 画像 URL list を Promise.all で preload (CORS問わず Image() 経由)。
     */
    preloadImages(urls, timeoutMs = 5000) {
      return Promise.all(urls.filter(Boolean).map(u => new Promise(rs => {
        const img = new Image();
        const t = setTimeout(rs, timeoutMs);
        img.onload = img.onerror = () => { clearTimeout(t); rs(); };
        img.src = u;
      })));
    }
  };

  window.WWMHelpers = window.WWMHelpers || {};
  window.WWMHelpers.fetch = fetchH;
})();
