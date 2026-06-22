// WWMetrics fetch helpers
// Phase 1.2.5: JSON/SVG/image fetch の重複logic を統一。
// dict load (data/*.json) は data-store.js ensureCalcData に一元化済 (P4-mini 2026-06-10、 旧 loadDict 撤去)。

// vite移行 P2: ESM 化、 window expose 互換 keep。

// SVG inline化 結果 cache (path → string)
const _svgCache = new Map();

const fetchH = {
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

export { fetchH };
export default fetchH;
