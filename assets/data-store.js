// ── DataStore (取得層 単一入口) ────────────────────────────────────
// 全言語データを起動時 eager load。 表示層は name(cat, id) で同期取得。
// 詳細設計: docs/superpowers/specs/2026-06-09-data-architecture-redesign-materials.md
// 実装 plan : docs/superpowers/plans/2026-06-09-i18n-unification.md
(function () {
  'use strict';
  const CATS = ['kongfu', 'xinfa', 'sets', 'stat', 'path', 'skilltype', 'weapontype', 'ui'];
  const VERSION = (typeof window !== 'undefined' && window.WWM_DISPLAY_VERSION) || 11;
  let currentLang = 'ja';
  const data = Object.create(null); // { kongfu: {...}, xinfa: {...}, ... }
  let readyPromise = null;

  // path 系 i18n key を data.path から動的合成して data.ui に注入 (旧 build-labels.js applyPathLabels の (1) 役割)。
  // 旧 form: path<Path> / pathAtk<Path> / pathPen<Path> / pathDmg<Path> (cap)。
  function _injectPathI18nKeys() {
    const path = data.path;
    if (!path || !path.pathBase || !path.affix) return;
    const ui = data.ui = data.ui || {};
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const LANGS = ['ja', 'en', 'zh', 'ko'];
    for (const [p, base] of Object.entries(path.pathBase)) {
      const C = cap(p);
      const keys = {
        ['path' + C]:    {},
        ['pathAtk' + C]: {},
        ['pathPen' + C]: {},
        ['pathDmg' + C]: {}
      };
      for (const L of LANGS) {
        const b = base[L]; if (!b) continue;
        keys['path' + C][L]    = b;
        keys['pathAtk' + C][L] = b + (path.affix.atk?.[L] || '');
        keys['pathPen' + C][L] = b + (path.affix.pen?.[L] || '');
        keys['pathDmg' + C][L] = b + (path.affix.dmgUp?.[L] || '');
      }
      for (const [k, v] of Object.entries(keys)) {
        if (!ui[k]) ui[k] = v; // 既存キー (旧 ui.json 重複) を上書きしない
      }
    }
  }

  function ready() {
    if (readyPromise) return readyPromise;
    readyPromise = Promise.all(CATS.map(async (cat) => {
      const res = await fetch('data/i18n/' + cat + '.json?v=' + VERSION);
      if (!res.ok) throw new Error('DataStore: failed to fetch ' + cat + '.json (' + res.status + ')');
      data[cat] = await res.json();
    })).then(() => { _injectPathI18nKeys(); });
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
    if (typeof window !== 'undefined' && window.WWM_KONGFU && window.WWM_KONGFU[String(id)]) {
      return window.WWM_KONGFU[String(id)].weaponType || null;
    }
    return null;
  }

  function _lookup(cat, id, lang) {
    const d = data[cat];
    if (!d) return null;
    const entry = d[String(id)];
    if (!entry) return null;
    return entry[lang] || entry.ja || null;
  }

  function _martialAffix(key, lang) {
    const def = MARTIAL_PREFIXES.find(function (d) { return key.indexOf(d.prefix) === 0; });
    if (!def) return null;
    const suffix = key.slice(def.prefix.length);
    const skillKey = SUFFIX_TO_SKILL[suffix];
    if (!skillKey) return null;
    let weap = _lookup('kongfu', def.id, lang);
    const tip = _lookup('skilltype', skillKey, lang);
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
    const b = base[lang] || base.ja;
    if (!b) return null;
    const suf = p.affix.atkStat?.[lang] ?? p.affix.atkStat?.ja ?? '';
    return b + suf;
  }

  function name(cat, id, lang) {
    const L = lang || currentLang;
    if (cat === 'martial-affix') {
      const synth = _martialAffix(String(id), L);
      if (synth) return synth;
      // 旧 stat_labels.json 同居キーへの fallback (Phase E 完了まで)
      const direct = _lookup('stat', id, L);
      if (direct) return direct;
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
    const d = data.ui;
    if (!d || !d[key]) return key;
    return d[key][currentLang] || d[key].ja || key;
  }

  const api = { ready: ready, setLang: setLang, getLang: getLang, name: name, t: t, has: _has };
  if (typeof window !== 'undefined') {
    window.WWM_DS = api;
    window.DataStore = api; // 兄貴可読性用 alias
  }
})();
