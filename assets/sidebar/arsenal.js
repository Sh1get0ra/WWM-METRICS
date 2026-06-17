// ── WWM-METRICS Sidebar / 武庫編集 modal (Phase 3.8 切出) ────
// openArsenalEdit / window.WWMArsenal
(function () {
  'use strict';

  // sidebar.js / gear.js 内 (call時 lookup)
  const _scoreWithBonus       = (ri) => window.__WWM_SCORE_WITH_BONUS(ri);
  const _getEffectiveRoleInfo = () => (typeof window._getEffectiveRoleInfo === 'function' ? window._getEffectiveRoleInfo() : null);
  const _getEffectiveState    = () => (typeof window._getEffectiveState === 'function' ? window._getEffectiveState() : null);

  function openArsenalEdit() {
    const T_ = window.T || {};
    const state = WWMHelpers.storage.loadJSON('wwm_last_state_v1');
    const origArsenal = state?.arsenal || { path: 'phys', tiers: {} };
    const virtArsenal = WWMState.virtual.arsenal;
    // 新側 初期値 = virtual あれば virtual、なければ orig コピー
    const newArsenal = virtArsenal
      ? JSON.parse(JSON.stringify(virtArsenal))
      : JSON.parse(JSON.stringify(origArsenal));
    const PATHS = [
      { key: 'phys',       labelKey: 'pathPhys',       minStat: 'minPhys',       maxStat: 'maxPhys' },
      { key: 'bellstrike', labelKey: 'pathBellstrike', minStat: 'minBellstrike', maxStat: 'maxBellstrike' },
      { key: 'stonesplit', labelKey: 'pathStonesplit', minStat: 'minStonesplit', maxStat: 'maxStonesplit' },
      { key: 'silkbind',   labelKey: 'pathSilkbind',   minStat: 'minSilkbind',   maxStat: 'maxSilkbind' },
      { key: 'bamboocut',  labelKey: 'pathBamboocut',  minStat: 'minBamboocut',  maxStat: 'maxBamboocut' }
    ];
    const TIERS = [86, 81, 71, 61, 56, 51, 41];
    const TIER_PRESET = { 41: { min: 12, max: 25 }, default: { min: 17, max: 34 } };
    const SL = window._AFFIX_DISPLAY_LABELS || {};
    const statLabels = (pk) => {
      const p = PATHS.find(x => x.key === pk) || PATHS[0];
      return { min: SL[p.minStat] || p.minStat, max: SL[p.maxStat] || p.maxStat };
    };
    const pathLabel = (k) => {
      const p = PATHS.find(x => x.key === k);
      return p ? ((window.T && window.T[p.labelKey]) || p.key) : k;
    };
    const m = document.createElement('div');
    m.className = 'wwm-modal-backdrop';
    function _curRows(ars) {
      const sL = statLabels(ars.path);
      return TIERS.map(lv => {
        const t = ars.tiers?.[lv];
        const peaked = !!t?.peaked;
        const preset = lv === 41 ? TIER_PRESET[41] : TIER_PRESET.default;
        const minV = t?.min ?? preset.min;
        const maxV = t?.max ?? preset.max;
        const valTxt = peaked
          ? `<span>${(window.T?.importArsenalPeaked)||'頂点'} ✓</span> <span style="font-size:11px;">${sL.min}+${minV} ${sL.max}+${maxV}</span>`
          : `<span style="color:var(--kami-fg-dim);">${(window.T?.arsenalNotPeaked)||'未突破'}</span> <span style="font-size:11px;">${sL.min}+${minV} ${sL.max}+${maxV}</span>`;
        return `<div class="wwm-cmp-row" style="grid-template-columns:50px 1fr;align-items:center;"><span style="font-family:var(--f-latin);font-weight:700;">Lv${lv}</span><span>${valTxt}</span></div>`;
      }).join('');
    }
    function _newRows(ars) {
      const sL = statLabels(ars.path);
      return TIERS.map(lv => {
        const t = ars.tiers?.[lv] || {};
        const peaked = !!t.peaked;
        const preset = lv === 41 ? TIER_PRESET[41] : TIER_PRESET.default;
        const minV = t.min ?? preset.min;
        const maxV = t.max ?? preset.max;
        const inputArea = peaked
          ? `<span style="font-size:11px;white-space:nowrap;">${sL.min}+${minV} ${sL.max}+${maxV}</span>`
          : `<span style="display:inline-flex;gap:4px;font-size:11px;align-items:center;flex-wrap:nowrap;white-space:nowrap;">
               <span>${sL.min}</span><input type="number" class="wwm-num-input" data-tier-min="${lv}" min="0" max="${preset.min}" step="1" value="${minV}" style="width:42px;height:20px;padding:0 4px;">
               <span>${sL.max}</span><input type="number" class="wwm-num-input" data-tier-max="${lv}" min="0" max="${preset.max}" step="1" value="${maxV}" style="width:42px;height:20px;padding:0 4px;">
             </span>`;
        return `<div class="wwm-cmp-row" style="grid-template-columns:50px 1fr;align-items:center;"><span style="font-family:var(--f-latin);font-weight:700;">Lv${lv}</span>
          <span style="display:flex;align-items:center;gap:10px;flex-wrap:nowrap;white-space:nowrap;">
            <label style="display:inline-flex;align-items:center;gap:4px;cursor:pointer;white-space:nowrap;"><span>${(window.T?.importArsenalPeaked)||'頂点'}</span> <input type="checkbox" data-tier="${lv}" ${peaked?'checked':''}></label>
            ${inputArea}
          </span>
        </div>`;
      }).join('');
    }
    function _pathRadios(curKey) {
      const opts = PATHS.map(p => `<option value="${p.key}" ${p.key===curKey?'selected':''}>${pathLabel(p.key)}</option>`).join('');
      return `<select id="wwmArsenalEditPathSel" class="wwm-cmp-set-select" name="wwmArsenalEditPath">${opts}</select>`;
    }
    m.innerHTML = `
      <div class="wwm-modal wwm-modal-square wwm-cmp-modal-a wwm-arsenal-modal">
        <span class="wwm-cmp-l-bracket-tl"></span><span class="wwm-cmp-l-bracket-tr"></span>
        <span class="wwm-cmp-l-bracket-bl"></span><span class="wwm-cmp-l-bracket-br"></span>
        <div class="wwm-modal-header">
          <h2><span class="wwm-cmp-title-ja" data-i18n="cmpArsenalTitle" data-kaisho="cmpArsenalTitle">${(window.T?.cmpArsenalTitle)||'武庫対照'}</span><span class="wwm-cmp-title-en">COMPARISON</span><span class="wwm-cmp-seal">庫</span></h2>
          <button class="wwm-modal-close" aria-label="Close">×</button>
        </div>
        <div class="wwm-modal-body wwm-ws-paper">
          <div class="wwm-cmp-modal-bg-icon wwm-cmp-modal-bg-icon-gear wwm-cmp-modal-bg-icon-arsenal" style="background-image:url('https://www.wherewindsmeetgame.com/pc/qt/20251203102905/data/kongfu/images/673361fe92bef95db34510429KLQLykS05.png');"></div>
          <div class="wwm-cmp-grid">
            <div class="wwm-cmp-col wwm-cmp-current">
              <h3 class="wwm-cmp-title" data-seal="${(window.T?.cmpCurrent)||'現有'}"><span class="wwm-cmp-title-text">${(window.T?.cmpCurrent)||'現有'}</span></h3>
              <div class="wwm-cmp-kongfu-header">${pathLabel(origArsenal.path)}</div>
              <div class="wwm-cmp-rows">${_curRows(origArsenal)}</div>
            </div>
            <div class="wwm-cmp-divider"></div>
            <div class="wwm-cmp-col wwm-cmp-new">
              <h3 class="wwm-cmp-title" data-seal="${(window.T?.cmpNew)||'新置'}"><span class="wwm-cmp-title-text">${(window.T?.cmpNew)||'新置'}</span></h3>
              <div class="wwm-cmp-kongfu-header" id="wwmArsenalEditPaths" style="display:flex;flex-wrap:nowrap;gap:6px;justify-content:space-between;">${_pathRadios(newArsenal.path)}</div>
              <div class="wwm-cmp-rows" id="wwmArsenalEditRows">${_newRows(newArsenal)}</div>
            </div>
          </div>
        </div>
        <!-- footer = body (紙) の外 = 墨帯 (modal 二層化 2026-06-12) -->
        <div class="wwm-cmp-footer-a">
          <div class="wwm-cmp-stat-row">
            <span class="wwm-cmp-delta-label">${(window.T&&T.martialIndex)||'武格指数'}</span>
            <span class="wwm-cmp-delta-total" id="wwmArsenalEditTotal"></span>
          </div>
          <div class="wwm-cmp-stat-row">
            <div class="wwm-cmp-quality-block">
              <span class="wwm-cmp-delta-label">${(window.T&&T.slotQuality)||'火力品質'}</span>
              <span class="wwm-cmp-delta-total" id="wwmArsenalEditBase"></span>
            </div>
            <div class="wwm-btn-row wwm-cmp-btn-row">
              <button class="wwm-btn-primary" id="wwmArsenalEditApply">採用</button>
              <button class="wwm-btn-secondary" id="wwmArsenalEditReset">復元</button>
              <button class="wwm-btn-secondary" id="wwmArsenalEditCancel">離脱</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(m);
    const close = () => m.remove();
    m.querySelector('.wwm-modal-close').addEventListener('click', close);
    m.querySelector('#wwmArsenalEditCancel').addEventListener('click', close);
    function _rerenderNew() {
      const rowsEl = m.querySelector('#wwmArsenalEditRows');
      if (rowsEl) rowsEl.innerHTML = _newRows(newArsenal);
      bindRowEvents();
      _schedulePreview();
    }
    m.querySelectorAll('[name="wwmArsenalEditPath"]').forEach(r => {
      r.addEventListener('change', () => {
        newArsenal.path = r.value;
        _rerenderNew();
      });
    });
    function bindRowEvents() {
      m.querySelectorAll('#wwmArsenalEditRows input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
          const lv = parseInt(cb.dataset.tier, 10);
          if (!newArsenal.tiers) newArsenal.tiers = {};
          const preset = lv === 41 ? TIER_PRESET[41] : TIER_PRESET.default;
          if (!newArsenal.tiers[lv]) newArsenal.tiers[lv] = { peaked: false, min: preset.min, max: preset.max };
          newArsenal.tiers[lv].peaked = cb.checked;
          _rerenderNew();
        });
      });
      m.querySelectorAll('#wwmArsenalEditRows input[data-tier-min]').forEach(inp => {
        inp.addEventListener('input', () => {
          const lv = parseInt(inp.dataset.tierMin, 10);
          let v = parseInt(inp.value, 10);
          const preset = lv === 41 ? TIER_PRESET[41] : TIER_PRESET.default;
          if (isNaN(v)) v = 0;
          if (v > preset.min) { v = preset.min; inp.value = preset.min; }
          if (v < 0) { v = 0; inp.value = 0; }
          if (!newArsenal.tiers) newArsenal.tiers = {};
          if (!newArsenal.tiers[lv]) newArsenal.tiers[lv] = { peaked: false, min: 0, max: 0 };
          newArsenal.tiers[lv].min = v;
          _schedulePreview();
        });
      });
      m.querySelectorAll('#wwmArsenalEditRows input[data-tier-max]').forEach(inp => {
        inp.addEventListener('input', () => {
          const lv = parseInt(inp.dataset.tierMax, 10);
          let v = parseInt(inp.value, 10);
          const preset = lv === 41 ? TIER_PRESET[41] : TIER_PRESET.default;
          if (isNaN(v)) v = 0;
          if (v > preset.max) { v = preset.max; inp.value = preset.max; }
          if (v < 0) { v = 0; inp.value = 0; }
          if (!newArsenal.tiers) newArsenal.tiers = {};
          if (!newArsenal.tiers[lv]) newArsenal.tiers[lv] = { peaked: false, min: 0, max: 0 };
          newArsenal.tiers[lv].max = v;
          _schedulePreview();
        });
      });
    }
    bindRowEvents();
    let previewTimer = null;
    let _origArsContribCache = null; // modal open 時 effective ri + state での武庫寄与 (LOO)
    const _openTimeRi = _getEffectiveRoleInfo() || WWMState.roleInfo;
    const _openTimeState = _getEffectiveState() || WWMHelpers.storage.loadJSON('wwm_last_state_v1') || {};
    async function _schedulePreview() {
      clearTimeout(previewTimer);
      previewTimer = setTimeout(_runPreview, 150);
    }
    async function _runPreview() {
      const baseRi = _getEffectiveRoleInfo() || WWMState.roleInfo;
      if (!baseRi || !window.WWMStats?.buildStatParams) return;
      const baseState = _getEffectiveState() || WWMHelpers.storage.loadJSON('wwm_last_state_v1');
      try {
        // baseline 武庫寄与 = isModified (virtual.arsenal あり) なら origRi+origState (累積 Δ)、 でなければ open 時 snapshot
        if (_origArsContribCache == null) {
          const isModified = !!WWMState.virtual.arsenal;
          const baseRiForCache = isModified ? WWMState.roleInfo : _openTimeRi;
          const baseStForCache = isModified ? (WWMHelpers.storage.loadJSON('wwm_last_state_v1') || {}) : _openTimeState;
          const oP1 = await window.WWMStats.buildStatParams(baseRiForCache, baseStForCache);
          window.computeExpected(oP1);
          const oBase = _scoreWithBonus(baseRiForCache);
          const oStNoArs = JSON.parse(JSON.stringify(baseStForCache));
          if (oStNoArs.arsenal) oStNoArs.arsenal = { path: oStNoArs.arsenal.path, tiers: {} }; else oStNoArs.arsenal = null;
          const oP2 = await window.WWMStats.buildStatParams(baseRiForCache, oStNoArs);
          window.computeExpected(oP2);
          const oNoArs = _scoreWithBonus(baseRiForCache);
          _origArsContribCache = Math.round(oBase - oNoArs);
        }
        // 試作 武庫寄与: baseRi + newArsenal state (arsenal=new) vs (arsenal=null)
        const newState = JSON.parse(JSON.stringify(baseState || {}));
        newState.arsenal = newArsenal;
        const p1 = await window.WWMStats.buildStatParams(baseRi, newState);
        window.computeExpected(p1);
        const totalCur = Math.round(_scoreWithBonus(baseRi));
        const noArsSt = JSON.parse(JSON.stringify(newState));
        noArsSt.arsenal = null;
        const p2 = await window.WWMStats.buildStatParams(baseRi, noArsSt);
        window.computeExpected(p2);
        const noArsScore = _scoreWithBonus(baseRi);
        const vSlot = Math.round(totalCur - noArsScore);
        // 装備品質 % (武庫 LOO / MAX LOO × 0.95 × 100)
        const maxLoo = (WWMState.opt.slotMaxLoo || {})['arsenal'];
        const _q = (l, m) => (!m || m <= 0) ? null : Math.round(l / m * 100);
        const basePct = _q(_origArsContribCache, maxLoo);
        const curPct = _q(vSlot, maxLoo);
        const dPct = (basePct != null && curPct != null) ? (curPct - basePct) : null;
        const totalBase = Math.round(WWMState.baseline?.statusScore ?? 0);
        const pf = await window.WWMStats.buildStatParams(baseRi, newState);
        window.computeExpected(pf);
        const baseEl = m.querySelector('#wwmArsenalEditBase');
        const _ARR = '<span class="wwm-cmp-arrow">▶</span>';
        if (baseEl) {
          if (basePct != null && curPct != null) baseEl.innerHTML = `${basePct}%${_ARR}${curPct}%`;
          else baseEl.textContent = _origArsContribCache.toLocaleString();
        }
        const totEl = m.querySelector('#wwmArsenalEditTotal');
        if (totEl) totEl.innerHTML = `${totalBase.toLocaleString()}${_ARR}${totalCur.toLocaleString()}`;
      } catch(e) { console.error('[ArsPreview]', e); }
    }
    _schedulePreview();
    m.querySelector('#wwmArsenalEditApply').addEventListener('click', () => {
      WWMState.virtual.arsenal = newArsenal;
      if (typeof window._saveVirtuals === 'function') window._saveVirtuals();
      close();
      if (typeof window._refreshAll === 'function') window._refreshAll();
    });
    m.querySelector('#wwmArsenalEditReset').addEventListener('click', () => {
      WWMState.virtual.arsenal = null;
      if (typeof window._saveVirtuals === 'function') window._saveVirtuals();
      close();
      if (typeof window._refreshAll === 'function') window._refreshAll();
    });
  }

  // ── expose ───────────────────────────────────────────────
  window.WWMSidebar = window.WWMSidebar || {};
  window.WWMSidebar.arsenal = { openEdit: openArsenalEdit };
})();
