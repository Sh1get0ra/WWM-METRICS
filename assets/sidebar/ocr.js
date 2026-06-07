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
    const barRun = w * 0.35;                        // これ以上の連続 run = バー
    const bands = [];
    let start = -1;
    for (let y = 0; y < h; y++) {
      let c = 0, run = 0, maxRun = 0;
      for (let x = 0; x < w; x++) {
        if (gray[y * w + x] < gth) { c++; run++; if (run > maxRun) maxRun = run; }
        else run = 0;
      }
      const isText = c >= inkTh && maxRun < barRun;
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
      return { canvas: c2, y0: b.y0, y1: b.y1 };
    });
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

  const _CJK_RE = /[一-龯ぁ-んァ-ヶ]/;
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
      // Lv 帯 rescue: "Lv" は読めたが数字が誤読 (gradient 帯) → 数字 whitelist で再認識
      if (/lv/i.test(text) && !/lv\.?\s*\d/i.test(text)) {
        await worker.setParameters({ tessedit_char_whitelist: 'Lv.0123456789' });
        const rLv = await worker.recognize(src);
        await worker.setParameters({ tessedit_char_whitelist: '' });
        const tLv = (rLv.data.text || '').trim();
        if (/lv\.?\s*\d/i.test(tLv)) text = tLv;
      }
      let numConf = null, nameText = null, numText = null;
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
        nameText = words.slice(0, anchor).map(wd => wd.text).join('');
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
          // gray + binary 両方で whitelist 認識 → ゲーム数値書式 (常に小数 1 桁 +X.Y[%]) 適合
          // かつ高確信の候補を採用 (8↔9/8↔6 混同の票決、PoC 実測で確定)
          await worker.setParameters({ tessedit_char_whitelist: '0123456789.+%' });
          const rA = await worker.recognize(c3);
          const rB = await worker.recognize(_binarizeCanvas(c3));
          await worker.setParameters({ tessedit_char_whitelist: '' });
          const gf = /^[+＋]?\d{1,3}[.,]\d[%％]?$/;
          const t1c = String(numText || '').replace(/\s+/g, '');
          const cands = [
            { t: (rA.data.text || '').trim().replace(/\s+/g, ''), cf: rA.data.confidence || 0 },
            { t: (rB.data.text || '').trim().replace(/\s+/g, ''), cf: rB.data.confidence || 0 },
            { t: t1c, cf: (data.confidence || 0) }
          ].filter(c => /\d/.test(c.t));
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
      out.push({ text, conf: data.confidence, numConf, nameText, numText });
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
        const prev = merged[merged.length - 1];
        const prevHasNum = /[\d０-９]\s*[%％]?\s*$/.test(prev.text) || (prev.numText && /\d/.test(prev.numText));
        if (/[%％]/.test(t) || !prevHasNum) {
          prev.text += t;
          if (/[%％]/.test(t) && prev.numText && !/[%％]/.test(prev.numText)) prev.numText += '%';   // 折返し % を構造側にも反映
          continue;
        }
        continue;   // 数値専用 + 前行完結 → 名前なし断片として破棄
      }
      merged.push({ text: t, conf: ln.conf, numConf: ln.numConf, nameText: ln.nameText, numText: ln.numText });
    }
    let lv = null;
    const affixes = [];
    for (const ln of merged) {
      // Lv 行 = 最初の affix より上 + '+' なし + 1..130 (位置規則で affix 名中の "Lv" 誤読を排除)
      const lvM = ln.text.match(/Lv\.?\s*(\d{1,3})/i);
      if (lvM && !affixes.length && !/[+＋]/.test(ln.text)) {
        const v = parseInt(lvM[1], 10);
        if (v >= 1 && v <= 130) { lv = v; continue; }
      }
      // Lv fallback: 「Lv」自体が誤読された帯 (笛 icon + gradient) — affix より上 + 短い名前 +
      // 小数点なし整数 1..130 → Lv とみなす (実 affix 値は全て小数 1 桁表記 = 整数にならない)
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
        if (!numM) continue;
        name = ln.text.slice(0, numM.index).trim();
        value = parseFloat(numM[1].replace(',', '.'));
        isPct = !!numM[2];
        rawNum = numM[1];
      }
      if (!name) continue;
      affixes.push({
        name,
        value,
        isPct,
        rawNum,
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
  // affix 名照合用の正規化: ゲーム内表記と辞書ラベルの系統差を吸収 (PoC 実測で確定)
  //   ゲーム内「会心率強化」 vs 辞書「会心率」 / 「最大瞬嵐攻撃力」 vs 「最大瞬嵐攻撃」 /
  //   「縄鏢武学ダメージ増加」 vs 「縄鏢ダメ」 / 「獄炎の双剣・軽撃ダメージ」 vs 「獄炎の双剣 軽撃強化」
  // OCR 系統誤読の補正表 (閉語彙だから安全 — 左辺の文字列は正しい affix 名に出現しない、PoC 実測群)
  const _OCR_CONFUSIONS = [
    ['中水', '中率'], ['心挙', '心率'], ['挙強', '率強'],
    ['瞬風', '瞬嵐'], ['隊風', '瞬嵐'], ['隣風', '瞬嵐'],
    ['縄鐘', '縄鏢'], ['綿通', '貫通'], ['真通', '貫通'],
    ['獄半', '獄炎'], ['弘炎', '獄炎'], ['金武術', '全武術'],
    ['軽掌', '軽撃'], ['双多', '双剣'], ['御領', '首領']
  ];
  function _normName(s) {
    let t = _norm(s)
      .replace(/[\[(（【「［][^\])）】」］]{0,3}[\])）】」］]/g, '')   // 短い括弧 token ([転] の誤読含む) 除去
      .replace(/[・･]/g, '');
    for (const [bad, good] of _OCR_CONFUSIONS) t = t.split(bad).join(good);
    t = t.replace(/攻撃力(?=強化$|$)/, '攻撃');                       // 攻撃力 → 攻撃 (単独 stat「力」は温存)
    for (let i = 0; i < 3; i++) {
      const t2 = t.replace(/(強化|増加|ダメージ|ダメ|効果|アップ)$/, '');
      if (t2 === t) break;
      if (t2.length < 3) break;                                       // over-strip 防止 (双剣ダメ→双剣 化で window 吸込み事故)
      t = t2;
    }
    return t;
  }
  // 系統差が正規化で吸収できない別名 → statKey 直結 (ja。他言語は PoC 後に拡張)
  const _NAME_ALIASES = {
    '首領に与える': 'bossDmg',
    '全武術': 'allWeaponDmg',
    '全武学': 'allWeaponDmg'
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
  function _matchAffix(parsedName, options) {
    const q = _normName(parsedName);
    if (!q) return null;
    // 中黒 (・) 持ち = 武術固有 affix (獄炎の双剣・軽撃 等) → window だと「軽撃ダメ」等の
    // 短い汎用候補が部分一致 1.0 で吸う → 全文 dice (長い固有候補が自然に勝つ) に切替
    const isKongfuSpecific = /[・･]/.test(String(parsedName));
    // alias 直結 (正規化で吸収不能な系統差): q が alias を含む → 該当 statKey の option へ
    for (const [alias, sk] of Object.entries(_NAME_ALIASES)) {
      if (q.includes(alias)) {
        const o = options.find(o => o.statKey === sk);
        if (o) return { option: o, sim: 0.95 };
      }
    }
    // ゲーム内「X武学(ダメージ増加)」 = 辞書「Xダメ」 (武器種ダメ系の系統差)
    const qAlt = q.replace(/武学$/, 'ダメ');
    let best = null;
    for (const o of options) {
      const c = _normName(o.name);
      let sim;
      if (q === c || qAlt === c) sim = q === c ? 1 : 0.95;
      else if (q.length < 2) sim = c.includes(q) ? 0.9 : 0;   // `会` 等 1 文字 query 救済
      else if (c.length < 2) sim = 0;                          // 1 文字候補に長い query を吸わせない (会心準代→会 誤match 対策)
      else sim = isKongfuSpecific ? _dice(q, c) : _bestWindowDice(q, c);
      if (!best || sim > best.sim) best = { option: o, sim };
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
    const { lv, affixes } = _parseLines(lines);
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
    return { lv, rows, parsedCount: affixes.length };
  }

  window.WWMSidebar.ocr = {
    run,
    LANG_MAP,
    // PoC / debug 用 internal 公開 (_ocrLines は共有 worker 使用 — 並行呼出し不可、本番は run() 経由)
    _internals: { _preprocess, _segmentLines, _trimRange, _parseLines, _matchAffix, _norm, _dice, _ocrLines }
  };
})();
