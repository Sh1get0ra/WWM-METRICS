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
  function _scoreBreakthroughs(entries) {
    // 千刻み (1000/2000/...) 突破 entry を昇順返却。 前回 max を上回る最大 k のみ 1 旗
    // 例: 8200 → 9100 → 9500 → 11200 → 11100 = 9000/11000 旗 (中間 10000 skip = 大ジャンプ entry 1 つにまとめ)
    const out = [];
    let maxK = 0;
    entries.forEach(e => {
      const k = Math.floor(e.statusScore / 1000);
      if (k > maxK && k >= 1) {
        out.push({ entry: e, value: k * 1000 });
        maxK = k;
      }
    });
    return out;
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
        ${pb.tier ? `<span class="wwm-hist-pb-tier tier-badge tier-${_esc(pb.tier)}">${_esc(pb.tier)}</span>` : ''}
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

  function _renderChartSvg(entries, pb) {
    // entries = ts 昇順、 必ず 1 件以上
    const W = 600, H = 350, PL = 40, PR = 16, PT = 36, PB_PAD = 28;
    const innerW = W - PL - PR, innerH = H - PT - PB_PAD;
    const minTs = entries[0].ts;
    const maxTs = entries[entries.length - 1].ts;
    const tsRange = Math.max(1, maxTs - minTs);
    // 1 件のみ = 中央に dot 1 個。 線は描かない
    const single = entries.length === 1;
    const minScore = Math.min(...entries.map(e => e.statusScore));
    const maxScore = Math.max(...entries.map(e => e.statusScore));
    const scoreMin = Math.floor(minScore * 0.92 / 100) * 100;
    const scoreMax = Math.ceil(maxScore * 1.05 / 100) * 100;
    const scoreRange = Math.max(1, scoreMax - scoreMin);
    const xOf = single
      ? (() => PL + innerW / 2)
      : (ts => PL + ((ts - minTs) / tsRange) * innerW);
    const yOf = sc => PT + (1 - (sc - scoreMin) / scoreRange) * innerH;

    // Y軸 3 段 ticks
    const yTicks = [];
    for (let i = 0; i <= 2; i++) {
      const v = scoreMin + (scoreRange * i / 2);
      const y = yOf(v).toFixed(1);
      yTicks.push(`<text x="${PL - 6}" y="${y}" dy="3" text-anchor="end" font-size="10" fill="var(--sumi-text-3)" style="font-family:var(--f-latin);">${Math.round(v)}</text>`);
    }
    // X軸 label (1 or 3 点)
    const fmtDate = ts => { const d = new Date(ts); return (d.getMonth() + 1) + '/' + d.getDate(); };
    const xLabels = (single ? [0.5] : [0, 0.5, 1]).map(r => {
      const ts = minTs + tsRange * r;
      const x = (PL + r * innerW).toFixed(1);
      return `<text x="${x}" y="${H - PB_PAD + 16}" text-anchor="middle" font-size="10" fill="var(--sumi-text-3)" style="font-family:var(--f-latin);">${fmtDate(ts)}</text>`;
    }).join('');

    // 線 (1 キャラ単選 = 金 1 本、 single = 線描かない)
    const linePts = entries.map(e => `${xOf(e.ts).toFixed(1)},${yOf(e.statusScore).toFixed(1)}`).join(' ');
    const lineHtml = single ? '' : `<polyline points="${linePts}" fill="none" stroke="var(--gold-deep)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;

    // 通常 dot + PB 朱 dot + tooltip
    const T_ = window.T || {};
    const pbLabel = T_.historyPbLabel || 'PB';
    const dotsHtml = entries.map(e => {
      const cx = xOf(e.ts).toFixed(1), cy = yOf(e.statusScore).toFixed(1);
      const tip = _esc(`${e.roleName} Lv${e.level} | ${e.statusScore} ${e.tier} | ${e.date}`);
      const isPb = pb && e.ts === pb.ts;
      if (isPb) {
        return `<g><circle cx="${cx}" cy="${cy}" r="5.5" fill="var(--accent)" stroke="#fff" stroke-width="0.8"><title>${tip}</title></circle>` +
               `<text x="${cx}" y="${(cy - 9).toFixed(1)}" text-anchor="middle" font-size="9" fill="var(--accent)" style="font-family:var(--f-latin);font-weight:700;">${_esc(pbLabel)}</text></g>`;
      }
      return `<circle cx="${cx}" cy="${cy}" r="2.5" fill="var(--gold-deep)"><title>${tip}</title></circle>`;
    }).join('');

    // milestone 旗 = Tier SS/S/A 初到達 + 千刻み score 突破。 同 entry は 1 旗に統合
    // (旗ラベル重なり回避 — 兄貴指摘 2026-06-14)
    const reachIdx = _firstTierReachIdx(entries);
    const flagPrefix = T_.historyMilestoneFlag || '初';
    const _flag = (x, label) =>
      `<line x1="${x}" y1="${PT}" x2="${x}" y2="${PT + innerH}" stroke="var(--sumi-text-3)" stroke-opacity="0.35" stroke-dasharray="2,3"/>` +
      `<text x="${x}" y="12" text-anchor="middle" font-size="9" fill="var(--sumi-text-3)" style="font-family:var(--f-display);">⚑ ${label}</text>`;
    const flagByIdx = {};
    ['SS','S','A'].forEach(t => {
      const i = reachIdx[t];
      if (i === undefined) return;
      (flagByIdx[i] = flagByIdx[i] || {}).tier = flagPrefix + ' ' + t;
    });
    _scoreBreakthroughs(entries).forEach(b => {
      const i = entries.indexOf(b.entry);
      if (i < 0) return;
      (flagByIdx[i] = flagByIdx[i] || {}).score = String(b.value);
    });
    const flagHtml = Object.keys(flagByIdx).map(i => {
      const f = flagByIdx[i];
      const e = entries[i];
      const parts = [f.tier, f.score, fmtDate(e.ts)].filter(Boolean);
      return _flag(xOf(e.ts).toFixed(1), _esc(parts.join(' ')));
    }).join('');

    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:350px;">
    ${yTicks.join('')}
    ${xLabels}
    ${flagHtml}
    ${lineHtml}
    ${dotsHtml}
  </svg>`;
  }

  window.WWMSidebar = window.WWMSidebar || {};
  window.WWMSidebar.history = { record, render };

  // 初回 history.render() が data-store ready 前に呼ばれた場合、
  // T_ から i18n 値返らず chip ラベルが 'all'/'30d'/'7d' raw 表示される bug 回避。
  // ready 後に panel 存在チェックして再 render = i18n 正常反映。 click 経由の
  // 再 render は ready 済なので no-op (冪等)。
  if (window.WWM_DS && typeof window.WWM_DS.ready === 'function') {
    window.WWM_DS.ready().then(function () {
      if (document.getElementById('wwmHistory')) render();
    }).catch(function () {});
  }
})();
