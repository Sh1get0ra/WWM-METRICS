// ── DataStore (取得層 単一入口) ────────────────────────────────────
// 全言語データを起動時 eager load。 表示層は name(cat, id) で同期取得。
// 詳細設計: docs/superpowers/specs/2026-06-09-data-architecture-redesign-materials.md
// 実装 plan : docs/superpowers/plans/2026-06-09-i18n-unification.md
(function () {
  'use strict';
  // 2026-07-01 Phase2: kongfu/xinfa/sets/skilltype/weapontype/game_lexicon/qishu/
  // stat_short/skilltype_short/kongfu_short/xinfa_tier_label は data/i18n/game.json に統合済。
  // ui (Layer3=ツール独自UI文言) / noClientData (Layer2=mining不可ゲーム用語) のみ個別ファイルとして残置。
  const CATS = ['ui', 'noClientData'];
  // noClientData.json 内で cat 階層を持つ key (= mining 対象外と決めて game.json から移した cat)。
  // ready() 内で data トップへ展開するので name(cat, id) の引き方は移設前と変わらない。
  const NCD_NESTED_CATS = ['skilltype', 'skilltype_short'];
  // t() lookup chain: ui (常用語) → game_lexicon (ゲーム内用語、zh anchor mining対象31キー) → stat (パネル表示59項目、2026-07-03 affix分離済) → affix_stat (affix専用) → noClientData (mining 不可 隔離、係数系ツール独自5キーは 2026-07-04 game_lexicon から移管) → xinfa_tier_label (心法 tier effect text)
  const T_CHAIN = ['ui', 'game_lexicon', 'stat', 'affix_stat', 'noClientData', 'xinfa_tier_label'];
  // 動的 getter 化 (2026-06-25 真因 fix): 旧 const は module 読込時 1 回評価で
  // main.js import 順序 (data-store.js が calc.js より先) で window.WWM_DISPLAY_VERSION 未定義
  // → fallback 11 固定 → 全 i18n fetch URL `?v=11` で browser cache HIT = DISPLAY bump 全無効化されてた
  const getVersion = () => (typeof window !== 'undefined' && window.WWM_DISPLAY_VERSION) || 11;
  // 計算/icon dict (data/*.json) の供給一元化 (P4-mini 2026-06-10)。
  // dictMap の唯一源 = ここ。 window.WWM_* は DataStore が供給する互換 read view (callsite は直読み続行で正式承認)。
  // cache buster は SCORE_VERSION (計算 data) — i18n の DISPLAY_VERSION と独立。
  const CALC_DICTS = {
    WWM_LV95_BASE:        'lv95_base',
    WWM_KONGFU:           'kongfu',
    WWM_XINFA:            'xinfa',
    WWM_XINFA_EFFECTS:    'xinfa_effects',
    WWM_SETS:             'sets',
    WWM_AFFIX:            'affix',
    WWM_PVP_ATTUNE:       'pvp_attune_table',
    WWM_EQUIP_BASE_BY_LV: 'equip_base_by_lv',
    WWM_GUANYIN_LEVELS:   'guanyin_levels',
    WWM_KONGFU_LADDERS:   'kongfu_talent_ladders',
    WWM_KONGFU_PASSIVES:  'kongfu_passive_skills',
    WWM_XINFA_ICONS:      'xinfa_icons',
    WWM_KONGFU_ICONS:     'kongfu_icons',
    WWM_QISHU_ICONS:      'qishu_icons',
    WWM_QISHU_CATEGORIES: 'qishu_categories',
    WWM_AVATAR_ICONS:     'avatar_icons',
    WWM_GEAR_SLOT_ICONS:  'gear_slot_icons',
    WWM_GEAR_RECIPE:      'gear_recipe'
  };
  // affix 選択肢 master (affix_selector/affix_selector_chance) = 選択肢候補の表示/フィルタ用データで
  // スコア計算式そのものは変えない (2026-07-15 ATTUNE master化で判明)。 cache buster は
  // DISPLAY_VERSION (SCORE_VERSION と独立、baseline 無効化を起こさず反映)。
  const DISPLAY_DICTS = {
    WWM_AFFIX_SELECTOR: 'affix_selector',
    WWM_AFFIX_CHANCE:   'affix_selector_chance',
  };
  let currentLang = 'ja';
  const data = Object.create(null); // { kongfu: {...}, xinfa: {...}, ... } (i18n)
  const calc = Object.create(null); // { kongfu: {...}, affix: {...}, ... } (計算/icon dict 内部参照)
  let readyPromise = null;
  let calcPromise = null;

  // 計算/icon dict load (idempotent)。 失敗 = {} で続行 (旧 loadDict 互換、 throw しない)。
  function fetchDict(winKey, fileName, ver) {
    if (typeof window !== 'undefined' && window[winKey]) {
      calc[fileName] = window[winKey]; // 先行ロード分 (テスト注入等) を尊重
      return Promise.resolve();
    }
    return (async function () {
      let d = {};
      try {
        const res = await fetch('data/' + fileName + '.json?v=' + ver);
        if (res.ok) d = await res.json();
        else console.warn('[DataStore] calc dict fetch failed:', fileName, res.status);
      } catch (e) {
        console.warn('[DataStore] calc dict fetch failed:', fileName, e);
      }
      calc[fileName] = d;
      if (typeof window !== 'undefined') window[winKey] = d;
    })();
  }
  // ── 武術技ダメージ = data/skilldata/ 分割 load → 実行時に short key 形へ復元 ──
  // 旧 `data/skill_damage.json` (1行 1.5MB / 省略キー) を weapon 6 + kongfu 18 に分割した
  // (生成 = scripts/mining/monthly/build_skill_damage.py、設計 = run_TODO/skill_damage.jsonスキーマ再設計.md)。
  // 消費側 (database-kongfu.js) は short key 形のまま扱うので、**ここで元の形に戻す**。
  // 🚨 `order` を必ず辿ること。database-kongfu.js は `_SKILL_CAT_ORDER` で stable sort するため、
  //    同カテゴリ内は元の並び順がそのまま画面の並びになる。キー列挙順で組むと表示順が変わる。
  const _SD_FIELDS = {
    skillId: 'i', nameZh: 'n', label: 'ln', origin: 't', skillType: 'k',
    stageMultipliers: 'seg', stageLabels: 'segLabels', bundleTotal: 'segTotal',
    bundleOf: 'segBundle', bundleIndex: 'segIdx', baseSkillId: 'baseId',
  };
  const _SD_COEF = ['skillConst', 'elemAdd', 'physAdd', 'elemCoefBase', 'physCoef'];

  // 技名を **素材から組み立てる** (2026-07-27)。
  // 🚨 以前は `build_skill_damage.py` が「武器名 + 種別名 + 番号」を文字列連結して data に焼き込んで
  //    いた。連結先が ja/en/zh/ko の 4 言語しか無かったため、①言語データが i18n の外に出る
  //    ②12 言語にならない ③「縄鏢・軽撃1」というゲーム内に存在しない名前ができて mining でも
  //    取れない、が同時に起きていた。**番号は表示時に付けるもの**なので、data 側は
  //    `nameFrom` / `nameRefId` / `nameSeq` の素材だけ持ち、ここで i18n を引いて組み立てる。
  //    これで名前は i18n (12 言語) 一本になる。
  // 「武器名 + 種別名 (+ 段番号)」を組み立てる時の**言語別の語順と区切り**。
  // 🚨 全言語で「武器・種別」にしてはいけない。旧データの実測 (2026-07-27):
  //     ja  剣・軽撃1          … 武器 → 種別 / 区切り「・」
  //     en  Sword - Light Attack1 … 武器 → 種別 / 区切り「 - 」
  //     zh  轻击·剑1           … **種別 → 武器** / 区切り「·」
  //     ko  약공격·검1          … **種別 → 武器** / 区切り「·」
  //   weaponType 合成 49 件のうち 45 件で中韓が逆順だった。
  //   zh_tw は zh と同系統、それ以外 (de/es/fr/pt_br/ru/th/vi) は en と同じ語順に倒す。
  //   **素材 (weapontype / skilltype) は全部 12 言語の公式訳**なので、組み立て規則さえ決まれば
  //   12 言語すべてで出せる。4 言語で妥協しない。
  const _SD_NAME_STYLE = {
    _default: { sep: ' - ', typeFirst: false },
    ja:    { sep: '・', typeFirst: false },
    zh:    { sep: '·',  typeFirst: true },
    zh_tw: { sep: '·',  typeFirst: true },
    ko:    { sep: '·',  typeFirst: true },
  };

  function _sdLabel(full, weaponType, i18n) {
    const seq = full.nameSeq;
    if (full.nameFrom === 'skill') {
      const e = i18n.skill_name[full.nameRefId];
      if (!e) return full.label || null;
      const out = {};
      for (const [l, v] of Object.entries(e)) if (v) out[l] = seq ? `${v}${seq}` : v;
      return out;
    }
    if (full.nameFrom === 'weaponType') {
      const w = i18n.weapontype[weaponType];
      const t = i18n.skilltype[full.skillType];
      if (!w || !t) return full.label || null;
      const out = {};
      for (const [l, wv] of Object.entries(w)) {
        const tv = t[l];
        if (!wv || !tv) continue;
        const r = _SD_NAME_STYLE[l] || _SD_NAME_STYLE._default;
        out[l] = (r.typeFirst ? `${tv}${r.sep}${wv}` : `${wv}${r.sep}${tv}`) + (seq || '');
      }
      return out;
    }
    return full.label || null;   // ゲーム内の独自文言 (12 言語化は別途)
  }

  function _sdToShort(full, weaponType, i18n) {
    const s = {};
    for (const [name, short] of Object.entries(_SD_FIELDS)) {
      if (full[name] !== undefined) s[short] = full[name];
    }
    const label = _sdLabel(full, weaponType, i18n);
    if (label) s.ln = label; else delete s.ln;
    const bl = full.byLevel;
    if (bl && bl.lv) {
      const r = {};
      for (let i = 0; i < bl.lv.length; i++) {
        r[String(bl.lv[i])] = _SD_COEF.map(c => bl[c][i]);
      }
      s.r = r;
    }
    return s;
  }

  async function fetchSkillDamage(ver) {
    if (typeof window !== 'undefined' && window.WWM_SKILL_DAMAGE) {
      calc.skill_damage = window.WWM_SKILL_DAMAGE; // 先行ロード分 (テスト注入等) を尊重
      return;
    }
    const out = Object.create(null);
    try {
      // 技名の組み立てに i18n が要る。ready() の i18n load とは並行に走るので、
      // 未着なら自前で取る (同 URL なのでブラウザ/SW キャッシュに乗り二重負荷にはならない)。
      let i18n = { skill_name: data.skill_name, weapontype: data.weapontype, skilltype: data.skilltype };
      if (!i18n.skill_name) {
        const g = await fetch('data/i18n/game.json?v=' + getVersion())
          .then(r => (r.ok ? r.json() : {})).catch(() => ({}));
        i18n = { skill_name: g.skill_name || {}, weapontype: g.weapontype || {}, skilltype: g.skilltype || {} };
      }
      const idxRes = await fetch('data/skilldata/index.json?v=' + ver);
      if (!idxRes.ok) throw new Error('index ' + idxRes.status);
      const idx = await idxRes.json();
      const load = (sub, name) => fetch(`data/skilldata/${sub}/${name}.json?v=${ver}`).then(r => {
        if (!r.ok) throw new Error(`${sub}/${name} ${r.status}`);
        return r.json();
      });
      const [weaponDocs, kongfuDocs] = await Promise.all([
        Promise.all((idx.weapon || []).map(n => load('weapon', n))),
        Promise.all((idx.kongfu || []).map(n => load('kongfu', n))),
      ]);
      const weapon = Object.create(null);
      for (const doc of weaponDocs) weapon[doc.weaponType] = doc;
      for (const doc of kongfuDocs) {
        const list = [];
        for (const key of (doc.order || [])) {
          const w = weapon[doc.weaponType];
          const full = (doc.skills && doc.skills[key]) || (w && w.skills && w.skills[key]);
          if (!full) { console.warn('[DataStore] skilldata: key 未解決', doc.kongfuId, key); continue; }
          const s = _sdToShort(full, doc.weaponType, i18n);
          delete s.appliesTo; // weapon 側だけが持つ紐付け情報 (復元形には出さない)
          list.push(s);
        }
        out[doc.kongfuId] = { w: doc.weaponType, s: list };
      }
    } catch (e) {
      console.warn('[DataStore] skilldata load failed:', e);
    }
    calc.skill_damage = out;
    if (typeof window !== 'undefined') window.WWM_SKILL_DAMAGE = out;
  }

  function ensureCalcData() {
    if (calcPromise) return calcPromise;
    const sv = (typeof window !== 'undefined' && window.WWM_SCORE_VERSION) || 7;
    const dv = getVersion();
    calcPromise = Promise.all([
      ...Object.entries(CALC_DICTS).map(([winKey, fileName]) => fetchDict(winKey, fileName, sv)),
      ...Object.entries(DISPLAY_DICTS).map(([winKey, fileName]) => fetchDict(winKey, fileName, dv)),
      // 武術技DB の表示専用データ (calc.js からの参照 0) なので DISPLAY_VERSION 側で cache bust する。
      // SCORE_VERSION を使うと計算に影響しない変更で baseline 無効化 (再import 促し) が走ってしまう。
      fetchSkillDamage(dv),
    ]).then(function () {});
    return calcPromise;
  }

  // path 系 i18n key を data.path から動的合成して data.ui に注入 (旧 build-labels.js applyPathLabels の (1) 役割)。
  // 旧 form: path<Path> / pathAtk<Path> / pathPen<Path> / pathDmg<Path> / min<Path> / max<Path> (cap)。
  // min<Path> / max<Path> = ranking.js 「調律/定音効率分析」 panel が SL[pathKeys[i]] で引く形式。
  function _injectPathI18nKeys() {
    const path = data.path;
    if (!path || !path.pathBase || !path.affix) return;
    const ui = data.ui = data.ui || {};
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const LANGS = ['ja', 'en', 'zh', 'ko', 'vi', 'de', 'es', 'fr', 'pt_br', 'ru', 'th', 'zh_tw'];
    // vi = 語順反転 (affix 前置 + base 後置)。 例: ja「鋼鳴攻撃」/ vi「Tấn công Minh Kim」
    // path.affix.{atk,pen,dmgUp}.vi は trailing space 付きで採取 (pen.vi="Xuyên thấu " 等)、
    // base.vi は trailing space 無し (pathBase.vi="Minh Kim") → affix + base 連結で自然 spacing。
    const VI_REORDER = true;
    // min<Path>/max<Path> = affix_stat 実測値 (min/max<StatKeyName> 形式、2026-07-03 GroupB archive
    // 実測で兄貴GO済) を直接使う。文字列連結 (prefix+base+atkStat) は言語ごとの語順に対応できず
    // 9言語 (en/de/es/fr/pt_br/ru/th 等) で不自然な表記になっていた (2026-07-25 発覚・修正)。
    const affixStat = data.affix_stat || {};
    for (const [p, base] of Object.entries(path.pathBase)) {
      const C = cap(p);
      const keys = {
        ['path' + C]:    {},
        ['pathAtk' + C]: {},
        ['pathPen' + C]: {},
        ['pathDmg' + C]: {},
        ['min' + C]:     {},
        ['max' + C]:     {}
      };
      const minStat = affixStat['min' + C];
      const maxStat = affixStat['max' + C];
      for (const L of LANGS) {
        const b = base[L]; if (!b) continue;
        const atk = path.affix.atk?.[L] || '';
        const pen = path.affix.pen?.[L] || '';
        const dmg = path.affix.dmgUp?.[L] || '';
        keys['path' + C][L] = b;
        if (VI_REORDER && L === 'vi') {
          keys['pathAtk' + C][L] = atk + b;
          keys['pathPen' + C][L] = pen + b;
          keys['pathDmg' + C][L] = dmg + b;
        } else {
          keys['pathAtk' + C][L] = b + atk;
          keys['pathPen' + C][L] = b + pen;
          keys['pathDmg' + C][L] = b + dmg;
        }
        if (minStat?.[L]) keys['min' + C][L] = minStat[L];
        if (maxStat?.[L]) keys['max' + C][L] = maxStat[L];
      }
      for (const [k, v] of Object.entries(keys)) {
        if (!ui[k]) ui[k] = v; // 既存キー (旧 ui.json 重複) を上書きしない
      }
      // suffix型 <path>Pen (data/affix.json 実 statKey 命名規則。 prefix型 pathPen<Path> とは別に必要、
      // 2026-07-01: 5path系貫通affix4種の表示名解決バグ修正)。
      // affix_stat に実測値があれば優先 (2026-07-25: voidPen は affix_stat に無いので文字列連結 fallback)
      const stat = data.stat = data.stat || {};
      if (!stat[p + 'Pen']) {
        const penStat = affixStat[p + 'Pen'];
        const penEntry = {};
        for (const L of LANGS) {
          const b = base[L]; if (!b) continue;
          if (penStat?.[L]) { penEntry[L] = penStat[L]; continue; }
          const pen = path.affix.pen?.[L] || '';
          penEntry[L] = (VI_REORDER && L === 'vi') ? (pen + b) : (b + pen);
        }
        stat[p + 'Pen'] = penEntry;
      }
    }
    // nonPathBase: path 系合成 (path/pathAtk/pathPen/pathDmg) は不要だが min<Name>/max<Name>
    // 形式のラベルだけ生成したい汎用 base (例: elemSub = 副属性、 path に属さない副属性 ATK)。
    // 2026-06-29: 副属性 base = ui.elemSubBase に移動 (= ツール独自命名、 ゲーム内表記なし)
    const nonPath = { ...(path.nonPathBase || {}) };
    if (ui.elemSubBase) nonPath.elemSub = ui.elemSubBase;
    for (const [p, base] of Object.entries(nonPath)) {
      const C = cap(p);
      const keys = { ['min' + C]: {}, ['max' + C]: {} };
      for (const L of LANGS) {
        const b = base[L]; if (!b) continue;
        const atk = path.affix.atk?.[L] || '';
        const mn  = path.affix.min?.[L] || '';
        const mx  = path.affix.max?.[L] || '';
        if (VI_REORDER && L === 'vi') {
          keys['min' + C][L] = mn + atk + b;
          keys['max' + C][L] = mx + atk + b;
        } else {
          keys['min' + C][L] = mn + b + atk;
          keys['max' + C][L] = mx + b + atk;
        }
      }
      for (const [k, v] of Object.entries(keys)) {
        if (!ui[k]) ui[k] = v;
      }
    }
    // 短縮ステ (stat.<short>) + path.affix 接尾辞 で合成 (例: phys + pen = physPen「外功貫通」)。
    // stat.physPen 物理保持を撤去、 stat.phys + path.affix.pen 合成で代替 (重複解消)。
    const stat = data.stat;
    if (stat) {
      const SHORT_AFFIX = { phys: ['Pen'] }; // 拡張時はここに追加 (例: void: ['Pen','Atk'] 等)
      const SUF_KEY = { Pen: 'pen', Atk: 'atk', Dmg: 'dmgUp' };
      for (const [s, sufs] of Object.entries(SHORT_AFFIX)) {
        // phys は affix 専用 15項目分離 (2026-07-03) で data.affix_stat 側に移動済
        const base = stat[s] || data.affix_stat?.[s]; if (!base) continue;
        for (const suf of sufs) {
          const k = s + suf;
          const v = {};
          const affKey = SUF_KEY[suf];
          for (const L of LANGS) {
            const b = base[L]; if (!b) continue;
            const af = path.affix[affKey]?.[L] || '';
            v[L] = (VI_REORDER && L === 'vi') ? (af + b) : (b + af);
          }
          if (!ui[k]) ui[k] = v;
        }
      }
    }
  }

  function ready() {
    if (readyPromise) return readyPromise;
    const i18nLoad = Promise.all([
      ...CATS.map(async (cat) => {
        const res = await fetch('data/i18n/' + cat + '.json?v=' + getVersion());
        if (!res.ok) throw new Error('DataStore: failed to fetch ' + cat + '.json (' + res.status + ')');
        data[cat] = await res.json();
        // noClientData だけ 2 構造が混在する。 従来の 7 key (probSympathy 等) は key 直下が
        // lang map の flat 形で、 t() の T_CHAIN から直接引く。 NCD_NESTED_CATS は cat 階層を
        // 持つ入れ子形で、 data トップへ展開して name(cat, id) から引けるようにする
        // (2026-07-29: mining 対象外と決めた cat を game.json から移した際に追加、 data-schema.md 参照)。
        if (cat === 'noClientData') {
          for (const nested of NCD_NESTED_CATS) {
            if (data[cat] && data[cat][nested]) data[nested] = data[cat][nested];
          }
        }
      }),
      (async () => {
        // 2026-07-01: stat/path (Phase1) + kongfu/kongfu_short/xinfa/xinfa_tier_label/sets/qishu/
        // weapontype/game_lexicon/stat_short (Phase2) 統合 (data/i18n/game.json)
        // 🚨 skilltype/skilltype_short は 2026-07-29 に noClientData.json へ移した (mining 対象外化)
        const res = await fetch('data/i18n/game.json?v=' + getVersion());
        if (!res.ok) throw new Error('DataStore: failed to fetch game.json (' + res.status + ')');
        const game = await res.json();
        for (const [k, v] of Object.entries(game)) data[k] = v;
      })()
    ]).then(() => { _injectPathI18nKeys(); });
    // 計算 dict も同時 load (i18n 失敗 = throw / calc 失敗 = {} 続行 の従来semantics維持)
    readyPromise = Promise.all([i18nLoad, ensureCalcData()]).then(() => {});
    return readyPromise;
  }

  function setLang(lang) {
    currentLang = lang;
  }

  function getLang() {
    return currentLang;
  }

  function _has(cat, id) {
    return !!(data[cat] && Object.prototype.hasOwnProperty.call(data[cat], String(id)));
  }

  // 武術 affix prefix → kongfu id (旧 build-labels.js MARTIAL_PREFIXES。 長さ降順、 短 prefix が長 prefix を吸う bug 防止)
  const MARTIAL_PREFIXES = [
    { prefix: 'heavenwillGauntlets', id: 20901 },
    { prefix: 'infernalTwinblades', id: 20501 },
    { prefix: 'unfetteredRopeDart', id: 20702 },
    { prefix: 'mortalRopeDart',     id: 20701 },
    { prefix: 'skygraspRopeDart',   id: 20703 },
    { prefix: 'namelessSword',      id: 10102 },
    { prefix: 'namelessSpear',      id: 10202 },
    { prefix: 'stormbreaker',       id: 20103 },
    { prefix: 'everspringUmb',      id: 20603 },
    { prefix: 'soulshadeUmb',       id: 20602 },
    { prefix: 'phalanxbane',        id: 20402 },
    { prefix: 'snowparting',        id: 20801 },
    { prefix: 'panaceaFan',         id: 10301 },
    { prefix: 'moBlade',            id: 20401 },
    { prefix: 'sword',              id: 10101 },
    { prefix: 'spear',              id: 10201 },
    { prefix: 'bleed',              id: 10101 },
    { prefix: 'fan',                id: 10302 },
    { prefix: 'umb',                id: 20601 }
  ];
  const SUFFIX_TO_SKILL = {
    'Q': 'martial', 'Charged': 'charged', 'Special': 'special', 'Drone': 'drone',
    'Light': 'light', 'Heavy': 'heavy', 'Rodent': 'rodent', 'Shield': 'shield', 'Healing': 'healing',
    'LightVariedCombo': 'lightVariedCombo', 'VariedCombo': 'variedCombo', '': 'bleed'
  };

  function _kongfuWeaponType(id) {
    // 内部 calc 参照優先 (層逆転解消)。 ready() 前の呼出のみ window fallback (互換)
    const kf = calc.kongfu || (typeof window !== 'undefined' && window.WWM_KONGFU) || null;
    if (kf && kf[String(id)]) return kf[String(id)].weaponType || null;
    return null;
  }

  function _lookup(cat, id, lang) {
    const d = data[cat];
    if (!d) return null;
    const entry = d[String(id)];
    if (!entry) return null;
    return entry[lang] || entry.en || entry.ja || null;
  }

  function _martialAffix(key, lang) {
    const def = MARTIAL_PREFIXES.find(function (d) { return key.indexOf(d.prefix) === 0; });
    if (!def) return null;
    const suffix = key.slice(def.prefix.length);
    const skillKey = SUFFIX_TO_SKILL[suffix];
    if (!skillKey) return null;
    // 短縮版優先 (武具対照 modal + import preview + 防具 affix6 dropdown の
    // 武術固有 affix 文字切れ救済)。 真実源 (kongfu/skilltype cat) 不変 keep、
    // 表示時 fallback only。 short miss 時は通常 lookup chain。
    //
    // 2026-07-29: skilltype_short を **全言語** 参照に変更 (旧: vi 時のみ)。
    // DB 画面 chip 用に skilltype 側へ「技」相当を付けた (軽撃派生 → 軽撃派生技) が、
    // attune affix 名は「kongfu 名 + 種別名」の合成なので同じ語を使うと伸びる
    // (es/fr/pt_br で +13〜14 字)。**chip = skilltype / attune = skilltype_short** に
    // 役割分担させ、attune 側は「技」なしの短い語を引く。
    // kongfu_short は vi にしか値が無いので実挙動は従来どおり (miss → kongfu へ fallback)。
    let weap = _lookup('kongfu_short', def.id, lang);
    if (!weap) weap = _lookup('kongfu', def.id, lang);
    let tip = _lookup('skilltype_short', skillKey, lang);
    if (!tip) tip = _lookup('skilltype', skillKey, lang);
    if (!weap || !tip) return null;
    if (lang === 'en') {
      const wType = _kongfuWeaponType(def.id);
      const wEn = wType && _lookup('weapontype', wType, 'en');
      if (wEn && weap.length > wEn.length + 1 && weap.slice(-(wEn.length + 1)) === ' ' + wEn) {
        weap = weap.slice(0, -(wEn.length + 1));
      }
    }
    return weap + ' ' + tip;
  }

  // path の語尾「力」付き表示 (旧 build-labels.js _statDisplay。 anlz.js path subItem 表記用)。
  // 例: name('path-statdisplay', 'void', 'ja') → '無相攻撃力'。
  // 2026-07-25: min/max無し版はゲーム内に単独sidが存在せず(locale完全一致0件)、実機確認の結果
  // 「鋼鳴攻撃力」のようにpathBase+atkStat連結の表記が正しいと確定(兄貴実機SS)。
  // 一時的にaffix_stat.<path>Atk(PRO_ATK_A等由来)を直接参照する実装を試みたが、これは別文脈の
  // テキストを誤収集したもので誤りだった(即revert、affix_stat側の該当4キーも次回削除検討)。
  function _pathStatDisplay(id, lang) {
    const p = data.path;
    if (!p || !p.pathBase || !p.affix) return null;
    const base = p.pathBase[String(id)];
    if (!base) return null;
    const b = base[lang] || base.en || base.ja;
    if (!b) return null;
    const suf = p.affix.atkStat?.[lang] ?? p.affix.atkStat?.en ?? p.affix.atkStat?.ja ?? '';
    return b + suf;
  }

  function name(cat, id, lang) {
    const L = lang || currentLang;
    if (cat === 'martial-affix') {
      const synth = _martialAffix(String(id), L);
      if (synth) return synth;
      return '[' + cat + ':' + id + ']';
    }
    if (cat === 'path-statdisplay') {
      const synth = _pathStatDisplay(id, L);
      if (synth) return synth;
      return '[' + cat + ':' + id + ']';
    }
    const v = _lookup(cat, id, L);
    if (v) return v;
    // affix_stat fallback (= stat cat はパネル表示 59項目限定、 affix専用15項目は affix_stat 隔離。2026-07-03)
    if (cat === 'stat') {
      const v1 = _lookup('affix_stat', id, L);
      if (v1) return v1;
    }
    // noClientData fallback (= mining 不可 ゲーム内用語 隔離、 cat 不問)
    const v2 = _lookup('noClientData', id, L);
    if (v2) return v2;
    return '[' + cat + ':' + id + ']';
  }

  function t(key) {
    for (const cat of T_CHAIN) {
      const d = data[cat];
      if (d && d[key]) return d[key][currentLang] || d[key].en || d[key].ja || key;
    }
    return key;
  }

  const api = { ready: ready, ensureCalcData: ensureCalcData, setLang: setLang, getLang: getLang, name: name, t: t, has: _has };
  if (typeof window !== 'undefined') {
    window.WWM_DS = api;
    window.DataStore = api; // 兄貴可読性用 alias
  }
})();

// vite移行 P2: ESM 副作用 module 化 (window expose は IIFE 内 keep)
export {};
