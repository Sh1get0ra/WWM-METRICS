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

const _COLLAPSE_KEY = 'wwm_sidebar_collapsed_v1';
function _getCollapsedSet() {
  try { return new Set(JSON.parse(localStorage.getItem(_COLLAPSE_KEY) || '[]')); }
  catch(e) { return new Set(); }
}
function _saveCollapsed(set) {
  try { localStorage.setItem(_COLLAPSE_KEY, JSON.stringify([...set])); } catch(e) {}
}

function _renderSection(section, params, collapsedSet) {
  const items = section.items.map(it => _renderItem(it, params, 0)).join('');
  const isCollapsed = collapsedSet.has(section.key);
  return `
    <section class="wwm-sb-section${isCollapsed ? ' wwm-sb-collapsed-sec' : ''}" data-section-key="${section.key}">
      <h3 class="wwm-sb-section-title" data-toggle-section="${section.key}">
        <span class="wwm-sb-sec-arrow">${isCollapsed ? '▶' : '▼'}</span>
        ${_label(section.title, section.key)}
      </h3>
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
  // 総合武力 = roleInfo.xiuWeiKungFu (現在値)
  let totalPower = '-';
  const ri = window.__WWM_ROLEINFO;
  if (ri?.xiuWeiKungFu) totalPower = ri.xiuWeiKungFu.toLocaleString();
  else if (ri?.maxXiuWeiKungFu) totalPower = ri.maxXiuWeiKungFu.toLocaleString();
  const avatar = ri?._avatarUrl ? `<img class="wwm-sb-avatar" src="${ri._avatarUrl}" alt="avatar">` : '';
  const charName = ri?.roleName ? `${ri.roleName} <span class="wwm-muted">Lv${ri.level||'?'}</span>` : '';
  const importBtnLabel = (window.T && window.T.importBtn) || 'IMPORT';
  const powerLabel = _label(cfg.header?.title, '総合武力');
  const header = `
    <div class="wwm-sb-top">
      ${avatar}
      <div class="wwm-sb-info">
        ${charName ? `<div class="wwm-sb-charname">${charName}</div>` : ''}
        <div class="wwm-sb-power"><span class="wwm-muted">${powerLabel}</span> <b>${totalPower}</b></div>
      </div>
      <button type="button" class="wwm-sb-import-btn" onclick="importData()" data-i18n="importBtn">${importBtnLabel}</button>
    </div>
  `;
  const collapsedSet = _getCollapsedSet();
  const sections = params
    ? (cfg.sections || []).map(s => _renderSection(s, params, collapsedSet)).join('')
    : `<div class="wwm-sb-empty">
         <p class="wwm-muted" style="text-align:center;padding:24px 12px;">
           まだインポートデータがありません。<br>
           上部「IMPORT」ボタンから取り込みできます。
         </p>
       </div>`;
  // 未対応データ notice
  let noticeHtml = '';
  if (ri) {
    const u = _detectUnknown(ri);
    const total = u.kongfu.length + u.xinfa.length + u.affix.length;
    if (total) {
      noticeHtml = `
        <div class="wwm-sb-notice" onclick="WWMSidebar.openUnknownReport()">
          ⚠ 未対応データ ${total}件 (click 報告)
        </div>
      `;
    }
  }
  root.innerHTML = header + sections + noticeHtml;
  // section title click で折りたたみ toggle
  root.querySelectorAll('[data-toggle-section]').forEach(el => {
    el.addEventListener('click', () => {
      const key = el.dataset.toggleSection;
      const set = _getCollapsedSet();
      if (set.has(key)) set.delete(key);
      else set.add(key);
      _saveCollapsed(set);
      const sec = el.closest('.wwm-sb-section');
      const arrow = el.querySelector('.wwm-sb-sec-arrow');
      if (sec.classList.toggle('wwm-sb-collapsed-sec')) {
        if (arrow) arrow.textContent = '▶';
      } else {
        if (arrow) arrow.textContent = '▼';
      }
    });
  });
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
// slot/weaponType → アイコンファイル名 (assets/icons/<name>.svg)
const _GEAR_SLOT_ICON = {
  '3': 'helmet', '4': 'chest', '5': 'legs', '8': 'hands',
  '10': 'ring', '11': 'pendant',
  '21': 'bow', '9': 'archer-disc'
};
const _WEAPON_TYPE_ICON = {
  sword: 'sword', spear: 'spear', fan: 'fan', umbrella: 'umbrella',
  moBlade: 'glaive', dualBlades: 'dual-blades', ropeDart: 'rope-dart',
  hengBlade: 'katana',
  // raw kongfu.json weaponType (snake)
  mo_blade: 'glaive', dual_blades: 'dual-blades', rope_dart: 'rope-dart',
  heng_blade: 'katana'
};
function _gearIcon(slot, roleInfo) {
  if (slot === '1' || slot === '2') {
    const kid = slot === '1' ? roleInfo?.kongfuMain : roleInfo?.kongfuSub;
    const kf = window.WWM_KONGFU?.[kid];
    const wt = kf?.weaponType;
    if (wt) {
      // normalize: dual_blades or dualBlades
      return _WEAPON_TYPE_ICON[wt] || _WEAPON_TYPE_ICON[wt.replace(/_([a-z])/g, (_,c)=>c.toUpperCase())] || 'sword';
    }
    return 'sword';
  }
  return _GEAR_SLOT_ICON[slot] || null;
}

function renderGearGrid(roleInfo) {
  const root = document.getElementById('wwmGearGrid');
  if (!root) return;
  const eqDet = roleInfo?.wearEquipsDetailed || {};
  const sets = window.WWM_SETS || {};
  const kongfu = window.WWM_KONGFU || {};
  const lang = (window.currentLang) || 'ja';
  const kfName = (id) => kongfu[id]?.names?.[lang] || kongfu[id]?.names?.ja || '';

  // 装備カード Score = affix ratio 平均 × 100
  function calcCardScore(eq) {
    const affs = eq?.exVo?.baseAffixes || [];
    if (!affs.length) return 0;
    let sum = 0, n = 0;
    for (const a of affs) {
      const d = a?.equipmentDetails;
      if (!d) continue;
      const ratio = d[2];
      if (typeof ratio === 'number') { sum += ratio; n++; }
    }
    return n ? Math.round(sum / n * 100) : 0;
  }

  const cards = _GEAR_SLOT_ORDER.map(slot => {
    const eq = eqDet[slot];
    const label = _GEAR_SLOT_LABELS[slot] || slot;
    if (!eq) return `<div class="wwm-equip-slot wwm-equip-empty" data-slot="${slot}"><div class="wwm-equip-slot-header"><b>${label}</b><span class="wwm-muted">未装備</span></div></div>`;
    const suffix = eq.exVo?.suffix;
    const isBow = slot === '9' || slot === '21';
    const isArmor = ['3','4','5','8'].includes(slot);
    const setsCat = isBow ? sets.bowSets : (isArmor ? sets.defensiveSets : sets.weaponSets);
    const setName = setsCat?.[suffix]?.names?.ja || setsCat?.[suffix]?.names?.en || '';
    const score = calcCardScore(eq);
    let kongfuLine = '';
    if (slot === '1' && roleInfo?.kongfuMain) {
      const n = kfName(roleInfo.kongfuMain);
      if (n) kongfuLine = `<span class="wwm-equip-kongfu">${n}</span>`;
    } else if (slot === '2' && roleInfo?.kongfuSub) {
      const n = kfName(roleInfo.kongfuSub);
      if (n) kongfuLine = `<span class="wwm-equip-kongfu">${n}</span>`;
    }
    const iconName = _gearIcon(slot, roleInfo);
    const iconHtml = iconName ? `<img class="wwm-equip-icon" src="assets/icons/${iconName}.svg" alt="">` : '';
    const editable = !['9', '21'].includes(slot);
    return `
      <div class="wwm-equip-slot${editable?'':' wwm-equip-noedit'}" data-slot="${slot}"${editable?` onclick="WWMGear.openEdit('${slot}')"`:''}>
        ${iconHtml}
        <div class="wwm-equip-slot-inner">
          <div class="wwm-equip-slot-header"><b>${label}</b>${setName ? ` <span class="wwm-muted">- ${setName}</span>` : ''}</div>
          <div class="wwm-equip-slot-body">
            ${kongfuLine}
            <span class="wwm-equip-card-score">Score <b>${score}</b></span>
          </div>
        </div>
      </div>
    `;
  }).join('');
  root.innerHTML = cards;
}

// ── Virtual gear state (Edit modal適用結果) ─────────────────────
function _getEffectiveRoleInfo() {
  const orig = window.__WWM_ROLEINFO;
  if (!orig) return null;
  const vmap = window.__WWM_VIRTUAL || {};
  const vkf = window.__WWM_VIRTUAL_KONGFU || {};
  if (!Object.keys(vmap).length && !Object.keys(vkf).length) return orig;
  const merged = { ...orig, wearEquipsDetailed: { ...(orig.wearEquipsDetailed || {}) } };
  for (const [slot, vEq] of Object.entries(vmap)) {
    if (vEq) merged.wearEquipsDetailed[slot] = vEq;
  }
  if (vkf.kongfuMain) merged.kongfuMain = vkf.kongfuMain;
  if (vkf.kongfuSub) merged.kongfuSub = vkf.kongfuSub;
  return merged;
}
window.__WWM_GET_EFFECTIVE_ROLEINFO = _getEffectiveRoleInfo;

function _refreshAll() {
  const ri = _getEffectiveRoleInfo();
  if (!ri) return;
  const state = (() => {
    try { return JSON.parse(localStorage.getItem('wwm_last_state_v1') || 'null'); } catch(_) { return null; }
  })();
  if (window.WWMStats) {
    window.WWMStats.buildStatParams(ri, state).then(params => {
      window.__WWM_PARAMS = params;
      window.WWMSidebar.render(params);
      window.WWMGear.render(ri);
      if (window.WWMHero) window.WWMHero.update(params);
    }).catch(e => console.error('[WWM] refresh failed:', e));
  }
}

// ── Affix 統計 ラベル取得 (import.js の _STAT_LABELS 利用) ────
function _affixDisplayName(id) {
  const info = window.WWM_AFFIX?.[id];
  const key = info?.statKey;
  if (!key) return 'affix#' + id;
  // _STAT_LABELS は import.js 内 const、 fallback で key そのまま
  return (window._AFFIX_DISPLAY_LABELS?.[key]) || key;
}

// 👍 自動判定: 火力寄与statKey true、 防御系 false
// 会心率 (crit) = 全武器 useful
// 会意率 (affinity) = 指定 kongfu のみ useful (九変/無銘の剣/蛇神/無銘の槍)
// 指定武術効果強化 (swordDmg等) + 武術攻撃強化系 (lightAtkDmg等) = その装備に出現したら確定 useful
const _USEFUL_KEYS = new Set([
  'crit', 'precision', 'directCrit', 'directAffinity',
  'minPhys', 'maxPhys', 'physPen', 'physDmgBonus',
  'minBellstrike', 'maxBellstrike', 'bellstrikePen',
  'minStonesplit', 'maxStonesplit', 'stonesplitPen',
  'minSilkbind', 'maxSilkbind', 'silkbindPen',
  'minBamboocut', 'maxBamboocut', 'bamboocutPen',
  'minVoid', 'maxVoid', 'voidPen',
  'attrDmgBonus', 'attrPen', 'critDmgBonus', 'affinityDmgBonus',
  'allWeaponDmg', 'bossDmg', 'playerUnitDmg',
  'stMysticDmg', 'stBurstMysticDmg', 'stControlMysticDmg',
  'areaMysticDmg', 'areaDmgMysticDmg', 'areaDebuffMysticDmg',
  // 指定武術効果強化 (装備限定 → 出れば確定 useful)
  'swordDmg', 'spearDmg', 'fanDmg', 'umbrellaDmg',
  'hengBladeDmg', 'moBladeDmg', 'dualBladesDmg', 'ropeDartDmg',
  // 武術攻撃強化系 (装備限定 → 出れば確定 useful)
  'lightAtkDmg', 'heavyAtkDmg', 'executionDmg',
  'airborneLightAtkDmg', 'jumpStrikeDmg', 'dualWeaponSkillDmg', 'dashDmg',
  'agility', 'power', 'momentum'
]);
// 会意率 useful 対象 kongfu (九変の剣/無銘の剣/蛇神の槍/無銘の槍)
const _AFFINITY_USEFUL_KONGFU = new Set([10101, 10102, 10201, 10202, '10101', '10102', '10201', '10202']);

// 武学固有強化 affix statKey prefix → 対応 kongfu IDs
// その武学装備中のみ 👍
const _KONGFU_SPECIFIC_AFFIX = [
  { prefix: 'namelessSword',       kongfus: [10102] },  // 無銘の剣
  { prefix: 'namelessSpear',       kongfus: [10202] },  // 無銘の槍
  { prefix: 'sword',               kongfus: [10101] },  // 九変の剣
  { prefix: 'spear',               kongfus: [10201] },  // 蛇神の槍
  { prefix: 'bleed',               kongfus: [10101] },  // 九変の剣 (出血)
  { prefix: 'panaceaFan',          kongfus: [10301] },  // 薬川の扇
  { prefix: 'fan',                 kongfus: [10302] },  // 墨筆の扇
  { prefix: 'stormbreaker',        kongfus: [20103] },  // 嵐雷の槍
  { prefix: 'phalanxbane',         kongfus: [20402] },  // 破陣の刀
  { prefix: 'moBlade',             kongfus: [20401] },  // 断魂の刀
  { prefix: 'infernalTwinblades',  kongfus: [20501] },  // 獄炎の双剣
  { prefix: 'everspringUmb',       kongfus: [20603] },  // 醉夢の傘 (Everspring Umbrella)
  { prefix: 'soulshadeUmb',        kongfus: [20602] },  // 誘魂の傘
  { prefix: 'umb',                 kongfus: [20601] },  // 千紅の傘 (Vernal Umbrella)
  { prefix: 'mortalRopeDart',      kongfus: [20701] },  // 浮塵の縄
  { prefix: 'unfetteredRopeDart',  kongfus: [20702] },  // 浮雲の縄
  { prefix: 'snowparting',         kongfus: [20801] }   // 斬雪の刀
];
function _matchKongfuSpecific(statKey) {
  // 長い prefix 優先 (例: namelessSword > sword)
  const sorted = [..._KONGFU_SPECIFIC_AFFIX].sort((a,b) => b.prefix.length - a.prefix.length);
  for (const r of sorted) {
    if (statKey.startsWith(r.prefix)) return r.kongfus;
  }
  return null;
}
function _isUsefulAffix(id, roleInfo) {
  const info = window.WWM_AFFIX?.[id];
  if (!info?.statKey) return false;
  const sk = info.statKey;
  const k = window.WWM_KONGFU?.[roleInfo?.kongfuMain];
  const path = k?.path;
  // 会意率 特例: 指定 kongfu のみ useful
  if (sk === 'affinity') return _AFFINITY_USEFUL_KONGFU.has(roleInfo?.kongfuMain);
  // 武学固有強化: 該当武学(Main/Sub)装備中のみ useful
  const kfSpecific = _matchKongfuSpecific(sk);
  if (kfSpecific) {
    const km = parseInt(roleInfo?.kongfuMain, 10);
    const ks = parseInt(roleInfo?.kongfuSub, 10);
    return kfSpecific.includes(km) || kfSpecific.includes(ks);
  }
  if (!_USEFUL_KEYS.has(sk)) return false;
  // 無相貫通 確定 useful (path 制限外)
  if (sk === 'voidPen') return true;
  // 5path stat は active path のみ useful
  for (const p of ['Bellstrike','Stonesplit','Silkbind','Bamboocut','Void']) {
    const lower = p.charAt(0).toLowerCase() + p.slice(1);
    if (sk === 'min'+p || sk === 'max'+p || sk === lower+'Pen') {
      if (!path) return true;
      const myPrefix = path === 'voidPath' ? 'Void' : (path.charAt(0).toUpperCase() + path.slice(1));
      return p === myPrefix;
    }
  }
  return true;
}

// %表示 statKey list (ratio→pct)
// ratio 保存 (0.05=5%) → *100 で % 表示
const _PCT_RATIO_STATKEYS = new Set([
  'crit', 'affinity', 'precision', 'directCrit', 'directAffinity',
  'physDmgBonus', 'attrDmgBonus', 'critDmgBonus', 'affinityDmgBonus',
  'allWeaponDmg', 'bossDmg', 'playerUnitDmg',
  'stMysticDmg', 'stBurstMysticDmg', 'stControlMysticDmg',
  'areaMysticDmg', 'areaDmgMysticDmg', 'areaDebuffMysticDmg',
  'lightAtkDmg', 'heavyAtkDmg', 'executionDmg',
  'swordDmg', 'spearDmg', 'fanDmg', 'umbrellaDmg',
  'hengBladeDmg', 'moBladeDmg', 'dualBladesDmg', 'ropeDartDmg',
  'sympathyRate', 'addCritRate', 'addSympathyRate'
]);
// すでに % 単位で保存 (例: 9.4=9.4%) → *100 不要。現状空 (Pen系はゲーム内 非%表記)
const _PCT_DIRECT_STATKEYS = new Set([]);
function _isPctStat(statKey) { return _PCT_RATIO_STATKEYS.has(statKey) || _PCT_DIRECT_STATKEYS.has(statKey); }
function _pctNeedsMul(statKey) { return _PCT_RATIO_STATKEYS.has(statKey); }
function _fmtAffixVal(val, statKey) {
  if (val == null || isNaN(val)) return '-';
  if (_PCT_RATIO_STATKEYS.has(statKey)) return (val * 100).toFixed(1) + '%';
  if (_PCT_DIRECT_STATKEYS.has(statKey)) return val.toFixed(1) + '%';
  if (typeof val === 'number') return val.toFixed(2).replace(/\.00$/, '');
  return val;
}

// 6番目 affix 限定 ルール
// 武器/環/佩び物 (1/2/10/11): 3択のみ (physPen/voidPen/physResist)
// 防具 (3/4/5/8): 上記3つを除外
const _SLOT6_WEAPON_LIKE = new Set(['1', '2', '10', '11']);
const _SLOT6_ARMOR = new Set(['3', '4', '5', '8']);
const _SLOT6_PEN_STATS = ['physPen', 'voidPen', 'physResist'];

// affix 種別変更 option list: 現 affix と同じ prefix2 のもの → statKey で dedup
// slot/idx 指定で 6番目限定処理 + idx 1-4 重複不可 (affix0 のみ重複可)
function _getAffixOptions(currentAffixId, slot, idx, allAffixes) {
  const all = window.WWM_AFFIX || {};
  const cur = String(currentAffixId);
  const prefix = cur.substring(0, 2);
  const slotS = String(slot);
  const isIdx6 = idx === 5;
  const isWeaponLike6 = isIdx6 && _SLOT6_WEAPON_LIKE.has(slotS);
  const isArmor6 = isIdx6 && _SLOT6_ARMOR.has(slotS);
  // 重複禁止 set: idx 1-4 の場合、他 idx 1-4 で使用中の statKey を除外
  // (idx 0 / idx 5 は対象外)
  const blockedKeys = new Set();
  if (allAffixes && idx >= 1 && idx <= 4) {
    for (let i = 1; i <= 4; i++) {
      if (i === idx) continue;
      const otherId = allAffixes[i]?.equipmentDetails?.[0];
      const otherInfo = otherId != null ? all[otherId] : null;
      if (otherInfo?.statKey) blockedKeys.add(otherInfo.statKey);
    }
  }
  const seen = new Set();
  const opts = [];
  for (const [id, info] of Object.entries(all)) {
    if (!id.startsWith(prefix)) continue;
    const sk = info.statKey;
    if (!sk || seen.has(sk)) continue;
    if (isWeaponLike6 && !_SLOT6_PEN_STATS.includes(sk)) continue;
    if (isArmor6 && _SLOT6_PEN_STATS.includes(sk)) continue;
    if (blockedKeys.has(sk)) continue;
    seen.add(sk);
    opts.push({ id, statKey: sk, name: (window._AFFIX_DISPLAY_LABELS?.[sk]) || sk });
  }
  opts.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  return opts;
}

function openGearEdit(slot) {
  const origRi = window.__WWM_ROLEINFO;
  const origEq = origRi?.wearEquipsDetailed?.[slot];
  if (!origEq) { alert('装備データなし: slot ' + slot); return; }
  const label = _GEAR_SLOT_LABELS[slot] || slot;
  // 背景アイコン (slot/武器type に対応)
  const bgIconName = _gearIcon(slot, origRi);
  const bgIconUrl = bgIconName ? `url('assets/icons/${bgIconName}.svg')` : 'none';
  // kongfu 名称 (主武器/副武器)
  const lang = _curLang();
  const kfMap = window.WWM_KONGFU || {};
  const _kfName = (id) => kfMap[id]?.names?.[lang] || kfMap[id]?.names?.ja || '';
  const isWeaponSlot = slot === '1' || slot === '2';
  const origKongfuId = slot === '1' ? origRi?.kongfuMain : (slot === '2' ? origRi?.kongfuSub : null);
  // 編集中 kongfu state (新パネル用)
  let newKongfuId = origKongfuId;
  const kongfuLabel = origKongfuId ? _kfName(origKongfuId) : '';
  const kongfuHtml = kongfuLabel ? `<span class="wwm-cmp-kongfu">${kongfuLabel}</span>` : '';
  // セット (weaponSets: slot 1/2/10/11)
  const isWeaponSetSlot = ['1','2','10','11'].includes(String(slot));
  const origSuffix = origEq.exVo?.suffix;
  let newSuffix = origSuffix;
  const setsMap = window.WWM_SETS?.weaponSets || {};
  const _setName = (s) => setsMap[s]?.names?.[lang] || setsMap[s]?.names?.ja || (s ? `Set ${s}` : '');
  const _setRaw = (s) => setsMap[s]?.pieces2?.raw || '';
  function _setOptions(selectedId) {
    return Object.entries(setsMap)
      .map(([id, s]) => `<option value="${id}" ${String(id)===String(selectedId)?'selected':''}>${s.names?.[lang]||s.names?.ja||id}</option>`)
      .join('');
  }
  // 全 kongfu option list (slot1/2 編集用)
  function _kongfuOptions(selectedId) {
    return Object.entries(kfMap)
      .filter(([k]) => /^\d+$/.test(k))
      .map(([id, kf]) => `<option value="${id}" ${String(id)===String(selectedId)?'selected':''}>${kf.names?.[lang]||kf.names?.ja||id}</option>`)
      .join('');
  }
  // 仮想 roleInfo (newKongfu を反映した useful 判定用)
  function _virtRi(kid) {
    if (!isWeaponSlot) return origRi;
    const r = { ...origRi };
    if (slot === '1') r.kongfuMain = parseInt(kid, 10);
    else if (slot === '2') r.kongfuSub = parseInt(kid, 10);
    return r;
  }
  // 新装備 = virtual あれば virtual、なければ original コピー
  const virtualEq = window.__WWM_VIRTUAL?.[slot];
  const newAffixes = JSON.parse(JSON.stringify((virtualEq || origEq).exVo?.baseAffixes || []));
  // 👍 自動判定で d[4] 上書き (newKongfu 基準)
  function _recalcUseful() {
    const ri = _virtRi(newKongfuId);
    for (const a of newAffixes) {
      const d = a.equipmentDetails;
      if (d) d[4] = _isUsefulAffix(d[0], ri);
    }
  }
  _recalcUseful();

  function renderCurrentRows() {
    const affs = origEq.exVo?.baseAffixes || [];
    return affs.map(a => {
      const d = a.equipmentDetails || [];
      const [id, val, ratio, rank, useful] = d;
      const info = window.WWM_AFFIX?.[id];
      const sk = info?.statKey;
      const name = _affixDisplayName(id);
      const rkCls = rank===3?'gold':rank===2?'purple':'blue';
      const usefulAuto = _isUsefulAffix(id, origRi);
      return `
        <div class="wwm-cmp-row">
          <span class="wwm-cmp-name wwm-rank-${rkCls}" title="ID:${id}">${name}${usefulAuto?' 👍':''}</span>
          <span class="wwm-cmp-val">${_fmtAffixVal(val, sk)}</span>
        </div>
      `;
    }).join('');
  }

  // rank auto-derive: ratio から (>0.85 金 / >0.7 紫 / else 青)
  function _deriveRank(ratio) {
    if (ratio > 0.85) return 3;
    if (ratio > 0.70) return 2;
    return 1;
  }

  function renderNewRows() {
    return newAffixes.map((a, idx) => {
      const d = a.equipmentDetails || [];
      const [id, val, ratio, rank, useful] = d;
      const info = window.WWM_AFFIX?.[id];
      const sk = info?.statKey;
      const r = _deriveRank(ratio);
      const rkCls = r===3?'gold':r===2?'purple':'blue';
      const opts = _getAffixOptions(id, slot, idx, newAffixes);
      // selected は statKey 一致で判定 (実 ID と代表 ID 異なる可能性)
      const optsHtml = opts.map(o => `<option value="${o.id}" data-stat="${o.statKey}" ${o.statKey===sk?'selected':''}>${o.name}</option>`).join('');
      const isPct = _isPctStat(sk);
      const needsMul = _pctNeedsMul(sk);
      const displayVal = isPct
        ? (needsMul ? (val*100).toFixed(1) : val.toFixed(1))
        : (typeof val === 'number' ? val.toFixed(2).replace(/\.00$/,'') : val);
      const step = isPct ? '0.1' : '0.01';
      // max 値算出 (原データ val/ratio)
      const oVal = origEq.exVo?.baseAffixes?.[idx]?.equipmentDetails?.[1];
      const oRatio = origEq.exVo?.baseAffixes?.[idx]?.equipmentDetails?.[2];
      const maxInternal = (oVal != null && oRatio > 0) ? (oVal / oRatio) : null;
      const maxAttr = maxInternal != null
        ? `max="${isPct ? (needsMul ? (maxInternal*100).toFixed(1) : maxInternal.toFixed(1)) : maxInternal.toFixed(2)}"`
        : '';
      return `
        <div class="wwm-cmp-row wwm-cmp-edit-row" data-affix-idx="${idx}">
          <select class="wwm-cmp-stat-select wwm-rank-${rkCls}" data-field="stat" data-stat-el>${optsHtml}</select>
          <div class="wwm-cmp-useful-mark" data-useful-el>${useful?'👍':''}</div>
          <div class="wwm-cmp-val-wrap">
            <input type="number" class="wwm-num-input wwm-cmp-val-input" step="${step}" min="0" ${maxAttr} value="${displayVal}" data-field="val" data-pct="${isPct?1:0}" data-pctmul="${needsMul?1:0}">
            <span class="wwm-cmp-unit" data-unit-el>${isPct?'%':''}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  const m = document.createElement('div');
  m.className = 'wwm-modal-backdrop';
  const bgIconHtml = bgIconName ? `<div class="wwm-cmp-bg-icon" style="background-image: url('assets/icons/${bgIconName}.svg');"></div>` : '';
  // panel 内 kongfu header HTML
  const curKongfuHeader = isWeaponSlot && origKongfuId
    ? `<div class="wwm-cmp-kongfu-header">${_kfName(origKongfuId)}</div>` : '';
  const newKongfuHeader = isWeaponSlot
    ? `<select class="wwm-cmp-kongfu-select" id="wwmCmpKongfuSel">${_kongfuOptions(newKongfuId)}</select>`
    : '';
  // panel 内 set header HTML
  const curSetHeader = isWeaponSetSlot && origSuffix
    ? `<div class="wwm-cmp-set-header" title="${_setRaw(origSuffix)}">${_setName(origSuffix)}<div class="wwm-cmp-set-effect">${_setRaw(origSuffix)}</div></div>` : '';
  const newSetHeader = isWeaponSetSlot
    ? `<select class="wwm-cmp-set-select" id="wwmCmpSetSel">${_setOptions(newSuffix)}</select><div class="wwm-cmp-set-effect" id="wwmCmpSetEffect">${_setRaw(newSuffix)}</div>` : '';
  m.innerHTML = `
    <div class="wwm-modal wwm-modal-wide wwm-modal-square">
      <div class="wwm-modal-header">
        <h2>${label} - Gear Compare${kongfuHtml}</h2>
        <button class="wwm-modal-close" aria-label="Close">×</button>
      </div>
      <div class="wwm-modal-body">
        <div class="wwm-cmp-grid">
          <div class="wwm-cmp-col wwm-cmp-current">
            ${bgIconHtml}
            <h3 class="wwm-cmp-title">現在の装備</h3>
            ${curKongfuHeader}
            ${curSetHeader}
            <div class="wwm-cmp-rows">${renderCurrentRows()}</div>
          </div>
          <div class="wwm-cmp-col wwm-cmp-new" id="wwmCmpNewCol">
            ${bgIconHtml}
            <h3 class="wwm-cmp-title">新しい装備</h3>
            ${newKongfuHeader}
            ${newSetHeader}
            <div class="wwm-cmp-rows" id="wwmCmpNewRows">${renderNewRows()}</div>
          </div>
        </div>
        <div class="wwm-btn-row" style="margin-top:16px;">
          <button class="wwm-btn-primary" id="wwmEditApply">適用 (sidebar反映)</button>
          <button class="wwm-btn-secondary" id="wwmEditReset">元に戻す</button>
          <button class="wwm-btn-secondary" id="wwmEditCancel">キャンセル</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(m);
  m.querySelector('.wwm-modal-close').addEventListener('click', () => m.remove());
  // backdrop クリック閉じ 抑止 (×/キャンセルボタンのみ閉じ)
  m.querySelector('#wwmEditCancel').addEventListener('click', () => m.remove());

  // セット変更 (新パネル)
  const setSel = m.querySelector('#wwmCmpSetSel');
  if (setSel) {
    setSel.addEventListener('change', () => {
      newSuffix = parseInt(setSel.value, 10);
      const eff = m.querySelector('#wwmCmpSetEffect');
      if (eff) eff.textContent = _setRaw(newSuffix);
    });
  }

  // kongfu 変更 (新パネル)
  const kfSel = m.querySelector('#wwmCmpKongfuSel');
  if (kfSel) {
    kfSel.addEventListener('change', () => {
      newKongfuId = parseInt(kfSel.value, 10);
      _recalcUseful();
      const rowsEl = m.querySelector('#wwmCmpNewRows');
      if (rowsEl) rowsEl.innerHTML = renderNewRows();
      _bindRowEvents();
      // 新パネル bg icon 更新
      const newIcon = _gearIcon(slot, _virtRi(newKongfuId));
      const bgEl = m.querySelector('#wwmCmpNewCol > .wwm-cmp-bg-icon');
      if (bgEl && newIcon) bgEl.style.backgroundImage = `url('assets/icons/${newIcon}.svg')`;
    });
  }

  // 新装備 入力 change
  function _refreshRowUI(row, idx) {
    const d = newAffixes[idx].equipmentDetails;
    const info = window.WWM_AFFIX?.[d[0]];
    const sk = info?.statKey;
    const isPct = _isPctStat(sk);
    const rk = d[3];
    const cls = rk===3?'gold':rk===2?'purple':'blue';
    const sel = row.querySelector('[data-stat-el]');
    if (sel) sel.className = 'wwm-cmp-stat-select wwm-rank-' + cls;
    const usefulEl = row.querySelector('[data-useful-el]');
    if (usefulEl) usefulEl.textContent = d[4] ? '👍' : '';
    const valInp = row.querySelector('.wwm-cmp-val-input');
    if (valInp) {
      valInp.dataset.pct = isPct ? '1' : '0';
      valInp.dataset.pctmul = _pctNeedsMul(sk) ? '1' : '0';
      valInp.step = isPct ? '0.1' : '0.01';
    }
    const unitEl = row.querySelector('[data-unit-el]');
    if (unitEl) unitEl.textContent = isPct ? '%' : '';
  }

  function _bindRowEvents() {
  m.querySelectorAll('.wwm-cmp-edit-row').forEach(row => {
    const idx = parseInt(row.dataset.affixIdx, 10);
    row.querySelectorAll('[data-field]').forEach(el => {
      const evt = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(evt, () => {
        const f = el.dataset.field;
        const d = newAffixes[idx].equipmentDetails;
        if (f === 'stat') {
          const newId = parseInt(el.value, 10);
          d[0] = newId;
          // useful 再判定 (newKongfu 基準)
          d[4] = _isUsefulAffix(newId, _virtRi(newKongfuId));
          // 重複ルール反映で全行 再render
          if (idx >= 1 && idx <= 4) {
            const rowsEl = m.querySelector('#wwmCmpNewRows');
            if (rowsEl) {
              rowsEl.innerHTML = renderNewRows();
              _bindRowEvents();
              return;
            }
          }
          _refreshRowUI(row, idx);
          // 値表示単位 切替に伴い input value 再表示
          const newInfo = window.WWM_AFFIX?.[newId];
          const newSk = newInfo?.statKey;
          const newPct = _isPctStat(newSk);
          const newMul = _pctNeedsMul(newSk);
          const inp = row.querySelector('.wwm-cmp-val-input');
          if (inp) inp.value = newPct
            ? (newMul ? (d[1]*100).toFixed(1) : d[1].toFixed(1))
            : (typeof d[1]==='number' ? d[1].toFixed(2).replace(/\.00$/,'') : d[1]);
        } else if (f === 'val') {
          const isPct = el.dataset.pct === '1';
          const needsMul = el.dataset.pctmul === '1';
          const raw = parseFloat(el.value) || 0;
          let internal = (isPct && needsMul) ? raw / 100 : raw;
          const origVal = origEq.exVo?.baseAffixes?.[idx]?.equipmentDetails?.[1] ?? internal;
          const origRatio = origEq.exVo?.baseAffixes?.[idx]?.equipmentDetails?.[2] ?? 1;
          const max = origRatio > 0 ? (origVal / origRatio) : null;
          // 最大値クランプ
          if (max && max > 0 && internal > max) {
            internal = max;
            const displayMax = (isPct && needsMul) ? (max*100).toFixed(1)
              : (isPct ? max.toFixed(1) : max.toFixed(2).replace(/\.00$/,''));
            el.value = displayMax;
          }
          d[1] = internal;
          if (max && max > 0) {
            d[2] = d[1] / max;
            d[3] = _deriveRank(d[2]);
            _refreshRowUI(row, idx);
          }
        }
      });
    });
  });
  }
  _bindRowEvents();

  m.querySelector('#wwmEditApply').addEventListener('click', () => {
    if (!window.__WWM_VIRTUAL) window.__WWM_VIRTUAL = {};
    if (!window.__WWM_VIRTUAL_KONGFU) window.__WWM_VIRTUAL_KONGFU = {};
    const vEq = JSON.parse(JSON.stringify(origEq));
    vEq.exVo.baseAffixes = newAffixes;
    if (isWeaponSetSlot && newSuffix != null) vEq.exVo.suffix = parseInt(newSuffix, 10);
    window.__WWM_VIRTUAL[slot] = vEq;
    if (isWeaponSlot && newKongfuId && newKongfuId !== origKongfuId) {
      if (slot === '1') window.__WWM_VIRTUAL_KONGFU.kongfuMain = newKongfuId;
      else if (slot === '2') window.__WWM_VIRTUAL_KONGFU.kongfuSub = newKongfuId;
    }
    m.remove();
    _refreshAll();
  });

  m.querySelector('#wwmEditReset').addEventListener('click', () => {
    if (window.__WWM_VIRTUAL) delete window.__WWM_VIRTUAL[slot];
    if (window.__WWM_VIRTUAL_KONGFU) {
      if (slot === '1') delete window.__WWM_VIRTUAL_KONGFU.kongfuMain;
      else if (slot === '2') delete window.__WWM_VIRTUAL_KONGFU.kongfuSub;
    }
    m.remove();
    _refreshAll();
  });
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

// ── 未対応データ検知 + 報告 ─────────────────────────────────
function _detectUnknown(roleInfo) {
  const unknown = { kongfu: [], xinfa: [], affix: [] };
  if (!roleInfo) return unknown;
  for (const kid of [roleInfo.kongfuMain, roleInfo.kongfuSub]) {
    if (kid && !window.WWM_KONGFU?.[kid]) unknown.kongfu.push(kid);
  }
  for (const xid of (roleInfo.passiveSlots || [])) {
    if (xid && !window.WWM_XINFA?.[xid]) unknown.xinfa.push(xid);
  }
  const seen = new Set();
  for (const eq of Object.values(roleInfo.wearEquipsDetailed || {})) {
    for (const aff of (eq?.exVo?.baseAffixes || [])) {
      const id = aff?.equipmentDetails?.[0];
      if (id && !seen.has(id)) {
        seen.add(id);
        if (!window.WWM_AFFIX?.[id]) unknown.affix.push(id);
      }
    }
  }
  return unknown;
}

function openUnknownReport() {
  const ri = window.__WWM_ROLEINFO;
  if (!ri) return;
  const u = _detectUnknown(ri);
  const total = u.kongfu.length + u.xinfa.length + u.affix.length;
  if (!total) { alert('未対応データなし'); return; }
  // 報告用 snippet 生成
  const lines = ['## 未対応 ID 報告', ''];
  if (u.kongfu.length) {
    lines.push('### 武術 (kongfu) ' + u.kongfu.length + '件');
    for (const id of u.kongfu) {
      const slot = ri.kongfuMain === id ? '主' : (ri.kongfuSub === id ? '副' : '');
      lines.push(`- ID: ${id} (${slot})`);
    }
    lines.push('');
  }
  if (u.xinfa.length) {
    lines.push('### 心法 (xinfa) ' + u.xinfa.length + '件');
    for (const id of u.xinfa) lines.push(`- ID: ${id}`);
    lines.push('');
  }
  if (u.affix.length) {
    lines.push('### 装備 affix ' + u.affix.length + '件');
    const valSample = {};
    for (const eq of Object.values(ri.wearEquipsDetailed || {})) {
      for (const aff of (eq?.exVo?.baseAffixes || [])) {
        const d = aff?.equipmentDetails;
        if (d && u.affix.includes(d[0]) && !valSample[d[0]]) valSample[d[0]] = d;
      }
    }
    for (const id of u.affix) {
      const v = valSample[id];
      lines.push(`- ID: ${id}` + (v ? ` (val=${v[1]}, rank=${v[3]})` : ''));
    }
    lines.push('');
  }
  lines.push('### キャラ情報');
  lines.push(`- Lv: ${ri.level}, school: ${ri.school}, kongfuMain: ${ri.kongfuMain}, kongfuSub: ${ri.kongfuSub}`);
  lines.push('');
  lines.push('### 補足情報 (画像/詳細などあれば追記)');
  lines.push('');
  const body = lines.join('\n');
  const githubUrl = 'https://github.com/Sh1get0ra/WWM-DMGCALC/issues/new?title=' +
    encodeURIComponent('[Data] 未対応ID報告 (kongfu/xinfa/affix)') +
    '&body=' + encodeURIComponent(body);

  // Modal表示
  const m = document.createElement('div');
  m.className = 'wwm-modal-backdrop';
  m.innerHTML = `
    <div class="wwm-modal">
      <div class="wwm-modal-header">
        <h2>未対応データ報告 (${total}件)</h2>
        <button class="wwm-modal-close" aria-label="Close">×</button>
      </div>
      <div class="wwm-modal-body">
        <p>以下の内容をクリップボードコピー or GitHub Issue で報告してください。</p>
        <textarea class="wwm-bm-code" readonly style="min-height:200px;">${body.replace(/</g,'&lt;')}</textarea>
        <div class="wwm-btn-row" style="margin-top:12px;">
          <button class="wwm-btn-primary" id="wwmCopyReport">クリップボードにコピー</button>
          <a class="wwm-btn-secondary" href="${githubUrl}" target="_blank" rel="noopener">GitHub Issue を開く</a>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(m);
  m.querySelector('.wwm-modal-close').addEventListener('click', () => m.remove());
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });
  m.querySelector('#wwmCopyReport').addEventListener('click', (e) => {
    const ta = m.querySelector('textarea');
    ta.select(); ta.setSelectionRange(0, 99999);
    let ok = false; try { ok = document.execCommand('copy'); } catch(_){}
    if (navigator.clipboard) navigator.clipboard.writeText(body).then(() => { e.target.textContent = 'コピー完了 ✓'; }).catch(()=>{});
    else if (ok) { e.target.textContent = 'コピー完了 ✓'; }
  });
}

window.WWMSidebar = {
  render: renderSidebar,
  refresh: () => _CURRENT_PARAMS && renderSidebar(_CURRENT_PARAMS),
  syncLayout: _syncLayoutVars,
  openUnknownReport
};
window.WWMGear = {
  render: renderGearGrid,
  openEdit: openGearEdit
};
window.WWMHero = {
  update: updateHero
};
