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
    return { gray, w, h };
  }

  // gray 部分矩形 → 局所 Otsu 二値化 canvas (文字=黒/地=白)
  // 全体 Otsu だと Lv 帯 (グレー gradient 地) が潰れる → band 毎に再閾値 (PoC 実測で確定)
  // thFactor < 1 = 強い黒のみ ink 扱い (icon glow を ink 誤判定して trim を壊す対策)
  function _binCanvasFromGray(gray, w, y0, bh, thFactor) {
    const sub = new Uint8Array(w * bh);
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < w; x++) sub[y * w + x] = gray[(y0 + y) * w + x];
    }
    const th = _otsu(sub) * (thFactor || 1);
    const c = document.createElement('canvas');
    c.width = w; c.height = bh;
    const ctx = c.getContext('2d');
    const im = ctx.createImageData(w, bh);
    for (let i = 0; i < w * bh; i++) {
      const v = sub[i] < th ? 0 : 255;
      im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(im, 0, 0);
    return c;
  }

  // ════════════════════════════════════════════════════════════
  // 行切出し: 横投影 profile → text band 検出 → 局所二値化 + 3x upscale
  // 高さ 8px 未満の band = ノイズ除外。
  // 横連続 run が幅 35% 超の行 = 下線バー → 非テキスト扱い (バー混入 = OCR ゴミ化、PoC 実測で確定)
  // ════════════════════════════════════════════════════════════
  function _segmentLines(pre) {
    const { gray, w, h } = pre;
    const gth = _otsu(gray);                        // profile 用の全体閾値
    const inkTh = Math.max(2, w * 0.004);           // 黒 0.4% 以上 = テキスト行
    const barRun = w * 0.35;                        // これ以上の連続 run = バー候補
    const bands = [];
    const rowInk = new Array(h).fill(0);
    let start = -1;
    for (let y = 0; y < h; y++) {
      let c = 0, run = 0, maxRun = 0;
      for (let x = 0; x < w; x++) {
        if (gray[y * w + x] < gth) { c++; run++; if (run > maxRun) maxRun = run; }
        else run = 0;
      }
      rowInk[y] = c;
      // バー = 長い run かつ「run 以外の ink が少ない」(ベタ線 + 右端 badge ~4% を許容)。
      // 装飾 (墨絵 swirl) 上の text 行は extra ink が大きい → 除外しない (PoC 実測: 下端行の消失対策)
      const isBar = maxRun >= barRun && (c - maxRun) <= w * 0.06;
      const isText = c >= inkTh && !isBar;
      if (isText && start < 0) start = y;
      if (!isText && start >= 0) {
        if (y - start >= 8) bands.push({ y0: start, y1: y });
        start = -1;
      }
    }
    if (start >= 0 && h - start >= 8) bands.push({ y0: start, y1: h });
    // (separator 線検出は panel 全面の gradient/texture に勝てず撤去 — 2026-06-07 実測。
    //  画面種別は run() 側の name↔値 水平 gap 中央値で判別する)
    // 縦長 band = 折返し 2 行が融合 (PSM single-line が崩壊) → 内部の ink 谷で分割。
    // 分割後の band もまだ縦長なら再分割 (fixpoint、最大 4 pass — 谷 1 回では 2 行残ることがある)
    if (bands.length >= 2) {
      const hs = bands.map(b => b.y1 - b.y0).sort((a, b) => a - b);
      const medH = hs[Math.floor(hs.length / 2)];
      for (let pass = 0; pass < 4; pass++) {
        let didSplit = false;
        for (let i = bands.length - 1; i >= 0; i--) {
          const b = bands[i];
          const bh = b.y1 - b.y0;
          if (bh <= medH * 1.8 || bh < 24) continue;
          let valley = -1, valleyInk = Infinity;
          for (let y = b.y0 + Math.floor(bh * 0.25); y <= b.y0 + Math.ceil(bh * 0.75); y++) {
            if (rowInk[y] < valleyInk) { valleyInk = rowInk[y]; valley = y; }
          }
          if (valley > b.y0 + 8 && b.y1 - valley >= 8) {
            // wrapped flag: 折返し由来の行は値の信頼を下げる (3↔8 等の誤読が出やすい難所)
            bands.splice(i, 1, { y0: b.y0, y1: valley, wrapped: true }, { y0: valley, y1: b.y1, wrapped: true });
            didSplit = true;
          }
        }
        if (!didSplit) break;
      }
    }
    const mapped = bands.map(b => {
      // pad は画像端で clamp (負の source 座標は drawImage が暗黙 clamp し crop がズレる)
      const padT = Math.min(4, b.y0);
      const padB = Math.min(4, h - b.y1);
      const srcY = b.y0 - padT;
      const srcH = (b.y1 - b.y0) + padT + padB;
      // 解析 (icon/badge 範囲特定) は局所二値、OCR 入力は grayscale のまま
      // (二値ジャギーより Tesseract 内部二値化の方が高精度 — PoC 実測で確定)
      const bin = _binCanvasFromGray(gray, w, srcY, srcH, 0.7);
      const trim = _trimRange(bin);
      const tw = trim.x1 - trim.x0;
      const g1 = document.createElement('canvas');
      g1.width = w; g1.height = srcH;
      const gctx = g1.getContext('2d');
      const gim = gctx.createImageData(w, srcH);
      for (let y = 0; y < srcH; y++) {
        for (let x = 0; x < w; x++) {
          const v = gray[(srcY + y) * w + x];
          const o = (y * w + x) * 4;
          gim.data[o] = gim.data[o + 1] = gim.data[o + 2] = v; gim.data[o + 3] = 255;
        }
      }
      gctx.putImageData(gim, 0, 0);
      // adaptive scale: 行高 ~120px 目標 (低解像度スクショ対応、3..6x)
      const scale = Math.max(3, Math.min(6, Math.round(120 / srcH)));
      const c2 = document.createElement('canvas');
      c2.width = tw * scale; c2.height = srcH * scale;
      const x2 = c2.getContext('2d');
      x2.imageSmoothingEnabled = true;
      x2.fillStyle = '#fff'; x2.fillRect(0, 0, c2.width, c2.height);
      x2.drawImage(g1, trim.x0, 0, tw, srcH, 0, 0, tw * scale, srcH * scale);
      return { canvas: c2, y0: b.y0, y1: b.y1, wrapped: !!b.wrapped, trimX0: trim.x0, scale, origW: w };
    });
    return mapped;
  }

  // テキスト x 範囲特定 (二値 canvas 解析): 左端 icon 円 + 右端 👍badge を範囲外へ
  //   icon: 先頭 ink 塊が「幅 ≤ 行高1.6倍 + 後続 gap ≥ 行高0.5倍」
  //   badge: 末尾 ink 塊が「幅 ≤ 行高1.6倍 + 直前 gap ≥ 行高0.5倍」
  //   (badge 混入は whitelist 2-pass が badge を数字に誤変換する事故源 — PoC 実測で確定)
  function _trimRange(cv) {
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
    let x0 = 0, x1 = w;
    if (blobs.length >= 2) {
      const first = blobs[0];
      if ((first.x1 - first.x0) <= h * 1.6 && (blobs[1].x0 - first.x1) >= h * 0.5) {
        x0 = Math.max(0, blobs[1].x0 - 8);
        blobs.shift();
      }
    }
    if (blobs.length >= 2) {
      const last = blobs[blobs.length - 1];
      const prev = blobs[blobs.length - 2];
      if ((last.x1 - last.x0) <= h * 1.6 && (last.x0 - prev.x1) >= h * 0.5) {
        x1 = Math.min(w, prev.x1 + 8);
      }
    }
    if (x1 - x0 < 8) { x0 = 0; x1 = w; }   // 異常縮小は trim 放棄
    return { x0, x1 };
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
  // worker は言語別 cache (本文用 + 数値専用 eng の併存。jpn model は数字 8↔9 に弱く、
  // 数値 2-pass は常に eng worker で行う — 同一画像で eng が正読する事を実測確認 2026-06-07)
  const _workers = {};
  async function _getWorker(tessLang, onProgress) {
    await _loadScript();
    if (_workers[tessLang]) return _workers[tessLang];
    try {
      const wk = await window.Tesseract.createWorker(tessLang, 1, {
        logger: (m) => {
          if (m.status === 'loading language traineddata') onProgress?.('lang', m.progress || 0);
          else if (m.status === 'recognizing text') onProgress?.('rec', m.progress || 0);
        }
      });
      _workers[tessLang] = wk;
      return wk;
    } catch (e) {
      delete _workers[tessLang];   // 半端な worker を cache に残すと次回も即死する
      throw e;
    }
  }
  // 数値専用 worker (eng の独立 instance + digits whitelist + PSM7 固定)。
  // EN 本文用 eng worker と共有すると whitelist が本文認識を汚染するため必ず別 instance
  async function _getDigitsWorker(onProgress) {
    if (_workers.__digits) return _workers.__digits;
    await _loadScript();
    const wk = await window.Tesseract.createWorker('eng', 1, {
      logger: (m) => { if (m.status === 'loading language traineddata') onProgress?.('lang', m.progress || 0); }
    });
    await wk.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: '0123456789.+%' });
    _workers.__digits = wk;
    return wk;
  }

  // canvas → 局所 Otsu 二値化 canvas (低確信 retry 用)
  function _binarizeCanvas(cv) {
    const w = cv.width, h = cv.height;
    const im = cv.getContext('2d').getImageData(0, 0, w, h);
    const g = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) g[i] = im.data[i * 4];
    const th = _otsu(g);
    const c2 = document.createElement('canvas');
    c2.width = w; c2.height = h;
    const ctx2 = c2.getContext('2d');
    const im2 = ctx2.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const v = g[i] < th ? 0 : 255;
      im2.data[i * 4] = im2.data[i * 4 + 1] = im2.data[i * 4 + 2] = v; im2.data[i * 4 + 3] = 255;
    }
    ctx2.putImageData(im2, 0, 0);
    return c2;
  }

  // 「名前らしい word」判定: CJK 漢字/かな + ハングル + Latin 2 文字以上 (ko/en の anchor 頑健化)
  const _CJK_RE = /[一-龯ぁ-んァ-ヶ가-힣]|[A-Za-z]{2}/;
  const _NUMW_RE = /^[+＋]?[\d０-９.,]+[%％]?$/;

  // 行毎 OCR:
  //   ① grayscale 認識 → 低確信 (<60) は二値化 retry して良い方を採用 (glow/gradient 帯の救済)
  //   ② word bbox で name/value を構造分離 — anchor = 「CJK word の直後の数値 word」
  //      (行頭の誤読数字や右端 badge 由来のゴミを value に混ぜない、PoC 実測で確定)
  //   ③ value 領域だけ whitelist 2-pass (小数点誤読対策)
  async function _ocrLines(bands, tessLang, onProgress) {
    const worker = await _getWorker(tessLang, onProgress);
    const out = [];
    for (let i = 0; i < bands.length; i++) {
      onProgress?.('line', i / bands.length);
      const b = bands[i];
      await worker.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: '' });
      let src = b.canvas;
      let { data } = await worker.recognize(src);
      if ((data.confidence || 0) < 60) {
        const binCv = _binarizeCanvas(b.canvas);
        const r2 = await worker.recognize(binCv);
        if ((r2.data.confidence || 0) > (data.confidence || 0)) { data = r2.data; src = binCv; }
      }
      let text = (data.text || '').trim();
      // Lv 帯 rescue: "Lv" は読めたが数字が誤読 (gradient 帯/「承音 ·」prefix) →
      // "Lv" word の bbox 右側だけ crop して数字 whitelist 再認識 (帯全体だと CJK ノイズに負ける)
      if (/lv|tier/i.test(text) && !/(?:lv|tier)\.?\s*\d/i.test(text)) {   // EN = "Tier 91" 表記
        const wLv = (data.words || []).find(wd => /lv|tier/i.test(wd.text || ''));
        let lvSrc = src;
        if (wLv && wLv.bbox && src.width - wLv.bbox.x0 > 16) {
          const cx = Math.max(0, wLv.bbox.x0 - 4);
          const cw = src.width - cx;
          const cL = document.createElement('canvas');
          cL.width = cw; cL.height = src.height;
          const cctx = cL.getContext('2d');
          cctx.fillStyle = '#fff'; cctx.fillRect(0, 0, cw, src.height);
          cctx.drawImage(src, cx, 0, cw, src.height, 0, 0, cw, src.height);
          lvSrc = cL;
        }
        await worker.setParameters({ tessedit_char_whitelist: 'LvTier.0123456789' });
        const rLv = await worker.recognize(lvSrc);
        await worker.setParameters({ tessedit_char_whitelist: '' });
        const tLv = (rLv.data.text || '').trim();
        if (/(?:lv|tier)\.?\s*\d/i.test(tLv)) text = tLv;
      }
      let numConf = null, nameText = null, numText = null, gapRatio = null;
      const words = (data.words || []).filter(wd => (wd.text || '').trim());
      // anchor: 直前 word が CJK の数値 word (行頭ゴミ数字を除外)。候補複数時は
      // +付き or 小数点付き (= ゲーム値書式) を優先、無ければ最後の候補 (値は行末にある)
      let anchor = -1;
      const anchorCands = [];
      for (let k = 1; k < words.length; k++) {
        if (/[0-9０-９]/.test(words[k].text) && _CJK_RE.test(words[k - 1].text)) anchorCands.push(k);
      }
      if (anchorCands.length) {
        anchor = anchorCands.find(k => /^[+＋]/.test(words[k].text) || /[.,]/.test(words[k].text));
        if (anchor == null) anchor = anchorCands[anchorCands.length - 1];
      }
      if (anchor < 0 && words.length >= 2 && /[0-9０-９]/.test(words[words.length - 1].text)) {
        anchor = words.length - 1;
      }
      if (anchor > 0) {
        let end = anchor;
        while (end + 1 < words.length && _NUMW_RE.test(words[end + 1].text.trim())) end++;
        nameText = words.slice(0, anchor).map(wd => wd.text).join(' ');   // space 結合 (EN token 分割用。CJK は _norm が除去)
        // 値の絶対 x 位置 (元画像幅比)。詳細画面 = 右端寄せ列 (≥0.75)、強化画面 = 名前直後 (可変 <0.75)
        // — badge word が name↔値間に読まれるため gap でなく絶対位置で測る (2026-06-07 実測)
        gapRatio = ((b.trimX0 || 0) + words[anchor].bbox.x0 / (b.scale || 3)) / (b.origW || src.width);
        numText = words.slice(anchor, end + 1).map(wd => wd.text).join('');
        // value 領域 2-pass (whitelist)
        const x0 = Math.max(0, words[anchor].bbox.x0 - 8);
        const x1 = Math.min(src.width, words[end].bbox.x1 + 8);
        if (x1 - x0 > 8) {
          const c3 = document.createElement('canvas');
          c3.width = x1 - x0; c3.height = src.height;
          const ctx3 = c3.getContext('2d');
          ctx3.fillStyle = '#fff'; ctx3.fillRect(0, 0, c3.width, c3.height);
          ctx3.drawImage(src, x0, 0, c3.width, c3.height, 0, 0, c3.width, c3.height);
          // 第 3 候補: nearest-neighbor 2x (italic 金数字の 8↔9 混同対策 — エッジ保存拡大)
          const c4 = document.createElement('canvas');
          c4.width = c3.width * 2; c4.height = c3.height * 2;
          const ctx4 = c4.getContext('2d');
          ctx4.imageSmoothingEnabled = false;
          ctx4.drawImage(c3, 0, 0, c4.width, c4.height);
          // gray + binary + nearest2x を digits 専用 worker (eng) で認識 → ゲーム数値書式適合 +
          // 高確信の候補を採用 (jpn model は 8↔9 に弱い — digits は常に eng で読む、2026-06-07 実測)
          const dWorker = await _getDigitsWorker(onProgress);
          const rA = await dWorker.recognize(c3);
          const rB = await dWorker.recognize(_binarizeCanvas(c3));
          const rC = await dWorker.recognize(c4);
          const gf = /^[+＋]?\d{1,3}[.,]\d[%％]?$/;
          const t1c = String(numText || '').replace(/\s+/g, '');
          const cands = [
            { t: (rA.data.text || '').trim().replace(/\s+/g, ''), cf: rA.data.confidence || 0 },
            { t: (rB.data.text || '').trim().replace(/\s+/g, ''), cf: rB.data.confidence || 0 },
            { t: (rC.data.text || '').trim().replace(/\s+/g, ''), cf: rC.data.confidence || 0 },
            { t: t1c, cf: (data.confidence || 0) }
          ].filter(c => /\d/.test(c.t));
          // 8↔9 等で候補が割れた時: 全候補一致なら確信維持、不一致なら採用しつつ要警戒側へ
          // (多数決は誤読側に倒れる事があり不採用 — 2026-06-07 実測。残る誤差は app 側 MAX 超過 check が拾う)
          const fit = cands.filter(c => gf.test(c.t)).sort((a, b) => b.cf - a.cf);
          if (fit.length) {
            numText = fit[0].t; numConf = fit[0].cf;
            // gray/binary が書式適合で一致 → 確信 boost、不一致 → 要警戒
            if (fit.length >= 2 && fit[0].t !== fit[1].t) numConf = Math.min(numConf, 55);
          } else if (cands.length) {
            const bestC = cands.sort((a, b) => b.cf - a.cf)[0];
            numText = bestC.t; numConf = Math.min(bestC.cf, 20);   // 全候補 書式崩れ → 低確信
          }
        }
      }
      out.push({ text, conf: data.confidence, numConf, nameText, numText, gapRatio, wrapped: !!b.wrapped, y0: b.y0, y1: b.y1 });
    }
    return out;
  }

  // ════════════════════════════════════════════════════════════
  // parse: 折返し結合 → Lv 行 / affix 行 (名前 + 数値) 抽出
  // ════════════════════════════════════════════════════════════
  function _parseLines(lines, detailMode) {
    const merged = [];
    for (const ln of lines) {
      const t = (ln.text || '').trim();
      if (!t) continue;
      // 折返し断片 (% や数値のみで名前なし) → 直前行に結合 (兄貴画像の `+4.5` / `%` 分離対応)
      // ただし前行が既に数値で完結している場合、% を含まない数値専用行は結合しない (別 affix 値の可能性)
      if (merged.length && /^[%％+＋\d.,\s]+$/.test(t)) {
        const prev = merged[merged.length - 1];
        const prevHasNum = /[\d０-９]\s*[%％]?\s*$/.test(prev.text) || (prev.numText && /\d/.test(prev.numText));
        if (/[%％]/.test(t) || !prevHasNum) {
          prev.text += t;
          if (/[%％]/.test(t) && prev.numText && !/[%％]/.test(prev.numText)) prev.numText += '%';   // 折返し % を構造側にも反映
          continue;
        }
        continue;   // 数値専用 + 前行完結 → 名前なし断片として破棄
      }
      merged.push({ text: t, conf: ln.conf, numConf: ln.numConf, nameText: ln.nameText, numText: ln.numText, wrapped: ln.wrapped, y0: ln.y0, y1: ln.y1 });
    }
    // Lv pre-pass: 明示表記 (Lv.91 / Tier 91) を全行から先に探す —
    // integer fallback より優先 (装備詳細画面の「境地 ▼27」誤爆対策、2026-06-07 実測)
    let lv = null;
    const lvRe = /(?:Lv|Tier)\.?\s*(\d{1,3})|(\d{1,3})\s*[阶级단]/i;   // Lv.91 / Tier 91 / 91阶·91级 (zh) / 91단 (ko)
    for (const ln of merged) {
      const m = ln.text.match(lvRe);
      if (m && !/[+＋]/.test(ln.text)) {
        const v = parseInt(m[1] || m[2], 10);
        if (v >= 1 && v <= 130) { lv = v; break; }
      }
    }
    const affixes = [];
    let lastAffix = null;   // detailMode: 折返し名前尾の追記先
    let lvFromLabel = null; // Lv label 行 (digits worker 正読値) — lvRe 値より優先
    let lvLabelArm = false; // 「장비 레벨」等 label 単独行の直後の数値行を Lv とみなす arm
    for (const ln of merged) {
      // 明示 Lv 行は affix として解釈しない
      if (lvRe.test(ln.text) && !/[+＋]/.test(ln.text)) continue;
      // Lv fallback: 「Lv」自体が誤読された帯 (笛 icon + gradient) — affix より上 + 短い名前 +
      // 小数点なし整数 1..130 → Lv とみなす (実 affix 値は全て小数 1 桁表記 = 整数にならない)
      // 明示 Lv が文書内に存在する場合は発動しない (pre-pass 優先)
      if (lv == null && !affixes.length) {
        const intM = ln.text.match(/(?:^|[^\d.,])(\d{1,3})(?![\d.,%％])\s*$/);
        if (intM) {
          const v = parseInt(intM[1], 10);
          const nameLen = ln.text.replace(/[\d\s.,%％+＋|。]/g, '').length;
          if (v >= 1 && v <= 130 && nameLen <= 4) { lv = v; continue; }
        }
      }
      // 構造分離済み (word bbox 由来) を優先、無ければ text regex fallback
      let name = null, value = null, isPct = false, rawNum = '';
      if (ln.nameText && ln.numText && /\d/.test(ln.numText)) {
        const vm = String(ln.numText).match(/(\d+(?:[.,]\d+)?)\s*([%％])?/);
        if (vm) { name = ln.nameText; value = parseFloat(vm[1].replace(',', '.')); isPct = !!vm[2]; rawNum = vm[1]; }
      }
      if (name == null) {
        const numM = ln.text.match(/[+＋]?\s*(\d+(?:[.,]\d+)?)\s*([%％])?\s*$/);
        if (!numM) {
          // Lv label 単独行 (장비 레벨 / Required Level / 穿戴等级…) → 次の数値行を Lv として採用 arm
          if (/레벨|level|等级|等級|レベル/i.test(ln.text)) { lvLabelArm = true; continue; }
          // detailMode (装備詳細画面): 数値なし行 = 直前 affix の折返し名前尾
          // (「単体爆発系奇術ダメージ / 増加」「[Turn]Maximum / Bamboocut Attack」)。y 近接 (<22px) のみ
          if (detailMode && lastAffix && ln.y0 != null && lastAffix.y1 != null && (ln.y0 - lastAffix.y1) < 22) {
            const tail = ln.text.trim();
            if (/[一-龯ぁ-んァ-ヶ가-힣]|[A-Za-z]{2}/.test(tail)) lastAffix.name += ' ' + tail;
          }
          continue;
        }
        name = ln.text.slice(0, numM.index).trim();
        value = parseFloat(numM[1].replace(',', '.'));
        isPct = !!numM[2];
        rawNum = numM[1];
      }
      if (!name) continue;
      // Lv label 行 (装備レベル/Required Level/穿戴等级/장비 레벨 + 整数値): digits worker が
      // 正読した numText を Lv として最優先採用 (kor model が 91단 を 97 と誤読する事への対策)。
      // label が前行単独だった場合 (arm) も同様 — bottom の「장비 레벨 / Lv.91」2 行構造
      if ((lvLabelArm || /레벨|level|等级|等級|レベル/i.test(name)) && !/\d[.,]\d/.test(String(rawNum))) {
        const lvV = parseInt(rawNum, 10);
        lvLabelArm = false;
        if (lvV >= 1 && lvV <= 130) { lvFromLabel = lvV; continue; }
      }
      lvLabelArm = false;
      // wrapped (折返し分割) 行の値は常に要確認扱い (3↔8 等の誤読難所、PoC 実測)
      let nc = ln.numConf != null ? ln.numConf / 100 : null;
      if (ln.wrapped) nc = Math.min(nc != null ? nc : (ln.conf || 0) / 100, 0.4);
      const rec = {
        name,
        value,
        isPct,
        rawNum,
        y0: ln.y0,
        y1: ln.y1,
        conf: (ln.conf || 0) / 100,
        numConf: nc
      };
      affixes.push(rec);
      lastAffix = rec;
    }
    return { lv: lvFromLabel != null ? lvFromLabel : lv, affixes };
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
  // affix 名照合用の正規化: ゲーム内表記と辞書ラベルの系統差を吸収 (PoC 実測で確定)
  //   ゲーム内「会心率強化」 vs 辞書「会心率」 / 「最大瞬嵐攻撃力」 vs 「最大瞬嵐攻撃」 /
  //   「縄鏢武学ダメージ増加」 vs 「縄鏢ダメ」 / 「獄炎の双剣・軽撃ダメージ」 vs 「獄炎の双剣 軽撃強化」
  // OCR 系統誤読の補正表 (閉語彙だから安全 — 左辺の文字列は正しい affix 名に出現しない、PoC 実測群)
  const _OCR_CONFUSIONS = [
    ['中水', '中率'], ['心挙', '心率'], ['挙強', '率強'],
    ['瞬風', '瞬嵐'], ['隊風', '瞬嵐'], ['隣風', '瞬嵐'],
    ['縄鐘', '縄鏢'], ['綿通', '貫通'], ['真通', '貫通'],
    ['獄半', '獄炎'], ['弘炎', '獄炎'], ['金武術', '全武術'],
    ['軽掌', '軽撃'], ['双多', '双剣'], ['御領', '首領'],
    ['記ダメ', '鼠ダメ'], ['和ダメ', '鼠ダメ'], ['基加', '増加'],
    // ['破竹','瞬岚'] は 2026-06-07 dict zh 全面改訂 (ゲーム内訳=破竹 採用) で廃止 — 残すと正読を壊す
    ['起学', '武学'],   // zh OCR: 武→起
    ['筷筷', '鼠鼠'],   // zh OCR: 鼠鼠→筷筷
    ['8055', 'boss'], ['피빼', '피해']   // ko OCR: BOSS→8055 / 피해→피빼
  ];
  function _applyConfusions(t) {
    for (const [bad, good] of _OCR_CONFUSIONS) t = t.split(bad).join(good);
    return t;
  }
  function _normName(s) {
    let t = _applyConfusions(_norm(s)
      .replace(/[\[(（【「［][^\])）】」］]{0,6}[\])）】」］]/g, '')   // 短い括弧 token ([転]/[Turn] の誤読含む) 除去
      .replace(/[・･·•]/g, ''));
    t = t.replace(/[四加回のロ口|컵캡켈법멀케맵팹]+$/, '');             // 末尾の badge(👍) 誤読文字 strip (四/加/캡 等 — 実測群)
    t = t.replace(/攻撃力(?=強化$|$)/, '攻撃');                       // 攻撃力 → 攻撃 (単独 stat「力」は温存)
    t = t.replace(/攻击力(?=强化$|$)/, '攻击');                       // zh 簡体 同様
    for (let i = 0; i < 3; i++) {
      // suffix 剥がし: ja + zh 簡体 + ko + en (ゲーム内表記の末尾修飾 — 辞書ラベルは短縮形)
      const t2 = t.replace(/(強化|増加|ダメージ|ダメ|効果|アップ|强化|增加|伤害|增伤|增效|效果|提升|강화|증가|피해|효과|boost|increase|damage|dmg)$/, '');
      if (t2 === t) break;
      if (t2.length < 3) break;                                       // over-strip 防止 (双剣ダメ→双剣 化で window 吸込み事故)
      t = t2;
    }
    return t;
  }
  // 系統差が正規化で吸収できない別名 → statKey 直結 (ja。他言語は PoC 後に拡張)
  const _NAME_ALIASES = {
    '首領に与える': 'bossDmg',
    '首领': 'bossDmg',          // zh: 对首领单位增伤 (dict 一致済だが誤読頑健性で維持)
    // '精准'/'敏' alias は 2026-06-07 dict zh 改訂 (精准率/敏 採用) で廃止 — exact match が立つ
    '全武術': 'allWeaponDmg',
    '全武术': 'allWeaponDmg',   // zh 簡体 (全武术增效 表記ブレ保険 — 実測は 全武学增效)
    '全武学': 'allWeaponDmg',
    '전체무술': 'allWeaponDmg'   // ko: 전체 무술 효과 증가
  };
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
  // 武術固有 suffix (軽撃/Q/鼠/特殊/チャージ…) 用正規化 — 短語彙なので min ガードなしで剥がす
  function _normSuffixK(s) {
    let t = _applyConfusions(_norm(s).replace(/[・･·•]/g, '')).replace(/[四加回のロ口|컵캡켈법멀케맵팹]+$/, '');
    for (let i = 0; i < 3; i++) {
      const t2 = t.replace(/(強化|増加|ダメージ|ダメ|効果|アップ|强化|增加|伤害|增伤|增效|效果|提升|강화|증가|피해|효과|boost|increase|damage|dmg)$/, '');
      if (t2 === t) break;
      t = t2;
    }
    return t;
  }
  // 武術固有行 (・付き): 「<武術名>・<種別>」を分割 match。種別 suffix は一意性が高く
  // 武術名部分 (icon glow 上) の誤読に頑健 (PoC 実測: ドクめ火のが知・軽撃 → 獄炎の双剣 軽撃強化)
  function _matchKongfuRow(parsedName, options) {
    // 中黒 (ja) / · (zh) / ハイフン (en) + 「CJK に挟まれた .」(中黒の OCR 誤読) を区切りとして分割
    const parts = String(parsedName).split(/[・･·•\-–—]|(?<=[一-龯ぁ-んァ-ヶ])\s*[.．]\s*(?=[一-龯ぁ-んァ-ヶ])/);
    if (parts.length < 2) return null;
    const qSuf = _normSuffixK(parts[parts.length - 1]);
    const qPre = _normName(parts.slice(0, -1).join(''));
    let best = null;
    for (const o of options) {
      const sp = String(o.name).split(/\s+/);
      if (sp.length < 2) continue;                 // 固有 label = 「<武術名> <種別>強化」形のみ対象
      // 末尾語が 強化/강화 等の汎用 suffix で strip 後空になる label (「쥐 강화」二語形) は
      // 1 つ前の語を種別 suffix とする (空 cSuf は includes('') が常 true になる罠 — 2026-06-07 実測)
      let cSufIdx = sp.length - 1;
      let cSuf = _normSuffixK(sp[cSufIdx]);
      if (!cSuf && sp.length >= 3) { cSufIdx = sp.length - 2; cSuf = _normSuffixK(sp[cSufIdx]); }
      const cPre = _normName(sp.slice(0, cSufIdx).join(''));
      let sufSim;
      if (qSuf && cSuf && qSuf === cSuf) sufSim = 1;
      else if (qSuf && cSuf && (qSuf.startsWith(cSuf) || cSuf.startsWith(qSuf))) sufSim = 0.9;   // 鼠鼠⊃鼠 / 쥐기술⊃쥐 (種別語は先頭 — includes だと 기술 等の汎用語に吸われる)
      else if (qSuf.length < 2 || cSuf.length < 1) sufSim = 0;
      else sufSim = _dice(qSuf, cSuf);
      const preSim = (qPre.length >= 2 && cPre.length >= 2) ? _dice(qPre, cPre) : 0;
      // suffix 支配: 種別 (軽撃/鼠/쥐/Q…) は一意性が高い。suffix 不一致の候補は prefix が
      // 完全一致でも採らない (kongfu 名は dict↔game で訳ブレあり — zh 粟子游尘 vs 浮尘绳镖 実測。
      //  ko 縄 2 種 swap は 2026-06-07 dict 側修正済だが、 防御機構として suffix 支配は維持)
      const sim = sufSim > 0 ? (0.8 * sufSim + 0.2 * preSim) : 0;
      if (!best || sim > best.sim) best = { option: o, sim };
    }
    return best;
  }
  // ── EN 専用 matcher: 辞書ラベルが語順違いの略称 (Maximum Bamboocut Attack vs Bam ATK Max)
  //    → 単語 canon 化 + stopword 除去 + 複合略語 → token-set Dice (語順非依存)
  const _EN_CANON = {
    maximum: 'max', minimum: 'min', physical: 'phys', attack: 'atk', attacks: 'atk',
    penetration: 'pen', critical: 'crit', bamboocut: 'bam', bellstrike: 'bell',
    stonesplit: 'stone', silkbind: 'silk', twinblades: 'tb', damage: 'dmg', agility: 'agi'
  };
  const _EN_STOP = new Set(['rate', 'boost', 'increase', 'of', 'art', 'the', 'against', 'units', 'combat', 'skill', 'arts', 'to', 'dealt', 'turn']);
  const _EN_COMPOUNDS = [[' rope dart ', ' rd '], [' light atk ', ' la '], [' single target ', ' st ']];
  function _enTokens(s) {
    const raw = String(s).toLowerCase()
      .replace(/\[[^\]]{0,6}\]/g, ' ')
      .split(/[^a-z0-9]+/).filter(Boolean);
    const toks = raw.map(t => _EN_CANON[t] || t).filter(t => !_EN_STOP.has(t));
    let j = ' ' + toks.join(' ') + ' ';
    for (const [a, b] of _EN_COMPOUNDS) j = j.split(a).join(b);
    return j.trim().split(/\s+/).filter(Boolean);
  }
  function _matchAffixEn(parsedName, options) {
    const qt = _enTokens(parsedName);
    if (!qt.length) return null;
    const qset = new Set(qt);
    let best = null;
    for (const o of options) {
      const ct = _enTokens(o.name);
      if (!ct.length) continue;
      const cset = new Set(ct);
      let inter = 0;
      for (const t of cset) if (qset.has(t)) inter++;
      const sim = (2 * inter) / (qset.size + cset.size);
      if (!best || sim > best.sim) best = { option: o, sim };
    }
    return (best && best.sim >= 0.4) ? best : null;
  }
  function _matchAffix(parsedName, options) {
    // Latin 主体の query (= EN スクショ) → token-set matcher へ (CJK 混在時は通常経路)
    if (/[a-z]/i.test(String(parsedName)) && !/[一-龯ぁ-んァ-ヶ가-힣]/.test(String(parsedName))) {
      return _matchAffixEn(parsedName, options);
    }
    const q = _normName(parsedName);
    if (!q) return null;
    // 中黒 (・/·) 持ち = 武術固有 affix (獄炎の双剣・軽撃 等) → window だと「軽撃ダメ」等の
    // 短い汎用候補が部分一致 1.0 で吸う → 全文 dice (長い固有候補が自然に勝つ) に切替
    const isKongfuSpecific = /[・･·•]|[一-龯ぁ-んァ-ヶ가-힣]\s*[-‐－.．]\s*[一-龯ぁ-んァ-ヶ가-힣]/.test(String(parsedName));
    // alias 直結 (正規化で吸収不能な系統差): q が alias を含む → 該当 statKey の option へ
    for (const [alias, sk] of Object.entries(_NAME_ALIASES)) {
      if (q.includes(alias)) {
        const o = options.find(o => o.statKey === sk);
        if (o) return { option: o, sim: 0.95 };
      }
    }
    // ゲーム内「X武学(ダメージ増加)」 = 辞書「Xダメ」 (武器種ダメ系の系統差)
    const qAlt = q.replace(/武学$/, 'ダメ');
    const qAlt2 = q.replace(/武学$/, '伤害');   // zh legacy: dict 改訂前 (X伤害) 互換。改訂後は exact match が先に立つ
    const qAlt3 = q.replace(/무술$/, '피해');   // ko: 승표 무술 (피해 증가) = dict 승표 피해
    let best = null;
    for (const o of options) {
      const c = _normName(o.name);
      let sim;
      if (q === c || qAlt === c || qAlt2 === c || qAlt3 === c) sim = q === c ? 1 : 0.95;
      else if (q.length < 2) sim = c.includes(q) ? 0.9 : 0;   // `会` 等 1 文字 query 救済
      else if (c.length === 1 && q.length <= 2 && q[0] === c) sim = 0.55;   // 1 文字 stat + badge 誤読 (`速回`) — 弱め fallback (会意→会 吸込み防止)
      else if (c.length < 2) sim = 0;                          // 1 文字候補に長い query を吸わせない (会心準代→会 誤match 対策)
      else sim = isKongfuSpecific ? _dice(q, c) : _bestWindowDice(q, c);
      if (!best || sim > best.sim) best = { option: o, sim };
    }
    // 武術固有行は分割 match (suffix 重視) も試し、良い方を採用
    if (isKongfuSpecific) {
      const kr = _matchKongfuRow(parsedName, options);
      if (kr && (!best || kr.sim > best.sim)) best = kr;
    }
    return (best && best.sim >= 0.4) ? best : null;
  }
  // query 前後の OCR ゴミ (glow 誤読/badge 等) に頑健な window 最大 dice
  function _bestWindowDice(q, c) {
    let best = _dice(q, c);
    if (q.length <= c.length + 1) return best;
    for (const len of [c.length, c.length + 1]) {
      for (let s = 0; s + len <= q.length; s++) {
        const d = _dice(q.slice(s, s + len), c);
        if (d > best) best = d;
      }
    }
    return best;
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
    // detailMode = 装備詳細画面。判別 = name↔値 の水平 gap 中央値 (詳細画面は値が右端寄せ = gap 巨大、
    // 旧 強化画面は値が名前直後 = gap 極小。言語非依存・separator/装飾に依存しない — 2026-06-07 実測)
    const gaps = lines.map(l => l.gapRatio).filter(g => g != null);
    const detailMode = gaps.filter(g => g >= 0.75).length >= 4;   // 値 x ≥75%幅 が 4 行以上 = 右端寄せ列 = 詳細画面 — 実測
    const { lv, affixes } = _parseLines(lines, detailMode);
    if (detailMode) {
      // ── 装備詳細画面: affix = 小数 1 桁値の行のみ (基礎ステ/セット効果/耐久度 = 整数 = 自然排除)。
      //    行順 = idx。値誤読で小数が落ちた行は欠落 → <6 安全弁で全行要確認化
      const gfded = (a) => /\d[.,]\d$/.test(String(a.rawNum || ''));
      const rows = [];
      {
        // 最後の 6 小数行 = affix 区画 (基礎ステは常に上 = 先頭から溢れる方を捨てる。
        //  基礎ステの小数誤読 71→71.0 等の混入対策 — 2026-06-07 EN 実測)
        let sec = affixes.filter(a => gfded(a));
        if (sec.length > 6) sec = sec.slice(-6);
        // line × idx 全組合せ match → 厳密最適割当 (line/idx 各 1 回)。
        // screenshot の装備と modal の装備 (現装備) は別 item が通常 = affix 並び順が違い、
        // かつ idx 別候補 pool は偏在 (例: maxBamboocut = pool2 のみ)。位置固定や greedy だと
        // pool 一意の affix が先に枠を奪われ同系弱 match に吸われる
        //   (2026-06-07 実測: [转]最大破竹攻击 → 最小破竹攻击 0.60 誤吸収)。
        // 高々 6 line × 6 idx = 720 経路 → 全列挙で ①割当数 max ②Σsim max ③Σ|i-j| min。
        const optsCache = [];
        for (let j = 0; j < 6; j++) optsCache.push(ctx.getOptions(j) || []);
        const cand = [];
        for (let i = 0; i < sec.length && i < 6; i++) {
          const arr = [];
          for (let j = 0; j < 6; j++) {
            const m = _matchAffix(sec[i].name, optsCache[j]);
            if (m) arr.push({ j, m });
          }
          cand.push(arr);
        }
        let bestAsg = null;
        const cur = [];
        (function dfs(i, used, cnt, simSum, dist) {
          if (i === cand.length) {
            if (!bestAsg || cnt > bestAsg.cnt ||
                (cnt === bestAsg.cnt && (simSum > bestAsg.simSum + 1e-9 ||
                 (Math.abs(simSum - bestAsg.simSum) <= 1e-9 && dist < bestAsg.dist)))) {
              bestAsg = { cnt, simSum, dist, asg: cur.slice() };
            }
            return;
          }
          for (const c of cand[i]) {
            if (used & (1 << c.j)) continue;
            cur.push({ i, j: c.j, m: c.m });
            dfs(i + 1, used | (1 << c.j), cnt + 1, simSum + c.m.sim, dist + Math.abs(i - c.j));
            cur.pop();
          }
          dfs(i + 1, used, cnt, simSum, dist);   // この行は未割当 (全 pool match 不能)
        })(0, 0, 0, 0, 0);
        for (const c of (bestAsg ? bestAsg.asg : [])) {
          const a = sec[c.i];
          const numC = a.numConf != null ? a.numConf : a.conf;
          rows.push({
            idx: c.j,
            affixId: c.m.option.id,
            statKey: c.m.option.statKey,
            name: c.m.option.name,
            value: a.value,
            isPct: a.isPct,
            confidence: Math.min(a.conf, numC) * c.m.sim,
            sim: c.m.sim
          });
        }
        rows.sort((x, y) => x.idx - y.idx);
        // 安全弁: 小数行 <6 = 行欠落の疑い (値誤読で小数が落ちた等) → 全行要確認化
        if (sec.length < 6) {
          for (const r of rows) r.confidence = Math.min(r.confidence, 0.4);
        }
      }
      return { lv, rows, parsedCount: affixes.length };
    }
    // phantom 行除去: glow 等の幻 band は「全 idx で match 不成立 ∧ 値が非ゲーム書式 (整数等)」
    // — 残すと後続行の idx がズレる (PoC 実測: 外功貫通が idx6 落ちで消失)
    // ただし除去は parsed > 6 (= 幻行が確実に混入) の時だけ。≤6 なら garbage 行 = 実行の誤読
    // の可能性があり、除去すると逆に idx がズレる (PoC image3 実測) → 位置保持して未投入に
    const gfVal = (a) => /\d[.,]\d$/.test(String(a.rawNum || ''));   // ゲーム書式 = 小数 1 桁 (raw 文字列で判定、54.0→54 化対策)
    const anyMatch = (a) => {
      for (let j = 0; j < 6; j++) {
        if (_matchAffix(a.name, ctx.getOptions(j) || [])) return true;
      }
      return false;
    };
    const seq = affixes.length > 6 ? affixes.filter(a => gfVal(a) || anyMatch(a)) : affixes;
    const rows = [];
    for (let i = 0; i < seq.length && i < 6; i++) {
      const a = seq[i];
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
    // 安全弁: parse 行数 < 6 = 行消失の疑い (折返し/glow 行の崩壊) → 位置 idx が無言シフトしうる
    // → 全行を要確認扱いに落とす (ja は常時 6 行 parse = 影響なし。EN 折返し多発時の誤投入防止)
    if (affixes.length < 6) {
      for (const r of rows) r.confidence = Math.min(r.confidence, 0.4);
    }
    return { lv, rows, parsedCount: affixes.length };
  }

  window.WWMSidebar.ocr = {
    run,
    LANG_MAP,
    // PoC / debug 用 internal 公開 (_ocrLines は共有 worker 使用 — 並行呼出し不可、本番は run() 経由)
    _internals: { _preprocess, _segmentLines, _trimRange, _parseLines, _matchAffix, _norm, _dice, _ocrLines }
  };
})();
