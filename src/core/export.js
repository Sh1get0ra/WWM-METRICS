// ── キャラクターカード生成 (EXPORT v2 — 飛簡 modal card pane、 2026-06-12 統合) ──
// 飛簡 (SHARE) modal の card タブに mount: ①背景 (upload/paste/drag + zoom/pan)
// ②テンプレ (武格/軍議) ③表示項目 toggle → Generate → PNG 1200×630 (×2 = 2400×1260)。
// カードは「朱墨軍議」identity 固定 (theme 非連動の独立 artifact)。
// Phase 2.8: window.__WWM_ROLEINFO/__WWM_BASELINE 直接参照 全廃 → WWMState 経由。
const WWM_SITE_URL = 'https://wwm-metrics.pages.dev';

(function () {
  'use strict';

  const CARD_W = 1200, CARD_H = 630;
  const _SETTINGS_KEY = 'wwm_card_settings_v1';
  const _BG_MAX_BYTES = 12 * 1024 * 1024;   // 12MB
  const _BG_MAX_EDGE  = 2600;               // px 超過時 canvas 縮小 (メモリ保護)

  // path 漢字 (HUD 表記、 4言語共通の武侠語彙)
  const _PATH_KANJI = {
    bellstrike: '鋼鳴', stonesplit: '砕岩', silkbind: '糸操',
    bamboocut: '瞬嵐', formless: '無相'
  };
  const _XINFA_NUM = ['一', '二', '三', '四'];

  // ── 外部画像 → dataURL (CORS 安全化、 html2canvas taint 回避) ──────
  const _IMG_DATAURL_CACHE = {};
  function _fetchImgDataUrl(url) {
    if (!url) return Promise.resolve('');
    if (url.startsWith('data:')) return Promise.resolve(url);
    // 同 origin (assets/ 等) はそのまま使える
    if (!/^https?:\/\//.test(url) || url.startsWith(location.origin)) return Promise.resolve(url);
    if (_IMG_DATAURL_CACHE[url]) return Promise.resolve(_IMG_DATAURL_CACHE[url]);
    return fetch(url, { mode: 'cors' }).then(r => r.ok ? r.blob() : null).then(blob => {
      if (!blob) return '';
      return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => { _IMG_DATAURL_CACHE[url] = reader.result; resolve(reader.result); };
        reader.onerror = () => resolve('');
        reader.readAsDataURL(blob);
      });
    }).catch(() => '');
  }

  // ── 武器 local SVG fallback (公式 CDN は CORS 不可 = dataURL 化できない) ──
  const _WT_ICON = {
    sword: 'sword', spear: 'spear', fan: 'fan', umbrella: 'umbrella',
    moBlade: 'glaive', dualBlades: 'dual-blades', ropeDart: 'rope-dart',
    hengBlade: 'katana', gauntlet: 'mailed-fist',
    mo_blade: 'glaive', dual_blades: 'dual-blades', rope_dart: 'rope-dart',
    heng_blade: 'katana'
  };
  const _SVG_GOLD_CACHE = {};
  // assets/icons/*.svg (fill="#fff" 白 silhouette) → 金 recolor + data URL
  async function _weaponIconSvgData(slot, ri) {
    const kid = slot === '1' ? ri.kongfuMain : ri.kongfuSub;
    const wt = window.WWM_KONGFU?.[kid]?.weaponType || '';
    const name = _WT_ICON[wt] || _WT_ICON[wt.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] || 'sword';
    if (_SVG_GOLD_CACHE[name]) return _SVG_GOLD_CACHE[name];
    try {
      const txt = await fetch('assets/icons/' + name + '.svg').then(r => r.ok ? r.text() : '');
      if (!txt) return '';
      const gold = txt.replace(/fill="#fff"/g, 'fill="#c9a45a"');
      const url = 'data:image/svg+xml,' + encodeURIComponent(gold);
      _SVG_GOLD_CACHE[name] = url;
      return url;
    } catch (_) { return ''; }
  }

  // ── stat_display.json (4言語ラベル) cache ─────────────────────────
  let _STAT_CFG = null;
  async function _statCfg() {
    if (_STAT_CFG) return _STAT_CFG;
    try {
      _STAT_CFG = await fetch('data/stat_display.json?v=' + (window.WWM_DISPLAY_VERSION || 10)).then(r => r.json());
    } catch (_) { _STAT_CFG = null; }
    return _STAT_CFG;
  }
  function _cfgItem(cfg, sectionKey, itemKey) {
    const sec = (cfg?.sections || []).find(s => s.key === sectionKey);
    return sec?.items?.find(i => i.key === itemKey) || null;
  }
  function _lbl(item, lang) {
    // 2026-06-10 i18n 一本化 P5: stat_display.json label → label_key 参照 (window.T = DataStore Proxy 経由)
    if (item?.label_key) return (window.T && window.T[item.label_key]) || '';
    return (item?.label && (item.label[lang] || item.label.en || item.label.ja)) || '';
  }

  // ── 表示 format helpers ───────────────────────────────────────────
  const _pct = v => (Math.round((v || 0) * 1000) / 10) + '%';
  const _int = v => Math.round(v || 0).toLocaleString();
  const _range = (a, b) => Math.round(a || 0) + '–' + Math.round(b || 0);
  function _esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  // cover crop (html2canvas は object-fit 非対応 → canvas で事前 crop。 失敗時 元画像)
  function _coverCrop(dataUrl, outW, outH) {
    if (!dataUrl) return Promise.resolve('');
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        try {
          const k = Math.max(outW / img.naturalWidth, outH / img.naturalHeight);
          const sw = outW / k, sh = outH / k;
          const sx = (img.naturalWidth - sw) / 2, sy = (img.naturalHeight - sh) / 2;
          const cv = document.createElement('canvas');
          cv.width = outW; cv.height = outH;
          cv.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
          resolve(cv.toDataURL('image/png'));
        } catch (_) { resolve(dataUrl); }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  // 流派 badge dataURL 解決 (bookmarklet _liupaiPicsBase64 = filename keyed dict)
  function _liupaiData(ri, url) {
    if (!url) return '';
    const fn = String(url).split('/').pop().split('?')[0];
    return ri._liupaiPicsBase64?.[fn] || '';
  }

  // ── Tier 判定 (hero.js _tierFromBest と同閾値) ────────────────────
  function _tierFromBest(score) {
    const best = window.WWMState?.opt?.best?.end;
    if (!best || score == null) return '';
    const r = score / best;
    if (r >= 0.95) return 'SS';
    if (r >= 0.90) return 'S';
    if (r >= 0.80) return 'A';
    if (r >= 0.65) return 'B';
    return 'C';
  }

  // ── カード data model 構築 (icon は dataURL 化済) ─────────────────
  async function _buildCardModel() {
    const ri = WWMState.roleInfo;
    if (!ri) return null;
    const lang = window.currentLang || 'ja';
    const p = WWMState.params || {};
    const last = WWMState.lastResult || {};
    const baseline = WWMState.baseline || null;
    const cfg = await _statCfg();

    const score = (baseline && typeof baseline.statusScore === 'number') ? Math.round(baseline.statusScore) : null;
    const tier = _tierFromBest(score);

    // avatar (base64 優先 → URL → roleAvatar dict)。
    // html2canvas は object-fit 非対応 → frame 比率に canvas 事前 crop (武格 portrait 136:160 / 軍議 46:56)
    const avatarRaw = ri._avatarBase64 || ri._avatarUrl
      || (ri.roleAvatar && window.WWM_AVATAR_ICONS?.[ri.roleAvatar]) || '';
    const avatarSrc = await _fetchImgDataUrl(avatarRaw);
    const avatar = await _coverCrop(avatarSrc, 272, 320);   // portrait 用 (2x)
    const avatarSq = await _coverCrop(avatarSrc, 92, 112);  // 軍議 header 用 (2x)

    // 武術 (主/副) — icon + 流派 badge + path
    const icons = window.WWMSidebar?.icons;
    const kongfu = [];
    for (const slot of ['1', '2']) {
      const kid = slot === '1' ? ri.kongfuMain : ri.kongfuSub;
      if (!kid) continue;
      const kf = window.WWM_KONGFU?.[kid];
      const _n = window.WWM_DS.name('kongfu', kid, lang);
      const name = _n.indexOf('[kongfu:') === 0 ? '' : _n;
      // 優先: import 時 base64 (bookmarklet 拡張 2026-06-07、 心法方式) → 公式 CDN は CORS 不可 → local SVG 金 recolor
      let iconSrc = ri._kongfuIconsBase64?.[kid] || '';
      if (!iconSrc) {
        iconSrc = await _fetchImgDataUrl(icons?.gearIconResolve?.(slot, ri) || '');
        if (!iconSrc || /^https?:/.test(iconSrc)) iconSrc = await _weaponIconSvgData(slot, ri);
      }
      // 流派 badge: kid-keyed dict (bookmarklet 第2弾) → filename dict (第4弾) の順。 無ければ skip
      const liupaiSrc = ri._liupaiIconsBase64?.[kid]
        || _liupaiData(ri, icons?.kongfuLiupaiResolve?.(slot, ri)) || '';
      kongfu.push({ kid, name, iconSrc, liupaiSrc, path: _PATH_KANJI[kf?.path] || '', main: slot === '1' });
    }

    // 心法 4 枠 — icon + tier
    const stateSnap = WWMHelpers.storage.loadJSON('wwm_last_state_v1') || {};
    const tiers = stateSnap.xinfaTiers || {};
    const passive = ri.passiveSlots || [];
    const xinfa = [];
    for (let i = 0; i < 4; i++) {
      const xid = passive[i];
      if (!xid) { xinfa.push(null); continue; }
      const x = window.WWM_XINFA?.[xid];
      const _n = window.WWM_DS.name('xinfa', xid, lang);
      const name = _n.indexOf('[xinfa:') === 0 ? ('#' + xid) : _n;
      const iconRaw = ri._xinfaIconsBase64?.[i] || ri._xinfaIcons?.[i]
        || window.WWM_XINFA_ICONS?.[xid]?.icon_url || '';
      const iconSrc = await _fetchImgDataUrl(iconRaw);
      const liupaiSrc = _liupaiData(ri, window.WWM_XINFA_ICONS?.[xid]?.liupai_pic_url);
      xinfa.push({ xid, name, iconSrc, liupaiSrc, tier: tiers[i] ?? tiers[String(i)] ?? 6, rank: x?.rank || '' });
    }

    // 5行ステ (基礎値)
    const stats5 = (() => {
      const sec = (cfg?.sections || []).find(s => s.key === 'basicStats');
      if (!sec) return [];
      return sec.items.map(it => ({ label: _lbl(it, lang), value: _int(p[it.calcKey]) }));
    })();

    // 主要ステータス
    const primary = [];
    if (cfg) {
      const phys = _cfgItem(cfg, 'primaryStats', 'physAtk');
      const elem = _cfgItem(cfg, 'primaryStats', 'elemAtk');
      const hit  = _cfgItem(cfg, 'probability', 'hitRate');
      const crit = _cfgItem(cfg, 'probability', 'critRate');
      const sym  = _cfgItem(cfg, 'probability', 'sympathyRate');
      const cb   = _cfgItem(cfg, 'dmgBoost', 'critBoost');
      const sb   = _cfgItem(cfg, 'dmgBoost', 'sympathyBoost');
      primary.push(
        { label: _lbl(phys, lang), value: _range(p.minPhysATK, p.maxPhysATK) },
        { label: _lbl(elem, lang), value: _range(p.minElemDisp ?? p.minElemMain, p.maxElemDisp ?? p.maxElemMain) },
        { label: _lbl(hit, lang),  value: _pct(p.appliedHit) },
        { label: _lbl(crit, lang), value: _pct(p.appliedCrit) },
        { label: _lbl(sym, lang),  value: _pct(p.appliedSympathy) },
        { label: _lbl(cb, lang),   value: _pct(p.critBoost) },
        { label: _lbl(sb, lang),   value: _pct(p.sympathyBoost) }
      );
    }

    // 奇術 (装備中 8 枠、 _qishuIds[i] → WWM_QISHU_ICONS[id].pic_url で公式 CDN URL 解決。
    // 旧 import data (_qishuIconsBase64) や master 未登録 id は '' で順序保持 — _qishuRow が空 URL skip)
    const _qm = window.WWM_QISHU_ICONS || {};
    const qishu = (ri._qishuIds || []).map(id => (id && _qm[id] && _qm[id].pic_url) || '');

    // 勁率 donut
    const donut = {
      pCrit: p.pCrit || 0, pSym: p.pSympathy || 0,
      pGraze: p.pGraze || 0, pNormal: p.pNormal || 0,
      physRatio: last.physRatio || 0, elemRatio: last.elemRatio || 0
    };

    // 総合武力 (sidebar 表示と同源 = roleInfo.xiuWeiKungFu、 必須表記 2026-06-07 兄貴指示)
    const totalMartial = ri.xiuWeiKungFu || ri.maxXiuWeiKungFu || 0;
    const totalMartialLabel = (cfg?.header?.label_key && window.T && window.T[cfg.header.label_key]) || 'Total Power';

    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    return {
      lang,
      name: ri.roleName || 'unknown',
      level: ri.level || 0,
      totalMartial, totalMartialLabel,
      avatar, avatarSq, score, tier, kongfu, xinfa, qishu, stats5, primary, donut,
      dateStr: now.getFullYear() + '/' + pad(now.getMonth() + 1) + '/' + pad(now.getDate()),
      fileStamp: '' + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate())
        + '-' + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds())
    };
  }

  // ── 勁率 donut (静的 SVG、 hero luopan 直系)。 lp = 紙 panel 用配色 ──
  function _donutSvg(d, size, lp) {
    const C = 2 * Math.PI * 50; // viewBox 136, r 50
    const segs = [
      [d.pCrit,   lp ? '#c9a45a' : '#f0d28a'],   // 会心 = 金
      [d.pSym,    lp ? '#c83c2b' : '#e8513a'],   // 会意 = 朱
      [d.pGraze,  lp ? '#9c8a6a' : '#6a6053'],   // かすり = 灰
      [d.pNormal, lp ? '#4a3526' : '#ede4d0']    // 通常 = 紙 (紙 panel では墨茶)
    ];
    let off = 0, circles = '';
    for (const [v, color] of segs) {
      const len = Math.max(0, Math.min(1, v || 0)) * C;
      if (len > 0.2) {
        circles += '<circle cx="68" cy="68" r="50" fill="none" stroke="' + color + '" stroke-width="15"'
          + ' stroke-dasharray="' + len.toFixed(2) + ' ' + (C - len).toFixed(2) + '"'
          + ' stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 68 68)"/>';
      }
      off += len;
    }
    // 外周 phys/elem 比率 ring (r 64)
    const C2 = 2 * Math.PI * 64;
    const physLen = Math.max(0, Math.min(1, d.physRatio || 0)) * C2;
    const track = lp ? 'rgba(40,25,18,0.10)' : 'rgba(232,215,180,0.10)';
    const ring =
      '<circle cx="68" cy="68" r="64" fill="none" stroke="' + track + '" stroke-width="2.5"/>'
      + '<circle cx="68" cy="68" r="64" fill="none" stroke="' + (lp ? '#c83c2b' : '#e8513a') + '" stroke-width="2.5"'
      + ' stroke-dasharray="' + physLen.toFixed(2) + ' ' + (C2 - physLen).toFixed(2) + '" transform="rotate(-90 68 68)"/>'
      + '<circle cx="68" cy="68" r="64" fill="none" stroke="' + (lp ? '#2d5a3a' : '#a8d4b4') + '" stroke-width="2.5"'
      + ' stroke-dasharray="' + (C2 - physLen).toFixed(2) + ' ' + physLen.toFixed(2) + '"'
      + ' stroke-dashoffset="' + (-physLen).toFixed(2) + '" transform="rotate(-90 68 68)"/>';
    const label = _esc(window.T?.donutDmgCenter ?? '勁率');
    return '<svg viewBox="0 0 136 136" width="' + size + '" height="' + size + '" aria-hidden="true">'
      + '<circle cx="68" cy="68" r="50" fill="none" stroke="' + (lp ? 'rgba(40,25,18,0.07)' : 'rgba(232,215,180,0.07)') + '" stroke-width="15"/>'
      + circles + ring
      + '<text x="68" y="73" text-anchor="middle" font-family="Noto Serif JP,serif" font-weight="700"'
      + ' font-size="15" fill="' + (lp ? '#8a6a20' : '#c9a45a') + '" letter-spacing="2">' + label + '</text>'
      + '</svg>';
  }

  function _judgeRows(d, T) {
    // 色は --cd-* var 参照 — panel 墨/紙 切替に追従 (武格 float は CSS 側で墨値に局所固定)
    const rows = [
      [T?.probCrit ?? '会心', _pct(d.pCrit), 'var(--cd-gold, #f0d28a)'],
      [T?.probSympathy ?? '会意', _pct(d.pSym), 'var(--cd-judge-sym, #e8513a)'],
      [T?.probNormal ?? '通常', _pct(d.pNormal), 'var(--cd-judge-normal, #ede4d0)'],
      [T?.probGraze ?? 'かすり', _pct(d.pGraze), 'var(--cd-mute, #8b8170)'],
      [T?.probPhys ?? '物理', _pct(d.physRatio), 'var(--cd-judge-sym, #e8513a)'],
      [T?.probElem ?? '属性', _pct(d.elemRatio), 'var(--cd-judge-elem, #a8d4b4)']
    ];
    return rows.map(([n, v, c], i) =>
      '<div class="wwm-card-judge-row' + (i === 4 ? ' wwm-card-judge-sep' : '') + '">'
      + '<span class="wwm-card-judge-dot" style="background:' + c + ';"></span>'
      + '<span class="wwm-card-judge-name">' + _esc(n) + '</span>'
      + '<span class="wwm-card-judge-val" style="color:' + c + ';">' + v + '</span>'
      + '</div>').join('');
  }

  // ── カード部品 HTML ───────────────────────────────────────────────
  // 縦長肖像画 frame (公式プロフィールカード踏襲: 金縁 + 四隅飾 + vignette)
  function _portraitHtml(model) {
    const img = model.avatar
      ? '<img class="wwm-card-portrait-img" src="' + model.avatar + '" alt="">'
      : '<span class="wwm-card-portrait-fb">' + _esc((model.name || '?')[0]) + '</span>';
    return '<div class="wwm-card-portrait">'
      + '<span class="wwm-card-pf pf-tl"></span><span class="wwm-card-pf pf-tr"></span>'
      + '<span class="wwm-card-pf pf-bl"></span><span class="wwm-card-pf pf-br"></span>'
      + img
      + '</div>';
  }
  // Lv + 総合武力 行 (必須表記)
  function _lvMartialHtml(model) {
    return 'Lv' + model.level
      + (model.totalMartial ? ' · ' + _esc(model.totalMartialLabel) + ' ' + _int(model.totalMartial) : '');
  }
  // 小型角形肖像 + 名前 (軍議 header 用)
  function _idHtml(model) {
    const av = model.avatarSq
      ? '<img class="wwm-card-avatar" src="' + model.avatarSq + '" alt="">'
      : '<span class="wwm-card-avatar wwm-card-avatar-fb">' + _esc((model.name || '?')[0]) + '</span>';
    return '<div class="wwm-card-id">' + av
      + '<span class="wwm-card-name">' + _esc(model.name)
      + ' <small>' + _lvMartialHtml(model) + '</small></span>'
      + '</div>';
  }
  // 心法 tile 列 (武格 info カラム用: icon + 名称 + T、 横いっぱい 4 列)
  function _xinfaTileRow(model) {
    return '<div class="wwm-card-xtiles">' + model.xinfa.map(x => {
      if (!x) return '<span class="wwm-card-xtile wwm-card-xtile-empty">—</span>';
      const ic = x.iconSrc ? '<img src="' + x.iconSrc + '" alt="">' : '';
      const badge = x.liupaiSrc ? '<img class="wwm-card-liupai" src="' + x.liupaiSrc + '" alt="">' : '';
      return '<span class="wwm-card-xtile">'
        + '<span class="wwm-card-xtile-iconwrap">' + ic + badge + '</span>'
        + '<span class="wwm-card-xtile-name">' + _esc(x.name) + '</span>'
        + '<b>T' + x.tier + '</b></span>';
    }).join('') + '</div>';
  }
  // 武術 compact cell (武格用: icon + 名称のみ、 2026-06-07 兄貴指示)
  function _kongfuCompact(model) {
    return model.kongfu.map(k => {
      const badge = k.liupaiSrc ? '<img class="wwm-card-liupai" src="' + k.liupaiSrc + '" alt="">' : '';
      const icon = k.iconSrc ? '<img class="wwm-card-cell-icon" src="' + k.iconSrc + '" alt="">' : '';
      return '<div class="wwm-card-cell wwm-card-cell-kf wwm-card-kf-compact">'
        + '<span class="wwm-card-cell-iconwrap">' + icon + badge + '</span>'
        + '<span class="wwm-card-cell-name">' + _esc(k.name) + '</span>'
        + '</div>';
    }).join('');
  }
  // 奇術 (装備中 8 枠) — ゲーム内準拠の十字 ×2 配置 (公式 qs-list-empty2 BG と同構造):
  //   ⑥　　②
  // ⑤　⑦　①　③   1 cluster = 4 円 slot (上/左/右/下) + 中央菱形飾り。
  //   ⑧　　④      DOM 順 ①..⑧ → 右十字 (①左/②上/③右/④下) + 左十字 (⑤左/⑥上/⑦右/⑧下)
  const _QISHU_POS = [
    [1, 'left'], [1, 'top'], [1, 'right'], [1, 'bottom'],
    [0, 'left'], [0, 'top'], [0, 'right'], [0, 'bottom']
  ];
  // 十字 slot 飾り BG (公式 qs-list-empty2 を SVG 自作再現 — 再配布回避 + 墨/紙 両対応)
  // slot = 菱形タイル (公式準拠 2026-06-07 兄貴指示、 icon は正立のまま菱形上に乗る)
  function _qishuBgSvg(lp) {
    const line = lp ? 'rgba(40,25,18,0.34)' : 'rgba(232,215,180,0.30)';
    const fill = lp ? 'rgba(40,25,18,0.06)' : 'rgba(232,215,180,0.07)';
    const dia  = lp ? 'rgba(138,31,23,0.30)' : 'rgba(200,60,43,0.35)';
    const s = (cx, cy) => '<rect x="' + (cx - 13.5) + '" y="' + (cy - 13.5)
      + '" width="27" height="27" rx="3" fill="' + fill + '" stroke="' + line
      + '" transform="rotate(45 ' + cx + ' ' + cy + ')"/>';
    const d = (cx, cy) => '<rect x="' + (cx - 4) + '" y="' + (cy - 4) + '" width="8" height="8" fill="' + dia + '" transform="rotate(45 ' + cx + ' ' + cy + ')"/>';
    return '<svg class="wwm-card-qishu-bg" viewBox="0 0 146 146" aria-hidden="true">'
      + '<path d="M40 40 L58 58 M106 40 L88 58 M40 106 L58 88 M106 106 L88 88" stroke="' + line + '" stroke-width="1" fill="none"/>'
      + s(73, 22) + s(22, 73) + s(124, 73) + s(73, 124)
      + d(73, 61) + d(61, 73) + d(85, 73) + d(73, 85)
      + '</svg>';
  }
  function _qishuRow(model, lp) {
    if (!model.qishu.length || !model.qishu.some(Boolean)) return '';
    const cl = [[], []];
    model.qishu.forEach((u, i) => {
      if (!u) return;
      const p = _QISHU_POS[i] || [1, 'left'];
      cl[p[0]].push('<img class="q-' + p[1] + '" src="' + u + '" alt="">');
    });
    const bg = _qishuBgSvg(lp);
    return '<div class="wwm-card-qishu">'
      + '<div class="wwm-card-qishu-x">' + bg + cl[0].join('') + '</div>'
      + '<div class="wwm-card-qishu-x">' + bg + cl[1].join('') + '</div>'
      + '</div>';
  }
  // プレイ時間帯/スタイル chips (選択 0 = 非表示)
  function _playChipsHtml(st, T) {
    const picks = [];
    (st.play?.time || []).forEach(k => { const l = T['cardTime_' + k]; if (l) picks.push(l); });
    (st.play?.style || []).forEach(k => { const l = T['cardStyle_' + k]; if (l) picks.push(l); });
    if (!picks.length) return '';
    return '<div class="wwm-card-playchips">'
      + picks.map(p => '<span class="wwm-card-chip">' + _esc(p) + '</span>').join('')
      + '</div>';
  }
  function _tierHtml(tier, big) {
    if (!tier) return '';
    // class は wwm-ct-* — 既存 .tier-SS (sidebar.css 裸 selector、 shimmer/glow animation 付き) との衝突回避
    return '<span class="wwm-card-tier' + (big ? ' wwm-card-tier-big' : '') + ' wwm-ct-' + tier + '">' + tier + '</span>';
  }
  function _kongfuCells(model) {
    return model.kongfu.map(k => {
      const badge = k.liupaiSrc ? '<img class="wwm-card-liupai" src="' + k.liupaiSrc + '" alt="">' : '';
      const icon = k.iconSrc ? '<img class="wwm-card-cell-icon" src="' + k.iconSrc + '" alt="">' : '';
      return '<div class="wwm-card-cell wwm-card-cell-kf">'
        + '<span class="wwm-card-cell-iconwrap">' + icon + badge + '</span>'
        + '<span class="wwm-card-cell-texts">'
        + '<span class="wwm-card-cell-sub">' + (k.main ? '主' : '副') + (k.path ? ' · ' + k.path : '') + '</span>'
        + '<span class="wwm-card-cell-name">' + _esc(k.name) + '</span>'
        + '</span></div>';
    }).join('');
  }
  function _xinfaCells(model) {
    return model.xinfa.map((x, i) => {
      if (!x) {
        return '<div class="wwm-card-cell wwm-card-cell-xf wwm-card-cell-empty">'
          + '<span class="wwm-card-cell-texts">'
          + '<span class="wwm-card-cell-sub">心法' + _XINFA_NUM[i] + '</span>'
          + '<span class="wwm-card-cell-name">—</span>'
          + '</span></div>';
      }
      const icon = x.iconSrc ? '<img class="wwm-card-cell-icon wwm-card-cell-icon-xf" src="' + x.iconSrc + '" alt="">' : '';
      const badge = x.liupaiSrc ? '<img class="wwm-card-liupai" src="' + x.liupaiSrc + '" alt="">' : '';
      return '<div class="wwm-card-cell wwm-card-cell-xf">'
        + '<span class="wwm-card-cell-iconwrap">' + icon + badge + '</span>'
        + '<span class="wwm-card-cell-texts">'
        + '<span class="wwm-card-cell-sub">心法' + _XINFA_NUM[i] + ' <b class="wwm-card-xf-tier">T' + x.tier + '</b></span>'
        + '<span class="wwm-card-cell-name">' + _esc(x.name) + '</span>'
        + '</span></div>';
    }).join('');
  }
  function _footerHtml(model) {
    // brand はここに集約 (兄貴指示 2026-06-07: タイトルは目立たせずフッターで URL と同居)
    // 著作権表記 = ゲーム内 asset (icon/avatar) 使用のため必須 (兄貴指示 2026-06-07)
    return '<div class="wwm-card-footer">'
      + '<span class="wwm-card-footer-brand"><b class="wwm-card-footer-seal">燕</b>風燕計 <i>WHERE WINDS METRICS</i></span>'
      + '<span class="wwm-card-footer-copy">© NetEase, Inc. All Rights Reserved. © Everstone Studio.</span>'
      + '<span class="wwm-card-footer-meta">' + model.dateStr
      +   ' · <span class="wwm-card-footer-url">' + WWM_SITE_URL.replace(/^https?:\/\//, '') + '</span></span>'
      + '</div>';
  }
  function _scoreValHtml(model) {
    return model.score == null ? '—' : model.score.toLocaleString();
  }

  // ── カード DOM 構築 (preview / capture 共用) ──────────────────────
  function _buildCardEl(model, st) {
    const T = window.T || {};
    const el = document.createElement('div');
    el.className = 'wwm-card wwm-card-' + st.tpl
      + (st.tpl === 'bukaku' ? ' wwm-card-align-' + (st.align === 'right' ? 'right' : 'left') : '')
      + (st.panel === 'light' ? ' wwm-card-panel-light' : '');
    const it = st.items;

    // 背景: ユーザー画像 or 朱墨軍議布地
    let bgHtml;
    if (st.bg.url) {
      bgHtml = '<div class="wwm-card-bg"><img class="wwm-card-bgimg" src="' + st.bg.url + '" alt=""></div>';
    } else {
      bgHtml = '<div class="wwm-card-bg wwm-card-cloth"></div>';
    }

    let body = '';
    if (st.tpl === 'bukaku') {
      // 武格: FF14 キャラカ式 — 情報カラム (左右切替) + 写真素通し
      const infoCol =
        '<div class="wwm-card-info">'
        + _portraitHtml(model)
        + '<div class="wwm-card-info-name">' + _esc(model.name) + ' <small>' + _lvMartialHtml(model) + '</small></div>'
        + '<div class="wwm-card-mi">'
        +   '<div class="wwm-card-mi-label"><span class="ja">武格指数</span><span class="en">'
        +     _esc(T.martialIndexSub ?? 'MARTIAL INDEX') + '</span></div>'
        +   '<div class="wwm-card-mi-row">'
        +     '<span class="wwm-card-mi-num">' + _scoreValHtml(model) + '</span>'
        +     _tierHtml(model.tier, true)
        +   '</div>'
        + '</div>'
        // 上段: 武術 (icon+名称 縦2) | 奇術パネル 横並び → 下段: 心法 4 列 tile (2026-06-07 兄貴レイアウト指示)
        + (() => {
          const kf = it.kongfu ? '<div class="wwm-card-info-arts">' + _kongfuCompact(model) + '</div>' : '';
          const q = (it.qishu && model.qishu.some(Boolean)) ? _qishuRow(model, st.panel === 'light') : '';
          const row = (kf && q) ? '<div class="wwm-card-info-row">' + kf + q + '</div>' : (kf + q);
          return row + (it.xinfa ? _xinfaTileRow(model) : '');
        })()
        + _playChipsHtml(st, T)
        + '</div>';
      body =
        '<div class="wwm-card-bukaku-body">'
        + infoCol
        + '<div class="wwm-card-photo-zone">'
        +   (it.donut
            ? '<div class="wwm-card-luopan wwm-card-luopan-float">' + _donutSvg(model.donut, 132, st.panel === 'light')
              + '<div class="wwm-card-judges">' + _judgeRows(model.donut, T) + '</div></div>'
            : '')
        + '</div>'
        + '</div>'
        + _footerHtml(model);
    } else {
      // 軍議: データ濃いめ
      const cols = [];
      if (it.stats || it.primary) {
        cols.push('<div class="wwm-card-gcol">'
          + (it.stats
            ? '<div class="wwm-card-gsec-title">BASE</div><div class="wwm-card-stats5">'
              + model.stats5.map(s =>
                  '<div class="wwm-card-stat5"><span class="wwm-card-stat5-l">' + _esc(s.label)
                  + '</span><span class="wwm-card-stat5-v">' + s.value + '</span></div>').join('')
              + '</div>'
            : '')
          + (it.primary
            ? '<div class="wwm-card-gsec-title">STATS</div><div class="wwm-card-rows">'
              + model.primary.map(s =>
                  '<div class="wwm-card-row"><span class="wwm-card-row-l">' + _esc(s.label)
                  + '</span><span class="wwm-card-row-v">' + s.value + '</span></div>').join('')
              + '</div>'
            : '')
          + '</div>');
      }
      // MYSTIC は余白のある donut col へ同居 (donut OFF 時のみ col3 へ fallback)
      const qishuBlock = (it.qishu && model.qishu.some(Boolean))
        ? '<div class="wwm-card-gsec-title">MYSTIC</div>' + _qishuRow(model, st.panel === 'light') : '';
      if (it.donut) {
        cols.push('<div class="wwm-card-gcol wwm-card-gcol-donut">'
          + '<div class="wwm-card-gsec-title">RATIO</div>'
          + _donutSvg(model.donut, 168, st.panel === 'light')
          + '<div class="wwm-card-judges">' + _judgeRows(model.donut, T) + '</div>'
          + qishuBlock
          + '</div>');
      }
      if (it.kongfu || it.xinfa || (!it.donut && qishuBlock)) {
        cols.push('<div class="wwm-card-gcol">'
          + (it.kongfu ? '<div class="wwm-card-gsec-title">MARTIAL ARTS</div>' + _kongfuCells(model) : '')
          + (it.xinfa ? '<div class="wwm-card-gsec-title">INNER WAY</div>' + _xinfaCells(model) : '')
          + (!it.donut ? qishuBlock : '')
          + '</div>');
      }
      const chips = _playChipsHtml(st, T);
      body =
        '<div class="wwm-card-ghead">'
        +   _idHtml(model)
        +   '<div class="wwm-card-ghead-score">'
        +     '<span class="wwm-card-mi-label"><span class="ja">武格指数</span></span>'
        +     '<span class="wwm-card-mi-num">' + _scoreValHtml(model) + '</span>'
        +     _tierHtml(model.tier, false)
        +   '</div>'
        + '</div>'
        + '<div class="wwm-card-gbody">' + cols.join('') + '</div>'
        + (chips ? '<div class="wwm-card-gchips">' + chips + '</div>' : '')
        + _footerHtml(model);
    }

    el.innerHTML = bgHtml + '<div class="wwm-card-scrim"></div>'
      + '<div class="wwm-card-content">' + body + '</div>';

    // 背景 transform 適用
    if (st.bg.url) {
      const img = el.querySelector('.wwm-card-bgimg');
      _applyBgTransform(img, st);
    }
    return el;
  }

  function _applyBgTransform(img, st) {
    if (!img || !st.bg.url) return;
    const cover = Math.max(CARD_W / st.bg.w, CARD_H / st.bg.h);
    img.style.width = (st.bg.w * cover) + 'px';
    img.style.height = 'auto';
    img.style.transform = 'translate(-50%,-50%) translate(' + st.bg.x + 'px,' + st.bg.y + 'px) scale(' + st.bg.scale + ')';
  }

  // ── 設定永続化 (背景画像は容量都合で非永続) ───────────────────────
  function _loadSettings() {
    const def = {
      tpl: 'bukaku', align: 'left', panel: 'dark',
      items: { donut: true, stats: true, primary: true, kongfu: true, xinfa: true, qishu: true },
      play: { time: [], style: [] }
    };
    const s = WWMHelpers.storage.loadJSON(_SETTINGS_KEY);
    if (!s) return def;
    return {
      tpl: (s.tpl === 'gungi') ? 'gungi' : 'bukaku',
      align: (s.align === 'right') ? 'right' : 'left',
      panel: (s.panel === 'light') ? 'light' : 'dark',
      items: Object.assign(def.items, { qishu: true }, s.items || {}),
      play: {
        time: Array.isArray(s.play?.time) ? s.play.time : [],
        style: Array.isArray(s.play?.style) ? s.play.style : []
      }
    };
  }
  function _saveSettings(st) {
    WWMHelpers.storage.saveJSON(_SETTINGS_KEY, { tpl: st.tpl, align: st.align, panel: st.panel, items: st.items, play: st.play });
  }

  // プレイ時間帯 / スタイル 選択肢 (i18n key suffix)。
  // スタイルは一般語彙 10 種 (2026-06-07 兄貴指定: PvE/PvP/共闘/探索/試練/演奏/ハウジング/SS勢/エンジョイ勢/ガチ勢)。
  // 旧 key (encounter 等) が settings に残っていても T lookup 失敗で表示 skip = 安全
  const _PLAY_TIME_KEYS = ['wdDay', 'wdNight', 'weDay', 'weNight', 'irregular'];
  const _PLAY_STYLE_KEYS = ['pve', 'pvp', 'coop', 'explore', 'trial', 'music', 'housing', 'ss', 'enjoy', 'gachi'];

  // ── 背景画像読込 (file/blob → 寸法計測 + 必要なら縮小) ────────────
  function _readBgBlob(blob, st, onDone) {
    const T = window.T || {};
    if (!blob || !/^image\//.test(blob.type)) {
      showToast(T.cardBgInvalid ?? '画像ファイルを読み込めませんでした', { error: true });
      return;
    }
    if (blob.size > _BG_MAX_BYTES) {
      showToast(T.cardBgTooLarge ?? '画像が大きすぎます (12MB まで)', { error: true });
      return;
    }
    const objUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      let { naturalWidth: w, naturalHeight: h } = img;
      let url;
      if (Math.max(w, h) > _BG_MAX_EDGE) {
        const k = _BG_MAX_EDGE / Math.max(w, h);
        const cv = document.createElement('canvas');
        cv.width = Math.round(w * k); cv.height = Math.round(h * k);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        url = cv.toDataURL('image/jpeg', 0.92);
        w = cv.width; h = cv.height;
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          URL.revokeObjectURL(objUrl);
          st.bg = { url: reader.result, w, h, x: 0, y: 0, scale: 1 };
          onDone();
        };
        reader.readAsDataURL(blob);
        return;
      }
      URL.revokeObjectURL(objUrl);
      st.bg = { url, w, h, x: 0, y: 0, scale: 1 };
      onDone();
    };
    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      showToast(T.cardBgInvalid ?? '画像ファイルを読み込めませんでした', { error: true });
    };
    img.src = objUrl;
  }

  // X ポスト定型文 (2026-06-07 兄貴指定: URL + hashtag のみ、 文言は各々の趣向に任せる)
  const _POST_TEXT = WWM_SITE_URL + '\n#風燕伝 #WhereWindsMeet #燕云十六声 #연운 #WWM';

  // ── 生成コア (off-screen #export-card → html2canvas ×2 → canvas) ──
  // 「画像を保存」「𝕏 にポスト」 の両 btn が共用 — どちらを押しても生成から実行 (2026-06-07 兄貴提案)
  async function _renderCanvas(model, st) {
    const holder = document.getElementById('export-card');
    holder.style.cssText = 'display:block;position:fixed;left:-99999px;top:0;width:' + CARD_W + 'px;height:' + CARD_H + 'px;overflow:hidden;';
    holder.innerHTML = '';
    holder.appendChild(_buildCardEl(model, st));
    try {
      try { await document.fonts.ready; } catch (_) {}
      await Promise.all([...holder.querySelectorAll('img')].map(im => im.decode().catch(() => {})));
      await new Promise(r => setTimeout(r, 80));
      return await html2canvas(holder.firstElementChild, {
        scale: 2, logging: false, backgroundColor: '#07060a', useCORS: true, imageTimeout: 0
      });
    } finally {
      holder.style.cssText = 'display:none;';
      holder.innerHTML = '';
    }
  }
  // btn busy 化 + 生成 + 後処理 (offline/error guard 共通)
  async function _withCanvas(model, st, btn, after) {
    const T = window.T || {};
    if (typeof html2canvas === 'undefined') {
      showToast(T.errExportOffline ?? '画像書き出しにはオンライン接続が必要です', { error: true });
      return;
    }
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = T.cardGenerating ?? '生成中…';
    try {
      const canvas = await _renderCanvas(model, st);
      await after(canvas);
    } catch (err) {
      console.error('Export error:', err);
      showToast(T.errExportFail ?? '画像書き出しに失敗しました', { error: true });
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  }
  function _cardFileName(model) {
    const safeName = String(model.name).replace(/[^\w一-鿿぀-ヿ]/g, '_');
    return 'WWM-' + safeName + '-' + (model.score ?? 0) + '-' + model.fileStamp + '.png';
  }

  // ── カード生成 pane (飛簡 modal card タブへ mount — 2026-06-12 統合) ──
  // share.js _buildCardPane が呼ぶ。 paneEl = .wwm-share-pane[data-pane="card"]、
  // footerEl = #wwmShareFooter (modal shell / close 経路は share.js 持ち)
  async function mountCardPane(paneEl, footerEl) {
    const T = window.T || {};
    const st = Object.assign(_loadSettings(), { bg: { url: '', w: 0, h: 0, x: 0, y: 0, scale: 1 } });
    // mobile = share sheet で完結。 PC は canShare=true でも share sheet が X に繋がらないため常に intent 経路
    const _isMobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
      || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform)); // iPadOS desktop 擬装

    // 旧 .wwm-card-modal-body class は 2カラム grid CSS の家 → wrapper div として残す。
    // layout-b (2026-06-13 兄貴画像準拠): 左 = stage + 下段 [テンプレ | 背景] / 右 = 表示項目 + プレイ情報
    paneEl.innerHTML =
      '<div class="wwm-card-modal-body wwm-card-layout-b">'
      +   '<div class="wwm-card-left">'
      +     '<div class="wwm-card-stage" id="wwmCardStage"><div class="wwm-card-scalebox" id="wwmCardScale">'
      +       '<div class="wwm-card wwm-card-loading-ph"><div class="wwm-card-bg wwm-card-cloth"></div></div>'
      +     '</div></div>'
      +     '<div class="wwm-card-under">'
      +       '<div class="wwm-card-ctl-section" role="radiogroup" aria-label="' + _esc(T.cardTplSection ?? 'テンプレート') + '">'
      +         '<div class="wwm-card-ctl-title">' + _esc(T.cardTplSection ?? 'テンプレート') + '</div>'
      +         '<div class="wwm-card-tpl-row">'
      +           '<button class="wwm-card-tpl-btn" data-tpl="bukaku" role="radio"><b>武格</b><i>'
      +             _esc(T.cardTplBukaku ?? 'スコア大判') + '</i></button>'
      +           '<button class="wwm-card-tpl-btn" data-tpl="gungi" role="radio"><b>軍議</b><i>'
      +             _esc(T.cardTplGungi ?? 'データ詳細') + '</i></button>'
      +         '</div>'
      +         '<div class="wwm-card-align-row" id="wwmCardAlignRow" role="radiogroup" aria-label="'
      +           _esc(T.cardAlignLabel ?? '情報の位置') + '">'
      +           '<span>' + _esc(T.cardAlignLabel ?? '情報の位置') + '</span>'
      +           '<button class="wwm-card-ctl-btn wwm-card-align-btn" data-align="left" role="radio">'
      +             _esc(T.cardAlignLeft ?? '左') + '</button>'
      +           '<button class="wwm-card-ctl-btn wwm-card-align-btn" data-align="right" role="radio">'
      +             _esc(T.cardAlignRight ?? '右') + '</button>'
      +         '</div>'
      +         '<div class="wwm-card-align-row" role="radiogroup" aria-label="' + _esc(T.cardPanelLabel ?? 'パネル') + '">'
      +           '<span>' + _esc(T.cardPanelLabel ?? 'パネル') + '</span>'
      +           '<button class="wwm-card-ctl-btn wwm-card-panel-btn" data-panel="dark" role="radio">'
      +             _esc(T.cardPanelDark ?? '墨') + '</button>'
      +           '<button class="wwm-card-ctl-btn wwm-card-panel-btn" data-panel="light" role="radio">'
      +             _esc(T.cardPanelLight ?? '紙') + '</button>'
      +         '</div>'
      +       '</div>'
      +       '<div class="wwm-card-ctl-section">'
      +         '<div class="wwm-card-bg-head">'
      +           '<div class="wwm-card-ctl-title">' + _esc(T.cardBgSection ?? '背景') + '</div>'
      +           '<p class="wwm-card-stage-hint">' + _esc(T.cardBgHint ?? 'スクショをドロップ / 貼り付け (Ctrl+V)。ドラッグで位置調整、ホイール/スライダーで拡大') + '</p>'
      +         '</div>'
      +         '<div class="wwm-card-bg-row">'
      +           '<button class="wwm-card-ctl-btn" id="wwmCardBgPick">' + _esc(T.cardBgPick ?? '画像を選ぶ') + '</button>'
      +           '<button class="wwm-card-ctl-btn" id="wwmCardBgClear" disabled>' + _esc(T.cardBgClear ?? 'クリア') + '</button>'
      +           '<input type="file" id="wwmCardBgFile" accept="image/*" hidden>'
      +         '</div>'
      +         '<label class="wwm-card-zoom-row"><span>' + _esc(T.cardBgZoom ?? 'ズーム') + '</span>'
      +           '<input type="range" id="wwmCardBgZoom" min="1" max="3" step="0.05" value="1" disabled '
      +             'aria-label="' + _esc(T.cardBgZoom ?? 'ズーム') + '"></label>'
      +       '</div>'
      +     '</div>'
      +   '</div>'
      +   '<div class="wwm-card-controls">'
      +     '<div class="wwm-card-ctl-section">'
      +       '<div class="wwm-card-ctl-title">' + _esc(T.cardItemsSection ?? '表示項目') + '</div>'
      +       '<div class="wwm-card-toggles">'
      +         _cardToggle('donut', T.donutDmgCenter ?? '勁率', st)
      +         _cardToggle('stats', T.cardItemStats ?? '基礎値', st)
      +         _cardToggle('primary', T.cardItemPrimary ?? '主要ステータス', st)
      +         _cardToggle('kongfu', T.cardItemKongfu ?? '武術', st)
      +         _cardToggle('xinfa', T.cardItemXinfa ?? '心法', st)
      +         _cardToggle('qishu', T.cardItemQishu ?? '奇術', st)
      +       '</div>'
      +     '</div>'
      +     '<div class="wwm-card-ctl-section">'
      +       '<div class="wwm-card-ctl-title">' + _esc(T.cardPlaySection ?? 'プレイ情報') + '</div>'
      +       '<div class="wwm-card-play-label">' + _esc(T.cardPlayTimeLabel ?? 'プレイ時間帯') + '</div>'
      +       '<div class="wwm-card-play-chips" data-group="time">'
      +         _PLAY_TIME_KEYS.map(k => _playChipBtn('time', k, T['cardTime_' + k] ?? k, st)).join('')
      +       '</div>'
      +       '<div class="wwm-card-play-label">' + _esc(T.cardPlayStyleLabel ?? 'プレイスタイル') + '</div>'
      +       '<div class="wwm-card-play-chips" data-group="style">'
      +         _PLAY_STYLE_KEYS.map(k => _playChipBtn('style', k, T['cardStyle_' + k] ?? k, st)).join('')
      +       '</div>'
      +     '</div>'
      // 𝕏 Ctrl+V ガイド (PC のみ — mobile は share sheet で完結)
      +     (_isMobileUA ? '' : '<p class="wwm-card-stage-hint wwm-card-post-hint">'
      +       _esc(T.cardPostHint ?? '𝕏 にポスト: ポスト画面が開いたら画像を Ctrl+V で貼り付け（自動コピーされます）') + '</p>')
      +   '</div>'
      + '</div>';
    // アクション 2 btn = footer へ (#wwmShareMsg 常設と共存 → innerHTML 上書き禁止)。
    // タブ往復で _buildCardPane 再走しても二重注入しないよう既存分を先に除去
    const oldActions = footerEl.querySelector('.wwm-card-actions');
    if (oldActions) oldActions.remove();
    footerEl.insertAdjacentHTML('beforeend',
      '<div class="wwm-card-actions">'
      + '<button class="wwm-card-generate" id="wwmCardGenerate" disabled>'
      +   _esc(T.cardSave ?? '画像を保存') + '</button>'
      + '<button class="wwm-card-post-x" id="wwmCardPostX" disabled>'
      +   _esc(T.cardPostX ?? '𝕏 にポスト') + '</button>'
      + '</div>');

    const stage = paneEl.querySelector('#wwmCardStage');
    const scaleBox = paneEl.querySelector('#wwmCardScale');
    const genBtn = footerEl.querySelector('#wwmCardGenerate');
    const zoomEl = paneEl.querySelector('#wwmCardBgZoom');
    const clearBtn = paneEl.querySelector('#wwmCardBgClear');
    const fileEl = paneEl.querySelector('#wwmCardBgFile');

    // ── cleanup 経路 (modal close は飛簡 shell = share.js 持ち) ──
    const onPaste = (e) => {
      const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
      if (item) { e.preventDefault(); _readBgBlob(item.getAsFile(), st, onBgChanged); }
    };
    const cleanup = () => window.removeEventListener('paste', onPaste);
    // 飛簡 modal close (×/backdrop/Esc) = backdrop remove → paneEl も DOM から消える = MutationObserver で paste 解除
    const mo = new MutationObserver(() => { if (!document.body.contains(paneEl)) { cleanup(); mo.disconnect(); } });
    mo.observe(document.body, { childList: true });
    window.addEventListener('paste', onPaste);

    // ── preview scale fit ──
    const fit = () => {
      const w = stage.clientWidth || 1;
      scaleBox.style.transform = 'scale(' + (w / CARD_W) + ')';
    };
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    fit();

    // ── model 構築 (icon dataURL 化込み) → 初回 render ──
    const model = await _buildCardModel();
    if (!document.body.contains(paneEl)) return; // 構築中に閉じられた
    if (!model) { cleanup(); mo.disconnect(); return; } // roleInfo 無し (share.js 側 guard 済 = 実質不達)

    // bookmarklet 旧版検出 (_bmVer 刻印 < 現行) → 再登録案内 notice
    if ((WWMState.roleInfo?._bmVer || 0) < (window.WWM_BM_VERSION || 1)) {
      const ctl = paneEl.querySelector('.wwm-card-controls');
      const n = document.createElement('p');
      n.className = 'wwm-bm-notice';
      n.textContent = T.bmOutdatedNotice
        ?? 'ブックマークレットが旧版です — 再登録 + 再インポートで武術・流派・奇術アイコンがカードに反映されます';
      ctl.insertBefore(n, ctl.firstChild);
    }

    let cardEl = null;
    const render = () => {
      cardEl = _buildCardEl(model, st);
      scaleBox.innerHTML = '';
      scaleBox.appendChild(cardEl);
      stage.classList.toggle('has-bg', !!st.bg.url);
    };
    const syncCtl = () => {
      paneEl.querySelectorAll('.wwm-card-tpl-btn').forEach(b => {
        const on = b.dataset.tpl === st.tpl;
        b.classList.toggle('active', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      // 情報位置 (align) は 武格のみ
      const alignRow = paneEl.querySelector('#wwmCardAlignRow');
      if (alignRow) alignRow.hidden = st.tpl !== 'bukaku';
      paneEl.querySelectorAll('.wwm-card-align-btn').forEach(b => {
        const on = b.dataset.align === st.align;
        b.classList.toggle('active', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      paneEl.querySelectorAll('.wwm-card-panel-btn').forEach(b => {
        const on = b.dataset.panel === st.panel;
        b.classList.toggle('active', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      // 武格 = 基礎値/主要ステ 非掲載、 奇術 = data 無し (旧 import) なら disable
      paneEl.querySelectorAll('.wwm-card-toggle input').forEach(inp => {
        const k = inp.dataset.item;
        const na = (st.tpl === 'bukaku' && (k === 'stats' || k === 'primary'))
          || (k === 'qishu' && !model.qishu.some(Boolean));
        inp.disabled = na;
        inp.closest('.wwm-card-toggle').classList.toggle('na', na);
      });
      paneEl.querySelectorAll('.wwm-card-play-chip').forEach(b => {
        const on = (st.play[b.dataset.group] || []).includes(b.dataset.key);
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      const hasBg = !!st.bg.url;
      zoomEl.disabled = !hasBg;
      clearBtn.disabled = !hasBg;
      zoomEl.value = st.bg.scale;
    };
    const onBgChanged = () => { syncCtl(); render(); };
    render(); syncCtl();
    genBtn.disabled = false;
    footerEl.querySelector('#wwmCardPostX').disabled = false;

    // ── controls ──
    paneEl.querySelectorAll('.wwm-card-tpl-btn').forEach(b => {
      b.addEventListener('click', () => {
        st.tpl = b.dataset.tpl; _saveSettings(st); syncCtl(); render();
      });
    });
    paneEl.querySelectorAll('.wwm-card-align-btn').forEach(b => {
      b.addEventListener('click', () => {
        st.align = b.dataset.align === 'right' ? 'right' : 'left';
        _saveSettings(st); syncCtl(); render();
      });
    });
    paneEl.querySelectorAll('.wwm-card-panel-btn').forEach(b => {
      b.addEventListener('click', () => {
        st.panel = b.dataset.panel === 'light' ? 'light' : 'dark';
        _saveSettings(st); syncCtl(); render();
      });
    });
    paneEl.querySelectorAll('.wwm-card-play-chip').forEach(b => {
      b.addEventListener('click', () => {
        const arr = st.play[b.dataset.group] || (st.play[b.dataset.group] = []);
        const i = arr.indexOf(b.dataset.key);
        if (i >= 0) arr.splice(i, 1); else arr.push(b.dataset.key);
        _saveSettings(st); syncCtl(); render();
      });
    });
    paneEl.querySelectorAll('.wwm-card-toggle input').forEach(inp => {
      inp.checked = !!st.items[inp.dataset.item];
      inp.addEventListener('change', () => {
        st.items[inp.dataset.item] = inp.checked; _saveSettings(st); render();
      });
    });
    paneEl.querySelector('#wwmCardBgPick').addEventListener('click', () => fileEl.click());
    fileEl.addEventListener('change', () => {
      if (fileEl.files?.[0]) _readBgBlob(fileEl.files[0], st, onBgChanged);
      fileEl.value = '';
    });
    clearBtn.addEventListener('click', () => {
      st.bg = { url: '', w: 0, h: 0, x: 0, y: 0, scale: 1 };
      onBgChanged();
    });
    zoomEl.addEventListener('input', () => {
      st.bg.scale = parseFloat(zoomEl.value) || 1;
      _applyBgTransform(cardEl?.querySelector('.wwm-card-bgimg'), st);
    });

    // drag & drop
    stage.addEventListener('dragover', e => { e.preventDefault(); stage.classList.add('dropping'); });
    stage.addEventListener('dragleave', () => stage.classList.remove('dropping'));
    stage.addEventListener('drop', e => {
      e.preventDefault(); stage.classList.remove('dropping');
      const f = e.dataTransfer?.files?.[0];
      if (f) _readBgBlob(f, st, onBgChanged);
    });

    // 背景 pan (pointer drag、 preview scale 換算で card px へ)
    let drag = null;
    stage.addEventListener('pointerdown', e => {
      if (!st.bg.url) return;
      e.preventDefault(); // native drag/text selection 抑止 (青選択バグ対策)
      drag = { x: e.clientX, y: e.clientY, bx: st.bg.x, by: st.bg.y };
      stage.classList.add('dragging');
      stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', e => {
      if (!drag) return;
      const k = CARD_W / (stage.clientWidth || 1);
      st.bg.x = drag.bx + (e.clientX - drag.x) * k;
      st.bg.y = drag.by + (e.clientY - drag.y) * k;
      _applyBgTransform(cardEl?.querySelector('.wwm-card-bgimg'), st);
    });
    const endDrag = () => { drag = null; stage.classList.remove('dragging'); };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
    // wheel zoom (背景あり時のみ)
    stage.addEventListener('wheel', e => {
      if (!st.bg.url) return;
      e.preventDefault();
      st.bg.scale = Math.min(3, Math.max(1, st.bg.scale + (e.deltaY < 0 ? 0.08 : -0.08)));
      zoomEl.value = st.bg.scale;
      _applyBgTransform(cardEl?.querySelector('.wwm-card-bgimg'), st);
    }, { passive: false });

    // ── 保存 / 𝕏 ポスト — 両 btn とも押下で生成から実行 (DL 不要でポスト可) ──
    const postBtn = footerEl.querySelector('#wwmCardPostX');

    // 画像を保存 = 生成 → PNG DL
    genBtn.addEventListener('click', () => _withCanvas(model, st, genBtn, async (canvas) => {
      const link = document.createElement('a');
      link.download = _cardFileName(model);
      link.href = canvas.toDataURL('image/png');
      link.click();
      if (T.toastExported) showToast(T.toastExported);
    }));

    // 𝕏 にポスト = 生成 → mobile: share sheet (画像添付) / PC: 画像コピー + intent
    postBtn.addEventListener('click', () => _withCanvas(model, st, postBtn, async (canvas) => {
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      if (!blob) throw new Error('toBlob failed');
      const file = new File([blob], _cardFileName(model), { type: 'image/png' });
      if (_isMobileUA && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], text: _POST_TEXT }); return; } catch (e) {
          if (e && e.name === 'AbortError') return; // ユーザーキャンセル
        }
      }
      // PC: 画像をクリップボードへ → intent (定型文入り) を開く → Ctrl+V 案内
      let copied = false;
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        copied = true;
      } catch (_) {}
      window.open('https://x.com/intent/post?text=' + encodeURIComponent(_POST_TEXT), '_blank', 'noopener');
      showToast(copied
        ? (T.cardPostCopied ?? '画像をコピーしました — 投稿欄に Ctrl+V で貼り付けてください')
        : (T.cardPostCopyFail ?? '画像を自動コピーできませんでした — 「画像を保存」 した PNG を添付してください'),
        copied ? undefined : { error: true });
    }));
  }

  function _cardToggle(key, label, st) {
    return '<label class="wwm-card-toggle"><input type="checkbox" data-item="' + key + '"'
      + (st.items[key] ? ' checked' : '') + '><span>' + _esc(label) + '</span></label>';
  }
  function _playChipBtn(group, key, label, st) {
    const on = (st.play?.[group] || []).includes(key);
    return '<button class="wwm-card-play-chip' + (on ? ' active' : '') + '" data-group="' + group
      + '" data-key="' + key + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + _esc(label) + '</button>';
  }

  // ── expose (飛簡 share.js _buildCardPane が mount) ────────────────
  window.WWMExportCard = { mountCardPane };

  // ── entry (旧 EXPORT 経路の互換 wrapper — 飛簡 card タブを開く) ────
  // roleInfo / Tier pending guard は share.js _shareBuildUrl 側が持つ
  window.exportImage = function exportImage() {
    const T = window.T || {};
    // SHARE Build mode 中は EXPORT 抑止 (他人ビルドの画像拡散回避)
    if (WWMState.isShared) {
      showToast(T.sharedBuildExportBlocked ?? '閲覧モード中: EXPORT は無効化されています', { error: true });
      return;
    }
    // 飛簡 modal の card タブを開く (統合 2026-06-12)
    if (window.WWMSidebar?.share?.shareUrl) WWMSidebar.share.shareUrl({ tab: 'card' });
  };
})();

// vite移行 P2: ESM 副作用 module 化 (window expose は IIFE 内 keep)
export {};
