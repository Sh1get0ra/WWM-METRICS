// ── WWM-METRICS Sidebar / Build Sharing URL (Phase 3.5 切出) ────
// _shareBuildUrl / _loadSharedBuild / window.WWMShare
// 絶対ルール: localStorage 浸食NG (SHARE mode 保護機構維持)、
//             WWMBaseline (base64+checksum) touch禁止 — logic 改変なし純粋move
(function () {
  'use strict';

  // ── 他 module alias ─────────────────────────────────────
  const _curLang = window.WWMSidebar.anlz.curLang;

  function _shareBuildUrl() {
    // SHARE Build mode 中は 他人ビルドの再配布回避のため SHARE生成 禁止
    if (WWMState.blockIfShared((window.T?.sharedBuildShareBlocked) ?? '閲覧モード中: SHARE URL 生成は無効化されています (他人のビルドを再配布できません)')) return;
    // 受信側は index.html inline script で memory-only mode 処理 (localStorage 浸食回避)
    const ri = WWMState.roleInfo;
    if (!ri) { alert('build データなし。先に import してください。'); return; }
    const state = WWMHelpers.storage.loadJSON('wwm_last_state_v1');
    // payload 軽量化: base64画像 (avatar / xinfaIcons) を除外。
    // 巨大 base64 (100KB超) で URL長 OBS browser source 上限超え → hash truncate → JSON parse 失敗バグ防止。
    // OBS view では _avatarUrl / 静的アイコン fallback で代用可能。
    const riLight = { ...ri };
    delete riLight._avatarBase64;
    delete riLight._xinfaIconsBase64;
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
    const baseline = WWMState.baseline || null;
    const optBest  = WWMState.opt.best || null;
    // baseAffixes slim化: {equipmentDetails:[id,val,ratio,rank,useful]} → [id,val,ratio,rank,useful]
    //   + ratio 小数3桁丸め、 boolean→0/1 で 50%程縮小。 受信側 inline script で復元。
    //   ※元 ri 共有を避けるため wearEquipsDetailed は deep clone してから slim化
    try {
      const wd = riLight.wearEquipsDetailed;
      if (wd && typeof wd === 'object') {
        const wdCloned = JSON.parse(JSON.stringify(wd));
        Object.values(wdCloned).forEach(eq => {
          if (eq?.exVo?.baseAffixes && Array.isArray(eq.exVo.baseAffixes)) {
            eq.exVo.baseAffixes = eq.exVo.baseAffixes.map(a => {
              const d = a?.equipmentDetails;
              if (!Array.isArray(d)) return a;
              return [d[0], d[1], d[2], d[3], d[4]?1:0];
            });
          }
        });
        riLight.wearEquipsDetailed = wdCloned;
      }
    } catch(_) {}
    // state.arsenal slim化 (v3): {path, tiers:{lv:{peaked,min,max}}} → {p,t:[[peaked,min,max],...]} (Tier固定順)
    let stateSlim = state;
    try {
      if (state?.arsenal && typeof state.arsenal === 'object') {
        stateSlim = JSON.parse(JSON.stringify(state)); // deep clone
        const ARS_TIERS = [41, 51, 56, 61, 71, 81, 86];
        const tiers = stateSlim.arsenal.tiers || {};
        stateSlim.arsenal = {
          p: stateSlim.arsenal.path,
          t: ARS_TIERS.map(lv => {
            const t = tiers[lv] || {};
            return [t.peaked ? 1 : 0, t.min ?? 0, t.max ?? 0];
          })
        };
      }
    } catch(_) {}
    const payload = { v: 3, data: riLight, state: stateSlim || null, baseline, optBest, lang: _curLang() };
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
    } catch (e) { alert('URL 生成失敗: ' + e.message); return; }
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
    // modal で表示 + clipboard コピー
    const m = document.createElement('div');
    m.className = 'wwm-modal-backdrop';
    m.innerHTML = `
      <div class="wwm-modal wwm-modal-wide">
        <div class="wwm-modal-bg-icon" style="background-image:url('assets/icons/share.svg');background-position:calc(100% + 40px) calc(100% + 140px);background-size:70%;"></div>
        <div class="wwm-modal-header">
          <h2>${(window.T?.shareTitle) ?? '飛簡 / BUILD SHARE'}</h2>
          <button class="wwm-modal-close" aria-label="Close">×</button>
        </div>
        <div class="wwm-modal-body">
          <!-- セクション1: ビルド共有 -->
          <div style="font-size:13px;color:var(--gold-bright);font-weight:700;letter-spacing:0.12em;margin-bottom:6px;">${(window.T?.shareSect1Heading) ?? '▍ビルド共有'}</div>
          <p style="font-size:12px;color:var(--paper);opacity:0.92;margin:0 0 10px;line-height:1.6;">${(window.T?.shareSect1Desc) ?? ''}</p>
          <textarea class="wwm-share-url" id="wwmShareUrlNormal" readonly>${url}</textarea>
          <div class="wwm-btn-row" style="margin-top:6px;">
            <button class="wwm-btn-secondary" id="wwmShareCopyNormal">${(window.T?.shareCopyUrl) ?? 'URL コピー'}</button>
          </div>

          <!-- セクション2: OBS Browser Source (mobile時 hidden) -->
          <div class="wwm-share-obs-block">
          <div style="font-size:13px;color:var(--gold-bright);font-weight:700;letter-spacing:0.12em;margin:22px 0 6px;">${(window.T?.shareSect2Heading) ?? '▍OBS 配信用 URL'}</div>
          <p style="font-size:12px;color:var(--paper);opacity:0.92;margin:0 0 8px;line-height:1.6;">${(window.T?.shareSect2Desc) ?? ''}</p>
          <div style="font-size:12px;color:#e8a04a;background:rgba(232,160,74,0.10);border-left:3px solid #e8a04a;padding:8px 10px;margin:0 0 10px;line-height:1.6;border-radius:2px;">⚠ ${(window.T?.shareObsCacheWarn) ?? 'OBSキャッシュの影響で正常に表示されない場合は、ブラウザソースの作り直し or OBS再起動が必要'}</div>
          <details style="margin:0 0 10px;font-size:12px;color:var(--paper);">
            <summary style="cursor:pointer;color:var(--gold-bright);letter-spacing:0.05em;font-weight:700;">${(window.T?.shareObsSetup) ?? 'OBS への設定方法'}</summary>
            <ol style="margin:6px 0 0;padding-left:20px;line-height:1.7;opacity:0.92;">
              <li>${(window.T?.shareObsStep1) ?? ''}</li>
              <li>${(window.T?.shareObsStep2) ?? ''}</li>
              <li>${(window.T?.shareObsStep3) ?? ''}</li>
              <li>${(window.T?.shareObsStep4) ?? ''}</li>
              <li>${(window.T?.shareObsStep5) ?? ''}</li>
            </ol>
          </details>
          <div style="display:flex;align-items:center;gap:12px;font-size:12px;color:var(--paper);margin-bottom:8px;flex-wrap:wrap;">
            <label style="display:flex;align-items:center;gap:6px;">
              ${(window.T?.shareLabelBg) ?? '背景色'}
              <input type="color" id="wwmObsBg" value="${initBg}" style="width:32px;height:24px;border:1px solid var(--ink-2);background:transparent;cursor:pointer;">
            </label>
            <label style="display:flex;align-items:center;gap:6px;">
              ${(window.T?.shareLabelOpacity) ?? '不透明度'}
              <input type="range" id="wwmObsOpacity" min="0" max="100" step="1" value="${initOp}" style="width:130px;accent-color:var(--gold);">
              <span id="wwmObsOpacityVal" style="font-family:var(--f-mono);color:var(--gold-bright);min-width:36px;">${initOp}%</span>
            </label>
          </div>
          <div style="display:flex;align-items:center;gap:12px;font-size:12px;color:var(--paper);margin-bottom:8px;flex-wrap:wrap;">
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
          <div class="wwm-btn-row" style="margin-top:6px;">
            <button class="wwm-btn-primary" id="wwmShareCopyObs">${(window.T?.shareCopyObs) ?? 'OBS URL コピー'}</button>
            <button class="wwm-btn-secondary" id="wwmShareTogglePreview">${(window.T?.sharePreviewBtn) ?? 'プレビュー表示'}</button>
            <button class="wwm-btn-secondary" id="wwmShareClose">${(window.T?.shareCloseBtn) ?? '閉じる'}</button>
          </div>
          <div id="wwmSharePreviewWrap" style="display:none;margin-top:12px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
              <div style="font-size:11px;color:var(--gold-bright);font-weight:700;letter-spacing:0.1em;">${(window.T?.sharePreviewTitle) ?? 'プレビュー'}</div>
              <label style="font-size:11px;color:var(--paper-mute);display:flex;align-items:center;gap:6px;">${(window.T?.sharePreviewScaleLabel) ?? '縮尺'}
                <input type="range" id="wwmSharePreviewScale" min="30" max="100" step="5" value="50" style="width:120px;accent-color:var(--gold);">
                <span id="wwmSharePreviewScaleVal" style="font-family:var(--f-mono);color:var(--gold-bright);min-width:36px;">50%</span>
              </label>
            </div>
            <div style="background:repeating-conic-gradient(#1a1a1a 0% 25%, #2a2a2a 0% 50%) 50% / 16px 16px;border:1px solid var(--ink-2);border-radius:3px;padding:8px;display:flex;justify-content:center;overflow:auto;">
              <div id="wwmSharePreviewClip" style="width:320px;height:450px;overflow:hidden;position:relative;">
                <iframe id="wwmSharePreviewFrame" src="" style="width:640px;height:900px;border:none;background:transparent;transform:scale(0.5);transform-origin:0 0;" sandbox="allow-scripts allow-same-origin"></iframe>
              </div>
            </div>
          </div>
          </div><!-- /wwm-share-obs-block -->
          <div id="wwmShareMsg" style="margin-top:8px;font-size:12px;color:var(--jade-bright);"></div>
        </div>
      </div>
    `;
    document.body.appendChild(m);
    const close = () => m.remove();
    m.querySelector('.wwm-modal-close').addEventListener('click', close);
    m.querySelector('#wwmShareClose').addEventListener('click', close);
    const copyTo = async (text, label) => {
      try {
        await navigator.clipboard.writeText(text);
        const tpl = (window.T?.shareMsgCopyOK) ?? '✓ {label} コピー完了';
        m.querySelector('#wwmShareMsg').textContent = tpl.replace('{label}', label);
      } catch (e) {
        m.querySelector('#wwmShareMsg').textContent = (window.T?.shareMsgCopyManual) ?? '手動でコピーしてください';
      }
    };
    m.querySelector('#wwmShareCopyNormal').addEventListener('click', () => copyTo(url, '通常URL'));
    m.querySelector('#wwmShareCopyObs').addEventListener('click', () => copyTo(obsUrl, 'OBS URL'));
    const opSlider = m.querySelector('#wwmObsOpacity');
    const opVal = m.querySelector('#wwmObsOpacityVal');
    const bgPicker = m.querySelector('#wwmObsBg');
    const t1Picker = m.querySelector('#wwmObsT1');
    const t2Picker = m.querySelector('#wwmObsT2');
    const acPicker = m.querySelector('#wwmObsAc');
    const lbgPicker = m.querySelector('#wwmObsLbg');
    const obsTa = m.querySelector('#wwmShareUrlObs');
    const previewWrap = m.querySelector('#wwmSharePreviewWrap');
    const previewFrame = m.querySelector('#wwmSharePreviewFrame');
    const togglePreviewBtn = m.querySelector('#wwmShareTogglePreview');
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
    const scaleSlider = m.querySelector('#wwmSharePreviewScale');
    const scaleVal = m.querySelector('#wwmSharePreviewScaleVal');
    const scaleClip = m.querySelector('#wwmSharePreviewClip');
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
  window.WWMShare = { shareUrl: _shareBuildUrl };
  window.WWMSidebar = window.WWMSidebar || {};
  window.WWMSidebar.share = {
    shareUrl: _shareBuildUrl,
    loadShared: _loadSharedBuild,
  };
})();
