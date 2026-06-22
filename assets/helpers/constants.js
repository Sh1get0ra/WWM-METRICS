// WWMetrics constants
// Phase 1.2.6: 各所散在の magic number / 配列 / マップ を集約。

(function () {
  'use strict';

  const C = {
    /** 武庫 (Arsenal) Tier Lv (7段階) */
    ARSENAL_TIERS: [41, 51, 56, 61, 71, 81, 86],

    /** 装備 slot key 分類 */
    GEAR_SLOTS: {
      weapon: ['1', '2', '10', '11'],   // 主武器 / 副武器 / 環 / 佩
      armor:  ['3', '4', '5', '8'],     // 冠胄 / 胸冑 / 膝冑 / 腕冑
      bow:    ['21', '9'],              // 弓箭 / 射玦
      all:    ['1', '2', '3', '4', '5', '8', '9', '10', '11', '21']
    },

    /** 装備 slot 多言語名 */
    SLOT_NAMES: {
      '1':  { ja: '主武器', en: 'Main Weapon',  zh: '主武器', ko: '주무기' },
      '2':  { ja: '副武器', en: 'Sub Weapon',   zh: '副武器', ko: '부무기' },
      '3':  { ja: '冠胄',   en: 'Helmet',       zh: '冠甲',   ko: '관갑' },
      '4':  { ja: '胸冑',   en: 'Chest',        zh: '胸甲',   ko: '흉갑' },
      '5':  { ja: '膝冑',   en: 'Greaves',      zh: '膝甲',   ko: '슬갑' },
      '8':  { ja: '腕冑',   en: 'Bracers',      zh: '腕甲',   ko: '완갑' },
      '9':  { ja: '射玦',   en: 'Thumb Ring',   zh: '射玦',   ko: '깍지' },
      '10': { ja: '環',     en: 'Ring',         zh: '环',     ko: '환' },
      '11': { ja: '佩',     en: 'Pendant',      zh: '佩',     ko: '패' },
      '21': { ja: '弓箭',   en: 'Arrow',        zh: '弓箭',   ko: '활' }
    },

    /** Tier 閾値 (statusScore ÷ optBest.end) */
    TIER_THRESHOLDS: {
      SS: 0.95,
      S:  0.90,
      A:  0.80,
      B:  0.65
    },

    /** Tier 色 (dark theme) */
    TIER_COLORS_DARK: {
      SS: '#ffd970',
      S:  '#ff6b50',
      A:  '#a8d4b4',
      B:  '#c9b88a',
      C:  'rgba(232,215,180,0.55)'
    },

    /** Tier 色 (light theme) */
    TIER_COLORS_LIGHT: {
      SS: '#b8860b',
      S:  '#c83c2b',
      A:  '#2d5a3a',
      B:  '#7a5a20',
      C:  '#5a4226'
    },

    /** 武庫 / 武術 path → stat key (min/max) マッピング */
    PATH_KEY_MAP: {
      phys:       { min: 'minPhys',       max: 'maxPhys' },
      bamboocut:  { min: 'minBamboocut',  max: 'maxBamboocut' },
      stonesplit: { min: 'minStonesplit', max: 'maxStonesplit' },
      steelthorn: { min: 'minSteelthorn', max: 'maxSteelthorn' },
      bellstrike: { min: 'minBellstrike', max: 'maxBellstrike' },
      universal:  { min: 'minUniversal',  max: 'maxUniversal' }
    },

    /** localStorage key (typo防止用 定数化) */
    LS_KEYS: {
      LAST_IMPORT:    'wwm_last_import_v1',
      LAST_STATE:     'wwm_last_state_v1',
      BASELINE_SCORE: 'wwm_baseline_score_v1',
      OPT_BEST:       'wwm_opt_best_v1',
      OPT_TARGET:     'wwm_opt_target_ratio_v1',
      OPT_SORT:       'wwm_opt_sort_v1',
      VIRTUAL:        'wwm_virtual_v1',
      COLLAPSED:      'wwm_collapsed_v1',
      HIST:           'wwm_hist_v1',
      THEME:          'wwm_theme',
      LANG:           'wwm_lang',
      HERO_COLLAPSED: 'wwm_hero_collapsed',
      IMPORT_HINTED:  'wwm_import_hinted',
      PRESETS:        'wwm_presets_v1',
      LAST_SEEN_VER:  'wwm_last_seen_version_v1',
      OVERLAY_SETTINGS: 'wwm_overlay_settings_v1'
    }
  };

  window.WWMHelpers = window.WWMHelpers || {};
  window.WWMHelpers.constants = C;
})();
