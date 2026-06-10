// ── WWM-METRICS Import Module ─────────────────────────────────────
// 公式ツール bookmarklet からの roleInfo データ受取 + Preview + Apply

const IMPORT_STORAGE_KEY = 'wwm_last_import_v1';
const IMPORT_STATE_KEY = 'wwm_last_state_v1';
const IMPORT_HASH_PREFIX = '#import=';
// bookmarklet バージョン (bmSrc に _bmVer として刻印 — bookmarklet 拡張時 +1 すると旧版検出が自動で効く)
// v1 = 2026-06-07: 武術/流派/奇術 icon base64 取込 対応版
const WWM_BM_VERSION = 1;
window.WWM_BM_VERSION = WWM_BM_VERSION;

// ── base64url decode ────────────────────────────────────────────
function _b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return decodeURIComponent(escape(atob(s)));
}

// ── Modal helpers ───────────────────────────────────────────────
function _createModal(id, titleKey, contentHtml, bgIconUrl) {
  let m = document.getElementById(id);
  if (m) { m.remove(); }
  m = document.createElement('div');
  m.id = id;
  m.className = 'wwm-modal-backdrop';
  const iconHtml = bgIconUrl
    ? `<div class="wwm-modal-bg-icon" style="background-image:url('${bgIconUrl}');"></div>` : '';
  m.innerHTML = `
    <div class="wwm-modal wwm-modal-square">
      ${iconHtml}
      <div class="wwm-modal-header">
        <h2 data-i18n="${titleKey}">${(window.T && T[titleKey]) || titleKey}</h2>
        <button class="wwm-modal-close" aria-label="Close">×</button>
      </div>
      <div class="wwm-modal-body">${contentHtml}</div>
    </div>`;
  document.body.appendChild(m);
  m.querySelector('.wwm-modal-close').addEventListener('click', () => m.remove());
  return m;
}

// ── Setup Modal (Import button → このmodal、2-step inline) ───────
function openSetupModal() {
  const officialUrl = 'https://www.wherewindsmeetgame.com/m/2025h5sjgj/jp/';
  const m = _createModal('wwmSetupModal', 'importSetupTitle', '<div id="wwmSetupBody"></div>', 'assets/icons/scroll-quill.svg');
  const body = m.querySelector('#wwmSetupBody');

  function renderIntro() {
    const last = getLastImportSummary();
    // 直前 import が旧 bookmarklet 産なら再登録案内 (新規ユーザーには出さない)
    const storedVer = _loadStored()?.data?._bmVer || 0;
    const bmNotice = (last && storedVer < WWM_BM_VERSION)
      ? `<p class="wwm-bm-notice">${(window.T && T.bmOutdatedNotice) || 'ブックマークレットが旧版です — 再登録 + 再インポートで武術・流派・奇術アイコンがカードに反映されます'}</p>`
      : '';
    const lastHtml = last
      ? `<div class="wwm-last-import">
           <strong data-i18n="importLastLabel">${(window.T && T.importLastLabel) || '直前のインポート'}:</strong>
           <div>${last.roleName} (Lv ${last.level}) — ${last.importedAt}</div>
           <div class="wwm-reapply-row">
             <button class="wwm-btn-secondary" id="wwmReapplyBtn" data-i18n="importReapply">${(window.T && T.importReapply) || '再適用'}</button>
             <span class="wwm-reapply-note">${(window.T && T.importReapplyNote) || '前回データをそのまま再インポート。<br>最新装備で取り込むには 公式データツール から再度ブックマークレット実行。'}</span>
           </div>
         </div>`
      : `<p class="wwm-muted" data-i18n="importNoHistory">${(window.T && T.importNoHistory) || '直前のインポートはありません'}</p>`;
    const calcUrl = location.origin + location.pathname.replace(/[^/]*$/, '');
    const bmSrc = "(async()=>{const C='" + calcUrl + "',H='www.wherewindsmeetgame.com',A='https://s2.easebar.com/78ae9d90792a3e9b/role/roleInfo',T=10000;if(location.host!==H){alert('公式ツール ('+H+') で実行してください');return;}const t=document.createElement('div');t.style.cssText='position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#000c;color:#fff;padding:12px 20px;border-radius:6px;z-index:99999;font:14px sans-serif';t.textContent='WWM-METRICS: 読込中...';document.body.appendChild(t);const i2b=async u=>{try{const r=await fetch(u);const bl=await r.blob();return await new Promise(rs=>{const f=new FileReader();f.onload=()=>rs(f.result);f.onerror=()=>rs('');f.readAsDataURL(bl);});}catch(_){return '';}};const shr=async u=>{try{const rr=await fetch(u);const bl=await rr.blob();const im=await createImageBitmap(bl);const sc=Math.min(1,96/Math.max(im.width,im.height));const cv=document.createElement('canvas');cv.width=Math.round(im.width*sc);cv.height=Math.round(im.height*sc);cv.getContext('2d').drawImage(im,0,0,cv.width,cv.height);return cv.toDataURL('image/png');}catch(_){return await i2b(u);}};try{const k=(document.cookie.match(/(?:^|;\\s*)token=([^;]+)/)||[])[1];if(!k)throw new Error('未ログインです');const c=new AbortController,d=setTimeout(()=>c.abort(),T);const r=await fetch(A,{headers:{access_token:k},credentials:'include',signal:c.signal});clearTimeout(d);if(!r.ok)throw new Error('HTTP '+r.status);const j=await r.json();if(!j.data)throw new Error(j.msg||'API err');j.data._bmVer=" + WWM_BM_VERSION + ";try{const av=document.querySelector('img[src*=\"head/images\"]')?.src;if(av){j.data._avatarUrl=av;t.textContent='アバター取得中...';const b64=await i2b(av);if(b64)j.data._avatarBase64=b64;}}catch(_){}try{const xi=[...document.querySelectorAll('.icon-item .icon img.icon')].map(i=>i.src).filter(s=>s&&s.includes('xinfa/images'));if(xi.length){j.data._xinfaIcons=xi;t.textContent='心法アイコン取得中...';j.data._xinfaIconsBase64=await Promise.all(xi.map(u=>i2b(u)));}}catch(_){}try{const kids=[j.data.kongfuMain,j.data.kongfuSub].filter(Boolean);if(kids.length){t.textContent='武術アイコン取得中...';let bp='/pc/qt/20251203102905/';try{const br=await fetch('/m/zt/20251121182818/js/index-76a5ce60.js');const bt=await br.text();const bm=bt.match(/\\/pc\\/qt\\/(\\d{14})\\//);if(bm)bp='/pc/qt/'+bm[1]+'/';}catch(_){}const dec=x=>{const rv=[...x].reverse().join('');let n='';for(let i=0;i<rv.length;i+=100){const c=rv.substr(i,100);n+=c.substr(0,c.length-1);}return atob(n);};const kj=JSON.parse(dec(await fetch(bp+'data/kongfu/kongfu.txt',{credentials:'omit'}).then(r=>r.text())));const ki={},li={};for(const kid of kids){const e=kj[kid]||{};if(e.pic_url){const b=await shr(e.pic_url);if(b)ki[kid]=b;}if(e.liupai_pic_url){const b=await i2b(e.liupai_pic_url);if(b)li[kid]=b;}}if(Object.keys(ki).length)j.data._kongfuIconsBase64=ki;if(Object.keys(li).length)j.data._liupaiIconsBase64=li;}}catch(_){}try{const qi=[...document.querySelectorAll('.qs-list img')].map(i=>i.src).filter(s=>s&&s.includes('qishu/images'));if(qi.length){t.textContent='奇術アイコン取得中...';j.data._qishuIcons=qi;j.data._qishuIconsBase64=await Promise.all(qi.map(u=>shr(u)));}}catch(_){}try{const lp={};document.querySelectorAll('img').forEach(i=>{const u=i.src||'';if(u.includes('/liupai_pic/')){const fn=u.split('/').pop().split('?')[0];if(!lp[fn])lp[fn]=u;}});const fns=Object.keys(lp);if(fns.length){t.textContent='流派バッジ取得中...';const lb={};for(const fn of fns){const b=await i2b(lp[fn]);if(b)lb[fn]=b;}j.data._liupaiPicsBase64=lb;}}catch(_){}const s=JSON.stringify(j.data),b=btoa(unescape(encodeURIComponent(s))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');t.textContent='転送中...';var u=C+'#import='+b;if(/Mobi|Android|iPhone|iPad|iPod|Touch/i.test(navigator.userAgent)||screen.width<700){location.href=u;return;}window.open(u,'_blank')||(location.href=u);t.textContent='完了';setTimeout(()=>{t.remove();try{window.close();}catch(_){}},800);}catch(e){t.textContent='エラー: '+e.message;t.style.background='#c00';setTimeout(()=>t.remove(),5000);}})();";
    const bmUrl = 'javascript:' + encodeURIComponent(bmSrc);
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    body.innerHTML = `
      ${bmNotice}
      <p data-i18n="importSetupIntro">${(window.T && T.importSetupIntro) || '公式データツールのデータをこの計算ツールに取り込むには、ブックマークレットの設定が必要です。'}</p>
      <p data-i18n="importUsageHint">${(window.T && T.importUsageHint) || '設定完了後: 公式ツールを開いてブックマークレットをクリックしてください。'}</p>
      <details class="wwm-setup-collapse">
        <summary>${(window.T && T.importStep1Title) || 'Step 1: ブックマークレット 初回セットアップ (未登録時のみ開く)'}</summary>
        <div class="wwm-setup-collapse-body">
          <div class="wwm-setup-tabs">
            <button type="button" class="wwm-setup-tab${isMobile?'':' active'}" data-tab="pc">${(window.T && T.importTabPC) || 'PC'}</button>
            <button type="button" class="wwm-setup-tab${isMobile?' active':''}" data-tab="mobile">${(window.T && T.importTabMobile) || 'モバイル'}</button>
          </div>
          <div class="wwm-setup-panel" data-panel="pc" ${isMobile?'hidden':''}>
            <ol class="wwm-setup-steps">
              <li>${(window.T && T.importPcStep1) || 'ブックマークバー表示 (Chrome/Edge: <code>Ctrl+Shift+B</code>)'}</li>
              <li>${(window.T && T.importPcStep2) || '下のボタンを<b>ドラッグ</b>してブックマークバーへ:'}<br><a class="wwm-bm-link" id="wwmBmLink" data-i18n="importBmLabel" href="${bmUrl}">${(window.T && T.importBmLabel) || '風燕計インポート'}</a></li>
              <li>${(window.T && T.importPcStep3) || '下の「公式データツールを開く」 → ログイン後、登録したブックマークをクリック'}</li>
            </ol>
          </div>
          <div class="wwm-setup-panel" data-panel="mobile" ${isMobile?'':'hidden'}>
            <ol class="wwm-setup-steps">
              <li>${(window.T && T.importMobStep1) || '下のコードをコピー:'}<br><textarea class="wwm-bm-code" id="wwmBmCode" readonly>${bmUrl}</textarea><br><button class="wwm-btn-secondary" id="wwmCopyBtn">${(window.T && T.importCopy) || 'コピー'}</button></li>
              <li>${(window.T && T.importMobStep2) || '公式ツールをブックマーク登録'}</li>
              <li>${(window.T && T.importMobStep3) || 'ブックマーク編集 → URL をコピーしたコードに置換 → 名前「WWM インポート」'}</li>
              <li>${(window.T && T.importMobStep4) || '公式ツール開いた状態で アドレスバーに「WWM」入力 → 候補タップ'}</li>
            </ol>
          </div>
        </div>
      </details>
      <div class="wwm-btn-row" style="margin-top:16px;margin-bottom:16px;">
        <button type="button" class="wwm-btn-primary" id="wwmOpenOfficialBtn" data-i18n="importOpenOfficial">${(window.T && T.importOpenOfficial) || '公式データツールを開く'}</button>
      </div>
      ${lastHtml}
    `;
    const re = body.querySelector('#wwmReapplyBtn');
    if (re) re.addEventListener('click', () => {
      const stored = _loadStored();
      if (stored) { m.remove(); openPreviewModal(stored.data, stored.importedAt, stored.state); }
    });
    body.querySelector('#wwmOpenOfficialBtn').addEventListener('click', () => {
      const isMobile = /Mobi|Android|iPhone|iPad|iPod|Touch/i.test(navigator.userAgent) || window.matchMedia('(max-width: 480px)').matches;
      if (isMobile) {
        // mobile: 自タブ遷移 → bookmarklet実行で計算ツールpreviewへ再遷移 = 1タブ完結
        location.href = officialUrl;
      } else {
        window.open(officialUrl, 'wwm-official');
      }
    });
    body.querySelectorAll('.wwm-setup-tab').forEach(t => {
      t.addEventListener('click', () => {
        const tab = t.dataset.tab;
        body.querySelectorAll('.wwm-setup-tab').forEach(x => x.classList.toggle('active', x.dataset.tab === tab));
        body.querySelectorAll('.wwm-setup-panel').forEach(p => p.hidden = (p.dataset.panel !== tab));
      });
    });
    const cp = body.querySelector('#wwmCopyBtn');
    if (cp) cp.addEventListener('click', () => {
      const ta = body.querySelector('#wwmBmCode');
      ta.select(); ta.setSelectionRange(0, 99999);
      let ok = false;
      try { ok = document.execCommand('copy'); } catch(e) {}
      const _C=(window.T&&T.importCopied)||'コピー完了 ✓', _C0=(window.T&&T.importCopy)||'コピー';
      if (navigator.clipboard) navigator.clipboard.writeText(ta.value).then(() => { cp.textContent = _C; setTimeout(() => cp.textContent = _C0, 2000); }).catch(()=>{});
      else if (ok) { cp.textContent = _C; setTimeout(() => cp.textContent = _C0, 2000); }
    });
  }

  renderIntro();
}

// ── Preview Modal (2-step: card1=preview, card2=enhance/arsenal) ─
async function openPreviewModal(data, importedAt, savedState) {
  importedAt = importedAt || new Date().toISOString();
  // setup modal が開いていれば閉じる (bookmarklet 経由 import後の残置 防止)
  const setupModal = document.getElementById('wwmSetupModal');
  if (setupModal) setupModal.remove();
  await _loadDicts();
  const summary = summarizeRoleInfo(data);
  // ステップ間で状態維持。優先度: 引数 savedState > localStorage(IMPORT_STATE_KEY) > default
  const defaultState = {
    enhance: { 1: 50, 2: 50, 10: 50, 11: 50 },
    xinfaTiers: { 0: 6, 1: 6, 2: 6, 3: 6 },
    arsenal: {
      path: 'bamboocut',
      tiers: {
        41: { peaked: true, min: 12, max: 25 },
        51: { peaked: true, min: 17, max: 34 },
        56: { peaked: true, min: 17, max: 34 },
        61: { peaked: true, min: 17, max: 34 },
        71: { peaked: true, min: 17, max: 34 },
        81: { peaked: true, min: 17, max: 34 },
        86: { peaked: true, min: 17, max: 34 }
      }
    }
  };
  let stateSrc = savedState;
  if (!stateSrc) {
    stateSrc = WWMHelpers.storage.loadJSON(IMPORT_STATE_KEY);
  }
  const state = stateSrc ? JSON.parse(JSON.stringify(stateSrc)) : defaultState;
  const m = _createModal('wwmPreviewModal', 'importPreviewTitle', '<div id="wwmCardBody"></div>', 'assets/icons/scroll-quill.svg');
  m.querySelector('.wwm-modal').classList.add('wwm-modal-wide');
  const body = m.querySelector('#wwmCardBody');

  function renderStep1() {
    const detailHtml = renderPreviewDetail(summary, data);
    // 受信 data が旧 bookmarklet 産なら preview にも再登録案内
    const bmNotice = ((data?._bmVer || 0) < WWM_BM_VERSION)
      ? `<p class="wwm-bm-notice">${(window.T && T.bmOutdatedNotice) || 'ブックマークレットが旧版です — 再登録 + 再インポートで武術・流派・奇術アイコンがカードに反映されます'}</p>`
      : '';
    body.innerHTML = `
      ${bmNotice}
      <div class="wwm-preview-summary">${detailHtml}</div>
      <div class="wwm-btn-row" style="margin-top:16px;">
        <button class="wwm-btn-primary" id="wwmNextBtn">${(window.T && T.importNextBtn) || '次へ'}</button>
        <button class="wwm-btn-secondary" id="wwmCancelBtn">${(window.T && T.importCancelBtn) || 'キャンセル'}</button>
      </div>
    `;
    body.querySelector('#wwmCancelBtn').addEventListener('click', () => m.remove());
    body.querySelector('#wwmNextBtn').addEventListener('click', renderStep2);
  }

  function renderStep2() {
    body.innerHTML = renderEnhanceArsenalForm(state, data);
    _attachEnhanceArsenalEvents(body, state);
    body.querySelector('#wwmBackBtn').addEventListener('click', renderStep1);
    body.querySelector('#wwmCancelBtn').addEventListener('click', () => m.remove());
    body.querySelector('#wwmApplyBtn').addEventListener('click', () => {
      const msg = (window.T && T.importConfirmMsg) || '現在設定されている数値がインポートデータに差し変わりますがよろしいですか？';
      if (!confirm(msg)) return;
      applyImport(data, importedAt, state);
      m.remove();
      if (window.showToast) showToast((window.T && T.importDone) || 'インポート完了');
    });
    body.addEventListener('wwm-rerender-step2', renderStep2);
  }
  renderStep1();
}

// ── Step2 form (観音 + 武庫) ────────────────────────────────────
const _ARSENAL_TIERS = [86, 81, 71, 61, 56, 51, 41];
const _ARSENAL_TIER_PRESET = { 41: { min: 12, max: 25 }, default: { min: 17, max: 34 } };
const _ARSENAL_PATHS = [
  { key: 'phys',       ja: '汎用', labelKey:'pathPhys',       minStat: 'minPhys',       maxStat: 'maxPhys'       },
  { key: 'bellstrike', ja: '鋼鳴', labelKey:'pathBellstrike', minStat: 'minBellstrike', maxStat: 'maxBellstrike' },
  { key: 'stonesplit', ja: '砕岩', labelKey:'pathStonesplit', minStat: 'minStonesplit', maxStat: 'maxStonesplit' },
  { key: 'silkbind',   ja: '糸操', labelKey:'pathSilkbind',   minStat: 'minSilkbind',   maxStat: 'maxSilkbind'   },
  { key: 'bamboocut',  ja: '瞬嵐', labelKey:'pathBamboocut',  minStat: 'minBamboocut',  maxStat: 'maxBamboocut'  }
];
function _arsenalPathLabel(p){ return (window.T && window.T[p.labelKey]) || p.ja; }
function _arsenalStatLabels(pathKey) {
  const p = _ARSENAL_PATHS.find(x => x.key === pathKey) || _ARSENAL_PATHS[0];
  return {
    min: _STAT_LABELS_PROXY[p.minStat] || p.minStat,
    max: _STAT_LABELS_PROXY[p.maxStat] || p.maxStat
  };
}
function _tierLabel(lv) {
  const lang = _curLangImport();
  if (lang === 'en') return `Tier ${lv} Arsenal`;
  if (lang === 'zh') return `Lv.${lv}武库`;
  if (lang === 'ko') return `Lv.${lv} 무고`;
  return `Lv${lv}武庫`;
}
// インポートカード装備順 (上段: 主武器/副武器、下段: 環/佩び物)
const _ENHANCE_SLOTS = [
  { id: '1',  label: '主武器' },
  { id: '2',  label: '副武器' },
  { id: '10', label: '環'    },
  { id: '11', label: '佩び物' }
];

// calc.js param名 → 日本語ラベル (game準拠)
const _XINFA_EFFECT_LABELS_JA = {
  critRate: '会心率', critRateAdj: '会心率', crit: '会心率',
  sympathyRate: '会意率', sympathyRateAdj: '会意率', affinity: '会意率',
  hitRate: '命中率', precision: '命中率',
  addCritRate: '付加会心率', addSympathyRate: '付加会意率',
  directCrit: '付加会心率', directAffinity: '付加会意率',
  critBoost: '会心攻撃強化', critDmgBonus: '会心攻撃強化',
  sympathyBoost: '会意攻撃強化', affinityDmgBonus: '会意攻撃強化',
  elemAtkBoost: '属性攻撃強化', attrDmgBonus: '属性攻撃強化',
  elemPenAdd: '属性貫通', attrPen: '属性貫通',
  minPhysATKAdd: '最小外功攻撃', maxPhysATKAdd: '最大外功攻撃',
  minPhys: '最小外功攻撃', maxPhys: '最大外功攻撃',
  outerPenAdd: '外功貫通', physPen: '外功貫通',
  physDmgBoost: '外功ダメージ強化', physDmgBonus: '外功ダメージ強化',
  allMartialBoost: '全武術効果増加', allWeaponDmg: '全武術効果増加',
  specMartialBoost: '指定武術効果強化',
  bossBoost: 'BOSSダメージ', bossDmg: 'BOSSダメージ',
  playerBoost: 'PvPダメージ', playerUnitDmg: 'PvPダメージ',
  enemyDebuff: '敵デバフ',
  // path別 min/max攻撃
  minBellstrike: '最小鋼鳴攻撃', maxBellstrike: '最大鋼鳴攻撃', bellstrikePen: '鋼鳴貫通',
  minStonesplit: '最小砕岩攻撃', maxStonesplit: '最大砕岩攻撃', stonesplitPen: '砕岩貫通',
  minSilkbind: '最小糸操攻撃', maxSilkbind: '最大糸操攻撃', silkbindPen: '糸操貫通',
  minBamboocut: '最小瞬嵐攻撃', maxBamboocut: '最大瞬嵐攻撃', bamboocutPen: '瞬嵐貫通',
  minVoid: '最小無相攻撃', maxVoid: '最大無相攻撃', voidPen: '無相貫通',
  // 防御系
  maxHp: '気血最大値', physDef: '外功防御',
  // 奇術
  stMysticDmg: '単体奇術ダメ', stBurstMysticDmg: '単体爆発奇術ダメ',
  stControlMysticDmg: '単体制御奇術ダメ', areaMysticDmg: '範囲奇術ダメ',
  areaDmgMysticDmg: '範囲ダメ奇術', areaDebuffMysticDmg: '範囲弱体奇術'
};
function _fmtXinfaVal(val) {
  if (typeof val !== 'number') return String(val);
  if (val > 0 && val < 1) return '+' + (val * 100).toFixed(1) + '%';
  return '+' + val.toFixed(1).replace(/\.0$/, '');
}
function _xinfaTierEffectsJa(eff) {
  if (!eff) return '';
  const parts = [];
  for (const [k, v] of Object.entries(eff)) {
    if (typeof v !== 'number') continue;
    const label = _XINFA_EFFECT_LABELS_JA[k] || k;
    parts.push(`${label} ${_fmtXinfaVal(v)}`);
  }
  return parts.join(', ');
}
function _xinfaEffectsText(xinfa, tier) {
  if (!xinfa?.attributeBuff || tier < 2) return '<span class="wwm-muted">効果なし</span>';
  const lang = _curLangImport();
  const parts = [];
  const t2eff = xinfa.attributeBuff.tier2?.effects;
  const t5eff = xinfa.attributeBuff.tier5?.effects;
  const _tierRaw = (t) => {
    const r = t?.rawI18n;
    return (r?.[lang]) || r?.en || r?.ja || '';
  };
  if (tier >= 2 && t2eff && Object.keys(t2eff).length) {
    if (lang === 'ja') parts.push('T2: ' + _xinfaTierEffectsJa(t2eff));
    else parts.push('T2: ' + _tierRaw(xinfa.attributeBuff.tier2));
  }
  if (tier >= 5 && t5eff && Object.keys(t5eff).length) {
    if (lang === 'ja') parts.push('T5: ' + _xinfaTierEffectsJa(t5eff));
    else parts.push('T5: ' + _tierRaw(xinfa.attributeBuff.tier5));
  }
  return parts.length ? parts.join('<br>') : '<span class="wwm-muted">効果なし</span>';
}

function renderEnhanceArsenalForm(state, roleInfo) {
  const T0 = window.T || {};
  // 心法 4スロット Tier 選択
  const passive = roleInfo?.passiveSlots || [];
  const xinfa = window.WWM_XINFA || {};
  const xinfaRows = [0,1,2,3].map(i => {
    const xid = passive[i];
    let xname = '—';
    if (xid) {
      const n = window.WWM_DS.name('xinfa', xid, _curLangImport());
      xname = n.indexOf('[xinfa:') === 0 ? `xinfa#${xid}` : n;
    }
    const curTier = state.xinfaTiers?.[i] ?? 6;
    const opts = [0,1,2,3,4,5,6].map(t => `<option value="${t}"${t===curTier?' selected':''}>Tier ${t}</option>`).join('');
    const effText = xid ? _xinfaEffectsText(xinfa[xid], curTier) : '';
    return `
      <div class="wwm-xinfa-cell" data-xinfa-row="${i}">
        <span class="wwm-xinfa-label">${i+1}. ${xname}</span>
        <select class="wwm-xinfa-tier" data-xinfa-slot="${i}" ${xid?'':'disabled'}>${opts}</select>
        <span class="wwm-xinfa-effect">${effText}</span>
      </div>
    `;
  }).join('');
  const pathRadios = _ARSENAL_PATHS.map(p => `
    <label class="wwm-radio-label">
      <input type="radio" name="wwmArsenalPath" value="${p.key}" ${state.arsenal.path === p.key ? 'checked' : ''}>
      ${_arsenalPathLabel(p)}
    </label>
  `).join('');
  const statLabels = _arsenalStatLabels(state.arsenal.path);
  const tierRows = _ARSENAL_TIERS.map(lv => {
    const t = state.arsenal.tiers[lv];
    const preset = lv === 41 ? _ARSENAL_TIER_PRESET[41] : _ARSENAL_TIER_PRESET.default;
    return `
      <div class="wwm-arsenal-tier" data-tier="${lv}">
        <span class="wwm-arsenal-lv">${_tierLabel(lv)}</span>
        <label class="wwm-arsenal-peaked-label">
          <input type="checkbox" class="wwm-arsenal-peaked" data-tier="${lv}" ${t.peaked ? 'checked' : ''}>
          ${T0.importArsenalPeaked || '頂点'}
        </label>
        <span class="wwm-arsenal-preset" style="${t.peaked ? '' : 'display:none'}">
          <span class="wwm-stat-label">${statLabels.min}</span> +${preset.min}
          <span class="wwm-stat-label">${statLabels.max}</span> +${preset.max}
        </span>
        <span class="wwm-arsenal-custom" style="${t.peaked ? 'display:none' : ''}">
          <span class="wwm-stat-label">${statLabels.min}</span>
          <input type="number" min="0" value="${t.min}" class="wwm-num-input" data-tier-min="${lv}">
          <span class="wwm-stat-label">${statLabels.max}</span>
          <input type="number" min="0" value="${t.max}" class="wwm-num-input" data-tier-max="${lv}">
        </span>
      </div>
    `;
  }).join('');
  return `
    <div class="wwm-step2">
      <h3 class="wwm-step2-section-title">${T0.importStep2XinfaTitle || '心法 Tier'}</h3>
      <p class="wwm-muted" style="font-size:12px;margin:4px 0 8px;">${T0.importStep2XinfaHint || '各心法の到達Tier (1-5)。Tier2 で Tier2効果、Tier5 で Tier5効果 加算。'}</p>
      <div class="wwm-xinfa-grid">${xinfaRows}</div>

      <h3 class="wwm-step2-section-title" style="margin-top:16px;">${T0.importArsenalTitle || '武庫 (Arsenal)'}</h3>
      <div class="wwm-arsenal-paths">
        <span class="wwm-info-label">${T0.importArsenalPath || '武庫種別'}:</span>
        ${pathRadios}
      </div>
      <div class="wwm-arsenal-tiers">${tierRows}</div>
    </div>
    <div class="wwm-btn-row" style="margin-top:16px;">
      <button class="wwm-btn-secondary" id="wwmBackBtn">${T0.importBackBtn || '戻る'}</button>
      <button class="wwm-btn-primary" id="wwmApplyBtn">${T0.importApplyBtn || 'インポート実行'}</button>
      <button class="wwm-btn-secondary" id="wwmCancelBtn">${T0.importCancelBtn || 'キャンセル'}</button>
    </div>
  `;
}

function _attachEnhanceArsenalEvents(root, state) {
  // 心法 Tier 変更
  if (!state.xinfaTiers) state.xinfaTiers = { 0: 6, 1: 6, 2: 6, 3: 6 };
  root.querySelectorAll('[data-xinfa-slot]').forEach(sel => {
    sel.addEventListener('change', e => {
      const slot = e.target.dataset.xinfaSlot;
      const v = parseInt(e.target.value, 10);
      state.xinfaTiers[slot] = isNaN(v) ? 6 : v;
      // 効果テキスト更新
      const row = e.target.closest('[data-xinfa-row]');
      const effEl = row?.querySelector('.wwm-xinfa-effect');
      if (effEl) {
        const passive = WWMState.roleInfo?.passiveSlots || [];
        const xid = passive[parseInt(slot,10)];
        const xinfa = window.WWM_XINFA?.[xid];
        effEl.innerHTML = xinfa ? _xinfaEffectsText(xinfa, state.xinfaTiers[slot]) : '';
      }
    });
  });
  // 武庫 path 変更 → tier rows 再描画 (stat label 更新)
  root.querySelectorAll('input[name="wwmArsenalPath"]').forEach(r => {
    r.addEventListener('change', e => {
      state.arsenal.path = e.target.value;
      // 再描画は呼び出し元 (renderStep2) が必要 → ここでは event発火で対応
      root.dispatchEvent(new CustomEvent('wwm-rerender-step2', { bubbles: true }));
    });
  });
  // 武庫 頂点 toggle
  root.querySelectorAll('.wwm-arsenal-peaked').forEach(cb => {
    cb.addEventListener('change', e => {
      const lv = e.target.dataset.tier;
      const peaked = e.target.checked;
      const t = state.arsenal.tiers[lv];
      t.peaked = peaked;
      if (peaked) {
        const preset = lv === '41' ? _ARSENAL_TIER_PRESET[41] : _ARSENAL_TIER_PRESET.default;
        t.min = preset.min; t.max = preset.max;
      }
      const tierEl = root.querySelector(`.wwm-arsenal-tier[data-tier="${lv}"]`);
      tierEl.querySelector('.wwm-arsenal-preset').style.display = peaked ? '' : 'none';
      tierEl.querySelector('.wwm-arsenal-custom').style.display = peaked ? 'none' : '';
    });
  });
  // 武庫 Min/Max カスタム入力
  root.querySelectorAll('[data-tier-min]').forEach(inp => {
    inp.addEventListener('input', e => {
      const lv = e.target.dataset.tierMin;
      state.arsenal.tiers[lv].min = parseInt(e.target.value || '0', 10);
    });
  });
  root.querySelectorAll('[data-tier-max]').forEach(inp => {
    inp.addEventListener('input', e => {
      const lv = e.target.dataset.tierMax;
      state.arsenal.tiers[lv].max = parseInt(e.target.value || '0', 10);
    });
  });
}

// ── Summary / preview detail ───────────────────────────────────
function summarizeRoleInfo(d) {
  return {
    uid: d.uid || d.userId || d.roleId || d.playerId || d.id || d.roleID || d.userID || '',
    roleName: d.roleName || '?',
    level: d.level || 0,
    school: d.school,
    crDay: d.crDay,
    scoreTotal: (d.scores58 || 0) + (d.scores59 || 0) + (d.scores60 || 0),
    xiuWeiKungFu: d.xiuWeiKungFu,
    maxXiuWeiKungFu: d.maxXiuWeiKungFu,
    kongfuMain: d.kongfuMain,
    kongfuSub: d.kongfuSub,
    passiveSlots: d.passiveSlots || [],
    wearEquipCount: d.wearEquips ? Object.keys(d.wearEquips).length : 0,
    wearEquipsDetailed: d.wearEquipsDetailed || null
  };
}

function _renderEquipSlot(slot, eq) {
  if (!eq || !eq.exVo) return '';
  const ex = eq.exVo;
  const setName = _setName(ex.suffix, slot);
  const isBow = (slot === '9' || slot === '21');
  const baseAttrsHtml = isBow ? '' : Object.entries(ex.baseAttrs || {}).map(([k,v]) =>
    `<li><span class="wwm-stat-name">${_BASE_ATTR_LABELS[k] || k}</span><span class="wwm-stat-val">${v}</span></li>`
  ).join('');
  const affixHtml = isBow ? '' : (ex.baseAffixes || []).map((a, idx) => {
    const d = a.equipmentDetails || [];
    const [id, val, ratio, rank, useful] = d;
    const rclass = _RANK_CLASSES[rank] || '';
    const pct = ratio !== undefined ? `<span class="wwm-stat-pct"> (${(ratio*100).toFixed(0)}%)</span>` : '';
    const star = useful ? ` <span class="wwm-affix-useful" title="${(window.T && window.T.tipAffixUseful) || 'ゲーム内 👍 マーク (火力寄与)'}"><span class="wwm-good-icon"><svg viewBox="0 0 24 24"><path d="M2 21h4V9H2v12zm20-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L13.17 1 7.59 6.59C7.22 6.95 7 7.45 7 8v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-1z"/></svg></span></span>` : '';
    return `<li class="${rclass}"><span class="wwm-stat-name">${_affixName(id, idx)}${star}</span><span class="wwm-stat-val">${_fmtAffixValShort(val)}${pct}</span></li>`;
  }).join('');
  const slotLabel = _SLOT_LABELS[slot] || ('slot ' + slot);
  return `
    <div class="wwm-equip-slot" data-slot="${slot}">
      <div class="wwm-equip-slot-header"><b>${slotLabel}</b>${setName ? ` <span class="wwm-muted">- ${setName}</span>` : ''}</div>
      ${baseAttrsHtml ? `<div class="wwm-equip-base"><b>${(window.T&&T.importBaseStats)||'基本ステータス'}</b><ul class="wwm-list">${baseAttrsHtml}</ul></div>` : ''}
      ${affixHtml ? `<div class="wwm-equip-affix"><b>${(window.T&&T.importSubStats)||'副ステータス'}</b><ul class="wwm-list">${affixHtml}</ul></div>` : ''}
    </div>
  `;
}

function _curLangImport() {
  return (window.currentLang) || (document.documentElement.lang) || 'ja';
}
function _pickName(names, fallback) {
  if (!names) return fallback;
  const lang = _curLangImport();
  return names[lang] || names.en || names.ja || fallback;
}
function _kongfuName(id) {
  if (id === undefined || id === null || id === 0) return '—';
  const n = window.WWM_DS.name('kongfu', id, _curLangImport());
  return n.indexOf('[kongfu:') === 0 ? ('武術ID ' + id) : n;
}
function _xinfaName(id) {
  if (id === undefined || id === null || id === 0) return '—';
  const n = window.WWM_DS.name('xinfa', id, _curLangImport());
  return n.indexOf('[xinfa:') === 0 ? ('心法ID ' + id) : n;
}
async function _loadDicts() {
  // dictMap 唯一源 = data-store.js CALC_DICTS (P4-mini 供給一元化 2026-06-10)
  try {
    await window.WWM_DS.ensureCalcData();
  } catch(e) { console.warn('[WWM Import] dict load failed:', e); }
}

// statKey → 4言語ラベル。 真実源 = data/i18n/stat.json + data/i18n/path.json (合成は DataStore)。
// _STAT_LABELS_PROXY = DataStore.name('stat', key, lang) の薄ラッパ (旧 _STAT_LABELS_I18N[L]?.[k] 互換)。
// 旧 _STAT_LABELS_I18N dict 構造は廃止 (2026-06-09 i18n 一本化)、 callsite 用 stub のみ残置。
const _STAT_LABELS_I18N_STUB = { ja: {}, en: {}, zh: {}, ko: {} }; // window._STAT_LABELS_I18N_ALL 互換用 (空、 sidebar/gear.js 等 fallback)
const _STAT_LABELS_I18N = _STAT_LABELS_I18N_STUB; // backward compat alias
const _STAT_LABELS = _STAT_LABELS_I18N.ja;        // backward compat alias
const _STAT_LABELS_PROXY = new Proxy({}, {
  get(_, k) {
    if (typeof k !== 'string') return undefined;
    if (window.WWM_DS) {
      const L = window.currentLang || 'ja';
      const v = window.WWM_DS.name('stat', k, L);
      if (v && v.indexOf('[stat:') !== 0) return v;
      // path系等 = ui に統合済 → t() で引く
      const t = window.WWM_DS.t(k);
      if (t !== k) return t;
      // 武術 affix (swordQ/moBladeShield/bleed 等) = stat 物理保持 撤去 → _martialAffix 合成で取得
      const m = window.WWM_DS.name('martial-affix', k, L);
      if (m && m.indexOf('[martial-affix:') !== 0) return m;
    }
    return undefined;
  }
});

// 弓系 internal ID → 日本語名 (Zb() null返却分の補完)
const _BOW_INTERNAL_LABELS = {
  290: '弓矢基礎ダメ', 291: '弱点ダメ',
  293: '明鏡止水消費減', 294: '明鏡止水時間+',
  296: '空中降下低下', 298: '最大飛行時間+'
};

// ── スロット / ステ名 解決 ───────────────────────────────────────
const _SLOT_LABEL_KEYS = {
  '1':'slotMain','2':'slotSub','3':'slotHelm','4':'slotChest','5':'slotLegs','8':'slotHands',
  '9':'slotDisc','10':'slotRing','11':'slotPendant','21':'slotBow'
};
const _SLOT_LABELS_JA = {
  '1':'主武器','2':'副武器','3':'冠','4':'胸当て','5':'膝鎧','8':'小手',
  '9':'射玦','10':'環','11':'佩び物','21':'弓矢'
};
const _SLOT_LABELS = new Proxy({}, {
  get(_,k){ return (window.T && window.T[_SLOT_LABEL_KEYS[k]]) || _SLOT_LABELS_JA[k] || ('slot '+k); }
});
const _SLOT_ORDER = ['1', '2', '10', '11', '3', '4', '5', '8', '21', '9'];
const _BASE_ATTR_LABEL_KEYS = {
  MIN_W_ATK:'minPhys', MAX_W_ATK:'maxPhys', W_DEF:'physDef', HP_MAX:'maxHp',
  ARCHER_DAMAGE:'archerDamage', ARCHER_WEAKPOINT_DAMAGE:'archerWeakpointDamage'
};
const _BASE_ATTR_LABELS_JA = {
  MIN_W_ATK: '最小外功攻撃', MAX_W_ATK: '最大外功攻撃',
  W_DEF: '外功防御', HP_MAX: '気血最大値',
  ARCHER_DAMAGE: '弓矢基礎ダメ', ARCHER_WEAKPOINT_DAMAGE: '弓矢弱点ダメ'
};
const _BASE_ATTR_LABELS = new Proxy({}, {
  get(_,k){
    const sk=_BASE_ATTR_LABEL_KEYS[k];
    return _STAT_LABELS_PROXY[sk] || _BASE_ATTR_LABELS_JA[k] || k;
  }
});
// affix ID → statKey (= _STAT_LABELS_I18N key 経由 多言語化)
// statKey 未登録は customKey (extraAffix*) で別途解決
const _AFFIX_LABELS_STATKEY = {
  '9213011':'agility',
  '9233001':'minPhys', '9233002':'maxPhys',
  '9293004':'agility',
  '9293007':'minPhys', '9293008':'maxPhys',
  '9293018':'precision', '9293019':'crit', '9293020':'affinity',
  '9293025':'allWeaponDmg',
  '9293028':'allMartialBoost',
  '9293032':'stBurstMysticDmg',
  '9293033':'bossDmg',
  '9243003':'precision', '9243005':'affinity',
  '9253004':'crit', '9253005':'affinity',
  '9273001':'archerBaseDmg', '9273004':'archerMaxFlightTime',
  '9283002':'archerBaseDmg', '9283003':'archerWeakpointDmg',
  '9283004':'mirrorMindCost', '9283005':'mirrorMindDuration', '9283007':'aerialFallReduce',
  '270701':'physPen', '270703':'voidPen',
  '270502':'infernalTwinbladesLight', '270505':'mortalRopeDartRodent'
};
const _AFFIX_LABELS_JA_FALLBACK = {
  '9213011':'速','9233001':'最小外功攻撃強化','9233002':'最大外功攻撃強化',
  '9293004':'速','9293007':'最小外功攻撃強化','9293008':'最大外功攻撃強化',
  '9293018':'命中率強化','9293019':'会心率強化','9293020':'会意率強化',
  '9293025':'武器種武学ダメ増加','9293028':'全武学効果増加','9293032':'単体爆発奇術ダメ','9293033':'BOSSダメージ',
  '9243003':'命中率強化','9243005':'会意率強化','9253004':'会心率強化','9253005':'会意率強化',
  '9273001':'弓矢基礎ダメ','9273004':'最大飛行時間+','9283002':'弓矢基礎ダメ','9283003':'弱点ダメージ強化',
  '9283004':'明鏡止水消費減','9283005':'明鏡止水時間+','9283007':'空中降下低下',
  '270701':'外功貫通強化','270703':'無相貫通','270502':'獄炎双剣・軽撃','270505':'浮塵縄・鼠'
};
const _AFFIX_LABELS = new Proxy({}, {
  get(_, id) {
    const sk = _AFFIX_LABELS_STATKEY[id];
    if (sk) {
      const v = _STAT_LABELS_PROXY[sk];
      if (v) return v;
    }
    return _AFFIX_LABELS_JA_FALLBACK[id];
  },
  has(_, id){ return id in _AFFIX_LABELS_JA_FALLBACK; }
});
const _RANK_LABELS = { 1: '青', 2: '紫', 3: '金' };
const _RANK_CLASSES = { 1: 'wwm-rank-blue', 2: 'wwm-rank-purple', 3: 'wwm-rank-gold' };
function _affixName(id, idx) {
  // 1) ハードコード優先 (旧 _AFFIX_LABELS で覆ったもの — 微調整用)
  if (_AFFIX_LABELS[id]) return _AFFIX_LABELS[id];
  // 2) WWM_AFFIX (data/affix.json) から statKey 解決
  const a = window.WWM_AFFIX && window.WWM_AFFIX[id];
  if (a) {
    if (a.statKey && _STAT_LABELS_PROXY[a.statKey]) return _STAT_LABELS_PROXY[a.statKey];
    if (a.statKey) return a.statKey;  // 未訳 statKey
    if (a.internal && _BOW_INTERNAL_LABELS[a.internal]) return _BOW_INTERNAL_LABELS[a.internal];
    if (a.internal) return 'internal#' + a.internal;
  }
  // 3) affix6 スロット (idx===5) の未登録 ID = PvP専用定音 (ユーザー仕様)。計算寄与は元々ゼロで安全弁にもなる。
  if (idx === 5) return (window.T && window.T.pvpExclusiveAffix) || 'PvP専用定音';
  return 'affix#' + id;
}
function _setName(suffix) {
  const n = window.WWM_DS.name('sets', String(suffix), _curLangImport());
  return n.indexOf('[sets:') === 0 ? '' : n;
}
// import.js preview 用 簡易 fmt (statKey 未参照、 0-1 range で % 推定)。
// sidebar.js 側 _fmtAffixVal (statKey 必須、 affix-utils.js) と 衝突回避のため rename。
function _fmtAffixValShort(v) {
  if (typeof v !== 'number') return String(v);
  if (v > 0 && v < 1) return (v * 100).toFixed(1) + '%';
  return v.toFixed(1);
}

function renderPreviewDetail(s, d) {
  const xin = s.passiveSlots || [];
  const T_=window.T||{};
  const _xL=T_.importLabelXinfa||'心法';
  return `
    <div class="wwm-info-grid">
      <div class="wwm-info-col">
        ${s.uid ? `<div class="wwm-info-row"><span class="wwm-info-label">${T_.importLabelUID||'UID'}</span><span class="wwm-info-val">${s.uid}</span></div>` : ''}
        <div class="wwm-info-row"><span class="wwm-info-label">${T_.importLabelCharName||'キャラ名'}</span><span class="wwm-info-val">${s.roleName} (Lv ${s.level})</span></div>
        <div class="wwm-info-row"><span class="wwm-info-label">${T_.importLabelMainKf||'主武術'}</span><span class="wwm-info-val">${_kongfuName(s.kongfuMain)}</span></div>
        <div class="wwm-info-row"><span class="wwm-info-label">${T_.importLabelSubKf||'副武術'}</span><span class="wwm-info-val">${_kongfuName(s.kongfuSub)}</span></div>
      </div>
      <div class="wwm-info-col">
        <div class="wwm-info-row"><span class="wwm-info-label">${_xL} 1</span><span class="wwm-info-val">${_xinfaName(xin[0])}</span></div>
        <div class="wwm-info-row"><span class="wwm-info-label">${_xL} 2</span><span class="wwm-info-val">${_xinfaName(xin[1])}</span></div>
        <div class="wwm-info-row"><span class="wwm-info-label">${_xL} 3</span><span class="wwm-info-val">${_xinfaName(xin[2])}</span></div>
        <div class="wwm-info-row"><span class="wwm-info-label">${_xL} 4</span><span class="wwm-info-val">${_xinfaName(xin[3])}</span></div>
      </div>
      <div class="wwm-info-col">
        <div class="wwm-info-row"><span class="wwm-info-label">${T_.importLabelXiuwei||'総合武力'}</span><span class="wwm-info-val">${s.xiuWeiKungFu} / ${s.maxXiuWeiKungFu}</span></div>
      </div>
    </div>
    ${s.wearEquipsDetailed ? `
      <div class="wwm-equip-section">
        ${_SLOT_ORDER.filter(slot => s.wearEquipsDetailed[slot]).map(slot => _renderEquipSlot(slot, s.wearEquipsDetailed[slot])).join('')}
      </div>
    ` : ''}
  `;
}

// ── localStorage 永続化 ─────────────────────────────────────────
function _saveStored(data, importedAt, state) {
  WWMHelpers.storage.saveJSON(IMPORT_STORAGE_KEY, { data, importedAt, state });
}
function _loadStored() {
  return WWMHelpers.storage.loadJSON(IMPORT_STORAGE_KEY);
}
function getLastImportSummary() {
  const s = _loadStored();
  if (!s) return null;
  const sum = summarizeRoleInfo(s.data);
  return {
    roleName: sum.roleName,
    level: sum.level,
    importedAt: new Date(s.importedAt).toLocaleString()
  };
}

// ── Import gate (Tier 判定中 全操作抑止 modal) ──────────────────
// import 実行 → opt best 確定 (Tier 判定完了) まで 全クリック/キー操作 抑止。
// EXPORT/SHARE 等の「Tier 判定前に押せてしまう」穴を 個別ガードでなく 1 ゲートに集約。
// 半透明 backdrop = 背後の score 描画 + Tier ルーレット演出は見せる (先 paint 設計維持)。
let _importGate = null; // { el, inerted, watchdog }
function _importGateShow() {
  // OBS view (表示専用) は opt 経路が別 = gate 不要
  if (document.documentElement.classList.contains('wwm-view-sidebar')) return;
  _importGateClose(false); // 残骸除去 (連続 import 防御)
  const T = window.T || {};
  const el = document.createElement('div');
  el.id = 'wwmImportGate';
  el.className = 'wwm-gate-backdrop';
  el.innerHTML = `
    <div class="wwm-modal wwm-gate-modal" role="dialog" aria-modal="true" aria-busy="true" aria-live="polite" tabindex="-1">
      <h2 class="wwm-gate-title">${T.importingTitle ?? 'インポート処理中'}</h2>
      <div class="wwm-gate-bar"><div class="wwm-gate-fill" id="wwmGateFill"></div></div>
      <div class="wwm-gate-label" id="wwmGateLabel">${T.importingStats ?? 'ステータス計算中…'}</div>
    </div>`;
  document.body.appendChild(el);
  // 背後 inert 化 (キーボード/フォーカス遮断。 pointer は backdrop が遮断)
  const inerted = [];
  document.querySelectorAll('body > *').forEach(n => {
    if (n !== el && !n.inert) { n.inert = true; inerted.push(n); }
  });
  try { el.querySelector('.wwm-gate-modal').focus(); } catch(_) {}
  // watchdog: opt が永久に終わらない異常時の強制解除 (全操作 永久ロック防止)
  const watchdog = setTimeout(() => {
    _importGateClose(false);
    if (window.showToast) showToast((window.T?.errTierJudgeTimeout) ?? 'Tier 判定がタイムアウトしました。再インポートをお試しください', { error: true });
  }, 30000);
  _importGate = { el, inerted, watchdog };
}
function _importGateProgress(pct, label) {
  if (!_importGate) return;
  const f = _importGate.el.querySelector('#wwmGateFill');
  if (f) f.style.width = Math.min(100, pct) + '%';
  if (label) {
    const l = _importGate.el.querySelector('#wwmGateLabel');
    if (l) l.textContent = label;
  }
}
// opt.js の反復ループから呼ばれる (greedy は minDelta 打切で総数不定 → 真の % 不可)。
// 漸近式 15 + 80×(1-0.85^iter) = 常に前進、完了時 100% へ滑らか加速 (擬似 % の不自然さ回避)。
function _importGateTick(iter) {
  const pct = 15 + 80 * (1 - Math.pow(0.85, iter));
  _importGateProgress(pct, (window.T?.importingTier) ?? 'Tier 判定中…');
}
function _importGateClose(ok) {
  const g = _importGate;
  if (!g) return;
  _importGate = null;
  clearTimeout(g.watchdog);
  g.inerted.forEach(n => { try { n.inert = false; } catch(_) {} });
  if (ok) {
    // 100% 到達を見せてから fade out (backdrop transition の delay と連動)
    const f = g.el.querySelector('#wwmGateFill');
    if (f) { f.style.width = '100%'; f.classList.add('wwm-gate-fill-done'); }
    g.el.classList.add('wwm-gate-out');
    setTimeout(() => g.el.remove(), 500);
  } else {
    g.el.remove();
  }
}
window.WWMImportGate = { tick: _importGateTick };

// ── Apply: data + 観音/武庫 state を localStorage 保存 + 計算ツール 反映 ─
function applyImport(data, importedAt, state) {
  _saveStored(data, importedAt, state);
  WWMHelpers.storage.saveJSON(IMPORT_STATE_KEY, state);
  console.log('[WWM Import] applied:', { data, state });
  // Tier 基準値 (__WWM_OPT_BEST) を再 import 時にリセット → 直後の opt 完了で再確定。
  WWMState.opt.best = null;
  WWMState.opt.locked = false;
  WWMHelpers.storage.remove('wwm_opt_best_v1');
  // import時 自動リセット (2026-06-01〜): 前回 import後 user が編集した 新装備データ (virtual全部) を強制クリア。
  // 「現装備 = 新装備」 状態でスタート → 装備差分のノイズ排除、 操作性向上。 sentinel問題も同時解消。
  WWMState.virtual.gear = {};
  WWMState.virtual.kongfu = {};
  WWMState.virtual.xinfa = null;
  WWMState.virtual.arsenal = null;
  WWMHelpers.storage.remove('wwm_virtual_v1');
  // virtual に PvP sentinel (999999) 残骸があれば、その slot の affix6 のみ origEq の affix6 で復元 (他 affix は維持)。
  // 経緯: 前回 PvP装備で affix6 を sentinel にした virtual が PvE再import 後も残り「変更不可」になる事象を解消。
  try {
    const PVP_SENTINEL = 999999;
    const v = WWMState.virtual.gear;
    if (v && typeof v === 'object') {
      let touched = false;
      for (const [slot, vEq] of Object.entries(v)) {
        const aff = vEq?.exVo?.baseAffixes?.[5]?.equipmentDetails;
        if (aff && aff[0] === PVP_SENTINEL) {
          const origAff = data?.wearEquipsDetailed?.[slot]?.exVo?.baseAffixes?.[5]?.equipmentDetails;
          if (origAff) {
            vEq.exVo.baseAffixes[5].equipmentDetails = JSON.parse(JSON.stringify(origAff));
            touched = true;
          }
        }
      }
      if (touched && typeof window._saveVirtuals === 'function') window._saveVirtuals();
    }
  } catch(_) {}
  // stat params 構築 + sidebar 描画
  if (window.WWMStats && window.WWMSidebar) {
    // Tier 判定完了 (opt best 確定) まで 全操作抑止 gate (close は opt 完了/失敗/watchdog の 3 経路)
    _importGateShow();
    window.WWMStats.buildStatParams(data, state).then(params => {
      WWMState.params = params;
      WWMState.roleInfo = data;
      window.WWMSidebar.render(params);
      if (window.WWMSidebar?.gear) window.WWMSidebar.gear.render(data);
      if (window.WWMSidebar?.xinfa) window.WWMSidebar.xinfa.render(data);
      if (window.WWMSidebar?.diag) window.WWMSidebar.diag.render(data, params);
      if (window.WWMSidebar?.ranking) window.WWMSidebar.ranking.render(data, params);
      if (window.WWMSidebar?.hero) window.WWMSidebar.hero.update(params);
      // Phase 1: import 直後 baseline score 保存
      const res = WWMState.lastResult;
      if (res) {
        const bonus = (typeof window.__WWM_SET4_BONUS_OF === 'function')
          ? window.__WWM_SET4_BONUS_OF(data) : 0;
        WWMState.baseline = { expected: res.expected, statusScore: res.statusScore + bonus, tier: res.tier, ts: Date.now(), scoreVer: window.WWM_SCORE_VERSION || 1 };
        // 再import 成功 → 計算更新バナーがあれば消す
        if (typeof window._hideScoreBanner === 'function') window._hideScoreBanner();
        // OBS view (表示専用) では baseline を書き込まない (読込のみ)。スコアは変動しないので保存不要、汚染源を断つ。
        if (!document.documentElement.classList.contains('wwm-view-sidebar')) {
          if (window.WWMBaseline) window.WWMBaseline.save(WWMState.baseline);
          else { WWMHelpers.storage.saveJSON('wwm_baseline_score_v1', WWMState.baseline); }
        }
        if (window.WWMSidebar?.hero) window.WWMSidebar.hero.update(params);
        if (window.WWMSidebar?.history) window.WWMSidebar.history.record(data, { statusScore: res.statusScore + bonus, expected: res.expected, tier: res.tier });
      }
      // stats 構築 + 初期描画 完了 = gate 15% (以降は opt 反復 tick が前進させる)
      _importGateProgress(15);
      // 重い最適化(数秒)は 初期描画(mini-hero/score)を阻害しないよう await せず 2フレーム後に遅延起動。
      // (opt前に置くと opt の setTimeout(0) yield では paint が starve し score が opt完了まで見えない)
      if (window.WWMSidebar?.opt) {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          window.WWMSidebar.opt.render(data, params)
            // resolve でも best 未確定の経路あり (opt 内 silent return) → locked 時のみ 100% 演出
            .then(() => _importGateClose(!!WWMState.opt.locked))
            .catch(e => { console.error('[WWM] opt failed:', e); _importGateClose(false); });
        }));
      } else {
        _importGateClose(false); // opt 経路無し → gate 即解除 (deadlock 防止)
      }
    }).catch(e => {
      console.error('[WWM] stats build failed:', e);
      _importGateClose(false);
      // audit P2 (2026-06-07): silent failure → user 可視化 (import 完了に見えて panel 空のままの謎を解消)
      if (window.showToast) showToast((window.T?.errStatsBuild) ?? 'データの計算に失敗しました。再インポートをお試しください', { error: true });
    });
  }
}

// ── BroadcastChannel リレー ─────────────────────────────────────
// 公式tool タブが bookmarklet で計算ツールに置換された場合、既存の計算ツールタブが
// あればそちらにデータを渡してこのタブを自己破棄、無ければそのまま Preview表示。
let _bc = null;
try { _bc = new BroadcastChannel('wwm-import'); } catch(e) {}

if (_bc) {
  _bc.onmessage = (e) => {
    if (!e.data) return;
    if (e.data.type === 'import-relay' && e.data.payload) {
      // 他タブからのリレー受信 → ack送信 + Preview表示
      try { _bc.postMessage({ type: 'import-ack', id: e.data.id }); } catch(_) {}
      openPreviewModal(e.data.payload);
      try { window.focus(); } catch(_) {}
    }
  };
}

// ── Hash 検知 (page load 時自動実行) ────────────────────────────
function handleHashOnLoad() {
  const h = location.hash || '';
  if (!h.startsWith(IMPORT_HASH_PREFIX)) return;
  const b64 = h.slice(IMPORT_HASH_PREFIX.length);
  try {
    const json = _b64urlDecode(b64);
    const data = JSON.parse(json);
    history.replaceState(null, '', location.pathname + location.search);
    // 他の計算ツールタブが存在するか BroadcastChannel で ping
    _relayOrShow(data);
  } catch(e) {
    console.error('[WWM Import] hash decode failed:', e);
    // audit P2 (2026-06-07): raw e.message (英語例外) → i18n 文言 + error 寿命。 詳細は console に残置
    if (window.showToast) showToast((window.T?.errImportParse) ?? 'インポートデータの解析に失敗しました。公式ツールからもう一度実行してください', { error: true });
  }
}

function _relayOrShow(data) {
  // mobile: window.close 効かない (user gesture 制限) → BC relay skip して 自タブで直接 preview表示
  const isMobile = window.matchMedia('(max-width: 480px)').matches;
  if (isMobile || !_bc) { openPreviewModal(data); return; }
  const id = Math.random().toString(36).slice(2);
  let acked = false;
  const ackHandler = (e) => {
    if (e.data && e.data.type === 'import-ack' && e.data.id === id) acked = true;
  };
  _bc.addEventListener('message', ackHandler);
  try { _bc.postMessage({ type: 'import-relay', id, payload: data }); } catch(_) {}
  setTimeout(() => {
    _bc.removeEventListener('message', ackHandler);
    if (acked) {
      // 他タブが Preview処理済 → このタブ (新規スクリプト生成タブ) を閉じる
      try { window.close(); } catch(_) {}
    } else {
      // 他タブなし → 自分で表示
      openPreviewModal(data);
    }
  }, 250);
}

// ── Public exports ──────────────────────────────────────────────
window.WWMImport = {
  openSetup: openSetupModal,
  openPreview: openPreviewModal,
  handleHashOnLoad: handleHashOnLoad,
  getLastImport: getLastImportSummary
};
// sidebar.js (Edit modal) から statKey → 日本語ラベル参照用
window._AFFIX_DISPLAY_LABELS = _STAT_LABELS_PROXY;
// OCR 言語 fallback 用: スクショ言語 ≠ UI 言語の場合に他言語 affix 名で fuzzy match する
window._STAT_LABELS_I18N_ALL = _STAT_LABELS_I18N;

// ── スコア計算更新バナー (baseline 鮮度切れ時に再import促し) ──
function _showScoreBanner() {
  if (document.documentElement.classList.contains('wwm-view-sidebar')) return; // OBS view は非表示
  const el = document.getElementById('wwmScoreUpdateBanner');
  if (el) el.style.display = 'flex';
}
function _hideScoreBanner() {
  const el = document.getElementById('wwmScoreUpdateBanner');
  if (el) el.style.display = 'none';
}
window._showScoreBanner = _showScoreBanner;
window._hideScoreBanner = _hideScoreBanner;

// page load 時: hash がなければ最後の import を localStorage から auto-load。
// データ無い場合も sidebar は placeholder で描画。
function _autoLoadLastImport() {
  if ((location.hash || '').startsWith(IMPORT_HASH_PREFIX)) return;  // hash flow が処理
  // baseline 復元 + 鮮度チェック (scoreVer)
  try {
    let bl = window.WWMBaseline
      ? window.WWMBaseline.load()
      : WWMHelpers.storage.loadJSON('wwm_baseline_score_v1');
    if (bl) {
      const curVer = window.WWM_SCORE_VERSION || 1;
      if (bl.scoreVer === curVer) {
        WWMState.baseline = bl;
      } else {
        // scoreVer 不一致 (無し=機能導入前 含む) → baseline 無効化 (再計算せず破棄=drift回避) + 再import促しバナー。
        // ※マイグレ(無し→現行付与)は廃止: baseline は未リリース(Alpha限定)で旧データ救済不要。loadPreset と挙動統一。
        WWMState.baseline = null;
        WWMHelpers.storage.remove('wwm_baseline_score_v1');
        if (typeof window._showScoreBanner === 'function') window._showScoreBanner();
      }
    }
    // opt_best 復元 (baseline と同じ scoreVer ルール、不一致なら破棄して再 import 時の opt で再確定)
    const ob = WWMHelpers.storage.loadJSON('wwm_opt_best_v1');
    if (ob) {
      const curVer = window.WWM_SCORE_VERSION || 1;
      if (ob.scoreVer === curVer && typeof ob.end === 'number') {
        WWMState.opt.best = ob;
        WWMState.opt.locked = true;
      } else {
        WWMHelpers.storage.remove('wwm_opt_best_v1');
      }
    }
  } catch(e) {}
  const stored = _loadStored();
  if (!stored?.data) {
    // データ無 → sidebar placeholder のみ描画
    if (window.WWMSidebar) window.WWMSidebar.render(null);
    return;
  }
  if (window.WWMStats && window.WWMSidebar) {
    WWMState.roleInfo = stored.data;
    // virtual反映付き refresh (effective ri 使用)
    if (typeof window._refreshAll === 'function') {
      window._refreshAll();
    } else {
      window.WWMStats.buildStatParams(stored.data, stored.state).then(params => {
        WWMState.params = params;
        window.WWMSidebar.render(params);
        if (window.WWMSidebar?.gear) window.WWMSidebar.gear.render(stored.data);
        if (window.WWMSidebar?.xinfa) window.WWMSidebar.xinfa.render(stored.data);
        if (window.WWMSidebar?.diag) window.WWMSidebar.diag.render(stored.data, params);
        if (window.WWMSidebar?.ranking) window.WWMSidebar.ranking.render(stored.data, params);
        if (window.WWMSidebar?.opt) window.WWMSidebar.opt.render(stored.data, params);
        if (window.WWMSidebar?.hero) window.WWMSidebar.hero.update(params);
      }).catch(e => {
        console.error('[WWM] auto-load failed:', e);
        if (window.showToast) showToast((window.T?.errStatsBuild) ?? 'データの計算に失敗しました。再インポートをお試しください', { error: true });
      });
    }
    // baseline はlocalStorage値で固定 (page load後の自動再計算 撤回 = drift源排除)
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    handleHashOnLoad();
    _autoLoadLastImport();
  });
} else {
  handleHashOnLoad();
  _autoLoadLastImport();
}
// 既存タブ再利用時 (タブ名 wwm-metrics で window.open される) は full reload せず
// hash のみ変更されるため hashchange でも検知する
window.addEventListener('hashchange', () => {
  if ((location.hash || '').startsWith(IMPORT_HASH_PREFIX)) {
    handleHashOnLoad();
    try { window.focus(); } catch(e) {}
  }
});
