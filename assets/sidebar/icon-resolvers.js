// WWMetrics Sidebar - icon resolvers
// Phase 3.1c: sidebar.js から 装備 slot / 流派 (liupai) アイコン URL 解決 切出。
//   - _GEAR_SLOT_LABELS_JA / _GEAR_SLOT_I18N_KEY / _GEAR_SLOT_LABELS (Proxy) / _slotLabelI18n
//   - _GEAR_RAIL_ZH (rail 縦書き用 中国語ラベル)
//   - _GEAR_SLOT_ICON / _WEAPON_TYPE_ICON / _gearIcon / _gearIconResolve
//   - _kongfuLiupaiResolve / _liupaiPinyinFromUrl / _liupaiUrlById
//   - _ARSENAL_PATH_TO_PINYIN / _arsenalLiupaiResolve / _setLiupaiResolve
//
// 依存: window.T / window.WWM_KONGFU / window.WWM_KONGFU_ICONS / window.WWM_GEAR_SLOT_ICONS /
//       window.currentLang
// 公開: window.WWMSidebar.icons (関数辞書 + 公開 const)

(function () {
  'use strict';

  // ── slot ラベル (装備カード用 ja固定 + 装備最適化 / Affix Ranking 用 i18n) ─
  const _GEAR_SLOT_LABELS_JA = {
    '1': '主武器', '2': '副武器', '3': '冠甲', '4': '胸甲', '21': '弓箭',
    '10': '環', '11': '佩', '5': '膝甲', '8': '腕甲', '9': '射玦'
  };
  const _GEAR_SLOT_I18N_KEY = {
    '1': 'slotMain', '2': 'slotSub', '3': 'slotHelm', '4': 'slotChest', '21': 'slotBow',
    '10': 'slotRing', '11': 'slotPendant', '5': 'slotLegs', '8': 'slotHands', '9': 'slotDisc'
  };
  // 装備カード用 = 全言語 ja固定 (ユーザー指定)
  const _GEAR_SLOT_LABELS = new Proxy({}, {
    get: (_, slot) => _GEAR_SLOT_LABELS_JA[slot]
  });
  // 装備最適化 / Affix Ranking 等 装備カード以外で使う i18n slot ラベル
  function _slotLabelI18n(slot) {
    const key = _GEAR_SLOT_I18N_KEY[slot];
    return (key && window.T && window.T[key]) || _GEAR_SLOT_LABELS_JA[slot] || slot;
  }
  // rail 縦書き専用 中国語表記 (武侠雰囲気)
  const _GEAR_RAIL_ZH = {
    '1': '主武器', '2': '副武器',
    '3': '冠胄', '4': '胸甲', '5': '膝甲', '8': '腕甲',
    '10': '環', '11': '佩',
    '21': '弓箭', '9': '射玦'
  };

  // ── slot / weaponType → アイコンファイル名 (assets/icons/<name>.svg) ─
  const _GEAR_SLOT_ICON = {
    '3': 'helmet', '4': 'chest', '5': 'legs', '8': 'hands',
    '10': 'ring', '11': 'pendant',
    '21': 'bow', '9': 'archer-disc'
  };
  const _WEAPON_TYPE_ICON = {
    sword: 'sword', spear: 'spear', fan: 'fan', umbrella: 'umbrella',
    moBlade: 'glaive', dualBlades: 'dual-blades', ropeDart: 'rope-dart',
    hengBlade: 'katana', gauntlet: 'mailed-fist',
    // raw kongfu.json weaponType (snake)
    mo_blade: 'glaive', dual_blades: 'dual-blades', rope_dart: 'rope-dart',
    heng_blade: 'katana'
  };
  function _gearIcon(slot, roleInfo) {
    if (slot === '1' || slot === '2') {
      const kid = slot === '1' ? roleInfo?.kongfuMain : roleInfo?.kongfuSub;
      const kf = window.WWM_KONGFU?.[kid];
      const wt = kf?.weaponType;
      if (wt) {
        // normalize: dual_blades or dualBlades
        return _WEAPON_TYPE_ICON[wt] || _WEAPON_TYPE_ICON[wt.replace(/_([a-z])/g, (_,c)=>c.toUpperCase())] || 'sword';
      }
      return 'sword';
    }
    return _GEAR_SLOT_ICON[slot] || null;
  }
  // 3段階 fallback で gear icon URL 解決 (1武器: kongfu→slot_icon→SVG / 防具系: slot_icon→SVG)
  function _gearIconResolve(slot, roleInfo) {
    // 武器: kongfu icon dict 最優先
    if (slot === '1' || slot === '2') {
      const kid = slot === '1' ? roleInfo?.kongfuMain : roleInfo?.kongfuSub;
      const kfIcon = window.WWM_KONGFU_ICONS?.[kid]?.pic_url;
      if (kfIcon) return kfIcon;
    }
    // 公式 slot_icon (シルエット風統一)
    const slotIcon = window.WWM_GEAR_SLOT_ICONS?.[slot]?.icon_url;
    if (slotIcon) return slotIcon;
    // 既存 SVG fallback (失効/未load時)
    const svgName = _gearIcon(slot, roleInfo);
    return svgName ? `assets/icons/${svgName}.svg` : null;
  }

  // ── 流派 (liupai) アイコン URL 解決 ────────────────────────────
  // 武器 slot (1/2) の 流派 アイコン URL。 該当無し時 null
  function _kongfuLiupaiResolve(slot, roleInfo) {
    if (slot !== '1' && slot !== '2') return null;
    const kid = slot === '1' ? roleInfo?.kongfuMain : roleInfo?.kongfuSub;
    return window.WWM_KONGFU_ICONS?.[kid]?.liupai_pic_url || null;
  }
  // URL から 流派 pinyin 抽出 (例: ".../liupai_pic/tianquan_small_1_oversea.png" → "tianquan")
  function _liupaiPinyinFromUrl(url) {
    if (!url) return '';
    const m = String(url).match(/\/liupai_pic\/([a-z]+)_/);
    return m ? m[1] : '';
  }
  // 流派 ID (pinyin形式) → 公式 liupai_pic URL (small_oversea 固定、 tongyong は variant 無し)
  const _LIUPAI_BASE = 'https://www.wherewindsmeetgame.com/pc/qt/20251203102905/resource/liupai_pic/';
  function _liupaiUrlById(liupaiId) {
    if (!liupaiId) return null;
    if (liupaiId === 'tongyong') return _LIUPAI_BASE + 'tongyong_small_oversea.png';
    // 形式: {pinyin}_{n} → {pinyin}_small_{n}_oversea.png
    const m = String(liupaiId).match(/^([a-z]+)_(\d+)$/);
    if (!m) return null;
    return _LIUPAI_BASE + m[1] + '_small_' + m[2] + '_oversea.png';
  }
  // 武庫 path → 流派 pinyin
  const _ARSENAL_PATH_TO_PINYIN = {
    bellstrike: 'tianquan',
    stonesplit: 'kuanglan',
    silkbind:   'qingxi',
    bamboocut:  'guyun',
    phys:       'tongyong',
    voidPath:   'tongyong'
  };
  // 武庫の流派バッジ URL 解決:
  //   主武器 path と 武庫 path が一致 → 主武器 kongfu の liupai_pic_url (variant反映)
  //   不一致 → {pinyin}_small_1_oversea.png (基本 variant 1)、 phys/voidPath は tongyong (variant無)
  function _arsenalLiupaiResolve(roleInfo, arsenalPath) {
    const pinyin = _ARSENAL_PATH_TO_PINYIN[arsenalPath];
    if (!pinyin) return null;
    // 主武器 path 一致なら kongfu.liupai_pic_url
    const kid = roleInfo?.kongfuMain;
    const kMainPath = window.WWM_KONGFU?.[kid]?.path;
    if (kMainPath === arsenalPath) {
      const url = window.WWM_KONGFU_ICONS?.[kid]?.liupai_pic_url;
      if (url) return url;
    }
    // 不一致 → 基本 variant 1
    if (pinyin === 'tongyong') return _LIUPAI_BASE + 'tongyong_small_oversea.png';
    return _LIUPAI_BASE + pinyin + '_small_1_oversea.png';
  }
  // セット (装備) 経由の 流派バッジ URL 解決 (非武器 slot 向け、 sets.json の liupaiId を URL 化)
  // slot 分類は renderGearGrid と一致: isBow={9,21} / isArmor={3,4,5,8} / それ以外 (環/佩=10,11等) は weaponSets
  function _setLiupaiResolve(slot, eq, sets) {
    if (slot === '1' || slot === '2') return null; // 武器は kongfu経由
    const suffix = eq?.exVo?.suffix;
    if (suffix == null) return null;
    const isBow = slot === '9' || slot === '21';
    const isArmor = ['3','4','5','8'].includes(String(slot));
    const cat = isBow ? sets?.bowSets : (isArmor ? sets?.defensiveSets : sets?.weaponSets);
    const liupaiId = cat?.[suffix]?.liupaiId;
    return _liupaiUrlById(liupaiId);
  }

  // ── global expose ────────────────────────────────────────────────
  window.WWMSidebar = window.WWMSidebar || {};
  window.WWMSidebar.icons = {
    slotLabelI18n: _slotLabelI18n,
    gearIconResolve: _gearIconResolve,
    kongfuLiupaiResolve: _kongfuLiupaiResolve,
    liupaiPinyinFromUrl: _liupaiPinyinFromUrl,
    liupaiUrlById: _liupaiUrlById,
    arsenalLiupaiResolve: _arsenalLiupaiResolve,
    setLiupaiResolve: _setLiupaiResolve,
    // 公開 const (sidebar.js 内 直接 lookup 用)
    GEAR_SLOT_LABELS: _GEAR_SLOT_LABELS,
    GEAR_RAIL_ZH: _GEAR_RAIL_ZH,
  };
})();
