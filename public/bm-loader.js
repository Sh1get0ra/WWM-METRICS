// WWMetrics Bookmarklet Loader (auto-update body)
// wrapper bookmarklet が fetch + eval で実行する本体。 ここを更新すれば全 user 自動追従。
// 旧 inline bookmarklet と機能等価 + qishu base64 取得 復活 (画像生成 canvas tainted 回避)。
//
// 期待 context:
//   - window.__WWM_CALC_URL = 'https://wwm-metrics.pages.dev/' (wrapper が注入)
//   - window.__WWM_BM_VERSION = 3                              (wrapper が注入)
//   - 公式 mypage (wherewindsmeetgame.com) の DOM context

(async () => {
  const C = window.__WWM_CALC_URL || '/';
  const BM_VER = window.__WWM_BM_VERSION || 3;
  const H = 'www.wherewindsmeetgame.com';
  const A = 'https://s2.easebar.com/78ae9d90792a3e9b/role/roleInfo';
  const T = 10000;

  if (location.host !== H) { alert('公式ツール (' + H + ') で実行してください'); return; }

  const t = document.createElement('div');
  t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#000c;color:#fff;padding:12px 20px;border-radius:6px;z-index:99999;font:14px sans-serif';
  t.textContent = 'WWMetrics: 読込中...';
  document.body.appendChild(t);

  // image → blob → dataURL
  const i2b = async (u) => {
    try {
      const r = await fetch(u);
      const bl = await r.blob();
      return await new Promise(rs => {
        const f = new FileReader();
        f.onload = () => rs(f.result);
        f.onerror = () => rs('');
        f.readAsDataURL(bl);
      });
    } catch (_) { return ''; }
  };

  // shrink image to 96px max (kongfu/qishu icons 用、 SHARE 削除なし時の容量抑制)
  const shr = async (u) => {
    try {
      const rr = await fetch(u);
      const bl = await rr.blob();
      const im = await createImageBitmap(bl);
      const sc = Math.min(1, 96 / Math.max(im.width, im.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(im.width * sc);
      cv.height = Math.round(im.height * sc);
      cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
      return cv.toDataURL('image/png');
    } catch (_) { return await i2b(u); }
  };

  // 公式 build path (bp) を mypage 内 JS から動的解決
  let bp = '/pc/qt/20251203102905/';
  try {
    const br = await fetch('/m/zt/20251121182818/js/index-76a5ce60.js');
    const bt = await br.text();
    const bm = bt.match(/\/pc\/qt\/(\d{14})\//);
    if (bm) bp = '/pc/qt/' + bm[1] + '/';
  } catch (_) {}

  // 簡易 obfuscation 解除 (公式 .txt が逆順 + 100 文字ごと 末尾 1 字 padding 形式)
  const dec = (x) => {
    const rv = [...x].reverse().join('');
    let n = '';
    for (let i = 0; i < rv.length; i += 100) {
      const c = rv.substr(i, 100);
      n += c.substr(0, c.length - 1);
    }
    return atob(n);
  };

  try {
    const k = (document.cookie.match(/(?:^|;\s*)token=([^;]+)/) || [])[1];
    if (!k) throw new Error('未ログインです');

    const c = new AbortController;
    const d = setTimeout(() => c.abort(), T);
    const r = await fetch(A, { headers: { access_token: k }, credentials: 'include', signal: c.signal });
    clearTimeout(d);
    if (!r.ok) throw new Error('HTTP ' + r.status);

    const j = await r.json();
    if (!j.data) throw new Error(j.msg || 'API err');

    j.data._bmVer = BM_VER;

    // avatar
    try {
      const av = document.querySelector('img[src*="head/images"]')?.src;
      if (av) {
        j.data._avatarUrl = av;
        t.textContent = 'アバター取得中...';
        const b64 = await i2b(av);
        if (b64) j.data._avatarBase64 = b64;
      }
    } catch (_) {}

    // 心法 icons
    try {
      const xi = [...document.querySelectorAll('.icon-item .icon img.icon')].map(i => i.src).filter(s => s && s.includes('xinfa/images'));
      if (xi.length) {
        j.data._xinfaIcons = xi;
        t.textContent = '心法アイコン取得中...';
        j.data._xinfaIconsBase64 = await Promise.all(xi.map(u => i2b(u)));
      }
    } catch (_) {}

    // 武術 icons (kongfu + liupai)
    try {
      const kids = [j.data.kongfuMain, j.data.kongfuSub].filter(Boolean);
      if (kids.length) {
        t.textContent = '武術アイコン取得中...';
        const kj = JSON.parse(dec(await fetch(bp + 'data/kongfu/kongfu.txt', { credentials: 'omit' }).then(r => r.text())));
        const ki = {}, li = {};
        for (const kid of kids) {
          const e = kj[kid] || {};
          if (e.pic_url) { const b = await shr(e.pic_url); if (b) ki[kid] = b; }
          if (e.liupai_pic_url) { const b = await i2b(e.liupai_pic_url); if (b) li[kid] = b; }
        }
        if (Object.keys(ki).length) j.data._kongfuIconsBase64 = ki;
        if (Object.keys(li).length) j.data._liupaiIconsBase64 = li;
      }
    } catch (_) {}

    // 奇術 (Phase A 軽量化 + v3 画像生成対応 = _qishuIds keep + _qishuMaster keep + _qishuIconsBase64 復活)
    try {
      const qsImgs = [...document.querySelectorAll('.qs-list img')].map(i => i.src).filter(s => s && s.includes('qishu/images'));
      if (qsImgs.length) {
        t.textContent = '奇術アイコン取得中...';
        const qj = JSON.parse(dec(await fetch(bp + 'data/qishu/qishu.txt', { credentials: 'omit' }).then(r => r.text())));
        const qm = {}, u2i = {};
        for (const k in qj) {
          const e = qj[k];
          if (!e || !e.pic_url) continue;
          qm[k] = { name: e.name, pic_url: e.pic_url, is_post: e.is_post };
          u2i[e.pic_url] = Number(k);
        }
        j.data._qishuIds = qsImgs.map(u => u2i[u] || null);
        j.data._qishuMaster = qm;
        // v3 = 画像生成用 base64 復活 (CDN URL は CORS で canvas tainted = 描画 skip 罠回避)
        // SHARE URL では share.js が _qishuIconsBase64 削除 = 軽量化 keep (本人 PC のみ使用)
        const qIds = j.data._qishuIds.filter(Boolean);
        if (qIds.length) {
          const qb = {};
          for (const id of qIds) {
            const pu = qm[id]?.pic_url;
            if (pu) { const b = await shr(pu); if (b) qb[id] = b; }
          }
          if (Object.keys(qb).length) j.data._qishuIconsBase64 = qb;
        }
      }
    } catch (_) {}

    // 流派 pic
    try {
      const lp = {};
      document.querySelectorAll('img').forEach(i => {
        const u = i.src || '';
        if (u.includes('/liupai_pic/')) {
          const fn = u.split('/').pop().split('?')[0];
          if (!lp[fn]) lp[fn] = u;
        }
      });
      const fns = Object.keys(lp);
      if (fns.length) {
        t.textContent = '流派バッジ取得中...';
        const lb = {};
        for (const fn of fns) { const b = await i2b(lp[fn]); if (b) lb[fn] = b; }
        j.data._liupaiPicsBase64 = lb;
      }
    } catch (_) {}

    // 転送
    const s = JSON.stringify(j.data);
    const b = btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    t.textContent = '転送中...';
    const u = C + '#import=' + b;

    if (/Mobi|Android|iPhone|iPad|iPod|Touch/i.test(navigator.userAgent) || screen.width < 700) {
      location.href = u; return;
    }
    window.open(u, '_blank') || (location.href = u);
    t.textContent = '完了';
    setTimeout(() => { t.remove(); try { window.close(); } catch (_) {} }, 800);
  } catch (e) {
    t.textContent = 'エラー: ' + e.message;
    t.style.background = '#c00';
    setTimeout(() => t.remove(), 5000);
  }
})();
