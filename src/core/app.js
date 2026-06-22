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
  // SEO meta 動的更新 (description / canonical / og:*) — crawler は JS レンダリング後 DOM を読む
  _updateSeoMeta(lang);

  WWMHelpers.storage.saveStr('wwm_lang', lang);
  renderPresetSlots();
  if (typeof window._refreshAll === 'function') window._refreshAll();
  // import前でも sidebar empty state を再render (翻訳反映)
  if (window.WWMSidebar?.render && !WWMState.roleInfo) {
    try { window.WWMSidebar.render(null); } catch(_) {}
  }
  // 楷書 SVG 再適用: 上の data-i18n 書換が SVG を text に戻すため必ず最後 (ja のみ SVG 化)
  if (window.WWMKaisho) window.WWMKaisho.apply();
}
// SEO meta 動的更新: 言語切替時に description / canonical / hreflang対応 og:url / og:title / og:description を現在言語へ。
// 静的 head は ja 既定 (index.html)。 canonical = ja は base URL、 他言語は ?lang= 付き自己参照 (hreflang sitemap.xml と対)。
const _SEO_OG_LOCALE = { ja: 'ja_JP', en: 'en_US', zh: 'zh_CN', ko: 'ko_KR', vi: 'vi_VN' };
function _updateSeoMeta(lang) {
  try {
    const T_ = window.T || {};
    const desc = T_.seoDesc;
    const title = T_.pageTitle;
    const base = location.origin + location.pathname;
    const selfUrl = lang === 'ja' ? base : base + '?lang=' + lang;
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
  } catch(_) {}
}

function _loadSavedLang() {
  try {
    // OBS view (?view=sidebar): URL paramの lang を優先、 picker は表示しない (独立ブラウザインスタンス想定)
    const isObs = document.documentElement.classList.contains('wwm-view-sidebar');
    if (isObs) {
      const urlLang = new URLSearchParams(location.search).get('lang');
      if (urlLang && ['ja','en','zh','ko','vi'].includes(urlLang) && urlLang !== 'ja') setLang(urlLang);
      return;
    }
    // SEO (2026-06-11): 通常 view でも ?lang= を最優先 (hreflang 先 URL /?lang=xx で crawler が各言語 DOM をレンダリングする要)。
    // picker は抑止 (URL で言語確定済 = 聞き直し無意味) が、 初見の IMPORT 誘導 hint は picker 経由と同様に出す
    // (?lang= 共有 link 着地の新規が誘導を永久に見ない穴の塞ぎ、 2026-06-11)
    const urlLang = new URLSearchParams(location.search).get('lang');
    if (urlLang && ['ja','en','zh','ko','vi'].includes(urlLang)) {
      if (urlLang !== 'ja') setLang(urlLang);
      else { WWMHelpers.storage.saveStr('wwm_lang', 'ja'); _updateSeoMeta('ja'); }
      if (!WWMHelpers.storage.loadJSON('wwm_last_import_v1')) {
        setTimeout(_showImportHint, 250);
      }
      return;
    }
    const saved = WWMHelpers.storage.loadStr('wwm_lang');
    if (saved && ['ja','en','zh','ko','vi'].includes(saved)) {
      if (saved !== 'ja') setLang(saved);
      // 未 import = リロード毎に hint 復活 (兄貴方針 2026-06-21、 import 完了まで案内継続)
      if (!WWMHelpers.storage.loadJSON('wwm_last_import_v1')) {
        setTimeout(_showImportHint, 250);
      }
    } else if (!saved) _showLangPicker();
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
      // 言語選択直後に IMPORT 位置ヒント表示 (未 import 中は毎回、 import 完了で停止)
      try {
        if (!WWMHelpers.storage.loadJSON('wwm_last_import_v1')) {
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
    // フラグ立てない = 未 import 中は次回 reload で復活、 import 完了判定は wwm_last_import_v1 で行う
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

// ── テーマ ────────────────────────────────────────────────────────
// dark/light 双テーマ廃止 → 墨×紙 単一化 (2026-06-11)。
// 墨面 = tokens.css :root default / 紙面 = .wwm-ws-paper token rescope (workspace.css)。
// data-theme="dark" 属性は index.html 側で固定残置 (dark.css K rule = export clone 対抗の生存用)。

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
    // mobile 側 input/btn (2026-06-21 兄貴指示「PC版と同じ表記に」 で mobile も i18n placeholder 化)
    const nameMob  = document.getElementById('presetMobName' + i);
    const loadMob  = document.getElementById('presetMobLoad' + i);
    const delMob   = document.getElementById('presetMobDel' + i);
    const p = presets[i];
    const placeholderText = T.presetNamePlaceholder.replace('{n}', i + 1);
    // audit P2 (2026-06-07): placeholder ≠ acc name — aria-label を常時付与 (i18n 追従)
    nameInp.setAttribute('aria-label', placeholderText);
    if (nameMob) nameMob.setAttribute('aria-label', placeholderText);
    if (p) {
      slot.classList.add('has-data');
      nameInp.value = p.name;
      loadBtn.disabled = false;
      delBtn.disabled  = false;
      if (nameMob) nameMob.value = p.name;
      if (loadMob) loadMob.disabled = false;
      if (delMob)  delMob.disabled  = false;
    } else {
      slot.classList.remove('has-data');
      nameInp.value = '';
      nameInp.placeholder = placeholderText;
      loadBtn.disabled = true;
      delBtn.disabled  = true;
      if (nameMob) { nameMob.value = ''; nameMob.placeholder = placeholderText; }
      if (loadMob) loadMob.disabled = true;
      if (delMob)  delMob.disabled  = true;
    }
  }
}
function savePreset(i) {
  // PC / mobile 両 input から名前取得 — 編集された方を採用 (2026-06-21 兄貴指示)
  const nameInp = document.getElementById('presetName' + i);
  const nameMob = document.getElementById('presetMobName' + i);
  const v1 = (nameInp && nameInp.value.trim()) || '';
  const v2 = (nameMob && nameMob.value.trim()) || '';
  const name = v1 || v2 || T.presetNamePlaceholder.replace('{n}', i + 1);
  // 新レイアウト: 装備情報を保存 (roleInfo / state / virtual / baseline)
  // 🚨 deep clone 必須: WWMState.virtual.* と shared reference のまま保存すると、
  //    保存後 WWMState 編集が presets[i].virtual を mutate = 「保存時 snapshot」 消失 →
  //    loadPreset で同 ref 自己代入 = 復元無効化 (2026-06-22 bug 根治)
  const importSnap = WWMHelpers.storage.loadJSON('wwm_last_import_v1');
  const stateSnap = WWMHelpers.storage.loadJSON('wwm_last_state_v1');
  const virtual = JSON.parse(JSON.stringify({
    gear:   WWMState.virtual.gear || null,
    kongfu: WWMState.virtual.kongfu || null,
    xinfa:  WWMState.virtual.xinfa || null
  }));
  const baseline = WWMState.baseline ? JSON.parse(JSON.stringify(WWMState.baseline)) : null;
  presets[i] = { name, importSnap, stateSnap, virtual, baseline };
  WWMHelpers.storage.saveJSON(PRESET_KEY, presets);
  renderPresetSlots();
  showToast(T.toastSaved.replace('{name}', name));
}
function loadPreset(i) {
  // 🚨 in-memory presets[] は過去 save 時に shared reference で汚染された可能性あり
  //    (修正前 savePreset = WWMState.virtual.* と同 ref で保存 → 以降の編集が presets[i] を mutate)。
  //    localStorage から fresh re-load で「保存時 snapshot」 を真に取得 (2026-06-22 bug 根治 完)
  const fresh = WWMHelpers.storage.loadJSON(PRESET_KEY);
  const p = (Array.isArray(fresh) ? fresh[i] : null) || presets[i];
  if (!p) return;
  // in-memory presets[] も fresh で同期 (次回 load 整合性)
  if (Array.isArray(fresh)) presets = fresh;
  try {
    if (p.importSnap) WWMHelpers.storage.saveJSON('wwm_last_import_v1', p.importSnap);
    if (p.stateSnap)  WWMHelpers.storage.saveJSON('wwm_last_state_v1',  p.stateSnap);
    if (p.virtual) {
      // 🚨 deep clone 必須: preset[i].virtual.* を WWMState に直接代入すると以降の編集が
      //    preset 側も mutate → 次回 load で「保存時 snapshot」 消失 (2026-06-22 bug 根治)
      const v = JSON.parse(JSON.stringify(p.virtual));
      WWMState.virtual.gear   = v.gear   || null;
      WWMState.virtual.kongfu = v.kongfu || null;
      WWMState.virtual.xinfa  = v.xinfa  || null;
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
  initHeroCollapse();
  _loadSavedLang();
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

/* ============ mobile-mode toggle (2026-06-19 mobile-v2.css 連動)
   matchMedia '(max-width: 600px)' = mobile-v2.css の breakpoint と一致。
   html + body 両方に class 付与 (CSS は body.mobile-mode prefix、 html は overflow/height 用)。
   初回 即時 + change listener + DOMContentLoaded 再適用 (script 位置で body 未生成 case 保険) */
(function initMobileMode() {
  var mq = window.matchMedia('(max-width: 600px)');
  function apply() {
    // OBS view (?view=sidebar) 中は mobile-mode 強制 OFF — 配信側 600px 以下窓で
    // mobile overlay (chip-bar / bnav / 装備ページャー) が出てしまう regression 抑止
    // (2026-06-21 兄貴指摘で再発確認)
    var isObs = document.documentElement.classList.contains('wwm-view-sidebar');
    var on = mq.matches && !isObs;
    document.documentElement.classList.toggle('mobile-mode', on);
    if (document.body) document.body.classList.toggle('mobile-mode', on);
    // mobile 武備ページャー連動 (2026-06-20): mobile ↔ PC 切替で構造を自動再構築 / 復元
    if (window.WWMSidebar && window.WWMSidebar.mobileBuildPager) {
      if (on) window.WWMSidebar.mobileBuildPager.enable();
      else window.WWMSidebar.mobileBuildPager.disable();
    }
  }
  apply();
  if (mq.addEventListener) mq.addEventListener('change', apply);
  else if (mq.addListener) mq.addListener(apply);
  document.addEventListener('DOMContentLoaded', apply);
})();

// vite移行 P7 (2026-06-22): ESM module scope で top-level function は window 自動 expose されない。
// index.html inline onclick + 他 module からの window.XXX 経由参照分を全件明示 expose 必須。
// 漏れ罠 (P10 検出): countUp 未 expose で hero.js が L175 else 経路落ち + currentScore=null.toLocaleString 死。
window.setLang = setLang;
window.savePreset = savePreset;
window.loadPreset = loadPreset;
window.deletePreset = deletePreset;
window.importData = importData;
window.countUp = countUp;
window.formatNum = formatNum;
window.showToast = showToast;
window.updateDonut = updateDonut;
window.updateLuopanArc = updateLuopanArc;
window.toggleHero = toggleHero;
window.initHeroCollapse = initHeroCollapse;
window.renderPresetSlots = renderPresetSlots;
window.initPresets = initPresets;

// vite移行 P2: ESM 副作用 module 化 (window expose は IIFE 内 keep)
export {};
