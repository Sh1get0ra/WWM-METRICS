// WWM-METRICS - affix OCR 取込 (TODO #16)
// pipeline: 前処理 → 行切出し → Tesseract 行単位認識 → parse → 閉語彙 fuzzy match
// engine 非依存設計: ENGINE section だけ差替えれば PaddleOCR 等へ移行可能
//
// 依存: window.T (optional) / window.currentLang (optional)
// 公開: window.WWMSidebar.ocr = { run, LANG_MAP, _internals }
(function () {
  'use strict';
  window.WWMSidebar = window.WWMSidebar || {};

  // ── 言語 map (UI lang → tesseract traineddata) ─────────────
  const LANG_MAP = { ja: 'jpn', en: 'eng', zh: 'chi_sim', ko: 'kor' };

  // ════════════════════════════════════════════════════════════
  // 前処理: grayscale → 暗地判定で反転 → Otsu 二値化
  // (ゲーム tooltip = 暗地白文字 → 反転で黒文字化が Tesseract 最適)
  // ════════════════════════════════════════════════════════════
  function _otsu(gray) {
    const hist = new Array(256).fill(0);
    for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
    const total = gray.length;
    let sumAll = 0;
    for (let i = 0; i < 256; i++) sumAll += i * hist[i];
    let sumB = 0, wB = 0, best = 0, bestTh = 127;
    for (let t = 0; t < 256; t++) {
      wB += hist[t]; if (!wB) continue;
      const wF = total - wB; if (!wF) break;
      sumB += t * hist[t];
      const mB = sumB / wB, mF = (sumAll - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) { best = between; bestTh = t; }
    }
    return bestTh;
  }

  function _preprocess(img) {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const im = ctx.getImageData(0, 0, w, h);
    const d = im.data;
    const gray = new Uint8Array(w * h);
    let sum = 0;
    for (let i = 0; i < w * h; i++) {
      const g = (d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000;
      gray[i] = g; sum += g;
    }
    if (sum / (w * h) < 128) {                      // 暗地 = 白文字 → 反転
      for (let i = 0; i < w * h; i++) gray[i] = 255 - gray[i];
    }
    const th = _otsu(gray);
    for (let i = 0; i < w * h; i++) {
      const v = gray[i] < th ? 0 : 255;             // 文字=黒(0) / 地=白(255)
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
    }
    ctx.putImageData(im, 0, 0);
    return { cv, w, h };
  }

  // ════════════════════════════════════════════════════════════
  // 行切出し: 横投影 profile → text band 検出 → 3x upscale crop
  // 高さ 8px 未満の band = underline bar / ノイズとして除外
  // ════════════════════════════════════════════════════════════
  function _segmentLines(pre) {
    const { cv, w, h } = pre;
    const im = cv.getContext('2d').getImageData(0, 0, w, h).data;
    const inkTh = Math.max(2, w * 0.004);           // 黒 0.4% 以上 = テキスト行
    const bands = [];
    let start = -1;
    for (let y = 0; y < h; y++) {
      let c = 0;
      for (let x = 0; x < w; x++) if (im[(y * w + x) * 4] === 0) c++;
      const isText = c >= inkTh;
      if (isText && start < 0) start = y;
      if (!isText && start >= 0) {
        if (y - start >= 8) bands.push({ y0: start, y1: y });
        start = -1;
      }
    }
    if (start >= 0 && h - start >= 8) bands.push({ y0: start, y1: h });
    return bands.map(b => {
      // pad は画像端で clamp (負の source 座標は drawImage が暗黙 clamp し crop がズレる)
      const padT = Math.min(4, b.y0);
      const padB = Math.min(4, h - b.y1);
      const srcY = b.y0 - padT;
      const srcH = (b.y1 - b.y0) + padT + padB;
      const c2 = document.createElement('canvas');
      c2.width = w * 3; c2.height = srcH * 3;
      const x2 = c2.getContext('2d');
      x2.fillStyle = '#fff'; x2.fillRect(0, 0, c2.width, c2.height);
      x2.drawImage(cv, 0, srcY, w, srcH, 0, 0, w * 3, srcH * 3);
      return { canvas: _trimIcon(c2), y0: b.y0, y1: b.y1 };
    });
  }

  // 左端 icon 円の除去: x 投影で先頭 ink 塊が「幅 ≤ 行高1.6倍 + 後続 gap ≥ 行高0.5倍」
  // なら icon と判定して crop。該当なしならそのまま返す
  function _trimIcon(cv) {
    const w = cv.width, h = cv.height;
    const im = cv.getContext('2d').getImageData(0, 0, w, h).data;
    const blobs = [];
    let s = -1;
    for (let x = 0; x < w; x++) {
      let ink = false;
      for (let y = 0; y < h; y++) if (im[(y * w + x) * 4] === 0) { ink = true; break; }
      if (ink && s < 0) s = x;
      if (!ink && s >= 0) { blobs.push({ x0: s, x1: x }); s = -1; }
    }
    if (s >= 0) blobs.push({ x0: s, x1: w });
    if (blobs.length >= 2) {
      const first = blobs[0];
      const gap = blobs[1].x0 - first.x1;
      if ((first.x1 - first.x0) <= h * 1.6 && gap >= h * 0.5) {
        const srcX = Math.max(0, blobs[1].x0 - 8);   // 負座標 clamp
        const dstW = w - srcX;
        const c2 = document.createElement('canvas');
        c2.width = dstW; c2.height = h;
        const ctx2 = c2.getContext('2d');
        ctx2.fillStyle = '#fff'; ctx2.fillRect(0, 0, c2.width, c2.height);
        ctx2.drawImage(cv, srcX, 0, dstW, h, 0, 0, dstW, h);
        return c2;
      }
    }
    return cv;
  }

  // ════════════════════════════════════════════════════════════
  // ENGINE: tesseract.js v5 (jsDelivr lazy-load + worker cache)
  // 差替え時はこの section のみ変更 (_ocrLines の戻り値契約を維持)
  // ════════════════════════════════════════════════════════════
  const CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  let _scriptP = null;
  function _loadScript() {
    if (window.Tesseract) return Promise.resolve();
    if (_scriptP) return _scriptP;
    _scriptP = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = CDN;
      s.onload = res;
      s.onerror = () => { _scriptP = null; rej(new Error('tesseract script load fail')); };
      document.head.appendChild(s);
    });
    return _scriptP;
  }
  let _worker = null, _workerLang = null;
  async function _getWorker(tessLang, onProgress) {
    await _loadScript();
    if (_worker && _workerLang === tessLang) return _worker;
    if (_worker) { try { await _worker.terminate(); } catch (e) {} _worker = null; _workerLang = null; }
    try {
      _worker = await window.Tesseract.createWorker(tessLang, 1, {
        logger: (m) => {
          if (m.status === 'loading language traineddata') onProgress?.('lang', m.progress || 0);
          else if (m.status === 'recognizing text') onProgress?.('rec', m.progress || 0);
        }
      });
      _workerLang = tessLang;
    } catch (e) {
      _worker = null; _workerLang = null;   // 半端な worker を cache に残すと次回も即死する
      throw e;
    }
    return _worker;
  }

  // 行毎 OCR + 数値領域 2-pass (whitelist 再認識で小数点誤読対策)
  async function _ocrLines(bands, tessLang, onProgress) {
    const worker = await _getWorker(tessLang, onProgress);
    await worker.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: '' });
    const out = [];
    for (let i = 0; i < bands.length; i++) {
      onProgress?.('line', i / bands.length);
      const b = bands[i];
      const { data } = await worker.recognize(b.canvas);
      let text = (data.text || '').trim();
      let numConf = null;
      const words = data.words || [];
      const numWords = words.filter(wd => /[0-9０-９]/.test(wd.text));
      if (numWords.length) {
        const x0 = Math.max(0, Math.min(...numWords.map(wd => wd.bbox.x0)) - 8);
        const x1 = Math.min(b.canvas.width, Math.max(...numWords.map(wd => wd.bbox.x1)) + 8);
        if (x1 - x0 > 8) {
          const c3 = document.createElement('canvas');
          c3.width = x1 - x0; c3.height = b.canvas.height;
          const ctx3 = c3.getContext('2d');
          ctx3.fillStyle = '#fff'; ctx3.fillRect(0, 0, c3.width, c3.height);
          ctx3.drawImage(b.canvas, x0, 0, c3.width, c3.height, 0, 0, c3.width, c3.height);
          await worker.setParameters({ tessedit_char_whitelist: '0123456789.+%' });
          const r2 = await worker.recognize(c3);
          await worker.setParameters({ tessedit_char_whitelist: '' });
          const t2 = (r2.data.text || '').trim();
          if (/\d/.test(t2)) {
            text = text.replace(/[+＋]?\s*[\d０-９.,]+\s*[%％]?\s*$/, '').trim() + ' ' + t2;
            numConf = r2.data.confidence;
          }
        }
      }
      out.push({ text, conf: data.confidence, numConf });
    }
    return out;
  }

  // ════════════════════════════════════════════════════════════
  // parse: 折返し結合 → Lv 行 / affix 行 (名前 + 数値) 抽出
  // ════════════════════════════════════════════════════════════
  function _parseLines(lines) {
    const merged = [];
    for (const ln of lines) {
      const t = (ln.text || '').trim();
      if (!t) continue;
      // 折返し断片 (% や数値のみで名前なし) → 直前行に結合 (兄貴画像の `+4.5` / `%` 分離対応)
      // ただし前行が既に数値で完結している場合、% を含まない数値専用行は結合しない (別 affix 値の可能性)
      if (merged.length && /^[%％+＋\d.,\s]+$/.test(t)) {
        const prevHasNum = /[\d０-９]\s*[%％]?\s*$/.test(merged[merged.length - 1].text);
        if (/[%％]/.test(t) || !prevHasNum) {
          merged[merged.length - 1].text += t;
          continue;
        }
        continue;   // 数値専用 + 前行完結 → 名前なし断片として破棄
      }
      merged.push({ text: t, conf: ln.conf, numConf: ln.numConf });
    }
    let lv = null;
    const affixes = [];
    for (const ln of merged) {
      const lvM = ln.text.match(/Lv\.?\s*(\d{1,3})/i);
      if (lvM && lvM.index < 4 && !/[+＋]/.test(ln.text)) { lv = parseInt(lvM[1], 10); continue; }
      const numM = ln.text.match(/[+＋]?\s*(\d+(?:[.,]\d+)?)\s*([%％])?\s*$/);
      if (!numM) continue;
      const name = ln.text.slice(0, numM.index).trim();
      if (!name) continue;
      affixes.push({
        name,
        value: parseFloat(numM[1].replace(',', '.')),
        isPct: !!numM[2],
        conf: (ln.conf || 0) / 100,
        numConf: ln.numConf != null ? ln.numConf / 100 : null
      });
    }
    return { lv, affixes };
  }

  // ════════════════════════════════════════════════════════════
  // fuzzy match: 正規化 + bigram Dice 係数。閉語彙 (options) 限定
  // ════════════════════════════════════════════════════════════
  function _norm(s) {
    return String(s)
      .replace(/[\[【［]\s*転\s*[\]】］]/g, '')                 // [転] prefix 除去
      .replace(/[\s　]+/g, '')
      .replace(/[＋]/g, '+').replace(/[％]/g, '%')
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .toLowerCase();
  }
  function _dice(a, b) {
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return 0;
    const m = new Map();
    for (let i = 0; i < a.length - 1; i++) {
      const g = a.slice(i, i + 2);
      m.set(g, (m.get(g) || 0) + 1);
    }
    let inter = 0;
    for (let i = 0; i < b.length - 1; i++) {
      const g = b.slice(i, i + 2);
      const c = m.get(g);
      if (c) { inter++; m.set(g, c - 1); }
    }
    return (2 * inter) / ((a.length - 1) + (b.length - 1));
  }
  function _matchAffix(parsedName, options) {
    const q = _norm(parsedName);
    if (!q) return null;
    let best = null;
    for (const o of options) {
      const c = _norm(o.name);
      let sim;
      if (q === c) sim = 1;
      else if (q.length < 2 || c.length < 2) sim = (c.includes(q) || q.includes(c)) ? 0.9 : 0;  // `会` 等 1 文字救済
      else sim = _dice(q, c);
      if (!best || sim > best.sim) best = { option: o, sim };
    }
    return (best && best.sim >= 0.4) ? best : null;
  }

  // ════════════════════════════════════════════════════════════
  // 公開 API: run(imgSource, ctx)
  //   imgSource: File | Blob | HTMLImageElement | HTMLCanvasElement
  //   ctx: { lang ('ja'|'en'|'zh'|'ko'), getOptions(idx) → [{id,statKey,name}],
  //          onProgress(stage, pct) }
  // 戻り値: { lv, rows: [{idx, affixId, statKey, name, value, isPct,
  //                       confidence, sim}], parsedCount }
  // 行→idx は上から順 (スクショ行順 = baseAffixes idx 順)。
  // 直割当の match fail 時は他 idx 候補も試す (slot 内別枠の可能性)
  // ════════════════════════════════════════════════════════════
  async function _toImage(src) {
    if (src instanceof HTMLImageElement || src instanceof HTMLCanvasElement) return src;
    return await createImageBitmap(src);
  }
  async function run(imgSource, ctx) {
    const lang = ctx.lang || (window.currentLang || 'ja');
    const tessLang = LANG_MAP[lang] || 'jpn';
    const img = await _toImage(imgSource);
    const pre = _preprocess(img);
    const bands = _segmentLines(pre);
    const lines = await _ocrLines(bands, tessLang, ctx.onProgress);
    const { lv, affixes } = _parseLines(lines);
    const rows = [];
    for (let i = 0; i < affixes.length && i < 6; i++) {
      const a = affixes[i];
      let m = _matchAffix(a.name, ctx.getOptions(i) || []);
      let idx = i;
      if (!m) {
        for (let j = 0; j < 6; j++) {                 // 直割当 fail → 他 idx 試行
          if (j === i) continue;
          const m2 = _matchAffix(a.name, ctx.getOptions(j) || []);
          if (m2 && (!m || m2.sim > m.sim)) { m = m2; idx = j; }
        }
      }
      if (!m) continue;
      const numC = a.numConf != null ? a.numConf : a.conf;
      rows.push({
        idx,
        affixId: m.option.id,
        statKey: m.option.statKey,
        name: m.option.name,
        value: a.value,
        isPct: a.isPct,
        confidence: Math.min(a.conf, numC) * m.sim,   // OCR conf × match 類似度
        sim: m.sim
      });
    }
    return { lv, rows, parsedCount: affixes.length };
  }

  window.WWMSidebar.ocr = {
    run,
    LANG_MAP,
    // PoC / debug 用 internal 公開 (_ocrLines は共有 worker 使用 — 並行呼出し不可、本番は run() 経由)
    _internals: { _preprocess, _segmentLines, _trimIcon, _parseLines, _matchAffix, _norm, _dice, _ocrLines }
  };
})();
