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
function setLang(lang) {
  currentLang = lang;
  T = TRANSLATIONS[lang];
  window.T = T;
  window.currentLang = lang;
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang === 'ko' ? 'ko' : lang;
  document.title = T.pageTitle;

  document.querySelectorAll('.lang-btn').forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-pressed', 'false');
  });
  const activeBtn = document.querySelector('.lang-btn[data-lang="' + lang + '"]');
  if (activeBtn) {
    activeBtn.classList.add('active');
    activeBtn.setAttribute('aria-pressed', 'true');
  }

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
  // 移転バナー: 言語切替毎に多言語msg再適用 (旧URL検出時のみ DOM 表示)
  if (typeof _initMigrationBanner === 'function') _initMigrationBanner();

  try { localStorage.setItem('wwm_lang', lang); } catch(e) {}
  renderPresetSlots();
  if (typeof window._refreshAll === 'function') window._refreshAll();
  // import前でも sidebar empty state を再render (翻訳反映)
  if (window.WWMSidebar?.render && !window.__WWM_ROLEINFO) {
    try { window.WWMSidebar.render(null); } catch(_) {}
  }
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
    // OBS view (?view=sidebar): URL paramの lang を優先、 picker は表示しない (独立ブラウザインスタンス想定)
    const isObs = document.documentElement.classList.contains('wwm-view-sidebar');
    if (isObs) {
      const urlLang = new URLSearchParams(location.search).get('lang');
      if (urlLang && ['ja','en','zh','ko'].includes(urlLang) && urlLang !== 'ja') setLang(urlLang);
      return;
    }
    const saved = localStorage.getItem('wwm_lang');
    if (saved && ['ja','en','zh','ko'].includes(saved) && saved !== 'ja') setLang(saved);
    else if (!saved) _showLangPicker();
  } catch(e) {}
}
function _showLangPicker() {
  if (document.getElementById('wwmLangPicker')) return;
  const m = document.createElement('div');
  m.className = 'wwm-modal-backdrop';
  m.id = 'wwmLangPicker';
  m.innerHTML = `
    <div class="wwm-modal" style="max-width:480px;text-align:center;padding:32px 28px;">
      <h2 style="margin:0 0 18px;font-family:Cinzel,serif;font-size:18px;letter-spacing:0.18em;color:var(--gold-bright);">SELECT LANGUAGE</h2>
      <div style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap;">
        <button class="wwm-btn-secondary" data-lang-pick="ja" style="min-width:90px;">日本語</button>
        <button class="wwm-btn-secondary" data-lang-pick="en" style="min-width:90px;">English</button>
        <button class="wwm-btn-secondary" data-lang-pick="zh" style="min-width:90px;">中文</button>
        <button class="wwm-btn-secondary" data-lang-pick="ko" style="min-width:90px;">한국어</button>
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
        if (!localStorage.getItem('wwm_import_hinted')) {
          setTimeout(_showImportHint, 250);
        }
      } catch(_) {}
    });
  });
}
function _showImportHint() {
  const btn = document.getElementById('importBtn');
  if (!btn || document.getElementById('wwmImportHint')) return;
  const r = btn.getBoundingClientRect();
  const o = document.createElement('div');
  o.id = 'wwmImportHint';
  o.className = 'wwm-import-hint';
  o.style.left = (r.left + r.width/2) + 'px';
  o.style.top  = (r.bottom + 12) + 'px';
  const T_ = window.T || {};
  const label = T_.importHintLabel || 'まずここからインポート';
  o.innerHTML = `
    <div class="wwm-import-hint-arrow" aria-hidden="true">▲</div>
    <div class="wwm-import-hint-label">${label}</div>
  `;
  document.body.appendChild(o);
  const dismiss = () => {
    o.classList.add('wwm-import-hint-out');
    setTimeout(() => o.remove(), 350);
    try { localStorage.setItem('wwm_import_hinted', '1'); } catch(_) {}
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
  if (window.__WWM_OPT_RUNNING && (prefix === 'donutDmgSeg')) return;
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
  if (window.__WWM_OPT_RUNNING) return; // 最適化中 skip
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
  try { localStorage.setItem('wwm_hero_collapsed', collapsed ? '1' : '0'); } catch(e) {}
}
function initHeroCollapse() {
  var hero = document.querySelector('.hero');
  if (!hero) return;
  try {
    if (localStorage.getItem('wwm_hero_collapsed') === '1') {
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
  const tog = document.getElementById('themeToggle');
  if (tog) tog.textContent = theme === 'light' ? '☾' : '☀';
  try { localStorage.setItem('wwm_theme', theme); } catch(e) {}
  // theme切替時 hero score色 (TIER_COLOR) 再適用
  if (window.WWMHero && window.__WWM_PARAMS) window.WWMHero.update(window.__WWM_PARAMS);
}
function initTheme() {
  let saved;
  try { saved = localStorage.getItem('wwm_theme'); } catch(e) {}
  setTheme(saved === 'light' ? 'light' : 'dark');
}

// ── トースト ──────────────────────────────────────────────────────
let _toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
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
  let importSnap = null;
  try { importSnap = JSON.parse(localStorage.getItem('wwm_last_import_v1') || 'null'); } catch(_) {}
  let stateSnap = null;
  try { stateSnap = JSON.parse(localStorage.getItem('wwm_last_state_v1') || 'null'); } catch(_) {}
  const virtual = {
    gear:   window.__WWM_VIRTUAL || null,
    kongfu: window.__WWM_VIRTUAL_KONGFU || null,
    xinfa:  window.__WWM_VIRTUAL_XINFA || null
  };
  const baseline = window.__WWM_BASELINE || null;
  presets[i] = { name, importSnap, stateSnap, virtual, baseline };
  try { localStorage.setItem(PRESET_KEY, JSON.stringify(presets)); } catch(e) {}
  renderPresetSlots();
  showToast(T.toastSaved.replace('{name}', name));
}
function loadPreset(i) {
  const p = presets[i];
  if (!p) return;
  try {
    if (p.importSnap) localStorage.setItem('wwm_last_import_v1', JSON.stringify(p.importSnap));
    if (p.stateSnap)  localStorage.setItem('wwm_last_state_v1',  JSON.stringify(p.stateSnap));
    if (p.virtual) {
      window.__WWM_VIRTUAL        = p.virtual.gear   || null;
      window.__WWM_VIRTUAL_KONGFU = p.virtual.kongfu || null;
      window.__WWM_VIRTUAL_XINFA  = p.virtual.xinfa  || null;
    }
    if (p.baseline) {
      const curVer = window.WWM_SCORE_VERSION || 1;
      if (p.baseline.scoreVer === curVer) {
        // 現行バージョンのプリセット baseline → 採用
        window.__WWM_BASELINE = p.baseline;
        // OBS view (表示専用) では baseline を書き込まない (読込のみ)。
        if (!document.documentElement.classList.contains('wwm-view-sidebar')) {
          if (window.WWMBaseline) window.WWMBaseline.save(p.baseline);
          else { try { localStorage.setItem('wwm_baseline_score_v1', JSON.stringify(p.baseline)); } catch(_) {} }
        }
      } else {
        // 古いバージョン (scoreVer無し含む) のプリセット baseline → 無効化 + 再import促しバナー。
        // プリセットは過去スナップで現行 json 計算の保証なし → 安全側で破棄 (再計算せず drift回避)。
        window.__WWM_BASELINE = null;
        try { localStorage.removeItem('wwm_baseline_score_v1'); } catch(_) {}
        if (typeof window._showScoreBanner === 'function') window._showScoreBanner();
      }
    }
  } catch(_) {}
  if (p.importSnap?.data) {
    try {
      window.__WWM_ROLEINFO = p.importSnap.data;
      if (typeof window._refreshAll === 'function') window._refreshAll();
    } catch(_) {}
  }
  showToast(T.toastLoaded.replace('{name}', p.name));
}
function deletePreset(i) {
  const name = presets[i] ? presets[i].name : T.presetNamePlaceholder.replace('{n}', i + 1);
  presets[i] = null;
  try { localStorage.setItem(PRESET_KEY, JSON.stringify(presets)); } catch(e) {}
  renderPresetSlots();
  showToast(T.toastDeleted.replace('{name}', name));
}
function initPresets() {
  try {
    const saved = JSON.parse(localStorage.getItem(PRESET_KEY));
    if (Array.isArray(saved)) presets = saved;
  } catch(e) {}
  renderPresetSlots();
}

// ── データインポート ──────────────────────────────────────────────
function importData() {
  if (window.WWMImport && typeof window.WWMImport.openSetup === 'function') {
    window.WWMImport.openSetup();
  } else {
    showToast((T && T.toastImportWip) || '工事中のため使用できません');
  }
}

// exportImage は assets/export.js に分離

// ── 起動 ──────────────────────────────────────────────────────────
function init() {
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
