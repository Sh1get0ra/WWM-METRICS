// ── WWMetrics / Sidebar / Virtual State (Phase 3.9f 切出) ──
// 仮想装備 (Edit modal 適用結果) の merge / 永続化 / リセット を担当。
// WWMState.virtual.{gear, kongfu, xinfa, arsenal} を localStorage 'wwm_virtual_v1' に保存、
// _getEffectiveRoleInfo / _getEffectiveState で 元データに重ね合わせて参照。
// 依存:
//   - WWMState.roleInfo / WWMState.virtual.{gear, kongfu, xinfa, arsenal}
//   - WWMHelpers.storage.loadJSON
//   - window._refreshAll (sidebar.js 残部、 reset時に呼出)
// 公開 (後方互換 多数):
//   - window._getEffectiveRoleInfo / _getEffectiveState
//   - window.__WWM_GET_EFFECTIVE_ROLEINFO  (hero.js が参照)
//   - window._saveVirtuals / _loadVirtuals
//   - window.WWMHelp.resetAllVirtuals  (index.html onclick × 2)
//   - window.WWMSidebar.virtual = { getEffectiveRoleInfo, getEffectiveState, save, load, resetAll }
// 起動時 IIFE 末尾で _loadVirtuals() を即時実行 (旧 sidebar.js line 218 と同等)。
(function () {
  'use strict';

  const _VIRTUAL_KEY = 'wwm_virtual_v1';

  function _getEffectiveRoleInfo() {
    const orig = WWMState.roleInfo;
    if (!orig) return null;
    const vmap = WWMState.virtual.gear || {};
    const vkf = WWMState.virtual.kongfu || {};
    const vxi = WWMState.virtual.xinfa;
    const hasVxiPassive = vxi?.passive && vxi.passive.length;
    if (!Object.keys(vmap).length && !Object.keys(vkf).length && !hasVxiPassive) return orig;
    const merged = { ...orig, wearEquipsDetailed: { ...(orig.wearEquipsDetailed || {}) } };
    for (const [slot, vEq] of Object.entries(vmap)) {
      if (vEq) merged.wearEquipsDetailed[slot] = vEq;
    }
    if (vkf.kongfuMain) merged.kongfuMain = vkf.kongfuMain;
    if (vkf.kongfuSub) merged.kongfuSub = vkf.kongfuSub;
    // xinfa virtual (vxi は上で取得済)
    if (vxi?.passive) merged.passiveSlots = [...vxi.passive];
    return merged;
  }
  // effective state (xinfa tier virtual + arsenal virtual 込み)
  function _getEffectiveState() {
    const base = WWMHelpers.storage.loadJSON('wwm_last_state_v1');
    const vxi = WWMState.virtual.xinfa;
    const vAr = WWMState.virtual.arsenal;
    const hasVxi = vxi?.tiers && Object.keys(vxi.tiers).length;
    if (!hasVxi && !vAr) return base;
    const merged = JSON.parse(JSON.stringify(base || {}));
    if (hasVxi) {
      if (!merged.xinfaTiers) merged.xinfaTiers = {};
      for (const [k, v] of Object.entries(vxi.tiers)) {
        merged.xinfaTiers[k] = v;
        merged.xinfaTiers[String(k)] = v;
      }
    }
    if (vAr) merged.arsenal = JSON.parse(JSON.stringify(vAr));
    return merged;
  }
  function _saveVirtuals() {
    try {
      const data = {
        gear:    WWMState.virtual.gear || null,
        kongfu:  WWMState.virtual.kongfu || null,
        xinfa:   WWMState.virtual.xinfa || null,
        arsenal: WWMState.virtual.arsenal || null,
        qishu:   WWMState.virtual.qishu || null
      };
      const empty = (!data.gear || !Object.keys(data.gear).length)
                 && (!data.kongfu || !Object.keys(data.kongfu).length)
                 && (!data.xinfa || (!(data.xinfa.passive && data.xinfa.passive.length) && !Object.keys(data.xinfa.tiers || {}).length))
                 && (!data.arsenal)
                 && (!data.qishu || !data.qishu.some(Boolean));
      if (empty) localStorage.removeItem(_VIRTUAL_KEY);
      else localStorage.setItem(_VIRTUAL_KEY, JSON.stringify(data));
    } catch (_) {}
  }
  function _loadVirtuals() {
    try {
      const raw = localStorage.getItem(_VIRTUAL_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.gear)    WWMState.virtual.gear = d.gear;
      if (d.kongfu)  WWMState.virtual.kongfu = d.kongfu;
      if (d.xinfa)   WWMState.virtual.xinfa = d.xinfa;
      if (d.arsenal) WWMState.virtual.arsenal = d.arsenal;
      if (d.qishu)   WWMState.virtual.qishu = d.qishu;
    } catch (_) {}
  }
  function _resetAllVirtuals() {
    const hasV = (WWMState.virtual.gear && Object.keys(WWMState.virtual.gear).length)
              || (WWMState.virtual.kongfu && Object.keys(WWMState.virtual.kongfu).length)
              || (WWMState.virtual.xinfa && ((WWMState.virtual.xinfa.passive && WWMState.virtual.xinfa.passive.length) || Object.keys(WWMState.virtual.xinfa.tiers || {}).length))
              || WWMState.virtual.arsenal
              || (WWMState.virtual.qishu && WWMState.virtual.qishu.some(Boolean));
    if (!hasV) { alert('リセット対象なし'); return; }
    if (!confirm('新装備/心法/武術/武庫/奇術 全てを現装備値に戻す。よろしい?')) return;
    WWMState.virtual.gear = {};
    WWMState.virtual.kongfu = {};
    WWMState.virtual.xinfa = null;
    WWMState.virtual.arsenal = null;
    WWMState.virtual.qishu = null;
    try { localStorage.removeItem('wwm_virtual_v1'); } catch (_) {}
    if (typeof window._refreshAll === 'function') window._refreshAll();
  }

  // ── expose (後方互換 多数) ──
  window._getEffectiveRoleInfo = _getEffectiveRoleInfo;
  window._getEffectiveState    = _getEffectiveState;
  window.__WWM_GET_EFFECTIVE_ROLEINFO = _getEffectiveRoleInfo;
  window._saveVirtuals = _saveVirtuals;
  window._loadVirtuals = _loadVirtuals;
  window.WWMHelp = window.WWMHelp || {};
  window.WWMHelp.resetAllVirtuals = _resetAllVirtuals;
  window.WWMSidebar = window.WWMSidebar || {};
  window.WWMSidebar.virtual = {
    getEffectiveRoleInfo: _getEffectiveRoleInfo,
    getEffectiveState:    _getEffectiveState,
    save:    _saveVirtuals,
    load:    _loadVirtuals,
    resetAll: _resetAllVirtuals
  };

  // 起動時 1回: localStorage → WWMState.virtual に復元
  _loadVirtuals();
})();
