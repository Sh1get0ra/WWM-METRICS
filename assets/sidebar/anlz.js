// ── WWM-METRICS Sidebar / Analysis tab render (Phase 3.2 切出) ─
// 分析タブ render: _loadConfig / _curLang / _label / _fmt / _fmtItem /
//                  _renderItem / _renderSection / renderSidebar / detectUnknown
(function () {
  'use strict';

  // ── 内部 state ───────────────────────────────────────────
  let _STAT_CONFIG = null;
  let _currentParams = null;

  async function _loadConfig() {
    if (_STAT_CONFIG) return _STAT_CONFIG;
    try {
      _STAT_CONFIG = await fetch('data/stat_display.json?v=' + (window.WWM_DISPLAY_VERSION || 10)).then(r => r.json());
    } catch (e) {}
    return _STAT_CONFIG;
  }

  function curLang() { return (window.currentLang) || 'ja'; }

  function _label(labelObj, fallback) {
    if (!labelObj) return fallback || '';
    const lang = curLang();
    return labelObj[lang] || labelObj.ja || labelObj.en || fallback || '';
  }

  // path系 attack subItem (鋼鳴攻撃力 等) は DataStore 合成を優先源とする (json label はフォールバック)。
  // subItem key (voidAtk) → path.pathBase key (void) のマップ。
  const _PATH_SUBITEM_TO_BASE = {
    bellstrike: 'bellstrike', stonesplit: 'stonesplit', silkbind: 'silkbind',
    bamboocut: 'bamboocut', voidAtk: 'void'
  };
  function _synthStatLabel(key) {
    const base = _PATH_SUBITEM_TO_BASE[key];
    if (!base) return null;
    if (!window.WWM_DS) return null;
    const v = window.WWM_DS.name('path-statdisplay', base, curLang());
    if (v && v.indexOf('[path-statdisplay:') !== 0) return v;
    return null;
  }

  function _fmt(val, format) {
    if (val == null || isNaN(val)) return '-';
    if (format === 'pct') return (val * 100).toFixed(1) + '%';
    if (format === 'float') return val.toFixed(1);
    return Math.round(val).toLocaleString();
  }

  function _fmtItemValue(item, params) {
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

  // baseline と current で値違えば "baseline ▶ current" 表示
  // (OBS Share view = wwm-view-sidebar 時は baseline (現在装備) のみ表示)
  function _fmtItem(item, params, baseParams) {
    const cur = _fmtItemValue(item, params);
    if (!baseParams || baseParams === params) return cur;
    const base = _fmtItemValue(item, baseParams);
    if (base === cur) return cur;
    if (document.documentElement.classList.contains('wwm-view-sidebar')) {
      return base; // OBS view: 現在装備の値だけ
    }
    return `<span class="wwm-sb-baseline">${base}</span> <span class="wwm-sb-arrow">▶</span> ${cur}`;
  }

  function _renderItem(item, params, depth, baseParams) {
    depth = depth || 0;
    const cls = depth > 0 ? ' wwm-sb-sub' : '';
    // hiddenStat: ゲーム実機で見えない内部値 (例 critRateBoosted) → 色差別化
    const hiddenCls = item.hiddenStat ? ' wwm-sb-hidden-stat' : '';
    // cap未到達 / 無駄属性ATK 警告
    const cw = params?._capWarnings?.[item.key];
    const ww = params?._wasteWarnings?.[item.key];
    let warnIcon = '';
    if (cw) warnIcon = ` <span class="wwm-sb-warn" title="${(window.T && window.T.tipCapNotReached) || 'cap未到達'}: ${cw.current}/${cw.threshold}">⚠</span>`;
    else if (ww != null) {
      const wTitle = typeof ww === 'string' ? ww : `active path以外の属性ATK (合計 ${ww})`;
      warnIcon = ` <span class="wwm-sb-warn" title="${wTitle}">⚠</span>`;
    }
    let html = `
      <div class="wwm-sb-row${cls}${hiddenCls}" data-item-key="${item.key}">
        <span class="wwm-sb-label">${_synthStatLabel(item.key) || _label(item.label, item.key)}${warnIcon}</span>
        <span class="wwm-sb-value">${_fmtItem(item, params, baseParams)}</span>
      </div>
    `;
    if (item.expandable && item.subItems) {
      html += `<div class="wwm-sb-sub-group wwm-sb-collapsed" data-parent="${item.key}">`;
      for (const sub of item.subItems) html += _renderItem(sub, params, depth + 1, baseParams);
      html += `</div>`;
    }
    return html;
  }

  const _COLLAPSE_KEY = 'wwm_sidebar_collapsed_v1';
  function _getCollapsedSet() {
    return new Set(WWMHelpers.storage.loadJSON(_COLLAPSE_KEY, []));
  }
  function _saveCollapsed(set) {
    try { localStorage.setItem(_COLLAPSE_KEY, JSON.stringify([...set])); } catch (e) {}
  }

  function _renderSection(section, params, collapsedSet, baseParams) {
    const items = section.items.map(it => _renderItem(it, params, 0, baseParams)).join('');
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

  // ── 未対応データ検知 ─────────────────────────────────────
  function detectUnknown(roleInfo) {
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

  async function renderSidebar(params) {
    const cfg = await _loadConfig();
    if (!cfg) return;
    const root = document.getElementById('wwmSidebar');
    if (!root) return;
    _currentParams = params;
    // 総合武力 = roleInfo.xiuWeiKungFu (現在値)
    let totalMartial = '-';
    const ri = WWMState.roleInfo;
    if (ri?.xiuWeiKungFu) totalMartial = ri.xiuWeiKungFu.toLocaleString();
    else if (ri?.maxXiuWeiKungFu) totalMartial = ri.maxXiuWeiKungFu.toLocaleString();
    const _avSrc = ri?._avatarBase64 || ri?._avatarUrl || (ri?.roleAvatar && window.WWM_AVATAR_ICONS?.[ri.roleAvatar]) || '';
    const avatar = _avSrc ? `<img class="wwm-sb-avatar" src="${_avSrc}" alt="avatar">` : '';
    const charName = ri?.roleName ? `${ri.roleName} <span class="wwm-muted">Lv${ri.level || '?'}</span>` : '';
    const titleLabel = _label(cfg.header?.title, '総合武力');
    // 再render時に score が "-" に消えないよう baseline から直接埋め込む (updateHero タイミング非依存)
    const _bl = WWMState.baseline;
    const martialScoreStr = (_bl && typeof _bl.statusScore === 'number') ? Math.round(_bl.statusScore).toLocaleString() : '-';
    // tier は __WWM_OPT_BEST 確定後に updateHero で再評価 (opt未完了時 空)。初期 render は空にしておく。
    const martialTier = '';
    const header = `
      <div class="wwm-sb-mini-hero-card">
        <span class="wwm-sb-l-bl"></span><span class="wwm-sb-l-br"></span>
        <div class="wwm-sb-mini-hero-ink"></div>
        <div class="wwm-sb-top">
          ${avatar}
          <div class="wwm-sb-info">
            ${charName ? `<div class="wwm-sb-charname">${charName}</div>` : ''}
            <div class="wwm-sb-totalmartial"><span class="wwm-muted">${titleLabel}</span> <b>${totalMartial}</b></div>
            <div class="wwm-sb-martial"><span class="wwm-muted">${(window.T && T.martialIndex) || '武格指数'}</span> <b id="wwmSbMartialScore">${martialScoreStr}</b> <span class="wwm-sb-tier-badge tier-${martialTier}" id="wwmSbTierBadge">${martialTier}</span></div>
          </div>
        </div>
      </div>
    `;
    const collapsedSet = _getCollapsedSet();
    // baseline params (original roleInfo) — virtual ある時のみ算出
    const hasVirtual = (WWMState.virtual.gear && Object.keys(WWMState.virtual.gear).length) ||
                       (WWMState.virtual.kongfu && Object.keys(WWMState.virtual.kongfu).length);
    let baseParams = null;
    if (hasVirtual && ri && window.WWMStats?.buildStatParams) {
      try {
        const state = WWMHelpers.storage.loadJSON('wwm_last_state_v1');
        baseParams = await window.WWMStats.buildStatParams(ri, state);
      } catch (e) {}
    }
    const sections = params
      ? (cfg.sections || []).map(s => _renderSection(s, params, collapsedSet, baseParams)).join('')
      : `<div class="wwm-sb-empty">
           <p class="wwm-muted" style="text-align:center;padding:24px 12px;">
             ${(window.T?.sbEmptyTitle) || 'まだインポートデータがありません。'}<br>
             ${(window.T?.sbEmptyHint) || '上部「IMPORT」ボタンから取り込みできます。'}
           </p>
         </div>`;
    // 未対応データ notice
    let noticeHtml = '';
    if (ri) {
      const u = detectUnknown(ri);
      const total = u.kongfu.length + u.xinfa.length + u.affix.length;
      if (total) {
        const noticeLabel = ((window.T && T.unknownNotice) || '⚠ 未対応データ {0}件 (click 報告)').replace('{0}', total);
        noticeHtml = `
          <div class="wwm-sb-notice" onclick="WWMSidebar.openUnknownReport()">
            ${noticeLabel}
          </div>
        `;
      }
    }
    root.innerHTML = header + `<div class="wwm-sb-rest">${sections}${noticeHtml}</div>`;
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

  // ── expose ───────────────────────────────────────────────
  window.WWMSidebar = window.WWMSidebar || {};
  window.WWMSidebar.anlz = {
    render: renderSidebar,
    getCurrentParams: () => _currentParams,
    setCurrentParams: (p) => { _currentParams = p; },
    curLang,
    fmt: _fmt,
    label: _label,
    detectUnknown,
    loadConfig: _loadConfig,
  };
})();
