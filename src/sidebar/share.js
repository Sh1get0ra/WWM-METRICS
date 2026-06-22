// ── WWMetrics Sidebar / Build Sharing URL (Phase 3.5 切出) ────
// _shareBuildUrl / _loadSharedBuild / window.WWMShare
// 絶対ルール: localStorage 浸食NG (SHARE mode 保護機構維持)、
//             WWMBaseline (base64+checksum) touch禁止 — logic 改変なし純粋move
(function () {
  'use strict';

  // ── 他 module alias ─────────────────────────────────────
  const _curLang = window.WWMSidebar.anlz.curLang;

  function _shareBuildUrl(opts) {
    // 🚨 閲覧モード (isShared) では SHARE 全 block (2026-06-23 兄貴指示で 2026-06-12 緩和を逆戻し)。
    // 理由 = 他人の build を表示中に自分の SHARE URL / OBS URL 生成は概念的に NG。
    // 受信側は index.html inline script で memory-only mode 処理 (localStorage 浸食回避)
    if (WWMState.blockIfShared((window.T?.sharedBuildShareBlocked) ?? '閲覧モード中: SHARE は無効化されています (自データに戻すには リロード/F5)')) return;
    const ri = WWMState.roleInfo;
    if (!ri) { alert('build データなし。先に import してください。'); return; }
    // Tier 判定前 (opt best 未確定) は SHARE 抑止 — 受信側 Tier 無し URL の生成防止 (EXPORT と同じ保険 guard)
    if (!WWMState.opt.best?.end) {
      if (window.showToast) showToast((window.T?.tierPendingBlocked) ?? 'Tier 判定中です。完了までお待ちください', { error: true });
      return;
    }
    const state = WWMHelpers.storage.loadJSON('wwm_last_state_v1');
    // payload 軽量化: base64画像 (avatar / xinfaIcons) を除外。
    // 巨大 base64 (100KB超) で URL長 OBS browser source 上限超え → hash truncate → JSON parse 失敗バグ防止。
    // OBS view では _avatarUrl / 静的アイコン fallback で代用可能。
    const riLight = { ...ri };
    delete riLight._avatarBase64;
    delete riLight._xinfaIconsBase64;
    // 武術/流派/奇術 icon base64 (2026-06-07 bookmarklet 拡張分) も除外 — 受信側はEXPORT 不可なので不要
    delete riLight._kongfuIconsBase64;
    delete riLight._liupaiIconsBase64;
    delete riLight._qishuIcons;          // 旧 schema 互換削除
    delete riLight._qishuIconsBase64;    // 旧 schema 互換削除
    delete riLight._qishuMaster;         // bookmarklet 埋込 master (受信側は WWM_QISHU_ICONS 持ち = 不要、 11KB 節約)
    delete riLight._liupaiPicsBase64;
    // _qishuIds は keep — SHARE に乗せて受信側で WWM_QISHU_ICONS lookup 描画 (v2 schema)
    // 心法icon URL配列も削除 → 受信側で WWM_XINFA_ICONS (data/xinfa_icons.json) fallback で復元
    delete riLight._xinfaIcons;
    // avatar URL も削除 → 受信側で roleAvatar ID → WWM_AVATAR_ICONS (data/avatar_icons.json) で復元
    delete riLight._avatarUrl;
    // 表示・計算に不要な field を削除 (privacy + 文字数削減)
    delete riLight.battleQs;       // 戦闘 quest
    delete riLight.createTime;     // キャラ作成日時
    delete riLight.onlineTime;     // 直近online
    delete riLight.crDay;          // 不明、計算未使用
    delete riLight.roleId;         // ユーザID = privacy
    delete riLight.scores58;       // 用途不明、計算未使用
    delete riLight.scores59;
    delete riLight.scores60;
    delete riLight.fashionScore;   // ファッション、計算無関係
    delete riLight.bg;             // 背景
    delete riLight.bodyType;       // キャラ体型
    delete riLight.school;         // debug log のみ使用、 表示不要
    // OBS view 武格指数 / Tier badge 表示用に baseline + opt_best 同梱 (数百バイト、 URL長影響軽微)
    //   v4: ts は受信側未使用 (scoreVer/end/score のみ参照) → 削除で短縮
    const _b = WWMState.baseline || null;
    const _o = WWMState.opt.best || null;
    const baseline = _b ? { ..._b } : null; if (baseline) delete baseline.ts;
    const optBest  = _o ? { ..._o } : null; if (optBest)  delete optBest.ts;
    // ── v4 slim (2026-06-07、 Discord 2000字以下達成 — 実測 2705→1900付近) ──
    // wearEquipsDetailed → slot別 positional 配列 [no, suffix, attrs, affixes, extra?]
    //   attrs   = [[attrIdx|key, val], ...] (ATTR_KEYS index、 未知 key は文字列のまま = 前方互換)
    //   affixes = [id, val, ratio, pack] (pack = rank*2 + useful01。 rank 異常時のみ 5 要素 [id,val,ratio,rank,u01])
    //             ※val/ratio は丸め厳禁 = baseline 整合 (受信側 statusScore 再計算が完全一致する必要)
    //   no      = 数値文字列なら number 化 (受信側で String 復元)
    //   durability = 受信側消費ゼロ (grep 確認 2026-06-07) → 非送信
    //   _inferredLv = 受信側 buildStatParams で再計算されるため非送信 (stats.js:112)
    //   未知 field は extra ({eq:{...}, ex:{...}}) に退避 = import schema 拡張への安全弁
    const ATTR_KEYS = ['MIN_W_ATK','MAX_W_ATK','HP_MAX','W_DEF','ARCHER_WEAKPOINT_DAMAGE','ARCHER_DAMAGE'];
    try {
      const wd = riLight.wearEquipsDetailed;
      if (wd && typeof wd === 'object') {
        const wd4 = {};
        for (const [slot, eq] of Object.entries(wd)) {
          if (!eq || typeof eq !== 'object') { wd4[slot] = eq; continue; }
          const ex = eq.exVo || {};
          const attrs = Object.entries(ex.baseAttrs || {}).map(([k, v]) => {
            const i = ATTR_KEYS.indexOf(k);
            return [i >= 0 ? i : k, v];
          });
          const affixes = (ex.baseAffixes || []).map(a => {
            const d = a?.equipmentDetails;
            if (!Array.isArray(d)) return a;
            const rank = d[3], u = d[4] ? 1 : 0;
            if (Number.isInteger(rank) && rank >= 0 && rank < 100) return [d[0], d[1], d[2], rank * 2 + u];
            return [d[0], d[1], d[2], rank, u];
          });
          const noNum = (typeof eq.no === 'string' && /^\d+$/.test(eq.no)) ? Number(eq.no) : eq.no;
          const arr = [noNum, ex.suffix ?? null, attrs, affixes];
          // 未知 field 退避
          const eqExtra = {}; let hasEq = false;
          for (const k of Object.keys(eq)) if (k !== 'no' && k !== 'exVo') { eqExtra[k] = eq[k]; hasEq = true; }
          const exExtra = {}; let hasEx = false;
          for (const k of Object.keys(ex)) if (!['durability','suffix','baseAttrs','baseAffixes','_inferredLv'].includes(k)) { exExtra[k] = ex[k]; hasEx = true; }
          if (hasEq || hasEx) {
            const extra = {};
            if (hasEq) extra.eq = eqExtra;
            if (hasEx) extra.ex = exExtra;
            arr.push(JSON.parse(JSON.stringify(extra))); // 元 ri 参照切離し
          }
          wd4[slot] = arr;
        }
        riLight.wearEquipsDetailed = wd4;
      }
    } catch(_) {}
    // state slim (v4): enhance/xinfaTiers → [[key,val],...] / arsenal → {p,t} (v3 同形) / 未知 key → _ 退避
    let stateSlim = null;
    try {
      if (state && typeof state === 'object') {
        stateSlim = {};
        if (state.enhance)    stateSlim.e = Object.entries(state.enhance).map(([k, v]) => [+k, v]);
        if (state.xinfaTiers) stateSlim.x = Object.entries(state.xinfaTiers).map(([k, v]) => [+k, v]);
        if (state.arsenal && typeof state.arsenal === 'object') {
          const ARS_TIERS = [41, 51, 56, 61, 71, 81, 86];
          const PATH_DICT = ['bellstrike','stonesplit','silkbind','bamboocut','voidPath']; // 未知 path は raw 文字列 fallback
          const tiers = state.arsenal.tiers || {};
          const pi = PATH_DICT.indexOf(state.arsenal.path);
          stateSlim.a = {
            p: pi >= 0 ? pi : state.arsenal.path,
            t: ARS_TIERS.map(lv => {
              const t = tiers[lv] || {};
              return [t.peaked ? 1 : 0, t.min ?? 0, t.max ?? 0];
            })
          };
        }
        for (const k of Object.keys(state)) {
          if (!['enhance','xinfaTiers','arsenal'].includes(k)) {
            stateSlim._ = stateSlim._ || {};
            stateSlim._[k] = JSON.parse(JSON.stringify(state[k]));
          }
        }
      }
    } catch(_) { stateSlim = state; }
    // v4 payload: top-level key 短縮 (d/s/b/o/l)。 受信側 index.html inline で正規化
    const payload = { v: 4, d: riLight, s: stateSlim, b: baseline, o: optBest, l: _curLang() };
    let url, b64;
    try {
      const json = JSON.stringify(payload);
      // OBS URL 用 base64 (旧形式維持 → 既存 OBS browser source設定 互換)
      b64 = btoa(unescape(encodeURIComponent(json))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      // SHARE URL: LZ圧縮 + query (?b=) → X t.co短縮対象 + URL短縮 (50-70%減)
      if (window.LZString) {
        const lz = LZString.compressToEncodedURIComponent(json);
        url = location.origin + location.pathname + '?b=' + lz;
      } else {
        url = location.origin + location.pathname + '#build=' + b64;
      }
    } catch (e) {
      console.error('[WWM Share] URL build failed:', e);
      if (window.showToast) showToast((window.T?.errShareUrlFail) ?? '共有URLの生成に失敗しました', { error: true });
      return;
    }
    // OBS URL は 透明度+背景色+文字色+ラベル背景 込みで動的生成
    const buildObsUrl = (opPct, bgHex, t1Hex, t2Hex, acHex, lbgHex) => {
      const bg = (bgHex || '#0a0a0a').replace('#','');
      const t1 = (t1Hex || '#e8d9b8').replace('#','');
      const t2 = (t2Hex || '#f0d28a').replace('#','');
      const ac = (acHex || '#c9a45a').replace('#','');
      const lbg = (lbgHex || '#d4af37').replace('#','');
      const curLang = (typeof _curLang === 'function') ? _curLang() : 'ja';
      return location.origin + location.pathname + '?view=sidebar&lang=' + curLang + '&op=' + opPct + '&bg=' + bg + '&t1=' + t1 + '&t2=' + t2 + '&ac=' + ac + '&lbg=' + lbg + '#build=' + b64;
    };
    // 過去の overlay 設定 復元
    const OVL_KEY = 'wwm_overlay_settings_v1';
    let saved = {};
    saved = WWMHelpers.storage.loadJSON(OVL_KEY, {});
    const initOp = Number.isFinite(saved.op) ? saved.op : 0;
    const initBg = saved.bg || '#0a0a0a';
    const initT1 = saved.t1 || '#e8d9b8';
    const initT2 = saved.t2 || '#f0d28a';
    const initAc = saved.ac || '#c9a45a';
    const initLbg = saved.lbg || '#d4af37';
    let obsUrl = buildObsUrl(initOp, initBg, initT1, initT2, initAc, initLbg);

    // ── 3 タブ modal shell ──────────────────────────────────────────
    const cardBlocked = !!(window.WWMState && WWMState.isShared);
    const T = window.T || {};
    const m = document.createElement('div');
    m.className = 'wwm-modal-backdrop';
    m.innerHTML = `
      <div class="wwm-modal wwm-modal-wide wwm-tool-modal wwm-share-modal-b">
        <span class="wwm-tool-bracket wwm-tool-bracket-tl"></span><span class="wwm-tool-bracket wwm-tool-bracket-tr"></span>
        <span class="wwm-tool-bracket wwm-tool-bracket-bl"></span><span class="wwm-tool-bracket wwm-tool-bracket-br"></span>
        <div class="wwm-modal-header">
          <h2><span class="wwm-tool-title-ja" data-i18n="shareTitle" data-kaisho="shareTitle">${T.shareTitle ?? '飛簡'}</span><span class="wwm-tool-title-en">SHARE</span><span class="wwm-tool-seal">飛</span></h2>
          <button class="wwm-modal-close" aria-label="Close">×</button>
        </div>
        <div class="wwm-tool-tabs">
          <button class="wwm-tool-tab" data-tab="card" ${cardBlocked ? `disabled title="${T.shareCardBlocked ?? ''}"` : ''}>${T.shareTabCard ?? '画像カード'}</button>
          <button class="wwm-tool-tab" data-tab="url">${T.shareTabUrl ?? '共有URL'}</button>
          <button class="wwm-tool-tab" data-tab="obs">${T.shareTabObs ?? 'OBS配信'}</button>
        </div>
        <div class="wwm-modal-body wwm-ws-paper wwm-share-pane" data-pane="card" hidden></div>
        <div class="wwm-modal-body wwm-ws-paper wwm-share-pane" data-pane="url" hidden></div>
        <div class="wwm-modal-body wwm-ws-paper wwm-share-pane" data-pane="obs" hidden></div>
        <div class="wwm-tool-modal-footer" id="wwmShareFooter"><div id="wwmShareMsg" style="font-size:12px;color:var(--gold-paper);min-height:16px;"></div></div>
      </div>`;
    document.body.appendChild(m);

    // ── pane references ────────────────────────────────────────────
    const panes = {
      card: m.querySelector('[data-pane="card"]'),
      url:  m.querySelector('[data-pane="url"]'),
      obs:  m.querySelector('[data-pane="obs"]'),
    };
    const tabs = m.querySelectorAll('.wwm-tool-tab');
    const footer = m.querySelector('#wwmShareFooter');

    // ── copyTo helper (msg は footer 常設 #wwmShareMsg に表示) ─────
    const copyTo = async (text, label) => {
      try {
        await navigator.clipboard.writeText(text);
        const tpl = (window.T?.shareMsgCopyOK) ?? '✓ {label} コピー完了';
        footer.querySelector('#wwmShareMsg').textContent = tpl.replace('{label}', label);
      } catch (e) {
        footer.querySelector('#wwmShareMsg').textContent = (window.T?.shareMsgCopyManual) ?? '手動でコピーしてください';
      }
    };

    // ── pane builders ──────────────────────────────────────────────
    // bg-icon = 公式素材、3 タブ共通 (タブでアイコン変えない — 兄貴指定 2026-06-13)
    const _bgIconHtml = `<div class="wwm-modal-bg-icon" style="background-image:url('https://www.wherewindsmeetgame.com/pc/qt/20251203102905/data/base_school/images/673325b408a29e4ef06def5ezTp9BZEC05.png');"></div>`;

    function _buildUrlPane(pane) {
      pane.innerHTML = `${_bgIconHtml}
        <div style="font-size:13px;color:var(--gold-paper);font-weight:700;letter-spacing:0.12em;margin-bottom:6px;">${(window.T?.shareSect1Heading) ?? '▍ビルド共有'}</div>
        <p style="font-size:12px;color:var(--kami-fg);opacity:0.92;margin:0 0 10px;line-height:1.6;">${(window.T?.shareSect1Desc) ?? ''}</p>
        <textarea class="wwm-share-url" id="wwmShareUrlNormal" readonly>${url}</textarea>`;
      // アクション btn = footer (墨帯) へ — 紙 body 上の secondary は不可視 (2026-06-13 兄貴指摘)
      footer.insertAdjacentHTML('beforeend',
        `<div class="wwm-btn-row wwm-share-foot-acts" data-foot-owner="url"><button class="wwm-btn-primary" id="wwmShareCopyNormal">${(window.T?.shareCopyUrl) ?? 'URL コピー'}</button></div>`);
      footer.querySelector('#wwmShareCopyNormal').addEventListener('click', () => copyTo(url, '通常URL'));
    }

    function _buildObsPane(pane) {
      pane.innerHTML = `${_bgIconHtml}
        <div style="font-size:13px;color:var(--gold-paper);font-weight:700;letter-spacing:0.12em;margin-bottom:6px;">${(window.T?.shareSect2Heading) ?? '▍OBS 配信用 URL'}</div>
        <p style="font-size:12px;color:var(--kami-fg);opacity:0.92;margin:0 0 8px;line-height:1.6;">${(window.T?.shareSect2Desc) ?? ''}</p>
        <div class="wwm-share-warn" style="font-size:12px;color:var(--vermilion-deep);background:var(--vermilion-faint);border-left:3px solid var(--vermilion-deep);padding:8px 10px;margin:0 0 10px;line-height:1.6;border-radius:2px;">⚠ ${(window.T?.shareObsCacheWarn) ?? 'OBSキャッシュの影響で正常に表示されない場合は、ブラウザソースの作り直し or OBS再起動が必要'}</div>
        <details style="margin:0 0 10px;font-size:12px;color:var(--kami-fg);">
          <summary style="cursor:pointer;color:var(--gold-paper);letter-spacing:0.05em;font-weight:700;">${(window.T?.shareObsSetup) ?? 'OBS への設定方法'}</summary>
          <ol style="margin:6px 0 0;padding-left:20px;line-height:1.7;opacity:0.92;">
            <li>${(window.T?.shareObsStep1) ?? ''}</li>
            <li>${(window.T?.shareObsStep2) ?? ''}</li>
            <li>${(window.T?.shareObsStep3) ?? ''}</li>
            <li>${(window.T?.shareObsStep4) ?? ''}</li>
            <li>${(window.T?.shareObsStep5) ?? ''}</li>
          </ol>
        </details>
        <div style="display:flex;align-items:center;gap:12px;font-size:12px;color:var(--kami-fg);margin-bottom:8px;flex-wrap:wrap;">
          <label style="display:flex;align-items:center;gap:6px;">
            ${(window.T?.shareLabelBg) ?? '背景色'}
            <input type="color" id="wwmObsBg" value="${initBg}" style="width:32px;height:24px;border:1px solid var(--ink-2);background:transparent;cursor:pointer;">
          </label>
          <label style="display:flex;align-items:center;gap:6px;">
            ${(window.T?.shareLabelOpacity) ?? '不透明度'}
            <input type="range" id="wwmObsOpacity" min="0" max="100" step="1" value="${initOp}" style="width:130px;accent-color:var(--gold);">
            <span id="wwmObsOpacityVal" style="font-family:var(--f-latin);color:var(--gold-paper);min-width:36px;">${initOp}%</span>
          </label>
        </div>
        <div style="display:flex;align-items:center;gap:12px;font-size:12px;color:var(--kami-fg);margin-bottom:8px;flex-wrap:wrap;">
          <label style="display:flex;align-items:center;gap:6px;">${(window.T?.shareLabelText1) ?? '文字色1'}
            <input type="color" id="wwmObsT1" value="${initT1}" style="width:32px;height:24px;border:1px solid var(--ink-2);background:transparent;cursor:pointer;">
          </label>
          <label style="display:flex;align-items:center;gap:6px;">${(window.T?.shareLabelText2) ?? '文字色2'}
            <input type="color" id="wwmObsT2" value="${initT2}" style="width:32px;height:24px;border:1px solid var(--ink-2);background:transparent;cursor:pointer;">
          </label>
          <label style="display:flex;align-items:center;gap:6px;">${(window.T?.shareLabelAcText) ?? 'ラベル文字'}
            <input type="color" id="wwmObsAc" value="${initAc}" style="width:32px;height:24px;border:1px solid var(--ink-2);background:transparent;cursor:pointer;">
          </label>
          <label style="display:flex;align-items:center;gap:6px;">${(window.T?.shareLabelAcBg) ?? 'ラベル背景'}
            <input type="color" id="wwmObsLbg" value="${initLbg}" style="width:32px;height:24px;border:1px solid var(--ink-2);background:transparent;cursor:pointer;">
          </label>
        </div>
        <textarea class="wwm-share-url" id="wwmShareUrlObs" readonly>${obsUrl}</textarea>
        <div id="wwmSharePreviewWrap" style="display:none;margin-top:12px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
            <div style="font-size:11px;color:var(--gold-paper);font-weight:700;letter-spacing:0.1em;">${(window.T?.sharePreviewTitle) ?? 'プレビュー'}</div>
            <label style="font-size:11px;color:var(--kami-fg-dim);display:flex;align-items:center;gap:6px;">${(window.T?.sharePreviewScaleLabel) ?? '縮尺'}
              <input type="range" id="wwmSharePreviewScale" min="30" max="100" step="5" value="50" style="width:120px;accent-color:var(--gold);">
              <span id="wwmSharePreviewScaleVal" style="font-family:var(--f-latin);color:var(--gold-paper);min-width:36px;">50%</span>
            </label>
          </div>
          <div style="background:repeating-conic-gradient(#1a1a1a 0% 25%, #2a2a2a 0% 50%) 50% / 16px 16px;border:1px solid var(--ink-2);border-radius:3px;padding:8px;display:flex;justify-content:center;overflow:auto;">
            <div id="wwmSharePreviewClip" style="width:320px;height:450px;overflow:hidden;position:relative;">
              <iframe id="wwmSharePreviewFrame" src="" style="width:640px;height:900px;border:none;background:transparent;transform:scale(0.5);transform-origin:0 0;" sandbox="allow-scripts allow-same-origin"></iframe>
            </div>
          </div>
        </div>`;

      // アクション btn = footer (墨帯) へ — 紙 body 上の secondary は不可視 (2026-06-13 兄貴指摘)
      footer.insertAdjacentHTML('beforeend',
        `<div class="wwm-btn-row wwm-share-foot-acts" data-foot-owner="obs"><button class="wwm-btn-primary" id="wwmShareCopyObs">${(window.T?.shareCopyObs) ?? 'OBS URL コピー'}</button><button class="wwm-btn-secondary" id="wwmShareTogglePreview">${(window.T?.sharePreviewBtn) ?? 'プレビュー表示'}</button></div>`);

      // OBS pane listeners
      const opSlider = pane.querySelector('#wwmObsOpacity');
      const opVal = pane.querySelector('#wwmObsOpacityVal');
      const bgPicker = pane.querySelector('#wwmObsBg');
      const t1Picker = pane.querySelector('#wwmObsT1');
      const t2Picker = pane.querySelector('#wwmObsT2');
      const acPicker = pane.querySelector('#wwmObsAc');
      const lbgPicker = pane.querySelector('#wwmObsLbg');
      const obsTa = pane.querySelector('#wwmShareUrlObs');
      const previewWrap = pane.querySelector('#wwmSharePreviewWrap');
      const previewFrame = pane.querySelector('#wwmSharePreviewFrame');
      const togglePreviewBtn = footer.querySelector('#wwmShareTogglePreview');
      let previewOn = false;
      let previewDebounce = null;
      const refreshPreviewSrc = () => {
        if (!previewOn) return;
        if (previewDebounce) clearTimeout(previewDebounce);
        previewDebounce = setTimeout(() => {
          // cache buster で 旧版iframe強制再load
          const sep = obsUrl.includes('?') ? '&' : '?';
          const bustParam = sep + '_t=' + Date.now();
          // hash#build の前に bustParam 挿入
          const hashIdx = obsUrl.indexOf('#');
          previewFrame.src = hashIdx >= 0
            ? obsUrl.slice(0, hashIdx) + bustParam + obsUrl.slice(hashIdx)
            : obsUrl + bustParam;
        }, 250);
      };
      const refreshObs = () => {
        const pct = parseInt(opSlider.value, 10);
        opVal.textContent = pct + '%';
        obsUrl = buildObsUrl(pct, bgPicker.value, t1Picker.value, t2Picker.value, acPicker.value, lbgPicker.value);
        obsTa.value = obsUrl;
        try { localStorage.setItem(OVL_KEY, JSON.stringify({ op: pct, bg: bgPicker.value, t1: t1Picker.value, t2: t2Picker.value, ac: acPicker.value, lbg: lbgPicker.value })); } catch(_) {}
        refreshPreviewSrc();
      };
      togglePreviewBtn.addEventListener('click', () => {
        previewOn = !previewOn;
        previewWrap.style.display = previewOn ? 'block' : 'none';
        togglePreviewBtn.textContent = previewOn ? ((window.T?.sharePreviewClose) ?? 'プレビュー閉じる') : ((window.T?.sharePreviewBtn) ?? 'プレビュー表示');
        if (previewOn) {
          // cache buster で 旧版iframe強制再load
          const sep = obsUrl.includes('?') ? '&' : '?';
          const bustParam = sep + '_t=' + Date.now();
          const hashIdx = obsUrl.indexOf('#');
          previewFrame.src = hashIdx >= 0
            ? obsUrl.slice(0, hashIdx) + bustParam + obsUrl.slice(hashIdx)
            : obsUrl + bustParam;
        } else {
          previewFrame.src = 'about:blank';
        }
      });
      const scaleSlider = pane.querySelector('#wwmSharePreviewScale');
      const scaleVal = pane.querySelector('#wwmSharePreviewScaleVal');
      const scaleClip = pane.querySelector('#wwmSharePreviewClip');
      const INNER_W = 640, INNER_H = 900;
      scaleSlider.addEventListener('input', () => {
        const pct = parseInt(scaleSlider.value, 10);
        const s = pct / 100;
        scaleVal.textContent = pct + '%';
        previewFrame.style.transform = `scale(${s})`;
        scaleClip.style.width = (INNER_W * s) + 'px';
        scaleClip.style.height = (INNER_H * s) + 'px';
      });
      opSlider.addEventListener('input', refreshObs);
      bgPicker.addEventListener('input', refreshObs);
      t1Picker.addEventListener('input', refreshObs);
      t2Picker.addEventListener('input', refreshObs);
      acPicker.addEventListener('input', refreshObs);
      lbgPicker.addEventListener('input', refreshObs);
      footer.querySelector('#wwmShareCopyObs').addEventListener('click', () => copyTo(obsUrl, 'OBS URL'));
    }

    function _buildCardPane(pane) {
      if (window.WWMExportCard && window.WWMExportCard.mountCardPane) {
        window.WWMExportCard.mountCardPane(pane, footer);
        pane.insertAdjacentHTML('afterbegin', _bgIconHtml); // mount の innerHTML 上書き後に挿入
        return;
      }
      pane.innerHTML = _bgIconHtml + '<p style="color:var(--kami-fg-dim);padding:20px;">...</p>';
    }

    // ── タブ engine ────────────────────────────────────────────────
    const builders = { card: _buildCardPane, url: _buildUrlPane, obs: _buildObsPane };
    function _switchTab(name) {
      tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
      Object.entries(panes).forEach(([k, p]) => { p.hidden = (k !== name); });
      if (!panes[name]._built) { builders[name](panes[name], footer); panes[name]._built = true; }
      const ca = footer.querySelector('.wwm-card-actions');
      if (ca) ca.hidden = (name !== 'card');
      footer.querySelectorAll('[data-foot-owner]').forEach(el => { el.hidden = (el.dataset.footOwner !== name); });
    }
    tabs.forEach(t => t.addEventListener('click', () => { if (!t.disabled) _switchTab(t.dataset.tab); }));
    _switchTab(cardBlocked ? 'url' : (opts?.tab || 'card'));

    // ── close ──────────────────────────────────────────────────────
    const close = () => m.remove();
    m.querySelector('.wwm-modal-close').addEventListener('click', close);
    m.addEventListener('click', e => { if (e.target === m) close(); });
  }

  // hash で build 受信時 復元 — 処理は index.html inline script (memory-only mode、 早期実行)
  // sidebar.js 読込時点で 既に hash 消去 + window.__WWM_SHARED_BUILD セット済
  function _loadSharedBuild() {
    return WWMState.isShared;
  }
  // 起動時 hash チェック
  if (_loadSharedBuild()) {
    // localStorage 更新済 → 通常 auto-load フロー で反映
  }

  // ── expose ───────────────────────────────────────────────
  window.WWMSidebar = window.WWMSidebar || {};
  window.WWMSidebar.share = {
    shareUrl: _shareBuildUrl,
    loadShared: _loadSharedBuild,
  };
})();

// vite移行 P2: ESM 副作用 module 化 (window expose は IIFE 内 keep)
export {};
