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
    // 🚨 `$STEADY_MIN_W_ATK:.1f$` は client が実行時に現在値を差し込む書式指定子。
    //    2026-08-04 に desc の出所を長い版 (`description_fu`) へ切り替えたことで混入した。
    //    ツール側は差し込む値を持たないので落とす。直前の「(現在」「（現在」ごと消さないと
    //    「(現在)」という空の括弧が残る (言語ごとに括弧と語が違うので、括弧の対応で消す)
    return s.replace(/[（(][^（()）]*\$[^$]*\$[^（()）]*[)）]/g, '')
      .replace(/\$[^$]*\$/g, '')
      // 🚨 色タグは `#Y` だけではない。技名に `#J碧玉返露・英#E` (2026-08-05、
      //    才能の適用先の技名で実際に画面へ出た) のように別の文字が来る。
      //    `#<英大文字>` … `#E` を一般形として剥がし、対応する `#E` を持たない
      //    片割れも落とす (python 側 `strip_markup` と同じ規則)
      .replace(/#[A-Z](.*?)#E/g, '$1')
      .replace(/#[A-Z]/g, '')
      .replace(/<([^|<>]+)\|[^<>]*>/g, '$1')
      .replace(/<\/?(?:term|b)>/g, '')
      // pipe 無し用語強調 `<Урон родства>` (2026-07-13、 ru で複数実在確認) → 中身のみ
      .replace(/<([^<>|]{1,64})>/g, '$1');
  }
  function _curLang() { return (window.currentLang) || 'ja'; }
  // 🚨 表見出しの補足括弧が全角固定で、en/de/ru でも「Threshold（Agility）」と出ていた
  //    (2026-08-03)。全角を使うのは ja/zh/zh_tw だけ。ko は半角が通例。
  function _paren(inner) {
    return ['ja', 'zh', 'zh_tw'].indexOf(_curLang()) !== -1 ? `（${inner}）` : ` (${inner})`;
  }
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
  // 🚨 maxPhysATK / minPhysATK の physAtkLabel alias は 2026-08-03 に外した。
  //    alias 先が min/max を潰した「外功攻撃」だったため、呼び側が
  //    `${prefix}${base}力` と ja 決め打ちで組み直しており ko に漢字「力」が出ていた。
  //    今は stat cat に client 公式訳 (MIN_W_ATK / MAX_W_ATK) を持たせて直引きする。
  const _APPLIES_TO_ALIAS = { critRate: 'crit', sympathyRate: 'affinity', elemPen: 'bamboocutPen' };
  function _appliesToLabel(key) {
    if (!key) return '';
    const alias = _APPLIES_TO_ALIAS[key] || key;
    const label = window.WWM_DS.t(alias);
    return (label && label !== alias) ? label : key;
  }
  // minPhysATK/maxPhysATK は min/max を区別して見出しにする (2026-07-15 兄貴指摘、
  // 「外功攻撃力」統一は指示意図でない = 実際に上がる値を見出しにする)。
  // 🚨 以前はここで `${prefix}${base}力` と ja 決め打ちで組んでおり、ko に漢字「力」が
  //    出ていた (2026-08-03 兄貴指摘)。今は stat cat の client 公式訳
  //    (MIN_W_ATK「最小外功攻撃 / 최소 외공 공격」) が min/max を含むので合成不要。
  function _appliesToLabelFull(key) {
    return _appliesToLabel(key);
  }
  // path 攻撃力 label (S3 固定加算列見出し = 「鋼鳴/砕岩/糸操/瞬嵐攻撃力」)
  // 🚨 以前は `_pathLabel(path) + '攻撃力'` と ja 決め打ちで合成しており、
  //    en/de/ru で「Bellstrike攻撃力」「Удар колокола攻撃力」と出ていた (2026-08-03 兄貴指摘)。
  //    client 公式訳が 12 言語そろっているので stat cat のキーから引く
  //    (反映 = scripts/mining/apply/apply_stat_names.py の PRO_ATK_A/B/C/E)。
  const _PATH_ATK_KEY = {
    bellstrike: 'bellstrikeATK', stonesplit: 'stonesplitATK',
    silkbind: 'silkbindATK', bamboocut: 'bamboocutATK',
  };
  function _pathAttackLabel(path) {
    const key = _PATH_ATK_KEY[path];
    const label = key && window.WWM_DS.t(key);
    return (label && label !== key) ? label : _pathLabel(path);
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

  // 🚨 S2/S5 の effect には負値がある (千紅の傘 20601 s5 = W_ATK_PEN_RDC -20 =
  //    「対象の外功耐性 20 を無効化」)。`+${_formatCap(v)}` だと `+-20` と出る。
  function _signedCap(v, isPct) {
    const t = _formatCap(v, isPct);
    return String(t).charAt(0) === '-' ? t : `+${t}`;
  }

  // ── buffField (buff 本体が持つ効果 field) ──────────────────────────────
  // 🚨 意味は `.claude/run_TODO/武術才能S2S5のcalc反映.md` で buff 説明文と 1 件ずつ
  //    突き合わせて確定したものだけ載せる。**確認が取れていない field は載せない**
  //    (訳を当てると次に読む側が確定情報と誤読する)。載っていない field は画面に出ないので、
  //    `.vrt/statchk.mjs` が出す「data 側の effect 総数」と画面行数の差でその件数が見える。
  // ラベルの置き場が `ui.json` なのは、field 名の公式訳が client に無いため
  // (`build_stat_name_sids.py` で 12 名すべて sid 無し)。ツール独自 UI 文言は
  // `ui.json` が裁量変更可 (`rules/i18n.md`「真実源」)。
  const _BUFF_FIELD_LABEL = {
    buff_resource_max: 'dbKongfuFieldMax',
    change_resource_recover_speed: 'dbKongfuFieldRecoverSpd',
    add_cd: 'dbKongfuFieldCd',
    calc_cause_change: 'dbKongfuFieldDmgDealt',
    calc_suffer_change: 'dbKongfuFieldDmgTaken',
    buff_interjudge_param: 'dbKongfuFieldJudge',
    jianshang_rebound: 'dbKongfuFieldDuration',
    change_spd_rate: 'dbKongfuFieldSpeed',
    buff_attribute_value: 'dbKongfuFieldStatChange',
    // 2026-08-05 追加。`survey_buff_field_codes.py` で全 buff の説明文 (zh_cn) を並べて確定:
    //   skill_charge_resource_cost_change  buff=200177「蓄力技耐力消耗和造成伤害均提升4%」
    //   immune_damage        code=1 が 89 件、すべて「无敌」「免疫伤害」
    //   immnue_damage_times  code=255 が 74 件、すべて「无敌」系 (255 = 無制限)
    skill_charge_resource_cost_change: 'dbKongfuFieldChargeCost',
    immune_damage: 'dbKongfuFieldImmune',
    // 🚨 `immnue_damage_times` (client 側の綴りのまま) は画面に出さない。
    //    20901 S5 の値は [255, 1] で、255 は「無効化回数の上限なし」を意味する内部値
    //    (74 件すべて「无敌」系の buff)。「無効化回数 +255」と出すと回数に読める。
    //    意味は確定しているので `report_talent_calc_candidates.py` 側 (選定用) には載せる
    // 🚨 `thruster_mag` は buff 一般では推力 / 引力 ([code, 距離, 力, 力] の 4 要素) だが、
    //    才能側では **参照ステの段階閾値の列**として使われている。
    //      10202 S5 [0.12, 0.14 … 0.3] = 説明文「会意率が 10% を超えた分、2% ごとに 1 点、最大 10 点」
    //      20103 S5 [50000]            = 説明文「気血最大値が 50000 に達すると」
    //    既存の「閾値」ラベルを流用する (S1/S3 の表と同じ語)
    thruster_mag: 'dbKongfuColThreshold',
  };
  // 🚨 率で持つ field。それ以外は秒 / 点 / 実数なので %化しない。
  //    `_formatCap` の「値 < 1 なら %化」を一律に当てると `add_cd [0.5]`
  //    (= 説明文「CD が 0.5 秒短縮」) が「+50.0%」と出る
  const _BUFF_FIELD_PCT = new Set(['change_resource_recover_speed', 'calc_cause_change',
    'calc_suffer_change', 'jianshang_rebound', 'buff_interjudge_param',
    'skill_charge_resource_cost_change']);
  // 🚨 率と実数が混ざる field。`thruster_mag` は 10202 S5 が会意率 (0.3 = 30%)、
  //    20103 S5 が気血上限 (50000) で、同じ field に両方入る。
  //    `_formatCap` の「値 < 1 なら %化」に任せる
  const _BUFF_FIELD_AUTO = new Set(['thruster_mag']);
  // 値でなく **状態フラグ** の field。値を出さずラベルだけ出す
  // (`ABR_AVOID_PROB` の「軽傷にならない」と同じ形)。
  // `immune_damage [1, 2]` の 89 件はすべて「无敌」「免疫伤害」で、1 / 2 は種別コード
  const _BUFF_FIELD_FLAG = new Set(['immune_damage']);

  // 🚨 率で持つ field は **値の大小によらず必ず %化する**。`_formatCap` の
  //    「値 < 1 なら %化」を通すと `calc_suffer_change [[12, -1]]`
  //    (= 真気ダメージ -100%) が「-1」と出て、-1 ポイントに読める (2026-08-05 修正)
  function _buffFieldText(v, mode) {
    if (mode === 'auto') return _signedCap(v, true);
    if (mode !== 'pct') return _signedCap(v, false);
    const t = `${(v * 100).toFixed(1)}%`;
    return t.charAt(0) === '-' ? t : `+${t}`;
  }

  // 値の並びが field ごとに違う。どこが効果量かは run_TODO で説明文と突き合わせ済み
  function _buffFieldValues(e) {
    // 🚨 同じ buff ID に複数レコードが在る形。`read_bin_table` は片方しか返さないので
    //    build が `altValues` に全部持たせてある。20501 S5 は table 側が 0.2 を返すが
    //    説明文は「40%増加」で、正しいのは altValues 側の 0.4。**両方出す**
    //    (どちらが実機かは兄貴にしか確認できない)
    if (Array.isArray(e.altValues) && e.altValues.length) return e.altValues;
    const v = e.value;
    if (typeof v === 'number') return [v];
    if (!Array.isArray(v) || !v.length) return [];
    switch (e.field) {
      // [[リソースコード, 下限, 上限]]。10202 S5 の [[5, 0, 10]] が説明文「気力上限 +10」と一致
      case 'buff_resource_max':
        return v.map(a => (Array.isArray(a) ? a[a.length - 1] : a));
      // [[コード / buff ID, 値]]
      case 'change_resource_recover_speed':
      case 'calc_cause_change':
      case 'calc_suffer_change':
      case 'jianshang_rebound':
        return v.map(a => (Array.isArray(a) ? a[1] : a));
      // [コード, 値] = ネストしない 2 要素
      case 'buff_interjudge_param':
        return v.length > 1 ? [v[1]] : [];
      // [[5, 0.04]] = リソースコード + 率 (200177「蓄力技耐力消耗…提升4%」と一致)
      case 'skill_charge_resource_cost_change':
        return v.map(a => (Array.isArray(a) ? a[1] : a));
      // 🚨 才能側では **参照ステの段階閾値の列**。最後 = 最大到達点だけを出す
      //    (10202 S5 の [0.12 … 0.3] は 2% 刻みの 10 段、20103 S5 は [50000] の 1 段)
      case 'thruster_mag':
        return typeof v[v.length - 1] === 'number' ? [v[v.length - 1]] : [];
      // 🚨 第1要素だけが秒数。20402 S5 の [1, 4] は説明文「1秒ごとに追加獲得できる回数は
      //    最大4回まで」で、4 は**回数**であって CD ではない。全要素を出して
      //    「クールタイム +1 / +4」と誤表示していた (2026-08-05 修正)
      case 'add_cd':
        return typeof v[0] === 'number' ? [v[0]] : [];
      // 全 path 分が同じ値で並ぶ (20801 S5 の [-16 x5] = 全 path 耐性 -16)
      case 'buff_attribute_value':
        return v.slice(0, 1);
      default:
        return [];
    }
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
            <th>${_esc((window.T && window.T.dbKongfuColThreshold) || '閾値')}${_esc(_paren(fromLabel))}</th>
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
            <th>${_esc((window.T && window.T.dbKongfuColThreshold) || '閾値')}${_esc(_paren(s3FromLabel))}</th>
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
  // ── S2/S5 の効果量 (2026-08-03 追加)。data/kongfu_passive_skills.json の
  // s2/s5[].effects に client 実データが入るようになった。出所は
  //   才能 psid -> passive_skills.buff_id -> buff.passive_effect -> buff_passive_data
  // 2 形ある:
  //   kind='ref'   参照ステ依存。効果量 = min(floor(参照ステ / step) * per, cap)
  //   kind='fixed' 固定値。効果量 = value
  // 🚨 ゲージ上限増加 / 状態付与 / スタック管理 の才能は effects が空 (欠落ではない)。
  //    その場合は何も描かず、従来どおり title/desc の箇条書きだけになる。
  function _renderS2S5Effects(r, lang) {
    const eff = (r && r.effects) || [];
    if (!eff.length) return '';
    // 各分岐は **本文だけ**を返す。対象 (どの技に乗るか) は最後に付ける
    const body = e => {
      // 🚨 ABR_AVOID_PROB は上昇量でなく **軽傷 (擦り傷) 回避の ON/OFF フラグ** (2026-08-03)。
      //    client 実データは全件 value=1.0。desc は「重撃溜め技・不義天誅シリーズの技は
      //    必ず軽傷にならない」(天志の拳 20901 s5) /「溜め技とその派生技は軽傷を与えられない」
      //    (断魂 20401 s5)。断魂の tooltip だけ「必ず命中し」と書かれているが ja 訳の揺れで、
      //    desc 側の「軽傷」が実体。パーセント扱いすると「+1」と出て意味不明になる。
      if (e.stat === 'ABR_AVOID_PROB') {
        if (!e.value) return '';
        const t = (window.T && window.T.dbKongfuNoGraze) || '軽傷にならない';
        return t;
      }
      // 🚨 kind='event' は client の `effect_event [1.0, X]` 由来で **stat 名を持たない**
      //    (2026-08-04 追加。蛇神 10201 s5 の持続性ダメージ / 流血、誘魂 20602 s5 の奇術 等)。
      //    どのダメージに乗るかは同じ箇条書きに出ている説明文にしか書かれていないので、
      //    ここでは **値だけ**を出す。ラベルを ja 決め打ちで合成すると他言語で日本語が出るし、
      //    「ダメージ」等の汎用語を当てると持続性 / 流血 / 奇術の区別が消える
      //    ([[i18n-verify-by-rendered-text-not-keys-2026-08-04]])。
      if (e.kind === 'event') {
        if (e.value == null) return '';
        return _signedCap(e.value, true);
      }
      // 🚨 kind='resource' = リソースの付与量 (client の `effect_normal [103, 種別, 0, 量]`)。
      //    2026-08-05 追加。それまで build が `effect_normal` を「次の buff へ降りる」
      //    ためだけに読んでいたので、**リソース付与が 11 件まるごと data に無かった**
      //    (10101 S5 r2「10 の気力が回復する」/ 20601 S5 r2「繁華値を 3 ポイント返還」)。
      //    リソース名は `game.json` の `talent_cond_term.resource<N>` (client 由来、12 言語)。
      //    🚨 名前が引けない種別は **値だけ**出す。ja を決め打ちで合成すると他言語で
      //       日本語が出る ([[i18n-verify-by-rendered-text-not-keys-2026-08-04]])。
      //       現状 resource 30 (繁花値) が該当 = client に単独 record が無く、
      //       `繁花` 単独 sid は en が Blossoms / Blossom で割れていて多数派を取れない
      if (e.kind === 'resource') {
        if (e.value == null) return '';
        const nm = window.WWM_DS
          && window.WWM_DS.name('talent_cond_term', 'resource' + e.resource, lang);
        const amount = _signedCap(e.value, false);
        return (nm && nm.indexOf('[') !== 0) ? `${nm} ${amount}` : amount;
      }
      // 🚨 kind='buffField' = buff 本体が持つ効果 field (add_cd / calc_cause_change /
      //    buff_resource_max 等)。2026-08-04 に data へ入れたが**ここに分岐が無く、
      //    下の ref 用の分岐に落ちて `undefined` の空行が画面に出ていた** (2026-08-05 修正)。
      //    `.vrt/statchk.mjs` は内部名残りしか見ないので素通りした。
      //
      //    🚨 一度これを「出さない」で塞いだが**それは claude の独断**だった
      //       (兄貴 GO は「DBには反映して」)。説明文に書いてあるから省略できる、とも
      //       考えたがそれも誤り — 兄貴 fact「tooltip 表記はあまりアテにならん。
      //       effects として持ってるのが正しい」。**client の値を出す方に意味がある。**
      //
      //    field 名の公式訳は client に無い (`build_stat_name_sids.py` で 12 名すべて
      //    sid 無し)。リソース名 (気力 / 戦意 / 刀勢 / 天志) 単体も `game.json` に無いが、
      //    才能名の側に入っている (「気力上限増加」等) ので、効果量欄は**枠組み語**だけでよい。
      //    ラベルは `ui.json` (ツール独自 UI 文言 = 裁量変更可、`rules/i18n.md`) に置く。
      if (e.kind === 'buffField') {
        const lk = _BUFF_FIELD_LABEL[e.field];
        // 意味が未確定の field (thruster_mag / skill_charge_resource_cost_change /
        // immune_damage / immnue_damage_times) は値の並びも単位も読めていないので出さない。
        // 件数は `.vrt/statchk.mjs` の「data 側の effect 総数」と画面行数の差で見える
        if (!lk) return '';
        const label = (window.T && window.T[lk]) || lk;
        // 値でなく状態そのものを表す field はラベルだけ出す
        if (_BUFF_FIELD_FLAG.has(e.field)) {
          return label;
        }
        const vals = _buffFieldValues(e);
        if (!vals.length) return '';
        const mode = _BUFF_FIELD_PCT.has(e.field) ? 'pct'
          : (_BUFF_FIELD_AUTO.has(e.field) ? 'auto' : 'raw');
        return `${label} ${vals.map(v => _buffFieldText(v, mode)).join(' / ')}`;
      }
      const label = _appliesToLabelFull(_statKeyOf(e.stat));
      if (e.kind === 'fixed') {
        return `${label} ${_signedCap(e.value, true)}`;
      }
      const refLabel = _appliesToLabelFull(_statKeyOf(e.ref));
      const capTxt = _signedCap(e.cap, true);
      // 🚨 need は **上限に達するのに要る参照ステの量**で、上がる値ではない (2026-08-03 兄貴指摘)。
      //    「/ 最大外功攻撃力 1000」だと最大外功攻撃力が 1000 上がるように読める。
      //    tooltip の言い方も「1000 の<最大外功攻撃力>が必要」。S1/S3 の表と同じ「閾値」を付ける。
      const thLabel = (window.T && window.T.dbKongfuColThreshold) || '閾値';
      // 🚨 参照ステが率 (CRI_PROB / BASH_PROB) の時、need も率で入っている。
      //    Math.round() だけ通していたので「閾値 会心率 0」と出ていた (2026-08-04 兄貴指摘、
      //    実機 tooltip は「20% の会心率で 9%」)。cap 側と同じ規則 (_formatCap の
      //    「値 < 1 なら %化」) を当てる。生数値側 (最小外功攻撃 249.99 等) は従来通り丸める。
      const needVal = Math.abs(e.need) < 1 ? e.need : Math.round(e.need);
      const needTxt = e.need == null ? ''
        : ` / ${thLabel} ${refLabel} ${_formatCap(needVal, true)}`;
      return `${label} ${capTxt}${needTxt}`;
    };
    const rows = eff.map(e => {
      const t = body(e);
      if (!t) return '';
      // 🚨 対象は **effect ごと**に出す。rank 単位でまとめると混ざる
      //    (10302 S2 = 3 つが「春月増華」だけ / 1 つが「春月増華 + 溜め技」)
      const tgt = _effectTarget(e, lang);
      return `<div class="wwm-db-kongfu-bullet-eff">${_esc(t)}${
        tgt ? `<span class="wwm-db-kongfu-bullet-eff-tgt">${_esc(tgt)}</span>` : ''}</div>`;
    }).join('');
    // 🚨 同じ表示になる行を畳む。client には **効果量が同じで条件だけ違う**行が並ぶことがある
    //    (蛇神 10201 s2 = 会意攻撃強化 +6% が「持続性ダメージ時」と「流血 buff 保持時」の 2 本)。
    //    data 側は条件が違う別効果なので 2 本のまま持つのが正しいが、条件を画面に出していない
    //    今は同じ行が 2 回出るだけになる。**data を削らず表示側で畳む。**
    const seen = new Set();
    const uniq = rows.split('</div>').filter(Boolean).map(s => s + '</div>')
      .filter(h => !seen.has(h) && seen.add(h));
    return `<div class="wwm-db-kongfu-bullet-effs">${uniq.join('')}</div>`;
  }

  // client の内部 stat 名 -> tool の statKey。表示ラベル解決に使う。
  // 対応が無いものは内部名のまま出す (欠落を隠さない)。
  // 🚨 右辺は `data/i18n/game.json` に **実在するキー**であること。
  //    physDmgBoost / bamboocutDmgBoost / outerPen は game.json に無く、
  //    それぞれ weaponBonusLabel / elemDmgBamboocutLabel / physPen が対応する
  //    (2026-08-03 に stat / affix_stat / stat_short を grep して確認)。
  const _CLIENT_STAT_TO_KEY = {
    MIN_W_ATK: 'minPhysATK', MAX_W_ATK: 'maxPhysATK',
    W_ATK_CRI_UP: 'critBoost', BASH_UP: 'sympathyBoost',
    // 🚨 ADD_CRI_PROB を addCritRate に当てていたのは誤り (2026-08-04 兄貴指摘)。
    //    client は会心率を 4 つの internal 名で持つ:
    //      CRI_PROB           会心率     Critical Rate            基本値
    //      ADD_CRI_PROB       会心率付加  Bonus Critical Rate      才能が持つのはこれ
    //      DIRECT_CRI_PROB    付加会心率  Direct Critical Rate     = tool の addCritRate
    //      EFFECTIVE_CRI_PROB 実効会心率  Effective Critical Rate  = tool の critRateBoosted
    //    tool の addCritRate は ja「付加会心率」/ en「Direct Critical Rate」で
    //    DIRECT_CRI_PROB と一致する **別 stat**。才能で上がるのは実効会心率 (兄貴 fact)。
    //    会意側も同型 (ADD_BASH_PROB / DIRECT_BASH_PROB / EFFECTIVE_BASH_PROB) だが
    //    S2/S5 の effect に ADD_BASH_PROB は出ない。
    ADD_CRI_PROB: 'critRateBoosted', CRI_PROB: 'critRate', BASH_PROB: 'sympathyRate',
    W_ATK_SCALE: 'weaponBonusLabel', PRO_ATK_E_SCALE: 'elemDmgBamboocutLabel',
    W_ATK_PEN: 'physPen', PRO_PEN_A: 'bellstrikePen', PRO_PEN_B: 'stonesplitPen',
    HP_MAX: 'maxHp',
    // 2026-08-04 追加。S2/S5 に effect_event 経路を足したら嵐雷の槍 20103 s2 で新たに取れた
    // (「受ける外功ダメージが減少」)。公式訳は心法 tier テキストの用語タグ
    // <外功ダメージ軽減|780|#C|161> と同じもので、apply_stat_names.py 経由で stat cat へ入れた
    W_DEF_SCALE: 'statPhysDmgReduction',
    // 2026-08-03 追加。公式訳は心法 tier テキストの用語タグ <会心治療強化|780|#C|157> /
    // <外功治療強化|780|#C|162> から 12 言語ぶん引いて data/i18n/game.json の stat cat へ入れた。
    HEAL_CRI_UP: 'statHealCritBoost', W_HEAL_SCALE: 'statPhysHealBoost',
    // 外功耐性 = 既存の affix_stat.physResist (統計ID 158、才能 tooltip の
    // 「20 の<外功耐性|780|#C|158>を無効化する」と一致)
    W_ATK_PEN_RDC: 'physResist',
    // 2026-08-03 追加。用語タグ <名前|780|#C|統計ID> は locale 全体で 30 統計 ID しか無く、
    // この 3 種はそこに載っていない。`scripts/mining/formula/build_stat_name_sids.py` が
    // client の `02 10 <sid> 03 20 <len><internal 名>` を構造から読んで 382 名の
    // 表示名 sid を出すので、そこから 12 言語ぶん引いて stat cat へ入れた
    // (反映 = `scripts/mining/apply/apply_stat_names.py`)。
    // 🚨 GP_DMG_IND の公式訳「真気ダメージパラメータ」は **画面に無い名前**だった
    //    (兄貴確認 2026-08-03)。同じ表に「探索能力」「皇宮通常敵向け手段」等の
    //    画面に出ない項目も混ざっている = 構造から引けた ≠ 画面の名前。
    //    兄貴 GO により ZHENQI_DAMAGE「真気ダメージ」の訳を借りて出す。
    //    DAMAGE_UP も同様で、公式訳「気血ダメージ増幅」は画面に無く、実機は
    //    「気血ダメージ強化」(兄貴 SS)。この文言は stat 表示名テーブルの外にしか無いので
    //    apply_stat_names.py の SID_ADD で sid 直指定して入れている。
    PRO_HEAL_SCALE: 'statElemHealBoost',
    GP_DMG_IND: 'statQiDmg', DAMAGE_UP: 'statHpDmgUp',
    // 2026-08-05 追加。斬雪の刀 20801 S5 の `buff_attribute_value` が path 別耐性を指す。
    // 公式訳は `build_stat_name_sids.py` で 5 種とも 12 言語そろって引けたので
    // `apply_stat_names.py` 経由で stat cat へ入れた (貫通 / 攻撃と同じ体系)
    PRO_DEF_A: 'bellstrikeResist', PRO_DEF_B: 'stonesplitResist',
    PRO_DEF_C: 'silkbindResist', PRO_DEF_D: 'woodslashResist',
    PRO_DEF_E: 'bamboocutResist',
  };
  function _statKeyOf(name) {
    return _CLIENT_STAT_TO_KEY[name] || name;
  }

  // ── 才能が乗る技 (2026-08-05 追加) ──────────────────────────────────────
  // 出所 = `scripts/mining/monthly/build_talent_applies_to_skills.py` (月次)。
  // 技指定の 4 経路 (技側 record の参照 / cond の技 ID / 派生段階 / 技分類) を統合したもの。
  // 🚨 **技を絞る条件を持たない才能は data 側で落としてある** (`source === 'その武術の全技'`)。
  //    全技 (武器技込み) を並べても画面で読めないため。ここに出るのは絞りが在る才能だけ。
  // 🚨 **同じ名前の技 ID が並ぶ** (紅絢香断 の派生が 13 件など)。名前で畳んで出す。
  //    data 側は ID を落とさない (どの派生かは選定や計算で要る)。
  // client の技分類コード -> ツール側の表記。**技 ID へ展開しない** (2026-08-05)。
  // 「溜め技」指定は武器技を含む全ての溜め技に乗るので、その武術の技に絞ると誤り。
  // 🚨 対応付けの根拠 = そのコードを持つ技の名前を並べて確認した (`skills.skill_class`):
  //      104 断蓬飛び / 朝雨軽塵 / 威勢、天を貫く    102 剣・重撃 / 扇・重撃
  //      108 八荒一掃 / 紅絢香断 / 風雷の嘯き        101 剣・軽撃 / 双剣・軽撃
  //        2 縮骨功 / 吐火 / 摂星摘月 (= 奇術)
  //    `skilltype` cat は **兄貴が決めた表記を手で入れる** cat (rules/i18n.md) なので
  //    ここでは既存キーを引くだけで、新しい訳を作らない
  const _SKILL_CLASS_I18N = {
    101: ['skilltype', 'light'],
    102: ['skilltype', 'heavy'],
    104: ['skilltype', 'charged'],
    108: ['skilltype', 'martial'],
    2: ['game_lexicon', 'cardItemQishu'],
  };

  function _skillNameOf(sid, lang) {
    const nm = window.WWM_DS.name('skill_name', sid, lang);
    // lookup miss = '[cat:id]' fallback (data-store.js)。その ID は出さない
    if (!nm || nm.indexOf('[') === 0) return '';
    return _stripGameMarkup(nm);
  }

  // effect 1 個が **どの技に乗るか**。条件は `effects[].when.cond_self` に既に在るので、
  // 別の欄を作らずここから読む。
  // 🚨 **effect ごとに違う。**rank 単位でまとめると混ざる (2026-08-05 兄貴指摘)。
  //    10302 S2 は 3 つの effect が「春月増華」だけ、1 つが「春月増華 + 溜め技」。
  // 🚨 `wield_kongfu` (その武術で殴った時) と分類の **AND** を落とさない。
  //    20401 S2 = `skill_kind=[104]` + `wield_kongfu=[20401]` = 説明文「断魂の刀の溜め技」。
  //    20103 S2 = `skill_kind=[104]` のみ = 説明文「溜め技及びその派生技」= 武術を問わない。
  function _effectTarget(e, lang) {
    const w = (e && e.when) || {};
    const cs = w.cond_self || [];
    let wield = null;
    const classes = [];
    const skills = [];
    const states = [];        // 自分 / 敵が持っている必要がある状態
    const dmgSrcs = [];       // ダメージの発生元の種類 (剣気 / 弾道技 / 持続性)
    // 🚨 条件が参照する ID には 4 空間が混ざる (2026-08-05)。`refKind.space` で分ける。
    //    ローテーション判定では `buff` だけが「その状態を先に作る」= 別の軸
    for (const ck of ['cond_self', 'cond_target']) {
      for (const c of (w[ck] || [])) {
        const rk = c.refKind;
        if (!rk) continue;
        const a = c.args || [];
        if (rk.space === 'dmgSource') {
          const t = (window.T && window.T['dbKongfuDmgSrc' + a[0]]) || '';
          if (t) dmgSrcs.push(t);
        } else if (rk.space === 'skillDerived' && rk.skill) {
          skills.push(rk.skill);
        } else if (rk.space === 'interjudgeTag' || rk.space === 'buff') {
          // buff 名は `talent_cond_buff` cat に 12 言語で入っている
          const t = window.WWM_DS.name('talent_cond_buff', a[0], lang);
          if (t && t.indexOf('[') !== 0) {
            states.push({ text: _stripGameMarkup(t), target: ck === 'cond_target' });
          }
        }
      }
    }
    for (const c of cs) {
      const a = c.args || [];
      if (c.name === 'wield_kongfu') wield = a[0];
      else if (c.name === 'skill_class' || c.name === 'skill_kind') classes.push(...a);
      else if (c.name === 'skill') skills.push(...a);
      else if (c.name === 'skill_stage') {
        // 派生 / 段階 ID (10 桁) は上位 8 桁が技 ID
        for (const x of a) skills.push(String(x).length > 8 ? Number(String(x).slice(0, 8)) : x);
      }
    }
    const seen = new Set();
    const parts = [];
    const kfName = wield ? window.WWM_DS.name('kongfu', wield, lang) : '';
    for (const cl of classes) {
      const m = _SKILL_CLASS_I18N[cl];
      if (!m) continue;   // 対応が付いていないコードは数字で出さない
      const t = window.WWM_DS.name(m[0], m[1], lang);
      if (!t || t.indexOf('[') === 0) continue;
      // 武術指定と AND なら「<武術名> の <分類>」。無ければ分類だけ (= 武器技も含む)
      const s = (kfName && kfName.indexOf('[') !== 0) ? `${kfName} ${t}` : t;
      if (seen.has(s)) continue;
      seen.add(s);
      parts.push(s);
    }
    for (const t of dmgSrcs) {
      if (seen.has(t)) continue;
      seen.add(t);
      parts.push(t);
    }
    for (const sid of skills) {
      const t = _skillNameOf(sid, lang);
      if (!t || seen.has(t)) continue;
      seen.add(t);
      parts.push(t);
    }
    // 🚨 状態は技と別に出す。「その状態を先に作る技をローテに組む」判定になるため
    //    (兄貴 2026-08-05「バフ効果中のみ発動とかもあるし」)
    for (const s of states) {
      const lk = s.target ? 'dbKongfuCondTargetState' : 'dbKongfuCondState';
      const label = (window.T && window.T[lk]) || (s.target ? '敵の状態' : '状態');
      const t = `${label} ${s.text}`;
      if (seen.has(t)) continue;
      seen.add(t);
      parts.push(t);
    }
    return parts.join(' / ');
  }

  // ── condOnly = 効果量を持たない行が持っている条件 (2026-08-05 追加) ────────
  // 出所 = `build_kongfu_talent_s2s5_effects.py` の `cond_only`。
  // `effects` が 1 つも作られない才能 (ゲージ上限 / 状態付与 / スタック管理系) では
  // `when` がどこにも乗らないため、**その才能の条件が画面から丸ごと落ちていた**
  // (2026-08-05 時点で 24 rank / 48 件)。effects 側と同じ `_effectTarget` で本文を組む。
  //
  // 🚨 `trigger` の ja は data 側 (`triggerLabel`) にも入っているが **画面ではそれを使わない**。
  //    build script が付けた開発用の ja 決め打ちなので、他 11 言語で日本語が出る
  //    ([[i18n-verify-by-rendered-text-not-keys-2026-08-04]])。コード -> ui.json のキーで引く。
  //    意味の根拠 = `build_kongfu_talent_s2s5_effects.py` の `TRIGGER_JA`
  //    (全 2934 行を値ごとに集めて buff 説明文 zh_cn の共通項から確定したもの)。
  // 🚨 意味が確定していないコードはラベルを作らない。数字で出しても読めないため出さない
  //    (`_SKILL_CLASS_I18N` と同じ方針)。
  const _TRIGGER_I18N = {
    1: 'dbKongfuTrigger1',       // 「每次造成伤害时」「命中时」
    2: 'dbKongfuTrigger2',       // 条件付きの発動型
    3: 'dbKongfuTrigger3',       // 「自身处于X状态时」
    103: 'dbKongfuTrigger103',   // リソース量の閾値判定
    108: 'dbKongfuTrigger108',   // 「易武技释放完成时」
    110: 'dbKongfuTrigger110',   // 周期処理 (毎秒)
    // 🚨 112 = 回避成功時 (2026-08-05 に当てた。既存 6 個と同じ方法)。
    //      `survey_cond_args.py --trigger` の 112 = 67 行。説明文のある 50 行すべてが
    //      「触发完美闪避」「精准闪避后」「闪避成功抵消敌方攻击后」= 闪避 (回避)。
    //      残り 17 行は説明文でなく buff 名 / ノード名 (「破竹·尘-常驻」「节点1分支2」等)。
    //      才能側とも一致する = 唯一これを持つ 20501 S5 rank2 が
    //      **「完全回避強化 / 完美闪避强化」**、desc も全文が完全回避の話。
    //      「完美/精准」に限らない行 (「闪避成功抵消敌方攻击后」) があるので
    //      ラベルは **回避成功**までに留める (完全回避と書くと狭すぎる)。
    //    兄貴確認はまだ取れていない (claude が今日当てた分)。
    112: 'dbKongfuTrigger112',
  };

  // ── condOnly **だけ**に足す条件 (2026-08-05) ───────────────────────────────
  // 🚨 `_effectTarget` は effects 行と **共用**なので、そこへ足すと効果量の行にも
  //    同じ語が並ぶ (dmgRoute だけで effects 側 84 行が `direct` を持つ)。
  //    今回の指示は condOnly を画面に出すことなので **condOnly 専用**に分ける。
  //    effects 側の表示は 1 文字も変えない。
  //
  // 派生 / 段階 ID (9 桁以上) は上位 8 桁が技 ID (`_effectTarget` の skill_stage と同じ規則)
  function _toSkillId(x) {
    const s = String(x);
    return s.length > 8 ? Number(s.slice(0, 8)) : x;
  }
  // ダメージの発生経路 = `cond_attack` の第3要素。意味は
  // `build_kongfu_talent_s2s5_effects.py` の `DMG_ROUTE` (全 702 行を集計して確定):
  //   2 = 6 件すべて「持続類ダメージ / 異常状態のダメージ」
  //   1 = 121 件が「直接ダメージ」
  //   0 = 575 件。奇術も被ダメージ軽減も混在するので **これ単独では絞れない = 出さない**
  // 🚨 `dot` は既存の `dbKongfuDmgSrc1106`「持続性ダメージ」を使い回す。同じものを指す
  //    語を 2 つ持たせない (蛇神 10201 S5 の説明文「持続性ダメージ+5%」/
  //    zh「受到的所有持续类伤害提升5%」と一致する)。
  // 🚨 `direct` は **client に公式訳が無い** (`locale_zh_cn.json` を全走査して
  //    `直接伤害` / `直接类型伤害` ともに 0 件。`真气直接伤害` のような複合語しか無い)。
  //    ツール独自 UI 文言として ui.json に置く (rules/i18n.md「裁量変更 OK = ui.json のみ」)。
  const _DMG_ROUTE_I18N = { direct: 'dbKongfuCondDmgDirect', dot: 'dbKongfuDmgSrc1106' };
  // 対象の種別 (`cond_target` code 12)。意味の根拠 =
  // `build_kongfu_talent_s2s5_effects.py` の `TARGET_KIND_JA` (才能の説明文と
  // effect の対応で 1 コードずつ確定したもの。6 = プレイヤー / 7・8 = 非プレイヤー 等)。
  // 🚨 これを落とすと **効果量が同じで対象だけ違う行が 1 行に畳まれて消える**。
  //    実例 = 千紅の傘 20601 S5 rank2 の 4 行 (状態 3/5 × 対象 2/6) が画面で 1 行だった。
  // 🚨 ラベルの語は client 公式訳から採った。「首領」= `stat.bossDmg`、
  //    「プレイヤーユニット」= `stat.playerBoostLabel` / `affix_stat.playerUnitDmg` が
  //    12 言語そろって持っている語で、そこに合わせてある (ja「非プレイヤーユニット」は
  //    20603 S5 の tooltip 実文と同じ)。枠組み語なので置き場は `ui.json`。
  // 🚨 condOnly に実在するコードだけ載せる。画面に出せないコードのラベルは
  //    出た文字列で検証できないため作らない (`_SKILL_CLASS_I18N` と同じ方針)。
  const _TARGET_KIND_I18N = {
    2: 'dbKongfuTargetKind2', 3: 'dbKongfuTargetKind3',
    6: 'dbKongfuTargetKind6', 7: 'dbKongfuTargetKind7',
  };
  // 「対象の <名前> が N% 未満」。`dbKongfuCondBelow` (自分側) と別 template なのは
  // 語順が言語で変わるため (ru「{name} цели ниже {pct} %」)。
  function _targetBelowText(name, pct) {
    if (!name || pct == null) return '';
    const tmpl = (window.T && window.T.dbKongfuCondTargetBelow) || '{name} {pct}%';
    return tmpl.replace('{name}', name).replace('{pct}', String(pct));
  }
  // `cond_params` の閾値コード。`COND_PARAM_THRESHOLD` = {99:'100%', 196:'60% 未満', 226:'30% 未満'}。
  // 🚨 99 は「気血恢复至100%时」= **到達時**で「未満」ではない。文型が違うので
  //    このテーブルに入れない (現状 condOnly に 99 は 0 件)。
  const _COND_PARAM_BELOW = { 196: 60, 226: 30 };

  function _condExtraParts(c, lang) {
    const out = [];
    const push = t => { if (t && out.indexOf(t) === -1) out.push(t); };
    for (const x of (c.cond_target || [])) {
      const a = x.args || [];
      if (x.name === 'target_skill') {
        // 🚨 引けない ID は出さない。`2038006` は技でなく `buff_interjudge_point` の
        //    状態タグ (build script の `_REF_INTERJUDGE` = 血爆) で、名前を持つ cat がまだ無い
        for (const s of a) push(_skillNameOf(_toSkillId(s), lang));
      } else if (x.name === 'source_kongfu') {
        // 🚨 cond_self の 24 (その武術で殴った時) と同じ ID 空間だが **相手側から見た条件**。
        //    蛇神 10201 S5 rank2 の説明文「ダメージ元が九変の剣または蛇神の槍を使用している
        //    場合は追加で +5%」/ zh「若伤害来源正在使用积矩九剑或九曲惊神枪」と一致する
        const label = (window.T && window.T.dbKongfuCondSourceKongfu) || 'dbKongfuCondSourceKongfu';
        const ns = a.map(k => window.WWM_DS.name('kongfu', k, lang))
          .filter(n => n && n.indexOf('[') !== 0);
        if (ns.length) push(`${label} ${ns.join(' / ')}`);
      } else if (x.name === 'target_exhausted') {
        // 気竭 = 力尽き。buff ID を持たない条件なので `talent_cond_buff` では引けない。
        // 公式訳を zh anchor で引いて `talent_cond_term` cat へ入れてある
        // (`scripts/mining/apply/apply_talent_cond_term_names.py`)
        const t = window.WWM_DS.name('talent_cond_term', 'state_exhausted', lang);
        if (t && t.indexOf('[') !== 0) {
          const label = (window.T && window.T.dbKongfuCondTargetState) || 'dbKongfuCondTargetState';
          push(`${label} ${t}`);
        }
      } else if (x.name === 'target_kind') {
        const lk = _TARGET_KIND_I18N[a[0]];
        const t = lk && (window.T && window.T[lk]);
        if (t) {
          const label = (window.T && window.T.dbKongfuCondTargetKind) || 'dbKongfuCondTargetKind';
          push(`${label} ${t}`);
        }
      } else if (x.name === 'target_hp_threshold') {
        // args = [閾値 %]。10301 S5 rank2 の説明文「最大気血値の 30% 未満の味方」/
        // zh「低于30%最大气血值的友军」と一致する = **未満**。比較方向を持つ要素が
        // 無く、condOnly にはこの 1 件しか無いので、方向は説明文で確認できた
        // この形だけを出す (別の方向の値が来ても黙って「未満」と出さない)。
        // 名前は client 公式訳 `affix_stat.maxHp`「気血最大値」を引く
        const hp = window.WWM_DS.t('maxHp');
        if (hp && hp !== 'maxHp' && a[0] != null) push(_targetBelowText(hp, a[0]));
      } else if (x.name === 'target_resource_threshold') {
        // args = [リソース種別, 比較方向, 閾値] (build script の `RESOURCE_JA` 節)。
        // 10302 S5 rank2 = [2, 2, 30] で、説明文「対象の真気値が 30% 未満の場合」/
        // zh「对真气值低于30%的目标」と一致する = 方向 2 が **未満**。
        // 🚨 方向 2 以外は実データが無く意味を確認できていないので出さない
        if (Number(a[1]) === 2) {
          const res = window.WWM_DS.name('talent_cond_term', 'resource' + a[0], lang);
          if (res && res.indexOf('[') !== 0 && a[2] != null) push(_targetBelowText(res, a[2]));
        }
      }
    }
    // `cond_params` = 2 要素なら [対象 ID, 量] (10301 S5「自身が召喚した水人の範囲内に
    // いる場合、毎秒露水 +2」)、3 要素なら [対象種別, リソース, 閾値コード or 技 ID]
    const cp = c.cond_params;
    if (Array.isArray(cp) && cp.length === 2) {
      push(_skillNameOf(_toSkillId(cp[0]), lang));
    } else if (Array.isArray(cp) && cp.length >= 3) {
      if (Number(cp[2]) > 100000) {
        push(_skillNameOf(_toSkillId(cp[2]), lang));
      } else {
        const pct = _COND_PARAM_BELOW[cp[2]];
        const res = window.WWM_DS.name('talent_cond_term', 'resource' + cp[1], lang);
        const resT = (res && res.indexOf('[') !== 0) ? res : '';
        if (pct != null) {
          const tmpl = (window.T && window.T.dbKongfuCondBelow) || '{pct}%';
          push(`${resT ? resT + ' ' : ''}${tmpl.replace('{pct}', String(pct))}`);
        } else {
          push(resT);
        }
      }
    }
    // 発生経路は最後 = 技 / 状態より絞りが弱い補足
    const rk = _DMG_ROUTE_I18N[c.dmgRoute];
    if (rk) push((window.T && window.T[rk]) || '');
    return out;
  }

  function _renderCondOnly(r, lang, slotKey) {
    const list = (r && r.condOnly) || [];
    if (!list.length) return '';
    // 🚨 同じ表示になる行を畳む。client には **効果が違って条件だけ同じ**行が並ぶ
    //    (10101 S5 rank2 = 「条件を満たした時 / 縦横・内一 …」が 2 行)。
    //    data 側は別行のまま持つのが正しいので、表示側で畳む (effects 側と同じ扱い)。
    //    畳んだ分を数えられるよう、畳んだ元の添字を全部 `data-cond-src` に残す
    //    (これが無いと「画面に出ていない condOnly が何件か」を DOM から数えられない)
    const order = [];
    const byText = new Map();
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const key = _TRIGGER_I18N[c && c.trigger];
      const trg = key ? ((window.T && window.T[key]) || '') : '';
      // 条件本文は effects と同じ経路。`_effectTarget` は `e.when` を読むので同じ形で渡す。
      // そこに condOnly 専用の条件 (発生経路 / 対象の技 / ダメージ元の武術 / 力尽き /
      // リソース閾値) を足す。同じ語が両方から出ることがあるので重複は落とす
      const base = _effectTarget({ when: c }, lang);
      const had = new Set(base ? base.split(' / ') : []);
      const tgt = [base].concat(_condExtraParts(c, lang).filter(t => !had.has(t)))
        .filter(Boolean).join(' / ');
      if (!trg && !tgt) continue;   // 出せる文言が 1 つも無い = 画面に出さない
      const text = JSON.stringify([trg, tgt]);
      if (!byText.has(text)) {
        byText.set(text, { trg, tgt, src: [] });
        order.push(text);
      }
      byText.get(text).src.push(`${slotKey}:${r.rank}:${i}`);
    }
    if (!order.length) return '';
    const rows = order.map(text => {
      const o = byText.get(text);
      return `<div class="wwm-db-kongfu-bullet-cond" data-cond-src="${_esc(o.src.join(','))}">${
        o.trg ? `<span class="wwm-db-kongfu-bullet-cond-trg">${_esc(o.trg)}</span>` : ''}${
        o.tgt ? `<span class="wwm-db-kongfu-bullet-cond-tgt">${_esc(o.tgt)}</span>` : ''}</div>`;
    }).join('');
    const label = (window.T && window.T.dbKongfuCondOnly) || 'dbKongfuCondOnly';
    return `<div class="wwm-db-kongfu-bullet-conds">
      <span class="wwm-db-kongfu-bullet-conds-label">${_esc(label)}</span>
      ${rows}
    </div>`;
  }

  // 技側 record が才能 buff を参照する型 (天志の拳 20901 S2 = 鷹隼系 4 技)。
  // 条件欄に出ないので rank 単位で別に出す
  function _renderAppliesToSkills(r, lang) {
    const ids = (r && r.onSkills) || [];
    if (!ids.length) return '';
    const seen = new Set();
    const names = [];
    for (const sid of ids) {
      const t = _skillNameOf(sid, lang);
      if (!t || seen.has(t)) continue;
      seen.add(t);
      names.push(t);
    }
    if (!names.length) return '';
    const label = (window.T && window.T.dbKongfuOnSkills) || '対象の技';
    return `<div class="wwm-db-kongfu-bullet-onskills">${
      _esc(label)} ${_esc(names.join(' / '))}</div>`;
  }

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
      const effHtml = _renderS2S5Effects(r, lang);
      const onSkillsHtml = _renderAppliesToSkills(r, lang);
      const condHtml = _renderCondOnly(r, lang, slotKey);
      return `<li class="wwm-db-kongfu-bullet">
        <div class="wwm-db-kongfu-bullet-head">
          <span class="wwm-db-kongfu-bullet-title">${_esc(titleShown)}</span>
          <span class="wwm-db-kongfu-bullet-unlock">(${_esc(unlockText)})</span>
        </div>
        ${descShown ? `<div class="wwm-db-kongfu-bullet-desc">${_esc(descShown)}</div>` : ''}
        ${effHtml}
        ${onSkillsHtml}
        ${condHtml}
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
    // 🚨 以前は見出しが `rank` / `rank${i+1}` の英字ハードコードで全言語そのまま出ていた
    //    (2026-08-03)。S1 と同じく **列見出しを i18n し、行見出しは数字だけ**にする。
    const rows = (s6.caps || []).map((cap, i) => `<tr>
      <th scope="row">${i + 1}</th>
      <td>+${_pctStr(cap)}</td>
    </tr>`).join('');
    return `
      <section class="wwm-db-kongfu-slot-section wwm-db-kongfu-slot-future">
        <h4 class="wwm-db-kongfu-slot-title">${_esc(_slotTitle(id, 's6', lang, slotFallback))}</h4>
        <p class="wwm-db-kongfu-future-note">${_esc(futureNote)}</p>
        <table class="wwm-db-kongfu-table wwm-db-kongfu-table-s6">
          <thead><tr><th>${_esc((window.T && window.T.dbKongfuColRank) || 'ランク')}</th><th>${_esc((window.T && window.T.dbKongfuColCap) || '上昇量')}</th></tr></thead>
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
