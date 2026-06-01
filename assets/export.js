// ── 画像エクスポート (自前カード構築版 / html2canvas安定) ──────
const WWM_SITE_URL = 'https://wwm-metrics.example.com';

const _EXP_SLOT_ICON = {
  '3': 'helmet', '4': 'chest', '5': 'legs', '8': 'hands',
  '10': 'ring', '11': 'pendant', '21': 'bow', '9': 'archer-disc'
};
const _EXP_WT_ICON = {
  sword:'sword', spear:'spear', fan:'fan', umbrella:'umbrella',
  moBlade:'glaive', dualBlades:'dual-blades', ropeDart:'rope-dart', hengBlade:'katana',
  mo_blade:'glaive', dual_blades:'dual-blades', rope_dart:'rope-dart', heng_blade:'katana'
};
function _expGearIcon(slot, ri) {
  if (slot === '1' || slot === '2') {
    const kid = slot === '1' ? ri.kongfuMain : ri.kongfuSub;
    const kf = window.WWM_KONGFU && window.WWM_KONGFU[kid];
    const wt = kf && kf.weaponType;
    if (wt) return _EXP_WT_ICON[wt] || _EXP_WT_ICON[wt.replace(/_([a-z])/g, (_,c)=>c.toUpperCase())] || 'sword';
    return 'sword';
  }
  return _EXP_SLOT_ICON[slot] || '';
}

// 画像 preload (Promise resolve まで待つ)
function _preloadImgs(urls) {
  return Promise.all(urls.filter(u=>u).map(u => new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = img.onerror = () => resolve();
    img.src = u;
    setTimeout(resolve, 3000);
  })));
}

// SVG fetch → inline マークアップ取得 (cache)
const _SVG_CACHE = {};
function _fetchSvgInline(path) {
  if (_SVG_CACHE[path]) return Promise.resolve(_SVG_CACHE[path]);
  return fetch(path).then(r => r.ok ? r.text() : '').then(txt => {
    _SVG_CACHE[path] = txt;
    return txt;
  }).catch(() => '');
}
// 外部画像 → blob → dataURL (CORS bypass 試行)
const _IMG_DATAURL_CACHE = {};
function _fetchImgDataUrl(url) {
  if (!url) return Promise.resolve('');
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

function exportImage() {
  if (typeof html2canvas === 'undefined') {
    showToast('html2canvas not loaded (needs online)'); return;
  }
  const btn = document.getElementById('exportBtn');
  const origText = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '⋯';

  const now = new Date();
  const pad = n => String(n).padStart(2,'0');
  const ymd = now.getFullYear() + pad(now.getMonth()+1) + pad(now.getDate());
  const hms = pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
  const dateStr = now.getFullYear() + '/' + pad(now.getMonth()+1) + '/' + pad(now.getDate()) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes());

  const ri = window.__WWM_ROLEINFO || {};
  const roleName = ri.roleName || 'unknown';
  const safeName = roleName.replace(/[^\w一-鿿぀-ヿ]/g, '_');
  const level = ri.level || 0;
  const avatar = ri._avatarBase64 || ri._avatarUrl || '';

  const baseEl = document.getElementById('heroScoreBaseline');
  const curEl = document.getElementById('heroScore');
  const score = (baseEl && baseEl.textContent && baseEl.textContent !== '—')
    ? baseEl.textContent.replace(/,/g, '')
    : (curEl ? curEl.textContent.replace(/,/g, '') : '0');
  const baselineObj = window.__WWM_BASELINE || {};
  const tier = baselineObj.tier || (document.getElementById('heroTierBadge') ? document.getElementById('heroTierBadge').textContent : '?');

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const C = isLight
    ? { bg:'#ede2c8', paper:'#3a2a20', dim:'#5a4226', mute:'#8a7350', gold:'#8a6a20', goldHi:'#5e4310', vermilion:'#c83c2b', jade:'#2d5a3a', border:'rgba(40,25,18,0.18)', rowBg:'rgba(58,38,22,0.06)', rowBg2:'rgba(58,38,22,0.10)', headerBg:'linear-gradient(180deg,#f4e8cc,#e8dab8)' }
    : { bg:'#0a0608', paper:'#ede4d0', dim:'#8b8170', mute:'#6a6053', gold:'#c9a45a', goldHi:'#f0d28a', vermilion:'#e8513a', jade:'#a8d4b4', border:'rgba(232,215,180,0.12)', rowBg:'rgba(255,255,255,0.03)', rowBg2:'rgba(255,255,255,0.06)', headerBg:'linear-gradient(180deg,rgba(26,20,16,0.95),rgba(15,12,14,0.95))' };

  const tierColor = isLight
    ? { SS:'#b8860b', S:'#c83c2b', A:'#2d5a3a', B:'#7a5a20', C:'#5a4226' }
    : { SS:'#ffd970', S:'#ff6b50', A:'#a8d4b4', B:'#c9b88a', C:'rgba(232,215,180,0.7)' };
  const scoreColor = tierColor[tier] || C.goldHi;

  const eqDet = ri.wearEquipsDetailed || {};
  const SLOT_ORDER = ['1','2','3','4','21','10','11','5','8','9'];
  const SLOT_NAME = { '1':'主武器','2':'副武器','3':'冠','4':'胸甲','5':'膝甲','8':'腕甲','9':'射玦','10':'環','11':'佩','21':'弓箭' };
  const sets = window.WWM_SETS || {};
  function setNameOf(suffix, slot) {
    if (!suffix) return '';
    const cat = (slot==='9'||slot==='21') ? sets.bowSets : (['3','4','5','8'].includes(slot) ? sets.defensiveSets : sets.weaponSets);
    const e = cat && cat[suffix];
    const lang = window.currentLang || 'ja';
    return (e && e.names && (e.names[lang] || e.names.ja)) || '';
  }

  // 画像URLリスト preload
  const allIconUrls = [];
  if (avatar) allIconUrls.push(avatar);
  SLOT_ORDER.forEach(slot => {
    const ico = _expGearIcon(slot, ri);
    if (ico) allIconUrls.push('assets/icons/' + ico + '.svg');
  });
  const xinfaIcons = (ri._xinfaIcons || []).map((u, i) => (ri._xinfaIconsBase64 && ri._xinfaIconsBase64[i]) || u);
  xinfaIcons.forEach(u => { if (u) allIconUrls.push(u); });

  // SVG inline 化 (各装備のiconName取得)
  const gearIconNames = SLOT_ORDER.map(slot => _expGearIcon(slot, ri));
  function gearIconWrap(svgTxt) {
    if (!svgTxt) return '';
    // viewBox保持 + サイズ強制
    const styled = svgTxt.replace(/<svg([^>]*)>/, '<svg$1 width="60" height="60" style="width:60px;height:60px;display:block;">');
    // glow halo: background radial-gradient で gold圏
    return '<div style="width:80px;height:80px;position:absolute;right:-16px;top:50%;transform:translateY(-50%);pointer-events:none;background:radial-gradient(circle, rgba(212,175,55,0.22) 0%, rgba(212,175,55,0.08) 40%, transparent 70%);display:flex;align-items:center;justify-content:center;">'
      + '<div style="width:60px;height:60px;opacity:'+(isLight?'0.65':'0.35')+';filter:brightness(0) '+(isLight?'sepia(1) hue-rotate(20deg) saturate(3)':'invert(1)')+';">' + styled + '</div>'
      + '</div>';
  }
  const lang = window.currentLang || 'ja';
  function kongfuNameOf(kid) {
    const k = window.WWM_KONGFU && window.WWM_KONGFU[kid];
    return (k && k.names && (k.names[lang] || k.names.ja)) || '';
  }
  // 武器系=朱色、防具系=金、弓=緑
  const SLOT_ACCENT = {
    '1': C.vermilion, '2': C.vermilion, '10': C.vermilion, '11': C.vermilion,
    '3': C.gold, '4': C.gold, '5': C.gold, '8': C.gold,
    '9': C.jade, '21': C.jade
  };
  const buildGearHtml = (iconSvgs) => SLOT_ORDER.map((slot, i) => {
    const eq = eqDet[slot];
    const name = SLOT_NAME[slot] || slot;
    const iconHtml = iconSvgs[i] ? gearIconWrap(iconSvgs[i]) : '';
    const accent = SLOT_ACCENT[slot] || C.gold;
    const railHtml = '<div style="width:24px;flex-shrink:0;background:rgba(0,0,0,0.45);border-right:1px solid '+C.border+';display:flex;align-items:center;justify-content:center;padding:4px 0;"><div style="writing-mode:vertical-rl;text-orientation:upright;font-family:Noto Serif JP,serif;font-weight:900;font-size:12px;letter-spacing:0.12em;color:'+accent+';line-height:1.05;text-shadow:0 0 4px '+accent+';transform:translate(2px,-3px);">'+name+'</div></div>';
    if (!eq) return '<div style="position:relative;overflow:hidden;display:flex;background:'+C.rowBg+';border:1px solid '+C.border+';border-radius:3px;font-size:11px;color:'+C.dim+';min-height:56px;box-shadow:0 0 8px rgba(212,175,55,0.15);">'+railHtml+'<div style="flex:1;padding:6px 10px;display:flex;flex-direction:column;justify-content:center;"><span style="opacity:0.6;">—</span></div>'+iconHtml+'</div>';
    const setN = setNameOf(eq.exVo && eq.exVo.suffix, slot);
    let kfLine = '';
    if (slot === '1' || slot === '2') {
      const kid = slot === '1' ? ri.kongfuMain : ri.kongfuSub;
      const kn = kongfuNameOf(kid);
      if (kn) kfLine = '<div style="font-size:10px;color:'+C.paper+';margin-top:1px;position:relative;z-index:1;">' + kn + '</div>';
    }
    return '<div style="position:relative;overflow:hidden;display:flex;background:'+C.rowBg+';border:1px solid '+C.border+';border-radius:3px;font-size:11px;color:'+C.paper+';min-height:56px;box-shadow:0 0 10px rgba(212,175,55,0.25);">'
      + railHtml
      + '<div style="flex:1;padding:6px 10px;display:flex;flex-direction:column;justify-content:flex-start;align-items:flex-start;position:relative;z-index:1;min-width:0;transform:translate(-5px,-6px);">'
      +   '<div style="font-weight:700;color:'+C.goldHi+';text-shadow:0 0 8px rgba(240,210,138,0.8), 0 0 16px rgba(240,210,138,0.4);">' + setN + '</div>'
      +   kfLine
      + '</div>'
      + iconHtml
      + '</div>';
  }).join('');

  const xinfa = window.WWM_XINFA || {};
  const passive = ri.passiveSlots || [];
  const xinfaHtml = [0,1,2,3].map(i => {
    const xid = passive[i];
    if (!xid) return '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:'+C.rowBg+';border:1px solid '+C.border+';border-radius:3px;font-size:11px;color:'+C.dim+';min-height:40px;"><div style="flex:1;"><b>心法'+(i+1)+'</b><br><span style="opacity:0.6;">—</span></div></div>';
    const lang = window.currentLang || 'ja';
    const x = xinfa[xid];
    const xname = (x && x.names && (x.names[lang] || x.names.ja)) || ('心法#'+xid);
    const icoSrc = xinfaIcons[i] || '';
    const icoImg = icoSrc ? '<img src="'+icoSrc+'" width="28" height="28" style="width:28px;height:28px;min-width:28px;max-width:28px;flex-shrink:0;opacity:0.9;border-radius:3px;display:block;" crossorigin="anonymous">' : '';
    return '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:'+C.rowBg+';border:1px solid '+C.border+';border-left:2px solid '+C.gold+';border-radius:3px;font-size:11px;color:'+C.paper+';min-height:40px;">'
      + '<div style="flex:1;min-width:0;">'
      +   '<div style="font-size:10px;color:'+C.dim+';margin-bottom:2px;">心法'+(i+1)+'</div>'
      +   '<div style="font-weight:700;color:'+C.goldHi+';text-shadow:0 0 8px rgba(240,210,138,0.8), 0 0 16px rgba(240,210,138,0.4);">' + xname + '</div>'
      + '</div>'
      + icoImg
      + '</div>';
  }).join('');

  let historyHtml = '';
  try {
    const hist = JSON.parse(localStorage.getItem('wwm_score_history_v1') || '[]');
    if (hist.length >= 1) {
      const minTs = Math.min.apply(null, hist.map(e=>e.ts));
      const maxTs = Math.max.apply(null, hist.map(e=>e.ts));
      const tsR = Math.max(1, maxTs-minTs);
      const minS = Math.min.apply(null, hist.map(e=>e.statusScore));
      const maxS = Math.max.apply(null, hist.map(e=>e.statusScore));
      const sMin = Math.floor(minS*0.92/100)*100;
      const sMax = Math.ceil(maxS*1.05/100)*100;
      const sR = Math.max(1, sMax-sMin);
      const W=600, H=120, PL=44, PR=8, PT=8, PB=20;
      const iW=W-PL-PR, iH=H-PT-PB;
      const byRole = {};
      hist.forEach(e => { (byRole[e.roleId]=byRole[e.roleId]||[]).push(e); });
      const colors = ['#c9a45a','#a8d4b4','#e8a87c','#7ec4cf'];
      let lines = '';
      Object.keys(byRole).forEach((rid,idx) => {
        const pts = byRole[rid].sort((a,b)=>a.ts-b.ts);
        const pp = pts.map(e => (PL+((e.ts-minTs)/tsR)*iW).toFixed(1)+','+(PT+(1-(e.statusScore-sMin)/sR)*iH).toFixed(1)).join(' ');
        lines += '<polyline points="'+pp+'" fill="none" stroke="'+colors[idx%colors.length]+'" stroke-width="2"/>';
        pts.forEach(e => { lines += '<circle cx="'+(PL+((e.ts-minTs)/tsR)*iW).toFixed(1)+'" cy="'+(PT+(1-(e.statusScore-sMin)/sR)*iH).toFixed(1)+'" r="3" fill="'+colors[idx%colors.length]+'"/>'; });
      });
      historyHtml = '<div style="font-family:Rajdhani,monospace;font-size:10px;color:'+C.gold+';letter-spacing:0.2em;font-weight:700;margin:14px 0 8px;">MARTIAL RECORD</div>'
        + '<div style="padding:8px;background:'+C.rowBg+';border:1px solid '+C.border+';border-radius:3px;display:flex;flex-direction:column;flex:1;min-height:0;">'
        + '<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" style="width:100%;flex:1;display:block;min-height:0;">'
        + '<rect x="'+PL+'" y="'+PT+'" width="'+iW+'" height="'+iH+'" fill="rgba(0,0,0,0.1)" stroke="'+C.border+'"/>'
        + '<text x="'+(PL-4)+'" y="'+(PT+10)+'" text-anchor="end" font-size="9" fill="'+C.mute+'">'+sMax+'</text>'
        + '<text x="'+(PL-4)+'" y="'+(PT+iH)+'" text-anchor="end" font-size="9" fill="'+C.mute+'">'+sMin+'</text>'
        + lines + '</svg></div>';
    }
  } catch(_) {}

  // サイドパネル clone → 2列FIT
  let sidebarHtml = '';
  const sbEl = document.querySelector('.wwm-sidebar-test');
  if (sbEl) {
    const clone = sbEl.cloneNode(true);
    clone.querySelectorAll('.icon-btn, .wwm-overlay-ctrl, .preset-btn, .wwm-sb-top').forEach(el => el.remove());
    // 現在装備のみ表示: ▶以降 (仮想装備込み値) を削除し baseline値を露出
    clone.querySelectorAll('.wwm-sb-baseline').forEach(el => {
      let next = el.nextSibling;
      while (next) {
        const toRemove = next;
        next = next.nextSibling;
        toRemove.remove();
      }
      el.classList.remove('wwm-sb-baseline');
    });
    // 孤立 arrow 除去
    clone.querySelectorAll('.wwm-sb-arrow, .wwm-equip-arrow').forEach(el => el.remove());
    clone.querySelectorAll('*').forEach(el => {
      el.style.backgroundImage = 'none';
      el.style.boxShadow = 'none';
      el.style.textShadow = 'none';
    });
    clone.style.cssText = 'position:static;width:100%;max-height:none;height:auto;overflow:visible;background:transparent;border:none;padding:0;font-size:10px;color:'+C.paper+';';
    // wwm-sb-row を 2列grid化
    clone.querySelectorAll('.wwm-sb-items').forEach(el => {
      el.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:2px 10px;';
    });
    clone.querySelectorAll('.wwm-sb-section').forEach(el => {
      el.style.marginBottom = '6px';
    });
    clone.querySelectorAll('.wwm-sb-section-title').forEach(el => {
      el.style.cssText = 'grid-column:1 / -1;font-size:10px;color:'+C.gold+';font-weight:700;letter-spacing:0.1em;margin:6px 0 3px;border-bottom:1px solid '+C.border+';padding-bottom:2px;';
    });
    sidebarHtml = clone.outerHTML;
  }

  // avatar
  const avatarImg = avatar ? '<img src="'+avatar+'" style="width:56px;height:56px;border-radius:50%;border:2px solid '+C.gold+';" crossorigin="anonymous">' : '<div style="width:56px;height:56px;border-radius:50%;border:2px solid '+C.gold+';background:'+C.rowBg+';display:flex;align-items:center;justify-content:center;color:'+C.gold+';font-weight:800;font-size:22px;">'+(roleName[0]||'?')+'</div>';

  // ヘッダー: 風燕計 縦書 + WHERE WINDS METRICS + 朱印「燕」 + 武格指数 大表示
  const headerHtml = '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px;background:'+C.headerBg+';border-bottom:1px solid '+C.border+';gap:16px;">'
    + '<div style="display:flex;align-items:center;gap:14px;">'
    +   '<div style="writing-mode:vertical-rl;text-orientation:upright;font-family:Noto Serif JP,serif;font-size:16px;font-weight:900;letter-spacing:0.1em;color:'+C.goldHi+';border-left:2px solid '+C.goldHi+';border-right:2px solid '+C.goldHi+';padding:0 4px 12px 9px;line-height:1.1;display:block;height:auto;text-shadow:0 0 8px rgba(240,210,138,0.8), 0 0 16px rgba(240,210,138,0.4);">風燕計</div>'
    +   '<div>'
    +     '<div style="font-family:Cinzel,serif;font-size:18px;letter-spacing:0.32em;color:'+C.paper+';font-weight:700;">WHERE WINDS METRICS</div>'
    +     '<div style="font-family:Rajdhani,monospace;font-size:9px;letter-spacing:0.28em;color:'+C.gold+';margin-top:2px;font-weight:700;">WWM-REAL-TIME-METRICS</div>'
    +   '</div>'
    +   '<div style="width:36px;height:36px;background:'+C.vermilion+';color:#fff;display:flex;align-items:center;justify-content:center;font-family:Noto Serif JP,serif;font-size:20px;font-weight:900;transform:rotate(-6deg);border:2px solid rgba(255,255,255,0.7);border-radius:3px;">燕</div>'
    + '</div>'
    + '<div style="display:flex;align-items:center;gap:14px;">'
    +   avatarImg
    +   '<div style="text-align:right;">'
    +     '<div style="font-size:13px;color:'+C.paper+';font-weight:700;">' + roleName + ' <span style="color:'+C.dim+';font-weight:400;">Lv' + level + '</span></div>'
    +     '<div style="display:flex;align-items:flex-end;gap:8px;justify-content:flex-end;margin-top:4px;">'
    +       '<span style="font-family:Noto Serif JP,serif;font-size:14px;color:'+C.goldHi+';font-weight:900;letter-spacing:0.08em;">武格指数</span>'
    +       '<span style="font-family:Cinzel,serif;font-size:34px;font-weight:800;color:'+scoreColor+';line-height:0.9;">' + score + '</span>'
    +       '<span style="padding:3px 10px;border:1.5px solid '+scoreColor+';border-radius:3px;color:'+scoreColor+';font-weight:700;font-size:14px;font-family:Cinzel,serif;">' + tier + '</span>'
    +     '</div>'
    +   '</div>'
    + '</div>'
    + '</div>';

  const card = document.getElementById('export-card');
  card.style.cssText = 'display:block;position:fixed;left:-9999px;top:0;width:1000px;';
  function rebuildCardWithGearV2(gearHtml, hdrHtml, xinfaH) {
    card.innerHTML = '<div style="width:1000px;background:'+C.bg+';color:'+C.paper+';font-family:Noto Sans JP,sans-serif;padding:0;border:1px solid '+C.border+';">'
      + hdrHtml
      + '<div style="display:grid;grid-template-columns:380px 1fr;gap:14px;padding:14px 20px;align-items:stretch;">'
      +   '<div style="background:'+C.rowBg+';border:1px solid '+C.border+';border-left:2px solid '+C.vermilion+';border-radius:3px;padding:10px;">' + sidebarHtml + '</div>'
      +   '<div style="display:flex;flex-direction:column;min-height:0;">'
      +     '<div style="font-family:Rajdhani,monospace;font-size:10px;color:'+C.gold+';letter-spacing:0.2em;font-weight:700;margin-bottom:8px;">GEAR</div>'
      +     '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:14px;">' + gearHtml + '</div>'
      +     '<div style="font-family:Rajdhani,monospace;font-size:10px;color:'+C.gold+';letter-spacing:0.2em;font-weight:700;margin-bottom:8px;">INNER WAY</div>'
      +     '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;">' + xinfaH + '</div>'
      +     historyHtml
      +   '</div>'
      + '</div>'
      + '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 20px;background:'+C.rowBg+';border-top:1px solid '+C.border+';font-family:Rajdhani,monospace;font-size:10px;letter-spacing:0.14em;color:'+C.dim+';">'
      +   '<span>' + dateStr + '</span>'
      +   '<span style="color:'+C.gold+';font-weight:700;">' + WWM_SITE_URL.replace(/^https?:\/\//,'') + '</span>'
      + '</div>'
      + '</div>';
  }

  // SVG + 外部画像 fetch
  Promise.all([
    _preloadImgs(allIconUrls),
    Promise.all(gearIconNames.map(n => n ? _fetchSvgInline('assets/icons/'+n+'.svg') : Promise.resolve(''))),
    ri._avatarBase64 ? Promise.resolve(ri._avatarBase64) : _fetchImgDataUrl(avatar),
    (ri._xinfaIconsBase64 && ri._xinfaIconsBase64.length)
      ? Promise.resolve(ri._xinfaIconsBase64)
      : Promise.all(xinfaIcons.map(u => _fetchImgDataUrl(u)))
  ]).then(([_, iconSvgs, avatarData, xinfaData]) => {
    // avatar / xinfa icon を dataURL化済みで rebuild
    if (avatarData) {
      card._avatarDataUrl = avatarData;
    }
    if (xinfaData && xinfaData.length) {
      card._xinfaDataUrls = xinfaData;
    }
    const gearHtml = buildGearHtml(iconSvgs);
    // headerHtml / xinfaHtml を dataURL 反映で再構築
    const realAvatarImg = avatarData
      ? '<img src="'+avatarData+'" style="width:56px;height:56px;border-radius:50%;border:2px solid '+C.gold+';">'
      : avatarImg;
    const XINFA_NUM = ['一','二','三','四'];
    const realXinfaHtml = [0,1,2,3].map(i => {
      const xid = passive[i];
      const railHtml = '<div style="width:24px;flex-shrink:0;background:rgba(0,0,0,0.45);border-right:1px solid '+C.border+';display:flex;align-items:center;justify-content:center;padding:4px 0;"><div style="writing-mode:vertical-rl;text-orientation:upright;font-family:Noto Serif JP,serif;font-weight:900;font-size:12px;letter-spacing:0.12em;color:'+C.goldHi+';line-height:1.05;text-shadow:0 0 4px '+C.gold+';transform:translate(2px,-3px);">心法'+XINFA_NUM[i]+'</div></div>';
      if (!xid) return '<div style="position:relative;overflow:hidden;display:flex;background:'+C.rowBg+';border:1px solid '+C.border+';border-radius:3px;font-size:11px;color:'+C.dim+';min-height:56px;box-shadow:0 0 8px rgba(212,175,55,0.15);">'+railHtml+'<div style="flex:1;padding:6px 10px;display:flex;align-items:center;"><span style="opacity:0.6;">—</span></div></div>';
      const lang2 = window.currentLang || 'ja';
      const x = xinfa[xid];
      const xname = (x && x.names && (x.names[lang2] || x.names.ja)) || ('心法#'+xid);
      const ico = xinfaData[i] || '';
      const icoImg = ico ? '<div style="width:80px;height:80px;position:absolute;right:-16px;top:50%;transform:translateY(-50%);pointer-events:none;background:radial-gradient(circle, rgba(212,175,55,0.22) 0%, rgba(212,175,55,0.08) 40%, transparent 70%);display:flex;align-items:center;justify-content:center;"><img src="'+ico+'" width="56" height="56" style="width:56px;height:56px;opacity:0.6;border-radius:3px;display:block;"></div>' : '';
      return '<div style="position:relative;overflow:hidden;display:flex;background:'+C.rowBg+';border:1px solid '+C.border+';border-radius:3px;font-size:11px;color:'+C.paper+';min-height:56px;box-shadow:0 0 10px rgba(212,175,55,0.25);">'
        + railHtml
        + '<div style="flex:1;padding:6px 10px;display:flex;flex-direction:column;justify-content:flex-start;align-items:flex-start;position:relative;z-index:1;min-width:0;transform:translate(-5px,-6px);">'
        +   '<div style="font-weight:700;color:'+C.goldHi+';text-shadow:0 0 8px rgba(240,210,138,0.8), 0 0 16px rgba(240,210,138,0.4);">' + xname + '</div>'
        + '</div>'
        + icoImg
        + '</div>';
    }).join('');
    // headerHtml の avatar 差し替え (簡易: 全置換)
    const realHeader = headerHtml.replace(avatarImg, realAvatarImg);
    rebuildCardWithGearV2(gearHtml, realHeader, realXinfaHtml);
    setTimeout(function() {
      html2canvas(card.firstElementChild, {
        scale: 2, logging: false, backgroundColor: C.bg, useCORS: true, allowTaint: true, imageTimeout: 0
      }).then(function(canvas) {
        card.style.cssText = 'display:none;';
        btn.disabled = false; btn.innerHTML = origText;
        const link = document.createElement('a');
        link.download = 'WWM-' + safeName + '-' + score + '-' + ymd + '-' + hms + '.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
        if (typeof T !== 'undefined' && T.toastExported) showToast(T.toastExported);
      }).catch(function(err) {
        card.style.cssText = 'display:none;';
        btn.disabled = false; btn.innerHTML = origText;
        console.error('Export error:', err);
        showToast('Export 失敗: ' + err.message);
      });
    }, 200);
  });
}
