// ── Baseline 保存 (Base64 + checksum、 軽い改竄抑止) ───────────────
(function(){
  const KEY = 'wwm_baseline_score_v1';
  function _sum(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }
  function _enc(obj) {
    if (!obj) return null;
    try {
      const json = JSON.stringify(obj);
      const b64 = btoa(unescape(encodeURIComponent(json)));
      return JSON.stringify({ d: b64, s: _sum(json), v: 2 });
    } catch(_) { return null; }
  }
  function _dec(raw) {
    if (!raw) return null;
    try {
      const w = JSON.parse(raw);
      // v2: encoded + checksum
      if (w && w.v === 2 && w.d && w.s) {
        const json = decodeURIComponent(escape(atob(w.d)));
        if (_sum(json) !== w.s) {
          console.warn('[WWM] baseline integrity check failed');
          return null;
        }
        return JSON.parse(json);
      }
      // 旧形式 (生 JSON) → 互換読込 + 即座 v2 で再保存
      if (w && typeof w === 'object' && w.statusScore != null) {
        try { localStorage.setItem(KEY, _enc(w)); } catch(_) {}
        return w;
      }
      return null;
    } catch(_) { return null; }
  }
  window.WWMBaseline = {
    save(obj) {
      const enc = _enc(obj);
      if (enc) { try { localStorage.setItem(KEY, enc); } catch(_) {} }
    },
    load() {
      try { return _dec(localStorage.getItem(KEY)); } catch(_) { return null; }
    },
    KEY
  };
})();

// ── 言語切替 ──────────────────────────────────────────────────────
// currentLang は app.js owned に変更 (旧 i18n.js TRANSLATIONS と一緒に廃止、 2026-06-09 i18n 一本化)。
// 真実源 = window.currentLang (DataStore も DataStore.setLang() で内部に同期保持)。
let currentLang = 'ja';
function setLang(lang) {
  currentLang = lang;
  window.currentLang = lang;
  // DataStore に lang 同期 (window.T Proxy が DataStore.t() 委譲する前提)
  if (window.WWM_DS && typeof window.WWM_DS.setLang === 'function') window.WWM_DS.setLang(lang);
  // 旧: T = TRANSLATIONS[lang] / window.T = T → i18n.js Proxy で透過化、 ここでの代入は不要
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang === 'ko' ? 'ko' : lang;
  document.title = T.pageTitle;

  document.querySelectorAll('.lang-btn').forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-pressed', 'false');
  });
  // critique P1 (2026-06-07): querySelector 単数 → 全 surface (topbar 2 group + mobile drawer) に active 反映
  document.querySelectorAll('.lang-btn[data-lang="' + lang + '"]').forEach(b => {
    b.classList.add('active');
    b.setAttribute('aria-pressed', 'true');
  });

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (T[key] !== undefined) el.textContent = T[key];
  });
  document.querySelectorAll('[data-i18n-opt]').forEach(el => {
    const k = el.getAttribute('data-i18n-opt');
    if (T[k] !== undefined) el.textContent = T[k];
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    const k = el.getAttribute('data-i18n-ph');
    if (T[k] !== undefined) el.setAttribute('placeholder', T[k]);
  });
  // tooltip (title) i18n: data-i18n-title="<key>" で title属性 多言語化
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const k = el.getAttribute('data-i18n-title');
    if (T[k] !== undefined) el.setAttribute('title', T[k]);
  });
  // aria-label i18n: data-i18n-aria="<key>" (audit P2 2026-06-07: acc name 多言語化)
  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    const k = el.getAttribute('data-i18n-aria');
    if (T[k] !== undefined) el.setAttribute('aria-label', T[k]);
  });
  // 移転バナー: 言語切替毎に多言語msg再適用 (旧URL検出時のみ DOM 表示)
  if (typeof _initMigrationBanner === 'function') _initMigrationBanner();
  // SEO meta 動的更新 (description / canonical / og:*) — crawler は JS レンダリング後 DOM を読む
  _updateSeoMeta(lang);

  WWMHelpers.storage.saveStr('wwm_lang', lang);
  renderPresetSlots();
  if (typeof window._refreshAll === 'function') window._refreshAll();
  // import前でも sidebar empty state を再render (翻訳反映)
  if (window.WWMSidebar?.render && !WWMState.roleInfo) {
    try { window.WWMSidebar.render(null); } catch(_) {}
  }
}
// SEO meta 動的更新: 言語切替時に description / canonical / og:url / og:title / og:description を現在言語へ。
// path-based 化 (2026-06-18) 後 = 静的 head は build script が言語別に注入済 (canonical/og:url が各 file 自身を指す)。
// 動的切替 = ユーザー手動 lang dropdown 操作時に URL path も書換 (history.replaceState) + canonical 同期。
const _SEO_OG_LOCALE = { ja: 'ja_JP', en: 'en_US', zh: 'zh_CN', ko: 'ko_KR', vi: 'vi_VN' };
function _updateSeoMeta(lang) {
  try {
    const T_ = window.T || {};
    const desc = T_.seoDesc;
    const title = T_.pageTitle;
    const langPath = lang === 'ja' ? '/' : `/${lang}/`;
    const selfUrl = location.origin + langPath;
    const setMeta = (sel, val) => {
      if (typeof val !== 'string' || !val || val.indexOf('[ui:') === 0) return;
      const el = document.querySelector(sel);
      if (el) el.setAttribute('content', val);
    };
    setMeta('meta[name="description"]', desc);
    setMeta('meta[property="og:description"]', desc);
    setMeta('meta[property="og:title"]', title);
    setMeta('meta[property="og:url"]', selfUrl);
    setMeta('meta[property="og:locale"]', _SEO_OG_LOCALE[lang]);
    const canon = document.querySelector('link[rel="canonical"]');
    if (canon) canon.setAttribute('href', selfUrl);
    // URL path 同期 (search/hash keep)。 OBS view では path 書換しない (?view=sidebar で OBS 専用 instance)
    const isObs = document.documentElement.classList.contains('wwm-view-sidebar');
    if (!isObs && typeof history !== 'undefined' && history.replaceState) {
      const curLangFromPath = (location.pathname.match(/^\/(en|zh|ko|vi)\//) || [])[1] || 'ja';
      if (curLangFromPath !== lang) {
        history.replaceState({}, '', langPath + location.search + location.hash);
      }
    }
  } catch(_) {}
}

// 移転バナー: 旧URL (sh1get0ra.github.io) 検出時のみ表示。 メッセージは <strong> 含むため innerHTML 経路。 setLang 内 + init() の2箇所から呼ばれる (init = ja 初期表示でも必ず実行、 setLang = 言語切替時に msg多言語反映)。
function _initMigrationBanner() {
  try {
    const migBanner = document.getElementById('wwmMigrationBanner');
    if (!migBanner) return;
    const isOldDomain = location.hostname === 'sh1get0ra.github.io';
    if (!isOldDomain) { migBanner.style.display = 'none'; return; }
    const T_ = window.T || {};
    const msgEl = migBanner.querySelector('.wwm-migration-msg');
    if (msgEl && T_.migrationMsg) msgEl.innerHTML = T_.migrationMsg;
    const btnEl = migBanner.querySelector('.wwm-migration-btn');
    if (btnEl && T_.migrationBtn) btnEl.textContent = T_.migrationBtn;
    migBanner.style.display = 'flex';
  } catch(_) {}
}

function _loadSavedLang() {
  try {
    const VALID = ['ja','en','zh','ko','vi'];
    const isObs = document.documentElement.classList.contains('wwm-view-sidebar');
    const urlLang = new URLSearchParams(location.search).get('lang');

    // OBS view (?view=sidebar): URL paramの lang を優先、 picker は表示しない (独立ブラウザインスタンス想定)
    if (isObs) {
      if (urlLang && VALID.includes(urlLang) && urlLang !== 'ja') setLang(urlLang);
      return;
    }

    // SEO 多言語 path-based 化 (2026-06-18): 真実源 = <html lang> attribute。
    // build script (scripts/build-i18n-pages.cjs) が /{lang}/index.html を emit する時に <html lang> 設定済。
    // 旧 ?lang=xx は Functions middleware で /{lang}/ に 301 redirect = 通常はここに来ない (互換 fallback)。
    // 優先順位: ?lang= (旧 share URL 互換) > localStorage (ユーザー手動切替) > <html lang> (path 由来)
    const htmlLang = (document.documentElement.lang || 'ja').toLowerCase().split('-')[0]; // zh-CN → zh
    const saved = WWMHelpers.storage.loadStr('wwm_lang');
    const resolved =
      (urlLang && VALID.includes(urlLang)) ? urlLang :
      (saved && VALID.includes(saved))     ? saved   :
      (VALID.includes(htmlLang)            ? htmlLang : 'ja');

    if (resolved !== 'ja') setLang(resolved);
    else { WWMHelpers.storage.saveStr('wwm_lang', 'ja'); _updateSeoMeta('ja'); }

    // picker: localStorage 未設定 + URL lang 未指定 + ja 既定到達 (= 初回 root 訪問) のみ
    const isJaDefault = !saved && !urlLang && resolved === 'ja';
    if (isJaDefault) {
      _showLangPicker();
    } else if (!WWMHelpers.storage.loadStr('wwm_import_hinted')) {
      // 言語確定済 (URL/localStorage/html lang) なら import 誘導 hint
      setTimeout(_showImportHint, 250);
    }
  } catch(e) {}
}
function _showLangPicker() {
  if (document.getElementById('wwmLangPicker')) return;
  const m = document.createElement('div');
  m.className = 'wwm-modal-backdrop';
  m.id = 'wwmLangPicker';
  m.innerHTML = `
    <div class="wwm-modal wwm-lang-picker">
      <h2>SELECT LANGUAGE</h2>
      <div class="wwm-lang-picker-btns">
        <button class="wwm-btn-secondary" data-lang-pick="ja">日本語</button>
        <button class="wwm-btn-secondary" data-lang-pick="en">English</button>
        <button class="wwm-btn-secondary" data-lang-pick="zh">中文</button>
        <button class="wwm-btn-secondary" data-lang-pick="ko">한국어</button>
        <button class="wwm-btn-secondary" data-lang-pick="vi">Tiếng Việt</button>
      </div>
    </div>
  `;
  document.body.appendChild(m);
  m.querySelectorAll('[data-lang-pick]').forEach(b => {
    b.addEventListener('click', () => {
      const lang = b.dataset.langPick;
      setLang(lang);
      m.remove();
      // 言語選択直後にIMPORT位置ヒント表示 (一度のみ)
      try {
        if (!WWMHelpers.storage.loadStr('wwm_import_hinted')) {
          setTimeout(_showImportHint, 250);
        }
      } catch(_) {}
    });
  });
}
function _showImportHint() {
  // mobile時 IMPORT button は drawer内 hidden → ハンバーガー (≡) をtargetに切替
  const isMobile = window.matchMedia('(max-width: 480px)').matches;
  const btn = isMobile
    ? (document.getElementById('wwmMobileHamburger') || document.getElementById('importBtn'))
    : document.getElementById('importBtn');
  if (!btn || document.getElementById('wwmImportHint')) return;
  const r = btn.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return;
  const o = document.createElement('div');
  o.id = 'wwmImportHint';
  o.className = 'wwm-import-hint';
  // btn 中心 = ▲が指すべき位置 / label は viewport内に clamp
  const btnCx = r.left + r.width/2;
  const vw = window.innerWidth;
  const ESTIMATED_HALF = 70;
  const labelCx = Math.min(vw - ESTIMATED_HALF - 4, Math.max(ESTIMATED_HALF + 4, btnCx));
  o.style.left = labelCx + 'px';
  o.style.top  = (r.bottom + 12) + 'px';
  const T_ = window.T || {};
  const label = T_.importHintLabel || 'まずここからインポート';
  const arrowOffset = btnCx - labelCx + (isMobile ? 24 : 0); // mobile時 ▲ をさらに右寄せ (ハンバーガー直下指す)
  o.innerHTML = `
    <div class="wwm-import-hint-arrow" aria-hidden="true" style="margin-left:${arrowOffset}px;">▲</div>
    <div class="wwm-import-hint-label">${label}</div>
  `;
  document.body.appendChild(o);
  const dismiss = () => {
    o.classList.add('wwm-import-hint-out');
    setTimeout(() => o.remove(), 350);
    WWMHelpers.storage.saveStr('wwm_import_hinted', '1');
    document.removeEventListener('click', dismiss, true);
  };
  setTimeout(() => document.addEventListener('click', dismiss, true), 50);
  setTimeout(dismiss, 8000);
}

// ── カウントアップ ────────────────────────────────────────────────
const _countUpState = {};
function countUp(id, target, decimals) {
  const el = document.getElementById(id);
  if (!el) return;
  decimals = decimals || 0;
  const startVal = _countUpState[id] === undefined ? target : _countUpState[id];
  if (Math.abs(target - startVal) < 0.5 && _countUpState[id] !== undefined) {
    el.textContent = formatNum(target, decimals);
    _countUpState[id] = target;
    return;
  }
  const startTime = performance.now();
  const duration = 480;
  function step(now) {
    const t = Math.min(1, (now - startTime) / duration);
    // easeOutQuart
    const eased = 1 - Math.pow(1 - t, 4);
    const val = startVal + (target - startVal) * eased;
    el.textContent = formatNum(val, decimals);
    if (t < 1) requestAnimationFrame(step);
    else { el.textContent = formatNum(target, decimals); _countUpState[id] = target; }
  }
  requestAnimationFrame(step);
  _countUpState[id] = target;
}
function formatNum(n, decimals) {
  if (decimals > 0) return n.toFixed(decimals);
  return Math.round(n).toLocaleString(T.locale);
}

// ── ドーナツ（SVG） ──────────────────────────────────────────────
function updateDonut(pCrit, pSympathy, pGraze, pNormal, prefix) {
  // 最適化計算中は hero donut (donutDmgSeg) の更新を完全block (ちらつき根絶)
  if (WWMState.opt.running && (prefix === 'donutDmgSeg')) return;
  const p = prefix || 'donutSeg';
  const segs = [
    { id: p + 'Crit',     val: pCrit },
    { id: p + 'Sympathy', val: pSympathy },
    { id: p + 'Graze',    val: pGraze },
    { id: p + 'Normal',   val: pNormal },
  ];
  // 円周長は circle の実 r から算出 (hero羅盤 r=50 / calcタブ r=54 不一致バグ回避)
  let R = 54;
  for (const s of segs) {
    const e0 = document.getElementById(s.id);
    if (e0) { R = parseFloat(e0.getAttribute('r')) || 54; break; }
  }
  const C = 2 * Math.PI * R;
  let offset = 0;
  segs.forEach(s => {
    const el = document.getElementById(s.id);
    if (!el) return;
    const len = Math.max(0, s.val) * C;
    el.setAttribute('stroke-dasharray', len + ' ' + (C - len));
    el.setAttribute('stroke-dashoffset', -offset);
    offset += len;
  });
}

// ── 外周リング（物理/属性 比率）arcPhys/arcElem ───────────────────
function updateLuopanArc(physRatio, elemRatio) {
  if (WWMState.opt.running) return; // 最適化中 skip
  const aP = document.getElementById('arcPhys');
  const aE = document.getElementById('arcElem');
  if (!aP || !aE) return;
  const r = parseFloat(aP.getAttribute('r')) || 68;
  const C = 2 * Math.PI * r;
  const lp = Math.max(0, physRatio) * C;
  const le = Math.max(0, elemRatio) * C;
  aP.setAttribute('stroke-dasharray', lp + ' ' + (C - lp));
  aP.setAttribute('stroke-dashoffset', 0);
  aE.setAttribute('stroke-dasharray', le + ' ' + (C - le));
  aE.setAttribute('stroke-dashoffset', -lp);
}
window.updateLuopanArc = updateLuopanArc;

// ── ダークモード ──────────────────────────────────────────────────
function toggleHero() {
  var hero = document.querySelector('.hero');
  if (!hero) return;
  var collapsed = hero.classList.toggle('hero--collapsed');
  hero.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  WWMHelpers.storage.saveStr('wwm_hero_collapsed', collapsed ? '1' : '0');
}
function initHeroCollapse() {
  var hero = document.querySelector('.hero');
  if (!hero) return;
  try {
    if (WWMHelpers.storage.loadStr('wwm_hero_collapsed') === '1') {
      hero.classList.add('hero--collapsed');
      hero.setAttribute('aria-expanded', 'false');
    } else {
      hero.setAttribute('aria-expanded', 'true');
    }
  } catch(e) {
    hero.setAttribute('aria-expanded', 'true');
  }
}

function toggleTheme() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  setTheme(isLight ? 'dark' : 'light');
}
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  // themeToggle の glyph 切替は CSS (data-theme で SVG sun/moon 表示切替) に移譲 —
  // textContent 書込は inline SVG を破壊するため廃止 (critique P2 2026-06-06)
  WWMHelpers.storage.saveStr('wwm_theme', theme);
  // theme切替時 hero score色 (TIER_COLOR) 再適用
  if (window.WWMSidebar?.hero && WWMState.params) window.WWMSidebar.hero.update(WWMState.params);
}
function initTheme() {
  const saved = WWMHelpers.storage.loadStr('wwm_theme');
  setTheme(saved === 'light' ? 'light' : 'dark');
}

// ── トースト ──────────────────────────────────────────────────────
let _toastTimer = null;
function showToast(msg, opts) {
  const el = document.getElementById('toast');
  const isError = !!(opts && opts.error);
  el.textContent = msg;
  el.classList.toggle('toast-error', isError);
  el.classList.add('show');
  clearTimeout(_toastTimer);
  // audit P2 (2026-06-07): error は成功 (2.4s) と同寿命では読み切れない → 7s
  _toastTimer = setTimeout(() => el.classList.remove('show'), isError ? 7000 : 2400);
}

// ── プリセット ────────────────────────────────────────────────────
const PRESET_KEY = 'wwm_presets_v1';
let presets = [null, null, null];

function renderPresetSlots() {
  for (let i = 0; i < 3; i++) {
    const slot     = document.getElementById('presetSlot' + i);
    const nameInp  = document.getElementById('presetName' + i);
    const loadBtn  = document.getElementById('presetLoadBtn' + i);
    const delBtn   = document.getElementById('presetDelBtn' + i);
    const p = presets[i];
    // audit P2 (2026-06-07): placeholder ≠ acc name — aria-label を常時付与 (i18n 追従)
    nameInp.setAttribute('aria-label', T.presetNamePlaceholder.replace('{n}', i + 1));
    if (p) {
      slot.classList.add('has-data');
      nameInp.value = p.name;
      loadBtn.disabled = false;
      delBtn.disabled  = false;
    } else {
      slot.classList.remove('has-data');
      nameInp.value = '';
      nameInp.placeholder = T.presetNamePlaceholder.replace('{n}', i + 1);
      loadBtn.disabled = true;
      delBtn.disabled  = true;
    }
  }
}
function savePreset(i) {
  const nameInp = document.getElementById('presetName' + i);
  const name = nameInp.value.trim() || T.presetNamePlaceholder.replace('{n}', i + 1);
  // 新レイアウト: 装備情報を保存 (roleInfo / state / virtual / baseline)
  const importSnap = WWMHelpers.storage.loadJSON('wwm_last_import_v1');
  const stateSnap = WWMHelpers.storage.loadJSON('wwm_last_state_v1');
  const virtual = {
    gear:   WWMState.virtual.gear || null,
    kongfu: WWMState.virtual.kongfu || null,
    xinfa:  WWMState.virtual.xinfa || null
  };
  const baseline = WWMState.baseline || null;
  presets[i] = { name, importSnap, stateSnap, virtual, baseline };
  WWMHelpers.storage.saveJSON(PRESET_KEY, presets);
  renderPresetSlots();
  showToast(T.toastSaved.replace('{name}', name));
}
function loadPreset(i) {
  const p = presets[i];
  if (!p) return;
  try {
    if (p.importSnap) WWMHelpers.storage.saveJSON('wwm_last_import_v1', p.importSnap);
    if (p.stateSnap)  WWMHelpers.storage.saveJSON('wwm_last_state_v1',  p.stateSnap);
    if (p.virtual) {
      WWMState.virtual.gear        = p.virtual.gear   || null;
      WWMState.virtual.kongfu = p.virtual.kongfu || null;
      WWMState.virtual.xinfa  = p.virtual.xinfa  || null;
    }
    if (p.baseline) {
      const curVer = window.WWM_SCORE_VERSION || 1;
      if (p.baseline.scoreVer === curVer) {
        // 現行バージョンのプリセット baseline → 採用
        WWMState.baseline = p.baseline;
        // OBS view (表示専用) では baseline を書き込まない (読込のみ)。
        if (!document.documentElement.classList.contains('wwm-view-sidebar')) {
          if (window.WWMBaseline) window.WWMBaseline.save(p.baseline);
          else { WWMHelpers.storage.saveJSON('wwm_baseline_score_v1', p.baseline); }
        }
      } else {
        // 古いバージョン (scoreVer無し含む) のプリセット baseline → 無効化 + 再import促しバナー。
        // プリセットは過去スナップで現行 json 計算の保証なし → 安全側で破棄 (再計算せず drift回避)。
        WWMState.baseline = null;
        WWMHelpers.storage.remove('wwm_baseline_score_v1');
        if (typeof window._showScoreBanner === 'function') window._showScoreBanner();
      }
    }
  } catch(_) {}
  if (p.importSnap?.data) {
    try {
      WWMState.roleInfo = p.importSnap.data;
      if (typeof window._refreshAll === 'function') window._refreshAll();
    } catch(_) {}
  }
  showToast(T.toastLoaded.replace('{name}', p.name));
}
function deletePreset(i) {
  const name = presets[i] ? presets[i].name : T.presetNamePlaceholder.replace('{n}', i + 1);
  presets[i] = null;
  WWMHelpers.storage.saveJSON(PRESET_KEY, presets);
  renderPresetSlots();
  showToast(T.toastDeleted.replace('{name}', name));
}
function initPresets() {
  const saved = WWMHelpers.storage.loadJSON(PRESET_KEY);
  if (Array.isArray(saved)) presets = saved;
  renderPresetSlots();
}

// ── データインポート ──────────────────────────────────────────────
function importData() {
  // SHARE Build mode 中は IMPORT 無効化 (受信した他人ビルドを上書きしないよう localStorage 保護)
  if (WWMState.blockIfShared((window.T?.sharedBuildImportBlocked) ?? '閲覧モード中: IMPORT は無効化されています (自データに戻すには リロード/F5)')) return;
  if (window.WWMImport && typeof window.WWMImport.openSetup === 'function') {
    window.WWMImport.openSetup();
  } else {
    showToast((T && T.toastImportWip) || '工事中のため使用できません');
  }
}

// exportImage は assets/export.js に分離

// ── 起動 ──────────────────────────────────────────────────────────
async function init() {
  // DataStore eager load (全 i18n 揃ってから UI 初期化 → name()/t() 同期取得保証)
  if (window.WWM_DS && window.WWM_DS.ready) {
    try { await window.WWM_DS.ready(); }
    catch (e) { console.error('DataStore.ready() failed', e); }
  }
  initTheme();
  initHeroCollapse();
  _loadSavedLang();
  _initMigrationBanner();
  initPresets();

  // 数値入力フィールド：全角→半角自動変換 + 数字以外ブロック
  function isNumericField(el) {
    return el && el.tagName === 'INPUT' && el.getAttribute('inputmode') === 'decimal';
  }
  function normalizeNumericValue(val) {
    if (!val) return '';
    var s = val.replace(/[０-９]/g, function(c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
               .replace(/[．。]/g, '.')
               .replace(/[ー－−―]/g, '-');
    s = s.replace(/[^0-9.\-]/g, '');
    var neg = s.charAt(0) === '-';
    s = s.replace(/-/g, '');
    if (neg) s = '-' + s;
    var firstDot = s.indexOf('.');
    if (firstDot !== -1) s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '');
    return s;
  }
  var _imeComposing = new WeakSet();
  document.addEventListener('compositionstart', function(e) {
    if (isNumericField(e.target)) _imeComposing.add(e.target);
  });
  document.addEventListener('compositionend', function(e) {
    if (!isNumericField(e.target)) return;
    _imeComposing.delete(e.target);
    var norm = normalizeNumericValue(e.target.value);
    if (e.target.value !== norm) e.target.value = norm;
    // 確定後の正規化結果で calc を1回だけ走らせる
    e.target.dispatchEvent(new Event('input', { bubbles: true }));
  }, true);
  document.addEventListener('input', function(e) {
    if (!isNumericField(e.target)) return;
    if (_imeComposing.has(e.target)) {
      // IME 確定前は何もしない（value も書き換えない・calc も走らせない）
      e.stopImmediatePropagation();
      return;
    }
    var raw = e.target.value;
    var norm = normalizeNumericValue(raw);
    if (raw !== norm) {
      var pos = e.target.selectionStart;
      var diff = raw.length - norm.length;
      e.target.value = norm;
      var newPos = Math.max(0, (pos || 0) - diff);
      try { e.target.setSelectionRange(newPos, newPos); } catch (err) {}
    }
  }, true);
}

document.addEventListener('DOMContentLoaded', init);
