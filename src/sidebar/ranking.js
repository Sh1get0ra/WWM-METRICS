// ── WWMetrics / Sidebar / Affix Ranking (Phase 3.9d 切出) ──
// 各 affix 1オプション分の Δscore 寄与ランキング + 効率分析 (入力値で再計算)。
// 依存:
//   - WWMSidebar.affix: loadEquipMax / lvToTier / getCachedEquipMax
//   - 旧 sidebar.js グローバル: _scoreWithBonus / _set4Bonus
//     → arrow wrapper で window.__WWM_SCORE_WITH_BONUS / window.__WWM_SET4_BONUS_OF を call-time lookup
//   - グローバル: WWMState, WWMHelpers.storage, computeExpected, WWMStats.buildStatParams,
//     WWM_KONGFU, WWM_LV95_BASE, _AFFIX_DISPLAY_LABELS, T
// 公開:
//   - window.WWMSidebar.ranking = { render }
//   - 後方互換: window.WWMRanking = { render }
//     (sidebar.js _refreshAll / import.js)
(function () {
  'use strict';

  const _loadEquipMax       = window.WWMSidebar.affix.loadEquipMax;
  const _lvToTier           = window.WWMSidebar.affix.lvToTier;
  const _getCachedEquipMax  = window.WWMSidebar.affix.getCachedEquipMax;

  // call-time lookup (gear.js が load 後に window expose する)
  const _scoreWithBonus = (ri) => window.__WWM_SCORE_WITH_BONUS(ri);
  const _set4Bonus      = (ri) => window.__WWM_SET4_BONUS_OF(ri);

  async function render(roleInfo, params) {
    // popout 中は popout window 内 root を優先 (2026-06-16 — 親 document の getElementById は null 返す)
    const root = (window.WWMAnlzPopout?.findEl?.('wwmAffixRanking')) || document.getElementById('wwmAffixRanking');
    if (!root || !roleInfo || !window.WWMStats?.buildStatParams) return;
    const state = WWMHelpers.storage.loadJSON('wwm_last_state_v1');
    // baseline score
    let baseScore = 0;
    try {
      const p = await window.WWMStats.buildStatParams(roleInfo, state);
      window.computeExpected(p);
      baseScore = _scoreWithBonus(roleInfo);
    } catch (e) { return; }
    // equip_max.json から tier max 取得 → 装備1オプション分の Δ で評価
    await _loadEquipMax();
    const charLv = roleInfo?.level || 95;
    const tier = _lvToTier(charLv);
    const _rawMax = _getCachedEquipMax()?.tiers?.[tier] || {};
    // 2026-06-24 schema: 各 entry = number (旧) or {min, max} (新)。 ranking は max 値で評価。
    //   Proxy 経由 (2026-06-23 cce69ac) → HMR/module cache で trap が発火しない経路あり = 旧 schema 解釈で .toFixed クラッシュ。
    //   defensive 化: 起動時 plain object に pre-resolve (= 全 key を .max 抽出済 number に展開)。
    const _v = (x) => (x && typeof x === 'object' && 'max' in x) ? x.max : x;
    const maxTbl = {};
    for (const k of Object.keys(_rawMax)) maxTbl[k] = _v(_rawMax[k]);
    const PATH_PEN = { bellstrike: 'bellstrikePen', stonesplit: 'stonesplitPen', silkbind: 'silkbindPen', bamboocut: 'bamboocutPen', voidPath: 'voidPen' };
    const path = window.WWM_KONGFU?.[roleInfo?.kongfuMain]?.path;
    const PATH_MAP = {
      bellstrike: ['minBellstrike', 'maxBellstrike'], stonesplit: ['minStonesplit', 'maxStonesplit'],
      silkbind: ['minSilkbind', 'maxSilkbind'], bamboocut: ['minBamboocut', 'maxBamboocut'],
      voidPath: ['minVoid', 'maxVoid']
    };
    const pathKeys = PATH_MAP[path] || [];
    const activePathPen = PATH_PEN[path];
    const SL = window._AFFIX_DISPLAY_LABELS || {};
    // 装備オプションに出るもののみ評価対象 (compute が読む key にマップ)
    const targets = [
      { key: 'minPhysATK', delta: maxTbl.maxPhys, label: `${SL.minPhys || '最小外功攻撃'} +${maxTbl.maxPhys?.toFixed(1)}` },
      { key: 'maxPhysATK', delta: maxTbl.maxPhys, label: `${SL.maxPhys || '最大外功攻撃'} +${maxTbl.maxPhys?.toFixed(1)}` },
      pathKeys[0] && { key: 'minElemMain', delta: maxTbl.pathSingle, label: `${SL[pathKeys[0]] || pathKeys[0]} +${maxTbl.pathSingle?.toFixed(1)}` },
      pathKeys[1] && { key: 'maxElemMain', delta: maxTbl.pathSingle, label: `${SL[pathKeys[1]] || pathKeys[1]} +${maxTbl.pathSingle?.toFixed(1)}` },
      { key: 'minElemSub', delta: maxTbl.pathSingle, label: `${(window.T && T.minElemSub) || '最小属性攻撃(副)'} +${maxTbl.pathSingle?.toFixed(1)}` },
      { key: 'maxElemSub', delta: maxTbl.pathSingle, label: `${(window.T && T.maxElemSub) || '最大属性攻撃(副)'} +${maxTbl.pathSingle?.toFixed(1)}` },
      { key: 'critRate',     delta: maxTbl.crit,     label: `${SL.crit || '会心率'} +${((maxTbl.crit || 0) * 100).toFixed(1)}%` },
      { key: 'sympathyRate', delta: maxTbl.affinity, label: `${SL.affinity || '会意率'} +${((maxTbl.affinity || 0) * 100).toFixed(1)}%` },
      { key: 'hitRate',      delta: maxTbl.precision, label: `${SL.precision || '命中率'} +${((maxTbl.precision || 0) * 100).toFixed(1)}%` },
      { key: 'outerPen',     delta: maxTbl.outerPen, label: `${SL.physPen || '外功貫通'} +${maxTbl.outerPen}` },
      { key: 'elemPen',      delta: maxTbl.attrPen,  label: `${(window.T && T.pathPenVoid) || '無相貫通'} +${maxTbl.attrPen}` },
      { key: '_power',  delta: maxTbl.stat5, label: `${SL.power || '力'} +${maxTbl.stat5?.toFixed(1)}`, statKey: 'power' },
      { key: '_agility',   delta: maxTbl.stat5, label: `${SL.agility || '速'} +${maxTbl.stat5?.toFixed(1)}`, statKey: 'agility' },
      { key: '_momentum',     delta: maxTbl.stat5, label: `${SL.momentum || '会'} +${maxTbl.stat5?.toFixed(1)}`, statKey: 'momentum' },
      { key: 'stMysticDmg',  delta: maxTbl.mysticDmg, label: `${SL.stMysticDmg || '奇術ダメ'} +${((maxTbl.mysticDmg || 0) * 100).toFixed(1)}%` },
      { key: 'allMartialBoost', delta: maxTbl.allWeaponDmg, label: `${SL.allWeaponDmg || '全武学効果'} +${((maxTbl.allWeaponDmg || 0) * 100).toFixed(1)}%` }
    ].filter(t => t && t.delta != null && t.delta > 0);
    // 並列で全 simulate (DOM更新 silent化 でチラつき抑制)
    window._SILENT_COMPUTE = true;
    const results = [];
    for (const t of targets) {
      try {
        let p2;
        if (t.statKey) {
          // 5行ステ → roleInfo override で buildStatParams再呼出 (武術 derived cap適用)
          const base5 = window.WWM_LV95_BASE?.stats?.[t.statKey] || 129;
          const riPatched = JSON.parse(JSON.stringify(roleInfo));
          riPatched[t.statKey] = (riPatched[t.statKey] || base5) + t.delta;
          p2 = await window.WWMStats.buildStatParams(riPatched, state);
        } else {
          p2 = await window.WWMStats.buildStatParams(roleInfo, state);
          p2[t.key] = (p2[t.key] || 0) + t.delta;
        }
        window.computeExpected(p2);
        const newScore = (WWMState.lastResult?.statusScore || 0) + _set4Bonus(roleInfo);
        results.push({ label: t.label, delta: newScore - baseScore });
      } catch (e) {}
    }
    window._SILENT_COMPUTE = false;
    results.sort((a, b) => b.delta - a.delta);
    const top = results;
    const rows = top.map((r, i) => `
      <div class="wwm-rank-row">
        <span class="wwm-rank-pos">${i + 1}</span>
        <span class="wwm-rank-label">${r.label}</span>
        <span class="wwm-rank-delta">+${r.delta.toFixed(1)}</span>
      </div>
    `).join('');
    // 効率分析: 各 target を input可能化、 入力値から Δ即時再計算
    const _STAT_META = {
      'minPhysATK':       { lbl: SL.minPhys || '最小外功攻撃',        pct: false, step: '0.1' },
      'maxPhysATK':       { lbl: SL.maxPhys || '最大外功攻撃',        pct: false, step: '0.1' },
      'minElemMain':      { lbl: pathKeys[0] ? (SL[pathKeys[0]] || pathKeys[0]) : '最小属性ATK', pct: false, step: '0.1' },
      'maxElemMain':      { lbl: pathKeys[1] ? (SL[pathKeys[1]] || pathKeys[1]) : '最大属性ATK', pct: false, step: '0.1' },
      'minElemSub':       { lbl: (window.T && T.minElemSub) || '最小属性攻撃(副)', pct: false, step: '0.1' },
      'maxElemSub':       { lbl: (window.T && T.maxElemSub) || '最大属性攻撃(副)', pct: false, step: '0.1' },
      'critRate':         { lbl: SL.crit || '会心率',           pct: true,  step: '0.1' },
      'sympathyRate':     { lbl: SL.affinity || '会意率',       pct: true,  step: '0.1' },
      'hitRate':          { lbl: SL.precision || '命中率',      pct: true,  step: '0.1' },
      'outerPen':         { lbl: SL.physPen || '外功貫通',  pct: false, step: '0.1' },
      'elemPen':          { lbl: (window.T && T.pathPenVoid) || '無相貫通',  pct: false, step: '0.1' },
      '_power':        { lbl: SL.power || '力',           pct: false, step: '1' },
      '_agility':         { lbl: SL.agility || '速',            pct: false, step: '1' },
      '_momentum':           { lbl: SL.momentum || '会',              pct: false, step: '1' },
      'stMysticDmg':      { lbl: SL.stMysticDmg || '奇術ダメ',  pct: true,  step: '0.1' },
      'allMartialBoost':  { lbl: SL.allWeaponDmg || '全武学効果', pct: true, step: '0.1' }
    };
    const effRows = targets.map(t => {
      const meta = _STAT_META[t.key] || { lbl: t.key, pct: false, step: '0.1' };
      const dispVal = meta.pct ? ((t.delta || 0) * 100).toFixed(1) : (t.delta || 0).toFixed(1);
      const r0 = results.find(r => r.label === t.label);
      return `
        <div class="wwm-eff-row" data-eff-key="${t.key}">
          <span class="wwm-eff-label">${meta.lbl}</span>
          <span class="wwm-eff-input-wrap">
            <input class="wwm-eff-input" type="number" step="${meta.step}" value="${dispVal}" aria-label="${meta.lbl}" data-key="${t.key}" data-pct="${meta.pct ? '1' : '0'}"${t.statKey ? ` data-statkey="${t.statKey}"` : ''}>${meta.pct ? '<span class="wwm-eff-pct">%</span>' : ''}
          </span>
          <span class="wwm-eff-delta" data-delta-for="${t.key}">+${(r0?.delta || 0).toFixed(1)}</span>
        </div>
      `;
    }).join('');
    root.innerHTML = `
      <div class="wwm-analysis-card wwm-modal-square wwm-rank-grid">
        <div class="wwm-modal-bg-icon" style="background-image:url('https://www.wherewindsmeetgame.com/pc/qt/20251203102905/data/base_school/images/673325b3eed7ba50118c397aMSc1Axt605.png');"></div>
        <div class="wwm-rank-col">
          <div class="wwm-analysis-header"><h3>${(window.T && T.affixRankingTitle) || '調律/定音期待値ランキング'}</h3></div>
          <div class="wwm-rank-body">${rows}</div>
        </div>
        <div class="wwm-eff-col">
          <div class="wwm-analysis-header"><h3>${(window.T && T.effAnalysisTitle) || 'ステータス効率分析'}</h3></div>
          <div class="wwm-eff-body">${effRows}</div>
        </div>
      </div>
    `;
    // input change → 該当 stat patch → ΔScore更新 (debounce 250ms)
    const _effDebounce = {};
    root.querySelectorAll('.wwm-eff-input').forEach(inp => {
      inp.addEventListener('input', () => {
        const k = inp.dataset.key;
        if (_effDebounce[k]) clearTimeout(_effDebounce[k]);
        _effDebounce[k] = setTimeout(async () => {
          const raw = parseFloat(inp.value);
          if (isNaN(raw)) return;
          const isPct = inp.dataset.pct === '1';
          const delta = isPct ? raw / 100 : raw;
          const statKey = inp.dataset.statkey || null;
          try {
            window._SILENT_COMPUTE = true;
            let p2;
            if (statKey) {
              const base5 = window.WWM_LV95_BASE?.stats?.[statKey] || 129;
              const riPatched = JSON.parse(JSON.stringify(roleInfo));
              riPatched[statKey] = (riPatched[statKey] || base5) + delta;
              p2 = await window.WWMStats.buildStatParams(riPatched, state);
            } else {
              p2 = await window.WWMStats.buildStatParams(roleInfo, state);
              p2[k] = (p2[k] || 0) + delta;
            }
            window.computeExpected(p2);
            const newScore = (WWMState.lastResult?.statusScore || 0) + _set4Bonus(roleInfo);
            const dEl = root.querySelector(`[data-delta-for="${k}"]`);
            if (dEl) dEl.textContent = `+${(newScore - baseScore).toFixed(1)}`;
            // 復元 (base params で 1回再計算 → DOM正常化)
            window._SILENT_COMPUTE = false;
            if (WWMState.params) window.computeExpected(WWMState.params);
          } catch (e) { window._SILENT_COMPUTE = false; }
        }, 250);
      });
    });
    // 復元
    try {
      const p3 = await window.WWMStats.buildStatParams(roleInfo, state);
      window.computeExpected(p3);
    } catch (e) {}
  }

  window.WWMSidebar = window.WWMSidebar || {};
  window.WWMSidebar.ranking = { render };
})();

// vite移行 P2: ESM 副作用 module 化 (window expose は IIFE 内 keep)
export {};
