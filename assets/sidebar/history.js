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
  function _histRoleColor(roleId, roleList) {
    const idx = roleList.indexOf(roleId);
    return _HIST_COLORS[idx % _HIST_COLORS.length];
  }
  function render() {
    const root = document.getElementById('wwmHistory');
    if (!root) return;
    const T_ = window.T || {};
    const arr = _histLoad();
    if (!arr.length) {
      root.innerHTML = `<div class="wwm-analysis-card wwm-modal-square">
        <div class="wwm-modal-bg-icon" style="background-image:url('assets/icons/mountain-road.svg');"></div>
        <div class="wwm-analysis-header"><h3>${T_.martialHistoryTab || '武格履歴'}</h3></div>
        <div style="padding:24px;text-align:center;color:var(--paper-mute);font-size:13px;">${T_.historyEmpty || 'まだ履歴がありません。インポート時に自動記録されます。'}</div>
      </div>`;
      return;
    }
    // キャラ別グルーピング
    const byRole = {};
    arr.forEach(e => { (byRole[e.roleId] = byRole[e.roleId] || []).push(e); });
    const roleList = Object.keys(byRole);
    // 日付範囲
    const minTs = Math.min(...arr.map(e => e.ts));
    const maxTs = Math.max(...arr.map(e => e.ts));
    const tsRange = Math.max(1, maxTs - minTs);
    // Score 範囲
    const minScore = Math.min(...arr.map(e => e.statusScore));
    const maxScore = Math.max(...arr.map(e => e.statusScore));
    // padding for y-axis
    const scoreMin = Math.floor(minScore * 0.92 / 100) * 100;
    const scoreMax = Math.ceil(maxScore * 1.05 / 100) * 100;
    const scoreRange = Math.max(1, scoreMax - scoreMin);
    // SVG dimensions
    const W = 600, H = 240, PL = 50, PR = 16, PT = 12, PB = 28;
    const innerW = W - PL - PR, innerH = H - PT - PB;
    const xOf = ts => PL + ((ts - minTs) / tsRange) * innerW;
    const yOf = sc => PT + (1 - (sc - scoreMin) / scoreRange) * innerH;
    // Tier 境界水平線
    const wl = 14;
    const ssThr = 6700 * Math.pow(0.8, 14 - wl);
    const tierLines = [
      { v: ssThr,        l: 'SS', c: '#f0d28a' },
      { v: ssThr * 0.9,  l: 'S',  c: '#c9a45a' },
      { v: ssThr * 0.8,  l: 'A',  c: '#a8d4b4' },
      { v: ssThr * 0.6,  l: 'B',  c: '#7ec4cf' }
    ].filter(t => t.v >= scoreMin && t.v <= scoreMax);
    const tierSvg = tierLines.map(t => {
      const y = yOf(t.v).toFixed(1);
      return `<line x1="${PL}" y1="${y}" x2="${W - PR}" y2="${y}" stroke="${t.c}" stroke-opacity="0.25" stroke-dasharray="3,3"/>` +
             `<text x="${W - PR - 2}" y="${y}" dy="-2" text-anchor="end" font-size="9" fill="${t.c}" opacity="0.7">${t.l} ${Math.round(t.v)}</text>`;
    }).join('');
    // Y-axis labels (5 ticks)
    const yTicks = [];
    for (let i = 0; i <= 4; i++) {
      const v = scoreMin + (scoreRange * i / 4);
      const y = yOf(v).toFixed(1);
      yTicks.push(`<text x="${PL - 6}" y="${y}" dy="3" text-anchor="end" font-size="9" fill="var(--paper-mute)">${Math.round(v)}</text>`);
      yTicks.push(`<line x1="${PL - 3}" y1="${y}" x2="${PL}" y2="${y}" stroke="var(--ink-2)"/>`);
    }
    // X-axis labels (start/mid/end)
    const fmtDate = ts => { const d = new Date(ts); return (d.getMonth() + 1) + '/' + d.getDate(); };
    const xLabels = [0, 0.5, 1].map(r => {
      const ts = minTs + tsRange * r;
      const x = (PL + r * innerW).toFixed(1);
      return `<text x="${x}" y="${H - PB + 14}" text-anchor="middle" font-size="10" fill="var(--paper-mute)">${fmtDate(ts)}</text>`;
    }).join('');
    // 各キャラの polyline + dots
    let lines = '';
    roleList.forEach(rid => {
      const pts = byRole[rid].sort((a, b) => a.ts - b.ts);
      const color = _histRoleColor(rid, roleList);
      const polyPts = pts.map(e => `${xOf(e.ts).toFixed(1)},${yOf(e.statusScore).toFixed(1)}`).join(' ');
      lines += `<polyline points="${polyPts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      pts.forEach(e => {
        const cx = xOf(e.ts).toFixed(1), cy = yOf(e.statusScore).toFixed(1);
        const tip = `${e.roleName} Lv${e.level} | ${e.statusScore} ${e.tier} | ${e.date}`;
        lines += `<circle cx="${cx}" cy="${cy}" r="3.5" fill="${color}" stroke="#000" stroke-width="0.5"><title>${tip}</title></circle>`;
      });
    });
    // 凡例
    const legend = roleList.map(rid => {
      const last = byRole[rid][byRole[rid].length - 1];
      const color = _histRoleColor(rid, roleList);
      return `<span style="display:inline-flex;align-items:center;gap:6px;margin-right:14px;font-size:11px;color:var(--paper);"><span style="width:10px;height:3px;background:${color};display:inline-block;border-radius:2px;"></span>${last.roleName} (Lv${last.level})</span>`;
    }).join('');
    root.innerHTML = `
      <div class="wwm-analysis-card wwm-modal-square">
        <div class="wwm-modal-bg-icon" style="background-image:url('assets/icons/mountain-road.svg');"></div>
        <div class="wwm-analysis-header"><h3>${T_.martialHistoryTab || '武格履歴'}</h3></div>
        <div style="padding:8px 12px;">
          <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px;display:block;">
            <rect x="${PL}" y="${PT}" width="${innerW}" height="${innerH}" fill="rgba(0,0,0,0.15)" stroke="var(--ink-2)" stroke-width="0.5"/>
            ${tierSvg}
            ${yTicks.join('')}
            ${xLabels}
            ${lines}
          </svg>
          <div style="margin-top:8px;line-height:1.8;">${legend}</div>
        </div>
      </div>
    `;
  }

  window.WWMSidebar = window.WWMSidebar || {};
  window.WWMSidebar.history = { record, render };
})();
