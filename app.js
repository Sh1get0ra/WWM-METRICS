// ── 言語切替 ──────────────────────────────────────────────────────
function setLang(lang) {
  currentLang = lang;
  T = TRANSLATIONS[lang];
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang === 'ko' ? 'ko' : lang;
  document.title = T.pageTitle;

  document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
  const activeBtn = document.querySelector('.lang-btn[data-lang="' + lang + '"]');
  if (activeBtn) activeBtn.classList.add('active');

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (T[key] !== undefined) el.textContent = T[key];
  });
  document.querySelectorAll('[data-i18n-opt="manualInput"]').forEach(el => {
    el.textContent = T.manualInput;
  });

  renderPresetSlots();
  calculate();
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
function updateDonut(pCrit, pSympathy, pGraze, pNormal) {
  // 円周長 = 2πr, r=54 → 339.292
  const R = 54;
  const C = 2 * Math.PI * R;
  const segs = [
    { id: 'donutSegCrit',     val: pCrit },
    { id: 'donutSegSympathy', val: pSympathy },
    { id: 'donutSegGraze',    val: pGraze },
    { id: 'donutSegNormal',   val: pNormal },
  ];
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

// ── エネミー切替 ──────────────────────────────────────────────────
function bindEnemySelect() {
  document.getElementById('enemyLevel').addEventListener('change', function() {
    const isManual = this.value === 'manual';
    ['PhysDef','JudgeRes','PhysRes','ElemRes'].forEach(f => {
      document.getElementById('disp' + f).style.display = isManual ? 'none' : '';
      document.getElementById('man'  + f).style.display = isManual ? ''     : 'none';
    });
    if (!isManual) {
      const e = ENEMY_PRESET[this.value];
      document.getElementById('manPhysDef').value  = e.physDef;
      document.getElementById('manJudgeRes').value = e.judgeRes;
      document.getElementById('manPhysRes').value  = e.physRes;
      document.getElementById('manElemRes').value  = e.elemRes;
    }
    calculate();
  });
}

// ── ダークモード ──────────────────────────────────────────────────
function toggleTheme() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  setTheme(isLight ? 'dark' : 'light');
}
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const tog = document.getElementById('themeToggle');
  if (tog) tog.textContent = theme === 'light' ? '☾' : '☀';
  try { localStorage.setItem('wwm_theme', theme); } catch(e) {}
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
  const data = {};
  document.querySelectorAll('input[id], select[id]').forEach(el => {
    if (el.id.startsWith('presetName')) return;
    data[el.id] = el.value;
  });
  presets[i] = { name, data };
  try { localStorage.setItem(PRESET_KEY, JSON.stringify(presets)); } catch(e) {}
  renderPresetSlots();
  showToast(T.toastSaved.replace('{name}', name));
}
function loadPreset(i) {
  const p = presets[i];
  if (!p) return;
  document.querySelectorAll('input[id], select[id]').forEach(el => {
    if (el.id.startsWith('presetName')) return;
    if (p.data[el.id] !== undefined) el.value = p.data[el.id];
  });
  reflectEnemyDisplay();
  saveInputs();
  calculate();
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

// ── 入力の保存・復元 ──────────────────────────────────────────────
const STORAGE_KEY = 'wwm_calc_v1';
function saveInputs() {
  const data = {};
  document.querySelectorAll('input[id], select[id]').forEach(el => {
    data[el.id] = el.value;
  });
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch(e) {}
}
function loadInputs() {
  let data;
  try { data = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch(e) {}
  if (!data) return;
  document.querySelectorAll('input[id], select[id]').forEach(el => {
    if (data[el.id] !== undefined) el.value = data[el.id];
  });
  reflectEnemyDisplay();
}
function reflectEnemyDisplay() {
  const sel = document.getElementById('enemyLevel').value;
  const isManual = sel === 'manual';
  ['PhysDef','JudgeRes','PhysRes','ElemRes'].forEach(f => {
    document.getElementById('disp' + f).style.display = isManual ? 'none' : '';
    document.getElementById('man'  + f).style.display = isManual ? ''     : 'none';
  });
  if (!isManual) {
    const e = ENEMY_PRESET[sel];
    document.getElementById('dispPhysDef').textContent  = e.physDef;
    document.getElementById('dispJudgeRes').textContent = e.judgeRes;
    document.getElementById('dispPhysRes').textContent  = e.physRes;
    document.getElementById('dispElemRes').textContent  = e.elemRes;
  }
}

// ── 画像エクスポート（新デザイン版） ──────────────────────────────
function exportImage() {
  if (typeof html2canvas === 'undefined') {
    showToast('html2canvas not loaded (needs online)'); return;
  }
  const btn = document.getElementById('exportBtn');
  const origText = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '⋯';

  const now = new Date();
  const dateStr = now.getFullYear() + '/' + String(now.getMonth()+1).padStart(2,'0') + '/' + String(now.getDate()).padStart(2,'0');
  function fv(id) { return document.getElementById(id).value; }
  function fnum(id) { return Math.round(v(id)).toLocaleString(T.locale); }

  const pCritTxt   = document.getElementById('probCritVal').textContent;
  const pSympTxt   = document.getElementById('probSympathyVal').textContent;
  const pGrazeTxt  = document.getElementById('probGrazeVal').textContent;
  const pNormTxt   = document.getElementById('probNormalVal').textContent;
  const expDmg     = Math.round(_lastBaseExpected).toLocaleString(T.locale);

  const enemySel   = document.getElementById('enemyLevel').value;
  const isManual   = enemySel === 'manual';
  const physDefVal = isManual ? fv('manPhysDef') : document.getElementById('dispPhysDef').textContent;
  const judgeResVal= isManual ? fv('manJudgeRes') : document.getElementById('dispJudgeRes').textContent;
  const appliedHit  = document.getElementById('dispHitRate').textContent;
  const appliedCrit = document.getElementById('dispCritRate').textContent;
  const appliedSymp = document.getElementById('dispSympathyRate').textContent;

  // donut SVG values
  const segCirc = 2 * Math.PI * 54;
  const segs = [
    { val: parseFloat(pCritTxt)/100,  color: '#e8513a' },
    { val: parseFloat(pSympTxt)/100,  color: '#a8d4b4' },
    { val: parseFloat(pGrazeTxt)/100, color: '#c9b88a' },
    { val: parseFloat(pNormTxt)/100,  color: '#ede4d0' },
  ];
  let off = 0;
  const donutPaths = segs.map(s => {
    const len = Math.max(0, s.val) * segCirc;
    const p = '<circle cx="68" cy="68" r="54" fill="none" stroke="' + s.color + '" stroke-width="14" stroke-dasharray="' + len + ' ' + (segCirc - len) + '" stroke-dashoffset="' + (-off) + '" transform="rotate(-90 68 68)"/>';
    off += len; return p;
  }).join('');

  function row(label, val, unit) {
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px dashed rgba(232,215,180,0.08);">'
      + '<span style="color:#8b8170;font-size:11px;font-family:\'Noto Sans JP\',sans-serif;letter-spacing:0.02em;">' + label + '</span>'
      + '<span style="color:#ede4d0;font-size:12px;font-weight:700;font-family:\'Rajdhani\',monospace;letter-spacing:0.02em;">' + val + (unit||'') + '</span>'
      + '</div>';
  }
  function rowApplied(label, inputVal, appliedVal) {
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px dashed rgba(232,215,180,0.08);">'
      + '<span style="color:#8b8170;font-size:11px;font-family:\'Noto Sans JP\',sans-serif;">' + label + '</span>'
      + '<span style="font-size:11px;font-weight:700;font-family:\'Rajdhani\',monospace;">'
      + '<span style="color:#ede4d0;">' + inputVal + '%</span>'
      + '<span style="color:#8a6f30;margin:0 5px;">→</span>'
      + '<span style="color:#a8d4b4;">' + appliedVal + '</span>'
      + '</span></div>';
  }
  function section(title) {
    return '<div style="display:flex;align-items:center;gap:8px;margin:14px 0 6px;">'
      + '<div style="width:6px;height:6px;background:#c83c2b;transform:rotate(45deg);"></div>'
      + '<span style="color:#c9a45a;font-size:10px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;font-family:\'Rajdhani\',monospace;">' + title + '</span>'
      + '<div style="flex:1;height:1px;background:rgba(232,215,180,0.1);"></div></div>';
  }

  const card = document.getElementById('export-card');
  card.innerHTML =
    '<div style="width:960px;background:#07060a;color:#ede4d0;font-family:\'Noto Sans JP\',sans-serif;position:relative;overflow:hidden;">'
    // header
    + '<div style="display:flex;align-items:center;gap:14px;padding:18px 24px;background:linear-gradient(180deg,rgba(26,20,16,0.95),rgba(15,12,14,0.95));border-bottom:1px solid rgba(232,215,180,0.12);position:relative;">'
    +   '<div style="position:absolute;left:0;top:0;bottom:0;width:3px;background:linear-gradient(180deg,#e8513a,#8a1f17);"></div>'
    +   '<div style="flex:1;">'
    +     '<div style="font-family:\'Noto Serif JP\',serif;font-weight:900;font-size:18px;letter-spacing:0.14em;color:#ede4d0;">WWM <span style="color:#e8513a;">DMG CALC</span></div>'
    +     '<div style="font-family:\'Rajdhani\',monospace;font-size:10px;color:#8b8170;letter-spacing:0.2em;text-transform:uppercase;margin-top:2px;">Real-time damage forecast · 武侠HUD</div>'
    +   '</div>'
    +   '<div style="font-family:\'Rajdhani\',monospace;font-size:11px;color:#8b8170;letter-spacing:0.16em;">' + dateStr + '</div>'
    + '</div>'

    // hero section: expected number + donut
    + '<div style="display:flex;border-bottom:1px solid rgba(232,215,180,0.12);background:radial-gradient(ellipse 70% 100% at 0% 50%,rgba(200,60,43,0.12),transparent 60%);">'
    +   '<div style="flex:1;padding:22px 28px;">'
    +     '<div style="display:flex;align-items:center;gap:10px;font-family:\'Rajdhani\',monospace;font-size:10px;font-weight:700;color:#c9a45a;letter-spacing:0.24em;text-transform:uppercase;">'
    +       '<div style="width:22px;height:1px;background:#c9a45a;"></div>EXPECTED · 期待値</div>'
    +     '<div style="font-family:\'Cinzel\',serif;font-weight:800;font-size:72px;color:#f0d28a;line-height:0.95;margin-top:8px;letter-spacing:-0.02em;text-shadow:0 0 30px rgba(240,210,138,0.25);">' + expDmg + '</div>'
    +     '<div style="display:flex;gap:24px;margin-top:14px;padding-top:12px;border-top:1px solid rgba(232,215,180,0.1);">'
    +       '<div><div style="font-family:\'Rajdhani\',monospace;font-size:9px;color:#8b8170;letter-spacing:0.18em;">PHYSICAL</div><div style="font-family:\'Rajdhani\',monospace;font-size:16px;font-weight:700;color:#e8513a;margin-top:2px;">' + document.getElementById('hbPhys').textContent + '</div></div>'
    +       '<div><div style="font-family:\'Rajdhani\',monospace;font-size:9px;color:#8b8170;letter-spacing:0.18em;">ELEMENTAL</div><div style="font-family:\'Rajdhani\',monospace;font-size:16px;font-weight:700;color:#a8d4b4;margin-top:2px;">' + document.getElementById('hbElem').textContent + '</div></div>'
    +       '<div><div style="font-family:\'Rajdhani\',monospace;font-size:9px;color:#8b8170;letter-spacing:0.18em;">EXPECTED</div><div style="font-family:\'Rajdhani\',monospace;font-size:16px;font-weight:700;color:#ede4d0;margin-top:2px;">' + document.getElementById('hbExp').textContent + '</div></div>'
    +     '</div>'
    +   '</div>'
    +   '<div style="width:340px;padding:22px 24px;display:flex;align-items:center;gap:16px;border-left:1px solid rgba(232,215,180,0.12);background:rgba(0,0,0,0.3);">'
    +     '<svg width="136" height="136" style="flex-shrink:0;">'
    +       '<circle cx="68" cy="68" r="54" fill="none" stroke="rgba(232,215,180,0.07)" stroke-width="14"/>'
    +       donutPaths
    +     '</svg>'
    +     '<div style="flex:1;font-family:\'Rajdhani\',monospace;font-size:11px;">'
    +       '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px dashed rgba(232,215,180,0.1);"><span style="display:flex;align-items:center;gap:6px;color:#c8bda6;font-family:\'Noto Sans JP\',sans-serif;font-size:11px;font-weight:600;"><span style="width:8px;height:8px;background:#e8513a;box-shadow:0 0 8px #e8513a;"></span>' + T.probCrit + '</span><span style="color:#e8513a;font-weight:700;font-size:13px;">' + pCritTxt + '</span></div>'
    +       '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px dashed rgba(232,215,180,0.1);"><span style="display:flex;align-items:center;gap:6px;color:#c8bda6;font-family:\'Noto Sans JP\',sans-serif;font-size:11px;font-weight:600;"><span style="width:8px;height:8px;background:#a8d4b4;box-shadow:0 0 8px #a8d4b4;"></span>' + T.probSympathy + '</span><span style="color:#a8d4b4;font-weight:700;font-size:13px;">' + pSympTxt + '</span></div>'
    +       '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px dashed rgba(232,215,180,0.1);"><span style="display:flex;align-items:center;gap:6px;color:#c8bda6;font-family:\'Noto Sans JP\',sans-serif;font-size:11px;font-weight:600;"><span style="width:8px;height:8px;background:#c9b88a;box-shadow:0 0 8px #c9b88a;"></span>' + T.probGraze + '</span><span style="color:#c9b88a;font-weight:700;font-size:13px;">' + pGrazeTxt + '</span></div>'
    +       '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;"><span style="display:flex;align-items:center;gap:6px;color:#c8bda6;font-family:\'Noto Sans JP\',sans-serif;font-size:11px;font-weight:600;"><span style="width:8px;height:8px;background:#ede4d0;box-shadow:0 0 8px #ede4d0;"></span>' + T.probNormal + '</span><span style="color:#ede4d0;font-weight:700;font-size:13px;">' + pNormTxt + '</span></div>'
    +     '</div>'
    +   '</div>'
    + '</div>'

    // body 3 columns
    + '<div style="display:flex;">'
    +   '<div style="flex:1;padding:8px 22px 18px;border-right:1px solid rgba(232,215,180,0.08);">'
    +     section(T.sec1)
    +     row(T.minPhysATK, fnum('minPhysATK'))
    +     row(T.maxPhysATK, fnum('maxPhysATK'))
    +     row(T.minElemMain, fv('minElemMain'))
    +     row(T.maxElemMain, fv('maxElemMain'))
    +     row(T.minElemSub, fv('minElemSub'))
    +     row(T.maxElemSub, fv('maxElemSub'))
    +     section(T.sec2)
    +     rowApplied(T.hitRate, fv('hitRate'), appliedHit)
    +     rowApplied(T.critRate, fv('critRate'), appliedCrit)
    +     rowApplied(T.sympathyRate, fv('sympathyRate'), appliedSymp)
    +     row(T.addCritRate, fv('addCritRate'), '%')
    +     row(T.addSympathyRate, fv('addSympathyRate'), '%')
    +   '</div>'
    +   '<div style="flex:1;padding:8px 22px 18px;border-right:1px solid rgba(232,215,180,0.08);">'
    +     section(T.sec3)
    +     row(T.critBoost, fv('critBoost'), '%')
    +     row(T.sympathyBoost, fv('sympathyBoost'), '%')
    +     row(T.outerPen, fv('outerPen'))
    +     row(T.weaponBonus, fv('weaponBonus'), '%')
    +     row(T.elemPen, fv('elemPen'))
    +     row(T.elemAtkBoost, fv('elemAtkBoost'), '%')
    +     row(T.allMartialBoost, fv('allMartialBoost'), '%')
    +     row(T.bossBoost, fv('bossBoost'), '%')
    +     row(T.specMartialBoost, fv('specMartialBoost'), '%')
    +   '</div>'
    +   '<div style="flex:1;padding:8px 22px 18px;">'
    +     section(T.sec4)
    +     row(T.outerCoeff, fv('outerCoeff'), '%')
    +     row(T.statusCoeff, fv('statusCoeff'), '%')
    +     row(T.outerAdd, fv('outerAdd'))
    +     section(T.sec5)
    +     row(T.worldLv, fv('worldLv'))
    +     row(T.martialLv, fv('martialLv'))
    +     row(T.elemBoostMain, fv('elemBoostMain'))
    +     row(T.elemBoostSub, fv('elemBoostSub'))
    +     row(T.enemyDebuff, fv('enemyDebuff'), '%')
    +     section(T.sec6 + ' · ' + (isManual ? 'Manual' : enemySel))
    +     row(T.physDef, physDefVal)
    +     row(T.judgeRes, judgeResVal)
    +     row(T.physRes, isManual ? fv('manPhysRes') : document.getElementById('dispPhysRes').textContent)
    +     row(T.elemRes, isManual ? fv('manElemRes') : document.getElementById('dispElemRes').textContent)
    +     row(T.dmgReduce1, fv('dmgReduce1'), '%')
    +     row(T.dmgReduce2, fv('dmgReduce2'), '%')
    +   '</div>'
    + '</div>'

    // footer
    + '<div style="padding:9px 24px;border-top:1px solid rgba(232,215,180,0.12);display:flex;justify-content:space-between;align-items:center;background:rgba(0,0,0,0.4);">'
    +   '<span style="color:#6a6053;font-family:\'Rajdhani\',monospace;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;">Generated · ' + dateStr + '</span>'
    +   '<span style="color:#8b8170;font-family:\'Rajdhani\',monospace;font-size:10px;letter-spacing:0.16em;">Created by <strong style="color:#c9a45a;">SHIGETORA</strong></span>'
    + '</div>'
    + '</div>';

  card.style.display = 'block';
  html2canvas(card.firstElementChild, { scale: 2, logging: false, backgroundColor: null, useCORS: true })
    .then(canvas => {
      card.style.display = 'none';
      btn.disabled = false; btn.innerHTML = origText;
      const link = document.createElement('a');
      link.download = 'wwm_dmg_calc_' + dateStr.replace(/\//g, '') + '.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast(T.toastExported);
    })
    .catch(err => {
      card.style.display = 'none';
      btn.disabled = false; btn.innerHTML = origText;
      console.error('Export error:', err);
    });
}

// ── 起動 ──────────────────────────────────────────────────────────
function init() {
  initTheme();
  loadInputs();
  initEffMaxVals();
  initPresets();
  bindEnemySelect();

  document.querySelectorAll('input, select').forEach(el => {
    el.addEventListener('input',  () => { calculate(); saveInputs(); });
    el.addEventListener('change', () => { calculate(); saveInputs(); });
  });

  document.getElementById('effTbody').addEventListener('change', function(e) {
    const inp = e.target;
    if (!inp.classList.contains('eff-max-input')) return;
    const idx   = parseInt(inp.dataset.idx, 10);
    const isPct = inp.dataset.ispct === 'true';
    const val   = parseFloat(inp.value);
    if (isNaN(val) || val < 0) return;
    effMaxVals[idx] = isPct ? val / 100 : val;
    saveEffMaxVals();
    if (_lastEffParams !== null) buildEfficiencyTable(_lastEffParams, _lastBaseExpected);
  });

  // 数値入力フィールド：不正文字ブロック
  document.addEventListener('keydown', function(e) {
    if (e.target.tagName !== 'INPUT' || e.target.type !== 'number') return;
    if (e.key === 'e' || e.key === 'E' || e.key === '+') e.preventDefault();
  });
  document.addEventListener('input', function(e) {
    if (e.target.tagName !== 'INPUT' || e.target.type !== 'number') return;
    if (e.target.validity && e.target.validity.badInput) e.target.value = '';
  });

  calculate();
}

document.addEventListener('DOMContentLoaded', init);
