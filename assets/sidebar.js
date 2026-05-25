// ── WWM-DMGCALC Sidebar ─────────────────────────────────────────
let _STAT_CONFIG = null;
let _CURRENT_PARAMS = null;

async function _loadConfig() {
  if (_STAT_CONFIG) return _STAT_CONFIG;
  try { _STAT_CONFIG = await fetch('data/stat_display.json').then(r=>r.json()); } catch(e){}
  return _STAT_CONFIG;
}

function _curLang() { return (window.currentLang) || 'ja'; }
function _label(labelObj, fallback) {
  if (!labelObj) return fallback || '';
  const lang = _curLang();
  return labelObj[lang] || labelObj.ja || labelObj.en || fallback || '';
}

function _fmt(val, format) {
  if (val == null || isNaN(val)) return '-';
  if (format === 'pct')   return (val * 100).toFixed(1) + '%';
  if (format === 'float') return val.toFixed(1);
  return Math.round(val).toLocaleString();
}

function _fmtItem(item, params) {
  if (!params) return '-';
  if (item.format === 'range') {
    const keys = Array.isArray(item.calcKey) ? item.calcKey : [item.calcKey];
    const minV = params[keys[0]] || 0;
    const maxV = params[keys[1] || keys[0]] || 0;
    return `${Math.round(minV).toLocaleString()}-${Math.round(maxV).toLocaleString()}`;
  }
  if (item.format === 'rateApplied') {
    const raw = params[item.calcKey];
    const applied = params[item.appliedCalcKey];
    const rawStr = _fmt(raw, 'pct');
    const appStr = applied != null ? `(${_fmt(applied, 'pct')})` : '';
    return `${rawStr} <span class="wwm-sb-applied">${appStr}</span>`;
  }
  return _fmt(params[item.calcKey], item.format);
}

function _renderItem(item, params, depth) {
  depth = depth || 0;
  const cls = depth > 0 ? ' wwm-sb-sub' : '';
  let html = `
    <div class="wwm-sb-row${cls}" data-item-key="${item.key}">
      <span class="wwm-sb-label">${_label(item.label, item.key)}</span>
      <span class="wwm-sb-value">${_fmtItem(item, params)}</span>
    </div>
  `;
  if (item.expandable && item.subItems) {
    html += `<div class="wwm-sb-sub-group wwm-sb-collapsed" data-parent="${item.key}">`;
    for (const sub of item.subItems) html += _renderItem(sub, params, depth + 1);
    html += `</div>`;
  }
  return html;
}

function _renderSection(section, params) {
  const items = section.items.map(it => _renderItem(it, params, 0)).join('');
  return `
    <section class="wwm-sb-section" data-section-key="${section.key}">
      <h3 class="wwm-sb-section-title">${_label(section.title, section.key)}</h3>
      <div class="wwm-sb-items">${items}</div>
    </section>
  `;
}

async function renderSidebar(params) {
  const cfg = await _loadConfig();
  if (!cfg) return;
  const root = document.getElementById('wwmSidebar');
  if (!root) return;
  _CURRENT_PARAMS = params;
  // 総合武力 = STATUS SCORE 値 (computeExpected 派生)
  let totalPower = '-';
  if (params && typeof window.computeExpected === 'function') {
    const total = window.computeExpected(params) || 0;
    totalPower = Math.round(total / 2.5).toLocaleString();
  }
  const header = `
    <div class="wwm-sb-header">
      <span class="wwm-sb-header-label">${_label(cfg.header?.title, '総合武力')}</span>
      <span class="wwm-sb-header-value">${totalPower}</span>
    </div>
  `;
  const sections = params
    ? (cfg.sections || []).map(s => _renderSection(s, params)).join('')
    : `<div class="wwm-sb-empty">
         <p class="wwm-muted" style="text-align:center;padding:24px 12px;">
           まだインポートデータがありません。<br>
           上部「IMPORT」ボタンから取り込みできます。
         </p>
       </div>`;
  root.innerHTML = header + sections;
  // expandable click
  root.querySelectorAll('.wwm-sb-row[data-item-key]').forEach(el => {
    const key = el.dataset.itemKey;
    const group = root.querySelector(`.wwm-sb-sub-group[data-parent="${key}"]`);
    if (group) {
      el.classList.add('wwm-sb-expandable');
      el.addEventListener('click', () => group.classList.toggle('wwm-sb-collapsed'));
    }
  });
}

// ── Gear Grid (main 下部) ───────────────────────────────────────
const _GEAR_SLOT_ORDER = ['1', '2', '3', '4', '21', '10', '11', '5', '8', '9'];
const _GEAR_SLOT_LABELS = {
  '1': '主武器', '2': '副武器', '3': '冠', '4': '胸当て', '21': '弓矢',
  '10': '環', '11': '佩び物', '5': '膝鎧', '8': '小手', '9': '射玦'
};

function renderGearGrid(roleInfo) {
  const root = document.getElementById('wwmGearGrid');
  if (!root) return;
  const eqDet = roleInfo?.wearEquipsDetailed || {};
  const sets = window.WWM_SETS || {};
  const cards = _GEAR_SLOT_ORDER.map(slot => {
    const eq = eqDet[slot];
    const label = _GEAR_SLOT_LABELS[slot] || slot;
    if (!eq) return `<div class="wwm-equip-slot wwm-equip-empty" data-slot="${slot}"><div class="wwm-equip-slot-header"><b>${label}</b><span class="wwm-muted">未装備</span></div></div>`;
    const suffix = eq.exVo?.suffix;
    const isBow = slot === '9' || slot === '21';
    const isArmor = ['3','4','5','8'].includes(slot);
    const setsCat = isBow ? sets.bowSets : (isArmor ? sets.defensiveSets : sets.weaponSets);
    const setName = setsCat?.[suffix]?.names?.ja || setsCat?.[suffix]?.names?.en || '';
    const affixCount = eq.exVo?.baseAffixes?.length || 0;
    return `
      <div class="wwm-equip-slot" data-slot="${slot}" onclick="WWMGear.openEdit('${slot}')">
        <div class="wwm-equip-slot-header"><b>${label}</b>${setName ? ` <span class="wwm-muted">- ${setName}</span>` : ''}</div>
        <div class="wwm-equip-slot-body">
          <span class="wwm-muted">affix ${affixCount}個</span>
        </div>
      </div>
    `;
  }).join('');
  root.innerHTML = cards;
}

function openGearEdit(slot) {
  // TODO: 編集 modal 実装
  alert('編集 modal: slot ' + slot + ' (TODO実装)');
}

// ── Hero block 更新 ────────────────────────────────────────────
function updateHero(params) {
  if (!params || typeof window.computeExpected !== 'function') return;
  const total = window.computeExpected(params) || 0;
  const statusScore = Math.round(total / 2.5);
  const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setText('heroExpected', Math.round(total).toLocaleString());
  setText('hbExp', Math.round(total).toLocaleString());
  setText('heroScore', statusScore.toLocaleString());
  setText('heroCompactDmg', Math.round(total).toLocaleString());
  setText('heroCompactScore', statusScore.toLocaleString());
  setText('heroCompactExp', Math.round(total).toLocaleString());
}

// Header/Footer 実高さ → CSS 変数で sidebar top/bottom 動的調整
function _syncLayoutVars() {
  const header = document.querySelector('.sticky-header');
  const footer = document.querySelector('.wwm-footer');
  if (header) document.documentElement.style.setProperty('--wwm-header-h', header.offsetHeight + 'px');
  if (footer) document.documentElement.style.setProperty('--wwm-footer-h', footer.offsetHeight + 'px');
  // sidebar height = footer top - hero top (上下スペース 完全一致)
  const hero = document.querySelector('section.hero');
  const sidebar = document.querySelector('.wwm-sidebar-test');
  if (hero && footer && sidebar) {
    const heroTop = hero.getBoundingClientRect().top;
    const footerTop = footer.getBoundingClientRect().top;
    const padBottom = parseFloat(getComputedStyle(document.querySelector('.wwm-app-body') || sidebar.parentElement).paddingBottom) || 0;
    const height = footerTop - heroTop - padBottom;
    if (height > 100) {
      sidebar.style.height = height + 'px';
      sidebar.style.maxHeight = height + 'px';
    }
  }
}
window.addEventListener('resize', _syncLayoutVars);
window.addEventListener('DOMContentLoaded', _syncLayoutVars);
window.addEventListener('load', _syncLayoutVars);
setTimeout(_syncLayoutVars, 100);
setTimeout(_syncLayoutVars, 500);
// ResizeObserver は loop の原因になるので無効化 (sidebar は固定 calc 値で対応)

window.WWMSidebar = {
  render: renderSidebar,
  refresh: () => _CURRENT_PARAMS && renderSidebar(_CURRENT_PARAMS),
  syncLayout: _syncLayoutVars
};
window.WWMGear = {
  render: renderGearGrid,
  openEdit: openGearEdit
};
window.WWMHero = {
  update: updateHero
};
