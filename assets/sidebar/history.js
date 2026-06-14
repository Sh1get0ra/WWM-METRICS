// ── WWM-METRICS / Sidebar / History (Phase 3.9c 切出) ──
// 武格履歴 (Martial Record): import毎にスコア記録、 SVG線グラフでキャラ別推移表示。
// 依存:
//   - WWMHelpers.storage.loadJSON
//   - window.T (i18n)
//   - localStorage 'wwm_score_history_v1'
// 公開:
//   - window.WWMSidebar.history = { record, render }
//   呼出: import.js / index.html タブ切替 (history タブ render trigger)
(function () {
  'use strict';

  const _HIST_KEY = 'wwm_score_history_v1';
  const _HIST_MAX = 365;
  const _HIST_COLORS = ['#c9a45a', '#a8d4b4', '#e8a87c', '#7ec4cf', '#d4a5d0', '#f0d28a', '#c8786b', '#b8d09c'];
  // ── XSS 防止 ─────────────────────────────────────────────
  const _ESC_MAP = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' };
  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => _ESC_MAP[c]); }
  const _ROLE_KEY = 'wwm_hist_role_v1';
  const _RANGE_KEY = 'wwm_hist_range_v1';
  const _RANGES = { '7d': 7*24*3600*1000, '30d': 30*24*3600*1000, 'all': null };

  function _histLoad() {
    return WWMHelpers.storage.loadJSON(_HIST_KEY, []);
  }
  function _histSave(arr) {
    try { localStorage.setItem(_HIST_KEY, JSON.stringify(arr)); } catch (_) {}
  }
  function record(data, scoreInfo) {
    if (!data || !scoreInfo || typeof scoreInfo.statusScore !== 'number') return;
    const d = new Date();
    const date = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const roleId = String(data.uid || data.roleId || data.roleName || '?') + '|' + String(data.roleName || '');
    const entry = {
      ts: Date.now(),
      date,
      roleId,
      roleName: data.roleName || '?',
      level: data.level || 0,
      kongfuMain: data.kongfuMain || 0,
      statusScore: Math.round(scoreInfo.statusScore),
      expected: Math.round(scoreInfo.expected || 0),
      tier: scoreInfo.tier || ''
    };
    let arr = _histLoad();
    // 同日同キャラあれば 高い方で上書き
    const existIdx = arr.findIndex(e => e.date === date && e.roleId === roleId);
    if (existIdx >= 0) {
      if (entry.statusScore > arr[existIdx].statusScore) arr[existIdx] = entry;
      else return; // 既存の方が高い → skip
    } else {
      arr.push(entry);
    }
    // 件数制限 (古い順 drop)
    arr.sort((a, b) => a.ts - b.ts);
    if (arr.length > _HIST_MAX) arr = arr.slice(arr.length - _HIST_MAX);
    _histSave(arr);
  }
  function _loadRole() {
    try { return localStorage.getItem(_ROLE_KEY) || null; } catch (_) { return null; }
  }
  function _saveRole(v) { try { localStorage.setItem(_ROLE_KEY, v); } catch (_) {} }
  function _loadRange() {
    try { return localStorage.getItem(_RANGE_KEY) || 'all'; } catch (_) { return 'all'; }
  }
  function _saveRange(v) { try { localStorage.setItem(_RANGE_KEY, v); } catch (_) {} }

  function _pickActiveRole(arr, byRole) {
    const saved = _loadRole();
    if (saved && byRole[saved]) return saved;
    // default = 最後 import の roleId
    let latest = null, latestTs = -1;
    arr.forEach(e => { if (e.ts > latestTs) { latestTs = e.ts; latest = e.roleId; } });
    return latest;
  }
  function _firstTierReachIdx(entries) {
    // entries = ts 昇順、 SS/S/A の初到達 entry index を { SS, S, A } で返す
    const out = {};
    entries.forEach((e, i) => {
      const t = e.tier;
      if ((t === 'SS' || t === 'S' || t === 'A') && out[t] === undefined) out[t] = i;
    });
    return out;
  }
  function _pbEntry(entries) {
    // entries 配列の中で statusScore 最大の entry を返す (同点 = 最古)
    let best = null;
    entries.forEach(e => { if (!best || e.statusScore > best.statusScore) best = e; });
    return best;
  }

  function _histRoleColor(roleId, roleList) {
    const idx = roleList.indexOf(roleId);
    return _HIST_COLORS[idx % _HIST_COLORS.length];
  }
  function render() {
    const root = document.getElementById('wwmHistory');
    if (!root) return;
    const T_ = window.T || {};
    const arr = _histLoad();

    // 履歴空 = empty hint だけ
    if (!arr.length) {
      root.innerHTML = `<section class="wwm-hist-panel">
        <header class="wwm-hist-head">
          <h3 class="wwm-hist-title sec-title" data-kaisho data-kaisho-fixed data-i18n="martialHistoryTab">${_esc(T_.martialHistoryTab || '武格履歴')}</h3>
        </header>
        <div class="wwm-hist-empty">${_esc(T_.historyEmpty || 'まだ履歴がありません。')}</div>
      </section>`;
      return;
    }

    // キャラ別グルーピング (ts 昇順)
    const byRole = {};
    arr.forEach(e => { (byRole[e.roleId] = byRole[e.roleId] || []).push(e); });
    Object.keys(byRole).forEach(rid => byRole[rid].sort((a,b) => a.ts - b.ts));
    const roleList = Object.keys(byRole);

    // active キャラ確定
    const activeRole = _pickActiveRole(arr, byRole);
    const activeEntries = byRole[activeRole] || [];

    // 全期間 PB (期間切替に影響されない)
    const pb = _pbEntry(activeEntries);

    // 期間切替
    const range = _loadRange();
    const now = Date.now();
    const rangeMs = _RANGES[range];
    const filteredEntries = rangeMs ? activeEntries.filter(e => (now - e.ts) <= rangeMs) : activeEntries.slice();

    // ── PB chip ──
    const pbHtml = pb ? `
      <div class="wwm-hist-pb">
        <span class="wwm-hist-pb-label">${_esc(T_.historyPbLabel || 'PB')}</span>
        <span class="wwm-hist-pb-score">${pb.statusScore.toLocaleString()}</span>
        ${pb.tier ? `<span class="wwm-hist-pb-tier tier-${_esc(pb.tier)}">${_esc(pb.tier)}</span>` : ''}
        <span class="wwm-hist-pb-sub">${_esc(pb.date)} / Lv ${pb.level} / ${_esc(pb.roleName)}</span>
      </div>` : '';

    // ── キャラ chip 行 (単一キャラ = 非表示) + 期間 tab ──
    const roleChipsHtml = roleList.length > 1 ? roleList.map(rid => {
      const name = byRole[rid][byRole[rid].length - 1].roleName;
      const on = rid === activeRole ? 'true' : 'false';
      return `<button class="wwm-hist-chip" data-hist-role="${_esc(rid)}" aria-pressed="${on}">${_esc(name)}</button>`;
    }).join('') : '';
    const rangeChipsHtml = ['all','30d','7d'].map(r => {
      const label = T_['historyRange' + (r === 'all' ? 'All' : r === '30d' ? '30d' : '7d')] || r;
      const on = r === range ? 'true' : 'false';
      return `<button class="wwm-hist-chip" data-hist-range="${r}" aria-pressed="${on}">${_esc(label)}</button>`;
    }).join('');
    const chipsHtml = `
      <div class="wwm-hist-chips">
        ${roleChipsHtml}
        <div class="wwm-hist-range">${rangeChipsHtml}</div>
      </div>`;

    // ── chart (Task 4 で実装、 ここでは container + empty hint 分岐) ──
    const chartHtml = filteredEntries.length
      ? `<div class="wwm-hist-chart">${_renderChartSvg(filteredEntries, pb)}</div>`
      : `<div class="wwm-hist-empty">${_esc(T_.historyEmptyInRange || 'この期間に記録なし')}</div>`;

    root.innerHTML = `
      <section class="wwm-hist-panel">
        <header class="wwm-hist-head">
          <h3 class="wwm-hist-title sec-title" data-kaisho data-kaisho-fixed data-i18n="martialHistoryTab">${_esc(T_.martialHistoryTab || '武格履歴')}</h3>
        </header>
        ${pbHtml}
        ${chipsHtml}
        ${chartHtml}
      </section>`;

    // chip 切替 handler
    root.querySelectorAll('[data-hist-role]').forEach(btn => {
      btn.addEventListener('click', () => { _saveRole(btn.dataset.histRole); render(); });
    });
    root.querySelectorAll('[data-hist-range]').forEach(btn => {
      btn.addEventListener('click', () => { _saveRange(btn.dataset.histRange); render(); });
    });

    // 楷書 SVG 適用 (martialHistoryTab が UI_KEYS 未含なら無効、 通常テキスト fallback)
    if (window.WWMKaisho && window.WWMKaisho.apply) window.WWMKaisho.apply();
  }

  // chart 実装は Task 4 で置換、 暫定スタブ
  function _renderChartSvg(entries, pb) {
    return '<svg viewBox="0 0 600 240" preserveAspectRatio="none" style="height:240px;"></svg>';
  }

  window.WWMSidebar = window.WWMSidebar || {};
  window.WWMSidebar.history = { record, render };
})();
