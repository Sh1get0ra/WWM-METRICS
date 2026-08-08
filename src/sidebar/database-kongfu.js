// ── WWMetrics データベース画面 - 武術タブ (2026-07-08 初版) ──
// 左: 18武学一覧 (名前検索)。右: 選択武学の詳細
// (path/weaponType バッジ + description + slot縦積み S1→S3→S2→S5→S4→S6)。
// キャラ非依存の閲覧専用、心法タブと同型パターン。
// Task 5 = 骨格のみ (プレースホルダ表示)。Task 6 = 左一覧 (検索 + icon list) 実装。
// Task 7 = 右詳細 見出し+description枠(常に空、Task4判定)+S1才能表(17段) 実装。
// Task 8 = S3才能表 (path上昇、15段、三重解放) 実装。
// Task 9 = S2/S5箭条書き(固有才能)+S4単発(path属性ダメ強化)+S6汎用4段(十四重解放、現行未実装注記) 実装。
// 右詳細 全slot (S1→S3→S2→S5→S4→S6) 完成。CSS styling は Task 10。
(function () {
  'use strict';
  const _ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => _ESC_MAP[c]); }
  // ゲーム内client原文マークアップ (#Y強調#E、 <技名|ID|#C|kongfuId|skillId>リンク) が
  // kongfu_talent_desc に生文字列で混入 (2026-07-13 兄貴指摘)。 中身のみプレーンテキスト表示に剥がす。
  function _stripGameMarkup(s) {
    if (!s) return s;
    return s.replace(/#Y(.*?)#E/g, '$1')
      .replace(/<([^|<>]+)\|[^<>]*>/g, '$1')
      .replace(/<\/?(?:term|b)>/g, '')
      // pipe 無し用語強調 `<Урон родства>` (2026-07-13、 ru で複数実在確認) → 中身のみ
      .replace(/<([^<>|]{1,64})>/g, '$1');
  }
  function _curLang() { return (window.currentLang) || 'ja'; }
  // ratio(小数、 例 0.81315) → "81.32%" 表示文字列。 (ratio*100).toFixed(2) は IEEE754 誤差で
  // x.xx5 境界値 (例 0.81315) を切り捨て相当に丸める既知バグあり (兄貴 SS 実測 81.32% vs 表示 81.31% で発覚)。
  // Math.round を先に噛ませて整数域で丸めることで誤差回避。
  function _pctStr(ratio) { return (Math.round(ratio * 10000) / 100).toFixed(2) + '%'; }

  let _searchQuery = '';
  let _selectedId = null;
  let _selectedTab = 'talent'; // 'talent' | 'skill'
  let _selectedLv = null; // null = default = currentLvCap

  function _kongfuMap() { return window.WWM_KONGFU || {}; }
  function _passivesMap() { return window.WWM_KONGFU_PASSIVES || {}; }
  function _ladders() { return window.WWM_KONGFU_LADDERS || {}; }
  function _allIds() { return Object.keys(_kongfuMap()).filter(k => /^\d+$/.test(k)); }

  function _kfName(id, lang) {
    const n = window.WWM_DS.name('kongfu', id, lang);
    return n.indexOf('[kongfu:') === 0 ? `ID ${id}` : n;
  }

  function _matchesSearch(id, lang) {
    if (!_searchQuery) return true;
    return _kfName(id, lang).toLowerCase().indexOf(_searchQuery.toLowerCase()) !== -1;
  }

  function _renderList() {
    const lang = _curLang();
    const ids = _allIds().filter(id => _matchesSearch(id, lang));
    if (!ids.length) {
      return `<p class="wwm-db-empty">${_esc((window.T && window.T.dbKongfuEmpty) || '該当する武術がありません')}</p>`;
    }
    return ids.map(id => {
      const sel = id === _selectedId ? 'true' : 'false';
      const kf = _kongfuMap()[id];
      const iconUrl = window.WWM_KONGFU_ICONS && window.WWM_KONGFU_ICONS[id] && window.WWM_KONGFU_ICONS[id].pic_url;
      const iconHtml = iconUrl
        ? `<img class="wwm-db-kongfu-item-icon" data-path="${_esc(kf && kf.path || '')}" src="${iconUrl}" alt="" loading="lazy">`
        : `<span class="wwm-db-kongfu-item-icon wwm-db-kongfu-item-icon-empty" data-path="${_esc(kf && kf.path || '')}"></span>`;
      return `<button type="button" class="wwm-db-kongfu-item" data-db-kongfu-id="${_esc(id)}" aria-selected="${sel}">${iconHtml}<span class="wwm-db-kongfu-item-name">${_esc(_kfName(id, lang))}</span></button>`;
    }).join('');
  }

  // ── path 表示名 (data/i18n/game.json の path cat は pathBase 経由の nested 構造 = WWM_DS.name('path', id) 直引き不可。
  // src/core/data-store.js _injectPathI18nKeys() が 'path'+大文字化 keyで ui cat に合成注入済 (例: pathBellstrike「鋼鳴」)、
  // 既存 callsite (import.js:227 / arsenal.js:22 / xinfa.js:58) と同じ経路で参照する ([[i18n-source-policy]] 実装確認済) ──
  function _capFirst(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function _pathLabel(path) {
    if (!path) return '';
    const key = 'path' + _capFirst(path);
    const label = window.WWM_DS.t(key);
    return (label && label !== key) ? label : path;
  }

  // ── stat key 表示名 (data/i18n/game.json の 'stat' cat は WWM_DS.t(key) 経由で直引き可、
  // 'stat.'+key 形式の合成キーは存在しない。appliesTo の一部 (critRate/sympathyRate/min|maxPhysATK) は
  // 'stat' cat の実キー名と直接一致しないため alias table 経由 (crit/affinity/physAtkLabel、
  // data/stat_display.json:130,147,54 の label_key 突合で確認済)。maxHp は affix_stat cat 直下に
  // 存在 (data/i18n/game.json:831) = WWM_DS.t() の T_CHAIN 経由でそのまま解決可。
  // fromStatKey が "max(body,power)" 等の合成式文字列の場合 (例: 20103) は英数字のみでないため
  // lookup せず生文字列のまま fallback 表示する ──
  // Task 8 (S3) 追加分: kongfu_passive_skills.json の s3.appliesTo 実値を grep 突合した結果、
  // bellstrikePen/stonesplitPen/silkbindPen/elemAtkBoost は data/i18n/game.json 'stat' cat に
  // 同名キーで実在 (grep 確認: game.json:1391,1405,1419,199) = alias 不要、直引きで解決可。
  // 'elemPen' のみ 'stat' cat に同名キー無し (grep 0件) だが、data/kongfu.json 側で
  // elemPen を appliesTo に持つ全3件 (20501/20603/20703) は "path":"bamboocut" +
  // "weaponSpecific":"bamboocut" (game.json 側の実データ = 瞬嵐固有貫通) と確認済 →
  // 'bamboocutPen' (game.json:1433「瞬嵐貫通」) へ alias。bamboocutPen 自体を appliesTo に
  // 持つ passive は現状0件 (elemPen が実質の内部表記)。
  const _APPLIES_TO_ALIAS = { critRate: 'crit', sympathyRate: 'affinity', maxPhysATK: 'physAtkLabel', minPhysATK: 'physAtkLabel', elemPen: 'bamboocutPen' };
  function _appliesToLabel(key) {
    if (!key) return '';
    const alias = _APPLIES_TO_ALIAS[key] || key;
    const label = window.WWM_DS.t(alias);
    return (label && label !== alias) ? label : key;
  }
  // minPhysATK/maxPhysATK は _appliesToLabel だと「外功攻撃」= min/max 区別付かず何が上がるか不明瞭
  // (2026-07-15 兄貴指摘、以前「外功攻撃力」統一は指示意図でない = 実際に上がる値を見出しにする) →
  // 「最小/最大」接頭辞 + 語尾「力」(ja/zh/zh_tw/ko のみ、他言語は英語風スペース区切り) 付与
  function _appliesToLabelFull(key) {
    const base = _appliesToLabel(key);
    if (key === 'minPhysATK' || key === 'maxPhysATK') {
      const T = window.T || {};
      const prefix = (key === 'minPhysATK' ? T.labelMin : T.labelMax) || '';
      const lang = _curLang();
      const isCjk = ['ja', 'zh', 'zh_tw', 'ko'].indexOf(lang) !== -1;
      return isCjk ? `${prefix}${base}力` : `${prefix} ${base}`;
    }
    return base;
  }
  // path 攻撃力 label (S3 固定加算列見出し = 「鋼鳴/砕岩/糸操/瞬嵐攻撃力」)
  function _pathAttackLabel(path) {
    return _pathLabel(path) + '攻撃力';
  }
  // S3 の閾値 fromStat (minBamboocut 等) は 'stat' cat 内 name 経由で「最小瞬嵐攻撃力」形式取得
  // 「力」suffix 付き = 'stat' cat 実データが持っている。 _fromStatLabel (t 経由「最小瞬嵐攻撃」) と別分岐
  function _fromStatLabelFull(key, lang) {
    if (!key) return '';
    if (/^(min|max)[A-Z][a-z]+$/.test(key)) {
      const n = window.WWM_DS.name('stat', key, lang);
      if (n.indexOf('[') !== 0) return n;
    }
    return _fromStatLabel(key);
  }
  function _fromStatLabel(key) {
    if (!key) return '';
    if (/^[A-Za-z]+$/.test(key)) {
      const label = window.WWM_DS.t(key);
      if (label && label !== key) return label;
    }
    // 合成式 (例: "max(body,power)") = 内側の英数字stat key を個別に i18n 化
    // 20103嵐雷の槍 / 20401断魂の刀 の S1 fromStat がこれ ("max(体,力)")
    const composite = key.replace(/[A-Za-z]+/g, tok => {
      const label = window.WWM_DS.t(tok);
      return (label && label !== tok) ? label : tok;
    });
    return composite;
  }

  function _renderHeader(id, kf, lang) {
    const iconUrl = window.WWM_KONGFU_ICONS && window.WWM_KONGFU_ICONS[id] && window.WWM_KONGFU_ICONS[id].pic_url;
    const path = kf.path || '';
    const weapon = kf.weaponType || '';
    const pathLabel = _pathLabel(path);
    const weaponLabel = weapon ? window.WWM_DS.name('weapontype', weapon, lang) : '';
    const pathBadge = path ? `<span class="wwm-db-kongfu-badge" data-path="${_esc(path)}">${_esc(pathLabel)}</span>` : '';
    const weaponBadge = weapon ? `<span class="wwm-db-kongfu-badge wwm-db-kongfu-badge-weapon">${_esc(weaponLabel)}</span>` : '';
    return `
      <div class="wwm-db-kongfu-header">
        ${iconUrl ? `<img class="wwm-db-kongfu-icon" data-path="${_esc(path)}" src="${iconUrl}" alt="">` : ''}
        <h3 class="wwm-db-kongfu-name">${_esc(_kfName(id, lang))}</h3>
        ${pathBadge}${weaponBadge}
      </div>
    `;
  }

  // ── description 枠: Phase A3 判定 = 公式説明文 client mining 不採用 (常に非表示 fallback)。
  // 詳細: docs/superpowers/plans/2026-07-08-database-kongfu.md Task4、kongfu.json.description は内部メモのみ、UI参照禁止 ──
  function _renderDescription(_id, _lang) {
    return '';
  }

  function _formatCap(v, isPct) {
    if (v == null) return '-';
    const abs = Math.abs(v);
    if (isPct) {
      // s1Caps は 0.068 = 6.8% 表記。値<1 なら %化、>=1 ならそのまま (maxHp等の生数値は isPct=false で来る)
      return abs < 1 ? `${(v * 100).toFixed(1)}%` : String(v);
    }
    return String(v);
  }

  const _STAGE_JA = ['一重', '二重', '三重', '四重', '五重', '六重', '七重', '八重', '九重', '十重', '十一重', '十二重', '十三重', '十四重', '十五重', '十六重', '十七重'];
  // stage=0 = client 実データの「初出重0」case (S5 rank1 等) = Task 1 兄貴決定 B により「初期解放」表示
  function _stageLabel(stage) {
    if (stage === 0) return (window.T && window.T.dbKongfuStageInitial) || '初期解放';
    const key = `dbKongfuStage${stage}`;
    return (window.T && window.T[key]) || _STAGE_JA[stage - 1] || `${stage}重`;
  }

  function _renderSlotS1(id, kf, lang) {
    const passives = _passivesMap()[id];
    const s1 = passives && passives.s1;
    if (!s1) return '';
    const L = _ladders();
    const thresholds = L.s1Thresholds || [];
    const lvCaps = L.lvCaps || [];
    const caps = (L.s1Caps && L.s1Caps[s1.appliesTo]) || [];
    const applyLabel = _appliesToLabelFull(s1.appliesTo);
    const fromLabel = _fromStatLabel(s1.fromStatKey);
    const isPctAppliesTo = ['sympathyRate', 'critRate'].indexOf(s1.appliesTo) !== -1;
    const currentLvCap = L.currentLvCap;
    const rows = thresholds.map((th, i) => {
      const stage = i + 1; // 一重 = index0
      const lvCap = lvCaps[i] != null ? lvCaps[i] : '-';
      const cap = caps[i];
      const isCurrent = currentLvCap != null && lvCaps[i] === currentLvCap;
      const capText = cap == null ? '-' : `+${_formatCap(cap, isPctAppliesTo)}`;
      const currentBadge = isCurrent ? `<span class="wwm-db-kongfu-current-badge">${_esc((window.T && window.T.dbKongfuCurrentCap) || '現行キャップ')}</span>` : '';
      return `<tr class="${isCurrent ? 'wwm-db-kongfu-current-cap-row' : ''}">
        <th scope="row">${_esc(_stageLabel(stage))}</th>
        <td>${_esc(String(lvCap))}</td>
        <td>${_esc(String(th))}</td>
        <td>${_esc(capText)}${currentBadge}</td>
      </tr>`;
    }).join('');
    return `
      <section class="wwm-db-kongfu-slot-section">
        <h4 class="wwm-db-kongfu-slot-title">${_esc(_slotTitle(id, 's1', lang, '5行ステータス才能'))}</h4>
        <table class="wwm-db-kongfu-table">
          <thead><tr>
            <th>${_esc((window.T && window.T.dbKongfuColStage) || '突破段階')}</th>
            <th>${_esc((window.T && window.T.dbKongfuColLvCap) || 'Lv上限')}</th>
            <th>${_esc((window.T && window.T.dbKongfuColThreshold) || '閾値')}（${_esc(fromLabel)}）</th>
            <th>${_esc(applyLabel)}</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>
    `;
  }

  // ── S3 = path上昇才能 (15段、三重解放から開始)。pathVariant('normal'|'bellstrike') で
  // 閾値ladderが切替わる (data/kongfu_talent_ladders.json:41-76)。capKind='dmg' のみ %表示、
  // 'pen' 系は生数値 (data/kongfu_talent_ladders.json:236-271、s3Caps.dmg は0.02〜0.148=2.0〜14.8%
  // 表記、s3Caps.pen は4〜29.6の生数値表記で確認済) ──
  function _renderSlotS3(id, kf, lang) {
    const passives = _passivesMap()[id];
    const s3 = passives && passives.s3;
    if (!s3) return '';
    const L = _ladders();
    const pathVariant = s3.pathVariant; // 'normal' | 'bellstrike'
    const thresholds = (L.s3Thresholds && L.s3Thresholds[pathVariant]) || [];
    const fixedAdd = L.s3FixedAdd || [];
    const caps = (L.s3Caps && L.s3Caps[s3.capKind]) || [];
    const lvCaps = L.lvCaps || [];
    const unlockStage = s3.unlockStage || 3;
    const s3Def = (kf.derived || []).find(d => d.slot === 's3');
    const s3FromLabel = _fromStatLabelFull(s3Def && s3Def.from, lang);
    const applyLabel = _appliesToLabelFull(s3.appliesTo);
    const pathAttackLabel = _pathAttackLabel(kf.path);
    const capIsPct = s3.capKind === 'dmg'; // dmg = %表示、 pen = 生数値
    const currentLvCap = L.currentLvCap;
    const rows = thresholds.map((th, i) => {
      const stage = unlockStage + i; // 三重解放 = index0 → stage3
      const lvCap = lvCaps[stage - 1] != null ? lvCaps[stage - 1] : '-';
      const cap = caps[i];
      const fa = fixedAdd[i] || [null, null];
      const isCurrent = currentLvCap != null && lvCaps[stage - 1] === currentLvCap;
      const capText = cap == null ? '-' : `+${_formatCap(cap, capIsPct)}`;
      const faText = (fa[0] == null || fa[1] == null) ? '-' : `+${fa[0]}~${fa[1]}`;
      const currentBadge = isCurrent ? `<span class="wwm-db-kongfu-current-badge">${_esc((window.T && window.T.dbKongfuCurrentCap) || '現行キャップ')}</span>` : '';
      return `<tr class="${isCurrent ? 'wwm-db-kongfu-current-cap-row' : ''}">
        <th scope="row">${_esc(_stageLabel(stage))}</th>
        <td>${_esc(String(lvCap))}</td>
        <td>${_esc(String(th))}</td>
        <td>${_esc(faText)}</td>
        <td>${_esc(capText)}${currentBadge}</td>
      </tr>`;
    }).join('');
    return `
      <section class="wwm-db-kongfu-slot-section">
        <h4 class="wwm-db-kongfu-slot-title">${_esc(_slotTitle(id, 's3', lang, '属性上昇才能'))}</h4>
        <table class="wwm-db-kongfu-table">
          <thead><tr>
            <th>${_esc((window.T && window.T.dbKongfuColStage) || '突破段階')}</th>
            <th>${_esc((window.T && window.T.dbKongfuColLvCap) || 'Lv上限')}</th>
            <th>${_esc((window.T && window.T.dbKongfuColThreshold) || '閾値')}（${_esc(s3FromLabel)}）</th>
            <th>${_esc(pathAttackLabel)}</th>
            <th>${_esc(applyLabel)}</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>
    `;
  }

  // ── slot 見出し = ゲーム内才能パネル表記 (kongfu_talent_title cat の <id>_<slot>_1 = rank1 title)。
  // lookup miss = WWM_DS.name() が '[cat:id]' fallback を返す (data-store.js:297-320) → 事前想定の
  // fallback label を返す。 全 slot section 見出しで共用 (S1/S2/S3/S4/S5/S6) ──
  function _slotTitle(id, slotKey, lang, fallback) {
    const key = `${id}_${slotKey}_1`;
    const name = window.WWM_DS.name('kongfu_talent_title', key, lang);
    return (name && name.indexOf('[') !== 0) ? name : fallback;
  }

  // ── 解放段階 unlock表示 共通 helper (S2/S5/S4 で共用)。dbKongfuUnlockAt = "{stage}解放" placeholder。
  // stage=0 = 初期解放 は それ自体で完結 label のため template で「解放」suffix 付けずそのまま表示 ──
  function _unlockText(stage) {
    if (stage === 0) return _stageLabel(0);
    const tmpl = (window.T && window.T.dbKongfuUnlockAt) || '{stage}解放';
    return tmpl.replace('{stage}', _stageLabel(stage));
  }

  // ── S2/S5 = 固有才能 (箭条書き、rank昇順)。 titleKey/descKey (例 "20501_s2_1") を
  // data/i18n/game.json の kongfu_talent_title / kongfu_talent_desc cat と突合 (Task 3 成果物)。
  // lookup miss = WWM_DS.name() fallback '[cat:id]' 形式 ('[' 始まりで判定、data-store.js:297-320 確認済) →
  // title は #rank に fallback、 desc は空 (非表示) に fallback ──
  function _renderSlotS2S5(id, kf, lang, slotKey) {
    const passives = _passivesMap()[id];
    const items = passives && passives[slotKey];
    if (!items || !items.length) return '';
    const bullets = items.map(r => {
      const title = window.WWM_DS.name('kongfu_talent_title', r.titleKey, lang);
      const desc = window.WWM_DS.name('kongfu_talent_desc', r.descKey, lang);
      const titleShown = title.indexOf('[') === 0 ? `#${r.rank}` : _stripGameMarkup(title);
      const descShown = desc.indexOf('[') === 0 ? '' : _stripGameMarkup(desc);
      const unlockText = _unlockText(r.unlockStage);
      return `<li class="wwm-db-kongfu-bullet">
        <div class="wwm-db-kongfu-bullet-head">
          <span class="wwm-db-kongfu-bullet-title">${_esc(titleShown)}</span>
          <span class="wwm-db-kongfu-bullet-unlock">(${_esc(unlockText)})</span>
        </div>
        ${descShown ? `<div class="wwm-db-kongfu-bullet-desc">${_esc(descShown)}</div>` : ''}
      </li>`;
    }).join('');
    const slotFallback = slotKey === 's2' ? '固有才能' : '固有才能 (第2)';
    return `
      <section class="wwm-db-kongfu-slot-section">
        <h4 class="wwm-db-kongfu-slot-title">${_esc(_slotTitle(id, slotKey, lang, slotFallback))}</h4>
        <ul class="wwm-db-kongfu-bullet-list">${bullets}</ul>
      </section>
    `;
  }

  // ── S4 = path属性ダメ強化 (単発、+50%固定)。 見出しの path 部分は _pathLabel() 経由
  // ('path' cat は data/i18n/game.json 上 pathBase nested構造 = WWM_DS.name('path', id) 直引き不可、
  // l49-58 コメント + _renderHeader 実装と同じ経路。 WWM_DS.name('path', id) を直接使うと
  // fallback '[path:xxx]' になる点に注意) ──
  function _renderSlotS4(id, kf, lang) {
    const passives = _passivesMap()[id];
    const s4 = passives && passives.s4;
    if (!s4) return '';
    const slotFallback = _pathLabel(s4.path) + ((window.T && window.T.dbKongfuSlotS4) || '属性ダメージ強化');
    const unlockText = _unlockText(s4.unlockStage);
    const valuePct = (s4.value * 100).toFixed(1);
    return `
      <section class="wwm-db-kongfu-slot-section">
        <h4 class="wwm-db-kongfu-slot-title">${_esc(_slotTitle(id, 's4', lang, slotFallback))}</h4>
        <ul class="wwm-db-kongfu-bullet-list">
          <li class="wwm-db-kongfu-bullet">
            <div class="wwm-db-kongfu-bullet-head">
              <span class="wwm-db-kongfu-bullet-title">+${valuePct}%</span>
              <span class="wwm-db-kongfu-bullet-unlock">(${_esc(unlockText)})</span>
            </div>
          </li>
        </ul>
      </section>
    `;
  }

  // ── S6 = 付加攻撃強化 (汎用、全18武学共通 caps = kongfu_passive_skills.json 生成時に固定値埋込済)。
  // unlockStage=14 (十四重) は現行 Lv95=十二重上限で未到達 = 常時「現行未実装」注記付き ──
  function _renderSlotS6(id, kf, lang) {
    const passives = _passivesMap()[id];
    const s6 = passives && passives.s6;
    if (!s6) return '';
    const slotFallback = (window.T && window.T.dbKongfuSlotS6) || '付加攻撃強化 (汎用)';
    const futureNote = (window.T && window.T.dbKongfuS6Future) || '※ 十四重解放 (現行未実装)';
    const rows = (s6.caps || []).map((cap, i) => `<tr>
      <th scope="row">rank${i + 1}</th>
      <td>+${_pctStr(cap)}</td>
    </tr>`).join('');
    return `
      <section class="wwm-db-kongfu-slot-section wwm-db-kongfu-slot-future">
        <h4 class="wwm-db-kongfu-slot-title">${_esc(_slotTitle(id, 's6', lang, slotFallback))}</h4>
        <p class="wwm-db-kongfu-future-note">${_esc(futureNote)}</p>
        <table class="wwm-db-kongfu-table wwm-db-kongfu-table-s6">
          <thead><tr><th>rank</th><th>${_esc((window.T && window.T.dbKongfuColCap) || '上昇量')}</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>
    `;
  }

  function _isMobile() { return window.matchMedia && window.matchMedia('(max-width: 600px)').matches; }

  function _refreshList() {
    const root = document.getElementById('dbKongfu');
    if (!root) return;
    const listEl = root.querySelector('[data-db-kongfu-list]');
    if (!listEl) return;
    listEl.innerHTML = _renderList();
    listEl.querySelectorAll('[data-db-kongfu-id]').forEach(btn => {
      btn.addEventListener('click', () => selectId(btn.dataset.dbKongfuId));
    });
  }

  function _attachDetailHandlers(root) {
    if (!root) return;
    root.querySelectorAll('[data-db-kongfu-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        _selectedTab = btn.dataset.dbKongfuTab || 'talent';
        _rerenderDetailBody();
      });
    });
    const lvSel = root.querySelector('[data-db-kongfu-lv-select]');
    if (lvSel) {
      lvSel.addEventListener('change', () => {
        _selectedLv = Number(lvSel.value);
        _rerenderDetailBody();
      });
    }
  }

  function _rerenderDetailBody() {
    const root = document.getElementById('dbKongfu');
    if (!root || !_selectedId) return;
    const bodyEl = root.querySelector('[data-db-kongfu-detail-body]');
    if (!bodyEl) return;
    bodyEl.innerHTML = _renderDetail(_selectedId);
    _attachDetailHandlers(root);
  }

  function selectId(id) {
    _selectedId = id;
    _selectedLv = null; // kongfu 切替時 = default (currentLvCap) にリセット
    const root = document.getElementById('dbKongfu');
    if (!root) return;
    root.querySelectorAll('[data-db-kongfu-id]').forEach(btn => {
      btn.setAttribute('aria-selected', String(btn.dataset.dbKongfuId === id));
    });
    const bodyEl = root.querySelector('[data-db-kongfu-detail-body]');
    if (bodyEl) bodyEl.innerHTML = _renderDetail(id);
    _attachDetailHandlers(root);
    if (_isMobile()) {
      const r = root.querySelector('[data-db-kongfu-root]');
      if (r) r.setAttribute('data-mobile-view', 'detail');
    }
  }

  function _attachControls(root) {
    const searchEl = root.querySelector('[data-db-kongfu-search]');
    if (searchEl) searchEl.addEventListener('input', () => { _searchQuery = searchEl.value; _refreshList(); });
    const backBtn = root.querySelector('[data-db-kongfu-back]');
    if (backBtn) backBtn.addEventListener('click', () => {
      const r = root.querySelector('[data-db-kongfu-root]');
      if (r) r.removeAttribute('data-mobile-view');
    });
  }

  // ── tab bar (才能 / 武術技 切替) ──
  function _renderTabBar(_id, _lang) {
    const talentLabel = (window.T && window.T.dbKongfuTabTalent) || '才能';
    const skillLabel = (window.T && window.T.dbKongfuTabSkill) || '武術技';
    const talentSel = _selectedTab === 'talent';
    const skillSel = _selectedTab === 'skill';
    return `
      <div class="wwm-db-kongfu-tabs" role="tablist">
        <button type="button" class="wwm-db-kongfu-tab" role="tab" data-db-kongfu-tab="talent" aria-selected="${talentSel}">${_esc(talentLabel)}</button>
        <button type="button" class="wwm-db-kongfu-tab" role="tab" data-db-kongfu-tab="skill" aria-selected="${skillSel}">${_esc(skillLabel)}</button>
      </div>
    `;
  }

  // ── talent tab = 既存 slot 群 (順序: S5→S1→S2→S3→S4→S6、ゲーム内才能パネル表示順) ──
  function _renderTalentTab(id, kf, lang) {
    return _renderDescription(id, lang) +
           _renderSlotS2S5(id, kf, lang, 's5') +
           _renderSlotS1(id, kf, lang) +
           _renderSlotS2S5(id, kf, lang, 's2') +
           _renderSlotS3(id, kf, lang) +
           _renderSlotS4(id, kf, lang) +
           _renderSlotS6(id, kf, lang);
  }

  // ── skill tab = 武術技一覧 (data/skilldata/ 由来、Lv dropdown で切替) ──
  // data source = window.WWM_SKILL_DAMAGE (data-store が起動時 eager load、 short key 形)。
  // 2026-07-27: 由来が単一ファイルから data/skilldata/ 分割 (weapon 6 + kongfu 18 + index) へ移行。
  // 技名は素材 (nameFrom/nameRefId/nameSeq) で持ち、data-store が i18n から 12 言語で組み立てる。
  // data-store.js の fetchSkillDamage() が order を辿って short key 形へ復元するので、本 tab は無変更。
  // schema: { <kongfu_id>: { w: weaponType, s: [{ i: skill_id, n: damage_name(zh), t: type, r: { <lv>: [f1,f2,f3,f4,f5] } }] } }
  // 表示 field = 外功係数(f5=[4]) / 外功付加(f3=[2]) / 属性係数(f5 × 1.5、 才能適用後) の 3 列。
  // 属性付加(f2=[1]) は画面非表示 (calc.js 内部用、 memory [[skill-damage-buff-mining-complete-2026-07-08]])。
  function _skillDamageMap() { return window.WWM_SKILL_DAMAGE || {}; }
  function _ladderMeta() { return window.WWM_KONGFU_LADDERS || {}; }
  function _currentLvCap() { return _ladderMeta().currentLvCap || 95; }
  function _availableLvs(skills) {
    const set = new Set();
    for (const s of skills) {
      const rec = s.r || {};
      for (const lv of Object.keys(rec)) set.add(Number(lv));
    }
    return [...set].sort((a, b) => a - b);
  }
  function _skillDisplayName(s, lang) {
    // 表示優先順 (2026-07-10 兄貴 fact 訂正: 逆転):
    // 1. s.ln (build_skill_damage.py で dup label suffix 番号付与済 = 「双剣・軽撃1〜4」等 段番号 保持)
    // 2. skill_name cat (skill_id 共通 anchor = 段番号なし「双剣・軽撃」等 汎用 fallback)
    // 3. s.n (zh 内部名 fallback)
    // 前 (1)(2) 逆 = skill_name cat 優先で 段番号 truncate = 20501001~004 全 「双剣・軽撃」 表示問題
    if (s.ln && s.ln[lang]) return s.ln[lang];
    if (s.i && window.WWM_DS) {
      const n = window.WWM_DS.name('skill_name', s.i, lang);
      if (n && n.indexOf('[skill_name:') !== 0) return n;
    }
    // en fallback (ln.ja ある場合 en/ko でも使える)
    if (s.ln && (s.ln.en || s.ln.ja)) return s.ln.en || s.ln.ja;
    return s.n || `#${s.i}`;
  }

  // skilltype chip = damage_name zh tag anchor で build_skill_damage.py が 'k' field 埋込
  // (light/heavy/charged/special/active/weapon/variedCombo/lightEnhanced/enhanced/other)。
  // WWM_DS.name('skilltype', k) で i18n label 取得、 未定義 = 表示なし
  function _skilltypeChip(s, lang) {
    if (!s.k || !window.WWM_DS) return '';
    const label = window.WWM_DS.name('skilltype', s.k, lang);
    if (!label || label.indexOf('[') === 0) return '';
    return `<span class="wwm-db-kongfu-skill-chip" data-skilltype="${_esc(s.k)}">${_esc(label)}</span>`;
  }
  // 段係数 chip 表示:
  //   (1) s.seg あり (未展開 base + 段係数 array) = 「N 段」+ tooltip = 各段の実 damage %
  //       s.segLabels{ja,en,zh,ko} あり = 「N段目」既定ラベルの代わりに使用 (2026-07-13、貫穿の鏢/虚塵の掃き 段グループ名対応)
  //   (2) s.segTotal + s.segBundle + s.segIdx あり (束ね skill = 20401114 派生技+地面叩き 同時発生)
  //       = 「N 段」+ tooltip = 束ね sub 内訳 (base × sub_mult × 100%)
  //   (3) s.segTotal のみ = 「N 段」chip 単独 (未使用、 将来 束ねなし chip case 用)
  function _segChip(s, curLv, lang) {
    const mults = s.seg;
    if (mults && Array.isArray(mults) && mults.length >= 2) {
      const floats = curLv != null ? (s.r || {})[String(curLv)] : null;
      const baseF5 = floats && floats.length >= 5 ? floats[4] : null;
      const labelArr = s.segLabels && (s.segLabels[lang] || s.segLabels.ja);
      let tooltip;
      if (baseF5 != null) {
        tooltip = mults.map((m, i) => `${labelArr ? labelArr[i] : (i+1)+'段'}=${_pctStr(baseF5 * m)}`).join(' / ');
      } else {
        tooltip = mults.map((m, i) => `${labelArr ? labelArr[i] : (i+1)+'段'}=×${m}`).join(' ');
      }
      return `<span class="wwm-db-kongfu-skill-chip wwm-db-kongfu-skill-chip-seg" title="${_esc(tooltip)}">${mults.length}段</span>`;
    }
    const segTotal = s.segTotal;
    // 束ね対象 = segTotal >= 1 かつ segBundle あり = 「N段」chip (N = active sub 数、 「N sub 合算」の meaning)
    if (typeof segTotal === 'number' && segTotal >= 1) {
      const bundle = s.segBundle;
      const idx = s.segIdx;
      if (Array.isArray(bundle) && typeof idx === 'number') {
        const floats = curLv != null ? (s.r || {})[String(curLv)] : null;
        const rowF5 = floats && floats.length >= 5 ? floats[4] : null;
        const i0 = idx - 1;
        // 段別 sub mult>0 の active sub のみ 束ね対象、 sub 単独 (activeSubs<2) = 束ね対象外 = chip なし
        const activeSubs = bundle.filter(c => c.mults && (c.mults[i0] || 0) > 0);
        if (activeSubs.length >= 2) {
          const sumMult = activeSubs.reduce((a, c) => a + c.mults[i0], 0);
          const baseF5 = rowF5 != null && sumMult > 0 ? rowF5 / sumMult : null;
          if (baseF5 != null) {
            const langKey = (activeSubs[0] && activeSubs[0][lang]) ? lang : 'ja';
            const tooltip = activeSubs.map(c => `${c[langKey]}=${_pctStr(baseF5 * c.mults[i0])}`).join(' + ');
            return `<span class="wwm-db-kongfu-skill-chip wwm-db-kongfu-skill-chip-seg" title="${_esc(tooltip)}">${activeSubs.length}段</span>`;
          }
        }
      }
      return '';
    }
    return '';
  }
  // 2026-07-10 兄貴 fact: skill list 並び順 = 兄貴期待 category 順で sort
  const _SKILL_CAT_ORDER = [
    'light',              // 軽撃
    'lightCharged',       // 軽撃溜め
    'lightVariedCombo',   // 軽撃派生
    'lightEnhanced',      // 強化軽撃 (light 系末尾)
    'heavy',              // 重撃
    'heavyCharged',       // 重撃溜め
    'variedCombo',        // 重撃派生
    'heavyEnhanced',      // 強化重撃 (heavy 系末尾)
    'charged',            // 溜め技 (未振り分け)
    'enhanced',           // 強化技 (未振り分け)
    'active',             // 武術技
    'special',            // 特殊技
    'weapon',             // 武変技
    'other',              // その他
  ];
  function _skillCatOrder(k) {
    const i = _SKILL_CAT_ORDER.indexOf(k);
    return i === -1 ? 999 : i;
  }
  function _renderSkillTab(id, _kf, lang) {
    const dmg = _skillDamageMap()[id];
    if (!dmg || !dmg.s || !dmg.s.length) {
      return `<p class="wwm-db-empty">${_esc((window.T && window.T.dbKongfuSkillEmpty) || '表示可能な武術技がありません')}</p>`;
    }
    // 2026-07-10 兄貴 fact: category 順で sort (元順序 = fable src 順で 兄貴期待違い)
    // stable sort = 同 category 内 元順序 keep
    const skills = dmg.s.slice().sort((a, b) => _skillCatOrder(a.k) - _skillCatOrder(b.k));
    const lvs = _availableLvs(skills);
    if (!lvs.length) {
      return `<p class="wwm-db-empty">${_esc((window.T && window.T.dbKongfuSkillEmpty) || '表示可能な武術技がありません')}</p>`;
    }
    const cap = _currentLvCap();
    let curLv = _selectedLv;
    if (curLv == null || lvs.indexOf(curLv) === -1) curLv = lvs.indexOf(cap) !== -1 ? cap : lvs[lvs.length - 1];
    const lvOptions = lvs.map(lv => `<option value="${lv}" ${lv === curLv ? 'selected' : ''}>Lv${lv}${lv === cap ? ' ★' : ''}</option>`).join('');
    const rows = skills.map(s => {
      const floats = (s.r || {})[String(curLv)];
      const name = _esc(_skillDisplayName(s, lang));
      const chip = _skilltypeChip(s, lang);
      const segChip = _segChip(s, curLv, lang);
      const nameCell = `<div class="wwm-db-kongfu-skill-name-cell">${name}${chip}${segChip}</div>`;
      if (!floats || floats.length < 5) {
        return `<tr><td>${nameCell}</td><td>-</td><td>-</td><td>-</td></tr>`;
      }
      // floats[5] = [f1定数, f2属性付加raw, f3外功付加raw, f4属性係数base=1.0, f5外功係数]
      const f3 = floats[2], f5 = floats[4];
      const physCoefPct = _pctStr(f5);
      const physAdd = f3 == null ? '-' : Math.floor(f3).toString();
      // 属性係数 = 外功係数 × 1.5 (才能適用後、 SS 検証済、 Lv1 = ×1.0 は本表示では簡略化)
      const attrCoefPct = _pctStr(f5 * 1.5);
      return `<tr>
        <td>${nameCell}</td>
        <td>${physCoefPct}</td>
        <td>${physAdd}</td>
        <td>${attrCoefPct}</td>
      </tr>`;
    }).join('');
    const lvLabel = (window.T && window.T.dbKongfuSkillLvLabel) || '表示レベル';
    const cName = (window.T && window.T.dbKongfuSkillColName) || '武術技';
    const cPhysCoef = (window.T && window.T.dbKongfuSkillColPhysCoef) || '外功係数';
    const cPhysAdd = (window.T && window.T.dbKongfuSkillColPhysAdd) || '外功付加';
    const cAttrCoef = (window.T && window.T.dbKongfuSkillColAttrCoef) || '属性係数';
    return `
      <div class="wwm-db-kongfu-skill-controls">
        <label class="wwm-db-kongfu-skill-lv-label">${_esc(lvLabel)}:
          <select class="wwm-db-kongfu-skill-lv-select" data-db-kongfu-lv-select>${lvOptions}</select>
        </label>
      </div>
      <table class="wwm-db-kongfu-table wwm-db-kongfu-skill-table">
        <thead><tr>
          <th>${_esc(cName)}</th>
          <th>${_esc(cPhysCoef)}</th>
          <th>${_esc(cPhysAdd)}</th>
          <th>${_esc(cAttrCoef)}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function _renderDetail(id) {
    const lang = _curLang();
    const kf = _kongfuMap()[id];
    if (!kf) return `<p class="wwm-db-empty">${_esc((window.T && window.T.dbKongfuEmpty) || '武術が見つかりません')}</p>`;
    const tabContent = _selectedTab === 'skill'
      ? _renderSkillTab(id, kf, lang)
      : _renderTalentTab(id, kf, lang);
    return _renderHeader(id, kf, lang) +
           _renderTabBar(id, lang) +
           `<div class="wwm-db-kongfu-tab-content" data-db-kongfu-tab-content>${tabContent}</div>`;
  }

  function render() {
    const root = document.getElementById('dbKongfu');
    if (!root) return;
    root.innerHTML = `
      <div class="wwm-db-kongfu" data-db-kongfu-root>
        <div class="wwm-db-kongfu-list-pane">
          <div class="wwm-db-kongfu-controls">
            <input type="text" class="wwm-db-kongfu-search" data-db-kongfu-search value="${_esc(_searchQuery)}"
              placeholder="${_esc((window.T && window.T.dbKongfuSearchPlaceholder) || '武学名で検索')}"
              aria-label="${_esc((window.T && window.T.dbKongfuSearchPlaceholder) || '武学名で検索')}">
          </div>
          <div class="wwm-db-kongfu-list-inner" data-db-kongfu-list></div>
        </div>
        <div class="wwm-db-kongfu-detail" data-db-kongfu-detail>
          <button type="button" class="wwm-db-kongfu-back" data-db-kongfu-back>${_esc((window.T && window.T.dbKongfuBackToList) || '← 一覧へ戻る')}</button>
          <div data-db-kongfu-detail-body></div>
        </div>
      </div>
    `;
    _attachControls(root);
    _refreshList();
    const ids = _allIds();
    if (!_selectedId || ids.indexOf(_selectedId) === -1) _selectedId = ids[0] || null;
    if (_selectedId) selectId(_selectedId);
    const rootEl = root.querySelector('[data-db-kongfu-root]');
    if (rootEl) rootEl.removeAttribute('data-mobile-view');
  }

  window.WWMSidebar = window.WWMSidebar || {};
  window.WWMSidebar.databaseKongfu = { render, selectId };
})();

export {};
