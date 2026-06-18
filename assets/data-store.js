// ── DataStore (取得層 単一入口) ────────────────────────────────────
// 全言語データを起動時 eager load。 表示層は name(cat, id) で同期取得。
// 詳細設計: docs/superpowers/specs/2026-06-09-data-architecture-redesign-materials.md
// 実装 plan : docs/superpowers/plans/2026-06-09-i18n-unification.md
(function () {
  'use strict';
  const CATS = ['kongfu', 'xinfa', 'sets', 'stat', 'path', 'skilltype', 'weapontype', 'ui', 'game_lexicon', 'stat_display', 'qishu', 'stat_short', 'skilltype_short', 'kongfu_short'];
  // t() lookup chain: ui (ツール独自) → game_lexicon (ゲーム固有 UI 名) → stat (ステ/affix 真実源) → stat_display (Sidebar 表示 label、 stDisp.* prefix)。
  const T_CHAIN = ['ui', 'game_lexicon', 'stat', 'stat_display'];
  const VERSION = (typeof window !== 'undefined' && window.WWM_DISPLAY_VERSION) || 11;
  // 計算/icon dict (data/*.json) の供給一元化 (P4-mini 2026-06-10)。
  // dictMap の唯一源 = ここ。 window.WWM_* は DataStore が供給する互換 read view (callsite は直読み続行で正式承認)。
  // cache buster は SCORE_VERSION (計算 data) — i18n の DISPLAY_VERSION と独立。
  const CALC_DICTS = {
    WWM_LV95_BASE:        'lv95_base',
    WWM_KONGFU:           'kongfu',
    WWM_XINFA:            'xinfa',
    WWM_SETS:             'sets',
    WWM_AFFIX:            'affix',
    WWM_EQUIP_BASE_BY_LV: 'equip_base_by_lv',
    WWM_XINFA_ICONS:      'xinfa_icons',
    WWM_KONGFU_ICONS:     'kongfu_icons',
    WWM_QISHU_ICONS:      'qishu_icons',
    WWM_QISHU_CATEGORIES: 'qishu_categories',
    WWM_AVATAR_ICONS:     'avatar_icons',
    WWM_GEAR_SLOT_ICONS:  'gear_slot_icons'
  };
  let currentLang = 'ja';
  const data = Object.create(null); // { kongfu: {...}, xinfa: {...}, ... } (i18n)
  const calc = Object.create(null); // { kongfu: {...}, affix: {...}, ... } (計算/icon dict 内部参照)
  let readyPromise = null;
  let calcPromise = null;

  // 計算/icon dict load (idempotent)。 失敗 = {} で続行 (旧 loadDict 互換、 throw しない)。
  function ensureCalcData() {
    if (calcPromise) return calcPromise;
    const sv = (typeof window !== 'undefined' && window.WWM_SCORE_VERSION) || 7;
    calcPromise = Promise.all(Object.entries(CALC_DICTS).map(async function ([winKey, fileName]) {
      if (typeof window !== 'undefined' && window[winKey]) {
        calc[fileName] = window[winKey]; // 先行ロード分 (テスト注入等) を尊重
        return;
      }
      let d = {};
      try {
        const res = await fetch('data/' + fileName + '.json?v=' + sv);
        if (res.ok) d = await res.json();
        else console.warn('[DataStore] calc dict fetch failed:', fileName, res.status);
      } catch (e) {
        console.warn('[DataStore] calc dict fetch failed:', fileName, e);
      }
      calc[fileName] = d;
      if (typeof window !== 'undefined') window[winKey] = d;
    })).then(function () {});
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
    const LANGS = ['ja', 'en', 'zh', 'ko', 'vi'];
    // vi = 語順反転 (affix 前置 + base 後置)。 例: ja「鋼鳴攻撃」/ vi「Tấn công Minh Kim」
    // path.affix.{atk,pen,dmgUp}.vi は trailing space 付きで採取 (pen.vi="Xuyên thấu " 等)、
    // base.vi は trailing space 無し (pathBase.vi="Minh Kim") → affix + base 連結で自然 spacing。
    const VI_REORDER = true;
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
      for (const L of LANGS) {
        const b = base[L]; if (!b) continue;
        const atk = path.affix.atk?.[L] || '';
        const pen = path.affix.pen?.[L] || '';
        const dmg = path.affix.dmgUp?.[L] || '';
        const mn  = path.affix.min?.[L] || '';
        const mx  = path.affix.max?.[L] || '';
        keys['path' + C][L] = b;
        if (VI_REORDER && L === 'vi') {
          keys['pathAtk' + C][L] = atk + b;
          keys['pathPen' + C][L] = pen + b;
          keys['pathDmg' + C][L] = dmg + b;
          keys['min' + C][L]     = mn + atk + b;
          keys['max' + C][L]     = mx + atk + b;
        } else {
          keys['pathAtk' + C][L] = b + atk;
          keys['pathPen' + C][L] = b + pen;
          keys['pathDmg' + C][L] = b + dmg;
          keys['min' + C][L]     = mn + b + atk;
          keys['max' + C][L]     = mx + b + atk;
        }
      }
      for (const [k, v] of Object.entries(keys)) {
        if (!ui[k]) ui[k] = v; // 既存キー (旧 ui.json 重複) を上書きしない
      }
    }
    // nonPathBase: path 系合成 (path/pathAtk/pathPen/pathDmg) は不要だが min<Name>/max<Name>
    // 形式のラベルだけ生成したい汎用 base (例: elemSub = 副属性、 path に属さない副属性 ATK)。
    const nonPath = path.nonPathBase || {};
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
        const base = stat[s]; if (!base) continue;
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
    const i18nLoad = Promise.all(CATS.map(async (cat) => {
      const res = await fetch('data/i18n/' + cat + '.json?v=' + VERSION);
      if (!res.ok) throw new Error('DataStore: failed to fetch ' + cat + '.json (' + res.status + ')');
      data[cat] = await res.json();
    })).then(() => { _injectPathI18nKeys(); });
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
    { prefix: 'infernalTwinblades', id: 20501 },
    { prefix: 'unfetteredRopeDart', id: 20702 },
    { prefix: 'mortalRopeDart',     id: 20701 },
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
    'Light': 'light', 'Rodent': 'rodent', 'Shield': 'shield', 'Healing': 'healing',
    'VariedCombo': 'variedCombo', '': 'bleed'
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
    // vi 時 = kongfu/skilltype 両方 短縮版優先 (武具対照 modal + import preview + 防具 affix6
    // dropdown の武術固有 affix 文字切れ救済)。 真実源 (kongfu.json/skilltype.json 公式 lexicon)
    // 不変 keep、 表示時 fallback only。 short miss 時は通常 lookup chain。
    let weap = null;
    if (lang === 'vi') weap = _lookup('kongfu_short', def.id, 'vi');
    if (!weap) weap = _lookup('kongfu', def.id, lang);
    let tip = null;
    if (lang === 'vi') tip = _lookup('skilltype_short', skillKey, 'vi');
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
