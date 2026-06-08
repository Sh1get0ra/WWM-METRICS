// 名称ラベル 合成エンジン (純粋関数 + window 接続)
// DOM 非依存。データは引数で受け取る → node から直接テスト可能。
// ブラウザは <script src="assets/build-labels.js"> (非module) で読み window.WWMBuildLabels を生やす。
(function (root) {
  const LANGS = ['ja', 'en', 'zh', 'ko'];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // sources = { lexicon } (後続段階で kongfu/sets を追加)
  function buildLabels(sources) {
    const lex = sources.lexicon;
    const out = {};
    for (const L of LANGS) {
      const dict = {};        // import dict 形式 (minBellstrike 等)
      const i18n = {};        // T() 形式 (pathBellstrike / pathAtk* / pathPen* / pathDmg*)
      const statDisp = {};    // stat_display 形式 (語尾「力」)
      for (const [p, base] of Object.entries(lex.pathBase)) {
        const C = cap(p);
        const b = base[L];
        // import dict 形式
        dict['min' + C]  = lex.affix.min[L] + b + lex.affix.atk[L];
        dict['max' + C]  = lex.affix.max[L] + b + lex.affix.atk[L];
        dict[p + 'Pen']  = b + lex.affix.pen[L];
        // i18n T() 形式
        i18n['path' + C]    = b;
        i18n['pathAtk' + C] = b + lex.affix.atk[L];
        i18n['pathPen' + C] = b + lex.affix.pen[L];
        i18n['pathDmg' + C] = b + lex.affix.dmgUp[L];
        // stat_display 形式 (語尾「力」= atkStat)
        statDisp[p] = b + lex.affix.atkStat[L];
      }
      dict._i18n = i18n;
      dict._statDisplay = statDisp;
      out[L] = dict;
    }
    return out;
  }

  // i18n テーブル (TRANSLATIONS, window.WWM_I18N) へ path系合成ラベルを注入。
  // path* (pathAtk/Pen/Dmg/path<Path>) は lexicon 唯一源 → i18n.js から静的定義削除済。
  // データ非同期ロード (_loadDicts/_ensureDicts) 完了後に呼ぶ。冪等。
  function applyPathLabels() {
    if (typeof window === 'undefined') return;
    if (!window.WWM_LEXICON || !window.WWM_I18N) return;
    const built = buildLabels({ lexicon: window.WWM_LEXICON });
    for (const L of LANGS) {
      if (!window.WWM_I18N[L]) continue;
      Object.assign(window.WWM_I18N[L], built[L]._i18n);
    }
  }

  root.buildLabels = buildLabels;
  if (typeof window !== 'undefined') {
    window.WWMBuildLabels = buildLabels;
    window.WWMApplyPathLabels = applyPathLabels;
  }
})(typeof window !== 'undefined' ? window : globalThis);
